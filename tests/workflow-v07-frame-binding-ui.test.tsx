// @vitest-environment jsdom
import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {renderToStaticMarkup} from 'react-dom/server';
import {webcrypto} from 'node:crypto';
import {TextEncoder} from 'node:util';
import {afterEach, expect, it, vi} from 'vitest';
import {FrameLayoutEditor} from '../src/components/FrameLayoutEditor';
import WorkflowV07Panel, {WorkflowDocuments} from '../src/components/WorkflowV07Panel';
import {defaults} from '../src/domain';
import {stampFrameLayout} from '../src/domain/workflowV07/frameWorkflow';
import {documentView, freezeDesign} from '../src/domain/workflowV07/snapshot';
import {frameFixture} from './fixtures/workflow-v07-frame-workflow';
import {boundFrame, frameReference, supplierSelection} from './fixtures/workflow-v07-frame-binding';

afterEach(() => vi.unstubAllGlobals());
function setup() {vi.stubGlobal('crypto', webcrypto); vi.stubGlobal('TextEncoder', TextEncoder); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);}
const button = (scope: Element, text: string) => Array.from(scope.querySelectorAll('button')).find(b => b.textContent === text)!;
const field = (scope: Element, prefix: string) => Array.from(scope.querySelectorAll('label')).find(l => l.textContent?.startsWith(prefix))!;
async function enter(input: HTMLInputElement, value: string) {await act(async () => {Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value); input.dispatchEvent(new Event('input', {bubbles: true}));});}
async function choose(select: HTMLSelectElement, value: string) {await act(async () => {select.value = value; select.dispatchEvent(new Event('change', {bubbles: true}));});}
const click = async (scope: Element, text: string) => act(async () => button(scope, text).click());

