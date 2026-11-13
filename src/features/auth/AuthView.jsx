import { useState } from 'react';
import { signIn, signUp } from './authService.js';

export default function AuthView({ busy, onSubmit }) {
  const [register, setRegister] = useState(false);
  const submit = (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const values = Object.fromEntries(form.entries());
    if (register && (!values.name?.trim() || values.phone.replace(/\D/g, '').length < 7 || values.password.length < 6 || !values.code?.trim())) return;
    onSubmit(() => register ? signUp({ name: values.name.trim(), phone: values.phone, password: values.password, code: values.code.trim() }) : signIn(values.phone, values.password));
  };
  return <>
    <div className="auth-hero"><div className="logo"><i className="fa-solid fa-bus" /></div><h1>كوستر الجامعة</h1><p className="mu">دهوك ⟷ الموصل · احجز مقعدك بسهولة</p></div>
    <form className="card" onSubmit={submit}><h2><i className="fa-solid fa-user-lock" /> {register ? 'حساب جديد' : 'تسجيل الدخول'}</h2>
      {register && <><label>الاسم الكامل</label><input name="name" autoComplete="name" placeholder="مثال: أحمد محمد" required /></>}
      <label>رقم الهاتف</label><input name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="07XXXXXXXXX" required />
      <label>كلمة المرور</label><input name="password" type="password" autoComplete={register ? 'new-password' : 'current-password'} minLength={6} placeholder="••••••" required />
      {register && <><label>رمز الاشتراك</label><input name="code" dir="ltr" placeholder="BUS-XXXX" required /><p className="mu">يعطيك صاحب الكوستر رمزاً خاصاً بك.</p></>}
      <button type="submit" disabled={busy} className="full">{busy ? 'جارٍ التنفيذ…' : register ? 'إنشاء الحساب' : 'دخول'}</button>
      <p className="center"><button type="button" className="ghost sm" onClick={() => setRegister(!register)}>{register ? 'عندي حساب' : 'ليس لدي حساب'}</button></p>
    </form>
  </>;
}
