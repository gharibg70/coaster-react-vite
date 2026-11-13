import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canCommitReportRequest,
  canModerateChat,
  deleteReportRpcArgs,
  listReportsRpcArgs,
  sanitizeChatReport,
  sanitizeChatReports,
} from '../src/features/chat/chatModerationService.js';

test('projects_reports_to_safe_fields', () => {
  const row = {
    message_id: 'message-1', display_name: 'Student', body: 'Hello', created_at: '2026-11-13T08:00:00Z', report_count: 2,
    reporter_id: 'private-user', sender_id: 'private-sender', phone: '555', ignored_extra: true,
  };
  assert.deepEqual(sanitizeChatReport(row), {
    message_id: 'message-1', display_name: 'Student', body: 'Hello', created_at: '2026-11-13T08:00:00Z', report_count: 2,
  });
});

test('rejects_non_admin_moderation_access', () => {
  assert.equal(canModerateChat(null), false);
  assert.equal(canModerateChat({ role: 'student' }), false);
  assert.equal(canModerateChat({ role: 'moderator' }), false);
});

test('allows_admin_moderation', () => {
  assert.equal(canModerateChat({ role: 'admin' }), true);
});

test('handles_empty_report_queue_and_normalizes_count', () => {
  assert.deepEqual(sanitizeChatReports([]), []);
  assert.deepEqual(sanitizeChatReports(null), []);
  assert.deepEqual(sanitizeChatReports([{ message_id: 'm1', body: 'x' }]), []);
  assert.equal(sanitizeChatReports([{
    message_id: 'm1', display_name: 'Student', body: 'x', created_at: '2026-11-13T08:00:00Z', report_count: '2',
  }])[0].report_count, 2);
});

test('drops_malformed_report_rows', () => {
  assert.deepEqual(sanitizeChatReports([
    null,
    [],
    { message_id: 'm1', display_name: 'Student', body: 'x', created_at: '2026-11-13T08:00:00Z', report_count: 0 },
    { message_id: 'm2', display_name: 'Student', body: 'x', created_at: '2026-11-13T08:00:00Z', report_count: 'many' },
    { message_id: 'm3', display_name: 'Student', body: 'x', created_at: '2026-11-13T08:00:00Z', report_count: 1.5 },
  ]), []);
});

test('list_report_rpc_arguments_are_room_scoped_and_clamped', () => {
  assert.deepEqual(listReportsRpcArgs('boys'), { p_room: 'boys', p_limit: 100 });
  assert.deepEqual(listReportsRpcArgs('girls', 7), { p_room: 'girls', p_limit: 7 });
  assert.deepEqual(listReportsRpcArgs('boys', 1000), { p_room: 'boys', p_limit: 100 });
  assert.deepEqual(listReportsRpcArgs('girls', 0), { p_room: 'girls', p_limit: 1 });
  assert.deepEqual(listReportsRpcArgs('boys', 'bad'), { p_room: 'boys', p_limit: 100 });
});

test('delete_rpc_arguments_include_room_and_message_id', () => {
  assert.deepEqual(deleteReportRpcArgs('girls', 'message-9'), { p_room: 'girls', p_message_id: 'message-9' });
});

test('report_projection_rejects_rows_from_another_room', () => {
  const report = (room, messageId) => ({
    message_id: messageId, room_group: room, display_name: 'Student', body: 'x',
    created_at: '2026-11-13T08:00:00Z', report_count: 1,
  });
  assert.deepEqual(sanitizeChatReports([report('boys', 'b1'), report('girls', 'g1')], 'boys').map((row) => row.message_id), ['b1']);
});

test('stale_report_response_cannot_commit_after_room_switch', () => {
  assert.equal(canCommitReportRequest(4, 4, 'girls', 'girls'), true);
  assert.equal(canCommitReportRequest(4, 5, 'boys', 'girls'), false);
  assert.equal(canCommitReportRequest(4, 4, 'boys', 'girls'), false);
});
