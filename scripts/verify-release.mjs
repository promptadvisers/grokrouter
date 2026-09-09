#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export async function verifyRelease(root, requested) {
  const read = (path) => readFile(resolve(root, path), 'utf8');
  const json = async (path) => JSON.parse(await read(path));
  const version = (await json('package.json')).version;
  if (!/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.]+)?$/.test(version)) throw new Error('Invalid release version');
  if (requested && requested !== version) throw new Error(`Requested ${requested}; checked-out source is ${version}`);
  for (const path of ['runtime/package.json', 'installer-windows/package.json', 'runtime/package-lock.json', 'installer-windows/package-lock.json']) {
    const data = await json(path);
    if (data.version !== version || (data.packages && data.packages['']?.version !== version)) throw new Error(`${path} does not match ${version}`);
  }
  if (!(await read('runtime/run-provider.mjs')).includes(`const ROUTER_VERSION = "${version}";`)) throw new Error('Runtime version mismatch');
  if (!(await read('patch/router_patch.py')).includes(`version: "${version}"`)) throw new Error('Host adapter version mismatch');
  if (!(await read('remote/install.sh')).includes(`ROUTER_VERSION="${version}"`)) throw new Error('Remote installer version mismatch');
  if (!(await read('scripts/install-macos.sh')).includes(`SOURCE_REF="source-v${version}"`)) throw new Error('Source installer version mismatch');
  // Info.plist is a build template; the build writes both actual version fields.
  const readme = await read('README.md');
  const download = readme.match(/https:\/\/raw\.githubusercontent\.com\/promptadvisers\/grokrouter\/(source-v[\w.-]+)\/scripts\/install-macos\.sh/);
  if (!download) throw new Error('README needs an immutable source installer URL');
  // Keep the last published URL while preparing a candidate. Advancing this
  // link before the tag exists caused issue #8.
  return { version, tag: `source-v${version}`, readmeTag: download[1] };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await verifyRelease(process.cwd(), process.argv[2]);
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
