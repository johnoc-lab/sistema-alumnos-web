BEGIN;

CREATE FUNCTION public.delete_announcement(
  p_organization_id uuid,
  p_id uuid,
  p_expected_version bigint
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE current_version bigint;
BEGIN
  PERFORM private.require_module(p_organization_id,'announcements');
  SELECT row_version INTO current_version
  FROM public.announcements
  WHERE organization_id=p_organization_id AND id=p_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recurso no disponible' USING ERRCODE='42501';
  END IF;
  IF p_expected_version IS NULL OR current_version<>p_expected_version THEN
    RAISE EXCEPTION 'Conflicto de versión; vuelva a consultar' USING ERRCODE='40001';
  END IF;
  DELETE FROM public.announcements
  WHERE organization_id=p_organization_id AND id=p_id;
END;
$$;

CREATE FUNCTION public.delete_material(
  p_organization_id uuid,
  p_id uuid,
  p_expected_version bigint
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE current_version bigint;
BEGIN
  PERFORM private.require_module(p_organization_id,'materials');
  SELECT row_version INTO current_version
  FROM public.materials
  WHERE organization_id=p_organization_id AND id=p_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recurso no disponible' USING ERRCODE='42501';
  END IF;
  IF p_expected_version IS NULL OR current_version<>p_expected_version THEN
    RAISE EXCEPTION 'Conflicto de versión; vuelva a consultar' USING ERRCODE='40001';
  END IF;
  DELETE FROM public.materials
  WHERE organization_id=p_organization_id AND id=p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_announcement(uuid,uuid,bigint)
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.delete_material(uuid,uuid,bigint)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.delete_announcement(uuid,uuid,bigint)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_material(uuid,uuid,bigint)
  TO authenticated;

COMMIT;
