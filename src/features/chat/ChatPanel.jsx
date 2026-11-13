import { useCallback, useEffect, useRef, useState } from 'react';
import { canCommitChatHistory, checkStudentChatAccess, limitMessageInput, listMessages, reportMessage, sendMessage, subscribeToMessages, validateMessageBody } from './chatService.js';

const REASONS = [['spam', 'محتوى مزعج (spam)'], ['abuse', 'إساءة (abuse)'], ['other', 'سبب آخر (other)']];
const messageTime = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('ar-IQ-u-nu-latn', { timeZone: 'Asia/Baghdad' });
};

export default function ChatPanel() {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [reasonById, setReasonById] = useState({});
  const [reported, setReported] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [accessChecked, setAccessChecked] = useState(false);
  const [serverEligible, setServerEligible] = useState(false);
  const [accessRetry, setAccessRetry] = useState(0);
  const [status, setStatus] = useState('جارٍ التحقق من صلاحية الدردشة…');
  const [error, setError] = useState('');
  const [accessError, setAccessError] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const canReadRef = useRef(false);
  const historyRequestVersion = useRef(0);
  const canRead = accessChecked && serverEligible;

  const mergeMessage = useCallback((message) => {
    setMessages((current) => {
      const merged = new Map(current.map((item) => [item.id, item]));
      merged.set(message.id, message);
      return [...merged.values()].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at)).slice(-100);
    });
  }, []);

  const load = useCallback(async () => {
    const requestVersion = ++historyRequestVersion.current;
    setLoading(true);
    setError('');
    try {
      const history = await listMessages(100);
      if (!canCommitChatHistory(requestVersion, historyRequestVersion.current, canReadRef.current)) return;
      setMessages((current) => {
        const merged = new Map(history.map((item) => [item.id, item]));
        current.forEach((item) => merged.set(item.id, item));
        return [...merged.values()].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at)).slice(-100);
      });
      setStatus('');
    } catch (cause) {
      if (!canCommitChatHistory(requestVersion, historyRequestVersion.current, canReadRef.current)) return;
      setError(cause?.message || 'تعذر تحميل الدردشة.');
      setStatus('تعذر تحميل الرسائل. يمكنك إعادة المحاولة.');
    } finally {
      if (canCommitChatHistory(requestVersion, historyRequestVersion.current, canReadRef.current)) setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let checking = false;
    const checkAccess = async () => {
      if (checking) return;
      checking = true;
      try {
        const allowed = await checkStudentChatAccess();
        if (cancelled) return;
        canReadRef.current = allowed;
        setServerEligible(allowed);
        setAccessChecked(true);
        if (allowed) {
          setAccessError('');
          setStatus('');
        } else {
          historyRequestVersion.current += 1;
          setMessages([]);
          setDraft('');
          setReported({});
          setAnnouncement('');
          setError('');
          setAccessError('');
          setStatus('الدردشة متاحة للطلاب ذوي الاشتراك الفعّال وغير المنتهي فقط.');
        }
      } catch {
        if (cancelled) return;
        canReadRef.current = false;
        historyRequestVersion.current += 1;
        setServerEligible(false);
        setAccessChecked(true);
        setMessages([]);
        setReported({});
        setAnnouncement('');
        setStatus('تعذر التحقق من صلاحية الدردشة.');
        setAccessError('تحقق من الاتصال أو إعداد قاعدة البيانات، ثم أعد المحاولة.');
      } finally { checking = false; }
    };
    checkAccess();
    const interval = window.setInterval(checkAccess, 30_000);
    const onVisibilityChange = () => { if (document.visibilityState === 'visible') checkAccess(); };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [accessRetry]);

  useEffect(() => {
    if (!canRead) {
      canReadRef.current = false;
      historyRequestVersion.current += 1;
      setMessages([]);
      setLoading(false);
      return undefined;
    }
    canReadRef.current = true;
    let unsubscribe;
    try {
      unsubscribe = subscribeToMessages((message) => {
        if (!canReadRef.current) return;
        mergeMessage(message);
        setAnnouncement(`${message.display_name}: ${message.body}`);
      }, (cause) => {
        if (canReadRef.current) setError(cause?.message || 'انقطع الاتصال بالدردشة.');
      }, () => { if (canReadRef.current) load(); });
    } catch (cause) {
      setError(cause?.message || 'تعذر بدء الاتصال بالدردشة.');
    }
    load();
    return () => {
      canReadRef.current = false;
      historyRequestVersion.current += 1;
      unsubscribe?.();
    };
  }, [canRead, load, mergeMessage]);

  const submit = async (event) => {
    event.preventDefault();
    if (!canRead) return;
    const validation = validateMessageBody(draft);
    if (!validation.ok) { setError(validation.error); return; }
    setBusy(true);
    setError('');
    try {
      const message = await sendMessage(validation.value);
      if (!canReadRef.current) return;
      mergeMessage(message);
      setAnnouncement(`${message.display_name}: ${message.body}`);
      setDraft('');
      setStatus('تم إرسال الرسالة.');
    } catch (cause) {
      setError(cause?.message || 'تعذر إرسال الرسالة. احتفظنا بالنص؛ حاول مجدداً.');
    } finally { setBusy(false); }
  };

  const report = async (messageId) => {
    if (!canRead) return;
    try {
      await reportMessage(messageId, reasonById[messageId] || 'spam');
      if (!canReadRef.current) return;
      setReported((current) => ({ ...current, [messageId]: true }));
      setStatus('تم إرسال البلاغ للمراجعة.');
      setError('');
    } catch (cause) { setError(cause?.message || 'تعذر إرسال البلاغ. حاول مجدداً.'); }
  };

  return <section className="card chat-panel" aria-labelledby="student-chat-heading">
    <h2 id="student-chat-heading"><i className="fa-solid fa-comments" aria-hidden="true"/> دردشة الطلاب</h2>
    {!accessChecked && <p className="chat-visibility" role="status">جارٍ التحقق من صلاحية الدردشة…</p>}
    {accessChecked && !serverEligible && <div className={accessError ? 'alert' : 'chat-visibility'} role={accessError ? 'alert' : 'status'}>
      {accessError || status}
      {accessError && <button type="button" className="sm ghost" onClick={() => { canReadRef.current = false; historyRequestVersion.current += 1; setAccessChecked(false); setAccessRetry((value) => value + 1); }}>إعادة التحقق</button>}
    </div>}
    {canRead && <>
      <p className="chat-visibility">الرسائل واسم العرض مرئيان للطلاب ذوي الاشتراك الفعّال وللمسؤولين. لا تنشر رقم هاتفك أو أي معلومات شخصية.</p>
      <div className="chat-alert">{status}</div>
      {error && <div className="alert" role="alert">{error} <button type="button" className="sm ghost" onClick={load}>إعادة تحميل الرسائل</button></div>}
      {loading && <p className="mu">جارٍ تحميل الرسائل…</p>}
      <ol className="chat-messages" aria-label="الرسائل">
        {messages.map((message) => <li className="chat-message" key={message.id}>
          <div className="chat-message-head"><b>{message.display_name}</b><time dateTime={message.created_at}>{messageTime(message.created_at)}</time></div>
          <p>{message.body}</p>
          <div className="chat-report-controls">
            <label htmlFor={`reason-${message.id}`}>سبب الإبلاغ</label>
            <select id={`reason-${message.id}`} value={reasonById[message.id] || 'spam'} onChange={(event) => setReasonById((current) => ({ ...current, [message.id]: event.target.value }))}>
              {REASONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <button type="button" className="sm ghost" disabled={reported[message.id]} onClick={() => report(message.id)}>{reported[message.id] ? 'تم الإبلاغ' : 'إبلاغ'}</button>
          </div>
        </li>)}
      </ol>
      <div className="chat-sr-status" role="status" aria-live="polite" aria-atomic="true">{announcement}</div>
      {!loading && !messages.length && !error && <p className="empty-state">لا توجد رسائل بعد.</p>}
      <form className="chat-composer" onSubmit={submit}>
        <label htmlFor="student-chat-draft">اكتب رسالة (بحد أقصى 500 محرف)</label>
        <textarea id="student-chat-draft" value={draft} maxLength={1000} rows={3} onChange={(event) => setDraft(limitMessageInput(event.target.value))} aria-describedby="chat-character-count" />
        <div className="chat-compose-footer"><span id="chat-character-count">{[...draft.trim()].length} / 500 محرف</span><button type="submit" disabled={busy || !validateMessageBody(draft).ok}>{busy ? 'جارٍ الإرسال…' : 'إرسال'}</button></div>
      </form>
    </>}
  </section>;
}
