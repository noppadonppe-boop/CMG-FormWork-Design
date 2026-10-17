// @vitest-environment jsdom
import React, {act, type ComponentProps} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {SourceUpload} from '../src/components/SourceUpload';
import type {PreparedSource, SourceDocument} from '../src/sourceFiles';

const services = vi.hoisted(() => ({openSource: vi.fn(), uploadSource: vi.fn(), aiExtract: vi.fn(), subscribeUploads: vi.fn(), uploadPreviewUrl: vi.fn()}));
vi.mock('../src/sourceFiles', () => ({openSource: services.openSource}));
vi.mock('../src/firebase', () => ({configured: true, uploadSource: services.uploadSource, aiExtract: services.aiExtract, subscribeUploads: services.subscribeUploads, uploadPreviewUrl: services.uploadPreviewUrl}));

type Props = ComponentProps<typeof SourceUpload>;
let host: HTMLDivElement;
let root: Root;
let props: Props;
const revokeUrl = vi.fn();

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((done, fail) => {resolve = done; reject = fail;});
  return {promise, resolve, reject};
}

function sourceDocument(pageCount = 1, name = 'foundation.pdf') {
  const raw = new File(['local drawing'], name, {type: 'application/pdf'});
  const pages: PreparedSource[] = Array.from({length: pageCount}, (_, index) => ({
    name, raw, url: `blob:${name}-page-${index + 1}`, text: `Drawing page ${index + 1}`,
    pageFile: new File([`image ${index + 1}`], `${name}.page-${index + 1}.png`, {type: 'image/png'}),
    pageNumber: index + 1, pageCount,
  }));
  const document = {
    name, pageCount,
    renderPage: vi.fn(async (page: number) => pages[page - 1]),
    destroy: vi.fn(async () => undefined),
  } satisfies SourceDocument;
  return {raw, pages, document};
}

async function mount(nextProps = props) {
  await act(async () => root.render(<SourceUpload key={`${nextProps.userId}:${nextProps.projectId}:${nextProps.caseId}`} {...nextProps}/>));
}

async function chooseFile(file: File) {
  const input = host.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(input, 'files', {value: [file], configurable: true});
  await act(async () => input.dispatchEvent(new Event('change', {bubbles: true})));
}

function button(label: string) {
  const found = Array.from(host.querySelectorAll('button')).find(item => item.textContent === label);
  expect(found, `Missing button: ${label}`).toBeDefined();
  return found!;
}

async function click(label: string) {
  await act(async () => button(label).click());
}

async function choosePage(value: string) {
  const input = host.querySelector<HTMLInputElement>('input[type="number"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', {bubbles: true}));
  });
}

