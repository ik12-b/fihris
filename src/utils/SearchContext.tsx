/**
 * SearchContext — manages a single Web Worker for the search engine at the App
 * level so the index is built once and reused across tab navigation and app
 * restarts (backed by IndexedDB cache inside the worker).
 *
 * SearchScreen (or any other consumer) reads its state from this context
 * instead of creating its own worker lifecycle.
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  ReactNode,
} from 'react';
import type { SearchResponse } from './searchEngine';
import type { SearchOptions } from './searchEngine';

interface SearchContextValue {
  /** `true` once the worker has finished building/loading the index. */
  isEngineReady: boolean;
  /** Number of documents in the index. */
  indexedCount: number;
  /** How long the last init took (ms), or `null` if not yet initialised. */
  initTimeMs: null | number;
  /** Whether the index was loaded from the IndexedDB cache. */
  fromCache: boolean;
  /** The most recent search response, or `null` before the first search. */
  searchResultData: null | SearchResponse;
  /** `true` while a search request is in flight inside the worker. */
  isSearching: boolean;

  /** Send a search request to the worker. */
  postSearch: (options: SearchOptions) => void;
  /** Queue an uploaded PDF book for indexing. */
  postAddBook: (book: { book: object; pages: { pageNumber: number; text: string }[] }) => void;
  /** Clear the IndexedDB cache and force a rebuild on next init. */
  clearSearchCache: () => void;
}

const SearchContext = createContext<SearchContextValue | undefined>(undefined);

export const useSearchContext = (): SearchContextValue => {
  const ctx = useContext(SearchContext);
  if (!ctx) {
    throw new Error('useSearchContext must be used within a SearchProvider');
  }
  return ctx;
};

interface SearchProviderProps {
  children: ReactNode;
}

export const SearchProvider: React.FC<SearchProviderProps> = ({ children }) => {
  const workerRef = useRef<Worker | null>(null);
  const [isEngineReady, setIsEngineReady] = useState(false);
  const [indexedCount, setIndexedCount] = useState(0);
  const [initTimeMs, setInitTimeMs] = useState<number | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [searchResultData, setSearchResultData] = useState<SearchResponse | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  // ── Create the worker once for the entire app lifetime ─────────────────────
  // The worker checks IndexedDB for a cached index first, avoiding a full
  // database fetch + rebuild on every app launch.
  useEffect(() => {
    const worker = new Worker(
      new URL('./searchWorker.ts', import.meta.url),
      { type: 'module' }
    );
    workerRef.current = worker;

    worker.onmessage = (e: MessageEvent) => {
      const msg = e.data as {
        type: string;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        result?: any;
        indexedCount?: number;
        initTimeMs?: number;
        fromCache?: boolean;
      };

      if (msg.type === 'ready') {
        setIsEngineReady(true);
        setIndexedCount(msg.indexedCount ?? 0);
        setInitTimeMs(msg.initTimeMs ?? null);
        setFromCache(msg.fromCache ?? false);
      } else if (msg.type === 'searchResult') {
        setSearchResultData(msg.result);
        setIsSearching(false);
      } else if (msg.type === 'bookAdded') {
        // Book was indexed — next search will include it
      }
    };

    worker.onerror = (err) => {
      console.error('Search worker error:', err);
    };

    return () => {
      // Worker is intentionally terminated only when the whole App unmounts.
      // (The provider wraps the entire <App> so this happens on hard refresh.)
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  const postSearch = (options: SearchOptions) => {
    if (!workerRef.current || !isEngineReady) return;
    setIsSearching(true);
    workerRef.current.postMessage({ type: 'search', payload: options });
  };

  const postAddBook = (payload: { book: object; pages: { pageNumber: number; text: string }[] }) => {
    if (!workerRef.current || !isEngineReady) return;
    workerRef.current.postMessage({ type: 'addBook', payload });
  };

  const clearSearchCache = () => {
    if (!workerRef.current) return;
    // Tell the worker to wipe IndexedDB and rebuild from the database
    workerRef.current.postMessage({ type: 'clearCache' });
    setIsEngineReady(false);
    setSearchResultData(null);
    setFromCache(false);
  };

  return (
    <SearchContext.Provider
      value={{
        isEngineReady,
        indexedCount,
        initTimeMs,
        fromCache,
        searchResultData,
        isSearching,
        postSearch,
        postAddBook,
        clearSearchCache,
      }}
    >
      {children}
    </SearchContext.Provider>
  );
};
