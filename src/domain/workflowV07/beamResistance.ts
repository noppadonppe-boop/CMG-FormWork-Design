import {canonical, finite, record, signed} from './common.js';

export const BEAM_MEMBER_EVIDENCE_SCHEMA = 'beam-member-evidence-1' as const;
export const BEAM_MEMBER_QUANTITIES = ['FLEXURE', 'SHEAR', 'DEFLECTION'] as const;
export type BeamMemberQuantity = typeof BEAM_MEMBER_QUANTITIES[number];
export type BeamMemberActionBasis = 'SERVICE' | 'FACTORED' | null;
export type BeamMemberLimitBasis = 'ALLOWABLE' | 'DESIGN' | 'SLS_LIMIT' | null;
export type BeamMemberUnit = 'NMM' | 'N' | 'MM';
export type BeamMemberEvidenceStatus = 'ENGINEER_REVIEWED' | 'REFERENCE_ONLY';

export interface BeamMemberEvidence {
  schemaVersion: typeof BEAM_MEMBER_EVIDENCE_SCHEMA;
  quantity: BeamMemberQuantity | null;
  unit: BeamMemberUnit | null;
  limit: number | null;
  actionBasis: BeamMemberActionBasis;
  limitBasis: BeamMemberLimitBasis;
  memberEvidenceRef: string;
  scopeEvidenceRef: string;
  maximumUnsupportedSpanMm: number | null;
  methodId: string;
  sourceRef: string;
  sourceRevision: string;
  evidenceRef: string;
  reviewRef: string;
  status: BeamMemberEvidenceStatus;
}

export interface BeamMemberCheck {
  quantity: BeamMemberQuantity;
  demand: number;
  limit: number | null;
  unit: BeamMemberUnit;
  evidence: BeamMemberEvidence | null;
  status: 'INCOMPLETE' | 'SCREENED' | 'FAIL';
  utilization: number | null;
  blockers: string[];
}

export interface BeamMemberResistanceScreen {
  engineVersion: typeof BEAM_MEMBER_EVIDENCE_SCHEMA;
  status: 'INCOMPLETE' | 'SCREENED' | 'FAIL';
  actionBasis: BeamMemberActionBasis;
  maximumUnsupportedSpanMm: number;
  checks: BeamMemberCheck[];
  blockers: string[];
  constructionRelease: 'NO_GO';
}

export function emptyBeamMemberEvidence(quantity: BeamMemberQuantity | null = null, memberEvidenceRef = ''): BeamMemberEvidence {
  const unit: BeamMemberUnit | null = quantity === 'FLEXURE' ? 'NMM' : quantity === 'SHEAR' ? 'N' : quantity === 'DEFLECTION' ? 'MM' : null;
  return {schemaVersion: BEAM_MEMBER_EVIDENCE_SCHEMA, quantity, unit, limit: null, actionBasis: null, limitBasis: null,
    memberEvidenceRef, scopeEvidenceRef: '', maximumUnsupportedSpanMm: null, methodId: '', sourceRef: '', sourceRevision: '',
    evidenceRef: '', reviewRef: '', status: 'REFERENCE_ONLY'};
}

export function beamMemberEvidenceReference(role: string, rawMember: unknown) {
  const {resistanceEvidence: _evidence, ...member} = record(rawMember);
  return canonical({role, member: {...member, binding: member.binding ?? null}});
}

function exact(raw: unknown) {
  const r = record(raw), keys = Object.keys(emptyBeamMemberEvidence());
  if (keys.some(k => !Object.hasOwn(r, k)) || Object.keys(r).some(k => !keys.includes(k))) throw Error('Beam member evidence unknown/missing fields or authority metadata');
  return r as unknown as BeamMemberEvidence;
}
function text(value: unknown, name: string) {
  if (typeof value !== 'string' || value.length > 2000) throw Error(`Invalid beam member evidence ${name}`);
}
function expectedUnit(quantity: BeamMemberQuantity): BeamMemberUnit {
  return quantity === 'FLEXURE' ? 'NMM' : quantity === 'SHEAR' ? 'N' : 'MM';
}

