import {clone, finite, identifier, record, signed} from './common.js';
import type {analyzeLinearFrame} from './frameLinear.js';

/** Explicit serviceability evidence for one actual frame node and one DOF.
 * This is a comparison gate only. It does not create a code limit, a support
 * settlement law or construction acceptance from a typed value.
 */
export const FRAME_SLS_ENGINE = 'frame-sls-1' as const;
export const SLS_QUANTITIES = ['TRANSLATION_X', 'TRANSLATION_Y', 'TRANSLATION_Z', 'ROTATION_X', 'ROTATION_Y', 'ROTATION_Z'] as const;
export type SlsQuantity = typeof SLS_QUANTITIES[number];
export type SlsUnit = 'MM' | 'RAD';
export type SlsEvidenceStatus = 'ENGINEER_REVIEWED' | 'REFERENCE_ONLY';

export interface SlsLimitEvidence {
  schemaVersion: typeof FRAME_SLS_ENGINE;
  nodeId: string;
  quantity: SlsQuantity | null;
  unit: SlsUnit | null;
  limit: number | null;
  actionBasis: 'SERVICE' | null;
  methodId: string;
  sourceRef: string;
  sourceRevision: string;
  evidenceRef: string;
  reviewRef: string;
  status: SlsEvidenceStatus;
}

export interface SlsAssessment {
  nodeId: string;
  quantity: SlsQuantity;
  demand: number | null;
  evidence: SlsLimitEvidence | null;
  status: 'INCOMPLETE' | 'SCREENED' | 'FAIL';
  utilization: number | null;
  blockers: string[];
}

export interface FrameSlsScreen {
  engineVersion: typeof FRAME_SLS_ENGINE;
  status: 'INCOMPLETE' | 'SCREENED' | 'FAIL';
  inputRevision: string;
  stageId: string;
  loadCaseId: string;
  records: SlsAssessment[];
  blockers: string[];
  constructionRelease: 'NO_GO';
}

export const emptySlsLimitEvidence = (nodeId = '', quantity: SlsQuantity | null = null): SlsLimitEvidence => ({
  schemaVersion: FRAME_SLS_ENGINE, nodeId, quantity,
  unit: quantity === null ? null : (quantity.startsWith('TRANSLATION_') ? 'MM' : 'RAD'),
  limit: null, actionBasis: null, methodId: '', sourceRef: '', sourceRevision: '', evidenceRef: '', reviewRef: '', status: 'REFERENCE_ONLY',
});

function text(value: unknown, name: string) {
  if (typeof value !== 'string' || value.length > 2000) throw Error(`Invalid SLS ${name}`);
}
function exact(raw: unknown) {
  const r = record(raw), keys = Object.keys(emptySlsLimitEvidence());
  if (keys.some(k => !Object.hasOwn(r, k)) || Object.keys(r).some(k => !keys.includes(k))) throw Error('SLS limit unknown/missing fields or authority metadata');
  return r as unknown as SlsLimitEvidence;
}

export function validateSlsLimitEvidence(raw: unknown): asserts raw is SlsLimitEvidence {
  const e = exact(raw);
  if (e.schemaVersion !== FRAME_SLS_ENGINE || ![null, ...SLS_QUANTITIES].includes(e.quantity) || ![null, 'MM', 'RAD'].includes(e.unit) ||
      ![null, 'SERVICE'].includes(e.actionBasis) || !['ENGINEER_REVIEWED', 'REFERENCE_ONLY'].includes(e.status)) throw Error('Invalid SLS limit schema/basis/status');
  text(e.nodeId, 'node'); if (e.nodeId.trim()) identifier(e.nodeId, 'node');
  for (const [value, name] of [[e.methodId, 'method'], [e.sourceRef, 'source'], [e.sourceRevision, 'source revision'], [e.evidenceRef, 'evidence'], [e.reviewRef, 'review']] as const) text(value, name);
  if (e.quantity !== null) {
    const expectedUnit: SlsUnit = e.quantity.startsWith('TRANSLATION_') ? 'MM' : 'RAD';
    if (e.unit !== expectedUnit) throw Error(`${e.quantity}: explicit ${expectedUnit} unit required`);
  }
  if (e.limit !== null) finite(e.limit, 'SLS limit', true);
  if (e.status === 'ENGINEER_REVIEWED' && !e.reviewRef.trim()) throw Error('Reviewed SLS limit requires review reference');
}

