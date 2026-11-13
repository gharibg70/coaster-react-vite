import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('../supabase/migrations/20261113_student_chat.sql', import.meta.url), 'utf8');
const lower = sql.toLowerCase();
const rooms = readFileSync(new URL('../supabase/migrations/20261113_student_chat_rooms.sql', import.meta.url), 'utf8');
const roomSql = rooms.toLowerCase();
const bodyOf = (source, name) => {
  const start = source.indexOf(`function public.${name}`);
  assert.notEqual(start, -1, `missing function ${name}`);
  const bodyStart = source.indexOf('as $$', start);
  const bodyEnd = source.indexOf('$$;', bodyStart);
  assert.ok(bodyStart !== -1 && bodyEnd !== -1, `cannot parse body for ${name}`);
  return source.slice(start, bodyEnd);
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
  assert.match(roomSql, /add column if not exists room_group text/);
  assert.match(roomSql, /add column if not exists is_admin boolean not null default false/);
  assert.match(roomSql, /set room_group = p\.group_type/);
  assert.match(roomSql, /p\.group_type in \('boys', 'girls'\)/);
  assert.match(roomSql, /room_group is null or room_group in \('boys', 'girls'\)/);
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
  const roomPolicy = roomSql.slice(roomSql.indexOf('create policy student_chat_messages_room_read'));
  assert.match(roomPolicy, /room_group in \('boys', 'girls'\)/);
  assert.match(roomPolicy, /p\.group_type = room_group/);
  assert.match(roomPolicy, /p\.role = 'admin'/);
});

test('send_rpc_enforces_subscription_and_rate_limit', () => {
  const send = bodyOf(lower, 'send_student_chat_message');
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
  const access = bodyOf(lower, 'student_chat_access');
  assert.match(access, /returns boolean/);
  assert.match(access, /security definer set search_path = ''/);
  assert.match(access, /s\.status = 'active'/);
  assert.match(access, /s\.end_date is null or s\.end_date >= \(pg_catalog\.now\(\) at time zone 'asia\/baghdad'\)::date/);
  assert.match(lower, /revoke all on function public\.student_chat_access\(\) from public, anon/);
  assert.match(lower, /grant execute on function public\.student_chat_access\(\) to authenticated/);
});

test('moderation_rpcs_require_admin', () => {
  const list = bodyOf(lower, 'admin_list_student_chat_reports');
  const remove = bodyOf(lower, 'admin_delete_student_chat_message');
  for (const body of [list, remove]) {
    assert.match(body, /security definer set search_path = ''/);
    assert.match(body, /p\.role = 'admin'/);
    assert.match(body, /admin only/);
  }
  assert.match(list, /report_count bigint/);
  assert.match(list, /pg_catalog\.count\(r\.message_id\)/);
  assert.doesNotMatch(list, /reporter_id|author_id|auth\.uid\(\)\s+as/);
  assert.match(remove, /delete from public\.student_chat_messages/);
  const report = bodyOf(lower, 'report_student_chat_message');
  assert.match(report, /admins cannot report student messages/);
  assert.match(list, /admin_list_student_chat_reports\(p_limit integer default 100\)/);
  assert.match(list, /limit greatest\(1, least\(coalesce\(p_limit, 100\), 100\)\)/);
  assert.match(lower, /revoke all on function public\.admin_list_student_chat_reports\(integer\) from public, anon/);
  assert.match(lower, /revoke all on function public\.admin_delete_student_chat_message\(uuid\) from public, anon/);
});

test('chat_room_access_is_group_bound_and_admin_has_both_rooms', () => {
  const access = bodyOf(roomSql, 'chat_room_access');
  assert.match(access, /returns boolean/);
  assert.match(access, /p_room not in \('boys', 'girls'\)/);
  assert.match(access, /p\.role = 'admin'/);
  assert.match(access, /p\.group_type = p_room/);
  assert.match(access, /s\.status = 'active'/);
  assert.match(access, /s\.end_date is null or s\.end_date >= \(pg_catalog\.now\(\) at time zone 'asia\/baghdad'\)::date/);
  assert.match(roomSql, /grant execute on function public\.chat_room_access\(text\) to authenticated/);
  assert.match(roomSql, /revoke all on function public\.chat_room_access\(text\) from public, anon/);
});

test('send_chat_room_message_cannot_cross_groups', () => {
  const send = bodyOf(roomSql, 'send_chat_room_message');
  assert.match(send, /public\.chat_room_access\(p_room\)/);
  assert.match(send, /p_room not in \('boys', 'girls'\)/);
  assert.match(send, /pg_catalog\.char_length\(v_body\) > 500/);
  assert.match(send, /pg_advisory_xact_lock/);
  assert.match(send, /v_last \+ interval '2 seconds'/);
  assert.match(send, /room_group, is_admin/);
  assert.match(send, /returns table \(id uuid, room_group text, display_name text, is_admin boolean, body text, created_at timestamptz\)/);
  assert.match(roomSql, /revoke all on function public\.send_student_chat_message\(text\) from public, anon, authenticated/);
});

test('unclassified_legacy_messages_are_quarantined', () => {
  assert.match(roomSql, /where a\.message_id = m\.id and m\.room_group is null/);
  assert.match(roomSql, /room_group is null or room_group in \('boys', 'girls'\)/);
  assert.match(roomSql, /room_group in \('boys', 'girls'\) and/);
});

test('reports_and_deletes_are_room_scoped', () => {
  const report = bodyOf(roomSql, 'report_student_chat_room_message');
  assert.match(report, /not public\.chat_room_access\(p_room\)/);
  assert.match(report, /m\.room_group = p_room/);
  assert.match(report, /admins cannot report student messages/);
  const list = bodyOf(roomSql, 'admin_list_student_chat_reports');
  assert.match(list, /valid selected room required/);
  assert.match(list, /where m\.room_group = p_room/);
  assert.match(list, /limit greatest\(1, least\(coalesce\(p_limit, 100\), 100\)\)/);
  assert.doesNotMatch(list, /reporter_id|author_id/);
  const remove = bodyOf(roomSql, 'admin_delete_student_chat_message');
  assert.match(remove, /valid selected room required/);
  assert.match(remove, /m\.room_group = p_room/);
  assert.match(roomSql, /revoke all on function public\.admin_delete_student_chat_message\(uuid\) from public, anon, authenticated/);
});
