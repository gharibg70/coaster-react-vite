import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateFromDurations, estimateRoadPulse, weekdayForServiceDate } from '../src/features/student/roadPulseService.js';

test('missing or inaccessible samples produce collecting/unavailable state', () => {
  assert.equal(estimateRoadPulse(null, 'outbound', 1).status, 'unavailable');
  assert.equal(estimateRoadPulse([], 'outbound', 1).status, 'collecting');
  assert.equal(estimateFromDurations(null, []).status, 'unavailable');
});

test('invalid direction, weekday, date, and invalid or negative durations are handled safely', () => {
  assert.equal(estimateRoadPulse([], 'north', 1).status, 'invalid');
  assert.equal(estimateRoadPulse([], 'return', 7).status, 'invalid');
  assert.equal(weekdayForServiceDate('2026-02-30'), null);
  assert.equal(weekdayForServiceDate('not-a-date'), null);
  assert.equal(estimateFromDurations([0, -20, 'bad', null], [100]).status, 'collecting');
});

test('unfinished trip rows cannot make a student estimate', () => {
  const row = { direction: 'outbound', weekday: 2, sample_count: 3, median_duration_seconds: null,
    all_week_sample_count: 3, all_week_median_duration_seconds: 900 };
  assert.deepEqual(estimateRoadPulse([row], 'outbound', 2), {
    status: 'collecting', message: 'نجمع بيانات الرحلات', sampleCount: 3,
  });
});

test('fewer than four comparable records stay in collecting state', () => {
  const row = { direction: 'return', weekday: 4, sample_count: 3, median_duration_seconds: 1200,
    all_week_sample_count: 8, all_week_median_duration_seconds: 1100 };
  assert.equal(estimateRoadPulse([row], 'return', 4).status, 'collecting');
  assert.equal(estimateFromDurations([100, 200, 300], [100, 200, 300]).status, 'collecting');
});

test('four-or-more same-direction, same-weekday samples return historical and all-week medians', () => {
  const samples = [
    { direction: 'outbound', weekday: 3, sample_count: 4, median_duration_seconds: 1500,
      all_week_sample_count: 12, all_week_median_duration_seconds: 1200 },
    { direction: 'return', weekday: 3, sample_count: 20, median_duration_seconds: 800,
      all_week_sample_count: 24, all_week_median_duration_seconds: 900 },
  ];
  const result = estimateRoadPulse(samples, 'outbound', 3);
  assert.equal(result.status, 'estimate');
  assert.equal(result.sampleCount, 4);
  assert.equal(result.medianDurationSeconds, 1500);
  assert.equal(result.allWeekMedianDurationSeconds, 1200);
  assert.equal(result.differenceSeconds, 300);
  assert.equal(estimateRoadPulse(samples, 'outbound', 1).status, 'collecting');
});

test('pure duration helper calculates conventional medians while filtering invalid records', () => {
  const result = estimateFromDurations([600, 1200, 900, 1500, -3, NaN], [300, 600, 900, 1200]);
  assert.equal(result.status, 'estimate');
  assert.equal(result.sampleCount, 4);
  assert.equal(result.medianDurationSeconds, 1050);
  assert.equal(result.allWeekMedianDurationSeconds, 750);
  assert.equal(result.differenceSeconds, 300);
});

test('service-date weekday uses date-only calendar day without local timezone drift', () => {
  assert.equal(weekdayForServiceDate('2026-11-13'), 5);
  assert.equal(weekdayForServiceDate('2026-11-15'), 0);
});
