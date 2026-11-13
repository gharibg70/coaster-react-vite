const BAGHDAD = 'Asia/Baghdad';

/** Return YYYY-MM-DD for an instant in Baghdad (or validate a supplied date key). */
export function baghdadDateString(now = new Date()) {
  if (typeof now === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(now)) return now;
  return new Intl.DateTimeFormat('en-CA', { timeZone: BAGHDAD, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** Calendar-day arithmetic on date-only values, independent of machine timezone. */
export function dateOffset(date, days) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/** Sanitize the existing RPC's aggregate fields into the anonymous public shape. */
export function normalizeSeatRecord(date, row) {
  if (!row) return { date, capacity: null, outboundTaken: null, returnTaken: null };
  const finite = (value) => Number.isFinite(Number(value)) && value !== null ? Number(value) : null;
  return {
    date,
    capacity: finite(row.capacity),
    outboundTaken: finite(row.outbound_taken),
    returnTaken: finite(row.return_taken),
  };
}

/**
 * Describe historical fill frequency for one direction, not a calibrated
 * probability or guarantee. Direction is 'outbound' or 'return'.
 */
export function estimateSeatAvailability(samples, direction) {
  const field = direction === 'outbound' ? 'outboundTaken' : direction === 'return' ? 'returnTaken' : null;
  if (!field) throw new TypeError("direction must be 'outbound' or 'return'");
  const valid = (samples || []).filter((item) => Number.isFinite(item?.capacity) && item.capacity > 0 && Number.isFinite(item?.[field]));
  if (!valid.length) return { label: 'بيانات غير كافية', explanation: 'لا تتوفر بيانات مجمعة كافية لهذا الاتجاه.', sampleCount: 0, fillFrequency: null };
  const fullCount = valid.filter((item) => item[field] >= item.capacity).length;
  const frequency = fullCount / valid.length;
  const label = frequency === 0 ? 'لم تُسجّل رحلات ممتلئة' : frequency === 1 ? 'سُجّلت ممتلئة في كل العيّنات' : `سُجّلت ممتلئة في ${fullCount} من ${valid.length} عيّنات`;
  return {
    label,
    explanation: `هذا وصف لتكرار امتلاء المقاعد في آخر ${valid.length} أيام مماثلة، وليس احتمالاً مؤكداً أو ضماناً للتوفر.`,
    sampleCount: valid.length,
    fillFrequency: frequency,
  };
}

/** Summarize aggregate RPC records in the rolling seven Baghdad calendar days. */
export function summarizeWeek(records, todayBaghdad = baghdadDateString()) {
  const start = dateOffset(todayBaghdad, -6);
  const byDate = new Map((records || []).filter((row) => row?.date >= start && row.date <= todayBaghdad).map((row) => [row.date, row]));
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = dateOffset(start, index);
    const row = byDate.get(date);
    const outbound = row && Number.isFinite(row.outboundTaken) ? row.outboundTaken : 0;
    const returning = row && Number.isFinite(row.returnTaken) ? row.returnTaken : 0;
    return { date, outbound, return: returning, total: outbound + returning };
  });
  const totals = { outbound: days.reduce((sum, day) => sum + day.outbound, 0), return: days.reduce((sum, day) => sum + day.return, 0) };
  const busiest = days.reduce((best, day) => day.total > (best?.total ?? 0) ? day : best, null);
  const busiestDirection = totals.outbound === totals.return ? null : totals.outbound > totals.return ? 'outbound' : 'return';
  return { startDate: start, endDate: todayBaghdad, days, totals, busiestDay: busiest?.total > 0 ? busiest : null, busiestDirection };
}
