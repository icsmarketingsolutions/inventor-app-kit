import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import test from 'node:test';

import { redactSupabaseOutput } from '../scripts/redact-supabase-output.mjs';

test('redacta todos los campos sensibles de la salida JSON de Supabase', () => {
  const sample = JSON.stringify(Object.fromEntries([
    ['API_URL', 'http://127.0.0.1:54321'],
    ['DB_URL', ['postgresql://postgres:', 'local-pass', '@127.0.0.1:54322/postgres'].join('')],
    ['JWT_SECRET', ['local-', 'jwt-secret-value'].join('')],
    ['PUBLISHABLE_KEY', ['sb_', 'publishable_', 'A'.repeat(24)].join('')],
    ['SECRET_KEY', ['sb_', 'secret_', 'B'.repeat(24)].join('')],
    ['ANON_KEY', ['eyJ', 'A'.repeat(30)].join('')],
    ['SERVICE_ROLE_KEY', ['eyJ', 'B'.repeat(30)].join('')],
    ['S3_PROTOCOL_ACCESS_KEY_ID', 'C'.repeat(32)],
    ['S3_PROTOCOL_ACCESS_KEY_SECRET', 'D'.repeat(64)],
  ]));
  const redacted = redactSupabaseOutput(sample);
  const parsed = JSON.parse(redacted);

  assert.equal(parsed.API_URL, 'http://127.0.0.1:54321');
  for (const [key, value] of Object.entries(parsed)) {
    if (key !== 'API_URL') assert.equal(value, '[REDACTED]');
  }
  assert.equal(redacted.includes('local-pass'), false);
  assert.equal(redacted.includes('D'.repeat(64)), false);
});

test('redacta JSON multilínea completo', () => {
  const secret = 'H'.repeat(64);
  const sample = JSON.stringify({ S3_PROTOCOL_ACCESS_KEY_SECRET: secret }, null, 2);
  const redacted = redactSupabaseOutput(sample);
  assert.equal(redacted.includes(secret), false);
  assert.equal(JSON.parse(redacted).S3_PROTOCOL_ACCESS_KEY_SECRET, '[REDACTED]');
});

test('redacta filas legibles y tokens sueltos sin ocultar mensajes normales', () => {
  const token = ['sb_', 'secret_', 'E'.repeat(24)].join('');
  const output = redactSupabaseOutput([
    `Secret key │ ${token}`,
    `Access Key: ${'F'.repeat(32)}`,
    'Starting database...',
  ].join('\n'));

  assert.equal(output.includes(token), false);
  assert.equal(output.includes('F'.repeat(32)), false);
  assert.match(output, /Starting database/);
});

test('funciona como filtro de stdin en Windows y Unix', () => {
  const script = resolve(import.meta.dirname, '..', 'scripts', 'redact-supabase-output.mjs');
  const secret = ['sb_', 'secret_', 'G'.repeat(24)].join('');
  const result = spawnSync(process.execPath, [script], {
    input: `Secret key: ${secret}\nStarting database...\n`,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.includes(secret), false);
  assert.match(result.stdout, /\[REDACTED\]/);
  assert.match(result.stdout, /Starting database/);
});
