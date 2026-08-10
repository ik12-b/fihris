import * as pdfjsLib from 'pdfjs-dist';

// Set up worker source for browser environment
if (typeof window !== 'undefined' && pdfjsLib) {
  // Use jsdelivr CDN matching the installed version
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version || '4.10.38'}/build/pdf.worker.min.mjs`;
}

export interface ExtractedPage {
  pageNumber: number;
  text: string;
}

export interface ExtractedPdfResult {
  title: string;
  totalPages: number;
  pages: ExtractedPage[];
  fullTextPreview: string;
}

/**
 * Extracts text page by page from an uploaded PDF File object.
 */
export async function extractTextFromPdf(file: File): Promise<ExtractedPdfResult> {
  const arrayBuffer = await file.arrayBuffer();
  const pdfTitle = file.name.replace(/\.[^/.]+$/, ''); // Strip extension

  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdfDoc = await loadingTask.promise;
  const numPages = pdfDoc.numPages;

  const pages: ExtractedPage[] = [];
  let fullTextPreview = '';

  // Extract text from up to 50 pages for fast client-side responsiveness
  const maxPagesToProcess = Math.min(numPages, 50);

  for (let pageNum = 1; pageNum <= maxPagesToProcess; pageNum++) {
    try {
      const page = await pdfDoc.getPage(pageNum);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => item.str || '')
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();

      if (pageText.length > 0) {
        pages.push({
          pageNumber: pageNum,
          text: pageText,
        });

        if (pageNum <= 3) {
          fullTextPreview += (fullTextPreview ? ' ' : '') + pageText;
        }
      }
    } catch (err) {
      console.warn(`Error extracting page ${pageNum}:`, err);
    }
  }

return {
    title: pdfTitle,
    totalPages: numPages,
    pages,
    fullTextPreview: fullTextPreview.slice(0, 300) + '...',
  };
}

/**
 * Checks whether a PDF contains extractable text content (i.e. it is not a
 * scanned image-only PDF).  Inspects up to the first 3 pages; if any page
 * yields text items the PDF is considered text-based.
 *
 * @param file  A File or Blob representing the PDF
 */
export async function isPdfTextBased(file: File | Blob): Promise<boolean> {
  const arrayBuffer = await file.arrayBuffer();

  try {
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdfDoc = await loadingTask.promise;

    const maxPagesToCheck = Math.min(pdfDoc.numPages, 3);
    for (let i = 1; i <= maxPagesToCheck; i++) {
      const page = await pdfDoc.getPage(i);
      const textContent = await page.getTextContent();
      if (textContent.items.length > 0) {
        return true;
      }
    }
    return false;
  } catch {
    // If pdfjs can't even parse it, treat as image-based / non-text
    return false;
  }
}
