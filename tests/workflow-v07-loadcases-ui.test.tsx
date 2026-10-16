// @vitest-environment jsdom
import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {renderToStaticMarkup} from 'react-dom/server';
import {webcrypto} from 'node:crypto';
import {TextEncoder} from 'node:util';
import {afterEach, expect, it, vi} from 'vitest';
import {LoadCasesEditor, LoadCasesResults} from '../src/components/LoadCases';
import WorkflowV07Panel, {WorkflowDocuments} from '../src/components/WorkflowV07Panel';
import {defaults} from '../src/domain';
import {applyLoadCases, stampLoadCases} from '../src/domain/workflowV07/loadCases';
import {previewWorkflow, regenerateDraftLayouts} from '../src/domain/workflowV07/model';
import {documentView, freezeDesign} from '../src/domain/workflowV07/snapshot';
import {coverageModel} from './fixtures/workflow-v07-coverage';
import {caseDefinition} from './fixtures/workflow-v07-loadcases';

afterEach(() => vi.unstubAllGlobals());
function setup() {vi.stubGlobal('crypto', webcrypto); vi.stubGlobal('TextEncoder', TextEncoder); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);}
const button = (scope: Element, text: string) => Array.from(scope.querySelectorAll('button')).find(b => b.textContent === text)!;
const field = (scope: Element, prefix: string) => Array.from(scope.querySelectorAll('label')).find(l => l.textContent?.startsWith(prefix))!;
async function enter(input: HTMLInputElement, value: string) {await act(async () => {Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value); input.dispatchEvent(new Event('input', {bubbles: true}));});}
async function choose(select: HTMLSelectElement, value: string) {await act(async () => {select.value = value; select.dispatchEvent(new Event('change', {bubbles: true}));});}
const click = async (scope: Element, text: string) => act(async () => button(scope, text).click());

