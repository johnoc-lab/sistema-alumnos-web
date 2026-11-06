-- Solo SELECT; ejecutar con CLI --read-only y Project Ref explícito.
WITH requested(auth_id,qa_role) AS (VALUES
 ('9eeeb988-f329-439d-b4b4-0f54cc1318d7'::uuid,'admin'::text),
 ('db59e5dd-1810-4627-bb45-4c7efc242a8c'::uuid,'student'::text))
SELECT jsonb_build_object(
 'observed_at',current_timestamp,
 'auth',(SELECT jsonb_agg(jsonb_build_object(
 'auth_uuid',r.auth_id,'qa_role_proposed',r.qa_role,'exists',u.id IS NOT NULL,
 'email',u.email,'email_confirmed_at',u.email_confirmed_at,'is_anonymous',u.is_anonymous,
 'banned_until',u.banned_until,'deleted_at',u.deleted_at,
 'enabled_now',u.id IS NOT NULL AND u.deleted_at IS NULL AND NOT coalesce(u.is_anonymous,true)
 AND (u.banned_until IS NULL OR u.banned_until <= current_timestamp)) ORDER BY r.qa_role)
 FROM requested r LEFT JOIN auth.users u ON u.id=r.auth_id),
 'profiles',coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.id,'auth_user_id',p.auth_user_id,'status',p.status))
 FROM public.profiles p WHERE p.auth_user_id IN(SELECT auth_id FROM requested)),'[]'::jsonb),
 'memberships',coalesce((SELECT jsonb_agg(jsonb_build_object('id',m.id,'profile_id',m.profile_id,
 'organization_id',m.organization_id,'role',m.role,'status',m.status))
 FROM public.organization_memberships m JOIN public.profiles p ON p.id=m.profile_id
 WHERE p.auth_user_id IN(SELECT auth_id FROM requested)),'[]'::jsonb),
 'slug_collisions',coalesce((SELECT jsonb_agg(jsonb_build_object('id',o.id,'slug',o.slug,'status',o.status))
 FROM public.organizations o WHERE o.slug='qa-sistema-alumnos-01'),'[]'::jsonb),
 'activation_collisions',coalesce((SELECT jsonb_agg(jsonb_build_object('id',a.id,
 'organization_id',a.organization_id,'auth_user_id',a.auth_user_id,'status',a.status))
 FROM private.identity_activation_requests a WHERE a.auth_user_id IN(SELECT auth_id FROM requested)),'[]'::jsonb),
 'table_counts',jsonb_build_object(
 'organizations',(SELECT count(*) FROM public.organizations),
 'profiles',(SELECT count(*) FROM public.profiles),
 'memberships',(SELECT count(*) FROM public.organization_memberships),
 'activations',(SELECT count(*) FROM private.identity_activation_requests),
 'audit_events',(SELECT count(*) FROM public.audit_events)),
 'relevant_triggers',(SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'table',c.relname,
 'name',t.tgname,'enabled',t.tgenabled,'deferrable',t.tgdeferrable,'initially_deferred',t.tginitdeferred) ORDER BY n.nspname,c.relname,t.tgname)
 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE NOT t.tgisinternal AND (n.nspname,c.relname) IN(
 ('public','organizations'),('public','profiles'),('public','organization_memberships'),
 ('public','audit_events'),('private','identity_activation_requests')))
) AS qa_state;
