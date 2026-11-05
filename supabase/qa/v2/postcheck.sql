-- Comprobación técnica de lectura, solo operador. Caller BEGIN READ ONLY;
-- Usar SET LOCAL TimeZone='UTC' y DateStyle='ISO, YMD' en el caller.
-- qa.institutional_manifest debe contener el envelope ya adjudicado. No imprime contactos.
WITH input AS (
 SELECT nullif(current_setting('qa.institutional_manifest',true),'')::jsonb envelope
), payload AS (
 SELECT envelope,envelope->'payload' p FROM input
), people AS (
 SELECT person FROM payload, jsonb_array_elements(p->'people') person
), expected AS (
 SELECT envelope,p,(p->>'operation_id')::uuid op,(p#>>'{organization,id}')::uuid org FROM payload
), signatures AS (
 SELECT jsonb_build_object(
 'organization',(SELECT encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex')
   FROM public.organizations t WHERE id=e.org),
 'profiles',(SELECT jsonb_agg(jsonb_build_object('id',q.person->>'profile_id','sha256',
   CASE WHEN t.id IS NOT NULL THEN encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex') END) ORDER BY q.ord)
   FROM jsonb_array_elements(e.p->'people') WITH ORDINALITY q(person,ord)
   LEFT JOIN public.profiles t ON t.id=(q.person->>'profile_id')::uuid),
 'memberships',(SELECT jsonb_agg(jsonb_build_object('id',q.person->>'membership_id','sha256',
   CASE WHEN t.id IS NOT NULL THEN encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex') END) ORDER BY q.ord)
   FROM jsonb_array_elements(e.p->'people') WITH ORDINALITY q(person,ord)
   LEFT JOIN public.organization_memberships t ON t.id=(q.person->>'membership_id')::uuid),
 'activations',(SELECT jsonb_agg(jsonb_build_object('id',q.person->>'activation_request_id','sha256',
   CASE WHEN t.id IS NOT NULL THEN encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex') END) ORDER BY q.ord)
   FROM jsonb_array_elements(e.p->'people') WITH ORDINALITY q(person,ord)
   LEFT JOIN private.identity_activation_requests t ON t.id=(q.person->>'activation_request_id')::uuid)
 ) AS contract FROM expected e
)
SELECT jsonb_build_object(
 'manifest_hash_valid',coalesce((SELECT envelope->>'payload_sha256'=encode(sha256(convert_to(p::text,'UTF8')),'hex') FROM expected),false),
 'contract_unchanged',EXISTS(SELECT 1 FROM public.audit_events a,expected e,signatures s WHERE a.id=e.op AND a.changes->'contract'=s.contract),
 'organization_active',EXISTS(SELECT 1 FROM public.organizations o,expected e WHERE o.id=e.org AND o.status='active'),
 'profiles_active_linked',(SELECT count(*)=2 FROM public.profiles p JOIN people q
 ON p.id=(q.person->>'profile_id')::uuid WHERE p.auth_user_id=(q.person->>'auth_user_id')::uuid AND p.status='active'),
 'memberships_active',(SELECT count(*)=2 FROM public.organization_memberships m JOIN people q
 ON m.id=(q.person->>'membership_id')::uuid JOIN expected e ON m.organization_id=e.org
 WHERE m.profile_id=(q.person->>'profile_id')::uuid AND m.role=q.person->>'role' AND m.status='active'),
 'activations_linked',(SELECT count(*)=2 FROM private.identity_activation_requests a JOIN people q
 ON a.id=(q.person->>'activation_request_id')::uuid JOIN expected e ON a.organization_id=e.org
 WHERE a.profile_id=(q.person->>'profile_id')::uuid AND a.membership_id=(q.person->>'membership_id')::uuid
 AND a.auth_user_id=(q.person->>'auth_user_id')::uuid AND a.idempotency_key=(q.person->>'idempotency_key')::uuid
 AND a.status='linked' AND a.verified_at IS NOT NULL AND a.linked_at IS NOT NULL),
 'operation_marker',EXISTS(SELECT 1 FROM public.audit_events a,expected e WHERE a.id=e.op
 AND a.request_id=e.op AND a.organization_id=e.org AND a.entity_type='qa.provisioning'
 AND a.changes->>'manifest_sha256'=encode(sha256(convert_to(e.p::text,'UTF8')),'hex')),
 'rls_tables',(SELECT count(*)=5 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE (n.nspname,c.relname) IN (('public','organizations'),('public','profiles'),
 ('public','organization_memberships'),('public','audit_events'),('private','identity_activation_requests')) AND c.relrowsecurity),
 
 'manifest_v2',coalesce((SELECT p->'version'='2'::jsonb AND p->>'scope'='cloud_qa_institutional' AND p->>'approval_state'='approved' FROM expected),false), 'institutional_guard_enabled',EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='private.identity_activation_requests'::regclass AND tgname='institutional_activation_guard' AND tgenabled IN ('O','A')), 'institutional_evidence',(SELECT count(*)=2 FROM private.identity_activation_requests a JOIN people q ON a.id=(q.person->>'activation_request_id')::uuid
 WHERE a.verification_kind='institutional_assignment' AND a.proposed_verified_contact IS NULL
 AND a.login_identifier=q.person->>'login_identifier' AND a.verified_by_ref=q.person->>'assignment_by_ref'
 AND a.verification_evidence_ref=q.person->>'assignment_evidence_ref'
 AND a.verified_at=(q.person->>'assignment_verified_at')::timestamptz),
 'old_identities_unlinked',NOT EXISTS(SELECT 1 FROM public.profiles WHERE auth_user_id IN ('db59e5dd-1810-4627-bb45-4c7efc242a8c'::uuid,'9eeeb988-f329-439d-b4b4-0f54cc1318d7'::uuid,'6d8c8f78-1d3b-43b5-8eb0-638e9d0cd8fa'::uuid))
 AND NOT EXISTS(SELECT 1 FROM private.identity_activation_requests WHERE auth_user_id IN ('db59e5dd-1810-4627-bb45-4c7efc242a8c'::uuid,'9eeeb988-f329-439d-b4b4-0f54cc1318d7'::uuid,'6d8c8f78-1d3b-43b5-8eb0-638e9d0cd8fa'::uuid)),
 'is_authentication_test',false
) AS qa_postcheck;
