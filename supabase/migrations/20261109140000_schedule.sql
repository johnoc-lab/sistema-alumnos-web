BEGIN;

ALTER TABLE public.calendar_events
  ADD COLUMN description text CHECK (length(description) <= 1000),
  ADD COLUMN modality text CHECK (modality IN ('in_person', 'online', 'hybrid')),
  ADD COLUMN location text CHECK (length(location) <= 160),
  ADD COLUMN series_id uuid;

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;
-- Supabase puede tener la extensión instalada en otro esquema.
DO $$
DECLARE
  extension_schema text;
BEGIN
  SELECT n.nspname INTO STRICT extension_schema
  FROM pg_catalog.pg_extension e JOIN pg_catalog.pg_namespace n ON n.oid = e.extnamespace
  WHERE e.extname = 'btree_gist';
  EXECUTE pg_catalog.format(
    'ALTER TABLE public.calendar_events ADD CONSTRAINT schedule_no_overlap
     EXCLUDE USING gist (
       organization_id %1$I.gist_uuid_ops WITH =,
       course_id %1$I.gist_uuid_ops WITH =,
       pg_catalog.tstzrange(starts_at, ends_at, ''[)'') WITH &&
     ) WHERE (status = ''scheduled'')',
    extension_schema
  );
END;
$$;

-- También protege las ediciones hechas por el RPC anterior.
CREATE FUNCTION private.guard_schedule_attendance() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF (NEW.starts_at, NEW.ends_at) IS DISTINCT FROM (OLD.starts_at, OLD.ends_at)
    AND EXISTS (
      SELECT 1 FROM public.attendance_records a
      WHERE a.organization_id = OLD.organization_id AND a.event_id = OLD.id
    ) THEN
    RAISE EXCEPTION 'schedule_attendance_locked' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.guard_schedule_attendance() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER schedule_attendance_locked
BEFORE UPDATE OF starts_at, ends_at ON public.calendar_events
FOR EACH ROW EXECUTE FUNCTION private.guard_schedule_attendance();

CREATE FUNCTION private.schedule_participants(p_org uuid, p_course uuid) RETURNS uuid[]
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT pg_catalog.array_agg(m.id ORDER BY m.id)
  FROM public.enrollments en
  JOIN public.organization_memberships m ON m.organization_id = en.organization_id AND m.id = en.membership_id
  JOIN public.profiles pr ON pr.id = m.profile_id
  JOIN public.courses c ON c.organization_id = en.organization_id AND c.id = en.course_id
  WHERE en.organization_id = p_org AND en.course_id = p_course AND c.status = 'published'
    AND en.status IN ('active', 'completed') AND m.role = 'student'
    AND m.status = 'active' AND pr.status = 'active';
$$;
REVOKE ALL ON FUNCTION private.schedule_participants(uuid,uuid) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.create_schedule_sessions(
  p_org uuid, p_course uuid, p_dates date[], p_start time, p_end time,
  p_draft boolean, p_details jsonb
) RETURNS uuid[]
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  course_status text;
  members uuid[];
  event_date date;
  event_id uuid;
  session_ids uuid[] := '{}';
  series uuid;
