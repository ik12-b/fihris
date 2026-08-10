import rawBooks from './pustakaBooks.json';
import { toArabicDigits } from '../utils/searchEngine';
import { Book, SearchResult } from '../types';

/** Shape of the generated JSON database (defined by scripts/buildDatabase.ts). */
interface PustakaBook {
  id: string;
  title: string;
  titleEnglish: string;
  author: string;
  authorArabic: string;
  category: string;
  pages: number;
  volumes: number;
  fileSize: string | null;
  rating: number | null;
  description: string;
  arabicExcerpt: string;
  relativePath: string;
  allPageCount: number;
}

interface PustakaSearchDocument {
  id: string;
  bookId: string;
  category: string;
  pageNumber: number;
  arabicTextSnippet: string;
  iconName: string;
}

interface PustakaDatabase {
  metadata: {
    totalBooks: number;
    totalPages: number;
    totalSearchDocs: number;
    category: string;
    generatedAt: string;
    snippetPagesPerBook: number;
  };
  books: PustakaBook[];
  searchDocs: PustakaSearchDocument[];
}

const db = rawBooks as unknown as Pick<PustakaDatabase, 'books' | 'metadata'>;

/** Fast lookup map: bookId → PustakaBook for resolving titles in search docs. */
const bookById = new Map(db.books.map((b) => [b.id, b]));

/**
 * Find the full text file path for a pustaka book if it exists on disk.
 * The relativePath from the JSON metadata points to the book's directory
 * under assets/pustaka/, and the actual text file is a .txt file within it.
 */
function findTxtFilePath(relativePath: string): string | undefined {
  // relativePath looks like "assets/pustaka/الفئة/اسم الكتاب - المؤلف - ط العلامة"
  // The .txt file is within that directory. We return the directory path and
  // the client will discover the .txt file via a small manifest or convention.
  // For simplicity we return the relativePath as-is (already includes assets/pustaka prefix).
  return relativePath;
}

/** Convert a PustakaBook into the app's Book type. */
function toBook(pb: PustakaBook): Book {
  const txtDir = findTxtFilePath(pb.relativePath);
  return {
    id: pb.id,
    title: pb.title,
    titleArabic: pb.title,
    author: pb.author,
    authorArabic: pb.authorArabic,
    category: pb.category as Book['category'],
    pages: pb.allPageCount,
    volumes: pb.volumes > 1 ? pb.volumes : undefined,
    fileSize: pb.fileSize || undefined,
    rating: pb.rating || undefined,
    progress: 0,
    currentPage: 1,
    isOffline: true,
    isFree: true,
    description: pb.description,
    arabicExcerpt: pb.arabicExcerpt,
    source: 'pustaka',
    /** Directory path to the book's local text files */
    txtPath: txtDir,
  };
}

/**
 * Convert a compact PustakaSearchDocument into the app's SearchResult type.
 * Book titles and Arabic page numbers are derived from the bookId lookup
 * to avoid storing redundant data in the JSON database.
 *
 * Re-exported so the Web Worker and test runner can use the same conversion.
 */
function toSearchResult(doc: PustakaSearchDocument): SearchResult {
  const book = bookById.get(doc.bookId);
  const bookTitleArabic = book?.title || '';
  return {
    id: doc.id,
    bookTitleArabic,
    bookTitleEnglish: book?.titleEnglish || bookTitleArabic,
    pageNumberArabic: `صفحة ${toArabicDigits(doc.pageNumber)}`,
    pageNumber: doc.pageNumber,
    arabicTextSnippet: doc.arabicTextSnippet,
    queryKeyword: '',
    iconName: doc.iconName || 'auto_stories',
    category: doc.category,
  };
}

/** All pustaka books as Book[] — small and safe for direct frontend import. */
export const PUSTAKA_BOOKS: Book[] = db.books.map(toBook);

/** Pustaka metadata for display / debugging. */
export const PUSTAKA_METADATA = db.metadata;

// Re-export helpers and types for the Web Worker and test scripts
export { toSearchResult, bookById, findTxtFilePath };
export type { PustakaDatabase, PustakaBook, PustakaSearchDocument };
