BEGIN;
CREATE FUNCTION private.require_admin(org uuid) RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN IF NOT private.org_admin(org) THEN RAISE EXCEPTION 'Permiso administrativo y MFA requeridos' USING ERRCODE='42501'; END IF; END;
$$;
CREATE FUNCTION private.validate_patch(patch jsonb,allowed text[]) RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
BEGIN
 IF patch IS NULL OR jsonb_typeof(patch)<>'object' OR patch='{}'::jsonb OR octet_length(patch::text)>200000 THEN
  RAISE EXCEPTION 'Patch vacío o inválido' USING ERRCODE='22023';
 END IF;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(patch) s(key) WHERE NOT (key=ANY(allowed))) THEN
  RAISE EXCEPTION 'Patch contiene campos no autorizados' USING ERRCODE='42501';
 END IF;
END;
$$;
CREATE FUNCTION public.update_course(p_organization_id uuid,p_id uuid,p_expected_version bigint,p_patch jsonb) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE original public.courses;candidate public.courses;result_version bigint;
BEGIN
 PERFORM private.require_admin(p_organization_id);
 PERFORM private.validate_patch(p_patch,ARRAY['title','description','tag','status','sort_order','price_amount','currency','declared_lesson_count','cover_asset_id']);
 SELECT * INTO original FROM public.courses WHERE organization_id=p_organization_id AND id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Recurso no disponible' USING ERRCODE='42501'; END IF;
 IF p_expected_version IS NULL OR original.row_version<>p_expected_version THEN RAISE EXCEPTION 'Conflicto de versión; vuelva a consultar' USING ERRCODE='40001'; END IF;
 candidate:=jsonb_populate_record(original,p_patch);
 
 UPDATE public.courses SET title=candidate.title,description=candidate.description,tag=candidate.tag,status=candidate.status,sort_order=candidate.sort_order,price_amount=candidate.price_amount,currency=candidate.currency,declared_lesson_count=candidate.declared_lesson_count,cover_asset_id=candidate.cover_asset_id WHERE organization_id=p_organization_id AND id=p_id RETURNING row_version INTO result_version;
 RETURN result_version;
