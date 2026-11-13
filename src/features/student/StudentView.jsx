import { useEffect, useState } from 'react';
import { dayString, DAYS, tripLabel } from '../../lib/utils.js';
import { loadStudentData, redeemCode, setAttendance, setWeeklyDefault } from './studentService.js';
import BusMap from '../map/BusMap.jsx';
import PushSettings from '../notifications/PushSettings.jsx';
import StudentInsights from './StudentInsights.jsx';
import ArrivalReminder from './ArrivalReminder.jsx';
import ChatPanel from '../chat/ChatPanel.jsx';

const OPTIONS = [
  [true, true, 'أذهب وأرجع', 'دهوك إلى الموصل ثم العودة', 'fa-arrows-left-right'],
  [true, false, 'أذهب فقط', 'دهوك إلى الموصل', 'fa-arrow-right'],
  [false, true, 'أرجع فقط', 'الموصل إلى دهوك', 'fa-arrow-left'],
  [false, false, 'لا أداوم', 'لا حجز لأي رحلة', 'fa-bed'],
];
const TABS = [['home', 'الرئيسية', 'fa-house'], ['map', 'الكوستر', 'fa-location-dot'], ['chat', 'الدردشة', 'fa-comments'], ['ann', 'التنبيهات', 'fa-bell'], ['hist', 'السجل', 'fa-clock-rotate-left'], ['profile', 'حسابي', 'fa-user']];

