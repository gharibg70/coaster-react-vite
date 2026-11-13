const BAGHDAD = 'Asia/Baghdad';
const GRACE_MS = 10 * 60 * 1000;
const STALE_MS = 120 * 1000;

function baghdadParts(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BAGHDAD,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  return Object.fromEntries(parts.filter(({ type }) => type !== 'literal').map(({ type, value }) => [type, Number(value)]));
}

function baghdadWallTimeToDate(year, month, day, hour, minute) {
  const target = Date.UTC(year, month - 1, day, hour, minute);
  let guess = target;
  for (let i = 0; i < 3; i += 1) {
    const p = baghdadParts(new Date(guess));
    guess += target - Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  }
  return new Date(guess);
}

/** Return a warning descriptor only after the Baghdad departure time plus grace. */
export function getShareWarning({ expectedTime, nowBaghdad = new Date(), isSharing, updatedAt }) {
  if (!expectedTime || typeof expectedTime !== 'string') return null;
  const match = /^(\d{2}):(\d{2})$/.exec(expectedTime);
  if (!match) return null;
  if (typeof isSharing !== 'boolean') return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  const now = nowBaghdad instanceof Date ? nowBaghdad : new Date(nowBaghdad);
  if (!Number.isFinite(now.getTime())) return null;
  const parts = baghdadParts(now);
  const departure = baghdadWallTimeToDate(parts.year, parts.month, parts.day, hour, minute);
  if (now.getTime() < departure.getTime() + GRACE_MS) return null;
  const updateTime = updatedAt ? new Date(updatedAt).getTime() : NaN;
  const stale = !Number.isFinite(updateTime) || now.getTime() - updateTime > STALE_MS;
  if (isSharing && !stale) return null;
  return { reason: !isSharing ? 'not-sharing' : 'stale', expectedTime };
}

export async function loadExpectedDepartureTime() {
  const { supabase } = await import('../../lib/supabase.js');
  const { data, error } = await supabase.from('system_settings').select('value')
    .eq('key', 'expected_departure_time').maybeSingle();
  if (error) throw error;
  return data?.value ?? '';
}

export async function saveExpectedDepartureTime(value) {
  const { supabase } = await import('../../lib/supabase.js');
  const { error } = await supabase.from('system_settings').upsert({
    key: 'expected_departure_time', value, updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function loadBusShareStatus() {
  const { supabase } = await import('../../lib/supabase.js');
  const { data, error } = await supabase.from('bus_location').select('is_sharing,updated_at').eq('id', 1).maybeSingle();
  if (error) throw error;
  return data;
}
