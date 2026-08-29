import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createAgentOps, resolveAgentCommand } from '../features/agent-ops.mjs';

const trustedResolver = async () => process.execPath;

async function fixture(context) {
  const root = await mkdtemp(join(tmpdir(), 'inventor-feature-agents-'));
  const memoryRoot = join(root, 'vault');
  const projectRoot = join(root, 'project');
  await Promise.all([mkdir(memoryRoot), mkdir(projectRoot)]);
  context.after(() => rm(root, { recursive: true, force: true }));
  return {
    root,
    memoryRoot,
    projectRoot,
    projects: [{ id: 'project-1', name: 'Proyecto Uno', path: projectRoot }],
  };
}

function fakeSpawner(calls) {
  return (command, args, options) => {
    const child = new EventEmitter();
    child.prompt = null;
    child.stdin = { end: (value) => { child.prompt = Buffer.from(value).toString('utf8'); } };
    child.kill = () => child.emit('close', null);
    calls.push({ command, args, options, child });
    return child;
  };
}

test('exige confirmación explícita y proyectos registrados antes de spawn', async (context) => {
  const data = await fixture(context);
  let calls = 0;
  const ops = createAgentOps({
    memoryRoot: data.memoryRoot,
    spawnImpl: () => { calls += 1; throw new Error('no debería llamarse'); },
    resolveCommand: trustedResolver,
  });
  await assert.rejects(ops.launch({
    tool: 'codex', projectIds: ['project-1'], prompt: 'objetivo', registeredProjects: data.projects,
  }), (error) => error.code === 'AGENT_CONFIRMATION_REQUIRED');
  await assert.rejects(ops.launch({
    tool: 'codex', projectIds: ['unknown'], prompt: 'objetivo', confirm: true, registeredProjects: data.projects,
  }), (error) => error.code === 'AGENT_PROJECT_NOT_REGISTERED');
  assert.equal(calls, 0);
});

test('lanza con argv fijo, shell false, cwd registrado y prompt por stdin', async (context) => {
  const data = await fixture(context);
  const calls = [];
  const ops = createAgentOps({
    memoryRoot: data.memoryRoot,
    spawnImpl: fakeSpawner(calls),
    now: () => new Date('2026-08-29T12:00:00.000Z'),
    idFactory: () => '12345678-abcd-4321-abcd-123456789012',
    resolveCommand: trustedResolver,
  });
  const result = await ops.launch({
    tool: 'codex',
    projectIds: ['project-1'],
    prompt: 'Arreglar y verificar',
    confirm: true,
    registeredProjects: data.projects,
  });
  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, await realpath(process.execPath));
  assert.deepEqual(calls[0].args, ['exec', '-']);
  assert.equal(calls[0].options.shell, false);
  assert.equal(calls[0].options.cwd, await realpath(data.projectRoot));
  assert.deepEqual(calls[0].options.stdio, ['pipe', 'ignore', 'ignore']);
  assert.equal(calls[0].child.prompt, 'Arreglar y verificar');
  await assert.rejects(readdir(join(data.memoryRoot, '.agent-tmp')), { code: 'ENOENT' });

  calls[0].child.emit('close', 0);
  await ops.waitForIdle();
  const activity = await ops.activity();
  assert.equal(activity.length, 1);
  assert.equal(activity[0].project, 'Proyecto Uno');
  assert.equal(activity[0].agent, 'codex');
  assert.equal(activity[0].status, 'completed');
  assert.equal(activity[0].exitCode, 0);

  const reports = await readdir(join(data.memoryRoot, '50-sessions'));
  assert.equal(reports.length, 1);
  const report = await readFile(join(data.memoryRoot, '50-sessions', reports[0]), 'utf8');
  assert.match(report, /# Sesión codex completada/);
  assert.match(report, /El prompt y la ruta local se omiten deliberadamente/);
  assert.equal(report.includes('Arreglar y verificar'), false);
  assert.equal(report.includes(data.projectRoot), false);
});

test('soporta varios proyectos y mantiene args separados para Claude', async (context) => {
  const data = await fixture(context);
  const secondRoot = join(data.root, 'second');
  await mkdir(secondRoot);
  const projects = [...data.projects, { id: 'project-2', name: 'Proyecto Dos', path: secondRoot }];
  const calls = [];
  let ordinal = 0;
  const ops = createAgentOps({
    memoryRoot: data.memoryRoot,
    spawnImpl: fakeSpawner(calls),
    idFactory: () => `12345678-abcd-4321-abcd-${String(ordinal += 1).padStart(12, '0')}`,
    resolveCommand: trustedResolver,
  });
  const result = await ops.launch({
    tool: 'claude',
    projectIds: ['project-1', 'project-2'],
    prompt: 'Coordinar ambos proyectos',
    confirm: true,
    registeredProjects: projects,
  });
  assert.equal(result.sessions.length, 2);
  assert.deepEqual(calls.map(({ command, args }) => ({ command, args })), [
    { command: await realpath(process.execPath), args: ['--print'] },
    { command: await realpath(process.execPath), args: ['--print'] },
  ]);
  calls.forEach(({ child }) => child.emit('close', 0));
  await ops.waitForIdle();
  assert.equal((await ops.activity()).length, 2);
});

