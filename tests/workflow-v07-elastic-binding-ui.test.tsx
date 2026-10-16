// @vitest-environment jsdom
import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {renderToStaticMarkup} from 'react-dom/server';
import {webcrypto} from 'node:crypto';
import {TextEncoder} from 'node:util';
import {afterEach, expect, it, vi} from 'vitest';
import {ElasticBindingEditor, type BindingSelections} from '../src/components/ElasticBinding';
import {SoffitLayoutEditor} from '../src/components/SoffitLayoutEditor';
import {SideLayoutEditor} from '../src/components/SideLayoutEditor';
import WorkflowV07Panel, {WorkflowDocuments} from '../src/components/WorkflowV07Panel';
import {defaults} from '../src/domain';
import {selectReference} from '../src/domain/workflowV07/catalogues';
import {resolveElasticBinding, type ElasticMemberBinding} from '../src/domain/workflowV07/elasticBinding';
import {pairFaces} from '../src/domain/workflowV07/geometry';
import {stampSideLayout} from '../src/domain/workflowV07/sideLayout';
import {buildSoffitCandidate} from '../src/domain/workflowV07/soffit';
import {regenerateDraftLayouts} from '../src/domain/workflowV07/model';
import {documentView, freezeDesign} from '../src/domain/workflowV07/snapshot';
import {steelBinding, timberBinding} from './fixtures/workflow-v07-elastic-binding';
import {sideDefinition, sideModel} from './fixtures/workflow-v07-side';
import {layoutFixture, slabModel} from './fixtures/workflow-v07-soffit';
afterEach(() => vi.unstubAllGlobals());
function setup() {vi.stubGlobal('crypto', webcrypto); vi.stubGlobal('TextEncoder', TextEncoder); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);}
const field = (scope: Element, text: string) => Array.from(scope.querySelectorAll('label')).find(l => l.textContent?.startsWith(text))!;
const button = (scope: Element, text: string) => Array.from(scope.querySelectorAll('button')).find(b => b.textContent === text)!;
const click = async (scope: Element, text: string) => act(async () => button(scope, text).click());
async function enter(input: HTMLInputElement, value: string) {await act(async () => {Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value); input.dispatchEvent(new Event('input', {bubbles: true}));});}
async function choose(select: HTMLSelectElement, value: string) {await act(async () => {select.value = value; select.dispatchEvent(new Event('change', {bubbles: true}));});}
const set = (scope: Element, text: string, value: string) => enter(field(scope, text).querySelector('input')!, value);
const pick = (scope: Element, text: string, value: string) => choose(field(scope, text).querySelector('select')!, value);

it('copies applied references by value with unknown E/axis choices and keeps the copy independent of later generic selections', async () => {
  setup(); const host = document.createElement('div'), root = createRoot(host), source = steelBinding(); let b: ElasticMemberBinding | null = null;
  let selections: BindingSelections = {section: source.section, material: source.material};
  const render = () => root.render(<ElasticBindingEditor binding={b} role="WALER" label="W1:R1" selections={selections} onChange={next => {b = next; render();}}/>);
  try {
    await act(async () => render()); await click(host, 'ผูกข้อมูลหน้าตัดและวัสดุกับสมาชิกนี้');
    expect(b!.section).toBeNull(); await click(host, 'คัดลอกข้อมูลอ้างอิงที่ใช้แล้วเข้าผูกสมาชิก');
    expect(b!.material).not.toBe(selections.material); expect(b!.elasticPropertyKey).toBeNull(); expect(b!.orientationDeg).toBeNull();
    selections = {...selections, material: selectReference(source.material!.reference, '0.5.0', {changes: {properties: {E_MPa: 190000}}, reason: 'SYNTHETIC', evidenceRef: 'SYNTHETIC'})};
    await act(async () => render()); expect((b!.material!.effective.properties as Record<string, unknown>).E_MPa).toBe(200000);
    await click(host, 'คัดลอกข้อมูลอ้างอิงที่ใช้แล้วเข้าผูกสมาชิก'); expect((b!.material!.effective.properties as Record<string, unknown>).E_MPa).toBe(190000);
    expect(field(host, 'แหล่งหน้าตัด').querySelector('select')!.querySelector<HTMLOptionElement>('option[value="MEASURED_TIMBER_RECT"]')!.disabled).toBe(true);
  } finally {await act(async () => root.unmount());}
});

