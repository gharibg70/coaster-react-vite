import { useCallback, useEffect, useState } from 'react';
import { canModerateChat, deleteReportedMessage, listReportedMessages } from './chatModerationService.js';

export default function ChatModeration({ profile, showToast, reportError }) {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [deleting, setDeleting] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      setReports(await listReportedMessages());
    } catch (error) {
      setErrorMessage(error?.message || 'تعذر تحميل بلاغات الدردشة. حاول مجدداً.');
      reportError?.(error);
    } finally {
      setLoading(false);
    }
  }, [reportError]);

  useEffect(() => {
    if (canModerateChat(profile)) refresh();
  }, [profile, refresh]);

  if (!canModerateChat(profile)) return null;

  const remove = async (report) => {
    if (!window.confirm('هل تريد حذف هذه الرسالة وجميع البلاغات المرتبطة بها؟')) return;
    setDeleting(report.message_id);
    setErrorMessage('');
    try {
      await deleteReportedMessage(report.message_id);
      showToast?.('تم حذف الرسالة');
      await refresh();
    } catch (error) {
      setErrorMessage(error?.message || 'تعذر حذف الرسالة. حاول مجدداً.');
      reportError?.(error);
    } finally {
      setDeleting(null);
    }
  };

  return <section className="card" aria-labelledby="chat-moderation-title">
    <h2 id="chat-moderation-title"><i className="fa-solid fa-comments"/> بلاغات دردشة الطلاب</h2>
    <p className="mu">تظهر هنا الرسائل المبلّغ عنها وعدد البلاغات فقط؛ لا تُعرض هويات المبلّغين.</p>
    {errorMessage && <div className="empty-state danger" role="alert">{errorMessage} <button className="sm" onClick={refresh}>إعادة المحاولة</button></div>}
    {loading ? <p role="status">جاري تحميل البلاغات…</p> : !errorMessage && (reports.length ? reports.map((report) => <article className="sub-item" key={report.message_id}>
      <div className="sub-head"><b>{report.display_name || 'طالب'}</b><span className="mu">عدد البلاغات: {report.report_count}</span></div>
      <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{report.body}</p>
      <small className="mu">{report.created_at ? new Date(report.created_at).toLocaleString('ar') : ''}</small>
      <div className="actions"><button className="sm dn" disabled={deleting === report.message_id} onClick={() => remove(report)}>{deleting === report.message_id ? 'جارٍ الحذف…' : 'حذف الرسالة'}</button></div>
    </article>) : <div className="empty-state">لا توجد رسائل مبلّغ عنها.</div>)}
    <button className="sm" onClick={refresh} disabled={loading}>تحديث البلاغات</button>
  </section>;
}
