// @vitest-environment jsdom
import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {renderToStaticMarkup} from 'react-dom/server';
import {webcrypto} from 'node:crypto';
import {TextEncoder} from 'node:util';
import {afterEach, expect, it, vi} from 'vitest';
import {CoverageReviewEditor, CoverageReviewResults} from '../src/components/CoverageReview';
import WorkflowV07Panel, {WorkflowDocuments} from '../src/components/WorkflowV07Panel';
import {defaults} from '../src/domain';
import {previewWorkflow, regenerateDraftLayouts, reviseDraft} from '../src/domain/workflowV07/model';
import {documentView, freezeDesign} from '../src/domain/workflowV07/snapshot';
import {coverageModel, representativeGroup} from './fixtures/workflow-v07-coverage';

afterEach(() => vi.unstubAllGlobals());
function setup() {vi.stubGlobal('crypto', webcrypto); vi.stubGlobal('TextEncoder', TextEncoder); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);}
const button = (scope: Element, text: string) => Array.from(scope.querySelectorAll('button')).find(b => b.textContent === text)!;
const field = (scope: Element, prefix: string) => Array.from(scope.querySelectorAll('label')).find(l => l.textContent?.startsWith(prefix))!;
async function enter(input: HTMLInputElement, value: string) {await act(async () => {Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value); input.dispatchEvent(new Event('input', {bubbles: true}));});}
async function choose(select: HTMLSelectElement, value: string) {await act(async () => {select.value = value; select.dispatchEvent(new Event('change', {bubbles: true}));});}
const click = async (scope: Element, text: string) => act(async () => button(scope, text).click());