export default function StudentView({ profile, showToast, reportError }) {
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('home');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    setBusy(true);
    try { setData(await loadStudentData(profile)); }
    catch (error) { reportError(error); }
    finally { setBusy(false); }
  };

  useEffect(() => { refresh(); }, [profile.id]);

  if (!data && busy) return <div className="splash"><div className="spinner"/><p className="mu">جاري التحميل...</p></div>;
  if (!data) return <div className="card"><p className="mu">تعذر تحميل بيانات الطالب.</p><button onClick={refresh}>إعادة المحاولة</button></div>;
  if (!data.subscription) return <form className="card" onSubmit={async (event) => {
    event.preventDefault();
    try { await redeemCode(code.trim()); showToast('تم تفعيل الاشتراك'); refresh(); }
    catch (error) { reportError(error); }
  }}><h2><i className="fa-solid fa-key"/> تفعيل الحساب</h2><p>لم يُفعّل اشتراكك بعد. أدخل رمز الاشتراك:</p><input dir="ltr" value={code} onChange={(event) => setCode(event.target.value)} placeholder="BUS-XXXX"/><button className="full">تفعيل الاشتراك</button></form>;

  const subscription = data.subscription;
  const seats = data.seats;
  const capacity = seats?.capacity || 0;
  const current = data.attendance ? `${data.attendance.outbound}${data.attendance.return_trip}` : null;
  const expired = subscription.end_date && subscription.end_date < data.date;
  const soon = subscription.end_date && !expired && subscription.end_date <= dayString(5);
  const inactive = subscription.status !== 'active' || expired;
  const count = (direction) => seats?.[`${direction}_taken`] || 0;
  const freePercent = (direction) => capacity ? Math.max(0, ((capacity - count(direction)) / capacity) * 100) : 0;
  const barColor = (percent) => percent > 40 ? 'var(--pr)' : percent > 10 ? 'var(--ac)' : 'var(--dn)';

  return <>
    {tab === 'home' && <section className="tab-content active">
      <div className="card">
        <div className="hero-head"><small>مرحباً {profile.full_name?.split(' ')[0]}</small><h1>دوام الغد</h1><span><i className="fa-regular fa-calendar"/> {new Date(`${data.date}T12:00:00`).toLocaleDateString('ar-IQ-u-nu-latn', { weekday: 'long', day: 'numeric', month: 'long' })}</span></div>
        {subscription.status !== 'active' && <div className="alert">اشتراكك موقوف. راجع صاحب الكوستر.</div>}
        {expired && <div className="alert">انتهى اشتراكك. جدّد لتأكيد الدوام.</div>}
        {soon && <div className="alert">ينتهي اشتراكك في {subscription.end_date}.</div>}
        {seats && <div className="seatbox">{[['outbound', 'ذهاب'], ['return', 'عودة']].map(([key, label]) => <div key={key}><div className="seat-label"><span>{label}</span><span style={{ color: barColor(freePercent(key)) }}>{Math.max(0, capacity - count(key))} مقعد</span></div><div className="progress-container"><div className="progress-bar" style={{ width: `${freePercent(key)}%`, background: barColor(freePercent(key)) }}/></div></div>)}</div>}
        {OPTIONS.map(([outbound, returnTrip, title, description, icon]) => {
          const full = (outbound && seats && count('outbound') >= capacity && !data.attendance?.outbound) || (returnTrip && seats && count('return') >= capacity && !data.attendance?.return_trip);
          return <button key={title} className={`opt ${current === `${outbound}${returnTrip}` ? 'sel' : ''}`} disabled={inactive || full || busy} onClick={async () => {
            try { await setAttendance(subscription.route_id, data.date, outbound, returnTrip); showToast('تم حفظ اختيارك بنجاح'); await refresh(); }
            catch (error) { reportError(error); }
          }}><span><b>{title}</b><small>{description}{full ? ' · ممتلئ' : ''}</small></span><i className={`fa-solid ${icon}`}/></button>;
        })}
        {data.attendance?.auto && <p className="mu center">تم التأكيد تلقائياً من جدولك الثابت.</p>}
      </div>
      <StudentInsights routeId={subscription.route_id} serviceDate={data.date}/>
      <div className="card"><h2><i className="fa-solid fa-calendar-days"/> جدولي الثابت</h2><p className="mu">يتأكد دوامك تلقائياً حسب هذا الجدول.</p>{DAYS.map((day, index) => {
        const definition = data.defaults.find((item) => item.weekday === index);
        const value = definition ? `${definition.outbound ? 't' : 'f'}${definition.return_trip ? 't' : 'f'}` : '';
        return <label className="default-row" key={day}><span>{day}</span><select value={value} onChange={async (event) => {
          try { await setWeeklyDefault(profile.id, index, event.target.value); showToast('تم حفظ الجدول'); await refresh(); }
          catch (error) { reportError(error); }
        }}><option value="">بدون</option><option value="tt">أذهب وأرجع</option><option value="tf">أذهب فقط</option><option value="ft">أرجع فقط</option></select></label>;
      })}</div>
    </section>}

    {tab === 'map' && <section className="card"><h2><i className="fa-solid fa-location-dot"/> أين الكوستر؟</h2><BusMap reportError={reportError}/></section>}
    {tab === 'chat' && <ChatPanel room={profile.group_type} />}
    <div hidden={tab !== 'map'}><ArrivalReminder showToast={showToast} reportError={reportError}/></div>

    {tab === 'ann' && <section><div className="card"><h2><i className="fa-solid fa-bullhorn"/> التنبيهات</h2>{data.announcements.length ? data.announcements.map((announcement, index) => <div className="bub" key={announcement.id || index}><b>{announcement.title}</b><br/><span>{announcement.message}</span><time>{new Date(announcement.created_at).toLocaleString('ar-IQ-u-nu-latn', { timeZone: 'Asia/Baghdad' })}</time></div>) : <div className="empty-state">لا توجد تنبيهات حالياً.</div>}</div><div className="card"><h2><i className="fa-solid fa-mobile-screen"/> إشعارات الهاتف</h2><PushSettings userId={profile.id} showToast={showToast} reportError={reportError}/></div></section>}
    {tab === 'hist' && <section className="card"><h2><i className="fa-solid fa-clock-rotate-left"/> سجل دوامك</h2>{data.history.length ? <table><tbody>{data.history.map((item) => <tr key={item.attendance_date}><td dir="ltr">{item.attendance_date}</td><td>{tripLabel(item.outbound, item.return_trip)}</td></tr>)}</tbody></table> : <div className="empty-state">لم تقم بتأكيد أي رحلة سابقة.</div>}</section>}
    {tab === 'profile' && <section className="card"><h2><i className="fa-solid fa-user"/> حسابي</h2><p><b>الاسم:</b> {profile.full_name}</p><p><b>الهاتف:</b> <span dir="ltr">{profile.phone}</span></p><p><b>حالة الاشتراك:</b> {subscription.status === 'active' && !expired ? 'فعال' : 'غير فعال'}</p><p><b>تاريخ الانتهاء:</b> {subscription.end_date || 'غير محدد'}</p></section>}

    <nav className="bottom-nav" aria-label="التنقل الرئيسي">{TABS.map(([key, label, icon]) => <button type="button" key={key} className={tab === key ? 'active' : ''} aria-current={tab === key ? 'page' : undefined} onClick={() => {
      setTab(key);
      if (key === 'ann' && data.announcements[0]) localStorage.setItem('annSeen', data.announcements[0].created_at);
    }}><i className={`fa-solid ${icon}`} aria-hidden="true"/>{label}</button>)}</nav>
  </>;
}
