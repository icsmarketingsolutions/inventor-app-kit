#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const MAX_GIT_OUTPUT = 128 * 1024 * 1024;
const FALLBACK_IGNORED_DIRS = new Set([
  '.git',
  '.venv',
  'coverage',
  'dist',
  'node_modules',
  'vendor',
]);
const SECRET_DETECTORS = [
  {
    id: 'secret.private-key',
    regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
  },
  {
    id: 'secret.jwt',
    regex: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
  },
  {
    id: 'secret.known-token',
    regex:
      /\b(?:sk-ant-[A-Za-z0-9_-]{20,}|sk-proj-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sbp_[A-Za-z0-9]{20,}|sb_secret_[A-Za-z0-9_-]{20,}|glpat-[A-Za-z0-9_-]{20,}|npm_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{20,}|AIza[0-9A-Za-z_-]{30,}|(?:AKIA|ASIA)[0-9A-Z]{16}|(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,})\b/g,
  },
  {
    id: 'secret.bearer',
    regex: /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}/gi,
  },
  {
    id: 'secret.credential-url',
    regex: /\b(?:https?|postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^/\s:@]+:[^@\s/]+@/gi,
  },
];

const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,63}\b/gi;
const SUPABASE_HOST_RE = /\b(?:https?:\/\/|db\.)([a-z0-9]{15,32})\.supabase\.co\b/gi;
const SUPABASE_DASHBOARD_RE =
  /\bhttps?:\/\/supabase\.com\/dashboard\/project\/([a-z0-9]{15,32})\b/gi;
const SUPABASE_MANAGEMENT_RE =
  /\bhttps?:\/\/api\.supabase\.com\/v1\/projects\/([a-z0-9]{15,32})\b/gi;
const SUPABASE_POOLER_USER_RE = /\bpostgres\.([a-z0-9]{15,32})\b/gi;
const SUPABASE_POOLER_HOST_RE = /\bpooler\.supabase\.com\b/gi;
const SUPABASE_PROJECT_REF_QUERY_RE = /(?:[?&]|\b)project_ref=([a-z0-9]{15,32})(?:&|\b)/gi;
const SUPABASE_ENCODED_PROJECT_REF_QUERY_RE =
  /(?:[?&]|\b)project(?:_|%5f)ref(?:=|%3d)([a-z0-9]{15,32})(?:&|\b)/gi;
