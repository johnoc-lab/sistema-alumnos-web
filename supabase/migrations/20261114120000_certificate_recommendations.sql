BEGIN;

CREATE TABLE private.certificate_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  course_id uuid NOT NULL,
  membership_id uuid NOT NULL,
  enrollment_id uuid NOT NULL,
  recommended_by uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  decided_by uuid,
  certificate_id uuid UNIQUE,
  UNIQUE (organization_id,enrollment_id),
  FOREIGN KEY (organization_id,course_id,membership_id,enrollment_id)
    REFERENCES public.enrollments(organization_id,course_id,membership_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id,recommended_by) REFERENCES public.organization_memberships(organization_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id,decided_by) REFERENCES public.organization_memberships(organization_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id,certificate_id) REFERENCES public.certificate_issues(organization_id,id) DEFERRABLE INITIALLY DEFERRED,
  CHECK ((status='pending' AND decided_at IS NULL AND decided_by IS NULL AND certificate_id IS NULL)
    OR (status IN ('approved','rejected') AND decided_at IS NOT NULL AND decided_by IS NOT NULL
      AND decided_by<>recommended_by AND (certificate_id IS NOT NULL)=(status='approved')))
);
ALTER TABLE private.certificate_recommendations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.certificate_recommendations FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER audit_row AFTER INSERT OR UPDATE OR DELETE ON private.certificate_recommendations
  FOR EACH ROW EXECUTE FUNCTION private.audit_row();

-- La única excepción al bloqueo histórico de emisión exige una decisión registrada y vinculada.
CREATE OR REPLACE FUNCTION private.validate_relations() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE asset public.file_assets; evt public.calendar_events; k text; previous jsonb; current_row jsonb;
BEGIN
 current_row:=to_jsonb(NEW);
 IF TG_OP='UPDATE' THEN
  previous:=to_jsonb(OLD);
  FOREACH k IN ARRAY CASE TG_TABLE_NAME
   WHEN 'enrollments' THEN ARRAY['course_id','membership_id']
   WHEN 'calendar_event_attendees' THEN ARRAY['event_id','membership_id']
   WHEN 'file_assets' THEN ARRAY['course_id','purpose','bucket_name','object_path']
   WHEN 'certificate_issues' THEN ARRAY['course_id','membership_id','enrollment_id','serial']
   WHEN 'course_modules' THEN ARRAY['course_id']
   WHEN 'lessons' THEN ARRAY['course_id']
   WHEN 'materials' THEN ARRAY['course_id']
   WHEN 'calendar_events' THEN ARRAY['course_id']
   ELSE ARRAY[]::text[] END LOOP
   IF current_row->k IS DISTINCT FROM previous->k THEN RAISE EXCEPTION 'Relación inmutable: %',k USING ERRCODE='42501'; END IF;
  END LOOP;
 END IF;
 IF current_row ? 'timezone' AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name=current_row->>'timezone') THEN
  RAISE EXCEPTION 'Zona horaria IANA no válida' USING ERRCODE='23514';
 END IF;
 IF TG_TABLE_NAME='enrollments' AND TG_OP='INSERT' AND auth.uid() IS NOT NULL AND current_row->>'enrolled_at' IS NULL THEN
  RAISE EXCEPTION 'Una matrícula nueva necesita fecha' USING ERRCODE='23514';
 END IF;
 IF TG_TABLE_NAME='materials' AND current_row->>'file_asset_id' IS NOT NULL THEN
  SELECT * INTO asset FROM public.file_assets WHERE organization_id=NEW.organization_id AND id=NEW.file_asset_id;
  IF FOUND AND asset.purpose<>'course_material' THEN RAISE EXCEPTION 'El asset no es material de curso' USING ERRCODE='23514'; END IF;
 END IF;
 IF TG_TABLE_NAME='courses' AND current_row->>'cover_asset_id' IS NOT NULL THEN
  SELECT * INTO asset FROM public.file_assets WHERE organization_id=NEW.organization_id AND id=NEW.cover_asset_id;
  IF FOUND AND (asset.purpose<>'branding' OR (asset.course_id IS NOT NULL AND asset.course_id<>NEW.id)) THEN
   RAISE EXCEPTION 'Portada incompatible con el curso' USING ERRCODE='23514';
  END IF;
 END IF;
 IF TG_TABLE_NAME='certificate_issues' THEN
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(NEW.snapshot) s(key)
   WHERE key NOT IN ('template_version','institution','participant','course','hours','date','signers')) THEN
   RAISE EXCEPTION 'Campos no admitidos en snapshot' USING ERRCODE='23514';
  END IF;
  IF NEW.status='issued' AND (
   jsonb_typeof(NEW.snapshot->'template_version') IS DISTINCT FROM 'string'
   OR jsonb_typeof(NEW.snapshot->'participant') IS DISTINCT FROM 'string'
   OR jsonb_typeof(NEW.snapshot->'course') IS DISTINCT FROM 'string'
   OR btrim(NEW.snapshot->>'template_version')='' OR btrim(NEW.snapshot->>'participant')='' OR btrim(NEW.snapshot->>'course')='') THEN
   RAISE EXCEPTION 'Snapshot emitido inválido' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' AND (
   (OLD.status='issued' AND NEW.status NOT IN ('issued','revoked','archived'))
   OR (OLD.status='revoked' AND NEW.status NOT IN ('revoked','archived'))
   OR (OLD.status='archived' AND NEW.status<>'archived')) THEN
   RAISE EXCEPTION 'Una emisión histórica no puede volver a borrador' USING ERRCODE='42501';
  END IF;
  IF auth.uid() IS NOT NULL AND (
   (TG_OP='INSERT' AND NEW.status<>'draft' AND NOT (
    NEW.status='issued' AND private.can_use_module(NEW.organization_id,'certificates.approve')
    AND EXISTS(SELECT 1 FROM private.certificate_recommendations r
      WHERE r.certificate_id=NEW.id AND r.organization_id=NEW.organization_id
        AND r.enrollment_id=NEW.enrollment_id AND r.course_id=NEW.course_id AND r.membership_id=NEW.membership_id
        AND r.status='approved' AND r.decided_by=private.member_id(NEW.organization_id))
   )) OR (TG_OP='UPDATE' AND NEW.status='issued' AND OLD.status<>'issued')) THEN
   RAISE EXCEPTION 'Emisión pendiente de criterio de elegibilidad aprobado' USING ERRCODE='42501';
  END IF;
  IF TG_OP='UPDATE' AND OLD.status IN ('issued','revoked','archived') AND
   (NEW.snapshot IS DISTINCT FROM OLD.snapshot OR NEW.issued_at IS DISTINCT FROM OLD.issued_at OR NEW.file_asset_id IS DISTINCT FROM OLD.file_asset_id) THEN
   RAISE EXCEPTION 'La evidencia emitida es inmutable' USING ERRCODE='42501';
  END IF;
  IF NEW.file_asset_id IS NOT NULL THEN
   SELECT * INTO asset FROM public.file_assets WHERE organization_id=NEW.organization_id AND id=NEW.file_asset_id;
   IF FOUND AND asset.purpose<>'certificate' THEN RAISE EXCEPTION 'Asset ajeno al propósito certificado' USING ERRCODE='23514'; END IF;
  END IF;
 END IF;
 RETURN NEW;
