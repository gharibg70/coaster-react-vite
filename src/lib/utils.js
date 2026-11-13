export const DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس'];
export const dayString = (offset = 0) => new Date(Date.now() + offset * 864e5).toLocaleDateString('en-CA', { timeZone: 'Asia/Baghdad' });
export const dayKey = (date) => new Date(date).toLocaleDateString('en-CA', { timeZone: 'Asia/Baghdad' });
export const tripLabel = (outbound, returnTrip) => outbound && returnTrip ? 'ذهاب وعودة' : outbound ? 'ذهاب فقط' : returnTrip ? 'عودة فقط' : 'لا يداوم';
export const dayLabel = (date) => {
  const key = dayKey(date);
  if (key === dayString(0)) return 'اليوم';
  if (key === dayString(-1)) return 'أمس';
  return new Date(date).toLocaleDateString('ar-IQ-u-nu-latn', { timeZone: 'Asia/Baghdad', day: 'numeric', month: 'long', year: 'numeric' });
};
