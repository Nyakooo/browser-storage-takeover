export type DatabaseInfo = {
  name: string;
  version: number;
  stores: string[];
};

export type DatabaseRecord = {
  key: IDBValidKey;
  keyText: string;
  value: unknown;
  editable?: boolean;
};

export async function clearAllIndexedDBRecords(): Promise<number> {
  if (!indexedDB.databases) throw new Error("This browser cannot enumerate IndexedDB databases");
  const databases = (await indexedDB.databases()).filter((database) => database.name);
  let clearedStores = 0;

  for (const database of databases) {
    const connection = await openDatabase(database.name!);
    try {
      const storeNames = Array.from(connection.objectStoreNames);
      if (!storeNames.length) continue;
      const transaction = connection.transaction(storeNames, "readwrite");
      for (const storeName of storeNames) transaction.objectStore(storeName).clear();
      await transactionDone(transaction);
      clearedStores += storeNames.length;
    } finally {
      connection.close();
    }
  }

  return clearedStores;
}

export async function listDatabases(): Promise<DatabaseInfo[]> {
  if (!indexedDB.databases) return [];
  const databases = await indexedDB.databases();
  const result = await Promise.all(databases.filter((db) => db.name).map(async (db) => {
    const connection = await openDatabase(db.name!);
    const info = { name: connection.name, version: connection.version, stores: Array.from(connection.objectStoreNames) };
    connection.close();
    return info;
  }));
  return result.sort((a, b) => a.name.localeCompare(b.name));
}

export function openDatabase(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let blocked = false;
    const request = indexedDB.open(name);
    request.onsuccess = () => {
      if (blocked) { request.result.close(); return; }
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onupgradeneeded = () => { request.transaction?.abort(); };
    request.onerror = () => reject(request.error ?? new Error(`Unable to open ${name}`));
    request.onblocked = () => { blocked = true; reject(new Error(`Database ${name} is blocked by another tab`)); };
  });
}

export async function readStore(database: string, storeName: string, offset = 0): Promise<DatabaseRecord[]> {
  const connection = await openDatabase(database);
  try {
    const transaction = connection.transaction(storeName, "readonly");
    const result: DatabaseRecord[] = [];
    await new Promise<void>((resolve, reject) => {
      const request = transaction.objectStore(storeName).openCursor();
      let skipped = false;
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor || result.length === 501) { resolve(); return; }
        if (offset && !skipped) { skipped = true; cursor.advance(offset); return; }
        const editable = isJsonValue(cursor.value);
        result.push({ key: encodeKey(cursor.key), keyText: keyLabel(cursor.key),
          value: editable ? cursor.value : describeValue(cursor.value), editable });
        cursor.continue();
      };
    });
    return result;
  } finally { connection.close(); }
}

export function isJsonValue(value: unknown, seen = new Set<unknown>()): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value) && !Object.is(value, -0);
  if (typeof value !== 'object' || seen.has(value)) return false;
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype) return false;
  seen.add(value);
  const values = Array.isArray(value) ? Array.from(value) : Object.values(value);
  const valid = values.every(item => isJsonValue(item, seen));
  return valid;
}
export function describeValue(value: unknown): string {
  const seen = new Map<object, string>();
  function visit(value: any, path: string): unknown {
    if (value === undefined) return { $type: 'Undefined' };
    if (typeof value === 'bigint') return { $type: 'BigInt', value: String(value) };
    if (typeof value === 'number' && (!Number.isFinite(value) || Object.is(value, -0))) return { $type: 'Number', value: Object.is(value, -0) ? '-0' : String(value) };
    if (value === null || typeof value !== 'object') return value;
    if (seen.has(value)) return { $ref: seen.get(value) };
    seen.set(value, path);
    if (value instanceof Date) return { $type: 'Date', value: Number.isNaN(value.getTime()) ? 'Invalid Date' : value.toISOString() };
    if (value instanceof Map) return { $type: 'Map', entries: [...value].map(([key, item], i) => [visit(key, `${path}.keys[${i}]`), visit(item, `${path}.values[${i}]`)]) };
    if (value instanceof Set) return { $type: 'Set', values: [...value].map((item, i) => visit(item, `${path}[${i}]`)) };
    if (value instanceof RegExp) return { $type: 'RegExp', source: value.source, flags: value.flags };
    if (value instanceof Blob) return { $type: value instanceof File ? 'File' : 'Blob', size: value.size, mimeType: value.type, ...(value instanceof File ? { name: value.name } : {}) };
    if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
      const bytes = value instanceof ArrayBuffer ? new Uint8Array(value) : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
      return { $type: value.constructor.name, byteLength: bytes.byteLength, firstBytes: [...bytes.subarray(0, 256)] };
    }
    if (Array.isArray(value)) return Array.from(value, (item, i) => visit(item, `${path}[${i}]`));
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, visit(item, `${path}.${key}`)]));
  }
  return JSON.stringify(visit(value, '$'), null, 2);
}

