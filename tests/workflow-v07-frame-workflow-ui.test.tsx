// @vitest-environment jsdom
import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {renderToStaticMarkup} from 'react-dom/server';
import {webcrypto} from 'node:crypto';
import {TextEncoder} from 'node:util';
import {afterEach, expect, it, vi} from 'vitest';
import WorkflowV07Panel, {WorkflowDocuments} from '../src/components/WorkflowV07Panel';
import {FrameLayoutEditor} from '../src/components/FrameLayoutEditor';
import {defaults} from '../src/domain';
import {documentView, freezeDesign} from '../src/domain/workflowV07/snapshot';
import {frameGeometryFromSoffit, stampFrameLayout} from '../src/domain/workflowV07/frameWorkflow';
import {previewWorkflow} from '../src/domain/workflowV07/model';
import {frameApplied, frameFixture} from './fixtures/workflow-v07-frame-workflow';

afterEach(() => vi.unstubAllGlobals());
function setup() {vi.stubGlobal('crypto', webcrypto); vi.stubGlobal('TextEncoder', TextEncoder); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);}
const button = (scope: Element, text: string) => Array.from(scope.querySelectorAll('button')).find(b => b.textContent === text)!;
const field = (scope: Element, prefix: string) => Array.from(scope.querySelectorAll('label')).find(l => l.textContent?.startsWith(prefix))!;
async function enter(input: HTMLInputElement, value: string) {await act(async () => {Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value); input.dispatchEvent(new Event('input', {bubbles: true}));});}
async function choose(select: HTMLSelectElement, value: string) {await act(async () => {select.value = value; select.dispatchEvent(new Event('change', {bubbles: true}));});}
const click = async (scope: Element, text: string) => act(async () => button(scope, text).click());

it('renders frozen frame actions, coordinates and forces from the shared report revision without a release claim', async () => {
  setup(); const model = frameApplied(), snapshot = await freezeDesign(model), view = await documentView(snapshot, model);
  const html = renderToStaticMarkup(<WorkflowDocuments view={view}/>);
  expect(html).toContain('เฟรม 3D · แรงอันดับหนึ่ง / BLOCKED / NO_GO');
  expect(html).toContain('FB-2'); expect(html).toContain('7.05375'); expect(html).toContain('0 / 0 / 3,000');
  expect(html).toContain(model.revisionId); expect(html).toContain('FIRST_ORDER_LINEAR_ELASTIC_3D');
  expect(html).toContain('บัญชีแรงสมาชิก N–M–V–T'); expect(html).toContain('RINGLOCK-08'); expect(html).toContain('INCOMPLETE');
  expect(html).toContain('Contract v0.7'); expect(html).toContain('LOAD_PATH'); expect(html).toContain('STAGE_RELEASE');
  expect(html.match(new RegExp(snapshot.snapshotHash, 'g'))).toHaveLength(2);
  expect(html).not.toMatch(/NaN|Infinity|undefined/);
});

it('captures only known source geometry, keeps every restraint unknown and submits an incomplete draft explicitly', async () => {
  setup(); const host = document.createElement('div'), root = createRoot(host), {model} = frameFixture();
  const captured = frameGeometryFromSoffit(model, previewWorkflow(model).loadPath!.reactions), apply = vi.fn(), pending = vi.fn(), draft = vi.fn();
  try {
    await act(async () => root.render(<FrameLayoutEditor layout={null} headIds={captured.headMappings.map(m => m.headNodeId)} captureEnabled onCapture={() => captured} onApply={apply} onPendingChange={pending} onDraftChange={draft}/>));
    await click(host, 'เริ่มจุดหัว/ฐานจากแบบท้องที่วิเคราะห์แล้ว');
    expect(pending).toHaveBeenLastCalledWith(true);
    expect(host.querySelectorAll('.frame-node-editor')).toHaveLength(12);
    expect(host.querySelectorAll('.frame-member-editor')).toHaveLength(0);
    const node = host.querySelector('.frame-node-editor')!;
    expect(field(node, 'Z จริง').querySelector('input')!.value).toBe('3000');
    expect(field(node, 'UX · mm').querySelector('select')!.value).toBe('UNKNOWN');
    expect(field(host, 'ฐานแรงสำหรับเฟรม').querySelector('select')!.value).toBe('');
    await click(host, 'เก็บข้อมูลและวิเคราะห์เฟรมร่าง');
    expect(apply).toHaveBeenLastCalledWith(captured); expect(pending).toHaveBeenLastCalledWith(false);
    expect(button(host, 'เริ่มจุดหัว/ฐานจากแบบท้องที่วิเคราะห์แล้ว').disabled).toBe(true);
  } finally {await act(async () => root.unmount());}
});

