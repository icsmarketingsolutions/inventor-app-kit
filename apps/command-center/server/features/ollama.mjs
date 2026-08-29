const DEFAULT_BASE_URL = 'http://127.0.0.1:11434/';
const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const ALLOWED_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);
const ALLOWED_ROLES = new Set(['system', 'user', 'assistant']);

export class OllamaError extends Error {
  constructor(message, { code = 'OLLAMA_ERROR', status = null, cause } = {}) {
    super(message, { cause });
    this.name = 'OllamaError';
    this.code = code;
    this.status = status;
  }
}

export function assertLoopbackOllamaUrl(value = DEFAULT_BASE_URL) {
  let url;
  try {
    url = new URL(value);
  } catch (error) {
    throw new TypeError('La URL de Ollama no es válida', { cause: error });
  }
  if (url.protocol !== 'http:') throw new TypeError('Ollama debe usar HTTP sobre loopback local');
  if (!ALLOWED_HOSTS.has(url.hostname)) throw new TypeError('Ollama solo puede apuntar al loopback local');
  if (url.username || url.password) throw new TypeError('La URL de Ollama no admite credenciales');
  if (url.search || url.hash) throw new TypeError('La URL de Ollama no admite query ni fragmento');
  if (url.pathname !== '/' && url.pathname !== '') throw new TypeError('La URL de Ollama no admite una ruta base');
  if (url.port && (!/^\d+$/.test(url.port) || Number(url.port) < 1 || Number(url.port) > 65_535)) {
    throw new TypeError('El puerto de Ollama no es válido');
  }
  url.pathname = '/';
  return url;
}

function assertTimeout(value) {
  if (!Number.isInteger(value) || value < 100 || value > 120_000) {
    throw new RangeError('timeoutMs debe estar entre 100 y 120000');
  }
  return value;
}

function assertModel(model) {
  if (typeof model !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/.test(model)) {
    throw new TypeError('El modelo de Ollama no es válido');
  }
  return model;
}

