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
 *   3. its `require()` calls are exactly `react` + `react/jsx-runtime` — no
 *      undeclared, unused or internal-SDK imports;
 *   4. the context services it injects are the documented set;
 *   5. the marked regions this package documents are present;
 *   6. the manifest declares the browser half, carries no dependency the plugin
 *      does not need, and publishes only files that exist.
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
/** Requires the bundle is expected to make; extra ones are reported. */
const EXPECTED_REQUIRES = [
  'react',
  'react/jsx-runtime'
];
/**
 * The services the plugin consumes from the context. They are declared in the
 * package manifest as `dsh.client.inject`, not as an import: nothing in the
 * bundle may require the package that provides them.
 */
const EXPECTED_SERVICES = [
  'slots',
  'locale',
  'sessions',
  'remote',
  'remote.skills'
];

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

// 3. Dependency surface. Every require must be provided by the module graph, and
//    the set must be exactly the expected one: an extra require is either an
//    undeclared dependency or a package the plugin never actually uses.
const requires = [...source.matchAll(/require\(\s*"([^"]+)"\s*\)/g)].map((match) => match[1]);
const uniqueRequires = [...new Set(requires)];
const unexpected = uniqueRequires.filter((name) => !ALLOWED_REQUIRES.has(name));
const missing = EXPECTED_REQUIRES.filter((name) => !uniqueRequires.includes(name));
const extra = uniqueRequires.filter((name) => !EXPECTED_REQUIRES.includes(name));
check('every require is provided by the module graph', unexpected.length === 0, unexpected.join(', '));
check('no require beyond react', extra.length === 0, `unexpected: ${extra.join(', ')}`);
check('react and its jsx runtime are required', missing.length === 0, `missing: ${missing.join(', ')}`);
for (const name of uniqueRequires) notes.push(`info require: ${name}`);

// 4. The declared context services must match what apply() actually injects.
const injectMatch = /const inject = \[([\s\S]*?)\]/.exec(source);
const declaredServices = injectMatch === null
  ? []
  : [...injectMatch[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]);
check('the plugin declares its context services', declaredServices.length > 0, 'no inject array found');
check('declared services match the documented set', EXPECTED_SERVICES.every((name) => declaredServices.includes(name)) && declaredServices.length === EXPECTED_SERVICES.length, `got ${declaredServices.join(', ')}`);
for (const name of declaredServices) notes.push(`info service: ${name}`);

// 5. Documented regions.
for (const region of EXPECTED_REGIONS) {
  check(`region ${region}`, source.includes(`//#region ${region}`));
}

// 6. The generated marker must not survive into the artifact by accident.
check('no source-map trailer', !source.includes('sourceMappingURL'));

// 7. Packaging: `files` must name real files, the client bundle must be
//    committed, and no peer dependency may turn the install into a constraint
//    the plugin does not need.
const packed = manifest.files ?? [];
check('manifest lists the files to publish', packed.length > 0);
for (const entry of packed) {
  const target = join(here, entry);
  check(`packed ${entry}`, existsSync(target), 'missing on disk');
}
check('the client bundle is committed', existsSync(join(here, manifest.exports?.['./client']?.default ?? '')), 'lib/client.js must be committed to the repository');
check('no private flag on a publishable package', manifest.private !== true);
check('no peer dependencies', manifest.peerDependencies === undefined, JSON.stringify(manifest.peerDependencies ?? {}));
check('no runtime dependencies', manifest.dependencies === undefined, JSON.stringify(manifest.dependencies ?? {}));
check('the verified DSH version is recorded', typeof manifest.dsh?.verifiedAgainst === 'string' && manifest.dsh.verifiedAgainst.length > 0);

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
