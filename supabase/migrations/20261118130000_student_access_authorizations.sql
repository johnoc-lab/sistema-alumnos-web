BEGIN;

CREATE OR REPLACE FUNCTION private.valid_staff_permissions(rank text, modules text[]) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT CASE
    WHEN modules IS NULL OR coalesce(pg_catalog.array_ndims(modules),1) <> 1 THEN false
    ELSE coalesce(rank IN ('principal','administrator','teacher','secretary')
      AND pg_catalog.array_position(modules,NULL) IS NULL
      AND modules <@ ARRAY['students','courses','enrollments','schedule','attendance','materials','announcements',
        'certificates','certificates.recommend','certificates.approve','student_access']::text[]
      AND pg_catalog.cardinality(modules)=(SELECT count(DISTINCT m) FROM pg_catalog.unnest(modules) m)
      AND (rank<>'principal' OR pg_catalog.cardinality(modules)=0)
      AND (NOT ('certificates.recommend'=ANY(modules)) OR (rank='teacher' AND 'certificates'=ANY(modules)))
      AND (NOT ('certificates.approve'=ANY(modules)) OR (rank='administrator' AND 'certificates'=ANY(modules)))
      AND (NOT ('student_access'=ANY(modules)) OR rank='secretary'),false)
  END;
$$;