const SUPABASE_PUBLISHABLE_KEY_RE = /\bsb_publishable_[A-Za-z0-9_-]{20,}\b/g;
const WINDOWS_USER_PATH_RE =
  /\b[A-Za-z]:[\\/](?:Users|Documents and Settings)[\\/]([^\\/\r\n"'`]+)/gi;
const POSIX_USER_PATH_RE = /(?:file:\/\/|^|[\s"'`])\/(?:Users|home)\/([^/\s"'`]+)/gi;
const WSL_USER_PATH_RE = /(?:^|[\s"'`])\/mnt\/[a-z]\/Users\/([^/\s"'`]+)/gi;
const ASSIGNMENT_RE =
  /^\s*(?:export\s+)?["']?([A-Za-z_][A-Za-z0-9_.-]*)["']?\s*[:=]\s*(.*?)\s*,?\s*$/;
const SENSITIVE_KEY_RE =
  /(?:api[_-]?key|token|secret|password|passwd|pwd|credential|authorization|private[_-]?key|service[_-]?role|database[_-]?url|client[_-]?secret|dsn)/i;
const SUPABASE_REF_KEY_RE = /^(?:supabase[_-]?)?(?:project[_-]?)?ref$/i;
const SUPABASE_REF_VALUE_RE = /^[a-z0-9]{15,32}$/;

class PrivacyGateError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

function normalizePrivateText(value) {
  return String(value)
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('en')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function containsNormalizedTerm(value, normalizedTerm) {
  const normalizedValue = normalizePrivateText(value);
  return ` ${normalizedValue} `.includes(` ${normalizedTerm} `);
}

function readDenylist(denylistPath) {
  if (!denylistPath) return [];

  let text;
  try {
    text = readFileSync(resolve(denylistPath), 'utf8');
  } catch {
    throw new PrivacyGateError('denylist-unreadable');
  }

  const seen = new Set();
  const terms = [];
  for (const rawLine of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const normalized = normalizePrivateText(trimmed);
    if (normalized.length < 3 || seen.has(normalized)) continue;
    seen.add(normalized);
    terms.push({
      id: `privacy-term-${String(terms.length + 1).padStart(3, '0')}`,
      normalized,
    });
  }
  return terms;
}

function regexMatches(regex, value) {
  regex.lastIndex = 0;
  return regex.test(value);
}

function allRegexMatches(regex, value) {
  regex.lastIndex = 0;
  return [...value.matchAll(regex)];
}

function isAllowedEmail(email) {
  const lower = email.toLocaleLowerCase('en');
  if (
    lower === 'git@github.com' ||
    lower === 'noreply@github.com' ||
    lower === 'support@github.com'
  ) return true;
  const domain = lower.slice(lower.lastIndexOf('@') + 1);
  return (
    domain === 'example.com' ||
    domain === 'example.org' ||
    domain === 'example.net' ||
    domain === 'users.noreply.github.com'
  );
}

function isPlaceholderSegment(segment) {
  const value = segment.trim();
  return (
    /^<[^>]+>$/.test(value) ||
    /^\$\{[^}]+\}$/.test(value) ||
    /^\$(?:USER|USERNAME|HOME)$/i.test(value) ||
    /^%(?:USER|USERNAME|USERPROFILE|HOME)%$/i.test(value) ||
    /^(?:your|example|sample)[_-]/i.test(value)
  );
}

function stripInlineComment(value) {
  let quote = null;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if ((character === '"' || character === "'") && value[index - 1] !== '\\') {
      quote = quote === character ? null : quote ?? character;
      continue;
    }
    if (character === '#' && quote === null && (index === 0 || /\s/.test(value[index - 1]))) {
      return value.slice(0, index).trim();
    }
  }
  return value.trim();
}

function stripOuterQuotes(value) {
  const trimmed = stripInlineComment(value).replace(/,$/, '').trim();
  if (trimmed.length >= 2) {
    const first = trimmed[0];
    const last = trimmed.at(-1);
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return trimmed.slice(1, -1).trim();
    }
  }
  return trimmed;
}

function isPlaceholderValue(rawValue) {
  const value = stripOuterQuotes(rawValue);
  if (!value) return true;
  if (/^(?:null|none|false|true)$/i.test(value)) return true;
  if (/^<[^>]+>$/.test(value)) return true;
  if (/^\$\{[A-Z0-9_:-]+\}$/i.test(value)) return true;
  if (/^%[A-Z0-9_]+%$/i.test(value)) return true;
  if (/^env\([A-Z0-9_]+\)$/i.test(value)) return true;
  if (/^(?:your|replace|change)[_-]?.*$/i.test(value)) return true;
  if (/^example(?:[_-].*)?$/i.test(value)) return true;
  if (/^https?:\/\/(?:example\.(?:com|org|net)|localhost)(?:[/:].*)?$/i.test(value)) {
    return true;
  }
  if (
    /^https:\/\/(?:your[-_]?project[-_]?ref|<[^>]+>|\$\{[^}]+\})\.supabase\.co$/i.test(
      value,
    )
  ) {
    return true;
  }
  return false;
}

function prohibitedFileRule(filePath) {
  const normalized = filePath.replaceAll('\\', '/');
  const name = basename(normalized).toLocaleLowerCase('en');
  if (/^(?:.*\/)?\.vscode\/[^/]*\.local\.json$/i.test(normalized)) return 'file.local-config';
  if (/^(?:.*\/)?\.obsidian\/workspace[^/]*$/i.test(normalized)) return 'file.local-config';
  if (name === '.env' || name.startsWith('.env.')) {
    const templateSuffixes = ['.example', '.sample', '.template', '.dist'];
    if (templateSuffixes.some((suffix) => name.endsWith(suffix))) {
      return null;
    }
    return 'file.env';
  }
  if (/^(?:id_(?:rsa|dsa|ecdsa|ed25519)|\.mcp\.json)$/i.test(name)) {
    return 'file.credentials';
  }
  if (/\.(?:pem|key|p12|pfx|kdbx)$/i.test(name)) return 'file.credentials';
  if (/^(?:credentials|service[-_]?account)[^/]*\.json$/i.test(name)) {
    return 'file.credentials';
  }
  return null;
}

function pathContainsSensitiveData(filePath, denyTerms) {
  if (denyTerms.some((term) => containsNormalizedTerm(filePath, term.normalized))) return true;
  if (SECRET_DETECTORS.some((detector) => regexMatches(detector.regex, filePath))) return true;
  if (allRegexMatches(EMAIL_RE, filePath).some((match) => !isAllowedEmail(match[0]))) return true;
  if (regexMatches(SUPABASE_HOST_RE, filePath)) return true;
  if (regexMatches(SUPABASE_DASHBOARD_RE, filePath)) return true;
  if (regexMatches(SUPABASE_MANAGEMENT_RE, filePath)) return true;
  if (regexMatches(SUPABASE_POOLER_HOST_RE, filePath) && regexMatches(SUPABASE_POOLER_USER_RE, filePath)) return true;
  if (regexMatches(SUPABASE_PROJECT_REF_QUERY_RE, filePath)) return true;
  if (regexMatches(SUPABASE_ENCODED_PROJECT_REF_QUERY_RE, filePath)) return true;
  if (regexMatches(SUPABASE_PUBLISHABLE_KEY_RE, filePath)) return true;
  if (regexMatches(WINDOWS_USER_PATH_RE, filePath)) return true;
  if (regexMatches(POSIX_USER_PATH_RE, filePath)) return true;
  if (regexMatches(WSL_USER_PATH_RE, filePath)) return true;
  return false;
}

function safeReportedPath(filePath, denyTerms) {
  if (!filePath || filePath.startsWith('<')) return filePath || '<desconocido>';
  const normalized = filePath.replaceAll('\\', '/');
  return pathContainsSensitiveData(normalized, denyTerms) ? '<ruta-redactada>' : normalized;
}

function safeReportedKey(key, denyTerms) {
  if (!key) return undefined;
  if (pathContainsSensitiveData(key, denyTerms)) return '<clave-redactada>';
  return key;
}

function addFinding(state, finding) {
  const reported = {
    rule: finding.rule,
    severity: 'block',
    scope: finding.scope,
    path: safeReportedPath(finding.path, state.denyTerms),
  };
  if (Number.isInteger(finding.line) && finding.line > 0) reported.line = finding.line;
  const safeKey = safeReportedKey(finding.key, state.denyTerms);
  if (safeKey) reported.key = safeKey;

  const identity = [
    reported.rule,
    reported.scope,
    reported.path,
    reported.line ?? '',
    reported.key ?? '',
  ].join('|');
  if (state.findingIds.has(identity)) return;
  state.findingIds.add(identity);
  state.findings.push(reported);
}

function scanEmails(line, location, state) {
  for (const match of allRegexMatches(EMAIL_RE, line)) {
    if (!isAllowedEmail(match[0])) {
      addFinding(state, { ...location, rule: 'privacy.email' });
      return;
    }
  }
}

function scanPersonalPaths(line, location, state) {
  const detectors = [WINDOWS_USER_PATH_RE, POSIX_USER_PATH_RE, WSL_USER_PATH_RE];
  for (const detector of detectors) {
    for (const match of allRegexMatches(detector, line)) {
      if (!isPlaceholderSegment(match[1])) {
        addFinding(state, { ...location, rule: 'privacy.absolute-user-path' });
        return;
      }
    }
  }
}

function scanSupabase(line, location, state) {
  if (regexMatches(SUPABASE_HOST_RE, line)) {
    addFinding(state, { ...location, rule: 'privacy.supabase-project' });
  }
  if (regexMatches(SUPABASE_DASHBOARD_RE, line)) {
    addFinding(state, { ...location, rule: 'privacy.supabase-project' });
  }
  if (regexMatches(SUPABASE_MANAGEMENT_RE, line)) {
    addFinding(state, { ...location, rule: 'privacy.supabase-project' });
  }
  if (regexMatches(SUPABASE_POOLER_HOST_RE, line) && regexMatches(SUPABASE_POOLER_USER_RE, line)) {
    addFinding(state, { ...location, rule: 'privacy.supabase-project' });
  }
  if (regexMatches(SUPABASE_PROJECT_REF_QUERY_RE, line)) {
    addFinding(state, { ...location, rule: 'privacy.supabase-project' });
  }
  if (regexMatches(SUPABASE_ENCODED_PROJECT_REF_QUERY_RE, line)) {
    addFinding(state, { ...location, rule: 'privacy.supabase-project' });
  }
  if (regexMatches(SUPABASE_PUBLISHABLE_KEY_RE, line)) {
    addFinding(state, { ...location, rule: 'privacy.supabase-project' });
  }

  const assignment = line.match(ASSIGNMENT_RE);
  if (!assignment) return;
  const [, key, rawValue] = assignment;
  const value = stripOuterQuotes(rawValue);
  if (SUPABASE_REF_KEY_RE.test(key) && SUPABASE_REF_VALUE_RE.test(value)) {
    addFinding(state, { ...location, rule: 'privacy.supabase-project', key });
  }
}

function scanSensitiveAssignment(line, location, state) {
  const assignment = line.match(ASSIGNMENT_RE);
  if (!assignment) return;
  const [, key, rawValue] = assignment;
  if (/(?:url|uri)_path$/i.test(key)) return;
  if (!SENSITIVE_KEY_RE.test(key) || isPlaceholderValue(rawValue)) return;
  const value = stripOuterQuotes(rawValue);
  if (value.length >= 8) {
    addFinding(state, { ...location, rule: 'secret.sensitive-assignment', key });
  }
}

function scanDenylist(line, location, state) {
  for (const term of state.denyTerms) {
    if (containsNormalizedTerm(line, term.normalized)) {
      addFinding(state, { ...location, rule: term.id });
    }
  }
}

function scanText(text, location, state) {
  const lines = String(text).split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const lineLocation = { ...location, line: location.line ?? index + 1 };
    for (const detector of SECRET_DETECTORS) {
      if (regexMatches(detector.regex, line)) {
        addFinding(state, { ...lineLocation, rule: detector.id });
      }
    }
    scanEmails(line, lineLocation, state);
    scanPersonalPaths(line, lineLocation, state);
    scanSupabase(line, lineLocation, state);
    scanSensitiveAssignment(line, lineLocation, state);
    scanDenylist(line, lineLocation, state);
  }
}

function isProbablyText(buffer) {
  const sample = buffer.subarray(0, Math.min(buffer.length, 8192));
  return !sample.includes(0);
}

function decodeTextBuffer(buffer) {
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return buffer.subarray(2).toString('utf16le');
  }
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    const body = Buffer.from(buffer.subarray(2));
    for (let index = 0; index + 1 < body.length; index += 2) {
      [body[index], body[index + 1]] = [body[index + 1], body[index]];
    }
    return body.toString('utf16le');
  }
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return buffer.subarray(3).toString('utf8');
  }
  return isProbablyText(buffer) ? buffer.toString('utf8') : null;
}

