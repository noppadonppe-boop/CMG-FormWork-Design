// @vitest-environment jsdom
import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {renderToStaticMarkup} from 'react-dom/server';
import {webcrypto} from 'node:crypto';
import {TextEncoder} from 'node:util';
import {afterEach, expect, it, vi} from 'vitest';
import {defaults} from '../src/domain';
import WorkflowV07Panel, {WorkflowDocuments} from '../src/components/WorkflowV07Panel';
import {fromLegacy} from '../src/domain/workflowV07/model';
import {documentView, freezeDesign} from '../src/domain/workflowV07/snapshot';

afterEach(() => vi.unstubAllGlobals());
function cryptoSetup() {vi.stubGlobal('crypto', webcrypto); vi.stubGlobal('TextEncoder', TextEncoder);}
it('report and drawing show the same frozen hash, watermarks, pairs and missing engineering checks', async () => {
  cryptoSetup();
  const model = fromLegacy({...defaults, shape: 'L', width: 6000, length: 5000, armX: 2000, armY: 2000, height: 500, walerSpacing: 500}, 'L1');
  const frozen = await freezeDesign(model), view = await documentView(frozen, model);
  const html = renderToStaticMarkup(<WorkflowDocuments view={view}/>);
  expect(html.match(new RegExp(frozen.snapshotHash, 'g'))).toHaveLength(2);
  expect(html).toContain('DRAFT / NO_GO'); expect(html).toContain('ENGINEERING_CAPACITY_METHODS');
  expect(html).toContain('PAIR-4'); expect(html).not.toMatch(/NaN|Infinity|undefined/);
});
it('panel keeps edits private, preserves unknowns and blocks download immediately after an edit', async () => {
  cryptoSetup();
  (globalThis as unknown as {IS_REACT_ACT_ENVIRONMENT: boolean}).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div'), root = createRoot(host), input = {...defaults};
  document.body.append(host);
  const button = (text: string) => Array.from(host.querySelectorAll('button')).find(b => b.textContent === text)!;
  try {
    await act(async () => root.render(<WorkflowV07Panel input={input} caseId="F1"/>));
    expect(host.textContent).toContain('182 หน้าตัด');
    const select = host.querySelector('select')!;
    await act(async () => {select.value = 'SLAB'; select.dispatchEvent(new Event('change', {bubbles: true}));});
    const dl = Array.from(host.querySelectorAll('label')).find(l => l.textContent?.includes('Additional Dead Load'))!.querySelector('input')!;
    expect(dl.value).toBe(''); // no imported synthetic DL default
    await act(async () => {select.value = 'FOOTING'; select.dispatchEvent(new Event('change', {bubbles: true}));});
    await act(async () => button('สร้างรายการคำนวณและรูปคู่ด้านร่าง').click());
    await vi.waitFor(() => expect(button('ดาวน์โหลดร่าง JSON').disabled).toBe(false));
    await act(async () => {select.value = 'WALL'; select.dispatchEvent(new Event('change', {bubbles: true}));});
    expect(button('ดาวน์โหลดร่าง JSON').disabled).toBe(true);
    expect(input).toEqual(defaults); expect(host.textContent).toContain('STALE');
  } finally {await act(async () => root.unmount()); host.remove();}
});
it('opens the selected element menu type as a v0.7 draft without changing legacy input', async () => {
  cryptoSetup();
  (globalThis as unknown as {IS_REACT_ACT_ENVIRONMENT: boolean}).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div'), root = createRoot(host), input = {...defaults};
  try {
    await act(async () => root.render(<WorkflowV07Panel input={input} caseId="B-MENU" initialElementType="BEAM"/>));
    const elementType = host.querySelector('select') as HTMLSelectElement;
    expect(elementType.value).toBe('BEAM');
    expect(host.textContent).toContain('Ringlock');
    expect(input.kind).toBe('FOOTING');
  } finally {await act(async () => root.unmount());}
});
it('unapplied coordinate text cannot be downloaded as if it were the frozen geometry', async () => {
  cryptoSetup();
  (globalThis as unknown as {IS_REACT_ACT_ENVIRONMENT: boolean}).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div'), root = createRoot(host);
  try {
    await act(async () => root.render(<WorkflowV07Panel input={defaults} caseId="F1"/>));
    await act(async () => Array.from(host.querySelectorAll('button')).find(b => b.textContent?.startsWith('สร้างรายการ'))!.click());
    const download = () => Array.from(host.querySelectorAll('button')).find(b => b.textContent === 'ดาวน์โหลดร่าง JSON')!;
    await vi.waitFor(() => expect(download().disabled).toBe(false));
    const textarea = host.querySelector('textarea')!;
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
    await act(async () => {setter.call(textarea, '[[0,0],[1000,0],[1000,1000],[0,1000]]'); textarea.dispatchEvent(new Event('input', {bubbles: true}));});
    expect(download().disabled).toBe(true);
  } finally {await act(async () => root.unmount());}
});
it('changing a reference clears Custom and a Custom edit requires reason/evidence', async () => {
  cryptoSetup();
  (globalThis as unknown as {IS_REACT_ACT_ENVIRONMENT: boolean}).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div'), root = createRoot(host);
  const choose = async (select: HTMLSelectElement, value: string) => act(async () => {select.value = value; select.dispatchEvent(new Event('change', {bubbles: true}));});
  const enter = async (input: HTMLInputElement, value: string) => act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value); input.dispatchEvent(new Event('input', {bubbles: true}));
  });
  try {
    await act(async () => root.render(<WorkflowV07Panel input={defaults} caseId="F1"/>));
    const material = Array.from(host.querySelectorAll('label')).find(l => l.textContent?.startsWith('วัสดุ'))!.querySelector('select')!;
    await choose(material, 'STEEL-SS400');
    const editor = Array.from(host.querySelectorAll('details')).find(d => d.querySelector('summary')?.textContent?.startsWith('กำหนด Custom'))!;
    await choose(editor.querySelector('select')!, 'properties.E_MPa');
    const fields = editor.querySelectorAll<HTMLInputElement>('input');
    const apply = Array.from(editor.querySelectorAll('button')).find(b => b.textContent === 'ใช้ Custom เป็นร่าง')!;
    expect(apply.disabled).toBe(true);
    await enter(fields[0], '190000'); await enter(fields[1], 'test condition'); await enter(fields[2], 'synthetic evidence');
    expect(apply.disabled).toBe(false); await act(async () => apply.click());
    expect(editor.querySelector('summary')?.textContent).toContain('Custom ·');
    await choose(material, 'STEEL-SS490');
    expect(host.textContent).not.toContain('Custom · เก็บข้อมูลต้นฉบับแยกแล้ว');
  } finally {await act(async () => root.unmount());}
});