CREATE TABLE private.student_access_authorizations (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  purpose text NOT NULL CHECK (purpose IN ('enroll','recover')),
  recipient_ref text NOT NULL CHECK (recipient_ref ~ '^[a-z0-9][a-z0-9._-]{2,63}$'),
  evidence_ref text NOT NULL CHECK (evidence_ref ~ '^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$'),
  issued_by uuid NOT NULL REFERENCES public.profiles(id),
  code_digest text NOT NULL CHECK (code_digest ~ '^[0-9a-f]{64}$'),
  proof_digest text NOT NULL CHECK (proof_digest ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  claimed_at timestamptz,
  attempt_id uuid,
  password_changed_at timestamptz,
  password_rejected_at timestamptz,
  sessions_revoked_at timestamptz,
  completed_at timestamptz,
  revoked_at timestamptz,
  identifier text CHECK (identifier ~ '^u-[a-z0-9]+@cuentas[.]sistema-alumnos[.]invalid$' AND length(identifier)<=254),
  auth_user_id uuid REFERENCES auth.users(id),
  CHECK (code_digest<>proof_digest AND expires_at>created_at),
  CHECK ((claimed_at IS NULL)=(attempt_id IS NULL)),
  CHECK (password_changed_at IS NULL OR (auth_user_id IS NOT NULL AND attempt_id IS NOT NULL AND password_rejected_at IS NULL)),
  CHECK (password_rejected_at IS NULL OR (auth_user_id IS NOT NULL AND attempt_id IS NOT NULL)),
  CHECK (sessions_revoked_at IS NULL OR password_changed_at IS NOT NULL),
  CHECK (purpose<>'recover' OR completed_at IS NULL OR sessions_revoked_at IS NOT NULL),
  CHECK (completed_at IS NULL OR (claimed_at IS NOT NULL AND auth_user_id IS NOT NULL AND revoked_at IS NULL)),
  CHECK (purpose<>'recover' OR (auth_user_id IS NOT NULL AND identifier IS NOT NULL))
);

CREATE UNIQUE INDEX student_access_one_authorization
  ON private.student_access_authorizations(organization_id, recipient_ref, purpose)
  WHERE revoked_at IS NULL AND (purpose='enroll' OR completed_at IS NULL);
CREATE UNIQUE INDEX student_access_reserved_identifier
  ON private.student_access_authorizations(identifier)
  WHERE purpose='enroll' AND revoked_at IS NULL;

ALTER TABLE private.student_access_authorizations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.student_access_authorizations FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION private.can_manage_student_access(p_org uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT coalesce(auth.jwt()->>'aal','')='aal2' AND EXISTS (
    SELECT 1 FROM public.organization_memberships m
    JOIN public.organizations o ON o.id=m.organization_id AND o.status='active'
      AND o.slug IN ('impulso-cero','incubadora')
    WHERE m.id=private.member_id(p_org) AND m.role='admin'
    AND (m.staff_rank='principal' OR (m.staff_rank='secretary' AND 'student_access'=ANY(m.allowed_modules)))
  );
$$;
REVOKE ALL ON FUNCTION private.can_manage_student_access(uuid) FROM PUBLIC, anon, authenticated, service_role;

-- Share the lock with staff reservations so a technical login cannot be
-- reserved simultaneously by the two workflows. Auth retains final uniqueness.
CREATE FUNCTION private.guard_student_access_identifier() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  login text;
BEGIN
  IF TG_TABLE_NAME='student_access_authorizations' THEN
    IF NEW.purpose<>'enroll' OR NEW.revoked_at IS NOT NULL THEN RETURN NEW; END IF;
    login:=NEW.identifier;
  ELSE
    IF NOT NEW.staff_registration OR NEW.status IN ('cancelled','failed') THEN RETURN NEW; END IF;
    login:=NEW.login_identifier;
  END IF;
  IF login IS NULL THEN RETURN NEW; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(login,20261118));
  IF TG_TABLE_NAME='student_access_authorizations' THEN
    IF EXISTS(SELECT 1 FROM private.identity_activation_requests r WHERE r.login_identifier=login
      AND r.status NOT IN ('cancelled','failed')) THEN RAISE unique_violation; END IF;
  ELSIF EXISTS(SELECT 1 FROM private.student_access_authorizations a WHERE a.identifier=login
    AND a.purpose='enroll' AND a.revoked_at IS NULL) THEN RAISE unique_violation;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.guard_student_access_identifier() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER student_access_identifier_guard BEFORE UPDATE OF identifier
  ON private.student_access_authorizations FOR EACH ROW EXECUTE FUNCTION private.guard_student_access_identifier();
CREATE TRIGGER staff_student_identifier_guard BEFORE INSERT
  ON private.identity_activation_requests FOR EACH ROW EXECUTE FUNCTION private.guard_student_access_identifier();

-- An organization can recover only a technical account it originally provisioned,
-- and never an identity with a staff membership.
CREATE FUNCTION private.student_recovery_target(p_org uuid, p_recipient text)
RETURNS TABLE (auth_id uuid, login_identifier text)
LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT u.id, u.email FROM private.student_access_authorizations a
  JOIN auth.users u ON u.id=a.auth_user_id
  JOIN public.profiles p ON p.auth_user_id=u.id AND p.status='active'
  JOIN public.organization_memberships m ON m.profile_id=p.id AND m.organization_id=p_org
  WHERE a.organization_id=p_org AND a.recipient_ref=p_recipient AND a.purpose='enroll'
    AND a.completed_at IS NOT NULL AND m.role='student' AND m.status='active'
    AND u.email=a.identifier AND u.email_confirmed_at IS NOT NULL
    AND NOT coalesce(u.is_anonymous,false) AND u.deleted_at IS NULL AND (u.banned_until IS NULL OR u.banned_until<=now())
    AND NOT EXISTS (SELECT 1 FROM public.organization_memberships staff
      WHERE staff.profile_id=p.id AND staff.role='admin' AND staff.status<>'archived');
$$;
REVOKE ALL ON FUNCTION private.student_recovery_target(uuid,text) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.issue_student_access(
  p_org uuid, p_id uuid, p_purpose text, p_recipient text, p_evidence text, p_code text, p_proof text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  target uuid;
  identifier text;
  actor uuid;
  issued_at timestamptz := clock_timestamp();
BEGIN
  IF NOT private.can_manage_student_access(p_org) THEN RAISE insufficient_privilege; END IF;
  actor := private.self_profile_id();
  IF p_purpose NOT IN ('enroll','recover') OR p_purpose IS NULL THEN RETURN false; END IF;
  IF NOT private.take_staff_activation_limit('target:'||pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to('student-issue:'||actor::text,'UTF8')),'hex'),12,issued_at) THEN RETURN false; END IF;
  IF p_purpose='recover' THEN
    SELECT auth_id,login_identifier INTO target,identifier
    FROM private.student_recovery_target(p_org,p_recipient);
    IF NOT FOUND THEN RETURN false; END IF;
  END IF;
  INSERT INTO private.student_access_authorizations(
    id, organization_id, purpose, recipient_ref, evidence_ref, issued_by, code_digest,
    proof_digest, created_at, expires_at, auth_user_id, identifier
  ) VALUES (
    p_id,p_org,p_purpose,p_recipient,p_evidence,actor,p_code,p_proof,issued_at,
    issued_at+CASE WHEN p_purpose='recover' THEN interval '15 minutes' ELSE interval '1 day' END,
    target,identifier
  ) ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN RETURN false; END IF;
  INSERT INTO public.audit_events(organization_id,actor_profile_id,actor_kind,action,entity_type,entity_id,changes)
  VALUES(p_org,actor,'user','INSERT','student_access_authorization',p_id,pg_catalog.jsonb_build_object('purpose',p_purpose));
  RETURN true;
