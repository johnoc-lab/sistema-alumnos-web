BEGIN;

GRANT SELECT (id, slug, status) ON TABLE public.organizations TO service_role;

COMMIT;
