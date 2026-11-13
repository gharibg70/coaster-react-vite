import { useCallback, useEffect, useRef, useState } from 'react';
import ChatPanel from './ChatPanel.jsx';
import { canCommitReportRequest, canModerateChat, deleteReportedMessage, listReportedMessages } from './chatModerationService.js';

const ROOMS = [
  { id: 'boys', label: 'الشباب' },
  { id: 'girls', label: 'البنات' },
];

export default function ChatModeration({ profile, showToast, reportError }) {
  const [room, setRoom] = useState('boys');
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [deleting, setDeleting] = useState(null);
  const currentRoom = useRef(room);
  const requestVersion = useRef(0);
  currentRoom.current = room;

  const refresh = useCallback(async () => {
    const requestedRoom = room;
    const request = ++requestVersion.current;
    setLoading(true);
    setErrorMessage('');
    try {
      const result = await listReportedMessages(requestedRoom);
      if (!canCommitReportRequest(request, requestVersion.current, requestedRoom, currentRoom.current)) return;
      setReports(result);
    } catch (error) {
      if (!canCommitReportRequest(request, requestVersion.current, requestedRoom, currentRoom.current)) return;
      setReports([]);
      setErrorMessage(error?.message || 'تعذر تحميل بلاغات الدردشة. حاول مجدداً.');
      reportError?.(error);
    } finally {
      if (canCommitReportRequest(request, requestVersion.current, requestedRoom, currentRoom.current)) setLoading(false);
    }
  }, [room, reportError]);

  useEffect(() => {
    if (canModerateChat(profile)) refresh();
    return () => { requestVersion.current += 1; };
  }, [profile, refresh]);

  if (!canModerateChat(profile)) return null;

  const remove = async (report) => {
    const requestedRoom = room;
    if (!window.confirm('هل تريد حذف هذه الرسالة وجميع البلاغات المرتبطة بها؟')) return;
    setDeleting(report.message_id);
    setErrorMessage('');
    try {
      await deleteReportedMessage(requestedRoom, report.message_id);
      if (currentRoom.current !== requestedRoom) return;
      showToast?.('تم حذف الرسالة');
      await refresh();
    } catch (error) {
      if (currentRoom.current !== requestedRoom) return;
      setErrorMessage(error?.message || 'تعذر حذف الرسالة. حاول مجدداً.');
      reportError?.(error);
    } finally {
      if (currentRoom.current === requestedRoom) setDeleting(null);
    }
  };

  return <section className="card" aria-labelledby="chat-moderation-title">
    <h2 id="chat-moderation-title"><i className="fa-solid fa-comments" aria-hidden="true"/> دردشة الطلاب</h2>
    <div role="group" aria-label="اختر غرفة الدردشة">
      {ROOMS.map((option) => <button
        key={option.id}
        type="button"
        className={room === option.id ? 'sm' : 'sm ghost'}
        aria-pressed={room === option.id}
        onClick={() => {
          if (room === option.id) return;
          currentRoom.current = option.id;
          requestVersion.current += 1;
          setRoom(option.id);
          setReports([]);
          setDeleting(null);
        }}
      >{option.label}</button>)}
    </div>
    <ChatPanel key={room} room={room} isAdmin />
    <section aria-labelledby="chat-reports-heading">
      <h3 id="chat-reports-heading">بلاغات غرفة {ROOMS.find((option) => option.id === room)?.label}</h3>
      <p className="mu">تظهر هنا الرسائل المبلّغ عنها وعدد البلاغات فقط؛ لا تُعرض هويات المبلّغين.</p>
      {errorMessage && <div className="empty-state danger" role="alert">{errorMessage} <button type="button" className="sm" onClick={refresh}>إعادة المحاولة</button></div>}
      {loading ? <p role="status">جاري تحميل البلاغات…</p> : !errorMessage && (reports.length ? reports.map((report) => <article className="sub-item" key={report.message_id}>
        <div className="sub-head"><b>{report.display_name || 'طالب'}</b><span className="mu">عدد البلاغات: {report.report_count}</span></div>
        <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{report.body}</p>
        <small className="mu">{report.created_at ? new Date(report.created_at).toLocaleString('ar') : ''}</small>
        <div className="actions"><button type="button" className="sm dn" disabled={deleting === report.message_id} onClick={() => remove(report)}>{deleting === report.message_id ? 'جارٍ الحذف…' : 'حذف الرسالة'}</button></div>
      </article>) : <div className="empty-state">لا توجد رسائل مبلّغ عنها.</div>)}
      <button type="button" className="sm" onClick={refresh} disabled={loading}>تحديث البلاغات</button>
    </section>
  </section>;
}
