const sensitiveKeys = new Set([
  'ANON_KEY',
  'DB_URL',
  'JWT_SECRET',
  'PUBLISHABLE_KEY',
  'S3_PROTOCOL_ACCESS_KEY_ID',
  'S3_PROTOCOL_ACCESS_KEY_SECRET',
  'SECRET_KEY',
  'SERVICE_ROLE_KEY',
]);

const sensitiveLabel = /(?:ANON_KEY|DB_URL|JWT_SECRET|PUBLISHABLE_KEY|S3_PROTOCOL_ACCESS_KEY_ID|S3_PROTOCOL_ACCESS_KEY_SECRET|SECRET_KEY|SERVICE_ROLE_KEY|anon key|access key|db url|jwt secret|publishable key|secret key|service role key|s3 protocol access key(?: id| secret)?)/i;

function sanitizeStructured(value) {
  if (Array.isArray(value)) return value.map(sanitizeStructured);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [
    key,
    sensitiveKeys.has(key.toUpperCase()) ? '[REDACTED]' : sanitizeStructured(entry),
  ]));
}

function sanitizeLine(line) {
  const trimmed = line.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return JSON.stringify(sanitizeStructured(JSON.parse(trimmed)));
    } catch {
      // La salida legible de la CLI no siempre es JSON; continúa con patrones.
    }
  }

  if (sensitiveLabel.test(line)) {
    const label = line.match(sensitiveLabel)?.[0] ?? 'credencial local';
    const indentation = line.match(/^\s*/)?.[0] ?? '';
    return `${indentation}${label}: [REDACTED]`;
  }

  return line
    .replace(/sb_(?:secret|publishable)_[A-Za-z0-9_-]+/g, '[REDACTED]')
    .replace(/eyJ[A-Za-z0-9_.-]{20,}/g, '[REDACTED]')
    .replace(/postgres(?:ql)?:\/\/[^\s@]+@[^\s"']+/gi, 'postgresql://[REDACTED]');
}

export function redactSupabaseOutput(input) {
  const trimmed = input.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const output = JSON.stringify(sanitizeStructured(JSON.parse(trimmed)));
      return input.endsWith('\n') ? `${output}\n` : output;
    } catch {
      // Puede mezclar JSON con líneas de progreso; se sanea línea por línea.
    }
  }
  return input.split(/\r?\n/).map(sanitizeLine).join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { input += chunk; });
  process.stdin.on('end', () => process.stdout.write(redactSupabaseOutput(input)));
}
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
