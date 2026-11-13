import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('../supabase/migrations/20261113110941_revoke_legacy_rpc_grants.sql', import.meta.url), 'utf8')
  .replace(/--[^\n]*/g, '');
const statements = sql.split(';').map((statement) => statement.trim()).filter(Boolean);

test('legacy_unscoped_chat_rpc_grants_are_revoked_from_client_roles', () => {
  for (const signature of [
    'public.send_student_chat_message(text)',
    'public.report_student_chat_message(uuid, text)',
    'public.admin_delete_student_chat_message(uuid)',
    'public.admin_list_student_chat_reports(integer)',
  ]) {
    assert.ok(
      statements.includes(`REVOKE EXECUTE ON FUNCTION ${signature} FROM PUBLIC, anon, authenticated`),
      `${signature} must not be callable by client roles`,
    );
  }
});

test('anonymous_role_is_removed_from_is_admin_but_authenticated_access_is_preserved', () => {
  assert.match(sql, /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.is_admin\(\)\s+FROM\s+PUBLIC\s*,\s*anon\s*;/i);
  assert.doesNotMatch(sql, /public\.is_admin\(\)[^;]*authenticated/i);
});

test('new_user_trigger_function_is_not_exposed_for_direct_client_execution', () => {
  assert.match(sql, /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.handle_new_user\(\)\s+FROM\s+PUBLIC\s*,\s*anon\s*,\s*authenticated\s*;/i);
});
