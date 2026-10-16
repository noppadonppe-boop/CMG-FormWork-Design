// @vitest-environment jsdom
import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {webcrypto} from 'node:crypto';
import {TextEncoder} from 'node:util';
import {afterEach, expect, it, vi} from 'vitest';
import WorkflowV07Panel from '../src/components/WorkflowV07Panel';
import {defaults} from '../src/domain';

afterEach(() => vi.unstubAllGlobals());
function setup() {vi.stubGlobal('crypto', webcrypto); vi.stubGlobal('TextEncoder', TextEncoder); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);}
const button = (scope: Element, text: string) => Array.from(scope.querySelectorAll('button')).find(b => b.textContent === text)!;
const field = (scope: Element, prefix: string) => Array.from(scope.querySelectorAll('label')).find(l => l.textContent?.startsWith(prefix))!;
const custom = (host: Element, slot: string) => host.querySelector(`[aria-label="ข้อมูลอ้างอิง ${slot}"]`)!;
const click = async (scope: Element, text: string) => act(async () => button(scope, text).click());
async function enter(input: HTMLInputElement, value: string) {await act(async () => {Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value); input.dispatchEvent(new Event('input', {bubbles: true}));});}
async function choose(select: HTMLSelectElement, value: string) {await act(async () => {select.value = value; select.dispatchEvent(new Event('change', {bubbles: true}));});}
const set = async (scope: Element, prefix: string, value: string) => enter(field(scope, prefix).querySelector('input')!, value);
const pick = async (scope: Element, prefix: string, value: string) => choose(field(scope, prefix).querySelector('select')!, value);
const hash = (host: Element) => host.querySelector('[data-testid="report-snapshot-hash"]')!.textContent;
async function freeze(host: Element) {await click(host, 'สร้างรายการคำนวณและรูปคู่ด้านร่าง'); await vi.waitFor(() => expect(button(host, 'ดาวน์โหลดร่าง JSON').disabled).toBe(false));}

it('blocks freeze/export for any unapplied Custom field and cancel restores the unchanged frozen revision', async () => {
  setup(); const host = document.createElement('div'), root = createRoot(host);
  try {
    await act(async () => root.render(<WorkflowV07Panel input={defaults} caseId="CUSTOM-PENDING"/>));
    await pick(custom(host, 'material'), 'วัสดุ', 'STEEL-SS400'); await freeze(host); const frozenHash = hash(host);
    const editor = custom(host, 'material');
    await set(editor, 'เหตุผล', 'SYNTHETIC pending reason without a selected property');
    expect(button(host, 'สร้างรายการคำนวณและรูปคู่ด้านร่าง').disabled).toBe(true);
    expect(button(host, 'ดาวน์โหลดร่าง JSON').disabled).toBe(true);
    expect(field(editor, 'วัสดุ').querySelector('select')!.disabled).toBe(true);
    expect(button(editor, 'ใช้ Custom เป็นร่าง').disabled).toBe(true);
    await click(editor, 'ยกเลิกค่าที่กรอก Custom');
    expect(button(host, 'ดาวน์โหลดร่าง JSON').disabled).toBe(false);
    expect(hash(host)).toBe(frozenHash); expect(field(editor, 'วัสดุ').querySelector('select')!.disabled).toBe(false);
  } finally {await act(async () => root.unmount());}
});

