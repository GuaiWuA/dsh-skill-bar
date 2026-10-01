// Headless browser verification for the skill bar.
//
// Drives an already-running Chrome/Edge through CDP (no child_process: the
// browser is started by the caller, this script only connects). It proves the
// parts the Node smoke test cannot: the real page boots the plugin bundle, the
// trigger lands in the composer tool row, the panel renders in the input dock,
// and everything survives with no console errors.
//
// Usage: node browser-check.mjs <port> <url> <screenshotPath>
import { writeFileSync } from 'node:fs';

const [portArg, url, screenshotPath] = process.argv.slice(2);
if (!portArg || !url) {
  console.error('usage: node browser-check.mjs <cdp-port> <url> [screenshot]');
  process.exit(2);
}
const port = Number(portArg);

const failures = [];
function check(label, condition, detail = '') {
  if (condition) console.log(`  ok   ${label}`);
  else {
    failures.push(`${label} ${detail}`);
    console.log(`  FAIL ${label} ${detail}`);
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ── target discovery ───────────────────────────────────────────────────────
async function targets() {
  const response = await fetch(`http://127.0.0.1:${port}/json/list`);
  return response.json();
}

// A previous run leaves its page behind; close every tab but one so the
// console capture belongs to this run only.
const stale = await targets().catch(() => []);
for (const target of stale.filter((t) => t.type === 'page').slice(0, -1)) {
  await fetch(`http://127.0.0.1:${port}/json/close/${target.id}`).catch(() => {});
}

let page;
for (let attempt = 0; attempt < 40; attempt += 1) {
  try {
    const list = await targets();
    page = list.find((target) => target.type === 'page' && typeof target.webSocketDebuggerUrl === 'string');
    if (page !== undefined) break;
  } catch {}
  await sleep(500);
}
if (page === undefined) {
  console.error('no debuggable page found');
  process.exit(1);
}
console.log(`target: ${page.url}`);

// ── CDP plumbing ───────────────────────────────────────────────────────────
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', (event) => reject(new Error(`websocket error: ${event.message ?? 'unknown'}`)), { once: true });
});

let nextId = 0;
const pending = new Map();
const consoleErrors = [];
const pageErrors = [];
socket.addEventListener('message', (event) => {
  let message;
  try {
    message = JSON.parse(typeof event.data === 'string' ? event.data : String(event.data));
  } catch {
    return;
  }
  if (message.id !== undefined) {
    const entry = pending.get(message.id);
    if (entry !== undefined) {
      pending.delete(message.id);
      if (message.error !== undefined) entry.reject(new Error(`${message.error.message} (${message.error.code})`));
      else entry.resolve(message.result);
    }
    return;
  }
  if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
    consoleErrors.push(message.params.args.map((arg) => arg.value ?? arg.description ?? arg.type).join(' '));
  }
  if (message.method === 'Runtime.exceptionThrown') {
    const details = message.params.exceptionDetails;
    pageErrors.push(details.exception?.description ?? details.text ?? 'exception');
  }
});

function send(method, params = {}) {
  const id = (nextId += 1);
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const result = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true
  });
  if (result.exceptionDetails !== undefined) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  return result.result.value;
}

await send('Runtime.enable');
await send('Page.enable');
await send('Log.enable');

// ── navigate ───────────────────────────────────────────────────────────────
console.log('\nnavigation');
// Drop anything a previous run left behind: the persisted conversation draft
// would otherwise be restored into the composer.
const clearedStorage = await evaluate(`(() => { localStorage.clear(); return true; })()`).catch(() => false);
if (clearedStorage !== true) console.log('  (could not clear localStorage before navigation)');
// The composer sits below the panel, so the page needs enough height for the
// editor to be inside the viewport: a click outside it never focuses the editor.
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1200, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url });
await sleep(1200);
for (let attempt = 0; attempt < 60; attempt += 1) {
  const ready = await evaluate('document.readyState').catch(() => '');
  if (ready === 'complete') break;
  await sleep(500);
}
// The shell mounts after its module combo loads; poll for the trigger.
let triggerFound = false;
for (let attempt = 0; attempt < 60; attempt += 1) {
  triggerFound = await evaluate(`document.querySelector('[data-role="skill-bar-trigger"]') !== null`).catch(() => false);
  if (triggerFound) break;
  await sleep(1000);
}

