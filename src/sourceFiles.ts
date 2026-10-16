import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type {PDFDocumentProxy, RenderTask} from 'pdfjs-dist';

const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
const MAX_AI_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_SIDE = 2400;

export type PreparedSource = {
  name: string;
  url: string;
  text: string;
  pageFile: File;
  raw: File;
  pageNumber: number;
  pageCount: number;
};

export interface SourceDocument {
  name: string;
  pageCount: number;
  renderPage(pageNumber: number): Promise<PreparedSource>;
  destroy(): Promise<void>;
}

function checkedFile(file: File): File {
  if (file.size === 0) throw new Error('ไฟล์ว่าง กรุณาเลือกไฟล์ PDF, PNG หรือ JPEG ที่มีข้อมูล');
  if (file.size > MAX_SOURCE_BYTES) throw new Error('ไฟล์มีขนาดเกิน 20 MB กรุณาลดขนาดไฟล์แล้วลองใหม่');
  const extension = file.name.split('.').pop()?.toLowerCase();
  const type = file.type || ({pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg'}[extension ?? '']);
  if (!type || !['application/pdf', 'image/png', 'image/jpeg'].includes(type)) {
    throw new Error('รองรับเฉพาะไฟล์ PDF, PNG และ JPEG');
  }
  return file.type ? file : new File([file], file.name, {type, lastModified: file.lastModified});
}

function assertPage(pageNumber: number, pageCount: number) {
  if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > pageCount) {
    throw new Error(`กรุณาเลือกหน้าระหว่าง 1–${pageCount}`);
  }
}

function closedError() {
  return new DOMException('ยกเลิกการอ่านไฟล์แล้ว', 'AbortError');
}

function dimensions(width: number, height: number, scale = 1) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error('ไม่สามารถอ่านขนาดภาพจากไฟล์นี้ได้');
  }
  const ratio = Math.min(scale, MAX_IMAGE_SIDE / Math.max(width, height));
  return {width: Math.max(1, Math.floor(width * ratio)), height: Math.max(1, Math.floor(height * ratio))};
}

function makeCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('เบราว์เซอร์ไม่สามารถเตรียมภาพสำหรับ AI ได้');
  return {canvas, context};
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob?.size ? resolve(blob) : reject(new Error('ไม่สามารถแปลงหน้าแบบเป็นภาพได้')), type, quality);
  });
}

/** Keep line drawings lossless when possible; bound the encoded AI payload as well as pixel count. */
async function encodePage(canvas: HTMLCanvasElement): Promise<Blob> {
  const png = await toBlob(canvas, 'image/png');
  if (png.size <= MAX_AI_BYTES) return png;
  for (const quality of [0.9, 0.8, 0.7, 0.6, 0.5]) {
    const jpeg = await toBlob(canvas, 'image/jpeg', quality);
    if (jpeg.size <= MAX_AI_BYTES) return jpeg;
  }
  // Very noisy scans can still exceed the limit at low JPEG quality.
  let reduced = canvas;
  try {
    while (Math.max(reduced.width, reduced.height) > 300) {
      const {canvas: next, context} = makeCanvas(Math.max(1, Math.floor(reduced.width * 0.75)), Math.max(1, Math.floor(reduced.height * 0.75)));
      context.drawImage(reduced, 0, 0, next.width, next.height);
      if (reduced !== canvas) reduced.width = reduced.height = 0;
      reduced = next;
      const jpeg = await toBlob(reduced, 'image/jpeg', 0.75);
      if (jpeg.size <= MAX_AI_BYTES) return jpeg;
    }
    throw new Error('ไม่สามารถลดขนาดภาพให้ไม่เกิน 5 MB สำหรับ AI ได้ กรุณาเลือกภาพขนาดเล็กลง');
  } finally {
    if (reduced !== canvas) reduced.width = reduced.height = 0;
  }
}

function prepared(file: File, pageFile: File, pageNumber: number, pageCount: number, text: string): PreparedSource {
  return {name: file.name, raw: file, pageFile, pageNumber, pageCount, text, url: URL.createObjectURL(pageFile)};
}

