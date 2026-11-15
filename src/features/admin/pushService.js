export const PUSH_FUNCTION_SLUG = 'bright-task';

export async function sendPushNotification(announcementId, client) {
  if (!client?.functions?.invoke) throw new Error('خدمة الإشعارات غير متاحة حالياً.');
  const { data, error } = await client.functions.invoke(PUSH_FUNCTION_SLUG, {
    body: { announcement_id: announcementId },
  });
  if (error) throw error;
  return data;
}

export async function diagnosePushConfiguration(client) {
  if (!client?.functions?.invoke) throw new Error('خدمة الإشعارات غير متاحة حالياً.');
  const { data, error } = await client.functions.invoke(PUSH_FUNCTION_SLUG, {
    body: { diagnostic: true },
  });
  if (error) throw error;
  return data;
}
