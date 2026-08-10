import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { SearchResult, Book } from '../types';
import { PUSTAKA_BOOKS } from '../data/pustakaLoader';
import { useSearchContext } from '../utils/SearchContext';
import { normalizeArabicText } from '../utils/searchEngine';
import type { SearchOptions } from '../utils/searchEngine';
import { useDebounce } from '../utils/useDebounce';
import { extractTextFromPdf } from '../utils/pdfExtractor';

interface SearchScreenProps {
  initialQuery?: string;
  onOpenBook: (bookId: string) => void;
  onAddBook?: (newBook: Book) => void;
}

export const SearchScreen: React.FC<SearchScreenProps> = ({
  initialQuery = 'إيمان',
  onOpenBook,
  onAddBook,
}) => {
  const [inputQuery, setInputQuery] = useState<string>(initialQuery);
  const debouncedQuery = useDebounce(inputQuery, 150);

  const [selectedBooks, setSelectedBooks] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [bookDropdownOpen, setBookDropdownOpen] = useState(false);
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set());
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // PDF Upload state
  const [isUploadingPdf, setIsUploadingPdf] = useState(false);
  const [uploadProgressText, setUploadProgressText] = useState<string>('');
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Dynamic available books list
  const [customBooks, setCustomBooks] = useState<string[]>([]);

  // ── Web Worker search engine (managed by SearchProvider at App level) ─────────
  const searchCtx = useSearchContext();
  const {
    isEngineReady,
    indexedCount,
    initTimeMs,
    fromCache,
    searchResultData,
    isSearching,
  } = searchCtx;

  const availableBooks = useMemo(() => {
    const pustakaTitles = PUSTAKA_BOOKS.map((b) => b.titleArabic || b.title);
    return Array.from(new Set([...pustakaTitles, ...customBooks]));
  }, [customBooks]);

  const categories = useMemo(
    () => ['All', 'Hadith', 'Fiqh', 'Tafsir', 'Aqidah', 'Uploaded PDF', 'History'],
    []
  );

  // The search worker is created once by <SearchProvider> at the App level
  // and persists across tab navigation and app restarts (backed by IndexedDB).
  // No per-component worker lifecycle is needed here.

  // Reset page when query, books, or category change
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedQuery, selectedBooks, selectedCategory]);

  // ── Send search queries to the worker ────────────────────────────────────────
  useEffect(() => {
    if (!isEngineReady) return;

    const payload: SearchOptions = {
      query: debouncedQuery,
      selectedBooks: selectedBooks.length > 0 ? selectedBooks : undefined,
      category: selectedCategory !== 'All' ? selectedCategory : undefined,
      page: currentPage,
      pageSize: 6,
    };

    searchCtx.postSearch(payload);
  }, [debouncedQuery, selectedBooks, selectedCategory, currentPage, isEngineReady]);

  // Trigger initial search once engine is ready
  useEffect(() => {
    if (!isEngineReady) return;

    const payload: SearchOptions = {
      query: debouncedQuery,
      selectedBooks: selectedBooks.length > 0 ? selectedBooks : undefined,
      category: selectedCategory !== 'All' ? selectedCategory : undefined,
      page: currentPage,
      pageSize: 6,
    };

    searchCtx.postSearch(payload);
  }, [isEngineReady]);

  const handleToggleBook = useCallback((bookName: string) => {
    setSelectedBooks((prev) =>
      prev.includes(bookName) ? prev.filter((b) => b !== bookName) : [...prev, bookName]
    );
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelectedBooks([...availableBooks]);
  }, [availableBooks]);

  const handleClearAll = useCallback(() => {
    setSelectedBooks([]);
    setSelectedCategory('All');
  }, []);

  const toggleBookmark = useCallback((id: string) => {
    setBookmarkedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleShare = useCallback((res: SearchResult) => {
    const text = `Fihris Kitab Search: ${res.bookTitleArabic} - ${res.pageNumberArabic}\n"${res.arabicTextSnippet}"`;
    navigator.clipboard?.writeText(text);
    setToastMessage(`Teks halaman disalin ke clipboard!`);
    setTimeout(() => setToastMessage(null), 3000);
  }, []);

  // PDF Upload Processor
  const processPdfFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      setToastMessage('Harap pilih file berformat PDF!');
      setTimeout(() => setToastMessage(null), 3000);
      return;
    }

    setIsUploadingPdf(true);
    setUploadProgressText(`Membaca "${file.name}"...`);

    try {
      const pdfResult = await extractTextFromPdf(file);
      setUploadProgressText(
        `Mengindeks ${pdfResult.pages.length} halaman dari "${pdfResult.title}" ke Search Engine...`
      );

      // Create a blob URL so ReaderScreen can render the actual PDF
      const pdfUrl = URL.createObjectURL(file);

      const newBook: Book = {
        id: `pdf-${Date.now()}`,
        title: pdfResult.title,
        titleArabic: pdfResult.title,
        author: 'Kitab Terunggah (PDF)',
        authorArabic: 'المؤلف',
        category: 'Uploaded PDF',
        pages: pdfResult.totalPages,
        currentPage: 1,
        isOffline: true,
        arabicExcerpt: pdfResult.fullTextPreview,
        description: `Dokumen PDF terunggah berisi ${pdfResult.totalPages} halaman terindeks.`,
        pdfUrl,
      };

      // Send to worker for indexing
      if (isEngineReady) {
        searchCtx.postAddBook({ book: newBook, pages: pdfResult.pages });
      }

      // Add to custom books list & notify parent
      setCustomBooks((prev) => [...prev, newBook.titleArabic || newBook.title]);
      if (onAddBook) {
        onAddBook(newBook);
      }

      // Auto filter to newly uploaded book & set query to preview
      setSelectedBooks([newBook.titleArabic || newBook.title]);
      if (pdfResult.pages.length > 0 && pdfResult.pages[0].text) {
        const firstWords = pdfResult.pages[0].text.split(/\s+/).slice(0, 2).join(' ');
        if (firstWords.length > 2) {
          setInputQuery(firstWords);
        }
      }

      setToastMessage(
        ` Kitab PDF "${pdfResult.title}" (${pdfResult.pages.length} halaman) berhasil di-indeks!`
      );
      setTimeout(() => setToastMessage(null), 4000);
    } catch (err) {
      console.error('Failed to parse PDF:', err);
      setToastMessage('Gagal memproses file PDF. Pastikan file valid.');
      setTimeout(() => setToastMessage(null), 3500);
    } finally {
      setIsUploadingPdf(false);
      setUploadProgressText('');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processPdfFile(e.target.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processPdfFile(e.dataTransfer.files[0]);
    }
  };

  /**
   * Enhanced Diacritic-Insensitive Search Term Highlighter
   * Highlights occurrences of query tokens inside Arabic/English text snippets cleanly.
   */
  const renderHighlightedSnippet = useCallback((snippetText: string, queryStr: string) => {
    if (!queryStr || !queryStr.trim()) return snippetText;

    const normQuery = normalizeArabicText(queryStr);
    if (!normQuery) return snippetText;

    const queryTokens = normQuery.split(/\s+/).filter((t) => t.length > 0);
    if (queryTokens.length === 0) return snippetText;

    // Split text by space boundaries while preserving punctuation
    const words = snippetText.split(/(\s+)/);

    return (
      <>
        {words.map((word, idx) => {
          const normWord = normalizeArabicText(word);
          if (!normWord) return word;

          const isMatch = queryTokens.some(
            (token) => normWord.includes(token) || token.includes(normWord)
          );

          if (isMatch) {
            return (
              <mark
                key={idx}
                className="bg-[#ffd700] text-[#1b1d0e] font-bold px-1.5 py-0.5 rounded mx-0.5 shadow-2xs inline-block transition-transform scale-105"
              >
                {word}
              </mark>
            );
          }
          return word;
        })}
      </>
    );
  }, []);

  // ── Derived display values ──────────────────────────────────────────────────
  const displayResults = searchResultData?.results || [];
  const displayTotalCount = searchResultData?.totalCount || 0;
  const displayPage = searchResultData?.page || 1;
  const displayTotalPages = searchResultData?.totalPages || 1;

  return (
    <div className="pb-28 px-4 max-w-4xl mx-auto space-y-4 pt-2">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-[#00595c] text-white text-xs px-5 py-2.5 rounded-full shadow-xl flex items-center gap-2 animate-bounce">
          <span className="material-symbols-outlined text-sm">info</span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Search Input Bar */}
      <div className="relative group">
        <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none">
          <span className="material-symbols-outlined text-[#3e4949]">search</span>
        </div>
        <input
          type="text"
          value={inputQuery}
          onChange={(e) => setInputQuery(e.target.value)}
          placeholder="Cari dalam ribuan halaman manuskrip & PDF (misal: إيمان, وضوء, صلاة)..."
          className="block w-full pr-12 pl-24 py-3.5 bg-[#f5f5dc] border border-[#bec9c9] rounded-xl focus:ring-2 focus:ring-[#00595c] focus:border-[#00595c] font-serif-scholar text-lg text-[#1b1d0e] transition-all shadow-xs text-right placeholder:text-[#3e4949]/60 placeholder:text-sm"
          dir="rtl"
        />
        <div className="absolute inset-y-0 left-0 pl-2 flex items-center gap-1">
          {inputQuery && (
            <button
              onClick={() => setInputQuery('')}
              className="p-1.5 text-[#3e4949] hover:text-[#00595c] transition-colors rounded-full"
              title="Clear Search"
            >
              <span className="material-symbols-outlined text-lg">close</span>
            </button>
          )}
          <button
            onClick={() => setInputQuery('إيمان')}
            className="p-1.5 text-[#00595c] hover:bg-[#00595c]/10 rounded-full transition-colors"
            title="Sample Query"
          >
            <span className="material-symbols-outlined text-xl">tune</span>
          </button>
        </div>
      </div>

      {/* PDF UPLOAD DRAG & DROP ZONE & BUTTON */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`p-4 rounded-xl border-2 border-dashed transition-all ${
          dragActive
            ? 'border-[#00595c] bg-[#0d7377]/10 scale-[1.01]'
            : 'border-[#bec9c9]/60 bg-[#eaead1]/50 hover:bg-[#eaead1]'
        }`}
      >
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#0d7377] text-[#a2f5f9] flex items-center justify-center shrink-0 shadow-2xs">
              <span className="material-symbols-outlined text-sm">picture_as_pdf</span>
            </div>
            <div>
              <h3 className="font-bold text-xs text-[#1b1d0e]">
                Upload Kitab PDF (Langsung Terindeks)
              </h3>
              <p className="text-[11px] text-[#3e4949]">
                Tarik & lepas file PDF kitab atau klik tombol upload di kanan.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".pdf"
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploadingPdf}
              className="px-4 py-2 bg-[#00595c] text-white text-xs font-bold rounded-lg shadow-xs hover:bg-[#00595c]/90 transition-all flex items-center gap-1.5 active:scale-95 shrink-0"
            >
              {isUploadingPdf ? (
                <>
                  <span className="material-symbols-outlined animate-spin text-sm">sync</span>
                  <span>Mengekstrak...</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-sm">upload_file</span>
                  <span>Upload PDF Kitab</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Uploading progress status bar */}
        {isUploadingPdf && (
          <div className="mt-3 pt-3 border-t border-[#bec9c9]/30 flex items-center gap-3 text-xs text-[#00595c] font-semibold">
            <span className="material-symbols-outlined animate-spin text-base">
              hourglass_top
            </span>
            <span className="flex-1 truncate">{uploadProgressText}</span>
          </div>
        )}
      </div>

      {/* Search Engine Status Badge */}
      <div className="flex items-center justify-between px-3 py-2 bg-[#eaead1] rounded-lg border border-[#bec9c9]/40 text-[11px] text-[#3e4949]">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-xs text-[#00595c]">
            {isEngineReady ? 'rocket' : 'sync'}
          </span>
          <span className="font-semibold text-[#1b1d0e]">
            {isEngineReady
              ? `Inverted Index Aktif (${indexedCount.toLocaleString()} dokumen)${fromCache ? ' • dari cache' : ''}`
              : `Memuat indeks pencarian (${(indexedCount / 1000).toFixed(0)}K dokumen...)`}
          </span>
        </div>
        <div className="font-mono text-[#00595c] font-bold">
          {isSearching ? (
            <span className="flex items-center gap-1">
              <span className="animate-spin">
                <span className="material-symbols-outlined text-xs">sync</span>
              </span>
              Mencari...
            </span>
          ) : (
            `${searchResultData?.executionTimeMs ?? ''} ms`
          )}
        </div>
      </div>

      {/* Category Filter Pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
        <span className="text-xs font-bold text-[#735c00] mr-1 shrink-0">Kategori:</span>
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`px-3 py-1 rounded-full text-xs font-bold transition-all shrink-0 ${
              selectedCategory === cat
                ? 'bg-[#00595c] text-white shadow-xs'
                : 'bg-[#f5f5dc] text-[#3e4949] border border-[#bec9c9]/50 hover:bg-[#e4e4cc]'
            }`}
          >
            {cat === 'All' ? 'Semua' : cat}
          </button>
        ))}
      </div>

      {/* Book Filter Chips & Actions */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {/* Dropdown Chip */}
          <div className="relative">
            <button
              onClick={() => setBookDropdownOpen(!bookDropdownOpen)}
              className="flex items-center gap-1 px-3 py-1.5 bg-[#eaead1] rounded-lg text-[#3e4949] text-xs font-semibold hover:bg-[#e4e4cc] transition-colors border border-[#bec9c9]/40"
            >
              <span>Filter Kitab ({selectedBooks.length})</span>
              <span className="material-symbols-outlined text-sm">
                arrow_drop_down
              </span>
            </button>

            {bookDropdownOpen && (
              <div className="absolute top-full left-0 mt-1 w-56 bg-[#ffffff] border border-[#bec9c9]/60 rounded-xl shadow-lg z-20 p-2 space-y-1 max-h-60 overflow-y-auto">
                {availableBooks.map((b) => (
                  <button
                    key={b}
                    onClick={() => {
                      handleToggleBook(b);
                      setBookDropdownOpen(false);
                    }}
                    className="w-full text-right px-3 py-1.5 text-xs rounded-md hover:bg-[#f5f5dc] font-serif-scholar flex items-center justify-between"
                  >
                    <span className="text-[#00595c]">
                      {selectedBooks.includes(b) ? '✓' : ''}
                    </span>
                    <span className="truncate">{b}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Selected Filter Chips */}
          {selectedBooks.map((book) => (
            <div
              key={book}
              className="flex items-center gap-1 px-3 py-1.5 bg-[#0d7377] text-[#a2f5f9] rounded-lg text-xs font-semibold font-serif-scholar shadow-2xs"
            >
              <span className="truncate max-w-[140px]">{book}</span>
              <button
                onClick={() => handleToggleBook(book)}
                className="mr-1 flex items-center hover:text-white"
              >
                <span className="material-symbols-outlined text-xs">close</span>
              </button>
            </div>
          ))}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-4 text-xs">
          <button
            onClick={handleSelectAll}
            className="font-semibold text-[#00595c] hover:underline underline-offset-4 decoration-2"
          >
            Pilih Semua Kitab
          </button>
          <button
            onClick={handleClearAll}
            className="font-semibold text-[#3e4949] hover:text-red-700 transition-colors"
          >
            Reset Filter
          </button>
        </div>
      </div>

      {/* Search Results List */}
      <section className="mt-4 space-y-3">
        <div className="flex justify-between items-center">
          <h2 className="text-xs font-bold text-[#3e4949] uppercase tracking-widest">
            {isEngineReady ? `Hasil Pencarian (${displayTotalCount})` : 'Siap Mencari'}
          </h2>
          <span className="text-[11px] text-[#3e4949]">
            Halaman {displayPage} dari {displayTotalPages}
          </span>
        </div>

        {!isEngineReady ? (
          <div className="bg-[#ffffff] p-8 rounded-xl border border-[#bec9c9]/30 text-center space-y-3">
            <span className="material-symbols-outlined text-3xl text-[#00595c] animate-spin">
              sync
            </span>
            <p className="font-bold text-sm text-[#1b1d0e]">
              Membangun indeks pencarian pustaka...
            </p>
            <p className="text-xs text-[#3e4949]">
              Mengindeks {indexedCount.toLocaleString()} dokumen dari pustaka
              {initTimeMs && ` (diperkirakan ${Math.round(initTimeMs / 1000)}s)`}
            </p>
            <p className="text-[10px] text-[#3e4949]/60">
              Silakan tunggu — semua halaman kitab sedang diindeks di latar belakang.
            </p>
          </div>
        ) : displayResults.length === 0 ? (
          <div className="bg-[#ffffff] p-8 rounded-xl border border-[#bec9c9]/30 text-center space-y-2">
            <span className="material-symbols-outlined text-4xl text-[#3e4949]/40">
              search_off
            </span>
            <p className="font-bold text-sm text-[#1b1d0e]">
              Tidak ada hasil yang cocup dengan query "{inputQuery}"
            </p>
            <p className="text-xs text-[#3e4949]">
              Coba gunakan kata kunci lain tanpa harakat atau upload kitab PDF baru.
            </p>
            <button
              onClick={() => {
                setInputQuery('');
                setSelectedCategory('All');
                setSelectedBooks([]);
              }}
              className="mt-2 px-4 py-1.5 bg-[#00595c] text-white text-xs font-bold rounded-lg"
            >
              Reset Pencarian
            </button>
          </div>
        ) : (
          displayResults.map((res) => {
            const isBookmarked = bookmarkedIds.has(res.id);
            return (
              <article
                key={res.id}
                className="bg-[#ffffff] p-4 rounded-xl border border-[#bec9c9]/30 shadow-xs hover:shadow-md transition-shadow group"
              >
                <header className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[#735c00] filled">
                      {res.iconName || 'menu_book'}
                    </span>
                    <h3 className="text-base font-bold text-[#00595c] font-serif-scholar">
                      {res.bookTitleArabic || res.bookTitleEnglish}
                    </h3>
                  </div>
                  <span className="text-xs text-[#3e4949] font-serif-scholar font-bold bg-[#f5f5dc] px-2 py-0.5 rounded">
                    {res.pageNumberArabic || ''}
                  </span>
                </header>

                {/* Highlighted Arabic/Text Snippet */}
                <div className="mb-3">
                  <p
                    className="font-amiri text-lg text-[#1b1d0e] leading-relaxed text-right"
                    dir="rtl"
                  >
                    {renderHighlightedSnippet(res.arabicTextSnippet, debouncedQuery)}
                  </p>
                </div>

                <footer className="flex items-center justify-between pt-2 border-t border-[#bec9c9]/20">
                  <button
                    onClick={() => onOpenBook(res.id.replace('book-', '').replace(/^pdf-/, ''))}
                    className="px-5 py-1.5 border border-[#00595c] text-[#00595c] rounded-lg text-xs font-bold hover:bg-[#00595c]/10 transition-colors active:scale-95"
                  >
                    Buka Halaman
                  </button>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => toggleBookmark(res.id)}
                      className={`p-2 transition-colors active:scale-90 ${
                        isBookmarked ? 'text-[#735c00]' : 'text-[#3e4949] hover:text-[#735c00]'
                      }`}
                      title="Bookmark"
                    >
                      <span
                        className={`material-symbols-outlined ${
                          isBookmarked ? 'filled' : ''
                        }`}
                      >
                        bookmark
                      </span>
                    </button>
                    <button
                      onClick={() => handleShare(res)}
                      className="p-2 text-[#3e4949] hover:text-[#00595c] transition-colors active:scale-90"
                      title="Share"
                    >
                      <span className="material-symbols-outlined">share</span>
                    </button>
                  </div>
                </footer>
              </article>
            );
          })
        )}
      </section>

      {/* Pagination Footer */}
      {isEngineReady && displayTotalPages > 1 && (
        <footer className="pt-4 pb-6 flex items-center justify-between border-t border-[#bec9c9]/40 text-xs">
          <span className="text-[#3e4949]">
            Total {displayTotalCount} hasil
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className={`px-3 py-1.5 rounded-lg font-bold border ${
                currentPage === 1
                  ? 'text-[#3e4949]/40 border-gray-200 cursor-not-allowed'
                  : 'text-[#00595c] border-[#00595c] hover:bg-[#00595c]/10'
              }`}
            >
              Sebelumnya
            </button>

            <span className="font-bold text-[#00595c]">
              {currentPage} / {displayTotalPages}
            </span>

            <button
              onClick={() =>
                setCurrentPage((p) => Math.min(displayTotalPages, p + 1))
              }
              disabled={currentPage === displayTotalPages}
              className={`px-3 py-1.5 rounded-lg font-bold border ${
                currentPage === displayTotalPages
                  ? 'text-[#3e4949]/40 border-gray-200 cursor-not-allowed'
                  : 'text-[#00595c] border-[#00595c] hover:bg-[#00595c]/10'
              }`}
            >
              Berikutnya
            </button>
          </div>
        </footer>
      )}
    </div>
  );
};
