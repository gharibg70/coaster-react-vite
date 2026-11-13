import { supabase } from '../../lib/supabase.js';
import { dayString } from '../../lib/utils.js';

export function isRoadPulseSetupError(error) {
  const text = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
  return /trip_runs|start_trip_run|finish_trip_run|schema cache|does not exist|could not find the function/.test(text);
}

export async function startTripRun(direction, serviceDate = dayString(0)) {
  if (!['outbound', 'return'].includes(direction)) throw new Error('Invalid trip direction');
  if (!supabase) throw new Error('Supabase is not configured');
  const { data, error } = await supabase.rpc('start_trip_run', {
    p_direction: direction,
    p_service_date: serviceDate,
  });
  if (error) throw error;
  const run = Array.isArray(data) ? data[0] : data;
  if (!run?.trip_id) throw new Error('Trip could not be started');
  return run;
}

export async function finishTripRun(tripId) {
  if (!supabase) throw new Error('Supabase is not configured');
  const { data, error } = await supabase.rpc('finish_trip_run', { p_trip_id: tripId });
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}
