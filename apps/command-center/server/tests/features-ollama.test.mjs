import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertLoopbackOllamaUrl,
  createOllamaClient,
  OllamaError,
} from '../features/ollama.mjs';

function jsonResponse(value, init) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

test('acepta únicamente HTTP loopback sin credenciales, rutas ni redirecciones', () => {
  assert.equal(assertLoopbackOllamaUrl('http://127.0.0.1:11434').href, 'http://127.0.0.1:11434/');
  assert.equal(assertLoopbackOllamaUrl('http://localhost:11434/').href, 'http://localhost:11434/');
  assert.equal(assertLoopbackOllamaUrl('http://[::1]:11434/').href, 'http://[::1]:11434/');
  for (const url of [
    'https://127.0.0.1:11434/',
    'http://0.0.0.0:11434/',
    ['http://', 'user', ':', 'pass', '@localhost:11434/'].join(''),
    'http://localhost:11434/api/',
    'http://localhost:11434/?remote=true',
  ]) {
    assert.throws(() => assertLoopbackOllamaUrl(url), TypeError);
  }
});

test('consulta tags y chat sin salir de loopback y fuerza stream false', async () => {
  const calls = [];
  const client = createOllamaClient({
    fetchImpl: async (url, init) => {
      calls.push({ url: url.href, init });
      if (url.pathname === '/api/tags') {
        return jsonResponse({ models: [{ name: 'qwen3:8b', size: 42, modified_at: '2026-01-01T00:00:00Z' }] });
      }
      return jsonResponse({ model: 'qwen3:8b', done: true, message: { content: 'respuesta local' } });
    },
  });
  assert.deepEqual(await client.tags(), [{ name: 'qwen3:8b', size: 42, modifiedAt: '2026-01-01T00:00:00Z' }]);
  assert.deepEqual(await client.chat({
    model: 'qwen3:8b',
    messages: [{ role: 'user', content: 'hola' }],
    options: { temperature: 0.2, seed: 7 },
  }), { content: 'respuesta local', model: 'qwen3:8b', done: true });
  assert.deepEqual(calls.map(({ url }) => url), [
    'http://127.0.0.1:11434/api/tags',
    'http://127.0.0.1:11434/api/chat',
  ]);
  const body = JSON.parse(calls[1].init.body);
  assert.equal(body.stream, false);
  assert.deepEqual(body.messages, [{ role: 'user', content: 'hola' }]);
  assert.deepEqual(body.options, { temperature: 0.2, seed: 7 });
  assert.equal(calls[1].init.redirect, 'error');
});

test('refina con instrucciones estables y devuelve si el objetivo cambió', async () => {
  let payload;
  const client = createOllamaClient({
    fetchImpl: async (_url, init) => {
      payload = JSON.parse(init.body);
      return jsonResponse({ model: 'gemma3:4b', done: true, message: { content: 'Objetivo claro y verificable.\n' } });
    },
  });
  const result = await client.refine({
    model: 'gemma3:4b',
    objective: 'hacerlo mejor',
    context: 'Proyecto local',
  });
  assert.deepEqual(result, { objective: 'Objetivo claro y verificable.', changed: true, model: 'gemma3:4b' });
  assert.equal(payload.stream, false);
  assert.equal(payload.options.temperature, 0.2);
  assert.match(payload.messages[0].content, /únicamente el objetivo mejorado/);
  assert.match(payload.messages[1].content, /Contexto del proyecto:\nProyecto local/);
});

test('health degrada una falla sin inventar modelos y chat conserva errores tipados', async () => {
  const unavailable = createOllamaClient({
    fetchImpl: async () => { throw new TypeError('connection refused with private detail'); },
  });
  assert.deepEqual(await unavailable.health(), {
    available: false,
    models: [],
    error: { code: 'UNAVAILABLE', message: 'No se pudo conectar con Ollama local' },
  });

  const failing = createOllamaClient({ fetchImpl: async () => jsonResponse({}, { status: 500 }) });
  await assert.rejects(failing.chat({ model: 'qwen3', messages: [{ role: 'user', content: 'hola' }] }), (error) => {
    assert.equal(error instanceof OllamaError, true);
    assert.equal(error.code, 'HTTP_ERROR');
    assert.equal(error.status, 500);
    return true;
  });
});

test('rechaza opciones fuera de rango antes de llamar a Ollama', async () => {
  let calls = 0;
  const client = createOllamaClient({ fetchImpl: async () => { calls += 1; return jsonResponse({}); } });
  for (const options of [
    { temperature: -0.1 },
    { temperature: 2.1 },
    { top_p: 0 },
    { top_p: 1.1 },
    { seed: 1.5 },
    { num_ctx: 0 },
    { hidden: 1 },
  ]) {
    await assert.rejects(client.chat({
      model: 'qwen3',
      messages: [{ role: 'user', content: 'hola' }],
      options,
    }), TypeError);
  }
  assert.equal(calls, 0);
});
