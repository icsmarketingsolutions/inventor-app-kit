import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');

test('la migración fundacional publicada permanece inmutable', () => {
  const migration = readFileSync(join(
    root,
    'templates',
    'web-app',
    'supabase',
    'migrations',
    '20260827160330_initial_inventions.sql',
  ));
  const digest = createHash('sha1').update(`blob ${migration.length}\0`).update(migration).digest('hex');
  assert.equal(digest, '673f104876d2bbfd6d55c1907eb94c6fed838395');
});
