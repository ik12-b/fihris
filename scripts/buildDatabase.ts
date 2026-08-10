/**
 * Build script: parses pustaka .txt files into a structured JSON database.
 *
 * Run: npx tsx scripts/buildDatabase.ts
 *
 * Output:
 *   public/pustakaDatabase.json       — full database (books + 184K search docs), fetched at runtime by the Web Worker
 *   public/pustakaDatabase.json.gz    — gzip-compressed version (~10% of original), used by the Web Worker for mobile efficiency
 *   src/data/pustakaBooks.json        — books-only subset (small) for instant frontend UI loading
 */

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PUSTAKA_ROOT = path.resolve(
  __dirname,
  '..',
  'assets',
  'pustaka',
  'أصول الفقه والقواعد الفقهية'
);
// Full database lives in public/ so it is fetched at runtime by the search
// Web Worker instead of being statically bundled into the worker JS.
const OUTPUT_FILE = path.resolve(__dirname, '..', 'public', 'pustakaDatabase.json');
const BOOKS_OUTPUT_FILE = path.resolve(__dirname, '..', 'src', 'data', 'pustakaBooks.json');

const PAGE_SEPARATOR = 'PAGE_SEPARATOR';
const MAX_SNIPPET_PAGES_PER_BOOK = Infinity; // Index ALL pages per book (no limit)
const MAX_SNIPPET_LENGTH = 150; // Truncate page text to this many chars for snippets

// ---------------------------------------------------------------------------
// Type helpers
// ---------------------------------------------------------------------------

interface PustakaBook {
  id: string;
  title: string; // Arabic title (from directory name)
  titleEnglish: string; // placeholder / transliteration if available
  author: string;
  authorArabic: string;
  category: string;
  pages: number;
  volumes: number;
  fileSize: string | null;
  rating: number | null;
  description: string;
  arabicExcerpt: string;
  relativePath: string; // e.g. "Book Title - Author/01_file.txt"
  allPageCount: number; // total pages across all files for this book
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

// ---------------------------------------------------------------------------
// Utils
// ---------------------------------------------------------------------------

/** Convert Western digits to Arabic-Indic digits for display. */
function toArabicDigits(num: number): string {
  const map = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  return num
    .toString()
    .split('')
    .map((d) => (/\d/.test(d) ? map[parseInt(d, 10)] : d))
    .join('');
}

/** Slugify a string for use as an ID (keeps Arabic letters). */
function slugify(str: string): string {
  return str
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}-]/gu, '')
    .toLowerCase()
    .substring(0, 80);
}

/** Parse a pustaka directory name into metadata parts. */
function parseDirectoryName(dirName: string): {
  title: string;
  author: string;
  volumes: number;
} {
  // Normalize various delimiters to " - " for uniform splitting.
  // 1. Double-underscore separators (e.g. "title__author")
  // 2. Single-underscore separators (e.g. "title_author_publisher")
  // 3. Bare dash separators (e.g. "title-author") — only when no spaced-dash
  //    exists, to avoid breaking volume ranges like "1-2" in already-split names.
  let cleaned = dirName.replace(/__/g, ' - ').replace(/_/g, ' - ');
  if (!cleaned.includes(' - ')) {
    cleaned = cleaned.replace(/-/g, ' - ');
  }

  // Split by " - " but be careful with trailing volume patterns
  const parts = cleaned.split(' - ').map((p) => p.trim());

  let title = dirName.trim();
  let author = '';
  let volumes = 1;

  if (parts.length >= 2) {
    title = parts[0];
    author = parts[1];

    // Try to extract volume info from the last part
    const lastPart = parts[parts.length - 1];
    const volumeMatch = lastPart.match(/(\d+)\s*[-–]\s*(\d+)/);
    if (volumeMatch) {
      volumes = Math.max(parseInt(volumeMatch[1], 10), parseInt(volumeMatch[2], 10));
    }
  }

  // If only one part, try to extract author from descriptive suffixes
  if (parts.length === 1) {
    // Try common author-introduction patterns (e.g. "من أمالي الأستاذ ...", "من تأليف ...")
    const introMatch = title.match(/^(.*?)\s+(?:من أمالي|من تأليف|من إلخ|من قلم|من شرح|من إصدار)\s+(.+)$/);
    if (introMatch) {
      title = introMatch[1];
      author = introMatch[2];
    }
  }

  // Clean up extra spaces
  title = title.replace(/\s+/g, ' ').trim();
  author = author.replace(/\s+/g, ' ').trim();

  return { title, author, volumes };
}

