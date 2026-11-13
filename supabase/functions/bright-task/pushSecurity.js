const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class PayloadTooLargeError extends Error {}

export async function readJsonWithLimit(request, maxBytes = 8192) {
  const reader = request.body?.getReader();
  if (!reader) throw new SyntaxError('invalid_json');
  const chunks = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value.byteLength > maxBytes - totalBytes) {
      try { await reader.cancel(); } catch { /* stream already closed */ }
      throw new PayloadTooLargeError('request_too_large');
    }
    totalBytes += value.byteLength;
    chunks.push(value);
  }
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}

export function extractBearerToken(header) {
  if (typeof header !== 'string') return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match?.[1] || null;
}

export function isActiveAdmin(profile) {
  return profile?.role === 'admin' && profile?.is_active === true;
}

export function isValidAnnouncementRequest(body) {
  return body !== null
    && typeof body === 'object'
    && !Array.isArray(body)
    && typeof body.announcement_id === 'string'
    && UUID_PATTERN.test(body.announcement_id);
}

export function publicPushFailure() {
  return { error: 'internal_error' };
}
