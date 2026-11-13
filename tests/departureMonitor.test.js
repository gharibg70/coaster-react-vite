import test from 'node:test';
import assert from 'node:assert/strict';
import { getShareWarning } from '../src/features/admin/departureService.js';

// Baghdad is UTC+3; explicit UTC instants keep tests independent of host timezone.
const NOW = new Date('2026-11-13T08:00:00.000Z'); // 11:00 Baghdad
const fresh = '2026-11-13T07:59:00.000Z';

test('suppresses warning before expected departure', () => {
  assert.equal(getShareWarning({ expectedTime: '11:05', nowBaghdad: NOW, isSharing: false }), null);
});

test('suppresses warning during the ten-minute grace period', () => {
  assert.equal(getShareWarning({ expectedTime: '10:55', nowBaghdad: NOW, isSharing: false }), null);
});

test('does not warn when sharing is active and current', () => {
  assert.equal(getShareWarning({ expectedTime: '10:00', nowBaghdad: NOW, isSharing: true, updatedAt: fresh }), null);
});

test('warns after grace when sharing is off', () => {
  assert.deepEqual(getShareWarning({ expectedTime: '10:00', nowBaghdad: NOW, isSharing: false, updatedAt: fresh }), { reason: 'not-sharing', expectedTime: '10:00' });
});

test('warns after grace when sharing update is over 120 seconds old', () => {
  assert.deepEqual(getShareWarning({ expectedTime: '10:00', nowBaghdad: NOW, isSharing: true, updatedAt: '2026-11-13T07:57:59.000Z' }), { reason: 'stale', expectedTime: '10:00' });
});

test('suppresses warning when expected departure time is unset or status is unavailable', () => {
  assert.equal(getShareWarning({ expectedTime: '', nowBaghdad: NOW, isSharing: false }), null);
  assert.equal(getShareWarning({ expectedTime: '10:00', nowBaghdad: NOW, isSharing: undefined, updatedAt: null }), null);
});