it('starts every factor/basis unknown, records signed vector choices and keeps blank factors null rather than inserting 0 or 1', async () => {
  setup(); const host = document.createElement('div'), root = createRoot(host), apply = vi.fn(), pending = vi.fn();
  try {
    await act(async () => root.render(<LoadCasesEditor book={null} stages={['POUR-TEST']} onApply={apply} onPendingChange={pending}/>)); await click(host, 'เพิ่มกรณีโหลด');
    expect(Array.from(host.querySelectorAll('input[type="number"]')).every(i => (i as HTMLInputElement).value === '')).toBe(true); expect(field(host, 'ฐานแรงกรณีนี้').querySelector('select')!.value).toBe('');
    await choose(field(host, 'ฐานแรงกรณีนี้').querySelector('select')!, 'FACTORED'); await enter(field(host, 'Stage ที่ใช้ Layout ร่วม').querySelector('input')!, 'POUR-TEST');
    await enter(field(host, 'ตัวคูณ คอนกรีตแนวดิ่ง').querySelector('input')!, '1.2'); await enter(field(host, 'ตัวคูณ แรงลม').querySelector('input')!, '-1');
    expect(pending).toHaveBeenLastCalledWith(true); await click(host, 'เก็บและวิเคราะห์ชุดกรณีโหลดร่าง');
    const d = apply.mock.lastCall![0].cases[0]; expect(d.factors.CONCRETE).toBe(1.2); expect(d.factors.WIND).toBe(-1); expect(d.factors.ADDITIONAL_DL).toBeNull(); expect(d).not.toHaveProperty('approved');
    await enter(field(host, 'ตัวคูณ คอนกรีตแนวดิ่ง').querySelector('input')!, ''); await click(host, 'เก็บและวิเคราะห์ชุดกรณีโหลดร่าง'); expect(apply.mock.lastCall![0].cases[0].factors.CONCRETE).toBeNull();
  } finally {await act(async () => root.unmount());}
});
it('preserves pending case factors/evidence when only source stamps change and restores the saved definition on cancel', async () => {
  setup(); const host = document.createElement('div'), root = createRoot(host), source = coverageModel(), book = stampLoadCases(source, {schemaVersion: '1', cases: [caseDefinition()]}), apply = vi.fn(), pending = vi.fn();
  const render = (revisionId: string) => root.render(<LoadCasesEditor book={{...book, revisionId}} stages={['POUR-TEST']} onApply={apply} onPendingChange={pending}/>);
  try {
    await act(async () => render(book.revisionId)); await enter(field(host, 'ตัวคูณ คอนกรีตแนวดิ่ง').querySelector('input')!, '1.7');
    await enter(field(host, 'หลักฐานสัมประสิทธิ์').querySelector('input')!, 'SYNTHETIC unsaved'); await act(async () => render('RESTAMP'));
    expect(field(host, 'ตัวคูณ คอนกรีตแนวดิ่ง').querySelector('input')!.value).toBe('1.7'); expect(field(host, 'หลักฐานสัมประสิทธิ์').querySelector('input')!.value).toBe('SYNTHETIC unsaved');
    await click(host, 'คืนค่าชุดกรณีโหลดที่เก็บไว้'); expect(field(host, 'ตัวคูณ คอนกรีตแนวดิ่ง').querySelector('input')!.value).toBe('1'); expect(pending).toHaveBeenLastCalledWith(false);
  } finally {await act(async () => root.unmount());}
});
it('shows separate case totals and selected per-member results, and keeps all cases in the frozen report/drawing data', async () => {
  setup(); const host = document.createElement('div'), root = createRoot(host), source = regenerateDraftLayouts(coverageModel(), {designBasisRef: 'SYNTHETIC'});
  const a = caseDefinition('C1'), b = caseDefinition('C2', {basis: 'SERVICE'}); a.factors.CONCRETE = 2; b.factors.CONSTRUCTION_LL = 0;
  const model = applyLoadCases(source, {schemaVersion: '1', cases: [a, b]}), p = previewWorkflow(model);
  try {
    await act(async () => root.render(<LoadCasesResults preview={p}/>)); expect(host.textContent).toContain('36.72'); expect(host.textContent).toContain('14.76'); expect(host.textContent).toContain('FACTORED');
    await choose(field(host, 'ดูผลรายสมาชิก').querySelector('select')!, 'C2'); expect(host.textContent).toContain('SYNTHETIC-C2 · SERVICE'); expect(host.textContent).toContain('36.72');
    const view = await documentView(await freezeDesign(model), model), html = renderToStaticMarkup(<WorkflowDocuments view={view}/>);
    expect(view.drawing.loadCases!.cases).toHaveLength(2); expect(html.match(new RegExp(view.snapshotHash, 'g'))).toHaveLength(2); expect(html).toContain('สัมประสิทธิ์ที่ระบุ'); expect(html).not.toMatch(/NaN|Infinity|undefined/);
  } finally {await act(async () => root.unmount());}
});
it('blocks freeze/download for pending cases and preserves an unresolved case with UNKNOWN outputs in a frozen draft', async () => {
  setup(); const host = document.createElement('div'), root = createRoot(host);
  try {
    await act(async () => root.render(<WorkflowV07Panel input={defaults} caseId="LOADCASES-PENDING"/>));
    await click(host, 'สร้างรายการคำนวณและรูปคู่ด้านร่าง'); await vi.waitFor(() => expect(button(host, 'ดาวน์โหลดร่าง JSON').disabled).toBe(false));
    await click(host, 'เพิ่มกรณีโหลด'); expect(button(host, 'สร้างรายการคำนวณและรูปคู่ด้านร่าง').disabled).toBe(true); expect(button(host, 'ดาวน์โหลดร่าง JSON').disabled).toBe(true);
    await click(host, 'คืนค่าชุดกรณีโหลดที่เก็บไว้'); expect(button(host, 'ดาวน์โหลดร่าง JSON').disabled).toBe(false);
    await click(host, 'เพิ่มกรณีโหลด'); await click(host, 'เก็บและวิเคราะห์ชุดกรณีโหลดร่าง'); expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(host.querySelector('.load-cases-results')?.textContent).toContain('UNKNOWN'); await click(host, 'สร้างรายการคำนวณและรูปคู่ด้านร่าง');
    await vi.waitFor(() => expect(button(host, 'ดาวน์โหลดร่าง JSON').disabled).toBe(false)); expect(host.querySelector('.workflow-v07-documents')?.textContent).toContain('stage: nonempty id required');
  } finally {await act(async () => root.unmount());}
});
it('refuses a case-book save while source layouts are pending and retains the authored case until the source is restored', async () => {
  setup(); const host = document.createElement('div'), root = createRoot(host);
  try {
    await act(async () => root.render(<WorkflowV07Panel input={defaults} caseId="LOADCASES-SOURCE"/>)); await choose(field(host, 'ประเภทองค์อาคาร').querySelector('select')!, 'SLAB');
    await click(host, 'เพิ่มกรณีโหลด'); await enter(field(host, 'ชื่อ Load case ใหม่').querySelector('input')!, 'SYNTHETIC-PENDING');
    const soffit = host.querySelector('.soffit-editor')!; await enter(field(soffit, 'ขั้นตอนเท/Stage').querySelector('input')!, 'SYNTHETIC pending');
    await click(host, 'เก็บและวิเคราะห์ชุดกรณีโหลดร่าง'); expect(host.querySelector('.load-cases-editor [role="alert"]')?.textContent).toContain('ค้าง'); expect(field(host, 'ชื่อ Load case ใหม่').querySelector('input')!.value).toBe('SYNTHETIC-PENDING');
    await click(host, 'คืนค่าแบบท้องที่นำไปใช้ล่าสุด'); await click(host, 'เก็บและวิเคราะห์ชุดกรณีโหลดร่าง'); expect(host.querySelector('.load-cases-editor [role="alert"]')).toBeNull();
  } finally {await act(async () => root.unmount());}
});