it('authors a measured timber binding through the soffit form and requires renewed explicit self-weight after source geometry changes', async () => {
  setup(); const host = document.createElement('div'), root = createRoot(host), layout = layoutFixture(), apply = vi.fn(), pending = vi.fn();
  try {
    await act(async () => root.render(<SoffitLayoutEditor layout={layout} beam={false} selections={{section: null, material: timberBinding().material}} onApply={apply} onPendingChange={pending}/>));
    const joist = host.querySelector('[aria-label="คุณสมบัติกลุ่ม joist"]')!;
    await click(joist, 'ผูกข้อมูลหน้าตัดและวัสดุกับสมาชิกนี้');
    expect(field(joist, 'E · MPa').querySelector('input')!.disabled).toBe(true); expect(field(joist, 'น้ำหนักตัวเอง').querySelector('input')!.value).toBe('');
    await pick(joist, 'แหล่งหน้าตัด', 'MEASURED_TIMBER_RECT'); await click(joist, 'คัดลอกข้อมูลอ้างอิงที่ใช้แล้วเข้าผูกสมาชิก');
    for (const [label, value] of [['กว้างไม้วัดจริง', '38'], ['ลึกไม้วัดจริง', '70'], ['ชื่อเรียกขนาดไม้', '1.5x3 inches'], ['หลักฐานการวัด', 'SYNTHETIC measurement']]) await set(joist, label, value);
    await pick(joist, 'แกนหน้าตัดที่ผูก', '0'); await pick(joist, 'คุณสมบัติ E', 'E0_mean_MPa'); await pick(joist, 'แนวเสี้ยน', 'true');
    for (const [label, value] of [['หลักฐานจับคู่', 'SYNTHETIC match'], ['สภาพใช้งาน', 'SYNTHETIC service'], ['หลักฐานแกนดัดของสมาชิก', 'SYNTHETIC axis'], ['น้ำหนักตัวเอง', '0'], ['หลักฐานหน้าตัด/แกน', 'SYNTHETIC explicit weight']]) await set(joist, label, value);
    await click(host, 'ตรวจตำแหน่งและวิเคราะห์แรงแบบท้อง');
    const saved = apply.mock.lastCall![0]; expect(saved.joist.E_MPa).toBeNull(); expect(saved.joist.I_mm4).toBeNull();
    expect(resolveElasticBinding(saved.joist.binding, 'JOIST').I_mm4).toBeCloseTo(38 * 70 ** 3 / 12, 7);
    expect(buildSoffitCandidate(slabModel(), saved).expectedForceN).toBe(23760);
    await set(joist, 'กว้างไม้วัดจริง', '40'); expect(field(joist, 'น้ำหนักตัวเอง').querySelector('input')!.value).toBe(''); expect(pending).toHaveBeenLastCalledWith(true);
  } finally {await act(async () => root.unmount());}
});

it('preserves side member binding edits across a restamp and serializes only the binding as the E/I source', async () => {
  setup(); const host = document.createElement('div'), root = createRoot(host), model = sideModel(), d = sideDefinition();
  d.faces[0].stud = {E_MPa: null, I_mm4: null, evidenceRef: '', binding: timberBinding()};
  const layout = stampSideLayout(model, d), topology = pairFaces(model.vertices, model.heightMm), apply = vi.fn(), pending = vi.fn();
  const render = async (rev: string) => act(async () => root.render(<SideLayoutEditor layout={{...layout, revisionId: rev}} topology={topology} onApply={apply} onPendingChange={pending}/>));
  try {
    await render('R1'); const scope = host.querySelector('[aria-label="กำหนดการผูก F1:STUD"]')!;
    await set(scope, 'หลักฐานแกนดัดของสมาชิก', 'SYNTHETIC unsaved axis'); await render('R2');
    expect(field(scope, 'หลักฐานแกนดัดของสมาชิก').querySelector('input')!.value).toContain('unsaved');
    expect(field(host.querySelector('[aria-label="กำหนดแบบข้าง F1"]')!, 'E คร่าว').querySelector('input')!.disabled).toBe(true);
    await click(host, 'ตรวจแบบข้างและวิเคราะห์ร่างใหม่'); const s = apply.mock.lastCall![0].faces[0].stud;
    expect(s.E_MPa).toBeNull(); expect(s.I_mm4).toBeNull(); expect(s.binding.axisEvidenceRef).toContain('unsaved');
  } finally {await act(async () => root.unmount());}
});

