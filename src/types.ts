export type TabType = 'home' | 'search' | 'library' | 'store' | 'settings' | 'reader';

export interface Book {
  id: string;
  title: string;
  titleArabic?: string;
  author: string;
  authorArabic?: string;
  category: 'Fiqh' | 'Hadith' | 'Tafsir' | 'Aqidah' | 'History' | 'Adab' | 'Sirah' | 'Lughah' | 'Uploaded PDF' | string;
  pages: number;
  volumes?: number;
  coverImage?: string;
  fileSize?: string;
  rating?: number;
  progress?: number; // 0 - 100 percentage
  currentPage?: number;
  isOffline?: boolean;
  isFree?: boolean;
  description?: string;
  arabicExcerpt?: string;
  englishExcerpt?: string;
  indonesianExcerpt?: string;
  pdfUrl?: string; // Blob URL for books uploaded as PDF
  /** Where the book came from. */
  source?: 'pustaka' | 'archive-org' | 'uploaded-pdf';
  /** Archive.org identifier (only for books sourced from archive.org). */
  archiveId?: string;
  /** Directory path to the book's local text files (for pustaka books). */
  txtPath?: string;
}

export interface SearchResult {
  id: string;
  bookTitleArabic: string;
  bookTitleEnglish: string;
  pageNumberArabic: string;
  pageNumber: number;
  arabicTextSnippet: string;
  queryKeyword: string;
  iconName: string;
  category?: string;
}

export interface ActiveDownload {
  id: string;
  title: string;
  progressPercentage: number;
  timeRemaining: string;
  coverImage: string;
  isPaused: boolean;
}

export interface ReaderSettings {
  fontSizeSp: number; // e.g., 16 to 28
  fontFamily: 'amiri' | 'serif' | 'sans';
  lineHeightRatio: number; // e.g. 1.8 to 2.4
  language: 'ar' | 'en' | 'id';
  themeMode: 'light' | 'dark' | 'sepia';
  pageNumber: number;
  totalPages: number;
  isBookmarked: boolean;
}
