#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyRelease } from './verify-release.mjs';

export async function releaseSourceDigest(root) {
  const paths = ['package.json'];
  async function walk(path) {
    for (const entry of await readdir(join(root, path), { withFileTypes: true })) {
      if (entry.name.startsWith('.') || ['node_modules', '__pycache__'].includes(entry.name)) continue;
      const child = `${path}/${entry.name}`;
      if (entry.isDirectory()) await walk(child);
      else if (entry.isFile() && !/\.pyc$/.test(child) && !/^(runtime\/(audit|channel-control|conversation-states))/.test(child)) paths.push(child);
    }
  }
  for (const directory of ['runtime', 'patch', 'remote', 'installer', 'installer-windows', 'skills', 'scripts', 'compatibility']) await walk(directory);
  const hash = createHash('sha256');
  for (const path of paths.sort()) hash.update(path).update('\0').update(await readFile(join(root, path))).update('\0');
  return hash.digest('hex');
}

export function validateAcceptance(record, version, sourceDigest, expectedVersions) {
  if (record.version !== version || record.sourceDigest !== sourceDigest) throw new Error('Live acceptance does not match the candidate source');
  if (record.status !== 'passed') throw new Error('Live release acceptance is still pending');
  if (!Array.isArray(expectedVersions) || expectedVersions.length === 0 || JSON.stringify([...record.supportedGrokVersions || []].sort()) !== JSON.stringify([...expectedVersions].sort())) throw new Error('Live evidence must cover every supported Grok Bot version');
  const required = ['mac-install-restore-reinstall', 'fresh-bot-controls', 'two-bot-isolation', 'channel-controls', 'codex-capabilities', 'openrouter-capabilities', 'clean-source-install'];
  for (const name of required) {
    const gate = record.gates?.[name];
    if (gate?.status !== 'passed' || !gate.evidence || !Number.isFinite(Date.parse(gate.testedAt))) throw new Error(`Missing live evidence: ${name}`);
    for (const grokVersion of expectedVersions) {
      const proof = gate.versions?.[grokVersion];
      if (proof?.status !== 'passed' || !proof.evidence || !Number.isFinite(Date.parse(proof.testedAt))) throw new Error(`Missing live evidence: ${name} on Grok Bot ${grokVersion}`);
    }
  }
  if (!Array.isArray(record.supportedGrokVersions) || record.supportedGrokVersions.length === 0) throw new Error('No verified Grok Bot version recorded');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const root = process.cwd();
    const digest = await releaseSourceDigest(root);
    if (process.argv.includes('--digest')) console.log(digest);
    else {
      const { version } = await verifyRelease(root);
      const record = JSON.parse(await readFile(join(root, 'docs/release-acceptance.json'), 'utf8'));
      const { versions } = JSON.parse(await readFile(join(root, 'compatibility/supported-apps.json'), 'utf8'));
      validateAcceptance(record, version, digest, versions);
      console.log(`Live acceptance verified for ${version} at ${digest}`);
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
