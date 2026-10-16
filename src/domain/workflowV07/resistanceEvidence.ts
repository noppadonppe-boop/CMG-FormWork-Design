import {finite, identifier, record, signed} from './common.js';

/** Explicit evidence record for a single member/connection resistance quantity.
 *
 * The record is intentionally a data gate.  It does not identify a product,
 * convert characteristic/test values, or grant construction authority.
 */
export const RESISTANCE_EVIDENCE_SCHEMA = 'frame-resistance-1' as const;
export const RESISTANCE_QUANTITIES = ['AXIAL_COMPRESSION', 'AXIAL_TENSION', 'SHEAR_Y', 'SHEAR_Z', 'TORSION', 'MOMENT_Y', 'MOMENT_Z'] as const;
export type ResistanceQuantity = typeof RESISTANCE_QUANTITIES[number];
export type ResistanceUnit = 'N' | 'NMM';
export type ResistanceActionBasis = 'SERVICE' | 'FACTORED' | null;
export type ResistanceBasis = 'ALLOWABLE' | 'DESIGN' | 'CHARACTERISTIC' | 'ULTIMATE_TEST' | null;
export type ResistanceEvidenceStatus = 'ENGINEER_REVIEWED' | 'REFERENCE_ONLY';

export interface ResistanceEvidence {
  schemaVersion: typeof RESISTANCE_EVIDENCE_SCHEMA;
  quantity: ResistanceQuantity | null;
  unit: ResistanceUnit | null;
  capacity: number | null;
  actionBasis: ResistanceActionBasis;
  resistanceBasis: ResistanceBasis;
  methodId: string;
  sourceRef: string;
  sourceRevision: string;
  evidenceRef: string;
  reviewRef: string;
  status: ResistanceEvidenceStatus;
}

export interface ResistanceAssessment {
  quantity: ResistanceQuantity;
  demand: number;
  evidence: ResistanceEvidence | null;
  status: 'INCOMPLETE' | 'SCREENED' | 'FAIL';
  utilization: number | null;
  blockers: string[];
}

export const emptyResistanceEvidence = (quantity: ResistanceQuantity | null = null): ResistanceEvidence => ({
  schemaVersion: RESISTANCE_EVIDENCE_SCHEMA, quantity, unit: quantity === null ? null : (['MOMENT_Y', 'MOMENT_Z', 'TORSION'].includes(quantity) ? 'NMM' : 'N'),
  capacity: null, actionBasis: null, resistanceBasis: null, methodId: '', sourceRef: '', sourceRevision: '', evidenceRef: '', reviewRef: '', status: 'REFERENCE_ONLY',
});

function text(value: unknown, name: string) {if (typeof value !== 'string' || value.length > 2000) throw Error(`Invalid resistance ${name}`);}
function exact(raw: unknown) {
  const r = record(raw), keys = Object.keys(emptyResistanceEvidence());
  if (keys.some(k => !Object.hasOwn(r, k)) || Object.keys(r).some(k => !keys.includes(k))) throw Error('Resistance evidence unknown/missing fields or authority metadata');
  return r as unknown as ResistanceEvidence;
}

export function validateResistanceEvidence(raw: unknown): asserts raw is ResistanceEvidence {
  const e = exact(raw);
  if (e.schemaVersion !== RESISTANCE_EVIDENCE_SCHEMA || (e.quantity !== null && !RESISTANCE_QUANTITIES.includes(e.quantity)) || (e.unit !== null && !['N', 'NMM'].includes(e.unit)) ||
      ![null, 'SERVICE', 'FACTORED'].includes(e.actionBasis) || ![null, 'ALLOWABLE', 'DESIGN', 'CHARACTERISTIC', 'ULTIMATE_TEST'].includes(e.resistanceBasis) ||
      !['ENGINEER_REVIEWED', 'REFERENCE_ONLY'].includes(e.status)) throw Error('Invalid resistance evidence schema/basis/status');
  for (const [value, name] of [[e.methodId, 'method'], [e.sourceRef, 'source'], [e.sourceRevision, 'source revision'], [e.evidenceRef, 'evidence'], [e.reviewRef, 'review']] as const) text(value, name);
  if (e.quantity !== null) {
    const expectedUnit: ResistanceUnit = ['MOMENT_Y', 'MOMENT_Z', 'TORSION'].includes(e.quantity) ? 'NMM' : 'N';
    if (e.unit !== expectedUnit) throw Error(`${e.quantity}: explicit ${expectedUnit} unit required`);
  }
  if (e.capacity !== null) finite(e.capacity, 'resistance capacity', true);
  if (e.status === 'ENGINEER_REVIEWED' && !e.reviewRef.trim()) throw Error('Reviewed resistance evidence requires review reference');
}

