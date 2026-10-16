// @vitest-environment jsdom
import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {renderToStaticMarkup} from 'react-dom/server';
import {webcrypto} from 'node:crypto';
import {TextEncoder} from 'node:util';
import {afterEach, expect, it, vi} from 'vitest';
import {PairedWalerEditor} from '../src/components/PairedWalerEditor';
import {SideLayoutEditor} from '../src/components/SideLayoutEditor';
import WorkflowV07Panel, {WorkflowDocuments} from '../src/components/WorkflowV07Panel';
import {defaults} from '../src/domain';
import type {IndependentWalerPair} from '../src/domain/workflowV07/walerPair';
import {stampSideLayout} from '../src/domain/workflowV07/sideLayout';
import {regenerateDraftLayouts} from '../src/domain/workflowV07/model';
import {pairFaces} from '../src/domain/workflowV07/geometry';
import {documentView, freezeDesign} from '../src/domain/workflowV07/snapshot';
import {sideModel} from './fixtures/workflow-v07-side';
import {explicitRailPair, explicitSideDefinition} from './fixtures/workflow-v07-waler-pair';

afterEach(() => vi.unstubAllGlobals());
function setup() {vi.stubGlobal('crypto', webcrypto); vi.stubGlobal('TextEncoder', TextEncoder); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);}
const button = (scope: Element, text: string) => Array.from(scope.querySelectorAll('button')).find(b => b.textContent === text)!;
const field = (scope: Element, prefix: string) => Array.from(scope.querySelectorAll('label')).find(l => l.textContent?.startsWith(prefix))!;
const click = async (scope: Element, text: string) => act(async () => button(scope, text).click());
async function enter(input: HTMLInputElement, value: string) {await act(async () => {Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value); input.dispatchEvent(new Event('input', {bubbles: true}));});}
async function choose(select: HTMLSelectElement, value: string) {await act(async () => {select.value = value; select.dispatchEvent(new Event('change', {bubbles: true}));});}

