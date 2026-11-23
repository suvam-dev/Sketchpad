/**
 * Offline-first IndexedDB storage for Scratchpad notebooks, trash recovery, and session state.
 * Automatically migrates legacy localStorage ('zendraw_onenote_notebooks') data.
 */

const DB_NAME = 'scratchpad_notebooks_db';
const DB_VERSION = 1;
const STORE_STATE = 'app_state';
const LEGACY_LOCALSTORAGE_KEY = 'zendraw_onenote_notebooks';
const SESSION_PREFS_KEY = 'scratchpad_session_prefs_v1';

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is unavailable in this environment.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_STATE)) {
        db.createObjectStore(STORE_STATE, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Failed to open IndexedDB.'));
  });
}

async function idbGet(key) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_STATE, 'readonly');
    const store = tx.objectStore(STORE_STATE);
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result ? req.result.value : null);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key, value) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_STATE, 'readwrite');
    const store = tx.objectStore(STORE_STATE);
    const req = store.put({ key, value, updatedAt: Date.now() });
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

export function createId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function formatTimestamp(date = new Date()) {
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function createDefaultPage(index = 1, paperStyle = 'dotted') {
  return {
    id: createId(),
    title: `Page ${index}`,
    date: formatTimestamp(),
    updatedAt: Date.now(),
    paperStyle,
    strokes: [],
    images: [],
    panX: 0,
    panY: 0,
    zoom: 1.0,
  };
}

export function createDefaultNotebook(title = 'Quick Notes', paperStyle = 'dotted') {
  return {
    id: createId(),
    title,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    pages: [createDefaultPage(1, paperStyle)],
  };
}

/**
 * Normalizes legacy or imported notebook arrays to guarantee schema integrity.
 */
export function normalizeNotebooks(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((nb) => nb && typeof nb === 'object')
    .map((nb) => ({
      id: nb.id || createId(),
      title: typeof nb.title === 'string' && nb.title.trim() ? nb.title : 'Untitled Notebook',
      createdAt: nb.createdAt || Date.now(),
      updatedAt: nb.updatedAt || Date.now(),
      pages: Array.isArray(nb.pages)
        ? nb.pages.map((p, idx) => ({
            id: p.id || createId(),
            title: typeof p.title === 'string' && p.title.trim() ? p.title : `Page ${idx + 1}`,
            date: p.date || formatTimestamp(),
            updatedAt: p.updatedAt || Date.now(),
            paperStyle: ['blank', 'dotted', 'grid', 'ruled'].includes(p.paperStyle)
              ? p.paperStyle
              : 'dotted',
            strokes: Array.isArray(p.strokes) ? p.strokes : [],
            images: Array.isArray(p.images) ? p.images : [],
            panX: typeof p.panX === 'number' ? p.panX : 0,
            panY: typeof p.panY === 'number' ? p.panY : 0,
            zoom: typeof p.zoom === 'number' ? p.zoom : 1.0,
          }))
        : [],
    }));
}

/**
 * Loads notebooks and trash from IndexedDB, falling back to and migrating legacy localStorage.
 */
export async function loadWorkspaceData() {
  try {
    const storedNotebooks = await idbGet('notebooks');
    const storedTrash = await idbGet('trash');

    if (Array.isArray(storedNotebooks)) {
      return {
        notebooks: normalizeNotebooks(storedNotebooks),
        trash: Array.isArray(storedTrash) ? storedTrash : [],
        migrated: false,
      };
    }

    // Check legacy localStorage key for seamless migration
    const legacyRaw = localStorage.getItem(LEGACY_LOCALSTORAGE_KEY);
    if (legacyRaw) {
      const parsed = JSON.parse(legacyRaw);
      const normalized = normalizeNotebooks(parsed);
      if (normalized.length > 0) {
        await idbSet('notebooks', normalized);
        await idbSet('trash', []);
        return { notebooks: normalized, trash: [], migrated: true };
      }
    }

    // First-time user: create a welcoming default notebook so they can draw immediately
    const initialNotebook = createDefaultNotebook('Quick Notes', 'dotted');
    await idbSet('notebooks', [initialNotebook]);
    await idbSet('trash', []);
    return { notebooks: [initialNotebook], trash: [], migrated: false };
  } catch (error) {
    console.warn('IndexedDB load failed, falling back to localStorage:', error);
    try {
      const legacyRaw = localStorage.getItem(LEGACY_LOCALSTORAGE_KEY);
      if (legacyRaw) {
        const parsed = normalizeNotebooks(JSON.parse(legacyRaw));
        if (parsed.length > 0) return { notebooks: parsed, trash: [], migrated: false };
      }
    } catch {
      // Ignore parse error
    }
    return { notebooks: [createDefaultNotebook('Quick Notes', 'dotted')], trash: [], migrated: false };
  }
}

/**
 * Persists notebooks and trash to IndexedDB (and mirrors lightweight JSON to localStorage when within quota).
 */
export async function saveWorkspaceData(notebooks, trash = []) {
  try {
    await idbSet('notebooks', notebooks);
    await idbSet('trash', trash);
  } catch (error) {
    console.warn('IndexedDB save failed, attempting localStorage fallback:', error);
    try {
      localStorage.setItem(LEGACY_LOCALSTORAGE_KEY, JSON.stringify(notebooks));
    } catch (lsErr) {
      throw new Error(`Storage quota exceeded: ${lsErr.message}`, { cause: lsErr });
    }
  }
}

export function loadSessionPrefs() {
  try {
    const raw = localStorage.getItem(SESSION_PREFS_KEY);
    if (!raw) return {};
    return JSON.parse(raw) || {};
  } catch {
    return {};
  }
}

export function saveSessionPrefs(prefs) {
  try {
    localStorage.setItem(SESSION_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Ignore storage errors for lightweight prefs
  }
}
