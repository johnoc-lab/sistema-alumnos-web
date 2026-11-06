BEGIN;
ALTER TABLE private.identity_activation_requests
 ALTER COLUMN proposed_verified_contact DROP NOT NULL,
 ADD COLUMN verification_kind text NOT NULL DEFAULT 'legacy_unspecified',
 ADD COLUMN login_identifier text,
 ADD COLUMN verified_by_ref text,
 ADD COLUMN verification_evidence_ref text,
 ADD CONSTRAINT activation_institutional_contract CHECK (
 (verification_kind='legacy_unspecified' AND proposed_verified_contact IS NOT NULL
  AND login_identifier IS NULL AND verified_by_ref IS NULL AND verification_evidence_ref IS NULL)
 OR
 (verification_kind='institutional_assignment' AND proposed_verified_contact IS NULL
  AND login_identifier IS NOT NULL AND length(login_identifier)<=254
  AND login_identifier ~ '^u-[a-z0-9]+@cuentas[.]sistema-alumnos[.]invalid$'
  AND verified_by_ref IS NOT NULL AND length(btrim(verified_by_ref)) BETWEEN 1 AND 100
  AND verification_evidence_ref IS NOT NULL AND length(btrim(verification_evidence_ref)) BETWEEN 1 AND 200
  AND verified_at IS NOT NULL AND (linked_at IS NULL OR linked_at>=verified_at))
 );
CREATE FUNCTION private.guard_institutional_activation() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.status IN ('verified','linked') AND NEW.verification_kind<>'institutional_assignment' THEN
  RAISE EXCEPTION 'Nueva vinculación requiere asignación institucional explícita' USING ERRCODE='23514';
 END IF;
 IF NEW.verification_kind='institutional_assignment' AND NEW.verified_at>transaction_timestamp() THEN
  RAISE EXCEPTION 'Asignación futura no permitida' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.guard_institutional_activation() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER institutional_activation_guard BEFORE INSERT OR UPDATE
 ON private.identity_activation_requests FOR EACH ROW EXECUTE FUNCTION private.guard_institutional_activation();
COMMIT;
