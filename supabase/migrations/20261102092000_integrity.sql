BEGIN;
-- Helpers: actor siempre resuelto desde el JWT validado por el gateway, nunca un parámetro de usuario.
CREATE FUNCTION private.self_profile_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT p.id FROM public.profiles p WHERE p.auth_user_id=auth.uid()
 AND coalesce(auth.jwt()->>'is_anonymous','false')='false';
$$;
CREATE FUNCTION private.actor_profile_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT p.id FROM public.profiles p WHERE p.id=private.self_profile_id() AND p.status='active';
$$;
CREATE FUNCTION private.member_id(org uuid) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT m.id FROM public.organization_memberships m JOIN public.organizations o ON o.id=m.organization_id
 WHERE m.organization_id=org AND m.profile_id=private.actor_profile_id() AND m.status='active' AND o.status='active';
$$;
CREATE FUNCTION private.org_admin(org uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(auth.jwt()->>'aal','')='aal2' AND EXISTS(
 SELECT 1 FROM public.organization_memberships m WHERE m.id=private.member_id(org) AND m.role='admin');
$$;
CREATE FUNCTION private.course_access(org uuid,course uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.courses c JOIN public.enrollments e ON e.organization_id=c.organization_id AND e.course_id=c.id
 WHERE c.organization_id=org AND c.id=course AND c.status='published'
 AND e.membership_id=private.member_id(org) AND e.status IN ('active','completed'));
$$;
CREATE FUNCTION private.lesson_access(org uuid,lesson uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.lessons l WHERE l.organization_id=org AND l.id=lesson AND l.status='published'
 AND private.course_access(org,l.course_id)
 AND (l.module_id IS NULL OR EXISTS(SELECT 1 FROM public.course_modules m WHERE m.organization_id=org AND m.course_id=l.course_id AND m.id=l.module_id AND m.status='published')));
$$;
CREATE FUNCTION private.material_access(org uuid,material uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.materials m WHERE m.organization_id=org AND m.id=material AND m.status='published'
 AND private.course_access(org,m.course_id) AND (m.lesson_id IS NULL OR private.lesson_access(org,m.lesson_id))
 AND (m.file_asset_id IS NULL OR EXISTS(SELECT 1 FROM public.file_assets f WHERE f.organization_id=org AND f.id=m.file_asset_id AND f.status='ready' AND f.purpose='course_material')));
$$;
CREATE FUNCTION private.event_access(org uuid,event uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.calendar_events e WHERE e.organization_id=org AND e.id=event AND e.status='scheduled'
 AND private.course_access(org,e.course_id) AND (e.lesson_id IS NULL OR private.lesson_access(org,e.lesson_id))
 AND EXISTS(SELECT 1 FROM public.calendar_event_attendees a WHERE a.organization_id=org AND a.event_id=e.id AND a.membership_id=private.member_id(org) AND a.status='active'));
$$;
CREATE FUNCTION private.certificate_access(org uuid,issue uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.certificate_issues c WHERE c.organization_id=org AND c.id=issue
 AND c.membership_id=private.member_id(org) AND c.status IN ('issued','revoked'));
$$;
CREATE FUNCTION private.asset_access(org uuid,asset uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.file_assets f WHERE f.organization_id=org AND f.id=asset AND f.status='ready'
 AND (private.org_admin(org) OR (private.member_id(org) IS NOT NULL AND (
 f.purpose='branding'
 OR (f.purpose='course_material' AND EXISTS(SELECT 1 FROM public.materials m WHERE m.organization_id=org AND m.file_asset_id=f.id AND private.material_access(org,m.id)))
 OR (f.purpose='certificate' AND EXISTS(SELECT 1 FROM public.certificate_issues c WHERE c.organization_id=org AND c.file_asset_id=f.id AND c.status='issued' AND private.certificate_access(org,c.id)))
 ))));
$$;
CREATE FUNCTION private.stamp_row() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.row_version IS DISTINCT FROM OLD.row_version THEN
   RAISE EXCEPTION 'Campos de sistema inmutables' USING ERRCODE='42501';
  END IF;
  IF to_jsonb(NEW)->'organization_id' IS DISTINCT FROM to_jsonb(OLD)->'organization_id' THEN
   RAISE EXCEPTION 'No se permite transferir el tenant' USING ERRCODE='42501';
  END IF;
  NEW.row_version:=OLD.row_version+1; NEW.created_at:=OLD.created_at;
 ELSE
  NEW.created_at:=clock_timestamp();NEW.row_version:=1;
 END IF;
 NEW.updated_at:=clock_timestamp();
 IF to_jsonb(NEW) ? 'organization_id' THEN
  actor:=private.member_id((to_jsonb(NEW)->>'organization_id')::uuid);
  IF TG_OP='INSERT' THEN NEW.created_by_membership_id:=actor;
  ELSE NEW.created_by_membership_id:=OLD.created_by_membership_id; END IF;
  NEW.updated_by_membership_id:=actor;
 END IF;
 RETURN NEW;
END;
$$;
CREATE FUNCTION private.validate_relations() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
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
  IF auth.uid() IS NOT NULL AND ((TG_OP='INSERT' AND NEW.status<>'draft') OR
   (TG_OP='UPDATE' AND NEW.status='issued' AND OLD.status<>'issued')) THEN
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
CREATE FUNCTION private.lock_organization() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM 1 FROM public.organizations WHERE id=coalesce(NEW.organization_id,OLD.organization_id) FOR UPDATE;
 RETURN coalesce(NEW,OLD);
END;
$$;
CREATE FUNCTION private.lock_profile_organizations() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM o.id FROM public.organizations o WHERE o.id IN(
 SELECT m.organization_id FROM public.organization_memberships m WHERE m.profile_id=OLD.id AND m.role='admin')
 ORDER BY o.id FOR UPDATE;
 RETURN coalesce(NEW,OLD);
END;
$$;
CREATE FUNCTION private.assert_organization_admin(org uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.organizations WHERE id=org AND status='active') AND NOT EXISTS(
 SELECT 1 FROM public.organization_memberships m JOIN public.profiles p ON p.id=m.profile_id
 WHERE m.organization_id=org AND m.role='admin' AND m.status='active' AND p.status='active' AND p.auth_user_id IS NOT NULL) THEN
  RAISE EXCEPTION 'Una organización activa requiere administrador vigente' USING ERRCODE='23514';
 END IF;
END;
$$;
CREATE FUNCTION private.check_admin_constraint() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid;
BEGIN
 IF TG_TABLE_NAME='organizations' THEN PERFORM private.assert_organization_admin(coalesce(NEW.id,OLD.id));
 ELSIF TG_TABLE_NAME='organization_memberships' THEN PERFORM private.assert_organization_admin(coalesce(NEW.organization_id,OLD.organization_id));
 ELSE
  FOR org IN SELECT DISTINCT m.organization_id FROM public.organization_memberships m WHERE m.profile_id=coalesce(NEW.id,OLD.id) LOOP
   PERFORM private.assert_organization_admin(org);
  END LOOP;
 END IF;
 RETURN NULL;
END;
$$;
CREATE FUNCTION private.lock_and_validate_attendee() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE evt public.calendar_events; a public.calendar_event_attendees;
BEGIN
 a:=coalesce(NEW,OLD);
 SELECT * INTO evt FROM public.calendar_events WHERE organization_id=a.organization_id AND id=a.event_id FOR UPDATE;
 IF TG_OP<>'DELETE' AND a.status='active' AND FOUND AND NOT EXISTS(
 SELECT 1 FROM public.organization_memberships m JOIN public.profiles p ON p.id=m.profile_id
 JOIN public.enrollments en ON en.organization_id=m.organization_id AND en.membership_id=m.id AND en.course_id=evt.course_id
 JOIN public.courses c ON c.organization_id=en.organization_id AND c.id=en.course_id
 WHERE m.organization_id=a.organization_id AND m.id=a.membership_id AND m.status='active' AND p.status='active'
 AND en.status IN ('active','completed') AND c.status='published') THEN
  RAISE EXCEPTION 'Asistente sin membresía o matrícula válida' USING ERRCODE='23514';
 END IF;
 RETURN coalesce(NEW,OLD);
END;
$$;
CREATE FUNCTION private.assert_event_attendees(event uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.calendar_events WHERE id=event AND status='scheduled') AND NOT EXISTS(
 SELECT 1 FROM public.calendar_event_attendees WHERE event_id=event AND status='active') THEN
  RAISE EXCEPTION 'Evento programado sin asistentes activos' USING ERRCODE='23514';
 END IF;
END;
$$;
CREATE FUNCTION private.check_event_constraint() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_TABLE_NAME='calendar_events' THEN PERFORM private.assert_event_attendees(coalesce(NEW.id,OLD.id));
 ELSE PERFORM private.assert_event_attendees(coalesce(NEW.event_id,OLD.event_id)); END IF;
 RETURN NULL;
END;
$$;
CREATE FUNCTION private.audit_row() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE row_data jsonb; changed_fields jsonb;
BEGIN
 row_data:=to_jsonb(coalesce(NEW,OLD));
 SELECT coalesce(jsonb_agg(key ORDER BY key),'[]') INTO changed_fields FROM jsonb_object_keys(row_data) s(key)
 WHERE key NOT IN ('updated_at','row_version') AND (TG_OP<>'UPDATE' OR row_data->key IS DISTINCT FROM to_jsonb(OLD)->key);
 INSERT INTO public.audit_events(organization_id,actor_profile_id,actor_kind,action,entity_type,entity_id,changes)
 VALUES((row_data->>'organization_id')::uuid,private.actor_profile_id(),
 CASE WHEN auth.uid() IS NOT NULL THEN 'user' WHEN TG_TABLE_SCHEMA='private' THEN 'importer' ELSE 'operator' END,
 TG_OP,TG_TABLE_SCHEMA||'.'||TG_TABLE_NAME,(row_data->>'id')::uuid,
 jsonb_build_object('changed_fields',changed_fields,'previous_status',CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD)->>'status' END,'status',row_data->>'status'));
 RETURN NULL;