function pageFile(file: File, blob: Blob, pageNumber: number) {
  return new File([blob], `${file.name}.page-${pageNumber}.${blob.type === 'image/jpeg' ? 'jpg' : 'png'}`, {type: blob.type});
}

async function openPdf(file: File): Promise<SourceDocument> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const loading = pdfjs.getDocument({data: await file.arrayBuffer()});
  let pdf: PDFDocumentProxy;
  try {
    pdf = await loading.promise;
    if (!Number.isInteger(pdf.numPages) || pdf.numPages < 1) throw new Error('PDF นี้ไม่มีหน้าแบบที่อ่านได้');
  } catch (error) {
    await loading.destroy().catch(() => undefined);
    throw error;
  }
  let destroyed = false;
  let destruction: Promise<void> | undefined;
  const renders = new Set<RenderTask>();
  const assertOpen = () => { if (destroyed) throw closedError(); };
  return {
    name: file.name,
    pageCount: pdf.numPages,
    async renderPage(pageNumber) {
      assertOpen();
      assertPage(pageNumber, pdf.numPages);
      const page = await pdf.getPage(pageNumber);
      let canvas: HTMLCanvasElement | undefined;
      let render: RenderTask | undefined;
      try {
        assertOpen();
        const original = page.getViewport({scale: 1});
        dimensions(original.width, original.height);
        const scale = Math.min(1.5, MAX_IMAGE_SIDE / Math.max(original.width, original.height));
        const viewport = page.getViewport({scale});
        const surface = makeCanvas(Math.max(1, Math.floor(viewport.width)), Math.max(1, Math.floor(viewport.height)));
        canvas = surface.canvas;
        render = page.render({canvas, canvasContext: surface.context, viewport, background: '#ffffff'});
        renders.add(render);
        await render.promise;
        assertOpen();
        const content = await page.getTextContent();
        const text = content.items.map(item => 'str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : '').join('').trim();
        assertOpen();
        const blob = await encodePage(canvas);
        assertOpen();
        return prepared(file, pageFile(file, blob, pageNumber), pageNumber, pdf.numPages, text);
      } finally {
        if (render) renders.delete(render);
        if (canvas) canvas.width = canvas.height = 0;
        page.cleanup();
      }
    },
    destroy() {
      if (!destruction) {
        destroyed = true;
        for (const render of renders) render.cancel();
        destruction = loading.destroy();
      }
      return destruction;
    },
  };
}

async function openImage(file: File): Promise<SourceDocument> {
  const image = new Image();
  const loadingUrl = URL.createObjectURL(file);
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('อ่านไฟล์ภาพไม่ได้ ไฟล์อาจเสียหายหรือไม่ใช่ PNG/JPEG'));
      image.src = loadingUrl;
    });
    if (typeof image.decode === 'function') await image.decode();
    dimensions(image.naturalWidth, image.naturalHeight);
  } catch (error) {
    image.src = '';
    throw error;
  } finally {
    image.onload = image.onerror = null;
    URL.revokeObjectURL(loadingUrl);
  }
  let destroyed = false;
  return {
    name: file.name,
    pageCount: 1,
    async renderPage(pageNumber) {
      if (destroyed) throw closedError();
      assertPage(pageNumber, 1);
      if (file.size <= MAX_AI_BYTES && Math.max(image.naturalWidth, image.naturalHeight) <= MAX_IMAGE_SIDE) {
        return prepared(file, file, 1, 1, '');
      }
      const size = dimensions(image.naturalWidth, image.naturalHeight);
      const {canvas, context} = makeCanvas(size.width, size.height);
      try {
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const blob = await encodePage(canvas);
        if (destroyed) throw closedError();
        return prepared(file, pageFile(file, blob, 1), 1, 1, '');
      } finally {
        canvas.width = canvas.height = 0;
      }
    },
    async destroy() {
      destroyed = true;
      image.src = '';
    },
  };
}

/** Opens a local file only. The caller owns each returned preview URL and must revoke it. */
export async function openSource(file: File): Promise<SourceDocument> {
  const checked = checkedFile(file);
  return checked.type === 'application/pdf' ? openPdf(checked) : openImage(checked);
}