export function assessSlsLimit(raw: SlsLimitEvidence | null, nodeId: string, quantity: SlsQuantity, demand: number | null, expectedRevision: string, actionBasis: 'SERVICE' | 'FACTORED' | null): SlsAssessment {
  if (demand !== null) {signed(demand, `${nodeId}:${quantity} demand`); if (demand < 0) throw Error(`${nodeId}:${quantity} demand must be nonnegative`);}
  const blockers: string[] = [];
  if (demand === null) blockers.push('SLS_DEMAND_UNAVAILABLE_NO_ZERO_ROTATION_ASSUMED');
  if (!raw) blockers.push('SLS_LIMIT_EVIDENCE_REQUIRED');
  else {
    validateSlsLimitEvidence(raw);
    if (raw.nodeId !== nodeId) blockers.push('SLS_NODE_MISMATCH');
    if (raw.quantity !== quantity) blockers.push('SLS_QUANTITY_MISMATCH');
    if (raw.status !== 'ENGINEER_REVIEWED') blockers.push('SLS_SOURCE_IS_REFERENCE_ONLY');
    if (!raw.methodId.trim() || !raw.sourceRef.trim() || !raw.sourceRevision.trim() || !raw.evidenceRef.trim()) blockers.push('SLS_METHOD_SOURCE_REVISION_AND_EVIDENCE_REQUIRED');
    if (!raw.reviewRef.trim()) blockers.push('SLS_ENGINEER_REVIEW_REFERENCE_REQUIRED');
    if (raw.sourceRevision !== expectedRevision) blockers.push('SLS_SOURCE_REVISION_MISMATCH');
    if (raw.actionBasis !== 'SERVICE' || actionBasis !== 'SERVICE') blockers.push('SLS_REQUIRES_MATCHED_SERVICE_ACTION_BASIS');
    if (raw.limit === null) blockers.push('SLS_LIMIT_UNKNOWN');
    const expectedUnit: SlsUnit = quantity.startsWith('TRANSLATION_') ? 'MM' : 'RAD';
    if (raw.unit !== expectedUnit) blockers.push('SLS_UNIT_MISMATCH');
    if (!blockers.length) {
      const limit = raw.limit!;
      if (limit === 0 && demand! > 0) return {nodeId, quantity, demand, evidence: raw, status: 'FAIL', utilization: null, blockers: ['SLS_ZERO_LIMIT_EXCEEDED']};
      const utilization = limit === 0 ? 0 : demand! / limit;
      if (utilization > 1) return {nodeId, quantity, demand, evidence: raw, status: 'FAIL', utilization, blockers: ['SLS_LIMIT_EXCEEDED']};
      return {nodeId, quantity, demand, evidence: raw, status: 'SCREENED', utilization, blockers: ['SLS_SCREEN_IS_NOT_CONSTRUCTION_APPROVAL']};
    }
  }
  return {nodeId, quantity, demand, evidence: raw, status: 'INCOMPLETE', utilization: null, blockers};
}

type LinearAnalysis = ReturnType<typeof analyzeLinearFrame>;

export function screenFrameSls(analysis: LinearAnalysis, limits: SlsLimitEvidence[], actionBasis: 'SERVICE' | 'FACTORED' | null): FrameSlsScreen {
  const blockers = ['FRAME_SLS_REQUIRES_EXPLICIT_SERVICE_LIMITS', 'FRAME_SLS_DEMANDS_ARE_DISPLACEMENTS_ONLY_NOT_CONSTRUCTION_APPROVAL'];
  const records: SlsAssessment[] = [];
  const known = new Set(analysis.input.nodes.map(n => n.id));
  limits.forEach(validateSlsLimitEvidence);
  limits.filter(e => e.nodeId.trim() && (!known.has(e.nodeId) || e.quantity === null)).forEach(e => blockers.push(`${e.nodeId || 'UNASSIGNED'}:SLS_EVIDENCE_NODE_OR_QUANTITY_NOT_IN_CURRENT_FRAME`));
  for (const node of analysis.nodes) for (const [index, quantity] of SLS_QUANTITIES.entries()) {
    const demand = quantity.startsWith('TRANSLATION_') ? Math.abs(node.displacementMm[index]) : node.rotationRad[index - 3] === null ? null : Math.abs(node.rotationRad[index - 3]!);
    const matches = limits.filter(e => e.nodeId === node.id && e.quantity === quantity);
    records.push(matches.length > 1 ? {nodeId: node.id, quantity, demand, evidence: null, status: 'INCOMPLETE', utilization: null, blockers: ['DUPLICATE_SLS_LIMIT_RECORD']} : assessSlsLimit(matches[0] ?? null, node.id, quantity, demand, analysis.input.revisionId, actionBasis));
  }
  const status: FrameSlsScreen['status'] = records.some(r => r.status === 'FAIL') ? 'FAIL' : records.length > 0 && records.every(r => r.status === 'SCREENED') ? 'SCREENED' : 'INCOMPLETE';
  if (status === 'SCREENED') blockers.push('FRAME_SLS_SCREENING_IS_NOT_CONSTRUCTION_APPROVAL');
  return {engineVersion: FRAME_SLS_ENGINE, status, inputRevision: analysis.input.revisionId, stageId: analysis.input.stageId, loadCaseId: analysis.input.loadCaseId,
    records: clone(records), blockers: [...new Set(blockers)], constructionRelease: 'NO_GO'};
}