// The first run of a GUI shows a "preview build" notice whose scrim covers the
// whole frame — including the composer, which then cannot take a click. It has
// to be dismissed before any real-pointer interaction is meaningful.
const noticeDismissed = await evaluate(`(() => {
  const control = [...document.querySelectorAll('button')].find((node) => /继续|Continue/.test((node.textContent || '').trim()));
  if (control === undefined) return false;
  control.click();
  return true;
})()`);
if (noticeDismissed) {
  console.log('  dismissed the first-run notice');
  await sleep(1200);
}

// A blank shell keeps a full-viewport scrim over the composer (the host's
// "session not active" state), and a scrim swallows the click that would focus
// the editor. Opening a session removes it, so the composer accepts real input.
const sessionOpened = await evaluate(`(() => {
  const control = [...document.querySelectorAll('button, a')].find((node) => /新会话|New session|New chat/.test(node.textContent || ''));
  if (control !== undefined) control.click();
  return control !== undefined;
})()`);
if (sessionOpened) await sleep(2500);
for (let attempt = 0; attempt < 20; attempt += 1) {
  const hit = await evaluate(`(() => {
    const editor = document.querySelector('[contenteditable="true"]');
    if (editor === null) return false;
    const rect = editor.getBoundingClientRect();
    const node = document.elementFromPoint(rect.left + 24, rect.top + 14);
    return node !== null && (node === editor || editor.contains(node));
  })()`).catch(() => false);
  if (hit) break;
  await sleep(400);
}

console.log('\nbrowser checks');
const shellInfo = await evaluate(`(() => {
  const boot = window.__DSH_BOOT__;
  return {
    bootRev: typeof boot?.rev === 'string' ? boot.rev : null,
    entryCount: Array.isArray(boot?.entries) ? boot.entries.length : 0,
    hasSkillBarEntry: Array.isArray(boot?.entries)
      ? boot.entries.some((e) => JSON.stringify(e).includes('dsh-client-ui-skill-bar')) : false,
    bodyText: (document.body.innerText || '').slice(0, 200),
    hasComposer: document.querySelector('[contenteditable="true"]') !== null
  };
})()`);
check('page booted a boot manifest', shellInfo.bootRev !== null);
check('boot graph carries the skill bar entry', shellInfo.hasSkillBarEntry, JSON.stringify(shellInfo.entryCount));
check('composer editor mounted', shellInfo.hasComposer, JSON.stringify(shellInfo.bodyText));
check('skill bar trigger rendered in the composer row', triggerFound);
if (!triggerFound) {
  console.log('body text:', shellInfo.bodyText);
}

