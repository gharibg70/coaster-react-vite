import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { dayString, tripLabel } from '../../lib/utils.js';
import { createCodes, createAnnouncement, hideAnnouncement, loadAnnouncements, loadAttendance, loadCapacity, loadHistory, loadSubscriptions, resetPassword, saveCapacity, sendPush, setBusLocation, updateEndDate, updateSubscription } from './adminService.js';
import DepartureMonitor from './DepartureMonitor.jsx';
import DestinationSettings from './DestinationSettings.jsx';
import TripRunControls from './TripRunControls.jsx';

const TABS = [['boys', 'الشباب'], ['girls', 'البنات'], ['subs', 'المشتركون'], ['tools', 'الرموز والتنبيهات']];
const TEMPLATES = [['تأخير 15 دقيقة', 'تأخير الكوستر', 'سيتأخر الكوستر اليوم حوالي 15 دقيقة عن موعده.'], ['لا توجد رحلة غداً', 'إلغاء رحلة', 'لا توجد رحلة غداً. سنبلغكم بأي تحديث.'], ['تذكير بالتأكيد', 'تذكير', 'الرجاء تأكيد دوامك لرحلة الغد قبل الساعة 10 مساءً.']];

export default function AdminView({ profile, showToast, reportError }) {
  const [tab, setTab] = useState('boys');
  const [date, setDate] = useState(dayString(1));
  const [rows, setRows] = useState(null);
  const [subscriptions, setSubscriptions] = useState([]);
  const [query, setQuery] = useState('');
  const [soon, setSoon] = useState(false);
  const [history, setHistory] = useState(null);
  const [capacity, setCapacity] = useState('');
  const [group, setGroup] = useState('boys');
  const [count, setCount] = useState(1);
  const [codes, setCodes] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [sharing, setSharing] = useState(false);

  const refreshDay = async () => { try { setRows(await loadAttendance(date)); } catch (error) { reportError(error); } };
  const refreshSubs = async () => { try { setSubscriptions(await loadSubscriptions()); } catch (error) { reportError(error); } };
  const refreshTools = async () => {
    try { const [seatCapacity, list] = await Promise.all([loadCapacity(), loadAnnouncements()]); setCapacity(seatCapacity); setAnnouncements(list); }
    catch (error) { reportError(error); }
  };

  useEffect(() => {
    if (tab === 'boys' || tab === 'girls') refreshDay();
    else if (tab === 'subs') refreshSubs();
    else refreshTools();
  }, [tab, date]);

  useEffect(() => () => {
    if (sharing) {
      navigator.geolocation.clearWatch?.(window.coasterGeoWatch);
      setBusLocation({ is_sharing: false }).catch(() => {});
    }
  }, [sharing]);

  const filtered = useMemo(() => subscriptions.filter((subscription) => `${subscription.profiles?.full_name || ''} ${subscription.profiles?.phone || ''}`.includes(query) && (!soon || (subscription.end_date && subscription.end_date <= dayString(5)))), [subscriptions, query, soon]);

  const doShare = () => {
    if (sharing) {
      navigator.geolocation.clearWatch(window.coasterGeoWatch);
      window.coasterGeoWatch = null;
      setSharing(false);
      setBusLocation({ is_sharing: false }).then(() => showToast('تم إيقاف مشاركة الموقع')).catch(reportError);
      return;
    }
    if (!navigator.geolocation) return showToast('جهازك لا يدعم تحديد الموقع.', true);
    window.coasterGeoWatch = navigator.geolocation.watchPosition(({ coords }) => setBusLocation({ lat: coords.latitude, lng: coords.longitude, accuracy: coords.accuracy, heading: coords.heading, speed: coords.speed, is_sharing: true }).catch(reportError), reportError, { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 });
    setSharing(true);
    showToast('بدأت مشاركة موقعك مع الطلاب');
  };

  const exportCsv = () => {
    const active = rows?.attendance.filter((item) => item.profiles?.group_type === tab && (item.outbound || item.return_trip)) || [];
    const quote = (value) => {
      const text = String(value ?? '');
      const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
      return `"${safe.replace(/"/g, '""')}"`;
    };
    const csv = [['الاسم', 'الهاتف', 'ذهاب', 'عودة'].map(quote).join(','), ...active.map((item) => [item.profiles.full_name, item.profiles.phone, item.outbound ? 'نعم' : '', item.return_trip ? 'نعم' : ''].map(quote).join(','))].join('\r\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }));
    link.download = `ركاب-${tab === 'boys' ? 'شباب' : 'بنات'}-${date}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const changeSub = async (id, status) => { try { await updateSubscription(id, status); showToast('تم التحديث'); refreshSubs(); } catch (error) { reportError(error); } };
  const renew = async (subscription) => {
    const base = subscription.end_date && subscription.end_date > dayString(0) ? subscription.end_date : dayString(0);
    const next = new Date(`${base}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 30);
    try { await updateEndDate(subscription.id, next.toISOString().slice(0, 10)); showToast('تم تحديث تاريخ الانتهاء'); refreshSubs(); }
    catch (error) { reportError(error); }
  };
  const datePick = async (subscription) => {
    const value = prompt('تاريخ انتهاء الاشتراك (YYYY-MM-DD):');
    if (!value) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return showToast('صيغة التاريخ غير صحيحة.', true);
    try { await updateEndDate(subscription.id, value.trim()); showToast('تم تحديث تاريخ الانتهاء'); refreshSubs(); }
    catch (error) { reportError(error); }
  };
  const showStudentHistory = async (userId) => { try { setHistory(await loadHistory(userId)); } catch (error) { reportError(error); } };
  const password = async (userId) => {
    const value = prompt('كلمة المرور الجديدة (6 أحرف على الأقل):');
    if (!value) return;
    if (value.length < 6) return showToast('كلمة المرور قصيرة (6 أحرف على الأقل).', true);
    try { await resetPassword(userId, value); showToast('تم تغيير كلمة المرور. أبلغ الطالب بها.'); }
    catch (error) { reportError(error); }
  };
  const publish = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const title = form.get('title').trim();
    const message = form.get('message').trim();
    if (!title || !message) return showToast('اكتب العنوان والنص.', true);
    try {
      const announcement = await createAnnouncement(title, message, form.get('target'), profile.id);
      event.currentTarget.reset();
      await refreshTools();
      showToast('تم نشر التنبيه. جاري إرسال إشعارات الهاتف...');
      try { const result = await sendPush(announcement.id); showToast(`تم الإرسال إلى ${result.sent} جهاز.`); }
      catch { showToast('نُشر التنبيه، لكن فشل إرسال إشعارات الهاتف.', true); }
    } catch (error) { reportError(error); }
  };

  const tabBar = <div className="tabs">{TABS.map(([key, label]) => <button key={key} className={tab === key ? 'on' : ''} onClick={() => { setTab(key); setHistory(null); }}>{label}</button>)}</div>;

  return <>
    {tabBar}
    <div className="card share-card"><div><b><i className="fa-solid fa-location-dot"/> موقع الكوستر</b><div className="mu">{sharing ? 'يشاهدك الطلاب الآن · أبقِ التطبيق مفتوحاً' : 'غير مشارك مع الطلاب'}</div></div><button className={sharing ? 'dn' : ''} onClick={doShare}>{sharing ? 'إيقاف' : 'بدء المشاركة'}</button></div>
    <DepartureMonitor showToast={showToast} reportError={reportError}/>

    {(tab === 'boys' || tab === 'girls') && (!rows ? <div className="card">جاري تحميل البيانات…</div> : <div className="card">
      <label htmlFor="admin-date">التاريخ</label><input id="admin-date" type="date" value={date} onChange={(event) => setDate(event.target.value)}/>
      {(() => {
        const all = rows.attendance;
        const done = new Set(all.map((item) => item.user_id));
        const filteredRows = all.filter((item) => item.profiles?.group_type === tab && (item.outbound || item.return_trip));
        const pending = rows.subscriptions.filter((subscription) => subscription.profiles?.group_type === tab && !done.has(subscription.user_id));
        return <>
          <div className="stats"><div><b>{filteredRows.filter((item) => item.outbound).length}</b>ذهاب</div><div><b>{filteredRows.filter((item) => item.return_trip).length}</b>عودة</div><div><b>{pending.length}</b>متبقي</div></div>
          <p className="mu">إجمالي الرحلة: ذهاب {all.filter((item) => item.outbound).length}{rows.capacity ? `/${rows.capacity}` : ''} · عودة {all.filter((item) => item.return_trip).length}{rows.capacity ? `/${rows.capacity}` : ''}</p>
          <div className="table-scroll"><table><thead><tr><th>الاسم</th><th>الهاتف</th><th>ذهاب</th><th>عودة</th></tr></thead><tbody>{filteredRows.length ? filteredRows.map((item, index) => <tr key={item.user_id || index}><td>{item.profiles?.full_name}</td><td dir="ltr">{item.profiles?.phone}</td><td>{item.outbound ? '✓' : ''}</td><td>{item.return_trip ? '✓' : ''}</td></tr>) : <tr><td colSpan="4">لا توجد تأكيدات لهذا اليوم.</td></tr>}</tbody></table></div>
          <button className="sm" onClick={exportCsv}>تصدير إلى CSV</button>
          <h2 style={{ marginTop: 20 }}>لم يؤكدوا بعد</h2>
          {pending.length ? pending.map((subscription) => <p key={subscription.user_id}>{subscription.profiles?.full_name}<span className="mu" dir="ltr"> · {subscription.profiles?.phone}</span></p>) : <p className="mu">الجميع أكدوا.</p>}
        </>;
      })()}
    </div>)}

    {tab === 'subs' && <div className="card"><div className="filters"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث بالاسم أو الهاتف"/><button className="sm" onClick={() => setSoon(!soon)}>{soon ? 'عرض الكل' : 'قريب الانتهاء'}</button></div>
      {filtered.map((subscription) => {
        const active = subscription.status === 'active';
        const expired = subscription.end_date && subscription.end_date < dayString(0);
        return <article className="sub-item" key={subscription.id}><div className="sub-head"><b>{subscription.profiles?.full_name}</b><span className="mu">{subscription.profiles?.group_type === 'boys' ? 'شباب' : 'بنات'} · {active ? 'فعال' : 'موقوف'}</span></div>
          <div className="mu" dir="ltr">{subscription.profiles?.phone}</div><div className={`mu ${expired ? 'danger' : ''}`}>{subscription.end_date ? (expired ? 'انتهى في ' : 'ينتهي في ') + subscription.end_date : 'بدون تاريخ انتهاء'}</div>
          <div className="actions"><button className={`sm ${active ? 'dn' : ''}`} onClick={() => changeSub(subscription.id, active ? 'suspended' : 'active')}>{active ? 'إيقاف' : 'تفعيل'}</button><button className="sm" onClick={() => renew(subscription)}>تجديد 30 يوم</button><button className="sm" onClick={() => datePick(subscription)}>تحديد تاريخ</button><button className="sm" onClick={() => password(subscription.user_id)}>كلمة مرور</button><button className="sm" onClick={() => showStudentHistory(subscription.user_id)}>السجل</button></div>
          {history && <div className="history-box"><b>آخر 30 يوماً</b>{history.length ? history.map((item) => <p key={item.attendance_date}>{item.attendance_date} · {tripLabel(item.outbound, item.return_trip)}</p>) : <p className="mu">لا يوجد سجل.</p>}</div>}
        </article>;
      })}
      {!filtered.length && <div className="empty-state">لا يوجد مشتركون يطابقون بحثك.</div>}
    </div>}

    {tab === 'tools' && <>
      <form className="card" onSubmit={async (event) => { event.preventDefault(); try { await saveCapacity(Number(capacity)); showToast('تم حفظ عدد المقاعد'); } catch (error) { reportError(error); } }}><h2><i className="fa-solid fa-chair"/> مقاعد الكوستر</h2><input type="number" min="1" max="100" value={capacity} onChange={(event) => setCapacity(event.target.value)}/><button className="full">حفظ عدد المقاعد</button></form>
      <DestinationSettings showToast={showToast} reportError={reportError}/>
      <TripRunControls profile={profile}/>
      <form className="card" onSubmit={async (event) => {
        event.preventDefault();
        try { const result = await createCodes(group, Number(count) || 1); setCodes(result.map((item) => item.new_code)); showToast('تم إنشاء الرموز'); }
        catch (error) { reportError(error); }
      }}><h2><i className="fa-solid fa-ticket"/> إنشاء رموز اشتراك</h2><select value={group} onChange={(event) => setGroup(event.target.value)}><option value="boys">شباب</option><option value="girls">بنات</option></select><input type="number" min="1" max="100" value={count} onChange={(event) => setCount(event.target.value)}/><button className="full">إنشاء الرموز</button><p className="mu">الرموز تظهر مرة واحدة فقط. انسخها وأعطِ كل طالب رمزه.</p>{codes.length > 0 && <pre className="codes">{codes.join('\n')}</pre>}</form>
      <form className="card" onSubmit={publish}><h2><i className="fa-solid fa-bullhorn"/> إرسال تنبيه</h2><div className="actions">{TEMPLATES.map((template) => <button type="button" className="sm" key={template[0]} onClick={(event) => { const targetForm = event.currentTarget.form; targetForm.elements.title.value = template[1]; targetForm.elements.message.value = template[2]; }}>{template[0]}</button>)}</div><select name="target"><option value="">الجميع</option><option value="boys">الشباب</option><option value="girls">البنات</option></select><input name="title" placeholder="العنوان" required/><textarea name="message" rows="3" placeholder="نص التنبيه" required/><button className="full">إرسال التنبيه</button></form>
      <section className="card"><h2><i className="fa-solid fa-list"/> التنبيهات المرسلة</h2>{announcements.map((announcement) => <div className="bub" key={announcement.id}><small>إلى: {announcement.target_group === 'boys' ? 'الشباب' : announcement.target_group === 'girls' ? 'البنات' : 'الجميع'}</small><b>{announcement.title}</b><p>{announcement.message}</p><button className="sm dn" onClick={async () => {
        if (!confirm('إخفاء هذا التنبيه عن الطلاب؟')) return;
        try { await hideAnnouncement(announcement.id); showToast('تم إخفاء التنبيه'); refreshTools(); }
        catch (error) { reportError(error); }
      }}>إخفاء</button></div>)}</section>
    </>}
  </>;
}
