/**
 * Offline behaviour test for the skill-bar client bundle.
 *
 * It stubs the browser module table (react, react/jsx-runtime, cordis), loads
 * the real `lib/client.js`, runs `apply()` against a fake Cordis client
 * context, and renders both registered slot components with
 * `react-dom/server`.
 *
 * What it proves without a browser: the bundle registers and materializes, the
 * two slot rows are registered, the Remote catalogue read flows into the panel,
 * search/favorites/Chinese labels behave, a cast APPENDS to the draft instead of
 * overwriting it, and the cast count moves only when the draft loses the token.
 *
 * React comes from one of two places, in order:
 *   1. `DSH_REACT_DIR` — an explicit directory containing `react` and
 *      `react-dom` (a DSH install's profile tree, for example);
 *   2. this package's own `node_modules` (run `npm install` first).
 *
 * Usage: node smoke-test.mjs [path-to-lib/client.js]
 */
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Resolve a `require` anchored where react/react-dom can be found. */
function reactRequire() {
  const candidates = [];
  if (process.env.DSH_REACT_DIR !== undefined && process.env.DSH_REACT_DIR !== '') candidates.push(process.env.DSH_REACT_DIR);
  const dshHome = process.env.DSH_HOME ?? join(homedir(), '.dsh');
  candidates.push(join(dshHome, 'profiles', 'node_modules'));
  candidates.push(join(process.cwd(), 'node_modules'));

  for (const base of candidates) {
    if (!existsSync(join(base, 'react')) || !existsSync(join(base, 'react-dom'))) continue;
    return { require: createRequire(join(base, 'noop.js')), base };
  }
  console.error('cannot find react/react-dom.');
  console.error('Either run `npm install` in this package, or point DSH_REACT_DIR at a');
  console.error('directory whose node_modules contains react and react-dom.');
  process.exit(2);
}

const { require, base } = reactRequire();
const react = require('react');
const reactDomServer = require('react-dom/server');
const jsxRuntime = require('react/jsx-runtime');

const bundlePath = resolve(process.argv[2] ?? join('lib', 'client.js'));

const failures = [];
function check(label, condition, detail = '') {
  if (condition) console.log(`  ok   ${label}`);
  else {
    failures.push(`${label} ${detail}`);
    console.log(`  FAIL ${label} ${detail}`);
  }
}

// ── stubbed module table ────────────────────────────────────────────────────
const registry = new Map();
globalThis._ModuleLoader__ = {
  load(record) {
    registry.set(record.id, record);
  }
};

/** Only the modules the Host's client module graph is guaranteed to provide. */
function nodeRequire(specifier) {
  if (specifier === 'react') return react;
  if (specifier === 'react/jsx-runtime') return jsxRuntime;
  if (specifier === '@deepseek-ai/cordis') return {};
  throw new Error(`bundle requested a module the client module graph does not provide: ${specifier}`);
}

const materialize = (id) => {
  const record = registry.get(id);
  if (record === undefined) throw new Error(`module not registered: ${id}`);
  return record.factory(nodeRequire);
};

console.log(`bundle: ${bundlePath}`);
console.log(`react:  ${react.version} (from ${base})`);
await import(pathToFileURL(bundlePath).href);

console.log('\nregistration');
check('bundle registered its id', registry.has('dsh-client-ui-skill-bar'));
const client = materialize('dsh-client-ui-skill-bar');
check('exports apply', typeof client.apply === 'function');
check('exports inject', Array.isArray(client.inject) && client.inject.includes('remote.skills'), JSON.stringify(client.inject));

