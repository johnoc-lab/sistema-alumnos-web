-- Esquema de aplicación. No modifica auth ni crea identidades de producción.
BEGIN;
CREATE SCHEMA private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
REVOKE CREATE ON SCHEMA public FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA private REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA private REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

CREATE TABLE private.currency_codes(code text PRIMARY KEY CHECK (code ~ '^[A-Z]{3}$'));
INSERT INTO private.currency_codes VALUES ('PEN'),('USD'),('EUR');
CREATE TABLE private.allowed_resource_hosts(host text PRIMARY KEY CHECK (host=lower(host) AND host !~ '[@/:[:space:]]'));
INSERT INTO private.allowed_resource_hosts VALUES ('www.youtube.com'),('youtube.com'),('youtu.be'),('player.vimeo.com'),('drive.google.com'),('docs.google.com'),('meet.google.com'),('zoom.us');
CREATE FUNCTION private.allowed_url(value text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT value IS NULL OR (
 value ~ '^https://[a-zA-Z0-9.-]+(:443)?(/[^[:space:]<>]*)?$'
 AND EXISTS (SELECT 1 FROM private.allowed_resource_hosts h
 WHERE h.host=lower(substring(value FROM '^https://([^/:]+)')))
 );
$$;
CREATE FUNCTION private.no_secret_keys(value jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE k text; v jsonb;
BEGIN
 IF jsonb_typeof(value)='object' THEN
  FOR k,v IN SELECT * FROM jsonb_each(value) LOOP
   IF k ~* '(password|pass_hash|passhash|token|secret|salt|private.?key|credential)' OR NOT private.no_secret_keys(v) THEN RETURN false; END IF;
  END LOOP;
 ELSIF jsonb_typeof(value)='array' THEN
  FOR v IN SELECT * FROM jsonb_array_elements(value) LOOP
   IF NOT private.no_secret_keys(v) THEN RETURN false; END IF;
  END LOOP;
 END IF;
 RETURN true;
END;
$$;

CREATE TABLE public.organizations(
 id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
 slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 500),
 status text NOT NULL DEFAULT 'suspended' CHECK(status IN ('active','suspended','archived')),
 timezone text NOT NULL DEFAULT 'America/Lima',
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 row_version bigint NOT NULL DEFAULT 1 CHECK(row_version>0)
);
CREATE TABLE public.profiles(
 id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
 auth_user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
 display_name text,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','active','blocked','archived')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 row_version bigint NOT NULL DEFAULT 1 CHECK(row_version>0)
);
CREATE TABLE public.organization_memberships(
 id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
 profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
 role text NOT NULL DEFAULT 'student' CHECK(role IN ('admin','student')),
 status text NOT NULL DEFAULT 'invited' CHECK(status IN ('invited','active','suspended','archived')),
 first_name text NOT NULL DEFAULT '', last_name text NOT NULL DEFAULT '', contact_email text,
 contact_email_normalized text GENERATED ALWAYS AS (lower(btrim(contact_email))) STORED,
 joined_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 row_version bigint NOT NULL DEFAULT 1 CHECK(row_version>0),
 created_by_membership_id uuid,updated_by_membership_id uuid,
 CHECK (status<>'active' OR btrim(first_name)<>''),
 UNIQUE(organization_id,id),UNIQUE(organization_id,profile_id),UNIQUE(organization_id,profile_id,id),
 FOREIGN KEY(organization_id,created_by_membership_id) REFERENCES public.organization_memberships(organization_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(organization_id,updated_by_membership_id) REFERENCES public.organization_memberships(organization_id,id) ON DELETE RESTRICT
);

CREATE TABLE public.courses(
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  row_version bigint NOT NULL DEFAULT 1 CHECK (row_version > 0),
  created_by_membership_id uuid,
  updated_by_membership_id uuid,
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, created_by_membership_id) REFERENCES public.organization_memberships(organization_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, updated_by_membership_id) REFERENCES public.organization_memberships(organization_id,id) ON DELETE RESTRICT,
  slug text NOT NULL CHECK(slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text NOT NULL CHECK(length(btrim(title)) BETWEEN 1 AND 500),
  description text NOT NULL DEFAULT '',tag text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','archived')),
  sort_order integer NOT NULL DEFAULT 0 CHECK(sort_order>=0),
  price_amount numeric(12,2) CHECK(price_amount>=0),currency text REFERENCES private.currency_codes(code),
  declared_lesson_count integer CHECK(declared_lesson_count>=0),cover_asset_id uuid,
  CHECK((price_amount IS NULL)=(currency IS NULL)), UNIQUE(organization_id,slug)
);

CREATE TABLE public.file_assets(
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  row_version bigint NOT NULL DEFAULT 1 CHECK (row_version > 0),
  created_by_membership_id uuid,
  updated_by_membership_id uuid,
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, created_by_membership_id) REFERENCES public.organization_memberships(organization_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, updated_by_membership_id) REFERENCES public.organization_memberships(organization_id,id) ON DELETE RESTRICT,
  course_id uuid,
  purpose text NOT NULL CHECK(purpose IN ('course_material','course_video','certificate','branding')),
  bucket_name text NOT NULL CHECK(bucket_name IN ('course-files','certificate-files','organization-assets')),
  object_path text NOT NULL CHECK(object_path !~ '(^/|(^|/)\.\.(/|$)|[[:cntrl:]])'),
  original_name text NOT NULL CHECK(original_name<>'' AND original_name !~ '[/\\[:cntrl:]]'),
  mime_type text NOT NULL CHECK(mime_type ~ '^[a-z0-9.+-]+/[a-z0-9.+-]+$'),
  size_bytes bigint CHECK(size_bytes>=0),sha256 text CHECK(sha256 ~ '^[0-9a-f]{64}$'),
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','ready','quarantined','archived','failed')),
  CHECK(status<>'ready' OR (size_bytes IS NOT NULL AND sha256 IS NOT NULL)),
  CHECK(purpose='branding' OR course_id IS NOT NULL),
  CHECK((purpose IN ('course_material','course_video') AND bucket_name='course-files') OR (purpose='certificate' AND bucket_name='certificate-files') OR (purpose='branding' AND bucket_name='organization-assets')),
  CHECK(object_path LIKE organization_id::text||'/'||id::text||'/%'),
  UNIQUE(bucket_name,object_path),UNIQUE(organization_id,course_id,id),
  FOREIGN KEY(organization_id,course_id) REFERENCES public.courses(organization_id,id) ON DELETE RESTRICT
);

CREATE TABLE public.course_modules(
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  row_version bigint NOT NULL DEFAULT 1 CHECK (row_version > 0),
  created_by_membership_id uuid,
  updated_by_membership_id uuid,
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, created_by_membership_id) REFERENCES public.organization_memberships(organization_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, updated_by_membership_id) REFERENCES public.organization_memberships(organization_id,id) ON DELETE RESTRICT,
  course_id uuid NOT NULL,title text NOT NULL CHECK(length(btrim(title)) BETWEEN 1 AND 500),
  sort_order integer NOT NULL DEFAULT 0 CHECK(sort_order>=0),
  status text NOT NULL DEFAULT 'published' CHECK(status IN ('published','archived')),
  UNIQUE(organization_id,course_id,id),
  FOREIGN KEY(organization_id,course_id) REFERENCES public.courses(organization_id,id) ON DELETE RESTRICT
);

