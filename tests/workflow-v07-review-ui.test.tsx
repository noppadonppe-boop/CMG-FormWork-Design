// @vitest-environment jsdom
import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect, it} from 'vitest';
import {ReviewPanel, ReviewQueue} from '../src/components/ReviewPanel';
import {applyReviewAction, emptyReviewRecord, type ReviewRecord} from '../src/domain/workflowV07/review';

const engineer = {uid: 'u-eng', name: 'Engineer A', roles: ['Engineer' as const]};
const admin = {uid: 'u-adm', name: 'Admin B', roles: ['Admin' as const]};
const ctx = {contentHash: 'h1', engineVersion: 'e1', draftPending: false};

it('submits from the panel, then shows only the actions the current actor may take and the stale warning', async () => {
  (globalThis as unknown as {IS_REACT_ACT_ENVIRONMENT: boolean}).IS_REACT_ACT_ENVIRONMENT = true;
  const changes: ReviewRecord[] = [];
  const host = document.createElement('div'), root = createRoot(host);
  document.body.append(host);
  const buttons = () => Array.from(host.querySelectorAll('button')).filter(b => !b.disabled).map(b => b.textContent);
  try {
    await act(async () => root.render(<ReviewPanel record={emptyReviewRecord('p1', 'c1')} actor={engineer} context={ctx} blockers={['A', 'B']} onChange={r => {changes.push(r);}}/>));
    expect(buttons()).toEqual(['ส่งตรวจ']);
    expect(host.textContent).toContain('2 รายการ');
    await act(async () => Array.from(host.querySelectorAll('button')).find(b => b.textContent === 'ส่งตรวจ')!.click());
    expect(changes).toHaveLength(1); expect(changes[0].state).toBe('SUBMITTED');
    // Same engineer after submitting: only RETURN; admin: REVIEW + RETURN; changed draft: RETURN only with stale warning.
    await act(async () => root.render(<ReviewPanel record={changes[0]} actor={engineer} context={ctx} blockers={[]} onChange={() => {}}/>));
    expect(buttons()).toEqual(['ส่งคืนเป็นร่าง']);
    await act(async () => root.render(<ReviewPanel record={changes[0]} actor={admin} context={ctx} blockers={[]} onChange={() => {}}/>));
    expect(buttons()).toEqual(['บันทึกผลตรวจ', 'ส่งคืนเป็นร่าง']);
    await act(async () => root.render(<ReviewPanel record={changes[0]} actor={admin} context={{...ctx, contentHash: 'h2'}} blockers={[]} onChange={() => {}}/>));
    expect(buttons()).toEqual(['ส่งคืนเป็นร่าง']);
    expect(host.textContent).toContain('ต่างจากร่างที่ส่งตรวจ');
  } finally {await act(async () => root.unmount()); host.remove();}
});

it('renders the queue and an issued record without construction wording', () => {
  let r = applyReviewAction(emptyReviewRecord('p1', 'c1'), 'SUBMIT', engineer, ctx, '', 1);
  r = applyReviewAction(r, 'REVIEW', admin, ctx, '', 2); r = applyReviewAction(r, 'APPROVE', admin, ctx, '', 3);
  r = applyReviewAction(r, 'ISSUE', {uid: 'u-mas', name: 'Master C', roles: ['MasterAdmin']}, ctx, '', 4);
  const html = renderToStaticMarkup(<><ReviewPanel record={r} actor={engineer} context={ctx} blockers={[]} onChange={() => {}}/><ReviewQueue rows={[{caseId: 'c1', name: 'B01', elementType: 'BEAM', record: r, stale: false, integrityIssues: [{code: 'STORED_DRAFT_TYPE_MISMATCH', message: 'ร่าง v0.7 เป็น WALL แต่ Design Case เป็น BEAM'}]}]} onOpen={() => {}}/></>);
  expect(html).toContain('ISSUED_INTERNAL'); expect(html).toContain('NOT FOR CONSTRUCTION'); expect(html).toContain('Master C');
  // Every "FOR CONSTRUCTION" must be the "NOT FOR CONSTRUCTION" disclaimer; no bare APPROVED/PASS status cell.
  expect(html.match(/FOR CONSTRUCTION/g)!.length).toBe(html.match(/NOT FOR CONSTRUCTION/g)!.length);
  expect(html).not.toMatch(/<td>[^<]*\b(APPROVED|PASS)\b(?!_INTERNAL)/);
  expect(html).toContain('ร่าง v0.7 เป็น WALL');
});