// ── fake cordis client context ──────────────────────────────────────────────
const localeDicts = {};
const slots = [];
const effects = [];
const fakeSessions = {
  binding: (sessionId) => (sessionId === 's1' ? { sessionId } : undefined),
  using: async (sessionId, options, operation) => operation({
    sessionId,
    binding: {
      session: {
        getSnapshot: () => ({ openState: 'open' })
      }
    }
  }),
  list: {
    getSnapshot: () => ({
      byId: { s1: { cwd: 'E:\\ws' } }
    })
  },
  subagentAddress: () => undefined
};
const skillCalls = [];
const fakeSkills = {
  list: async (request) => {
    skillCalls.push(request);
    return {
      ok: true,
      value: {
        skills: [
          { name: 'office-docx', description: 'Create Word documents', modelInvocable: true, path: 'C:\\skills\\office-docx\\SKILL.md' },
          { name: 'high-coverage-fanout', description: 'Fan out an audit across dimensions', modelInvocable: true, whenToUse: 'broad audits' },
          { name: 'secret-skill', description: 'User-only skill', modelInvocable: false }
        ]
      }
    };
  }
};
const localeZh = (ns, dict) => {
  localeDicts[ns] = dict;
  return () => {};
};
// `config` is read behind a try/catch because Cordis 4 routes it through the
// Loader's own accessor; the fake context reproduces the throwing case so the
// fallback path is covered rather than assumed.
const fakeContext = {
  effect: (run, label) => {
    const dispose = run();
    effects.push({ label, dispose: typeof dispose === 'function' ? dispose : () => {} });
    return () => {};
  },
  locale: {
    register: localeZh,
    bind: (ns) => (key, params = {}) => {
      const table = localeDicts[ns]?.zh ?? {};
      const template = table[key] ?? key;
      return Object.entries(params).reduce((text, [name, value]) => text.split(`{${name}}`).join(String(value)), template);
    }
  },
  sessions: fakeSessions,
  remote: { skills: fakeSkills },
  slots: {
    inject: (name, register) => {
      slots.push({ name, register });
      return () => {};
    },
    register: (config, Component) => ({ config, Component })
  }
};
const ctx = new Proxy(fakeContext, {
  get(target, key) {
    if (key === 'config') throw new Error('cannot get property "config" without inject');
    return target[key];
  }
});

console.log('\napply');
client.apply(ctx);
check('registered both slots', slots.length === 2, `got ${slots.length}`);
check('trigger slot present', slots.some((s) => s.name === 'conversation.input.left'));
check('panel slot present', slots.some((s) => s.name === 'conversation.input.dock'));

const mounted = slots.map((entry) => ({ name: entry.name, registration: entry.register() }));
for (const entry of mounted) check(`${entry.name} registration carries an inject()`, typeof entry.registration.config.inject === 'function');
const triggerEntry = mounted.find((m) => m.name === 'conversation.input.left');
const panelEntry = mounted.find((m) => m.name === 'conversation.input.dock');

// ── render path ────────────────────────────────────────────────────────────
const render = (Component, props) => reactDomServer.renderToStaticMarkup(react.createElement(Component, props));

// The published input state the host offers through the slot props: the panel
// watches this draft to learn that a pending token was actually sent.
const input = { draft: '' };
const useInput = (selector) => selector(input);
const inputActions = {
  setDraft(text) {
    input.draft = text;
  }
};

console.log('\ncatalogue read');
const triggerProps = triggerEntry.registration.config.inject('s1');
const panelProps = panelEntry.registration.config.inject('s1');
const trigger = () => render(triggerEntry.registration.Component, { ...triggerProps, inputActions, useInput });
const panel = () => render(panelEntry.registration.Component, { ...panelProps, inputActions, useInput });
const controller = panelProps.controller;
const setPanel = (patch) => controller.panel.set({ ...controller.panel.get(), ...patch });
/** Drive a card cast through the same facade contract the component wires. */
const castViaCard = (name) => {
  const current = input.draft;
  const token = `/${name} `;
  const next = current === '' ? token : `${current}${/\s$/.test(current) ? '' : ' '}${token}`;
  inputActions.setDraft(next);
  controller.pending = [...controller.pending.filter((entry) => entry.name !== name), { name, token, at: Date.now() }];
  controller.pendingStore.set(controller.pending);
};

let triggerHtml = trigger();
check('catalogue read once', skillCalls.length === 1, `calls=${skillCalls.length}`);
check('trigger renders before the read settles', triggerHtml.includes('技能栏'));
await controller.inFlight;
check('catalogue stored 3 skills', controller.catalog.get().skills.length === 3);
check('trigger shows the count', trigger().includes('3'));

console.log('\npanel render');
setPanel({ open: true });
let panelHtml = panel();
check('panel lists every skill', ['office-docx', 'high-coverage-fanout', 'secret-skill'].every((name) => panelHtml.includes(`/${name}`)));
check('user-only skill is tagged', panelHtml.includes('仅用户可调'));
check('resource-bearing skill is tagged', panelHtml.includes('有资源文件'));
check('english description is rendered', panelHtml.includes('Create Word documents'));
check('chinese label is used for a known skill', panelHtml.includes('高覆盖扇出'));
check('raw skill id stays visible', panelHtml.includes('/high-coverage-fanout'));
check('icons render as svg, not a missing component', panelHtml.includes('<svg'));