function assertText(value, name, maximumLength = 200_000) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${name} debe ser texto no vacío`);
  }
  if (value.length > maximumLength) throw new RangeError(`${name} es demasiado largo`);
  if (value.includes('\0')) throw new TypeError(`${name} contiene caracteres no permitidos`);
  return value;
}

function normalizeMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 100) {
    throw new TypeError('messages debe contener entre 1 y 100 mensajes');
  }
  return messages.map((message, index) => {
    if (!message || typeof message !== 'object' || !ALLOWED_ROLES.has(message.role)) {
      throw new TypeError(`Rol inválido en messages[${index}]`);
    }
    return {
      role: message.role,
      content: assertText(message.content, `messages[${index}].content`),
    };
  });
}

function normalizeOptions(options) {
  if (options === undefined) return undefined;
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('options debe ser un objeto');
  }
  const allowed = new Set(['temperature', 'top_p', 'seed', 'num_ctx']);
  const normalized = {};
  for (const [key, value] of Object.entries(options)) {
    if (!allowed.has(key)) throw new TypeError(`Opción de Ollama no permitida: ${key}`);
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError(`Opción inválida: ${key}`);
    if (key === 'temperature' && (value < 0 || value > 2)) {
      throw new TypeError('temperature debe estar entre 0 y 2');
    }
    if (key === 'top_p' && (value <= 0 || value > 1)) {
      throw new TypeError('top_p debe ser mayor que 0 y menor o igual a 1');
    }
    if (key === 'seed' && (!Number.isSafeInteger(value) || value < 0)) {
      throw new TypeError('seed debe ser un entero seguro no negativo');
    }
    if (key === 'num_ctx' && (!Number.isSafeInteger(value) || value < 1 || value > 1_048_576)) {
      throw new TypeError('num_ctx debe ser un entero entre 1 y 1048576');
    }
    normalized[key] = value;
  }
  return normalized;
}

async function readJsonLimited(response, maximumBytes = MAX_RESPONSE_BYTES) {
  if (!response.body) throw new OllamaError('Ollama respondió sin cuerpo', { code: 'INVALID_RESPONSE' });
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel();
        throw new OllamaError('La respuesta de Ollama excede el límite permitido', {
          code: 'RESPONSE_TOO_LARGE',
          status: response.status,
        });
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString('utf8');
  try {
    return JSON.parse(body);
  } catch (error) {
    throw new OllamaError('Ollama devolvió una respuesta inválida', {
      code: 'INVALID_RESPONSE',
      status: response.status,
      cause: error,
    });
  }
}

function safeRequestError(error) {
  if (error instanceof OllamaError) return error;
  const timeout = error?.name === 'TimeoutError';
  const aborted = error?.name === 'AbortError';
  if (timeout || aborted) {
    return new OllamaError('Ollama no respondió antes del límite', {
      code: 'TIMEOUT',
      cause: error,
    });
  }
  return new OllamaError('No se pudo conectar con Ollama local', {
    code: 'UNAVAILABLE',
    cause: error,
  });
}

export function createOllamaClient({
  baseUrl = DEFAULT_BASE_URL,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  fetchImpl = globalThis.fetch,
} = {}) {
  const endpoint = assertLoopbackOllamaUrl(baseUrl);
  const requestTimeout = assertTimeout(timeoutMs);
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl debe ser una función');

  async function request(path, { method = 'GET', body, signal } = {}) {
    const timeoutSignal = AbortSignal.timeout(requestTimeout);
    const combinedSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
    let response;
    try {
      response = await fetchImpl(new URL(path, endpoint), {
        method,
        headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: combinedSignal,
        redirect: 'error',
      });
    } catch (error) {
      throw safeRequestError(error);
    }
    if (!response.ok) {
      throw new OllamaError(`Ollama local respondió HTTP ${response.status}`, {
        code: 'HTTP_ERROR',
        status: response.status,
      });
    }
    return readJsonLimited(response);
  }

  async function tags({ signal } = {}) {
    const data = await request('/api/tags', { signal });
    if (!Array.isArray(data?.models)) {
      throw new OllamaError('Ollama no devolvió un catálogo de modelos válido', {
        code: 'INVALID_RESPONSE',
      });
    }
    return data.models.map((entry) => ({
      name: typeof entry?.name === 'string' ? entry.name : '',
      size: Number.isFinite(entry?.size) ? entry.size : null,
      modifiedAt: typeof entry?.modified_at === 'string' ? entry.modified_at : null,
    })).filter((entry) => entry.name);
  }

  async function health({ signal } = {}) {
    try {
      const models = await tags({ signal });
      return { available: true, models };
    } catch (error) {
      const safe = safeRequestError(error);
      return { available: false, models: [], error: { code: safe.code, message: safe.message } };
    }
  }

  async function chat({ model, messages, options, signal } = {}) {
    const selectedModel = assertModel(model);
    const payload = {
      model: selectedModel,
      messages: normalizeMessages(messages),
      stream: false,
    };
    const selectedOptions = normalizeOptions(options);
    if (selectedOptions) payload.options = selectedOptions;
    const data = await request('/api/chat', { method: 'POST', body: payload, signal });
    const content = data?.message?.content;
    if (typeof content !== 'string') {
      throw new OllamaError('Ollama no devolvió contenido de chat válido', {
        code: 'INVALID_RESPONSE',
      });
    }
    return {
      content,
      model: typeof data.model === 'string' ? data.model : selectedModel,
      done: data.done === true,
    };
  }

  async function refine({ model, objective, context = '', signal } = {}) {
    const original = assertText(objective, 'objective', 20_000).trim();
    const safeContext = context ? assertText(context, 'context', 20_000).trim() : '';
    const userContent = safeContext
      ? `Contexto del proyecto:\n${safeContext}\n\nObjetivo original:\n${original}`
      : `Objetivo original:\n${original}`;
    const result = await chat({
      model,
      signal,
      options: { temperature: 0.2 },
      messages: [
        {
          role: 'system',
          content: 'Reescribí el objetivo como una instrucción clara, concreta y verificable. Conservá la intención y devolvé únicamente el objetivo mejorado, sin encabezados.',
        },
        { role: 'user', content: userContent },
      ],
    });
    const refined = result.content.trim();
    if (!refined) throw new OllamaError('Ollama devolvió un objetivo vacío', { code: 'INVALID_RESPONSE' });
    return { objective: refined, changed: refined !== original, model: result.model };
  }

  return Object.freeze({
    baseUrl: endpoint.href,
    health,
    tags,
    chat,
    refine,
  });
}
