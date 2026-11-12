BEGIN;

-- Reconoce la base histórica o el contrato de Medios comprobado en Cloud.
-- Una instalación parcial o una definición distinta debe revisarse antes de tocar los permisos.
DO $$
DECLARE
  media_columns integer;
  media_functions integer;
  media_constraints integer;
BEGIN
  SELECT count(*) INTO media_columns FROM information_schema.columns WHERE table_schema='public'
    AND ((table_name='announcements' AND column_name IN ('image_url','video_url','image_asset_id','video_asset_id'))
      OR (table_name='materials' AND column_name IN ('class_url','recording_url','help_url')));
  SELECT count(*) INTO media_functions FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname||'.'||p.proname IN ('public.prepare_announcement_media','public.finalize_announcement_media','private.validate_announcement_media');
  IF media_columns=0 AND media_functions=0
    AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
      AND policyname='project_announcement_media_insert') THEN RETURN; END IF;
  SELECT count(*) INTO media_constraints FROM pg_constraint WHERE convalidated AND
    ((conrelid='public.announcements'::regclass AND conname IN (
        'announcements_image_asset_course_fkey','announcements_video_asset_course_fkey',
        'announcements_image_source_check','announcements_video_source_check',
        'announcements_image_url_https_check','announcements_video_url_https_check'))
      OR (conrelid='public.materials'::regclass AND conname IN (
        'materials_resource_source_check','materials_class_url_check','materials_recording_url_check','materials_help_url_check'))
      OR (conrelid='public.file_assets'::regclass AND conname='file_assets_announcement_media_purpose_check'));
  IF media_columns<>7 OR media_functions<>3 OR media_constraints<>11 OR EXISTS (
    SELECT 1 FROM (VALUES
      ('private.asset_access(uuid,uuid)','5f65a90ccc327923464d95005b77a3ba'),
      ('private.validate_announcement_media()','5ac026ba434fc31e014c02cff5f2632a'),
      ('public.finalize_announcement_media(uuid,uuid,bigint,text)','7b985600446663c6cbe4323ab38b4833'),
      ('public.prepare_announcement_media(uuid,uuid,text,text,text,bigint)','c918fc04322ccd97449cb8c5a37a3f2c'),
      ('public.update_announcement(uuid,uuid,bigint,jsonb)','37640ad570f5f4ad9bf7dac85e71b2ea'),
      ('public.update_material(uuid,uuid,bigint,jsonb)','0aa5afa5b1f3ce86def6ff4fffe7acd5')
    ) AS expected(signature,body_hash) LEFT JOIN pg_proc p ON p.oid=to_regprocedure(expected.signature)
    WHERE md5(regexp_replace(p.prosrc,'[[:space:]]+','','g')) IS DISTINCT FROM expected.body_hash
  ) OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.announcements'::regclass
       AND tgname='validate_announcement_media' AND tgenabled IN ('O','A'))
    OR (SELECT count(*) FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
      AND cmd='INSERT' AND ((policyname='project_assets_insert_guard' AND permissive='RESTRICTIVE')
        OR (policyname='project_announcement_media_insert' AND permissive='PERMISSIVE'))
      AND md5(regexp_replace(with_check,'[[:space:]]+','','g'))='b7ab558ba01551912b252e0c42360a1e')<>2 THEN
    RAISE EXCEPTION 'Contrato de Medios incompleto o distinto al revisado' USING ERRCODE='23514';
  END IF;
END;
$$;

ALTER TABLE public.organization_memberships
  ADD COLUMN staff_rank text,
  ADD COLUMN allowed_modules text[] NOT NULL DEFAULT '{}';

CREATE FUNCTION private.valid_staff_permissions(rank text, modules text[]) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT CASE
    WHEN modules IS NULL OR coalesce(pg_catalog.array_ndims(modules),1) <> 1 THEN false
    ELSE coalesce(rank IN ('principal','administrator','teacher','secretary')
      AND pg_catalog.array_position(modules,NULL) IS NULL
      AND modules <@ ARRAY['students','courses','enrollments','schedule','attendance','materials','announcements',
        'certificates','certificates.recommend','certificates.approve']::text[]
      AND pg_catalog.cardinality(modules)=(SELECT count(DISTINCT m) FROM pg_catalog.unnest(modules) m)
      AND (rank<>'principal' OR pg_catalog.cardinality(modules)=0)
      AND (NOT ('certificates.recommend'=ANY(modules)) OR (rank='teacher' AND 'certificates'=ANY(modules)))
      AND (NOT ('certificates.approve'=ANY(modules)) OR (rank='administrator' AND 'certificates'=ANY(modules))),false)
  END;
$$;

-- La asignación inicial corresponde a la identidad QA verificada y autorizada.
-- En una base vacía no hay nada que promover. Otras organizaciones activas requieren una decisión explícita.
DO $$
DECLARE
  qa_org constant uuid := '211f6de1-5f3f-45ac-bbb1-d8363d715d01';
  qa_membership constant uuid := '6e4260d4-b596-4158-8663-91b73a382f7a';
  qa_profile constant uuid := '5c68dac3-31fe-4a70-a823-45fa69f3c058';
  qa_auth constant uuid := '6cabd8d2-55d0-401c-b4f6-a20040215134';
BEGIN
  IF EXISTS (SELECT 1 FROM public.organizations WHERE status='active' AND id<>qa_org) THEN
    RAISE EXCEPTION 'Hay una organización activa sin principal inicial aprobado' USING ERRCODE='23514';
  END IF;
  IF EXISTS (SELECT 1 FROM public.organizations WHERE id=qa_org OR slug='qa-sistema-alumnos-01') THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.organizations o
      JOIN public.organization_memberships m ON m.organization_id=o.id
      JOIN public.profiles p ON p.id=m.profile_id
      JOIN auth.users u ON u.id=p.auth_user_id
      WHERE o.id=qa_org AND o.slug='qa-sistema-alumnos-01' AND o.status='active'
        AND m.id=qa_membership AND m.role='admin' AND m.status='active'
        AND p.id=qa_profile AND p.status='active' AND u.id=qa_auth
        AND u.email='u-000002@cuentas.sistema-alumnos.invalid'
        AND u.email_confirmed_at IS NOT NULL AND NOT coalesce(u.is_anonymous,false)
        AND u.deleted_at IS NULL AND (u.banned_until IS NULL OR u.banned_until<=now())
    ) THEN
      RAISE EXCEPTION 'La membresía QA no coincide con la asignación aprobada' USING ERRCODE='23514';
    END IF;
    UPDATE public.organization_memberships SET staff_rank='principal'
    WHERE organization_id=qa_org AND id=qa_membership;
  END IF;
  UPDATE public.organization_memberships SET staff_rank='administrator'
  WHERE role='admin' AND staff_rank IS NULL;
END;
$$;

SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE public.organization_memberships ADD CONSTRAINT membership_staff_permissions CHECK (
  (role='student' AND staff_rank IS NULL AND pg_catalog.cardinality(allowed_modules)=0)
  OR (role='admin' AND private.valid_staff_permissions(staff_rank,allowed_modules))
);

-- Escribir la misma fila de organización cuando cambia la elegibilidad de un principal
-- evita que dos transacciones con snapshot repetible confirmen usando estados anteriores.
CREATE OR REPLACE FUNCTION private.lock_organization() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  old_principal boolean := TG_OP<>'INSERT' AND OLD.role='admin' AND OLD.staff_rank='principal' AND OLD.status='active';
  new_principal boolean := TG_OP<>'DELETE' AND NEW.role='admin' AND NEW.staff_rank='principal' AND NEW.status='active';
  org uuid := coalesce(NEW.organization_id,OLD.organization_id);
