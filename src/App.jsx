import { useCallback, useEffect, useState } from 'react';
import { supabase, missingSupabaseConfig } from './lib/supabase.js';
import { getProfile, logout as signOut } from './features/auth/authService.js';
import AuthView from './features/auth/AuthView.jsx';
import StudentView from './features/student/StudentView.jsx';
import AdminView from './features/admin/AdminView.jsx';

const errorText = {
  'invalid code': 'الرمز غير صحيح أو مستخدم من قبل.', 'registration closed': 'انتهى وقت التسجيل لهذا اليوم.',
  'no active subscription': 'اشتراكك غير فعال. راجع صاحب الكوستر.', 'invalid date': 'التاريخ غير مسموح.',
  'Invalid login credentials': 'رقم الهاتف أو كلمة المرور غير صحيحة.', 'User already registered': 'هذا الرقم مسجل مسبقاً. سجل الدخول.',
  'password too short': 'كلمة المرور قصيرة (6 أحرف على الأقل).', 'admin only': 'هذه العملية للأدمن فقط.',
  'outbound full': 'مقاعد رحلة الذهاب ممتلئة.', 'return full': 'مقاعد رحلة العودة ممتلئة.',
};
export function useToast() {
  const [toast, setToast] = useState(null);
  const showToast = useCallback((message, bad = false) => {
    setToast({ message: errorText[message] || message, bad });
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => setToast(null), 4500);
  }, []);
  const reportError = useCallback((error) => showToast(error?.message || String(error), true), [showToast]);
  return { toast, showToast, reportError };
}
export default function App() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authBusy, setAuthBusy] = useState(false);
  const { toast, showToast, reportError } = useToast();
  const route = useCallback(async (nextUser) => {
    if (!nextUser) { setUser(null); setProfile(null); return; }
    setUser(nextUser);
    setProfile(await getProfile(nextUser.id));
  }, []);
  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    let active = true;
    supabase.auth.getSession().then(async ({ data, error }) => {
      if (error) reportError(error);
      if (active && data.session) try { await route(data.session.user); } catch (e) { reportError(e); }
      if (active) setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      if (!session) { setUser(null); setProfile(null); }
      else queueMicrotask(() => route(session.user).catch(reportError));
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, [route, reportError]);
  const logout = async () => { try { await signOut(); setProfile(null); setUser(null); } catch (e) { reportError(e); } };
  const handleAuth = async (operation) => { setAuthBusy(true); try { const nextUser = await operation(); await route(nextUser); showToast('تم تسجيل الدخول بنجاح'); } catch (e) { reportError(e); } finally { setAuthBusy(false); } };
  return <>
    <header><b><i className="fa-solid fa-bus" /> كوستر الجامعة</b>{user && <button onClick={logout}><i className="fa-solid fa-arrow-right-from-bracket" /> خروج</button>}</header>
    <main id="app">{missingSupabaseConfig ? <div className="card"><h2>إعداد الاتصال مطلوب</h2><p>أضف VITE_SUPABASE_URL وVITE_SUPABASE_ANON_KEY إلى ملف .env.local ثم أعد تشغيل Vite.</p></div> : loading ? <div className="splash"><img src={`${import.meta.env.BASE_URL}icon-192.png`} alt="كوستر" /><div className="spinner" /><p className="mu">جاري التحميل...</p></div> : profile ? (profile.role === 'admin' ? <AdminView profile={profile} showToast={showToast} reportError={reportError} /> : <StudentView profile={profile} showToast={showToast} reportError={reportError} />) : <AuthView busy={authBusy} onSubmit={handleAuth} showToast={showToast} />}</main>
    {toast && <div id="msg" className={toast.bad ? 'err' : 'ok'}><i className={`fa-solid ${toast.bad ? 'fa-circle-exclamation' : 'fa-circle-check'}`} /><span>{toast.message}</span></div>}
  </>;
}
