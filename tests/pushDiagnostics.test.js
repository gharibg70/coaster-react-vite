import test from 'node:test';
import assert from 'node:assert/strict';
import { diagnosePushSetup } from '../supabase/functions/bright-task/pushDiagnostics.js';

const validEnvironment = () => ({
  VAPID_SUBJECT: 'mailto:admin@example.test',
  VAPID_PUBLIC_KEY: 'public-value',
  VAPID_PRIVATE_KEY: 'private-value',
});

test('reports_missing_VAPID_setting_names_without_reading_or_returning_values', async () => {
  const env = validEnvironment();
  delete env.VAPID_PRIVATE_KEY;
  let queryCalled = false;
  const result = await diagnosePushSetup({
    getEnv: (name) => env[name] ?? null,
    setVapidDetails() { assert.fail('must not validate missing credentials'); },
    loadActiveSubscriptions() { queryCalled = true; return { count: 0 }; },
  });
  assert.deepEqual(result, { ok: false, code: 'vapid_configuration_missing', missing: ['VAPID_PRIVATE_KEY'] });
  assert.equal(JSON.stringify(result).includes('public-value'), false);
  assert.equal(queryCalled, false);
});

test('reports_invalid_VAPID_configuration_without_exposing_the_error_message', async () => {
  const result = await diagnosePushSetup({
    getEnv: (name) => validEnvironment()[name],
    setVapidDetails() { throw new Error('private-value must not appear in diagnostics'); },
    loadActiveSubscriptions() { assert.fail('must stop after VAPID validation'); },
  });
  assert.deepEqual(result, { ok: false, code: 'vapid_configuration_invalid' });
  assert.equal(JSON.stringify(result).includes('private-value'), false);
});

test('reports_only_a_safe_database_code_when_the_subscription_query_fails', async () => {
  const result = await diagnosePushSetup({
    getEnv: (name) => validEnvironment()[name],
    setVapidDetails() {},
    loadActiveSubscriptions: async () => ({ error: { code: 'PGRST200', message: 'sensitive query detail' } }),
  });
  assert.deepEqual(result, { ok: false, code: 'subscription_query_failed', sqlstate: 'PGRST200' });
  assert.equal(JSON.stringify(result).includes('sensitive query detail'), false);
});

test('diagnostic_reports_ready_and_active_subscription_count_without_sending', async () => {
  let sent = false;
  const result = await diagnosePushSetup({
    getEnv: (name) => validEnvironment()[name],
    setVapidDetails() {},
    loadActiveSubscriptions: async () => ({ count: 4, data: null }),
    sendNotification: async () => { sent = true; },
  });
  assert.deepEqual(result, { ok: true, code: 'ready', activeSubscriptions: 4 });
  assert.equal(sent, false);
});