function expectedBasis(actionBasis: ResistanceActionBasis): ResistanceBasis {
  return actionBasis === 'SERVICE' ? 'ALLOWABLE' : actionBasis === 'FACTORED' ? 'DESIGN' : null;
}

/** Compare one nonnegative demand with one explicit evidence row.  A missing,
 * stale, non-reviewed, incompatible or characteristic/test record remains
 * INCOMPLETE; it is never converted to an allowable/design capacity. */
export function assessResistanceEvidence(raw: ResistanceEvidence | null, quantity: ResistanceQuantity, demand: number, actionBasis: ResistanceActionBasis, expectedRevision: string | null = null): ResistanceAssessment {
  signed(demand, `${quantity} demand`); if (demand < 0) throw Error(`${quantity} demand must be nonnegative`);
  const blockers: string[] = [];
  if (!raw) blockers.push('RESISTANCE_EVIDENCE_REQUIRED');
  else {
    validateResistanceEvidence(raw);
    if (raw.quantity !== quantity) blockers.push('RESISTANCE_QUANTITY_MISMATCH');
    if (raw.status !== 'ENGINEER_REVIEWED') blockers.push('RESISTANCE_SOURCE_IS_REFERENCE_ONLY');
    if (!raw.methodId.trim() || !raw.sourceRef.trim() || !raw.sourceRevision.trim() || !raw.evidenceRef.trim()) blockers.push('RESISTANCE_METHOD_SOURCE_REVISION_AND_EVIDENCE_REQUIRED');
    if (!raw.reviewRef.trim()) blockers.push('ENGINEER_REVIEW_REFERENCE_REQUIRED');
    if (raw.actionBasis !== actionBasis) blockers.push('RESISTANCE_ACTION_BASIS_MISMATCH');
    if (expectedRevision !== null && raw.sourceRevision !== expectedRevision) blockers.push('RESISTANCE_SOURCE_REVISION_MISMATCH');
    const expected = expectedBasis(actionBasis);
    if (!expected || raw.resistanceBasis !== expected) blockers.push('RESISTANCE_BASIS_NOT_COMPARABLE_WITH_ACTION_BASIS');
    if (raw.capacity === null) blockers.push('RESISTANCE_CAPACITY_UNKNOWN');
    const expectedUnit: ResistanceUnit = ['MOMENT_Y', 'MOMENT_Z', 'TORSION'].includes(quantity) ? 'NMM' : 'N';
    if (raw.unit !== expectedUnit) blockers.push('RESISTANCE_UNIT_MISMATCH');
    if (!blockers.length) {
      const capacity = raw.capacity!;
      if (capacity === 0 && demand > 0) return {quantity, demand, evidence: raw, status: 'FAIL', utilization: null, blockers: ['DECLARED_ZERO_RESISTANCE_EXCEEDED']};
      const utilization = capacity === 0 ? 0 : demand / capacity;
      if (utilization > 1) return {quantity, demand, evidence: raw, status: 'FAIL', utilization, blockers: ['DECLARED_RESISTANCE_EXCEEDED']};
      return {quantity, demand, evidence: raw, status: 'SCREENED', utilization, blockers: ['RESISTANCE_SCREEN_IS_NOT_CONSTRUCTION_APPROVAL']};
    }
  }
  return {quantity, demand, evidence: raw, status: 'INCOMPLETE', utilization: null, blockers};
}
