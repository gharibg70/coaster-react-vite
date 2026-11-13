import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { dayLabel, dayString, DAYS, tripLabel } from '../../lib/utils.js';
import { loadStudentData, redeemCode, setAttendance, setWeeklyDefault } from './studentService.js';
import BusMap from '../map/BusMap.jsx';
import PushSettings from '../notifications/PushSettings.jsx';

const OPTIONS = [[true,true,'أذهب وأرجع','دهوك إلى الموصل ثم العودة','fa-arrows-left-right'],[true,false,'أذهب فقط','دهوك إلى الموصل','fa-arrow-right'],[false,true,'أرجع فقط','الموصل إلى دهوك','fa-arrow-left'],[false,false,'لا أداوم','لا حجز لأي رحلة','fa-bed']];
const TABS = [['home','الرئيسية','fa-house'],['map','الكوستر','fa-location-dot'],['ann','التنبيهات','fa-bell'],['hist','السجل','fa-clock-rotate-left'],['profile','حسابي','fa-user']];
export default function StudentView({ profile, showToast, reportError }) {
  const [data, setData] = useState(null), [tab, setTab] = useState('home'), [code, setCode] = useState(''), [busy, setBusy] = useState(false);
  const refresh = async () => { setBusy(true); try { setData(await loadStudentData(profile)); } catch (e) { reportError(e); } finally { setBusy(false); } };
  useEffect(() => { refresh(); }, [profile.id]);
  if (!data && busy) return <div className="splash"><div className="spinner"/><p className="mu">جاري التحميل...</p></div>;
  if (!data) return <div className="card"><p className="mu">تعذر تحميل بيانات الطالب.</p><button onClick={refresh}>إعادة المحاولة</button></div>;
  if (!data.subscription) return <form className="card" onSubmit={async e => {e.preventDefault();try{await redeemCode(code.trim());showToast('تم تفعيل الاشتراك');refresh();}catch(err){reportError(err);}}}><h2><i className="fa-solid fa-key"/> تفعيل الحساب</h2><p>لم يُفعّل اشتراكك بعد. أدخل رمز الاشتراك:</p><input dir="ltr" value={code} onChange={e=>setCode(e.target.value)} placeholder="BUS-XXXX"/><button className="full">تفعيل الاشتراك</button></form>;
  const sub=data.subscription, seats=data.seats, cap=seats?.capacity||0, current=data.attendance?`${data.attendance.outbound}${data.attendance.return_trip}`:null;
  const expired=sub.end_date&&sub.end_date<data.date, soon=sub.end_date&&!expired&&sub.end_date<=dayString(5), off=sub.status!=='active'||expired;
  const count= (which) => seats?.[which+'_taken'] || 0;
  const pct=(which)=>cap?Math.max(0,(cap-count(which))/cap*100):0;
  const barColor=p=>p>40?'var(--pr)':p>10?'var(--ac)':'var(--dn)';
  return <>
    {tab==='home'&&<><section className="tab-content active"><div className="card"><div className="hero-head"><small>مرحباً {profile.full_name?.split(' ')[0]}</small><h1>دوام الغد</h1><span><i className="fa-regular fa-calendar"/> {new Date(`${data.date}T12:00:00`).toLocaleDateString('ar-IQ-u-nu-latn',{weekday:'long',day:'numeric',month:'long'})}</span></div>
      {sub.status!=='active'&&<div className="alert">اشتراكك موقوف. راجع صاحب الكوستر.</div>}{expired&&<div className="alert">انتهى اشتراكك. جدّد لتأكيد الدوام.</div>}{soon&&<div className="alert">ينتهي اشتراكك في {sub.end_date}.</div>}
      {seats&&<div className="seatbox">{[['outbound','ذهاب'],['return','عودة']].map(([key,label])=><div key={key}><div className="seat-label"><span>{label}</span><span style={{color:barColor(pct(key))}}>{Math.max(0,cap-count(key))} مقعد</span></div><div className="progress-container"><div className="progress-bar" style={{width:`${pct(key)}%`,background:barColor(pct(key))}}/></div></div>)}</div>}
      {OPTIONS.map(([o,r,title,desc,icon])=>{const full=(o&&seats&&count('outbound')>=cap&&!data.attendance?.outbound)||(r&&seats&&count('return')>=cap&&!data.attendance?.return_trip);return <button key={title} className={`opt ${current===`${o}${r}`?'sel':''}`} disabled={off||full||busy} onClick={async()=>{try{await setAttendance(sub.route_id,data.date,o,r);showToast('تم حفظ اختيارك بنجاح');await refresh();}catch(e){reportError(e);}}}><span><b>{title}</b><small>{desc}{full?' · ممتلئ':''}</small></span><i className={`fa-solid ${icon}`}/></button>})}
      {data.attendance?.auto&&<p className="mu center">تم التأكيد تلقائياً من جدولك الثابت.</p>}</div>
      <div className="card"><h2><i className="fa-solid fa-calendar-days"/> جدولي الثابت</h2><p className="mu">يتأكد دوامك تلقائياً حسب هذا الجدول.</p>{DAYS.map((day,i)=>{const def=data.defaults.find(x=>x.weekday===i);const value=def?`${def.outbound?'t':'f'}${def.return_trip?'t':'f'}`:'';return <label className="default-row" key={day}><span>{day}</span><select value={value} onChange={async e=>{try{await setWeeklyDefault(profile.id,i,e.target.value);showToast('تم حفظ الجدول');await refresh();}catch(err){reportError(err);}}}><option value="">بدون</option><option value="tt">أذهب وأرجع</option><option value="tf">أذهب فقط</option><option value="ft">أرجع فقط</option></select></label>})}</div></section></>}
    {tab==='map'&&<section className="card"><h2><i className="fa-solid fa-location-dot"/> أين الكوستر؟</h2><BusMap reportError={reportError}/></section>}
    {tab==='ann'&&<section><div className="card"><h2><i className="fa-solid fa-bullhorn"/> التنبيهات</h2>{data.announcements.length?data.announcements.map((a,i)=><div className="bub" key={a.id||i}><b>{a.title}</b><br/><span>{a.message}</span><time>{new Date(a.created_at).toLocaleString('ar-IQ-u-nu-latn',{timeZone:'Asia/Baghdad'})}</time></div>):<div className="empty-state">لا توجد تنبيهات حالياً.</div>}</div><div className="card"><h2><i className="fa-solid fa-mobile-screen"/> إشعارات الهاتف</h2><PushSettings userId={profile.id} showToast={showToast} reportError={reportError}/></div></section>}
    {tab==='hist'&&<section className="card"><h2><i className="fa-solid fa-clock-rotate-left"/> سجل دوامك</h2>{data.history.length?<table><tbody>{data.history.map(x=><tr key={x.attendance_date}><td dir="ltr">{x.attendance_date}</td><td>{tripLabel(x.outbound,x.return_trip)}</td></tr>)}</tbody></table>:<div className="empty-state">لم تقم بتأكيد أي رحلة سابقة.</div>}</section>}
    {tab==='profile'&&<section className="card"><h2><i className="fa-solid fa-user"/> حسابي</h2><p><b>الاسم:</b> {profile.full_name}</p><p><b>الهاتف:</b> <span dir="ltr">{profile.phone}</span></p><p><b>حالة الاشتراك:</b> {sub.status==='active'&&!expired?'فعال':'غير فعال'}</p><p><b>تاريخ الانتهاء:</b> {sub.end_date||'غير محدد'}</p></section>}
    <nav className="bottom-nav">{TABS.map(([key,label,icon])=><a key={key} className={tab===key?'active':''} onClick={()=>{setTab(key);if(key==='ann'&&data.announcements[0])localStorage.setItem('annSeen',data.announcements[0].created_at);}}><i className={`fa-solid ${icon}`}/>{label}</a>)}</nav>
  </>;
}
