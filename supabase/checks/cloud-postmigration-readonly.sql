-- Solo después de autorizar y aplicar las migraciones. Sin seed ni altas.
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout='10s';
SELECT count(*) FILTER (WHERE relrowsecurity) AS public_tables_with_rls,
       count(*) AS public_tables
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind='r'
 AND c.relname=ANY(ARRAY['organizations','profiles','organization_memberships','courses','file_assets','course_modules','lessons','enrollments','announcements','materials','calendar_events','calendar_event_attendees','certificate_issues','audit_events']);
SELECT schemaname,tablename,policyname,permissive,roles,cmd FROM pg_policies
WHERE schemaname IN ('public','private') OR (schemaname='storage' AND tablename='objects')
ORDER BY schemaname,tablename,policyname;
SELECT p.proname,pg_get_userbyid(p.proowner) AS owner,p.prosecdef,p.proconfig,
 has_function_privilege('anon',p.oid,'EXECUTE') AS anon_can_execute,
 has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_can_execute
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname=ANY(ARRAY['update_course','update_course_module','update_lesson','update_enrollment','update_announcement','update_material','update_calendar_event','update_file_asset','update_certificate_issue','update_student_contact','set_student_status','create_scheduled_event','replace_event_attendees'])
ORDER BY p.proname;
SELECT schemaname,tablename FROM pg_tables
WHERE schemaname='private' AND
 (has_table_privilege('anon',format('%I.%I',schemaname,tablename),'SELECT,INSERT,UPDATE,DELETE')
 OR has_table_privilege('authenticated',format('%I.%I',schemaname,tablename),'SELECT,INSERT,UPDATE,DELETE'));
SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname=ANY(ARRAY['organizations','profiles','organization_memberships','courses','file_assets','course_modules','lessons','enrollments','announcements','materials','calendar_events','calendar_event_attendees','certificate_issues','audit_events'])
 AND has_table_privilege('authenticated',c.oid,'UPDATE,DELETE,TRUNCATE');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{}',true);
SELECT count(*) AS courses_without_identity FROM public.courses;
SELECT private.org_admin('00000000-0000-4000-8000-000000000001'::uuid) AS admin_without_identity;
ROLLBACK;
