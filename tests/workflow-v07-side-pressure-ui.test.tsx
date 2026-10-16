// @vitest-environment jsdom
import React, {act, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {renderToStaticMarkup} from 'react-dom/server';
import {webcrypto} from 'node:crypto';
import {TextEncoder} from 'node:util';
import {afterEach, expect, it, vi} from 'vitest';
import {SidePressureEditor} from '../src/components/SidePressureEditor';
import {SideLayoutEditor} from '../src/components/SideLayoutEditor';
import {SideResults} from '../src/components/SideResults';
import WorkflowV07Panel, {WorkflowDocuments} from '../src/components/WorkflowV07Panel';
import type {SidePressureDefinition} from '../src/domain/workflowV07/sidePressure';
import {previewWorkflow, regenerateDraftLayouts} from '../src/domain/workflowV07/model';
import {stampSideLayout} from '../src/domain/workflowV07/sideLayout';
import {documentView, freezeDesign} from '../src/domain/workflowV07/snapshot';
import {pressureApplied, pressureDefinition, pressureSource} from './fixtures/workflow-v07-side-pressure';
import {defaults} from '../src/domain';

afterEach(() => vi.unstubAllGlobals());
function setup() {vi.stubGlobal('crypto', webcrypto); vi.stubGlobal('TextEncoder', TextEncoder); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);}
const button = (scope: Element, text: string) => Array.from(scope.querySelectorAll('button')).find(b => b.textContent === text)!;
const field = (scope: Element, prefix: string) => Array.from(scope.querySelectorAll('label')).find(l => l.textContent?.startsWith(prefix))!;
const click = async (scope: Element, text: string) => act(async () => button(scope, text).click());
async function enter(input: HTMLInputElement, value: string) {await act(async () => {Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value); input.dispatchEvent(new Event('input', {bubbles: true}));});}
async function choose(select: HTMLSelectElement, value: string) {await act(async () => {select.value = value; select.dispatchEvent(new Event('change', {bubbles: true}));});}