function keyShape(key: IDBValidKey): unknown {
  if (key instanceof Date) return ['date', key.toISOString()];
  if (key instanceof ArrayBuffer || ArrayBuffer.isView(key)) {
    const bytes = key instanceof ArrayBuffer ? new Uint8Array(key) : new Uint8Array(key.buffer, key.byteOffset, key.byteLength);
    return ['binary', Array.from(bytes)];
  }
  if (Array.isArray(key)) return ['array', key.map(keyShape)];
  return [typeof key, key];
}
export function encodeKey(key: IDBValidKey): string { return JSON.stringify(keyShape(key)); }
export function decodeKey(token: IDBValidKey): IDBValidKey {
  const decode = ([type, value]: any): IDBValidKey => {
    if (type === 'date') return new Date(value);
    if (type === 'binary') return new Uint8Array(value).buffer;
    if (type === 'array') return value.map(decode);
    return value;
  };
  return decode(JSON.parse(String(token)));
}
function keyLabel(key: IDBValidKey): string { return encodeKey(key); }

export async function writeStoreRecord(database: string, storeName: string, record: DatabaseRecord) {
  const connection = await openDatabase(database);
  try {
    const transaction = connection.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);
    const originalKey = decodeKey(record.key);
    if (!isJsonValue(record.value)) throw new Error('Only JSON-compatible values can be edited');
    if (store.keyPath === null) store.put(record.value, originalKey);
    else {
      const extract = (path: string) => path ? path.split('.').reduce<any>((value, part) => value?.[part], record.value) : record.value;
      const nextKey = Array.isArray(store.keyPath) ? store.keyPath.map(extract) : extract(store.keyPath);
      if (nextKey === undefined || indexedDB.cmp(originalKey, nextKey) !== 0) throw new Error('The primary key cannot be changed while editing. Add a new record instead.');
      store.put(record.value);
    }
    await transactionDone(transaction);
  } finally {
    connection.close();
  }
}

export async function addStoreRecord(database: string, storeName: string, value: unknown, key?: IDBValidKey) {
  const connection = await openDatabase(database);
  try {
    const transaction = connection.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);
    if (store.keyPath !== null && key !== undefined) throw new Error("This store uses an inline key. Include the key in the JSON value and leave Primary key blank.");
    if (store.keyPath === null && key !== undefined) store.add(value, key);
    else store.add(value);
    await transactionDone(transaction);
  } finally {
    connection.close();
  }
}

export async function deleteStoreRecord(database: string, storeName: string, key: IDBValidKey) {
  const connection = await openDatabase(database);
  try {
    const transaction = connection.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).delete(decodeKey(key));
    await transactionDone(transaction);
  } finally {
    connection.close();
  }
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction was aborted"));
  });
}

function storage(kind: string) {
  if (kind === 'local') return localStorage;
  if (kind === 'session') return sessionStorage;
  throw new Error('Unknown storage kind');
}
export function readStorage(kind: string) {
  const target = storage(kind);
  const entries = Array.from({ length: target.length }, (_, index) => target.key(index)!)
    .sort().map(key => ({ key, value: target.getItem(key) ?? '' }));
  let localCount = 0, sessionCount = 0;
  try { localCount = localStorage.length; } catch { /* independent access restrictions */ }
  try { sessionCount = sessionStorage.length; } catch { /* independent access restrictions */ }
  return { entries, localCount, sessionCount };
}
export function writeStorage(kind: string, key: string, value: string, create = false) {
  const target = storage(kind);
  if (create && target.getItem(key) !== null) throw new Error('This key already exists. Select it to edit its value.');
  target.setItem(key, value);
}
export function removeStorage(kind: string, key: string) { storage(kind).removeItem(key); }
export function clearStorage(kind: string) { storage(kind).clear(); }
