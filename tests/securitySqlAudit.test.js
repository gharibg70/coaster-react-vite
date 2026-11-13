import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const auditSql = readFileSync(new URL('../docs/security/supabase-policy-audit.sql', import.meta.url), 'utf8');
const statements = auditSql
  .replace(/--[^\n]*/g, '')
  .split(';')
  .map((statement) => statement.trim())
  .filter(Boolean);

test('policy_audit_contains_only_paginated_select_statements', () => {
  assert.equal(statements.length, 3, 'expected exactly three read-only inventory queries');
  for (const statement of statements) {
    assert.match(statement, /^SELECT\b/i);
    assert.match(statement, /\bLIMIT\s+\d+\s+OFFSET\s+\d+\b/i);
  }
  assert.doesNotMatch(auditSql, /;\s*(?:CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|TRUNCATE|GRANT|REVOKE|CALL|DO)\b/i);
});
