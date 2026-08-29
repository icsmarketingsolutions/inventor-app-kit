import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, realpath, writeFile } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import { join } from 'node:path';
import test from 'node:test';
import { createCommandCenterServer } from '../index.mjs';
import { cleanup, close, listen, withSeed } from './helpers.mjs';

async function json(response) {
  const value = await response.json();
  return { status: response.status, value };
}

async function rawJson(url, headers) {
  return new Promise((resolve, reject) => {
    const request = httpRequest(url, { headers }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve({
        status: response.statusCode,
        value: JSON.parse(Buffer.concat(chunks).toString('utf8')),
      }));
    });
    request.once('error', reject);
    request.end();
  });
}

async function fixtureServer(context, options = {}) {
  const fixture = await withSeed();
  const server = await createCommandCenterServer({
    runtimeRoot: fixture.runtime,
    seedRoot: fixture.seed,
    distRoot: null,
    ...options,
  });
  const baseUrl = await listen(server);
  context.after(async () => {
    await close(server);
    await cleanup(fixture.root);
  });
  return { ...fixture, server, baseUrl };
}

test('health identifica el producto sin exponer datos privados', async (context) => {
  const { baseUrl, runtime } = await fixtureServer(context);
  const result = await json(await fetch(`${baseUrl}/api/health`));
  assert.deepEqual(result, { status: 200, value: { ok: true, product: 'inventor-os', version: 1 } });
  assert.equal(JSON.stringify(result).includes(runtime), false);
});

test('API persiste notas, búsquedas, capturas, directivas y grafo', async (context) => {
  const { baseUrl } = await fixtureServer(context);
  const headers = { 'content-type': 'application/json', origin: baseUrl };
  let result = await json(await fetch(`${baseUrl}/api/memory/note`, {
    method: 'POST', headers, body: JSON.stringify({ path: '20-knowledge/api.md', content: '# API\n\nMarca-cobalto-731 [[INDEX]].\n' }),
  }));
  assert.equal(result.status, 200);
  result = await json(await fetch(`${baseUrl}/api/memory/note?path=20-knowledge%2Fapi.md`, { headers: { origin: headers.origin } }));
  assert.equal(result.value.note.title, 'API');
  result = await json(await fetch(`${baseUrl}/api/memory/search?q=marca-cobalto-731`));
  assert.deepEqual(result.value.results.map((entry) => entry.path), ['20-knowledge/api.md']);
  result = await json(await fetch(`${baseUrl}/api/memory/capture`, {
    method: 'POST', headers, body: JSON.stringify({ text: 'Idea desde API' }),
  }));
  assert.equal(result.status, 201);
  result = await json(await fetch(`${baseUrl}/api/directives`, {
    method: 'POST', headers, body: JSON.stringify({ action: 'add', text: 'Revisar [[api]]' }),
  }));
  assert.equal(result.value.directives[0].text, 'Revisar [[api]]');
  result = await json(await fetch(`${baseUrl}/api/graph`));
  assert.equal(result.value.nodes.some((node) => node.id === '20-knowledge/api'), true);
  result = await json(await fetch(`${baseUrl}/api/status`));
  assert.equal(result.value.memory.inbox >= 1, true);
  assert.equal(result.value.directives.length, 1);
});

test('registro de proyecto devuelve estado Git pero nunca la ruta local', async (context) => {
  const { baseUrl, root } = await fixtureServer(context);
  const project = join(root, 'repo privado');
  execFileSync('git', ['init', '--initial-branch=main', project], { windowsHide: true });
  execFileSync('git', ['-C', project, 'config', 'user.name', 'Inventor']);
  execFileSync('git', ['-C', project, 'config', 'user.email', 'inventor@users.noreply.github.com']);
  execFileSync('git', ['-C', project, 'config', 'core.autocrlf', 'false']);
  await writeFile(join(project, 'README.md'), '# Demo\n');
  execFileSync('git', ['-C', project, 'add', 'README.md']);
  execFileSync('git', ['-C', project, 'commit', '-m', 'inicio']);
  const result = await json(await fetch(`${baseUrl}/api/projects`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Proyecto Demo', path: project }),
  }));
  assert.equal(result.status, 201);
  assert.equal(result.value.project.git.repository, true);
  assert.equal(JSON.stringify(result.value).includes(project), false);
  const listed = await json(await fetch(`${baseUrl}/api/projects`));
  assert.equal(listed.value.projects.length, 1);
  assert.equal(JSON.stringify(listed.value).includes(project), false);
});

