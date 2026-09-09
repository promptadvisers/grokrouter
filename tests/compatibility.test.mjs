import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile, readFile, writeFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';

const root = new URL('../', import.meta.url);
const text = p => readFile(new URL(p, root), 'utf8');
const json = async p => JSON.parse(await text(p));
const { versions } = await json('compatibility/supported-apps.json');

test('every exact desktop version has a signed registry and a matching strict manifest', async () => {
  assert.ok(versions.length > 0);
  assert.equal(new Set(versions).size, versions.length);
  const swift = await text('installer/GrokBotRouterInstaller.swift');
  const windows = await text('installer-windows/main.cjs');
  assert.deepEqual(JSON.parse(swift.match(/supportedGrokVersions = (\[[^\n]+\])/)[1]), versions);
  assert.deepEqual(JSON.parse(windows.match(/SUPPORTED_GROK_VERSIONS = (\[[^\n]+\])/)[1]), versions);
  for (const version of versions) {
    assert.match(version, /^\d+\.\d+\.\d+$/);
    const registry = await json(`compatibility/${version}-hosts.json`);
    const manifest = await json(`patch/manifests/${version}.json`);
    assert.equal(manifest.grokBotVersion, version);
    assert.equal(manifest.anchorVerifiedHosts.enabled, false);
    assert.deepEqual(manifest.stockHosts, registry.stockHosts);
    execFileSync(process.execPath, [fileURLToPath(new URL('remote/verify-host-registry.mjs', root)),
      fileURLToPath(new URL(`compatibility/${version}-hosts.json`, root)),
      fileURLToPath(new URL(`compatibility/${version}-hosts.json.sig`, root)),
      fileURLToPath(new URL('compatibility/registry-public-key.pem', root)), version]);
  }
});

test('a valid signature for one desktop version cannot authorize another', () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('remote/verify-host-registry.mjs', root)),
    fileURLToPath(new URL('compatibility/0.30.0-hosts.json', root)),
    fileURLToPath(new URL('compatibility/0.30.0-hosts.json.sig', root)),
    fileURLToPath(new URL('compatibility/registry-public-key.pem', root)), '0.36.0']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr.toString(), /Grok Bot version/);
});

test('management selects only the configured version registry and rejects unsupported configuration', {skip: process.platform === 'win32'}, async () => {
  const stage = await realpath(await mkdtemp(join(tmpdir(), 'grokrouter-versions-')));
  try {
    for (const directory of ['bin', 'compatibility', 'cache']) await mkdir(join(stage, directory));
    for (const file of ['host-registry', 'verify-host-registry.mjs']) await copyFile(new URL(`remote/${file}`, root), join(stage, 'bin', file));
    for (const file of ['supported-apps.json', 'registry-public-key.pem', ...versions.flatMap(v => [`${v}-hosts.json`, `${v}-hosts.json.sig`])]) await copyFile(new URL(`compatibility/${file}`, root), join(stage, 'compatibility', file));
    const env = {...process.env, ROUTER_HOST_REGISTRY_ROOT: join(stage, 'cache')};
    for (const version of versions) {
      await writeFile(join(stage, 'provider.json'), JSON.stringify({grokBotVersion: version}));
      assert.equal(execFileSync('bash', [join(stage, 'bin/host-registry'), 'version'], {env, encoding:'utf8'}).trim(), version);
      assert.equal(execFileSync('bash', [join(stage, 'bin/host-registry'), 'verify'], {env, encoding:'utf8'}).trim(), join(stage, `compatibility/${version}-hosts.json`));
    }
    await writeFile(join(stage, 'provider.json'), JSON.stringify({grokBotVersion: '../../other'}));
    const rejected = spawnSync('bash', [join(stage, 'bin/host-registry'), 'verify'], {env});
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr.toString(), /unsupported/);
  } finally { await rm(stage, {recursive: true, force: true}); }
});
