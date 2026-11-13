import test from 'node:test';
import assert from 'node:assert/strict';
import { baghdadDateString, dateOffset, estimateSeatAvailability, summarizeWeek } from '../src/features/student/forecastUtils.js';

const row = (date, outboundTaken, returnTaken, capacity = 10) => ({ date, capacity, outboundTaken, returnTaken });

test('no samples show the required insufficient-data Arabic label', () => {
  const result = estimateSeatAvailability([], 'outbound');
  assert.equal(result.label, 'بيانات غير كافية');
  assert.equal(result.sampleCount, 0);
  assert.equal(result.fillFrequency, null);
});

test('repeated full trips are described as historical frequency, not certainty', () => {
  const result = estimateSeatAvailability([row('2026-11-06', 10, 3), row('2026-10-30', 12, 2)], 'outbound');
  assert.equal(result.sampleCount, 2);
  assert.equal(result.fillFrequency, 1);
  assert.match(result.label, /كل العيّنات/);
  assert.match(result.explanation, /ليس احتمالاً مؤكداً أو ضماناً/);
});

test('partial occupancy is not counted as a full trip', () => {
  const result = estimateSeatAvailability([row('2026-11-06', 6, 4), row('2026-10-30', 10, 8)], 'outbound');
  assert.equal(result.fillFrequency, 0.5);
  assert.match(result.label, /1 من 2/);
});

test('outbound and return fill frequencies are evaluated independently', () => {
  const samples = [row('2026-11-06', 10, 5), row('2026-10-30', 10, 2)];
  assert.equal(estimateSeatAvailability(samples, 'outbound').fillFrequency, 1);
  assert.equal(estimateSeatAvailability(samples, 'return').fillFrequency, 0);
  assert.throws(() => estimateSeatAvailability(samples, 'both'), /direction/);
});

test('seven-day summary crosses Baghdad midnight/calendar boundary correctly', () => {
  // 2026-11-13 21:30Z is already 2026-11-14 in Baghdad (UTC+3).
  const today = baghdadDateString(new Date('2026-11-13T21:30:00Z'));
  assert.equal(today, '2026-11-14');
  assert.equal(dateOffset(today, -6), '2026-11-08');
  const summary = summarizeWeek([row('2026-11-07', 99, 99), row('2026-11-08', 2, 1), row('2026-11-14', 1, 4)], today);
  assert.equal(summary.startDate, '2026-11-08');
  assert.equal(summary.endDate, '2026-11-14');
  assert.equal(summary.days.length, 7);
  assert.equal(summary.totals.outbound, 3);
  assert.equal(summary.totals.return, 5);
  assert.equal(summary.busiestDirection, 'return');
  assert.equal(summary.days[0].date, '2026-11-08');
  assert.equal(summary.days[6].date, '2026-11-14');
});
