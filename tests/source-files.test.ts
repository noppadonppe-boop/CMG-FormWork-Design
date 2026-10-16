import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {openSource} from '../src/sourceFiles';

const pdfjs = vi.hoisted(() => ({getDocument: vi.fn(), GlobalWorkerOptions: {workerSrc: ''}}));
vi.mock('pdfjs-dist', () => pdfjs);

const MiB = 1024 * 1024;
const context = {drawImage: vi.fn(), fillRect: vi.fn(), fillStyle: ''};
let canvases: Array<{width: number; height: number; getContext: ReturnType<typeof vi.fn>; toBlob: ReturnType<typeof vi.fn>}>;
let encodings: Array<{width: number; height: number; type: string; quality?: number}>;
let imageSize: {width: number; height: number};
let imageFailure: boolean;
let decodeFailure: boolean;
let imageInstances: FakeImage[];
let encode: (type: string, quality?: number) => Blob | null;
let createUrl: ReturnType<typeof vi.spyOn>;
let revokeUrl: ReturnType<typeof vi.spyOn>;

class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = imageSize.width;
  naturalHeight = imageSize.height;
  currentSrc = '';
  constructor() { imageInstances.push(this); }
  set src(value: string) {
    this.currentSrc = value;
    if (value) queueMicrotask(() => imageFailure ? this.onerror?.() : this.onload?.());
  }
  decode = vi.fn(async () => { if (decodeFailure) throw new Error('Cannot decode image'); });
}

function fakePdf(numPages = 3, width = 10000, height = 20000) {
  const render = {promise: Promise.resolve(), cancel: vi.fn()};
  const page = {
    getViewport: vi.fn(({scale}: {scale: number}) => ({width: width * scale, height: height * scale})),
    render: vi.fn(() => render),
    getTextContent: vi.fn(async () => ({items: [{str: 'F01', hasEOL: true}, {str: '1200'}, {type: 'beginMarkedContent'}]})),
    cleanup: vi.fn(),
  };
  const pdf = {numPages, getPage: vi.fn(async () => page)};
  const loading = {promise: Promise.resolve(pdf), destroy: vi.fn(async () => undefined)};
  pdfjs.getDocument.mockReturnValue(loading);
  return {page, pdf, loading, render};
}

function fileOfSize(size: number, name: string, type: string) {
  return new File([new Uint8Array(size)], name, {type});
}

