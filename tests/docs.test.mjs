import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');

function markdownFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === '.git' || entry.name === 'node_modules') return [];
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return markdownFiles(path);
    return extname(entry.name).toLowerCase() === '.md' ? [path] : [];
  });
}

test('todos los enlaces Markdown relativos apuntan a archivos existentes', () => {
  const missing = [];
  const linkPattern = /\[[^\]]*\]\(([^)]+)\)/g;
  for (const file of markdownFiles(root)) {
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(linkPattern)) {
      const rawTarget = match[1].trim().replace(/^<|>$/g, '');
      if (!rawTarget || rawTarget.startsWith('#') || /^[a-z][a-z0-9+.-]*:/i.test(rawTarget)) continue;
      const target = decodeURIComponent(rawTarget.split('#')[0]);
      if (!existsSync(resolve(dirname(file), target))) {
        missing.push(`${file.slice(root.length + 1)} -> ${target}`);
      }
    }
  }
  assert.deepEqual(missing, []);
});
