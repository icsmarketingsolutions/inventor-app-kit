import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { projectStatus } from '../core/git.mjs';
import { cleanup, temporaryDirectory } from './helpers.mjs';

function git(path, ...args) {
  return execFileSync('git', ['-C', path, ...args], { encoding: 'utf8', windowsHide: true });
}

test('lee estado Git sin ejecutar comandos construidos como texto', async (context) => {
  const root = await temporaryDirectory('inventor-os-git-');
  context.after(() => cleanup(root));
  git(root, 'init', '--initial-branch=main');
  git(root, 'config', 'user.name', 'Inventor Local');
  git(root, 'config', 'user.email', 'inventor@users.noreply.github.com');
  git(root, 'config', 'core.autocrlf', 'false');
  await writeFile(join(root, 'README.md'), '# Local\n');
  git(root, 'add', 'README.md');
  git(root, 'commit', '-m', 'inicio local');
  await writeFile(join(root, 'nuevo.txt'), 'cambio');
  const result = await projectStatus({ id: 'demo', name: 'Demo', path: root });
  assert.equal(result.available, true);
  assert.equal(result.git.repository, true);
  assert.equal(result.git.branch, 'main');
  assert.equal(result.git.dirtyCount, 1);
  assert.equal(result.git.lastCommit.subject, 'inicio local');
  assert.equal(result.git.ahead, null);
  assert.equal(JSON.stringify(result).includes(root), false);
});

test('distingue carpeta sin Git y carpeta ausente sin filtrar la ruta', async (context) => {
  const root = await temporaryDirectory('inventor-os-not-git-');
  context.after(() => cleanup(root));
  await mkdir(join(root, 'folder'));
  const plain = await projectStatus({ id: 'plain', name: 'Plain', path: join(root, 'folder') });
  const missing = await projectStatus({ id: 'missing', name: 'Missing', path: join(root, 'private-missing') });
  assert.equal(plain.git.repository, false);
  assert.equal(missing.available, false);
  assert.equal(JSON.stringify([plain, missing]).includes(root), false);
});
