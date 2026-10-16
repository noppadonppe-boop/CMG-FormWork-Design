// @vitest-environment jsdom
import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {renderToStaticMarkup} from 'react-dom/server';
import {webcrypto} from 'node:crypto';
import {TextEncoder} from 'node:util';
import {afterEach, expect, it, vi} from 'vitest';
import {StageStudyEditor, StageStudyResults} from '../src/components/StageStudy';
import WorkflowV07Panel, {WorkflowDocuments} from '../src/components/WorkflowV07Panel';
import {defaults} from '../src/domain';
import {applyStageStudy, captureStage, emptyStage, stampStageStudy} from '../src/domain/workflowV07/stageStudy';
import {previewWorkflow, regenerateDraftLayouts} from '../src/domain/workflowV07/model';
import {documentView, freezeDesign} from '../src/domain/workflowV07/snapshot';
import {coverageModel} from './fixtures/workflow-v07-coverage';

afterEach(() => vi.unstubAllGlobals());
function setup() {vi.stubGlobal('crypto', webcrypto); vi.stubGlobal('TextEncoder', TextEncoder); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);}
const button = (scope: Element, text: string) => Array.from(scope.querySelectorAll('button')).find(b => b.textContent === text)!;
const field = (scope: Element, prefix: string) => Array.from(scope.querySelectorAll('label')).find(l => l.textContent?.startsWith(prefix))!;
const click = async (scope: Element, text: string) => act(async () => button(scope, text).click());
async function enter(input: HTMLInputElement, value: string) {await act(async () => {Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value); input.dispatchEvent(new Event('input', {bubbles: true}));});}
function row(model = coverageModel(), id = 'POUR') {return captureStage(model, {...emptyStage(id), stageId: model.soffitLayout!.stageId, evidenceRef: 'SYNTHETIC scope'});}

