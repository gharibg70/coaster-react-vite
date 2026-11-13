import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('../supabase/migrations/20261113_student_chat.sql', import.meta.url), 'utf8');
const lower = sql.toLowerCase();
const functionBody = (name) => {
  const start = lower.indexOf(`function public.${name}`);
  assert.notEqual(start, -1, `missing function ${name}`);
  const bodyStart = lower.indexOf('as $$', start);
  const bodyEnd = lower.indexOf('$$;', bodyStart);
  assert.ok(bodyStart !== -1 && bodyEnd !== -1, `cannot parse body for ${name}`);
  return lower.slice(start, bodyEnd);
};

test('public_message_rows_exclude_account_ids', () => {
  const match = lower.match(/create table if not exists public\.student_chat_messages\s*\(([\s\S]*?)\n\);/);
  assert.ok(match, 'safe public message table must be created');
  const columns = match[1].split(',').map((part) => part.trim().split(/\s+/)[0]);
  assert.deepEqual(columns, ['id', 'display_name', 'body', 'created_at']);
  assert.match(lower, /create table if not exists public\.student_chat_authors[\s\S]*?author_id uuid not null/);
  assert.match(lower, /create table if not exists public\.student_chat_reports[\s\S]*?reporter_id uuid not null/);
  assert.match(lower, /author_id uuid not null references auth\.users\(id\) on delete cascade/);
  assert.match(lower, /reporter_id uuid not null references auth\.users\(id\) on delete cascade/);
  assert.match(lower, /alter publication supabase_realtime add table public\.student_chat_messages/);
  assert.doesNotMatch(lower, /alter publication supabase_realtime add table public\.student_chat_(authors|reports)/);
  assert.match(lower, /references auth\.users\(id\) on delete cascade/);
});

test('direct_message_writes_are_revoked', () => {
  assert.match(lower, /alter table public\.student_chat_messages enable row level security/);
  assert.match(lower, /revoke all on public\.student_chat_messages from public, anon, authenticated/);
  assert.match(lower, /grant select on public\.student_chat_messages to authenticated/);
  assert.match(lower, /revoke all on public\.student_chat_authors from public, anon, authenticated/);
  assert.match(lower, /revoke all on public\.student_chat_reports from public, anon, authenticated/);
});

test('read_policy_requires_eligible_student_or_admin', () => {
  const policyStart = lower.indexOf('create policy student_chat_messages_eligible_read');
  assert.notEqual(policyStart, -1);
  const policy = lower.slice(policyStart, lower.indexOf(');', policyStart));
  assert.match(policy, /p\.role = 'admin'/);
  assert.match(policy, /s\.status = 'active'/);
  assert.match(policy, /s\.end_date is null or s\.end_date >= \(pg_catalog\.now\(\) at time zone 'asia\/baghdad'\)::date/);
});

test('send_rpc_enforces_subscription_and_rate_limit', () => {
  const send = functionBody('send_student_chat_message');
  assert.match(send, /security definer set search_path = ''/);
  assert.match(send, /s\.status = 'active'/);
  assert.match(send, /s\.end_date is null or s\.end_date >= \(pg_catalog\.now\(\) at time zone 'asia\/baghdad'\)::date/);
  assert.match(send, /pg_catalog\.btrim/);
  assert.match(send, /pg_catalog\.char_length\(v_body\) > 500/);
  assert.match(send, /pg_advisory_xact_lock/);
  assert.ok(send.indexOf('pg_advisory_xact_lock') < send.indexOf('v_created_at := pg_catalog.clock_timestamp()'));
  assert.ok(send.indexOf('v_created_at := pg_catalog.clock_timestamp()') < send.indexOf('select a.sent_at'));
  assert.match(send, /v_last_sent \+ interval '2 seconds'/);
  assert.match(send, /p\.full_name/);
  assert.match(send, /returns table \(id uuid, display_name text, body text, created_at timestamptz\)/);
  assert.match(lower, /revoke all on function public\.send_student_chat_message\(text\) from public, anon/);
});

test('access_rpc_returns_only_current_student_eligibility', () => {
  const access = functionBody('student_chat_access');
  assert.match(access, /returns boolean/);
  assert.match(access, /security definer set search_path = ''/);
  assert.match(access, /s\.status = 'active'/);
  assert.match(access, /s\.end_date is null or s\.end_date >= \(pg_catalog\.now\(\) at time zone 'asia\/baghdad'\)::date/);
  assert.match(lower, /revoke all on function public\.student_chat_access\(\) from public, anon/);
  assert.match(lower, /grant execute on function public\.student_chat_access\(\) to authenticated/);
});

test('moderation_rpcs_require_admin', () => {
  const list = functionBody('admin_list_student_chat_reports');
  const remove = functionBody('admin_delete_student_chat_message');
  for (const body of [list, remove]) {
    assert.match(body, /security definer set search_path = ''/);
    assert.match(body, /p\.role = 'admin'/);
    assert.match(body, /admin only/);
  }
  assert.match(list, /report_count bigint/);
  assert.match(list, /pg_catalog\.count\(r\.message_id\)/);
  assert.doesNotMatch(list, /reporter_id|author_id|auth\.uid\(\)\s+as/);
  assert.match(remove, /delete from public\.student_chat_messages/);
  const report = functionBody('report_student_chat_message');
  assert.match(report, /admins cannot report student messages/);
  assert.match(list, /admin_list_student_chat_reports\(p_limit integer default 100\)/);
  assert.match(list, /limit greatest\(1, least\(coalesce\(p_limit, 100\), 100\)\)/);
  assert.match(lower, /revoke all on function public\.admin_list_student_chat_reports\(integer\) from public, anon/);
  assert.match(lower, /revoke all on function public\.admin_delete_student_chat_message\(uuid\) from public, anon/);
});
