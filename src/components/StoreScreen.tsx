import React, { useState, useEffect, useRef } from 'react';
import { Book } from '../types';
import { useSearchContext } from '../utils/SearchContext';
import {
  searchArchive,
  fetchArchivePdf,
  ArchiveBook,
} from '../utils/archiveOrgApi';
import { isPdfTextBased, extractTextFromPdf } from '../utils/pdfExtractor';

interface StoreScreenProps {
  books: Book[];
  onDownloadBook: (bookId: string) => void;
  onOpenBook: (bookId: string) => void;
  onAddBook?: (newBook: Book) => void;
}

type DownloadStatus = 'idle' | 'downloading' | 'checking' | 'extracting' | 'indexing' | 'done';

export const StoreScreen: React.FC<StoreScreenProps> = ({
  books,
  onDownloadBook,
  onOpenBook,
  onAddBook,
}) => {
  const searchCtx = useSearchContext();
  const { isEngineReady } = searchCtx;

  // ── Archive.org search state ────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ArchiveBook[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [totalResults, setTotalResults] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);

  // ── Download state ─────────────────────────────────────────────────────────
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadStatus, setDownloadStatus] = useState<DownloadStatus>('idle');
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadedNotice, setDownloadedNotice] = useState<string | null>(null);

  // ── Source selector ──────────────────────────────────────────────────────────
  const [selectedSource, setSelectedSource] = useState<'archive-org' | 'pustaka'>('archive-org');

  const inputRef = useRef<HTMLInputElement | null>(null);

  // ── Search Archive.org ───────────────────────────────────────────────────────
  const handleSearch = async () => {
    if (!searchQuery.trim() || isSearching) return;

    setIsSearching(true);
    setSearchError(null);
    setSearchResults([]);
    setCurrentPage(1);

    try {
      const result = await searchArchive(searchQuery.trim(), 1, 20);
      setSearchResults(result.books);
      setTotalResults(result.totalResults);
    } catch (err) {
      console.error('Archive.org search failed:', err);
      setSearchError(
        err instanceof Error
          ? err.message
          : 'Gagal mencari di Archive.org. Periksa koneksi Anda.'
      );
    } finally {
      setIsSearching(false);
    }
  };

  // ── Download & process a book from Archive.org ───────────────────────────────
  const handleDownloadBook = async (archBook: ArchiveBook) => {
    if (!archBook.isPdfAvailable || !archBook.downloadUrl) {
      setDownloadedNotice('PDF tidak tersedia untuk kitab ini.');
      setTimeout(() => setDownloadedNotice(null), 3000);
      return;
    }

    setDownloadingId(archBook.identifier);
    setDownloadStatus('downloading');
    setDownloadProgress(0);

    try {
      // 1. Fetch the PDF blob (track progress via stream)
      const response = await fetch(archBook.downloadUrl, {
        headers: {
          'User-Agent': 'Fihris-Kitab/1.0 (https://github.com/fihris-tsx)',
        },
      });

      if (!response.ok) {
        throw new Error(`Gagal mengunduh: ${response.status}`);
      }

      // Track download progress using Content-Length
      const contentLength = parseInt(response.headers.get('Content-Length') || '0', 10);
      const reader = response.body?.getReader();
      if (!reader || !contentLength) {
        // Fallback — just read the blob
        const blob = await response.blob();
        setDownloadProgress(100);
        await processDownloadedPdf(blob, archBook);
        return;
      }

      const chunks: Uint8Array[] = [];
      let received = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;
        setDownloadProgress(Math.round((received / contentLength) * 100));
      }

      const blob = new Blob(chunks, { type: 'application/pdf' });
      await processDownloadedPdf(blob, archBook);
    } catch (err) {
      console.error('Download failed:', err);
      setDownloadedNotice(
        `Gagal mengunduh: ${err instanceof Error ? err.message : String(err)}`
      );
      setTimeout(() => setDownloadedNotice(null), 4000);
    } finally {
      setDownloadingId(null);
      setDownloadStatus('idle');
      setDownloadProgress(0);
    }
  };

  /**
   * After downloading the PDF blob:
   *  - Check if it is text-based or image-based.
   *  - If text-based: extract text, index in search worker, add book with arabicExcerpt.
   *  - If image-based: create book with pdfUrl only (PDF viewer mode).
   */
  async function processDownloadedPdf(blob: Blob, archBook: ArchiveBook) {
    setDownloadStatus('checking');
    setDownloadProgress(100);

    const isTextBased = await isPdfTextBased(blob);

    // Create blob URL for PDF viewer
    const pdfUrl = URL.createObjectURL(blob);
    const fileSize = (blob.size / 1024 / 1024).toFixed(1) + ' MB';

    let newBook: Book = {
      id: `archive-${archBook.identifier}`,
      title: archBook.title,
      titleArabic: archBook.title,
      author: archBook.author,
      authorArabic: archBook.author,
      category: 'History',
      pages: archBook.pageCount || 1,
      currentPage: 1,
      isOffline: true,
      isFree: true,
      fileSize,
      description: archBook.description || `Kitab dari Archive.org: ${archBook.title}`,
      source: 'archive-org',
      archiveId: archBook.identifier,
      pdfUrl,
    };

    if (isTextBased) {
      // Extract text and index in search engine
      setDownloadStatus('extracting');

      // Create a File-like object for extractTextFromPdf
      const file = new File([blob], `${archBook.identifier}.pdf`, {
        type: 'application/pdf',
      });

      try {
        const pdfResult = await extractTextFromPdf(file);

        // If no text was extracted despite isPdfTextBased returning true,
        // fall back to image-based handling
        if (pdfResult.pages.length === 0) {
          setDownloadStatus('done');
          setDownloadedNotice(
            `Kitab "${archBook.title}" berhasil diunduh (buku berbasis gambar).`
          );
          setTimeout(() => setDownloadedNotice(null), 4000);
        } else {
          // Enrich the book with extracted text
          newBook = {
            ...newBook,
            arabicExcerpt: pdfResult.fullTextPreview,
            englishExcerpt: pdfResult.fullTextPreview.slice(0, 300),
          };

          // Index in the search worker if engine is ready
          setDownloadStatus('indexing');
          if (isEngineReady) {
            searchCtx.postAddBook({
              book: newBook,
              pages: pdfResult.pages,
            });
          }

          setDownloadedNotice(
            `Kitab "${archBook.title}" berhasil diunduh & di-indeks!`
          );
          setTimeout(() => setDownloadedNotice(null), 4000);
        }
      } catch (err) {
        console.error('Text extraction failed:', err);
        // Still add the book with PDF viewing capability
        setDownloadedNotice(
          `Kitab "${archBook.title}" diunduh (PDF tersedia untuk dibaca).`
        );
        setTimeout(() => setDownloadedNotice(null), 4000);
      }
    } else {
      // Image-based PDF — no text extraction, just PDF reading
      setDownloadStatus('done');
      setDownloadedNotice(
        `Kitab "${archBook.title}" berhasil diunduh (buku berbasis gambar).`
      );
      setTimeout(() => setDownloadedNotice(null), 4000);
    }

    // Add to App books state
    if (onAddBook) {
      onAddBook(newBook);
    }

    // Open the book
    onOpenBook(newBook.id);
  }

  const categories = [
    { name: 'Fiqh', icon: 'gavel' },
    { name: 'Hadith', icon: 'menu_book' },
    { name: 'Tafsir', icon: 'import_contacts' },
    { name: 'Lughah', icon: 'translate' },
    { name: 'History', icon: 'history_edu' },
    { name: 'Aqidah', icon: 'shield' },
  ];

  return (
    <div className="pb-24 px-4 max-w-4xl mx-auto space-y-6 pt-2">
      {/* Toast Notice */}
      {downloadedNotice && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-[#00595c] text-[#a2f5f9] text-xs font-bold px-4 py-2.5 rounded-full shadow-lg flex items-center gap-2 animate-bounce">
          <span className="material-symbols-outlined text-sm">info</span>
          <span>{downloadedNotice}</span>
        </div>
      )}

      {/* Page Title */}
      <section className="space-y-3">
        <h2 className="font-title-lg text-xl font-bold text-[#00595c] flex items-center gap-2">
          <span className="material-symbols-outlined">library_books</span>
          Kitab Marketplace
        </h2>

        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
          <button
            onClick={() => setSelectedSource('archive-org')}
            className={`flex items-center gap-1 px-4 py-2 rounded-full text-xs font-semibold shadow-xs border transition-all ${
              selectedSource === 'archive-org'
                ? 'bg-[#fed65b] text-[#745c00] border-[#745c00]/30'
                : 'bg-[#efefd7] text-[#3e4949] border-[#bec9c9]/30'
            }`}
          >
            Archive.org
            <span className="material-symbols-outlined text-base">arrow_drop_down</span>
          </button>

          <button
            onClick={() => setSelectedSource('pustaka')}
            className={`flex items-center gap-1 px-4 py-2 rounded-full text-xs font-semibold shadow-xs border transition-all ${
              selectedSource === 'pustaka'
                ? 'bg-[#fed65b] text-[#745c00] border-[#745c00]/30'
                : 'bg-[#efefd7] text-[#3e4949] border-[#bec9c9]/30'
            }`}
          >
            Pustaka Database
          </button>
        </div>
      </section>

      {/* ── Archive.org Search ────────────────────────────────────────────── */}
      {selectedSource === 'archive-org' && (
        <>
          {/* Search Input */}
          <div className="relative group">
            <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none">
              <span className="material-symbols-outlined text-[#3e4949]">search</span>
            </div>
            <input
              ref={inputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSearch();
                }
              }}
              placeholder="Cari kitab di Archive.org (mis: al-Bukhari, al-Tafsir, dll)..."
              className="block w-full pr-12 pl-24 py-3.5 bg-[#f5f5dc] border border-[#bec9c9] rounded-xl focus:ring-2 focus:ring-[#00595c] focus:border-[#00595c] font-serif-scholar text-lg text-[#1b1d0e] transition-all shadow-xs text-right placeholder:text-[#3e4949]/60 placeholder:text-sm"
              dir="rtl"
              disabled={isSearching}
            />
            <div className="absolute inset-y-0 left-0 pl-2 flex items-center gap-1">
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="p-1.5 text-[#3e4949] hover:text-[#00595c] transition-colors rounded-full"
                  title="Clear"
                >
                  <span className="material-symbols-outlined text-lg">close</span>
                </button>
              )}
              <button
                onClick={handleSearch}
                disabled={isSearching || !searchQuery.trim()}
                className={`p-1.5 rounded-full transition-colors ${
                  isSearching || !searchQuery.trim()
                    ? 'text-[#3e4949]/40 cursor-not-allowed'
                    : 'text-[#00595c] hover:bg-[#00595c]/10'
                }`}
                title="Cari"
              >
                {isSearching ? (
                  <span className="material-symbols-outlined animate-spin text-xl">sync</span>
                ) : (
                  <span className="material-symbols-outlined text-xl">search</span>
                )}
              </button>
            </div>
          </div>

          {/* Search Error */}
          {searchError && (
            <div className="bg-red-100 border border-red-300 text-red-800 text-xs p-3 rounded-xl">
              {searchError}
            </div>
          )}

          {/* Search Results */}
          {searchResults.length > 0 && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <p className="text-xs text-[#3e4949]">
                  Ditemukan <span className="font-bold">{totalResults}</span> hasil untuk "{searchQuery}"
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {searchResults.map((archBook) => {
                  const isDownloading = downloadingId === archBook.identifier;
                  const wasDownloaded = books.some(
                    (b) => b.archiveId === archBook.identifier
                  );

                  return (
                    <div
                      key={archBook.identifier}
                      className="flex flex-col gap-2 group"
                    >
                      <div className="relative aspect-[3/4] bg-[#eaead1] rounded-xl overflow-hidden shadow-xs border border-[#bec9c9]/30">
                        {archBook.coverUrl ? (
                          <img
                            src={archBook.coverUrl}
                            alt={archBook.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-[#00595c] text-white">
                            <span className="material-symbols-outlined text-3xl">
                              menu_book
                            </span>
                          </div>
                        )}

                        {/* Download Button */}
                        {!wasDownloaded && (
                          <button
                            onClick={() => handleDownloadBook(archBook)}
                            disabled={isDownloading || !archBook.isPdfAvailable}
                            className={`absolute top-2 right-2 p-1.5 rounded-full shadow-md transition-all active:scale-90 ${
                              isDownloading
                                ? 'bg-[#0d7377] animate-pulse'
                                : 'bg-[#00595c]/80 hover:bg-[#00595c] text-white'
                            }`}
                            title={
                              archBook.isPdfAvailable ? 'Unduh PDF' : 'PDF tidak tersedia'
                            }
                          >
                            {isDownloading ? (
                              <span className="material-symbols-outlined text-sm">
                                sync
                              </span>
                            ) : (
                              <span className="material-symbols-outlined text-sm">
                                download
                              </span>
                            )}
                          </button>
                        )}
                      </div>

                      <div>
                        <p className="font-bold text-xs leading-snug line-clamp-2 text-[#1b1d0e]">
                          {archBook.title}
                        </p>
                        <p className="text-[10px] text-[#3e4949] truncate">
                          {archBook.author}
                        </p>
                        {isDownloading && (
                          <div className="w-full h-1 bg-[#bec9c9]/40 rounded-full overflow-hidden mt-1">
                            <div
                              className="h-full bg-[#00595c] rounded-full transition-all"
                              style={{ width: `${downloadProgress}%` }}
                            />
                          </div>
                        )}
                        {wasDownloaded && (
                          <span className="text-[9px] text-[#00595c] font-semibold">
                            Sudah diunduh
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Download Status Bar */}
              {downloadingId && (
                <div className="fixed bottom-24 left-0 right-0 flex justify-center z-30">
                  <div className="px-4 py-2.5 rounded-full bg-[#00595c] text-white text-xs font-bold shadow-xl flex items-center gap-2">
                    <span className="material-symbols-outlined text-sm animate-spin">
                      sync
                    </span>
                    <span>
                      {downloadStatus === 'downloading' && `Mengunduh... ${Math.round(downloadProgress)}%`}
                      {downloadStatus === 'checking' && 'Memverifikasi PDF...'}
                      {downloadStatus === 'extracting' && 'Mengekstrak teks...'}
                      {downloadStatus === 'indexing' && ' Mengindeks...'}
                      {downloadStatus === 'done' && 'Selesai!'}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Empty State */}
          {!isSearching && searchResults.length === 0 && !searchError && searchQuery && (
            <div className="text-center py-12">
              <span className="material-symbols-outlined text-3xl text-[#3e4949]/30 mb-3">
                search_off
              </span>
              <p className="text-sm text-[#3e4949]">
                Tidak ada hasil untuk "{searchQuery}". Coba kata kunci lain.
              </p>
            </div>
          )}
        </>
      )}

      {/* ── Pustaka Database (local books) ──────────────────────────────────── */}
      {selectedSource === 'pustaka' && (
        <section className="space-y-3">
          <h3 className="font-title-lg text-base font-bold text-[#1b1d0e]">
            Kitab dari Database Pustaka ({books.length})
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {books.map((book) => (
              <div
                key={book.id}
                className="flex flex-col gap-2 group cursor-pointer"
                onClick={() => onOpenBook(book.id)}
              >
                <div className="aspect-[3/4] bg-[#eaead1] rounded-xl overflow-hidden shadow-xs border border-[#bec9c9]/30">
                  {book.coverImage ? (
                    <img
                      src={book.coverImage}
                      alt={book.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-[#00595c] text-white">
                      <span className="material-symbols-outlined text-3xl">
                        menu_book
                      </span>
                    </div>
                  )}
                </div>
                <div>
                  <p className="font-bold text-xs leading-snug line-clamp-1 text-[#1b1d0e]">
                    {book.titleArabic || book.title}
                  </p>
                  <p className="text-[10px] text-[#3e4949] truncate">
                    {book.author}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Categories Grid */}
      <section className="space-y-3">
        <h3 className="font-title-lg text-base font-bold text-[#1b1d0e]">Categories</h3>
        <div className="grid grid-cols-4 gap-y-5 gap-x-2">
          {categories.map((cat) => (
            <div
              key={cat.name}
              className="flex flex-col items-center gap-1.5 group cursor-pointer"
            >
              <div className="w-14 h-14 bg-[#0d7377] text-[#a2f5f9] rounded-full flex items-center justify-center shadow-xs group-active:scale-90 transition-transform hover:bg-[#00595c]">
                <span className="material-symbols-outlined text-2xl">{cat.icon}</span>
              </div>
              <span className="text-xs font-semibold text-[#1b1d0e]">{cat.name}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