function preview() {return host.querySelector<HTMLImageElement>('.source-image');}
function error() {return host.querySelector('[role="alert"]')?.textContent;}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('URL', class extends URL {static revokeObjectURL = revokeUrl;});
  vi.spyOn(window, 'prompt').mockReturnValue('1');
  services.uploadSource.mockResolvedValue({path: 'projects/project-a/sources/page.png'});
  services.aiExtract.mockResolvedValue({draft: {width: 1200, length: 2400}});
  services.subscribeUploads.mockReturnValue(() => undefined);
  props = {
    projectId: 'project-a', caseId: 'case-a', userId: 'staff-a',
    saveProject: vi.fn(async () => undefined), onSourceChange: vi.fn(), onPreviewChange: vi.fn(), onApplyDraft: vi.fn(), onManual: vi.fn(),
  };
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('drawing upload and AI recovery', () => {
  it('keeps a single-page preview after a storage failure and retries without reopening the file or prompting', async () => {
    const source = sourceDocument();
    services.openSource.mockResolvedValue(source.document);
    services.uploadSource.mockRejectedValueOnce(new Error('Storage connection timed out'));
    await mount();
    await chooseFile(source.raw);

    expect(window.prompt).not.toHaveBeenCalled();
    expect(host.querySelector('input[type="number"]')).toBeNull();
    expect(error()).toContain('Storage connection timed out');
    expect(preview()?.getAttribute('src')).toBe(source.pages[0].url);
    expect(props.onSourceChange).toHaveBeenCalledWith(source.raw.name);
    expect(props.onPreviewChange).toHaveBeenLastCalledWith(source.pages[0]);
    expect(button('วิเคราะห์ด้วย AI').disabled).toBe(true);
    expect(host.querySelector('.upload-zone')?.getAttribute('aria-busy')).toBe('false');
    await click('อัปโหลดหน้าที่แสดงอีกครั้ง');

    expect(error()).toBeUndefined();
    expect(services.openSource).toHaveBeenCalledTimes(1);
    expect(source.document.renderPage).toHaveBeenCalledTimes(1);
    expect(services.uploadSource).toHaveBeenCalledTimes(2);
    expect(services.uploadSource).toHaveBeenLastCalledWith('project-a', source.pages[0].pageFile, 'case-a', source.raw,
      expect.objectContaining({signal: expect.any(AbortSignal), onProgress: expect.any(Function)}));
    expect(props.saveProject).toHaveBeenCalledTimes(2);
    expect(vi.mocked(props.saveProject).mock.invocationCallOrder[0]).toBeLessThan(services.uploadSource.mock.invocationCallOrder[0]);
    expect(button('วิเคราะห์ด้วย AI').disabled).toBe(false);
    expect(preview()?.getAttribute('src')).toBe(source.pages[0].url);
    expect(revokeUrl).not.toHaveBeenCalled();
  });

  it('previews a multipage PDF locally and uploads only the page explicitly shown and selected', async () => {
    const source = sourceDocument(3);
    services.openSource.mockResolvedValue(source.document);
    await mount();
    await chooseFile(source.raw);

    expect(window.prompt).not.toHaveBeenCalled();
    expect(services.uploadSource).not.toHaveBeenCalled();
    expect(props.saveProject).not.toHaveBeenCalled();
    expect(preview()?.alt).toContain('หน้า 1');
    await choosePage('4');
    expect(button('แสดงหน้านี้').disabled).toBe(true);
    expect(error()).toContain('1 ถึง 3');
    await choosePage('2');
    expect(button('แสดงหน้านี้').disabled).toBe(false);
    expect(preview()?.alt).toContain('หน้า 1');
    await click('แสดงหน้านี้');

    expect(source.document.renderPage).toHaveBeenLastCalledWith(2);
    expect(props.onPreviewChange).toHaveBeenLastCalledWith(source.pages[1]);
    expect(preview()?.getAttribute('src')).toBe(source.pages[1].url);
    expect(host.textContent).toContain('ภาพที่เลือก: หน้า 2 / 3');
    expect(services.uploadSource).not.toHaveBeenCalled();
    expect(revokeUrl).toHaveBeenCalledWith(source.pages[0].url);
    await click('อัปโหลดหน้าที่แสดง');
    expect(services.uploadSource).toHaveBeenCalledWith('project-a', source.pages[1].pageFile, 'case-a', source.raw, expect.any(Object));
    await click('วิเคราะห์ด้วย AI');
    expect(services.aiExtract).toHaveBeenCalledWith('project-a', 'projects/project-a/sources/page.png', expect.any(Function));
  });

  it('shows Thai findings and pending items without exposing JSON', async () => {
    const source = sourceDocument();
    services.openSource.mockResolvedValue(source.document);
    services.aiExtract.mockResolvedValue({draft: {report: 'พบฐานราก F1 จำนวน 6 ฐาน', items: ['F1 กว้าง 2 เมตร ยาว 2 เมตร'], unknowns: ['F2 ยังอ่านจำนวนไม่ได้'], width: 2000}});
    await mount();
    await chooseFile(source.raw);
    await click('วิเคราะห์ด้วย AI');
    expect(host.textContent).toContain('พบฐานราก F1 จำนวน 6 ฐาน');
    expect(host.textContent).toContain('F2 ยังอ่านจำนวนไม่ได้');
    expect(host.textContent).toContain('เฉพาะภาพหน้าที่เลือก');
    expect(host.querySelector('pre')).toBeNull();
    expect(host.textContent).not.toContain('ข้อมูล JSON');
  });

  it('creates draft cases only from AI elements that have every required dimension', async () => {
    const source = sourceDocument();
    services.openSource.mockResolvedValue(source.document);
    const element = {name: 'F1', kind: 'FOOTING', shape: 'RECTANGLE', width: 1.5, length: 2, height: 0.6, armX: null, armY: null, unit: 'm', quantity: 4, note: ''};
    services.aiExtract.mockResolvedValue({draft: {report: 'พบ 2 รายการ', elements: [element, {...element, name: 'C1', kind: 'COLUMN', height: null}]}});
    const onCreateCases = vi.fn();
    await mount({...props, onCreateCases});
    await chooseFile(source.raw);
    await click('วิเคราะห์ด้วย AI');
    const boxes = host.querySelectorAll<HTMLInputElement>('.ai-elements input[type="checkbox"]');
    expect(boxes[1].disabled).toBe(true);
    expect(host.querySelector('.ai-elements')?.textContent).toContain('ขาด สูง/ลึก');
    expect(button('สร้างโมเดลจากรายการที่เลือก (0)').disabled).toBe(true);
    await act(async () => boxes[0].click());
    await click('สร้างโมเดลจากรายการที่เลือก (1)');
    expect(onCreateCases).toHaveBeenCalledWith([{name: 'F1 (×4) · ฐานราก', input: expect.objectContaining({kind: 'FOOTING', width: 1500, length: 2000, height: 600, confirmed: false})}]);
  });

  it('resumes an uploaded drawing and its AI reading for a newly selected case', async () => {
    const onDrawingChange = vi.fn();
    const resume = {storagePath: 'RC-FormWork-App/root/uploads/u1', name: 'plan.pdf', url: 'https://example.com/plan.png', draft: {report: 'อ่านแล้ว'}};
    await mount({...props, resume, onDrawingChange});
    expect(preview()?.getAttribute('src')).toBe(resume.url);
    expect(host.textContent).toContain('อ่านแล้ว');
    expect(button('วิเคราะห์ด้วย AI').disabled).toBe(false);
    expect(onDrawingChange).toHaveBeenLastCalledWith(resume);
    expect(props.onSourceChange).not.toHaveBeenCalled();
  });

  it('retries an AI failure using the stored page and applies a draft only after explicit confirmation', async () => {
    const source = sourceDocument();
    services.openSource.mockResolvedValue(source.document);
    services.aiExtract.mockRejectedValueOnce(new Error('AI service unavailable'));
    await mount();
    await chooseFile(source.raw);
    await click('วิเคราะห์ด้วย AI');

    expect(error()).toContain('AI service unavailable');
    expect(host.querySelector('.ai-progress .failed')?.textContent).toContain('ไม่สำเร็จ');
    expect(preview()).not.toBeNull();
    expect(button('วิเคราะห์ด้วย AI').disabled).toBe(false);
    await click('วิเคราะห์ด้วย AI');
    expect(error()).toBeUndefined();
    expect(services.aiExtract).toHaveBeenCalledTimes(2);
    expect(services.uploadSource).toHaveBeenCalledTimes(1);
    expect(props.saveProject).toHaveBeenCalledTimes(1);
    expect(props.onApplyDraft).not.toHaveBeenCalled();
    await click('ใช้เป็นมิติร่างเพื่อแก้ไข');
    expect(props.onApplyDraft).toHaveBeenCalledWith({width: 1200, length: 2400});
  });

  it('blocks duplicate clicks and file replacement while an upload or AI request is pending', async () => {
    const source = sourceDocument(2);
    const upload = deferred<{path: string}>();
    const extraction = deferred<{draft: Record<string, unknown>}>();
    services.openSource.mockResolvedValue(source.document);
    services.uploadSource.mockReturnValue(upload.promise);
    services.aiExtract.mockReturnValue(extraction.promise);
    await mount();
    await chooseFile(source.raw);
    const uploadButton = button('อัปโหลดหน้าที่แสดง');
    await act(async () => {uploadButton.click(); uploadButton.click();});

    expect(services.uploadSource).toHaveBeenCalledTimes(1);
    expect(uploadButton.disabled).toBe(true);
    expect(button('เลือกไฟล์ใหม่').disabled).toBe(true);
    expect(host.querySelector<HTMLInputElement>('input[type="number"]')?.disabled).toBe(true);
    expect(button('วิเคราะห์ด้วย AI').disabled).toBe(true);
    const options = services.uploadSource.mock.calls[0][4];
    await act(async () => options.onProgress(47));
    expect(host.querySelector('progress')?.value).toBe(47);
    await act(async () => upload.resolve({path: 'stored-page.png'}));
    const aiButton = button('วิเคราะห์ด้วย AI');
    await act(async () => {aiButton.click(); aiButton.click();});
    expect(services.aiExtract).toHaveBeenCalledTimes(1);
    expect(aiButton.disabled).toBe(true);
    await act(async () => services.aiExtract.mock.calls[0][2]('analyzing'));
    expect(host.querySelector('[aria-current="step"]')?.textContent).toContain('ส่งให้ AI อ่านแบบ');
    expect(host.querySelectorAll('.ai-progress .done')).toHaveLength(3);
    expect(button('เลือกไฟล์ใหม่').disabled).toBe(true);
    await act(async () => extraction.resolve({draft: {width: 800}}));
    expect(aiButton.disabled).toBe(false);
    expect(host.querySelectorAll('.ai-progress .done')).toHaveLength(7);
  });

  it('cancels an upload without losing the local preview and ignores its late completion during retry', async () => {
    const source = sourceDocument();
    const oldUpload = deferred<{path: string}>();
    services.openSource.mockResolvedValue(source.document);
    services.uploadSource.mockReturnValueOnce(oldUpload.promise);
    await mount();
    await chooseFile(source.raw);
    const signal: AbortSignal = services.uploadSource.mock.calls[0][4].signal;
    await click('ยกเลิกอัปโหลด');
    expect(signal.aborted).toBe(true);
    expect(preview()?.getAttribute('src')).toBe(source.pages[0].url);
    expect(button('วิเคราะห์ด้วย AI').disabled).toBe(true);
    await click('อัปโหลดหน้าที่แสดงอีกครั้ง');
    await act(async () => oldUpload.resolve({path: 'obsolete-upload.png'}));
    await click('วิเคราะห์ด้วย AI');
    expect(services.aiExtract).toHaveBeenCalledWith('project-a', 'projects/project-a/sources/page.png', expect.any(Function));
    expect(error()).toBeUndefined();
  });

  it('aborts an old project upload on a keyed project/case switch and never restores its preview', async () => {
    const source = sourceDocument();
    const oldUpload = deferred<{path: string}>();
    services.openSource.mockResolvedValue(source.document);
    services.uploadSource.mockReturnValue(oldUpload.promise);
    await mount();
    await chooseFile(source.raw);
    const options = services.uploadSource.mock.calls[0][4];
    const nextProps = {...props, projectId: 'project-b', caseId: 'case-b', onSourceChange: vi.fn(), onPreviewChange: vi.fn(), onApplyDraft: vi.fn()};
    await mount(nextProps);

    expect(options.signal.aborted).toBe(true);
    expect(source.document.destroy).toHaveBeenCalledOnce();
    expect(revokeUrl).toHaveBeenCalledWith(source.pages[0].url);
    expect(preview()).toBeNull();
    await act(async () => {options.onProgress(100); oldUpload.resolve({path: 'obsolete-upload.png'});});
    expect(preview()).toBeNull();
    expect(nextProps.onSourceChange).not.toHaveBeenCalled();
    expect(nextProps.onPreviewChange).not.toHaveBeenCalled();
    expect(nextProps.onApplyDraft).not.toHaveBeenCalled();
    expect(host.querySelector('progress')).toBeNull();
    expect(button('เลือกไฟล์').disabled).toBe(false);
  });

  it('destroys a document that finishes opening after its case was replaced', async () => {
    const source = sourceDocument();
    const opening = deferred<SourceDocument>();
    services.openSource.mockReturnValue(opening.promise);
    await mount();
    await chooseFile(source.raw);
    await mount({...props, caseId: 'case-b'});
    await act(async () => opening.resolve(source.document));

    expect(source.document.destroy).toHaveBeenCalledOnce();
    expect(source.document.renderPage).not.toHaveBeenCalled();
    expect(services.uploadSource).not.toHaveBeenCalled();
    expect(props.onSourceChange).not.toHaveBeenCalled();
    expect(props.onPreviewChange).not.toHaveBeenCalled();
    expect(preview()).toBeNull();
  });

  it('revokes a page that finishes rendering after its case was replaced', async () => {
    const source = sourceDocument();
    const rendering = deferred<PreparedSource>();
    source.document.renderPage.mockReturnValue(rendering.promise);
    services.openSource.mockResolvedValue(source.document);
    await mount();
    await chooseFile(source.raw);
    const nextProps = {...props, caseId: 'case-b', onSourceChange: vi.fn(), onPreviewChange: vi.fn()};
    await mount(nextProps);
    await act(async () => rendering.resolve(source.pages[0]));

    expect(source.document.destroy).toHaveBeenCalledOnce();
    expect(revokeUrl).toHaveBeenCalledWith(source.pages[0].url);
    expect(services.uploadSource).not.toHaveBeenCalled();
    expect(props.onSourceChange).toHaveBeenCalledWith(null);
    expect(props.onSourceChange).not.toHaveBeenCalledWith(source.raw.name);
    expect(props.onPreviewChange).not.toHaveBeenCalledWith(source.pages[0]);
    expect(nextProps.onSourceChange).not.toHaveBeenCalled();
    expect(nextProps.onPreviewChange).not.toHaveBeenCalled();
    expect(preview()).toBeNull();
  });

  it('ignores late AI output after switching cases while the new case can analyze independently', async () => {
    const oldSource = sourceDocument(1, 'old-case.pdf');
    const nextSource = sourceDocument(1, 'new-case.pdf');
    const extraction = deferred<{draft: Record<string, unknown>}>();
    services.openSource.mockResolvedValueOnce(oldSource.document).mockResolvedValueOnce(nextSource.document);
    services.aiExtract.mockReturnValueOnce(extraction.promise);
    await mount();
    await chooseFile(oldSource.raw);
    await click('วิเคราะห์ด้วย AI');
    const nextProps = {...props, caseId: 'case-b', onSourceChange: vi.fn(), onPreviewChange: vi.fn(), onApplyDraft: vi.fn()};
    await mount(nextProps);
    await chooseFile(nextSource.raw);
    await act(async () => extraction.resolve({draft: {width: 99999}}));

    expect(preview()?.getAttribute('src')).toBe(nextSource.pages[0].url);
    expect(nextProps.onPreviewChange).toHaveBeenLastCalledWith(nextSource.pages[0]);
    expect(host.querySelector('pre')).toBeNull();
    expect(nextProps.onApplyDraft).not.toHaveBeenCalled();
    expect(props.onApplyDraft).not.toHaveBeenCalled();
    await click('วิเคราะห์ด้วย AI');
    await click('ใช้เป็นมิติร่างเพื่อแก้ไข');
    expect(nextProps.onApplyDraft).toHaveBeenCalledWith({width: 1200, length: 2400});
  });

  it('releases the previous document and preview on file replacement and releases the final preview on unmount', async () => {
    const first = sourceDocument(2, 'first.pdf');
    const second = sourceDocument(2, 'second.pdf');
    services.openSource.mockResolvedValueOnce(first.document).mockResolvedValueOnce(second.document);
    await mount();
    await chooseFile(first.raw);
    await chooseFile(second.raw);

    expect(first.document.destroy).toHaveBeenCalledOnce();
    expect(revokeUrl.mock.calls).toEqual([[first.pages[0].url]]);
    expect(preview()?.getAttribute('src')).toBe(second.pages[0].url);
    await act(async () => root.render(null));
    expect(second.document.destroy).toHaveBeenCalledOnce();
    expect(revokeUrl.mock.calls).toEqual([[first.pages[0].url], [second.pages[0].url]]);
  });

  it('recovers from a project save timeout without uploading until a subsequent save succeeds', async () => {
    vi.useFakeTimers();
    const source = sourceDocument();
    const oldSave = deferred<void>();
    services.openSource.mockResolvedValue(source.document);
    vi.mocked(props.saveProject).mockReturnValueOnce(oldSave.promise);
    await mount();
    await chooseFile(source.raw);
    expect(services.uploadSource).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTimeAsync(20_000));

    expect(error()).toContain('20 วินาที');
    expect(preview()?.getAttribute('src')).toBe(source.pages[0].url);
    expect(button('อัปโหลดหน้าที่แสดงอีกครั้ง').disabled).toBe(false);
    await act(async () => oldSave.resolve());
    expect(services.uploadSource).not.toHaveBeenCalled();
    await click('อัปโหลดหน้าที่แสดงอีกครั้ง');
    expect(services.uploadSource).toHaveBeenCalledTimes(1);
    expect(button('วิเคราะห์ด้วย AI').disabled).toBe(false);
  });
});
