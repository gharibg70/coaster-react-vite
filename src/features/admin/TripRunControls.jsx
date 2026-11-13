import { useState } from 'react';
import { finishTripRun, isRoadPulseSetupError, startTripRun } from './tripRunService.js';

const DIRECTIONS = [['outbound', 'ذهاب'], ['return', 'عودة']];
const ACTIVE_RUN_KEY = 'coaster_active_trip_run_v1';

function readActiveRun() {
  try {
    const value = JSON.parse(window.localStorage.getItem(ACTIVE_RUN_KEY) || 'null');
    return value && typeof value.trip_id === 'string' ? value : null;
  } catch { return null; }
}

function removeSavedRun() {
  try { window.localStorage.removeItem(ACTIVE_RUN_KEY); } catch { /* the server remains authoritative */ }
}

export default function TripRunControls({ profile }) {
  const [run, setRun] = useState(readActiveRun);
  const [direction, setDirection] = useState(() => readActiveRun()?.direction || 'outbound');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(() => {
    const saved = readActiveRun();
    return saved ? `يوجد تسجيل مفتوح لرحلة ${saved.direction === 'return' ? 'العودة' : 'الذهاب'} على هذا الجهاز.` : 'نجمع بيانات الرحلات';
  });
  const [setupNeeded, setSetupNeeded] = useState(false);
  if (profile?.role !== 'admin') return null;

  const start = async () => {
    setBusy(true);
    try {
      const activeRun = { ...await startTripRun(direction), direction };
      setRun(activeRun);
      setSetupNeeded(false);
      try {
        window.localStorage.setItem(ACTIVE_RUN_KEY, JSON.stringify(activeRun));
        setMessage(`بدأ تسجيل رحلة ${direction === 'outbound' ? 'الذهاب' : 'العودة'}. أنهِ التسجيل عند انتهاء الرحلة.`);
      } catch {
        setMessage('بدأ التسجيل على الخادم، لكن تعذر حفظه على هذا الجهاز. أبقِ هذه الصفحة مفتوحة حتى تنهي الرحلة.');
      }
    } catch (error) {
      if (isRoadPulseSetupError(error)) { setSetupNeeded(true); setMessage('الميزة تحتاج تثبيت إعداد قاعدة البيانات أولاً.'); }
      else setMessage('تعذر بدء تسجيل الرحلة. تحقق من الاتصال ثم أعد المحاولة.');
    } finally { setBusy(false); }
  };

  const finish = async () => {
    if (!run?.trip_id) return;
    setBusy(true);
    try {
      const result = await finishTripRun(run.trip_id);
      setRun(null);
      removeSavedRun();
      setMessage(`تم حفظ مدة الرحلة (${Math.round(Number(result?.duration_seconds) / 60)} دقيقة).`);
      setSetupNeeded(false);
    } catch (error) {
      if (isRoadPulseSetupError(error)) { setSetupNeeded(true); setMessage('الميزة تحتاج تثبيت إعداد قاعدة البيانات أولاً.'); }
      else setMessage('تعذر إنهاء الرحلة. تحقق من الاتصال؛ يمكنك إعادة المحاولة.');
    } finally { setBusy(false); }
  };

  return <section className="card" aria-labelledby="trip-run-title">
    <h2 id="trip-run-title">المدة التاريخية للرحلات</h2>
    <p className="mu">سجّل بداية الرحلة ونهايتها يدوياً. لا يرتبط التسجيل بتشغيل مشاركة الموقع.</p>
    <label htmlFor="trip-direction">اتجاه الرحلة</label>
    <select id="trip-direction" value={direction} disabled={busy || !!run} onChange={(event) => setDirection(event.target.value)}>
      {DIRECTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
    </select>
    {run
      ? <button type="button" className="sm" disabled={busy} onClick={finish}>إنهاء الرحلة</button>
      : <button type="button" className="sm" disabled={busy} onClick={start}>بدء تسجيل رحلة</button>}
    <p className="mu" role="status" aria-live="polite">{setupNeeded ? 'إعداد مطلوب: طبّق ملف الترحيل من SQL Editor في Supabase. ' : ''}{message}</p>
  </section>;
}
