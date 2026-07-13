import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import pdfjsWorker from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker;

export type BookRenderKind = "pdf" | "epub" | "unknown";

export function sniffBookKind(bytes: ArrayBuffer): BookRenderKind {
  const view = new Uint8Array(bytes.slice(0, 4));
  if (view[0] === 0x25 && view[1] === 0x50 && view[2] === 0x44 && view[3] === 0x46) {
    return "pdf";
  }
  if (view[0] === 0x50 && view[1] === 0x4b) {
    return "epub";
  }
  return "unknown";
}

export function detectBookRenderKind(
  format?: string | null,
  contentType?: string | null,
): BookRenderKind {
  const fmt = (format ?? "").toLowerCase();
  const ct = (contentType ?? "").toLowerCase();
  if (ct.includes("epub")) return "epub";
  if (ct.includes("pdf")) return "pdf";
  if (fmt.includes("epub") && !fmt.includes("pdf")) return "epub";
  if (fmt.includes("pdf") && !fmt.includes("epub")) return "pdf";
  if (fmt.includes("epub")) return "epub";
  if (fmt.includes("pdf")) return "pdf";
  return "unknown";
}

export async function renderPdfPagesFromArrayBuffer(
  data: ArrayBuffer,
  onProgress?: (current: number, total: number) => void,
): Promise<string[]> {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(data), withCredentials: false }).promise;
  const pages: string[] = [];
  const scale = Math.min(window.devicePixelRatio || 1, 2) * 1.35;

  for (let pageNum = 1; pageNum <= doc.numPages; pageNum += 1) {
    onProgress?.(pageNum, doc.numPages);
    const page = await doc.getPage(pageNum);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    pages.push(canvas.toDataURL("image/jpeg", 0.88));
  }

  return pages;
}

export async function renderPdfPagesFromUrl(
  url: string,
  onProgress?: (current: number, total: number) => void,
): Promise<string[]> {
  const doc = await pdfjs.getDocument({ url, withCredentials: false }).promise;
  const pages: string[] = [];
  const scale = Math.min(window.devicePixelRatio || 1, 2) * 1.35;

  for (let pageNum = 1; pageNum <= doc.numPages; pageNum += 1) {
    onProgress?.(pageNum, doc.numPages);
    const page = await doc.getPage(pageNum);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    pages.push(canvas.toDataURL("image/jpeg", 0.88));
  }

  return pages;
}
