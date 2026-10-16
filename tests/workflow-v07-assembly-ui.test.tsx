// @vitest-environment jsdom
import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {renderToStaticMarkup} from 'react-dom/server';
import {webcrypto} from 'node:crypto';
import {TextEncoder} from 'node:util';
import {afterEach, expect, it, vi} from 'vitest';
import {RinglockAssemblyEditor} from '../src/components/RinglockAssembly';
import {SoffitLayoutEditor} from '../src/components/SoffitLayoutEditor';
import {FrameLayoutEditor} from '../src/components/FrameLayoutEditor';
import WorkflowV07Panel, {WorkflowDocuments} from '../src/components/WorkflowV07Panel';
import {defaults} from '../src/domain';
import {captureRinglockAssembly} from '../src/domain/workflowV07/ringlockAssembly';
import {frameGeometryFromAssembly} from '../src/domain/workflowV07/frameWorkflow';
import {documentView, freezeDesign} from '../src/domain/workflowV07/snapshot';
import {previewWorkflow, regenerateDraftLayouts, reviseDraft} from '../src/domain/workflowV07/model';
import {coverageModel} from './fixtures/workflow-v07-coverage';
import {assemblyApplied, assemblyFrameApplied} from './fixtures/workflow-v07-assembly';

afterEach(() => vi.unstubAllGlobals());
function setup() {vi.stubGlobal('crypto', webcrypto); vi.stubGlobal('TextEncoder', TextEncoder); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);}
const button = (scope: Element, text: string) => Array.from(scope.querySelectorAll('button')).find(b => b.textContent === text)!;
const field = (scope: Element, prefix: string) => Array.from(scope.querySelectorAll('label')).find(l => l.textContent?.startsWith(prefix))!;
async function enter(input: HTMLInputElement, value: string) {await act(async () => {Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value); input.dispatchEvent(new Event('input', {bubbles: true}));});}
async function choose(select: HTMLSelectElement, value: string) {await act(async () => {select.value = value; select.dispatchEvent(new Event('change', {bubbles: true}));});}
const click = async (scope: Element, text: string) => act(async () => button(scope, text).click());