it('preserves an unsaved frame across a restamp and clears section and material assumptions when changing physical role', async () => {
  setup(); const host = document.createElement('div'), root = createRoot(host), {model, definition} = frameFixture();
  const layout = stampFrameLayout(model, definition), apply = vi.fn(), pending = vi.fn(), draft = vi.fn(), capture = vi.fn();
  const render = async (revisionId: string) => act(async () => root.render(<FrameLayoutEditor layout={{...layout, revisionId}} headIds={[]} captureEnabled={false} onCapture={capture} onApply={apply} onPendingChange={pending} onDraftChange={draft}/>));
  try {
    await render('R1'); await enter(field(host, 'หลักฐาน/สมมติฐานของเฟรม').querySelector('input')!, 'unsaved actual project assumptions');
    await render('R2'); expect(field(host, 'หลักฐาน/สมมติฐานของเฟรม').querySelector('input')!.value).toBe('unsaved actual project assumptions');
    expect(pending).toHaveBeenLastCalledWith(true);
    const member = host.querySelector('.frame-member-editor')!;
    await choose(field(member, 'ชิ้นส่วนที่แทนจริง').querySelector('select')!, 'HEAD_JACK');
    expect(field(member, 'E · MPa').querySelector('input')!.value).toBe('');
    expect(field(member, 'A · mm²').querySelector('input')!.value).toBe('');
    expect(draft.mock.lastCall![0].elements[0].evidenceRef).toBe('');
    expect(draft.mock.lastCall![0].elements[0].nodeI).toBe('FB-1');
    await click(host, 'คืนค่าเฟรมที่นำไปใช้ล่าสุด');
    expect(field(host, 'หลักฐาน/สมมติฐานของเฟรม').querySelector('input')!.value).toBe(definition.assumptionEvidenceRef);
    expect(pending).toHaveBeenLastCalledWith(false);
  } finally {await act(async () => root.unmount());}
});

it('authors P–Delta controls without silently creating zero imperfections', async () => {
  setup(); const host = document.createElement('div'), root = createRoot(host), {model, definition} = frameFixture();
  const layout = stampFrameLayout(model, definition), pending = vi.fn(), draft = vi.fn();
  try {
    await act(async () => root.render(<FrameLayoutEditor layout={layout} headIds={[]} captureEnabled={false} onCapture={() => definition} onApply={vi.fn()} onPendingChange={pending} onDraftChange={draft}/>));
    await click(host, 'เปิดบันทึก P–Delta');
    expect(draft.mock.lastCall![0].secondOrder.imperfections).toHaveLength(0);
    await click(host, 'เพิ่ม imperfection ของ FB-1');
    const editor = host.querySelector('.frame-imperfection-editor')!;
    expect(field(editor, 'ΔX').querySelector('input')!.value).toBe('');
    await enter(field(editor, 'ΔX').querySelector('input')!, '0.25');
    expect(draft.mock.lastCall![0].secondOrder.imperfections[0].offsetMm[0]).toBe(0.25);
    expect(draft.mock.lastCall![0].secondOrder.imperfections[0].offsetMm.slice(1)).toEqual([null, null]);
  } finally {await act(async () => root.unmount());}
});

it('authors an explicit resistance evidence row without inventing capacity', async () => {
  setup(); const host = document.createElement('div'), root = createRoot(host), {model, definition} = frameFixture();
  const layout = stampFrameLayout(model, definition), draft = vi.fn(), pending = vi.fn();
  try {
    await act(async () => root.render(<FrameLayoutEditor layout={layout} headIds={[]} captureEnabled={false} onCapture={() => definition} onApply={vi.fn()} onPendingChange={pending} onDraftChange={draft}/>));
    const member = host.querySelector('.frame-member-editor')!;
    await click(member, 'เพิ่มแถวหลักฐานกำลัง');
    const row = member.querySelector('.frame-resistance-row')!;
    expect(field(row, 'หน่วย / Capacity').querySelector('input')!.value).toBe('');
    expect(draft.mock.lastCall![0].elements[0].resistance[0].capacity).toBeNull();
    expect(draft.mock.lastCall![0].elements[0].resistance[0].status).toBe('REFERENCE_ONLY');
    await enter(field(row, 'หน่วย / Capacity').querySelector('input')!, '1000');
    expect(draft.mock.lastCall![0].elements[0].resistance[0].capacity).toBe(1000);
  } finally {await act(async () => root.unmount());}
});

