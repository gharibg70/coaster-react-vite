import test from 'node:test';
import assert from 'node:assert/strict';
import { scanClientText } from '../scripts/check-client-secrets.mjs';

test('allows_only_documented_public_supabase_frontend_configuration', () => {
  assert.deepEqual(scanClientText('src/lib/supabase.js', `
    const url = import.meta.env.VITE_SUPABASE_URL;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  `), []);
});

test('rejects_a_service_role_environment_name_without_echoing_its_value', () => {
  const findings = scanClientText('.github/workflows/pages.yml', 'VITE_SUPABASE_SERVICE_ROLE_KEY: very-private-test-value');
  assert.equal(findings.length, 1);
  assert.equal(findings[0].reason, 'forbidden_secret_name');
  assert.equal(JSON.stringify(findings).includes('very-private-test-value'), false);
});

test('rejects_unknown_vite_variables_in_client_code', () => {
  const findings = scanClientText('src/example.js', 'const token = import.meta.env.VITE_PARTNER_API_KEY;');
  assert.equal(findings.length, 1);
  assert.equal(findings[0].reason, 'unapproved_vite_variable');
  assert.equal(findings[0].identifier, 'VITE_PARTNER_API_KEY');
});

test('rejects_a_supabase_service_role_jwt_by_claim_without_echoing_token', () => {
  const payload = Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url');
  const token = `eyJhbGciOiJub25lIn0.${payload}.fake-signature-test`;
  const findings = scanClientText('dist/assets/app.js', `const clientKey = '${token}';`);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].reason, 'service_role_jwt');
  assert.equal(JSON.stringify(findings).includes(token), false);
});

test('rejects_private_key_pem_material', () => {
  const findings = scanClientText('public/config.txt', '-----BEGIN PRIVATE KEY-----\nFAKE-TEST-MATERIAL\n-----END PRIVATE KEY-----');
  assert.equal(findings.length, 1);
  assert.equal(findings[0].reason, 'private_key_material');
  assert.equal(JSON.stringify(findings).includes('FAKE-TEST-MATERIAL'), false);
});
