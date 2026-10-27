import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import vm from 'node:vm';
function load(file, globals = {}) {
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const context = { exports: {}, ...globals };
  vm.runInNewContext(source, context);
  return context.exports;
}
test('cookie identities include domain, path, store and partition; raw values and flags survive updates', async () => {
  const calls = [];
  const cookie = { storeId: 'private', name: 'session', value: '%2Braw', domain: '.example.test', hostOnly: false, path: '/api', secure: true, httpOnly: true, sameSite: 'strict', session: false, expirationDate: 2000000000, partitionKey: { topLevelSite: 'https://top.test', hasCrossSiteAncestor: true } };
  const api = load('packages/shell-chrome/src/cookies.ts', { chrome: { cookies: {
    getAll: async details => details.partitionKey ? [cookie] : [{ ...cookie, path: '/', partitionKey: undefined }],
    set: async details => { calls.push(details); return details; },
  } } });
  const result = await api.listCookies('app.example.test', 'private');
  assert.equal(result.length, 2);
  assert.notEqual(result[0].id, result[1].id);
  assert.equal(api.matchesHost({ ...cookie, hostOnly: true, domain: 'example.test' }, 'app.example.test'), false);
  assert.equal(api.matchesHost(cookie, 'evil-example.test'), false);
  await api.updateCookie(cookie, 'new%2Fvalue');
  assert.equal(calls[0].value, 'new%2Fvalue');
  for (const key of ['domain', 'path', 'secure', 'httpOnly', 'sameSite', 'expirationDate', 'storeId']) assert.equal(calls[0][key], cookie[key]);
  assert.deepEqual(calls[0].partitionKey, cookie.partitionKey);
});
test('same-name domain removal expires only the selected identity', async () => {
  const cookie = { name: 'id', domain: 'app.example.test', hostOnly: true, path: '/', storeId: '0', secure: false, value: 'test', session: true, httpOnly: true, sameSite: 'lax' };
  let expired;
  const api = load('packages/shell-chrome/src/cookies.ts', { chrome: { cookies: {
    getAll: async () => [{ ...cookie, domain: '.example.test' }], set: async details => { expired = details; },
  } } });
  await api.removeCookie(cookie);
  assert.equal(expired.url, 'http://app.example.test/');
  assert.equal(expired.expirationDate, 0);
  assert.equal(expired.domain, undefined);
  assert.equal(expired.httpOnly, true);
});
test('IndexedDB keys round trip Date, binary and array without collision', () => {
  const api = load('packages/shell-components/src/modal/page-data.ts', { Date, Uint8Array, ArrayBuffer });
  for (const key of [42, '42', new Date('2026-01-01'), new Uint8Array([1, 2, 3]).buffer, ['42', new Date('2026-01-01')]]) {
    assert.deepEqual(structuredClone(api.decodeKey(api.encodeKey(key))), key);
  }
  assert.notEqual(api.encodeKey(42), api.encodeKey('42'));
});
test('JSON safety rejects values that would lose data on save', () => {
  const api = load('packages/shell-components/src/modal/page-data.ts', { Object, Date, Set, ArrayBuffer, Array });
  assert.equal(api.isJsonValue({ enabled: true, items: [1, null, 'a'] }), true);
  for (const value of [new Date(), new Map(), new Set(), new ArrayBuffer(4), { x: undefined }, NaN, -0, 1n]) assert.equal(api.isJsonValue(value), false);
  const cycle = {}; cycle.self = cycle;
  assert.equal(api.isJsonValue(cycle), false);
});
test('new storage entries do not overwrite existing keys, including empty key', () => {
  const values = new Map([['', 'original']]);
  const localStorage = { get length() { return values.size; }, key: index => [...values.keys()][index], getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const api = load('packages/shell-components/src/modal/page-data.ts', { localStorage, sessionStorage: localStorage });
  assert.throws(() => api.writeStorage('local', '', '', true), /already exists/);
  api.writeStorage('local', '', 'updated');
  assert.equal(api.readStorage('local').entries[0].value, 'updated');
});
test('auto-increment additions omit the optional key across Chrome JSON messaging', async () => {
  let request;
  const api = load('packages/shell-components/src/modal/browser-data.ts', {
    location: { origin: 'https://example.test' },
    chrome: { runtime: { id: 'fixture-extension', sendMessage: async message => { request = JSON.parse(JSON.stringify(message)); return { ok: true }; } } },
  });
  await api.addStoreRecord('db', 'store', { value: true });
  assert.equal(request.args.length, 3);
});
test('cookie operations choose the tab cookie store, including private stores', async () => {
  const api = load('packages/shell-chrome/src/cookies.ts', { chrome: { cookies: { getAllCookieStores: async () => [{ id: 'normal', tabIds: [1] }, { id: 'private', tabIds: [2] }] } } });
  assert.equal(await api.cookieContext({ tab: { id: 2 } }), 'private');
  await assert.rejects(api.cookieContext({ tab: { id: 3 } }), /cookie store/);
});
