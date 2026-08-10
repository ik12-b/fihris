import React, { useState, useEffect, useRef } from 'react';
import { Book } from '../types';
import * as pdfjsLib from 'pdfjs-dist';

// Set up pdfjs worker source for browser PDF rendering
if (typeof window !== 'undefined' && pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version || '4.10.38'}/build/pdf.worker.min.mjs`;
}

interface ReaderScreenProps {
  book: Book;
  onBack: () => void;
}

export const ReaderScreen: React.FC<ReaderScreenProps> = ({ book, onBack }) => {
  const [controlsVisible, setControlsVisible] = useState(true);
  const [currentPage, setCurrentPage] = useState(book.currentPage || 1);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [fontSizeSp, setFontSizeSp] = useState(20);
  const [languageMode, setLanguageMode] = useState<'ar' | 'en' | 'bilingual'>('ar');
  const [viewMode, setViewMode] = useState<'text' | 'pdf'>(book.pdfUrl ? 'pdf' : 'text');
  const [pdfZoom, setPdfZoom] = useState<number>(100);
  const [pdfPageCount, setPdfPageCount] = useState<number>(0);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [showPdfError, setShowPdfError] = useState(false);
  const [showSettingsDrawer, setShowSettingsDrawer] = useState(false);
  const [showTocDrawer, setShowTocDrawer] = useState(false);
  const [showSearchInsideModal, setShowSearchInsideModal] = useState(false);
  const [searchInsideTerm, setSearchInsideTerm] = useState('');

  // Full text content for pustaka books loaded from .txt files
  const [bookPages, setBookPages] = useState<string[]>([]);
  const [txtLoading, setTxtLoading] = useState(false);
  const [txtError, setTxtError] = useState<string | null>(null);

  // ── Load local .txt file for pustaka books ─────────────────────────────────
  // Fetches the full text content from the server API and splits it into pages
  // using the PAGE_SEPARATOR marker used in the pustaka text corpus.
  useEffect(() => {
    console.log('[ReaderScreen] txtPath:', book.txtPath, 'viewMode:', viewMode);
    if (!book.txtPath || viewMode !== 'text') return;

    let cancelled = false;
    setTxtLoading(true);
    setTxtError(null);

    // Step 1: List .txt files in the book directory
    const dirPath = book.txtPath.replace('assets/pustaka/', '');
    console.log('[ReaderScreen] dirPath:', dirPath);
    const encodedPath = encodeURIComponent(dirPath);
    fetch(`/api/pustaka/list/${encodedPath}`)
      .then((res) => {
        console.log('[ReaderScreen] list response status:', res.status);
        if (!res.ok) throw new Error(`Failed to list txt files: ${res.status}`);
        return res.json();
      })
      .then((data: { files: string[] }) => {
        console.log('[ReaderScreen] list result:', data);
        if (cancelled) return;
        const txtFiles = data.files.filter((f) => f.endsWith('.txt'));
        if (txtFiles.length === 0) {
          throw new Error('No .txt files found in book directory');
        }
        // Use the first (or main) txt file
        const txtFile = txtFiles[0];
        // Step 2: Fetch the full text file content via API endpoint
        // Encode the path components properly to handle special characters
        const encodedDirPath = encodeURIComponent(dirPath);
        const encodedTxtFile = encodeURIComponent(txtFile);
        return fetch(`/api/pustaka/file/${encodedDirPath}/${encodedTxtFile}`);
      })
      .then((res) => {
        console.log('[ReaderScreen] file response status:', res.status);
        if (!res.ok) throw new Error(`Failed to load txt content: ${res.status}`);
        return res.text();
      })
      .then((text) => {
        console.log('[ReaderScreen] file text length:', text.length);
        if (cancelled) return;
        const pages = text.split('PAGE_SEPARATOR').map((p) => p.trim()).filter(Boolean);
        setBookPages(pages.length > 0 ? pages : [text]);
        setTxtLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load book text:', err);
        setTxtError(err.message);
        setTxtLoading(false);
      });

    return () => { cancelled = true; };
  }, [book.txtPath, viewMode, book.id]);

  const totalPages = bookPages.length > 0 ? bookPages.length : (book.pages || pdfPageCount || 1);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Generate a dynamic table of contents based on the book's total page count or loaded pages.
  const dynamicToc = (() => {
    const markers = [];
    const effectiveTotal = bookPages.length > 0 ? bookPages.length : (book.pages || 1);
    const sectionCount = Math.min(10, Math.max(2, Math.ceil(effectiveTotal / 30)));
    const interval = Math.round(effectiveTotal / sectionCount);
    for (let i = 0; i <= sectionCount; i++) {
      const page = Math.min(i * interval, effectiveTotal) || 1;
      if (page > 0) {
        markers.push({ chapter: String(i + 1), title: `Bagian ${i + 1}`, page });
      }
    }
    return markers;
  })();

  // Auto hide controls after 7 seconds
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (controlsVisible) {
      timer = setTimeout(() => {
        setControlsVisible(false);
      }, 7000);
    }
    return () => clearTimeout(timer);
  }, [controlsVisible]);

  const toggleControls = (e: React.MouseEvent) => {
    // If clicked inside interactive controls or drawers, don't toggle
    if ((e.target as HTMLElement).closest('button, input, nav, header, .drawer, .pdf-toolbar')) return;
    setControlsVisible(!controlsVisible);
  };

  // ── Render PDF page via pdfjs when in PDF mode with a valid pdfUrl ──────────
  useEffect(() => {
    if (viewMode !== 'pdf' || !book.pdfUrl || !canvasRef.current) return;

    let cancelled = false;

    (async () => {
      try {
        setPdfLoading(true);
        setShowPdfError(false);

        const loadingTask = pdfjsLib.getDocument({ url: book.pdfUrl as string });
        const pdfDoc = await loadingTask.promise;

        if (cancelled) return;

        setPdfPageCount(pdfDoc.numPages);

        if (currentPage < 1 || currentPage > pdfDoc.numPages) return;

        const page = await pdfDoc.getPage(currentPage);
        const viewport = page.getViewport({ scale: pdfZoom / 100 });

        const canvas = canvasRef.current!;
        const context = canvas.getContext('2d')!;

        canvas.height = viewport.height;
        canvas.width = viewport.width;

        await page.render({
          canvasContext: context,
          canvas,
          viewport,
        }).promise;
        if (cancelled) return;
        setPdfLoading(false);
      } catch (err) {
        console.error('PDF render error:', err);
        setShowPdfError(true);
        setPdfLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [viewMode, book.pdfUrl, currentPage, pdfZoom]);

  // Auto hide controls after 7 seconds

  return (
    <div 
      onClick={toggleControls}
      className="relative min-h-screen w-full bg-[#f5f5dc] text-[#1b1d0e] flex flex-col justify-between overflow-x-hidden selection:bg-[#0d7377] selection:text-[#a2f5f9]"
    >
      {/* Immersive Top App Bar */}
      <header
        className={`fixed top-0 left-0 right-0 z-40 bg-[#fbfbe2]/95 backdrop-blur-md border-b border-[#bec9c9]/30 transition-all duration-300 ${
          controlsVisible ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0'
        }`}
      >
        <div className="flex items-center justify-between h-16 px-3 max-w-4xl mx-auto gap-2">
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={onBack}
              className="p-2 rounded-full hover:bg-[#e4e4cc]/50 text-[#00595c] transition-colors"
              title="Kembali"
            >
              <span className="material-symbols-outlined">arrow_back</span>
            </button>

            <button
              onClick={onBack}
              className="p-2 rounded-full hover:bg-red-100 text-[#00595c] hover:text-red-700 transition-colors ml-1"
              title="Tutup Reader"
            >
              <span className="material-symbols-outlined text-xl">close</span>
            </button>
          </div>

          <div className="flex-1 flex flex-col justify-center px-1 text-center overflow-hidden">
            <h1 className="font-serif-scholar text-base md:text-lg font-bold text-[#1b1d0e] truncate">
              {book.titleArabic || book.title}
            </h1>
            <p className="text-[10px] text-[#3e4949] truncate">{book.author}</p>
          </div>

          {/* View Mode Segmented Switcher (Teks Matan vs PDF Direct View) */}
          <div className="flex items-center bg-[#eaead1] p-1 rounded-xl border border-[#bec9c9]/50 shrink-0">
            <button
              onClick={() => setViewMode('text')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                viewMode === 'text'
                  ? 'bg-[#00595c] text-white shadow-xs'
                  : 'text-[#3e4949] hover:text-[#00595c]'
              }`}
              title="Tampilan Teks Digital"
            >
              <span className="material-symbols-outlined text-sm">article</span>
              <span className="hidden sm:inline">Teks</span>
            </button>
            <button
              onClick={() => setViewMode('pdf')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                viewMode === 'pdf'
                  ? 'bg-[#00595c] text-white shadow-xs'
                  : 'text-[#3e4949] hover:text-[#00595c]'
              }`}
              title="Tampilan PDF Langsung"
            >
              <span className="material-symbols-outlined text-sm">picture_as_pdf</span>
              <span className="hidden sm:inline">PDF</span>
            </button>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => setIsBookmarked(!isBookmarked)}
              className={`p-2 rounded-full transition-colors ${
                isBookmarked ? 'text-[#735c00]' : 'text-[#00595c] hover:bg-[#e4e4cc]/50'
              }`}
              title="Bookmark Halaman"
            >
              <span className={`material-symbols-outlined ${isBookmarked ? 'filled' : ''}`}>
                bookmark
              </span>
            </button>

            <button
              onClick={() => setShowSettingsDrawer(!showSettingsDrawer)}
              className="p-2 rounded-full hover:bg-[#e4e4cc]/50 text-[#00595c] transition-colors"
              title="Pengaturan Tampilan"
            >
              <span className="material-symbols-outlined">tune</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Reader Content Area: TEXT MODE vs DIRECT PDF MODE */}
      {viewMode === 'text' ? (
        <main className="flex-1 w-full max-w-2xl mx-auto px-5 pt-24 pb-36 text-justify leading-loose">
          {/* Manuscript Icon Deco Header */}
          <div className="mb-6 opacity-20 flex justify-center pointer-events-none">
            <span className="material-symbols-outlined text-6xl text-[#00595c]">
              menu_book
            </span>
          </div>

          {/* Text rendering: Arabic (RTL) / English / Bilingual */}
          <article className="space-y-6">
            {(languageMode === 'ar' || languageMode === 'bilingual') && (
              <div className="font-amiri text-right text-[#1b1d0e] space-y-6" dir="rtl">
                {txtLoading ? (
                  <div className="text-center py-12">
                    <span className="material-symbols-outlined text-3xl text-[#00595c] animate-spin mb-3">
                      sync
                    </span>
                    <p className="text-sm text-[#3e4949] font-bold">
                      Memuat teks penuh kitab...
                    </p>
                  </div>
                ) : bookPages.length > 0 ? (
                  <p style={{ fontSize: `${fontSizeSp}px`, lineHeight: 2.2 }}>
                    {bookPages[currentPage - 1] || bookPages[0]}
                  </p>
                ) : book.arabicExcerpt ? (
                  <p style={{ fontSize: `${fontSizeSp}px`, lineHeight: 2.2 }}>
                    {book.arabicExcerpt}
                  </p>
                ) : txtError ? (
                  <p className="text-center text-sm text-red-600 py-8">
                    Gagal memuat teks penuh: {txtError}
                  </p>
                ) : (
                  <p className="text-center text-sm text-[#3e4949]/50 py-8">
                    Teks penuh kitab ini belum tersedia secara digital.
                  </p>
                )}
              </div>
            )}

            {languageMode === 'bilingual' && book.arabicExcerpt && book.englishExcerpt && (
              <div className="py-6 border-t-2 border-dashed border-[#bec9c9]/50 my-6"></div>
            )}

            {(languageMode === 'en' || languageMode === 'bilingual') && (
              <div className="font-serif text-[#3e4949] space-y-5 text-left" dir="ltr">
                {book.englishExcerpt ? (
                  <p style={{ fontSize: `${Math.max(14, fontSizeSp - 4)}px`, lineHeight: 1.8 }}>
                    {book.englishExcerpt}
                  </p>
                ) : (
                  <p className="text-center text-sm text-[#3e4949]/50 py-8">
                    English translation not available for this manuscript.
                  </p>
                )}
              </div>
            )}
          </article>

          {/* End Divider */}
          <div className="py-12 flex flex-col items-center gap-3">
            <div className="h-2 w-2 rounded-full bg-[#0d7377]"></div>
            <div className="h-2 w-2 rounded-full bg-[#0d7377] opacity-60"></div>
            <div className="h-2 w-2 rounded-full bg-[#0d7377] opacity-30"></div>
          </div>
        </main>
      ) : (
        /* DIRECT PDF VIEWER MODE */
        <main className="flex-1 w-full pt-20 pb-36 px-2 flex flex-col items-center">
          {book.pdfUrl ? (
            <>
              {/* PDF Viewer Floating Control Bar */}
              <div className="pdf-toolbar mb-4 w-full max-w-3xl bg-[#fbfbe2] p-2.5 rounded-xl border border-[#bec9c9]/60 shadow-xs flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-1.5 font-bold text-[#00595c]">
                  <span className="material-symbols-outlined text-base">picture_as_pdf</span>
                  <span>Dokumen PDF Asli</span>
                </div>

                {/* Zoom Controls */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPdfZoom((z) => Math.max(60, z - 15))}
                    className="p-1.5 bg-[#eaead1] rounded-lg hover:bg-[#e4e4cc] text-[#00595c]"
                    title="Zoom Out"
                  >
                    <span className="material-symbols-outlined text-sm">zoom_out</span>
                  </button>
                  <span className="font-mono text-xs text-[#3e4949] font-bold min-w-[42px] text-center">
                    {pdfZoom}%
                  </span>
                  <button
                    onClick={() => setPdfZoom((z) => Math.min(200, z + 15))}
                    className="p-1.5 bg-[#eaead1] rounded-lg hover:bg-[#e4e4cc] text-[#00595c]"
                    title="Zoom In"
                  >
                    <span className="material-symbols-outlined text-sm">zoom_in</span>
                  </button>
                  <button
                    onClick={() => setPdfZoom(100)}
                    className="px-2 py-1 bg-[#eaead1] rounded-lg hover:bg-[#e4e4cc] text-[#3e4949] font-semibold"
                  >
                    Reset
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-[#3e4949]">
                    Halaman {currentPage} dari {pdfPageCount || totalPages}
                  </span>
                </div>
              </div>

              {/* PDF Canvas rendering via pdfjs */}
              <div className="w-full max-w-2xl bg-[#f4efe0] rounded-lg border-2 border-[#735c00]/40 shadow-2xl p-4 relative overflow-auto">
                {showPdfError ? (
                  <p className="text-center text-sm text-red-600 py-8">
                    Gagal memuat PDF. Silakan gunakan mode teks.
                  </p>
                ) : (
                  <canvas
                    ref={canvasRef}
                    className="w-full h-auto mx-auto"
                    style={{ display: pdfLoading ? 'none' : 'block' }}
                  />
                )}
                {pdfLoading && (
                  <div className="text-center py-8">
                    <span className="material-symbols-outlined text-3xl text-[#00595c] animate-spin">
                      sync
                    </span>
                    <p className="text-xs text-[#3e4949] mt-2">Memuat halaman PDF...</p>
                  </div>
                )}
              </div>
            </>
          ) : (
            // No PDF URL — prompt to switch to text mode
            <div className="text-center py-12">
              <span className="material-symbols-outlined text-3xl text-[#3e4949]/40 mb-3">
                description
              </span>
              <p className="font-bold text-sm text-[#1b1d0e]">
                PDF tidak tersedia untuk kitab ini.
              </p>
              <p className="text-xs text-[#3e4949] mt-1">
                Gunakan mode Teks untuk membaca {book.titleArabic || book.title}.
              </p>
              <button
                onClick={() => setViewMode('text')}
                className="mt-3 px-4 py-2 bg-[#00595c] text-white text-xs font-bold rounded-lg"
              >
                Beralih ke Mode Teks
              </button>
            </div>
          )}
        </main>
      )}

      {/* Floating Page Indicator Pill */}
      <div
        className={`fixed bottom-24 left-0 right-0 flex justify-center z-30 transition-all duration-300 pointer-events-none ${
          controlsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
        }`}
      >
        <div className="px-4 py-1.5 rounded-full bg-[#e4e4cc]/90 backdrop-blur-md shadow-xs border border-[#bec9c9]/30">
          <span className="font-serif-scholar text-xs font-semibold text-[#3e4949]">
            Halaman {currentPage} dari {totalPages.toLocaleString()} ({viewMode === 'pdf' ? 'Mode PDF' : 'Mode Teks'})
          </span>
        </div>
      </div>

      {/* Bottom Floating Navigation Scrubber Bar */}
      <nav
        className={`fixed bottom-0 left-0 right-0 z-40 bg-[#fbfbe2]/95 backdrop-blur-md px-4 py-3 border-t border-[#bec9c9]/30 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] transition-all duration-300 ${
          controlsVisible ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0'
        }`}
      >
        <div className="max-w-2xl mx-auto space-y-3">
          {/* Slider & Page buttons */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="p-1.5 rounded-full hover:bg-[#e4e4cc] text-[#00595c] active:scale-90 transition-transform"
              title="Previous Page"
            >
              <span className="material-symbols-outlined">chevron_left</span>
            </button>

            <input
              type="range"
              min="1"
              max={totalPages}
              value={currentPage}
              onChange={(e) => setCurrentPage(Number(e.target.value))}
              className="w-full h-1.5 bg-[#bec9c9]/40 rounded-lg appearance-none cursor-pointer accent-[#00595c]"
            />

            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="p-1.5 rounded-full hover:bg-[#e4e4cc] text-[#00595c] active:scale-90 transition-transform"
              title="Next Page"
            >
              <span className="material-symbols-outlined">chevron_right</span>
            </button>
          </div>

          {/* Quick Action Navigation items */}
          <div className="flex items-center justify-around text-xs">
            <button
              onClick={() => setShowTocDrawer(true)}
              className="flex flex-col items-center gap-0.5 text-[#3e4949] hover:text-[#00595c]"
            >
              <span className="material-symbols-outlined text-lg">
                format_list_bulleted
              </span>
              <span>Daftar Isi</span>
            </button>

            <button
              onClick={() => setViewMode(book.pdfUrl ? (viewMode === 'text' ? 'pdf' : 'text') : 'text')}
              className="flex flex-col items-center gap-0.5 text-[#00595c] font-bold"
            >
              <span className="material-symbols-outlined text-lg">
                {viewMode === 'text' ? 'picture_as_pdf' : 'article'}
              </span>
              <span>Mode {viewMode === 'text' ? 'PDF' : 'Teks'}</span>
            </button>

            <button
              onClick={() => setShowSearchInsideModal(true)}
              className="flex flex-col items-center gap-0.5 text-[#3e4949] hover:text-[#00595c]"
            >
              <span className="material-symbols-outlined text-lg">search</span>
              <span>Cari</span>
            </button>

            <button
              onClick={() => setLanguageMode(languageMode === 'ar' ? 'bilingual' : languageMode === 'bilingual' ? 'en' : 'ar')}
              className="flex flex-col items-center gap-0.5 text-[#3e4949] hover:text-[#00595c]"
            >
              <span className="material-symbols-outlined text-lg">translate</span>
              <span className="capitalize">{languageMode}</span>
            </button>

            <button
              onClick={() => setIsBookmarked(!isBookmarked)}
              className={`flex flex-col items-center gap-0.5 ${
                isBookmarked ? 'text-[#735c00]' : 'text-[#3e4949] hover:text-[#00595c]'
              }`}
            >
              <span className={`material-symbols-outlined text-lg ${isBookmarked ? 'filled' : ''}`}>
                star
              </span>
              <span>Markah</span>
            </button>
          </div>
        </div>
      </nav>

      {/* Reader Text Settings Drawer */}
      {showSettingsDrawer && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-end justify-center p-0 sm:p-4 drawer">
          <div className="bg-[#fbfbe2] w-full max-w-lg rounded-t-2xl sm:rounded-2xl p-5 border border-[#bec9c9]/40 shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b border-[#bec9c9]/30 pb-3">
              <h3 className="font-bold text-sm text-[#00595c]">Pengaturan Tampilan Baca</h3>
              <button
                onClick={() => setShowSettingsDrawer(false)}
                className="text-[#3e4949] hover:text-black"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs text-[#3e4949] font-medium block mb-1">
                  Mode Tampilan Utama
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setViewMode('text')}
                    className={`flex-1 py-2 px-3 text-xs font-bold rounded-lg border flex items-center justify-center gap-1.5 ${
                      viewMode === 'text'
                        ? 'bg-[#00595c] text-white border-[#00595c]'
                        : 'bg-[#efefd7] text-[#3e4949] border-[#bec9c9]/40'
                    }`}
                  >
                    <span className="material-symbols-outlined text-sm">article</span>
                    <span>Teks Matan (Digital)</span>
                  </button>
                  <button
                    onClick={() => setViewMode('pdf')}
                    className={`flex-1 py-2 px-3 text-xs font-bold rounded-lg border flex items-center justify-center gap-1.5 ${
                      viewMode === 'pdf'
                        ? 'bg-[#00595c] text-white border-[#00595c]'
                        : 'bg-[#efefd7] text-[#3e4949] border-[#bec9c9]/40'
                    }`}
                  >
                    <span className="material-symbols-outlined text-sm">picture_as_pdf</span>
                    <span>Tampilan PDF Langsung</span>
                  </button>
                </div>
              </div>
              <div>
                <label className="text-xs text-[#3e4949] font-medium block mb-1">
                  Font Size ({fontSizeSp}sp)
                </label>
                <input
                  type="range"
                  min="14"
                  max="32"
                  value={fontSizeSp}
                  onChange={(e) => setFontSizeSp(Number(e.target.value))}
                  className="w-full h-1.5 bg-[#e4e4cc] rounded-lg appearance-none cursor-pointer accent-[#00595c]"
                />
              </div>

              <div>
                <label className="text-xs text-[#3e4949] font-medium block mb-1">
                  Display Language
                </label>
                <div className="flex gap-2">
                  {[
                    { id: 'ar', label: 'العربية (Arabic)' },
                    { id: 'en', label: 'English' },
                    { id: 'bilingual', label: 'Bilingual Parallel' },
                  ].map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setLanguageMode(m.id as any)}
                      className={`flex-1 py-1.5 px-2 text-xs font-bold rounded-lg border ${
                        languageMode === m.id
                          ? 'bg-[#0d7377] text-[#a2f5f9] border-[#00595c]'
                          : 'bg-[#efefd7] text-[#3e4949] border-[#bec9c9]/40'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Table of Contents Drawer */}
      {showTocDrawer && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 drawer">
          <div className="bg-[#fbfbe2] w-full max-w-md rounded-t-2xl sm:rounded-2xl p-5 border border-[#bec9c9]/40 shadow-2xl space-y-4 max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-[#bec9c9]/30 pb-3">
              <h3 className="font-bold text-sm text-[#00595c]">Contents (المحتويات)</h3>
              <button
                onClick={() => setShowTocDrawer(false)}
                className="text-[#3e4949] hover:text-black"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            <div className="space-y-2">
              {dynamicToc.map((item) => (
                <button
                  key={item.page}
                  onClick={() => {
                    setCurrentPage(item.page);
                    setShowTocDrawer(false);
                  }}
                  className="w-full text-right p-3 rounded-xl bg-[#f5f5dc] hover:bg-[#eaead1] transition-colors border border-[#bec9c9]/30 flex items-center justify-between font-serif-scholar"
                >
                  <span className="text-xs text-[#00595c] font-bold">
                    Page {item.page}
                  </span>
                  <span className="text-sm text-[#1b1d0e] font-bold">
                    {item.title}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Search Inside Book Modal */}
      {showSearchInsideModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 drawer">
          <div className="bg-[#fbfbe2] w-full max-w-md rounded-2xl p-5 border border-[#bec9c9]/40 shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b border-[#bec9c9]/30 pb-3">
              <h3 className="font-bold text-sm text-[#00595c]">
                Search inside {book.title}
              </h3>
              <button
                onClick={() => setShowSearchInsideModal(false)}
                className="text-[#3e4949] hover:text-black"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            <div className="relative">
              <input
                type="text"
                value={searchInsideTerm}
                onChange={(e) => setSearchInsideTerm(e.target.value)}
                placeholder="Type keyword or page number..."
                className="w-full h-11 pl-4 pr-10 rounded-xl border border-[#bec9c9] bg-[#f5f5dc] text-xs font-medium outline-none focus:border-[#00595c]"
              />
              <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-[#3e4949]">
                search
              </span>
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <button
                onClick={() => setShowSearchInsideModal(false)}
                className="px-4 py-2 text-xs font-bold text-[#3e4949]"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (searchInsideTerm) {
                    const pageNum = parseInt(searchInsideTerm);
                    if (!isNaN(pageNum) && pageNum > 0) {
                      setCurrentPage(Math.min(totalPages, pageNum));
                    }
                  }
                  setShowSearchInsideModal(false);
                }}
                className="px-5 py-2 bg-[#00595c] text-white text-xs font-bold rounded-lg shadow-xs hover:bg-[#00595c]/90"
              >
                Search Term
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