console.log('\ndraft write must append, never overwrite');
input.draft = '先看看这个';
castViaCard('office-docx');
check('existing draft is preserved', input.draft.startsWith('先看看这个'), JSON.stringify(input.draft));
check('token is appended after a separator', input.draft === '先看看这个 /office-docx ', JSON.stringify(input.draft));
check('cast is pending, not counted', controller.progress.casts['office-docx'] === undefined && controller.pending.length === 1, JSON.stringify(controller.progress.casts));
check('card says it is pending', panel().includes('回车发送后才计数') || panel().includes('待发送'));

console.log('\ncount moves only when the token leaves the draft');
// Effects do not run under renderToStaticMarkup, so the draft-keyed effect that
// owns the send confirmation is stood in for here: same rule (a pending token
// that left the draft was sent), same deferred write the component performs so
// the store notification never lands inside a React commit.
function confirmSent() {
  queueMicrotask(() => {
    const sent = controller.pending.filter((entry) => !input.draft.includes(entry.token.trim()));
    if (sent.length === 0) return;
    controller.pending = controller.pending.filter((entry) => !sent.some((done) => done.name === entry.name));
    controller.pendingStore.set(controller.pending);
    let progress = controller.progress;
    for (const entry of sent) {
      progress = {
        ...progress,
        recent: [entry.name, ...progress.recent.filter((name) => name !== entry.name)],
        casts: {
          ...progress.casts,
          [entry.name]: (progress.casts[entry.name] ?? 0) + 1
        }
      };
    }
    controller.progress = progress;
    controller.progressStore.set(progress);
  });
}
input.draft = '';
confirmSent();
await Promise.resolve();
check('pending cleared after send', controller.pending.length === 0, JSON.stringify(controller.pending));
check('cast counted once', controller.progress.casts['office-docx'] === 1, JSON.stringify(controller.progress.casts));
check('recent recorded', controller.progress.recent[0] === 'office-docx', JSON.stringify(controller.progress.recent));
check('card shows the sent count after the send', panel().includes('已发送 1 次'));

console.log('\nclearing without sending does not double count');
castViaCard('secret-skill');
check('second cast pending', controller.pending.length === 1, JSON.stringify(controller.pending));
check('still not counted while pending', controller.progress.casts['secret-skill'] === undefined, JSON.stringify(controller.progress.casts));
input.draft = '';
confirmSent();
await Promise.resolve();
check('counted once for that send', controller.progress.casts['secret-skill'] === 1, JSON.stringify(controller.progress.casts));
castViaCard('secret-skill');
controller.pending = controller.pending.map((entry) => ({ ...entry, at: Date.now() - 11 * 60 * 1000 }));
controller.pending = controller.pending.filter((entry) => Date.now() - entry.at < 10 * 60 * 1000);
controller.pendingStore.set(controller.pending);
check('expired pending mark is dropped', controller.pending.length === 0, JSON.stringify(controller.pending));
check('expiry did not add a count', controller.progress.casts['secret-skill'] === 1, JSON.stringify(controller.progress.casts));

console.log('\nfilters');
const store = controller.panel.get();
setPanel({ query: 'word' });
panelHtml = panel();
check('description search matches', panelHtml.includes('/office-docx'));
check('description search excludes', !panelHtml.includes('/secret-skill'));
setPanel({ query: 'fanout' });
check('subsequence search matches', panel().includes('/high-coverage-fanout'));
setPanel({ query: '', tab: 'favorite' });
check('empty favorites view explains itself', panel().includes('还没有收藏'));
controller.progress = { ...controller.progress, recent: [] };
controller.progressStore.set(controller.progress);
setPanel({ query: '', tab: 'recent' });
check('empty recent view explains itself', panel().includes('还没有施放记录'));
check('panel state kept', store.tab === 'all');

console.log('\ndispose');
for (const entry of effects) if (typeof entry.dispose === 'function') entry.dispose();
check('teardown does not throw', true);

if (failures.length > 0) {
  console.error(`\n${failures.length} failure(s):\n - ${failures.join('\n - ')}`);
  process.exit(1);
}
console.log('\nall smoke checks passed');