it('freezes original/effective binding data and analyzed member values under the shared report/drawing hash', async () => {
  setup(); const model = slabModel(), layout = layoutFixture(), b = timberBinding();
  b.material = selectReference(b.material!.reference, '0.5.0', {changes: {properties: {E0_mean_MPa: 10450}}, reason: 'SYNTHETIC condition', evidenceRef: 'SYNTHETIC product evidence'});
  layout.joist = {...layout.joist, E_MPa: null, I_mm4: null, binding: b};
  const ready = regenerateDraftLayouts(model, {soffitLayout: layout}), frozen = await freezeDesign(ready);
  const html = renderToStaticMarkup(<WorkflowDocuments view={await documentView(frozen, ready)}/>);
  expect(html).toContain('SOFFIT:JOIST'); expect(html).toContain('TIMBER-EN338-C24'); expect(html).toContain('10450'); expect(html).toContain('11000');
  expect(html).toContain('SYNTHETIC product evidence'); expect(html).toContain('7.0538'); expect(html).toContain('NO_GO');
  expect(html.match(new RegExp(frozen.snapshotHash, 'g'))).toHaveLength(2); expect(html).not.toMatch(/NaN|Infinity|undefined/);
});

it('retains an unknown binding in a frozen blocked draft and immediately prevents export after further unapplied edits', async () => {
  setup(); const host = document.createElement('div'), root = createRoot(host);
  try {
    await act(async () => root.render(<WorkflowV07Panel input={defaults} caseId="BINDING-UNKNOWN"/>));
    await pick(host, 'ประเภทองค์อาคาร', 'SLAB');
    const labels = Array.from(host.querySelectorAll('label')).filter(l => l.textContent?.startsWith('ตำแหน่งแนวคานรับ Y'));
    await enter(labels[0].querySelector('input')!, '0'); await enter(labels[1].querySelector('input')!, '1500');
    const joist = host.querySelector('[aria-label="คุณสมบัติกลุ่ม joist"]')!; await click(joist, 'ผูกข้อมูลหน้าตัดและวัสดุกับสมาชิกนี้');
    expect(button(host, 'สร้างรายการคำนวณและรูปคู่ด้านร่าง').disabled).toBe(true);
    await click(host, 'ตรวจตำแหน่งและวิเคราะห์แรงแบบท้อง'); expect(host.querySelector('[role="alert"]')).toBeNull();
    await click(host, 'สร้างรายการคำนวณและรูปคู่ด้านร่าง'); await vi.waitFor(() => expect(button(host, 'ดาวน์โหลดร่าง JSON').disabled).toBe(false));
    expect(host.querySelector('.workflow-v07-documents')?.textContent).toContain('SOFFIT:JOIST'); expect(host.querySelector('.workflow-v07-documents')?.textContent).toContain('UNKNOWN');
    await set(joist, 'หลักฐานจับคู่', 'SYNTHETIC pending evidence'); expect(button(host, 'ดาวน์โหลดร่าง JSON').disabled).toBe(true);
    await click(host, 'คืนค่าแบบท้องที่นำไปใช้ล่าสุด'); expect(button(host, 'ดาวน์โหลดร่าง JSON').disabled).toBe(false);
  } finally {await act(async () => root.unmount());}
});
