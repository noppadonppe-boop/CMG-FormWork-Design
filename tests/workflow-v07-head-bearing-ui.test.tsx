// @vitest-environment jsdom
import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {renderToStaticMarkup} from 'react-dom/server';
import {webcrypto} from 'node:crypto';
import {TextEncoder} from 'node:util';
import {afterEach, expect, it, vi} from 'vitest';
import {HeadBearingFields} from '../src/components/HeadBearing';
import WorkflowV07Panel, {WorkflowDocuments} from '../src/components/WorkflowV07Panel';
import * as models from '../src/domain/workflowV07/model';
import {documentView, freezeDesign} from '../src/domain/workflowV07/snapshot';
import {emptyHeadBearing, type HeadBearingDefinition} from '../src/domain/workflowV07/headBearing';
import {defaults} from '../src/domain';
import {headBearingApplied} from './fixtures/workflow-v07-head-bearing';

afterEach(() => {vi.restoreAllMocks(); vi.unstubAllGlobals();});
function setup() {vi.stubGlobal('crypto', webcrypto); vi.stubGlobal('TextEncoder', TextEncoder); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);}
const button = (s: Element, label: string) => Array.from(s.querySelectorAll('button')).find(b => b.textContent === label)!;
const field = (s: Element, label: string) => Array.from(s.querySelectorAll('label')).find(l => l.textContent?.startsWith(label))!;
async function enter(s: Element, label: string, value: string) {await act(async () => {const input = field(s, label).querySelector('input')!; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value); input.dispatchEvent(new Event('input', {bubbles: true}));});}
async function click(s: Element, label: string) {await act(async () => button(s, label).click());}
it('starts a head-seat draft with no dimensions, material assumptions, forces, capacity or default orientation', async () => {
  setup(); const host = document.createElement('div'), root = createRoot(host), change = vi.fn();
  try {await act(async () => root.render(<HeadBearingFields value={null} onChange={change}/>)); await click(host, 'เพิ่มข้อมูลผิวรับคานบน U-head');
    expect(change).toHaveBeenLastCalledWith(emptyHeadBearing());
    await act(async () => root.render(<HeadBearingFields value={change.mock.lastCall![0]} onChange={change}/>));
    expect(Array.from(host.querySelectorAll<HTMLInputElement>('input[type="number"]')).every(i => i.value === '')).toBe(true);
    expect(host.textContent).toContain('ไม่มีเกณฑ์กำลังหรือระยะเผื่อสำเร็จรูป');
  } finally {await act(async () => root.unmount());}
});
it('keeps explicitly entered zero clearance distinct from missing data and supports an explicit clear', async () => {
  setup(); const host = document.createElement('div'), root = createRoot(host); let draft: HeadBearingDefinition | null = emptyHeadBearing();
  const change = (next: HeadBearingDefinition | null) => {draft = next; root.render(<HeadBearingFields value={next} onChange={change}/>);};
  try {await act(async () => root.render(<HeadBearingFields value={draft} onChange={change}/>));
    await enter(host, 'ระยะเผื่อข้างที่ระบุแต่ละด้าน', '0'); expect(draft!.minimumSideClearanceMm).toBe(0);
    await enter(host, 'ศูนย์ช่องหัวเยื้องจากศูนย์แผ่น', '0'); expect(draft!.cavityOffsetYMm).toBe(0); expect(draft!.seatLocalX).toEqual([null, null]);
    await enter(host, 'ระยะเผื่อข้างที่ระบุแต่ละด้าน', ''); expect(draft!.minimumSideClearanceMm).toBeNull();
    await click(host, 'ล้างข้อมูลผิวรับหัวนี้'); expect(draft).toBeNull();
  } finally {await act(async () => root.unmount());}
});
it('makes head-seat edits pending in the real assembly editor and includes them in an atomic frame reanalysis', async () => {
  setup(); const m = headBearingApplied(); vi.spyOn(models, 'fromLegacy').mockReturnValue(m); const host = document.createElement('div'), root = createRoot(host);
  try {await act(async () => root.render(<WorkflowV07Panel input={defaults} caseId="HEAD-UI" initialElementType="SLAB"/>));
    const head = host.querySelector('.head-bearing-editor')!; await enter(head, 'ระยะเผื่อข้างที่ระบุแต่ละด้าน', '9');
    expect(button(host, 'สร้างรายการคำนวณและรูปคู่ด้านร่าง').disabled).toBe(true); expect(button(host, 'สร้างคำขอข้อเสนอพิกัดจากร่างปัจจุบัน').disabled).toBe(true);
    await click(host, 'เก็บข้อมูลและวิเคราะห์เฟรมร่าง'); expect(button(host, 'สร้างรายการคำนวณและรูปคู่ด้านร่าง').disabled, host.querySelector('[role="alert"]')?.textContent).toBe(false);
    expect(field(host.querySelector('.head-bearing-editor')!, 'ระยะเผื่อข้างที่ระบุแต่ละด้าน').querySelector<HTMLInputElement>('input')!.value).toBe('9');
    await click(host, 'สร้างรายการคำนวณและรูปคู่ด้านร่าง'); await vi.waitFor(() => expect(host.querySelector('[aria-label="รายการคำนวณและแบบจาก Snapshot เดียวกัน"]')).not.toBeNull());
    expect(host.querySelector('[aria-label="รายการคำนวณและแบบจาก Snapshot เดียวกัน"]')!.textContent).toContain('ต้องการแต่ละข้าง 9 mm');
  } finally {await act(async () => root.unmount());}
});
it('renders all actual head fits and conditional pressures in the common frozen report with explicit limitations', async () => {
  setup(); const m = headBearingApplied(), frozen = await freezeDesign(m), view = await documentView(frozen, m), markup = renderToStaticMarkup(<WorkflowDocuments view={view}/>);
  const host = document.createElement('div'); host.innerHTML = markup;
  const heads = host.querySelector('[aria-label="ผลช่องหัวและแรงสัมผัส U-head จากฉบับร่าง"]')!;
  expect(heads.querySelectorAll('.head-bearing-result')).toHaveLength(6); expect(heads.textContent).toContain('ช่องเหลือซ้าย/ขวา 20 / 20 mm'); expect(heads.textContent).toContain('q สูงสุด 705.375 kPa');
  expect(heads.textContent).toContain('ยังไม่ใช่แรงรวมทั้งหมดของ Head Jack'); expect(heads.textContent).toContain('NO_GO'); expect(markup).toContain(view.snapshotHash); expect(markup).not.toMatch(/NaN|Infinity/);
});
