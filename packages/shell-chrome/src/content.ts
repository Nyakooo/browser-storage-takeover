import { ShellComponentContainer, NoticeKey } from '@takeover/shared-utils';

let componentMount: HTMLDivElement | undefined;
let componentHost: HTMLDivElement | undefined;
chrome.runtime.onMessage.addListener((message, _sender, respond) => {
  if (message.type === NoticeKey.COMMAND_TRIGGERING && message.to === 'content') {
    if (!componentHost?.isConnected) {
      const host = document.createElement('div');
      componentHost = host;
      host.id = ShellComponentContainer;
      host.style.cssText = 'all:initial !important;position:fixed !important;inset:0 !important;z-index:2147483647 !important;pointer-events:none !important;';
      const shadow = host.attachShadow({ mode: 'closed' });
      const style = document.createElement('link');
      style.rel = 'stylesheet';
      style.href = chrome.runtime.getURL('components/style.css');
      const mount = document.createElement('div');
      componentMount = mount;
      mount.id = 'app';
      mount.style.pointerEvents = 'auto';
      shadow.append(style, mount);
      document.documentElement.append(host);
    }
    window.__component__.register('modal', componentMount);
    respond({ ok: true });
  }
});

import * as data from '../../shell-components/src/modal/page-data';
const operations: Record<string, (...args: any[]) => unknown> = {
  readStorage: data.readStorage, writeStorage: data.writeStorage, removeStorage: data.removeStorage,
  clearStorage: data.clearStorage, listDatabases: data.listDatabases, readStore: data.readStore,
  writeStoreRecord: data.writeStoreRecord, addStoreRecord: data.addStoreRecord,
  deleteStoreRecord: data.deleteStoreRecord, clearAllIndexedDBRecords: data.clearAllIndexedDBRecords,
};
chrome.runtime.onMessage.addListener((message, _sender, respond) => {
  if (message.action?.startsWith('data:')) {
    if (message.origin !== location.origin) { respond({ ok: false, error: 'Frame origin changed; refresh the frame list.' }); return; }
    const operation = operations[message.action.slice(5)];
    if (!operation) return;
    Promise.resolve().then(() => operation(...message.args)).then(
      value => respond({ ok: true, value }),
      error => respond({ ok: false, error: String(error) }),
    );
    return true;
  }
});
