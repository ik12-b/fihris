import { Book, SearchResult } from '../types';

/**
 * Utility to strip Arabic diacritics (harakat / tashkeel) and normalize letter variants.
 */
export function normalizeArabicText(text: string): string {
  if (!text) return '';
  return text
    // Remove Arabic Tashkeel (Fatha, Damma, Kasra, Sukun, Shadda, Tanween, Dagger Alef, Tatweel)
    .replace(/[\u064B-\u0652\u0670\u0640]/g, '')
    // Normalize Alef variants (أ , إ , آ , ٱ -> ا)
    .replace(/[أإآٱ]/g, 'ا')
    // Normalize Ya / Alef Maqsura (ى -> ي)
    .replace(/ى/g, 'ي')
    // Normalize Taa Marbuta (ة -> ه)
    .replace(/ة/g, 'ه')
    // Normalize Hamza variants (ؤ -> و, ئ -> ي)
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .toLowerCase()
    .trim();
}

/**
 * Converts English digits to Arabic-Indic digits (e.g. 12 -> ١٢)
 */
export function toArabicDigits(num: number): string {
  const digits = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  return num
    .toString()
    .split('')
    .map((d) => (/\d/.test(d) ? digits[parseInt(d, 10)] : d))
    .join('');
}

export interface IndexedDocument {
  id: string;
  type: 'book' | 'snippet' | 'pdf_page';
  bookId: string;
  bookTitleArabic: string;
  bookTitleEnglish: string;
  category: string;
  pageNumber: number;
  pageNumberArabic: string;
  arabicTextSnippet: string;
  normalizedText: string;
  tokens: Set<string>;
  iconName: string;
}

export interface SearchOptions {
  query: string;
  selectedBooks?: string[];
  category?: string;
  page?: number;
  pageSize?: number;
  exactPhrase?: boolean;
}

export interface SearchResponse {
  results: SearchResult[];
  totalCount: number;
  page: number;
  totalPages: number;
  executionTimeMs: number;
  indexedCount: number;
}

export interface SerializedEngineState {
  documents: {
    id: string;
    type: 'book' | 'snippet' | 'pdf_page';
    bookId: string;
    bookTitleArabic: string;
    bookTitleEnglish: string;
    category: string;
    pageNumber: number;
    pageNumberArabic: string;
    arabicTextSnippet: string;
    normalizedText: string;
    /** Stored as an array because Sets are not directly serialisable. */
    tokens: string[];
    iconName: string;
  }[];
  /** token → array of document indices (was Set<number>). */
  tokenInvertedIndex: Record<string, number[]>;
  sortedTokens: string[];
  /** first-char → [startIdx, endIdx] range in sortedTokens. */
  firstCharIndex: Record<string, [number, number]>;
}

class SearchEngine {
  private documents: IndexedDocument[] = [];
  private tokenInvertedIndex: Map<string, Set<number>> = new Map();
  /** Sorted array of all unique tokens for binary-search-based prefix matching. */
  private sortedTokens: string[] = [];
  /** First-character → [startIdx, endIdx] range in sortedTokens, for filtered substring search. */
  private firstCharIndex: Map<string, [number, number]> = new Map();
  private isInitialized = false;

  public initialize(books: Book[], extraSnippets: SearchResult[]) {
    this.documents = [];
    this.tokenInvertedIndex.clear();
    this.sortedTokens = [];
    this.firstCharIndex.clear();

    // 1. Index Book metadata & excerpts
    books.forEach((book) => {
      this.indexBookMetadata(book);
    });

    // 2. Index extra page snippets
    extraSnippets.forEach((snippet) => {
      this.indexSnippet(snippet);
    });

    // 3. Build optimized lookup structures
    this.buildOptimizedIndex();

    this.isInitialized = true;
  }

  private indexBookMetadata(book: Book) {
    const arabicTitle = book.titleArabic || book.title;
    const fullText = `${arabicTitle} ${book.title} ${book.author} ${book.authorArabic || ''} ${
      book.arabicExcerpt || ''
    } ${book.description || ''}`;

    const normalized = normalizeArabicText(fullText);
    const tokens = new Set(normalized.split(/\s+/).filter(Boolean));

    const doc: IndexedDocument = {
      id: `book-${book.id}`,
      type: 'book',
      bookId: book.id,
      bookTitleArabic: arabicTitle,
      bookTitleEnglish: book.title,
      category: book.category,
      pageNumber: book.currentPage || 1,
      pageNumberArabic: `صفحة ${toArabicDigits(book.currentPage || 1)}`,
      arabicTextSnippet: book.arabicExcerpt || `${arabicTitle} - ${book.author} (${book.category})`,
      normalizedText: normalized,
      tokens,
      iconName: 'menu_book',
    };

    this.addDocumentToIndex(doc);
  }

