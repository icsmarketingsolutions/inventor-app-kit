import { execFile } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const EXEC_OPTIONS = {
  encoding: 'utf8',
  timeout: 5000,
  windowsHide: true,
  maxBuffer: 512 * 1024,
};

function cleanText(value, maxLength = 200) {
  return [...String(value || '')]
    .map((character) => {
      const code = character.codePointAt(0);
      return code <= 31 || code === 127 ? ' ' : character;
    })
    .join('')
    .trim()
    .slice(0, maxLength);
}

async function git(path, args) {
  try {
    const { stdout } = await execFileAsync('git', ['-C', path, ...args], EXEC_OPTIONS);
    return { ok: true, value: String(stdout).trim() };
  } catch {
    return { ok: false, value: '' };
  }
}

async function directoryAvailable(path) {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

export async function projectStatus(project) {
  const available = await directoryAvailable(project.path);
  const base = { id: project.id, name: project.name, available };
  if (!available) {
    return { ...base, git: { repository: false, branch: '', dirtyCount: 0, ahead: null, behind: null, lastCommit: null } };
  }
  const repository = await git(project.path, ['rev-parse', '--is-inside-work-tree']);
  if (!repository.ok || repository.value !== 'true') {
    return { ...base, git: { repository: false, branch: '', dirtyCount: 0, ahead: null, behind: null, lastCommit: null } };
  }
  const [branch, dirty, upstream, last] = await Promise.all([
    git(project.path, ['rev-parse', '--abbrev-ref', 'HEAD']),
    git(project.path, ['status', '--porcelain=v1', '--untracked-files=all']),
    git(project.path, ['rev-list', '--left-right', '--count', 'HEAD...@{upstream}']),
    git(project.path, ['log', '-1', '--format=%s%x00%cI']),
  ]);
  const [aheadRaw, behindRaw] = upstream.ok ? upstream.value.split(/\s+/) : [];
  const separator = last.value.indexOf('\0');
  const lastCommit = last.ok && last.value
    ? {
        subject: cleanText(separator >= 0 ? last.value.slice(0, separator) : last.value),
        authoredAt: cleanText(separator >= 0 ? last.value.slice(separator + 1) : '', 40),
      }
    : null;
  return {
    ...base,
    git: {
      repository: true,
      branch: cleanText(branch.value, 100),
      dirtyCount: dirty.ok && dirty.value ? dirty.value.split(/\r?\n/).filter(Boolean).length : 0,
      ahead: upstream.ok ? Number(aheadRaw) : null,
      behind: upstream.ok ? Number(behindRaw) : null,
      lastCommit,
    },
  };
}

export async function projectsStatus(projects) {
  return Promise.all(projects.map(projectStatus));
}
