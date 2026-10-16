// @vitest-environment jsdom
import React, {act, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {renderToStaticMarkup} from 'react-dom/server';
import {webcrypto} from 'node:crypto';
import {TextEncoder} from 'node:util';
import {afterEach, expect, it, vi} from 'vitest';
import {SpatialLoadingEditor} from '../src/components/SpatialLoading';
import {SoffitLayoutEditor} from '../src/components/SoffitLayoutEditor';
import {SoffitResults} from '../src/components/SoffitResults';
import WorkflowV07Panel, {WorkflowDocuments} from '../src/components/WorkflowV07Panel';
import {defaults} from '../src/domain';
import {previewWorkflow} from '../src/domain/workflowV07/model';
import type {SpatialLoading} from '../src/domain/workflowV07/spatialLoads';
import {documentView, freezeDesign} from '../src/domain/workflowV07/snapshot';
import {spatialApplied} from './fixtures/workflow-v07-spatial-loads';

afterEach(() => vi.unstubAllGlobals());
function setup() {vi.stubGlobal('crypto', webcrypto); vi.stubGlobal('TextEncoder', TextEncoder); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);}
const button = (scope: Element, text: string) => Array.from(scope.querySelectorAll('button')).find(b => b.textContent === text)!;
const field = (scope: Element, prefix: string) => Array.from(scope.querySelectorAll('label')).find(l => l.textContent?.startsWith(prefix))!;
const click = async (scope: Element, text: string) => act(async () => button(scope, text).click());
async function enter(input: HTMLInputElement, value: string) {await act(async () => {Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value); input.dispatchEvent(new Event('input', {bubbles: true}));});}
async function choose(select: HTMLSelectElement, value: string) {await act(async () => {select.value = value; select.dispatchEvent(new Event('change', {bubbles: true}));});}

