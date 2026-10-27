<script setup lang="ts">
import { computed, onMounted, ref, shallowRef, watch } from "vue";
import UiIcon from "../components/UiIcon.vue";
import {
  addStoreRecord,
  addCookie, readStorage, writeStorage, removeStorage, clearStorage, listFrames, setFrame,
  type CookieEntry, type Frame,
  clearAllIndexedDBRecords,
  clearHostCookies,
  DatabaseInfo,
  DatabaseRecord,
  deleteCookie,
  deleteStoreRecord,
  listDatabases,
  readCookies,
  readStore,
  writeCookie,
  writeStoreRecord,
} from "./browser-data";

type Panel = "local" | "session" | "cookies" | "indexeddb";
const panels: { id: Panel; label: string }[] = [
  { id: "local", label: "Local storage" },
  { id: "session", label: "Session storage" },
  { id: "cookies", label: "Cookies" },
  { id: "indexeddb", label: "IndexedDB" },
];
const activePanel = ref<Panel>("local");
const searchText = ref("");
const localEntries = ref<{ key: string; value: string }[]>([]);
const localCount = ref(0);
const sessionCount = ref(0);
const cookies = ref<CookieEntry[]>([]);
const databases = ref<DatabaseInfo[]>([]);
const selectedDatabase = ref("");
const selectedStore = ref("");
const records = shallowRef<DatabaseRecord[]>([]);
const selectedKey = ref("");
const editorValue = ref("");
const originalValue = ref("");
const jsonView = ref(false);
const cookieName = ref("");
const cookieValue = ref("");
const newKey = ref("");
const newRecordKey = ref("");
const previousRecordKey = ref("");
const isNewRecord = ref(false);
const busy = ref(false);
const notice = ref("");
const operationError = ref("");
const frames = ref<Frame[]>([]);
const selectedFrame = ref(0);
const siteHost = computed(() => new URL(frames.value.find(frame => frame.frameId === selectedFrame.value)?.url ?? location.href).hostname);
const siteOrigin = computed(() => new URL(frames.value.find(frame => frame.frameId === selectedFrame.value)?.url ?? location.href).origin);
const cookiePath = ref('/');
const cookieSecure = computed(() => new URL(frames.value.find(frame => frame.frameId === selectedFrame.value)?.url ?? location.href).protocol === 'https:');
const recordPage = ref(0);
const hasMore = ref(false);
let generation = 0;
let cookieGeneration = 0;
let storageGeneration = 0;
const hasIndexedDB = typeof indexedDB.databases === "function";


const storageEntries = computed(() => localEntries.value.filter((entry) => entry.key.toLowerCase().includes(searchText.value.toLowerCase())));
const visibleCookies = computed(() => cookies.value.filter((entry) => `${entry.name} ${entry.domain} ${entry.path}`.toLowerCase().includes(searchText.value.toLowerCase())));
const visibleRecords = computed(() => {
  const query = searchText.value.toLowerCase();
  return records.value.slice(0, 500).filter((entry: DatabaseRecord) => entry.keyText.toLowerCase().includes(query));
});
const stores = computed(() => databases.value.find((db) => db.name === selectedDatabase.value)?.stores ?? []);
const databaseOptions = computed(() => databases.value.map((db) => ({ label: `${db.name}  ·  v${db.version}`, value: db.name })));
const storeOptions = computed(() => stores.value.map((store) => ({ label: store, value: store })));
const activeTitle = computed(() => panels.find((panel) => panel.id === activePanel.value)?.label ?? "Storage");
const selectedCookie = computed(() => cookies.value.find((cookie) => cookie.id === selectedKey.value));
const selectedRecord = computed(() => records.value.find((record) => record.keyText === selectedKey.value));
const formattedJson = computed(() => {
  try { return JSON.stringify(JSON.parse(editorValue.value), null, 2); }
  catch { return ""; }
});
const canFormatJson = computed(() => formattedJson.value !== "");
const hasUnsavedChanges = computed(() => editorValue.value !== originalValue.value || isNewRecord.value);

async function refreshStorage() {
  const request = ++storageGeneration;
  try {
    const snapshot = await readStorage(activePanel.value);
    if (request !== storageGeneration) return;
    localCount.value = snapshot.localCount;
    sessionCount.value = snapshot.sessionCount;
    localEntries.value = snapshot.entries;
    selectEntry(localEntries.value.some(entry => entry.key === selectedKey.value) ? selectedKey.value : localEntries.value[0]?.key ?? '');
  } catch (error) { if (request === storageGeneration) { localEntries.value = []; report(error); } }
}
function report(error: unknown) { operationError.value = error instanceof Error ? error.message : String(error); }
async function perform(action: () => Promise<unknown>) {
  if (busy.value) return;
  busy.value = true;
  operationError.value = '';
  try { await action(); } catch (error) { report(error); } finally { busy.value = false; }
}
function discardChanges() {
  if (busy.value) return false;
  return !hasUnsavedChanges.value || window.confirm('Discard unsaved changes?');
}
function selectEntry(key: string) {
  jsonView.value = false;
  selectedKey.value = key;
  const entry = localEntries.value.find((item) => item.key === key);
  editorValue.value = entry?.value ?? "";
  originalValue.value = editorValue.value;
}