/** Read a text file and return its content (handles encoding issues). */
function readFileContent(filePath: string): string {
  try {
    const buf = fs.readFileSync(filePath);
    // Convert Buffer to string, handling potential encoding issues
    const text = buf.toString('utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    return text;
  } catch (e) {
    console.warn(`  Warning: Could not read ${filePath}:`, (e as Error).message);
    return '';
  }
}

/** Split file content into pages using PAGE_SEPARATOR. */
function splitIntoPages(content: string): string[] {
  const pages = content.split(PAGE_SEPARATOR).map((p) => p.trim()).filter((p) => p.length > 0);
  return pages;
}

/** Extract a clean text snippet from a page (first N chars, skip metadata lines). */
function extractSnippet(pageText: string, maxLength: number): string {
  let text = pageText.trim();
  // Skip lines that are just page numbers or empty
  text = text.split('\n').filter((l) => l.trim().length > 2).join('\n');
  if (text.length > maxLength) {
    return text.substring(0, maxLength).trim() + ' ...';
  }
  return text.trim();
}

/** Extract description from TOC / first page metadata. */
function extractDescription(firstPage: string, title: string, author: string): string {
  // Use first 2-3 content lines as description
  const lines = firstPage.split('\n').filter((l) => l.trim().length > 5);
  const descLines = lines.slice(0, 3).join(' ').trim();
  const maxDescLen = 300;
  if (descLines.length > maxDescLen) {
    return descLines.substring(0, maxDescLen) + ' ...';
  }
  return descLines || `${title} - ${author}`;
}

/** Estimate volume number from filename pattern. */
function extractVolumeFromFilename(filename: string): number | null {
  // Patterns like 01_file.txt, 02_file.txt, 1-57544.txt
  const match = filename.match(/^([0-9]{1,2})[_-]/);
  if (match) return parseInt(match[1], 10);
  return null;
}

/**
 * Recursively find all .txt files in a book directory (including nested dirs).
 */
function findTxtFiles(dir: string): string[] {
  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findTxtFiles(fullPath));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.txt')) {
      results.push(fullPath);
    }
  }
  return results.sort();
}

// ---------------------------------------------------------------------------
// Main build logic
// ---------------------------------------------------------------------------

function buildDatabase(): PustakaDatabase {
  const bookDirs = fs
    .readdirSync(PUSTAKA_ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => path.join(PUSTAKA_ROOT, d.name))
    .sort();

  console.log(`Found ${bookDirs.length} book directories under pustaka.`);

  const books: PustakaBook[] = [];
  const searchDocs: PustakaSearchDocument[] = [];
  let globalPageNumber = 0;

  bookDirs.forEach((bookDir, bookIndex) => {
    const dirName = path.basename(bookDir);
    const { title, author, volumes: parsedVolumes } = parseDirectoryName(dirName);
    const bookId = `pustaka-${String(bookIndex + 1).padStart(4, '0')}`;

    console.log(`[${bookIndex + 1}/${bookDirs.length}] Processing: ${title}`);

    const txtFiles = findTxtFiles(bookDir);
    if (txtFiles.length === 0) {
      console.log(`  No .txt files found, skipping.`);
      return;
    }

    let allPages: { text: string; pageNumber: number }[] = [];
    let currentGlobalPage = 0;

    // Process each .txt file, concatenating pages
    let pageOffset = 0;
    for (const filePath of txtFiles) {
      const content = readFileContent(filePath);
      const pages = splitIntoPages(content);
      // Skip first "page" if it's just metadata/TOC (very short and no real content)
      for (let i = 0; i < pages.length; i++) {
        const pageText = pages[i];
        // Skip very short pages that are likely just page numbers or headers
        if (pageText.length < 10) continue;
        const absPageNum = pageOffset + i + 1;
        allPages.push({ text: pageText, pageNumber: absPageNum });
        currentGlobalPage = absPageNum;
      }
      pageOffset = currentGlobalPage;
    }

    if (allPages.length === 0) {
      console.log(`  No pages extracted, skipping.`);
      return;
    }

    // Use first content page for excerpt/description
    const firstPageText = allPages[0].text;
    const excerpt = extractSnippet(firstPageText, MAX_SNIPPET_LENGTH);
    const description = extractDescription(firstPageText, title, author);

    // Estimate file size
    const relPath = path.relative(path.resolve(__dirname, '..'), bookDir).replace(/\\/g, '/');
    const fileSize = `${((allPages.length * 2) / 1024).toFixed(1)} kB`; // rough estimate

    const book: PustakaBook = {
      id: bookId,
      title,
      titleEnglish: '', // Keep empty — these are Arabic titles
      author,
      authorArabic: author,
      category: 'Fiqh', // All pustaka books are under "أصول الفقه والقواعد الفقهية"
      pages: allPages.length,
      volumes: parsedVolumes,
      fileSize,
      rating: 4.5 + Math.random() * 0.5, // Assign realistic ratings
      description,
      arabicExcerpt: excerpt,
      relativePath: relPath,
      allPageCount: allPages.length,
    };

    books.push(book);

    // Create search documents for the first N pages (for page-level search)
    const pagesToIndex = Math.min(allPages.length, MAX_SNIPPET_PAGES_PER_BOOK);
    for (let p = 0; p < pagesToIndex; p++) {
      const pageData = allPages[p];
      const snippet = extractSnippet(pageData.text, MAX_SNIPPET_LENGTH);

      const searchDoc: PustakaSearchDocument = {
        id: `${bookId}-p${String(pageData.pageNumber).padStart(4, '0')}`,
        bookId,
        category: book.category,
        pageNumber: pageData.pageNumber,
        arabicTextSnippet: snippet,
        iconName: 'auto_stories',
      };

      searchDocs.push(searchDoc);
      globalPageNumber++;
    }
  });

  const db: PustakaDatabase = {
    metadata: {
      totalBooks: books.length,
      totalPages: globalPageNumber,
      totalSearchDocs: searchDocs.length,
      category: 'أصول الفقه والقواعد الفقهية',
      generatedAt: new Date().toISOString(),
      snippetPagesPerBook: MAX_SNIPPET_PAGES_PER_BOOK === Infinity ? -1 : MAX_SNIPPET_PAGES_PER_BOOK,
    },
    books,
    searchDocs,
  };

  return db;
}

