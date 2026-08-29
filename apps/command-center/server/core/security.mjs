import { lstat, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { AppError } from './errors.mjs';

export const MAX_JSON_BYTES = 256 * 1024;
const RESERVED_WINDOWS_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;

function loopbackHostname(hostname) {
  return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '[::1]';
}

export function requestIsLocal(request) {
  const rawHost = request.headers.host || '';
  try {
    return loopbackHostname(new URL(`http://${rawHost}`).hostname);
  } catch {
    return false;
  }
}

export function allowedOrigin(rawOrigin, rawHost = '') {
  if (!rawOrigin) return true;
  try {
    const origin = new URL(rawOrigin);
    if (origin.protocol !== 'http:' || !loopbackHostname(origin.hostname)) return false;
    if (!rawHost) return true;
    const requestHost = new URL(`http://${rawHost}`);
    return loopbackHostname(requestHost.hostname) && origin.host === requestHost.host;
  } catch {
    return false;
  }
}

export async function readJsonBody(request, limit = MAX_JSON_BYTES) {
  const contentType = String(request.headers['content-type'] || '').split(';', 1)[0].trim().toLowerCase();
  if (contentType !== 'application/json') {
    throw new AppError(415, 'JSON_REQUIRED', 'Se requiere Content-Type application/json.');
  }
  const declared = Number(request.headers['content-length'] || 0);
  if (Number.isFinite(declared) && declared > limit) {
    throw new AppError(413, 'BODY_TOO_LARGE', 'El contenido supera el límite permitido.');
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) {
      throw new AppError(413, 'BODY_TOO_LARGE', 'El contenido supera el límite permitido.');
    }
    chunks.push(chunk);
  }
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('object expected');
    return parsed;
  } catch {
    throw new AppError(400, 'INVALID_JSON', 'El cuerpo JSON no es válido.');
  }
}

export function safeProjectName(value) {
  const name = typeof value === 'string' ? value.trim() : '';
  if (!/^[\p{L}\p{N}][\p{L}\p{N} ._-]{0,79}$/u.test(name)) {
    throw new AppError(400, 'INVALID_PROJECT_NAME', 'El nombre del proyecto no es válido.');
  }
  return name;
}

export function safeNotePath(value) {
  if (typeof value !== 'string' || !value || value.length > 240 || value.includes('\0')) {
    throw new AppError(400, 'INVALID_NOTE_PATH', 'La ruta de la nota no es válida.');
  }
  const portable = value.replaceAll('\\', '/');
  if (portable.startsWith('/') || /^[a-z]:/i.test(portable) || portable.includes('//')) {
    throw new AppError(400, 'INVALID_NOTE_PATH', 'La ruta de la nota no es válida.');
  }
  const parts = portable.split('/');
  for (const part of parts) {
    if (!part || part === '.' || part === '..' || part.startsWith('.') || part.length > 100
      || /[<>:"|?*]/.test(part) || /[ .]$/.test(part) || RESERVED_WINDOWS_NAME.test(part)) {
      throw new AppError(400, 'INVALID_NOTE_PATH', 'La ruta de la nota no es válida.');
    }
  }
  if (!portable.toLowerCase().endsWith('.md')) {
    throw new AppError(400, 'INVALID_NOTE_PATH', 'Las notas deben ser archivos Markdown.');
  }
  return parts.join('/');
}

export function containedPath(root, portablePath) {
  const target = resolve(root, ...portablePath.split('/'));
  const fromRoot = relative(resolve(root), target);
  if (!fromRoot || fromRoot.startsWith(`..${sep}`) || fromRoot === '..' || isAbsolute(fromRoot)) {
    if (!fromRoot && portablePath === '') return target;
    throw new AppError(400, 'INVALID_NOTE_PATH', 'La ruta de la nota no es válida.');
  }
  return target;
}

export async function assertNoLinks(root, target, { targetMayBeMissing = false } = {}) {
  const canonicalRoot = await realpath(root);
  const pathFromRoot = relative(resolve(root), resolve(target));
  if (pathFromRoot.startsWith(`..${sep}`) || pathFromRoot === '..' || isAbsolute(pathFromRoot)) {
    throw new AppError(400, 'INVALID_NOTE_PATH', 'La ruta de la nota no es válida.');
  }
  const segments = pathFromRoot ? pathFromRoot.split(sep) : [];
  let current = resolve(root);
  for (let index = 0; index < segments.length; index += 1) {
    current = resolve(current, segments[index]);
    let stats;
    try {
      stats = await lstat(current);
    } catch (error) {
      if (error?.code === 'ENOENT' && targetMayBeMissing) break;
      throw error;
    }
    if (stats.isSymbolicLink()) {
      throw new AppError(400, 'LINK_NOT_ALLOWED', 'No se permiten enlaces en la memoria local.');
    }
    const canonical = await realpath(current);
    const canonicalRelative = relative(canonicalRoot, canonical);
    if (canonicalRelative.startsWith(`..${sep}`) || canonicalRelative === '..' || isAbsolute(canonicalRelative)) {
      throw new AppError(400, 'LINK_NOT_ALLOWED', 'No se permiten enlaces fuera de la memoria local.');
    }
  }
}
