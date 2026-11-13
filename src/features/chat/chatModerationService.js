const VALID_ROOMS = ['boys', 'girls'];

export function canModerateChat(profile) {
  return profile?.role === 'admin';
}

export function canCommitReportRequest(requestVersion, currentVersion, requestedRoom, currentRoom) {
  return requestVersion === currentVersion && requestedRoom === currentRoom;
}

export function canCommitChatDeletion(requestedRoom, currentRoom, canRead) {
  return requestedRoom === currentRoom && canRead;
}

export function sanitizeChatReport(row, expectedRoom) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
  if (expectedRoom && row.room_group !== expectedRoom) return null;
  if (['message_id', 'display_name', 'body', 'created_at'].some((field) => typeof row[field] !== 'string')) return null;
  const reportCount = Number(row.report_count);
  if (!Number.isSafeInteger(reportCount) || reportCount < 1) return null;
  return {
    message_id: row.message_id,
    display_name: row.display_name,
    body: row.body,
    created_at: row.created_at,
    report_count: reportCount,
  };
}

export function sanitizeChatReports(rows, expectedRoom) {
  return Array.isArray(rows) ? rows.map((row) => sanitizeChatReport(row, expectedRoom)).filter(Boolean) : [];
}

export function listReportsRpcArgs(room, limit = 100) {
  if (!VALID_ROOMS.includes(room)) throw new Error('مجموعة الدردشة غير صالحة.');
  const parsedLimit = Number(limit);
  const safeLimit = Math.min(100, Math.max(1, Number.isFinite(parsedLimit) ? Math.trunc(parsedLimit) : 100));
  return { p_room: room, p_limit: safeLimit };
}

export function deleteChatMessageRpcArgs(room, messageId) {
  if (!VALID_ROOMS.includes(room)) throw new Error('مجموعة الدردشة غير صالحة.');
  return { p_room: room, p_message_id: messageId };
}

export async function listReportedMessages(room, limit = 100) {
  const { supabase } = await import('../../lib/supabase.js');
  const { data, error } = await supabase.rpc('admin_list_student_chat_reports', listReportsRpcArgs(room, limit));
  if (error) throw error;
  return sanitizeChatReports(data, room);
}

export async function deleteChatMessage(room, messageId, client) {
  const rpcClient = client || (await import('../../lib/supabase.js')).supabase;
  if (!rpcClient) throw new Error('تعذر الاتصال بقاعدة البيانات.');
  const { error } = await rpcClient.rpc('admin_delete_student_chat_message', deleteChatMessageRpcArgs(room, messageId));
  if (error) throw error;
}
