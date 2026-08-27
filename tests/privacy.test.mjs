import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

import { renderReport, scanRepository } from '../scripts/check-privacy.mjs';

function withTempDirectory(callback) {
  const root = mkdtempSync(join(tmpdir(), 'inventor-privacy-'));
  try {
    return callback(root);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
}

function writeFixture(root, relativePath, content) {
  const filePath = join(root, relativePath);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, 'utf8');
}

function findingRules(result) {
  return new Set(result.findings.map((finding) => finding.rule));
}

function git(root, ...args) {
  return execFileSync('git', ['-C', root, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
}

function initializeRepository(root, email = 'builder@users.noreply.github.com') {
  git(root, 'init');
  git(root, 'config', 'user.name', 'Generic Builder');
  git(root, 'config', 'user.email', email);
}

test('acepta placeholders en plantillas y correos reservados para ejemplos', () => {
  withTempDirectory((root) => {
    writeFixture(
      root,
      '.env.example',
      [
        ['ANTHROPIC', '_API_KEY=', '${ANTHROPIC_API_KEY}'].join(''),
        ['SUPABASE', '_URL=', 'https://your-project-ref.supabase.co'].join(''),
        ['OWNER', '_EMAIL=', 'builder@example.com'].join(''),
        ['OPTIONAL', '_TOKEN=', '  # opcional'].join(''),
        ['OPENAI', '_API_KEY=', 'env(OPENAI_API_KEY)'].join(''),
      ].join('\n'),
    );
    writeFixture(
      root,
      'notes.txt',
      [
        'C:\\Users\\<usuario>\\Projects',
        '/home/<usuario>/Projects',
        'noreply@github.com',
        'support@github.com',
      ].join('\n'),
    );

    const result = scanRepository(root);
    assert.deepEqual(result.findings, []);
  });
});

test('detecta secretos, datos personales, rutas y proyectos Supabase sin devolver valores', () => {
  withTempDirectory((root) => {
    const knownToken = ['sk', '-ant-', 'A'.repeat(24)].join('');
    const jwt = ['eyJ', 'a'.repeat(12), '.', 'b'.repeat(12), '.', 'c'.repeat(12)].join('');
    const privateKeyHeader = ['-----BEGIN ', 'PRIVATE KEY-----'].join('');
    const privateEmail = ['owner', '@', 'private-company.dev'].join('');
    const windowsPath = ['C:', '\\', 'Users', '\\', 'Real Person', '\\', 'Projects'].join('');
    const posixPath = ['/', 'home', '/', 'real-person', '/', 'Projects'].join('');
    const projectRef = 'abcdefghijklmnopqrst';
    const projectUrl = ['https://', projectRef, '.supabase.co'].join('');
    const opaqueAssignment = ['API', '_KEY=', 'opaque-value-that-is-private'].join('');
    const secretKey = ['sb', '_secret_', 'S'.repeat(24)].join('');
    const publishableKey = ['sb', '_publishable_', 'P'.repeat(24)].join('');
    const mcpUrl = `https://mcp.supabase.com/mcp?project_ref=${projectRef}&read_only=true`;
    const encodedMcpUrl = `https://mcp.supabase.com/mcp?${['project', '%5F', 'ref='].join('')}${projectRef}`;
    const managementUrl = `https://api.supabase.com/v1/projects/${projectRef}`;
    const pooler = `user=postgres.${projectRef} host=aws-0-region.pooler.supabase.com`;
    const fileUri = ['file://', '/', 'home', '/', 'real-uri-user', '/', 'Projects'].join('');

    writeFixture(
      root,
      'unsafe.txt',
      [
        knownToken,
        jwt,
        privateKeyHeader,
        privateEmail,
        windowsPath,
        posixPath,
        projectUrl,
        `supabase_ref: ${projectRef}`,
        opaqueAssignment,
        secretKey,
        publishableKey,
        mcpUrl,
        encodedMcpUrl,
        managementUrl,
        pooler,
        fileUri,
      ].join('\n'),
    );

    const result = scanRepository(root);
    const rules = findingRules(result);
    assert.ok(rules.has('secret.known-token'));
    assert.ok(rules.has('secret.jwt'));
    assert.ok(rules.has('secret.private-key'));
    assert.ok(rules.has('secret.sensitive-assignment'));
    assert.ok(rules.has('privacy.email'));
    assert.ok(rules.has('privacy.absolute-user-path'));
    assert.ok(rules.has('privacy.supabase-project'));

    const report = renderReport(result);
    for (const sensitiveValue of [knownToken, jwt, privateEmail, windowsPath, projectUrl, secretKey]) {
      assert.equal(report.includes(sensitiveValue), false);
    }
  });
});

test('analiza el blob staged aunque el worktree ya se haya limpiado', () => {
  withTempDirectory((root) => {
    initializeRepository(root);
    const stagedToken = ['gh', 'p_', 'C'.repeat(24)].join('');
    writeFixture(root, 'staged.txt', stagedToken);
    git(root, 'add', 'staged.txt');
    writeFixture(root, 'staged.txt', 'contenido ya sanitizado');

    const result = scanRepository(root);
    assert.ok(result.findings.some(
      (finding) => finding.scope === 'git-index' && finding.rule === 'secret.known-token',
    ));
    assert.equal(renderReport(result).includes(stagedToken), false);
  });
});

test('ignora la identidad local hasta que forme parte de un commit publicable', () => {
  withTempDirectory((root) => {
    const privateEmail = ['future-author', '@', 'private-company.dev'].join('');
    initializeRepository(root, privateEmail);

    const beforeCommit = scanRepository(root);
    assert.equal(beforeCommit.findings.some(
      (finding) => finding.scope === 'git-metadata' && finding.rule === 'privacy.email',
    ), false);
    assert.equal(beforeCommit.stats.commits, 0);

    writeFixture(root, 'README.md', '# Proyecto público\n');
    git(root, 'add', 'README.md');
    git(root, 'commit', '-m', 'chore: iniciar proyecto');

    const afterCommit = scanRepository(root);
    assert.ok(afterCommit.findings.some(
      (finding) => finding.scope === 'git-metadata' && finding.rule === 'privacy.email',
    ));
    assert.equal(afterCommit.stats.commits, 1);
  });
});

test('bloquea si existe .git pero Git no puede inspeccionar el historial', () => {
  withTempDirectory((root) => {
    writeFixture(root, '.git', 'gitdir: repositorio-inexistente\n');
    writeFixture(root, 'README.md', '# Checkout visible\n');

    assert.throws(() => scanRepository(root), /git-command-failed/);
  });
});

test('decodifica UTF-16 y bloquea binarios desconocidos', () => {
  withTempDirectory((root) => {
    const token = ['npm_', 'D'.repeat(24)].join('');
    writeFileSync(join(root, 'utf16.txt'), Buffer.concat([
      Buffer.from([0xff, 0xfe]),
      Buffer.from(token, 'utf16le'),
    ]));
    writeFileSync(join(root, 'payload.bin'), Buffer.from([0, 1, 2, 3]));
    writeFileSync(join(root, 'image.png'), Buffer.concat([
      Buffer.from([0]),
      Buffer.from(['gh', 'p_', 'F'.repeat(24)].join('')),
    ]));

    const rules = findingRules(scanRepository(root));
    assert.ok(rules.has('secret.known-token'));
    assert.ok(rules.has('file.unscannable-binary'));
  });
});

test('ignora git replace y analiza el objeto físico que se empujaría', () => {
  withTempDirectory((root) => {
    initializeRepository(root);
    const hiddenToken = ['github_pat_', 'G'.repeat(24)].join('');
    writeFixture(root, 'history.txt', hiddenToken);
    git(root, 'add', 'history.txt');
    git(root, 'commit', '-m', 'add historical fixture');
    const originalCommit = git(root, 'rev-parse', 'HEAD').trim();
    writeFixture(root, 'history.txt', 'sanitizado');
    git(root, 'add', 'history.txt');
    git(root, 'commit', '-m', 'sanitize fixture');
    const cleanTree = git(root, 'rev-parse', 'HEAD^{tree}').trim();
    const replacementCommit = git(root, 'commit-tree', cleanTree, '-m', 'replacement').trim();
    git(root, 'replace', originalCommit, replacementCommit);

    const result = scanRepository(root);
    assert.ok(result.findings.some(
      (finding) => finding.scope === 'git-history' && finding.rule === 'secret.known-token',
    ));
    assert.equal(renderReport(result).includes(hiddenToken), false);
  });
});

test('bloquea archivos de credenciales pero permite variantes de plantilla', () => {
  withTempDirectory((root) => {
    writeFixture(root, '.env', '');
    writeFixture(root, 'service-account-production.json', '{}');
    writeFixture(root, '.vscode/settings.local.json', '{}');
    writeFixture(root, '.obsidian/workspace.json', '{}');
    writeFixture(root, '.env.local.example', 'TOKEN=${TOKEN}');
    writeFixture(root, `.env.${'..'.repeat(100)}.sample`, 'TOKEN=${TOKEN}');

    const result = scanRepository(root);
    const fileFindings = result.findings.filter((finding) => finding.rule.startsWith('file.'));
    assert.equal(fileFindings.length, 4);
    assert.ok(fileFindings.some((finding) => finding.rule === 'file.env'));
    assert.ok(fileFindings.some((finding) => finding.rule === 'file.credentials'));
    assert.equal(fileFindings.filter((finding) => finding.rule === 'file.local-config').length, 2);
    assert.equal(
      fileFindings.some((finding) => finding.path.endsWith('.env.local.example')),
      false,
    );
    assert.equal(
      fileFindings.some((finding) => finding.path.endsWith('.sample')),
      false,
    );
  });
});

test('normaliza una denylist externa y redacta rutas que contienen el término', () => {
  withTempDirectory((root) => {
    const privateTerm = [84, 237, 99, 111, 32, 79, 110, 108, 105, 110, 101]
      .map((code) => String.fromCharCode(code))
      .join('');
    const variant = [84, 73, 67, 79, 95, 111, 110, 108, 105, 110, 101]
      .map((code) => String.fromCharCode(code))
      .join('');
    const denylistPath = join(tmpdir(), `privacy-denylist-${process.pid}-${Date.now()}.txt`);
    writeFileSync(denylistPath, privateTerm, 'utf8');
    try {
      writeFixture(root, 'notes.txt', `Marca anterior: ${variant}`);
      writeFixture(root, `${variant}.txt`, 'contenido neutro');

      const result = scanRepository(root, { denylistPath });
      assert.ok(result.findings.some((finding) => finding.rule === 'privacy-term-001'));
      assert.ok(result.findings.some((finding) => finding.path === '<ruta-redactada>'));
      assert.equal(renderReport(result).includes(privateTerm), false);
      assert.equal(renderReport(result).includes(variant), false);
    } finally {
      rmSync(denylistPath, { force: true });
    }
  });
});

test('encuentra secretos y archivos prohibidos borrados del checkout pero presentes en Git', () => {
  withTempDirectory((root) => {
    initializeRepository(root);
    const historicalToken = ['gh', 'p_', 'B'.repeat(24)].join('');
    writeFixture(root, 'old-secret.txt', historicalToken);
    writeFixture(root, '.env', 'TOKEN=${TOKEN}');
    git(root, 'add', '--force', 'old-secret.txt', '.env');
    git(root, 'commit', '-m', 'initial sanitized fixture');
    rmSync(join(root, 'old-secret.txt'));
    rmSync(join(root, '.env'));
    git(root, 'add', '--all');
    git(root, 'commit', '-m', 'remove fixtures');

    const result = scanRepository(root);
    assert.ok(
      result.findings.some(
        (finding) =>
          finding.scope === 'git-history' && finding.rule === 'secret.known-token',
      ),
    );
    assert.ok(
      result.findings.some(
        (finding) => finding.scope === 'git-history' && finding.rule === 'file.env',
      ),
    );
    assert.equal(renderReport(result).includes(historicalToken), false);
  });
});

test('revisa los correos de autor y committer en los metadatos Git', () => {
  withTempDirectory((root) => {
    const privateEmail = ['builder', '@', 'private-company.dev'].join('');
    initializeRepository(root, privateEmail);
    git(root, 'commit', '--allow-empty', '-m', 'initial commit');

    const result = scanRepository(root);
    assert.ok(
      result.findings.some(
        (finding) => finding.scope === 'git-metadata' && finding.rule === 'privacy.email',
      ),
    );
    assert.equal(renderReport(result).includes(privateEmail), false);
  });
});

test('revisa mensajes de tags anotados', () => {
  withTempDirectory((root) => {
    initializeRepository(root);
    git(root, 'commit', '--allow-empty', '-m', 'initial commit');
    const tagToken = ['glpat-', 'E'.repeat(24)].join('');
    git(root, 'tag', '-a', 'v0.1.0', '-m', tagToken);

    const result = scanRepository(root);
    assert.ok(result.findings.some(
      (finding) => finding.scope === 'git-metadata' && finding.rule === 'secret.known-token',
    ));
    assert.equal(renderReport(result).includes(tagToken), false);
  });
});

test('bloquea tags que apuntan a objetos que no son commits', () => {
  withTempDirectory((root) => {
    initializeRepository(root);
    const blobToken = ['gh', 'o_', 'H'.repeat(24)].join('');
    writeFixture(root, 'tag-blob.txt', blobToken);
    const blobId = git(root, 'hash-object', '-w', 'tag-blob.txt').trim();
    rmSync(join(root, 'tag-blob.txt'));
    git(root, 'tag', '-a', 'blob-directo', blobId, '-m', 'tag de prueba');

    const result = scanRepository(root);
    assert.ok(result.findings.some((finding) => finding.rule === 'git.noncommit-tag'));
    assert.equal(renderReport(result).includes(blobToken), false);
  });
});
