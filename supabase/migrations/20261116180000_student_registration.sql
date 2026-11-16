BEGIN;

-- Alta desde el servidor. Auth se crea por separado y no otorga acceso sin este vínculo.
CREATE FUNCTION public.provision_registered_student(
  p_auth_user_id uuid,
  p_organization_slug text,
  p_email text,
  p_first_name text,
  p_last_name text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  target_org uuid;
  target_profile uuid;
  profile_status text;
BEGIN
  IF p_organization_slug IS NULL OR p_organization_slug NOT IN ('impulso-cero', 'incubadora')
    OR p_email IS NULL OR length(p_email) > 254
    OR length(btrim(p_first_name)) NOT BETWEEN 1 AND 100 OR p_first_name IS NULL
    OR length(btrim(p_last_name)) NOT BETWEEN 1 AND 100 OR p_last_name IS NULL THEN
    RETURN false;
  END IF;

  -- Serializa reintentos de la misma identidad y verifica la marca creada por Auth Admin.
  PERFORM 1 FROM auth.users u
  WHERE u.id = p_auth_user_id AND lower(u.email) = p_email
    AND u.raw_app_meta_data->>'student_registration_organization' = p_organization_slug
    AND u.email_confirmed_at IS NOT NULL AND NOT coalesce(u.is_anonymous, false)
    AND u.deleted_at IS NULL AND (u.banned_until IS NULL OR u.banned_until <= now())
  FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;

  SELECT id INTO target_org FROM public.organizations
  WHERE slug = p_organization_slug AND status = 'active'
  FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;

  SELECT id, status INTO target_profile, profile_status
  FROM public.profiles WHERE auth_user_id = p_auth_user_id FOR UPDATE;
  IF FOUND THEN
    -- Un reintento ya completado conserva nombres, estado y permisos.
    RETURN profile_status = 'active' AND EXISTS (
      SELECT 1 FROM public.organization_memberships
      WHERE profile_id = target_profile AND organization_id = target_org
        AND role = 'student' AND status = 'active'
    );
  END IF;

  INSERT INTO public.profiles (auth_user_id, display_name, status)
  VALUES (p_auth_user_id, btrim(p_first_name) || ' ' || btrim(p_last_name), 'active')
  RETURNING id INTO target_profile;

  INSERT INTO public.organization_memberships (
    organization_id, profile_id, role, staff_rank, allowed_modules,
    status, first_name, last_name, contact_email, joined_at
  ) VALUES (
    target_org, target_profile, 'student', NULL, '{}',
    'active', btrim(p_first_name), btrim(p_last_name), p_email, now()
  );

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.provision_registered_student(uuid,text,text,text,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provision_registered_student(uuid,text,text,text,text)
  TO service_role;

COMMIT;