END;
$$;
REVOKE ALL ON FUNCTION public.update_course(uuid,uuid,bigint,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.update_course(uuid,uuid,bigint,jsonb) TO authenticated;
CREATE FUNCTION public.update_course_module(p_organization_id uuid,p_id uuid,p_expected_version bigint,p_patch jsonb) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE original public.course_modules;candidate public.course_modules;result_version bigint;
BEGIN
 PERFORM private.require_admin(p_organization_id);
 PERFORM private.validate_patch(p_patch,ARRAY['title','sort_order','status']);
 SELECT * INTO original FROM public.course_modules WHERE organization_id=p_organization_id AND id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Recurso no disponible' USING ERRCODE='42501'; END IF;
 IF p_expected_version IS NULL OR original.row_version<>p_expected_version THEN RAISE EXCEPTION 'Conflicto de versión; vuelva a consultar' USING ERRCODE='40001'; END IF;
 candidate:=jsonb_populate_record(original,p_patch);
 
 UPDATE public.course_modules SET title=candidate.title,sort_order=candidate.sort_order,status=candidate.status WHERE organization_id=p_organization_id AND id=p_id RETURNING row_version INTO result_version;
 RETURN result_version;
END;
$$;
REVOKE ALL ON FUNCTION public.update_course_module(uuid,uuid,bigint,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.update_course_module(uuid,uuid,bigint,jsonb) TO authenticated;
CREATE FUNCTION public.update_lesson(p_organization_id uuid,p_id uuid,p_expected_version bigint,p_patch jsonb) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE original public.lessons;candidate public.lessons;result_version bigint;
BEGIN
 PERFORM private.require_admin(p_organization_id);
 PERFORM private.validate_patch(p_patch,ARRAY['module_id','title','description','video_url','live_url','duration_minutes','sort_order','status']);
 SELECT * INTO original FROM public.lessons WHERE organization_id=p_organization_id AND id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Recurso no disponible' USING ERRCODE='42501'; END IF;
 IF p_expected_version IS NULL OR original.row_version<>p_expected_version THEN RAISE EXCEPTION 'Conflicto de versión; vuelva a consultar' USING ERRCODE='40001'; END IF;
 candidate:=jsonb_populate_record(original,p_patch);
 
 UPDATE public.lessons SET module_id=candidate.module_id,title=candidate.title,description=candidate.description,video_url=candidate.video_url,live_url=candidate.live_url,duration_minutes=candidate.duration_minutes,sort_order=candidate.sort_order,status=candidate.status WHERE organization_id=p_organization_id AND id=p_id RETURNING row_version INTO result_version;
 RETURN result_version;
END;
$$;
REVOKE ALL ON FUNCTION public.update_lesson(uuid,uuid,bigint,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.update_lesson(uuid,uuid,bigint,jsonb) TO authenticated;
CREATE FUNCTION public.update_enrollment(p_organization_id uuid,p_id uuid,p_expected_version bigint,p_patch jsonb) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE original public.enrollments;candidate public.enrollments;result_version bigint;
BEGIN
 PERFORM private.require_admin(p_organization_id);
 PERFORM private.validate_patch(p_patch,ARRAY['status','progress_percent','completed_at']);
 SELECT * INTO original FROM public.enrollments WHERE organization_id=p_organization_id AND id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Recurso no disponible' USING ERRCODE='42501'; END IF;
 IF p_expected_version IS NULL OR original.row_version<>p_expected_version THEN RAISE EXCEPTION 'Conflicto de versión; vuelva a consultar' USING ERRCODE='40001'; END IF;
 candidate:=jsonb_populate_record(original,p_patch);
 
 UPDATE public.enrollments SET status=candidate.status,progress_percent=candidate.progress_percent,completed_at=candidate.completed_at WHERE organization_id=p_organization_id AND id=p_id RETURNING row_version INTO result_version;
 RETURN result_version;
END;
$$;
REVOKE ALL ON FUNCTION public.update_enrollment(uuid,uuid,bigint,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.update_enrollment(uuid,uuid,bigint,jsonb) TO authenticated;
CREATE FUNCTION public.update_announcement(p_organization_id uuid,p_id uuid,p_expected_version bigint,p_patch jsonb) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE original public.announcements;candidate public.announcements;result_version bigint;
BEGIN
 PERFORM private.require_admin(p_organization_id);
 PERFORM private.validate_patch(p_patch,ARRAY['title','body','published_at','status']);
 SELECT * INTO original FROM public.announcements WHERE organization_id=p_organization_id AND id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Recurso no disponible' USING ERRCODE='42501'; END IF;
 IF p_expected_version IS NULL OR original.row_version<>p_expected_version THEN RAISE EXCEPTION 'Conflicto de versión; vuelva a consultar' USING ERRCODE='40001'; END IF;
 candidate:=jsonb_populate_record(original,p_patch);
 
 UPDATE public.announcements SET title=candidate.title,body=candidate.body,published_at=candidate.published_at,status=candidate.status WHERE organization_id=p_organization_id AND id=p_id RETURNING row_version INTO result_version;
 RETURN result_version;
END;
$$;
REVOKE ALL ON FUNCTION public.update_announcement(uuid,uuid,bigint,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.update_announcement(uuid,uuid,bigint,jsonb) TO authenticated;
CREATE FUNCTION public.update_material(p_organization_id uuid,p_id uuid,p_expected_version bigint,p_patch jsonb) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE original public.materials;candidate public.materials;result_version bigint;
BEGIN
 PERFORM private.require_admin(p_organization_id);
 PERFORM private.validate_patch(p_patch,ARRAY['lesson_id','title','external_url','file_asset_id','sort_order','status']);
 SELECT * INTO original FROM public.materials WHERE organization_id=p_organization_id AND id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Recurso no disponible' USING ERRCODE='42501'; END IF;
 IF p_expected_version IS NULL OR original.row_version<>p_expected_version THEN RAISE EXCEPTION 'Conflicto de versión; vuelva a consultar' USING ERRCODE='40001'; END IF;
 candidate:=jsonb_populate_record(original,p_patch);
 
 UPDATE public.materials SET lesson_id=candidate.lesson_id,title=candidate.title,external_url=candidate.external_url,file_asset_id=candidate.file_asset_id,sort_order=candidate.sort_order,status=candidate.status WHERE organization_id=p_organization_id AND id=p_id RETURNING row_version INTO result_version;
 RETURN result_version;
END;
$$;
REVOKE ALL ON FUNCTION public.update_material(uuid,uuid,bigint,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.update_material(uuid,uuid,bigint,jsonb) TO authenticated;
CREATE FUNCTION public.update_calendar_event(p_organization_id uuid,p_id uuid,p_expected_version bigint,p_patch jsonb) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE original public.calendar_events;candidate public.calendar_events;result_version bigint;
BEGIN
 PERFORM private.require_admin(p_organization_id);
 PERFORM private.validate_patch(p_patch,ARRAY['lesson_id','title','module_label','starts_at','ends_at','timezone','color_key','status']);
 SELECT * INTO original FROM public.calendar_events WHERE organization_id=p_organization_id AND id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Recurso no disponible' USING ERRCODE='42501'; END IF;
 IF p_expected_version IS NULL OR original.row_version<>p_expected_version THEN RAISE EXCEPTION 'Conflicto de versión; vuelva a consultar' USING ERRCODE='40001'; END IF;
 candidate:=jsonb_populate_record(original,p_patch);
 
 UPDATE public.calendar_events SET lesson_id=candidate.lesson_id,title=candidate.title,module_label=candidate.module_label,starts_at=candidate.starts_at,ends_at=candidate.ends_at,timezone=candidate.timezone,color_key=candidate.color_key,status=candidate.status WHERE organization_id=p_organization_id AND id=p_id RETURNING row_version INTO result_version;
 RETURN result_version;
END;
$$;
REVOKE ALL ON FUNCTION public.update_calendar_event(uuid,uuid,bigint,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.update_calendar_event(uuid,uuid,bigint,jsonb) TO authenticated;
CREATE FUNCTION public.update_file_asset(p_organization_id uuid,p_id uuid,p_expected_version bigint,p_patch jsonb) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE original public.file_assets;candidate public.file_assets;result_version bigint;
BEGIN
 PERFORM private.require_admin(p_organization_id);
 PERFORM private.validate_patch(p_patch,ARRAY['status']);
 SELECT * INTO original FROM public.file_assets WHERE organization_id=p_organization_id AND id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Recurso no disponible' USING ERRCODE='42501'; END IF;
 IF p_expected_version IS NULL OR original.row_version<>p_expected_version THEN RAISE EXCEPTION 'Conflicto de versión; vuelva a consultar' USING ERRCODE='40001'; END IF;
 candidate:=jsonb_populate_record(original,p_patch);
 IF candidate.status NOT IN ('archived','failed') THEN RAISE EXCEPTION 'Finalización de archivos reservada al verificador de Storage' USING ERRCODE='42501'; END IF;
 UPDATE public.file_assets SET status=candidate.status WHERE organization_id=p_organization_id AND id=p_id RETURNING row_version INTO result_version;
 RETURN result_version;
END;
$$;
REVOKE ALL ON FUNCTION public.update_file_asset(uuid,uuid,bigint,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.update_file_asset(uuid,uuid,bigint,jsonb) TO authenticated;
CREATE FUNCTION public.update_certificate_issue(p_organization_id uuid,p_id uuid,p_expected_version bigint,p_patch jsonb) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE original public.certificate_issues;candidate public.certificate_issues;result_version bigint;
BEGIN
 PERFORM private.require_admin(p_organization_id);
 PERFORM private.validate_patch(p_patch,ARRAY['status','snapshot','file_asset_id']);
 SELECT * INTO original FROM public.certificate_issues WHERE organization_id=p_organization_id AND id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Recurso no disponible' USING ERRCODE='42501'; END IF;
 IF p_expected_version IS NULL OR original.row_version<>p_expected_version THEN RAISE EXCEPTION 'Conflicto de versión; vuelva a consultar' USING ERRCODE='40001'; END IF;
 candidate:=jsonb_populate_record(original,p_patch);
 
 UPDATE public.certificate_issues SET status=candidate.status,snapshot=candidate.snapshot,file_asset_id=candidate.file_asset_id WHERE organization_id=p_organization_id AND id=p_id RETURNING row_version INTO result_version;
 RETURN result_version;
END;
$$;
REVOKE ALL ON FUNCTION public.update_certificate_issue(uuid,uuid,bigint,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.update_certificate_issue(uuid,uuid,bigint,jsonb) TO authenticated;
CREATE FUNCTION public.update_student_contact(p_organization_id uuid,p_id uuid,p_expected_version bigint,p_patch jsonb) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE original public.organization_memberships;candidate public.organization_memberships;result_version bigint;
BEGIN
 PERFORM private.require_admin(p_organization_id);
 PERFORM private.validate_patch(p_patch,ARRAY['first_name','last_name','contact_email']);
 SELECT * INTO original FROM public.organization_memberships WHERE organization_id=p_organization_id AND id=p_id AND role='student' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Recurso no disponible' USING ERRCODE='42501'; END IF;
 IF p_expected_version IS NULL OR original.row_version<>p_expected_version THEN RAISE EXCEPTION 'Conflicto de versión; vuelva a consultar' USING ERRCODE='40001'; END IF;
 candidate:=jsonb_populate_record(original,p_patch);
 
 UPDATE public.organization_memberships SET first_name=candidate.first_name,last_name=candidate.last_name,contact_email=candidate.contact_email WHERE organization_id=p_organization_id AND id=p_id RETURNING row_version INTO result_version;
 RETURN result_version;
END;
$$;
REVOKE ALL ON FUNCTION public.update_student_contact(uuid,uuid,bigint,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.update_student_contact(uuid,uuid,bigint,jsonb) TO authenticated;
CREATE FUNCTION public.set_student_status(p_organization_id uuid,p_id uuid,p_expected_version bigint,p_patch jsonb) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE original public.organization_memberships;candidate public.organization_memberships;result_version bigint;
BEGIN
 PERFORM private.require_admin(p_organization_id);
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
REVOKE ALL ON FUNCTION public.set_student_status(uuid,uuid,bigint,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.set_student_status(uuid,uuid,bigint,jsonb) TO authenticated;
CREATE FUNCTION public.create_scheduled_event(p_organization_id uuid,p_event jsonb,p_membership_ids uuid[]) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE candidate public.calendar_events;event_id uuid;
BEGIN
 PERFORM private.require_admin(p_organization_id);
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
CREATE FUNCTION public.replace_event_attendees(p_organization_id uuid,p_event_id uuid,p_expected_version bigint,p_membership_ids uuid[]) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE original public.calendar_events;v uuid;result_version bigint;
BEGIN
 PERFORM private.require_admin(p_organization_id);
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
REVOKE ALL ON FUNCTION public.create_scheduled_event(uuid,jsonb,uuid[]),public.replace_event_attendees(uuid,uuid,bigint,uuid[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_scheduled_event(uuid,jsonb,uuid[]),public.replace_event_attendees(uuid,uuid,bigint,uuid[]) TO authenticated;
REVOKE EXECUTE ON FUNCTION private.require_admin(uuid),private.validate_patch(jsonb,text[]) FROM PUBLIC,anon,authenticated;

-- Los buckets se provisionarán mediante la API Storage, con autorización posterior.
-- Las migraciones no escriben metadatos en esquemas administrados.
CREATE FUNCTION private.storage_read_allowed(bucket text,object_name text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.file_assets f WHERE f.bucket_name=bucket AND f.object_path=object_name AND private.asset_access(f.organization_id,f.id));
$$;
REVOKE ALL ON FUNCTION private.storage_read_allowed(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.storage_read_allowed(text,text) TO authenticated;
CREATE POLICY project_assets_select ON storage.objects FOR SELECT TO authenticated USING(private.storage_read_allowed(bucket_id,name));
CREATE POLICY project_assets_guard ON storage.objects AS RESTRICTIVE FOR SELECT TO authenticated USING(private.storage_read_allowed(bucket_id,name));
CREATE POLICY project_assets_anon_guard ON storage.objects AS RESTRICTIVE FOR SELECT TO anon USING(false);
CREATE POLICY project_assets_insert_guard ON storage.objects AS RESTRICTIVE FOR INSERT TO anon,authenticated WITH CHECK(false);
CREATE POLICY project_assets_update_guard ON storage.objects AS RESTRICTIVE FOR UPDATE TO anon,authenticated USING(false) WITH CHECK(false);
CREATE POLICY project_assets_delete_guard ON storage.objects AS RESTRICTIVE FOR DELETE TO anon,authenticated USING(false);
-- No se habilitan uploads/mutaciones mediante roles de aplicación en esta fase.
COMMIT;
