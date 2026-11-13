import { supabase } from '../../lib/supabase.js';

export const toEmail = (phone) => phone.includes('@') ? phone.trim() : phone.replace(/\D/g, '') + '@bus.app';
export async function getProfile(userId) {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('لم يتم العثور على الملف الشخصي');
  return data;
}
export async function signIn(phone, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email: toEmail(phone), password });
  if (error) throw error;
  return data.user;
}
export async function signUp({ name, phone, password, code }) {
  const { data, error } = await supabase.auth.signUp({ email: toEmail(phone), password, options: { data: { full_name: name, phone } } });
  if (error) throw error;
  if (!data.session) throw new Error('فعّل Auto Confirm: عطّل Confirm email في Supabase.');
  const result = await supabase.rpc('redeem_subscription_code', { p_code: code });
  if (result.error) throw result.error;
  return data.user;
}
export async function logout() { const { error } = await supabase.auth.signOut(); if (error) throw error; }