beforeEach(() => {
  vi.clearAllMocks();
  canvases = [];
  encodings = [];
  imageSize = {width: 800, height: 600};
  imageFailure = decodeFailure = false;
  imageInstances = [];
  encode = type => new Blob(['image'], {type});
  vi.stubGlobal('document', {createElement: vi.fn((tag: string) => {
    expect(tag).toBe('canvas');
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => context),
      toBlob: vi.fn((callback: (blob: Blob | null) => void, type: string, quality?: number) => {
        encodings.push({width: canvas.width, height: canvas.height, type, quality});
        callback(encode(type, quality));
      }),
    };
    canvases.push(canvas);
    return canvas;
  })});
  vi.stubGlobal('Image', FakeImage);
  let urlCount = 0;
  createUrl = vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:source-${++urlCount}`);
  revokeUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  fakePdf();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('source file preparation', () => {
  it('rejects empty, unsupported and over-20-MiB files before allocating resources', async () => {
    await expect(openSource(new File([], 'empty.pdf', {type: 'application/pdf'}))).rejects.toThrow('ไฟล์ว่าง');
    await expect(openSource(new File(['hello'], 'fake.png', {type: 'text/plain'}))).rejects.toThrow('รองรับเฉพาะ');
    await expect(openSource(new File(['hello'], 'unknown'))).rejects.toThrow('รองรับเฉพาะ');
    const tooLarge = new File(['x'], 'large.pdf', {type: 'application/pdf'});
    Object.defineProperty(tooLarge, 'size', {value: 20 * MiB + 1});
    await expect(openSource(tooLarge)).rejects.toThrow('20 MB');
    expect(pdfjs.getDocument).not.toHaveBeenCalled();
    expect(createUrl).not.toHaveBeenCalled();
  });

  it('uses the Vite worker URL, validates page range and bounds PDF rendering', async () => {
    const {page, pdf, loading} = fakePdf();
    const raw = new File(['%PDF'], 'drawing.pdf', {type: 'application/pdf'});
    const source = await openSource(raw);
    expect(source.pageCount).toBe(3);
    expect(pdfjs.GlobalWorkerOptions.workerSrc).toContain('pdf.worker.min.mjs');
    for (const invalid of [0, 4, 1.5, NaN]) await expect(source.renderPage(invalid)).rejects.toThrow('1–3');
    expect(pdf.getPage).not.toHaveBeenCalled();
    const result = await source.renderPage(2);
    expect(pdf.getPage).toHaveBeenCalledWith(2);
    expect(result).toMatchObject({name: 'drawing.pdf', raw, text: 'F01\n1200', pageNumber: 2, pageCount: 3, url: 'blob:source-1'});
    expect(result.pageFile.type).toBe('image/png');
    expect(encodings[0]).toMatchObject({width: 1200, height: 2400});
    expect(page.cleanup).toHaveBeenCalledOnce();
    expect(canvases[0]).toMatchObject({width: 0, height: 0});
    await source.destroy();
    await source.destroy();
    expect(loading.destroy).toHaveBeenCalledOnce();
    // Preview ownership transfers to the UI and survives release of the PDF worker.
    expect(revokeUrl).not.toHaveBeenCalled();
    await expect(source.renderPage(1)).rejects.toMatchObject({name: 'AbortError'});
  });

  it('releases the PDF loading task if parsing fails', async () => {
    const destroy = vi.fn(async () => undefined);
    pdfjs.getDocument.mockReturnValue({promise: Promise.reject(new Error('Invalid PDF')), destroy});
    await expect(openSource(new File(['broken'], 'broken.pdf'))).rejects.toThrow('Invalid PDF');
    expect(destroy).toHaveBeenCalledOnce();
    expect(createUrl).not.toHaveBeenCalled();
  });

  it('cancels active PDF rendering and frees the canvas when the document is closed', async () => {
    const {page, render, loading} = fakePdf();
    let rejectRender!: (error: Error) => void;
    render.promise = new Promise((_, reject) => { rejectRender = reject; });
    render.cancel.mockImplementation(() => rejectRender(new DOMException('Canceled', 'AbortError')));
    const source = await openSource(new File(['%PDF'], 'drawing.pdf'));
    const result = source.renderPage(1);
    const rejected = expect(result).rejects.toMatchObject({name: 'AbortError'});
    await vi.waitFor(() => expect(page.render).toHaveBeenCalledOnce());
    await source.destroy();
    await rejected;
    expect(render.cancel).toHaveBeenCalledOnce();
    expect(page.cleanup).toHaveBeenCalledOnce();
    expect(loading.destroy).toHaveBeenCalledOnce();
    expect(canvases[0]).toMatchObject({width: 0, height: 0});
    expect(createUrl).not.toHaveBeenCalled();
  });

  it('cleans a PDF page that arrives after cancellation without starting a render', async () => {
    const {pdf, page} = fakePdf();
    let resolvePage!: (value: typeof page) => void;
    pdf.getPage.mockReturnValue(new Promise(resolve => { resolvePage = resolve; }));
    const source = await openSource(new File(['%PDF'], 'drawing.pdf'));
    const result = source.renderPage(1);
    const rejected = expect(result).rejects.toMatchObject({name: 'AbortError'});
    await source.destroy();
    resolvePage(page);
    await rejected;
    expect(page.cleanup).toHaveBeenCalledOnce();
    expect(page.render).not.toHaveBeenCalled();
  });

  it('normalizes empty MIME types and preserves a small decoded image without recompression', async () => {
    const raw = new File(['image'], 'SCAN.JPEG');
    const source = await openSource(raw);
    const result = await source.renderPage(1);
    expect(result.pageFile.type).toBe('image/jpeg');
    expect(result.pageFile).toBe(result.raw);
    expect(result.pageFile.size).toBe(raw.size);
    expect(result).toMatchObject({pageNumber: 1, pageCount: 1, text: '', url: 'blob:source-2'});
    expect(imageInstances[0].decode).toHaveBeenCalledOnce();
    expect(revokeUrl).toHaveBeenCalledExactlyOnceWith('blob:source-1');
    expect(canvases).toHaveLength(0);
    await expect(source.renderPage(2)).rejects.toThrow('1–1');
    await source.destroy();
    expect(imageInstances[0].currentSrc).toBe('');
    await expect(source.renderPage(1)).rejects.toMatchObject({name: 'AbortError'});
  });

  it.each(['load', 'decode'])('rejects an image that fails to %s and revokes its temporary URL', async failure => {
    imageFailure = failure === 'load';
    decodeFailure = failure === 'decode';
    await expect(openSource(new File(['bad-image'], 'scan.png', {type: 'image/png'}))).rejects.toThrow();
    expect(revokeUrl).toHaveBeenCalledExactlyOnceWith('blob:source-1');
    expect(imageInstances[0].currentSrc).toBe('');
  });

  it('reduces large image dimensions even when its compressed input is small', async () => {
    imageSize = {width: 20000, height: 10000};
    const source = await openSource(new File(['compressed'], 'huge.png', {type: 'image/png'}));
    const result = await source.renderPage(1);
    expect(encodings[0]).toMatchObject({width: 2400, height: 1200});
    expect(result.pageFile).not.toBe(result.raw);
    expect(canvases[0]).toMatchObject({width: 0, height: 0});
    await source.destroy();
  });

  it('fits oversized AI images into 5 MiB using JPEG and preserves the original source', async () => {
    const oversized = new Blob([new Uint8Array(5 * MiB + 1)], {type: 'image/png'});
    encode = (type, quality) => type === 'image/png' || quality === 0.9 ? oversized : new Blob(['compressed-jpeg'], {type});
    const raw = fileOfSize(6 * MiB, 'scan.png', 'image/png');
    const source = await openSource(raw);
    const result = await source.renderPage(1);
    expect(result.raw).toBe(raw);
    expect(result.pageFile.type).toBe('image/jpeg');
    expect(result.pageFile.name).toMatch(/\.jpg$/);
    expect(result.pageFile.size).toBeLessThanOrEqual(5 * MiB);
    expect(encodings.map(e => [e.type, e.quality])).toEqual([['image/png', undefined], ['image/jpeg', 0.9], ['image/jpeg', 0.8]]);
    await source.destroy();
  });

  it('reduces pixel count if JPEG compression alone cannot meet the AI limit', async () => {
    imageSize = {width: 3000, height: 3000};
    const oversized = new Blob([new Uint8Array(5 * MiB + 1)], {type: 'image/jpeg'});
    encode = type => encodings.at(-1)!.width > 2000 ? oversized : new Blob(['fitted'], {type});
    const source = await openSource(new File(['scan'], 'scan.png', {type: 'image/png'}));
    const result = await source.renderPage(1);
    expect(result.pageFile.type).toBe('image/jpeg');
    expect(encodings.at(-1)).toMatchObject({width: 1800, height: 1800});
    expect(canvases.every(c => c.width === 0 && c.height === 0)).toBe(true);
    await source.destroy();
  });

  it('releases the canvas and does not create a preview if encoding fails', async () => {
    encode = () => null;
    const {page} = fakePdf(1);
    const source = await openSource(new File(['%PDF'], 'drawing.pdf'));
    await expect(source.renderPage(1)).rejects.toThrow('ไม่สามารถแปลง');
    expect(page.cleanup).toHaveBeenCalledOnce();
    expect(canvases[0]).toMatchObject({width: 0, height: 0});
    expect(createUrl).not.toHaveBeenCalled();
    await source.destroy();
  });
});