let panelInfo = { hasPanel: false, names: [], draftKey: null };
if (triggerFound) {
  await evaluate(`document.querySelector('[data-role="skill-bar-trigger"]').click()`);
  await sleep(600);
  panelInfo = await evaluate(`(() => {
    const panel = document.querySelector('[data-role="skill-bar-panel"]');
    const names = panel === null ? [] : [...panel.querySelectorAll('[data-skill]')].map((n) => n.getAttribute('data-skill'));
    return {
      hasPanel: panel !== null,
      names,
      text: panel === null ? '' : (panel.innerText || '').slice(0, 300),
      draftKey: Object.keys(localStorage).find((k) => k.includes('conversation')) ?? null
    };
  })()`);
  check('trigger click opened the panel', panelInfo.hasPanel, JSON.stringify(panelInfo.text));
  if (panelInfo.hasPanel) {
    check('panel rendered the catalog or an explicit empty state', panelInfo.names.length > 0 || /没有可用技能|no user-invocable/.test(panelInfo.text), JSON.stringify(panelInfo.text));
    if (panelInfo.names.length > 0) {
      console.log(`catalog in browser: ${panelInfo.names.join(', ')}`);
      const first = panelInfo.names[0];

      console.log('\ncast: append, never overwrite');
      // ── real input plumbing ──────────────────────────────────────────────
      // `Input.insertText` goes through the browser's editing pipeline, which is
      // the only path the Lexical composer treats as typing: `execCommand` is
      // ignored by it and a synthetic event assigns no caret. The composer also
      // takes focus asynchronously, so every step re-checks its own result
      // instead of assuming the previous step landed.
      const readEditor = () => evaluate(`document.querySelector('[contenteditable="true"]').innerText || ''`);
      const pressKey = async (key, code, virtualKeyCode, modifiers = 0) => {
        await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key, code, windowsVirtualKeyCode: virtualKeyCode, modifiers });
        await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: virtualKeyCode, modifiers });
        await sleep(150);
      };
      /** Click the composer and wait until it really owns focus. */
      const focusEditor = async () => {
        for (let attempt = 0; attempt < 6; attempt += 1) {
          const state = await evaluate(`(() => {
            const editor = document.querySelector('[contenteditable="true"]');
            if (editor === null) return { why: 'no editor' };
            if (document.activeElement === editor) return { done: true };
            const rect = editor.getBoundingClientRect();
            const x = rect.left + Math.min(24, rect.width / 4);
            const y = rect.top + Math.min(14, rect.height / 2);
            const hit = document.elementFromPoint(x, y);
            return { done: false, x, y, inViewport: y > 0 && y < window.innerHeight, hit: hit === null ? null : (hit.tagName + '.' + String(hit.className).slice(0, 30)), hitIsEditorOrChild: hit !== null && (hit === editor || editor.contains(hit)) };
          })()`);
          if (state.done === true) return true;
          if (state.x === undefined) return false;
          if (!state.inViewport || state.hitIsEditorOrChild === false) {
            console.log(`  [focus] attempt ${attempt}: ${JSON.stringify(state)}`);
            return false;
          }
          await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: state.x, y: state.y, button: 'left', clickCount: 1 });
          await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: state.x, y: state.y, button: 'left', clickCount: 1 });
          await sleep(240);
        }
        return false;
      };
      /** Replace the composer content with `text`, as typing over a selection does. */
      const setDraft = async (text) => {
        for (let attempt = 0; attempt < 4; attempt += 1) {
          await focusEditor();
          await pressKey('a', 'KeyA', 65, 2); // Ctrl+A selects the whole draft
          await pressKey('Delete', 'Delete', 46);
          if (text !== '') {
            await send('Input.insertText', { text });
            await sleep(320);
          }
          const current = (await readEditor()).trim();
          if (current === text.trim()) break;
        }
        return readEditor();
      };

      const seededText = await setDraft('KEEP');
      const seeded = { text: seededText.trim() };
      console.log(`  seed: ${JSON.stringify(seeded)}`);
      check('draft was seeded before the cast', seeded.text === 'KEEP', JSON.stringify(seeded));
      await sleep(200);
      await sleep(300);
      await evaluate(`document.querySelector('[data-role="skill-bar-panel"] [data-skill]').click()`);
      await sleep(600);
      const afterFirstCast = await evaluate(`(() => {
        const editor = document.querySelector('[contenteditable="true"]');
        const panel = document.querySelector('[data-role="skill-bar-panel"]');
        const card = panel.querySelector('[data-skill="${first}"]');
        return {
          editorText: editor === null ? null : (editor.innerText || ''),
          pendingAttr: card === null ? null : card.getAttribute('data-pending'),
          pendingText: card === null ? '' : card.innerText,
          casts: localStorage.getItem('dsh.skillBar.v1.casts'),
          recent: localStorage.getItem('dsh.skillBar.v1.recent')
        };
      })()`);
      const draftAfterCast = (afterFirstCast.editorText ?? '').trim();
      check('existing draft survived the cast', draftAfterCast.startsWith('KEEP'), JSON.stringify(afterFirstCast.editorText));
      check('token appended with a separator', draftAfterCast === `KEEP /${first}`, JSON.stringify(afterFirstCast.editorText));
      check('card is marked pending, not counted', afterFirstCast.pendingAttr === 'true' && !(afterFirstCast.casts ?? '').includes(first), `pending=${afterFirstCast.pendingAttr} casts=${afterFirstCast.casts}`);
      check('pending copy is explained on the card', /回车发送后才计数|counted only after you send|待发送/.test(afterFirstCast.pendingText), JSON.stringify(afterFirstCast.pendingText.slice(0, 160)));

      console.log('\ncount moves on send, not on insert');
      // Close the panel so the composer owns focus, then clear the draft through
      // the real input pipeline: a pending token leaving the draft is the send
      // witness, and this is what the browser reports to the plugin.
      await evaluate(`document.querySelector('[data-role="skill-bar-close"]')?.click()`);
      await sleep(400);
      const clearedText = await setDraft('');
      const cleared = { text: clearedText };
      console.log(`  clear: ${JSON.stringify(cleared)}`);
      const afterSend = await evaluate(`(() => {
        const panel = document.querySelector('[data-role="skill-bar-panel"]');
        const card = panel === null || panel.querySelector('[data-skill="${first}"]') === null
          ? null : panel.querySelector('[data-skill="${first}"]');
        return {
          editorText: (document.querySelector('[contenteditable="true"]')?.innerText ?? null),
          pendingAttr: card === null ? null : card.getAttribute('data-pending'),
          cardText: card === null ? '' : card.innerText,
          casts: localStorage.getItem('dsh.skillBar.v1.casts'),
          recent: localStorage.getItem('dsh.skillBar.v1.recent')
        };
      })()`);
      check('draft really cleared', typeof afterSend.editorText === 'string' && afterSend.editorText.trim() === '', JSON.stringify(afterSend.editorText));
      check('cast counted after the draft cleared', (afterSend.casts ?? '').includes(`"${first}":1`), `casts=${afterSend.casts}`);
      check('recent recorded after the clear', (afterSend.recent ?? '').includes(`"${first}"`), `recent=${afterSend.recent}`);
      check('pending mark cleared', afterSend.pendingAttr === null, `pending=${afterSend.pendingAttr}`);

      console.log('\ndrag: card follows the pointer and drops into the composer');
      await setDraft('');
      await evaluate(`document.querySelector('[data-role="skill-bar-trigger"]').click()`);
      await sleep(600);
      const dragResult = await evaluate(`(async () => {
        const panel = document.querySelector('[data-role="skill-bar-panel"]');
        const target = ${JSON.stringify(panelInfo.names[1] ?? panelInfo.names[0])};
        const card = panel === null ? null : panel.querySelector('[data-skill="' + target + '"]');
        const editor = document.querySelector('[contenteditable="true"]');
        if (card === null || editor === null) return { error: 'missing card or editor', target, hasPanel: panel !== null };
        const cardRect = card.getBoundingClientRect();
        const editorRect = editor.getBoundingClientRect();
        const down = { bubbles: true, cancelable: true, pointerId: 7, pointerType: 'mouse', button: 0, buttons: 1,
          clientX: cardRect.left + cardRect.width / 2, clientY: cardRect.top + cardRect.height / 2 };
        card.dispatchEvent(new PointerEvent('pointerdown', down));
        await new Promise((resolve) => setTimeout(resolve, 30));
        const moves = [];
        for (let step = 1; step <= 6; step += 1) {
          const x = down.clientX + ((editorRect.left + editorRect.width / 2) - down.clientX) * (step / 6);
          const y = down.clientY + ((editorRect.top + editorRect.height / 2) - down.clientY) * (step / 6);
          window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 7, pointerType: 'mouse', buttons: 1, clientX: x, clientY: y }));
          // The ghost appears on the next React commit, so the pointer handler
          // and the transform it writes are one frame apart.
          await new Promise((resolve) => setTimeout(resolve, 60));
          const ghost = document.querySelector('[data-role="skill-bar-ghost"]');
          moves.push({ ghost: ghost !== null, transform: ghost === null ? null : ghost.style.transform });
        }
        const overlaysBefore = moves.filter((m) => m.ghost).length;
        window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 7, pointerType: 'mouse', button: 0, buttons: 0,
          clientX: editorRect.left + editorRect.width / 2, clientY: editorRect.top + editorRect.height / 2 }));
        await new Promise((resolve) => setTimeout(resolve, 400));
        const after = document.querySelector('[data-skill="' + target + '"]');
        return {
          overlaysBefore,
          target,
          editorRect: { top: Math.round(editorRect.top), left: Math.round(editorRect.left), width: Math.round(editorRect.width), height: Math.round(editorRect.height) },
          ghostAfter: document.querySelector('[data-role="skill-bar-ghost"]') !== null,
          editorText: editor.innerText || '',
          pendingAfter: after === null ? null : after.getAttribute('data-pending'),
          casts: localStorage.getItem('dsh.skillBar.v1.casts'),
          selectionLength: String(window.getSelection()?.toString() ?? '').length,
          lastTransform: moves.map((move) => move.transform).find((value) => typeof value === 'string' && value.length > 0) ?? null
        };
      })()`);
      console.log(`  drag result: ${JSON.stringify(dragResult)}`);
      check('a ghost followed the pointer during the drag', dragResult.overlaysBefore >= 3, JSON.stringify(dragResult));
      check('the ghost carried the pointer transform', typeof dragResult.lastTransform === 'string' && dragResult.lastTransform.includes('translate3d'), JSON.stringify(dragResult.lastTransform));
      check('ghost removed after the drop', dragResult.ghostAfter === false, JSON.stringify(dragResult));
      check('drag dropped the token into the composer', typeof dragResult.editorText === 'string' && dragResult.editorText.includes(`/${panelInfo.names[1] ?? first}`), JSON.stringify(dragResult.editorText));
      check('drag did not select page text', dragResult.selectionLength === 0, `selected=${dragResult.selectionLength}`);

      console.log('\nreadability: chinese labels + raw id');
      const labels = await evaluate(`(() => {
        const panel = document.querySelector('[data-role="skill-bar-panel"]');
        const cards = [...panel.querySelectorAll('[data-skill]')];
        return cards.map((c) => ({ name: c.getAttribute('data-skill'), label: c.children[0].children[1].innerText, id: c.children[1].innerText }));
      })()`);
      const fanout = labels.find((c) => c.name === 'high-coverage-fanout');
      check('known skill shows a chinese label', fanout !== undefined && fanout.label === '高覆盖扇出', JSON.stringify(fanout));
      check('raw id stays visible next to it', fanout !== undefined && fanout.id === '/high-coverage-fanout', JSON.stringify(fanout));
      check('every card carries a label', labels.every((c) => c.label.trim() !== ''), JSON.stringify(labels));
      await evaluate(`document.querySelector('[data-role="skill-bar-panel"] [data-skill]').click()`);
      await sleep(300);
    }
  }
}

if (screenshotPath !== undefined) {
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(screenshotPath, Buffer.from(shot.data, 'base64'));
  console.log(`screenshot: ${screenshotPath}`);
}

console.log('\nconsole/errors');
const filtered = consoleErrors.filter((line) => !line.includes('favicon'));
for (const line of filtered) console.log(`  console: ${line}`);
for (const line of pageErrors) console.log(`  exception: ${line}`);
check('no uncaught page exception', pageErrors.length === 0, pageErrors.join(' | '));
check('no console error', filtered.length === 0, filtered.slice(0, 3).join(' | '));

socket.close();
if (failures.length > 0) {
  console.error(`\n${failures.length} failure(s):\n - ${failures.join('\n - ')}`);
  process.exit(1);
}
console.log('\nall browser checks passed');
