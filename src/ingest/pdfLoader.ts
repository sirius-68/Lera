import { PdfModule } from './pdf';


let cached: Promise<PdfModule> | null = null;

/**
 * pdf.js is large, so it is loaded only when a PDF is actually opened.
 * In the normal build it parses in a web worker; in the single-file preview
 * build there is no separate worker file, so it runs on the main thread.
 */
export function loadPdfjs(): Promise<PdfModule> {
  if (cached) return cached;
  cached = (async () => {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    if (typeof __SINGLE_FILE__ !== 'undefined' && __SINGLE_FILE__) {
      const worker = await import('pdfjs-dist/legacy/build/pdf.worker.mjs');
      (globalThis as unknown as { pdfjsWorker?: unknown }).pdfjsWorker = worker;
    } else {
      pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdf.worker.js', document.baseURI).href;
    }
    return pdfjs as unknown as PdfModule;
  })();
  cached.catch(() => {
    cached = null;
  });
  return cached;
}