BEGIN
  PERFORM private.require_admin(p_org);
  PERFORM private.validate_patch(p_details, ARRAY['title', 'description', 'modality', 'location']);
  IF coalesce(pg_catalog.cardinality(p_dates), 0) NOT BETWEEN 1 AND 60
    OR pg_catalog.array_ndims(p_dates) <> 1
    OR pg_catalog.array_position(p_dates, NULL) IS NOT NULL
    OR (SELECT count(DISTINCT d) FROM pg_catalog.unnest(p_dates) d) <> pg_catalog.cardinality(p_dates)
    OR EXISTS (SELECT 1 FROM pg_catalog.unnest(p_dates) d WHERE NOT pg_catalog.isfinite(d))
    OR p_start IS NULL OR p_end IS NULL OR p_end <= p_start
    OR p_end >= time '24:00' OR p_draft IS NULL THEN
    RAISE EXCEPTION 'schedule_invalid' USING ERRCODE = '22023';
  END IF;

  SELECT status INTO course_status FROM public.courses
  WHERE organization_id = p_org AND id = p_course AND status <> 'archived';
  IF NOT FOUND THEN RAISE EXCEPTION 'schedule_course' USING ERRCODE = '22023'; END IF;

  IF NOT p_draft THEN
    IF course_status <> 'published' THEN
      RAISE EXCEPTION 'schedule_course' USING ERRCODE = '22023';
    END IF;
    members := private.schedule_participants(p_org, p_course);
    IF members IS NULL THEN
      RAISE EXCEPTION 'schedule_attendees' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF pg_catalog.cardinality(p_dates) > 1 THEN series := pg_catalog.gen_random_uuid(); END IF;
  -- Orden estable para lotes concurrentes.
  FOR event_date IN SELECT d FROM pg_catalog.unnest(p_dates) d ORDER BY d LOOP
    INSERT INTO public.calendar_events (
      organization_id, course_id, title, description, modality, location,
      starts_at, ends_at, timezone, status, series_id
    ) VALUES (
      p_org, p_course, pg_catalog.btrim(p_details->>'title'),
      nullif(pg_catalog.btrim(p_details->>'description'), ''),
      nullif(p_details->>'modality', ''), nullif(pg_catalog.btrim(p_details->>'location'), ''),
      (event_date + p_start) AT TIME ZONE 'America/Lima',
      (event_date + p_end) AT TIME ZONE 'America/Lima',
      'America/Lima', CASE WHEN p_draft THEN 'draft' ELSE 'scheduled' END, series
    ) RETURNING id INTO event_id;

    IF NOT p_draft THEN
      INSERT INTO public.calendar_event_attendees (organization_id, event_id, membership_id)
      SELECT p_org, event_id, member_id FROM pg_catalog.unnest(members) member_id;
    END IF;
    session_ids := pg_catalog.array_append(session_ids, event_id);
  END LOOP;
  RETURN session_ids;
END;
$$;

