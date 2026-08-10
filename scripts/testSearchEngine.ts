/**
 * Test script: verifies the optimized search engine works well with pustaka data.
 * Imports the actual fihrisSearchEngine from src/utils/searchEngine.ts.
 *
 * Run: npx tsx scripts/testSearchEngine.ts
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import the actual optimized search engine
import { fihrisSearchEngine, normalizeArabicText } from '../src/utils/searchEngine';
import { PUSTAKA_BOOKS, toSearchResult } from '../src/data/pustakaLoader';
import type { PustakaSearchDocument } from '../src/data/pustakaLoader';
import type { Book, SearchResult } from '../src/types';

// Load the full pustaka database from public/ (not bundled, fetched at runtime in prod)
const DB_PATH = path.resolve(__dirname, '..', 'public', 'pustakaDatabase.json');
const rawDb = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));

// Derive search results from the full database JSON (worker-style conversion)
const fullDb = rawDb as unknown as { searchDocs: PustakaSearchDocument[] };
const PUSTAKA_SEARCH_RESULTS: SearchResult[] = fullDb.searchDocs.map(toSearchResult);

// ── Helper: expose internal stats from the engine ──────────────────────────

function getEngineStats() {
  // Use a proxy trick — we access private fields via any
  const engine = fihrisSearchEngine as any;
  const docs = engine.documents || [];
  const idx = engine.tokenInvertedIndex || new Map();
  let totalTokens = 0;
  let maxDocs = 0;
  let minDocs = Infinity;
  idx.forEach((docSet: Set<number>) => {
    const sz = docSet.size;
    totalTokens += sz;
    if (sz > maxDocs) maxDocs = sz;
    if (sz < minDocs) minDocs = sz;
  });
  return {
    totalDocuments: docs.length,
    uniqueTokens: idx.size,
    totalTokenDocPairs: totalTokens,
    maxDocsPerToken: maxDocs,
    minDocsPerToken: minDocs === Infinity ? 0 : minDocs,
    avgDocsPerToken: idx.size ? totalTokens / idx.size : 0,
    hasSortedTokens: !!engine.sortedTokens,
    sortedTokensLength: engine.sortedTokens?.length || 0,
    firstCharIndexSize: engine.firstCharIndex?.size || 0,
  };
}

// ── Run tests ───────────────────────────────────────────────────────────────

function runTests() {
  console.log('\n=== Loading Pustaka Database ===');
  console.log(`Books: ${PUSTAKA_BOOKS.length}`);
  console.log(`Search documents: ${PUSTAKA_SEARCH_RESULTS.length}`);
  console.log('');

  // Initialize
  const importStart = performance.now();
  fihrisSearchEngine.initialize(PUSTAKA_BOOKS, PUSTAKA_SEARCH_RESULTS);
  const importEnd = performance.now();
  console.log(`Initialization time: ${Math.round((importEnd - importStart) * 100) / 100} ms`);
  console.log('');

  // Show stats
  const stats = getEngineStats();
  console.log('=== Index Statistics ===');
  console.log(`Total documents indexed: ${stats.totalDocuments}`);
  console.log(`Unique tokens: ${stats.uniqueTokens}`);
  console.log(`Avg docs per token: ${stats.avgDocsPerToken.toFixed(2)}`);
  console.log(`Max docs per token: ${stats.maxDocsPerToken}`);
  console.log(`Has sorted tokens: ${stats.hasSortedTokens}`);
  console.log(`Sorted tokens length: ${stats.sortedTokensLength}`);
  console.log(`First-char index entries: ${stats.firstCharIndexSize}`);
  console.log('');

  // Test queries
  const testQueries = [
    'الإيمان',
    'الصلاة',
    'الوضوء',
    'النية',
    'الفقه',
    'الشافعي',
    'أبو حنيفة',
    'القرآن',
    'الحديث',
    'الاستدلال',
    'المدخل',
    'البرهان',
  ];

  console.log('=== Search Performance Tests ===\n');
  console.log(
    'Query'.padEnd(20) +
      'Results'.padStart(8) +
      'Time(ms)'.padStart(12) +
      'Top Book'.padStart(30) +
      'Snippet'.padStart(55)
  );
  console.log('-'.repeat(125));

  for (const query of testQueries) {
    const result = fihrisSearchEngine.search({
      query,
      page: 1,
      pageSize: 5,
    });

    const topBook = result.results[0]?.bookTitleArabic || '-';
    const topSnippet = result.results[0]?.arabicTextSnippet || '';
    const snippetPreview = topSnippet
      .replace(/\n/g, ' ')
      .substring(0, 50) + (topSnippet.length > 50 ? '...' : '');

    console.log(
      query.padEnd(20) +
        String(result.totalCount).padStart(8) +
        String(result.executionTimeMs).padStart(12) +
        topBook.padStart(30).substring(0, 30) +
        '  ' +
        snippetPreview
    );
  }

  console.log('\n');

  // Test exact phrase mode
  console.log('=== Exact Phrase Mode Test ===');
  const phraseResult = fihrisSearchEngine.search({
    query: 'الإيمان',
    exactPhrase: true,
    pageSize: 5,
  });
  console.log(
    `Exact phrase "الإيمان": ${phraseResult.totalCount} results in ${phraseResult.executionTimeMs} ms`
  );

  const nonPhraseResult = fihrisSearchEngine.search({
    query: 'الإيمان',
    exactPhrase: false,
    pageSize: 5,
  });
  console.log(
    `Token-based "الإيمان": ${nonPhraseResult.totalCount} results in ${nonPhraseResult.executionTimeMs} ms`
  );

  console.log('\n');

  // Test category filtering
  console.log('=== Category Filter Test ===');
  const fiqhSearch = fihrisSearchEngine.search({ query: 'الفقه', category: 'Fiqh', pageSize: 5 });
  console.log(`Query "الفقه" + category "Fiqh": ${fiqhSearch.totalCount} results in ${fiqhSearch.executionTimeMs} ms`);

  const hadithSearch = fihrisSearchEngine.search({ query: 'الإيمان', category: 'Hadith', pageSize: 5 });
  console.log(
    `Query "الإيمان" + category "Hadith": ${hadithSearch.totalCount} results in ${hadithSearch.executionTimeMs} ms`
  );

  console.log('\n');

  // Test book filtering
  console.log('=== Book Filter Test ===');
  const bookTitle = PUSTAKA_BOOKS[0].titleArabic || PUSTAKA_BOOKS[0].title;
  const bookFilterSearch = fihrisSearchEngine.search({
    query: 'ال',
    selectedBooks: [bookTitle],
    pageSize: 5,
  });
  console.log(
    `Query "ال" + book "${bookTitle}": ${bookFilterSearch.totalCount} results in ${bookFilterSearch.executionTimeMs} ms`
  );

  console.log('\n');

  // Test empty query
  console.log('=== Empty Query Test ===');
  const emptyResult = fihrisSearchEngine.search({ query: '', pageSize: 5 });
  console.log(`Empty query: ${emptyResult.totalCount} results in ${emptyResult.executionTimeMs} ms`);

  // Test long query (multiple words)
  console.log('\n');
  console.log('=== Multi-word Query Test ===');
  const multiResult = fihrisSearchEngine.search({ query: 'الإيمان واليقيم', pageSize: 5 });
  console.log(
    `Query "الإيمان واليقيم": ${multiResult.totalCount} results in ${multiResult.executionTimeMs} ms`
  );

  // Repeated search (cache warm)
  console.log('\n');
  console.log('=== Warm Cache Performance (repeated searches) ===');
  let totalTime = 0;
  const iterations = 20;
  for (let i = 0; i < iterations; i++) {
    const r = fihrisSearchEngine.search({ query: 'الإيمان', page: 1, pageSize: 5 });
    totalTime += r.executionTimeMs;
  }
  console.log(`Average over ${iterations}x "الإيمان": ${totalTime / iterations} ms`);

  totalTime = 0;
  for (let i = 0; i < iterations; i++) {
    const r = fihrisSearchEngine.search({ query: 'الصلاة', page: 1, pageSize: 5 });
    totalTime += r.executionTimeMs;
  }
  console.log(`Average over ${iterations}x "الصلاة": ${totalTime / iterations} ms`);

  totalTime = 0;
  for (let i = 0; i < iterations; i++) {
    const r = fihrisSearchEngine.search({ query: 'البرهان', page: 1, pageSize: 5 });
    totalTime += r.executionTimeMs;
  }
  console.log(`Average over ${iterations}x "البرهان": ${totalTime / iterations} ms`);

  // Performance summary
  console.log('\n');
  console.log('=== Performance Summary ===');
  console.log(`Indexed documents: ${stats.totalDocuments}`);
  console.log(`Unique tokens: ${stats.uniqueTokens}`);
  console.log(`\nOptimasi yang diterapkan:`);
  console.log(`  1. Exact token match via Map lookup (O(1))`);
  console.log(`  2. Prefix match via binary search on sorted tokens (O(log T + K))`);
  console.log(`  3. Substring match filtered by first character (reduces scan from ${stats.uniqueTokens} to ~${Math.round(stats.uniqueTokens / 20)} tokens)`);
  console.log(`  4. exactPhrase mode for precise phrase matching`);

  console.log('\n=== Test Complete ===\n');
}

runTests();
