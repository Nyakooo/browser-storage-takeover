export type { DatabaseInfo, DatabaseRecord } from './page-data';
import type { DatabaseRecord } from './page-data';
export type CookieEntry = chrome.cookies.Cookie & { id: string };
export type Frame = { frameId: number; url: string };
let frameId = 0;
let origin = location.origin;
export function setFrame(id: number, selectedOrigin: string) { frameId = id; origin = selectedOrigin; }
export async function rpc<T>(action: string, args: unknown[] = []): Promise<T> {
  if (typeof chrome === 'undefined' || !chrome.runtime?.id) throw new Error('Load the built extension in Chrome or Edge to inspect website data.');
  const response = await chrome.runtime.sendMessage({ action, args, frameId, origin });
  if (!response?.ok) throw new Error(response?.error ?? 'Extension connection lost; reload the page.');
  return response.value;
}
export const listFrames = () => rpc<Frame[]>('frames');
export const readCookies = (host: string) => rpc<CookieEntry[]>('cookies:list', [host]);
export const writeCookie = (cookie: CookieEntry, value: string) => rpc('cookies:update', [cookie, value]);
export const addCookie = (host: string, name: string, value: string, path: string, secure: boolean) => rpc('cookies:add', [host, name, value, path, secure]);
export const deleteCookie = (cookie: CookieEntry) => rpc('cookies:remove', [cookie]);
export const clearHostCookies = (host: string) => rpc<number>('cookies:clear', [host]);
export type StorageSnapshot = { entries: { key: string; value: string }[]; localCount: number; sessionCount: number };
export const readStorage = (kind: string) => rpc<StorageSnapshot>('data:readStorage', [kind]);
export const writeStorage = (kind: string, key: string, value: string, create = false) => rpc('data:writeStorage', [kind, key, value, create]);
export const removeStorage = (kind: string, key: string) => rpc('data:removeStorage', [kind, key]);
export const clearStorage = (kind: string) => rpc('data:clearStorage', [kind]);
export const listDatabases = () => rpc<import('./page-data').DatabaseInfo[]>('data:listDatabases');
export const readStore = (db: string, store: string, offset = 0) => rpc<DatabaseRecord[]>('data:readStore', [db, store, offset]);
export const writeStoreRecord = (db: string, store: string, record: DatabaseRecord) => rpc('data:writeStoreRecord', [db, store, record]);
export const addStoreRecord = (db: string, store: string, value: unknown, key?: IDBValidKey) => rpc('data:addStoreRecord', [db, store, value, ...(key === undefined ? [] : [key])]);
export const deleteStoreRecord = (db: string, store: string, key: IDBValidKey) => rpc('data:deleteStoreRecord', [db, store, key]);
export const clearAllIndexedDBRecords = () => rpc<number>('data:clearAllIndexedDBRecords');
