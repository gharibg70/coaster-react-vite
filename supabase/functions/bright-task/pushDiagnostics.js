const REQUIRED_VAPID_SETTINGS = ['VAPID_SUBJECT', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY'];
const SAFE_ERROR_CODE = /^(?:[0-9A-Z]{5}|PGRST[0-9]{3})$/;

function safeDatabaseCode(error) {
  return typeof error?.code === 'string' && SAFE_ERROR_CODE.test(error.code)
    ? error.code
    : undefined;
}

export async function diagnosePushSetup({ getEnv, setVapidDetails, loadActiveSubscriptions }) {
  const values = Object.fromEntries(REQUIRED_VAPID_SETTINGS.map((name) => [name, getEnv(name)]));
  const missing = REQUIRED_VAPID_SETTINGS.filter((name) => !values[name]);
  if (missing.length) return { ok: false, code: 'vapid_configuration_missing', missing };

  try {
    await setVapidDetails(values.VAPID_SUBJECT, values.VAPID_PUBLIC_KEY, values.VAPID_PRIVATE_KEY);
  } catch {
    return { ok: false, code: 'vapid_configuration_invalid' };
  }

  let result;
  try {
    result = await loadActiveSubscriptions();
  } catch (error) {
    const sqlstate = safeDatabaseCode(error);
    return { ok: false, code: 'subscription_query_failed', ...(sqlstate ? { sqlstate } : {}) };
  }
  if (result?.error) {
    const sqlstate = safeDatabaseCode(result.error);
    return { ok: false, code: 'subscription_query_failed', ...(sqlstate ? { sqlstate } : {}) };
  }

  const activeSubscriptions = Number.isInteger(result?.count) && result.count >= 0
    ? result.count
    : Array.isArray(result?.data) ? result.data.length : 0;
  return { ok: true, code: 'ready', activeSubscriptions };
}
