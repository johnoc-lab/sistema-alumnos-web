-- PROPUESTA LOCAL. No migración aplicada ni autorización para Cloud.
-- Colisión de esquema/función: abortar y revisar; no reemplaza objetos existentes.
BEGIN;
CREATE SCHEMA auth_email_hooks;
REVOKE ALL ON SCHEMA auth_email_hooks FROM PUBLIC, anon, authenticated, service_role;
CREATE FUNCTION auth_email_hooks.deny_email(event jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
PARALLEL SAFE
SET search_path = pg_catalog
AS $hook$
 SELECT '{"error":{"http_code":403,"message":"Email delivery is disabled by institutional policy."}}'::jsonb;
$hook$;
REVOKE ALL ON FUNCTION auth_email_hooks.deny_email(jsonb)
 FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA auth_email_hooks TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION auth_email_hooks.deny_email(jsonb) TO supabase_auth_admin;
COMMIT;
