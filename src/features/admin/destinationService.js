import { supabase } from '../../lib/supabase.js';
import { isValidCoordinates } from '../student/geofenceUtils.js';

const KEYS = { outbound: 'arrival_destination_outbound', return: 'arrival_destination_return' };

function validateDestination(value) {
  if (!isValidCoordinates(value)) throw new Error('أدخل إحداثيات صحيحة: خط العرض بين ‎-90 و90 وخط الطول بين ‎-180 و180.');
  const radiusMeters = Number(value.radiusMeters);
  if (!Number.isFinite(radiusMeters) || radiusMeters < 10 || radiusMeters > 50000) {
    throw new Error('نطاق التنبيه يجب أن يكون بين 10 و50000 متر.');
  }
  return { lat: Number(value.lat), lng: Number(value.lng), radiusMeters };
}

export async function loadDestinations() {
  if (!supabase) throw new Error('الاتصال بالخادم غير متاح.');
  const { data, error } = await supabase.from('system_settings').select('key,value').in('key', Object.values(KEYS));
  if (error) throw error;
  const result = { outbound: null, return: null };
  for (const row of data || []) {
    const direction = Object.keys(KEYS).find((key) => KEYS[key] === row.key);
    if (!direction) continue;
    try {
      const value = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
      if (value && isValidCoordinates(value) && Number.isFinite(Number(value.radiusMeters)) && Number(value.radiusMeters) > 0) {
        result[direction] = { lat: Number(value.lat), lng: Number(value.lng), radiusMeters: Number(value.radiusMeters) };
      }
    } catch { /* malformed settings are treated as not configured */ }
  }
  return result;
}

export async function saveDestination(direction, destination) {
  if (!supabase) throw new Error('الاتصال بالخادم غير متاح.');
  if (!KEYS[direction]) throw new Error('اتجاه غير معروف.');
  const value = validateDestination(destination);
  const { error } = await supabase.from('system_settings').upsert({ key: KEYS[direction], value, updated_at: new Date().toISOString() });
  if (error) throw error;
  return value;
}