it('authors an explicit SLS limit row without inventing a displacement limit', async () => {
  setup(); const host = document.createElement('div'), root = createRoot(host), {model, definition} = frameFixture();
  const layout = stampFrameLayout(model, definition), draft = vi.fn(), pending = vi.fn();
  try {
    await act(async () => root.render(<FrameLayoutEditor layout={layout} headIds={[]} captureEnabled={false} onCapture={() => definition} onApply={vi.fn()} onPendingChange={pending} onDraftChange={draft}/>));
    await click(host, 'เพิ่มแถว SLS limit');
    const row = host.querySelector('.frame-sls-row')!;
    expect(field(row, 'หน่วย / Limit').querySelector('input')!.value).toBe('');
    expect(draft.mock.lastCall![0].sls[0].limit).toBeNull();
    expect(draft.mock.lastCall![0].sls[0].status).toBe('REFERENCE_ONLY');
    await choose(field(row, 'ปริมาณ SLS').querySelector('select')!, 'TRANSLATION_X');
    await enter(field(row, 'หน่วย / Limit').querySelector('input')!, '2');
    expect(draft.mock.lastCall![0].sls[0].limit).toBe(2);
    expect(draft.mock.lastCall![0].sls[0].unit).toBe('MM');
  } finally {await act(async () => root.unmount());}
});

it('saves unknown frame data as BLOCKED and disables report/export immediately for unapplied edits or changed source loads', async () => {
  setup(); const host = document.createElement('div'), root = createRoot(host);
  try {
    await act(async () => root.render(<WorkflowV07Panel input={defaults} caseId="FRAME-UI-PARTIAL"/>));
    await choose(field(host, 'ประเภทองค์อาคาร').querySelector('select')!, 'SLAB');
    expect(button(host, 'เริ่มจุดหัว/ฐานจากแบบท้องที่วิเคราะห์แล้ว').disabled).toBe(true);
    await click(host, 'เพิ่มจุดเฟรม');
    expect(button(host, 'สร้างรายการคำนวณและรูปคู่ด้านร่าง').disabled).toBe(true);
    const node = host.querySelector('.frame-node-editor')!;
    expect(field(node, 'X จริง').querySelector('input')!.value).toBe('');
    await click(host, 'เก็บข้อมูลและวิเคราะห์เฟรมร่าง');
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(host.textContent).toContain('ยังไม่มีผลเฟรมที่ใช้ได้');
    await click(host, 'สร้างรายการคำนวณและรูปคู่ด้านร่าง');
    await vi.waitFor(() => expect(button(host, 'ดาวน์โหลดร่าง JSON').disabled).toBe(false));
    expect(host.querySelector('.workflow-v07-documents')?.textContent).toContain('UNKNOWN / UNKNOWN / UNKNOWN');
    await enter(field(node, 'X จริง').querySelector('input')!, '500');
    expect(button(host, 'ดาวน์โหลดร่าง JSON').disabled).toBe(true);
    expect(button(host, 'สร้างรายการคำนวณและรูปคู่ด้านร่าง').disabled).toBe(true);
    await click(host, 'คืนค่าเฟรมที่นำไปใช้ล่าสุด');
    expect(button(host, 'ดาวน์โหลดร่าง JSON').disabled).toBe(false);
    await enter(field(host, 'น้ำหนักคอนกรีตสด').querySelector('input')!, '25');
    expect(button(host, 'ดาวน์โหลดร่าง JSON').disabled).toBe(true);
    expect(host.textContent).toContain('STALE_FRAME_LAYOUT_REANALYSIS_REQUIRED');
  } finally {await act(async () => root.unmount());}
});

