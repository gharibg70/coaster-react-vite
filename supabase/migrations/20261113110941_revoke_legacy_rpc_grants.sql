-- Retire superseded unscoped chat RPCs from client roles. Current clients use
-- room-scoped RPCs; service_role access is retained for operational maintenance.
REVOKE EXECUTE ON FUNCTION public.send_student_chat_message(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.report_student_chat_message(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_delete_student_chat_message(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_list_student_chat_reports(integer) FROM PUBLIC, anon, authenticated;

-- Authenticated clients still need is_admin() in existing RLS rules; anonymous
-- callers do not. handle_new_user() remains attached to its auth.users trigger.
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
