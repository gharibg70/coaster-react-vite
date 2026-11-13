import { supabase } from '../../lib/supabase.js';
import { baghdadDateString, dateOffset, normalizeSeatRecord } from './forecastUtils.js';

/**
 * Load aggregate seat counts only (never attendance rows or passenger identity).
 * Forecast history uses the six prior occurrences of targetDate's weekday.
 */
export async function loadSeatHistory(routeId, targetDate, samples = 6) {
  const count = Math.max(0, Math.floor(Number(samples) || 0));
  const dates = [];
  let cursor = targetDate;
  while (dates.length < count) {
    cursor = dateOffset(cursor, -1);
    if (new Date(`${cursor}T12:00:00Z`).getUTCDay() === new Date(`${targetDate}T12:00:00Z`).getUTCDay()) dates.push(cursor);
  }
  return Promise.all(dates.map(async (date) => {
    const { data, error } = await supabase.rpc('get_seats', { p_route_id: routeId, p_date: date });
    if (error) throw error;
    return normalizeSeatRecord(date, Array.isArray(data) ? data[0] : data);
  }));
}

/** Load the current Baghdad day and previous six calendar days as aggregates. */
export async function loadWeeklySeatHistory(routeId, today = baghdadDateString()) {
  const dates = Array.from({ length: 7 }, (_, index) => dateOffset(today, index - 6));
  return Promise.all(dates.map(async (date) => {
    const { data, error } = await supabase.rpc('get_seats', { p_route_id: routeId, p_date: date });
    if (error) throw error;
    return normalizeSeatRecord(date, Array.isArray(data) ? data[0] : data);
  }));
}