function selectCookie(id: string) {
  jsonView.value = false;
  selectedKey.value = id;
  editorValue.value = cookies.value.find((cookie) => cookie.id === id)?.value ?? "";
  originalValue.value = editorValue.value;
}

function selectRecord(record: DatabaseRecord) {
  jsonView.value = false;
  isNewRecord.value = false;
  selectedKey.value = record.keyText;
  editorValue.value = record.editable === false ? String(record.value) : pretty(record.value);
  originalValue.value = editorValue.value;
}

function pretty(value: unknown) {
  try { return JSON.stringify(value, null, 2) ?? "null"; }
  catch { return String(value); }
}

function flash(message: string) {
  notice.value = message;
  window.setTimeout(() => { if (notice.value === message) notice.value = ""; }, 1800);
}

function switchPanel(panel: Panel) {
  if (busy.value || !discardChanges()) return;
  generation++; cookieGeneration++; storageGeneration++;
  operationError.value = "";
  activePanel.value = panel;
  searchText.value = "";
  jsonView.value = false;
  isNewRecord.value = false;
  selectedKey.value = "";
  editorValue.value = "";
  originalValue.value = "";
  recordPage.value = 0;
  notice.value = "";
  if (panel === "local" || panel === "session") refreshStorage();
  if (panel === "cookies") refreshCookies();
  if (panel === "indexeddb") void refreshDatabases();
}

async function refreshCookies() {
  const request = ++cookieGeneration;
  try {
    const result = await readCookies(siteHost.value);
    if (request !== cookieGeneration) return;
    cookies.value = result.sort((a, b) => a.name.localeCompare(b.name) || a.domain.localeCompare(b.domain) || a.path.localeCompare(b.path));
    selectCookie(cookies.value.some(cookie => cookie.id === selectedKey.value) ? selectedKey.value : cookies.value[0]?.id ?? '');
  } catch (error) { if (request === cookieGeneration) { cookies.value = []; report(error); } }
}
async function refreshDatabases() {
  const request = ++generation;
  operationError.value = "";
  try {
    const result = await listDatabases();
    if (request !== generation) return;
    databases.value = result;
    if (!databases.value.some((db) => db.name === selectedDatabase.value)) {
      selectedDatabase.value = databases.value[0]?.name ?? "";
      selectedStore.value = stores.value[0] ?? "";
    }
    if (!stores.value.includes(selectedStore.value)) selectedStore.value = stores.value[0] ?? "";
    await refreshRecords();
  } catch (error) {
    if (request !== generation) return;
    operationError.value = error instanceof Error ? error.message : "Could not read IndexedDB";
    records.value = [];
  }
}

async function refreshRecords() {
  const request = ++generation;
  const database = selectedDatabase.value, store = selectedStore.value;
  records.value = [];
  hasMore.value = false;
  editorValue.value = originalValue.value = "";
  operationError.value = "";
  isNewRecord.value = false;
  selectedKey.value = "";
  if (!selectedDatabase.value || !selectedStore.value) { records.value = []; editorValue.value = ""; return; }
  try {
    const result = await readStore(database, store, recordPage.value * 500);
    if (request !== generation) return;
    records.value = result;
    hasMore.value = result.length > 500;
    if (records.value.length) selectRecord(records.value[0]);
    else {
      selectedKey.value = "";
      editorValue.value = "";
      originalValue.value = "";
    }
  } catch (error) {
    if (request !== generation) return;
    operationError.value = error instanceof Error ? error.message : "Could not read this object store";
  }
}

