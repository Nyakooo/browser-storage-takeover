<script setup lang="ts">
import { computed, onMounted, ref, shallowRef, watch } from "vue";
import {
  addStoreRecord,
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
const panels: { id: Panel; label: string; mark: string }[] = [
  { id: "local", label: "Local storage", mark: "L" },
  { id: "session", label: "Session storage", mark: "S" },
  { id: "cookies", label: "Cookies", mark: "C" },
  { id: "indexeddb", label: "IndexedDB", mark: "I" },
];
const activePanel = ref<Panel>("local");
const searchText = ref("");
const localEntries = ref<{ key: string; value: string }[]>([]);
const localCount = ref(localStorage.length);
const sessionCount = ref(sessionStorage.length);
const cookies = ref(readCookies());
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
const databaseError = ref("");
const siteHost = location.hostname;
const hasIndexedDB = typeof indexedDB.databases === "function";

const currentStorage = computed(() => activePanel.value === "session" ? sessionStorage : localStorage);
const storageEntries = computed(() => localEntries.value.filter((entry) => entry.key.toLowerCase().includes(searchText.value.toLowerCase())));
const visibleCookies = computed(() => cookies.value.filter((entry) => entry.name.toLowerCase().includes(searchText.value.toLowerCase())));
const visibleRecords = computed(() => {
  const query = searchText.value.toLowerCase();
  return records.value.filter((entry: DatabaseRecord) => entry.keyText.toLowerCase().includes(query));
});
const stores = computed(() => databases.value.find((db) => db.name === selectedDatabase.value)?.stores ?? []);
const databaseOptions = computed(() => databases.value.map((db) => ({ label: `${db.name}  ·  v${db.version}`, value: db.name })));
const storeOptions = computed(() => stores.value.map((store) => ({ label: store, value: store })));
const activeTitle = computed(() => panels.find((panel) => panel.id === activePanel.value)?.label ?? "Storage");
const selectedCookie = computed(() => cookies.value.find((cookie) => cookie.name === selectedKey.value));
const selectedRecord = computed(() => records.value.find((record) => record.keyText === selectedKey.value));
const formattedJson = computed(() => {
  try { return JSON.stringify(JSON.parse(editorValue.value), null, 2); }
  catch { return ""; }
});
const canFormatJson = computed(() => formattedJson.value !== "");
const hasUnsavedChanges = computed(() => editorValue.value !== originalValue.value || isNewRecord.value);

function refreshStorage() {
  localCount.value = localStorage.length;
  sessionCount.value = sessionStorage.length;
  localEntries.value = Object.keys(currentStorage.value).sort().map((key) => ({ key, value: currentStorage.value.getItem(key) ?? "" }));
  if (!localEntries.value.some((entry) => entry.key === selectedKey.value)) selectEntry(localEntries.value[0]?.key ?? "");
  else selectEntry(selectedKey.value);
}

function selectEntry(key: string) {
  jsonView.value = false;
  selectedKey.value = key;
  const entry = localEntries.value.find((item) => item.key === key);
  editorValue.value = entry?.value ?? "";
  originalValue.value = editorValue.value;
}

function selectCookie(name: string) {
  jsonView.value = false;
  selectedKey.value = name;
  editorValue.value = cookies.value.find((cookie) => cookie.name === name)?.value ?? "";
  originalValue.value = editorValue.value;
}

function selectRecord(record: DatabaseRecord) {
  jsonView.value = false;
  isNewRecord.value = false;
  selectedKey.value = record.keyText;
  editorValue.value = pretty(record.value);
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
  activePanel.value = panel;
  searchText.value = "";
  jsonView.value = false;
  isNewRecord.value = false;
  selectedKey.value = "";
  editorValue.value = "";
  notice.value = "";
  if (panel === "local" || panel === "session") refreshStorage();
  if (panel === "cookies") refreshCookies();
  if (panel === "indexeddb") void refreshDatabases();
}

function refreshCookies() {
  cookies.value = readCookies().sort((a, b) => a.name.localeCompare(b.name));
  if (!cookies.value.some((cookie) => cookie.name === selectedKey.value)) selectCookie(cookies.value[0]?.name ?? "");
  else selectCookie(selectedKey.value);
}

async function refreshDatabases() {
  busy.value = true;
  databaseError.value = "";
  try {
    databases.value = await listDatabases();
    if (!databases.value.some((db) => db.name === selectedDatabase.value)) {
      selectedDatabase.value = databases.value[0]?.name ?? "";
      selectedStore.value = stores.value[0] ?? "";
    }
    if (!stores.value.includes(selectedStore.value)) selectedStore.value = stores.value[0] ?? "";
    await refreshRecords();
  } catch (error) {
    databaseError.value = error instanceof Error ? error.message : "Could not read IndexedDB";
    records.value = [];
  } finally {
    busy.value = false;
  }
}

async function refreshRecords() {
  isNewRecord.value = false;
  selectedKey.value = "";
  if (!selectedDatabase.value || !selectedStore.value) { records.value = []; editorValue.value = ""; return; }
  try {
    records.value = await readStore(selectedDatabase.value, selectedStore.value);
    if (records.value.length) selectRecord(records.value[0]);
    else editorValue.value = "";
  } catch (error) {
    databaseError.value = error instanceof Error ? error.message : "Could not read this object store";
  }
}

function saveCurrent() {
  if ((activePanel.value === "local" || activePanel.value === "session") && selectedKey.value) {
    currentStorage.value.setItem(selectedKey.value, editorValue.value);
    originalValue.value = editorValue.value;
    refreshStorage();
    flash("Saved to this site");
  } else if (activePanel.value === "cookies" && selectedCookie.value) {
    writeCookie(selectedCookie.value.name, editorValue.value);
    originalValue.value = editorValue.value;
    refreshCookies();
    flash("Cookie updated");
  } else if (activePanel.value === "indexeddb" && selectedRecord.value) {
    try {
      const value = JSON.parse(editorValue.value);
      void writeStoreRecord(selectedDatabase.value, selectedStore.value, { ...selectedRecord.value, value })
        .then(() => refreshRecords()).then(() => flash("Record saved"))
        .catch((error) => { databaseError.value = String(error); });
    } catch { databaseError.value = "Enter valid JSON before saving this record"; }
  }
}

function removeCurrent() {
  if (!selectedKey.value) return;
  if (!window.confirm(`Remove “${selectedKey.value}” from ${activeTitle.value}?`)) return;
  if (activePanel.value === "local" || activePanel.value === "session") currentStorage.value.removeItem(selectedKey.value);
  if (activePanel.value === "cookies") deleteCookie(selectedKey.value);
  if (activePanel.value === "indexeddb" && selectedRecord.value) {
    void deleteStoreRecord(selectedDatabase.value, selectedStore.value, selectedRecord.value.key)
      .then(refreshRecords)
      .catch((error) => { databaseError.value = error instanceof Error ? error.message : String(error); });
    return;
  }
  flash("Removed");
  activePanel.value === "cookies" ? refreshCookies() : refreshStorage();
}

function createEntry() {
  if (!newKey.value.trim()) return;
  currentStorage.value.setItem(newKey.value.trim(), "");
  const created = newKey.value.trim();
  newKey.value = "";
  refreshStorage();
  selectEntry(created);
}

function createCookie() {
  if (!cookieName.value.trim()) return;
  writeCookie(cookieName.value.trim(), cookieValue.value);
  cookieName.value = "";
  cookieValue.value = "";
  refreshCookies();
  flash("Cookie added");
}

function createRecord() {
  if (!selectedDatabase.value || !selectedStore.value) return;
  const db = databases.value.find((item) => item.name === selectedDatabase.value);
  const connectionStore = db?.stores.includes(selectedStore.value);
  if (!connectionStore) return;
  let value: unknown;
  try { value = JSON.parse(editorValue.value || "{}"); }
  catch { databaseError.value = "Enter valid JSON for the new record"; return; }
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
    .catch((error) => { databaseError.value = error instanceof Error ? error.message : String(error); })
    .finally(() => { busy.value = false; });
}

function beginNewRecord() {
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
}

function preview(value: unknown) {
  try { const text = typeof value === "string" ? value : JSON.stringify(value); return text.length > 76 ? `${text.slice(0, 76)}…` : text; }
  catch { return String(value); }
}

function refresh() {
  if (activePanel.value === "local" || activePanel.value === "session") refreshStorage();
  else if (activePanel.value === "cookies") refreshCookies();
  else void refreshDatabases();
}

watch(activePanel, () => { searchText.value = ""; });
watch([selectedDatabase, selectedStore], () => { if (activePanel.value === "indexeddb") void refreshRecords(); });
onMounted(refreshStorage);
</script>

<template>
  <div class="storage-shell">
    <aside class="rail">
      <div class="site-card">
        <div class="site-avatar">{{ siteHost.charAt(0).toUpperCase() || "?" }}</div>
        <div class="site-copy"><strong>Current site</strong><span :title="siteHost">{{ siteHost }}</span></div>
      </div>
      <div class="rail-label">BROWSER DATA</div>
      <button v-for="panel in panels" :key="panel.id" class="nav-item" :class="{ active: activePanel === panel.id }" @click="switchPanel(panel.id)">
        <span class="nav-mark">{{ panel.mark }}</span><span>{{ panel.label }}</span>
        <span v-if="panel.id === 'local'" class="nav-count">{{ localCount }}</span>
        <span v-else-if="panel.id === 'session'" class="nav-count">{{ sessionCount }}</span>
        <span v-else-if="panel.id === 'cookies'" class="nav-count">{{ cookies.length }}</span>
        <span v-else class="nav-count">{{ databases.length }}</span>
      </button>
      <div class="rail-foot"><span class="status-dot"></span> Live page context</div>
    </aside>

    <main class="main-panel">
      <header class="toolbar">
        <div class="heading"><div class="eyebrow">SITE DATA</div><h1>{{ activeTitle }}</h1></div>
        <div class="toolbar-actions">
          <input v-model="searchText" class="input search" placeholder="Filter keys…" aria-label="Filter keys" />
          <button class="action-button" @click="refresh">Refresh</button>
        </div>
      </header>

      <div v-if="activePanel === 'indexeddb'" class="db-toolbar">
        <select v-model="selectedDatabase" class="input db-select"><option value="" disabled>Choose database</option><option v-for="option in databaseOptions" :key="option.value" :value="option.value">{{ option.label }}</option></select>
        <span class="select-divider">/</span>
        <select v-model="selectedStore" class="input db-select" :disabled="!selectedDatabase"><option value="" disabled>Object store</option><option v-for="option in storeOptions" :key="option.value" :value="option.value">{{ option.label }}</option></select>
        <span class="count-tag">{{ records.length }} records</span>
      </div>

      <div class="content-grid" :class="{ 'cookie-mode': activePanel === 'cookies' }">
        <section class="list-pane">
          <div v-if="activePanel === 'local' || activePanel === 'session'" class="list-heading">
            <span>KEY</span><span>{{ storageEntries.length }} items</span>
          </div>
          <div v-if="activePanel === 'cookies'" class="list-heading"><span>COOKIE</span><span>{{ visibleCookies.length }} visible</span></div>
          <div v-if="activePanel === 'indexeddb'" class="list-heading"><span>PRIMARY KEY</span><span>{{ visibleRecords.length }} visible</span></div>
          <template v-if="activePanel === 'local' || activePanel === 'session'">
            <button v-for="entry in storageEntries" :key="entry.key" class="data-row" :class="{ selected: selectedKey === entry.key }" @click="selectEntry(entry.key)">
              <span class="row-name">{{ entry.key }}</span><span class="row-preview">{{ entry.value || 'Empty' }}</span>
            </button>
            <div v-if="!storageEntries.length" class="empty-note">{{ searchText ? 'No matching keys' : 'No keys stored yet' }}</div>
          </template>
          <template v-else-if="activePanel === 'cookies'">
            <button v-for="cookie in visibleCookies" :key="cookie.name" class="data-row" :class="{ selected: selectedKey === cookie.name }" @click="selectCookie(cookie.name)">
              <span class="row-name">{{ cookie.name }}</span><span class="row-preview">{{ cookie.value }}</span>
            </button>
            <div v-if="!visibleCookies.length" class="empty-note">{{ searchText ? 'No matching cookies' : 'No readable cookies on this site' }}</div>
          </template>
          <template v-else>
            <button v-for="record in visibleRecords" :key="record.keyText" class="data-row" :class="{ selected: selectedKey === record.keyText }" @click="selectRecord(record)">
              <span class="row-name">{{ record.keyText }}</span><span class="row-preview">{{ preview(record.value) }}</span>
            </button>
            <div v-if="!visibleRecords.length" class="empty-note">{{ databases.length ? 'This store is empty' : 'No IndexedDB databases found' }}</div>
            <div v-if="records.length > 500" class="limit-note">Showing first 500 records</div>
          </template>
          <div v-if="activePanel === 'local' || activePanel === 'session'" class="create-row">
            <input v-model="newKey" class="input" placeholder="New key name" @keyup.enter="createEntry" />
            <button class="action-button primary" :disabled="!newKey.trim()" @click="createEntry">Add</button>
          </div>
          <div v-if="activePanel === 'cookies'" class="cookie-create">
            <div class="mini-label">ADD COOKIE</div>
            <input v-model="cookieName" class="input" placeholder="Name" />
            <input v-model="cookieValue" class="input" placeholder="Value" @keyup.enter="createCookie" />
            <button class="action-button primary" :disabled="!cookieName.trim()" @click="createCookie">Add cookie</button>
          </div>
          <div v-if="activePanel === 'indexeddb' && selectedStore && !isNewRecord" class="add-record"><button class="action-button primary" @click="beginNewRecord">＋ New record</button></div>
        </section>

        <section class="editor-pane">
          <template v-if="activePanel === 'local' || activePanel === 'session'">
            <div v-if="selectedKey" class="editor-content">
              <div class="editor-top"><div><div class="mini-label">{{ activePanel === 'local' ? 'LOCAL STORAGE KEY' : 'SESSION STORAGE KEY' }}</div><h2>{{ selectedKey }}</h2></div><div class="editor-actions"><button class="action-button danger plain" @click="removeCurrent">Remove</button><button v-if="!jsonView" class="action-button primary" :disabled="!hasUnsavedChanges" @click="saveCurrent">Save changes</button></div></div>
              <div class="editor-body"><div class="field-label">VALUE <span>Plain text</span><button v-if="canFormatJson" class="format-toggle" @click="jsonView = !jsonView">{{ jsonView ? 'Edit raw value' : 'Format JSON' }}</button></div><pre v-if="jsonView" class="json-preview">{{ formattedJson }}</pre><textarea v-else v-model="editorValue" class="input value-editor" placeholder="Enter a value" rows="14" /></div>
              <div class="editor-hint">Changes apply to <strong>{{ siteHost }}</strong> immediately after saving.</div>
            </div>
            <div v-else class="empty-state">Select a key to inspect its value</div>
          </template>
          <template v-else-if="activePanel === 'cookies'">
            <div v-if="selectedCookie" class="editor-content">
              <div class="editor-top"><div><div class="mini-label">COOKIE VALUE</div><h2>{{ selectedCookie.name }}</h2></div><div class="editor-actions"><button class="action-button danger plain" @click="removeCurrent">Remove</button><button class="action-button primary" :disabled="!hasUnsavedChanges" @click="saveCurrent">Save changes</button></div></div>
              <div class="cookie-facts"><span><b>Host</b>{{ siteHost }}</span><span><b>Scope</b>Script-readable</span><span><b>Write path</b>/</span></div>
              <div class="editor-body"><div class="field-label">VALUE <span>Visible cookies only</span></div><textarea v-model="editorValue" class="input value-editor" rows="12" /></div>
              <div class="editor-hint">HttpOnly cookies and cookies scoped to other paths are unavailable in this page context.</div>
            </div>
            <div v-else class="empty-state">Select a cookie to inspect its value</div>
          </template>
          <template v-else>
            <div v-if="databaseError" class="error-banner">{{ databaseError }}</div>
            <div v-if="selectedRecord || isNewRecord" class="editor-content">
              <div class="editor-top"><div><div class="mini-label">{{ selectedStore }} · {{ isNewRecord ? 'NEW RECORD' : 'RECORD' }}</div><h2 class="key-heading">{{ isNewRecord ? 'Add a record' : selectedRecord?.keyText }}</h2></div><div class="editor-actions"><button v-if="isNewRecord" class="action-button plain" @click="cancelNewRecord">Cancel</button><template v-else-if="!jsonView"><button class="action-button danger plain" @click="removeCurrent">Remove</button><button class="action-button primary" :disabled="!hasUnsavedChanges" @click="saveCurrent">Save JSON</button></template></div></div>
              <div v-if="isNewRecord" class="key-input"><label for="record-key">Primary key <span>Optional for auto-increment stores</span></label><input id="record-key" v-model="newRecordKey" class="input" placeholder="Leave blank to auto-generate" /></div>
              <div class="editor-body"><div class="field-label">VALUE <span>JSON / structured clone</span><button v-if="canFormatJson && !isNewRecord" class="format-toggle" @click="jsonView = !jsonView">{{ jsonView ? 'Edit raw value' : 'Format JSON' }}</button></div><pre v-if="jsonView" class="json-preview">{{ formattedJson }}</pre><textarea v-else v-model="editorValue" class="input value-editor code-editor" rows="15" /></div>
              <div class="editor-hint">{{ isNewRecord ? 'Values must be valid JSON. ' : 'Record changes are written directly to ' }}<strong>{{ selectedDatabase }} / {{ selectedStore }}</strong>.</div>
            </div>
            <div v-else class="db-empty"><div class="empty-state">{{ databases.length ? 'Select a record or add one to this store' : 'This site has no IndexedDB databases' }}</div><div v-if="!hasIndexedDB" class="editor-hint">This browser does not expose database enumeration. Open a site with IndexedDB data to browse it.</div></div>
          </template>
        </section>
      </div>
      <footer class="statusbar"><span><i class="status-dot"></i> Connected to {{ siteHost }}</span><span v-if="hasUnsavedChanges" class="unsaved-notice">Unsaved changes</span><span v-else-if="notice" class="saved-notice">{{ notice }}</span><span v-else>Changes stay in this browser profile</span></footer>
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