END $$;

CREATE FUNCTION public.list_student_access(p_org uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NOT private.can_manage_student_access(p_org) THEN RAISE insufficient_privilege; END IF;
  RETURN (SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r) ORDER BY r.created_at DESC),'[]'::jsonb)
    FROM (SELECT a.id,a.recipient_ref,a.purpose,a.created_at,a.expires_at,
      CASE WHEN a.completed_at IS NOT NULL THEN 'completed'
           WHEN a.revoked_at IS NOT NULL THEN 'revoked'
           WHEN a.sessions_revoked_at IS NOT NULL THEN 'completion_pending'
           WHEN a.password_changed_at IS NOT NULL THEN 'revocation_pending'
           WHEN a.password_rejected_at IS NOT NULL THEN 'password_rejected'
           WHEN a.claimed_at IS NOT NULL AND a.auth_user_id IS NOT NULL THEN 'password_pending'
           WHEN a.claimed_at IS NOT NULL THEN 'processing'
           WHEN a.expires_at<=now() THEN 'expired' ELSE 'issued' END AS status
      FROM private.student_access_authorizations a WHERE a.organization_id=p_org
      ORDER BY a.created_at DESC LIMIT 50) r);
END $$;

CREATE FUNCTION public.revoke_student_access(p_org uuid, p_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NOT private.can_manage_student_access(p_org) THEN RAISE insufficient_privilege; END IF;
  UPDATE private.student_access_authorizations SET revoked_at=clock_timestamp()
    WHERE id=p_id AND organization_id=p_org AND revoked_at IS NULL AND completed_at IS NULL
      AND claimed_at IS NULL;
  IF NOT FOUND THEN RETURN false; END IF;
  INSERT INTO public.audit_events(organization_id,actor_profile_id,actor_kind,action,entity_type,entity_id,changes)
  VALUES(p_org,private.self_profile_id(),'user','UPDATE','student_access_authorization',p_id,'{"status":"revoked"}');
  RETURN true;
END $$;

-- Reissue requires a new verification reference and cannot race the live Auth call.
CREATE FUNCTION public.reissue_student_access(
  p_org uuid, p_id uuid, p_evidence text, p_code text, p_proof text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  a private.student_access_authorizations;
  current_at timestamptz := clock_timestamp();
  actor uuid;
  bound_auth uuid;
  preserve_attempt boolean;
BEGIN
  IF NOT private.can_manage_student_access(p_org) THEN RAISE insufficient_privilege; END IF;
  actor := private.self_profile_id();
  IF NOT private.take_staff_activation_limit('target:'||pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to('student-issue:'||actor::text,'UTF8')),'hex'),12,current_at) THEN RETURN false; END IF;
  SELECT * INTO a FROM private.student_access_authorizations WHERE id=p_id AND organization_id=p_org FOR UPDATE;
  IF NOT FOUND OR a.revoked_at IS NOT NULL OR a.completed_at IS NOT NULL
    OR (a.claimed_at IS NULL AND a.expires_at>current_at)
    OR a.evidence_ref IS NOT DISTINCT FROM p_evidence
    OR p_code IN (a.code_digest,a.proof_digest) OR p_proof IN (a.code_digest,a.proof_digest)
    OR a.claimed_at>current_at-interval '5 minutes' THEN RETURN false; END IF;
  IF a.purpose='enroll' AND a.identifier IS NOT NULL THEN
    SELECT u.id INTO bound_auth FROM auth.users u WHERE u.email=a.identifier
      AND u.raw_app_meta_data->>'student_access_authorization'=a.id::text
      AND u.email_confirmed_at IS NOT NULL AND NOT coalesce(u.is_anonymous,false)
      AND u.deleted_at IS NULL AND (u.banned_until IS NULL OR u.banned_until<=now())
      AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.auth_user_id=u.id);
    IF a.auth_user_id IS NOT NULL AND bound_auth IS DISTINCT FROM a.auth_user_id THEN RETURN false; END IF;
  ELSIF a.purpose='recover' THEN
    IF NOT EXISTS (
      SELECT 1 FROM private.student_recovery_target(p_org,a.recipient_ref) t
      WHERE t.auth_id=a.auth_user_id AND t.login_identifier=a.identifier
    ) THEN RETURN false; END IF;
    bound_auth := a.auth_user_id;
  END IF;
  -- A reissue proves the recipient again. It rotates the proofs but cannot
  -- restart an uncertain Auth write. An explicitly rejected attempt can restart.
  preserve_attempt := a.auth_user_id IS NOT NULL AND a.password_rejected_at IS NULL;
  UPDATE private.student_access_authorizations SET
    auth_user_id=bound_auth,
    claimed_at=CASE WHEN preserve_attempt THEN a.claimed_at END,
    attempt_id=CASE WHEN preserve_attempt THEN a.attempt_id END,
    password_rejected_at=NULL,
    evidence_ref=p_evidence, code_digest=p_code, proof_digest=p_proof,
    expires_at=current_at+CASE WHEN a.purpose='recover' THEN interval '15 minutes' ELSE interval '1 day' END
    WHERE id=a.id;
  INSERT INTO public.audit_events(organization_id,actor_profile_id,actor_kind,action,entity_type,entity_id,changes)
  VALUES(p_org,actor,'user','UPDATE','student_access_authorization',p_id,'{"status":"reissued"}');
  RETURN true;
