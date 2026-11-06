-- Staging y activación privados. No incluye claves, passwords o sesiones.
BEGIN;
CREATE TABLE private.migration_sources(
 id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
 source_kind text NOT NULL CHECK(source_kind IN ('sheets','script_properties','drive')),
 source_instance text NOT NULL,description text NOT NULL DEFAULT '',timezone text NOT NULL DEFAULT 'America/Lima',
 organization_policy jsonb NOT NULL DEFAULT '{}' CHECK(private.no_secret_keys(organization_policy)),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE private.import_runs(
 id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
 source_id uuid NOT NULL REFERENCES private.migration_sources(id) ON DELETE RESTRICT,
 extractor_version text NOT NULL,transform_version text NOT NULL,
 input_sha256 text NOT NULL CHECK(input_sha256 ~ '^[0-9a-f]{64}$'),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','validating','ready','running','completed','failed','cancelled')),
 counts jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(counts)='object' AND private.no_secret_keys(counts)),
 operator_label text NOT NULL,cutoff_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),finished_at timestamptz,
 UNIQUE(id,source_id),CHECK(finished_at IS NULL OR finished_at>=created_at)
);
CREATE TABLE private.import_records(
 id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
 run_id uuid NOT NULL,source_id uuid NOT NULL,
 collection text NOT NULL,record_key text NOT NULL,source_location text NOT NULL,
 payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object' AND private.no_secret_keys(payload) AND octet_length(payload::text)<=1048576),
 sha256 text NOT NULL CHECK(sha256 ~ '^[0-9a-f]{64}$'),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','validated','imported','merged','quarantined','archived')),
 FOREIGN KEY(run_id,source_id) REFERENCES private.import_runs(id,source_id) ON DELETE RESTRICT,
 UNIQUE(run_id,collection,record_key),UNIQUE(run_id,id)
);
CREATE TABLE private.import_issues(
 id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
 run_id uuid NOT NULL REFERENCES private.import_runs(id) ON DELETE RESTRICT,record_id uuid,
 issue_type text NOT NULL,severity text NOT NULL CHECK(severity IN ('info','warning','error','critical')),
 description text NOT NULL,status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved','accepted_archive')),
 resolution text,resolved_by text,resolved_at timestamptz,
 FOREIGN KEY(run_id,record_id) REFERENCES private.import_records(run_id,id) ON DELETE RESTRICT,
 CHECK(status='open' OR (resolution IS NOT NULL AND resolved_by IS NOT NULL AND resolved_at IS NOT NULL))
);
CREATE TABLE private.legacy_id_map(
 id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
 source_id uuid NOT NULL REFERENCES private.migration_sources(id) ON DELETE RESTRICT,
 entity_kind text NOT NULL,legacy_id text NOT NULL CHECK(legacy_id<>''),
 organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
 membership_id uuid,course_id uuid,module_id uuid,lesson_id uuid,enrollment_id uuid,
 announcement_id uuid,material_id uuid,event_id uuid,file_asset_id uuid,
 accepted_sha256 text NOT NULL CHECK(accepted_sha256 ~ '^[0-9a-f]{64}$'),
 UNIQUE(source_id,entity_kind,legacy_id,organization_id),
 CHECK(num_nonnulls(membership_id,course_id,module_id,lesson_id,enrollment_id,announcement_id,material_id,event_id,file_asset_id)=1),
 CHECK((entity_kind='membership' AND membership_id IS NOT NULL)
 OR (entity_kind='course' AND course_id IS NOT NULL) OR (entity_kind='module' AND module_id IS NOT NULL)
 OR (entity_kind='lesson' AND lesson_id IS NOT NULL) OR (entity_kind='enrollment' AND enrollment_id IS NOT NULL)
 OR (entity_kind='announcement' AND announcement_id IS NOT NULL) OR (entity_kind='material' AND material_id IS NOT NULL)
 OR (entity_kind='event' AND event_id IS NOT NULL) OR (entity_kind='file_asset' AND file_asset_id IS NOT NULL)),
 FOREIGN KEY(organization_id,membership_id) REFERENCES public.organization_memberships(organization_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(organization_id,course_id) REFERENCES public.courses(organization_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(organization_id,module_id) REFERENCES public.course_modules(organization_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(organization_id,lesson_id) REFERENCES public.lessons(organization_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(organization_id,enrollment_id) REFERENCES public.enrollments(organization_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(organization_id,announcement_id) REFERENCES public.announcements(organization_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(organization_id,material_id) REFERENCES public.materials(organization_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(organization_id,event_id) REFERENCES public.calendar_events(organization_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(organization_id,file_asset_id) REFERENCES public.file_assets(organization_id,id) ON DELETE RESTRICT
);
CREATE TABLE private.event_source_links(
 id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
 run_id uuid NOT NULL,record_id uuid NOT NULL,organization_id uuid NOT NULL,event_id uuid NOT NULL,
 reconciliation_kind text NOT NULL CHECK(reconciliation_kind IN ('direct','merged','resolved')),
 decision text NOT NULL CHECK(btrim(decision)<>''),UNIQUE(run_id,record_id),
 FOREIGN KEY(run_id,record_id) REFERENCES private.import_records(run_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(organization_id,event_id) REFERENCES public.calendar_events(organization_id,id) ON DELETE RESTRICT
);
CREATE TABLE private.identity_activation_requests(
 id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
 organization_id uuid NOT NULL,profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
 membership_id uuid NOT NULL,proposed_verified_contact text NOT NULL,
 status text NOT NULL DEFAULT 'requested' CHECK(status IN ('requested','invited','verified','linked','cancelled','failed')),
 auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 idempotency_key uuid NOT NULL UNIQUE,created_at timestamptz NOT NULL DEFAULT now(),verified_at timestamptz,linked_at timestamptz,
 FOREIGN KEY(organization_id,profile_id,membership_id) REFERENCES public.organization_memberships(organization_id,profile_id,id) ON DELETE RESTRICT,
 CHECK(status<>'linked' OR (auth_user_id IS NOT NULL AND verified_at IS NOT NULL AND linked_at IS NOT NULL))
);
ALTER TABLE public.audit_events ADD CONSTRAINT audit_run_fk FOREIGN KEY(import_run_id) REFERENCES private.import_runs(id) ON DELETE RESTRICT;
CREATE INDEX runs_source_idx ON private.import_runs(source_id,status);
CREATE INDEX records_source_idx ON private.import_records(source_id,status);
CREATE INDEX issues_run_status_idx ON private.import_issues(run_id,status,severity);
CREATE INDEX issues_record_idx ON private.import_issues(run_id,record_id);
CREATE INDEX activation_member_idx ON private.identity_activation_requests(organization_id,profile_id,membership_id,status);
CREATE INDEX activation_auth_idx ON private.identity_activation_requests(auth_user_id);
CREATE INDEX links_event_idx ON private.event_source_links(organization_id,event_id);
CREATE INDEX legacy_membership_id_idx ON private.legacy_id_map(organization_id,membership_id) WHERE membership_id IS NOT NULL;
CREATE INDEX legacy_course_id_idx ON private.legacy_id_map(organization_id,course_id) WHERE course_id IS NOT NULL;
CREATE INDEX legacy_module_id_idx ON private.legacy_id_map(organization_id,module_id) WHERE module_id IS NOT NULL;
CREATE INDEX legacy_lesson_id_idx ON private.legacy_id_map(organization_id,lesson_id) WHERE lesson_id IS NOT NULL;
CREATE INDEX legacy_enrollment_id_idx ON private.legacy_id_map(organization_id,enrollment_id) WHERE enrollment_id IS NOT NULL;
CREATE INDEX legacy_announcement_id_idx ON private.legacy_id_map(organization_id,announcement_id) WHERE announcement_id IS NOT NULL;
CREATE INDEX legacy_material_id_idx ON private.legacy_id_map(organization_id,material_id) WHERE material_id IS NOT NULL;
CREATE INDEX legacy_event_id_idx ON private.legacy_id_map(organization_id,event_id) WHERE event_id IS NOT NULL;
CREATE INDEX legacy_file_asset_id_idx ON private.legacy_id_map(organization_id,file_asset_id) WHERE file_asset_id IS NOT NULL;
CREATE INDEX organization_memberships_creator_idx ON public.organization_memberships(organization_id,created_by_membership_id);
CREATE INDEX organization_memberships_editor_idx ON public.organization_memberships(organization_id,updated_by_membership_id);
CREATE INDEX courses_creator_idx ON public.courses(organization_id,created_by_membership_id);
CREATE INDEX courses_editor_idx ON public.courses(organization_id,updated_by_membership_id);
CREATE INDEX file_assets_creator_idx ON public.file_assets(organization_id,created_by_membership_id);
CREATE INDEX file_assets_editor_idx ON public.file_assets(organization_id,updated_by_membership_id);
CREATE INDEX course_modules_creator_idx ON public.course_modules(organization_id,created_by_membership_id);
CREATE INDEX course_modules_editor_idx ON public.course_modules(organization_id,updated_by_membership_id);
CREATE INDEX lessons_creator_idx ON public.lessons(organization_id,created_by_membership_id);
CREATE INDEX lessons_editor_idx ON public.lessons(organization_id,updated_by_membership_id);
CREATE INDEX enrollments_creator_idx ON public.enrollments(organization_id,created_by_membership_id);
CREATE INDEX enrollments_editor_idx ON public.enrollments(organization_id,updated_by_membership_id);
CREATE INDEX announcements_creator_idx ON public.announcements(organization_id,created_by_membership_id);
CREATE INDEX announcements_editor_idx ON public.announcements(organization_id,updated_by_membership_id);
CREATE INDEX materials_creator_idx ON public.materials(organization_id,created_by_membership_id);
CREATE INDEX materials_editor_idx ON public.materials(organization_id,updated_by_membership_id);
CREATE INDEX calendar_events_creator_idx ON public.calendar_events(organization_id,created_by_membership_id);
CREATE INDEX calendar_events_editor_idx ON public.calendar_events(organization_id,updated_by_membership_id);
CREATE INDEX calendar_event_attendees_creator_idx ON public.calendar_event_attendees(organization_id,created_by_membership_id);
CREATE INDEX calendar_event_attendees_editor_idx ON public.calendar_event_attendees(organization_id,updated_by_membership_id);
CREATE INDEX certificate_issues_creator_idx ON public.certificate_issues(organization_id,created_by_membership_id);
CREATE INDEX certificate_issues_editor_idx ON public.certificate_issues(organization_id,updated_by_membership_id);

-- El esquema permanece privado y las nuevas tablas se protegen antes de confirmar.
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['migration_sources','import_runs','import_records','import_issues','legacy_id_map','event_source_links','identity_activation_requests'] LOOP
  EXECUTE format('ALTER TABLE private.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON private.%I FROM PUBLIC,anon,authenticated',t);
 END LOOP;
END $$;
COMMIT;
