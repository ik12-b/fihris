import React, { useState } from 'react';
import { TabType, Book } from './types';
import { PUSTAKA_BOOKS } from './data/pustakaLoader';
import { SplashScreen } from './components/SplashScreen';
import { TopAppBar } from './components/TopAppBar';
import { BottomNavBar } from './components/BottomNavBar';
import { HomeScreen } from './components/HomeScreen';
import { SearchScreen } from './components/SearchScreen';
import { LibraryScreen } from './components/LibraryScreen';
import { StoreScreen } from './components/StoreScreen';
import { SettingsScreen } from './components/SettingsScreen';
import { ReaderScreen } from './components/ReaderScreen';
import { SearchProvider } from './utils/SearchContext';

export default function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('home');
  const [books, setBooks] = useState<Book[]>(PUSTAKA_BOOKS);
  const [selectedBookId, setSelectedBookId] = useState<string>(PUSTAKA_BOOKS[0]?.id || 'pustaka-0001');
  const [searchQuery, setSearchQuery] = useState<string>('إيمان');
  const [language, setLanguage] = useState<'en' | 'id' | 'ar'>('id');
  const [themeMode, setThemeMode] = useState<'light' | 'dark' | 'system'>('light');
  const [fontSizeSp, setFontSizeSp] = useState(16);

  const handleOpenBook = (bookId: string) => {
    setSelectedBookId(bookId);
    setActiveTab('reader');
  };

  const handleSearchInside = (bookId: string) => {
    const book = books.find((b) => b.id === bookId);
    if (book) {
      setSearchQuery(book.titleArabic || book.title);
    }
    setActiveTab('search');
  };

  const handleDownloadBook = (bookId: string) => {
    setBooks((prev) =>
      prev.map((b) => (b.id === bookId ? { ...b, isOffline: true } : b))
    );
  };

  const handleAddUploadedBook = (newBook: Book) => {
    setBooks((prev) => [newBook, ...prev]);
  };

  const getTabTitle = (): string => {
    switch (activeTab) {
      case 'home':
        return language === 'id'
          ? "Assalamu'alaikum"
          : language === 'ar'
          ? 'السلام عليكم'
          : "Assalamu'alaikum";
      case 'search':
        return 'Kitab Search';
      case 'library':
        return language === 'id' ? 'Perpustakaan Saya' : 'My Library';
      case 'store':
        return 'Fihris - Book Marketplace';
      case 'settings':
        return language === 'id' ? 'Pengaturan' : 'Settings';
      case 'reader':
        return 'Fihris Reader';
      default:
        return 'Fihris';
    }
  };

  const currentBook =
    books.find((b) => b.id === selectedBookId) || books[0];

  return (
    <SearchProvider>
      {showSplash ? (
        <SplashScreen onFinish={() => setShowSplash(false)} />
      ) : activeTab === 'reader' ? (
        <ReaderScreen
          book={currentBook}
          onBack={() => setActiveTab('library')}
        />
      ) : (
        <div className="min-h-screen bg-[#fbfbe2] text-[#1b1d0e] font-sans antialiased flex flex-col justify-between">
          {/* Top Application Bar */}
          <TopAppBar
            title={getTabTitle()}
            subtitle={
              activeTab === 'home'
                ? 'Perpustakan Kitab & Manuskrip'
                : undefined
            }
            onOpenDrawer={() => setShowSplash(true)}
            onOpenProfile={() => setActiveTab('settings')}
            rightActionIcon={activeTab === 'search' ? 'filter_list' : 'notifications'}
            onRightAction={() => {
              if (activeTab === 'search') {
                setActiveTab('search');
              } else {
                setActiveTab('settings');
              }
            }}
          />

          {/* Main Content Area based on activeTab */}
          <main className="flex-1 w-full max-w-4xl mx-auto pt-2">
            {activeTab === 'home' && (
              <HomeScreen
                books={books}
                onOpenBook={handleOpenBook}
                onNavigateToTab={(tab) => setActiveTab(tab)}
                onSearchQuerySubmit={(q) => {
                  setSearchQuery(q);
                  setActiveTab('search');
                }}
              />
            )}

            {activeTab === 'search' && (
              <SearchScreen
                initialQuery={searchQuery}
                onOpenBook={handleOpenBook}
                onAddBook={handleAddUploadedBook}
              />
            )}

            {activeTab === 'library' && (
              <LibraryScreen
                books={books}
                onOpenBook={handleOpenBook}
                onSearchInside={handleSearchInside}
              />
            )}

            {activeTab === 'store' && (
              <StoreScreen
                books={books}
                onDownloadBook={handleDownloadBook}
                onOpenBook={handleOpenBook}
                onAddBook={handleAddUploadedBook}
              />
            )}

            {activeTab === 'settings' && (
              <SettingsScreen
                currentLanguage={language}
                onChangeLanguage={(lang) => setLanguage(lang)}
                currentTheme={themeMode}
                onChangeTheme={(t) => setThemeMode(t)}
                fontSizeSp={fontSizeSp}
                onChangeFontSize={(sz) => setFontSizeSp(sz)}
              />
            )}
          </main>

          {/* Bottom Navigation Bar */}
          <BottomNavBar
            activeTab={activeTab}
            onSelectTab={(tab) => setActiveTab(tab)}
            language={language}
          />
        </div>
      )}
    </SearchProvider>
  );
}
