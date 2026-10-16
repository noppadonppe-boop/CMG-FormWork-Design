// @vitest-environment jsdom
import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {renderToStaticMarkup} from 'react-dom/server';
import {webcrypto} from 'node:crypto';
import {TextEncoder} from 'node:util';
import {afterEach, expect, it, vi} from 'vitest';
import {SupportLayoutEditor} from '../src/components/SupportLayoutEditor';
import {SupportResults} from '../src/components/SupportResults';
import WorkflowV07Panel, {WorkflowDocuments} from '../src/components/WorkflowV07Panel';
import * as models from '../src/domain/workflowV07/model';
import {captureSupportLayout, stampSupportLayout, type SupportLayoutDefinition} from '../src/domain/workflowV07/supportLayout';
import {documentView, freezeDesign} from '../src/domain/workflowV07/snapshot';
import {defaults} from '../src/domain';
import {frameApplied} from './fixtures/workflow-v07-frame-workflow';
import {supportApplied, supportFixture} from './fixtures/workflow-v07-support';

afterEach(() => {vi.restoreAllMocks(); vi.unstubAllGlobals();});
function setup() {vi.stubGlobal('crypto', webcrypto); vi.stubGlobal('TextEncoder', TextEncoder); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);}
const button = (s: Element, text: string) => Array.from(s.querySelectorAll('button')).find(b => b.textContent === text)!;
const field = (s: Element, text: string) => Array.from(s.querySelectorAll('label')).find(l => l.textContent?.startsWith(text))!;
async function click(s: Element, text: string) {await act(async () => button(s, text).click());}
async function choose(s: Element, text: string, v: string) {await act(async () => {const input = field(s, text).querySelector('select')!; input.value = v; input.dispatchEvent(new Event('change', {bubbles: true}));});}
async function enter(s: Element, text: string, v: string) {await act(async () => {const input = field(s, text).querySelector('input')!; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, v); input.dispatchEvent(new Event('input', {bubbles: true}));});}
it('captures unknown support data and keeps each interface property null until explicitly entered', async () => {
  setup(); const m = frameApplied(), host = document.createElement('div'), root = createRoot(host), apply = vi.fn(), change = vi.fn(), pending = vi.fn();
  try {
    await act(async () => root.render(<SupportLayoutEditor layout={null} baseIds={m.frameLayout!.nodes.filter(n => n.role === 'BASE').map(n => n.id)} frameWeightOwners={[]} captureEnabled onCapture={() => captureSupportLayout(m, models.previewWorkflow(m).frame!)} onApply={apply} onPendingChange={pending} onDraftChange={change}/>));
    await click(host, 'เริ่มรายการฐานจากผลเฟรมปัจจุบัน'); expect(host.querySelectorAll('.support-base-editor')).toHaveLength(6);
    const base = host.querySelector('.support-base-editor')!; await choose(base, 'ทางถ่ายแรงใต้ Footplate', 'SOLE_BOARD');
    expect(host.querySelectorAll('.support-contact-editor')).toHaveLength(2); const last = change.mock.lastCall![0] as SupportLayoutDefinition;
    expect(last.bases[0].soleBoardThicknessMm).toBeNull(); expect(last.bases[0].interfaces.every(c => c.lengthXMm === null && c.weight.rawForceN === null && c.centerMm.every(n => n === null) && c.soilSpringNPerMm3 === null && c.declaredPressureLimitMPa === null)).toBe(true);
    await click(host, 'เก็บข้อมูลและวิเคราะห์ทางถ่ายแรงฐานร่าง'); expect(apply.mock.lastCall![0]).toEqual(last); expect(pending).toHaveBeenCalledWith(true);
  } finally {await act(async () => root.unmount());}
});
it('converts entered kPa to MPa once, preserves pending data across stamp-only updates and restores latest applied data', async () => {
  setup(); const {model, definition} = supportFixture(), host = document.createElement('div'), root = createRoot(host), change = vi.fn(), pending = vi.fn(), apply = vi.fn(), capture = vi.fn();
  const props = {baseIds: [], frameWeightOwners: [], captureEnabled: false, onCapture: capture, onApply: apply, onPendingChange: pending, onDraftChange: change};
  try {
    await act(async () => root.render(<SupportLayoutEditor {...props} layout={stampSupportLayout(model, definition)}/>));
    const contact = host.querySelector('.support-contact-editor')!; await enter(contact, 'ขีดจำกัดความดันที่ระบุ', '150');
    expect(change.mock.lastCall![0].bases[0].interfaces[0].declaredPressureLimitMPa).toBe(.15);
    await act(async () => root.render(<SupportLayoutEditor {...props} layout={{...stampSupportLayout(model, definition), revisionId: 'OTHER-STAMP'}}/>));
    expect(field(contact, 'ขีดจำกัดความดันที่ระบุ').querySelector<HTMLInputElement>('input')!.value).toBe('150'); expect(pending).toHaveBeenLastCalledWith(true);
    await click(host, 'คืนค่ารองรับที่นำไปใช้ล่าสุด'); expect(field(host.querySelector('.support-contact-editor')!, 'ขีดจำกัดความดันที่ระบุ').querySelector<HTMLInputElement>('input')!.value).toBe(''); expect(pending).toHaveBeenLastCalledWith(false);
  } finally {await act(async () => root.unmount());}
});
it('blocks freeze and candidate requests while support edits are pending, and applies them atomically with frame edits', async () => {
  setup(); const m = supportApplied(); vi.spyOn(models, 'fromLegacy').mockReturnValue(m);
  const host = document.createElement('div'), root = createRoot(host);
  try {
    await act(async () => root.render(<WorkflowV07Panel input={defaults} caseId="support-ui"/>));
    const support = host.querySelector('.support-layout-editor')!; await enter(support, 'หลักฐานขอบเขตทางถ่ายแรงสู่พื้นรองรับ', 'SYNTHETIC edited support scope');
    expect(button(host, 'สร้างรายการคำนวณและรูปคู่ด้านร่าง').disabled).toBe(true);
    expect(button(host, 'สร้างคำขอข้อเสนอพิกัดจากร่างปัจจุบัน').disabled).toBe(true);
    expect(button(host, 'เริ่มจุดหัว/ฐานจากแบบท้องที่วิเคราะห์แล้ว').disabled).toBe(true);
    await click(host, 'เก็บข้อมูลและวิเคราะห์เฟรมร่าง'); expect(button(host, 'สร้างรายการคำนวณและรูปคู่ด้านร่าง').disabled, host.querySelector('[role="alert"]')?.textContent).toBe(false);
    expect(field(support, 'หลักฐานขอบเขตทางถ่ายแรงสู่พื้นรองรับ').querySelector<HTMLInputElement>('input')!.value).toBe('SYNTHETIC edited support scope');
    await click(host, 'สร้างรายการคำนวณและรูปคู่ด้านร่าง'); await vi.waitFor(() => expect(host.querySelector('[aria-label="รายการคำนวณและแบบจาก Snapshot เดียวกัน"]')).not.toBeNull());
    expect(host.textContent).toContain('DRAFT / NO_GO'); expect(host.textContent).toContain('การทรุดตัว UNKNOWN');
  } finally {await act(async () => root.unmount());}
});
it('renders both serial contact results from a common snapshot and labels absent basis as unknown without NaN/Infinity', async () => {
  setup(); const m = supportApplied(true), p = models.previewWorkflow(m), view = await documentView(await freezeDesign(m), m);
  const text = renderToStaticMarkup(<WorkflowDocuments view={view}/>), result = renderToStaticMarkup(<SupportResults model={m} preview={p}/>);
  expect(text).toContain('ผลผิวสัมผัส SUP-1/UPPER'); expect(text).toContain('ผลผิวสัมผัส SUP-1/LOWER'); expect(text).toContain(view.snapshotHash);
  expect(result).toContain('ความต้องการ H/N'); expect(result).toContain('การทรุดตัว UNKNOWN'); expect(result).toContain('NO_GO'); expect(result).not.toMatch(/NaN|Infinity/);
});
