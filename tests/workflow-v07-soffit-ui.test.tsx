// @vitest-environment jsdom
import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {renderToStaticMarkup} from 'react-dom/server';
import {webcrypto} from 'node:crypto';
import {TextEncoder} from 'node:util';
import {afterEach, expect, it, vi} from 'vitest';
import WorkflowV07Panel, {WorkflowDocuments} from '../src/components/WorkflowV07Panel';
import {SoffitLayoutEditor} from '../src/components/SoffitLayoutEditor';
import {defaults} from '../src/domain';
import {documentView, freezeDesign} from '../src/domain/workflowV07/snapshot';
import {builtModel, layoutFixture} from './fixtures/workflow-v07-soffit';

afterEach(() => vi.unstubAllGlobals());
function setup() {vi.stubGlobal('crypto', webcrypto); vi.stubGlobal('TextEncoder', TextEncoder); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);}
async function enter(input: HTMLInputElement, value: string) {
  await act(async () => {Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value); input.dispatchEvent(new Event('input', {bubbles: true}));});
}
it('snapshot report contains the actual head coordinates, individual reactions and load balance', async () => {
  setup(); const model = builtModel(), snapshot = await freezeDesign(model), view = await documentView(snapshot, model);
  const html = renderToStaticMarkup(<WorkflowDocuments view={view}/>);
  expect(html).toContain('B1:HEAD-2'); expect(html).toContain('7.0538'); expect(html).toContain('23.76');
  expect(html).toContain('ΣF·X'); expect(html).toContain('MISSING_CONFIGURATION_RATING');
  expect(html.match(new RegExp(snapshot.snapshotHash, 'g'))).toHaveLength(2);
});
it('editor preserves in-progress coordinates across unrelated revision renders and rejects empty list entries', async () => {
  setup(); const host = document.createElement('div'), root = createRoot(host), apply = vi.fn(), pending = vi.fn(), layout = layoutFixture();
  try {
    await act(async () => root.render(<SoffitLayoutEditor layout={layout} beam={false} onApply={apply} onPendingChange={pending}/>));
    const input = Array.from(host.querySelectorAll('label')).find(l => l.textContent?.startsWith('ตำแหน่งคร่าว X'))!.querySelector('input')!;
    await enter(input, '0,,2400'); expect(pending).toHaveBeenLastCalledWith(true);
    await act(async () => root.render(<SoffitLayoutEditor layout={structuredClone(layout)} beam={false} onApply={apply} onPendingChange={pending}/>));
    expect(input.value).toBe('0,,2400');
    await act(async () => Array.from(host.querySelectorAll('button')).find(b => b.textContent === 'ตรวจตำแหน่งและวิเคราะห์แรงแบบท้อง')!.click());
    expect(apply).not.toHaveBeenCalled(); expect(host.querySelector('[role="alert"]')?.textContent).toContain('รายการพิกัด');
  } finally {await act(async () => root.unmount());}
});
it('empty editor does not invent engineering defaults and pending edits immediately block report/export', async () => {
  setup(); const host = document.createElement('div'), root = createRoot(host);
  const button = (text: string) => Array.from(host.querySelectorAll('button')).find(b => b.textContent === text)!;
  try {
    await act(async () => root.render(<WorkflowV07Panel input={defaults} caseId="F1"/>));
    const select = host.querySelector('select')!;
    await act(async () => {select.value = 'SLAB'; select.dispatchEvent(new Event('change', {bubbles: true}));});
    expect(Array.from(host.querySelectorAll('label')).find(l => l.textContent?.startsWith('ขนาดแปลน Ringlock'))!.querySelector('select')!.value).toBe('1200x1500');
    const stiffness = Array.from(host.querySelectorAll('label')).find(l => l.textContent?.startsWith('E · MPa'))!.querySelector('input')!;
    expect(stiffness.value).toBe('');
    await act(async () => button('สร้างรายการคำนวณและรูปคู่ด้านร่าง').click());
    await vi.waitFor(() => expect(button('ดาวน์โหลดร่าง JSON').disabled).toBe(false));
    await enter(stiffness, '200000');
    expect(button('สร้างรายการคำนวณและรูปคู่ด้านร่าง').disabled).toBe(true);
    expect(button('ดาวน์โหลดร่าง JSON').disabled).toBe(true);
    await act(async () => button('ตรวจตำแหน่งและวิเคราะห์แรงแบบท้อง').click());
    expect(host.querySelector('[role="alert"]')).not.toBeNull();
    expect(button('ดาวน์โหลดร่าง JSON').disabled).toBe(true);
  } finally {await act(async () => root.unmount());}
});
it('authors an actual soffit candidate through fields, freezes it, then invalidates it after a load edit', async () => {
  setup(); const host = document.createElement('div'), root = createRoot(host);
  const button = (text: string) => Array.from(host.querySelectorAll('button')).find(b => b.textContent === text)!;
  const inputs = (prefix: string) => Array.from(host.querySelectorAll('label')).filter(l => l.textContent?.startsWith(prefix)).map(l => l.querySelector('input')!);
  try {
    await act(async () => root.render(<WorkflowV07Panel input={{...defaults, width: 2400, length: 1500, height: 150, walerSpacing: 150}} caseId="S1"/>));
    const select = host.querySelector('select')!;
    await act(async () => {select.value = 'SLAB'; select.dispatchEvent(new Event('change', {bubbles: true}));});
    for (const [prefix, value] of [['ความหนาพื้น', '150'], ['Additional Dead Load', '.5'], ['Construction Live Load', '2.5'],
      ['ขั้นตอนเท/Stage', 'TEST-STAGE'], ['กรณีโหลด/Load case', 'TEST-LOAD'], ['พื้นที่ที่รับผิดชอบโหลด', 'TEST-AREA'], ['หลักฐานตำแหน่งและโหลด', 'SYNTHETIC test'],
      ['ตำแหน่งคร่าว X', '0,600,1200,1800,2400'], ['ปลายคร่าวเริ่ม Y', '0'], ['ปลายคร่าวสิ้นสุด Y', '1500'],
      ['ปลายคานรับเริ่ม X', '0'], ['ปลายคานรับสิ้นสุด X', '2400'], ['ระดับจุด U-head', '3000'], ['ระดับฐานร่วม', '0']]) await enter(inputs(prefix)[0], value);
    await enter(inputs('ตำแหน่งแนวคานรับ Y')[0], '0'); await enter(inputs('ตำแหน่งแนวคานรับ Y')[1], '1500');
    for (const input of inputs('ตำแหน่ง U-head X')) await enter(input, '0,1200,2400');
    for (const [prefix, value] of [['E · MPa', '200000'], ['I แกนดัด', '1000000'], ['น้ำหนักตัวเอง', '0'], ['หลักฐานหน้าตัด/แกน', 'SYNTHETIC stiffness']]) for (const input of inputs(prefix)) await enter(input, value);
    await act(async () => button('ตรวจตำแหน่งและวิเคราะห์แรงแบบท้อง').click());
    expect(host.querySelector('[role="alert"]')?.textContent ?? '').toBe('');
    expect(host.textContent).toContain('7.0538'); expect(host.textContent).toContain('23.76');
    expect(button('สร้างรายการคำนวณและรูปคู่ด้านร่าง').disabled).toBe(false);
    await act(async () => button('สร้างรายการคำนวณและรูปคู่ด้านร่าง').click());
    await vi.waitFor(() => expect(button('ดาวน์โหลดร่าง JSON').disabled).toBe(false));
    const report = host.querySelector('[data-testid="report-snapshot-hash"]')!, drawing = host.querySelector('[data-testid="drawing-snapshot-hash"]')!;
    expect(report.textContent).toBe(drawing.textContent);
    await enter(inputs('Construction Live Load')[0], '3');
    expect(button('ดาวน์โหลดร่าง JSON').disabled).toBe(true);
    expect(host.textContent).toContain('SOFFIT_LAYOUT_LOAD_OR_MEMBER_MAPPING_STALE');
    // Explicit regeneration is required; the previous graph is never silently rebased.
    await act(async () => button('ตรวจตำแหน่งและวิเคราะห์แรงแบบท้อง').click());
    expect(host.textContent).toContain('25.56');
  } finally {await act(async () => root.unmount());}
});
it('selects updated Ringlock references explicitly and clears incompatible choices on product group change', async () => {
  setup(); const host = document.createElement('div'), root = createRoot(host);
  const select = (label: string) => Array.from(host.querySelectorAll('label')).find(l => l.textContent?.startsWith(label))!.querySelector('select')!;
  const choose = async (label: string, value: string) => act(async () => {const s = select(label); s.value = value; s.dispatchEvent(new Event('change', {bubbles: true}));});
  try {
    await act(async () => root.render(<WorkflowV07Panel input={defaults} caseId="R-REF"/>));
    await choose('ประเภทองค์อาคาร', 'BEAM');
    await choose('กลุ่มสินค้าอ้างอิง Ringlock', 'TCB-FOOT-BASED-REFERENCE');
    await choose('หน้าที่ชิ้นส่วน Ringlock', 'STANDARD');
    expect(select('เกรดวัสดุอ้างอิงสำหรับสมมติฐาน').value).toBe('');
    expect(select('หน้าตัดท่อตามกลุ่มสินค้าและหน้าที่').value).toBe('');
    await choose('หน้าตัดท่อตามกลุ่มสินค้าและหน้าที่', 'CHS-48.3x3.2');
    await choose('เกรดวัสดุอ้างอิงสำหรับสมมติฐาน', 'Q355B');
    expect(host.textContent).toContain('115,856.5021');
    expect(host.textContent).toContain('REFERENCE_PRODUCT_MODULE_DOES_NOT_MATCH_SELECTED_PLAN');
    expect(host.textContent).toContain('PROJECT_BRACE_END_NODE_STIFFNESS_AND_RESISTANCE_REQUIRED');
    await act(async () => Array.from(host.querySelectorAll('button')).find(b => b.textContent === 'สร้างรายการคำนวณและรูปคู่ด้านร่าง')!.click());
    await vi.waitFor(() => expect(host.querySelector('[data-testid="report-snapshot-hash"]')).not.toBeNull());
    const report = host.querySelector('.workflow-v07-documents')!;
    expect(report.textContent).toContain('TCB-FOOT-BASED-REFERENCE'); expect(report.textContent).toContain('355 MPa');
    await choose('กลุ่มสินค้าอ้างอิง Ringlock', 'TNV-METRIC-REFERENCE');
    await choose('หน้าที่ชิ้นส่วน Ringlock', 'STANDARD');
    expect(select('หน้าตัดท่อตามกลุ่มสินค้าและหน้าที่').options).toHaveLength(1);
    expect(select('เกรดวัสดุอ้างอิงสำหรับสมมติฐาน').value).toBe('');
    expect(Array.from(host.querySelectorAll('button')).find(b => b.textContent === 'ดาวน์โหลดร่าง JSON')!.disabled).toBe(true);
  } finally {await act(async () => root.unmount());}
});
