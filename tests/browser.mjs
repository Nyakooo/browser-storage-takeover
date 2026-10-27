// Run after pnpm build. PLAYWRIGHT_MODULE may point to a shared Playwright install.
import { createRequire } from 'node:module';
import https from 'node:https';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'storage-inspector-test-'));
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', `${temp}/key.pem`, '-out', `${temp}/cert.pem`, '-subj', '/CN=example.test', '-days', '1'], { stdio: 'ignore' });
const server = https.createServer({ key: fs.readFileSync(`${temp}/key.pem`), cert: fs.readFileSync(`${temp}/cert.pem`) }, (req, res) => {
  res.setHeader('Content-Security-Policy', "script-src 'none'; style-src 'none'");
  res.setHeader('Set-Cookie', [
    'auth=secret-fixture; HttpOnly; Secure; SameSite=Strict; Path=/',
    'same=root; Secure; Path=/', 'same=nested; Secure; Path=/api',
    'shared=parent; Secure; Domain=example.test; Path=/',
    'same=parent; Secure; Domain=example.test; Path=/',
    'chips=partitioned; Secure; SameSite=None; Partitioned; Path=/',
  ]);
  res.end(`<h1>Storage fixture</h1>${req.url === '/' ? `<iframe src="https://b.example.test:${server.address().port}/frame"></iframe>` : ''}`);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let context;
try {
  context = await chromium.launchPersistentContext(`${temp}/profile`, {
    headless: true, ignoreHTTPSErrors: true, channel: 'chromium',
    ignoreDefaultArgs: ['--disable-extensions'],
    args: ['--no-sandbox', '--no-proxy-server', '--ignore-certificate-errors', '--host-resolver-rules=MAP *.example.test 127.0.0.1',
      `--disable-extensions-except=${path.resolve('packages/shell-chrome/build')}`, `--load-extension=${path.resolve('packages/shell-chrome/build')}`],
  });
  const errors = [];
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => dialog.accept());
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  const base = `https://a.example.test:${server.address().port}`;
  await page.goto(base);
  await page.waitForFunction(() => document.querySelector('iframe')?.contentWindow);
  await page.evaluate(async () => {
    localStorage.setItem('', 'empty-key'); localStorage.setItem('top', 'top-value'); sessionStorage.setItem('session', 'tab-value');
    await new Promise((resolve, reject) => {
      const request = indexedDB.open('fixture', 1);
      request.onupgradeneeded = () => { request.result.createObjectStore('inline', { keyPath: 'id' }); request.result.createObjectStore('out'); request.result.createObjectStore('auto', { autoIncrement: true }); };
      request.onerror = reject;
      request.onsuccess = () => {
        const db = request.result, tx = db.transaction(['inline', 'out'], 'readwrite');
        tx.objectStore('inline').put({ id: 1, text: 'original' });
        for (let i = 0; i < 510; i++) tx.objectStore('out').put({ index: i }, i);
        tx.objectStore('out').put(new Date('2026-01-01'), 'date-value');
        tx.objectStore('out').put({ dateKey: true }, new Date('2026-01-01'));
        tx.objectStore('out').put({ binaryKey: true }, new Uint8Array([3, 4]).buffer);
        tx.oncomplete = () => { db.close(); resolve(); };
      };
    });
  });
  const child = page.frames().find(frame => frame.url().includes('b.example.test'));
  await child.evaluate(() => { localStorage.setItem('child', 'child-value'); sessionStorage.setItem('child-session', 'child-tab'); });
  const tabId = await worker.evaluate(async () => (await chrome.tabs.query({})).find(tab => tab.url?.includes('a.example.test')).id);
  const open = () => worker.evaluate(tabId => chrome.tabs.sendMessage(tabId, { type: 'browser-storage-takeover:event:command:triggering', to: 'content' }, { frameId: 0 }), tabId);
  await open();
  const cdp = await context.newCDPSession(page);
  async function rootObject() {
    const tree = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
    function find(node) {
      if (node.attributes?.includes('__browser-storage-takeover_shell_components_container__')) return node.shadowRoots?.[0];
      for (const child of [...node.children ?? [], ...node.shadowRoots ?? []]) { const match = find(child); if (match) return match; }
    }
    const root = find(tree.root);
    assert.ok(root, 'closed shadow root exists');
    return (await cdp.send('DOM.resolveNode', { backendNodeId: root.backendNodeId })).object.objectId;
  }
  async function ui(selector, action = 'text', value = '') {
    const result = await cdp.send('Runtime.callFunctionOn', { objectId: await rootObject(),
      functionDeclaration: `function(selector, action, value) {
        const elements = Array.from(this.querySelectorAll(selector));
        const element = elements.find(el => !value || action === 'fill' || action === 'select' || (el.textContent || '').includes(value));
        if (!element) return null;
        if (action === 'click') element.click();
        if (action === 'fill' || action === 'select') { element.value = value; element.dispatchEvent(new Event(action === 'select' ? 'change' : 'input', { bubbles:true })); }
        if (action === 'style') return { position: getComputedStyle(element).position, display: getComputedStyle(element).display };
        if (action === 'state') return { readOnly: element.readOnly, value: element.value, disabled: element.disabled };
        if (action === 'options') return Array.from(element.options).map(option => ({ value: option.value, text: option.textContent }));
        return element.textContent;
      }`, arguments: [{ value: selector }, { value: action }, { value }], returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  }
  async function until(predicate, label) {
    for (let attempt = 0; attempt < 100; attempt++) { if (await predicate()) return; await new Promise(resolve => setTimeout(resolve, 50)); }
    throw new Error(`Timed out: ${label}; UI: ${await ui('.main-panel')}`);
  }
  await until(async () => (await ui('.list-pane'))?.includes('top'), 'top storage loaded under CSP');
  assert.equal(await page.evaluate(() => document.querySelector('[id^="__browser-storage"]').shadowRoot), null, 'website cannot read cookie UI');
  assert.equal(await page.evaluate(() => window.__component__), undefined, 'website cannot invoke privileged component');
  await ui('.close-button', 'click'); await open();
  await until(async () => !!await ui('.overlay'), 'single click reopens');
  await ui('.nav-item', 'click', 'Cookies');
  await until(async () => (await ui('.list-pane'))?.includes('auth'), 'HttpOnly cookie appears');
  assert.equal((await ui('.overlay', 'style')).position, 'fixed', 'extension CSS loads under strict page CSP');
  if (process.env.BROWSER_SCREENSHOT) await page.screenshot({ path: process.env.BROWSER_SCREENSHOT });
  const cookieText = await ui('.list-pane');
  assert.ok(cookieText.includes('/api'), 'off-path cookie appears');
  assert.ok(cookieText.includes('Partitioned'), 'partitioned cookie appears');
  assert.ok(cookieText.includes('.example.test'), 'parent-domain cookie appears');
  await ui('.data-row', 'click', 'auth'); await ui('textarea', 'fill', 'updated-fixture'); await ui('.action-button', 'click', 'Save changes');
  await until(async () => (await ui('.statusbar'))?.includes('Saved'), 'cookie saved');
  const saved = await worker.evaluate(async () => (await chrome.cookies.getAll({ name: 'auth', domain: 'a.example.test' }))[0]);
  assert.equal(saved.value, 'updated-fixture'); assert.equal(saved.httpOnly, true); assert.equal(saved.secure, true); assert.equal(saved.sameSite, 'strict');
  await ui('.data-row', 'click', 'a.example.test · / · root');
  await ui('.action-button', 'click', 'Remove');
  await until(async () => !(await ui('.list-pane'))?.includes('a.example.test · / · root'), 'exact host-only cookie removed');
  const remaining = await worker.evaluate(() => chrome.cookies.getAll({ name: 'same' }));
  assert.ok(remaining.some(cookie => cookie.domain === '.example.test' && cookie.path === '/'), 'same-name parent cookie survives');
  assert.ok(remaining.some(cookie => cookie.domain === 'a.example.test' && cookie.path === '/api'), 'same-name other-path cookie survives');
  const options = await ui('.main-panel > .db-toolbar select', 'options');
  const childOption = options.find(option => option.text.includes('b.example.test'));
  assert.ok(childOption, 'cross-origin frame listed');
  await ui('.main-panel > .db-toolbar select', 'select', childOption.value);
  await ui('.nav-item', 'click', 'Local storage');
  await until(async () => (await ui('.list-pane'))?.includes('child'), 'child storage loaded');
  assert.ok(!(await ui('.list-pane')).includes('top-value'));
  await ui('.data-row', 'click', 'child'); await ui('textarea', 'fill', 'child-updated'); await ui('.action-button', 'click', 'Save changes');
  await until(async () => (await ui('.statusbar'))?.includes('Saved'), 'child write completed');
  assert.equal(await child.evaluate(() => localStorage.getItem('child')), 'child-updated');
  assert.equal(await page.evaluate(() => localStorage.getItem('top')), 'top-value');
  await ui('.nav-item', 'click', 'Session storage');
  await until(async () => (await ui('.list-pane'))?.includes('child-session'), 'child session loaded');
  await ui('textarea', 'fill', 'session-updated'); await ui('.action-button', 'click', 'Save changes');
  await until(async () => (await child.evaluate(() => sessionStorage.getItem('child-session'))) === 'session-updated', 'child session written');
  assert.equal(await page.evaluate(() => sessionStorage.getItem('session')), 'tab-value');
  await ui('.main-panel > .db-toolbar select', 'select', '0');
  await ui('.nav-item', 'click', 'IndexedDB');
  await until(async () => (await ui('select.db-select:nth-of-type(2)'))?.includes('inline'), 'IndexedDB stores loaded');
  await ui('select.db-select:nth-of-type(2)', 'select', 'inline');
  await until(async () => (await ui('.list-pane'))?.includes('original'), 'IndexedDB inline records loaded');
  await ui('textarea', 'fill', '{"id":2,"text":"changed"}'); await ui('.action-button', 'click', 'Save JSON');
  await until(async () => (await ui('[role=alert]'))?.includes('primary key'), 'inline primary key change rejected');
  await ui('select.db-select:nth-of-type(2)', 'select', 'auto');
  await until(async () => (await ui('.editor-pane'))?.includes('add one'), 'auto store loaded');
  await ui('.action-button', 'click', 'New record');
  await ui('textarea', 'fill', '{"created":true}');
  await ui('.action-button', 'click', 'Add record');
  await until(async () => (await ui('.list-pane'))?.includes('["number",1]'), 'auto-increment record added without explicit key');
  await ui('select.db-select:nth-of-type(2)', 'select', 'out');
  await until(async () => (await ui('.list-pane'))?.includes('["number",0]'), 'first page loaded');
  await ui('.action-button', 'click', 'Next 500');
  await until(async () => (await ui('.count-tag'))?.includes('page 2'), 'next page loaded');
  await until(async () => (await ui('.list-pane'))?.includes('date-value'), 'records beyond 500 visible');
  await ui('.data-row', 'click', 'date-value');
  assert.equal((await ui('textarea', 'state')).readOnly, true, 'special value is read-only');
  await ui('.data-row', 'click', '["date",');
  await ui('textarea', 'fill', '{"dateKey":"updated"}'); await ui('.action-button', 'click', 'Save JSON');
  await until(async () => (await ui('.statusbar'))?.includes('Saved'), 'date key update saved');
  const dateValue = await page.evaluate(() => new Promise(resolve => { const request = indexedDB.open('fixture'); request.onsuccess = () => { const db = request.result; const read = db.transaction('out').objectStore('out').get(new Date('2026-01-01')); read.onsuccess = () => { resolve(read.result); db.close(); }; }; }));
  assert.equal(dateValue.dateKey, 'updated');
  await ui('.nav-item', 'click', 'Local storage');
  await until(async () => (await ui('.list-pane'))?.includes('empty-key'), 'empty-string key visible');
  await ui('textarea', 'fill', 'empty-updated'); await ui('.action-button', 'click', 'Save changes');
  await until(async () => (await page.evaluate(() => localStorage.getItem(''))) === 'empty-updated', 'empty-string key editable');
  await ui('.nav-item', 'click', 'Cookies');
  await until(async () => (await ui('.list-pane'))?.includes('auth'), 'cookies reloaded');
  await ui('.toolbar-actions .action-button', 'click', 'Clear all');
  await until(async () => (await ui('.list-pane'))?.includes('No cookies match'), 'all scoped cookies cleared');
  const otherHostCookies = await worker.evaluate(() => chrome.cookies.getAll({ domain: 'b.example.test' }));
  assert.ok(otherHostCookies.some(cookie => cookie.name === 'auth'), 'unrelated host-only cookies survive clearing');
  await ui('.main-panel > .db-toolbar select', 'select', childOption.value);
  await ui('.nav-item', 'click', 'Local storage');
  await until(async () => (await ui('.list-pane'))?.includes('child-updated'), 'child selected before navigation');
  await child.goto(`https://c.example.test:${server.address().port}/frame`);
  await ui('textarea', 'fill', 'must-not-write-to-new-origin'); await ui('.action-button', 'click', 'Save changes');
  await until(async () => (await ui('[role=alert]'))?.includes('navigated'), 'stale origin rejected');
  assert.equal(await child.evaluate(() => localStorage.getItem('child')), null, 'new origin remains untouched');
  await ui('.action-button', 'click', 'Reload frames');
  await until(async () => (await ui('.site-copy'))?.includes('c.example.test'), 'frame list reload updates origin');
  console.log('PASS: isolated UI/CSP, reopen, HttpOnly/path/partition/domain cookies, attribute-preserving update, cross-origin frame storage, IndexedDB primary-key protection, auto-increment, pagination and typed-key writes');
  assert.deepEqual(errors, []);
} finally {
  await context?.close(); server.close(); fs.rmSync(temp, { recursive: true, force: true });
}