function scanBuffer(buffer, location, state) {
  const text = decodeTextBuffer(buffer);
  if (text !== null) {
    scanText(text, location, state);
    return;
  }
  addFinding(state, { ...location, rule: 'file.unscannable-binary' });
}

function runGit(root, args, { allowFailure = false, encoding = 'utf8' } = {}) {
  const result = spawnSync('git', ['-C', root, ...args], {
    encoding,
    env: { ...process.env, GIT_NO_REPLACE_OBJECTS: '1' },
    maxBuffer: MAX_GIT_OUTPUT,
    windowsHide: true,
  });
  if (result.error || result.status !== 0) {
    if (allowFailure) return null;
    throw new PrivacyGateError('git-command-failed');
  }
  return result.stdout;
}

function hasOwnGitRepository(root) {
  if (!existsSync(join(root, '.git'))) return false;
  const result = runGit(root, ['rev-parse', '--is-inside-work-tree']);
  if (result.trim() !== 'true') throw new PrivacyGateError('git-worktree-invalid');
  return true;
}

function walkFiles(root, current = root, output = []) {
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    if (entry.isDirectory() && FALLBACK_IGNORED_DIRS.has(entry.name)) continue;
    const absolutePath = join(current, entry.name);
    if (entry.isDirectory()) {
      walkFiles(root, absolutePath, output);
    } else if (entry.isFile()) {
      output.push(relative(root, absolutePath).replaceAll('\\', '/'));
    }
  }
  return output;
}

