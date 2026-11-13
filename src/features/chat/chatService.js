const MAX_CODEPOINTS = 500;
const SAFE_FIELDS = ['id', 'display_name', 'body', 'created_at'];

export function limitMessageInput(body) {
  return typeof body === 'string' ? [...body].slice(0, MAX_CODEPOINTS).join('') : '';
}

export function canCommitChatHistory(requestVersion, latestVersion, authorized) {
  return authorized && requestVersion === latestVersion;
}

export function validateMessageBody(body) {
  if (typeof body !== 'string') return { ok: false, error: 'اكتب رسالة نصية.' };
  const value = body.trim();
  if (!value) return { ok: false, error: 'لا يمكن إرسال رسالة فارغة.' };
  if ([...value].length > MAX_CODEPOINTS) return { ok: false, error: 'الحد الأقصى للرسالة 500 محرف.' };
  return { ok: true, value };
}

function safeMessage(row) {
  if (!row || typeof row !== 'object' || SAFE_FIELDS.some((field) => typeof row[field] !== 'string')) {
    throw new Error('تعذر قراءة رسالة الدردشة بصيغة آمنة.');
  }
  return Object.fromEntries(SAFE_FIELDS.map((field) => [field, row[field]]));
}

async function requireClient() {
  const { supabase } = await import('../../lib/supabase.js');
  if (!supabase) throw new Error('إعداد الاتصال بالخدمة غير متاح حالياً.');
  return supabase;
}

export async function checkStudentChatAccess() {
  const client = await requireClient();
  const { data, error } = await client.rpc('student_chat_access');
  if (error) throw error;
  if (typeof data !== 'boolean') throw new Error('تعذر التحقق من صلاحية الدردشة.');
  return data;
}

export async function listMessages(limit = 100) {
  const client = await requireClient();
  const { data, error } = await client.from('student_chat_messages')
    .select('id,display_name,body,created_at')
    .order('created_at', { ascending: false })
    .limit(Math.min(100, Math.max(1, Number(limit) || 100)));
  if (error) throw error;
  return (data || []).map(safeMessage).reverse();
}

export async function sendMessage(body) {
  const validation = validateMessageBody(body);
  if (!validation.ok) throw new Error(validation.error);
  const client = await requireClient();
  const { data, error } = await client.rpc('send_student_chat_message', { p_body: validation.value });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return safeMessage(row);
}

export function subscribeToMessages(onMessage, onError, onSubscribed, loadClient = requireClient) {
  let client;
  let channel;
  let cancelled = false;
  loadClient().then((resolved) => {
    if (cancelled) return;
    client = resolved;
    channel = client.channel('student-chat-messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'student_chat_messages' }, (payload) => {
        if (cancelled) return;
        try { onMessage(safeMessage(payload.new)); }
        catch (error) { onError?.(error); }
      })
      .subscribe((status, error) => {
        if (cancelled) return;
        if (status === 'SUBSCRIBED') onSubscribed?.();
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          onError?.(error || new Error('تعذر الاتصال بالدردشة؛ تحقق من الاتصال وأعد المحاولة.'));
        }
      });
  }).catch((error) => { if (!cancelled) onError?.(error); });
  return () => { cancelled = true; if (client && channel) client.removeChannel(channel); };
}

export async function reportMessage(messageId, reason) {
  if (!['spam', 'abuse', 'other'].includes(reason)) throw new Error('سبب البلاغ غير صالح.');
  const client = await requireClient();
  const { error } = await client.rpc('report_student_chat_message', {
    p_message_id: messageId,
    p_reason: reason,
  });
  if (error) throw error;
}