END $$;

-- Record provider evidence and revocation separately. The marker is specific to
-- the attempt and written by Auth with the password. Replays never repeat it.
CREATE FUNCTION public.record_student_access_progress(
  p_id uuid, p_attempt uuid, p_auth uuid, p_stage text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  a private.student_access_authorizations;
  marker_matches boolean;
BEGIN
  SELECT * INTO a FROM private.student_access_authorizations WHERE id=p_id FOR UPDATE;
  IF NOT FOUND OR a.attempt_id IS NULL OR p_attempt IS DISTINCT FROM a.attempt_id
    OR a.auth_user_id IS NULL OR p_auth IS DISTINCT FROM a.auth_user_id
    OR a.revoked_at IS NOT NULL THEN RETURN false; END IF;
  SELECT coalesce(u.raw_app_meta_data->>'student_access_password_attempt'=a.attempt_id::text,false)
    INTO marker_matches FROM auth.users u WHERE u.id=p_auth AND u.email=a.identifier;
  IF NOT FOUND THEN RETURN false; END IF;
  CASE p_stage
    WHEN 'password_changed' THEN
      IF a.password_changed_at IS NOT NULL THEN RETURN true; END IF;
      IF NOT marker_matches OR a.password_rejected_at IS NOT NULL THEN RETURN false; END IF;
      UPDATE private.student_access_authorizations SET password_changed_at=clock_timestamp() WHERE id=a.id;
    WHEN 'password_rejected' THEN
      IF a.password_rejected_at IS NOT NULL THEN RETURN true; END IF;
      IF marker_matches OR a.password_changed_at IS NOT NULL THEN RETURN false; END IF;
      UPDATE private.student_access_authorizations SET password_rejected_at=clock_timestamp() WHERE id=a.id;
    WHEN 'sessions_revoked' THEN
      IF a.sessions_revoked_at IS NOT NULL THEN RETURN true; END IF;
      IF NOT marker_matches OR a.password_changed_at IS NULL THEN RETURN false; END IF;
      UPDATE private.student_access_authorizations SET sessions_revoked_at=clock_timestamp() WHERE id=a.id;
    ELSE RETURN false;
  END CASE;
  INSERT INTO public.audit_events(organization_id,actor_kind,action,entity_type,entity_id,request_id,changes)
  VALUES(a.organization_id,'system','UPDATE','student_access_authorization',a.id,a.attempt_id,
    pg_catalog.jsonb_build_object('purpose',a.purpose,'status',p_stage));
  RETURN true;
END $$;

CREATE FUNCTION public.claim_student_access(
  p_id uuid, p_slug text, p_purpose text, p_code text, p_proof text, p_identifier text, p_network text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  a private.student_access_authorizations;
  current_at timestamptz := clock_timestamp();
  phase text;
BEGIN
  IF p_id IS NULL OR p_code IS NULL OR p_proof IS NULL OR p_code !~ '^[0-9a-f]{64}$'
    OR p_proof !~ '^[0-9a-f]{64}$' OR p_purpose NOT IN ('enroll','recover')
    OR coalesce(p_network,'') !~ '^(|[0-9a-f]{64})$' THEN RETURN NULL; END IF;
  IF nullif(p_network,'') IS NOT NULL
    AND NOT private.take_staff_activation_limit('network:'||pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to('student-network:'||p_network,'UTF8')),'hex'),30,current_at) THEN RETURN NULL; END IF;
  SELECT * INTO a FROM private.student_access_authorizations WHERE id=p_id FOR UPDATE;
  IF NOT FOUND OR a.revoked_at IS NOT NULL OR a.completed_at IS NOT NULL
    OR a.purpose IS DISTINCT FROM p_purpose OR a.expires_at<=current_at
    OR NOT EXISTS (SELECT 1 FROM public.organizations o WHERE o.id=a.organization_id
      AND o.status='active' AND o.slug=p_slug) THEN RETURN NULL; END IF;
  IF NOT private.take_staff_activation_limit('target:'||pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to('student-claim:'||a.id::text,'UTF8')),'hex'),8,current_at)
    OR a.code_digest<>p_code OR a.proof_digest<>p_proof THEN RETURN NULL; END IF;
  IF a.purpose='recover' THEN
    IF NOT EXISTS (
      SELECT 1 FROM private.student_recovery_target(a.organization_id,a.recipient_ref) t
      WHERE t.auth_id=a.auth_user_id AND t.login_identifier=a.identifier
    ) THEN RETURN NULL; END IF;
  ELSE
    IF p_identifier IS NULL OR length(p_identifier)>254
      OR p_identifier !~ '^u-[a-z0-9]+@cuentas[.]sistema-alumnos[.]invalid$'
      OR (a.identifier IS NOT NULL AND a.identifier<>p_identifier) THEN RETURN NULL; END IF;
    IF a.auth_user_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM auth.users u WHERE u.id=a.auth_user_id AND u.email=a.identifier
        AND u.email_confirmed_at IS NOT NULL AND NOT coalesce(u.is_anonymous,false)
        AND u.deleted_at IS NULL AND (u.banned_until IS NULL OR u.banned_until<=now())
        AND u.raw_app_meta_data->>'student_access_authorization'=a.id::text
        AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.auth_user_id=u.id)
    ) THEN RETURN NULL; END IF;
  END IF;

  IF a.attempt_id IS NULL THEN
    IF a.auth_user_id IS NULL THEN
      IF EXISTS(SELECT 1 FROM auth.users u WHERE lower(u.email)=p_identifier)
        OR EXISTS(SELECT 1 FROM private.identity_activation_requests r WHERE r.login_identifier=p_identifier
          AND r.status NOT IN ('cancelled','failed')) THEN RETURN NULL; END IF;
      a.identifier := p_identifier;
      phase := 'create_account';
    ELSE
      phase := 'update_password';
    END IF;
    a.attempt_id := pg_catalog.gen_random_uuid();
    BEGIN
      UPDATE private.student_access_authorizations
        SET claimed_at=current_at,attempt_id=a.attempt_id,identifier=a.identifier WHERE id=a.id;
    EXCEPTION WHEN unique_violation THEN RETURN NULL;
    END;
  ELSIF a.auth_user_id IS NULL OR a.password_rejected_at IS NOT NULL THEN
    -- A created-but-unlinked identity can only be bound by a new supervised reissue.
    RETURN NULL;
  ELSIF a.sessions_revoked_at IS NOT NULL THEN
    phase := 'finalize';
  ELSIF public.record_student_access_progress(a.id,a.attempt_id,a.auth_user_id,'password_changed') THEN
    phase := 'revoke_sessions';
  ELSE
    phase := 'password_pending';
  END IF;
  RETURN pg_catalog.jsonb_build_object('id',a.id,'attemptId',a.attempt_id,'phase',phase,
    'identifier',a.identifier,'authUserId',a.auth_user_id);
