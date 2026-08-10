/**
 * IndexedDB-based cache for the serialized search index.
 *
 * The search engine's internal state (documents, inverted index, etc.) is
 * serialized to a JSON-compatible object and persisted in IndexedDB so that
 * subsequent app launches can skip the expensive fetch + build step entirely.
 *
 * The cache key includes a version string so that a future schema change
 * invalidates stale entries automatically.
 */

const CACHE_DB_NAME = 'fihris-search-db';
const CACHE_STORE_NAME = 'search-index';
const CACHE_VERSION = 1;

/**
 * Cache key — bump this string whenever the index schema changes so that
 * stale entries from previous builds are ignored.
 */
export const CACHE_KEY_INDEX = 'pustaka-index-v1';

/**
 * Open (or create) the IndexedDB database used for index caching.
 */
function openCacheDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(CACHE_DB_NAME, CACHE_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CACHE_STORE_NAME)) {
        db.createObjectStore(CACHE_STORE_NAME);
      }
    };
  });
}

/**
 * Persist a serialized search-index object to IndexedDB.
 */
export async function saveIndexToCache(indexData: object): Promise<void> {
  if (typeof indexedDB === 'undefined') return;

  const db = await openCacheDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(CACHE_STORE_NAME, 'readwrite');
      tx.objectStore(CACHE_STORE_NAME).put(indexData, CACHE_KEY_INDEX);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/**
 * Retrieve the serialized search-index object from IndexedDB, or `null` if
 * no cached copy exists (or if IndexedDB is unavailable in the environment).
 */
export async function loadIndexFromCache(): Promise<object | null> {
  if (typeof indexedDB === 'undefined') return null;

  const db = await openCacheDb();
  try {
    return new Promise<object | null>((resolve, reject) => {
      const tx = db.transaction(CACHE_STORE_NAME, 'readonly');
      const store = tx.objectStore(CACHE_STORE_NAME);
      const request = store.get(CACHE_KEY_INDEX);

      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

/**
 * Remove the cached search index. Useful when the underlying database has
 * changed and a rebuild is required.
 */
export async function clearIndexCache(): Promise<void> {
  if (typeof indexedDB === 'undefined') return;

  const db = await openCacheDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(CACHE_STORE_NAME, 'readwrite');
      tx.objectStore(CACHE_STORE_NAME).delete(CACHE_KEY_INDEX);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
