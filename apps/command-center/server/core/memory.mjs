import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, stat } from 'node:fs/promises';
import { basename, dirname, relative, resolve } from 'node:path';
import { AppError } from './errors.mjs';
import { assertNoLinks, containedPath, safeNotePath } from './security.mjs';
import { atomicWrite } from './storage.mjs';

const DIRECTIVES_PATH = '30-directives/directives.md';
const MAX_NOTE_CHARS = 200_000;
const MAX_CAPTURE_CHARS = 10_000;
const MAX_EXTERNAL_NOTE_BYTES = 2 * 1024 * 1024;
const directiveQueues = new Map();

function portable(root, path) {
  return relative(root, path).replaceAll('\\', '/');
}

function titleFrom(content, path) {
  const withoutFrontmatter = content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
  const heading = withoutFrontmatter.match(/^#\s+(.+)$/m)?.[1]?.trim();
  return heading || basename(path, '.md');
}

async function walkMarkdown(memoryRoot, current = memoryRoot, notes = []) {
  const entries = await readdir(current, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const target = resolve(current, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) await walkMarkdown(memoryRoot, target, notes);
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) notes.push(target);
  }
  return notes;
}

async function noteMetadata(memoryRoot, path, content, info = null) {
  const fileInfo = info || await stat(path);
  const notePath = portable(memoryRoot, path);
  return {
    path: notePath,
    title: titleFrom(content, path),
    folder: notePath.includes('/') ? notePath.split('/')[0] : 'root',
    modifiedAt: fileInfo.mtime.toISOString(),
    size: fileInfo.size,
    oversize: fileInfo.size > MAX_EXTERNAL_NOTE_BYTES,
  };
}

export async function listNotes(memoryRoot) {
  const paths = await walkMarkdown(memoryRoot);
  const notes = await Promise.all(paths.map(async (path) => {
    const info = await stat(path);
    const content = info.size > MAX_EXTERNAL_NOTE_BYTES ? '' : await readFile(path, 'utf8');
    return noteMetadata(memoryRoot, path, content, info);
  }));
  return notes.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt) || a.path.localeCompare(b.path));
}

export async function readNote(memoryRoot, inputPath) {
  const notePath = safeNotePath(inputPath);
  const target = containedPath(memoryRoot, notePath);
  try {
    await assertNoLinks(memoryRoot, target);
    const info = await stat(target);
    if (info.size > MAX_EXTERNAL_NOTE_BYTES) {
      throw new AppError(413, 'NOTE_TOO_LARGE', 'La nota supera el límite seguro de lectura.');
    }
    const content = await readFile(target, 'utf8');
    return { ...(await noteMetadata(memoryRoot, target, content, info)), content };
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error?.code === 'ENOENT') throw new AppError(404, 'NOTE_NOT_FOUND', 'La nota no existe.');
    throw error;
  }
}

export async function writeNote(memoryRoot, inputPath, content) {
  const notePath = safeNotePath(inputPath);
  if (typeof content !== 'string' || content.length > MAX_NOTE_CHARS) {
    throw new AppError(400, 'INVALID_NOTE_CONTENT', 'El contenido de la nota no es válido.');
  }
  const target = containedPath(memoryRoot, notePath);
  const parent = dirname(target);
  await assertNoLinks(memoryRoot, target, { targetMayBeMissing: true });
  await mkdir(parent, { recursive: true });
  await assertNoLinks(memoryRoot, parent);
  try {
    await assertNoLinks(memoryRoot, target);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  await atomicWrite(target, content);
  return readNote(memoryRoot, notePath);
}

function timestampForName(date) {
  return date.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
}

export async function captureNote(memoryRoot, text, now = new Date()) {
  const clean = typeof text === 'string' ? text.trim() : '';
  if (!clean || clean.length > MAX_CAPTURE_CHARS) {
    throw new AppError(400, 'INVALID_CAPTURE', 'La captura debe tener entre 1 y 10000 caracteres.');
  }
  const suffix = randomUUID().slice(0, 8);
  const notePath = `00-inbox/${timestampForName(now)}-${suffix}-captura.md`;
  const label = now.toISOString().replace('T', ' ').slice(0, 16);
  const content = `---\ntags: [inbox]\nrelacionado: ["[[INDEX]]"]\n---\n\n# Captura ${label}\n\n${clean}\n`;
  return writeNote(memoryRoot, notePath, content);
}

export async function searchNotes(memoryRoot, query) {
  const needle = typeof query === 'string' ? query.trim().toLocaleLowerCase('es') : '';
  if (needle.length < 2 || needle.length > 80) {
    throw new AppError(400, 'INVALID_SEARCH', 'La búsqueda debe tener entre 2 y 80 caracteres.');
  }
  const notes = await listNotes(memoryRoot);
  const results = [];
  for (const note of notes) {
    if (note.oversize) continue;
    const content = await readFile(containedPath(memoryRoot, note.path), 'utf8');
    const haystack = `${note.path}\n${content}`.toLocaleLowerCase('es');
    const index = haystack.indexOf(needle);
    if (index < 0) continue;
    const contentIndex = Math.max(0, content.toLocaleLowerCase('es').indexOf(needle));
    const excerpt = content.slice(Math.max(0, contentIndex - 45), contentIndex + needle.length + 90)
      .replace(/\s+/g, ' ').trim().slice(0, 180);
    results.push({ path: note.path, title: note.title, excerpt });
    if (results.length === 25) break;
  }
  return results;
}

function idForPath(path) {
  return path.replace(/\.md$/i, '');
}

function wikilinks(content) {
  return [...content.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g)]
    .map((match) => match[1].trim().replaceAll('\\', '/'))
    .filter((target) => target
      && !target.startsWith('/')
      && !/^[a-z]:/i.test(target)
      && !target.split('/').some((part) => !part || part === '.' || part === '..'));
}

