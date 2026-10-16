// @vitest-environment jsdom
import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {renderToStaticMarkup} from 'react-dom/server';
import {webcrypto} from 'node:crypto';
import {TextEncoder} from 'node:util';
import {afterEach, expect, it, vi} from 'vitest';
import {FrameLayoutEditor} from '../src/components/FrameLayoutEditor';
import WorkflowV07Panel, {WorkflowDocuments} from '../src/components/WorkflowV07Panel';
import {frameGeometryFromSide, stampFrameLayout} from '../src/domain/workflowV07/frameWorkflow';
import {freezeDesign, documentView} from '../src/domain/workflowV07/snapshot';
import {sideFrameApplied, sideFrameFixture} from './fixtures/workflow-v07-side-frame';
import {defaults} from '../src/domain';

afterEach(() => vi.unstubAllGlobals());
function setup() {vi.stubGlobal('crypto', webcrypto); vi.stubGlobal('TextEncoder', TextEncoder); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);}
const button = (scope: Element, text: string) => Array.from(scope.querySelectorAll('button')).find(b => b.textContent === text)!;
const field = (scope: Element, text: string) => Array.from(scope.querySelectorAll('label')).find(l => l.textContent?.startsWith(text))!;
const click = async (scope: Element, text: string) => act(async () => button(scope, text).click());
async function choose(select: HTMLSelectElement, value: string) {await act(async () => {select.value = value; select.dispatchEvent(new Event('change', {bubbles: true}));});}
async function enter(input: HTMLInputElement, value: string) {await act(async () => {Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value); input.dispatchEvent(new Event('input', {bubbles: true}));});}