it('retains pending Custom through unrelated edits, then freezes original/effective values and evidence in the same report', async () => {
  setup(); const host = document.createElement('div'), root = createRoot(host);
  try {
    await act(async () => root.render(<WorkflowV07Panel input={defaults} caseId="CUSTOM-APPLIED"/>));
    await pick(custom(host, 'material'), 'วัสดุ', 'STEEL-SS400'); await freeze(host); const before = hash(host);
    const editor = custom(host, 'material'); await pick(editor, 'คุณสมบัติ', 'properties.E_MPa');
    await set(editor, 'ค่าที่ใช้ใหม่', '190000'); await set(editor, 'เหตุผล', 'SYNTHETIC changed test condition'); await set(editor, 'อ้างอิงหลักฐาน', 'SYNTHETIC material evidence');
    await set(host, 'อ้างอิงแบบ/มิติ', 'SYNTHETIC unrelated geometry source');
    expect(field(editor, 'ค่าที่ใช้ใหม่').querySelector('input')!.value).toBe('190000');
    expect(button(host, 'สร้างรายการคำนวณและรูปคู่ด้านร่าง').disabled).toBe(true);
    await click(editor, 'ใช้ Custom เป็นร่าง');
    expect(button(host, 'ดาวน์โหลดร่าง JSON').disabled).toBe(true);
    expect(field(editor, 'คุณสมบัติ').querySelector('select')!.value).toBe('');
    await freeze(host); expect(hash(host)).not.toBe(before);
    const report = host.querySelector('.workflow-v07-documents')!, summary = report.querySelector('[aria-label="อ้างอิงที่นำไปใช้ material"]')!;
    expect(summary.textContent).toContain('CUSTOM'); expect(summary.textContent).toContain('SYNTHETIC material evidence');
    const row = Array.from(summary.querySelectorAll('tr')).find(r => r.cells[0].textContent === 'properties.E_MPa')!;
    expect(Array.from(row.cells).map(c => c.textContent)).toEqual(['properties.E_MPa', '200000', '190000']);
    expect(report.textContent).toContain('ยังไม่ผูกสมบัติกับสมาชิก'); expect(report.textContent).toContain('DRAFT / NO_GO');
    expect(hash(host)).toBe(host.querySelector('[data-testid="drawing-snapshot-hash"]')!.textContent);
  } finally {await act(async () => root.unmount());}
});

it('keeps multiple Custom and supplier edits independently pending; one cancel cannot unlock another form', async () => {
  setup(); const host = document.createElement('div'), root = createRoot(host);
  try {
    await act(async () => root.render(<WorkflowV07Panel input={defaults} caseId="MULTIPLE-PENDING"/>));
    await pick(host, 'ประเภทองค์อาคาร', 'SLAB'); await pick(custom(host, 'material'), 'วัสดุ', 'STEEL-SS400');
    const section = field(custom(host, 'section'), 'หน้าตัด').querySelector('select')!;
    await choose(section, Array.from(section.options).find(o => !!o.value && !o.disabled)!.value);
    await freeze(host); const originalHash = hash(host);
    await set(custom(host, 'section'), 'เหตุผล', 'SYNTHETIC pending section');
    await set(custom(host, 'material'), 'เหตุผล', 'SYNTHETIC pending material');
    await click(host, 'เพิ่มผู้จำหน่าย');
    await click(custom(host, 'material'), 'ยกเลิกค่าที่กรอก Custom');
    expect(button(host, 'ดาวน์โหลดร่าง JSON').disabled).toBe(true);
    await click(custom(host, 'section'), 'ยกเลิกค่าที่กรอก Custom');
    expect(button(host, 'สร้างรายการคำนวณและรูปคู่ด้านร่าง').disabled).toBe(true);
    await click(host, 'เก็บข้อมูลและวิเคราะห์เฟรมร่าง');
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('ผู้จำหน่ายที่ยังไม่ได้นำไปใช้');
    await click(host, 'ยกเลิกการแก้ไขผู้จำหน่าย');
    expect(button(host, 'ดาวน์โหลดร่าง JSON').disabled).toBe(false); expect(hash(host)).toBe(originalHash);
  } finally {await act(async () => root.unmount());}
});