END $$;

CREATE FUNCTION public.finalize_student_access(
  p_id uuid, p_attempt uuid, p_auth uuid, p_first text, p_last text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  a private.student_access_authorizations;
  profile uuid;
BEGIN
  SELECT * INTO a FROM private.student_access_authorizations WHERE id=p_id FOR UPDATE;
  IF NOT FOUND OR a.attempt_id IS NULL OR p_attempt IS DISTINCT FROM a.attempt_id OR a.revoked_at IS NOT NULL
    OR NOT EXISTS (SELECT 1 FROM public.organizations o WHERE o.id=a.organization_id AND o.status='active')
    THEN RETURN false; END IF;
  IF a.completed_at IS NOT NULL THEN RETURN a.auth_user_id=p_auth; END IF;
  IF a.auth_user_id IS NOT NULL AND (a.auth_user_id IS DISTINCT FROM p_auth OR a.sessions_revoked_at IS NULL)
    THEN RETURN false; END IF;
  IF a.purpose='recover' THEN
    IF NOT EXISTS (
      SELECT 1 FROM private.student_recovery_target(a.organization_id,a.recipient_ref) t
      WHERE t.auth_id=p_auth AND t.login_identifier=a.identifier
    ) THEN RETURN false; END IF;
  ELSE
    IF coalesce(length(btrim(p_first)),0) NOT BETWEEN 1 AND 100
      OR coalesce(length(btrim(p_last)),0) NOT BETWEEN 1 AND 100 THEN RETURN false; END IF;
    PERFORM 1 FROM auth.users u WHERE u.id=p_auth AND u.email=a.identifier
      AND u.email_confirmed_at IS NOT NULL AND NOT coalesce(u.is_anonymous,false)
      AND u.deleted_at IS NULL AND (u.banned_until IS NULL OR u.banned_until<=now())
      AND u.raw_app_meta_data->>'student_access_authorization'=a.id::text FOR UPDATE;
    IF NOT FOUND OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.auth_user_id=p_auth)
      THEN RETURN false; END IF;
    INSERT INTO public.profiles(auth_user_id,display_name,status)
      VALUES(p_auth,pg_catalog.concat_ws(' ',btrim(p_first),btrim(p_last)),'active') RETURNING id INTO profile;
    INSERT INTO public.organization_memberships(
      organization_id,profile_id,role,status,first_name,last_name,contact_email,joined_at
    ) VALUES(a.organization_id,profile,'student','active',btrim(p_first),btrim(p_last),NULL,now());
  END IF;
  UPDATE private.student_access_authorizations SET auth_user_id=p_auth,completed_at=clock_timestamp() WHERE id=a.id;
  INSERT INTO public.audit_events(organization_id,actor_kind,action,entity_type,entity_id,changes)
  VALUES(a.organization_id,'system','UPDATE','student_access_authorization',a.id,
    pg_catalog.jsonb_build_object('purpose',a.purpose,'status','completed'));
  RETURN true;
END $$;

REVOKE ALL ON FUNCTION public.issue_student_access(uuid,uuid,text,text,text,text,text),
  public.list_student_access(uuid), public.revoke_student_access(uuid,uuid),
  public.reissue_student_access(uuid,uuid,text,text,text),
  public.claim_student_access(uuid,text,text,text,text,text,text),
  public.record_student_access_progress(uuid,uuid,uuid,text),
  public.finalize_student_access(uuid,uuid,uuid,text,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.issue_student_access(uuid,uuid,text,text,text,text,text),
  public.list_student_access(uuid), public.revoke_student_access(uuid,uuid),
  public.reissue_student_access(uuid,uuid,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_student_access(uuid,text,text,text,text,text,text),
  public.record_student_access_progress(uuid,uuid,uuid,text),
  public.finalize_student_access(uuid,uuid,uuid,text,text) TO service_role;

COMMIT;