test('registra un fallo de spawn y limpia temporales', async (context) => {
  const data = await fixture(context);
  const ops = createAgentOps({
    memoryRoot: data.memoryRoot,
    spawnImpl: () => { throw new Error('not installed'); },
    resolveCommand: trustedResolver,
  });
  await assert.rejects(ops.launch({
    tool: 'codex',
    projectIds: ['project-1'],
    prompt: 'Objetivo',
    confirm: true,
    registeredProjects: data.projects,
  }), (error) => error.code === 'AGENT_START_FAILED');
  await assert.rejects(readdir(join(data.memoryRoot, '.agent-tmp')), { code: 'ENOENT' });
  const activity = await ops.activity();
  assert.equal(activity.length, 1);
  assert.equal(activity[0].status, 'failed');
});

test('no queda esperando ni filtra temporales si stdin rechaza el prompt', async (context) => {
  const data = await fixture(context);
  const ops = createAgentOps({
    memoryRoot: data.memoryRoot,
    spawnImpl: () => {
      const child = new EventEmitter();
      child.stdin = { end: () => { throw new Error('pipe closed'); } };
      child.kill = () => {};
      return child;
    },
    resolveCommand: trustedResolver,
  });
  await assert.rejects(ops.launch({
    tool: 'claude',
    projectIds: ['project-1'],
    prompt: 'Objetivo',
    confirm: true,
    registeredProjects: data.projects,
  }), (error) => error.code === 'AGENT_START_FAILED');
  await ops.waitForIdle();
  await assert.rejects(readdir(join(data.memoryRoot, '.agent-tmp')), { code: 'ENOENT' });
  assert.equal((await ops.activity())[0].status, 'failed');
});

test('resuelve el agente fuera del cwd y rechaza binary planting dentro del proyecto', async (context) => {
  const data = await fixture(context);
  const trustedBin = join(data.root, 'trusted-bin');
  await mkdir(trustedBin);
  const planted = join(data.projectRoot, 'codex.exe');
  const trusted = join(trustedBin, 'codex.exe');
  await Promise.all([writeFile(planted, 'plantado'), writeFile(trusted, 'confiable')]);
  const resolved = await resolveAgentCommand('codex', {
    environment: { PATH: trustedBin, PATHEXT: '.EXE' },
    platform: 'win32',
  });
  assert.equal(resolved, await realpath(trusted));

  let spawned = false;
  const ops = createAgentOps({
    memoryRoot: data.memoryRoot,
    spawnImpl: () => { spawned = true; throw new Error('no debe ejecutarse'); },
    resolveCommand: async () => planted,
  });
  await assert.rejects(ops.launch({
    tool: 'codex', projectIds: ['project-1'], prompt: 'Objetivo', confirm: true,
    registeredProjects: data.projects,
  }), (error) => error.code === 'AGENT_COMMAND_UNTRUSTED');
  assert.equal(spawned, false);
});

test('revierte sesiones ya iniciadas si falla un lanzamiento multiproyecto', async (context) => {
  const data = await fixture(context);
  const secondRoot = join(data.root, 'second');
  await mkdir(secondRoot);
  const projects = [...data.projects, { id: 'project-2', name: 'Proyecto Dos', path: secondRoot }];
  const calls = [];
  const spawner = fakeSpawner(calls);
  let ordinal = 0;
  const ops = createAgentOps({
    memoryRoot: data.memoryRoot,
    resolveCommand: trustedResolver,
    idFactory: () => `12345678-abcd-4321-abcd-${String(ordinal += 1).padStart(12, '0')}`,
    spawnImpl: (...arguments_) => {
      if (calls.length === 1) throw new Error('segundo lanzamiento falló');
      return spawner(...arguments_);
    },
  });
  await assert.rejects(ops.launch({
    tool: 'codex', projectIds: ['project-1', 'project-2'], prompt: 'Coordinar', confirm: true,
    registeredProjects: projects,
  }), (error) => error.code === 'AGENT_START_FAILED');
  await ops.waitForIdle();
  assert.equal(calls.length, 1);
  assert.equal((await ops.activity()).every((entry) => entry.status === 'failed'), true);
});