function saveCurrent() {
  void perform(async () => {
    if (activePanel.value === 'local' || activePanel.value === 'session') {
      await writeStorage(activePanel.value, selectedKey.value, editorValue.value);
      await refreshStorage();
    } else if (activePanel.value === 'cookies' && selectedCookie.value) {
      await writeCookie(selectedCookie.value, editorValue.value);
      await refreshCookies();
    } else if (selectedRecord.value) {
      if (selectedRecord.value.editable === false) throw new Error('Non-JSON values are read-only to prevent data loss.');
      await writeStoreRecord(selectedDatabase.value, selectedStore.value, { ...selectedRecord.value, value: JSON.parse(editorValue.value) });
      await refreshRecords();
    }
    flash('Saved');
  });
}
function removeCurrent() {
  if (!window.confirm(`Remove the selected entry from ${siteOrigin.value}?`)) return;
  void perform(async () => {
    if (activePanel.value === 'local' || activePanel.value === 'session') {
      await removeStorage(activePanel.value, selectedKey.value); await refreshStorage();
    } else if (activePanel.value === 'cookies' && selectedCookie.value) {
      await deleteCookie(selectedCookie.value); await refreshCookies();
    } else if (selectedRecord.value) {
      await deleteStoreRecord(selectedDatabase.value, selectedStore.value, selectedRecord.value.key); await refreshRecords();
    }
    flash('Removed');
  });
}
function createEntry() {
  if (!newKey.value) return;
  void perform(async () => {
    const created = newKey.value;
    await writeStorage(activePanel.value, created, '', true);
    newKey.value = ''; await refreshStorage(); selectEntry(created);
  });
}
function createCookie() {
  if (!cookieName.value) return;
  void perform(async () => {
    const existing = cookies.value.some(cookie => cookie.name === cookieName.value && cookie.path === cookiePath.value && cookie.hostOnly && cookie.domain === siteHost.value && !cookie.partitionKey);
    if (existing) throw new Error('This cookie already exists. Select it to edit while preserving its attributes.');
    await addCookie(siteHost.value, cookieName.value, cookieValue.value, cookiePath.value, cookieSecure.value);
    cookieName.value = ''; cookieValue.value = ''; await refreshCookies(); flash('Cookie added');
  });
}
function createRecord() {
  if (busy.value) return;
  if (!selectedDatabase.value || !selectedStore.value) return;
  const db = databases.value.find((item) => item.name === selectedDatabase.value);
  const connectionStore = db?.stores.includes(selectedStore.value);
  if (!connectionStore) return;
  let value: unknown;
  try { value = JSON.parse(editorValue.value || "{}"); }
  catch { operationError.value = "Enter valid JSON for the new record"; return; }
  let key: IDBValidKey | undefined;
  if (newRecordKey.value.trim()) {
    try { key = JSON.parse(newRecordKey.value); }
    catch { key = newRecordKey.value; }
  }
  busy.value = true;
  void addStoreRecord(selectedDatabase.value, selectedStore.value, value, key)
    .then(async () => {
      await refreshRecords();
      isNewRecord.value = false;
      newRecordKey.value = "";
      flash("Record added");
    })
    .catch((error) => { operationError.value = error instanceof Error ? error.message : String(error); })
    .finally(() => { busy.value = false; });
}

function beginNewRecord() {
  if (!discardChanges()) return;
  generation++;
  jsonView.value = false;
  previousRecordKey.value = selectedKey.value;
  isNewRecord.value = true;
  selectedKey.value = "";
  editorValue.value = "{}";
  originalValue.value = "";
  newRecordKey.value = "";
}

function cancelNewRecord() {
  isNewRecord.value = false;
  newRecordKey.value = "";
  const previous = records.value.find((record) => record.keyText === previousRecordKey.value);
  if (previous) selectRecord(previous);
  else if (records.value.length) selectRecord(records.value[0]);
  else { selectedKey.value = ""; editorValue.value = originalValue.value = ""; }
}

function preview(value: unknown) {
  try { const text = typeof value === "string" ? value : JSON.stringify(value); return text.length > 76 ? `${text.slice(0, 76)}…` : text; }
  catch { return String(value); }
}

function refresh() {
  if (busy.value || !discardChanges()) return;
  operationError.value = "";
  if (activePanel.value === "local" || activePanel.value === "session") refreshStorage();
  else if (activePanel.value === "cookies") refreshCookies();
  else void refreshDatabases();
}

