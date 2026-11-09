BEGIN;
CREATE TABLE public.attendance_records(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL,
 event_id uuid NOT NULL, membership_id uuid NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','present','absent','late')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 row_version bigint NOT NULL DEFAULT 1,
 UNIQUE(organization_id,event_id,membership_id),
 FOREIGN KEY(organization_id,event_id) REFERENCES public.calendar_events(organization_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(organization_id,event_id,membership_id) REFERENCES public.calendar_event_attendees(organization_id,event_id,membership_id) ON DELETE RESTRICT
);
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.attendance_records FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.attendance_records TO authenticated;
CREATE POLICY attendance_read ON public.attendance_records FOR SELECT TO authenticated USING(private.org_admin(organization_id) OR (membership_id=private.member_id(organization_id) AND private.event_access(organization_id,event_id)));
CREATE FUNCTION public.set_attendance(p_organization_id uuid,p_event_id uuid,p_membership_id uuid,p_status text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_event public.calendar_events;
BEGIN
 IF NOT private.org_admin(p_organization_id) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 IF p_status NOT IN ('present','absent','late') THEN RAISE EXCEPTION 'invalid status' USING ERRCODE='22023'; END IF;
 SELECT * INTO v_event FROM public.calendar_events WHERE organization_id=p_organization_id AND id=p_event_id FOR UPDATE;
 IF NOT FOUND OR v_event.status<>'scheduled' OR (v_event.starts_at AT TIME ZONE 'America/Lima')::date <> (now() AT TIME ZONE 'America/Lima')::date THEN RAISE EXCEPTION 'attendance date closed' USING ERRCODE='22023'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.calendar_event_attendees a WHERE a.organization_id=p_organization_id AND a.event_id=p_event_id AND a.membership_id=p_membership_id AND a.status='active') THEN RAISE EXCEPTION 'not attendee' USING ERRCODE='42501'; END IF;
 INSERT INTO public.attendance_records(organization_id,event_id,membership_id,status) VALUES(p_organization_id,p_event_id,p_membership_id,p_status)
 ON CONFLICT(organization_id,event_id,membership_id) DO UPDATE SET status=excluded.status,updated_at=now(),row_version=public.attendance_records.row_version+1;
END $$;
REVOKE ALL ON FUNCTION public.set_attendance(uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.set_attendance(uuid,uuid,uuid,text) TO authenticated;
CREATE FUNCTION private.seed_attendance() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN IF NEW.status='active' THEN INSERT INTO public.attendance_records(organization_id,event_id,membership_id) VALUES(NEW.organization_id,NEW.event_id,NEW.membership_id) ON CONFLICT DO NOTHING; END IF; RETURN NEW; END $$;
REVOKE ALL ON FUNCTION private.seed_attendance() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER seed_attendance AFTER INSERT OR UPDATE OF status ON public.calendar_event_attendees FOR EACH ROW EXECUTE FUNCTION private.seed_attendance();
INSERT INTO public.attendance_records(organization_id,event_id,membership_id)
SELECT organization_id,event_id,membership_id FROM public.calendar_event_attendees WHERE status='active' ON CONFLICT DO NOTHING;
COMMIT;
