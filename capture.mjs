// Capture a clean screenshot of the skill bar for review: dismisses the
// welcome notice, opens a session, opens the panel, and shoots the viewport.
// Usage: node capture.mjs <cdp-port> <url> <outPath>
import { writeFileSync } from 'node:fs';
const [portArg, url, outPath] = process.argv.slice(2);
const port = Number(portArg);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
for (const target of list.filter((t) => t.type === 'page').slice(0, -1)) {
  await fetch(`http://127.0.0.1:${port}/json/close/${target.id}`).catch(() => {});
}
const page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page');
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve) => socket.addEventListener('open', resolve, { once: true }));
let nextId = 0;
const pending = new Map();
socket.addEventListener('message', (event) => {
  const message = JSON.parse(typeof event.data === 'string' ? event.data : String(event.data));
  if (message.id !== undefined && pending.has(message.id)) {
    pending.get(message.id)(message.result ?? message.error);
    pending.delete(message.id);
  }
});
const send = (method, params = {}) => new Promise((resolve) => {
  const id = (nextId += 1);
  pending.set(id, resolve);
  socket.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expression) => {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  return result.exceptionDetails ? undefined : result.result?.value;
};

await send('Runtime.enable');
await send('Page.navigate', { url });
await sleep(9000);
// Dismiss the first-run notice if the shell drew one.
await evaluate(`(() => {
  const buttons = [...document.querySelectorAll('button')];
  const dismiss = buttons.find((b) => /继续|Continue/.test(b.textContent || ''));
  if (dismiss) dismiss.click();
  return dismiss !== undefined;
})()`);
await sleep(1200);
// Make sure a Session exists so the composer is live.
const session = await evaluate(`(() => {
  const buttons = [...document.querySelectorAll('button, a')];
  const fresh = buttons.find((b) => /新会话|New session|New chat/.test(b.textContent || ''));
  if (fresh) { fresh.click(); return 'clicked new session'; }
  return 'no new-session control';
})()`);
console.log(`session: ${session}`);
await sleep(2500);
const opened = await evaluate(`(() => {
  const trigger = document.querySelector('[data-role="skill-bar-trigger"]');
  if (!trigger) return 'no trigger';
  trigger.click();
  return 'clicked';
})()`);
console.log(`trigger: ${opened}`);
await sleep(1200);
const outline = await evaluate(`(() => {
  const panel = document.querySelector('[data-role="skill-bar-panel"]');
  const trigger = document.querySelector('[data-role="skill-bar-trigger"]');
  return {
    triggerText: trigger?.innerText ?? null,
    panelText: panel?.innerText?.slice(0, 400) ?? null,
    cardCount: panel?.querySelectorAll('[data-skill]').length ?? 0,
    localStorageKeys: Object.keys(localStorage).filter((k) => k.startsWith('dsh.skillBar'))
  };
})()`);
console.log(JSON.stringify(outline, null, 2));
const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(outPath, Buffer.from(shot.data, 'base64'));
console.log(`screenshot: ${outPath}`);
socket.close();