export function validateBeamMemberEvidence(raw: unknown): asserts raw is BeamMemberEvidence {
  const e = exact(raw);
  if (e.schemaVersion !== BEAM_MEMBER_EVIDENCE_SCHEMA ||
      (e.quantity !== null && !BEAM_MEMBER_QUANTITIES.includes(e.quantity)) ||
      (e.unit !== null && !['NMM', 'N', 'MM'].includes(e.unit)) ||
      ![null, 'SERVICE', 'FACTORED'].includes(e.actionBasis) ||
      ![null, 'ALLOWABLE', 'DESIGN', 'SLS_LIMIT'].includes(e.limitBasis) ||
      !['ENGINEER_REVIEWED', 'REFERENCE_ONLY'].includes(e.status)) throw Error('Invalid beam member evidence schema/basis/status');
  for (const [value, name] of [[e.memberEvidenceRef, 'member scope'], [e.scopeEvidenceRef, 'span scope'], [e.methodId, 'method'],
    [e.sourceRef, 'source'], [e.sourceRevision, 'source revision'], [e.evidenceRef, 'evidence'], [e.reviewRef, 'review']] as const) text(value, name);
  if (e.quantity !== null && e.unit !== expectedUnit(e.quantity)) throw Error(`${e.quantity}: explicit ${expectedUnit(e.quantity)} unit required`);
  if (e.limit !== null) finite(e.limit, 'beam member limit', true);
  if (e.maximumUnsupportedSpanMm !== null) finite(e.maximumUnsupportedSpanMm, 'maximum unsupported span');
  if (e.status === 'ENGINEER_REVIEWED' && !e.reviewRef.trim()) throw Error('Reviewed beam member evidence requires review reference');
}

function assess(raw: BeamMemberEvidence | null, quantity: BeamMemberQuantity, demand: number, actionBasis: BeamMemberActionBasis,
  expectedMemberEvidenceRef: string | null, maximumUnsupportedSpanMm: number): BeamMemberCheck {
  signed(demand, `${quantity} demand`);
  if (demand < 0) throw Error(`${quantity} demand must be nonnegative`);
  const unit = expectedUnit(quantity), blockers: string[] = [];
  if (!raw) blockers.push('BEAM_MEMBER_EVIDENCE_REQUIRED');
  else {
    validateBeamMemberEvidence(raw);
    if (raw.quantity !== quantity) blockers.push('BEAM_MEMBER_QUANTITY_MISMATCH');
    if (raw.unit !== unit) blockers.push('BEAM_MEMBER_UNIT_MISMATCH');
    if (raw.status !== 'ENGINEER_REVIEWED') blockers.push('BEAM_MEMBER_SOURCE_IS_REFERENCE_ONLY');
    if (!raw.memberEvidenceRef.trim() || !raw.scopeEvidenceRef.trim() || !raw.methodId.trim() || !raw.sourceRef.trim() ||
        !raw.sourceRevision.trim() || !raw.evidenceRef.trim() || !raw.reviewRef.trim()) blockers.push('BEAM_MEMBER_METHOD_MEMBER_SCOPE_SPAN_SCOPE_AND_REVIEW_EVIDENCE_REQUIRED');
    if (!expectedMemberEvidenceRef?.trim()) blockers.push('BEAM_MEMBER_INPUT_SCOPE_EVIDENCE_REQUIRED');
    else if (raw.memberEvidenceRef !== expectedMemberEvidenceRef) blockers.push('BEAM_MEMBER_SECTION_ORIENTATION_EVIDENCE_MISMATCH');
    if (raw.actionBasis !== actionBasis) blockers.push('BEAM_MEMBER_ACTION_BASIS_MISMATCH');
    if (raw.maximumUnsupportedSpanMm === null) blockers.push('BEAM_MEMBER_MAXIMUM_UNSUPPORTED_SPAN_REQUIRED');
    else if (maximumUnsupportedSpanMm > raw.maximumUnsupportedSpanMm) blockers.push('ACTUAL_UNSUPPORTED_SPAN_EXCEEDS_REVIEWED_EVIDENCE_SCOPE');
    const expectedBasis = quantity === 'DEFLECTION' ? 'SLS_LIMIT' : actionBasis === 'SERVICE' ? 'ALLOWABLE' : actionBasis === 'FACTORED' ? 'DESIGN' : null;
    if (!expectedBasis || raw.limitBasis !== expectedBasis) blockers.push(quantity === 'DEFLECTION' ? 'DEFLECTION_REQUIRES_SERVICE_SLS_LIMIT' : 'RESISTANCE_BASIS_NOT_COMPARABLE_WITH_ACTION_BASIS');
    if (quantity === 'DEFLECTION' && actionBasis !== 'SERVICE') blockers.push('DEFLECTION_CHECK_REQUIRES_SERVICE_ACTIONS');
    if (raw.limit === null) blockers.push('BEAM_MEMBER_LIMIT_UNKNOWN');
    if (!blockers.length) {
      const limit = raw.limit!;
      if (limit === 0 && demand > 0) return {quantity, demand, limit, unit, evidence: raw, status: 'FAIL', utilization: null, blockers: ['DECLARED_ZERO_MEMBER_LIMIT_EXCEEDED']};
      const utilization = limit === 0 ? 0 : demand / limit;
      if (utilization > 1) return {quantity, demand, limit, unit, evidence: raw, status: 'FAIL', utilization, blockers: ['DECLARED_BEAM_MEMBER_LIMIT_EXCEEDED']};
      return {quantity, demand, limit, unit, evidence: raw, status: 'SCREENED', utilization, blockers: ['BEAM_MEMBER_SCREEN_IS_NOT_CONSTRUCTION_APPROVAL']};
    }
  }
  return {quantity, demand, limit: raw?.limit ?? null, unit, evidence: raw, status: 'INCOMPLETE', utilization: null, blockers};
}