  private indexSnippet(snippet: SearchResult) {
    const fullText = `${snippet.bookTitleArabic} ${snippet.bookTitleEnglish} ${snippet.arabicTextSnippet}`;
    const normalized = normalizeArabicText(fullText);
    const tokens = new Set(normalized.split(/\s+/).filter(Boolean));

    const doc: IndexedDocument = {
      id: snippet.id,
      type: 'snippet',
      bookId: snippet.id,
      bookTitleArabic: snippet.bookTitleArabic,
      bookTitleEnglish: snippet.bookTitleEnglish,
      category: snippet.category || 'Hadith',
      pageNumber: snippet.pageNumber,
      pageNumberArabic: snippet.pageNumberArabic,
      arabicTextSnippet: snippet.arabicTextSnippet,
      normalizedText: normalized,
      tokens,
      iconName: snippet.iconName || 'auto_stories',
    };

    this.addDocumentToIndex(doc);
  }

  /**
   * Dynamically indexes an uploaded PDF book and all its extracted pages into the search engine!
   */
  public addUploadedBook(book: Book, pages: { pageNumber: number; text: string }[]) {
    // Index the book summary
    this.indexBookMetadata(book);

    // Index every page of the PDF separately for page-level precision
    pages.forEach((p) => {
      const pageSnippet = p.text;
      const fullText = `${book.titleArabic || book.title} ${book.title} ${pageSnippet}`;
      const normalized = normalizeArabicText(fullText);
      const tokens = new Set(normalized.split(/\s+/).filter(Boolean));

      const doc: IndexedDocument = {
        id: `pdf-${book.id}-p${p.pageNumber}`,
        type: 'pdf_page',
        bookId: book.id,
        bookTitleArabic: book.titleArabic || book.title,
        bookTitleEnglish: book.title,
        category: book.category || 'Uploaded PDF',
        pageNumber: p.pageNumber,
        pageNumberArabic: `صفحة ${toArabicDigits(p.pageNumber)}`,
        arabicTextSnippet: pageSnippet,
        normalizedText: normalized,
        tokens,
        iconName: 'picture_as_pdf',
      };

      this.addDocumentToIndex(doc);
    });

    // Rebuild optimized lookup structures after dynamic indexing
    this.buildOptimizedIndex();
  }

  private addDocumentToIndex(doc: IndexedDocument) {
    const docIdx = this.documents.length;
    this.documents.push(doc);

    doc.tokens.forEach((t) => {
      if (!this.tokenInvertedIndex.has(t)) {
        this.tokenInvertedIndex.set(t, new Set());
      }
      this.tokenInvertedIndex.get(t)!.add(docIdx);
    });
  }

  /**
   * Build a sorted token array and a first-character range index to accelerate
   * candidate selection from O(Q×T) to O(log T + K).
   */
  private buildOptimizedIndex() {
    // 1. Sorted unique tokens
    this.sortedTokens = Array.from(this.tokenInvertedIndex.keys()).sort();

    // 2. First-character → [start, end) range in sortedTokens
    this.firstCharIndex.clear();
    for (let i = 0; i < this.sortedTokens.length; i++) {
      const char = this.sortedTokens[i][0];
      if (!this.firstCharIndex.has(char)) {
        this.firstCharIndex.set(char, [i, i + 1]);
      } else {
        const range = this.firstCharIndex.get(char)!;
        range[1] = i + 1;
      }
    }
  }

