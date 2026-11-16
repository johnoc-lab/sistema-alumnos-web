BEGIN;

-- Punto común de acceso para RLS académica, Horario y los archivos privados.
-- El estado se lee en Auth para que la regla alcance también a sesiones anteriores al alta.
CREATE OR REPLACE FUNCTION private.member_id(org uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT m.id
  FROM public.organization_memberships m
  JOIN public.organizations o ON o.id = m.organization_id
  WHERE m.organization_id = org
    AND m.profile_id = private.actor_profile_id()
    AND m.status = 'active'
    AND o.status = 'active'
    AND (
      (SELECT auth.jwt()->>'aal') = 'aal2'
      OR (
        m.role = 'student'
        AND NOT EXISTS (
          SELECT 1 FROM auth.mfa_factors f
          WHERE f.user_id = (SELECT auth.uid())
            AND f.factor_type = 'totp'
            AND f.status = 'verified'
        )
      )
    );
$$;

-- La resolución de sesión necesita identificar la organización del propio miembro
-- antes de que complete MFA. Los permisos académicos siguen pasando por member_id.
ALTER POLICY organizations_read ON public.organizations USING (
  status = 'active'
  AND EXISTS (
    SELECT 1 FROM public.organization_memberships m
    WHERE m.organization_id = organizations.id
      AND m.profile_id = (SELECT private.actor_profile_id())
      AND m.status = 'active'
  )
);

COMMIT;