it('copies geometry and elastic assumptions separately, disables manual competing values and clears properties when unbound', async () => {
  setup(); const host = document.createElement('div'), root = createRoot(host), {model, definition} = frameFixture();
  const layout = stampFrameLayout(model, definition), apply = vi.fn(), pending = vi.fn(), draft = vi.fn(), snapshot = frameReference(); snapshot.choice.supplierCatalogue = supplierSelection();
  try {
    await act(async () => root.render(<FrameLayoutEditor layout={layout} referenceSnapshot={snapshot} headIds={[]} captureEnabled={false} onCapture={vi.fn()} onApply={apply} onPendingChange={pending} onDraftChange={draft}/>));
    const member = host.querySelector('.frame-member-editor')!;
    await click(member, 'เริ่มผูกข้อมูลท่อช่วงตรง');
    const E = field(member, 'E · MPa').querySelector('input')!; expect(E.disabled).toBe(true); expect(E.value).toBe(''); expect(pending).toHaveBeenLastCalledWith(true);
    expect(draft.mock.lastCall![0].elements[0].binding.elasticSnapshot).toBeNull();
    await click(member, 'คัดลอกชิ้นส่วนผู้จำหน่ายที่เลือก');
    expect(member.textContent).toContain('SU48-ST'); expect(draft.mock.lastCall![0].elements[0].binding.elasticSnapshot).toBeNull();
    await click(member, 'คัดลอกสมมติฐาน E/G ที่เลือกแยกต่างหาก');
    for (const [label, value] of [['ขอบเขตท่อตรง', 'SYNTHETIC I–J'], ['หลักฐานจับคู่ชิ้นส่วนจริง', 'SYNTHETIC matching'], ['หลักฐาน/สมมติฐานการใช้ E/G', 'SYNTHETIC elastic']]) await enter(field(member, label).querySelector('input')!, value);
    await enter(field(member, 'หลักฐานสมาชิก/').querySelector('input')!, 'SYNTHETIC idealization');
    await click(host, 'เก็บข้อมูลและวิเคราะห์เฟรมร่าง');
    const saved = apply.mock.lastCall![0].elements[0];
    expect(saved.E_MPa).toBeNull(); expect(saved.binding.elasticSnapshot.reference.E_MPa).toBe(210000); expect(saved.binding.supplierSnapshot.original.components).toHaveLength(1);
    await click(member, 'คัดลอกหน้าตัดจากชุด Ringlock อ้างอิงที่เลือก');
    expect(field(member, 'ขอบเขตท่อตรง').querySelector('input')!.value).toBe(''); expect(field(member, 'หลักฐานสมาชิก/').querySelector('input')!.value).toBe('');
    await click(member, 'ยกเลิกการผูกท่อและเว้นสมบัติให้กรอกใหม่');
    expect(E.disabled).toBe(false); expect(E.value).toBe(''); expect(draft.mock.lastCall![0].elements[0].binding).toBeNull();
  } finally {await act(async () => root.unmount());}
});
it('preserves pending source copies and evidence through a restamp/global selection change, then clears binding on physical-role changes', async () => {
  setup(); const host = document.createElement('div'), root = createRoot(host), {model, definition} = frameFixture();
  const layout = stampFrameLayout(model, definition), apply = vi.fn(), pending = vi.fn(), draft = vi.fn(), capture = vi.fn();
  const render = (reference = frameReference()) => root.render(<FrameLayoutEditor layout={{...layout, revisionId: 'RESTAMP'}} referenceSnapshot={reference} headIds={[]} captureEnabled={false} onCapture={capture} onApply={apply} onPendingChange={pending} onDraftChange={draft}/>);
  try {
    await act(async () => render()); const member = host.querySelector('.frame-member-editor')!;
    await click(member, 'เริ่มผูกข้อมูลท่อช่วงตรง'); await click(member, 'คัดลอกหน้าตัดจากชุด Ringlock อ้างอิงที่เลือก');
    await enter(field(member, 'ขอบเขตท่อตรง').querySelector('input')!, 'SYNTHETIC unsaved scope');
    await act(async () => render(frameReference('LEDGER')));
    expect(field(member, 'ขอบเขตท่อตรง').querySelector('input')!.value).toBe('SYNTHETIC unsaved scope'); expect(member.textContent).toContain('CHS-48.3x3.2');
    await choose(field(member, 'ชิ้นส่วนที่แทนจริง').querySelector('select')!, 'HEAD_JACK');
    expect(button(member, 'เริ่มผูกข้อมูลท่อช่วงตรง').disabled).toBe(true); expect(field(member, 'E · MPa').querySelector('input')!.value).toBe('');
    expect(draft.mock.lastCall![0].elements[0].binding).toBeNull(); expect(draft.mock.lastCall![0].elements[0].nodeI).toBe('FB-1');
    await click(host, 'คืนค่าเฟรมที่นำไปใช้ล่าสุด'); expect(pending).toHaveBeenLastCalledWith(false); expect(field(member, 'E · MPa').querySelector('input')!.value).toBe('200000');
  } finally {await act(async () => root.unmount());}
});
it('shows captured sources and the actual resolved frame properties in the same frozen report and drawing revision', async () => {
  setup(); const model = boundFrame(), snapshot = await freezeDesign(model), view = await documentView(snapshot, model);
  const html = renderToStaticMarkup(<WorkflowDocuments view={view}/>);
  expect(html).toContain('สมบัติสมาชิกที่ส่งเข้าเฟรม'); expect(html).toContain('210,000'); expect(html).toContain('CHS-48.3x3.2');
  expect(html).toContain('7ce08c7280340a1ab748746bb7a973cf3724fb66bdf7def1d1a9e3b5b0800a13'); expect(html).toContain('7.05375'); expect(html).toContain('NO_GO');
  expect(html.match(new RegExp(snapshot.snapshotHash, 'g'))).toHaveLength(2); expect(html).not.toMatch(/NaN|Infinity|undefined/);
});
it('blocks document creation while binding edits are pending and saves an explicit incomplete binding without inventing section or E/G', async () => {
  setup(); const host = document.createElement('div'), root = createRoot(host);
  try {
    await act(async () => root.render(<WorkflowV07Panel input={defaults} caseId="FRAME-BINDING-PENDING"/>));
    await choose(field(host, 'ประเภทองค์อาคาร').querySelector('select')!, 'SLAB'); await click(host, 'เพิ่มสมาชิกหรือจุดต่อเฟรม');
    const member = host.querySelector('.frame-member-editor')!;
    await choose(field(member, 'ชิ้นส่วนที่แทนจริง').querySelector('select')!, 'STANDARD'); await choose(field(member, 'ชนิดแบบจำลองสมาชิก').querySelector('select')!, 'BEAM_COLUMN');
    await click(member, 'เริ่มผูกข้อมูลท่อช่วงตรง'); expect(button(host, 'สร้างรายการคำนวณและรูปคู่ด้านร่าง').disabled).toBe(true);
    await click(host, 'เก็บข้อมูลและวิเคราะห์เฟรมร่าง'); expect(host.querySelector('[role="alert"]')).toBeNull(); expect(host.textContent).toContain('ยังไม่มีผลเฟรมที่ใช้ได้');
    await click(host, 'สร้างรายการคำนวณและรูปคู่ด้านร่าง'); await vi.waitFor(() => expect(button(host, 'ดาวน์โหลดร่าง JSON').disabled).toBe(false));
    const report = host.querySelector('.workflow-v07-documents')!; expect(report.textContent).toContain('E UNKNOWN MPa / G UNKNOWN MPa');
    await enter(field(member, 'ขอบเขตท่อตรง').querySelector('input')!, 'pending'); expect(button(host, 'ดาวน์โหลดร่าง JSON').disabled).toBe(true);
    await click(host, 'คืนค่าเฟรมที่นำไปใช้ล่าสุด'); expect(button(host, 'ดาวน์โหลดร่าง JSON').disabled).toBe(false);
  } finally {await act(async () => root.unmount());}
});
