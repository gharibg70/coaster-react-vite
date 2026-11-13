const MIN_SAMPLES = 4;

export function weekdayForServiceDate(serviceDate) {
  if (typeof serviceDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(serviceDate)) return null;
  const parsed = new Date(`${serviceDate}T12:00:00Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== serviceDate) return null;
  return parsed.getUTCDay();
}

function validDuration(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function median(values) {
  const sorted = values.map(Number).filter((number) => Number.isFinite(number) && number > 0).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** Identify only common missing-function/table/schema-cache errors as setup issues. */
export function isRoadPulseSetupError(error) {
  const message = `${error?.code || ''} ${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
  return /pgrst202|pgrst205|42p01|42883|trip_runs|start_trip_run|finish_trip_run|schema cache|could not find the function/.test(message);
}

/** Samples are aggregate RPC rows, never individual trip records. */
export function estimateRoadPulse(samples, direction, weekday) {
  if (!Array.isArray(samples)) return { status: 'unavailable', message: 'نجمع بيانات الرحلات' };
  if (!['outbound', 'return'].includes(direction) || !Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
    return { status: 'invalid', message: 'تعذر تحديد بيانات الرحلة' };
  }
  const row = samples.find((item) => item?.direction === direction && Number(item.weekday) === weekday);
  if (!row) return { status: 'collecting', message: 'نجمع بيانات الرحلات', sampleCount: 0 };
  const sampleCount = Number(row.sample_count);
  const comparableMedian = validDuration(row.median_duration_seconds);
  const allWeekCount = Number(row.all_week_sample_count);
  const allWeekMedian = validDuration(row.all_week_median_duration_seconds);
  if (!Number.isInteger(sampleCount) || sampleCount < MIN_SAMPLES || !comparableMedian) {
    return { status: 'collecting', message: 'نجمع بيانات الرحلات', sampleCount: Number.isFinite(sampleCount) ? sampleCount : 0 };
  }
  if (!Number.isInteger(allWeekCount) || allWeekCount < 1 || !allWeekMedian) {
    return { status: 'collecting', message: 'نجمع بيانات الرحلات', sampleCount };
  }
  return {
    status: 'estimate', direction, weekday, sampleCount,
    medianDurationSeconds: comparableMedian,
    allWeekMedianDurationSeconds: allWeekMedian,
    differenceSeconds: comparableMedian - allWeekMedian,
    message: 'وسيط تاريخي للمدة، وليس حالة حركة المرور الآن أو وقت وصول مضمون.',
  };
}

/** Pure helper for local raw-duration tests and consumers; production RPC returns aggregates. */
export function estimateFromDurations(comparableDurations, allWeekDurations) {
  if (!Array.isArray(comparableDurations) || !Array.isArray(allWeekDurations)) return { status: 'unavailable', message: 'نجمع بيانات الرحلات' };
  const comparable = comparableDurations.map(validDuration).filter(Boolean);
  const weekly = allWeekDurations.map(validDuration).filter(Boolean);
  if (comparable.length < MIN_SAMPLES || !median(comparable) || !median(weekly)) return { status: 'collecting', message: 'نجمع بيانات الرحلات', sampleCount: comparable.length };
  return {
    status: 'estimate', sampleCount: comparable.length,
    medianDurationSeconds: median(comparable), allWeekMedianDurationSeconds: median(weekly),
    differenceSeconds: median(comparable) - median(weekly),
  };
}

export async function loadRoadPulse() {
  const { supabase } = await import('../../lib/supabase.js');
  if (!supabase) throw new Error('Supabase is not configured');
  const { data, error } = await supabase.rpc('get_road_pulse');
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}