function listWorktreeFiles(root, gitAvailable) {
  if (!gitAvailable) return walkFiles(root).sort();
  const output = runGit(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
    encoding: 'buffer',
  });
  return output
    .toString('utf8')
    .split('\0')
    .filter(Boolean)
    .sort();
}

function listIndexEntries(root) {
  const output = runGit(root, ['ls-files', '-s', '-z'], { encoding: 'buffer' });
  return output.toString('utf8').split('\0').filter(Boolean).map((record) => {
    const tabIndex = record.indexOf('\t');
    const metadata = record.slice(0, tabIndex).split(' ');
    if (
      tabIndex < 0 || metadata.length < 3 || metadata[2] !== '0' || /^0+$/.test(metadata[1])
    ) return null;
    return { objectId: metadata[1], path: record.slice(tabIndex + 1) };
  }).filter(Boolean);
}

function scanFilePath(filePath, scope, state) {
  const prohibitedRule = prohibitedFileRule(filePath);
  if (prohibitedRule) {
    addFinding(state, { rule: prohibitedRule, scope, path: filePath });
  }
  scanText(filePath, { scope, path: filePath, line: 1 }, state);
}

function scanCheckout(root, gitAvailable, state) {
  const files = listWorktreeFiles(root, gitAvailable);
  const indexEntries = gitAvailable ? listIndexEntries(root) : [];
  state.stats.checkoutFiles = new Set([
    ...files,
    ...indexEntries.map((entry) => entry.path),
  ]).size;

  for (const entry of indexEntries) {
    scanFilePath(entry.path, 'git-index', state);
    const blob = runGit(root, ['cat-file', 'blob', entry.objectId], { encoding: 'buffer' });
    scanBuffer(blob, { scope: 'git-index', path: entry.path }, state);
  }

  for (const filePath of files) {
    scanFilePath(filePath, 'checkout', state);
    const absolutePath = resolve(root, filePath);
    if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) continue;
    scanBuffer(readFileSync(absolutePath), { scope: 'checkout', path: filePath }, state);
  }
}