CREATE TABLE public.lessons(
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  row_version bigint NOT NULL DEFAULT 1 CHECK (row_version > 0),
  created_by_membership_id uuid,
  updated_by_membership_id uuid,
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, created_by_membership_id) REFERENCES public.organization_memberships(organization_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, updated_by_membership_id) REFERENCES public.organization_memberships(organization_id,id) ON DELETE RESTRICT,
  course_id uuid NOT NULL,module_id uuid,
  title text NOT NULL CHECK(length(btrim(title)) BETWEEN 1 AND 500),description text NOT NULL DEFAULT '',
  video_url text CHECK(private.allowed_url(video_url)),live_url text CHECK(private.allowed_url(live_url)),
  duration_minutes integer CHECK(duration_minutes>0),sort_order integer NOT NULL DEFAULT 0 CHECK(sort_order>=0),
  status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','archived')),scheduled_start_hint timestamptz,
  UNIQUE(organization_id,course_id,id),
  FOREIGN KEY(organization_id,course_id) REFERENCES public.courses(organization_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(organization_id,course_id,module_id) REFERENCES public.course_modules(organization_id,course_id,id) ON DELETE RESTRICT
);

CREATE TABLE public.enrollments(
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  row_version bigint NOT NULL DEFAULT 1 CHECK (row_version > 0),
  created_by_membership_id uuid,
  updated_by_membership_id uuid,
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, created_by_membership_id) REFERENCES public.organization_memberships(organization_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, updated_by_membership_id) REFERENCES public.organization_memberships(organization_id,id) ON DELETE RESTRICT,
  course_id uuid NOT NULL,membership_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','paused','completed','cancelled','archived')),
  enrolled_at timestamptz,progress_percent numeric(5,2) CHECK(progress_percent BETWEEN 0 AND 100),completed_at timestamptz,
  CHECK(completed_at IS NULL OR enrolled_at IS NULL OR completed_at>=enrolled_at),
  UNIQUE(organization_id,course_id,membership_id),UNIQUE(organization_id,course_id,membership_id,id),
  FOREIGN KEY(organization_id,course_id) REFERENCES public.courses(organization_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(organization_id,membership_id) REFERENCES public.organization_memberships(organization_id,id) ON DELETE RESTRICT
);

