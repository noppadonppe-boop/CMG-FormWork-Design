// @vitest-environment jsdom
import React, {act, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {renderToStaticMarkup} from 'react-dom/server';
import {webcrypto} from 'node:crypto';
import {TextEncoder} from 'node:util';
import {afterEach, expect, it, vi} from 'vitest';
import {TieDossierEditor} from '../src/components/TieDossier';
import {SideLayoutEditor} from '../src/components/SideLayoutEditor';
import WorkflowV07Panel, {WorkflowDocuments} from '../src/components/WorkflowV07Panel';
import {defaults} from '../src/domain';
import {copyTieProductTemplate, editTieProduct, effectiveTieProduct, tieDossierBinding, type TieDossier} from '../src/domain/workflowV07/tieDossier';
import {previewWorkflow, regenerateDraftLayouts} from '../src/domain/workflowV07/model';
import {stampSideLayout} from '../src/domain/workflowV07/sideLayout';
import {documentView, freezeDesign} from '../src/domain/workflowV07/snapshot';
import {tieDossierApplied, tieDossierFixture} from './fixtures/workflow-v07-tie-dossier';

afterEach(() => vi.unstubAllGlobals());
function setup() {vi.stubGlobal('crypto', webcrypto); vi.stubGlobal('TextEncoder', TextEncoder); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);}
const button = (scope: Element, text: string) => Array.from(scope.querySelectorAll('button')).find(b => b.textContent === text)!;
const field = (scope: Element, prefix: string) => Array.from(scope.querySelectorAll('label')).find(l => l.textContent?.startsWith(prefix))!;
const click = async (scope: Element, text: string) => act(async () => button(scope, text).click());
async function enter(input: HTMLInputElement, value: string) {await act(async () => {Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value); input.dispatchEvent(new Event('input', {bubbles: true}));});}
async function choose(select: HTMLSelectElement, value: string) {await act(async () => {select.value = value; select.dispatchEvent(new Event('change', {bubbles: true}));});}
const product = (scope: Element) => scope.querySelector('[aria-label="ผลิตภัณฑ์ INNER"]')!;