test('bloquea Origin/Host externos, traversal, tipos y cuerpos excesivos', async (context) => {
  const { baseUrl, runtime } = await fixtureServer(context);
  let result = await json(await fetch(`${baseUrl}/api/status`, { headers: { origin: 'https://malicioso.example' } }));
  assert.equal(result.status, 403);
  assert.equal(result.value.error.code, 'LOCAL_ONLY');
  assert.equal(result.value.error.message.includes(runtime), false);
  result = await json(await fetch(`${baseUrl}/api/status`, { headers: { origin: 'http://127.0.0.1:9999' } }));
  assert.equal(result.status, 403);
  assert.equal(result.value.error.code, 'LOCAL_ONLY');
  const externalHost = await rawJson(`${baseUrl}/api/health`, { host: 'malicioso.example' });
  assert.equal(externalHost.status, 403);
  assert.equal(externalHost.value.error.code, 'LOCAL_ONLY');
  result = await json(await fetch(`${baseUrl}/api/memory/note?path=..%2Fsecret.md`));
  assert.equal(result.status, 400);
  assert.equal(result.value.error.code, 'INVALID_NOTE_PATH');
  result = await json(await fetch(`${baseUrl}/api/memory/note`, { method: 'POST', body: '{}' }));
  assert.equal(result.status, 415);
  const huge = JSON.stringify({ text: 'x'.repeat(300_000) });
  result = await json(await fetch(`${baseUrl}/api/memory/capture`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: huge,
  }));
  assert.equal(result.status, 413);
});

test('integra Foundry, Ollama y agentes usando solo IDs registrados', async (context) => {
  const calls = { chat: [], refine: [], launch: [] };
  const ollamaClient = {
    health: async () => ({ available: true, models: [{ name: 'qwen-demo', size: 1, modifiedAt: null }] }),
    chat: async (input) => {
      calls.chat.push(input);
      return { content: 'Respuesta local', model: input.model, done: true };
    },
    refine: async (input) => {
      calls.refine.push(input);
      return { objective: 'Objetivo verificable', changed: true, model: input.model };
    },
  };
  const agentOps = {
    activity: async () => [{ id: 'session-1', subject: 'Sesión completada', status: 'completed' }],
    launch: async (input) => {
      calls.launch.push(input);
      return { ok: true, sessions: [{ id: 'session-2', status: 'running' }] };
    },
  };
  const fixture = await fixtureServer(context, { ollamaClient, agentOps });
  const project = join(fixture.root, 'repo-local');
  await mkdir(project);
  let result = await json(await fetch(`${fixture.baseUrl}/api/projects`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Repo Local', path: project }),
  }));
  const projectId = result.value.project.id;
  result = await json(await fetch(`${fixture.baseUrl}/api/foundry/catalog`));
  assert.equal(result.value.modes.some((mode) => mode.id === 'plan'), true);
  result = await json(await fetch(`${fixture.baseUrl}/api/foundry/forge`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      mode: 'plan', objective: 'Diseñar el flujo', tool: 'codex', projectIds: [projectId],
      path: 'C:\\ruta\\que-no-debe-usarse',
    }),
  }));
  assert.equal(result.status, 200);
  assert.match(result.value.prompt, /Diseñar el flujo/);
  assert.equal(result.value.prompt.includes('ruta\\que-no-debe-usarse'), false);
  result = await json(await fetch(`${fixture.baseUrl}/api/ollama/status`));
  assert.equal(result.value.available, true);
  result = await json(await fetch(`${fixture.baseUrl}/api/ollama/chat`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'qwen-demo', message: 'Hola local' }),
  }));
  assert.equal(result.value.content, 'Respuesta local');
  assert.equal(calls.chat[0].messages[0].content, 'Hola local');
  result = await json(await fetch(`${fixture.baseUrl}/api/foundry/refine`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'qwen-demo', objective: 'hacer cosa' }),
  }));
  assert.equal(result.value.objective, 'Objetivo verificable');
  result = await json(await fetch(`${fixture.baseUrl}/api/agents/activity`));
  assert.equal(result.value.activity[0].status, 'completed');
  result = await json(await fetch(`${fixture.baseUrl}/api/agents/launch`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tool: 'codex', projectIds: [projectId], prompt: 'Prompt seguro', confirm: true, path: 'C:\\mal' }),
  }));
  assert.equal(result.status, 202);
  assert.equal(calls.launch[0].registeredProjects[0].path, await realpath(project));
  assert.equal(Object.hasOwn(calls.launch[0], 'path'), false);
  result = await json(await fetch(`${fixture.baseUrl}/api/foundry/forge`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ mode: 'plan', objective: 'x', tool: 'codex', projectIds: ['no-registrado'] }),
  }));
  assert.equal(result.status, 404);
});

test('sirve dist y usa index.html como fallback sin permitir salir de dist', async (context) => {
  const fixture = await withSeed();
  const dist = join(fixture.root, 'dist');
  await mkdir(join(dist, 'assets'), { recursive: true });
  await writeFile(join(dist, 'index.html'), '<!doctype html><title>Inventor OS</title>');
  await writeFile(join(dist, 'assets', 'app.js'), 'globalThis.app = true;');
  const server = await createCommandCenterServer({ runtimeRoot: fixture.runtime, seedRoot: fixture.seed, distRoot: dist });
  const baseUrl = await listen(server);
  context.after(async () => { await close(server); await cleanup(fixture.root); });
  let response = await fetch(`${baseUrl}/assets/app.js`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /javascript/);
  assert.match(response.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  response = await fetch(`${baseUrl}/pantalla/local`);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Inventor OS/);
  response = await fetch(`${baseUrl}/%2e%2e%2f%2e%2e%2fsecret.txt`);
  assert.notEqual(response.status, 200);
});
