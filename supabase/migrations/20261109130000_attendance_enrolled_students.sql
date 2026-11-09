BEGIN;

-- La asistencia corresponde a la matrícula al taller; no exige una asignación manual al evento.
DO $$ DECLARE fk record; BEGIN
  FOR fk IN
    SELECT conname FROM pg_catalog.pg_constraint
    WHERE conrelid='public.attendance_records'::regclass
      AND confrelid='public.calendar_event_attendees'::regclass
      AND contype='f'
  LOOP
    EXECUTE pg_catalog.format(
      'ALTER TABLE public.attendance_records DROP CONSTRAINT %I', fk.conname
    );
  END LOOP;
END $$;
ALTER TABLE public.attendance_records
  ADD CONSTRAINT attendance_records_organization_id_membership_id_fkey
  FOREIGN KEY (organization_id, membership_id)
  REFERENCES public.organization_memberships(organization_id, id) ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION private.event_access(org uuid, event uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(
   SELECT 1 FROM public.calendar_events e
   WHERE e.organization_id=org AND e.id=event AND e.status='scheduled'
     AND private.course_access(org,e.course_id)
     AND (e.lesson_id IS NULL OR private.lesson_access(org,e.lesson_id))
 );
$$;

CREATE OR REPLACE FUNCTION public.set_attendance_batch(
  p_organization_id uuid,
  p_event_id uuid,
  p_records jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 v_event public.calendar_events;
 v_record jsonb;
 v_membership_id uuid;
 v_status text;
BEGIN
 IF NOT private.org_admin(p_organization_id) THEN
   RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
 END IF;
 IF pg_catalog.jsonb_typeof(p_records)<>'array'
   OR pg_catalog.jsonb_array_length(p_records)=0
   OR pg_catalog.jsonb_array_length(p_records)>500 THEN
   RAISE EXCEPTION 'invalid records' USING ERRCODE='22023';
 END IF;
 SELECT * INTO v_event FROM public.calendar_events
 WHERE organization_id=p_organization_id AND id=p_event_id FOR UPDATE;
 IF NOT FOUND OR v_event.status<>'scheduled'
   OR (v_event.starts_at AT TIME ZONE 'America/Lima')::date
      <> (now() AT TIME ZONE 'America/Lima')::date THEN
   RAISE EXCEPTION 'attendance date closed' USING ERRCODE='22023';
 END IF;
 IF (SELECT pg_catalog.count(DISTINCT item.value->>'membership_id')
     FROM pg_catalog.jsonb_array_elements(p_records) item)
    <> pg_catalog.jsonb_array_length(p_records) THEN
   RAISE EXCEPTION 'duplicate attendance row' USING ERRCODE='22023';
 END IF;
 FOR v_record IN SELECT value FROM pg_catalog.jsonb_array_elements(p_records)
 LOOP
   IF pg_catalog.jsonb_typeof(v_record)<>'object'
     OR v_record->>'status' NOT IN ('present','absent','late') THEN
     RAISE EXCEPTION 'invalid status' USING ERRCODE='22023';
   END IF;
   v_membership_id := (v_record->>'membership_id')::uuid;
   v_status := v_record->>'status';
   IF NOT EXISTS(
     SELECT 1 FROM public.enrollments e
     JOIN public.organization_memberships m
       ON m.organization_id=e.organization_id AND m.id=e.membership_id
     WHERE e.organization_id=p_organization_id AND e.course_id=v_event.course_id
       AND e.membership_id=v_membership_id AND e.status IN ('active','completed')
       AND m.role='student' AND m.status='active'
   ) THEN
     RAISE EXCEPTION 'not enrolled in course' USING ERRCODE='42501';
   END IF;
   INSERT INTO public.attendance_records(organization_id,event_id,membership_id,status)
   VALUES(p_organization_id,p_event_id,v_membership_id,v_status)
   ON CONFLICT(organization_id,event_id,membership_id) DO UPDATE
     SET status=excluded.status,updated_at=now(),
         row_version=public.attendance_records.row_version+1;
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.set_attendance(
  p_organization_id uuid,
  p_event_id uuid,
  p_membership_id uuid,
  p_status text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM public.set_attendance_batch(
   p_organization_id,p_event_id,
   pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
     'membership_id',p_membership_id,'status',p_status
   ))
 );
END $$;
REVOKE ALL ON FUNCTION public.set_attendance_batch(uuid,uuid,jsonb)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.set_attendance_batch(uuid,uuid,jsonb)
  TO authenticated;

DROP POLICY IF EXISTS attendance_read ON public.attendance_records;
CREATE POLICY attendance_read ON public.attendance_records FOR SELECT TO authenticated
USING (
 private.org_admin(organization_id)
 OR (
   membership_id=private.member_id(organization_id)
   AND private.event_access(organization_id,event_id)
 )
);

INSERT INTO public.attendance_records(organization_id,event_id,membership_id)
SELECT ev.organization_id,ev.id,en.membership_id
FROM public.calendar_events ev
JOIN public.enrollments en ON en.organization_id=ev.organization_id
  AND en.course_id=ev.course_id AND en.status IN ('active','completed')
JOIN public.organization_memberships m ON m.organization_id=en.organization_id
  AND m.id=en.membership_id AND m.role='student' AND m.status='active'
WHERE ev.status='scheduled'
ON CONFLICT(organization_id,event_id,membership_id) DO NOTHING;

COMMIT;
