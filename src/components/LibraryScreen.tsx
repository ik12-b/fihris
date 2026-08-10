import React, { useState } from 'react';
import { Book } from '../types';
import { useSearchContext } from '../utils/SearchContext';

interface LibraryScreenProps {
  books: Book[];
  onOpenBook: (bookId: string) => void;
  onSearchInside: (bookId: string) => void;
}

export const LibraryScreen: React.FC<LibraryScreenProps> = ({
  books,
  onOpenBook,
  onSearchInside,
}) => {
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [isGridView, setIsGridView] = useState(false);

  const { isEngineReady, indexedCount, initTimeMs, fromCache } = useSearchContext();

  const categories = ['All', 'Fiqh', 'Hadith', 'Tafsir', 'Aqidah', 'Others'];

  const filteredBooks = books.filter((book) => {
    if (activeCategory === 'All') return true;
    if (activeCategory === 'Others') return !['Fiqh', 'Hadith', 'Tafsir', 'Aqidah'].includes(book.category);
    return book.category === activeCategory;
  });

  return (
    <div className="pb-24 max-w-4xl mx-auto px-4">
      {/* Category Tabs Bar */}
      <nav className="flex overflow-x-auto no-scrollbar gap-6 py-3 border-b border-[#bec9c9]/30 mb-5 sticky top-16 bg-[#fbfbe2] z-20">
        {categories.map((cat) => {
          const isActive = activeCategory === cat;
          return (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`flex-shrink-0 text-sm pb-2 font-semibold transition-all ${
                isActive
                  ? 'text-[#00595c] border-b-2 border-[#00595c] font-bold'
                  : 'text-[#3e4949] hover:text-[#00595c]'
              }`}
            >
              {cat}
            </button>
          );
        })}
      </nav>

      {/* Search Engine Status Card */}
      {!isEngineReady && indexedCount === 0 && (
        <section className="mb-6">
          <div className="bg-[#efefd7] rounded-xl p-4 border border-[#00595c]/20 shadow-xs relative overflow-hidden">
            <div className="flex justify-between items-start mb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-[#0d7377] flex items-center justify-center shadow-2xs">
                  <span className="material-symbols-outlined text-[#a2f5f9] animate-spin">
                    sync
                  </span>
                </div>
                <div>
                  <p className="font-bold text-sm text-[#1b1d0e]">
                    Membangun indeks pustaka...
                  </p>
                  <p className="text-xs text-[#3e4949]">
                    Memindeks {indexedCount.toLocaleString()} dokumen
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex-1 h-2 bg-[#bec9c9]/40 rounded-full overflow-hidden relative">
                <div className="absolute top-0 left-0 h-full bg-[#00595c] rounded-full animate-pulse w-1/2"></div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* View Mode Toggle Header */}
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-sm font-bold text-[#3e4949] uppercase tracking-wider">
          Kitab Collection ({filteredBooks.length})
        </h2>
        <button
          onClick={() => setIsGridView(!isGridView)}
          className="p-1.5 rounded-lg bg-[#eaead1] text-[#00595c] text-xs font-semibold flex items-center gap-1 border border-[#bec9c9]/30"
        >
          <span className="material-symbols-outlined text-sm">
            {isGridView ? 'list' : 'grid_view'}
          </span>
          <span>{isGridView ? 'List View' : 'Grid View'}</span>
        </button>
      </div>

      {/* Book List / Grid View */}
      <div
        className={
          isGridView
            ? 'grid grid-cols-2 sm:grid-cols-3 gap-4'
            : 'grid grid-cols-1 md:grid-cols-2 gap-4'
        }
      >
        {filteredBooks.map((book) => (
          <div
            key={book.id}
            className="flex gap-3 p-3.5 bg-[#ffffff] rounded-xl shadow-xs border border-[#bec9c9]/30 hover:shadow-md transition-all group"
          >
            {/* Book Cover */}
            <div className="w-20 h-32 flex-shrink-0 rounded-lg overflow-hidden shadow-xs bg-[#eaead1] border border-[#bec9c9]/40 flex flex-col items-center justify-center">
              {book.coverImage ? (
                <img
                  src={book.coverImage}
                  alt={book.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center p-2 text-center bg-[#f5f5dc] text-[#6e7979]">
                  <span className="material-symbols-outlined text-3xl mb-1">
                    menu_book
                  </span>
                  <span className="text-[9px] uppercase font-bold">No Cover</span>
                </div>
              )}
            </div>

            {/* Book Info */}
            <div className="flex flex-col justify-between flex-1 min-w-0">
              <div>
                <div className="flex justify-between items-start gap-1">
                  <h3 className="font-bold text-sm text-[#1b1d0e] leading-tight truncate">
                    {book.title}
                  </h3>
                  {book.isOffline && (
                    <span className="bg-[#00595c]/10 text-[#00595c] px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider flex items-center gap-0.5 flex-shrink-0">
                      <span className="material-symbols-outlined text-[10px] filled">
                        check_circle
                      </span>
                      Offline
                    </span>
                  )}
                </div>
                <p className="text-xs text-[#3e4949] truncate mt-0.5">{book.author}</p>
                <p className="text-[11px] text-[#6e7979] mt-1">
                  {book.volumes ? `${book.volumes} Volumes • ` : ''}
                  {book.pages.toLocaleString()} pages
                </p>
              </div>

              {/* Action buttons */}
              <div className="flex flex-wrap gap-2 mt-3">
                <button
                  onClick={() => onOpenBook(book.id)}
                  className="bg-[#00595c] text-white px-3.5 py-1.5 rounded-full text-xs font-bold hover:bg-[#00595c]/90 transition-opacity active:scale-95"
                >
                  Read
                </button>
                <button
                  onClick={() => onSearchInside(book.id)}
                  className="border border-[#00595c] text-[#00595c] px-2.5 py-1.5 rounded-full text-xs font-bold hover:bg-[#00595c]/10 transition-colors active:scale-95"
                >
                  Search Inside
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