it('offers no stock capacity defaults, respects segmented topology and starts products/body/interfaces unknown', async () => {
  setup(); const host = document.createElement('div'), root = createRoot(host), m = tieDossierApplied(), context = previewWorkflow(m).side!.ties[0].dossier!.context, changed = vi.fn(), pending = vi.fn();
  function Editor({enabled}: {enabled: boolean}) {const [value, set] = useState<TieDossier | null>(null); return <TieDossierEditor value={value} legacy={null} enabled={enabled} tieId="SYN" slotPrefix="STABLE" revisionId="UI-R" onChange={d => {set(d); changed(d);}} onBindContext={() => context} onPendingChange={pending} templates={[]} onCopy={vi.fn()}/>;}
  try {
    await act(async () => root.render(<Editor enabled={false}/>)); expect(button(host, 'เริ่มทะเบียนชุด Inner/Outer ที่ระบุเอง').disabled).toBe(true); await act(async () => root.render(<Editor enabled={true}/>)); await click(host, 'เริ่มทะเบียนชุด Inner/Outer ที่ระบุเอง');
    expect(host.querySelectorAll('.tie-product-editor')).toHaveLength(13); expect(Array.from(host.querySelectorAll('input[type="number"]')).every(i => (i as HTMLInputElement).value === '')).toBe(true); expect(changed.mock.lastCall![0].components.every((c: {reference: {properties: object}}) => Object.values(c.reference.properties).every(v => v === null))).toBe(true);
    await click(host, 'ผูกทะเบียนกับพิกัดไทร์ที่กรอก'); expect(host.querySelector('[role="alert"]')?.textContent).toContain('Measured geometry');
    await enter(field(host, 'หลักฐาน Datum/ความยาว').querySelector('input')!, 'SYNTHETIC'); await click(host, 'ผูกทะเบียนกับพิกัดไทร์ที่กรอก'); expect(changed.mock.lastCall![0].boundGeometry).toBe(tieDossierBinding(changed.mock.lastCall![0], context));
    await click(host, 'เพิ่มช่วงก้านจริง'); await click(host, 'เพิ่มรอยต่อเกลียวจริง'); expect(changed.mock.lastCall![0].rodGauges[0].startMm).toBeNull(); expect(changed.mock.lastCall![0].threads[0].requiredEngagementMm).toBeNull();
  } finally {await act(async () => root.unmount());}
});
it('records Custom reason/evidence/declared actor/time/revision, preserves original values, locks original fields and retains explicit null', async () => {
  setup(); const host = document.createElement('div'), root = createRoot(host), changed = vi.fn(), pending = vi.fn();
  function Editor() {const [value, set] = useState<TieDossier | null>(tieDossierFixture()); return <TieDossierEditor value={value} legacy={null} enabled tieId="SYN" slotPrefix="STABLE" revisionId="UI-R1" onChange={d => {set(d); changed(d);}} onBindContext={vi.fn()} onPendingChange={pending} templates={[]} onCopy={vi.fn()}/>;}
  try {
    await act(async () => root.render(<Editor/>)); const p = product(host); await choose(field(p, 'คุณสมบัติ Custom').querySelector('select')!, 'capacityKN'); await enter(field(p, 'ค่า Custom ใหม่').querySelector('input')!, '.1');
    for (const [label, value] of [['เหตุผล Custom', 'SYNTHETIC sensitivity'], ['หลักฐาน Custom', 'SYNTHETIC source'], ['ชื่อผู้บันทึก', 'Declared author']]) await enter(field(p, label).querySelector('input')!, value);
    expect(pending.mock.lastCall![1]).toBe(true); await click(p, 'ใช้ Custom ของ INNER'); const c = changed.mock.lastCall![0].components[0]; expect(c.reference.properties.capacityKN).toBe(100); expect(effectiveTieProduct(c).properties.capacityKN).toBe(.1); expect(c.edits[0]).toMatchObject({before: 100, after: .1, actor: 'Declared author', revision: 'UI-R1'}); expect(c.edits[0].at).toMatch(/T.*Z$/); expect(field(p, 'ต้นฉบับ กำลังต่อแรง').querySelector('input')!.disabled).toBe(true);
    await choose(field(p, 'คุณสมบัติ Custom').querySelector('select')!, 'capacityKN'); for (const [label, value] of [['เหตุผล Custom', 'SYNTHETIC unknown'], ['หลักฐาน Custom', 'SYNTHETIC'], ['ชื่อผู้บันทึก', 'Declared author']]) await enter(field(p, label).querySelector('input')!, value); await click(p, 'ใช้ Custom ของ INNER'); expect(effectiveTieProduct(changed.mock.lastCall![0].components[0]).properties.capacityKN).toBeNull(); expect(changed.mock.lastCall![0].components[0].edits).toHaveLength(2);
  } finally {await act(async () => root.unmount());}
});
it('keeps hidden Custom buffers pending through restamps and unrelated fields returning to their original value, then cancels them explicitly', async () => {
  setup(); const host = document.createElement('div'), root = createRoot(host), m = tieDossierApplied(), pending = vi.fn(), draft = vi.fn(), apply = vi.fn(), topology = previewWorkflow(m).topology;
  const render = (revisionId: string) => root.render(<SideLayoutEditor layout={{...m.sideLayout!, revisionId}} topology={topology} segmentedTie revisionId="CURRENT-R" onApply={apply} onPendingChange={pending} onDraftChange={draft}/>);
  try {
    await act(async () => render(m.revisionId)); const p = product(host); await enter(field(p, 'เหตุผล Custom').querySelector('input')!, 'SYNTHETIC pending'); expect(pending).toHaveBeenLastCalledWith(true); expect(draft).toHaveBeenLastCalledWith(null);
    await act(async () => render('RESTAMP')); expect(field(product(host), 'เหตุผล Custom').querySelector('input')!.value).toBe('SYNTHETIC pending');
    await enter(field(host, 'หลักฐานแบบข้าง').querySelector('input')!, 'TEMP'); await enter(field(host, 'หลักฐานแบบข้าง').querySelector('input')!, m.sideLayout!.evidenceRef); expect(pending).toHaveBeenLastCalledWith(true); expect(draft).toHaveBeenLastCalledWith(null);
    await click(host, 'ตรวจแบบข้างและวิเคราะห์ร่างใหม่'); expect(apply).not.toHaveBeenCalled(); expect(host.querySelector('.side-editor [role="alert"]')?.textContent).toContain('Custom');
    await click(host, 'คืนค่าแบบข้างที่นำไปใช้ล่าสุด'); expect(field(product(host), 'เหตุผล Custom').querySelector('input')!.value).toBe(''); expect(pending).toHaveBeenLastCalledWith(false); expect(draft.mock.lastCall![0].ties[0].dossier.components[0].reference.properties.capacityKN).toBe(100);
    await click(host, 'ตรวจแบบข้างและวิเคราะห์ร่างใหม่'); expect(apply).toHaveBeenCalledOnce();
  } finally {await act(async () => root.unmount());}
});
it('keeps a Custom buffer attached to its stable tie row across ID changes and deletion of an earlier tie', async () => {
  setup(); const host = document.createElement('div'), root = createRoot(host), m = tieDossierApplied(), layout = structuredClone(m.sideLayout!), pending = vi.fn(); layout.ties[1].dossier = copyTieProductTemplate(layout.ties[0].dossier!);
  try {
    await act(async () => root.render(<SideLayoutEditor layout={layout} topology={previewWorkflow(m).topology} segmentedTie onApply={vi.fn()} onPendingChange={pending}/>));
    const second = host.querySelectorAll('.tie-dossier-editor')[1].parentElement!; await enter(field(product(second), 'เหตุผล Custom').querySelector('input')!, 'SECOND-TIE-ONLY'); await enter(field(second, 'รหัสไทร์').querySelector('input')!, 'RENAMED');
    expect(field(product(second), 'เหตุผล Custom').querySelector('input')!.value).toBe('SECOND-TIE-ONLY'); await click(host, `ลบไทร์ ${layout.ties[0].id}`);
    const remaining = host.querySelector('.tie-dossier-editor')!.parentElement!; expect(field(remaining, 'รหัสไทร์').querySelector('input')!.value).toBe('RENAMED'); expect(field(product(remaining), 'เหตุผล Custom').querySelector('input')!.value).toBe('SECOND-TIE-ONLY'); expect(pending).toHaveBeenLastCalledWith(true);
    await click(host, 'คืนค่าแบบข้างที่นำไปใช้ล่าสุด'); expect(pending).toHaveBeenLastCalledWith(false);
  } finally {await act(async () => root.unmount());}
});
it('copies product templates only by explicit action, resetting actual measurements rather than reusing a different tie installation', async () => {
  setup(); const host = document.createElement('div'), root = createRoot(host), source = tieDossierFixture(), copy = vi.fn();
  try {
    await act(async () => root.render(<TieDossierEditor value={null} legacy={null} enabled tieId="DEST" slotPrefix="DEST" revisionId="R" onChange={vi.fn()} onBindContext={vi.fn()} onPendingChange={vi.fn()} templates={[{id: 'SOURCE', dossier: source}]} onCopy={copy}/>));
    await choose(field(host, 'ข้อมูลสินค้าจากไทร์อื่น').querySelector('select')!, 'SOURCE'); expect(copy).not.toHaveBeenCalled(); await click(host, 'คัดลอกข้อมูลสินค้าและล้างค่าที่วัดหน้างาน'); const d = copy.mock.lastCall![0]; expect(d.components).toEqual(source.components); expect(d.boundGeometry).toBeNull(); expect(d.threads.every((j: {actualEngagementMm: number | null}) => j.actualEngagementMm === null)).toBe(true); expect(source.threads[0].actualEngagementMm).toBe(30);
  } finally {await act(async () => root.unmount());}
});
it('renders the same complete raw/effective/history/body/interface data and full N in report and drawing without approving a product', async () => {
  setup(); const m = tieDossierApplied(), layout = structuredClone(m.sideLayout!); layout.ties[0].dossier!.components[0] = editTieProduct(layout.ties[0].dossier!.components[0], {field: 'capacityKN', after: 200, reason: 'SYNTHETIC', evidenceRef: 'SYNTHETIC', actor: 'Declared author', at: '2026-10-15T00:00:00.000Z', revision: 'SYN-R'});
  const ready = regenerateDraftLayouts(m, {sideLayout: stampSideLayout(m, layout)}), view = await documentView(await freezeDesign(ready), ready), html = renderToStaticMarkup(<WorkflowDocuments view={view}/>);
  expect(html).toContain('ตัวชี้วัดยืดเฉพาะช่วงก้าน'); expect(html).toContain('INNER / SYN-INNER / CUSTOM'); expect(html).toContain('Declared author'); expect(html).toContain('ไม่ใช่ความยาวตัด'); expect(html).not.toMatch(/NaN|Infinity|undefined/); expect(html.match(new RegExp(view.snapshotHash, 'g'))).toHaveLength(2);
  const d = view.drawing.side!.ties[0].dossier!; expect(d.components[0].reference!.properties.capacityKN).toBe(100); expect(d.components[0].effective!.properties.capacityKN).toBe(200); expect(d.gauges).toHaveLength(3); expect(d.threads).toHaveLength(2); expect(d.assemblyMovementMm).toBeNull(); expect(view.constructionEligible).toBe(false);
});
it('blocks freeze/download and atomic case saves in the real panel for an unsubmitted nested Custom edit', async () => {
  setup(); const host = document.createElement('div'), root = createRoot(host);
  const fields = (scope: Element, prefix: string) => Array.from(scope.querySelectorAll('label')).filter(l => l.textContent?.startsWith(prefix)).map(l => l.querySelector('input')!);
  try {
    await act(async () => root.render(<WorkflowV07Panel input={{...defaults, width: 1000, length: 1000, height: 1000, gamma: 20, walerSpacing: 500}} caseId="TIE-PENDING"/>)); await choose(field(host, 'ระบบแบบข้าง').querySelector('select')!, 'SEGMENTED_TIE');
    for (const [label, value] of [['Stage แบบข้าง', 'TEST'], ['Load case แบบข้าง', 'SERVICE'], ['หลักฐานแบบข้าง', 'SYNTHETIC'], ['หัวคอนกรีตเหนือฐานแบบข้าง', '1000'], ['ระดับฐานคอนกรีตแบบข้าง', '2000']]) await enter(fields(host, label)[0], value);
    for (const id of ['F1', 'F3']) {
      await choose(field(host, 'ผิวจริงที่ต้องการ').querySelector('select')!, id); await click(host, 'เพิ่มผิวจริงในแบบข้าง'); const face = host.querySelector(`[aria-label="กำหนดแบบข้าง ${id}"]`)!;
      for (const [label, value] of [['หลักฐานผิว/สมาชิก', 'SYNTHETIC'], ['คร่าว x', '0,250,500,750,1000'], ['E คร่าว', '200000'], ['I คร่าว', '1000000'], ['หลักฐานหน้าตัดและวัสดุคร่าว', 'SYNTHETIC'], ['E คานรัด', '200000'], ['I คานรัด', '1000000'], ['หลักฐานราง/แกน/วัสดุ', 'SYNTHETIC'], ['สัดส่วนแรงราง', '.6'], ['ไม้อัดหนาจริง', '12'], ['E ไม้อัด', '8000'], ['หลักฐานผลิตภัณฑ์', 'SYNTHETIC']]) await enter(fields(face, label)[0], value);
      await choose(field(face, 'ทิศเสี้ยน').querySelector('select')!, 'ALONG_FACE'); await choose(field(face, 'รอยต่อไม้อัด').querySelector('select')!, 'true'); for (const f of fields(face, 'จุดรองรับคานรัด x')) await enter(f, '250,750'); await enter(fields(face, 'ระดับคานรัด z')[0], '100'); await enter(fields(face, 'ระดับคานรัด z')[1], '900');
    }
    await click(host, 'เพิ่มแนวไทร์จริง'); await choose(field(host, 'จุดรองรับปลาย A').querySelector('select')!, '["F1","W1","S1"]'); await choose(field(host, 'จุดรองรับปลาย B').querySelector('select')!, '["F3","W1","S2"]'); await enter(fields(host, 'เส้นผ่านศูนย์กลางกรอบภายนอกไทร์')[0], '16');
    await click(host, 'เริ่มทะเบียนชุด Inner/Outer ที่ระบุเอง'); await click(host, 'ตรวจแบบข้างและวิเคราะห์ร่างใหม่'); expect(host.querySelector('.side-editor [role="alert"]')).toBeNull(); await click(host, 'สร้างรายการคำนวณและรูปคู่ด้านร่าง'); await vi.waitFor(() => expect(button(host, 'ดาวน์โหลดร่าง JSON').disabled).toBe(false));
    const p = product(host); await enter(field(p, 'เหตุผล Custom').querySelector('input')!, 'SYNTHETIC unsaved'); expect(button(host, 'ดาวน์โหลดร่าง JSON').disabled).toBe(true); expect(button(host, 'สร้างรายการคำนวณและรูปคู่ด้านร่าง').disabled).toBe(true);
    await click(host, 'เก็บและวิเคราะห์ชุดกรณีโหลดร่าง'); expect(host.querySelector('.load-cases-editor [role="alert"]')?.textContent).toContain('ค้าง'); await click(host, 'ตรวจแบบข้างและวิเคราะห์ร่างใหม่'); expect(host.querySelector('.side-editor [role="alert"]')?.textContent).toContain('Custom');
    await click(p, 'ยกเลิกช่อง Custom ของ INNER'); expect(button(host, 'ดาวน์โหลดร่าง JSON').disabled).toBe(false);
  } finally {await act(async () => root.unmount());}
});
