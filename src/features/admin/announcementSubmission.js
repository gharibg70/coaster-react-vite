export async function submitAnnouncement(event, {
  profileId,
  readValues,
  createAnnouncement,
  refreshTools,
  sendPush,
  showToast,
  reportError,
}) {
  event.preventDefault();
  const formElement = event.currentTarget;
  const { title, message, targetGroup } = readValues(formElement);
  if (!title || !message) {
    showToast('اكتب العنوان والنص.', true);
    return;
  }

  try {
    const announcement = await createAnnouncement(title, message, targetGroup, profileId);
    formElement.reset();
    await refreshTools();
    showToast('تم نشر التنبيه. جاري إرسال إشعارات الهاتف...');
    try {
      const result = await sendPush(announcement.id);
      showToast(`تم الإرسال إلى ${result.sent} جهاز.`);
    } catch {
      showToast('نُشر التنبيه، لكن فشل إرسال إشعارات الهاتف.', true);
    }
  } catch (error) {
    reportError(error);
  }
}
