import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
test('close and next toolbar click reopen the panel', () => {
  let mounted = false;
  const source = ts.transpileModule(fs.readFileSync('packages/shell-components/src/utils/register.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const context = { exports: {}, require: name => name === 'vue' ? { createApp: () => ({ mount() { mounted = true; }, unmount() { mounted = false; } }) } : { ShellComponentContainer: 'test' }, document: { getElementById: () => ({}) } };
  vm.createContext(context);
  vm.runInContext(source + '\nexports.registerEl({});', context);
  mounted = false; // close the rendered dialog without unregistering its app
  vm.runInContext('exports.registerEl({});', context);
  assert.equal(mounted, true);
});
