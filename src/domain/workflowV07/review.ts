import {canonical, finite, record} from './common.js';

/** Review → approve → issue workflow for one Design Case draft.
 *
 * The record binds every state after DRAFT to the exact draft content hash and engine
 * version. When the draft changes, the record becomes stale and can only be returned to DRAFT
 * (no silent re-approval). ISSUED_INTERNAL is the final state and means "issued for internal
 * review"; nothing here is a construction release.
 */
export const REVIEW_SCHEMA = 'workflow-review-1' as const;
export const REVIEW_STATES = ['DRAFT', 'SUBMITTED', 'REVIEWED', 'APPROVED_INTERNAL', 'ISSUED_INTERNAL'] as const;
export type ReviewState = typeof REVIEW_STATES[number];
export const REVIEW_ACTIONS = ['SUBMIT', 'REVIEW', 'APPROVE', 'ISSUE', 'RETURN', 'REVISE'] as const;
export type ReviewAction = typeof REVIEW_ACTIONS[number];
export type ReviewRole = 'MasterAdmin' | 'SuperAdmin' | 'Admin' | 'Engineer' | 'Staff';
export const REVIEW_STATE_LABEL: Record<ReviewState, string> = {
  DRAFT: 'ร่าง', SUBMITTED: 'ส่งตรวจแล้ว', REVIEWED: 'ตรวจแล้ว', APPROVED_INTERNAL: 'อนุมัติภายใน', ISSUED_INTERNAL: 'ออกเอกสารภายใน (ไม่ใช่เพื่อก่อสร้าง)'};

export interface ReviewActor {uid: string; name: string; roles: ReviewRole[]; projectId?: string}
export interface ReviewEvent {action: ReviewAction; from: ReviewState; to: ReviewState; uid: string; name: string; roles: ReviewRole[]; atMs: number; note: string; contentHash: string; engineVersion: string}
export interface ReviewRecord {
  schemaVersion: typeof REVIEW_SCHEMA; projectId: string; caseId: string; state: ReviewState;
  /** Draft content the current state applies to; empty only in DRAFT. */
  contentHash: string; engineVersion: string;
  /** Submitter of the current cycle (independence check); empty in DRAFT. */
  submittedBy: string; history: ReviewEvent[]; updatedAtMs: number;
}
export const emptyReviewRecord = (projectId: string, caseId: string, now = 0): ReviewRecord =>
  ({schemaVersion: REVIEW_SCHEMA, projectId, caseId, state: 'DRAFT', contentHash: '', engineVersion: '', submittedBy: '', history: [], updatedAtMs: now});

const TRANSITIONS: Record<ReviewAction, {from: ReviewState[]; to: ReviewState | null; roles: ReviewRole[]; independentOfSubmitter: boolean}> = {
  SUBMIT: {from: ['DRAFT'], to: 'SUBMITTED', roles: ['Engineer', 'Admin', 'SuperAdmin', 'MasterAdmin'], independentOfSubmitter: false},
  REVIEW: {from: ['SUBMITTED'], to: 'REVIEWED', roles: ['Admin', 'SuperAdmin', 'MasterAdmin'], independentOfSubmitter: true},
  APPROVE: {from: ['REVIEWED'], to: 'APPROVED_INTERNAL', roles: ['Admin', 'SuperAdmin', 'MasterAdmin'], independentOfSubmitter: true},
  ISSUE: {from: ['APPROVED_INTERNAL'], to: 'ISSUED_INTERNAL', roles: ['MasterAdmin'], independentOfSubmitter: true},
  RETURN: {from: ['SUBMITTED', 'REVIEWED', 'APPROVED_INTERNAL'], to: 'DRAFT', roles: ['Engineer', 'Admin', 'SuperAdmin', 'MasterAdmin'], independentOfSubmitter: false},
  // An issued record stays in history; a new cycle starts explicitly, with a reason.
  REVISE: {from: ['ISSUED_INTERNAL'], to: 'DRAFT', roles: ['Engineer', 'Admin', 'SuperAdmin', 'MasterAdmin'], independentOfSubmitter: false},
};

