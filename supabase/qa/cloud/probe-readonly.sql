-- Preparación QA Cloud: solo catálogos y constantes, sin secretos.
SELECT jsonb_build_object(
 'server_version_num',current_setting('server_version_num')::integer,
 'observed_at',current_timestamp,'role',current_user,'database',current_database(),
 'auth_columns',(SELECT jsonb_agg(column_name ORDER BY column_name)
 FROM information_schema.columns WHERE table_schema='auth' AND table_name='users'
 AND column_name IN ('id','email','email_confirmed_at','is_anonymous','banned_until','deleted_at')),
 'migrations',(SELECT jsonb_agg(version ORDER BY version) FROM supabase_migrations.schema_migrations),
 'rls_tables',(SELECT jsonb_object_agg(n.nspname||'.'||c.relname,c.relrowsecurity)
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE (n.nspname,c.relname) IN (('public','organizations'),('public','profiles'),
 ('public','organization_memberships'),('public','audit_events'),('private','identity_activation_requests'))),
 'portability',jsonb_build_object(
 'canonical',('{"z":2,"a":[1,{"role":"admin"}]}'::jsonb)::text,
 'sha256',encode(sha256(convert_to(('{"z":2,"a":[1,{"role":"admin"}]}'::jsonb)::text,'UTF8')),'hex'))
) AS qa_probe;