it('retains a failed supplier edit and blocks record replacement until explicit cancel, then saves a revised unverified value', async () => {
  setup(); const host = document.createElement('div'), root = createRoot(host);
  try {
    await act(async () => root.render(<WorkflowV07Panel input={defaults} caseId="SUPPLIER-PENDING"/>));
    await pick(host, 'ประเภทองค์อาคาร', 'SLAB'); await pick(host, 'ผู้จำหน่าย Ringlock', 'TH-SUCOOT');
    await pick(host, 'ตระกูล Ringlock', 'SUCOOT-48'); await pick(host, 'ชิ้นส่วนของตระกูล', 'SU48-ST');
    await freeze(host); const originalHash = hash(host);
    await click(host, 'แก้ไขหน้าตัดและวัสดุที่เลือก');
    expect(button(host, 'ดาวน์โหลดร่าง JSON').disabled).toBe(true);
    expect(field(host, 'ผู้จำหน่าย Ringlock').querySelector('select')!.disabled).toBe(true);
    expect(button(host, 'เพิ่มผู้จำหน่าย').disabled).toBe(true);
    await set(host, 'ความหนาท่อ', '30'); await set(host, 'เหตุผลการเพิ่ม', 'SYNTHETIC test'); await set(host, 'หลักฐานการเพิ่ม', 'SYNTHETIC evidence');
    await click(host, 'บันทึกข้อมูลรอตรวจในฉบับร่าง');
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('ความหนาท่อ');
    expect(field(host, 'ความหนาท่อ').querySelector('input')!.value).toBe('30');
    expect(button(host, 'สร้างรายการคำนวณและรูปคู่ด้านร่าง').disabled).toBe(true);
    await click(host, 'ยกเลิกการแก้ไขผู้จำหน่าย');
    expect(button(host, 'ดาวน์โหลดร่าง JSON').disabled).toBe(false); expect(hash(host)).toBe(originalHash);
    await click(host, 'แก้ไขหน้าตัดและวัสดุที่เลือก'); await set(host, 'Fy (MPa)', '355');
    await set(host, 'เหตุผลการเพิ่ม', 'SYNTHETIC material edit'); await set(host, 'หลักฐานการเพิ่ม', 'SYNTHETIC evidence');
    await click(host, 'บันทึกข้อมูลรอตรวจในฉบับร่าง');
    expect(button(host, 'สร้างรายการคำนวณและรูปคู่ด้านร่าง').disabled).toBe(false);
    expect(button(host, 'ดาวน์โหลดร่าง JSON').disabled).toBe(true);
    await freeze(host); expect(hash(host)).not.toBe(originalHash);
    const report = host.querySelector('.workflow-v07-documents')!;
    expect(report.textContent).toContain('355'); expect(report.textContent).toContain('ข้อมูลรอตรวจ');
    expect(report.textContent).toContain('THAI_SUPPLIER_CONNECTION_AND_SYSTEM_EVIDENCE_REQUIRED');
  } finally {await act(async () => root.unmount());}
});

it('cleans pending registrations when their forms unmount on type/case changes without carrying local edits into a new case', async () => {
  setup(); const host = document.createElement('div'), root = createRoot(host);
  try {
    await act(async () => root.render(<WorkflowV07Panel input={defaults} caseId="PENDING-CASE-1"/>));
    await pick(host, 'ประเภทองค์อาคาร', 'SLAB'); await click(host, 'เพิ่มผู้จำหน่าย');
    await set(host, 'ชื่อผู้จำหน่าย', 'SYNTHETIC unsaved supplier');
    await pick(host, 'ประเภทองค์อาคาร', 'FOOTING');
    expect(button(host, 'สร้างรายการคำนวณและรูปคู่ด้านร่าง').disabled).toBe(false);
    await pick(custom(host, 'material'), 'วัสดุ', 'STEEL-SS400'); await set(custom(host, 'material'), 'เหตุผล', 'SYNTHETIC unsaved reason');
    await act(async () => root.render(<WorkflowV07Panel input={defaults} caseId="PENDING-CASE-2"/>));
    expect(host.textContent).not.toContain('SYNTHETIC unsaved');
    expect(button(host, 'สร้างรายการคำนวณและรูปคู่ด้านร่าง').disabled).toBe(false);
    await freeze(host); expect(host.querySelector('.workflow-v07-documents')?.textContent).toContain('PENDING-CASE-2');
  } finally {await act(async () => root.unmount());}
});
