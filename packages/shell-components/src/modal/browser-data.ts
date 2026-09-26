export type CookieEntry = {
  name: string;
  value: string;
};

export type DatabaseInfo = {
  name: string;
  version: number;
  stores: string[];
};

export type DatabaseRecord = {
  key: IDBValidKey;
  keyText: string;
  value: unknown;
};

export function readCookies(): CookieEntry[] {
  if (!document.cookie) return [];
  return document.cookie.split("; ").filter(Boolean).map((part) => {
    const separator = part.indexOf("=");
    const name = separator < 0 ? part : part.slice(0, separator);
    const value = separator < 0 ? "" : part.slice(separator + 1);
    try {
      return { name: decodeURIComponent(name), value: decodeURIComponent(value) };
    } catch {
      return { name, value };
    }
  });
}

export function writeCookie(name: string, value: string) {
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; Path=/; SameSite=Lax${secure}`;
}

export function deleteCookie(name: string) {
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${encodeURIComponent(name)}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
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
    const request = indexedDB.open(name);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error(`Unable to open ${name}`));
    request.onblocked = () => reject(new Error(`Database ${name} is blocked by another tab`));
  });
}

export async function readStore(database: string, storeName: string): Promise<DatabaseRecord[]> {
  const connection = await openDatabase(database);
  try {
    const store = connection.transaction(storeName, "readonly").objectStore(storeName);
    const [keys, values] = await Promise.all([
      requestResult(store.getAllKeys(undefined, 501)),
      requestResult(store.getAll(undefined, 501)),
    ]);
    return keys.map((key, index) => ({ key, keyText: JSON.stringify(key), value: values[index] }));
  } finally {
    connection.close();
  }
}

export async function writeStoreRecord(database: string, storeName: string, record: DatabaseRecord) {
  const connection = await openDatabase(database);
  try {
    const transaction = connection.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);
    if (store.keyPath === null) store.put(record.value, record.key);
    else store.put(record.value);
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
    transaction.objectStore(storeName).delete(key);
    await transactionDone(transaction);
  } finally {
    connection.close();
  }
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction was aborted"));
  });
}
