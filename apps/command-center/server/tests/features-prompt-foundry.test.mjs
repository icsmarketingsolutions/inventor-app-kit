import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import {
  DEFAULT_FOUNDRY_ROOT,
  FOUNDRY_TOOLS,
  forgePrompt,
  listFoundryCatalog,
} from '../features/prompt-foundry.mjs';

const repositoryRoot = resolve(import.meta.dirname, '../../../..');

async function temporaryProject(context, name, { migrations = false } = {}) {
  const container = await mkdtemp(join(tmpdir(), 'inventor-feature-foundry-'));
  const project = join(container, name);
  await mkdir(project);
  if (migrations) await mkdir(join(project, 'supabase', 'migrations'), { recursive: true });
  context.after(() => rm(container, { recursive: true, force: true }));
  return { container, project };
}

const stableGit = async (_root, arguments_) => arguments_[0] === 'status'
  ? { ok: true, stdout: ' M src/a.mjs\n?? src/b.mjs' }
  : { ok: true, stdout: '12' };

test('usa el Foundry raíz y publica modos, bloques y agentes soportados', async () => {
  assert.equal(DEFAULT_FOUNDRY_ROOT, join(repositoryRoot, 'foundry'));
  assert.deepEqual(FOUNDRY_TOOLS, ['codex', 'claude']);
  const catalog = await listFoundryCatalog();
  assert.deepEqual(catalog.modes.map(({ id }) => id), ['audit', 'build', 'document', 'fix', 'improve', 'plan', 'review']);
  assert.deepEqual(catalog.blocks, ['experience', 'memory', 'migrations', 'verification', 'workflow']);
  assert.deepEqual(catalog.tools, ['codex', 'claude']);
  assert.deepEqual(catalog.agents, [
    { value: 'codex', label: 'Codex' },
    { value: 'claude', label: 'Claude Code' },
  ]);
  assert.equal(catalog.modes.every((mode) => mode.value === mode.id && mode.label === mode.title), true);
});

test('genera el mismo contrato para la misma selección y diferencia Codex de Claude', async (context) => {
  const { container, project } = await temporaryProject(context, 'frontend');
  const input = {
    mode: 'fix',
    objective: 'Corregir el flujo roto',
    projects: [{ id: 'frontend', name: 'Frontend', root: project }],
    baseDirectory: container,
    gitRunner: stableGit,
  };
  const first = await forgePrompt({ ...input, tool: 'codex' });
  const second = await forgePrompt({ ...input, tool: 'codex' });
  const claude = await forgePrompt({ ...input, tool: 'claude' });
  assert.equal(first, second);
  assert.match(first, /Destino: \*\*Codex\*\*/);
  assert.match(first, /Leé `AGENTS\.md`/);
  assert.match(claude, /Destino: \*\*Claude Code\*\*/);
  assert.match(claude, /Leé `CLAUDE\.md`/);
  assert.match(first, /2 cambio\(s\) local\(es\)/);
  assert.match(first, /12 commit\(s\)/);
  assert.match(first, /Ruta relativa operable: `frontend`/);
  assert.equal(first.includes(project), false);
});

test('coordina uno o varios proyectos y agrega la guardia solo si hay migraciones', async (context) => {
  const first = await temporaryProject(context, 'web');
  const second = await temporaryProject(context, 'api', { migrations: true });
  const shared = {
    mode: 'build',
    objective: 'Coordinar el cambio',
    baseDirectory: dirname(first.container),
    gitRunner: stableGit,
  };
  const one = await forgePrompt({
    ...shared,
    projects: [{ id: 'web', name: 'Web', root: first.project }],
  });
  const many = await forgePrompt({
    ...shared,
    projects: [
      { id: 'web', name: 'Web', root: first.project },
      { id: 'api', name: 'API', root: second.project },
    ],
  });
  assert.doesNotMatch(one, /Guardia de migraciones Supabase/);
  assert.match(many, /### Proyecto 1/);
  assert.match(many, /### Proyecto 2/);
  assert.match(many, /Guardia de migraciones Supabase/);
  assert.match(many, /supabase\/migrations/);
});

test('rechaza modo, agente e identificadores repetidos', async (context) => {
  const { container, project } = await temporaryProject(context, 'app');
  const base = {
    objective: 'Objetivo',
    projects: [{ id: 'app', root: project }],
    baseDirectory: container,
    gitRunner: stableGit,
  };
  await assert.rejects(forgePrompt({ ...base, mode: 'unknown' }), /Modo inválido/);
  await assert.rejects(forgePrompt({ ...base, mode: 'plan', tool: 'other' }), /Agente inválido/);
  await assert.rejects(forgePrompt({
    ...base,
    mode: 'plan',
    projects: [{ id: 'app', root: project }, { id: 'APP', root: project }],
  }), /identificador único/);
});

test('omite toda jerarquía local de proyectos fuera del workspace', async (context) => {
  const { container, project } = await temporaryProject(context, 'cliente-secreto');
  const workspace = join(container, 'workspace');
  await mkdir(workspace);
  const prompt = await forgePrompt({
    mode: 'plan',
    objective: 'Planificar sin filtrar rutas',
    projects: [{ id: 'externo', name: 'Proyecto externo', root: project }],
    baseDirectory: workspace,
    gitRunner: stableGit,
  });
  assert.match(prompt, /Ruta relativa operable: `omitida: fuera del workspace`/);
  assert.equal(prompt.includes(project), false);
  assert.doesNotMatch(prompt, /\.\.\/cliente-secreto/);
});