function text(v: unknown, label: string, max = 2000) {if (typeof v !== 'string' || v.length > max) throw Error(`Invalid review ${label}`);}
function exact(raw: unknown, keys: string[], label: string) {
  const r = record(raw);
  if (keys.some(k => !Object.hasOwn(r, k)) || Object.keys(r).some(k => !keys.includes(k))) throw Error(`${label}: unknown/missing fields or authority metadata`);
  return r;
}
export function validateReviewRecord(raw: unknown): asserts raw is ReviewRecord {
  const r = exact(raw, Object.keys(emptyReviewRecord('p', 'c')), 'review record') as unknown as ReviewRecord;
  if (r.schemaVersion !== REVIEW_SCHEMA || !REVIEW_STATES.includes(r.state)) throw Error('Invalid review schema/state');
  text(r.projectId, 'project id', 200); text(r.caseId, 'case id', 200); text(r.contentHash, 'content hash', 128); text(r.engineVersion, 'engine version', 50); text(r.submittedBy, 'submitter', 200);
  if (!r.projectId.trim() || !r.caseId.trim()) throw Error('Review record requires project and case ids');
  finite(r.updatedAtMs, 'review update time', true);
  if (!Array.isArray(r.history) || r.history.length > 500) throw Error('Review history limit');
  for (const e of r.history) {
    const ev = exact(e, ['action', 'from', 'to', 'uid', 'name', 'roles', 'atMs', 'note', 'contentHash', 'engineVersion'], 'review event') as unknown as ReviewEvent;
    if (!REVIEW_ACTIONS.includes(ev.action) || !REVIEW_STATES.includes(ev.from) || !REVIEW_STATES.includes(ev.to)) throw Error('Invalid review event');
    text(ev.uid, 'event uid', 200); text(ev.name, 'event name', 300); text(ev.note, 'event note'); text(ev.contentHash, 'event hash', 128); text(ev.engineVersion, 'event engine', 50);
    if (!Array.isArray(ev.roles) || ev.roles.some(x => !['MasterAdmin', 'SuperAdmin', 'Admin', 'Engineer', 'Staff'].includes(x))) throw Error('Invalid review event roles');
    finite(ev.atMs, 'event time', true);
  }
  if (r.state !== 'DRAFT' && (!r.contentHash.trim() || !r.engineVersion.trim() || !r.submittedBy.trim())) throw Error('Non-draft review state requires the bound content hash, engine version and submitter');
  if (r.state === 'DRAFT' && (r.contentHash || r.submittedBy)) throw Error('DRAFT state carries no bound content hash or submitter');
  // Replaying the history must reproduce the stored state.
  let state: ReviewState = 'DRAFT';
  for (const ev of r.history) {if (ev.from !== state) throw Error('Review history is not a continuous chain'); state = ev.to;}
  if (state !== r.state) throw Error('Review history does not reproduce the stored state');
}

export interface ReviewContext {
  /** Hash of the current draft content and its engine version. */
  contentHash: string; engineVersion: string;
  /** True when the draft has unapplied editor state or a solve error; such drafts cannot be submitted. */
  draftPending: boolean;
}
/** The record applies to the current draft only while the hash and engine match. */
export const reviewIsStale = (r: ReviewRecord, ctx: Pick<ReviewContext, 'contentHash' | 'engineVersion'>) =>
  r.state !== 'DRAFT' && (r.contentHash !== ctx.contentHash || r.engineVersion !== ctx.engineVersion);
const submitterOf = (r: ReviewRecord) => r.submittedBy || null;

export function allowedReviewActions(r: ReviewRecord, actor: ReviewActor, ctx: ReviewContext): {action: ReviewAction; reason: string | null}[] {
  const stale = reviewIsStale(r, ctx);
  return REVIEW_ACTIONS.map(action => {
    const t = TRANSITIONS[action];
    if (!t.from.includes(r.state)) return {action, reason: `ไม่สามารถ ${action} จากสถานะ ${r.state}`};
    if (!actor.roles.some(role => t.roles.includes(role))) return {action, reason: `ต้องมีบทบาท ${t.roles.join('/')}`};
    if (action !== 'RETURN' && action !== 'REVISE' && stale) return {action, reason: 'ร่างเปลี่ยนหลังส่งตรวจ ต้องส่งคืนเป็นร่างแล้วส่งใหม่'};
    if (action === 'SUBMIT' && ctx.draftPending) return {action, reason: 'มีข้อมูลค้างหรือการวิเคราะห์ไม่สำเร็จ ต้องเก็บ/คืนค่าก่อนส่งตรวจ'};
    if (action === 'SUBMIT' && !ctx.contentHash) return {action, reason: 'ต้องมี hash ของร่างปัจจุบัน'};
    if (t.independentOfSubmitter && submitterOf(r) === actor.uid) return {action, reason: 'ผู้ตรวจ/ผู้อนุมัติต้องไม่ใช่ผู้ส่งตรวจ'};
    if (action === 'RETURN' && r.state === 'APPROVED_INTERNAL' && !actor.roles.some(x => ['Admin', 'SuperAdmin', 'MasterAdmin'].includes(x))) return {action, reason: 'การส่งคืนหลังอนุมัติต้องเป็น Admin ขึ้นไป'};
    return {action, reason: null};
  });
}
export function applyReviewAction(r: ReviewRecord, action: ReviewAction, actor: ReviewActor, ctx: ReviewContext, note = '', now = Date.now()): ReviewRecord {
  validateReviewRecord(r);
  const check = allowedReviewActions(r, actor, ctx).find(a => a.action === action)!;
  if (check.reason) throw Error(check.reason);
  if ((action === 'RETURN' || action === 'REVISE') && !note.trim()) throw Error('การส่งคืน/เปิดรอบใหม่ต้องระบุเหตุผล');
  const to = TRANSITIONS[action].to!;
  const event: ReviewEvent = {action, from: r.state, to, uid: actor.uid, name: actor.name, roles: actor.roles, atMs: now, note: note.trim(), contentHash: ctx.contentHash, engineVersion: ctx.engineVersion};
  const starting = r.state === 'DRAFT';
  const next: ReviewRecord = {...r, state: to, contentHash: to === 'DRAFT' ? '' : starting ? ctx.contentHash : r.contentHash,
    engineVersion: to === 'DRAFT' ? '' : starting ? ctx.engineVersion : r.engineVersion, submittedBy: to === 'DRAFT' ? '' : starting ? actor.uid : r.submittedBy,
    history: [...r.history, event], updatedAtMs: now};
  validateReviewRecord(next);
  return next;
}
/** Content identity used by the workflow: the authored draft only (results are recomputed from it). */
export const reviewContentOf = (model: unknown) => canonical(model);
