// @vitest-environment jsdom
import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {renderToStaticMarkup} from 'react-dom/server';
import {webcrypto} from 'node:crypto';
import {TextEncoder} from 'node:util';
import {afterEach, expect, it, vi} from 'vitest';
import {PlywoodBindingEditor} from '../src/components/PlywoodBinding';
import {SoffitLayoutEditor} from '../src/components/SoffitLayoutEditor';
import {SideLayoutEditor} from '../src/components/SideLayoutEditor';
import WorkflowV07Panel, {WorkflowDocuments} from '../src/components/WorkflowV07Panel';
import {defaults} from '../src/domain';
import type {PlywoodProductBinding} from '../src/domain/workflowV07/plywood';
import {selectReference} from '../src/domain/workflowV07/catalogues';
import {buildSoffitCandidate} from '../src/domain/workflowV07/soffit';
import {analyzeSideLayout, stampSideLayout} from '../src/domain/workflowV07/sideLayout';
import {pairFaces} from '../src/domain/workflowV07/geometry';
import {regenerateDraftLayouts} from '../src/domain/workflowV07/model';
import {documentView, freezeDesign} from '../src/domain/workflowV07/snapshot';
import {layoutFixture, slabModel} from './fixtures/workflow-v07-soffit';
import {sideDefinition, sideModel} from './fixtures/workflow-v07-side';
import {plywoodBinding, plywoodFixture} from './fixtures/workflow-v07-plywood';
afterEach(() => vi.unstubAllGlobals());
function setup() {vi.stubGlobal('crypto', webcrypto); vi.stubGlobal('TextEncoder', TextEncoder); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);}
const field = (scope: Element, text: string) => Array.from(scope.querySelectorAll('label')).find(l => l.textContent?.startsWith(text))!;
const button = (scope: Element, text: string) => Array.from(scope.querySelectorAll('button')).find(b => b.textContent === text)!;
const click = async (scope: Element, text: string) => act(async () => button(scope, text).click());
async function enter(input: HTMLInputElement, value: string) {await act(async () => {Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value); input.dispatchEvent(new Event('input', {bubbles: true}));});}
async function choose(select: HTMLSelectElement, value: string) {await act(async () => {select.value = value; select.dispatchEvent(new Event('change', {bubbles: true}));});}
const set = (scope: Element, text: string, value: string) => enter(field(scope, text).querySelector('input')!, value);
const pick = (scope: Element, text: string, value: string) => choose(field(scope, text).querySelector('select')!, value);