END;
$$;

CREATE FUNCTION public.certificate_staff_context(p_org uuid,p_course text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE
  may_approve boolean := private.can_use_module(p_org,'certificates.approve');
  may_recommend boolean := private.can_use_module(p_org,'certificates.recommend') AND EXISTS (
    SELECT FROM public.organization_memberships WHERE id=private.member_id(p_org) AND staff_rank='teacher'
  );
BEGIN
  IF NOT coalesce(may_approve,false) AND NOT coalesce(may_recommend,false) THEN
    RAISE EXCEPTION 'Acceso a certificación no autorizado' USING ERRCODE='42501';
  END IF;
  RETURN jsonb_build_object(
    'courses', CASE WHEN may_recommend THEN coalesce((
      SELECT jsonb_agg(jsonb_build_object('id',c.id,'title',c.title) ORDER BY c.title,c.id)
      FROM public.courses c WHERE c.organization_id=p_org
    ),'[]'::jsonb) ELSE '[]'::jsonb END,
    'students', CASE WHEN may_recommend THEN coalesce((
      SELECT jsonb_agg(jsonb_build_object('id',e.id,'name',concat_ws(' ',m.first_name,nullif(m.last_name,'')))
        ORDER BY m.first_name,m.last_name,e.id)
      FROM public.enrollments e JOIN public.organization_memberships m ON m.id=e.membership_id
      WHERE e.organization_id=p_org AND e.course_id::text=p_course AND e.status IN ('active','completed')
        AND m.role='student' AND m.status='active'
        AND NOT EXISTS (SELECT FROM private.certificate_recommendations r WHERE r.organization_id=p_org AND r.enrollment_id=e.id)
    ),'[]'::jsonb) ELSE '[]'::jsonb END,
    'pending', CASE WHEN may_approve THEN coalesce((
      SELECT jsonb_agg(jsonb_build_object('id',r.id,'student',concat_ws(' ',m.first_name,nullif(m.last_name,'')),
        'teacher',concat_ws(' ',t.first_name,nullif(t.last_name,'')),'course',c.title) ORDER BY r.created_at,r.id)
      FROM private.certificate_recommendations r
      JOIN public.courses c ON c.id=r.course_id
      JOIN public.organization_memberships m ON m.id=r.membership_id
      JOIN public.organization_memberships t ON t.id=r.recommended_by
      WHERE r.organization_id=p_org AND r.status='pending'
    ),'[]'::jsonb) ELSE '[]'::jsonb END
  );
END;
$$;

CREATE FUNCTION public.recommend_certificate(p_org uuid,p_enrollment uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  enrollment public.enrollments;
  actor uuid;
  recommendation uuid;
BEGIN
  PERFORM private.require_module(p_org,'certificates.recommend');
  PERFORM 1 FROM public.organizations WHERE id=p_org FOR UPDATE;
  PERFORM private.require_module(p_org,'certificates.recommend');
  actor:=private.member_id(p_org);
  IF NOT EXISTS (SELECT FROM public.organization_memberships WHERE id=actor AND staff_rank='teacher') THEN
    RAISE EXCEPTION 'Se requiere un profesor autorizado' USING ERRCODE='42501';
  END IF;
  SELECT e.* INTO enrollment FROM public.enrollments e JOIN public.organization_memberships m ON m.id=e.membership_id
    WHERE e.organization_id=p_org AND e.id=p_enrollment AND e.status IN ('active','completed')
      AND m.role='student' AND m.status='active' FOR SHARE OF e,m;
  IF NOT FOUND THEN RAISE EXCEPTION 'Matrícula no disponible' USING ERRCODE='42501'; END IF;

  INSERT INTO private.certificate_recommendations(organization_id,course_id,membership_id,enrollment_id,recommended_by)
  VALUES(p_org,enrollment.course_id,enrollment.membership_id,enrollment.id,actor) RETURNING id INTO recommendation;
  RETURN recommendation;
END;
$$;

CREATE FUNCTION public.decide_certificate(p_org uuid,p_recommendation uuid,p_approve boolean) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  recommendation private.certificate_recommendations;
  actor uuid;
  issued uuid;
  evidence jsonb;
BEGIN
  PERFORM private.require_module(p_org,'certificates.approve');
  PERFORM 1 FROM public.organizations WHERE id=p_org FOR UPDATE;
  PERFORM private.require_module(p_org,'certificates.approve');
  actor:=private.member_id(p_org);
  SELECT * INTO recommendation FROM private.certificate_recommendations
    WHERE organization_id=p_org AND id=p_recommendation FOR UPDATE;
  IF NOT FOUND OR recommendation.recommended_by=actor THEN
    RAISE EXCEPTION 'Recomendación no disponible' USING ERRCODE='42501';
  END IF;
  IF recommendation.status<>'pending' OR p_approve IS NULL THEN
    RAISE EXCEPTION 'Decisión no disponible' USING ERRCODE='22023';
  END IF;

  IF p_approve THEN
    SELECT jsonb_build_object('template_version','demo-1','institution',o.name,
      'participant',concat_ws(' ',m.first_name,nullif(m.last_name,'')),'course',c.title)
    INTO evidence
    FROM public.enrollments e JOIN public.organization_memberships m ON m.id=e.membership_id
    JOIN public.courses c ON c.id=e.course_id JOIN public.organizations o ON o.id=e.organization_id
    WHERE e.organization_id=p_org AND e.id=recommendation.enrollment_id AND e.status IN ('active','completed')
      AND m.role='student' AND m.status='active' FOR SHARE OF e,m,c;
    IF NOT FOUND THEN RAISE EXCEPTION 'Matrícula no disponible' USING ERRCODE='22023'; END IF;
    IF EXISTS (SELECT FROM public.certificate_issues i WHERE i.organization_id=p_org
      AND i.enrollment_id=recommendation.enrollment_id AND i.status='issued') THEN
      RAISE EXCEPTION 'Ya existe un certificado emitido' USING ERRCODE='23505';
    END IF;
    issued:=gen_random_uuid();
  END IF;

  UPDATE private.certificate_recommendations SET status=CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
    decided_by=actor,decided_at=transaction_timestamp(),certificate_id=issued
    WHERE id=recommendation.id;
  IF p_approve THEN
    INSERT INTO public.certificate_issues(id,organization_id,enrollment_id,course_id,membership_id,serial,
      issued_at,status,snapshot,created_by_membership_id,updated_by_membership_id)
    VALUES(issued,p_org,recommendation.enrollment_id,recommendation.course_id,recommendation.membership_id,
      'CERT-'||issued::text,transaction_timestamp(),'issued',evidence,actor,actor);
  END IF;
  RETURN recommendation.id;
END;
$$;

REVOKE ALL ON FUNCTION public.certificate_staff_context(uuid,text),public.recommend_certificate(uuid,uuid),
  public.decide_certificate(uuid,uuid,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.certificate_staff_context(uuid,text),public.recommend_certificate(uuid,uuid),
  public.decide_certificate(uuid,uuid,boolean) TO authenticated;

COMMIT;
