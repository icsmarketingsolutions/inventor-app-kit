import assert from 'node:assert/strict';
import { mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import {
  buildGraph,
  captureNote,
  listNotes,
  parseDirectives,
  readDirectives,
  readNote,
  searchNotes,
  updateDirectives,
  writeNote,
} from '../core/memory.mjs';
import { addProject, initializeRuntime, readConfig } from '../core/storage.mjs';
import { cleanup, withSeed } from './helpers.mjs';

test('inicializa una memoria neutral una sola vez y conserva cambios', async (context) => {
  const fixture = await withSeed();
  context.after(() => cleanup(fixture.root));
  const first = await initializeRuntime({ runtimeRoot: fixture.runtime, seedRoot: fixture.seed });
  assert.equal((await buildGraph(first.memoryRoot)).nodes.some((node) => node.unresolved), false);
  const created = await writeNote(first.memoryRoot, '20-knowledge/decision.md', '# Decisión\n\nPersistir.\n');
  assert.equal(created.title, 'Decisión');
  const second = await initializeRuntime({ runtimeRoot: fixture.runtime, seedRoot: fixture.seed });
  assert.equal((await readNote(second.memoryRoot, '20-knowledge/decision.md')).content.includes('Persistir'), true);
  assert.deepEqual(await readConfig(second.configPath), { version: 1, projects: [] });
});

test('lista, busca y captura notas sin una base de datos', async (context) => {
  const fixture = await withSeed();
  context.after(() => cleanup(fixture.root));
  const { memoryRoot } = await initializeRuntime({ runtimeRoot: fixture.runtime, seedRoot: fixture.seed });
  const capture = await captureNote(memoryRoot, 'Una idea con marca-zafiro-829', new Date('2026-08-29T12:34:00.000Z'));
  assert.match(capture.path, /^00-inbox\/20260829-1234[0-9a-f-]*-captura\.md$/);
  assert.equal((await listNotes(memoryRoot)).some((note) => note.path === capture.path), true);
  assert.deepEqual((await searchNotes(memoryRoot, 'marca-zafiro-829')).map((item) => item.path), [capture.path]);
});

test('usa rutas relativas como IDs y no colisiona notas con el mismo nombre', async (context) => {
  const fixture = await withSeed();
  context.after(() => cleanup(fixture.root));
  const { memoryRoot } = await initializeRuntime({ runtimeRoot: fixture.runtime, seedRoot: fixture.seed });
  await writeNote(memoryRoot, '10-projects/shared.md', '# Proyecto\n\nVer [[20-knowledge/shared]] y [[futura|idea]].\n');
  await writeNote(memoryRoot, '20-knowledge/shared.md', '# Conocimiento\n');
  const graph = await buildGraph(memoryRoot);
  assert.equal(graph.nodes.some((node) => node.id === '10-projects/shared'), true);
  assert.equal(graph.nodes.some((node) => node.id === '20-knowledge/shared'), true);
  assert.equal(graph.nodes.some((node) => node.id === '@unresolved/futura' && node.unresolved), true);
  assert.equal(graph.edges.some((edge) => edge.source === '10-projects/shared' && edge.target === '20-knowledge/shared'), true);
});

test('rechaza traversal, nombres reservados y enlaces simbólicos', async (context) => {
  const fixture = await withSeed();
  context.after(() => cleanup(fixture.root));
  const { memoryRoot } = await initializeRuntime({ runtimeRoot: fixture.runtime, seedRoot: fixture.seed });
  await assert.rejects(() => readNote(memoryRoot, '../secret.md'), (error) => error.code === 'INVALID_NOTE_PATH');
  await assert.rejects(() => writeNote(memoryRoot, 'CON.md', 'x'), (error) => error.code === 'INVALID_NOTE_PATH');
  const outside = join(fixture.root, 'outside');
  await mkdir(outside);
  await writeFile(join(outside, 'secret.md'), 'privado');
  const link = join(memoryRoot, 'linked');
  try {
    await symlink(outside, link, process.platform === 'win32' ? 'junction' : 'dir');
  } catch (error) {
    if (error?.code === 'EPERM') {
      context.skip('El host no permite crear enlaces simbólicos sin privilegios.');
      return;
    }
    throw error;
  }
  await assert.rejects(() => readNote(memoryRoot, 'linked/secret.md'), (error) => error.code === 'LINK_NOT_ALLOWED');
  assert.equal((await listNotes(memoryRoot)).some((note) => note.path.startsWith('linked/')), false);
});

test('limita notas enormes creadas externamente sin derribar listado ni grafo', async (context) => {
  const fixture = await withSeed();
  context.after(() => cleanup(fixture.root));
  const { memoryRoot } = await initializeRuntime({ runtimeRoot: fixture.runtime, seedRoot: fixture.seed });
  const hugePath = join(memoryRoot, '20-knowledge', 'externa-enorme.md');
  await writeFile(hugePath, `# Externa\n\n${'x'.repeat(2 * 1024 * 1024 + 1)}`);
  const listed = await listNotes(memoryRoot);
  assert.equal(listed.find((note) => note.path === '20-knowledge/externa-enorme.md')?.oversize, true);
  await assert.rejects(
    () => readNote(memoryRoot, '20-knowledge/externa-enorme.md'),
    (error) => error.code === 'NOTE_TOO_LARGE' && error.status === 413,
  );
  assert.equal((await searchNotes(memoryRoot, 'externa')).length, 0);
  assert.equal((await buildGraph(memoryRoot)).nodes.some((node) => node.id === '20-knowledge/externa-enorme'), true);
});

test('parsea y persiste CRUD de directivas con wikilinks', async (context) => {
  const fixture = await withSeed();
  context.after(() => cleanup(fixture.root));
  const { memoryRoot } = await initializeRuntime({ runtimeRoot: fixture.runtime, seedRoot: fixture.seed });
  assert.deepEqual(parseDirectives('# Directivas\n\n- [ ] Hacer [[algo]]\n- [x] Listo\n'), [
    { id: 'directive-0', text: 'Hacer [[algo]]', done: false },
    { id: 'directive-1', text: 'Listo', done: true },
  ]);
  let directives = await updateDirectives(memoryRoot, { action: 'add', text: 'Construir [[demo]]' });
  assert.equal(directives[0].text, 'Construir [[demo]]');
  directives = await updateDirectives(memoryRoot, { action: 'toggle', id: directives[0].id, done: true });
  assert.equal(directives[0].done, true);
  directives = await updateDirectives(memoryRoot, { action: 'edit', id: directives[0].id, text: 'Verificar [[demo]]' });
  assert.equal(directives[0].text, 'Verificar [[demo]]');
  directives = await updateDirectives(memoryRoot, { action: 'delete', id: directives[0].id });
  assert.deepEqual(directives, []);
  assert.equal((await readFile(join(memoryRoot, '30-directives', 'directives.md'), 'utf8')).includes('Verificar'), false);
  await Promise.all([
    updateDirectives(memoryRoot, { action: 'add', text: 'Primera concurrente' }),
    updateDirectives(memoryRoot, { action: 'add', text: 'Segunda concurrente' }),
  ]);
  assert.deepEqual(
    new Set((await readDirectives(memoryRoot)).map((directive) => directive.text)),
    new Set(['Primera concurrente', 'Segunda concurrente']),
  );
});

test('serializa altas concurrentes del registro local sin perder proyectos', async (context) => {
  const fixture = await withSeed();
  context.after(() => cleanup(fixture.root));
  const { configPath } = await initializeRuntime({ runtimeRoot: fixture.runtime, seedRoot: fixture.seed });
  const first = join(fixture.root, 'proyecto-uno');
  const second = join(fixture.root, 'proyecto-dos');
  await Promise.all([mkdir(first), mkdir(second)]);
  await Promise.all([
    addProject(configPath, { name: 'Proyecto Uno', path: first }),
    addProject(configPath, { name: 'Proyecto Dos', path: second }),
  ]);
  const config = await readConfig(configPath);
  assert.deepEqual(new Set(config.projects.map((project) => project.name)), new Set(['Proyecto Uno', 'Proyecto Dos']));
});
