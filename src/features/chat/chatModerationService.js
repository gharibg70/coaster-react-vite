export function canModerateChat(profile) {
  return profile?.role === 'admin';
}

export function sanitizeChatReport(row) {
  if (!row || typeof row !== 'object') return null;
  if (['message_id', 'display_name', 'body', 'created_at'].some((field) => typeof row[field] !== 'string')) return null;
  const reportCount = Number(row.report_count);
  if (!Number.isSafeInteger(reportCount) || reportCount < 1) return null;
  return { message_id: row.message_id, display_name: row.display_name, body: row.body, created_at: row.created_at, report_count: reportCount };
}

export function sanitizeChatReports(rows) {
  return Array.isArray(rows) ? rows.map(sanitizeChatReport).filter(Boolean) : [];
}

export async function listReportedMessages(limit = 100) {
  const { supabase } = await import('../../lib/supabase.js');
  const parsedLimit = Number(limit);
  const safeLimit = Math.min(100, Math.max(1, Number.isFinite(parsedLimit) ? Math.trunc(parsedLimit) : 100));
  const { data, error } = await supabase.rpc('admin_list_student_chat_reports', { p_limit: safeLimit });
  if (error) throw error;
  return sanitizeChatReports(data);
}

export async function deleteReportedMessage(messageId) {
  const { supabase } = await import('../../lib/supabase.js');
  const { error } = await supabase.rpc('admin_delete_student_chat_message', { p_message_id: messageId });
  if (error) throw error;
}
