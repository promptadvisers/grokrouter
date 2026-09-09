import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifyRelease } from '../scripts/verify-release.mjs';
import { validateAcceptance } from '../scripts/verify-acceptance.mjs';

test('release validation rejects disagreeing package and lockfile versions', async () => {
  const root = await mkdtemp(join(tmpdir(), 'grokrouter-release-'));
  try {
    const files = ['package.json', 'runtime/package.json', 'installer-windows/package.json', 'runtime/package-lock.json', 'installer-windows/package-lock.json', 'runtime/run-provider.mjs', 'patch/router_patch.py', 'remote/install.sh', 'scripts/install-macos.sh', 'README.md'];
    for (const file of files) {
      await mkdir(join(root, file, '..'), { recursive: true });
      await writeFile(join(root, file), await readFile(new URL(`../${file}`, import.meta.url)));
    }
    const { version } = await verifyRelease(root);
    await assert.rejects(verifyRelease(root, '0.0.0'), /Requested/);
    const file = join(root, 'runtime/package-lock.json');
    const lock = JSON.parse(await readFile(file));
    lock.packages[''].version = '0.0.0';
    await writeFile(file, JSON.stringify(lock));
    await assert.rejects(verifyRelease(root, version), /runtime\/package-lock/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('a green build cannot substitute for live acceptance or a different candidate', () => {
  const names = ['mac-install-restore-reinstall', 'fresh-bot-controls', 'two-bot-isolation', 'channel-controls', 'codex-capabilities', 'openrouter-capabilities', 'clean-source-install'];
  const record = { version: '1.0.0', sourceDigest: 'abc', status: 'passed', supportedGrokVersions: ['test'], gates: Object.fromEntries(names.map(name => [name, {status: 'passed', evidence: 'test receipt', testedAt: '2026-09-08', versions: {test: {status: 'passed', evidence: 'test receipt', testedAt: '2026-09-08'}}}])) };
  assert.doesNotThrow(() => validateAcceptance(record, '1.0.0', 'abc', ['test']));
  assert.throws(() => validateAcceptance(record, '1.0.0', 'changed', ['test']), /candidate source/);
  assert.throws(() => validateAcceptance({...record, status: 'pending'}, '1.0.0', 'abc', ['test']), /pending/);
  assert.throws(() => validateAcceptance(record, '1.0.0', 'abc', ['test', 'new']), /every supported/);
  const incomplete = structuredClone(record);
  delete incomplete.gates['fresh-bot-controls'].versions.test;
  assert.throws(() => validateAcceptance(incomplete, '1.0.0', 'abc', ['test']), /on Grok Bot test/);
  delete record.gates['openrouter-capabilities'];
  assert.throws(() => validateAcceptance(record, '1.0.0', 'abc', ['test']), /openrouter-capabilities/);
});