function parseTreeRecord(record) {
  const tabIndex = record.indexOf('\t');
  if (tabIndex < 0) return null;
  const metadata = record.slice(0, tabIndex).split(' ');
  if (metadata.length < 3 || metadata[1] !== 'blob') return null;
  return { objectId: metadata[2], path: record.slice(tabIndex + 1) };
}

function scanGitMetadata(root, commits, state) {
  for (const commit of commits) {
    const raw = runGit(
      root,
      ['show', '-s', '--format=%an%x00%ae%x00%cn%x00%ce%x00%B', commit],
      { encoding: 'buffer' },
    );
    const [authorName = '', authorEmail = '', committerName = '', committerEmail = '', ...message] = raw
      .toString('utf8')
      .split('\0');
    for (const value of [authorName, authorEmail, committerName, committerEmail, message.join('\0')]) {
      scanText(value, { scope: 'git-metadata', path: '<git-metadata>' }, state);
    }
  }

  const remotes = runGit(root, ['remote', '-v'], { allowFailure: true });
  if (remotes) scanText(remotes, { scope: 'git-metadata', path: '<git-remotes>' }, state);
  const refs = runGit(root, ['for-each-ref', '--format=%(refname)'], { allowFailure: true });
  if (refs) scanText(refs, { scope: 'git-metadata', path: '<git-refs>' }, state);

  const tagRecords = runGit(
    root,
    ['for-each-ref', '--format=%(objecttype)%00%(objectname)%00%(*objecttype)%00%(*objectname)', 'refs/tags'],
    { allowFailure: true, encoding: 'buffer' },
  );
  if (tagRecords) {
    for (const record of tagRecords.toString('utf8').split(/\r?\n/).filter(Boolean)) {
      const [objectType, objectId, peeledType, peeledId] = record.split('\0');
      if (!objectId) continue;
      if (objectType === 'tag') {
        const tag = runGit(root, ['cat-file', 'tag', objectId], { encoding: 'buffer' });
        scanBuffer(tag, { scope: 'git-metadata', path: '<git-tag>' }, state);
      }
      const targetType = objectType === 'tag' ? peeledType : objectType;
      const targetId = objectType === 'tag' ? peeledId : objectId;
      if (targetType !== 'commit' || !targetId) {
        addFinding(state, {
          rule: 'git.noncommit-tag',
          scope: 'git-metadata',
          path: '<git-tag>',
        });
      }
    }
  }

  const noteRefs = runGit(root, ['for-each-ref', '--format=%(refname)', 'refs/notes'], {
    allowFailure: true,
  });
  for (const noteRef of noteRefs?.split(/\r?\n/).filter(Boolean) ?? []) {
    const notes = runGit(root, ['notes', `--ref=${noteRef}`, 'list'], { allowFailure: true });
    for (const record of notes?.split(/\r?\n/).filter(Boolean) ?? []) {
      const [objectId] = record.split(' ');
      if (!objectId) continue;
      const note = runGit(root, ['cat-file', 'blob', objectId], { encoding: 'buffer' });
      scanBuffer(note, { scope: 'git-metadata', path: '<git-note>' }, state);
    }
  }
}

