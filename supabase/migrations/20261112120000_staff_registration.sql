BEGIN;

ALTER TABLE private.identity_activation_requests
  ADD COLUMN staff_registration boolean NOT NULL DEFAULT false,
  ADD COLUMN activation_digest text,
  ADD COLUMN activation_expires_at timestamptz,
  ADD COLUMN activation_claim uuid,
  ADD CONSTRAINT staff_registration_state CHECK (
    (
      NOT staff_registration AND activation_digest IS NULL
      AND activation_expires_at IS NULL AND activation_claim IS NULL
    ) OR (
      staff_registration AND verification_kind='institutional_assignment'
      AND (
        (status='requested' AND auth_user_id IS NULL AND activation_digest IS NULL
          AND activation_expires_at IS NULL AND activation_claim IS NULL)
        OR (status='invited' AND (
          (activation_digest IS NOT NULL AND activation_digest ~ '^[0-9a-f]{64}$'
            AND activation_expires_at IS NOT NULL AND activation_claim IS NULL)
          OR (activation_digest IS NULL AND activation_expires_at IS NULL)
        ))
        OR (status IN ('linked','cancelled') AND activation_digest IS NULL AND activation_expires_at IS NULL
          AND activation_claim IS NULL)
      )
    )
  );

CREATE UNIQUE INDEX staff_registration_identifier_key
  ON private.identity_activation_requests(login_identifier) WHERE staff_registration;
CREATE INDEX staff_registration_recent_idx
  ON private.identity_activation_requests(organization_id,created_at) WHERE staff_registration;

-- Contadores compartidos entre instancias. Las claves contienen solo hashes.
CREATE TABLE private.staff_activation_limits (
  bucket text PRIMARY KEY CHECK (bucket ~ '^(network|target):[0-9a-f]{64}$'),
  expires_at timestamptz NOT NULL,
  attempts smallint NOT NULL CHECK (attempts BETWEEN 1 AND 30)
);
CREATE INDEX staff_activation_limits_expiry_idx ON private.staff_activation_limits(expires_at);
ALTER TABLE private.staff_activation_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.staff_activation_limits FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.take_staff_activation_limit(p_bucket text,p_max integer,p_now timestamptz)
RETURNS boolean LANGUAGE plpgsql SET search_path='' AS $$
DECLARE accepted boolean;
BEGIN
  INSERT INTO private.staff_activation_limits AS limits(bucket,expires_at,attempts)
  VALUES(p_bucket,p_now+interval '5 minutes',1)
  ON CONFLICT (bucket) DO UPDATE SET
    expires_at=CASE WHEN limits.expires_at<=p_now THEN excluded.expires_at ELSE limits.expires_at END,
    attempts=CASE WHEN limits.expires_at<=p_now THEN 1 ELSE limits.attempts+1 END
  WHERE limits.expires_at<=p_now OR limits.attempts<p_max
  RETURNING true INTO accepted;
  RETURN coalesce(accepted,false);
END;
$$;

CREATE FUNCTION private.staff_registration_principal(p_org uuid,p_actor uuid)
RETURNS uuid LANGUAGE sql SET search_path='' AS $$
  SELECT m.id FROM public.organization_memberships m JOIN public.profiles p ON p.id=m.profile_id
  WHERE m.organization_id=p_org AND p.id=p_actor AND p.status='active'
    AND m.role='admin' AND m.staff_rank='principal' AND m.status='active'
  FOR SHARE OF m,p;
$$;

-- Solo la identidad creada para esta operación puede vincularse, aunque exista otro Auth con el mismo login.
CREATE FUNCTION private.staff_registration_identity(p_registration uuid,p_identifier text)
RETURNS uuid LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT u.id FROM auth.users u
  WHERE u.email=p_identifier
    AND u.raw_app_meta_data->>'staff_registration_id'=p_registration::text
    AND private.staff_login_identifier(u.id)=p_identifier;
$$;