CREATE FUNCTION public.update_schedule_session(
  p_org uuid, p_id uuid, p_version bigint, p_patch jsonb
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  original public.calendar_events;
  candidate public.calendar_events;
  current_version bigint;
  members uuid[];
BEGIN
  PERFORM private.require_admin(p_org);
  PERFORM private.validate_patch(p_patch,
    ARRAY['title', 'description', 'modality', 'location', 'starts_at', 'ends_at', 'status']);
  SELECT * INTO original FROM public.calendar_events
  WHERE organization_id = p_org AND id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'schedule_not_found' USING ERRCODE = '42501'; END IF;
  IF p_version IS DISTINCT FROM original.row_version THEN
    RAISE EXCEPTION 'schedule_stale' USING ERRCODE = '40001';
  END IF;
  candidate := pg_catalog.jsonb_populate_record(original, p_patch);
  IF original.status NOT IN ('draft', 'scheduled')
    OR candidate.status IS NULL
    OR (candidate.status <> original.status AND candidate.status <> 'cancelled'
      AND NOT (original.status = 'draft' AND candidate.status = 'scheduled'))
    OR (candidate.status = 'cancelled' AND p_patch <> '{"status":"cancelled"}'::jsonb)
    OR candidate.starts_at IS NULL OR candidate.ends_at IS NULL
    OR candidate.ends_at <= candidate.starts_at
    OR NOT pg_catalog.isfinite(candidate.starts_at) OR NOT pg_catalog.isfinite(candidate.ends_at) THEN
    RAISE EXCEPTION 'schedule_invalid' USING ERRCODE = '22023';
  END IF;

  IF original.status = 'draft' AND candidate.status = 'scheduled' THEN
    members := private.schedule_participants(p_org, original.course_id);
    IF members IS NULL THEN
      RAISE EXCEPTION 'schedule_attendees' USING ERRCODE = '22023';
    END IF;
  END IF;

  UPDATE public.calendar_events
  SET title = pg_catalog.btrim(candidate.title),
      description = nullif(pg_catalog.btrim(candidate.description), ''),
      modality = nullif(candidate.modality, ''),
      location = nullif(pg_catalog.btrim(candidate.location), ''),
      starts_at = candidate.starts_at, ends_at = candidate.ends_at, status = candidate.status
  WHERE organization_id = p_org AND id = p_id RETURNING row_version INTO current_version;
  IF members IS NOT NULL THEN
    INSERT INTO public.calendar_event_attendees (organization_id, event_id, membership_id)
    SELECT p_org, p_id, member_id FROM pg_catalog.unnest(members) member_id
    ON CONFLICT (organization_id, event_id, membership_id) DO UPDATE SET status = 'active';
  END IF;
  RETURN current_version;
END;
$$;

CREATE FUNCTION public.list_schedule(
  p_org uuid, p_from date, p_to date, p_admin boolean, p_course text
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  member_id uuid := private.member_id(p_org);
  course_filter uuid := nullif(p_course, '')::uuid;
  window_start timestamptz;
  window_end timestamptz;
BEGIN
  IF member_id IS NULL OR p_admin IS NULL OR (p_admin AND NOT private.org_admin(p_org)) THEN
    RAISE EXCEPTION 'schedule_forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_from IS NULL OR p_to IS NULL OR NOT pg_catalog.isfinite(p_from)
    OR NOT pg_catalog.isfinite(p_to) OR p_to - p_from NOT BETWEEN 1 AND 42 THEN
    RAISE EXCEPTION 'schedule_invalid' USING ERRCODE = '22023';
  END IF;
  window_start := p_from::timestamp AT TIME ZONE 'America/Lima';
  window_end := p_to::timestamp AT TIME ZONE 'America/Lima';

  RETURN (
    WITH courses AS (
      SELECT c.id, c.title, c.status
      FROM public.courses c
      WHERE c.organization_id = p_org AND (
        p_admin OR (
          c.status = 'published' AND EXISTS (
            SELECT 1 FROM public.enrollments en
            JOIN public.organization_memberships m ON m.organization_id = en.organization_id AND m.id = en.membership_id
            WHERE en.organization_id = p_org AND en.course_id = c.id
              AND en.membership_id = member_id AND en.status = 'active' AND m.role = 'student'
          )
        )
      )
    ), sessions AS (
      SELECT e.id, e.course_id, e.title, e.description, e.modality, e.location,
        e.starts_at, e.ends_at, e.status, e.series_id,
        CASE WHEN p_admin THEN e.row_version END AS row_version,
        CASE WHEN p_admin THEN EXISTS (
          SELECT 1 FROM public.attendance_records a
          WHERE a.organization_id = p_org AND a.event_id = e.id
        ) ELSE false END AS attendance_locked
      FROM public.calendar_events e
      JOIN courses c ON c.id = e.course_id
      WHERE e.organization_id = p_org
        AND (course_filter IS NULL OR e.course_id = course_filter)
        AND e.starts_at < window_end AND e.ends_at > window_start
        AND (p_admin OR (
          (e.lesson_id IS NULL OR private.lesson_access(p_org, e.lesson_id))
          AND (e.status = 'scheduled' OR (
            e.status = 'cancelled' AND (
              SELECT pg_catalog.bool_and(last_change.previous_status = 'scheduled')
              FROM (
                SELECT a.changes->>'previous_status' AS previous_status
                FROM public.audit_events a
                WHERE a.organization_id = p_org AND a.entity_type = 'public.calendar_events'
                  AND a.entity_id = e.id AND a.changes->>'status' = 'cancelled'
                  AND a.changes->'changed_fields' ? 'status'
                ORDER BY a.occurred_at DESC FETCH FIRST 1 ROW WITH TIES
              ) last_change
            )
          ))
        ))
      ORDER BY e.starts_at, e.id LIMIT 1001
    )
    SELECT pg_catalog.jsonb_build_object(
      'courses', coalesce((SELECT pg_catalog.jsonb_agg(c ORDER BY c.title, c.id) FROM courses c), '[]'::jsonb),
      'sessions', coalesce((SELECT pg_catalog.jsonb_agg(s ORDER BY s.starts_at, s.id) FROM sessions s), '[]'::jsonb)
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_schedule_sessions(uuid,uuid,date[],time,time,boolean,jsonb),
  public.update_schedule_session(uuid,uuid,bigint,jsonb),
  public.list_schedule(uuid,date,date,boolean,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_schedule_sessions(uuid,uuid,date[],time,time,boolean,jsonb),
  public.update_schedule_session(uuid,uuid,bigint,jsonb),
  public.list_schedule(uuid,date,date,boolean,text) TO authenticated;

COMMIT;