it('rebuilds soffit and captured frame together, preserving pending frame edits and refusing incomplete pending side definitions', async () => {
  setup(); const host = document.createElement('div'), root = createRoot(host);
  try {
    await act(async () => root.render(<WorkflowV07Panel input={{...defaults, width: 2400, length: 1500, height: 150, walerSpacing: 150}} caseId="FRAME-UI-SOURCE"/>));
    await choose(field(host, 'ประเภทองค์อาคาร').querySelector('select')!, 'SLAB');
    for (const [label, value] of [['ความหนาพื้น', '150'], ['Additional Dead Load', '.5'], ['Construction Live Load', '2.5']]) await enter(field(host, label).querySelector('input')!, value);
    const soffit = host.querySelector('.soffit-editor')!;
    for (const [label, value] of [['ขั้นตอนเท/Stage', 'TEST-STAGE'], ['กรณีโหลด/Load case', 'TEST-LOAD'], ['พื้นที่ที่รับผิดชอบโหลด', 'TEST-AREA'], ['หลักฐานตำแหน่งและโหลด', 'SYNTHETIC test'],
      ['ตำแหน่งคร่าว X', '0,600,1200,1800,2400'], ['ปลายคร่าวเริ่ม Y', '0'], ['ปลายคร่าวสิ้นสุด Y', '1500'], ['ปลายคานรับเริ่ม X', '0'], ['ปลายคานรับสิ้นสุด X', '2400'], ['ระดับจุด U-head', '3000'], ['ระดับฐานร่วม', '0']]) await enter(field(soffit, label).querySelector('input')!, value);
    const inputs = (label: string) => Array.from(soffit.querySelectorAll('label')).filter(l => l.textContent?.startsWith(label)).map(l => l.querySelector('input')!);
    await enter(inputs('ตำแหน่งแนวคานรับ Y')[0], '0'); await enter(inputs('ตำแหน่งแนวคานรับ Y')[1], '1500');
    for (const input of inputs('ตำแหน่ง U-head X')) await enter(input, '0,1200,2400');
    for (const [label, value] of [['E · MPa', '200000'], ['I แกนดัด', '1000000'], ['น้ำหนักตัวเอง', '0'], ['หลักฐานหน้าตัด/แกน', 'SYNTHETIC']]) for (const input of inputs(label)) await enter(input, value);
    await click(host, 'ตรวจตำแหน่งและวิเคราะห์แรงแบบท้อง');
    await click(host, 'เริ่มจุดหัว/ฐานจากแบบท้องที่วิเคราะห์แล้ว');
    await enter(field(host, 'หลักฐาน/สมมติฐานของเฟรม').querySelector('input')!, 'SYNTHETIC no restraint assumptions yet');
    await enter(field(soffit, 'หลักฐานตำแหน่งและโหลด').querySelector('input')!, 'SYNTHETIC updated source');
    await click(host, 'ตรวจตำแหน่งและวิเคราะห์แรงแบบท้อง');
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(button(host, 'สร้างรายการคำนวณและรูปคู่ด้านร่าง').disabled).toBe(false);
    expect(host.textContent).not.toContain('STALE_FRAME_LAYOUT_REANALYSIS_REQUIRED');
    expect(host.querySelectorAll('.frame-node-editor')).toHaveLength(12);
    expect(field(host, 'หลักฐาน/สมมติฐานของเฟรม').querySelector('input')!.value).toBe('SYNTHETIC no restraint assumptions yet');
    const side = host.querySelector('.side-editor')!;
    await click(side, 'เพิ่มแนวไทร์จริง');
    await click(host, 'เก็บข้อมูลและวิเคราะห์เฟรมร่าง');
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('แบบข้างที่กรอกไม่ครบ');
    expect(button(host, 'สร้างรายการคำนวณและรูปคู่ด้านร่าง').disabled).toBe(true);
    await click(host, 'คืนค่าแบบข้างที่นำไปใช้ล่าสุด');
    await click(host, 'เก็บข้อมูลและวิเคราะห์เฟรมร่าง');
    expect(host.querySelector('[role="alert"]')).toBeNull();
    await click(host, 'สร้างรายการคำนวณและรูปคู่ด้านร่าง');
    await vi.waitFor(() => expect(button(host, 'ดาวน์โหลดร่าง JSON').disabled).toBe(false));
    const report = host.querySelector('.workflow-v07-documents')!;
    expect(report.textContent).toContain('TEST-STAGE'); expect(report.textContent).toContain('FH-1');
    expect(host.querySelector('[data-testid="report-snapshot-hash"]')!.textContent).toBe(host.querySelector('[data-testid="drawing-snapshot-hash"]')!.textContent);
  } finally {await act(async () => root.unmount());}
});
