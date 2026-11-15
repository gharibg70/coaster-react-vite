import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';
import {
  PayloadTooLargeError,
  extractBearerToken,
  isActiveAdmin,
  isPushDiagnosticRequest,
  isValidAnnouncementRequest,
  publicPushFailure,
  readJsonWithLimit,
} from './pushSecurity.js';
import { diagnosePushSetup } from './pushDiagnostics.js';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  let failureStage = 'authentication';
  try {
    const token = extractBearerToken(req.headers.get('Authorization'));
    if (!token) return json({ error: 'unauthorized' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) throw new Error('server configuration unavailable');
    const db = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: authData, error: authError } = await db.auth.getUser(token);
    if (authError || !authData?.user) return json({ error: 'unauthorized' }, 401);
    failureStage = 'admin_profile_lookup';
    const { data: profile, error: profileError } = await db.from('profiles')
      .select('role,is_active').eq('id', authData.user.id).maybeSingle();
    if (profileError) throw profileError;
    if (!isActiveAdmin(profile)) return json({ error: 'forbidden' }, 403);

    failureStage = 'request_body';
    let requestBody;
    try { requestBody = await readJsonWithLimit(req, 8192); }
    catch (error) {
      if (error instanceof PayloadTooLargeError) return json({ error: 'request_too_large' }, 413);
      return json({ error: 'invalid_json' }, 400);
    }
    if (isPushDiagnosticRequest(requestBody)) {
      failureStage = 'push_diagnostic';
      const diagnostic = await diagnosePushSetup({
        getEnv: (name: string) => Deno.env.get(name),
        setVapidDetails: (subject: string, publicKey: string, privateKey: string) =>
          webpush.setVapidDetails(subject, publicKey, privateKey),
        loadActiveSubscriptions: async () => {
          const { count, error } = await db.from('push_subscriptions')
            .select('id,profiles!inner(group_type,is_active)', { count: 'exact', head: true })
            .eq('profiles.is_active', true);
          return { count, error };
        },
      });
      return json(diagnostic);
    }
    if (!isValidAnnouncementRequest(requestBody)) return json({ error: 'invalid_announcement_id' }, 400);

    failureStage = 'announcement_lookup';
    const { data: announcement, error: announcementError } = await db.from('announcements')
      .select('title,message,target_group,is_active').eq('id', requestBody.announcement_id).maybeSingle();
    if (announcementError) throw announcementError;
    if (!announcement || !announcement.is_active) return json({ error: 'not_found' }, 404);

    failureStage = 'vapid_configuration';
    const vapidSubject = Deno.env.get('VAPID_SUBJECT');
    const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY');
    const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY');
    if (!vapidSubject || !vapidPublicKey || !vapidPrivateKey) throw new Error('push configuration unavailable');
    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

    failureStage = 'subscription_lookup';
    let query = db.from('push_subscriptions')
      .select('id,subscription_data,profiles!inner(group_type,is_active)')
      .eq('profiles.is_active', true);
    if (announcement.target_group) query = query.eq('profiles.group_type', announcement.target_group);
    const { data: subscriptions, error: subscriptionsError } = await query;
    if (subscriptionsError) throw subscriptionsError;

    const payload = JSON.stringify({ title: announcement.title, body: announcement.message });
    let sent = 0;
    const expiredIds: string[] = [];
    failureStage = 'web_push_send';
    await Promise.all((subscriptions ?? []).map(async (subscription: any) => {
      try {
        await webpush.sendNotification(subscription.subscription_data, payload, { TTL: 86400 });
        sent++;
      } catch (error: any) {
        if (error?.statusCode === 404 || error?.statusCode === 410) expiredIds.push(subscription.id);
      }
    }));

    if (expiredIds.length) {
      failureStage = 'expired_subscription_cleanup';
      const { error: cleanupError } = await db.from('push_subscriptions').delete().in('id', expiredIds);
      if (cleanupError) throw cleanupError;
    }
    return json({ sent, total: subscriptions?.length ?? 0 });
  } catch {
    // Do not return raw database, web-push, or configuration errors to the browser.
    console.error(`send-push internal failure stage=${failureStage}`);
    return json(publicPushFailure(), 500);
  }
});
