import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { isInsideGeofence, isValidCoordinates } from './geofenceUtils.js';

const STORAGE_KEY = 'coaster_arrival_reminder_v1';
const DIRECTIONS = { outbound: 'الذهاب', return: 'الإياب' };
const DEFAULTS = { enabled: false, direction: 'outbound', message: 'اقترب الكوستر من وجهته.' };

function readPreferences() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || 'null');
    if (!stored || typeof stored !== 'object') return DEFAULTS;
    return {
      enabled: stored.enabled === true,
      direction: stored.direction === 'return' ? 'return' : 'outbound',
      message: typeof stored.message === 'string' ? stored.message.slice(0, 180) : DEFAULTS.message,
    };
  } catch { return DEFAULTS; }
}

function writePreferences(preferences) {
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences)); return true; }
  catch { return false; }
}

export default function ArrivalReminder({ showToast, reportError }) {
  const [preferences, setPreferences] = useState(readPreferences);
  const [destination, setDestination] = useState(null);
  const [busLocation, setBusLocation] = useState(null);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [pageActive, setPageActive] = useState(() => document.visibilityState === 'visible');
  const notified = useRef(false);

  useEffect(() => {
    const updateVisibility = () => setPageActive(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', updateVisibility);
    return () => document.removeEventListener('visibilitychange', updateVisibility);
  }, []);

  useEffect(() => {
    let alive = true;
    if (!supabase) { setConfigLoaded(true); return undefined; }
    supabase.from('system_settings').select('value').eq('key', `arrival_destination_${preferences.direction}`).maybeSingle()
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) reportError?.(error);
        let value = data?.value;
        if (typeof value === 'string') { try { value = JSON.parse(value); } catch { value = null; } }
        setDestination(value && isValidCoordinates(value) && Number(value.radiusMeters) > 0
          ? { lat: Number(value.lat), lng: Number(value.lng), radiusMeters: Number(value.radiusMeters) } : null);
        setConfigLoaded(true);
      }).catch((error) => { if (alive) { reportError?.(error); setConfigLoaded(true); } });
    return () => { alive = false; };
  }, [preferences.direction, reportError]);

  useEffect(() => {
    if (!supabase) return undefined;
    let alive = true;
    supabase.from('bus_location').select('lat,lng,accuracy,is_sharing,updated_at').eq('id', 1).maybeSingle()
      .then(({ data, error }) => { if (!alive) return; if (error) reportError?.(error); if (data) setBusLocation(data); })
      .catch((error) => { if (alive) reportError?.(error); });
    const channel = supabase.channel('arrival-reminder-bus-location')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bus_location', filter: 'id=eq.1' }, (payload) => {
        if (payload.new) setBusLocation(payload.new);
      }).subscribe();
    return () => { alive = false; supabase.removeChannel(channel); };
  }, [reportError]);

  useEffect(() => {
    if (!preferences.enabled || !configLoaded || !destination || !busLocation?.is_sharing || !isValidCoordinates(busLocation)) return;
    const inside = isInsideGeofence(busLocation, destination);
    if (!inside) { notified.current = false; return; }
    if (notified.current || !pageActive) return;
    notified.current = true;
    const title = `اقترب الكوستر من وجهة ${DIRECTIONS[preferences.direction]}`;
    const notifyInApp = () => showToast?.(`${title}: ${preferences.message}`);
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
      notifyInApp();
      return;
    }
    try { new Notification(title, { body: preferences.message, tag: 'coaster-arrival-reminder' }); }
    catch { notifyInApp(); }
  }, [preferences, destination, busLocation, configLoaded, pageActive, showToast]);

  function update(field, value) {
    setPreferences((current) => {
      const next = { ...current, [field]: value };
      if (!writePreferences(next)) showToast?.('تعذر حفظ إعدادات التذكير على هذا الجهاز.', true);
      return next;
    });
  }

  async function enableReminder() {
    if (!configLoaded || !destination) {
      showToast?.('لم تُضبط وجهة هذا الاتجاه بعد؛ اطلب من الإدارة إعدادها.', true);
      return;
    }
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      try { await Notification.requestPermission(); } catch { /* app toast remains available */ }
    }
    notified.current = false;
    update('enabled', true);
    showToast?.('فُعّل التذكير أثناء بقاء التطبيق مفتوحاً ونشطاً. لا نضمن التنبيه في الخلفية.');
  }

  function disableReminder() {
    update('enabled', false);
    notified.current = false;
    showToast?.('تم إيقاف تذكير الوصول.');
  }

  const unavailable = configLoaded && !destination;
  return <section className="card" aria-labelledby="arrival-reminder-title">
    <h2 id="arrival-reminder-title">تذكير الوصول</h2>
    <p className="mu">ينبهك التطبيق عند اقتراب موقع الكوستر المشترك من الوجهة. لا نجمع موقع هاتفك. يعمل التذكير عند بقاء الصفحة مفتوحة ونشطة فقط؛ لا نضمن التنبيه في الخلفية.</p>
    <label htmlFor="arrival-direction">اتجاه الرحلة</label>
    <select id="arrival-direction" value={preferences.direction} onChange={(event) => { notified.current = false; update('direction', event.target.value); setConfigLoaded(false); }}>
      <option value="outbound">الذهاب</option><option value="return">الإياب</option>
    </select>
    <label htmlFor="arrival-message">نص التذكير (محفوظ على هذا الجهاز فقط)</label>
    <textarea id="arrival-message" maxLength={180} rows={3} value={preferences.message} onChange={(event) => update('message', event.target.value)} />
    {unavailable && <p className="alert" role="status">وجهة هذا الاتجاه غير متاحة حالياً. اطلب من الإدارة ضبطها.</p>}
    <p className="mu" role="status">{!configLoaded ? 'جارٍ التحقق من الوجهة…' : !busLocation ? 'بانتظار موقع الكوستر المشترك…' : !busLocation.is_sharing ? 'مشاركة موقع الكوستر متوقفة.' : 'يعتمد التنبيه على آخر موقع يشاركه الكوستر.'}</p>
    {preferences.enabled
      ? <button type="button" className="ghost full" onClick={disableReminder}>إيقاف تذكير الوصول</button>
      : <button type="button" className="full" disabled={!configLoaded || unavailable} onClick={enableReminder}>تفعيل تذكير الوصول</button>}
  </section>;
}
