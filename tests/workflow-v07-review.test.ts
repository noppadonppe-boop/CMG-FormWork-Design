import {describe, expect, it} from 'vitest';
import {allowedReviewActions, applyReviewAction, emptyReviewRecord, reviewIsStale, validateReviewRecord, type ReviewActor, type ReviewContext} from '../src/domain/workflowV07/review';

const engineer: ReviewActor = {uid: 'u-eng', name: 'Engineer A', roles: ['Engineer']};
const admin: ReviewActor = {uid: 'u-adm', name: 'Admin B', roles: ['Admin']};
const master: ReviewActor = {uid: 'u-mas', name: 'Master C', roles: ['MasterAdmin']};
const staff: ReviewActor = {uid: 'u-stf', name: 'Staff D', roles: ['Staff']};
const ctx = (contentHash = 'h1', engineVersion = 'e1', draftPending = false): ReviewContext => ({contentHash, engineVersion, draftPending});
const ok = (r: ReturnType<typeof emptyReviewRecord>, actor: ReviewActor, c: ReviewContext) => allowedReviewActions(r, actor, c).filter(a => !a.reason).map(a => a.action);

describe('review → approve → issue workflow', () => {
  it('walks the full chain with role gates, reviewer independence and MasterAdmin-only issue', () => {
    let r = emptyReviewRecord('p1', 'c1');
    expect(ok(r, staff, ctx())).toEqual([]);
    expect(ok(r, engineer, ctx())).toEqual(['SUBMIT']);
    r = applyReviewAction(r, 'SUBMIT', engineer, ctx(), '', 1);
    expect(r.state).toBe('SUBMITTED'); expect(r.contentHash).toBe('h1'); expect(r.submittedBy).toBe('u-eng');
    expect(ok(r, engineer, ctx())).toEqual(['RETURN']); // submitter cannot review own work
    expect(ok(r, admin, ctx())).toEqual(['REVIEW', 'RETURN']);
    r = applyReviewAction(r, 'REVIEW', admin, ctx(), 'checked', 2);
    r = applyReviewAction(r, 'APPROVE', admin, ctx(), '', 3);
    expect(ok(r, admin, ctx())).toEqual(['RETURN']); // ISSUE is MasterAdmin only
    expect(ok(r, engineer, ctx())).toEqual([]); // return after approval needs Admin+
    r = applyReviewAction(r, 'ISSUE', master, ctx(), '', 4);
    expect(r.state).toBe('ISSUED_INTERNAL');
    expect(ok(r, master, ctx())).toEqual(['REVISE']);
    expect(() => applyReviewAction(r, 'REVISE', engineer, ctx(), '', 5)).toThrow(/เหตุผล/);
    const revised = applyReviewAction(r, 'REVISE', engineer, ctx('h2'), 'new pour stage', 5);
    expect(revised.state).toBe('DRAFT'); expect(revised.contentHash).toBe(''); expect(revised.history).toHaveLength(5);
    validateReviewRecord(revised);
    expect(JSON.stringify(revised)).not.toMatch(/CONSTRUCTION|APPROVED"/);
  });
  it('binds the state to the exact draft hash and engine; a changed draft can only be returned', () => {
    let r = applyReviewAction(emptyReviewRecord('p1', 'c1'), 'SUBMIT', engineer, ctx(), '', 1);
    r = applyReviewAction(r, 'REVIEW', admin, ctx(), '', 2);
    expect(reviewIsStale(r, ctx('h1', 'e1'))).toBe(false);
    expect(reviewIsStale(r, ctx('h2', 'e1'))).toBe(true);
    expect(reviewIsStale(r, ctx('h1', 'e2'))).toBe(true);
    expect(ok(r, admin, ctx('h2'))).toEqual(['RETURN']);
    expect(() => applyReviewAction(r, 'APPROVE', admin, ctx('h2'), '', 3)).toThrow(/ร่างเปลี่ยน/);
    expect(() => applyReviewAction(r, 'RETURN', admin, ctx('h2'), '', 3)).toThrow(/เหตุผล/);
    const back = applyReviewAction(r, 'RETURN', admin, ctx('h2'), 'draft changed', 3);
    expect(back.state).toBe('DRAFT'); expect(back.submittedBy).toBe('');
  });
  it('refuses to submit a draft with pending editor state or without a hash', () => {
    const r = emptyReviewRecord('p1', 'c1');
    expect(ok(r, engineer, ctx('h1', 'e1', true))).toEqual([]);
    expect(ok(r, engineer, ctx('', 'e1'))).toEqual([]);
  });
  it('rejects tampered records: broken history chains, missing bindings and authority fields', () => {
    const r = applyReviewAction(emptyReviewRecord('p1', 'c1'), 'SUBMIT', engineer, ctx(), '', 1);
    expect(() => validateReviewRecord({...r, state: 'ISSUED_INTERNAL'})).toThrow(/does not reproduce/);
    expect(() => validateReviewRecord({...r, history: []})).toThrow(/does not reproduce/);
    expect(() => validateReviewRecord({...r, contentHash: ''})).toThrow(/requires the bound/);
    expect(() => validateReviewRecord({...r, constructionEligible: true})).toThrow(/authority/);
    expect(() => validateReviewRecord({...emptyReviewRecord('p1', 'c1'), contentHash: 'x'})).toThrow(/DRAFT state/);
  });
});
