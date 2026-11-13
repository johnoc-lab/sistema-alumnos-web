-- Solo para PostgreSQL embebido de pruebas: NO forma parte de migrations.
-- Emula el contrato del gateway Auth; no verifica firmas JWT ni sustituye Supabase Auth.
CREATE ROLE anon NOLOGIN NOSUPERUSER NOBYPASSRLS;
CREATE ROLE authenticated NOLOGIN NOSUPERUSER NOBYPASSRLS;
CREATE ROLE service_role NOLOGIN NOSUPERUSER BYPASSRLS;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz,is_anonymous boolean DEFAULT false,deleted_at timestamptz,banned_until timestamptz,aud text,role text,raw_app_meta_data jsonb,raw_user_meta_data jsonb);
-- Helper limitado al contrato de claims del contexto de prueba.
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid
$$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb
$$;
GRANT USAGE ON SCHEMA auth TO anon,authenticated;
GRANT EXECUTE ON FUNCTION auth.uid(),auth.jwt() TO anon,authenticated;
GRANT USAGE ON SCHEMA public TO anon,authenticated;
CREATE SCHEMA storage;
CREATE TABLE storage.buckets(
 id text PRIMARY KEY,name text NOT NULL,public boolean NOT NULL DEFAULT false,
 file_size_limit bigint,allowed_mime_types text[]
);
CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text REFERENCES storage.buckets(id),name text NOT NULL,metadata jsonb,UNIQUE(bucket_id,name));
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA storage TO anon,authenticated;
GRANT SELECT ON storage.objects TO anon,authenticated;
GRANT INSERT ON storage.objects TO authenticated;