END;
$$;
CREATE FUNCTION private.audit_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'Auditoría append-only' USING ERRCODE='42501'; END;
$$;
CREATE TRIGGER audit_immutable BEFORE UPDATE OR DELETE ON public.audit_events FOR EACH ROW EXECUTE FUNCTION private.audit_immutable();
CREATE TRIGGER memberships_lock_org BEFORE INSERT OR UPDATE OR DELETE ON public.organization_memberships FOR EACH ROW EXECUTE FUNCTION private.lock_organization();
CREATE TRIGGER profiles_lock_org BEFORE UPDATE OR DELETE ON public.profiles FOR EACH ROW EXECUTE FUNCTION private.lock_profile_organizations();
CREATE CONSTRAINT TRIGGER organization_admin_required AFTER INSERT OR UPDATE ON public.organizations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private.check_admin_constraint();
CREATE CONSTRAINT TRIGGER membership_admin_required AFTER INSERT OR UPDATE OR DELETE ON public.organization_memberships DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private.check_admin_constraint();
CREATE CONSTRAINT TRIGGER profile_admin_required AFTER UPDATE OR DELETE ON public.profiles DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private.check_admin_constraint();
CREATE TRIGGER attendee_parent_lock BEFORE INSERT OR UPDATE OR DELETE ON public.calendar_event_attendees FOR EACH ROW EXECUTE FUNCTION private.lock_and_validate_attendee();
CREATE CONSTRAINT TRIGGER event_attendees_required AFTER INSERT OR UPDATE ON public.calendar_events DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private.check_event_constraint();
CREATE CONSTRAINT TRIGGER attendee_event_required AFTER INSERT OR UPDATE OR DELETE ON public.calendar_event_attendees DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private.check_event_constraint();
CREATE TRIGGER stamp_row BEFORE INSERT OR UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION private.stamp_row();
CREATE TRIGGER validate_relations BEFORE INSERT OR UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION private.validate_relations();
CREATE TRIGGER audit_row AFTER INSERT OR UPDATE OR DELETE ON public.organizations FOR EACH ROW EXECUTE FUNCTION private.audit_row();
CREATE TRIGGER stamp_row BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION private.stamp_row();
CREATE TRIGGER validate_relations BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION private.validate_relations();
CREATE TRIGGER audit_row AFTER INSERT OR UPDATE OR DELETE ON public.profiles FOR EACH ROW EXECUTE FUNCTION private.audit_row();
CREATE TRIGGER stamp_row BEFORE INSERT OR UPDATE ON public.organization_memberships FOR EACH ROW EXECUTE FUNCTION private.stamp_row();
CREATE TRIGGER validate_relations BEFORE INSERT OR UPDATE ON public.organization_memberships FOR EACH ROW EXECUTE FUNCTION private.validate_relations();
CREATE TRIGGER audit_row AFTER INSERT OR UPDATE OR DELETE ON public.organization_memberships FOR EACH ROW EXECUTE FUNCTION private.audit_row();
CREATE TRIGGER stamp_row BEFORE INSERT OR UPDATE ON public.courses FOR EACH ROW EXECUTE FUNCTION private.stamp_row();
CREATE TRIGGER validate_relations BEFORE INSERT OR UPDATE ON public.courses FOR EACH ROW EXECUTE FUNCTION private.validate_relations();
CREATE TRIGGER audit_row AFTER INSERT OR UPDATE OR DELETE ON public.courses FOR EACH ROW EXECUTE FUNCTION private.audit_row();
CREATE TRIGGER stamp_row BEFORE INSERT OR UPDATE ON public.file_assets FOR EACH ROW EXECUTE FUNCTION private.stamp_row();
CREATE TRIGGER validate_relations BEFORE INSERT OR UPDATE ON public.file_assets FOR EACH ROW EXECUTE FUNCTION private.validate_relations();
CREATE TRIGGER audit_row AFTER INSERT OR UPDATE OR DELETE ON public.file_assets FOR EACH ROW EXECUTE FUNCTION private.audit_row();
CREATE TRIGGER stamp_row BEFORE INSERT OR UPDATE ON public.course_modules FOR EACH ROW EXECUTE FUNCTION private.stamp_row();
CREATE TRIGGER validate_relations BEFORE INSERT OR UPDATE ON public.course_modules FOR EACH ROW EXECUTE FUNCTION private.validate_relations();
CREATE TRIGGER audit_row AFTER INSERT OR UPDATE OR DELETE ON public.course_modules FOR EACH ROW EXECUTE FUNCTION private.audit_row();
CREATE TRIGGER stamp_row BEFORE INSERT OR UPDATE ON public.lessons FOR EACH ROW EXECUTE FUNCTION private.stamp_row();
CREATE TRIGGER validate_relations BEFORE INSERT OR UPDATE ON public.lessons FOR EACH ROW EXECUTE FUNCTION private.validate_relations();
CREATE TRIGGER audit_row AFTER INSERT OR UPDATE OR DELETE ON public.lessons FOR EACH ROW EXECUTE FUNCTION private.audit_row();
CREATE TRIGGER stamp_row BEFORE INSERT OR UPDATE ON public.enrollments FOR EACH ROW EXECUTE FUNCTION private.stamp_row();
CREATE TRIGGER validate_relations BEFORE INSERT OR UPDATE ON public.enrollments FOR EACH ROW EXECUTE FUNCTION private.validate_relations();
CREATE TRIGGER audit_row AFTER INSERT OR UPDATE OR DELETE ON public.enrollments FOR EACH ROW EXECUTE FUNCTION private.audit_row();
CREATE TRIGGER stamp_row BEFORE INSERT OR UPDATE ON public.announcements FOR EACH ROW EXECUTE FUNCTION private.stamp_row();
CREATE TRIGGER validate_relations BEFORE INSERT OR UPDATE ON public.announcements FOR EACH ROW EXECUTE FUNCTION private.validate_relations();
CREATE TRIGGER audit_row AFTER INSERT OR UPDATE OR DELETE ON public.announcements FOR EACH ROW EXECUTE FUNCTION private.audit_row();
CREATE TRIGGER stamp_row BEFORE INSERT OR UPDATE ON public.materials FOR EACH ROW EXECUTE FUNCTION private.stamp_row();
CREATE TRIGGER validate_relations BEFORE INSERT OR UPDATE ON public.materials FOR EACH ROW EXECUTE FUNCTION private.validate_relations();
CREATE TRIGGER audit_row AFTER INSERT OR UPDATE OR DELETE ON public.materials FOR EACH ROW EXECUTE FUNCTION private.audit_row();
CREATE TRIGGER stamp_row BEFORE INSERT OR UPDATE ON public.calendar_events FOR EACH ROW EXECUTE FUNCTION private.stamp_row();
CREATE TRIGGER validate_relations BEFORE INSERT OR UPDATE ON public.calendar_events FOR EACH ROW EXECUTE FUNCTION private.validate_relations();
CREATE TRIGGER audit_row AFTER INSERT OR UPDATE OR DELETE ON public.calendar_events FOR EACH ROW EXECUTE FUNCTION private.audit_row();
CREATE TRIGGER stamp_row BEFORE INSERT OR UPDATE ON public.calendar_event_attendees FOR EACH ROW EXECUTE FUNCTION private.stamp_row();
CREATE TRIGGER validate_relations BEFORE INSERT OR UPDATE ON public.calendar_event_attendees FOR EACH ROW EXECUTE FUNCTION private.validate_relations();
CREATE TRIGGER audit_row AFTER INSERT OR UPDATE OR DELETE ON public.calendar_event_attendees FOR EACH ROW EXECUTE FUNCTION private.audit_row();
CREATE TRIGGER stamp_row BEFORE INSERT OR UPDATE ON public.certificate_issues FOR EACH ROW EXECUTE FUNCTION private.stamp_row();
CREATE TRIGGER validate_relations BEFORE INSERT OR UPDATE ON public.certificate_issues FOR EACH ROW EXECUTE FUNCTION private.validate_relations();
CREATE TRIGGER audit_row AFTER INSERT OR UPDATE OR DELETE ON public.certificate_issues FOR EACH ROW EXECUTE FUNCTION private.audit_row();
CREATE TRIGGER audit_row AFTER INSERT OR UPDATE OR DELETE ON private.migration_sources FOR EACH ROW EXECUTE FUNCTION private.audit_row();
CREATE TRIGGER audit_row AFTER INSERT OR UPDATE OR DELETE ON private.import_runs FOR EACH ROW EXECUTE FUNCTION private.audit_row();
CREATE TRIGGER audit_row AFTER INSERT OR UPDATE OR DELETE ON private.import_records FOR EACH ROW EXECUTE FUNCTION private.audit_row();
CREATE TRIGGER audit_row AFTER INSERT OR UPDATE OR DELETE ON private.import_issues FOR EACH ROW EXECUTE FUNCTION private.audit_row();
CREATE TRIGGER audit_row AFTER INSERT OR UPDATE OR DELETE ON private.legacy_id_map FOR EACH ROW EXECUTE FUNCTION private.audit_row();
CREATE TRIGGER audit_row AFTER INSERT OR UPDATE OR DELETE ON private.event_source_links FOR EACH ROW EXECUTE FUNCTION private.audit_row();
CREATE TRIGGER audit_row AFTER INSERT OR UPDATE OR DELETE ON private.identity_activation_requests FOR EACH ROW EXECUTE FUNCTION private.audit_row();
CREATE FUNCTION private.validate_activation_link() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.status='linked' AND NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=NEW.profile_id AND p.auth_user_id=NEW.auth_user_id AND p.status='active') THEN
  RAISE EXCEPTION 'La activación no coincide con el perfil verificado' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER activation_profile_match BEFORE INSERT OR UPDATE ON private.identity_activation_requests FOR EACH ROW EXECUTE FUNCTION private.validate_activation_link();
COMMIT;
