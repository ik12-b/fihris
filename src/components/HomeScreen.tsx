import React, { useState } from 'react';
import { Book, TabType } from '../types';

interface HomeScreenProps {
  books: Book[];
  onOpenBook: (bookId: string) => void;
  onNavigateToTab: (tab: TabType) => void;
  onSearchQuerySubmit: (query: string) => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  books,
  onOpenBook,
  onNavigateToTab,
  onSearchQuerySubmit,
}) => {
  const [searchInput, setSearchInput] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('Fiqh');
  const [isListening, setIsListening] = useState(false);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchInput.trim()) {
      onSearchQuerySubmit(searchInput.trim());
      onNavigateToTab('search');
    }
  };

  const continueReadingBooks = books.filter((b) => b.progress && b.progress > 0);
  const popularBooks = books.filter((b) => b.isFree || b.rating && b.rating >= 4.8);

  const toggleMic = () => {
    setIsListening(true);
    setSearchInput('إيمان');
    setTimeout(() => {
      setIsListening(false);
    }, 1200);
  };

  return (
    <div className="pb-24 px-4 max-w-4xl mx-auto space-y-6 pt-2">
      {/* Search Bar Input */}
      <section className="mt-2 flex justify-center">
        <form onSubmit={handleSearchSubmit} className="w-full relative group">
          <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[#3e4949]">
            search
          </span>
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search titles, authors, or topics..."
            className="w-full h-12 pl-12 pr-12 rounded-full border border-[#bec9c9] bg-[#f5f5dc] focus:border-[#00595c] focus:ring-2 focus:ring-[#00595c]/20 transition-all text-sm outline-none shadow-xs text-[#1b1d0e]"
          />
          <button
            type="button"
            onClick={toggleMic}
            className={`material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 text-[#3e4949] hover:text-[#00595c] transition-colors p-1 rounded-full ${
              isListening ? 'animate-pulse text-[#00595c]' : ''
            }`}
            title="Voice Search"
          >
            mic
          </button>
        </form>
      </section>

      {/* Continue Reading Section */}
      <section className="space-y-3">
        <div className="flex justify-between items-center">
          <h2 className="font-title-lg text-lg font-bold text-[#00595c] flex items-center gap-1.5">
            <span>📖</span> Continue Reading
          </h2>
          <button
            onClick={() => onNavigateToTab('library')}
            className="text-xs text-[#00595c] font-semibold hover:underline"
          >
            View all
          </button>
        </div>

        <div className="flex overflow-x-auto gap-4 no-scrollbar pb-2 -mx-4 px-4">
          {continueReadingBooks.map((book) => (
            <div
              key={book.id}
              onClick={() => onOpenBook(book.id)}
              className="flex-shrink-0 w-48 bg-[#efefd7] rounded-xl p-3 shadow-xs border border-[#bec9c9]/30 hover:shadow-md transition-all cursor-pointer group active:scale-98"
            >
              <div className="w-full aspect-[2/3] bg-[#00595c] rounded-lg border-2 border-[#fed65b] mb-3 flex flex-col items-center justify-center p-3 relative overflow-hidden text-center shadow-xs">
                <div className="absolute inset-0 opacity-15 bg-[radial-gradient(#ffe088_1px,transparent_1px)] [background-size:12px_12px]"></div>
                <span className="text-white font-bold font-serif-scholar text-base z-10 leading-snug line-clamp-2">
                  {book.titleArabic || book.title}
                </span>
                <span className="text-xs text-[#a2f5f9] mt-1 z-10 line-clamp-1 opacity-90">
                  {book.title}
                </span>
              </div>

              <h3 className="font-title-lg text-sm font-bold text-[#1b1d0e] truncate">
                {book.title}
              </h3>
              <p className="text-xs text-[#3e4949] truncate mb-2">{book.author}</p>

              {/* Progress bar */}
              <div className="w-full bg-[#bec9c9]/40 rounded-full h-1.5 mb-1 overflow-hidden">
                <div
                  className="bg-[#00595c] h-1.5 rounded-full transition-all duration-500"
                  style={{ width: `${book.progress || 30}%` }}
                ></div>
              </div>
              <p className="text-[10px] text-[#3e4949] text-right font-medium">
                Page {book.currentPage || 1}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* My Collections Section */}
      <section className="space-y-3">
        <h2 className="font-title-lg text-lg font-bold text-[#00595c] flex items-center gap-1.5">
          <span>📂</span> My Collections
        </h2>
        <div className="flex overflow-x-auto gap-2.5 no-scrollbar pb-1">
          {['Fiqh', 'Hadith', 'Tafsir', 'Aqidah', 'History'].map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-all shadow-xs ${
                selectedCategory === cat
                  ? 'bg-[#0d7377] text-[#a2f5f9]'
                  : 'bg-[#e4e4cc] text-[#3e4949] hover:bg-[#e4e4cc]/80'
              }`}
            >
              {cat}
            </button>
          ))}
          <button
            onClick={() => onNavigateToTab('library')}
            className="px-4 py-2 rounded-full border-2 border-dashed border-[#00595c] text-[#00595c] text-xs font-semibold whitespace-nowrap flex items-center gap-1 hover:bg-[#00595c]/5 transition-colors"
          >
            <span className="material-symbols-outlined text-sm">add</span> New Collection
          </button>
        </div>
      </section>

      {/* Popular This Week Grid */}
      <section className="space-y-3 pb-8">
        <div className="flex justify-between items-center">
          <h2 className="font-title-lg text-lg font-bold text-[#00595c] flex items-center gap-1.5">
            <span>🔥</span> Popular This Week
          </h2>
          <button
            onClick={() => onNavigateToTab('store')}
            className="text-xs text-[#00595c] font-semibold hover:underline"
          >
            Explore Store
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {popularBooks.slice(0, 4).map((book) => (
            <div
              key={book.id}
              onClick={() => onOpenBook(book.id)}
              className="flex flex-col gap-2 group cursor-pointer"
            >
              <div className="relative w-full aspect-[3/4] rounded-xl overflow-hidden shadow-sm bg-[#eaead1] border border-[#bec9c9]/30 group-hover:shadow-md transition-all">
                {book.coverImage ? (
                  <img
                    src={book.coverImage}
                    alt={book.title}
                    className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-500"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center p-4 bg-[#00595c] text-white text-center">
                    <span className="material-symbols-outlined text-4xl mb-1">
                      menu_book
                    </span>
                    <span className="text-xs font-bold">{book.title}</span>
                  </div>
                )}
                {book.isFree && (
                  <div className="absolute top-2 right-2 bg-emerald-700 text-white font-bold text-[10px] px-2 py-0.5 rounded-full shadow-xs">
                    Free
                  </div>
                )}
              </div>
              <div>
                <h4 className="font-bold text-xs text-[#1b1d0e] line-clamp-1">
                  {book.title}
                </h4>
                <p className="text-[11px] text-[#3e4949] line-clamp-1">{book.author}</p>
                <p className="text-[10px] text-[#6e7979] mt-0.5">
                  {book.pages.toLocaleString()} pages
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Floating Action Button (+) */}
      <button
        onClick={() => onNavigateToTab('library')}
        className="fixed bottom-20 right-5 w-14 h-14 bg-[#00595c] text-white rounded-full shadow-xl flex items-center justify-center active:scale-95 transition-transform z-30 hover:bg-[#00595c]/90"
        title="Add Manuscript"
      >
        <span className="material-symbols-outlined text-2xl">add</span>
      </button>
    </div>
  );
};
