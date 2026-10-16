// @vitest-environment jsdom
import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {renderToStaticMarkup} from 'react-dom/server';
import {webcrypto} from 'node:crypto';
import {TextEncoder} from 'node:util';
import {afterEach, expect, it, vi} from 'vitest';
import {defaults} from '../src/domain';
import {pairFaces} from '../src/domain/workflowV07/geometry';
import {stampSideLayout} from '../src/domain/workflowV07/sideLayout';
import {documentView, freezeDesign} from '../src/domain/workflowV07/snapshot';
import WorkflowV07Panel, {WorkflowDocuments} from '../src/components/WorkflowV07Panel';
import {SideLayoutEditor} from '../src/components/SideLayoutEditor';
import {sideApplied, sideDefinition, sideModel} from './fixtures/workflow-v07-side';

afterEach(() => vi.unstubAllGlobals());
function setup() {vi.stubGlobal('crypto', webcrypto); vi.stubGlobal('TextEncoder', TextEncoder); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);}
async function enter(input: HTMLInputElement, value: string) {await act(async () => {Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value); input.dispatchEvent(new Event('input', {bubbles: true}));});}
async function choose(select: HTMLSelectElement, value: string) {await act(async () => {select.value = value; select.dispatchEvent(new Event('change', {bubbles: true}));});}
it('shows actual side coordinates, full tie demands and section responses in the same frozen report', async () => {
  setup(); const model = sideApplied(), frozen = await freezeDesign(model), view = await documentView(frozen, model);
  const html = renderToStaticMarkup(<WorkflowDocuments view={view}/>);
  expect(html).toContain('F1-W1-S1'); expect(html).toContain('3.5417'); expect(html).toContain('2,100');
  expect(html).toContain('F1:PLY:1'); expect(html).toContain('ยังไม่ใช่แบบติดตั้ง');
  expect(html.match(new RegExp(frozen.snapshotHash, 'g'))).toHaveLength(2);
  expect(html).not.toMatch(/NaN|Infinity|undefined/);
});
it('keeps custom support IDs and in-progress edits across a restamp, and resets only on explicit discard', async () => {
  setup(); const host = document.createElement('div'), root = createRoot(host), model = sideModel(), definition = sideDefinition();
  for (const face of definition.faces) for (const w of face.walers) w.supports.forEach((s, i) => s.id = ['CONTACT-L', 'CONTACT-R'][i]);
  for (const t of definition.ties) for (const end of [t.a, t.b]) end.supportId = end.supportId === 'S1' ? 'CONTACT-L' : 'CONTACT-R';
  const layout = stampSideLayout(model, definition), pending = vi.fn(), apply = vi.fn(), topology = pairFaces(model.vertices, model.heightMm);
  const button = (text: string) => Array.from(host.querySelectorAll('button')).find(b => b.textContent === text)!;
  try {
    await act(async () => root.render(<SideLayoutEditor topology={topology} layout={layout} onApply={apply} onPendingChange={pending}/>));
    await act(async () => button('ตรวจแบบข้างและวิเคราะห์ร่างใหม่').click());
    expect(apply.mock.calls[0][0].faces[0].walers[0].supports[0].id).toBe('CONTACT-L');
    const field = Array.from(host.querySelectorAll('label')).find(l => l.textContent?.startsWith('หลักฐานแบบข้าง'))!.querySelector('input')!;
    await enter(field, 'unsaved evidence'); expect(pending).toHaveBeenLastCalledWith(true);
    await act(async () => root.render(<SideLayoutEditor topology={topology} layout={{...layout, revisionId: 'R-NEW'}} onApply={apply} onPendingChange={pending}/>));
    expect(field.value).toBe('unsaved evidence'); expect(pending).toHaveBeenLastCalledWith(true);
    await act(async () => button('คืนค่าแบบข้างที่นำไปใช้ล่าสุด').click());
    expect(field.value).toBe('SYNTHETIC side layout'); expect(pending).toHaveBeenLastCalledWith(false);
  } finally {await act(async () => root.unmount());}
});
it('authors a physical face with blank engineering defaults, analyzes and freezes it, then invalidates on pour-head edits', async () => {
  setup(); const host = document.createElement('div'), root = createRoot(host);
  const button = (text: string) => Array.from(host.querySelectorAll('button')).find(b => b.textContent === text)!;
  const fields = (scope: Element, prefix: string) => Array.from(scope.querySelectorAll('label')).filter(l => l.textContent?.startsWith(prefix)).map(l => l.querySelector('input')!);
  try {
    await act(async () => root.render(<WorkflowV07Panel input={{...defaults, gamma: 20, width: 1000, length: 1000, height: 1000, walerSpacing: 500}} caseId="SIDE-UI"/>));
    await choose(host.querySelector('select')!, 'BEAM');
    const faceSelect = Array.from(host.querySelectorAll('label')).find(l => l.textContent?.startsWith('ผิวจริงที่ต้องการ'))!.querySelector('select')!;
    await choose(faceSelect, 'F1'); await act(async () => button('เพิ่มผิวจริงในแบบข้าง').click());
    const face = host.querySelector('[aria-label="กำหนดแบบข้าง F1"]')!;
    expect(fields(face, 'E คร่าว')[0].value).toBe('');
    for (const [label, value] of [['Stage แบบข้าง', 'TEST-STAGE'], ['Load case แบบข้าง', 'TEST-SERVICE'], ['หลักฐานแบบข้าง', 'SYNTHETIC'], ['หัวคอนกรีตเหนือฐานแบบข้าง', '1000'], ['ระดับฐานคอนกรีตแบบข้าง', '2000']]) await enter(fields(host, label)[0], value);
    for (const [label, value] of [['หลักฐานผิว/สมาชิก', 'SYNTHETIC face'], ['คร่าว x', '0,250,500,750,1000'], ['E คร่าว', '200000'], ['I คร่าว', '1000000'], ['หลักฐานหน้าตัดและวัสดุคร่าว', 'SYNTHETIC'],
      ['E คานรัด', '200000'], ['I คานรัด', '1000000'], ['หลักฐานราง/แกน/วัสดุ', 'SYNTHETIC'], ['สัดส่วนแรงราง', '.6'], ['ไม้อัดหนาจริง', '12'], ['E ไม้อัด', '8000'], ['หลักฐานผลิตภัณฑ์', 'SYNTHETIC']]) await enter(fields(face, label)[0], value);
    const grain = Array.from(face.querySelectorAll('label')).find(l => l.textContent?.startsWith('ทิศเสี้ยน'))!.querySelector('select')!;
    const joints = Array.from(face.querySelectorAll('label')).find(l => l.textContent?.startsWith('รอยต่อไม้อัด'))!.querySelector('select')!;
    await choose(grain, 'ALONG_FACE'); await choose(joints, 'true');
    for (const input of fields(face, 'จุดรองรับคานรัด x')) await enter(input, '250,750');
    await enter(fields(face, 'ระดับคานรัด z')[0], '100'); await enter(fields(face, 'ระดับคานรัด z')[1], '900');
    // Incomplete pending soffit fields must not be discarded or silently omitted by side analysis.
    const soffitE = fields(host, 'E · MPa')[0]; await enter(soffitE, '190000');
    await act(async () => button('ตรวจแบบข้างและวิเคราะห์ร่างใหม่').click());
    expect(host.querySelector('[role="alert"]')).not.toBeNull();
    expect(soffitE.value).toBe('190000'); expect(button('สร้างรายการคำนวณและรูปคู่ด้านร่าง').disabled).toBe(true);
    await act(async () => button('คืนค่าแบบท้องที่นำไปใช้ล่าสุด').click());
    await act(async () => button('ตรวจแบบข้างและวิเคราะห์ร่างใหม่').click());
    expect(host.querySelector('[role="alert"]')?.textContent ?? '').toBe('');
    expect(host.textContent).toContain('แรงรวม 10 kN'); expect(host.textContent).toContain('PHYSICAL_SIDE_FACE_LAYOUT_MISSING');
    await act(async () => button('สร้างรายการคำนวณและรูปคู่ด้านร่าง').click());
    await vi.waitFor(() => expect(button('ดาวน์โหลดร่าง JSON').disabled).toBe(false));
    await enter(fields(host, 'หัวคอนกรีตเหนือฐานแบบข้าง')[0], '800');
    expect(button('ดาวน์โหลดร่าง JSON').disabled).toBe(true); expect(button('สร้างรายการคำนวณและรูปคู่ด้านร่าง').disabled).toBe(true);
    await act(async () => button('ตรวจแบบข้างและวิเคราะห์ร่างใหม่').click());
    expect(host.textContent).toContain('แรงรวม 6.4 kN'); expect(host.textContent).toContain('แรงดันฐาน 16 kPa');
    // Apply complete pending definitions of both systems atomically to one new revision.
    for (const [label, value] of [['ความหนาพื้น', '0'], ['Additional Dead Load', '0'], ['Construction Live Load', '0'], ['ความกว้างคาน b', '1000'],
      ['แถบคอนกรีต Bc', '1000'], ['แถบ DL', '1000'], ['แถบ LL', '1000'], ['ขั้นตอนเท/Stage', 'TEST-STAGE'], ['กรณีโหลด/Load case', 'TEST-SERVICE'],
      ['พื้นที่ที่รับผิดชอบโหลด', 'TEST-AREA'], ['หลักฐานตำแหน่งและโหลด', 'SYNTHETIC'], ['ตำแหน่งคร่าว X', '0,250,500,750,1000'],
      ['ปลายคร่าวเริ่ม Y', '0'], ['ปลายคร่าวสิ้นสุด Y', '1000'], ['ปลายคานรับเริ่ม X', '0'], ['ปลายคานรับสิ้นสุด X', '1000'], ['ระดับจุด U-head', '3000'], ['ระดับฐานร่วม', '0']]) await enter(fields(host, label)[0], value);
    await enter(fields(host, 'ตำแหน่งแนวคานรับ Y')[0], '0'); await enter(fields(host, 'ตำแหน่งแนวคานรับ Y')[1], '1000');
    for (const input of fields(host, 'ตำแหน่ง U-head X')) await enter(input, '0,1000');
    for (const [label, value] of [['E · MPa', '200000'], ['I แกนดัด', '1000000'], ['น้ำหนักตัวเอง', '0'], ['หลักฐานหน้าตัด/แกน', 'SYNTHETIC']]) for (const input of fields(host, label)) await enter(input, value);
    await enter(fields(host, 'หัวคอนกรีตเหนือฐานแบบข้าง')[0], '700');
    await act(async () => button('ตรวจแบบข้างและวิเคราะห์ร่างใหม่').click());
    expect(host.querySelector('[role="alert"]')?.textContent ?? '').toBe('');
    expect(host.textContent).toContain('โหลดรวม 20 kN'); expect(host.textContent).toContain('แรงรวม 4.9 kN');
    expect(button('สร้างรายการคำนวณและรูปคู่ด้านร่าง').disabled).toBe(false);
    expect(host.textContent).not.toContain('STALE_SIDE_LAYOUT_REANALYSIS_REQUIRED');
    expect(host.textContent).not.toContain('SOFFIT_LAYOUT_LOAD_OR_MEMBER_MAPPING_STALE');
  } finally {await act(async () => root.unmount());}
});