it('requires explicit capture, preserves pending metadata on restamp, and keeps source provenance independent of editable evidence', async () => {
  setup(); const host = document.createElement('div'), root = createRoot(host), source = coverageModel(), capture = vi.fn(r => captureStage(source, r)), apply = vi.fn(), pending = vi.fn(), book = stampStageStudy(source, {schemaVersion: '1', stages: [row(source)]});
  const render = (revisionId: string) => root.render(<StageStudyEditor book={{...book, revisionId}} onCapture={capture} onApply={apply} onLoad={vi.fn()} onCopy={vi.fn()} onRemoveLayout={vi.fn()} onPendingChange={pending}/>);
  try {
    await act(async () => render(book.revisionId)); await enter(field(host, 'หลักฐานขอบเขต').querySelector('input')!, 'SYNTHETIC pending evidence');
    await act(async () => render('RESTAMP')); expect(field(host, 'หลักฐานขอบเขต').querySelector('input')!.value).toBe('SYNTHETIC pending evidence'); expect(button(host, 'คืน Stage 1 มาแก้ในหน้าจอ').disabled).toBe(true);
    await click(host, 'เก็บข้อมูลหน้าจอปัจจุบันลง Stage 1'); await click(host, 'เก็บและคำนวณชุด Stage ร่าง');
    expect(capture).toHaveBeenCalledOnce(); const saved = apply.mock.lastCall![0].stages[0]; expect(saved.inputs.members).toEqual([]); expect(saved.capturedRevision).toBe(source.revisionId); expect(saved.evidenceRef).toBe('SYNTHETIC pending evidence');
    await click(host, 'คืนค่าชุด Stage ที่เก็บไว้'); expect(field(host, 'หลักฐานขอบเขต').querySelector('input')!.value).toBe('SYNTHETIC scope'); expect(pending).toHaveBeenLastCalledWith(false);
  } finally {await act(async () => root.unmount());}
});
it('exposes explicit load/copy/remove actions without replacing a saved stage when only browsing or naming a new draft', async () => {
  setup(); const host = document.createElement('div'), root = createRoot(host), source = coverageModel(), saved = row(source), load = vi.fn(), copy = vi.fn(), remove = vi.fn(), capture = vi.fn();
  try {
    await act(async () => root.render(<StageStudyEditor book={stampStageStudy(source, {schemaVersion: '1', stages: [saved]})} onCapture={capture} onApply={vi.fn()} onLoad={load} onCopy={copy} onRemoveLayout={remove} onPendingChange={vi.fn()}/>));
    await click(host, 'คืน Stage 1 มาแก้ในหน้าจอ'); expect(load).toHaveBeenCalledWith(saved);
    await enter(field(host, 'Stage ID ใหม่สำหรับ').querySelector('input')!, 'ERECTION'); expect(copy).not.toHaveBeenCalled();
    await click(host, 'คัดลอกข้อมูลปัจจุบันไป Stage ใหม่'); expect(copy).toHaveBeenCalledWith('ERECTION'); expect(capture).not.toHaveBeenCalled();
    await click(host, 'ถอด Layout แบบท้องจาก Stage หน้าจอ'); expect(remove).toHaveBeenCalledWith('SOFFIT');
    await click(host, 'ถอด Layout แบบข้างจาก Stage หน้าจอ'); expect(remove).toHaveBeenCalledWith('SIDE');
  } finally {await act(async () => root.unmount());}
});
it('shows every stage while selection changes only displayed results, preserving all stages in the common report/drawing snapshot', async () => {
  setup(); const host = document.createElement('div'), root = createRoot(host), a = coverageModel(), layout = structuredClone(a.soffitLayout!); layout.stageId = 'OTHER'; layout.joist.I_mm4 = 2e6;
  const b = regenerateDraftLayouts(a, {soffitLayout: layout, constructionLiveKPa: 1}), m = applyStageStudy(b, {schemaVersion: '1', stages: [row(a, 'A'), row(b, 'B')]}), p = previewWorkflow(m);
  try {
    await act(async () => root.render(<StageStudyResults preview={p}/>)); expect(host.textContent).toContain('Stage POUR-TEST');
    const select = field(host, 'ดูผลของ Stage').querySelector('select')!; await act(async () => {select.value = 'B'; select.dispatchEvent(new Event('change', {bubbles: true}));}); expect(host.textContent).toContain('Stage OTHER');
    expect(host.textContent).toContain('POUR-TEST'); const view = await documentView(await freezeDesign(m), m), html = renderToStaticMarkup(<WorkflowDocuments view={view}/>);
    expect(view.drawing.stageStudy!.stages).toHaveLength(2); expect(html.match(new RegExp(view.snapshotHash, 'g'))).toHaveLength(2); expect(html).toContain('ผลราย Stage'); expect(html).not.toMatch(/NaN|Infinity|undefined/);
  } finally {await act(async () => root.unmount());}
});
it('blocks freeze/download for pending stage metadata and preserves an explicitly incomplete stage as NO_GO', async () => {
  setup(); const host = document.createElement('div'), root = createRoot(host);
  try {
    await act(async () => root.render(<WorkflowV07Panel input={defaults} caseId="STAGE-PENDING"/>)); await click(host, 'สร้างรายการคำนวณและรูปคู่ด้านร่าง'); await vi.waitFor(() => expect(button(host, 'ดาวน์โหลดร่าง JSON').disabled).toBe(false));
    await click(host, 'เพิ่มข้อมูล Stage'); expect(button(host, 'สร้างรายการคำนวณและรูปคู่ด้านร่าง').disabled).toBe(true); expect(button(host, 'ดาวน์โหลดร่าง JSON').disabled).toBe(true);
    await click(host, 'คืนค่าชุด Stage ที่เก็บไว้'); expect(button(host, 'ดาวน์โหลดร่าง JSON').disabled).toBe(false);
    await click(host, 'เพิ่มข้อมูล Stage'); await click(host, 'เก็บและคำนวณชุด Stage ร่าง'); expect(host.querySelector('.stage-study-editor [role="alert"]')).toBeNull(); expect(host.querySelector('.stage-study-results')?.textContent).toContain('captured input');
    await click(host, 'สร้างรายการคำนวณและรูปคู่ด้านร่าง'); await vi.waitFor(() => expect(button(host, 'ดาวน์โหลดร่าง JSON').disabled).toBe(false)); expect(host.querySelector('.workflow-v07-documents')?.textContent).toContain('ผลราย Stage');
  } finally {await act(async () => root.unmount());}
});
it('refuses stage capture/save/context switching over pending physical layout buffers and retains those buffers', async () => {
  setup(); const host = document.createElement('div'), root = createRoot(host);
  try {
    await act(async () => root.render(<WorkflowV07Panel input={defaults} caseId="STAGE-SOURCE"/>));
    const type = field(host, 'ประเภทองค์อาคาร').querySelector('select')!; await act(async () => {type.value = 'SLAB'; type.dispatchEvent(new Event('change', {bubbles: true}));});
    await click(host, 'เพิ่มข้อมูล Stage'); const soffit = host.querySelector('.soffit-editor')!; await enter(field(soffit, 'ขั้นตอนเท/Stage').querySelector('input')!, 'SYNTHETIC pending');
    await click(host, 'เก็บและคำนวณชุด Stage ร่าง'); expect(host.querySelector('.stage-study-editor [role="alert"]')?.textContent).toContain('ค้าง'); expect(field(soffit, 'ขั้นตอนเท/Stage').querySelector('input')!.value).toBe('SYNTHETIC pending');
    await click(host, 'เก็บข้อมูลหน้าจอปัจจุบันลง Stage 1'); expect(host.querySelector('.stage-study-editor [role="alert"]')?.textContent).toContain('ค้าง');
    await click(host, 'คืนค่าแบบท้องที่นำไปใช้ล่าสุด'); await click(host, 'เก็บและคำนวณชุด Stage ร่าง'); expect(host.querySelector('.stage-study-editor [role="alert"]')).toBeNull();
    await click(host, 'เพิ่มกรณีโหลด'); await click(host, 'ถอด Layout แบบท้องจาก Stage หน้าจอ'); expect(host.querySelector('.stage-study-editor [role="alert"]')?.textContent).toContain('ค้าง');
  } finally {await act(async () => root.unmount());}
});
