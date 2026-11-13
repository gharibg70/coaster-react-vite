const MAX_CODEPOINTS = 500;
const SAFE_FIELDS = ['room_group', 'is_admin', 'id', 'display_name', 'body', 'created_at'];

export function isChatRoom(value) {
  return value === 'boys' || value === 'girls';
}

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

function requireRoom(room) {
  if (!isChatRoom(room)) throw new Error('مجموعة الدردشة غير صالحة. تواصل مع الإدارة للتحقق من حسابك.');
}

function safeMessage(row, room) {
  if (!row || typeof row !== 'object' || Array.isArray(row)
    || SAFE_FIELDS.some((field) => !Object.hasOwn(row, field))
    || row.room_group !== room
    || typeof row.is_admin !== 'boolean'
    || ['id', 'display_name', 'body', 'created_at'].some((field) => typeof row[field] !== 'string')) {
    throw new Error('تعذر قراءة رسالة الدردشة بصيغة آمنة أو أنها من غرفة أخرى.');
  }
  return Object.fromEntries(SAFE_FIELDS.map((field) => [field, row[field]]));
}

async function requireClient() {
  const { supabase } = await import('../../lib/supabase.js');
  if (!supabase) throw new Error('إعداد الاتصال بالخدمة غير متاح حالياً.');
  return supabase;
}

export async function checkChatRoomAccess(room) {
  requireRoom(room);
  const client = await requireClient();
  const { data, error } = await client.rpc('chat_room_access', { p_room: room });
  if (error) throw error;
  if (typeof data !== 'boolean') throw new Error('تعذر التحقق من صلاحية الدردشة.');
  return data;
}

export async function listMessages(room, limit = 100) {
  requireRoom(room);
  const client = await requireClient();
  const { data, error } = await client.from('student_chat_messages')
    .select('room_group,is_admin,id,display_name,body,created_at')
    .eq('room_group', room)
    .order('created_at', { ascending: false })
    .limit(Math.min(100, Math.max(1, Number(limit) || 100)));
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error('تعذر قراءة سجل الدردشة.');
  return data.map((row) => safeMessage(row, room)).reverse();
}

export async function sendMessage(room, body) {
  requireRoom(room);
  const validation = validateMessageBody(body);
  if (!validation.ok) throw new Error(validation.error);
  const client = await requireClient();
  const { data, error } = await client.rpc('send_chat_room_message', { p_room: room, p_body: validation.value });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return safeMessage(row, room);
}

export function subscribeToMessages(room, onMessage, onError, onSubscribed, loadClient = requireClient) {
  requireRoom(room);
  let client;
  let channel;
  let cancelled = false;
  loadClient().then((resolved) => {
    if (cancelled) return;
    client = resolved;
    channel = client.channel(`student-chat-messages-${room}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'student_chat_messages', filter: `room_group=eq.${room}` }, (payload) => {
        if (cancelled) return;
        try { onMessage(safeMessage(payload.new, room)); }
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

export function reportRoomRpcArgs(room, messageId, reason) {
  requireRoom(room);
  if (!['spam', 'abuse', 'other'].includes(reason)) throw new Error('سبب البلاغ غير صالح.');
  return { p_room: room, p_message_id: messageId, p_reason: reason };
}

export async function reportMessage(room, messageId, reason) {
  const client = await requireClient();
  const { error } = await client.rpc('report_student_chat_room_message', reportRoomRpcArgs(room, messageId, reason));
  if (error) throw error;
}