function clearCurrentEnvironment() {
  const scope = activePanel.value === 'cookies' ? `all paths and partitions matching ${siteHost.value} (including shared parent-domain cookies; other subdomains can be affected)` : `${siteOrigin.value} in the selected frame`;
  if (!window.confirm(`Clear all ${activeTitle.value} records for ${scope}? This cannot be undone.`)) return;
  void perform(async () => {
    if (activePanel.value === 'local' || activePanel.value === 'session') { await clearStorage(activePanel.value); await refreshStorage(); }
    else if (activePanel.value === 'cookies') { await clearHostCookies(siteHost.value); await refreshCookies(); }
    else { await clearAllIndexedDBRecords(); recordPage.value = 0; await refreshDatabases(); }
    flash('Cleared');
  });
}
async function refreshFrameList() {
  try {
    frames.value = await listFrames();
    if (!frames.value.some(frame => frame.frameId === selectedFrame.value)) {
      selectedFrame.value = frames.value[0]?.frameId ?? 0;
    }
    setFrame(selectedFrame.value, siteOrigin.value);
  } catch (error) { report(error); }
}
function resetScope() {
  generation++; storageGeneration++; cookieGeneration++;
  selectedKey.value = ''; editorValue.value = originalValue.value = ''; isNewRecord.value = false;
  databases.value = []; selectedDatabase.value = ''; selectedStore.value = ''; records.value = []; cookies.value = []; localEntries.value = [];
  localCount.value = sessionCount.value = 0; recordPage.value = 0; hasMore.value = false; operationError.value = ''; notice.value = '';
}
async function reloadFrames() {
  if (busy.value || !discardChanges()) return;
  resetScope();
  await refreshFrameList();
  refresh();
}
async function changeFrame(event: Event) {
  const element = event.target as HTMLSelectElement;
  if (busy.value || !discardChanges()) { element.value = String(selectedFrame.value); return; }
  selectedFrame.value = Number(element.value); setFrame(selectedFrame.value, siteOrigin.value);
  resetScope();
  refresh();
}
function changeDatabase(event: Event) {
  const element = event.target as HTMLSelectElement;
  if (busy.value || !discardChanges()) { element.value = selectedDatabase.value; return; }
  selectedDatabase.value = element.value; selectedStore.value = stores.value[0] ?? ''; recordPage.value = 0;
  void refreshRecords();
}
function changeStore(event: Event) {
  const element = event.target as HTMLSelectElement;
  if (busy.value || !discardChanges()) { element.value = selectedStore.value; return; }
  selectedStore.value = element.value; recordPage.value = 0; void refreshRecords();
}
function changePage(delta: number) {
  if (!discardChanges()) return;
  recordPage.value += delta; void refreshRecords();
}
defineExpose({ canClose: discardChanges });
watch(activePanel, () => { searchText.value = ''; });
onMounted(async () => { await refreshFrameList(); refresh(); });
</script>

