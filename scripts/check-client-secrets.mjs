import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = resolve(import.meta.dirname || new URL('.', import.meta.url).pathname, '..');
const PUBLIC_VITE_VARIABLES = new Set(['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']);
const FORBIDDEN_NAMES = [
  /\b(?:VITE_)?SUPABASE_[A-Z0-9_]*(?:SERVICE_ROLE|SECRET|PRIVATE|PASSWORD)_[A-Z0-9_]*\b/g,
  /\b(?:VITE_)?[A-Z0-9_]*SERVICE_ROLE_KEY\b/g,
  /\b(?:OPENAI|STRIPE|GITHUB|VAPID|AWS)_[A-Z0-9_]*(?:API_KEY|TOKEN|SECRET|PRIVATE|PASSWORD)\b/g,
];
const JWT_PATTERN = /\b(eyJ[A-Za-z0-9_-]{8,})\.([A-Za-z0-9_-]{8,})\.([A-Za-z0-9_-]{8,})\b/g;
const PRIVATE_KEY_PATTERN = /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/;
const HIGH_CONFIDENCE_TOKENS = [
  /\bsb_secret_[A-Za-z0-9_-]{12,}\b/,
  /\b(?:ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})\b/,
  /\b(?:sk_live_[A-Za-z0-9]{16,}|sk-proj-[A-Za-z0-9_-]{20,})\b/,
  /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/,
];

function decodeJwtPayload(payload) {
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

/** Return redacted findings only: never include matched values or surrounding source. */
export function scanClientText(file, text) {
  const findings = [];
  const seen = new Set();
  const add = (reason, identifier = undefined) => {
    const key = `${reason}:${identifier || ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    findings.push(identifier ? { file, reason, identifier } : { file, reason });
  };

  for (const pattern of FORBIDDEN_NAMES) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) add('forbidden_secret_name', match[0]);
  }

  for (const match of text.matchAll(/\bVITE_[A-Z0-9_]+\b/g)) {
    const identifier = match[0];
    if (PUBLIC_VITE_VARIABLES.has(identifier)) continue;
    if (findings.some((finding) => finding.identifier === identifier)) continue;
    add('unapproved_vite_variable', identifier);
  }

  JWT_PATTERN.lastIndex = 0;
  for (const match of text.matchAll(JWT_PATTERN)) {
    const claims = decodeJwtPayload(match[2]);
    if (claims?.role === 'service_role' || claims?.role === 'supabase_admin') add('service_role_jwt');
  }

  if (PRIVATE_KEY_PATTERN.test(text)) add('private_key_material');
  for (const pattern of HIGH_CONFIDENCE_TOKENS) {
    if (pattern.test(text)) add('high_confidence_credential_token');
  }
  return findings;
}

function listSourceFiles() {
  let tracked;
  try {
    tracked = execFileSync('git', ['ls-files', '-co', '--exclude-standard'], { cwd: ROOT, encoding: 'utf8' })
      .split('\n').filter(Boolean);
  } catch {
    tracked = [];
  }
  const allowed = new Set(['src/', 'public/', '.github/workflows/', 'index.html', 'vite.config.js']);
  return [...new Set(tracked)].filter((file) => [...allowed].some((prefix) => prefix.endsWith('/') ? file.startsWith(prefix) : file === prefix));
}

function listDistFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const fullPath = resolve(dir, name);
    if (statSync(fullPath).isDirectory()) return listDistFiles(fullPath);
    return [fullPath];
  });
}

function scanFile(filePath) {
  const buffer = readFileSync(filePath);
  if (buffer.includes(0)) return [];
  return scanClientText(relative(ROOT, filePath).split(sep).join('/'), buffer.toString('utf8'));
}

export function collectClientFindings({ includeDist = true } = {}) {
  const sourceFiles = listSourceFiles().map((file) => resolve(ROOT, file)).filter(existsSync);
  const files = includeDist ? [...sourceFiles, ...listDistFiles(resolve(ROOT, 'dist'))] : sourceFiles;
  return files.flatMap(scanFile);
}

function main() {
  const findings = collectClientFindings();
  if (findings.length) {
    console.error(`Client secret check failed (${findings.length} redacted finding(s)):`);
    for (const finding of findings) {
      const label = finding.identifier ? ` (${finding.identifier})` : '';
      console.error(`- ${finding.file}: ${finding.reason}${label}`);
    }
    process.exitCode = 1;
    return;
  }
  console.log('Client secret check passed: source and available build artifacts contain no detected server secrets.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