export function screenBeamMemberResistance(input: {
  evidence?: BeamMemberEvidence[] | null;
  actionBasis?: BeamMemberActionBasis;
  memberEvidenceRef?: string | null;
  maximumUnsupportedSpanMm: number;
  demands: Record<BeamMemberQuantity, number>;
}): BeamMemberResistanceScreen {
  const actionBasis = input.actionBasis ?? null;
  finite(input.maximumUnsupportedSpanMm, 'maximum unsupported span');
  const evidence = input.evidence ?? [];
  if (!Array.isArray(evidence) || evidence.length > BEAM_MEMBER_QUANTITIES.length) throw Error('Invalid beam member evidence count');
  evidence.forEach(validateBeamMemberEvidence);
  const checks = BEAM_MEMBER_QUANTITIES.map(quantity => {
    const matches = evidence.filter(item => item.quantity === quantity);
    if (matches.length > 1) return {quantity, demand: input.demands[quantity], limit: null, unit: expectedUnit(quantity), evidence: null,
      status: 'INCOMPLETE' as const, utilization: null, blockers: ['DUPLICATE_BEAM_MEMBER_EVIDENCE_QUANTITY']};
    return assess(matches[0] ?? null, quantity, input.demands[quantity], actionBasis, input.memberEvidenceRef ?? null, input.maximumUnsupportedSpanMm);
  });
  const unassigned = evidence.some(item => item.quantity === null);
  const status: BeamMemberResistanceScreen['status'] = checks.some(check => check.status === 'FAIL') ? 'FAIL' :
    checks.every(check => check.status === 'SCREENED') && !unassigned ? 'SCREENED' : 'INCOMPLETE';
  const blockers = [...new Set([
    ...checks.flatMap(check => check.blockers),
    ...(unassigned ? ['UNASSIGNED_BEAM_MEMBER_EVIDENCE_ROW'] : []),
    'BEAM_MEMBER_BEARING_CONNECTION_LOCAL_STABILITY_AND_SYSTEM_CHECKS_REQUIRED',
    'BEAM_MEMBER_SCREEN_IS_NOT_CONSTRUCTION_APPROVAL',
  ])];
  return {engineVersion: BEAM_MEMBER_EVIDENCE_SCHEMA, status, actionBasis, maximumUnsupportedSpanMm: input.maximumUnsupportedSpanMm,
    checks, blockers, constructionRelease: 'NO_GO'};
}