<template>
  <div class="storage-shell">
    <aside class="rail">
      <div class="site-card">
        <div class="site-avatar"><UiIcon name="globe" /></div>
        <div class="site-copy"><strong>Current site</strong><span :title="siteHost">{{ siteOrigin }}</span></div>
      </div>
      <div class="rail-label">BROWSER DATA</div>
      <button v-for="panel in panels" :key="panel.id" class="nav-item" :class="{ active: activePanel === panel.id }" @click="switchPanel(panel.id)">
        <span class="nav-mark"><UiIcon :name="panel.id" /></span><span>{{ panel.label }}</span>
        <span v-if="panel.id === 'local'" class="nav-count">{{ localCount }}</span>
        <span v-else-if="panel.id === 'session'" class="nav-count">{{ sessionCount }}</span>
        <span v-else-if="panel.id === 'cookies'" class="nav-count">{{ cookies.length }}</span>
        <span v-else class="nav-count">{{ databases.length }}</span>
      </button>
      <div class="rail-foot"><span class="status-dot"></span> Live page context</div>
    </aside>

    <main class="main-panel">
      <div class="db-toolbar"><span class="mini-label">FRAME / ORIGIN</span><select class="input" :value="selectedFrame" :disabled="busy" @change="changeFrame"><option v-for="frame in frames" :key="frame.frameId" :value="frame.frameId">{{ frame.frameId === 0 ? 'Top' : `Frame ${frame.frameId}` }} · {{ frame.url }}</option></select><button class="action-button" :disabled="busy" @click="reloadFrames">Reload frames</button></div>
      <div v-if="operationError" class="error-banner" role="alert">{{ operationError }}</div>
      <header class="toolbar">
        <div class="heading"><div class="eyebrow">SITE DATA</div><h1>{{ activeTitle }}</h1></div>
        <div class="toolbar-actions">
          <input v-model="searchText" class="input search" placeholder="Filter keys…" aria-label="Filter keys" />
          <button class="action-button" @click="refresh">Refresh</button>
          <button class="action-button danger" :disabled="busy || (activePanel === 'local' && !localCount) || (activePanel === 'session' && !sessionCount) || (activePanel === 'cookies' && !cookies.length) || (activePanel === 'indexeddb' && !databases.length)" @click="clearCurrentEnvironment">Clear all</button>
        </div>
      </header>

      <div v-if="activePanel === 'indexeddb'" class="db-toolbar">
        <select  :value="selectedDatabase" :disabled="busy" @change="changeDatabase" class="input db-select"><option value="" disabled>Choose database</option><option v-for="option in databaseOptions" :key="option.value" :value="option.value">{{ option.label }}</option></select>
        <span class="select-divider">/</span>
        <select  :value="selectedStore" @change="changeStore" class="input db-select" :disabled="!selectedDatabase"><option value="" disabled>Object store</option><option v-for="option in storeOptions" :key="option.value" :value="option.value">{{ option.label }}</option></select>
        <span class="count-tag">{{ Math.min(records.length, 500) }} records · page {{ recordPage + 1 }}</span>
      </div>

      <div class="content-grid" :class="{ 'cookie-mode': activePanel === 'cookies' }">
        <section class="list-pane">
          <div v-if="activePanel === 'local' || activePanel === 'session'" class="list-heading">
            <span>KEY</span><span>{{ storageEntries.length }} items</span>
          </div>
          <div v-if="activePanel === 'cookies'" class="list-heading"><span>COOKIE</span><span>{{ visibleCookies.length }} visible</span></div>
          <div v-if="activePanel === 'indexeddb'" class="list-heading"><span>PRIMARY KEY</span><span>{{ visibleRecords.length }} visible</span></div>
          <template v-if="activePanel === 'local' || activePanel === 'session'">
            <button v-for="entry in storageEntries" :key="entry.key" class="data-row" :class="{ selected: selectedKey === entry.key }" :disabled="busy" @click="discardChanges() && selectEntry(entry.key)">
              <span class="row-name">{{ entry.key }}</span><span class="row-preview">{{ entry.value || 'Empty' }}</span>
            </button>
            <div v-if="!storageEntries.length" class="empty-note">{{ searchText ? 'No matching keys' : 'No keys stored yet' }}</div>
          </template>
          <template v-else-if="activePanel === 'cookies'">
            <button v-for="cookie in visibleCookies" :key="cookie.id" class="data-row" :class="{ selected: selectedKey === cookie.id }" :disabled="busy" @click="discardChanges() && selectCookie(cookie.id)">
              <span class="row-name">{{ cookie.name }}</span><span class="row-preview">{{ cookie.domain }} · {{ cookie.path }} · {{ cookie.httpOnly ? 'HttpOnly · ' : '' }}{{ cookie.partitionKey ? 'Partitioned · ' : '' }}{{ cookie.value }}</span>
            </button>
            <div v-if="!visibleCookies.length" class="empty-note">{{ searchText ? 'No matching cookies' : 'No cookies match this host' }}</div>
          </template>
          <template v-else>
            <button v-for="record in visibleRecords" :key="record.keyText" class="data-row" :class="{ selected: selectedKey === record.keyText }" :disabled="busy" @click="discardChanges() && selectRecord(record)">
              <span class="row-name">{{ record.keyText }}</span><span class="row-preview">{{ preview(record.value) }}</span>
            </button>
            <div v-if="!visibleRecords.length" class="empty-note">{{ databases.length ? 'This store is empty' : 'No IndexedDB databases found' }}</div>
            <div class="create-row"><button class="action-button" :disabled="recordPage === 0 || busy" @click="changePage(-1)">Previous</button><button class="action-button" :disabled="!hasMore || busy" @click="changePage(1)">Next 500</button></div><div class="limit-note">Search applies to this page of records</div>
          </template>
          <div v-if="activePanel === 'local' || activePanel === 'session'" class="create-row">
            <input v-model="newKey" class="input" placeholder="New key name" @keyup.enter="createEntry" />
            <button class="action-button primary" :disabled="busy || !newKey" @click="createEntry">Add</button>
          </div>
          <div v-if="activePanel === 'cookies'" class="cookie-create">
            <div class="mini-label">ADD COOKIE</div>
            <input v-model="cookieName" class="input" placeholder="Name" />
            <input v-model="cookiePath" class="input" placeholder="Path, e.g. / or /api" /><input v-model="cookieValue" class="input" placeholder="Value" @keyup.enter="createCookie" />
            <button class="action-button primary" :disabled="busy || !cookieName" @click="createCookie">Add cookie</button>
          </div>
          <div v-if="activePanel === 'indexeddb' && selectedStore && !isNewRecord" class="add-record"><button class="action-button primary" :disabled="busy" @click="beginNewRecord">＋ New record</button></div>
        </section>

        <section class="editor-pane">
          <template v-if="activePanel === 'local' || activePanel === 'session'">
            <div v-if="localEntries.some(entry => entry.key === selectedKey)" class="editor-content">
              <div class="editor-top"><div><div class="mini-label">{{ activePanel === 'local' ? 'LOCAL STORAGE KEY' : 'SESSION STORAGE KEY' }}</div><h2>{{ selectedKey }}</h2></div><div class="editor-actions"><button class="action-button danger plain" :disabled="busy" @click="removeCurrent">Remove</button><button v-if="!jsonView" class="action-button primary" :disabled="busy || !hasUnsavedChanges" @click="saveCurrent">Save changes</button></div></div>
              <div class="editor-body"><div class="field-label">VALUE <span>Plain text</span><button v-if="canFormatJson" class="format-toggle" @click="jsonView = !jsonView">{{ jsonView ? 'Edit raw value' : 'Format JSON' }}</button></div><pre v-if="jsonView" class="json-preview">{{ formattedJson }}</pre><textarea v-else v-model="editorValue" class="input value-editor" placeholder="Enter a value" rows="14" /></div>
              <div class="editor-hint">Changes apply to <strong>{{ siteHost }}</strong> immediately after saving.</div>
            </div>
            <div v-else class="empty-state">Select a key to inspect its value</div>
          </template>
          <template v-else-if="activePanel === 'cookies'">
            <div v-if="selectedCookie" class="editor-content">
              <div class="editor-top"><div><div class="mini-label">COOKIE VALUE</div><h2>{{ selectedCookie.name }}</h2></div><div class="editor-actions"><button class="action-button danger plain" :disabled="busy" @click="removeCurrent">Remove</button><button class="action-button primary" :disabled="busy || !hasUnsavedChanges" @click="saveCurrent">Save changes</button></div></div>
              <div class="cookie-facts"><span><b>Domain</b>{{ selectedCookie.domain }}</span><span><b>Scope</b>{{ selectedCookie.httpOnly ? 'HttpOnly' : 'Script-readable' }} · {{ selectedCookie.secure ? 'Secure' : 'Non-secure' }}</span><span><b>Path</b>{{ selectedCookie.path }}</span></div>
              <div class="cookie-facts"><span><b>SameSite</b>{{ selectedCookie.sameSite }}</span><span><b>Expiry</b>{{ selectedCookie.session ? 'Session' : new Date((selectedCookie.expirationDate ?? 0) * 1000).toLocaleString() }}</span><span><b>Store</b>{{ selectedCookie.storeId }}</span></div>
              <div v-if="selectedCookie.partitionKey" class="editor-hint">Partition: {{ selectedCookie.partitionKey.topLevelSite }} · Cross-site ancestor: {{ selectedCookie.partitionKey.hasCrossSiteAncestor }}</div>
              <div class="editor-body"><div class="field-label">VALUE <span>Raw cookie value</span></div><textarea v-model="editorValue" class="input value-editor" rows="12" /></div>
              <div class="editor-hint">Domain, path, expiry, HttpOnly, Secure, SameSite and partition are preserved on save. Shared parent-domain cookies affect multiple subdomains.</div>
            </div>
            <div v-else class="empty-state">Select a cookie to inspect its value</div>
          </template>
          <template v-else>

            <div v-if="selectedRecord || isNewRecord" class="editor-content">
              <div class="editor-top"><div><div class="mini-label">{{ selectedStore }} · {{ isNewRecord ? 'NEW RECORD' : 'RECORD' }}</div><h2 class="key-heading">{{ isNewRecord ? 'Add a record' : selectedRecord?.keyText }}</h2></div><div class="editor-actions"><template v-if="isNewRecord"><button class="action-button plain" @click="cancelNewRecord">Cancel</button><button class="action-button primary" :disabled="busy" @click="createRecord">Add record</button></template><template v-else-if="!jsonView"><button class="action-button danger plain" :disabled="busy" @click="removeCurrent">Remove</button><button class="action-button primary" :disabled="busy || !hasUnsavedChanges || selectedRecord?.editable === false" @click="saveCurrent">Save JSON</button></template></div></div>
              <div v-if="isNewRecord" class="key-input"><label for="record-key">Primary key <span>Optional for auto-increment stores</span></label><input id="record-key" v-model="newRecordKey" class="input" placeholder="Leave blank to auto-generate" /></div>
              <div class="editor-body"><div class="field-label">VALUE <span>JSON; other types read-only</span><button v-if="canFormatJson && !isNewRecord" class="format-toggle" @click="jsonView = !jsonView">{{ jsonView ? 'Edit raw value' : 'Format JSON' }}</button></div><pre v-if="jsonView" class="json-preview">{{ formattedJson }}</pre><textarea v-else v-model="editorValue" :readonly="selectedRecord?.editable === false && !isNewRecord" class="input value-editor code-editor" rows="15" /></div>
              <div class="editor-hint">{{ selectedRecord?.editable === false && !isNewRecord ? 'Read-only typed preview; special values cannot be saved through JSON. ' : isNewRecord ? 'Values must be valid JSON. ' : 'Record changes are written directly to ' }}<strong>{{ selectedDatabase }} / {{ selectedStore }}</strong>.</div>
            </div>
            <div v-else class="db-empty"><div class="empty-state">{{ databases.length ? 'Select a record or add one to this store' : 'This site has no IndexedDB databases' }}</div><div v-if="!hasIndexedDB" class="editor-hint">This browser does not expose database enumeration. Open a site with IndexedDB data to browse it.</div></div>
          </template>
        </section>
      </div>
      <footer class="statusbar"><span><i class="status-dot"></i> Connected to {{ siteOrigin }}</span><span v-if="hasUnsavedChanges" class="unsaved-notice">Unsaved changes</span><span v-else-if="notice" class="saved-notice">{{ notice }}</span><span v-else>Changes stay in this browser profile</span></footer>
    </main>
  </div>
