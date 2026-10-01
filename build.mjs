#!/usr/bin/env node
/**
 * Artifact gate for the client bundle.
 *
 * This package ships a hand-written bundle and has **no build step**: the
 * browser half is plain JavaScript that the DSH client module system evaluates
 * as-is, so a toolchain would add a failure mode (and a dependency) without
 * removing any. What a release does need is a guarantee that the artifact is
 * still loadable and still self-contained, which is what this script checks:
 *
 *   1. the bundle parses as a script (it is loaded as a classic script);
 *   2. it registers exactly the module id the Host resolves for this package;
 *   3. every `require()` it makes is in the allowlist of modules the client
 *      module graph provides — no undeclared or internal-SDK imports;
 *   4. the marked regions this package documents are present;
 *   5. the package manifest still declares the browser half and its services.
 *
 * Usage: node build.mjs [--check]   (--check prints the report and never writes)
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const BUNDLE = join(here, 'lib', 'client.js');
const MANIFEST = join(here, 'package.json');
/** Modules the DSH client module system provides; anything else is a defect. */
const ALLOWED_REQUIRES = new Set([
  'react',
  'react/jsx-runtime',
  '@deepseek-ai/cordis'
]);

/** Regions the bundle is expected to carry, in order. */
const EXPECTED_REGIONS = [
  'lib/types/client/index.js',
  'lib/locale.js',
  'lib/icons.js',
  'lib/storage.js',
  'lib/store.js',
  'lib/match.js',
  'lib/style.js',
  'lib/ui.js',
  'lib/catalog.js',
  'lib/components.js'
];

const problems = [];
const notes = [];

function check(label, condition, detail = '') {
  if (condition) notes.push(`ok   ${label}`);
  else {
    problems.push(`${label}${detail === '' ? '' : ` — ${detail}`}`);
    notes.push(`FAIL ${label}${detail === '' ? '' : ` — ${detail}`}`);
  }
}

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const source = readFileSync(BUNDLE, 'utf8');

// 1. The artifact is a classic script; `new Function` is the cheapest real
//    parser check (no evaluation of the bundle body).
try {
  // eslint-disable-next-line no-new-func
  new Function(source);
  check('bundle parses as a script', true);
} catch (error) {
  check('bundle parses as a script', false, String(error.message));
}

// 2. Module identity: a plugin mounted by path is looked up by its directory
//    name, and it must be the same id the bundle registers.
check('bundle registers the package name', source.includes(`id: ${JSON.stringify(manifest.name)},`), `expected id "${manifest.name}"`);
check('manifest declares the web client half', manifest.dsh?.client?.platform === 'web');
check('manifest declares the client bundle export', manifest.exports?.['./client']?.default === './lib/client.js');

// 3. Dependency surface. Every require must be provided by the module graph.
const requires = [...source.matchAll(/require\(\s*"([^"]+)"\s*\)/g)].map((match) => match[1]);
const unexpected = [...new Set(requires)].filter((name) => !ALLOWED_REQUIRES.has(name));
check('every require is provided by the module graph', unexpected.length === 0, unexpected.join(', '));
check('runtime dependency surface is react + cordis only', requires.length > 0, 'no require() calls found');
for (const name of new Set(requires)) notes.push(`info require: ${name}`);

// 4. Documented regions.
for (const region of EXPECTED_REGIONS) {
  check(`region ${region}`, source.includes(`//#region ${region}`));
}

// 5. The generated marker must not survive into the artifact by accident.
check('no source-map trailer', !source.includes('sourceMappingURL'));

// 6. What npm would publish: `files` must name real files, and the client bundle
//    must be committed, because consumers mount it as one artifact.
const packed = manifest.files ?? [];
check('manifest lists the files to publish', packed.length > 0);
for (const entry of packed) {
  const target = join(here, entry);
  const isDirectory = entry.endsWith('/');
  check(`packed ${entry}`, isDirectory ? existsSync(target) : existsSync(target), 'missing on disk');
}
check('the client bundle is committed', existsSync(join(here, manifest.exports?.['./client']?.default ?? '')), 'lib/client.js must be committed to the repository');
check('no private flag on a publishable package', manifest.private !== true);

console.log(`bundle: ${BUNDLE}`);
console.log(`bytes:  ${Buffer.byteLength(source)}`);
for (const line of notes) console.log(`  ${line}`);

if (problems.length > 0) {
  console.error(`\n${problems.length} problem(s):\n - ${problems.join('\n - ')}`);
  process.exit(1);
}

if (!process.argv.includes('--check')) {
  // No transformation is needed: this file IS the artifact. Rewriting it keeps
  // the mtime honest for the Host's revision-based client reload.
  writeFileSync(BUNDLE, source);
  console.log('\nartifact is current (no transformation required)');
} else {
  console.log('\nartifact check passed');
}
