import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { getShareWarning, loadBusShareStatus, loadExpectedDepartureTime, saveExpectedDepartureTime } from './departureService.js';

export default function DepartureMonitor({ showToast, reportError }) {
  const [expectedTime, setExpectedTime] = useState('');
  const [busStatus, setBusStatus] = useState(null);
  const [now, setNow] = useState(() => new Date());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let mounted = true;
    const refresh = async () => {
      try {
        const [time, status] = await Promise.all([loadExpectedDepartureTime(), loadBusShareStatus()]);
        if (mounted) { setExpectedTime(time); setBusStatus(status); setLoaded(true); }
      } catch (error) { if (mounted) reportError(error); }
    };
    refresh();
    const channel = supabase.channel('admin-departure-monitor')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'bus_location' }, ({ new: row }) => setBusStatus(row))
      .subscribe();
    const poll = window.setInterval(() => { setNow(new Date()); loadBusShareStatus().then(status => { if (mounted) setBusStatus(status); }).catch(error => { if (mounted) reportError(error); }); }, 15_000);
    return () => { mounted = false; window.clearInterval(poll); supabase.removeChannel(channel); };
  }, [reportError]);

  const warning = getShareWarning({ expectedTime, nowBaghdad: now, isSharing: busStatus?.is_sharing, updatedAt: busStatus?.updated_at });
  const save = async event => {
    event.preventDefault();
    try { await saveExpectedDepartureTime(expectedTime); showToast('تم حفظ موعد انطلاق الكوستر'); }
    catch (error) { reportError(error); }
  };
  const age = busStatus?.updated_at ? Math.max(0, Math.floor((now.getTime() - new Date(busStatus.updated_at).getTime()) / 1000)) : null;
  const message = !loaded ? 'جاري تحميل حالة الانطلاق…' : !expectedTime
    ? 'حدد موعد الانطلاق لتفعيل تنبيه عدم مشاركة الموقع.'
    : !busStatus ? 'تعذر قراءة حالة موقع الكوستر؛ لا يمكن إصدار تنبيه موثوق الآن.'
      : warning ? (warning.reason === 'not-sharing' ? 'تنبيه: لم تبدأ مشاركة موقع الكوستر بعد موعد الانطلاق.' : 'تنبيه: تحديثات موقع الكوستر متوقفة منذ أكثر من دقيقتين.')
        : busStatus.is_sharing ? `مشاركة الموقع نشطة · آخر تحديث ${age == null ? 'غير معروف' : `${age} ثانية`}` : 'مشاركة الموقع متوقفة؛ يبدأ التنبيه بعد موعد الانطلاق وفترة السماح.';

  return <section className="card" aria-live="polite" aria-atomic="true">
    <h2><i className="fa-solid fa-clock" aria-hidden="true"/> متابعة موعد الانطلاق</h2>
    <form onSubmit={save}>
      <label htmlFor="expected-departure-time">موعد الانطلاق المتوقع (بتوقيت بغداد)</label>
      <input id="expected-departure-time" type="time" value={expectedTime} onChange={event => setExpectedTime(event.target.value)} />
      <button className="full" type="submit">حفظ موعد الانطلاق</button>
    </form>
    <p role={warning ? 'alert' : 'status'} className={warning ? 'danger' : 'mu'}>{message}</p>
    <p className="mu">يظهر التنبيه للمشرفين فقط بعد مرور 10 دقائق على الموعد؛ ويُعد التحديث متوقفاً إذا تجاوز عمره 120 ثانية. لا تُرسل إشعارات للطلاب.</p>
  </section>;
}
