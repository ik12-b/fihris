/**
 * Thin client for the Archive.org Advanced Search API.
 *
 * API docs: https://archive.org/advancedsearch.php
 *
 * The free API returns up to 1000 results per search with no key required,
 * but you must include identifying headers and respect rate limits.
 */

export interface ArchiveBook {
  identifier: string;
  title: string;
  author: string;
  description: string;
  publicDate: string;
  formats: string[];
  isPdfAvailable: boolean;
  coverUrl: string;
  downloadUrl: string;
  /** Approximate page count if available in the metadata. */
  pageCount?: number;
}

export interface ArchiveSearchResult {
  books: ArchiveBook[];
  totalResults: number;
  currentPage: number;
  totalPages: number;
}

const ARCHIVE_BASE_URL = 'https://archive.org';
const ARCHIVE_SEARCH_URL = `${ARCHIVE_BASE_URL}/advancedsearch.php`;
const ARCHIVE_DOWNLOAD_URL = `${ARCHIVE_BASE_URL}/download`;

const DEFAULT_PAGE_SIZE = 20;

/**
 * Search Archive.org for books matching the given query.
 *
 * @param query  Free-text query (e.g. "al-Bukhari")
 * @param page   1-based page number
 * @param pageSize Results per page (max 100)
 */
export async function searchArchive(
  query: string,
  page: number = 1,
  pageSize: number = DEFAULT_PAGE_SIZE
): Promise<ArchiveSearchResult> {
  const safeQuery = query.trim();
  if (!safeQuery) {
    return { books: [], totalResults: 0, currentPage: 1, totalPages: 0 };
  }

  const params = new URLSearchParams({
    q: `mediatype:texts AND (${safeQuery})`,
    output: 'json',
    page: String(page),
    rows: String(pageSize),
    'fl[]': 'identifier,title,author,description,publicdate,format,imagecount',
    'sort[]': 'publicdate desc',
  });

  // Archive.org requires a User-Agent header identifying the app
  const response = await fetch(`${ARCHIVE_SEARCH_URL}?${params}`, {
    headers: {
      'User-Agent': 'Fihris-Kitab/1.0 (https://github.com/fihris-tsx)',
      'Accept': 'application/json',
      'From': 'fihris@example.com',
    },
  });

  if (!response.ok) {
    throw new Error(`Archive.org search failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  const docs = data.response?.docs || [];
  const books: ArchiveBook[] = docs.map((doc) => {
    const identifier = doc.identifier || '';
    const formats: string[] = doc.format || [];
    const isPdf = formats.includes('PDF');

    return {
      identifier,
      title: (doc.title || 'Untitled').trim(),
      author: (doc.author || 'Unknown Author').trim(),
      description: (doc.description || '').trim(),
      publicDate: doc.publicdate || '',
      formats,
      isPdfAvailable: isPdf,
      coverUrl: doc.identifier
        ? `${ARCHIVE_BASE_URL}/download/${identifier}/${identifier}_cover.jpg`
        : '',
      downloadUrl: isPdf
        ? `${ARCHIVE_DOWNLOAD_URL}/${identifier}/${identifier}.pdf`
        : '',
      pageCount: doc.imagecount || doc.pageCount || undefined,
    };
  });

  const totalResults = data.response?.numFound || 0;
  const totalPages = Math.ceil(totalResults / pageSize);

  return {
    books,
    totalResults,
    currentPage: page,
    totalPages,
  };
}

/**
 * Fetch a PDF from Archive.org and return it as a Blob plus its size.
 *
 * @param downloadUrl  Full URL returned by the search API
 * @returns  `{ blob, sizeBytes }` on success
 */
export async function fetchArchivePdf(
  downloadUrl: string
): Promise<{ blob: Blob; sizeBytes: number }> {
  const response = await fetch(downloadUrl, {
    headers: {
      'User-Agent': 'Fihris-Kitab/1.0 (https://github.com/fihris-tsx)',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to download PDF: ${response.status} ${response.statusText}`);
  }

  const blob = await response.blob();
  return { blob, sizeBytes: blob.size };
}
