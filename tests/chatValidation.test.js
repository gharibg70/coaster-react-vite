import test from 'node:test';
import assert from 'node:assert/strict';
import { canCommitChatHistory, limitMessageInput, validateMessageBody } from '../src/features/chat/chatService.js';

test('late_history_response_is_discarded_after_access_invalidation', () => {
  const requestVersion = 4;
  let latestVersion = requestVersion;
  let authorized = true;
  latestVersion += 1;
  authorized = false;
  assert.equal(canCommitChatHistory(requestVersion, latestVersion, authorized), false);
  latestVersion += 1;
  authorized = true;
  assert.equal(canCommitChatHistory(requestVersion, latestVersion, authorized), false);
  assert.equal(canCommitChatHistory(latestVersion, latestVersion, authorized), true);
});

test('composer_clips_to_500_unicode_codepoints_including_emoji', () => {
  assert.equal([...limitMessageInput('😀'.repeat(501))].length, 500);
  assert.equal(limitMessageInput('x'.repeat(501)), 'x'.repeat(500));
  assert.equal(limitMessageInput(null), '');
});

test('rejects_empty_after_trim', () => {
  assert.deepEqual(validateMessageBody(' \t\n '), { ok: false, error: 'لا يمكن إرسال رسالة فارغة.' });
});

test('accepts_exactly_500_unicode_codepoints', () => {
  assert.deepEqual(validateMessageBody('😀'.repeat(500)), { ok: true, value: '😀'.repeat(500) });
});

test('rejects_501_unicode_codepoints', () => {
  assert.deepEqual(validateMessageBody('😀'.repeat(501)), { ok: false, error: 'الحد الأقصى للرسالة 500 محرف.' });
});

test('trims_message_text', () => {
  assert.deepEqual(validateMessageBody('  hello chat  '), { ok: true, value: 'hello chat' });
});