</template>

<style scoped>
.storage-shell{display:flex;min-height:600px;height:min(69vh,720px);overflow:hidden;border:1px solid #e6eaf0;border-radius:12px;background:#f7f8fa;color:#202735;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
.rail{width:224px;flex:none;display:flex;flex-direction:column;background:#f1f3f6;border-right:1px solid #e5e8ed;padding:16px 11px 12px}
.site-card{display:flex;align-items:center;gap:10px;padding:6px 7px 18px;border-bottom:1px solid #e1e5eb}
.site-avatar{width:33px;height:33px;display:grid;place-items:center;border-radius:9px;background:#243750;color:white;font-weight:700;font-size:14px}
.site-copy{min-width:0;display:flex;flex-direction:column;gap:3px}.site-copy strong{font-size:11px;color:#738092;font-weight:600}.site-copy span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#1f2b3b;font-size:12px;font-weight:650}
.rail-label,.mini-label,.eyebrow{font-size:9px;letter-spacing:.12em;font-weight:750;color:#8994a3}.rail-label{padding:19px 9px 8px}
.nav-item{height:37px;display:flex;align-items:center;gap:10px;border:0;border-radius:7px;background:transparent;color:#596577;padding:0 9px;margin:2px 0;text-align:left;font-size:11px;font-weight:550;cursor:pointer}.nav-item:hover{background:#e7ebf0}.nav-item.active{background:#fff;color:#192d47;box-shadow:0 1px 3px #1e344512;font-weight:650}.nav-mark{display:grid;place-items:center;width:20px;height:20px;border-radius:5px;background:#e4e9ef;color:#56657a;font-size:10px;font-weight:750}.nav-item.active .nav-mark{background:#dfe9f6;color:#345a85}.nav-count{margin-left:auto;color:#8a94a2;font-size:10px}.rail-foot{margin-top:auto;display:flex;align-items:center;gap:7px;padding:9px;color:#8490a0;font-size:10px}
.status-dot{display:inline-block;width:6px;height:6px;border-radius:50%;background:#49a67b;box-shadow:0 0 0 3px #49a67b1b}
.main-panel{min-width:0;flex:1;display:flex;flex-direction:column;background:#fff}.toolbar{min-height:70px;display:flex;align-items:center;justify-content:space-between;padding:12px 20px;border-bottom:1px solid #ebedf1}.heading h1{font-size:17px;line-height:1.2;margin:5px 0 0;font-weight:680;letter-spacing:-.025em;color:#202b3a}.toolbar-actions{display:flex;align-items:center;gap:8px}.search{width:195px}.db-toolbar{height:48px;display:flex;align-items:center;gap:9px;padding:0 20px;border-bottom:1px solid #eff1f4;background:#fbfcfd}.db-select{max-width:260px}.select-divider{color:#a5adba;font-size:15px}.content-grid{min-height:0;flex:1;display:grid;grid-template-columns:minmax(215px,30%) 1fr}.list-pane{min-width:0;display:flex;flex-direction:column;border-right:1px solid #ebedf1;background:#fcfcfd;overflow:auto}.list-heading{height:35px;flex:none;display:flex;align-items:center;justify-content:space-between;padding:0 13px;border-bottom:1px solid #edf0f3;color:#8993a1;font-size:9px;font-weight:750;letter-spacing:.08em}.list-heading span+span{font-weight:500;letter-spacing:0;font-size:10px}.data-row{width:100%;min-height:53px;display:flex;flex-direction:column;justify-content:center;gap:4px;text-align:left;padding:7px 13px;border:0;border-bottom:1px solid #f0f2f5;background:transparent;cursor:pointer}.data-row:hover{background:#f5f7fa}.data-row.selected{background:#eef4fb;box-shadow:inset 2px 0 #5682b3}.row-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#303b4b;font-size:11px;font-weight:620}.row-preview{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#8993a1;font-size:10px}.empty-note{padding:24px 14px;text-align:center;color:#9aa3af;font-size:11px}.limit-note{padding:8px;text-align:center;color:#929baa;font-size:10px}.create-row{margin-top:auto;display:flex;gap:7px;padding:10px;border-top:1px solid #e9edf1;background:#fff}.cookie-create{margin-top:auto;display:grid;gap:7px;padding:12px;border-top:1px solid #e9edf1;background:#fff}.cookie-create .mini-label{margin-bottom:1px}.add-record{margin-top:auto;display:flex;gap:7px;padding:10px;border-top:1px solid #e9edf1;background:#fff}.editor-pane{position:relative;min-width:0;overflow:auto;padding:20px 22px}.editor-content{height:100%;display:flex;flex-direction:column}.editor-top{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding-bottom:17px;border-bottom:1px solid #edf0f3}.editor-top h2{max-width:390px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:15px;margin:5px 0 0;color:#273344;font-weight:650}.editor-top h2.key-heading{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px}.editor-actions{display:flex;gap:5px;flex:none}.editor-body{padding-top:17px}.field-label{display:flex;justify-content:space-between;margin-bottom:8px;color:#687588;font-size:9px;font-weight:750;letter-spacing:.08em}.field-label span{color:#9aa3af;font-weight:500;letter-spacing:0}.value-editor :deep(textarea){font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;line-height:1.65;color:#38475a;background:#fbfcfd}.editor-hint{margin-top:auto;padding-top:14px;color:#919ba9;font-size:10px}.editor-hint strong{color:#687588;font-weight:600}.cookie-facts{display:flex;gap:25px;padding:13px 0;border-bottom:1px solid #edf0f3}.cookie-facts span{display:flex;flex-direction:column;gap:4px;color:#566477;font-size:10px}.cookie-facts b{color:#9aa3af;font-size:9px;font-weight:650}.empty-state{margin:auto}.db-empty{height:100%;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:24px}.error-banner{margin-bottom:12px;padding:9px 11px;border-radius:6px;background:#fff2f0;color:#b34a3b;font-size:11px}.statusbar{height:32px;flex:none;display:flex;align-items:center;justify-content:space-between;padding:0 14px;border-top:1px solid #eceff2;color:#9aa3af;font-size:9px}.statusbar>span:first-child{display:flex;align-items:center;gap:7px}.statusbar .status-dot{width:5px;height:5px}.saved-notice{color:#328563;font-weight:650}
.action-button,.input{font:inherit;font-size:11px}.action-button{height:30px;flex:none;border:1px solid #e1e5eb;border-radius:5px;background:#fff;padding:0 10px;color:#536174;font-weight:600;cursor:pointer}.action-button:hover{background:#f7f9fb}.action-button:disabled{opacity:.45;cursor:default}.action-button.primary{border-color:#315f95;background:#315f95;color:#fff}.action-button.primary:hover{background:#264f80}.action-button.danger{color:#bc5149}.action-button.plain{border-color:transparent;background:transparent}.action-button.plain:hover{background:#f5f6f8}.input{box-sizing:border-box;width:100%;height:30px;min-width:0;padding:0 9px;border:1px solid #e1e5eb;border-radius:5px;background:#fff;color:#38475a;outline:none}.input:focus{border-color:#84a5cc;box-shadow:0 0 0 2px #6a95c322}.input::placeholder{color:#a2aab5}.input:disabled{background:#f1f3f6;color:#9aa3af}.count-tag{padding:5px 8px;border-radius:4px;background:#eef2f6;color:#768294;font-size:10px}.value-editor.input{display:block;height:auto;min-height:250px;width:100%;padding:10px;resize:vertical;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;line-height:1.65;color:#38475a;background:#fbfcfd}
.format-toggle{padding:0;border:0;background:transparent;color:#4774a4;font:inherit;font-size:10px;font-weight:650;letter-spacing:0;cursor:pointer}.format-toggle:hover{text-decoration:underline}.json-preview{box-sizing:border-box;min-height:250px;max-height:50vh;overflow:auto;margin:0;padding:12px;border:1px solid #e1e5eb;border-radius:5px;background:#fbfcfd;color:#38475a;font:12px/1.65 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre}.unsaved-notice{color:#ae7b31;font-weight:650}
@media(max-width:760px){.storage-shell{height:76vh;min-height:520px}.rail{width:58px;padding:10px 6px}.site-card{justify-content:center;padding:4px 0 14px}.site-copy,.rail-label,.nav-item>span:not(.nav-mark){display:none}.nav-item{justify-content:center;padding:0}.rail-foot{font-size:0;justify-content:center;padding:8px 0}.toolbar{padding:10px 12px}.search{width:125px}.content-grid{grid-template-columns:minmax(130px,34%) 1fr}.editor-pane{padding:14px}.editor-actions{flex-direction:column}.db-toolbar{padding:0 10px}.db-select{max-width:42%}}
</style>
