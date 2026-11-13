import test from 'node:test';
import assert from 'node:assert/strict';
import { canModerateChat, sanitizeChatReport, sanitizeChatReports } from '../src/features/chat/chatModerationService.js';

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

test('handles_empty_report_queue', () => {
  assert.deepEqual(sanitizeChatReports([]), []);
  assert.deepEqual(sanitizeChatReports(null), []);
  assert.deepEqual(sanitizeChatReports([{ message_id: 'm1', body: 'x' }]), []);
  assert.deepEqual(sanitizeChatReports([{
    message_id: 'm1', display_name: 'Student', body: 'x', created_at: '2026-11-13T08:00:00Z', report_count: '2',
  }])[0].report_count, 2);
});

test('drops_malformed_report_rows', () => {
  assert.deepEqual(sanitizeChatReports([
    { message_id: 'm1', display_name: 'Student', body: 'x', created_at: '2026-11-13T08:00:00Z', report_count: 0 },
    { message_id: 'm2', display_name: 'Student', body: 'x', created_at: '2026-11-13T08:00:00Z', report_count: 'many' },
  ]), []);
});