it('captures only actual side supports, leaves engineering fields unknown, and cannot overwrite a nonempty frame', async () => {
  setup(); const {model} = sideFrameFixture(), captured = frameGeometryFromSide(model), host = document.createElement('div'), root = createRoot(host);
  const apply = vi.fn(), pending = vi.fn(), draft = vi.fn(), capture = vi.fn(() => captured);
  try {
    await act(async () => root.render(<FrameLayoutEditor layout={null} headIds={[]} captureEnabled={false} onCapture={() => captured} onCaptureSide={capture} captureSideEnabled sideSources={captured.sideTransfers!.mappings} onApply={apply} onPendingChange={pending} onDraftChange={draft}/>));
    await click(host, 'เริ่มพิกัดจุดรองรับจากแบบข้างที่วิเคราะห์แล้ว');
    expect(host.querySelectorAll('.frame-node-editor')).toHaveLength(16); expect(host.querySelectorAll('.frame-member-editor')).toHaveLength(0);
    expect(host.querySelectorAll('.side-frame-mapping')).toHaveLength(16);
    expect(field(host, 'ขอบเขตเฟรมรับแรงแบบข้าง').querySelector('select')!.value).toBe('');
    expect(field(host, 'หลักฐานจุดต่อคานรัดกับเฟรมรับแรง').querySelector('input')!.value).toBe('');
    expect(field(host.querySelector('.frame-node-editor')!, 'UX · mm').querySelector('select')!.value).toBe('UNKNOWN');
    expect(button(host, 'เริ่มพิกัดจุดรองรับจากแบบข้างที่วิเคราะห์แล้ว').disabled).toBe(true);
    expect(pending).toHaveBeenLastCalledWith(true); await click(host, 'เก็บข้อมูลและวิเคราะห์เฟรมร่าง'); expect(apply).toHaveBeenLastCalledWith(captured);
    expect(capture).toHaveBeenCalledTimes(1);
  } finally {await act(async () => root.unmount());}
});
it('retains pending connection evidence across restamps and clears it on a receiving-node change or explicit source removal', async () => {
  setup(); const {model, definition} = sideFrameFixture(), layout = stampFrameLayout(model, definition), host = document.createElement('div'), root = createRoot(host);
  const apply = vi.fn(), pending = vi.fn(), draft = vi.fn(), capture = vi.fn();
  const render = async (revisionId: string) => act(async () => root.render(<FrameLayoutEditor layout={{...layout, revisionId}} headIds={[]} captureEnabled={false} onCapture={capture} sideSources={layout.sideTransfers!.mappings} onApply={apply} onPendingChange={pending} onDraftChange={draft}/>));
  try {
    await render('R1'); await enter(field(host, 'หลักฐานจุดต่อคานรัดกับเฟรมรับแรง').querySelector('input')!, 'unsaved measured connection');
    await render('R2'); expect(field(host, 'หลักฐานจุดต่อคานรัดกับเฟรมรับแรง').querySelector('input')!.value).toBe('unsaved measured connection'); expect(pending).toHaveBeenLastCalledWith(true);
    const map = host.querySelector('.side-frame-mapping')!;
    await choose(field(map, 'จุด SIDE_SUPPORT').querySelector('select')!, 'FS-2');
    expect(field(map, 'หลักฐานจุดต่อคานรัดกับเฟรมรับแรง').querySelector('input')!.value).toBe('');
    await choose(field(host, 'แหล่งแรงของกรณีเฟรม').querySelector('select')!, 'SOFFIT_REACTIONS');
    expect(draft.mock.lastCall![0].sideTransfers).toBeNull(); expect(host.querySelector('.side-frame-mappings')).toBeNull();
    await click(host, 'คืนค่าเฟรมที่นำไปใช้ล่าสุด'); expect(host.querySelectorAll('.side-frame-mapping')).toHaveLength(16); expect(pending).toHaveBeenLastCalledWith(false);
  } finally {await act(async () => root.unmount());}
});
it('makes frame authoring available for all five element types and blocks freezing until pending source edits are applied', async () => {
  setup(); const host = document.createElement('div'), root = createRoot(host);
  try {
    await act(async () => root.render(<WorkflowV07Panel input={defaults} caseId="SIDE-FRAME-PARTIAL"/>));
    for (const kind of ['FOOTING', 'COLUMN', 'WALL', 'BEAM', 'SLAB']) {
      await choose(field(host, 'ประเภทองค์อาคาร').querySelector('select')!, kind);
      expect(host.querySelector('.frame-editor')).not.toBeNull();
      expect(button(host, 'เริ่มพิกัดจุดรองรับจากแบบข้างที่วิเคราะห์แล้ว').disabled).toBe(true);
    }
    await choose(field(host, 'ประเภทองค์อาคาร').querySelector('select')!, 'COLUMN');
    await choose(field(host, 'แหล่งแรงของกรณีเฟรม').querySelector('select')!, 'SIDE_REACTIONS');
    await click(host, 'เพิ่มการผูกแบบข้างกับเฟรม'); expect(button(host, 'สร้างรายการคำนวณและรูปคู่ด้านร่าง').disabled).toBe(true);
    await click(host, 'เก็บข้อมูลและวิเคราะห์เฟรมร่าง'); expect(host.querySelector('[role="alert"]')).toBeNull(); expect(host.textContent).toContain('ยังไม่มีผลเฟรมที่ใช้ได้');
    await click(host, 'สร้างรายการคำนวณและรูปคู่ด้านร่าง'); await vi.waitFor(() => expect(button(host, 'ดาวน์โหลดร่าง JSON').disabled).toBe(false));
    await enter(field(host, 'หลักฐานการแยกสมาชิกต้นทางออกจากเฟรม').querySelector('input')!, 'pending scope');
    expect(button(host, 'ดาวน์โหลดร่าง JSON').disabled).toBe(true); expect(button(host, 'สร้างรายการคำนวณและรูปคู่ด้านร่าง').disabled).toBe(true);
  } finally {await act(async () => root.unmount());}
});
it('renders every side-to-frame source, signed force, revision and scope limitation from the common frozen report and drawing', async () => {
  setup(); const m = sideFrameApplied(), frozen = await freezeDesign(m), view = await documentView(frozen, m), html = renderToStaticMarkup(<WorkflowDocuments view={view}/>);
  expect(html).toContain('แรงรายจุดแบบข้างที่ส่งเข้าเฟรม'); expect(html).toContain('-1,575'); expect(html).toContain('F1 / W1 / S1');
  expect(html).toContain('ไม่รวมการเคลื่อนตัวของเฟรมย้อนกลับ'); expect(html).toContain('Clamp / Anchor'); expect(html).toContain(m.revisionId);
  expect(html.match(new RegExp(frozen.snapshotHash, 'g'))).toHaveLength(2); expect(html).not.toMatch(/NaN|Infinity|undefined/);
});