CREATE TABLE public.announcements(
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  row_version bigint NOT NULL DEFAULT 1 CHECK (row_version > 0),
  created_by_membership_id uuid,
  updated_by_membership_id uuid,
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, created_by_membership_id) REFERENCES public.organization_memberships(organization_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, updated_by_membership_id) REFERENCES public.organization_memberships(organization_id,id) ON DELETE RESTRICT,
  course_id uuid NOT NULL,title text NOT NULL CHECK(length(btrim(title)) BETWEEN 1 AND 500),
  body text NOT NULL CHECK(length(btrim(body)) BETWEEN 1 AND 100000),published_at timestamptz,
  status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','archived')),
  CHECK(status<>'published' OR published_at IS NOT NULL),
  FOREIGN KEY(organization_id,course_id) REFERENCES public.courses(organization_id,id) ON DELETE RESTRICT
);

CREATE TABLE public.materials(
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  row_version bigint NOT NULL DEFAULT 1 CHECK (row_version > 0),
  created_by_membership_id uuid,
  updated_by_membership_id uuid,
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, created_by_membership_id) REFERENCES public.organization_memberships(organization_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, updated_by_membership_id) REFERENCES public.organization_memberships(organization_id,id) ON DELETE RESTRICT,
  course_id uuid NOT NULL,lesson_id uuid,title text NOT NULL CHECK(length(btrim(title)) BETWEEN 1 AND 500),
  external_url text CHECK(private.allowed_url(external_url)),file_asset_id uuid,
  sort_order integer NOT NULL DEFAULT 0 CHECK(sort_order>=0),status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','archived')),
  CHECK(num_nonnulls(external_url,file_asset_id)=1),
  FOREIGN KEY(organization_id,course_id) REFERENCES public.courses(organization_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(organization_id,course_id,lesson_id) REFERENCES public.lessons(organization_id,course_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(organization_id,course_id,file_asset_id) REFERENCES public.file_assets(organization_id,course_id,id) ON DELETE RESTRICT
);

CREATE TABLE public.calendar_events(
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  row_version bigint NOT NULL DEFAULT 1 CHECK (row_version > 0),
  created_by_membership_id uuid,
  updated_by_membership_id uuid,
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, created_by_membership_id) REFERENCES public.organization_memberships(organization_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, updated_by_membership_id) REFERENCES public.organization_memberships(organization_id,id) ON DELETE RESTRICT,
  course_id uuid NOT NULL,lesson_id uuid,title text NOT NULL CHECK(length(btrim(title)) BETWEEN 1 AND 500),
  module_label text,starts_at timestamptz NOT NULL,ends_at timestamptz NOT NULL,timezone text NOT NULL DEFAULT 'America/Lima',
  color_key text NOT NULL DEFAULT 'blue' CHECK(color_key IN ('blue','purple','green','orange','pink','yellow','red','cyan')),
  status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','scheduled','cancelled','archived')),
  CHECK(ends_at>starts_at),
  FOREIGN KEY(organization_id,course_id) REFERENCES public.courses(organization_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(organization_id,course_id,lesson_id) REFERENCES public.lessons(organization_id,course_id,id) ON DELETE RESTRICT
);

CREATE TABLE public.calendar_event_attendees(
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  row_version bigint NOT NULL DEFAULT 1 CHECK (row_version > 0),
  created_by_membership_id uuid,
  updated_by_membership_id uuid,
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, created_by_membership_id) REFERENCES public.organization_memberships(organization_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, updated_by_membership_id) REFERENCES public.organization_memberships(organization_id,id) ON DELETE RESTRICT,
  event_id uuid NOT NULL,membership_id uuid NOT NULL,status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','cancelled')),
  UNIQUE(organization_id,event_id,membership_id),
  FOREIGN KEY(organization_id,event_id) REFERENCES public.calendar_events(organization_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(organization_id,membership_id) REFERENCES public.organization_memberships(organization_id,id) ON DELETE RESTRICT
);

CREATE TABLE public.certificate_issues(
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  row_version bigint NOT NULL DEFAULT 1 CHECK (row_version > 0),
  created_by_membership_id uuid,
  updated_by_membership_id uuid,
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, created_by_membership_id) REFERENCES public.organization_memberships(organization_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, updated_by_membership_id) REFERENCES public.organization_memberships(organization_id,id) ON DELETE RESTRICT,
  enrollment_id uuid NOT NULL,course_id uuid NOT NULL,membership_id uuid NOT NULL,
  serial text NOT NULL CHECK(btrim(serial)<>''),issued_at timestamptz,
  status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','issued','revoked','archived')),
  snapshot jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(snapshot)='object' AND private.no_secret_keys(snapshot)),
  file_asset_id uuid UNIQUE,
  CHECK(status<>'issued' OR (issued_at IS NOT NULL AND snapshot ?& ARRAY['template_version','participant','course'])),
  UNIQUE(organization_id,serial),
  FOREIGN KEY(organization_id,course_id,membership_id,enrollment_id) REFERENCES public.enrollments(organization_id,course_id,membership_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(organization_id,course_id,file_asset_id) REFERENCES public.file_assets(organization_id,course_id,id) ON DELETE RESTRICT
);

