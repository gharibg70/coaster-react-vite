import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PayloadTooLargeError,
  extractBearerToken,
  isActiveAdmin,
  isValidAnnouncementRequest,
  publicPushFailure,
  readJsonWithLimit,
} from '../supabase/functions/bright-task/pushSecurity.js';

test('extracts_only_a_well_formed_bearer_token', () => {
  assert.equal(extractBearerToken('Bearer abc.def.ghi'), 'abc.def.ghi');
  assert.equal(extractBearerToken('bearer abc.def.ghi'), 'abc.def.ghi');
  assert.equal(extractBearerToken(null), null);
  assert.equal(extractBearerToken('Basic abc'), null);
  assert.equal(extractBearerToken('Bearer '), null);
});

test('requires_an_active_admin_profile_server_side', () => {
  assert.equal(isActiveAdmin({ role: 'admin', is_active: true }), true);
  assert.equal(isActiveAdmin({ role: 'admin', is_active: false }), false);
  assert.equal(isActiveAdmin({ role: 'student', is_active: true }), false);
  assert.equal(isActiveAdmin(null), false);
});

test('accepts_only_a_single_uuid_announcement_identifier', () => {
  assert.equal(isValidAnnouncementRequest({ announcement_id: '123e4567-e89b-42d3-a456-426614174000' }), true);
  assert.equal(isValidAnnouncementRequest({ announcement_id: 'not-a-uuid' }), false);
  assert.equal(isValidAnnouncementRequest({ announcement_id: ['123e4567-e89b-42d3-a456-426614174000'] }), false);
  assert.equal(isValidAnnouncementRequest(null), false);
});

test('parses_small_json_when_content_length_is_missing', async () => {
  const request = new Request('https://example.test', {
    method: 'POST',
    body: JSON.stringify({ announcement_id: '123e4567-e89b-42d3-a456-426614174000' }),
  });
  assert.equal(request.headers.get('content-length'), null);
  assert.deepEqual(await readJsonWithLimit(request, 128), {
    announcement_id: '123e4567-e89b-42d3-a456-426614174000',
  });
});

test('rejects_oversize_streamed_json_without_relying_on_content_length', async () => {
  const request = new Request('https://example.test', {
    method: 'POST',
    body: JSON.stringify({ announcement_id: '123e4567-e89b-42d3-a456-426614174000', extra: 'x'.repeat(100) }),
  });
  await assert.rejects(readJsonWithLimit(request, 64), PayloadTooLargeError);
});

test('cancels_the_stream_on_the_first_chunk_that_exceeds_the_remaining_limit', async () => {
  let pulls = 0;
  let cancelled = false;
  const request = {
    body: new ReadableStream({
      pull(controller) {
        pulls += 1;
        controller.enqueue(new Uint8Array(65));
      },
      cancel() { cancelled = true; },
    }, { highWaterMark: 0 }),
  };
  await assert.rejects(readJsonWithLimit(request, 64), PayloadTooLargeError);
  assert.equal(pulls, 1);
  assert.equal(cancelled, true);
});

test('rejects_malformed_json_without_echoing_body_contents', async () => {
  const request = new Request('https://example.test', { method: 'POST', body: 'password=do-not-leak' });
  await assert.rejects(readJsonWithLimit(request, 128), SyntaxError);
});

test('public_push_failure_does_not_expose_internal_error_details', () => {
  const error = new Error('SUPABASE_SERVICE_ROLE_KEY=do-not-leak');
  const body = publicPushFailure(error);
  assert.deepEqual(body, { error: 'internal_error' });
  assert.equal(JSON.stringify(body).includes('do-not-leak'), false);
});