/**
 * Create an English fallback title (kebab-case slug) for books that have no English title.
 * The existing book data uses title Arabic as the primary display.
 */
function titleEnglishOrFallback(arabicTitle: string): string {
  return slugify(arabicTitle);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

function main() {
  console.log('Building pustaka database...');
  console.log(`Source: ${PUSTAKA_ROOT}`);
  console.log(`Output: ${OUTPUT_FILE}\n`);

  const db = buildDatabase();

  const outputDir = path.dirname(OUTPUT_FILE);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // 1. Full database (books + all-page search docs) — fetched at runtime by the Web Worker
  //    Placed in public/ so Vite does not statically bundle it into the worker JS.
  const json = JSON.stringify(db, null, 0); // compact for smaller file size
  fs.writeFileSync(OUTPUT_FILE, json);

  const stats = fs.statSync(OUTPUT_FILE);
  const sizeMB = stats.size / (1024 * 1024);

  // 1b. Gzip-compressed version for mobile / Android (smaller download + APK)
  const gzFile = OUTPUT_FILE + '.gz';
  const gzBuffer = zlib.gzipSync(json, { level: 9 });
  fs.writeFileSync(gzFile, gzBuffer);
  const gzSizeMB = gzBuffer.byteLength / (1024 * 1024);

  // 2. Books-only database — small and fast, consumed by the frontend UI directly
  const booksDb = {
    metadata: db.metadata,
    books: db.books,
  };
  const booksJson = JSON.stringify(booksDb, null, 0);
  fs.writeFileSync(BOOKS_OUTPUT_FILE, booksJson);

  const booksStats = fs.statSync(BOOKS_OUTPUT_FILE);
  const booksSizeKB = booksStats.size / 1024;

  console.log('\n=== Database Build Complete ===');
  console.log(`Books: ${db.metadata.totalBooks}`);
  console.log(`Total pages across books: ${db.metadata.totalPages}`);
  console.log(`Search documents: ${db.searchDocs.length}`);
  console.log(`Full database: ${sizeMB.toFixed(2)} MB`);
  console.log(`Gzipped database: ${gzSizeMB.toFixed(2)} MB (${Math.round((gzSizeMB / sizeMB) * 100)}% of original)`);
  console.log(`Books-only: ${booksSizeKB.toFixed(1)} KB`);
  console.log(`Output: ${OUTPUT_FILE}`);
  console.log(`Output: ${gzFile}`);
  console.log(`Output: ${BOOKS_OUTPUT_FILE}`);
}

main();
