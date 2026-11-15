import test from 'node:test';
import assert from 'node:assert/strict';
import { diagnosePushConfiguration, PUSH_FUNCTION_SLUG, sendPushNotification } from '../src/features/admin/pushService.js';

test('uses_the_active_deployed_push_function_slug', async () => {
  const calls = [];
  const client = { functions: { invoke: async (...args) => { calls.push(args); return { data: { sent: 1 }, error: null }; } } };
  assert.equal(PUSH_FUNCTION_SLUG, 'bright-task');
  assert.deepEqual(await sendPushNotification('123e4567-e89b-42d3-a456-426614174000', client), { sent: 1 });
  assert.deepEqual(calls, [['bright-task', { body: { announcement_id: '123e4567-e89b-42d3-a456-426614174000' } }]]);
});

test('propagates_push_invocation_errors_without_exposing_credentials', async () => {
  const failure = new Error('network failure');
  const client = { functions: { invoke: async () => ({ data: null, error: failure }) } };
  await assert.rejects(sendPushNotification('123e4567-e89b-42d3-a456-426614174000', client), (error) => error === failure);
});

test('diagnostic_invokes_the_active_function_without_an_announcement_or_push_payload', async () => {
  const calls = [];
  const client = { functions: { invoke: async (...args) => { calls.push(args); return { data: { ok: true }, error: null }; } } };
  assert.deepEqual(await diagnosePushConfiguration(client), { ok: true });
  assert.deepEqual(calls, [['bright-task', { body: { diagnostic: true } }]]);
});