it('authors exact per-check/case member references and evidence, without creating check verdicts or treating UI filters as pending data', async () => {
  setup(); const host = document.createElement('div'), root = createRoot(host), model = coverageModel(), apply = vi.fn(), pending = vi.fn();
  try {
    await act(async () => root.render(<CoverageReviewEditor model={model} preview={previewWorkflow(model)} onApply={apply} onPendingChange={pending}/>));
    await enter(field(host, 'Check เพื่อจัดกลุ่ม').querySelector('input')!, 'SOFFIT-05'); expect(pending).toHaveBeenLastCalledWith(false);
    await click(host, 'เพิ่มกลุ่มตัวแทน'); await choose(field(host, 'วิธีเทียบ').querySelector('select')!, 'LOCAL_1D_SAME');
    await click(host, 'ใช้ JOIST-2 SOFFIT-05 SERVICE-TEST เป็นตัวแทน');
    for (const id of ['JOIST-2', 'JOIST-3']) await act(async () => (host.querySelector(`input[aria-label="รวม ${id} SOFFIT-05 SERVICE-TEST"]`) as HTMLInputElement).click());
    await enter(field(host, 'หลักฐานขอบเขต').querySelector('input')!, 'SYNTHETIC review evidence'); expect(pending).toHaveBeenLastCalledWith(true);
    await click(host, 'เก็บแผนตัวแทนร่าง'); const group = apply.mock.lastCall![0].groups[0];
    expect(group.representative.memberId).toBe('JOIST-2'); expect(group.targets).toHaveLength(2); expect(group.targets.every((r: {revision: string}) => r.revision === model.revisionId)).toBe(true);
    expect(group).not.toHaveProperty('status'); expect(pending).toHaveBeenLastCalledWith(false);
    await click(host, 'เพิ่มกลุ่มตัวแทน'); expect((host.querySelector('input[aria-label="รวม JOIST-2 SOFFIT-05 SERVICE-TEST"]') as HTMLInputElement).disabled).toBe(true);
  } finally {await act(async () => root.unmount());}
});
it('preserves pending group evidence and old references through upstream source regeneration, requiring explicit review rather than automatic revision rebasing', async () => {
  setup(); const host = document.createElement('div'), root = createRoot(host), {applied} = representativeGroup(), apply = vi.fn(), pending = vi.fn();
  const render = (model = applied) => root.render(<CoverageReviewEditor model={model} preview={previewWorkflow(model)} onApply={apply} onPendingChange={pending}/>);
  try {
    await act(async () => render()); await choose(field(host, 'กลุ่มตัวแทนที่กำลังแก้').querySelector('select')!, 'SYN-TYP');
    await enter(field(host, 'หลักฐานขอบเขต').querySelector('input')!, 'SYNTHETIC unsaved scope');
    const changed = regenerateDraftLayouts(reviseDraft(applied, {constructionLiveKPa: 3})); await act(async () => render(changed));
    expect(field(host, 'หลักฐานขอบเขต').querySelector('input')!.value).toBe('SYNTHETIC unsaved scope'); expect(host.textContent).toContain(applied.revisionId);
    await click(host, 'เก็บแผนตัวแทนร่าง'); expect(apply.mock.lastCall![0].groups[0].targets[0].revision).toBe(applied.revisionId);
    await click(host, 'คืนค่าแผนตัวแทนที่เก็บไว้'); expect(pending).toHaveBeenLastCalledWith(false);
  } finally {await act(async () => root.unmount());}
});
it('paginates the complete actual matrix, filters rows without changing coverage, and keeps local demand matches visibly pending', async () => {
  setup(); const host = document.createElement('div'), root = createRoot(host), {applied} = representativeGroup(), p = previewWorkflow(applied);
  try {
    await act(async () => root.render(<CoverageReviewResults model={applied} preview={p}/>));
    expect(host.querySelectorAll('tbody tr')).toHaveLength(100); expect(host.textContent).toContain(`รายการจริง ${p.requiredChecks.length}`);
    await click(host, 'Matrix หน้าถัดไป'); expect(host.textContent).toContain('แสดง 101–');
    await enter(field(host, 'กรองสมาชิกใน Matrix').querySelector('input')!, 'JOIST-3'); await enter(field(host, 'กรอง Check ใน Matrix').querySelector('input')!, 'SOFFIT-05');
    expect(host.querySelectorAll('tbody tr')).toHaveLength(1); expect(host.textContent).toContain('อินพุตเทียบกันได้เฉพาะแรง 1D'); expect(host.textContent).toContain('รอตรวจขอบเขต/ผล');
    expect(host.textContent).toContain('ตรวจยืนยันแล้ว 0'); expect(p.coverageReview.rows).toHaveLength(p.requiredChecks.length);
    const view = await documentView(await freezeDesign(applied), applied), html = renderToStaticMarkup(<WorkflowDocuments view={view}/>);
    expect(html).toContain('Coverage matrix'); expect(html).toContain('NO_GO'); expect(html.match(new RegExp(view.snapshotHash, 'g'))).toHaveLength(2);
  } finally {await act(async () => root.unmount());}
});
it('blocks freeze/download for pending coverage edits, retains empty/incomplete plans explicitly, and restores download only after cancel or a new frozen snapshot', async () => {
  setup(); const host = document.createElement('div'), root = createRoot(host);
  try {
    await act(async () => root.render(<WorkflowV07Panel input={defaults} caseId="COVERAGE-PENDING"/>));
    await click(host, 'สร้างรายการคำนวณและรูปคู่ด้านร่าง'); await vi.waitFor(() => expect(button(host, 'ดาวน์โหลดร่าง JSON').disabled).toBe(false));
    await click(host, 'เพิ่มกลุ่มตัวแทน'); expect(button(host, 'สร้างรายการคำนวณและรูปคู่ด้านร่าง').disabled).toBe(true); expect(button(host, 'ดาวน์โหลดร่าง JSON').disabled).toBe(true);
    await click(host, 'คืนค่าแผนตัวแทนที่เก็บไว้'); expect(button(host, 'ดาวน์โหลดร่าง JSON').disabled).toBe(false);
    await click(host, 'เพิ่มกลุ่มตัวแทน'); await click(host, 'เก็บแผนตัวแทนร่าง'); expect(button(host, 'ดาวน์โหลดร่าง JSON').disabled).toBe(true);
    await click(host, 'สร้างรายการคำนวณและรูปคู่ด้านร่าง'); await vi.waitFor(() => expect(button(host, 'ดาวน์โหลดร่าง JSON').disabled).toBe(false));
    const report = host.querySelector('.workflow-v07-documents')!; expect(report.textContent).toContain('NO_ACTUAL_TARGETS'); expect(report.textContent).toContain('ยังไม่มีรายการตรวจของสมาชิกจริง');
  } finally {await act(async () => root.unmount());}
});
it('refuses saving a coverage plan over pending source layouts and preserves the group until sources are applied or restored', async () => {
  setup(); const host = document.createElement('div'), root = createRoot(host);
  try {
    await act(async () => root.render(<WorkflowV07Panel input={defaults} caseId="COVERAGE-SOURCE-PENDING"/>));
    await choose(field(host, 'ประเภทองค์อาคาร').querySelector('select')!, 'SLAB'); await click(host, 'เพิ่มกลุ่มตัวแทน');
    const soffit = host.querySelector('.soffit-editor')!; await enter(field(soffit, 'ขั้นตอนเท/Stage').querySelector('input')!, 'SYNTHETIC pending stage');
    await click(host, 'เก็บแผนตัวแทนร่าง'); expect(host.querySelector('.coverage-review-editor [role="alert"]')?.textContent).toContain('ข้อมูลตำแหน่งหรือเฟรมค้าง');
    expect(field(host, 'กลุ่มตัวแทนที่กำลังแก้').querySelector('select')!.value).toBe('TYP-1'); expect(button(host, 'สร้างรายการคำนวณและรูปคู่ด้านร่าง').disabled).toBe(true);
    await click(host, 'คืนค่าแบบท้องที่นำไปใช้ล่าสุด'); await click(host, 'เก็บแผนตัวแทนร่าง'); expect(host.querySelector('.coverage-review-editor [role="alert"]')).toBeNull();
    expect(button(host, 'สร้างรายการคำนวณและรูปคู่ด้านร่าง').disabled).toBe(false);
  } finally {await act(async () => root.unmount());}
});
