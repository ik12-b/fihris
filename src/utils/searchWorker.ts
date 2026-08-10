/**
 * Web Worker for full-text Arabic search over the pustaka book corpus.
 *
 * Offloads the heavy work of fetching the ~7 MB gzipped pustaka database,
 * tokenizing every page, and building the inverted index into a background
 * thread so the main UI thread never freezes.
 *
 * On first run the worker fetches the database, builds the index, then
 * persists the serialized engine state to IndexedDB. On subsequent runs
 * (app restart, tab re-mount) the worker loads the cached index directly —
 * skipping the network fetch and multi-second build step entirely.
 *
 * Communication protocol (postMessage):
 *   { type: 'search',     payload: SearchOptions }  →  { type: 'searchResult', result: SearchResponse }
 *   { type: 'addBook',    payload: { book, pages } } →  { type: 'bookAdded',     bookId: string }
 *   { type: 'clearCache' }                          →  clears IndexedDB cache, then reloads from DB
 *
 * Vite automatically detects .ts worker files and bundles them as ESM workers.
 *
 * The database is fetched as gzip-compressed JSON from public/ to keep the
 * download small on mobile. DecompressionStream (available in all modern
 * WebViews) is used to decompress; if it is unavailable or the .gz fetch
 * fails, the worker falls back to the uncompressed .json.
 *
 * Vite's default worker output format ("iife") does not support top-level
 * await, so the async init is wrapped in an async IIFE.
 */

import { fihrisSearchEngine } from './searchEngine';
import { PUSTAKA_BOOKS, toSearchResult } from '../data/pustakaLoader';
import { saveIndexToCache, loadIndexFromCache, clearIndexCache } from './searchCache';
import type { SerializedEngineState } from './searchEngine';
import type { PustakaSearchDocument } from '../data/pustakaLoader';
import type { Book, SearchResult } from '../types';
import type { SearchOptions, SearchResponse } from './searchEngine';

/**
 * Load the pustaka database, preferring the gzipped version for smaller
 * transfer on mobile. Falls back to uncompressed JSON if gzip is unavailable.
 */
async function loadDatabase(): Promise<{
  books: unknown[];
  searchDocs: PustakaSearchDocument[];
  metadata: unknown;
}> {
  // ── Try gzipped version first ─────────────────────────────────────
  try {
    const response = await fetch('/pustakaDatabase.json.gz');
    if (response.ok && typeof DecompressionStream !== 'undefined' && response.body) {
      const decompressed = response.body.pipeThrough(
        new DecompressionStream('gzip')
      );
      const text = await new Response(decompressed).text();
      return JSON.parse(text) as {
        books: unknown[];
        searchDocs: PustakaSearchDocument[];
        metadata: unknown;
      };
    }
  } catch {
    // Fall through to uncompressed fallback
  }

  // ── Fallback: uncompressed JSON ────────────────────────────────────
  const response = await fetch('/pustakaDatabase.json');
  if (!response.ok) {
    throw new Error(`Failed to load pustakaDatabase.json: ${response.status}`);
  }
  return response.json() as Promise<{
    books: unknown[];
    searchDocs: PustakaSearchDocument[];
    metadata: unknown;
  }>;
}

/**
 * Initialize the search engine either from the IndexedDB cache or — if no
 * cache exists — by fetching the database and building the index from scratch.
 * The resulting index is persisted to cache for future sessions.
 */
async function initializeEngine(): Promise<{ indexedCount: number; initTimeMs: number; fromCache: boolean }> {
  const initStart = performance.now();

  // 1. Try cache first
  const cached = await loadIndexFromCache();
  if (cached) {
    try {
      fihrisSearchEngine.deserialize(cached as SerializedEngineState);
      const initEnd = performance.now();
      const indexedCount = (fihrisSearchEngine as any).documents?.length ?? 0;
      return { indexedCount, initTimeMs: Math.round((initEnd - initStart) * 100) / 100, fromCache: true };
    } catch {
      // Cache corrupted — fall through to rebuild
    }
  }

  // 2. Cache miss: fetch database and build index from scratch
  const fullDb = await loadDatabase();

  // Convert raw compact search docs to SearchResult[] (populating book titles via lookup)
  const allPustakaSearchResults: SearchResult[] = fullDb.searchDocs.map(toSearchResult);
  const allSnippets = allPustakaSearchResults;

  fihrisSearchEngine.initialize(PUSTAKA_BOOKS, allSnippets);

  // 3. Persist the built index to IndexedDB for next time
  try {
    const serialized = fihrisSearchEngine.serialize();
    await saveIndexToCache(serialized);
  } catch {
    // Ignore cache errors — search still works from in-memory state
  }

  const initEnd = performance.now();
  const indexedCount = (fihrisSearchEngine as any).documents?.length ?? 0;
  return { indexedCount, initTimeMs: Math.round((initEnd - initStart) * 100) / 100, fromCache: false };
}

// ── 1. Initialize the search engine (from cache or database) ───────────────
// The ~7 MB gzipped database lives in public/ and is fetched at runtime
// instead of being statically imported, so the worker JS bundle stays small.

initializeEngine().then(({ indexedCount, initTimeMs, fromCache }) => {
  // Signal readiness to the main thread
  postMessage({
    type: 'ready',
    indexedCount,
    initTimeMs,
    fromCache,
    totalBooks: PUSTAKA_BOOKS.length,
  });

  // ── 2. Message handlers ───────────────────────────────────────────────────────
  onmessage = (e: MessageEvent) => {
    const { type, payload } = e.data;

    if (type === 'search') {
      const result: SearchResponse = fihrisSearchEngine.search(payload as SearchOptions);
      postMessage({ type: 'searchResult', result });
      return;
    }

    if (type === 'addBook') {
      const { book, pages } = payload as { book: Book; pages: { pageNumber: number; text: string }[] };
      fihrisSearchEngine.addUploadedBook(book, pages);
      postMessage({ type: 'bookAdded', bookId: book.id });
      return;
    }

    if (type === 'clearCache') {
      clearIndexCache().then(() => {
        // Rebuild from database and re-cache
        initializeEngine().then(({ indexedCount, initTimeMs }) => {
          postMessage({
            type: 'ready',
            indexedCount,
            initTimeMs,
            fromCache: false,
            totalBooks: PUSTAKA_BOOKS.length,
          });
        });
      });
      return;
    }

    // Unknown message type — ignore silently
  };
}).catch((err) => {
  console.error('Search worker initialization failed:', err);
  postMessage({
    type: 'error',
    message: err instanceof Error ? err.message : String(err),
  });
});
