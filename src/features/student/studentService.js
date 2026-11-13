import { supabase } from '../../lib/supabase.js';
import { dayString } from '../../lib/utils.js';

export async function loadStudentData(profile) {
  const { data: subscription, error } = await supabase.from('subscriptions').select('route_id,status,end_date').eq('user_id', profile.id).maybeSingle();
  if (error) throw error;
  if (!subscription) return { subscription: null };
  const date = dayString(1);
  const applied = await supabase.rpc('apply_defaults', { p_date: date });
  if (applied.error) throw applied.error;
  const [attendance, announcements, history, defaults, seats] = await Promise.all([
    supabase.from('daily_attendance').select('outbound,return_trip,auto').eq('user_id', profile.id).eq('attendance_date', date).maybeSingle(),
    supabase.from('announcements').select('title,message,created_at').eq('is_active', true).order('created_at', { ascending: false }).limit(30),
    supabase.from('daily_attendance').select('attendance_date,outbound,return_trip').eq('user_id', profile.id).order('attendance_date', { ascending: false }).limit(14),
    supabase.from('weekly_defaults').select('weekday,outbound,return_trip').eq('user_id', profile.id),
    supabase.rpc('get_seats', { p_route_id: subscription.route_id, p_date: date }),
  ]);
  for (const result of [attendance, announcements, history, defaults, seats]) if (result.error) throw result.error;
  return { subscription, date, attendance: attendance.data, announcements: announcements.data || [], history: history.data || [], defaults: defaults.data || [], seats: seats.data?.[0] || null };
}
export async function setAttendance(routeId, date, outbound, returnTrip) {
  const { error } = await supabase.rpc('set_my_attendance', { p_route_id: routeId, p_date: date, p_outbound: outbound, p_return: returnTrip });
  if (error) throw error;
}
export async function redeemCode(code) { const { error } = await supabase.rpc('redeem_subscription_code', { p_code: code }); if (error) throw error; }
export async function setWeeklyDefault(userId, weekday, value) {
  const query = value ? supabase.from('weekly_defaults').upsert({ user_id: userId, weekday, outbound: value[0] === 't', return_trip: value[1] === 't' }) : supabase.from('weekly_defaults').delete().eq('user_id', userId).eq('weekday', weekday);
  const { error } = await query;
  if (error) throw error;
}
