// @vitest-environment jsdom
import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {renderToStaticMarkup} from 'react-dom/server';
import {webcrypto} from 'node:crypto';
import {TextEncoder} from 'node:util';
import {afterEach, expect, it, vi} from 'vitest';
import {LayoutCandidateEditor} from '../src/components/LayoutCandidateEditor';
import WorkflowV07Panel, {WorkflowDocuments} from '../src/components/WorkflowV07Panel';
import * as candidates from '../src/domain/workflowV07/layoutCandidate';
import {reviseDraft} from '../src/domain/workflowV07/model';
import {documentView, freezeDesign} from '../src/domain/workflowV07/snapshot';
import {defaults} from '../src/domain';
import {candidateFixture} from './fixtures/workflow-v07-candidate';

afterEach(() => {vi.restoreAllMocks(); vi.unstubAllGlobals();});
function setup() {vi.stubGlobal('crypto', webcrypto); vi.stubGlobal('TextEncoder', TextEncoder); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);}
const button = (scope: Element, text: string) => Array.from(scope.querySelectorAll('button')).find(b => b.textContent === text)!;
const field = (scope: Element, text: string) => Array.from(scope.querySelectorAll('label')).find(l => l.textContent?.startsWith(text))!;
const click = async (scope: Element, text: string) => act(async () => button(scope, text).click());
async function choose(select: HTMLSelectElement, value: string) {await act(async () => {select.value = value; select.dispatchEvent(new Event('change', {bubbles: true}));});}
async function enter(input: HTMLInputElement | HTMLTextAreaElement, value: string) {await act(async () => {const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(input, value); input.dispatchEvent(new Event('input', {bubbles: true}));});}
const readRequest = (host: Element): candidates.CandidateRequest => JSON.parse(host.querySelector<HTMLTextAreaElement>('textarea[aria-label="คำขอข้อเสนอพิกัด JSON"]')!.value);
const candidateHost = (host: Element) => host.querySelector('.layout-candidate-editor')!;
async function generate(host: Element) {await click(host, 'สร้างคำขอข้อเสนอพิกัดจากร่างปัจจุบัน'); await vi.waitFor(() => expect(host.querySelector('textarea[aria-label="คำขอข้อเสนอพิกัด JSON"]')).not.toBeNull()); return readRequest(host);}
async function putAndReview(host: Element, proposal: candidates.LayoutCandidate) {
  await enter(field(host, 'ข้อเสนอพิกัด JSON จาก AI').querySelector('textarea')!, JSON.stringify(proposal));
  await click(host, 'ตรวจข้อเสนอและแสดงพิกัดที่จะเปลี่ยน');
  await vi.waitFor(() => expect(host.querySelector('[aria-label="พิกัดก่อนและหลังข้อเสนอ"]'), host.querySelector('[role="alert"]')?.textContent ?? host.textContent?.slice(-200)).not.toBeNull());
}
async function check(host: Element) {await act(async () => field(host, 'ตรวจพิกัดก่อน/หลัง').querySelector<HTMLInputElement>('input')!.click());}
async function newColumnCandidate(host: Element) {
  await choose(field(host, 'ประเภทองค์อาคาร').querySelector('select')!, 'COLUMN');
  await choose(field(host, 'ระบบแบบข้าง').querySelector('select')!, 'COLUMN_YOKE');
  const h = candidateHost(host); await enter(field(h, 'Stage ของข้อเสนอ').querySelector('input')!, 'POUR-A'); await enter(field(h, 'Load case ของข้อเสนอ').querySelector('input')!, 'CASE-A');
  const request = await generate(h), p = structuredClone(request.responseTemplate); p.sourceRef = 'SYNTHETIC offline coordinates only'; p.rationale = 'SYNTHETIC draft with no strength data';
  p.side!.faces = request.readOnlyContext.faces.map(f => ({faceId: f.id, studPositionsMm: [0, f.lengthMm / 2, f.lengthMm], walers: [request.readOnlyContext.heightMm / 4, 3 * request.readOnlyContext.heightMm / 4].map((zMm, i) => ({id: `W${i}`, zMm, supports: [{id: 'A', xMm: f.lengthMm / 4}, {id: 'B', xMm: 3 * f.lengthMm / 4}]}))}));
  await putAndReview(h, p); return p;
}
it('shows a complete change review without mutating the draft and requires an explicit human click before apply', async () => {
  setup(); const {model} = await candidateFixture(), host = document.createElement('div'), root = createRoot(host), apply = vi.fn(async () => {}), pending = vi.fn();
  try {
    await act(async () => root.render(<LayoutCandidateEditor model={model} sourcePending={false} onPendingChange={pending} onApply={apply}/>));
    await choose(field(host, 'ขอบเขตข้อเสนอพิกัด').querySelector('select')!, 'SOFFIT');
    const request = await generate(host), p = structuredClone(request.responseTemplate); p.sourceRef = 'SYNTHETIC'; p.rationale = 'SYNTHETIC'; p.soffit!.joistXMm = [0, 400, 800, 1200, 1600, 2000, 2400];
    await putAndReview(host, p); expect(apply).not.toHaveBeenCalled(); expect(model.soffitLayout!.joistXMm).toHaveLength(5);
    expect(button(host, 'ใช้พิกัดที่ตรวจแล้วในร่างและวิเคราะห์ใหม่').disabled).toBe(true); await check(host);
    expect(button(host, 'ใช้พิกัดที่ตรวจแล้วในร่างและวิเคราะห์ใหม่').disabled).toBe(false); await click(host, 'ใช้พิกัดที่ตรวจแล้วในร่างและวิเคราะห์ใหม่');
    expect(apply).toHaveBeenCalledTimes(1); expect(apply.mock.calls[0][1].proposal).toEqual(p); expect(pending).toHaveBeenLastCalledWith(false);
  } finally {await act(async () => root.unmount());}
});
it('invalidates reviewed text or changed source inputs while preserving the proposal for inspection and explicit discard', async () => {
  setup(); const {model} = await candidateFixture(), host = document.createElement('div'), root = createRoot(host), apply = vi.fn(async () => {}), pending = vi.fn();
  const render = async (m = model, sourcePending = false) => act(async () => root.render(<LayoutCandidateEditor model={m} sourcePending={sourcePending} onPendingChange={pending} onApply={apply}/>));
  try {
    await render(); await choose(field(host, 'ขอบเขตข้อเสนอพิกัด').querySelector('select')!, 'SOFFIT'); const request = await generate(host), p = structuredClone(request.responseTemplate);
    p.sourceRef = 'SYNTHETIC'; p.rationale = 'SYNTHETIC'; p.soffit!.joistXMm = [0, 800, 1600, 2400]; await putAndReview(host, p); await check(host);
    await enter(field(host, 'ข้อเสนอพิกัด JSON จาก AI').querySelector('textarea')!, JSON.stringify({...p, rationale: 'SYNTHETIC revised'}));
    expect(host.querySelector('[aria-label="พิกัดก่อนและหลังข้อเสนอ"]')).toBeNull(); expect(pending).toHaveBeenLastCalledWith(true);
    await render(reviseDraft(model, {gammaKNm3: 25})); expect(host.textContent).toContain('STALE · ต้องสร้างคำขอใหม่');
    expect(field(host, 'ข้อเสนอพิกัด JSON จาก AI').querySelector('textarea')!.value).toContain('SYNTHETIC revised');
    expect(button(host, 'ตรวจข้อเสนอและแสดงพิกัดที่จะเปลี่ยน').disabled).toBe(true);
    await render(model, true); expect(button(host, 'สร้างคำขอข้อเสนอพิกัดจากร่างปัจจุบัน').disabled).toBe(true);
    await click(host, 'ยกเลิกข้อเสนอพิกัดที่ยังไม่นำไปใช้'); expect(pending).toHaveBeenLastCalledWith(false); expect(apply).not.toHaveBeenCalled();
  } finally {await act(async () => root.unmount());}
});
it('runs new-column proposal review through the actual panel, preserves unknowns, and blocks frozen output while a new proposal is pending', async () => {
  setup(); const host = document.createElement('div'), root = createRoot(host);
  try {
    await act(async () => root.render(<WorkflowV07Panel input={defaults} caseId="CANDIDATE-COLUMN-UI"/>));
    await newColumnCandidate(host); expect(button(host, 'สร้างรายการคำนวณและรูปคู่ด้านร่าง').disabled).toBe(true);
    const h = candidateHost(host); await check(h); await click(h, 'ใช้พิกัดที่ตรวจแล้วในร่างและวิเคราะห์ใหม่');
    await vi.waitFor(() => expect(host.querySelector('[aria-label="ที่มาข้อเสนอ Layout ที่นำไปใช้"]')).not.toBeNull());
    expect(host.querySelector('[role="alert"]')).toBeNull(); expect(host.textContent).toContain('SYNTHETIC offline coordinates only');
    await click(host, 'สร้างรายการคำนวณและรูปคู่ด้านร่าง'); await vi.waitFor(() => expect(button(host, 'ดาวน์โหลดร่าง JSON').disabled).toBe(false));
    expect(host.querySelector('.workflow-v07-documents')?.textContent).toContain('ร่าง / NO_GO');
    await enter(field(candidateHost(host), 'Stage ของข้อเสนอ').querySelector('input')!, 'UNAPPLIED');
    expect(button(host, 'ดาวน์โหลดร่าง JSON').disabled).toBe(true); expect(button(host, 'สร้างรายการคำนวณและรูปคู่ด้านร่าง').disabled).toBe(true);
    await click(candidateHost(host), 'ยกเลิกข้อเสนอพิกัดที่ยังไม่นำไปใช้'); expect(button(host, 'ดาวน์โหลดร่าง JSON').disabled).toBe(false);
  } finally {await act(async () => root.unmount());}
});
it('does not discard another editor buffer created while an asynchronous candidate apply is in flight', async () => {
  setup(); const host = document.createElement('div'), root = createRoot(host), original = candidates.applyLayoutCandidate;
  let release!: () => void; const barrier = new Promise<void>(resolve => {release = resolve;});
  const spy = vi.spyOn(candidates, 'applyLayoutCandidate').mockImplementation(async (...args) => {await barrier; return original(...args);});
  try {
    await act(async () => root.render(<WorkflowV07Panel input={defaults} caseId="CANDIDATE-RACE-UI"/>)); await newColumnCandidate(host);
    const h = candidateHost(host); await check(h); await click(h, 'ใช้พิกัดที่ตรวจแล้วในร่างและวิเคราะห์ใหม่'); expect(spy).toHaveBeenCalledTimes(1);
    const vertices = field(host, 'จุดขอบคอนกรีต').querySelector('textarea')!, before = vertices.value; await enter(vertices, before + ' ');
    await act(async () => release());
    await vi.waitFor(() => expect(h.querySelector('[role="alert"]')?.textContent).toContain('มีข้อมูลค้างระหว่างใช้ข้อเสนอ'));
    expect(vertices.value).toBe(before + ' '); expect(host.querySelector('[aria-label="ที่มาข้อเสนอ Layout ที่นำไปใช้"]')).toBeNull();
    expect(button(host, 'สร้างรายการคำนวณและรูปคู่ด้านร่าง').disabled).toBe(true);
  } finally {release(); await act(async () => root.unmount());}
});
it('renders source claims and original proposal coordinates from the common frozen report/drawing without executing proposal text', async () => {
  setup(); const {model, request, proposal} = await candidateFixture(); proposal.rationale = '<script>invalid external instruction</script>';
  const review = await candidates.reviewLayoutCandidate(model, request, proposal), next = await candidates.applyLayoutCandidate(model, request, proposal, review.proposalHash, true);
  const frozen = await freezeDesign(next), view = await documentView(frozen, next), html = renderToStaticMarkup(<WorkflowDocuments view={view}/>);
  expect(html).toContain('ที่มาข้อเสนอพิกัด'); expect(html).toContain('ยังไม่ยืนยัน'); expect(html).toContain('&lt;script&gt;'); expect(html).not.toContain('<script>');
  expect(view.drawing.layoutCandidate).toEqual(view.report.model.layoutCandidate); expect(html.match(new RegExp(frozen.snapshotHash, 'g'))).toHaveLength(2);
});