it('authors all per-head bases without copying shared Z or reassigning old elevations when head coordinates change', async () => {
  setup(); const host = document.createElement('div'), root = createRoot(host), model = coverageModel(), apply = vi.fn(), pending = vi.fn();
  try {
    await act(async () => root.render(<SoffitLayoutEditor layout={model.soffitLayout!} beam={false} onApply={apply} onPendingChange={pending}/>));
    await click(host, 'เริ่มกรอกระดับฐานรายหัว'); expect(host.querySelectorAll('.soffit-base-datums input[type="number"]')).toHaveLength(6);
    const datum = field(host, 'ระดับฐาน B1:HEAD-2').querySelector('input')!; expect(datum.value).toBe('');
    await enter(datum, '25'); await enter(field(host, 'หลักฐานระดับฐาน B1:HEAD-2').querySelector('input')!, 'SYNTHETIC actual point');
    await click(host, 'ตรวจตำแหน่งและวิเคราะห์แรงแบบท้อง'); const saved = apply.mock.lastCall![0];
    expect(saved.baseElevationMm).toBeNull(); expect(saved.baseDatumsByHead[1]).toMatchObject({headNodeId: 'B1:HEAD-2', elevationMm: 25, localXMm: 1200});
    expect(saved.baseDatumsByHead[0].elevationMm).toBeNull();
    await enter(field(host, 'ตำแหน่ง U-head X ทุกจุด').querySelector('input')!, '0, 1000, 2400'); await click(host, 'จัดรายการฐานตามหัวปัจจุบัน');
    expect(field(host, 'ระดับฐาน B1:HEAD-2').querySelector('input')!.value).toBe(''); expect(field(host, 'หลักฐานระดับฐาน B1:HEAD-2').querySelector('input')!.value).toBe('');
  } finally {await act(async () => root.unmount());}
});
it('captures only known heads, leaves physical component fields unknown, and preserves pending assembly measurements across restamping', async () => {
  setup(); const host = document.createElement('div'), root = createRoot(host), model = coverageModel(), apply = vi.fn(), pending = vi.fn(), draft = vi.fn();
  const render = (assembly: ReturnType<typeof assemblyApplied>['ringlockAssembly'] = null) => root.render(<RinglockAssemblyEditor assembly={assembly ?? null} captureEnabled onCapture={() => captureRinglockAssembly(model)} onApply={apply} onPendingChange={pending} onDraftChange={draft}/>);
  try {
    await act(async () => render()); await click(host, 'เริ่มบันทึกขาจากหัวและฐานปัจจุบัน'); expect(host.querySelectorAll('.assembly-leg-editor')).toHaveLength(6);
    const first = host.querySelector('.assembly-leg-editor')!; expect(field(first, 'Tolerance').querySelector('input')!.value).toBe('');
    expect(field(first, 'ความสูงติดตั้งระหว่าง Datum').querySelector('input')!.value).toBe('');
    await enter(field(first, 'ระดับท้องแบบจริง').querySelector('input')!, '3187'); await click(first, 'เพิ่ม Standard ที่ติดตั้งจริง');
    expect(field(first, 'ความสูงติดตั้งระหว่างปลาย Standard').querySelector('input')!.value).toBe(''); expect(draft.mock.lastCall![0].legs[0].baseJack.extensionMm).toBeNull();
    await act(async () => render()); expect(field(first, 'ระดับท้องแบบจริง').querySelector('input')!.value).toBe('3187');
    await click(host, 'เก็บการประกอบและตรวจ Datum ร่าง'); expect(apply.mock.lastCall![0].legs[0].standards).toHaveLength(1); expect(pending).toHaveBeenLastCalledWith(false);
  } finally {await act(async () => root.unmount());}
});
it('prepares a component frame only in an empty editor and keeps every spring/property/boundary explicitly unknown', async () => {
  setup(); const host = document.createElement('div'), root = createRoot(host), model = assemblyApplied(), draft = vi.fn(), apply = vi.fn(), pending = vi.fn();
  try {
    await act(async () => root.render(<FrameLayoutEditor layout={null} headIds={[]} captureEnabled={false} onCapture={vi.fn()} captureAssemblyEnabled onCaptureAssembly={() => frameGeometryFromAssembly(model)} onApply={apply} onPendingChange={pending} onDraftChange={draft}/>));
    await click(host, 'เตรียมพิกัดเฟรมจากการประกอบที่ตรวจ Datum แล้ว');
    expect(host.querySelectorAll('.frame-node-editor')).toHaveLength(36); expect(host.querySelectorAll('.frame-member-editor')).toHaveLength(30);
    expect(button(host, 'เตรียมพิกัดเฟรมจากการประกอบที่ตรวจ Datum แล้ว').disabled).toBe(true); expect(pending).toHaveBeenLastCalledWith(true);
    const d = draft.mock.lastCall![0]; expect(d.nodes.every((n: {boundary: {kind: string}[]}) => n.boundary.every(b => b.kind === 'UNKNOWN'))).toBe(true);
    expect(d.elements.every((e: {E_MPa: number | null}) => e.E_MPa === null)).toBe(true);
    await click(host, 'เก็บข้อมูลและวิเคราะห์เฟรมร่าง'); expect(apply.mock.lastCall![0].headMappings).toHaveLength(6);
  } finally {await act(async () => root.unmount());}
});
it('freezes per-leg elevations, component datums, individual head/base forces and source evidence together in the shared report snapshot', async () => {
  setup(); const model = assemblyFrameApplied(), view = await documentView(await freezeDesign(model), model), html = renderToStaticMarkup(<WorkflowDocuments view={view}/>);
  expect(html).toContain('Datum การประกอบรายขา'); expect(html).toContain('ผลต่างระดับหัว 0'); expect(html).toContain('7.05375'); expect(html).toContain('GEOMETRY ONLY');
  expect(html).toContain('SYNTHETIC nonoverlapping installed datums'); expect(html).toContain('lowerInsertionMm'); expect(html).toContain('JOINT_SPRING');
  expect(html.match(new RegExp(view.snapshotHash, 'g'))).toHaveLength(2); expect(html).not.toMatch(/NaN|Infinity|undefined/);
  const edited = regenerateDraftLayouts(reviseDraft(model, {additionalDeadKPa: .75})); expect(previewWorkflow(edited).assembly!.frameGeometryReady).toBe(true);
});
it('blocks snapshot/download while assembly fields are pending and saves unknown/partial assembly data without making the frame ready', async () => {
  setup(); const host = document.createElement('div'), root = createRoot(host);
  try {
    await act(async () => root.render(<WorkflowV07Panel input={defaults} caseId="ASSEMBLY-PENDING"/>));
    await choose(field(host, 'ประเภทองค์อาคาร').querySelector('select')!, 'SLAB');
    await click(host, 'สร้างรายการคำนวณและรูปคู่ด้านร่าง'); await vi.waitFor(() => expect(button(host, 'ดาวน์โหลดร่าง JSON').disabled).toBe(false));
    const editor = host.querySelector('.ringlock-assembly-editor')!;
    await enter(field(editor, 'หลักฐานรูปแบบการประกอบ').querySelector('input')!, 'SYNTHETIC partial'); expect(button(host, 'ดาวน์โหลดร่าง JSON').disabled).toBe(true); expect(button(host, 'สร้างรายการคำนวณและรูปคู่ด้านร่าง').disabled).toBe(true);
    await click(editor, 'คืนค่าการประกอบที่เก็บไว้'); expect(button(host, 'ดาวน์โหลดร่าง JSON').disabled).toBe(false);
    await enter(field(editor, 'หลักฐานรูปแบบการประกอบ').querySelector('input')!, 'SYNTHETIC partial'); await click(editor, 'เก็บการประกอบและตรวจ Datum ร่าง');
    expect(host.querySelector('[role="alert"]')).toBeNull(); expect(button(host, 'เตรียมพิกัดเฟรมจากการประกอบที่ตรวจ Datum แล้ว').disabled).toBe(true);
    await click(host, 'สร้างรายการคำนวณและรูปคู่ด้านร่าง'); await vi.waitFor(() => expect(button(host, 'ดาวน์โหลดร่าง JSON').disabled).toBe(false));
    expect(host.querySelector('.workflow-v07-documents')?.textContent).toContain('ASSEMBLY_HAS_NO_CURRENT_ACTUAL_LEGS');
  } finally {await act(async () => root.unmount());}
});