  /** Binary search for the leftmost index where arr[idx] >= target. */
  private binarySearchLeft(arr: string[], target: string): number {
    let lo = 0;
    let hi = arr.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (arr[mid] < target) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  /**
   * Find all documents that contain *any* token matching the query token
   * using exact-match, prefix-match, and filtered substring-match.
   * Returns a Set of candidate document indices.
   */
  private findCandidateDocuments(queryTokens: string[]): Set<number> {
    const candidates = new Set<number>();

    queryTokens.forEach((token) => {
      if (!token) return;

      // --- 1. Exact token match via inverted index (O(1)) ---
      const exactSet = this.tokenInvertedIndex.get(token);
      if (exactSet) {
        exactSet.forEach((idx) => candidates.add(idx));
      }

      // --- 2. Prefix match: indexedToken.startsWith(token) — O(log T + K) ---
      const startIdx = this.binarySearchLeft(this.sortedTokens, token);
      let endIdx = startIdx;
      while (
        endIdx < this.sortedTokens.length &&
        this.sortedTokens[endIdx].startsWith(token)
      ) {
        const indexedToken = this.sortedTokens[endIdx];
        if (indexedToken !== token) {
          const docSet = this.tokenInvertedIndex.get(indexedToken);
          if (docSet) docSet.forEach((idx) => candidates.add(idx));
        }
        endIdx++;
      }

      // --- 3. Substring match: indexedToken.includes(token) — filtered by first char ---
      // Only index tokens that START with the same first character as the query
      // token (covers indexedToken.startsWith(token) already, but also catches
      // middle-substring matches where the indexed token happens to start with
      // the query token's first char).
      const firstCharRange = this.firstCharIndex.get(token[0]);
      if (firstCharRange) {
        const [start, end] = firstCharRange;
        for (let j = start; j < end; j++) {
          const indexedToken = this.sortedTokens[j];
          if (indexedToken === token) continue; // exact match already handled
          if (indexedToken.length < token.length && token.startsWith(indexedToken)) {
            // token includes indexedToken
            const docSet = this.tokenInvertedIndex.get(indexedToken);
            if (docSet) docSet.forEach((idx) => candidates.add(idx));
          } else if (
            indexedToken.length >= token.length &&
            indexedToken.includes(token) &&
            !indexedToken.startsWith(token)
          ) {
            // indexedToken includes token (but not as prefix — already covered by step 2)
            const docSet = this.tokenInvertedIndex.get(indexedToken);
            if (docSet) docSet.forEach((idx) => candidates.add(idx));
          }
        }
      }
    });

    return candidates;
  }

  public search(options: SearchOptions): SearchResponse {
    const startTime = performance.now();
    const {
      query,
      selectedBooks = [],
      category,
      page = 1,
      pageSize = 10,
      exactPhrase = false,
    } = options;

    const normalizedQuery = normalizeArabicText(query);
    const queryTokens = normalizedQuery.split(/\s+/).filter(Boolean);

    if (!normalizedQuery || queryTokens.length === 0) {
      // Return default list if query is empty
      let filtered = [...this.documents];
      if (selectedBooks.length > 0) {
        filtered = filtered.filter(
          (d) =>
            selectedBooks.includes(d.bookTitleArabic) ||
            selectedBooks.includes(d.bookTitleEnglish)
        );
      }
      if (category && category !== 'All') {
        filtered = filtered.filter((d) => d.category === category);
      }

      const totalCount = filtered.length;
      const totalPages = Math.ceil(totalCount / pageSize) || 1;
      const pageIndex = Math.max(1, Math.min(page, totalPages));
      const pagedDocs = filtered.slice((pageIndex - 1) * pageSize, pageIndex * pageSize);

      const endTime = performance.now();
      return {
        results: pagedDocs.map((d) => this.toSearchResult(d, query)),
        totalCount,
        page: pageIndex,
        totalPages,
        executionTimeMs: Math.round((endTime - startTime) * 100) / 100,
        indexedCount: this.documents.length,
      };
    }

    // ── Optimized candidate selection ─────────────────────────────────────
    // Uses exact-match (O(1)), binary-search prefix-match (O(log T + K)),
    // and first-char-filtered substring matching to avoid O(T) full scan.
    const candidateDocIndices = this.findCandidateDocuments(queryTokens);

    // ── Exact phrase mode: narrow to documents that contain the full normalized query
    if (exactPhrase) {
      const exactPhraseCandidates = new Set<number>();
      candidateDocIndices.forEach((docIdx) => {
        const doc = this.documents[docIdx];
        if (doc.normalizedText.includes(normalizedQuery)) {
          exactPhraseCandidates.add(docIdx);
        }
      });
      // If no exact phrase matches, fall back to token-based candidates
      if (exactPhraseCandidates.size > 0) {
        candidateDocIndices.clear();
        exactPhraseCandidates.forEach((idx) => candidateDocIndices.add(idx));
      }
    }

    // Score candidates
    const scoredDocs: { doc: IndexedDocument; score: number }[] = [];

    candidateDocIndices.forEach((docIdx) => {
      const doc = this.documents[docIdx];

      // Filter check
      if (
        selectedBooks.length > 0 &&
        !selectedBooks.includes(doc.bookTitleArabic) &&
        !selectedBooks.includes(doc.bookTitleEnglish)
      ) {
        return;
      }

      if (category && category !== 'All' && doc.category !== category) {
        return;
      }

      let score = 0;

      // Exact phrase match in normalized text gives highest weight
      if (doc.normalizedText.includes(normalizedQuery)) {
        score += 120;
      }

      // If exactPhrase mode and the full phrase is NOT present, skip
      if (exactPhrase && score < 120) {
        return;
      }

      // Title match boost
      const normTitleAr = normalizeArabicText(doc.bookTitleArabic);
      const normTitleEn = doc.bookTitleEnglish.toLowerCase();
      if (normTitleAr.includes(normalizedQuery) || normTitleEn.includes(normalizedQuery)) {
        score += 90;
      }

      // Token overlap score
      queryTokens.forEach((qToken) => {
        if (doc.tokens.has(qToken)) {
          score += 25;
        } else {
          for (const dToken of doc.tokens) {
            if (dToken.startsWith(qToken) || qToken.startsWith(dToken)) {
              score += 10;
              break;
            }
          }
        }
      });

      if (score > 0) {
        scoredDocs.push({ doc, score });
      }
    });

    // Sort by relevance score descending
    scoredDocs.sort((a, b) => b.score - a.score);

    const totalCount = scoredDocs.length;
    const totalPages = Math.ceil(totalCount / pageSize) || 1;
    const pageIndex = Math.max(1, Math.min(page, totalPages));
    const paged = scoredDocs
      .slice((pageIndex - 1) * pageSize, pageIndex * pageSize)
      .map((item) => this.toSearchResult(item.doc, query));

    const endTime = performance.now();

    return {
      results: paged,
      totalCount,
      page: pageIndex,
      totalPages,
      executionTimeMs: Math.round((endTime - startTime) * 100) / 100,
      indexedCount: this.documents.length,
    };
  }

  private toSearchResult(doc: IndexedDocument, queryKeyword: string): SearchResult {
    return {
      id: doc.id,
      bookTitleArabic: doc.bookTitleArabic,
      bookTitleEnglish: doc.bookTitleEnglish,
      pageNumberArabic: doc.pageNumberArabic,
      pageNumber: doc.pageNumber,
      arabicTextSnippet: doc.arabicTextSnippet,
      queryKeyword: queryKeyword || 'إيمان',
      iconName: doc.iconName,
    };
  }

  /**
   * Serialize the entire engine state to a plain, JSON-compatible object so it
   * can be persisted to IndexedDB and restored in a future session without
   * re-tokenizing every document.
   */
  public serialize(): SerializedEngineState {
    return {
      documents: this.documents.map((d) => ({ ...d, tokens: Array.from(d.tokens) })),
      tokenInvertedIndex: Object.fromEntries(
        Array.from(this.tokenInvertedIndex.entries()).map(([k, v]) => [
          k,
          Array.from(v),
        ])
      ),
      sortedTokens: this.sortedTokens,
      firstCharIndex: Object.fromEntries(this.firstCharIndex),
    };
  }

  /**
   * Restore the engine from a previously serialized state.
   * Reconstructs Sets and Maps that IndexedDB cannot store natively.
   */
  public deserialize(state: SerializedEngineState): void {
    this.documents = state.documents.map((d) => ({ ...d, tokens: new Set(d.tokens) }));
    this.tokenInvertedIndex = new Map(
      Object.entries(state.tokenInvertedIndex).map(([k, v]) => [k, new Set(v)])
    );
    this.sortedTokens = state.sortedTokens;
    this.firstCharIndex = new Map(
      Object.entries(state.firstCharIndex).map(([k, v]) => [k, v as [number, number]])
    );
    this.isInitialized = true;
  }
}

export const fihrisSearchEngine = new SearchEngine();