CREATE FUNCTION public.reserve_staff_registration(
  p_org uuid,p_actor uuid,p_aal text,p_identifier text,p_first_name text,p_last_name text,p_rank text,p_modules text[]
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  registration uuid := pg_catalog.gen_random_uuid();
  actor uuid;
  person uuid;
  member uuid;
BEGIN
  -- El servidor obtiene el actor y AAL de la sesión verificada, nunca del formulario.
  PERFORM 1 FROM public.organizations WHERE id=p_org AND status='active' FOR UPDATE;
  IF NOT FOUND OR p_aal IS DISTINCT FROM 'aal2' THEN
    RAISE EXCEPTION 'Alta no autorizada' USING ERRCODE='42501';
  END IF;
  actor := private.staff_registration_principal(p_org,p_actor);
  IF actor IS NULL THEN
    RAISE EXCEPTION 'Alta no autorizada' USING ERRCODE='42501';
  END IF;
  IF p_identifier IS NULL OR length(p_identifier)>254
    OR p_identifier !~ '^u-[a-z0-9]+@cuentas[.]sistema-alumnos[.]invalid$'
    OR coalesce(length(btrim(p_first_name)),0) NOT BETWEEN 1 AND 100
    OR coalesce(length(btrim(p_last_name)),0) NOT BETWEEN 1 AND 100
    OR p_rank IS NULL OR p_rank NOT IN ('administrator','teacher','secretary')
    OR NOT coalesce(private.valid_staff_permissions(p_rank,p_modules),false)
    OR p_modules && ARRAY['certificates','certificates.recommend','certificates.approve']::text[] THEN
    RAISE EXCEPTION 'Datos de personal inválidos' USING ERRCODE='22023';
  END IF;

  IF EXISTS (SELECT 1 FROM auth.users WHERE lower(email)=p_identifier)
    OR EXISTS (SELECT 1 FROM private.identity_activation_requests WHERE staff_registration AND login_identifier=p_identifier) THEN
    RAISE EXCEPTION 'Identificador no disponible' USING ERRCODE='23505';
  END IF;
  IF (SELECT count(*) FROM private.identity_activation_requests
      WHERE organization_id=p_org AND staff_registration
        AND created_at>=clock_timestamp()-interval '5 minutes')>=10 THEN
    RAISE EXCEPTION 'Límite temporal de altas' USING ERRCODE='54000';
  END IF;

  INSERT INTO public.profiles(display_name,status)
  VALUES(pg_catalog.concat_ws(' ',btrim(p_first_name),btrim(p_last_name)),'pending')
  RETURNING id INTO person;
  INSERT INTO public.organization_memberships(
    organization_id,profile_id,role,status,staff_rank,allowed_modules,first_name,last_name,
    created_by_membership_id,updated_by_membership_id
  ) VALUES(p_org,person,'admin','invited',p_rank,p_modules,btrim(p_first_name),btrim(p_last_name),actor,actor)
  RETURNING id INTO member;
  INSERT INTO private.identity_activation_requests(
    id,organization_id,profile_id,membership_id,status,idempotency_key,verified_at,
    verification_kind,login_identifier,verified_by_ref,verification_evidence_ref,staff_registration
  ) VALUES(registration,p_org,person,member,'requested',registration,transaction_timestamp(),
    'institutional_assignment',p_identifier,p_actor::text,'panel-staff:'||registration::text,true);
  RETURN registration;
END;
$$;

CREATE FUNCTION public.staff_registration_delivery(p_org uuid,p_registration uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE registration private.identity_activation_requests;
BEGIN
  PERFORM private.require_admin(p_org);
  SELECT * INTO registration FROM private.identity_activation_requests
    WHERE id=p_registration AND organization_id=p_org AND staff_registration
      AND status IN ('requested','invited');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Alta no disponible' USING ERRCODE='42501';
  END IF;
  RETURN pg_catalog.jsonb_build_object(
    'identifier',registration.login_identifier,'actor',private.actor_profile_id(),
    'authReady',private.staff_registration_identity(registration.id,registration.login_identifier) IS NOT NULL,
    'claim',registration.activation_claim
  );
END;
$$;

CREATE FUNCTION public.issue_staff_activation(p_org uuid,p_registration uuid,p_actor uuid,p_digest text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  registration private.identity_activation_requests;
  identity_id uuid;
BEGIN
  PERFORM 1 FROM public.organizations WHERE id=p_org AND status='active' FOR UPDATE;
  IF NOT FOUND OR p_digest IS NULL OR p_digest !~ '^[0-9a-f]{64}$' THEN RETURN false; END IF;
  IF private.staff_registration_principal(p_org,p_actor) IS NULL THEN RETURN false; END IF;

  SELECT * INTO registration FROM private.identity_activation_requests
    WHERE id=p_registration AND organization_id=p_org AND staff_registration
      AND status IN ('requested','invited') AND activation_claim IS NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  identity_id := private.staff_registration_identity(registration.id,registration.login_identifier);
  IF identity_id IS NULL OR (registration.auth_user_id IS NOT NULL AND registration.auth_user_id<>identity_id) THEN
    RETURN false;
  END IF;

  UPDATE public.profiles SET auth_user_id=identity_id WHERE id=registration.profile_id
    AND status='pending' AND (auth_user_id IS NULL OR auth_user_id=identity_id);
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE private.identity_activation_requests SET auth_user_id=identity_id,status='invited',
    activation_digest=p_digest,activation_expires_at=clock_timestamp()+interval '1 hour'
    WHERE id=registration.id;
  RETURN true;
END;
$$;

CREATE FUNCTION public.claim_staff_activation(p_identifier text,p_digest text,p_claim uuid,p_network text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  registration private.identity_activation_requests;
  attempt_at timestamptz := clock_timestamp();
  target_key text;
BEGIN
  IF p_claim IS NULL OR p_digest IS NULL OR p_digest !~ '^[0-9a-f]{64}$'
    OR p_identifier IS NULL OR length(p_identifier)>254
    OR p_identifier !~ '^u-[a-z0-9]+@cuentas[.]sistema-alumnos[.]invalid$' THEN
    RETURN NULL;
  END IF;
  IF nullif(p_network,'') IS NOT NULL THEN
    IF p_network !~ '^[0-9a-f]{64}$' THEN RETURN NULL; END IF;
    IF NOT private.take_staff_activation_limit('network:'||p_network,30,attempt_at) THEN RETURN NULL; END IF;
    target_key := encode(sha256(convert_to(p_network||':'||p_identifier,'UTF8')),'hex');
    IF NOT private.take_staff_activation_limit('target:'||target_key,6,attempt_at) THEN
      RETURN NULL;
    END IF;
    -- Limpieza acotada. Solo se tocan ventanas antiguas y filas disponibles.
    DELETE FROM private.staff_activation_limits WHERE bucket IN (
      SELECT bucket FROM private.staff_activation_limits
      WHERE expires_at<=attempt_at-interval '5 minutes'
      ORDER BY expires_at LIMIT 8 FOR UPDATE SKIP LOCKED
    );
  END IF;

  -- Un código incorrecto no modifica la solicitud ni toma su bloqueo de escritura.
  SELECT * INTO registration FROM private.identity_activation_requests
    WHERE login_identifier=p_identifier AND staff_registration AND status='invited'
      AND activation_digest=p_digest AND activation_expires_at>clock_timestamp() FOR UPDATE;
  IF NOT FOUND OR registration.activation_expires_at<=clock_timestamp() THEN RETURN NULL; END IF;
  IF registration.auth_user_id IS NULL
    OR private.staff_registration_identity(registration.id,registration.login_identifier)
      IS DISTINCT FROM registration.auth_user_id
    OR NOT EXISTS (
      SELECT 1 FROM public.organizations o
      JOIN public.organization_memberships m ON m.organization_id=o.id
      JOIN public.profiles p ON p.id=m.profile_id
      WHERE o.id=registration.organization_id AND o.status='active'
        AND m.id=registration.membership_id AND m.status='invited'
        AND p.id=registration.profile_id AND p.status='pending' AND p.auth_user_id=registration.auth_user_id
    ) THEN
    RETURN NULL;
  END IF;
  UPDATE private.identity_activation_requests SET activation_digest=NULL,activation_expires_at=NULL,activation_claim=p_claim
    WHERE id=registration.id;
  RETURN pg_catalog.jsonb_build_object('registration',registration.id,'authUser',registration.auth_user_id);
END;
$$;

CREATE FUNCTION public.finish_staff_activation(p_registration uuid,p_claim uuid,p_rejected boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  registration private.identity_activation_requests;
  org uuid;
  auth_applied boolean;
BEGIN
  IF p_claim IS NULL OR p_rejected IS NULL THEN RETURN false; END IF;
  SELECT organization_id INTO org FROM private.identity_activation_requests WHERE id=p_registration AND staff_registration;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM 1 FROM public.organizations WHERE id=org AND status='active' FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT * INTO registration FROM private.identity_activation_requests
    WHERE id=p_registration AND status='invited' AND activation_claim=p_claim FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;

  SELECT u.raw_app_meta_data->>'staff_activation_claim'=p_claim::text INTO auth_applied
  FROM auth.users u WHERE u.id=registration.auth_user_id
    AND u.id=private.staff_registration_identity(registration.id,registration.login_identifier);
  IF NOT FOUND THEN RETURN false; END IF;
  IF p_rejected AND auth_applied IS NOT TRUE THEN
    UPDATE private.identity_activation_requests SET activation_claim=NULL WHERE id=registration.id;
    RETURN false;
  END IF;
  IF auth_applied IS NOT TRUE THEN RETURN false; END IF;

  UPDATE public.profiles SET status='active'
    WHERE id=registration.profile_id AND auth_user_id=registration.auth_user_id AND status='pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Perfil de alta no disponible' USING ERRCODE='23514';
  END IF;
  UPDATE public.organization_memberships SET status='active',joined_at=transaction_timestamp()
    WHERE id=registration.membership_id AND organization_id=org AND profile_id=registration.profile_id
      AND role='admin' AND staff_rank IN ('administrator','teacher','secretary') AND status='invited';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Membresía de alta no disponible' USING ERRCODE='23514';
  END IF;
  UPDATE private.identity_activation_requests SET status='linked',linked_at=transaction_timestamp(),
    activation_claim=NULL WHERE id=registration.id;
  RETURN true;
END;
$$;

-- Abandona un alta dudosa sin reutilizar el identificador ni tocar la cuenta Auth.
CREATE FUNCTION public.cancel_staff_registration(p_org uuid,p_registration uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE registration private.identity_activation_requests;
BEGIN
  PERFORM private.require_admin(p_org);
  PERFORM 1 FROM public.organizations WHERE id=p_org FOR UPDATE;
  PERFORM private.require_admin(p_org);
  SELECT * INTO registration FROM private.identity_activation_requests
    WHERE id=p_registration AND organization_id=p_org AND staff_registration
      AND status IN ('requested','invited') FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Alta no disponible' USING ERRCODE='42501';
  END IF;

  UPDATE public.organization_memberships SET status='archived',
    updated_by_membership_id=private.member_id(p_org)
    WHERE id=registration.membership_id AND organization_id=p_org AND profile_id=registration.profile_id
      AND role='admin' AND staff_rank IN ('administrator','teacher','secretary') AND status='invited';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Membresía de alta no disponible' USING ERRCODE='23514';
  END IF;
  UPDATE private.identity_activation_requests SET status='cancelled',
    activation_digest=NULL,activation_expires_at=NULL,activation_claim=NULL
    WHERE id=registration.id;
  RETURN registration.membership_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_staff(p_org uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM private.require_admin(p_org);
  RETURN pg_catalog.jsonb_build_object(
    'staff',coalesce((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',m.id,
        'name',pg_catalog.concat_ws(' ',nullif(m.first_name,''),nullif(m.last_name,'')),
        'identifier',coalesce(u.email,r.login_identifier),'rank',m.staff_rank,'status',m.status,
        'modules',m.allowed_modules,'version',m.row_version,'self',m.profile_id=private.actor_profile_id(),
        'registration',r.id,'activationInProgress',r.activation_claim IS NOT NULL)
        ORDER BY m.first_name,m.last_name,m.id)
      FROM public.organization_memberships m
      JOIN public.profiles p ON p.id=m.profile_id
      LEFT JOIN auth.users u ON u.id=p.auth_user_id
      LEFT JOIN private.identity_activation_requests r ON r.membership_id=m.id
        AND r.staff_registration AND r.status IN ('requested','invited','cancelled')
      WHERE m.organization_id=p_org AND m.role='admin' AND (m.status<>'invited' OR r.id IS NOT NULL)
    ),'[]'::jsonb),
    'pending',coalesce((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',a.id,'identifier',a.login_identifier,
        'name',pg_catalog.concat_ws(' ',nullif(m.first_name,''),nullif(m.last_name,''))) ORDER BY m.first_name,a.id)
      FROM private.staff_assignments(p_org) a JOIN public.organization_memberships m ON m.id=a.membership_id
    ),'[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION private.staff_registration_identity(uuid,text),
  private.staff_registration_principal(uuid,uuid),private.take_staff_activation_limit(text,integer,timestamptz),
  public.reserve_staff_registration(uuid,uuid,text,text,text,text,text,text[]),public.staff_registration_delivery(uuid,uuid),
  public.issue_staff_activation(uuid,uuid,uuid,text),public.claim_staff_activation(text,text,uuid,text),
  public.finish_staff_activation(uuid,uuid,boolean),public.cancel_staff_registration(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.staff_registration_delivery(uuid,uuid),
  public.cancel_staff_registration(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_staff_registration(uuid,uuid,text,text,text,text,text,text[]),
  public.issue_staff_activation(uuid,uuid,uuid,text),public.claim_staff_activation(text,text,uuid,text),
  public.finish_staff_activation(uuid,uuid,boolean) TO service_role;

COMMIT;