it('creates unknown independent rail fields, and changing family/axis cannot reuse incompatible stiffness silently', async () => {
  setup(); const host = document.createElement('div'), root = createRoot(host); let pair: IndependentWalerPair | null = null;
  const render = () => root.render(<PairedWalerEditor pair={pair} supportIds={['CONTACT-L', 'CONTACT-R']} onChange={next => {pair = next; render();}}/>);
  try {
    await act(async () => render()); await click(host, 'กำหนดรางแยกรายชิ้นสำหรับระดับนี้');
    expect(pair!.rail1Share).toBeNull(); expect(pair!.rails.every(r => r.E_MPa === null && r.bendingI_mm4 === null && r.orientationDeg === null)).toBe(true);
    expect(pair!.compositeAction).toBe(false); expect(pair!.supportFittings).toEqual([]);
    await click(host, 'เพิ่มข้อมูลแผ่นของจุดรองรับที่ยังขาด');
    expect(pair!.supportFittings.map(f => f.supportId)).toEqual(['CONTACT-L', 'CONTACT-R']);
    expect(pair!.supportFittings.every(f => f.requiredRadialClearanceMm === null)).toBe(true);
    pair = explicitRailPair(); await act(async () => render());
    const first = host.querySelector('[aria-label="ข้อมูลรางชิ้นที่ 1"]')!;
    await choose(field(first, 'การวางหน้าตัดราง').querySelector('select')!, '90');
    expect(pair!.rails[0].E_MPa).toBe(200000); expect(pair!.rails[0].bendingI_mm4).toBeNull(); expect(pair!.rails[0].axisEvidenceRef).toBe('');
    await choose(field(first, 'ตระกูลหน้าตัดราง').querySelector('select')!, 'CHS');
    expect(pair!.rails[0].E_MPa).toBeNull(); expect(pair!.rails[0].sectionRef).toBe(''); expect(pair!.rails[1].E_MPa).toBe(100000);
  } finally {await act(async () => root.unmount());}
});
it('preserves per-level pairs, actual fitting IDs and pending edits across revision restamping', async () => {
  setup(); const host = document.createElement('div'), root = createRoot(host), model = sideModel(), definition = explicitSideDefinition();
  const layout = stampSideLayout(model, definition), apply = vi.fn(), pending = vi.fn(), topology = pairFaces(model.vertices, model.heightMm);
  const render = async (revisionId: string) => act(async () => root.render(<SideLayoutEditor topology={topology} layout={{...layout, revisionId}} onApply={apply} onPendingChange={pending}/>));
  try {
    await render('R1'); const scope = host.querySelector('[aria-label="กำหนดคานรัด F1/W1"]')!;
    await enter(field(scope, 'หลักฐาน/สมมติฐานแบ่งแรง').querySelector('input')!, 'SYNTHETIC unsaved per-level assumption');
    await render('R2'); expect(field(scope, 'หลักฐาน/สมมติฐานแบ่งแรง').querySelector('input')!.value).toContain('unsaved');
    expect(pending).toHaveBeenLastCalledWith(true); await click(host, 'ตรวจแบบข้างและวิเคราะห์ร่างใหม่');
    const applied = apply.mock.lastCall![0]; expect(applied.faces[0].walers[0].pair.sharingEvidenceRef).toContain('unsaved');
    expect(applied.faces[0].walers[1].pair.sharingEvidenceRef).toBe(definition.faces[0].walers[1].pair!.sharingEvidenceRef);
    expect(applied.faces[0].walers[0].pair.supportFittings.map((f: {supportId: string}) => f.supportId)).toEqual(['S1', 'S2']);
  } finally {await act(async () => root.unmount());}
});
it('renders actual independent EI/share, original source references and dimensional FAIL in one frozen revision', async () => {
  setup(); const model = sideModel(), definition = explicitSideDefinition(); definition.faces[0].walers[0].pair!.clearGapMm = 14;
  const ready = regenerateDraftLayouts(model, {sideLayout: stampSideLayout(model, definition)}), frozen = await freezeDesign(ready);
  const html = renderToStaticMarkup(<WorkflowDocuments view={await documentView(frozen, ready)}/>);
  expect(html).toContain('F1/W1'); expect(html).toContain('R2 / RHS'); expect(html).toContain('4,000,000'); expect(html).toContain('0.25');
  expect(html).toContain('SYNTHETIC independent section'); expect(html).toContain('TIE_ENVELOPE_EXCEEDS_CLEAR_RAIL_GAP');
  expect(html).toContain('FAIL'); expect(html).toContain('Noncomposite / NO_GO'); expect(html).toContain('ยังไม่แสดงระยะช่องราง');
  expect(html.match(new RegExp(frozen.snapshotHash, 'g'))).toHaveLength(2); expect(html).not.toMatch(/NaN|Infinity|undefined/);
});
it('retains incomplete paired-rail input in a frozen BLOCKED draft, then blocks export for further unapplied edits', async () => {
  setup(); const host = document.createElement('div'), root = createRoot(host);
  try {
    await act(async () => root.render(<WorkflowV07Panel input={defaults} caseId="PAIR-PARTIAL"/>));
    await choose(field(host, 'ผิวจริงที่ต้องการ').querySelector('select')!, 'F1'); await click(host, 'เพิ่มผิวจริงในแบบข้าง');
    const face = host.querySelector('[aria-label="กำหนดแบบข้าง F1"]')!, first = host.querySelector('[aria-label="กำหนดคานรัด F1/W1"]')!, second = host.querySelector('[aria-label="กำหนดคานรัด F1/W2"]')!;
    await enter(field(first, 'ระดับคานรัด z').querySelector('input')!, '100'); await enter(field(second, 'ระดับคานรัด z').querySelector('input')!, '900');
    await click(first, 'กำหนดรางแยกรายชิ้นสำหรับระดับนี้'); await enter(field(first, 'ช่องว่างใสระหว่างราง').querySelector('input')!, '20');
    expect(button(host, 'สร้างรายการคำนวณและรูปคู่ด้านร่าง').disabled).toBe(true);
    await click(host, 'ตรวจแบบข้างและวิเคราะห์ร่างใหม่'); expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(host.textContent).toContain('ข้อมูลแบบข้างไม่ครบ');
    await click(host, 'สร้างรายการคำนวณและรูปคู่ด้านร่าง');
    await vi.waitFor(() => expect(button(host, 'ดาวน์โหลดร่าง JSON').disabled).toBe(false));
    const report = host.querySelector('.workflow-v07-documents')!; expect(report.textContent).toContain('F1/W1'); expect(report.textContent).toContain('UNKNOWN');
    expect(report.textContent).toContain('DRAFT / NO_GO');
    await enter(field(first, 'ช่องว่างใสระหว่างราง').querySelector('input')!, '22'); expect(button(host, 'ดาวน์โหลดร่าง JSON').disabled).toBe(true);
    await click(host, 'คืนค่าแบบข้างที่นำไปใช้ล่าสุด'); expect(button(host, 'ดาวน์โหลดร่าง JSON').disabled).toBe(false);
    expect(field(face, 'ช่องว่างใสระหว่างราง').querySelector('input')!.value).toBe('20');
  } finally {await act(async () => root.unmount());}
});
