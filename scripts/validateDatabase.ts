/**
 * Quick validation script for the generated pustaka JSON databases.
 * Verifies structural integrity before an Android build.
 *
 * Run: npx tsx scripts/validateDatabase.ts
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BOOKS_PATH = path.resolve(__dirname, '..', 'src', 'data', 'pustakaBooks.json');
const DB_PATH = path.resolve(__dirname, '..', 'public', 'pustakaDatabase.json');

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

interface PustakaSearchDoc {
  id: string;
  bookId: string;
  category: string;
  pageNumber: number;
  arabicTextSnippet: string;
  iconName: string;
}

interface PustakaDb {
  metadata: Record<string, unknown>;
  books: PustakaBook[];
  searchDocs: PustakaSearchDoc[];
}

let hasError = false;

function check(cond: boolean, msg: string) {
  if (!cond) {
    console.error('FAIL:', msg);
    hasError = true;
  }
}

// --- Validate books JSON ---
console.log('=== pustakaBooks.json ===');
if (!fs.existsSync(BOOKS_PATH)) {
  console.error('FILE NOT FOUND:', BOOKS_PATH);
  process.exit(1);
}
const booksRaw = JSON.parse(fs.readFileSync(BOOKS_PATH, 'utf-8'));
check(!!booksRaw.metadata, 'books JSON has metadata');
check(Array.isArray(booksRaw.books), 'books JSON has books array');
const books: PustakaBook[] = booksRaw.books;
console.log('Books count:', books.length);
console.log('Metadata:', JSON.stringify(booksRaw.metadata));

const idSet = new Set<string>();
for (const b of books) {
  check(!!b.id, `book has id (${b.title})`);
  check(!!b.title, `book has title (id=${b.id})`);
  check(!!b.author, `book has author (id=${b.id})`);
  check(!!b.category, `book has category (id=${b.id})`);
  check(b.pages > 0, `book pages > 0 (id=${b.id})`);
  check(b.allPageCount === b.pages, `allPageCount matches pages (id=${b.id})`);
  if (b.id) {
    check(!idSet.has(b.id), `duplicate book id: ${b.id}`);
    idSet.add(b.id);
  }
}
console.log('Unique IDs:', idSet.size === books.length);
console.log('Categories:', Array.from(new Set(books.map((b) => b.category))));
const totalPages = books.reduce((a, b) => a + b.pages, 0);
console.log('Total pages (sum):', totalPages);
const booksSize = fs.statSync(BOOKS_PATH).size;
console.log('File size: ' + (booksSize / 1024).toFixed(1) + ' KB');

// --- Validate full database JSON ---
console.log('\n=== pustakaDatabase.json ===');
if (!fs.existsSync(DB_PATH)) {
  console.error('FILE NOT FOUND:', DB_PATH);
  process.exit(1);
}
const dbRaw = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
check(!!dbRaw.metadata, 'db has metadata');
check(Array.isArray(dbRaw.books), 'db has books array');
check(Array.isArray(dbRaw.searchDocs), 'db has searchDocs array');
const db: PustakaDb = dbRaw;
console.log('Books count:', db.books.length);
console.log('Search docs count:', db.searchDocs.length);
console.log('Metadata:', JSON.stringify(db.metadata));

// Cross-check: every searchDoc bookId must exist in books
const bookIdSet = new Set(db.books.map((b) => b.id));
let orphanDocs = 0;
for (const d of db.searchDocs) {
  check(!!d.id, 'searchDoc has id');
  check(!!d.bookId, 'searchDoc has bookId');
  check(bookIdSet.has(d.bookId), `searchDoc bookId exists (id=${d.bookId})`);
  if (!bookIdSet.has(d.bookId)) orphanDocs++;
  check(!!d.arabicTextSnippet, `searchDoc has snippet (id=${d.id})`);
  check(d.pageNumber > 0, `searchDoc page > 0 (id=${d.id})`);
}
console.log('Orphan search docs (bookId not found):', orphanDocs);

const dbSize = fs.statSync(DB_PATH).size;
console.log('File size: ' + (dbSize / (1024 * 1024)).toFixed(2) + ' MB');

console.log('\n=== Result ===');
console.log(hasError ? 'VALIDATION FAILED with errors.' : 'ALL CHECKS PASSED.');
process.exit(hasError ? 1 : 0);