it('starts spatial scope, depths, pressures, target/magnitude/ownership/application line unknown and clears incompatible fields when load shapes change', async () => {
  setup(); const host = document.createElement('div'), root = createRoot(host), changed = vi.fn();
  function Editor() {const [value, set] = useState<SpatialLoading | null>(null); return <SpatialLoadingEditor value={value} onChange={v => {set(v); changed(v);}} memberIds={['JOIST-1', 'B1']}/>;}
  try {
    await act(async () => root.render(<Editor/>)); await click(host, 'เริ่มระบุพื้นที่ลงโหลดของ Stage'); expect(changed.mock.lastCall![0].surfaceScope).toBeNull();
    await click(host, 'เพิ่มพื้นที่โหลด'); expect(changed.mock.lastCall![0].regions[0].x0).toBeNull();
    await choose(field(host, 'หมวดพื้นที่โหลด').querySelector('select')!, 'CONCRETE'); expect(field(host, 'ความลึกคอนกรีตที่ลงจริง').querySelector('input')!.value).toBe('');
    await enter(field(host, 'ความลึกคอนกรีตที่ลงจริง').querySelector('input')!, '100'); await choose(field(host, 'หมวดพื้นที่โหลด').querySelector('select')!, 'PLACEMENT');
    expect(changed.mock.lastCall![0].regions[0].placedDepthMm).toBeNull(); expect(field(host, 'แรงดันลงแนวดิ่งเพิ่มเติม').querySelector('input')!.value).toBe('');
    await click(host, 'เพิ่มโหลดลงสมาชิกโดยตรง'); const direct = host.querySelector('.direct-member-action')!;
    expect(field(direct, 'แนววางแรง').querySelector('select')!.value).toBe(''); expect(field(direct, 'โหลดนี้แยก').querySelector('select')!.value).toBe('');
    await choose(field(direct, 'รูปแบบโหลดลงสมาชิก').querySelector('select')!, 'POINT'); await enter(field(direct, 'แรงจุดลงแนวดิ่ง').querySelector('input')!, '1000');
    await choose(field(direct, 'รูปแบบโหลดลงสมาชิก').querySelector('select')!, 'LINE'); expect(changed.mock.lastCall![0].memberActions[0].forceN).toBeNull(); expect(field(direct, 'โหลดเส้นลงแนวดิ่ง').querySelector('input')!.value).toBe('');
    await choose(field(direct, 'สมาชิกที่รับโดยตรง').querySelector('select')!, 'B1'); await choose(field(direct, 'แนววางแรง').querySelector('select')!, 'MEMBER_ANALYSIS_LINE');
    expect(changed.mock.lastCall![0].memberActions[0].targetMemberId).toBe('B1'); expect(changed.mock.lastCall![0].memberActions[0].applicationLine).toBe('MEMBER_ANALYSIS_LINE');
    await click(host, 'กลับใช้โหลดเต็มแถบที่ระบุ'); expect(changed).toHaveBeenLastCalledWith(null);
  } finally {await act(async () => root.unmount());}
});
it('preserves spatial form edits through source-only rerenders, applies all values atomically with the physical layout and restores on cancel', async () => {
  setup(); const host = document.createElement('div'), root = createRoot(host), m = spatialApplied(), apply = vi.fn(), pending = vi.fn(), draft = vi.fn();
  const render = () => root.render(<SoffitLayoutEditor layout={structuredClone(m.soffitLayout!)} beam={false} onApply={apply} onPendingChange={pending} onDraftChange={draft}/>);
  try {
    await act(async () => render()); const first = host.querySelector('.surface-region')!; await enter(field(first, 'X1 ของพื้นที่').querySelector('input')!, '900');
    await enter(field(host, 'หลักฐานพื้นที่ที่ไม่มีโหลด').querySelector('input')!, 'SYNTHETIC pending footprint'); expect(pending).toHaveBeenLastCalledWith(true);
    await act(async () => render()); expect(field(first, 'X1 ของพื้นที่').querySelector('input')!.value).toBe('900');
    await click(host, 'ตรวจตำแหน่งและวิเคราะห์แรงแบบท้อง'); const saved = apply.mock.lastCall![0]; expect(saved.loading.regions[0].x1).toBe(900); expect(saved.loading.omittedAreasEvidenceRef).toBe('SYNTHETIC pending footprint'); expect(saved.loading.memberActions).toEqual(m.soffitLayout!.loading!.memberActions);
    expect(draft.mock.lastCall![0].loading.regions[0].x1).toBe(900); await click(host, 'คืนค่าแบบท้องที่นำไปใช้ล่าสุด'); expect(field(host.querySelector('.surface-region')!, 'X1 ของพื้นที่').querySelector('input')!.value).toBe('1200'); expect(pending).toHaveBeenLastCalledWith(false);
  } finally {await act(async () => root.unmount());}
});
it('shows actual region/point/line source data and whole-patch analysis in the frozen report/drawing without presenting a mean pressure as a uniform analysis', async () => {
  setup(); const m = spatialApplied(), p = previewWorkflow(m), view = await documentView(await freezeDesign(m), m), html = renderToStaticMarkup(<WorkflowDocuments view={view}/>);
  const result = renderToStaticMarkup(<SoffitResults model={m} preview={p}/>); expect(result).toContain('19.48'); expect(result).toContain('พื้นที่และโหลดเฉพาะของ Stage'); expect(result).toContain('JOIST-3 / POINT / 300'); expect(result).toContain('B2 / LINE / 600–1,800');
  expect(result).toContain('Patch ของแต่ละแหล่งโดยตรง'); expect(result).toContain('q เฉลี่ยแสดงภาพ'); expect(result).toContain('REGION:C: X'); expect(result).not.toMatch(/NaN|Infinity|undefined/);
  expect(html.match(new RegExp(view.snapshotHash, 'g'))).toHaveLength(2); expect(view.report.model.soffitLayout!.loading!.regions[0].x1).toBe(1200); expect(view.drawing.analyses.find(a => a.id === 'JOIST-3')!.input.points[0].forceN).toBe(1000); expect(view.constructionEligible).toBe(false);
});
it('blocks freeze/download, case/stage capture and context changes while spatial inputs are pending in the real panel', async () => {
  setup(); const host = document.createElement('div'), root = createRoot(host);
  try {
    await act(async () => root.render(<WorkflowV07Panel input={defaults} caseId="SPATIAL-PENDING"/>)); await choose(field(host, 'ประเภทองค์อาคาร').querySelector('select')!, 'SLAB');
    await click(host, 'สร้างรายการคำนวณและรูปคู่ด้านร่าง'); await vi.waitFor(() => expect(button(host, 'ดาวน์โหลดร่าง JSON').disabled).toBe(false));
    await click(host, 'เริ่มระบุพื้นที่ลงโหลดของ Stage'); expect(button(host, 'สร้างรายการคำนวณและรูปคู่ด้านร่าง').disabled).toBe(true); expect(button(host, 'ดาวน์โหลดร่าง JSON').disabled).toBe(true);
    await click(host, 'เก็บและวิเคราะห์ชุดกรณีโหลดร่าง'); expect(host.querySelector('.load-cases-editor [role="alert"]')?.textContent).toContain('ค้าง');
    await click(host, 'เพิ่มข้อมูล Stage'); await click(host, 'เก็บข้อมูลหน้าจอปัจจุบันลง Stage 1'); expect(host.querySelector('.stage-study-editor [role="alert"]')?.textContent).toContain('ค้าง');
    await click(host, 'คืนค่าชุด Stage ที่เก็บไว้'); await click(host, 'คืนค่าแบบท้องที่นำไปใช้ล่าสุด'); expect(button(host, 'ดาวน์โหลดร่าง JSON').disabled).toBe(false);
  } finally {await act(async () => root.unmount());}
});