it('captures product data without defaulting axis mapping and selects the other Eb when face grain rotates', async () => {
  setup(); const host = document.createElement('div'), root = createRoot(host); let binding: PlywoodProductBinding | null = null, grain: 0 | 90 = 0;
  let material = plywoodBinding().material!;
  const render = () => root.render(<PlywoodBindingEditor binding={binding} label="TEST" thicknessMm={12} grainRelativeDeg={grain} materialSelection={material} onChange={next => {binding = next; render();}}/>);
  try {
    await act(async () => render()); await click(host, 'ผูกผลิตภัณฑ์ไม้อัดกับแถบนี้'); await click(host, 'คัดลอกวัสดุไม้อัดที่กดใช้แล้วเข้าผูก');
    expect(binding!.material).not.toBe(material); expect(binding!.parallelToGrainKey).toBeNull();
    await pick(host, 'ค่า Eb ที่ขนานเสี้ยน', 'Eb0_mean_MPa');
    for (const [label, value] of [['หลักฐานแปลแกน', 'SYNTHETIC axis'], ['หลักฐานสินค้า', 'SYNTHETIC product'], ['สภาพเปียก', 'SYNTHETIC service']]) await set(host, label, value);
    expect(host.textContent).toContain('10,719'); grain = 90; await act(async () => render()); expect(host.textContent).toContain('6,781');
    material = selectReference(material.reference, '0.5.0', {changes: {properties: {Eb0_mean_MPa: 10000}}, reason: 'SYNTHETIC', evidenceRef: 'SYNTHETIC'});
    await act(async () => render()); expect((binding!.material!.effective.properties as Record<string, unknown>).Eb0_mean_MPa).toBe(10719);
  } finally {await act(async () => root.unmount());}
});
it('authors a manual plywood strip and explicit zero self-weight through the actual soffit editor', async () => {
  setup(); const host = document.createElement('div'), root = createRoot(host), apply = vi.fn(), pending = vi.fn();
  try {
    await act(async () => root.render(<SoffitLayoutEditor layout={layoutFixture()} beam={false} onApply={apply} onPendingChange={pending}/>));
    await click(host, 'เพิ่มแบบจำลองไม้อัดท้องและน้ำหนัก'); const scope = host.querySelector('[aria-label="กำหนดไม้อัดแบบท้อง"]')!;
    expect(field(scope, 'น้ำหนักไม้อัดท้อง').querySelector('input')!.value).toBe(''); expect(field(scope, 'การครอบครองน้ำหนัก').querySelector('select')!.value).toBe('');
    for (const [label, value] of [['ไม้อัดท้องหนาจริง', '12'], ['E ไม้อัดท้องที่กรอกเอง', '8000'], ['ขอบไม้อัดท้องเริ่ม', '0'], ['ขอบไม้อัดท้องสิ้นสุด', '1500'], ['น้ำหนักไม้อัดท้อง', '0'], ['หลักฐานแผ่น', 'SYNTHETIC joints'], ['หลักฐานน้ำหนัก', 'SYNTHETIC explicit zero']]) await set(scope, label, value);
    await pick(scope, 'แนวเสี้ยนไม้อัด', 'X'); await pick(scope, 'รอยต่อไม้อัดท้อง', 'true'); await pick(scope, 'การครอบครองน้ำหนัก', 'SEPARATE_ACTION');
    expect(pending).toHaveBeenLastCalledWith(true); await click(host, 'ตรวจตำแหน่งและวิเคราะห์แรงแบบท้อง');
    const layout = apply.mock.lastCall![0], c = buildSoffitCandidate(slabModel(), layout);
    expect(layout.plywood.selfWeightKPa).toBe(0); expect(c.plywood!.strips).toHaveLength(4); expect(c.expectedForceN).toBe(23760);
  } finally {await act(async () => root.unmount());}
});
it('preserves pending side product evidence across restamping and uses the declared vertical grain direction', async () => {
  setup(); const host = document.createElement('div'), root = createRoot(host), model = sideModel(), d = sideDefinition(), apply = vi.fn(), pending = vi.fn();
  d.faces[0].plywood = {...d.faces[0].plywood, effectiveE_MPa: null, binding: plywoodBinding()};
  const layout = stampSideLayout(model, d), topology = pairFaces(model.vertices, model.heightMm);
  const render = async (rev: string) => act(async () => root.render(<SideLayoutEditor layout={{...layout, revisionId: rev}} topology={topology} onApply={apply} onPendingChange={pending}/>));
  try {
    await render('R1'); const face = host.querySelector('[aria-label="กำหนดแบบข้าง F1"]')!;
    expect(field(face, 'E ไม้อัดตามทิศ').querySelector('input')!.disabled).toBe(true);
    await set(face, 'หลักฐานแปลแกน', 'SYNTHETIC pending axis mapping'); await pick(face, 'ทิศเสี้ยนหลัก', 'VERTICAL'); await render('R2');
    expect(field(face, 'หลักฐานแปลแกน').querySelector('input')!.value).toContain('pending'); await click(host, 'ตรวจแบบข้างและวิเคราะห์ร่างใหม่');
    const saved = apply.mock.lastCall![0], result = analyzeSideLayout(model, stampSideLayout(model, saved));
    expect(result.faces[0].elasticInputs.plywood.E_MPa).toBe(6781); expect(result.faces[0].result.expectedForceN).toBe(10000);
  } finally {await act(async () => root.unmount());}
});
it('renders frozen actual span/zones, source revisions and weight ownership with the shared hash', async () => {
  setup(); const ready = regenerateDraftLayouts(slabModel(), {soffitLayout: {...layoutFixture(), plywood: {...plywoodFixture(), selfWeightKPa: .1}}});
  const frozen = await freezeDesign(ready), html = renderToStaticMarkup(<WorkflowDocuments view={await documentView(frozen, ready)}/>);
  expect(html).toContain('PLY-UPM007-12'); expect(html).toContain('ZONE:1'); expect(html).toContain('24.12'); expect(html).toContain('SEPARATE_ACTION');
  expect(html).toContain('โซนแถบไม้อัดตามขอบโหลดจริง'); expect(html).toContain(ready.revisionId); expect(html).toContain('JOIST-2');
  expect(html.match(new RegExp(frozen.snapshotHash, 'g'))).toHaveLength(2); expect(html).not.toMatch(/NaN|Infinity|undefined/);
});
it('retains unknown plywood input in a frozen BLOCKED draft and disables export for further pending edits', async () => {
  setup(); const host = document.createElement('div'), root = createRoot(host);
  try {
    await act(async () => root.render(<WorkflowV07Panel input={defaults} caseId="PLY-UNKNOWN"/>)); await pick(host, 'ประเภทองค์อาคาร', 'SLAB');
    const rows = Array.from(host.querySelectorAll('label')).filter(l => l.textContent?.startsWith('ตำแหน่งแนวคานรับ Y'));
    await enter(rows[0].querySelector('input')!, '0'); await enter(rows[1].querySelector('input')!, '1500'); await click(host, 'เพิ่มแบบจำลองไม้อัดท้องและน้ำหนัก');
    expect(button(host, 'สร้างรายการคำนวณและรูปคู่ด้านร่าง').disabled).toBe(true); await click(host, 'ตรวจตำแหน่งและวิเคราะห์แรงแบบท้อง');
    expect(host.querySelector('[role="alert"]')).toBeNull(); await click(host, 'สร้างรายการคำนวณและรูปคู่ด้านร่าง');
    await vi.waitFor(() => expect(button(host, 'ดาวน์โหลดร่าง JSON').disabled).toBe(false));
    const report = host.querySelector('.workflow-v07-documents')!; expect(report.textContent).toContain('น้ำหนักที่ระบุ UNKNOWN'); expect(report.textContent).toContain('ยังไม่มีผลแถบไม้อัด');
    const scope = host.querySelector('[aria-label="กำหนดไม้อัดแบบท้อง"]')!; await set(scope, 'น้ำหนักไม้อัดท้อง', '0'); expect(button(host, 'ดาวน์โหลดร่าง JSON').disabled).toBe(true);
    await click(host, 'คืนค่าแบบท้องที่นำไปใช้ล่าสุด'); expect(button(host, 'ดาวน์โหลดร่าง JSON').disabled).toBe(false); expect(field(scope, 'น้ำหนักไม้อัดท้อง').querySelector('input')!.value).toBe('');
  } finally {await act(async () => root.unmount());}
});