it('starts every pressure/scope/head unknown, preserves explicit zero and clears competing fields when switching source method', async () => {
  setup(); const host = document.createElement('div'), root = createRoot(host), changed = vi.fn();
  function Editor() {const [value, set] = useState<SidePressureDefinition | null>(null); return <SidePressureEditor value={value} onChange={v => {set(v); changed(v);}}/>;}
  try {
    await act(async () => root.render(<Editor/>)); await click(host, 'เริ่มกำหนดแรงดันเฉพาะผิว'); expect(changed.mock.lastCall![0].scope).toBeNull(); await click(host, 'เพิ่มแหล่งแรงดันข้าง');
    expect(changed.mock.lastCall![0].sources[0].kind).toBeNull(); expect(changed.mock.lastCall![0].sources[0].x0Mm).toBeNull();
    await choose(field(host, 'ชนิดแหล่งแรงดันข้าง').querySelector('select')!, 'HYDROSTATIC'); expect(field(host, 'หัวคอนกรีตเฉพาะช่วง').querySelector('input')!.value).toBe(''); await enter(field(host, 'หัวคอนกรีตเฉพาะช่วง').querySelector('input')!, '0'); expect(changed.mock.lastCall![0].sources[0].headMm).toBe(0);
    await choose(field(host, 'ชนิดแหล่งแรงดันข้าง').querySelector('select')!, 'DECLARED_LATERAL'); expect(changed.mock.lastCall![0].sources[0].headMm).toBeNull(); expect(field(host, 'แรงดันที่ Z เริ่ม').querySelector('input')!.value).toBe('');
    await enter(field(host, 'แรงดันที่ Z เริ่ม').querySelector('input')!, '10'); await enter(field(host, 'แรงดันที่ Z สิ้นสุด').querySelector('input')!, '0'); expect(changed.mock.lastCall![0].sources[0].p1KPa).toBe(0);
    await choose(field(host, 'ชนิดแหล่งแรงดันข้าง').querySelector('select')!, 'HYDROSTATIC'); expect(changed.mock.lastCall![0].sources[0].p0KPa).toBeNull(); expect(changed.mock.lastCall![0].sources[0].p1KPa).toBeNull();
    await click(host, 'กลับใช้ Hydrostatic จากหัวเทร่วม'); expect(changed).toHaveBeenLastCalledWith(null);
  } finally {await act(async () => root.unmount());}
});
it('keeps pending per-face profiles across restamps, applies them atomically and restores raw pressure inputs on cancel', async () => {
  setup(); const host = document.createElement('div'), root = createRoot(host), m = pressureApplied(), p = previewWorkflow(m), pending = vi.fn(), apply = vi.fn(), draft = vi.fn();
  const render = (revisionId: string) => root.render(<SideLayoutEditor layout={{...m.sideLayout!, revisionId}} topology={p.topology} onApply={apply} onPendingChange={pending} onDraftChange={draft}/>);
  try {
    await act(async () => render(m.revisionId)); const face = host.querySelector('[aria-label="กำหนดแบบข้าง F1"]')!; await enter(field(face, 'หัวคอนกรีตเฉพาะช่วง').querySelector('input')!, '600'); await enter(field(face, 'หลักฐานช่วงผิวที่ไม่มีแรงดัน').querySelector('input')!, 'SYNTHETIC pending wet region');
    await act(async () => render('RESTAMP')); expect(field(face, 'หัวคอนกรีตเฉพาะช่วง').querySelector('input')!.value).toBe('600'); expect(pending).toHaveBeenLastCalledWith(true);
    await click(host, 'ตรวจแบบข้างและวิเคราะห์ร่างใหม่'); const saved = apply.mock.lastCall![0]; expect(saved.pourHeadMm).toBeNull(); expect(saved.faces[0].pressure.sources[0].headMm).toBe(600); expect(saved.faces[1].pressure.sources[0].headMm).toBe(1000); expect(saved.faces[0].pressure.omittedAreasEvidenceRef).toBe('SYNTHETIC pending wet region'); expect(draft.mock.lastCall![0].faces[0].pressure.sources[0].headMm).toBe(600);
    await click(host, 'คืนค่าแบบข้างที่นำไปใช้ล่าสุด'); expect(field(face, 'หัวคอนกรีตเฉพาะช่วง').querySelector('input')!.value).toBe('1000'); expect(pending).toHaveBeenLastCalledWith(false);
  } finally {await act(async () => root.unmount());}
});
it('renders nonuniform base pressure, real X/Z sources, endpoint strip transfer and matched frozen report/drawing data', async () => {
  setup(); const m = pressureApplied(), layout = structuredClone(m.sideLayout!); layout.faces[0].pressure = pressureDefinition([pressureSource('A', {x1Mm: 500, headMm: 500}), pressureSource('B', {x0Mm: 500})]);
  const ready = regenerateDraftLayouts(m, {sideLayout: stampSideLayout(m, layout)}), p = previewWorkflow(ready), view = await documentView(await freezeDesign(ready), ready);
  const html = renderToStaticMarkup(<WorkflowDocuments view={view}/>), result = renderToStaticMarkup(<SideResults model={ready} preview={p}/>);
  expect(result).toContain('แรงดันฐาน แปรตามตำแหน่ง X'); expect(result).toContain('แรงรวม 6.25 kN'); expect(result).toContain('แรงดันตามตำแหน่งผิว F1'); expect(result).toContain('แรงส่งต่อแถบไม้อัด→คร่าว'); expect(result).toContain('F1:PLY:1:ZONE:1:Z0'); expect(result).not.toMatch(/NaN|Infinity|undefined/);
  expect(view.drawing.side!.faces[0].result.pressureDeck!.sourceResultants.map(r => r.forceN)).toEqual([1250, 5000]); expect(view.drawing.side!.faces[0].input.pressure!.sources[0].headMm).toBe(500); expect(html.match(new RegExp(view.snapshotHash, 'g'))).toHaveLength(2); expect(view.constructionEligible).toBe(false);
});
it('authors a face pressure field with no common head and blocks freeze/download/case saves until edits are applied or restored', async () => {
  setup(); const host = document.createElement('div'), root = createRoot(host);
  const fields = (scope: Element, prefix: string) => Array.from(scope.querySelectorAll('label')).filter(l => l.textContent?.startsWith(prefix)).map(l => l.querySelector('input')!);
  try {
    await act(async () => root.render(<WorkflowV07Panel input={{...defaults, width: 1000, length: 1000, height: 1000, gamma: 20, walerSpacing: 500}} caseId="PRESSURE-UI"/>));
    await choose(field(host, 'ผิวจริงที่ต้องการ').querySelector('select')!, 'F1'); await click(host, 'เพิ่มผิวจริงในแบบข้าง'); const face = host.querySelector('[aria-label="กำหนดแบบข้าง F1"]')!;
    for (const [label, value] of [['Stage แบบข้าง', 'TEST-POUR'], ['Load case แบบข้าง', 'TEST-SERVICE'], ['หลักฐานแบบข้าง', 'SYNTHETIC'], ['ระดับฐานคอนกรีตแบบข้าง', '2000']]) await enter(fields(host, label)[0], value);
    for (const [label, value] of [['หลักฐานผิว/สมาชิก', 'SYNTHETIC face'], ['คร่าว x', '0,250,500,750,1000'], ['E คร่าว', '200000'], ['I คร่าว', '1000000'], ['หลักฐานหน้าตัดและวัสดุคร่าว', 'SYNTHETIC'], ['E คานรัด', '200000'], ['I คานรัด', '1000000'], ['หลักฐานราง/แกน/วัสดุ', 'SYNTHETIC'], ['สัดส่วนแรงราง', '.6'], ['ไม้อัดหนาจริง', '12'], ['E ไม้อัด', '8000'], ['หลักฐานผลิตภัณฑ์', 'SYNTHETIC']]) await enter(fields(face, label)[0], value);
    await choose(field(face, 'ทิศเสี้ยน').querySelector('select')!, 'ALONG_FACE'); await choose(field(face, 'รอยต่อไม้อัด').querySelector('select')!, 'true'); for (const f of fields(face, 'จุดรองรับคานรัด x')) await enter(f, '250,750'); await enter(fields(face, 'ระดับคานรัด z')[0], '100'); await enter(fields(face, 'ระดับคานรัด z')[1], '900');
    await click(face, 'เริ่มกำหนดแรงดันเฉพาะผิว'); await choose(field(face, 'ขอบเขตแรงดันของผิว').querySelector('select')!, 'REPLACE_COMPLETE_FACE_FOR_STAGE'); await enter(fields(face, 'หลักฐานแผนแรงดัน')[0], 'SYNTHETIC'); await enter(fields(face, 'หลักฐานช่วงผิวที่ไม่มีแรงดัน')[0], 'SYNTHETIC full face'); await click(face, 'เพิ่มแหล่งแรงดันข้าง');
    await choose(field(face, 'ชนิดแหล่งแรงดันข้าง').querySelector('select')!, 'HYDROSTATIC'); for (const [label, value] of [['รหัสเจ้าของแรงดัน', 'SYN-H'], ['หลักฐานแรงดันและตำแหน่งจริง', 'SYNTHETIC'], ['X เริ่มแรงดัน', '0'], ['X สิ้นสุดแรงดัน', '1000'], ['หัวคอนกรีตเฉพาะช่วง', '1000']]) await enter(fields(face, label)[0], value);
    expect(fields(host, 'หัวคอนกรีตเหนือฐานแบบข้าง')[0].value).toBe(''); await click(host, 'ตรวจแบบข้างและวิเคราะห์ร่างใหม่'); expect(host.querySelector('.side-editor [role="alert"]')).toBeNull(); expect(host.textContent).toContain('แรงรวม 10 kN'); await click(host, 'สร้างรายการคำนวณและรูปคู่ด้านร่าง'); await vi.waitFor(() => expect(button(host, 'ดาวน์โหลดร่าง JSON').disabled).toBe(false));
    await enter(fields(face, 'หัวคอนกรีตเฉพาะช่วง')[0], '500'); expect(button(host, 'ดาวน์โหลดร่าง JSON').disabled).toBe(true); expect(button(host, 'สร้างรายการคำนวณและรูปคู่ด้านร่าง').disabled).toBe(true); await click(host, 'เก็บและวิเคราะห์ชุดกรณีโหลดร่าง'); expect(host.querySelector('.load-cases-editor [role="alert"]')?.textContent).toContain('ค้าง');
    await click(host, 'คืนค่าแบบข้างที่นำไปใช้ล่าสุด'); expect(fields(face, 'หัวคอนกรีตเฉพาะช่วง')[0].value).toBe('1000'); expect(button(host, 'ดาวน์โหลดร่าง JSON').disabled).toBe(false);
  } finally {await act(async () => root.unmount());}
});