export async function buildGraph(memoryRoot) {
  const notes = await listNotes(memoryRoot);
  const contentByPath = new Map();
  const pathById = new Map();
  const pathsByStem = new Map();
  for (const note of notes) {
    const id = idForPath(note.path);
    pathById.set(id.toLocaleLowerCase('es'), note.path);
    const stem = basename(id).toLocaleLowerCase('es');
    const candidates = pathsByStem.get(stem) || [];
    candidates.push(note.path);
    pathsByStem.set(stem, candidates);
    contentByPath.set(
      note.path,
      note.oversize ? '' : await readFile(containedPath(memoryRoot, note.path), 'utf8'),
    );
  }
  const nodes = notes.map((note) => ({
    id: idForPath(note.path), path: note.path, label: basename(note.path, '.md'), folder: note.folder, unresolved: false,
  }));
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = [];
  const edgeKeys = new Set();
  for (const note of notes) {
    const source = idForPath(note.path);
    for (const rawTarget of wikilinks(contentByPath.get(note.path))) {
      const normalized = rawTarget.replace(/\.md$/i, '').replace(/^\.\//, '');
      const exactPath = pathById.get(normalized.toLocaleLowerCase('es'));
      const byStem = pathsByStem.get(basename(normalized).toLocaleLowerCase('es')) || [];
      const resolvedPath = exactPath || (byStem.length === 1 ? byStem[0] : null);
      const target = resolvedPath ? idForPath(resolvedPath) : `@unresolved/${normalized}`;
      if (!nodeIds.has(target)) {
        nodes.push({ id: target, path: '', label: basename(normalized), folder: 'unresolved', unresolved: true });
        nodeIds.add(target);
      }
      const key = `${source}\0${target}`;
      if (!edgeKeys.has(key)) {
        edges.push({ source, target });
        edgeKeys.add(key);
      }
    }
  }
  return { nodes, edges };
}

export function parseDirectives(content) {
  const directives = [];
  let ordinal = 0;
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*- \[([ xX])\] (.+)$/);
    if (!match) continue;
    directives.push({ id: `directive-${ordinal}`, text: match[2], done: match[1].toLowerCase() === 'x' });
    ordinal += 1;
  }
  return directives;
}

function directiveText(value) {
  const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  if (!text || text.length > 1000) {
    throw new AppError(400, 'INVALID_DIRECTIVE', 'La directiva debe tener entre 1 y 1000 caracteres.');
  }
  return text;
}

export async function readDirectives(memoryRoot) {
  return parseDirectives((await readNote(memoryRoot, DIRECTIVES_PATH)).content);
}

export async function updateDirectives(memoryRoot, input) {
  const previous = directiveQueues.get(memoryRoot) || Promise.resolve();
  const operation = previous.then(() => updateDirectivesUnlocked(memoryRoot, input));
  const queued = operation.catch(() => {});
  directiveQueues.set(memoryRoot, queued);
  try {
    return await operation;
  } finally {
    if (directiveQueues.get(memoryRoot) === queued) directiveQueues.delete(memoryRoot);
  }
}

async function updateDirectivesUnlocked(memoryRoot, input) {
  const action = input?.action;
  const note = await readNote(memoryRoot, DIRECTIVES_PATH);
  const lines = note.content.split(/\r?\n/);
  const directiveLines = [];
  lines.forEach((line, index) => { if (/^\s*- \[[ xX]\] .+$/.test(line)) directiveLines.push(index); });
  if (action === 'add') {
    const text = directiveText(input.text);
    while (lines.length && lines.at(-1) === '') lines.pop();
    lines.push('', `- [ ] ${text}`, '');
  } else {
    const match = /^directive-(\d+)$/.exec(String(input?.id || ''));
    const ordinal = match ? Number(match[1]) : -1;
    const lineIndex = directiveLines[ordinal];
    if (lineIndex === undefined) throw new AppError(404, 'DIRECTIVE_NOT_FOUND', 'La directiva no existe.');
    const current = /^\s*- \[([ xX])\] (.+)$/.exec(lines[lineIndex]);
    if (action === 'toggle') {
      const done = typeof input.done === 'boolean' ? input.done : current[1].toLowerCase() !== 'x';
      lines[lineIndex] = `- [${done ? 'x' : ' '}] ${current[2]}`;
    } else if (action === 'edit') {
      lines[lineIndex] = `- [${current[1].toLowerCase() === 'x' ? 'x' : ' '}] ${directiveText(input.text)}`;
    } else if (action === 'delete') {
      lines.splice(lineIndex, 1);
    } else {
      throw new AppError(400, 'INVALID_DIRECTIVE_ACTION', 'La acción de directiva no es válida.');
    }
  }
  await writeNote(memoryRoot, DIRECTIVES_PATH, `${lines.join('\n').replace(/\n+$/, '')}\n`);
  return readDirectives(memoryRoot);
}
