-- V2 institucional; no aprobado ni ejecutado en Cloud.
-- PROPUESTA CLOUD: NO AUTORIZADA NI EJECUTADA. No es una migración.
-- Requiere transacción dedicada SERIALIZABLE, manifiesto completo y atestación externa de destino/aprobación.
-- La referencia de un GUC es una comprobación de coherencia, no una prueba criptográfica de la conexión.
DO $qa$
DECLARE
 envelope jsonb := nullif(current_setting('qa.institutional_manifest',true),'')::jsonb;
 p jsonb; person jsonb; o jsonb; all_ids uuid[]; auth_ids uuid[];
 op uuid; org uuid; expected_hash text; actual_hash text;
 marker public.audit_events; applied boolean; contract jsonb; evidence jsonb;
 affected integer; keys_actual text[]; keys_expected text[];
BEGIN
 SET LOCAL search_path=pg_catalog;
 -- Las firmas de timestamptz deben ser estables entre sesiones del operador.
 SET LOCAL TimeZone='UTC';
 SET LOCAL DateStyle='ISO, YMD';
 IF current_setting('transaction_isolation') <> 'serializable'
 OR current_setting('transaction_read_only') <> 'off'
 OR current_setting('row_security') <> 'on'
 OR current_setting('session_replication_role') <> 'origin'
 OR auth.uid() IS NOT NULL THEN
  RAISE EXCEPTION 'Contexto de operador Cloud inválido' USING ERRCODE='42501';
 END IF;
 IF current_setting('server_version_num')::integer <> 170011 OR current_user <> 'postgres' THEN
  RAISE EXCEPTION 'Se requiere PostgreSQL Cloud 17.11 y operador postgres revisados' USING ERRCODE='42501';
 END IF;
 IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE (n.nspname,c.relname) IN (('public','organizations'),('public','profiles'),
 ('public','organization_memberships'),('public','audit_events'),('private','identity_activation_requests'))
 AND c.relrowsecurity) <> 5
 OR EXISTS(SELECT 1 FROM pg_trigger t WHERE t.tgrelid IN
 ('public.organizations'::regclass,'public.profiles'::regclass,'public.organization_memberships'::regclass,
 'public.audit_events'::regclass,'private.identity_activation_requests'::regclass)
 AND NOT t.tgisinternal AND t.tgenabled NOT IN ('O','A')) THEN
  RAISE EXCEPTION 'RLS o triggers no disponibles' USING ERRCODE='42501';
 END IF;
 IF (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE (n.nspname,c.relname,t.tgname) IN (
 ('public','organizations','stamp_row'),('public','organizations','validate_relations'),('public','organizations','audit_row'),('public','organizations','organization_admin_required'),
 ('public','profiles','stamp_row'),('public','profiles','validate_relations'),('public','profiles','audit_row'),('public','profiles','profiles_lock_org'),('public','profiles','profile_admin_required'),
 ('public','organization_memberships','stamp_row'),('public','organization_memberships','validate_relations'),('public','organization_memberships','audit_row'),('public','organization_memberships','memberships_lock_org'),('public','organization_memberships','membership_admin_required'),
 ('private','identity_activation_requests','activation_profile_match'),('private','identity_activation_requests','audit_row'),('public','audit_events','audit_immutable'))
 AND t.tgenabled IN ('O','A')) <> 17 THEN
  RAISE EXCEPTION 'Faltan triggers del contrato aprobado' USING ERRCODE='42501';
 END IF;
 IF jsonb_typeof(envelope) IS DISTINCT FROM 'object'
 OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(envelope) k)
 IS DISTINCT FROM ARRAY['payload','payload_sha256']::text[] THEN
  RAISE EXCEPTION 'Envelope de aprobación inválido' USING ERRCODE='22023';
 END IF;
 p:=envelope->'payload';
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' THEN
  RAISE EXCEPTION 'Manifiesto inválido' USING ERRCODE='22023';
 END IF;
 SELECT array_agg(k ORDER BY k) INTO keys_actual FROM jsonb_object_keys(p) k;
 SELECT array_agg(k ORDER BY k) INTO keys_expected FROM unnest(ARRAY[
 'version','scope','approval_state','project_ref','approval_ref','operator_ref','operation_id','organization','people']) k;
 IF keys_actual IS DISTINCT FROM keys_expected
 OR p->'version' IS DISTINCT FROM '2'::jsonb
 OR p->>'scope' IS DISTINCT FROM 'cloud_qa_institutional'
 OR p->>'approval_state' IS DISTINCT FROM 'approved'
 OR p->>'project_ref' IS DISTINCT FROM 'rnxgrunnrdlgjsbsrjev'
 OR jsonb_typeof(p->'approval_ref') IS DISTINCT FROM 'string'
 OR jsonb_typeof(p->'operator_ref') IS DISTINCT FROM 'string'
 OR length(btrim(p->>'approval_ref')) NOT BETWEEN 1 AND 100
 OR length(btrim(p->>'operator_ref')) NOT BETWEEN 1 AND 100 THEN
  RAISE EXCEPTION 'Aprobación Cloud incompleta o no permitida' USING ERRCODE='22023';
 END IF;
 actual_hash:=encode(sha256(convert_to(p::text,'UTF8')),'hex');
 expected_hash:=envelope->>'payload_sha256';
 IF jsonb_typeof(envelope->'payload_sha256') IS DISTINCT FROM 'string'
 OR expected_hash !~ '^[0-9a-f]{64}$' OR expected_hash IS DISTINCT FROM actual_hash THEN
  RAISE EXCEPTION 'Huella del manifiesto no coincide' USING ERRCODE='22023';
 END IF;
 IF current_setting('qa.cloud_verified_project_ref',true) IS DISTINCT FROM 'rnxgrunnrdlgjsbsrjev'
 OR current_setting('qa.cloud_authorized_operation',true) IS DISTINCT FROM p->>'operation_id'
 OR current_setting('qa.cloud_authorized_sha256',true) IS DISTINCT FROM actual_hash THEN
  RAISE EXCEPTION 'Falta atestación externa de destino y autorización exacta' USING ERRCODE='42501';
 END IF;
 IF p#>>'{people,0,auth_user_id}' IS DISTINCT FROM '6cabd8d2-55d0-401c-b4f6-a20040215134'
 OR p#>>'{people,1,auth_user_id}' IS DISTINCT FROM '55d355b9-21d7-46af-8d6d-650a528743eb' THEN
  RAISE EXCEPTION 'UUID y roles no corresponden al lote elegido' USING ERRCODE='22023';
 END IF;

 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='private.identity_activation_requests'::regclass AND tgname='institutional_activation_guard' AND tgenabled IN ('O','A'))
 OR NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='private.identity_activation_requests'::regclass AND conname='activation_institutional_contract' AND convalidated) THEN
 RAISE EXCEPTION 'Contrato institucional pendiente' USING ERRCODE='42501'; END IF;
 IF p#>>'{people,0,login_identifier}' IS DISTINCT FROM 'u-000002@cuentas.sistema-alumnos.invalid'
 OR p#>>'{people,1,login_identifier}' IS DISTINCT FROM 'u-000001@cuentas.sistema-alumnos.invalid' THEN
 RAISE EXCEPTION 'Identificadores contradictorios' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM public.profiles WHERE auth_user_id IN ('db59e5dd-1810-4627-bb45-4c7efc242a8c'::uuid,'9eeeb988-f329-439d-b4b4-0f54cc1318d7'::uuid,'6d8c8f78-1d3b-43b5-8eb0-638e9d0cd8fa'::uuid))
 OR EXISTS(SELECT 1 FROM private.identity_activation_requests WHERE auth_user_id IN ('db59e5dd-1810-4627-bb45-4c7efc242a8c'::uuid,'9eeeb988-f329-439d-b4b4-0f54cc1318d7'::uuid,'6d8c8f78-1d3b-43b5-8eb0-638e9d0cd8fa'::uuid)) THEN
 RAISE EXCEPTION 'Identidad anterior vinculada' USING ERRCODE='23505'; END IF;
 o:=p->'organization';
 IF jsonb_typeof(o) IS DISTINCT FROM 'object' THEN
  RAISE EXCEPTION 'Organización inválida' USING ERRCODE='22023';
 END IF;
 SELECT array_agg(k ORDER BY k) INTO keys_actual FROM jsonb_object_keys(o) k;
 IF keys_actual IS DISTINCT FROM ARRAY['id','name','slug','timezone']::text[]
 OR jsonb_typeof(o->'slug') IS DISTINCT FROM 'string'
 OR (o->>'slug') !~ '^qa-[a-z0-9]+(-[a-z0-9]+)*$'
 OR length(o->>'slug') > 100
 OR jsonb_typeof(o->'name') IS DISTINCT FROM 'string'
 OR length(btrim(o->>'name')) NOT BETWEEN 1 AND 500
 OR jsonb_typeof(o->'timezone') IS DISTINCT FROM 'string'
 OR NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=o->>'timezone') THEN
  RAISE EXCEPTION 'Contrato de organización QA inválido' USING ERRCODE='22023';
 END IF;
 IF jsonb_typeof(p->'people') IS DISTINCT FROM 'array' OR jsonb_array_length(p->'people') <> 2 THEN
  RAISE EXCEPTION 'Se requieren exactamente dos personas' USING ERRCODE='22023';
 END IF;
 IF p#>>'{people,0,role}' IS DISTINCT FROM 'admin' OR p#>>'{people,1,role}' IS DISTINCT FROM 'student' THEN
  RAISE EXCEPTION 'Roles explícitos admin y student requeridos en ese orden' USING ERRCODE='22023';
 END IF;
 -- UUID canónico, distinto y no nulo; no adjudica ninguna identidad real.
 FOR person IN SELECT value FROM jsonb_array_elements(jsonb_build_array(p->'operation_id',o->'id'))
 LOOP
  IF jsonb_typeof(person) IS DISTINCT FROM 'string'
  OR (person#>>'{}') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  OR person#>>'{}' = '00000000-0000-0000-0000-000000000000' THEN
   RAISE EXCEPTION 'UUID inválido' USING ERRCODE='22023';
  END IF;
 END LOOP;
 op:=(p->>'operation_id')::uuid; org:=(o->>'id')::uuid;
 all_ids:=ARRAY[op,org]; auth_ids:=ARRAY[]::uuid[];
 FOR person IN SELECT value FROM jsonb_array_elements(p->'people') LOOP
  IF jsonb_typeof(person) IS DISTINCT FROM 'object' THEN
   RAISE EXCEPTION 'Persona inválida' USING ERRCODE='22023';
  END IF;
  SELECT array_agg(k ORDER BY k) INTO keys_actual FROM jsonb_object_keys(person) k;
  SELECT array_agg(k ORDER BY k) INTO keys_expected FROM unnest(ARRAY['auth_user_id','profile_id','membership_id',
  'activation_request_id','idempotency_key','role','display_name','first_name','last_name','login_identifier','assignment_verified_at','assignment_by_ref','assignment_evidence_ref','mailbox_status']) k;
  IF keys_actual IS DISTINCT FROM keys_expected THEN
   RAISE EXCEPTION 'Campos de persona inesperados o ausentes' USING ERRCODE='22023';
  END IF;
  FOR keys_actual IN SELECT ARRAY[k,person->>k] FROM unnest(ARRAY['auth_user_id','profile_id','membership_id',
   'activation_request_id','idempotency_key']) k LOOP
   IF jsonb_typeof(person->keys_actual[1]) IS DISTINCT FROM 'string'
   OR keys_actual[2] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   OR keys_actual[2]='00000000-0000-0000-0000-000000000000' THEN
    RAISE EXCEPTION 'UUID de persona inválido' USING ERRCODE='22023';
   END IF;
   all_ids:=array_append(all_ids,keys_actual[2]::uuid);
  END LOOP;
  auth_ids:=array_append(auth_ids,(person->>'auth_user_id')::uuid);
  IF jsonb_typeof(person->'first_name') IS DISTINCT FROM 'string'
  OR length(btrim(person->>'first_name')) NOT BETWEEN 1 AND 100
  OR jsonb_typeof(person->'last_name') IS DISTINCT FROM 'string'
  OR length(person->>'last_name') > 100
  OR jsonb_typeof(person->'display_name') IS DISTINCT FROM 'string'
  OR length(btrim(person->>'display_name')) NOT BETWEEN 1 AND 200
  OR jsonb_typeof(person->'login_identifier') IS DISTINCT FROM 'string'
  OR length(person->>'login_identifier') > 254
  OR (person->>'login_identifier') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  OR jsonb_typeof(person->'assignment_verified_at') IS DISTINCT FROM 'string'
  OR (person->>'assignment_verified_at') !~ 'T.*(Z|[+-][0-9]{2}:[0-9]{2})$' THEN
   RAISE EXCEPTION 'Datos o verificación de persona inválidos' USING ERRCODE='22023';
  END IF;

  IF person->>'mailbox_status' IS DISTINCT FROM 'not_applicable'
  OR jsonb_typeof(person->'assignment_by_ref') IS DISTINCT FROM 'string'
  OR length(btrim(person->>'assignment_by_ref')) NOT BETWEEN 1 AND 100
  OR jsonb_typeof(person->'assignment_evidence_ref') IS DISTINCT FROM 'string'
  OR length(btrim(person->>'assignment_evidence_ref')) NOT BETWEEN 1 AND 200 THEN
  RAISE EXCEPTION 'Evidencia institucional pendiente' USING ERRCODE='22023'; END IF;
  IF (person->>'assignment_verified_at')::timestamptz > transaction_timestamp() THEN
   RAISE EXCEPTION 'No se acepta verificación futura' USING ERRCODE='22023';
  END IF;
 END LOOP;
 IF cardinality(all_ids) <> 12 OR (SELECT count(DISTINCT x) FROM unnest(all_ids) x) <> 12 THEN
  RAISE EXCEPTION 'UUID duplicados en el manifiesto' USING ERRCODE='22023';
 END IF;
 IF (SELECT count(*) FROM auth.users WHERE id=ANY(auth_ids)) <> 2 THEN
  RAISE EXCEPTION 'Identidades FK no disponibles; no crear cuentas desde SQL' USING ERRCODE='23503';
 END IF;
 -- Lecturas mínimas de Auth; no contraseñas, tokens o metadata completa.
 FOR person IN SELECT value FROM jsonb_array_elements(p->'people') LOOP
  IF NOT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=(person->>'auth_user_id')::uuid
   AND lower(btrim(u.email))=lower(btrim(person->>'login_identifier'))
   AND u.email_confirmed_at IS NOT NULL AND NOT coalesce(u.is_anonymous,true)
   AND u.deleted_at IS NULL AND (u.banned_until IS NULL OR u.banned_until<=current_timestamp)) THEN
   RAISE EXCEPTION 'Estado o contacto de cuenta Auth no coincide con lo verificado' USING ERRCODE='42501';
  END IF;
 END LOOP;
 SELECT * INTO marker FROM public.audit_events WHERE id=op FOR UPDATE;
 applied:=FOUND;
 IF applied THEN
  IF marker.request_id IS DISTINCT FROM op OR marker.organization_id IS DISTINCT FROM org
  OR marker.actor_kind <> 'operator' OR marker.actor_profile_id IS NOT NULL
  OR marker.action <> 'INSERT' OR marker.entity_type <> 'qa.provisioning'
  OR marker.entity_id IS DISTINCT FROM org OR marker.import_run_id IS NOT NULL
  OR marker.changes->>'manifest_sha256' IS DISTINCT FROM actual_hash
  OR marker.changes->>'approval_ref' IS DISTINCT FROM p->>'approval_ref'
  OR marker.changes->>'operator_ref' IS DISTINCT FROM p->>'operator_ref' THEN
   RAISE EXCEPTION 'Marcador o aprobación contradictorios' USING ERRCODE='55000';
  END IF;
 ELSE
  IF EXISTS(SELECT 1 FROM public.organizations WHERE id=ANY(all_ids) OR slug=o->>'slug')
  OR EXISTS(SELECT 1 FROM public.profiles WHERE id=ANY(all_ids) OR auth_user_id=ANY(auth_ids))
  OR EXISTS(SELECT 1 FROM public.organization_memberships WHERE id=ANY(all_ids))
  OR EXISTS(SELECT 1 FROM public.audit_events WHERE id=ANY(all_ids))
  OR EXISTS(SELECT 1 FROM private.identity_activation_requests WHERE id=ANY(all_ids)
   OR idempotency_key=ANY(all_ids) OR auth_user_id=ANY(auth_ids)) THEN
   RAISE EXCEPTION 'Colisión o identidad previamente adjudicada; no se adopta estado parcial' USING ERRCODE='23505';
  END IF;
  INSERT INTO public.organizations(id,slug,name,status,timezone)
  VALUES(org,o->>'slug',o->>'name','suspended',o->>'timezone');
  FOR person IN SELECT value FROM jsonb_array_elements(p->'people') LOOP
   INSERT INTO public.profiles(id,display_name,status)
   VALUES((person->>'profile_id')::uuid,person->>'display_name','pending');
   INSERT INTO public.organization_memberships(id,organization_id,profile_id,role,status,first_name,last_name)
   VALUES((person->>'membership_id')::uuid,org,(person->>'profile_id')::uuid,person->>'role','invited',
    person->>'first_name',person->>'last_name');
   INSERT INTO private.identity_activation_requests(id,organization_id,profile_id,membership_id,
   proposed_verified_contact,status,auth_user_id,idempotency_key,verified_at,verification_kind,login_identifier,verified_by_ref,verification_evidence_ref)
   VALUES((person->>'activation_request_id')::uuid,org,(person->>'profile_id')::uuid,
   (person->>'membership_id')::uuid,NULL,'verified',(person->>'auth_user_id')::uuid,
   (person->>'idempotency_key')::uuid,(person->>'assignment_verified_at')::timestamptz,'institutional_assignment',person->>'login_identifier',person->>'assignment_by_ref',person->>'assignment_evidence_ref');
   UPDATE public.profiles SET auth_user_id=(person->>'auth_user_id')::uuid,status='active'
   WHERE id=(person->>'profile_id')::uuid AND row_version=1 AND status='pending' AND auth_user_id IS NULL;
   GET DIAGNOSTICS affected=ROW_COUNT;
   IF affected<>1 THEN RAISE EXCEPTION 'Versión inesperada de perfil' USING ERRCODE='40001'; END IF;
   UPDATE public.organization_memberships SET status='active',joined_at=transaction_timestamp()
   WHERE id=(person->>'membership_id')::uuid AND organization_id=org AND profile_id=(person->>'profile_id')::uuid
   AND role=person->>'role' AND status='invited' AND row_version=1;
   GET DIAGNOSTICS affected=ROW_COUNT;
   IF affected<>1 THEN RAISE EXCEPTION 'Versión inesperada de membresía' USING ERRCODE='40001'; END IF;
   UPDATE private.identity_activation_requests SET status='linked',linked_at=transaction_timestamp()
   WHERE id=(person->>'activation_request_id')::uuid AND organization_id=org
   AND profile_id=(person->>'profile_id')::uuid AND membership_id=(person->>'membership_id')::uuid
   AND auth_user_id=(person->>'auth_user_id')::uuid AND idempotency_key=(person->>'idempotency_key')::uuid AND status='verified';
   GET DIAGNOSTICS affected=ROW_COUNT;
   IF affected<>1 THEN RAISE EXCEPTION 'Solicitud inesperada' USING ERRCODE='40001'; END IF;
  END LOOP;
  UPDATE public.organizations SET status='active' WHERE id=org AND status='suspended' AND row_version=1;
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected<>1 THEN RAISE EXCEPTION 'Versión inesperada de organización' USING ERRCODE='40001'; END IF;
 END IF;
 SET CONSTRAINTS ALL IMMEDIATE;
 -- Firmas de filas completas: detectan también un cambio revertido a su valor anterior.
 -- No se copian contactos, nombres o fechas personales a la auditoría pública.
 SELECT jsonb_build_object(
 'organization',(SELECT encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex')
   FROM public.organizations t WHERE id=org),
 'profiles',(SELECT jsonb_agg(jsonb_build_object('id',q.person->>'profile_id','sha256',
   CASE WHEN t.id IS NOT NULL THEN encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex') END) ORDER BY q.ord)
   FROM jsonb_array_elements(p->'people') WITH ORDINALITY q(person,ord)
   LEFT JOIN public.profiles t ON t.id=(q.person->>'profile_id')::uuid),
 'memberships',(SELECT jsonb_agg(jsonb_build_object('id',q.person->>'membership_id','sha256',
   CASE WHEN t.id IS NOT NULL THEN encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex') END) ORDER BY q.ord)
   FROM jsonb_array_elements(p->'people') WITH ORDINALITY q(person,ord)
   LEFT JOIN public.organization_memberships t ON t.id=(q.person->>'membership_id')::uuid),
 'activations',(SELECT jsonb_agg(jsonb_build_object('id',q.person->>'activation_request_id','sha256',
   CASE WHEN t.id IS NOT NULL THEN encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex') END) ORDER BY q.ord)
   FROM jsonb_array_elements(p->'people') WITH ORDINALITY q(person,ord)
   LEFT JOIN private.identity_activation_requests t ON t.id=(q.person->>'activation_request_id')::uuid)
 ) INTO contract;
 evidence:=jsonb_build_object('manifest_sha256',actual_hash,'approval_ref',p->>'approval_ref',
 'operator_ref',p->>'operator_ref','contract',contract);
 IF applied THEN
  IF marker.changes IS DISTINCT FROM evidence THEN
   RAISE EXCEPTION 'Los datos cambiaron después del alta; no se reactivan ni reparan' USING ERRCODE='55000';
  END IF;
  PERFORM set_config('qa.outcome','already_applied',true);
 ELSE
  INSERT INTO public.audit_events(id,request_id,organization_id,actor_kind,action,entity_type,entity_id,changes)
  VALUES(op,op,org,'operator','INSERT','qa.provisioning',org,evidence);
  PERFORM set_config('qa.outcome','created',true);
 END IF;
END;
$qa$;
