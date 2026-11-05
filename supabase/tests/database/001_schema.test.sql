-- Comprobación adicional para Supabase local; requiere pgTAP, no sustituye la suite de Node.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path=public,extensions;
SELECT plan(8);
SELECT is((SELECT count(*)::integer FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity),14,'14 tablas con RLS');
SELECT ok(NOT has_table_privilege('anon','public.courses','SELECT'),'anon sin lectura');
SELECT ok(NOT has_table_privilege('authenticated','public.courses','UPDATE'),'sin UPDATE directo');
SELECT ok(NOT has_table_privilege('authenticated','private.import_records','SELECT'),'staging privado');
SELECT ok(NOT has_function_privilege('anon','public.update_course(uuid,uuid,bigint,jsonb)','EXECUTE'),'RPC no anónima');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000013","role":"authenticated","aal":"aal1"}',true);
SELECT is((SELECT count(*)::integer FROM public.courses),1,'alumno ve su curso');
SELECT is((SELECT count(*)::integer FROM public.courses WHERE organization_id='00000000-0000-4000-8000-000000000002'),0,'aislamiento entre organizaciones');
SELECT is((SELECT count(*)::integer FROM public.organization_memberships),1,'solo membresía propia');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