function scanGitHistory(root, state) {
  const commitOutput = runGit(root, ['rev-list', '--all']);
  const commits = commitOutput ? commitOutput.split(/\r?\n/).filter(Boolean) : [];
  state.stats.commits = commits.length;
  scanGitMetadata(root, commits, state);
  if (commits.length === 0) return;

  const blobs = new Map();
  for (const commit of commits) {
    const tree = runGit(root, ['ls-tree', '-r', '-z', commit], { encoding: 'buffer' });
    for (const rawRecord of tree.toString('utf8').split('\0')) {
      if (!rawRecord) continue;
      const record = parseTreeRecord(rawRecord);
      if (!record) continue;
      scanFilePath(record.path, 'git-history', state);
      if (!blobs.has(record.objectId)) blobs.set(record.objectId, record.path);
    }
  }

  state.stats.historyBlobs = blobs.size;
  for (const [objectId, filePath] of blobs) {
    const blob = runGit(root, ['cat-file', 'blob', objectId], { encoding: 'buffer' });
    scanBuffer(blob, { scope: 'git-history', path: filePath }, state);
  }
}

function createState(denyTerms) {
  return {
    denyTerms,
    findingIds: new Set(),
    findings: [],
    stats: {
      checkoutFiles: 0,
      commits: 0,
      historyBlobs: 0,
    },
  };
}

export function scanRepository(root, { denylistPath } = {}) {
  const resolvedRoot = resolve(root);
  const denyTerms = readDenylist(denylistPath);
  const state = createState(denyTerms);
  const gitAvailable = hasOwnGitRepository(resolvedRoot);
  scanCheckout(resolvedRoot, gitAvailable, state);
  if (gitAvailable) scanGitHistory(resolvedRoot, state);
  return {
    findings: state.findings,
    stats: state.stats,
  };
}

export function formatFinding(finding) {
  const location = finding.line ? `${finding.path}:${finding.line}` : finding.path;
  const key = finding.key ? ` clave=${finding.key}` : '';
  return `BLOQUEO ${finding.rule} alcance=${finding.scope} ubicación=${location}${key}`;
}

export function renderReport(result) {
  if (result.findings.length === 0) {
    return `Privacy gate: OK (${result.stats.checkoutFiles} archivos, ${result.stats.commits} commits, ${result.stats.historyBlobs} blobs históricos).`;
  }
  const lines = result.findings.map(formatFinding);
  lines.push(`Privacy gate: BLOQUEADO (${result.findings.length} hallazgos; valores redactados).`);
  return lines.join('\n');
}

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--denylist') {
      const denylistPath = argv[index + 1];
      if (!denylistPath) throw new PrivacyGateError('denylist-argument-missing');
      options.denylistPath = denylistPath;
      index += 1;
      continue;
    }
    throw new PrivacyGateError('unknown-argument');
  }
  return options;
}

export function main(argv = process.argv.slice(2), root = process.cwd()) {
  try {
    const options = parseArguments(argv);
    const result = scanRepository(root, options);
    console.log(renderReport(result));
    return result.findings.length === 0 ? 0 : 1;
  } catch (error) {
    const code = error instanceof PrivacyGateError ? error.code : 'unexpected-failure';
    console.error(`Privacy gate: ERROR (${code}).`);
    return 2;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  process.exitCode = main();
}