ALTER TABLE public.courses ADD CONSTRAINT courses_cover_asset_fk FOREIGN KEY(organization_id,cover_asset_id) REFERENCES public.file_assets(organization_id,id) ON DELETE RESTRICT;
CREATE TABLE public.audit_events(
 id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
 organization_id uuid REFERENCES public.organizations(id) ON DELETE RESTRICT,
 actor_profile_id uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
 actor_kind text NOT NULL CHECK(actor_kind IN ('user','operator','importer','system')),
 action text NOT NULL CHECK(action IN ('INSERT','UPDATE','DELETE')),entity_type text NOT NULL,entity_id uuid,
 occurred_at timestamptz NOT NULL DEFAULT now(),request_id uuid,import_run_id uuid,
 changes jsonb NOT NULL DEFAULT '{}' CHECK(private.no_secret_keys(changes))
);
CREATE INDEX profiles_status_idx ON public.profiles(status);
CREATE INDEX memberships_profile_status_idx ON public.organization_memberships(profile_id,status,organization_id);
CREATE INDEX memberships_role_status_idx ON public.organization_memberships(organization_id,role,status);
CREATE INDEX memberships_contact_idx ON public.organization_memberships(organization_id,contact_email_normalized);
CREATE INDEX courses_listing_idx ON public.courses(organization_id,status,sort_order,id);
CREATE INDEX modules_listing_idx ON public.course_modules(organization_id,course_id,status,sort_order,id);
CREATE INDEX lessons_listing_idx ON public.lessons(organization_id,course_id,status,sort_order,id);
CREATE INDEX lessons_module_idx ON public.lessons(organization_id,course_id,module_id);
CREATE INDEX enrollment_member_idx ON public.enrollments(organization_id,membership_id,status,course_id);
CREATE INDEX enrollment_course_idx ON public.enrollments(organization_id,course_id,status,membership_id);
CREATE INDEX announcements_listing_idx ON public.announcements(organization_id,course_id,status,published_at DESC,id);
CREATE INDEX materials_listing_idx ON public.materials(organization_id,course_id,status,sort_order,id);
CREATE INDEX materials_asset_idx ON public.materials(organization_id,course_id,file_asset_id);
CREATE INDEX materials_lesson_idx ON public.materials(organization_id,course_id,lesson_id);
CREATE INDEX calendar_week_idx ON public.calendar_events(organization_id,starts_at,id);
CREATE INDEX calendar_course_idx ON public.calendar_events(organization_id,course_id,starts_at,id);
CREATE INDEX attendees_member_idx ON public.calendar_event_attendees(organization_id,membership_id,status,event_id);
CREATE INDEX assets_course_idx ON public.file_assets(organization_id,course_id,purpose,status);
CREATE INDEX certificates_member_idx ON public.certificate_issues(organization_id,membership_id,status,issued_at DESC);
CREATE INDEX certificates_enrollment_idx ON public.certificate_issues(organization_id,course_id,membership_id,enrollment_id);
CREATE INDEX audit_org_idx ON public.audit_events(organization_id,occurred_at DESC,id);
CREATE INDEX audit_entity_idx ON public.audit_events(entity_type,entity_id,occurred_at DESC);

-- Protección desde el primer COMMIT, incluso con defaults globales heredados de Cloud.
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['organizations','profiles','organization_memberships','courses','file_assets','course_modules','lessons','enrollments','announcements','materials','calendar_events','calendar_event_attendees','certificate_issues','audit_events'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['currency_codes','allowed_resource_hosts'] LOOP
  EXECUTE format('ALTER TABLE private.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON private.%I FROM PUBLIC,anon,authenticated',t);
 END LOOP;
END $$;
COMMIT;