BEGIN
  IF coalesce(old_principal,false) IS DISTINCT FROM coalesce(new_principal,false)
    OR (old_principal AND new_principal AND NEW.profile_id IS DISTINCT FROM OLD.profile_id) THEN
    UPDATE public.organizations SET status=status WHERE id=org;
  ELSE
    PERFORM 1 FROM public.organizations WHERE id=org FOR UPDATE;
  END IF;
  RETURN coalesce(NEW,OLD);
END;
$$;

CREATE OR REPLACE FUNCTION private.lock_profile_organizations() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE org record;
BEGIN
  FOR org IN
    SELECT o.id,m.staff_rank FROM public.organizations o
    JOIN public.organization_memberships m ON m.organization_id=o.id
    WHERE m.profile_id=OLD.id AND m.role='admin' ORDER BY o.id FOR UPDATE OF o
  LOOP
    IF org.staff_rank='principal'
      AND (TG_OP='DELETE' OR (NEW.status,NEW.auth_user_id) IS DISTINCT FROM (OLD.status,OLD.auth_user_id)) THEN
      UPDATE public.organizations SET status=status WHERE id=org.id;
    END IF;
  END LOOP;
  RETURN coalesce(NEW,OLD);
END;
$$;

CREATE OR REPLACE FUNCTION private.assert_organization_admin(org uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.organizations WHERE id=org AND status='active') AND NOT EXISTS (
    SELECT 1 FROM public.organization_memberships m JOIN public.profiles p ON p.id=m.profile_id
    WHERE m.organization_id=org AND m.role='admin' AND m.staff_rank='principal'
      AND m.status='active' AND p.status='active' AND p.auth_user_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Una organización activa requiere un administrador principal vigente' USING ERRCODE='23514';
  END IF;
END;
$$;

-- El acceso completo histórico queda reservado al principal.
CREATE OR REPLACE FUNCTION private.org_admin(org uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT coalesce(auth.jwt()->>'aal','')='aal2' AND EXISTS (
    SELECT 1 FROM public.organization_memberships m WHERE m.id=private.member_id(org)
      AND m.role='admin' AND m.staff_rank='principal'
  );
$$;

CREATE FUNCTION private.can_use_module(org uuid, permission text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT permission IN ('students','courses','enrollments','schedule','attendance','materials','announcements',
    'certificates','certificates.recommend','certificates.approve')
    AND coalesce(auth.jwt()->>'aal','')='aal2' AND EXISTS (
      SELECT 1 FROM public.organization_memberships m WHERE m.id=private.member_id(org) AND m.role='admin'
        AND (permission=ANY(m.allowed_modules) OR m.staff_rank='principal')
    );
$$;

CREATE FUNCTION private.require_module(org uuid, permission text) RETURNS void
LANGUAGE plpgsql STABLE SET search_path='' AS $$
BEGIN
  IF private.can_use_module(org,permission) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Permiso de módulo y MFA requeridos' USING ERRCODE='42501';
  END IF;
END;
$$;

CREATE FUNCTION private.student_member_id(org uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT m.id FROM public.organization_memberships m WHERE m.id=private.member_id(org) AND m.role='student';
$$;

CREATE OR REPLACE FUNCTION private.course_access(org uuid, course uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.courses c JOIN public.enrollments e ON e.organization_id=c.organization_id AND e.course_id=c.id
    WHERE c.organization_id=org AND c.id=course AND c.status='published'
      AND e.membership_id=private.student_member_id(org) AND e.status IN ('active','completed')
  );
$$;

CREATE OR REPLACE FUNCTION private.certificate_access(org uuid, issue uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.certificate_issues c WHERE c.organization_id=org AND c.id=issue
      AND c.membership_id=private.student_member_id(org) AND c.status IN ('issued','revoked')
  );
$$;

CREATE OR REPLACE FUNCTION private.asset_access(org uuid, asset uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.file_assets f WHERE f.organization_id=org AND f.id=asset AND f.status='ready'
      AND (private.org_admin(org)
        OR (f.purpose='course_material' AND private.can_use_module(org,'materials'))
        OR (f.purpose IN ('announcement_image','announcement_video') AND (
          private.can_use_module(org,'announcements') OR EXISTS (
            SELECT 1 FROM public.announcements a WHERE a.organization_id=org AND a.course_id=f.course_id
              AND a.status='published' AND a.published_at<=now()
              AND (to_jsonb(a)->>'image_asset_id'=f.id::text OR to_jsonb(a)->>'video_asset_id'=f.id::text)
              AND private.course_access(org,a.course_id)
          )
        ))
        OR (private.member_id(org) IS NOT NULL AND f.purpose='branding')
        OR (f.purpose='course_material' AND EXISTS (
          SELECT 1 FROM public.materials m WHERE m.organization_id=org AND m.file_asset_id=f.id AND private.material_access(org,m.id)
        ))
        OR (f.purpose='certificate' AND EXISTS (
          SELECT 1 FROM public.certificate_issues c WHERE c.organization_id=org AND c.file_asset_id=f.id AND c.status='issued'
            AND private.certificate_access(org,c.id)
        )))
  );
$$;

CREATE FUNCTION private.active_enrollment_student(org uuid, membership uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT private.can_use_module(org,'enrollments') AND EXISTS (
    SELECT 1 FROM public.organization_memberships m JOIN public.profiles p ON p.id=m.profile_id
    WHERE m.organization_id=org AND m.id=membership AND m.role='student' AND m.status='active' AND p.status='active'
  );
$$;

REVOKE ALL ON FUNCTION private.valid_staff_permissions(text,text[]), private.can_use_module(uuid,text),
  private.require_module(uuid,text), private.student_member_id(uuid), private.active_enrollment_student(uuid,uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.can_use_module(uuid,text), private.student_member_id(uuid),
  private.active_enrollment_student(uuid,uuid) TO authenticated;

ALTER POLICY memberships_read ON public.organization_memberships USING (
  profile_id=private.self_profile_id() OR private.org_admin(organization_id)
  OR (role='student' AND private.can_use_module(organization_id,'students'))
);
ALTER POLICY courses_read ON public.courses USING (
  private.can_use_module(organization_id,'courses') OR private.course_access(organization_id,id)
);
ALTER POLICY modules_read ON public.course_modules USING (
  private.can_use_module(organization_id,'courses') OR (status='published' AND private.course_access(organization_id,course_id))
);
ALTER POLICY lessons_read ON public.lessons USING (
  private.can_use_module(organization_id,'courses') OR private.lesson_access(organization_id,id)
);
ALTER POLICY enrollments_read ON public.enrollments USING (
  private.can_use_module(organization_id,'enrollments') OR membership_id=private.student_member_id(organization_id)
);
ALTER POLICY announcements_read ON public.announcements USING (
  private.can_use_module(organization_id,'announcements')
  OR (status='published' AND published_at<=now() AND private.course_access(organization_id,course_id))
);
ALTER POLICY materials_read ON public.materials USING (
  private.can_use_module(organization_id,'materials') OR private.material_access(organization_id,id)
);
ALTER POLICY events_read ON public.calendar_events USING (
  private.can_use_module(organization_id,'schedule') OR private.event_access(organization_id,id)
);
ALTER POLICY attendees_read ON public.calendar_event_attendees USING (
  private.can_use_module(organization_id,'schedule')
  OR (membership_id=private.student_member_id(organization_id) AND status='active' AND private.event_access(organization_id,event_id))
);
ALTER POLICY assets_read ON public.file_assets USING (
  private.org_admin(organization_id) OR (purpose='course_material' AND private.can_use_module(organization_id,'materials'))
  OR (purpose IN ('announcement_image','announcement_video') AND private.can_use_module(organization_id,'announcements'))
  OR private.asset_access(organization_id,id)
);
ALTER POLICY attendance_read ON public.attendance_records USING (
  private.can_use_module(organization_id,'attendance')
  OR (membership_id=private.student_member_id(organization_id) AND private.event_access(organization_id,event_id))
);

ALTER POLICY enrollments_insert ON public.enrollments WITH CHECK (
  private.active_enrollment_student(organization_id,membership_id)
);
ALTER POLICY file_assets_insert ON public.file_assets WITH CHECK (
  status='pending' AND (private.org_admin(organization_id)
    OR (purpose='course_material' AND private.can_use_module(organization_id,'materials')))
);
ALTER POLICY file_assets_update ON public.file_assets
  USING (private.org_admin(organization_id) OR (purpose='course_material' AND private.can_use_module(organization_id,'materials')))
  WITH CHECK (private.org_admin(organization_id) OR (purpose='course_material' AND private.can_use_module(organization_id,'materials')));

-- Las políticas de certificados y auditoría conservan su referencia a org_admin.
-- Los permisos reservados de certificados no se usan para emitir documentos.

ALTER POLICY courses_insert ON public.courses WITH CHECK (private.can_use_module(organization_id,'courses'));
ALTER POLICY courses_update ON public.courses USING (private.can_use_module(organization_id,'courses')) WITH CHECK (private.can_use_module(organization_id,'courses'));
ALTER POLICY course_modules_insert ON public.course_modules WITH CHECK (private.can_use_module(organization_id,'courses'));
ALTER POLICY course_modules_update ON public.course_modules USING (private.can_use_module(organization_id,'courses')) WITH CHECK (private.can_use_module(organization_id,'courses'));
ALTER POLICY lessons_insert ON public.lessons WITH CHECK (private.can_use_module(organization_id,'courses'));
ALTER POLICY lessons_update ON public.lessons USING (private.can_use_module(organization_id,'courses')) WITH CHECK (private.can_use_module(organization_id,'courses'));
ALTER POLICY enrollments_update ON public.enrollments USING (private.can_use_module(organization_id,'enrollments')) WITH CHECK (private.can_use_module(organization_id,'enrollments'));
ALTER POLICY announcements_insert ON public.announcements WITH CHECK (private.can_use_module(organization_id,'announcements'));
ALTER POLICY announcements_update ON public.announcements USING (private.can_use_module(organization_id,'announcements')) WITH CHECK (private.can_use_module(organization_id,'announcements'));
ALTER POLICY materials_insert ON public.materials WITH CHECK (private.can_use_module(organization_id,'materials'));
ALTER POLICY materials_update ON public.materials USING (private.can_use_module(organization_id,'materials')) WITH CHECK (private.can_use_module(organization_id,'materials'));
ALTER POLICY calendar_events_insert ON public.calendar_events WITH CHECK (private.can_use_module(organization_id,'schedule'));
ALTER POLICY calendar_events_update ON public.calendar_events USING (private.can_use_module(organization_id,'schedule')) WITH CHECK (private.can_use_module(organization_id,'schedule'));
ALTER POLICY calendar_event_attendees_update ON public.calendar_event_attendees USING (private.can_use_module(organization_id,'schedule')) WITH CHECK (private.can_use_module(organization_id,'schedule'));

-- Cada RPC conserva sus validaciones y cambia solo su autorización.
CREATE OR REPLACE FUNCTION public.update_course(p_organization_id uuid,p_id uuid,p_expected_version bigint,p_patch jsonb) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE original public.courses;candidate public.courses;result_version bigint;
BEGIN
 PERFORM private.require_module(p_organization_id,'courses');
 PERFORM private.validate_patch(p_patch,ARRAY['title','description','tag','status','sort_order','price_amount','currency','declared_lesson_count','cover_asset_id']);
 SELECT * INTO original FROM public.courses WHERE organization_id=p_organization_id AND id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Recurso no disponible' USING ERRCODE='42501'; END IF;
 IF p_expected_version IS NULL OR original.row_version<>p_expected_version THEN RAISE EXCEPTION 'Conflicto de versión; vuelva a consultar' USING ERRCODE='40001'; END IF;
 candidate:=jsonb_populate_record(original,p_patch);

 UPDATE public.courses SET title=candidate.title,description=candidate.description,tag=candidate.tag,status=candidate.status,sort_order=candidate.sort_order,price_amount=candidate.price_amount,currency=candidate.currency,declared_lesson_count=candidate.declared_lesson_count,cover_asset_id=candidate.cover_asset_id WHERE organization_id=p_organization_id AND id=p_id RETURNING row_version INTO result_version;
 RETURN result_version;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_course_module(p_organization_id uuid,p_id uuid,p_expected_version bigint,p_patch jsonb) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE original public.course_modules;candidate public.course_modules;result_version bigint;
BEGIN
 PERFORM private.require_module(p_organization_id,'courses');
 PERFORM private.validate_patch(p_patch,ARRAY['title','sort_order','status']);
 SELECT * INTO original FROM public.course_modules WHERE organization_id=p_organization_id AND id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Recurso no disponible' USING ERRCODE='42501'; END IF;
 IF p_expected_version IS NULL OR original.row_version<>p_expected_version THEN RAISE EXCEPTION 'Conflicto de versión; vuelva a consultar' USING ERRCODE='40001'; END IF;
 candidate:=jsonb_populate_record(original,p_patch);

 UPDATE public.course_modules SET title=candidate.title,sort_order=candidate.sort_order,status=candidate.status WHERE organization_id=p_organization_id AND id=p_id RETURNING row_version INTO result_version;
 RETURN result_version;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_lesson(p_organization_id uuid,p_id uuid,p_expected_version bigint,p_patch jsonb) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE original public.lessons;candidate public.lessons;result_version bigint;
BEGIN
 PERFORM private.require_module(p_organization_id,'courses');
 PERFORM private.validate_patch(p_patch,ARRAY['module_id','title','description','video_url','live_url','duration_minutes','sort_order','status']);
 SELECT * INTO original FROM public.lessons WHERE organization_id=p_organization_id AND id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Recurso no disponible' USING ERRCODE='42501'; END IF;
 IF p_expected_version IS NULL OR original.row_version<>p_expected_version THEN RAISE EXCEPTION 'Conflicto de versión; vuelva a consultar' USING ERRCODE='40001'; END IF;
 candidate:=jsonb_populate_record(original,p_patch);

 UPDATE public.lessons SET module_id=candidate.module_id,title=candidate.title,description=candidate.description,video_url=candidate.video_url,live_url=candidate.live_url,duration_minutes=candidate.duration_minutes,sort_order=candidate.sort_order,status=candidate.status WHERE organization_id=p_organization_id AND id=p_id RETURNING row_version INTO result_version;
 RETURN result_version;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_enrollment(p_organization_id uuid,p_id uuid,p_expected_version bigint,p_patch jsonb) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE original public.enrollments;candidate public.enrollments;result_version bigint;
BEGIN
 PERFORM private.require_module(p_organization_id,'enrollments');
 PERFORM private.validate_patch(p_patch,ARRAY['status','progress_percent','completed_at']);
 SELECT * INTO original FROM public.enrollments WHERE organization_id=p_organization_id AND id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Recurso no disponible' USING ERRCODE='42501'; END IF;
 IF p_expected_version IS NULL OR original.row_version<>p_expected_version THEN RAISE EXCEPTION 'Conflicto de versión; vuelva a consultar' USING ERRCODE='40001'; END IF;
 candidate:=jsonb_populate_record(original,p_patch);

 UPDATE public.enrollments SET status=candidate.status,progress_percent=candidate.progress_percent,completed_at=candidate.completed_at WHERE organization_id=p_organization_id AND id=p_id RETURNING row_version INTO result_version;
 RETURN result_version;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_announcement(p_organization_id uuid,p_id uuid,p_expected_version bigint,p_patch jsonb) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE original public.announcements;candidate public.announcements;result_version bigint; media boolean;
BEGIN
 PERFORM private.require_module(p_organization_id,'announcements');
 SELECT * INTO original FROM public.announcements WHERE organization_id=p_organization_id AND id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Recurso no disponible' USING ERRCODE='42501'; END IF;
 IF p_expected_version IS NULL OR original.row_version<>p_expected_version THEN RAISE EXCEPTION 'Conflicto de versión; vuelva a consultar' USING ERRCODE='40001'; END IF;
 media:=to_jsonb(original) ? 'image_asset_id';
 PERFORM private.validate_patch(p_patch,ARRAY['title','body','published_at','status']
   || CASE WHEN media THEN ARRAY['image_url','video_url','image_asset_id','video_asset_id'] ELSE ARRAY[]::text[] END);
 candidate:=jsonb_populate_record(original,p_patch);
 IF media THEN
   UPDATE public.announcements SET title=candidate.title,body=candidate.body,published_at=candidate.published_at,
     status=candidate.status,image_url=candidate.image_url,video_url=candidate.video_url,
     image_asset_id=candidate.image_asset_id,video_asset_id=candidate.video_asset_id
   WHERE organization_id=p_organization_id AND id=p_id RETURNING row_version INTO result_version;
   RETURN result_version;
 END IF;

 UPDATE public.announcements SET title=candidate.title,body=candidate.body,published_at=candidate.published_at,status=candidate.status WHERE organization_id=p_organization_id AND id=p_id RETURNING row_version INTO result_version;
 RETURN result_version;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_material(p_organization_id uuid,p_id uuid,p_expected_version bigint,p_patch jsonb) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE original public.materials;candidate public.materials;result_version bigint; media boolean;
BEGIN
 PERFORM private.require_module(p_organization_id,'materials');
 SELECT * INTO original FROM public.materials WHERE organization_id=p_organization_id AND id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Recurso no disponible' USING ERRCODE='42501'; END IF;
 IF p_expected_version IS NULL OR original.row_version<>p_expected_version THEN RAISE EXCEPTION 'Conflicto de versión; vuelva a consultar' USING ERRCODE='40001'; END IF;
 media:=to_jsonb(original) ? 'class_url';
 PERFORM private.validate_patch(p_patch,ARRAY['lesson_id','title','external_url','file_asset_id','sort_order','status']
   || CASE WHEN media THEN ARRAY['class_url','recording_url','help_url'] ELSE ARRAY[]::text[] END);
 candidate:=jsonb_populate_record(original,p_patch);
 IF media THEN
   -- El formulario anterior usa external_url. Al guardar el enlace ya mostrado se preservan los demás.
   IF p_patch ? 'external_url' AND NOT (p_patch ?| ARRAY['class_url','recording_url','help_url']) THEN
     IF candidate.file_asset_id IS NOT NULL AND candidate.external_url IS NULL THEN
       candidate.class_url:=NULL; candidate.recording_url:=NULL; candidate.help_url:=NULL;
     ELSIF candidate.file_asset_id IS NULL AND candidate.external_url IS NOT NULL THEN
       IF candidate.external_url IS DISTINCT FROM coalesce(original.class_url,original.recording_url,original.help_url) THEN
         candidate.class_url:=candidate.external_url;
       END IF;
       candidate.external_url:=NULL;
     END IF;
   END IF;
   UPDATE public.materials SET lesson_id=candidate.lesson_id,title=candidate.title,external_url=candidate.external_url,
     class_url=candidate.class_url,recording_url=candidate.recording_url,help_url=candidate.help_url,
     file_asset_id=candidate.file_asset_id,sort_order=candidate.sort_order,status=candidate.status
   WHERE organization_id=p_organization_id AND id=p_id RETURNING row_version INTO result_version;
   RETURN result_version;
 END IF;

 UPDATE public.materials SET lesson_id=candidate.lesson_id,title=candidate.title,external_url=candidate.external_url,file_asset_id=candidate.file_asset_id,sort_order=candidate.sort_order,status=candidate.status WHERE organization_id=p_organization_id AND id=p_id RETURNING row_version INTO result_version;
 RETURN result_version;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_calendar_event(p_organization_id uuid,p_id uuid,p_expected_version bigint,p_patch jsonb) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE original public.calendar_events;candidate public.calendar_events;result_version bigint;
BEGIN
 PERFORM private.require_module(p_organization_id,'schedule');
 PERFORM private.validate_patch(p_patch,ARRAY['lesson_id','title','module_label','starts_at','ends_at','timezone','color_key','status']);
 SELECT * INTO original FROM public.calendar_events WHERE organization_id=p_organization_id AND id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Recurso no disponible' USING ERRCODE='42501'; END IF;
 IF p_expected_version IS NULL OR original.row_version<>p_expected_version THEN RAISE EXCEPTION 'Conflicto de versión; vuelva a consultar' USING ERRCODE='40001'; END IF;
 candidate:=jsonb_populate_record(original,p_patch);

 UPDATE public.calendar_events SET lesson_id=candidate.lesson_id,title=candidate.title,module_label=candidate.module_label,starts_at=candidate.starts_at,ends_at=candidate.ends_at,timezone=candidate.timezone,color_key=candidate.color_key,status=candidate.status WHERE organization_id=p_organization_id AND id=p_id RETURNING row_version INTO result_version;
 RETURN result_version;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_scheduled_event(p_organization_id uuid,p_event jsonb,p_membership_ids uuid[]) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE candidate public.calendar_events;event_id uuid;
BEGIN
 PERFORM private.require_module(p_organization_id,'schedule');
 PERFORM private.validate_patch(p_event,ARRAY['course_id','lesson_id','title','module_label','starts_at','ends_at','timezone','color_key']);
 IF coalesce(cardinality(p_membership_ids),0)=0 OR array_position(p_membership_ids,NULL) IS NOT NULL
 OR (SELECT count(DISTINCT v) FROM unnest(p_membership_ids) v)<>cardinality(p_membership_ids) THEN
  RAISE EXCEPTION 'Asistentes vacíos, nulos o duplicados' USING ERRCODE='22023';
 END IF;
 candidate:=jsonb_populate_record(NULL::public.calendar_events,p_event);
 INSERT INTO public.calendar_events(organization_id,course_id,lesson_id,title,module_label,starts_at,ends_at,timezone,color_key,status)
 VALUES(p_organization_id,candidate.course_id,candidate.lesson_id,candidate.title,candidate.module_label,candidate.starts_at,candidate.ends_at,coalesce(candidate.timezone,'America/Lima'),coalesce(candidate.color_key,'blue'),'scheduled') RETURNING id INTO event_id;
 INSERT INTO public.calendar_event_attendees(organization_id,event_id,membership_id)
 SELECT p_organization_id,event_id,v FROM unnest(p_membership_ids) v;
 RETURN event_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.replace_event_attendees(p_organization_id uuid,p_event_id uuid,p_expected_version bigint,p_membership_ids uuid[]) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE original public.calendar_events;v uuid;result_version bigint;
BEGIN
 PERFORM private.require_module(p_organization_id,'schedule');
 SELECT * INTO original FROM public.calendar_events WHERE organization_id=p_organization_id AND id=p_event_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Evento no disponible' USING ERRCODE='42501'; END IF;
 IF p_expected_version IS NULL OR original.row_version<>p_expected_version THEN RAISE EXCEPTION 'Conflicto de versión' USING ERRCODE='40001'; END IF;
 IF p_membership_ids IS NULL OR array_position(p_membership_ids,NULL) IS NOT NULL
 OR (SELECT count(DISTINCT x) FROM unnest(p_membership_ids) x)<>cardinality(p_membership_ids) THEN
  RAISE EXCEPTION 'Asistentes inválidos' USING ERRCODE='22023';
 END IF;
 IF original.status='scheduled' AND cardinality(p_membership_ids)=0 THEN RAISE EXCEPTION 'Un evento programado requiere asistentes' USING ERRCODE='23514'; END IF;
 UPDATE public.calendar_event_attendees SET status='cancelled' WHERE organization_id=p_organization_id AND event_id=p_event_id AND status='active' AND NOT (membership_id=ANY(p_membership_ids));
 FOREACH v IN ARRAY p_membership_ids LOOP
  INSERT INTO public.calendar_event_attendees(organization_id,event_id,membership_id,status)
  VALUES(p_organization_id,p_event_id,v,'active')
  ON CONFLICT(organization_id,event_id,membership_id) DO UPDATE SET status='active';
 END LOOP;
 UPDATE public.calendar_events SET title=title WHERE organization_id=p_organization_id AND id=p_event_id RETURNING row_version INTO result_version;
 RETURN result_version;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_file_asset(p_organization_id uuid,p_id uuid,p_expected_version bigint,p_patch jsonb) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE original public.file_assets;candidate public.file_assets;result_version bigint;
BEGIN
 PERFORM private.require_module(p_organization_id,'materials');
 PERFORM private.validate_patch(p_patch,ARRAY['status']);
 SELECT * INTO original FROM public.file_assets WHERE organization_id=p_organization_id AND id=p_id FOR UPDATE;
 IF NOT FOUND OR (original.purpose<>'course_material' AND NOT private.org_admin(p_organization_id)) THEN RAISE EXCEPTION 'Recurso no disponible' USING ERRCODE='42501'; END IF;
 IF p_expected_version IS NULL OR original.row_version<>p_expected_version THEN RAISE EXCEPTION 'Conflicto de versión; vuelva a consultar' USING ERRCODE='40001'; END IF;
 candidate:=jsonb_populate_record(original,p_patch);
 IF candidate.status NOT IN ('archived','failed') THEN RAISE EXCEPTION 'Finalización de archivos reservada al verificador de Storage' USING ERRCODE='42501'; END IF;
 UPDATE public.file_assets SET status=candidate.status WHERE organization_id=p_organization_id AND id=p_id RETURNING row_version INTO result_version;
 RETURN result_version;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_student_contact(p_organization_id uuid,p_id uuid,p_expected_version bigint,p_patch jsonb) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE original public.organization_memberships;candidate public.organization_memberships;result_version bigint;
BEGIN
 PERFORM private.require_module(p_organization_id,'students');
 PERFORM private.validate_patch(p_patch,ARRAY['first_name','last_name','contact_email']);
 SELECT * INTO original FROM public.organization_memberships WHERE organization_id=p_organization_id AND id=p_id AND role='student' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Recurso no disponible' USING ERRCODE='42501'; END IF;
 IF p_expected_version IS NULL OR original.row_version<>p_expected_version THEN RAISE EXCEPTION 'Conflicto de versión; vuelva a consultar' USING ERRCODE='40001'; END IF;
 candidate:=jsonb_populate_record(original,p_patch);

 UPDATE public.organization_memberships SET first_name=candidate.first_name,last_name=candidate.last_name,contact_email=candidate.contact_email WHERE organization_id=p_organization_id AND id=p_id RETURNING row_version INTO result_version;
 RETURN result_version;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_student_status(p_organization_id uuid,p_id uuid,p_expected_version bigint,p_patch jsonb) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE original public.organization_memberships;candidate public.organization_memberships;result_version bigint;
BEGIN
 PERFORM private.require_module(p_organization_id,'students');
 PERFORM private.validate_patch(p_patch,ARRAY['status']);
 SELECT * INTO original FROM public.organization_memberships WHERE organization_id=p_organization_id AND id=p_id AND role='student' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Recurso no disponible' USING ERRCODE='42501'; END IF;
 IF p_expected_version IS NULL OR original.row_version<>p_expected_version THEN RAISE EXCEPTION 'Conflicto de versión; vuelva a consultar' USING ERRCODE='40001'; END IF;
 candidate:=jsonb_populate_record(original,p_patch);
 IF candidate.status='active' AND NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=candidate.profile_id AND p.status='active' AND p.auth_user_id IS NOT NULL) THEN RAISE EXCEPTION 'La activación de identidad aún no está verificada' USING ERRCODE='23514'; END IF;
 UPDATE public.organization_memberships SET status=candidate.status WHERE organization_id=p_organization_id AND id=p_id RETURNING row_version INTO result_version;
 RETURN result_version;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_schedule_sessions(
  p_org uuid, p_course uuid, p_dates date[], p_start time, p_end time,
  p_draft boolean, p_details jsonb
) RETURNS uuid[]
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  course_status text;
  members uuid[];
  event_date date;
  event_id uuid;
  session_ids uuid[] := '{}';
  series uuid;
BEGIN
  PERFORM private.require_module(p_org,'schedule');
  PERFORM private.validate_patch(p_details, ARRAY['title', 'description', 'modality', 'location']);
  IF coalesce(pg_catalog.cardinality(p_dates), 0) NOT BETWEEN 1 AND 60
    OR pg_catalog.array_ndims(p_dates) <> 1
    OR pg_catalog.array_position(p_dates, NULL) IS NOT NULL
    OR (SELECT count(DISTINCT d) FROM pg_catalog.unnest(p_dates) d) <> pg_catalog.cardinality(p_dates)
    OR EXISTS (SELECT 1 FROM pg_catalog.unnest(p_dates) d WHERE NOT pg_catalog.isfinite(d))
    OR p_start IS NULL OR p_end IS NULL OR p_end <= p_start
    OR p_end >= time '24:00' OR p_draft IS NULL THEN
    RAISE EXCEPTION 'schedule_invalid' USING ERRCODE = '22023';
  END IF;

  SELECT status INTO course_status FROM public.courses
  WHERE organization_id = p_org AND id = p_course AND status <> 'archived';
  IF NOT FOUND THEN RAISE EXCEPTION 'schedule_course' USING ERRCODE = '22023'; END IF;

  IF NOT p_draft THEN
    IF course_status <> 'published' THEN
      RAISE EXCEPTION 'schedule_course' USING ERRCODE = '22023';
    END IF;
    members := private.schedule_participants(p_org, p_course);
    IF members IS NULL THEN
      RAISE EXCEPTION 'schedule_attendees' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF pg_catalog.cardinality(p_dates) > 1 THEN series := pg_catalog.gen_random_uuid(); END IF;
  -- Orden estable para lotes concurrentes.
  FOR event_date IN SELECT d FROM pg_catalog.unnest(p_dates) d ORDER BY d LOOP
    INSERT INTO public.calendar_events (
      organization_id, course_id, title, description, modality, location,
      starts_at, ends_at, timezone, status, series_id
    ) VALUES (
      p_org, p_course, pg_catalog.btrim(p_details->>'title'),
      nullif(pg_catalog.btrim(p_details->>'description'), ''),
      nullif(p_details->>'modality', ''), nullif(pg_catalog.btrim(p_details->>'location'), ''),
      (event_date + p_start) AT TIME ZONE 'America/Lima',
      (event_date + p_end) AT TIME ZONE 'America/Lima',
      'America/Lima', CASE WHEN p_draft THEN 'draft' ELSE 'scheduled' END, series
    ) RETURNING id INTO event_id;

    IF NOT p_draft THEN
      INSERT INTO public.calendar_event_attendees (organization_id, event_id, membership_id)
      SELECT p_org, event_id, member_id FROM pg_catalog.unnest(members) member_id;
    END IF;
    session_ids := pg_catalog.array_append(session_ids, event_id);
  END LOOP;
  RETURN session_ids;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_schedule_session(
  p_org uuid, p_id uuid, p_version bigint, p_patch jsonb
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  original public.calendar_events;
  candidate public.calendar_events;
  current_version bigint;
  members uuid[];
BEGIN
  PERFORM private.require_module(p_org,'schedule');
  PERFORM private.validate_patch(p_patch,
    ARRAY['title', 'description', 'modality', 'location', 'starts_at', 'ends_at', 'status']);
  SELECT * INTO original FROM public.calendar_events
  WHERE organization_id = p_org AND id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'schedule_not_found' USING ERRCODE = '42501'; END IF;
  IF p_version IS DISTINCT FROM original.row_version THEN
    RAISE EXCEPTION 'schedule_stale' USING ERRCODE = '40001';
  END IF;
  candidate := pg_catalog.jsonb_populate_record(original, p_patch);
  IF original.status NOT IN ('draft', 'scheduled')
    OR candidate.status IS NULL
    OR (candidate.status <> original.status AND candidate.status <> 'cancelled'
      AND NOT (original.status = 'draft' AND candidate.status = 'scheduled'))
    OR (candidate.status = 'cancelled' AND p_patch <> '{"status":"cancelled"}'::jsonb)
    OR candidate.starts_at IS NULL OR candidate.ends_at IS NULL
    OR candidate.ends_at <= candidate.starts_at
    OR NOT pg_catalog.isfinite(candidate.starts_at) OR NOT pg_catalog.isfinite(candidate.ends_at) THEN
    RAISE EXCEPTION 'schedule_invalid' USING ERRCODE = '22023';
  END IF;

  IF original.status = 'draft' AND candidate.status = 'scheduled' THEN
    members := private.schedule_participants(p_org, original.course_id);
    IF members IS NULL THEN
      RAISE EXCEPTION 'schedule_attendees' USING ERRCODE = '22023';
    END IF;
  END IF;

  UPDATE public.calendar_events
  SET title = pg_catalog.btrim(candidate.title),
      description = nullif(pg_catalog.btrim(candidate.description), ''),
      modality = nullif(candidate.modality, ''),
      location = nullif(pg_catalog.btrim(candidate.location), ''),
      starts_at = candidate.starts_at, ends_at = candidate.ends_at, status = candidate.status
  WHERE organization_id = p_org AND id = p_id RETURNING row_version INTO current_version;
  IF members IS NOT NULL THEN
    INSERT INTO public.calendar_event_attendees (organization_id, event_id, membership_id)
    SELECT p_org, p_id, member_id FROM pg_catalog.unnest(members) member_id
    ON CONFLICT (organization_id, event_id, membership_id) DO UPDATE SET status = 'active';
  END IF;
  RETURN current_version;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_schedule(
  p_org uuid, p_from date, p_to date, p_admin boolean, p_course text
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  member_id uuid := CASE WHEN p_admin THEN private.member_id(p_org) ELSE private.student_member_id(p_org) END;
  course_filter uuid := nullif(p_course, '')::uuid;
  window_start timestamptz;
  window_end timestamptz;
BEGIN
  IF member_id IS NULL OR p_admin IS NULL OR (p_admin AND NOT private.can_use_module(p_org,'schedule')) THEN
    RAISE EXCEPTION 'schedule_forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_from IS NULL OR p_to IS NULL OR NOT pg_catalog.isfinite(p_from)
    OR NOT pg_catalog.isfinite(p_to) OR p_to - p_from NOT BETWEEN 1 AND 42 THEN
    RAISE EXCEPTION 'schedule_invalid' USING ERRCODE = '22023';
  END IF;
  window_start := p_from::timestamp AT TIME ZONE 'America/Lima';
  window_end := p_to::timestamp AT TIME ZONE 'America/Lima';

  RETURN (
    WITH courses AS (
      SELECT c.id, c.title, c.status
      FROM public.courses c
      WHERE c.organization_id = p_org AND (
        p_admin OR (
          c.status = 'published' AND EXISTS (
            SELECT 1 FROM public.enrollments en
            JOIN public.organization_memberships m ON m.organization_id = en.organization_id AND m.id = en.membership_id
            WHERE en.organization_id = p_org AND en.course_id = c.id
              AND en.membership_id = member_id AND en.status = 'active' AND m.role = 'student'
          )
        )
      )
    ), sessions AS (
      SELECT e.id, e.course_id, e.title, e.description, e.modality, e.location,
        e.starts_at, e.ends_at, e.status, e.series_id,
        CASE WHEN p_admin THEN e.row_version END AS row_version,
        CASE WHEN p_admin THEN EXISTS (
          SELECT 1 FROM public.attendance_records a
          WHERE a.organization_id = p_org AND a.event_id = e.id
        ) ELSE false END AS attendance_locked
      FROM public.calendar_events e
      JOIN courses c ON c.id = e.course_id
      WHERE e.organization_id = p_org
        AND (course_filter IS NULL OR e.course_id = course_filter)
        AND e.starts_at < window_end AND e.ends_at > window_start
        AND (p_admin OR (
          (e.lesson_id IS NULL OR private.lesson_access(p_org, e.lesson_id))
          AND (e.status = 'scheduled' OR (
            e.status = 'cancelled' AND (
              SELECT pg_catalog.bool_and(last_change.previous_status = 'scheduled')
              FROM (
                SELECT a.changes->>'previous_status' AS previous_status
                FROM public.audit_events a
                WHERE a.organization_id = p_org AND a.entity_type = 'public.calendar_events'
                  AND a.entity_id = e.id AND a.changes->>'status' = 'cancelled'
                  AND a.changes->'changed_fields' ? 'status'
                ORDER BY a.occurred_at DESC FETCH FIRST 1 ROW WITH TIES
              ) last_change
            )
          ))
        ))
      ORDER BY e.starts_at, e.id LIMIT 1001
    )
    SELECT pg_catalog.jsonb_build_object(
      'courses', coalesce((SELECT pg_catalog.jsonb_agg(c ORDER BY c.title, c.id) FROM courses c), '[]'::jsonb),
      'sessions', coalesce((SELECT pg_catalog.jsonb_agg(s ORDER BY s.starts_at, s.id) FROM sessions s), '[]'::jsonb)
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.set_attendance_batch(
  p_organization_id uuid,
  p_event_id uuid,
  p_records jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 v_event public.calendar_events;
 v_record jsonb;
 v_membership_id uuid;
 v_status text;
BEGIN
 PERFORM private.require_module(p_organization_id,'attendance');
 IF pg_catalog.jsonb_typeof(p_records)<>'array'
   OR pg_catalog.jsonb_array_length(p_records)=0
   OR pg_catalog.jsonb_array_length(p_records)>500 THEN
   RAISE EXCEPTION 'invalid records' USING ERRCODE='22023';
 END IF;
 SELECT * INTO v_event FROM public.calendar_events
 WHERE organization_id=p_organization_id AND id=p_event_id FOR UPDATE;
 IF NOT FOUND OR v_event.status<>'scheduled'
   OR (v_event.starts_at AT TIME ZONE 'America/Lima')::date
      <> (now() AT TIME ZONE 'America/Lima')::date THEN
   RAISE EXCEPTION 'attendance date closed' USING ERRCODE='22023';
 END IF;
 IF (SELECT pg_catalog.count(DISTINCT item.value->>'membership_id')
     FROM pg_catalog.jsonb_array_elements(p_records) item)
    <> pg_catalog.jsonb_array_length(p_records) THEN
   RAISE EXCEPTION 'duplicate attendance row' USING ERRCODE='22023';
 END IF;
 FOR v_record IN SELECT value FROM pg_catalog.jsonb_array_elements(p_records)
 LOOP
   IF pg_catalog.jsonb_typeof(v_record)<>'object'
     OR v_record->>'status' NOT IN ('present','absent','late') THEN
     RAISE EXCEPTION 'invalid status' USING ERRCODE='22023';
   END IF;
   v_membership_id := (v_record->>'membership_id')::uuid;
   v_status := v_record->>'status';
   IF NOT EXISTS(
     SELECT 1 FROM public.enrollments e
     JOIN public.organization_memberships m
       ON m.organization_id=e.organization_id AND m.id=e.membership_id
     WHERE e.organization_id=p_organization_id AND e.course_id=v_event.course_id
       AND e.membership_id=v_membership_id AND e.status IN ('active','completed')
       AND m.role='student' AND m.status='active'
   ) THEN
     RAISE EXCEPTION 'not enrolled in course' USING ERRCODE='42501';
   END IF;
   INSERT INTO public.attendance_records(organization_id,event_id,membership_id,status)
   VALUES(p_organization_id,p_event_id,v_membership_id,v_status)
   ON CONFLICT(organization_id,event_id,membership_id) DO UPDATE
     SET status=excluded.status,updated_at=now(),
         row_version=public.attendance_records.row_version+1;
 END LOOP;
END $$;

-- Selectores compartidos entre módulos. Se devuelven referencias mínimas, no filas completas.
CREATE FUNCTION public.staff_academic_context(p_org uuid, p_module text, p_course text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE course_filter uuid := nullif(p_course,'')::uuid;
BEGIN
  IF p_module IS NULL OR p_module NOT IN ('students','enrollments','schedule','attendance','materials','announcements') THEN
    RAISE EXCEPTION 'Módulo no admitido' USING ERRCODE='22023';
  END IF;
  PERFORM private.require_module(p_org,p_module);
  RETURN pg_catalog.jsonb_build_object(
    'courses',coalesce((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',c.id,'title',c.title,'status',c.status)
        ORDER BY c.sort_order,c.title,c.id)
      FROM (SELECT id,title,status,sort_order FROM public.courses c
        WHERE c.organization_id=p_org AND p_module<>'schedule'
        ORDER BY c.sort_order,c.title,c.id LIMIT 500) c
    ),'[]'::jsonb),
    'memberships',coalesce((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',m.id,'first_name',m.first_name,
        'last_name',m.last_name,'role',m.role,'status',m.status) ORDER BY m.first_name,m.id)
      FROM (SELECT m.id,m.first_name,m.last_name,m.role,m.status FROM public.organization_memberships m
        JOIN public.profiles p ON p.id=m.profile_id WHERE m.organization_id=p_org AND m.role='student'
          AND (p_module='enrollments' OR (p_module='attendance' AND m.status='active' AND p.status='active' AND EXISTS (
            SELECT 1 FROM public.enrollments e WHERE e.organization_id=p_org AND e.course_id=course_filter
              AND e.membership_id=m.id AND e.status IN ('active','completed')
          )))
        ORDER BY m.first_name,m.id LIMIT 500) m
    ),'[]'::jsonb),
    'enrollments',coalesce((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',e.id,'course_id',e.course_id,
        'membership_id',e.membership_id,'status',e.status) ORDER BY e.created_at DESC,e.id)
      FROM (SELECT e.id,e.course_id,e.membership_id,e.status,e.created_at FROM public.enrollments e
        JOIN public.organization_memberships m ON m.organization_id=e.organization_id AND m.id=e.membership_id
        WHERE e.organization_id=p_org AND m.role='student'
          AND (p_module='students' OR (p_module='attendance' AND e.course_id=course_filter AND e.status IN ('active','completed')))
        ORDER BY e.created_at DESC,e.id LIMIT 500) e
    ),'[]'::jsonb),
    'events',coalesce((
      SELECT pg_catalog.jsonb_agg(e ORDER BY e.starts_at,e.id)
      FROM (SELECT id,course_id,title,starts_at,ends_at,status FROM public.calendar_events
        WHERE organization_id=p_org AND p_module='attendance' AND course_id=course_filter
        ORDER BY starts_at,id LIMIT 500) e
    ),'[]'::jsonb),
    'attendee_ids',CASE WHEN p_module='schedule' AND course_filter IS NOT NULL
      THEN coalesce(pg_catalog.to_jsonb(private.schedule_participants(p_org,course_filter)),'[]'::jsonb)
      ELSE '[]'::jsonb END
  );
END;
$$;

CREATE FUNCTION private.staff_login_identifier(p_auth uuid) RETURNS text
LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT u.email FROM auth.users u WHERE u.id=p_auth AND u.email_confirmed_at IS NOT NULL
    AND NOT coalesce(u.is_anonymous,false) AND u.deleted_at IS NULL AND (u.banned_until IS NULL OR u.banned_until<=now())
    AND u.email ~ '^u-[a-z0-9]+@cuentas[.]sistema-alumnos[.]invalid$';
$$;

-- El operador de identidad prepara la asignación. La interfaz solo puede consumir una asignación verificada.
CREATE FUNCTION private.prepare_staff_assignment(
  p_org uuid, p_auth uuid, p_first_name text, p_last_name text,
  p_verified_by_ref text, p_evidence_ref text, p_idempotency_key uuid
) RETURNS uuid
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE
  identifier text := private.staff_login_identifier(p_auth);
  person public.profiles;
  member public.organization_memberships;
  assignment private.identity_activation_requests;
BEGIN
  IF identifier IS NULL OR p_idempotency_key IS NULL
    OR coalesce(length(btrim(p_first_name)),0) NOT BETWEEN 1 AND 100
    OR coalesce(length(btrim(p_last_name)),0)>100
    OR coalesce(length(btrim(p_verified_by_ref)),0) NOT BETWEEN 1 AND 100
    OR coalesce(length(btrim(p_evidence_ref)),0) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'Identidad o evidencia de asignación inválida' USING ERRCODE='22023';
  END IF;
  PERFORM 1 FROM public.organizations WHERE id=p_org AND status='active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Organización no disponible' USING ERRCODE='22023'; END IF;

  SELECT * INTO assignment FROM private.identity_activation_requests WHERE idempotency_key=p_idempotency_key;
  IF FOUND THEN
    SELECT * INTO member FROM public.organization_memberships WHERE id=assignment.membership_id;
    IF assignment.organization_id=p_org AND assignment.auth_user_id=p_auth
      AND assignment.verification_kind='institutional_assignment'
      AND assignment.status IN ('verified','linked') AND assignment.login_identifier=identifier
      AND assignment.verified_by_ref=btrim(p_verified_by_ref) AND assignment.verification_evidence_ref=btrim(p_evidence_ref)
      AND member.role='admin' AND member.first_name=btrim(p_first_name) AND member.last_name=coalesce(btrim(p_last_name),'') THEN
      RETURN assignment.id;
    END IF;
    RAISE EXCEPTION 'La clave de asignación ya está en uso' USING ERRCODE='23505';
  END IF;

  INSERT INTO public.profiles(auth_user_id,display_name,status)
  VALUES(p_auth,pg_catalog.concat_ws(' ',btrim(p_first_name),nullif(btrim(p_last_name),'')),'pending')
  ON CONFLICT(auth_user_id) DO NOTHING;
  SELECT * INTO person FROM public.profiles WHERE auth_user_id=p_auth FOR UPDATE;
  IF NOT FOUND OR person.status NOT IN ('pending','active') THEN
    RAISE EXCEPTION 'Perfil no disponible' USING ERRCODE='23514';
  END IF;
  IF EXISTS (SELECT 1 FROM public.organization_memberships WHERE organization_id=p_org AND profile_id=person.id) THEN
    RAISE EXCEPTION 'El perfil ya tiene una membresía en la organización' USING ERRCODE='23505';
  END IF;

  INSERT INTO public.organization_memberships(organization_id,profile_id,role,status,staff_rank,first_name,last_name)
  VALUES(p_org,person.id,'admin','invited','administrator',btrim(p_first_name),coalesce(btrim(p_last_name),''))
  RETURNING * INTO member;
  INSERT INTO private.identity_activation_requests(organization_id,profile_id,membership_id,status,auth_user_id,
    idempotency_key,verified_at,verification_kind,login_identifier,verified_by_ref,verification_evidence_ref)
  VALUES(p_org,person.id,member.id,'verified',p_auth,p_idempotency_key,transaction_timestamp(),
    'institutional_assignment',identifier,btrim(p_verified_by_ref),btrim(p_evidence_ref))
  RETURNING * INTO assignment;
  RETURN assignment.id;
END;
$$;

CREATE FUNCTION private.staff_assignments(p_org uuid) RETURNS SETOF private.identity_activation_requests
LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT a.* FROM private.identity_activation_requests a
  JOIN public.organization_memberships m
    ON m.organization_id=a.organization_id AND m.profile_id=a.profile_id AND m.id=a.membership_id
  JOIN public.profiles p ON p.id=m.profile_id
  WHERE a.organization_id=p_org AND a.status='verified' AND a.verification_kind='institutional_assignment'
    AND m.role='admin' AND m.staff_rank<>'principal' AND m.status='invited' AND btrim(m.first_name)<>''
    AND (p.status='active' OR (p.status='pending' AND NOT EXISTS (
      SELECT 1 FROM public.organization_memberships existing WHERE existing.profile_id=p.id AND existing.status='active'
    ))) AND p.auth_user_id=a.auth_user_id
    AND a.login_identifier=private.staff_login_identifier(a.auth_user_id);
$$;

CREATE FUNCTION public.list_staff(p_org uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM private.require_admin(p_org);
  RETURN pg_catalog.jsonb_build_object(
    'staff',coalesce((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',m.id,
        'name',pg_catalog.concat_ws(' ',nullif(m.first_name,''),nullif(m.last_name,'')),
        'identifier',u.email,'rank',m.staff_rank,'status',m.status,'modules',m.allowed_modules,
        'version',m.row_version,'self',m.profile_id=private.actor_profile_id())
        ORDER BY m.first_name,m.last_name,m.id)
      FROM public.organization_memberships m
      JOIN public.profiles p ON p.id=m.profile_id
      LEFT JOIN auth.users u ON u.id=p.auth_user_id
      WHERE m.organization_id=p_org AND m.role='admin' AND m.status<>'invited'
    ),'[]'::jsonb),
    'pending',coalesce((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',a.id,'identifier',a.login_identifier,
        'name',pg_catalog.concat_ws(' ',nullif(m.first_name,''),nullif(m.last_name,''))) ORDER BY m.first_name,a.id)
      FROM private.staff_assignments(p_org) a JOIN public.organization_memberships m ON m.id=a.membership_id
    ),'[]'::jsonb)
  );
END;
$$;

CREATE FUNCTION public.link_staff(p_org uuid, p_assignment uuid, p_rank text, p_modules text[], p_status text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE assignment private.identity_activation_requests;
BEGIN
  PERFORM private.require_admin(p_org);
  PERFORM 1 FROM public.organizations WHERE id=p_org FOR UPDATE;
  PERFORM private.require_admin(p_org);
  IF NOT private.valid_staff_permissions(p_rank,p_modules)
    OR p_status IS NULL OR p_status NOT IN ('active','suspended') THEN
    RAISE EXCEPTION 'Rango, permisos o estado inválidos' USING ERRCODE='22023';
  END IF;
  PERFORM 1 FROM private.identity_activation_requests WHERE organization_id=p_org AND id=p_assignment FOR UPDATE;
  SELECT * INTO assignment FROM private.staff_assignments(p_org) WHERE id=p_assignment;
  IF NOT FOUND OR assignment.profile_id=private.actor_profile_id() THEN
    RAISE EXCEPTION 'Asignación no disponible' USING ERRCODE='42501';
  END IF;
  -- Una suspensión del perfil durante el alta invalida la operación.
  UPDATE public.profiles SET status='active' WHERE id=assignment.profile_id
    AND status='pending' AND auth_user_id=assignment.auth_user_id
    AND NOT EXISTS (SELECT 1 FROM public.organization_memberships m
      WHERE m.profile_id=assignment.profile_id AND m.status='active');
  IF NOT FOUND THEN
    PERFORM 1 FROM public.profiles WHERE id=assignment.profile_id
      AND status='active' AND auth_user_id=assignment.auth_user_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Perfil no disponible' USING ERRCODE='42501'; END IF;
  END IF;
  UPDATE public.organization_memberships SET staff_rank=p_rank,allowed_modules=p_modules,status=p_status
  WHERE organization_id=p_org AND id=assignment.membership_id AND profile_id=assignment.profile_id
    AND role='admin' AND staff_rank<>'principal' AND status='invited';
  IF NOT FOUND THEN RAISE EXCEPTION 'Membresía no disponible' USING ERRCODE='42501'; END IF;
  UPDATE private.identity_activation_requests SET status='linked',linked_at=transaction_timestamp()
  WHERE id=assignment.id;
  RETURN assignment.membership_id;
END;
$$;

CREATE FUNCTION public.update_staff(p_org uuid, p_membership uuid, p_version bigint, p_rank text, p_modules text[], p_status text)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  member public.organization_memberships;
  version bigint;
BEGIN
  PERFORM private.require_admin(p_org);
  PERFORM 1 FROM public.organizations WHERE id=p_org FOR UPDATE;
  PERFORM private.require_admin(p_org);
  SELECT * INTO member FROM public.organization_memberships
  WHERE organization_id=p_org AND id=p_membership AND role='admin' AND status IN ('active','suspended') FOR UPDATE;
  IF NOT FOUND OR member.profile_id=private.actor_profile_id() THEN
    RAISE EXCEPTION 'Membresía no disponible para el actor' USING ERRCODE='42501';
  END IF;
  IF p_version IS DISTINCT FROM member.row_version THEN
    RAISE EXCEPTION 'La membresía cambió; vuelva a consultar' USING ERRCODE='40001';
  END IF;
  IF NOT private.valid_staff_permissions(p_rank,p_modules)
    OR p_status IS NULL OR p_status NOT IN ('active','suspended') THEN
    RAISE EXCEPTION 'Rango, permisos o estado inválidos' USING ERRCODE='22023';
  END IF;
  IF p_status='active' AND (member.status='suspended' OR (p_rank='principal' AND member.staff_rank<>'principal'))
    AND NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id=member.profile_id AND p.status='active'
      AND private.staff_login_identifier(p.auth_user_id) IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'El perfil o la cuenta de acceso ya no está vigente' USING ERRCODE='23514';
  END IF;
  UPDATE public.organization_memberships SET staff_rank=p_rank,allowed_modules=p_modules,status=p_status
  WHERE id=member.id RETURNING row_version INTO version;
  RETURN version;
END;
$$;

REVOKE ALL ON FUNCTION private.staff_login_identifier(uuid), private.staff_assignments(uuid),
  private.prepare_staff_assignment(uuid,uuid,text,text,text,text,uuid),
  public.staff_academic_context(uuid,text,text), public.list_staff(uuid),
  public.link_staff(uuid,uuid,text,text[],text), public.update_staff(uuid,uuid,bigint,text,text[],text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.staff_academic_context(uuid,text,text), public.list_staff(uuid),
  public.link_staff(uuid,uuid,text,text[],text), public.update_staff(uuid,uuid,bigint,text,text[],text) TO authenticated;

-- Admite altas del formulario anterior en el contrato de Medios sin relajar su CHECK.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
      AND table_name='materials' AND column_name='class_url') THEN
    EXECUTE $definition$
      CREATE FUNCTION private.normalize_legacy_material_insert() RETURNS trigger
      LANGUAGE plpgsql SET search_path='' AS $body$
      BEGIN
        IF NEW.external_url IS NOT NULL AND NEW.file_asset_id IS NULL
          AND num_nonnulls(NEW.class_url,NEW.recording_url,NEW.help_url)=0 THEN
          NEW.class_url:=NEW.external_url; NEW.external_url:=NULL;
        END IF;
        RETURN NEW;
      END;
      $body$
    $definition$;
    REVOKE ALL ON FUNCTION private.normalize_legacy_material_insert() FROM PUBLIC,anon,authenticated;
    CREATE TRIGGER normalize_legacy_material_insert BEFORE INSERT ON public.materials
      FOR EACH ROW EXECUTE FUNCTION private.normalize_legacy_material_insert();
  END IF;
END;
$$;

COMMIT;
