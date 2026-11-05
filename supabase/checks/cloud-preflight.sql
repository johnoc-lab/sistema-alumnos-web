-- FASE 4B: solo lectura. Ejecutar en SQL Editor del proyecto verificado.
-- No crea historial, objetos, usuarios, buckets ni datos; no muestra credenciales.
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '10s';
SELECT jsonb_build_object(
 'server',jsonb_build_object(
   'version_num',current_setting('server_version_num')::integer,
   'database',current_database(),'role',current_user,
   'can_create_schema',has_database_privilege(current_user,current_database(),'CREATE')),
 'roles',(SELECT jsonb_agg(jsonb_build_object('name',rolname,'superuser',rolsuper,'bypassrls',rolbypassrls))
   FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role','postgres')),
 'auth_functions',(SELECT jsonb_agg(jsonb_build_object('name',p.proname,'result',pg_catalog.format_type(p.prorettype,NULL)))
   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='auth' AND p.proname IN ('uid','jwt') AND p.pronargs=0),
 'managed_columns',(SELECT jsonb_agg(jsonb_build_object('schema',table_schema,'table',table_name,'column',column_name,'type',udt_name))
   FROM information_schema.columns WHERE (table_schema='auth' AND table_name='users' AND column_name='id')
   OR (table_schema='storage' AND table_name='objects' AND column_name IN ('id','bucket_id','name'))
   OR (table_schema='storage' AND table_name='buckets' AND column_name IN ('id','name','public'))),
 'auth_fk_target',(SELECT jsonb_build_object('type',a.atttypid::regtype::text,
   'references_allowed',has_column_privilege(current_user,c.oid,'id','REFERENCES'),
   'unique_single_id',EXISTS(SELECT 1 FROM pg_constraint x WHERE x.conrelid=c.oid AND x.contype IN ('p','u') AND x.conkey=ARRAY[a.attnum]::smallint[]))
   FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid AND a.attname='id'
   WHERE n.nspname='auth' AND c.relname='users'),
 'storage_policy_target',(SELECT jsonb_build_object('rls',c.relrowsecurity,'owner',pg_get_userbyid(c.relowner),
   'effective_owner',pg_has_role(current_user,c.relowner,'USAGE'),
   -- La propiedad no es el único mecanismo válido en Supabase Cloud.
   -- Se diagnostica el rol de migración postgres, aunque la consulta use un rol READ ONLY.
   'managed_policy_role','postgres',
   'managed_policy_grant',coalesce((nullif(current_setting('supautils.policy_grants',true),'')::jsonb->'postgres') ? 'storage.objects',false),
   'supautils_session_preload',current_setting('session_preload_libraries',true),
   'policy_grants_registered',EXISTS(SELECT 1 FROM pg_settings WHERE name='supautils.policy_grants'))
   FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='storage' AND c.relname='objects'),
 'private_schema_exists',EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='private'),
 'public_relation_conflicts',(SELECT coalesce(jsonb_agg(c.relname),'[]') FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relname=ANY(ARRAY['organizations','profiles','organization_memberships','courses','file_assets','course_modules','lessons','enrollments','announcements','materials','calendar_events','calendar_event_attendees','certificate_issues','audit_events'])),
 'public_function_conflicts',(SELECT coalesce(jsonb_agg(p.proname),'[]') FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname=ANY(ARRAY['update_course','update_course_module','update_lesson','update_enrollment','update_announcement','update_material','update_calendar_event','update_file_asset','update_certificate_issue','update_student_contact','set_student_status','create_scheduled_event','replace_event_attendees'])),
 'migration_history_table',to_regclass('supabase_migrations.schema_migrations')::text,
 'storage_policies',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',policyname,'command',cmd,'roles',roles,'permissive',permissive)),'[]')
   FROM pg_policies WHERE schemaname='storage' AND tablename='objects'),
 'default_privileges',(SELECT coalesce(jsonb_agg(jsonb_build_object('owner',pg_get_userbyid(d.defaclrole),'schema',n.nspname,'object_type',d.defaclobjtype,'acl',d.defaclacl::text)),'[]')
   FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace
   WHERE d.defaclnamespace=0 OR n.nspname IN ('public','private'))
) AS preflight;
-- Inventario de buckets exclusivamente, sin nombres de objetos ni contenido.
SELECT id,name,public FROM storage.buckets
WHERE id IN ('course-files','certificate-files','organization-assets')
   OR name IN ('course-files','certificate-files','organization-assets');
ROLLBACK;
