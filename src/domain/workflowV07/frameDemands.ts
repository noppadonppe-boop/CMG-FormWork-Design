import {clone, finite, signed} from './common.js';
import type {analyzeLinearFrame} from './frameLinear.js';
import type {SecondOrderAnalysis} from './frameSecondOrder.js';
import {assessResistanceEvidence, RESISTANCE_QUANTITIES, type ResistanceAssessment, type ResistanceEvidence, type ResistanceQuantity, type ResistanceBasis} from './resistanceEvidence.js';

/** Structured member actions for the v0.7 Ringlock check ledger.
 *
 * This module deliberately stops at demand extraction.  It does not turn a
 * nominal section, supplier reference or test value into a resistance.  Every
 * quantity remains INCOMPLETE until a compatible, reviewed resistance evidence
 * row is supplied for the same member and analyzed revision; a screened row is
 * still a non-authoritative preview.
 */
export const FRAME_MEMBER_DEMAND_ENGINE = 'frame-member-demand-1' as const;
export type FrameMemberCheckId = 'RINGLOCK-05' | 'RINGLOCK-06' | 'RINGLOCK-08' | 'RINGLOCK-09' | 'RINGLOCK-10' | 'RINGLOCK-11' | 'FRAME-MEMBER-DEMAND';
export type FrameDemandBasis = 'SERVICE' | 'FACTORED' | null;
type LinearAnalysis = ReturnType<typeof analyzeLinearFrame>;

export interface FrameEndDemand {
  forceN: [number, number, number];
  momentNmm: [number, number, number];
}

export interface FrameMemberDemandRecord {
  memberId: string;
  role: string | null;
  kind: string;
  checkId: FrameMemberCheckId;
  revisionId: string;
  stageId: string;
  loadCaseId: string;
  actionBasis: FrameDemandBasis;
  endI: FrameEndDemand;
  endJ: FrameEndDemand;
  signedAxialByEndN: [number, number];
  secondOrderAxialForceN: number | null;
  envelope: {
    axialAbsN: number;
    shearYAbsN: number;
    shearZAbsN: number;
    torsionAbsNmm: number;
    momentYAbsNmm: number;
    momentZAbsNmm: number;
  };
  status: 'INCOMPLETE' | 'SCREENED' | 'FAIL';
  resistanceBasis: ResistanceBasis;
  utilization: number | null;
  resistanceChecks: ResistanceAssessment[];
  missingInputs: string[];
}

export interface FrameMemberDemandScreen {
  engineVersion: typeof FRAME_MEMBER_DEMAND_ENGINE;
  status: 'INCOMPLETE' | 'SCREENED' | 'FAIL';
  inputRevision: string;
  stageId: string;
  loadCaseId: string;
  actionBasis: FrameDemandBasis;
  records: FrameMemberDemandRecord[];
  blockers: string[];
  constructionRelease: 'NO_GO';
}

const checkForRole = (role: string | null): FrameMemberCheckId => {
  switch (role) {
    case 'HEAD_JACK': return 'RINGLOCK-05';
    case 'BASE_JACK': return 'RINGLOCK-06';
    case 'STANDARD': return 'RINGLOCK-08';
    case 'SPIGOT': return 'RINGLOCK-09';
    case 'LEDGER':
    case 'LEDGER_JOINT': return 'RINGLOCK-10';
    case 'BRACE':
    case 'BRACE_JOINT': return 'RINGLOCK-11';
    default: return 'FRAME-MEMBER-DEMAND';
  }
};

const missingForRole = (role: string | null): string[] => {
  const missing = ['MEMBER_RESISTANCE_RULE_PACK_REQUIRED', 'COMPATIBLE_RESISTANCE_BASIS_AND_FACTOR_OWNERSHIP_REQUIRED', 'CONNECTION_AND_END_CONDITION_RESISTANCE_REQUIRED'];
  if (role === 'STANDARD') missing.push('STANDARD_EFFECTIVE_SECTION_AND_BUCKLING_RESISTANCE_REQUIRED');
  if (role === 'BRACE' || role === 'BRACE_JOINT') missing.push('BRACE_TENSION_COMPRESSION_AND_END_RESISTANCE_REQUIRED');
  if (role === 'LEDGER' || role === 'LEDGER_JOINT') missing.push('LEDGER_MEMBER_AND_ROSETTE_INTERACTION_RESISTANCE_REQUIRED');
  if (role === 'SPIGOT') missing.push('SPIGOT_N_M_INTERACTION_AND_SLACK_RESISTANCE_REQUIRED');
  if (role === 'HEAD_JACK' || role === 'BASE_JACK') missing.push('JACK_THREAD_PLATE_WELD_AND_ECCENTRIC_RESISTANCE_REQUIRED');
  return missing;
};

function endDemand(raw: unknown, label: string): FrameEndDemand {
  if (!Array.isArray(raw) || raw.length !== 6) throw Error(`${label}: six local actions required`);
  const values = raw.map((v, i) => signed(v, `${label}[${i}]`));
  return {forceN: values.slice(0, 3) as [number, number, number], momentNmm: values.slice(3, 6) as [number, number, number]};
}

function envelope(a: FrameEndDemand, b: FrameEndDemand, forceIndex: 0 | 1 | 2) {
  return Math.max(Math.abs(a.forceN[forceIndex]), Math.abs(b.forceN[forceIndex]));
}

function momentEnvelope(a: FrameEndDemand, b: FrameEndDemand, index: 0 | 1 | 2) {
  return Math.max(Math.abs(a.momentNmm[index]), Math.abs(b.momentNmm[index]));
}

/** Extract member N/M/V/T actions from a current linear result.  P–Delta
 * contributes its explicit axial result when available; its end bending/shear
 * resultants are intentionally not reconstructed here and remain a stated gap.
 */
export function screenFrameMemberDemands(
  analysis: LinearAnalysis,
  secondOrder: Pick<SecondOrderAnalysis, 'elements'> | null,
  roles: {id: string; role: string | null; resistance?: ResistanceEvidence[] | null}[],
  actionBasis: FrameDemandBasis,
): FrameMemberDemandScreen {
  const roleById = new Map(roles.map(e => [e.id, e.role]));
  const resistanceById = new Map(roles.map(e => [e.id, e.resistance ?? []]));
  const secondById = new Map((secondOrder?.elements ?? []).map(e => [e.id, e.secondOrderAxialForceN]));
  const records = analysis.elements.map(element => {
    const endI = endDemand(element.localNodalActionsOnElement.slice(0, 6), `${element.id}:I`);
    const endJ = endDemand(element.localNodalActionsOnElement.slice(6, 12), `${element.id}:J`);
    const role = roleById.get(element.id) ?? null;
    const axial = [endI.forceN[0], endJ.forceN[0]] as [number, number];
    const secondOrderAxialForceN = secondById.get(element.id) ?? null;
    const envelopeValues = {axialAbsN: Math.max(...axial.map(Math.abs)), shearYAbsN: envelope(endI, endJ, 1),
      shearZAbsN: envelope(endI, endJ, 2), torsionAbsNmm: momentEnvelope(endI, endJ, 0),
      momentYAbsNmm: momentEnvelope(endI, endJ, 1), momentZAbsNmm: momentEnvelope(endI, endJ, 2)};
    const signedAxialForResistance = secondOrderAxialForceN === null ? axial : [secondOrderAxialForceN, secondOrderAxialForceN] as [number, number];
    const demands: Record<ResistanceQuantity, number> = {
      AXIAL_COMPRESSION: Math.max(0, ...signedAxialForResistance.map(v => -v)),
      AXIAL_TENSION: Math.max(0, ...signedAxialForResistance),
      SHEAR_Y: envelopeValues.shearYAbsN, SHEAR_Z: envelopeValues.shearZAbsN,
      TORSION: envelopeValues.torsionAbsNmm, MOMENT_Y: envelopeValues.momentYAbsNmm, MOMENT_Z: envelopeValues.momentZAbsNmm,
    };
    const rawResistance = resistanceById.get(element.id) ?? [];
    const resistanceChecks = RESISTANCE_QUANTITIES.map(quantity => {
      const matches = rawResistance.filter(e => e.quantity === quantity);
      if (matches.length > 1) return {quantity, demand: demands[quantity], evidence: null, status: 'INCOMPLETE' as const, utilization: null,
        blockers: ['DUPLICATE_RESISTANCE_QUANTITY_RECORD']};
      return assessResistanceEvidence(matches[0] ?? null, quantity, demands[quantity], actionBasis, analysis.input.revisionId);
    });
    const resistanceStatuses = resistanceChecks.map(c => c.status);
    const status: FrameMemberDemandRecord['status'] = resistanceStatuses.includes('FAIL') ? 'FAIL' : resistanceStatuses.every(s => s === 'SCREENED') ? 'SCREENED' : 'INCOMPLETE';
    const utilizations = resistanceChecks.map(c => c.utilization).filter((v): v is number => v !== null && Number.isFinite(v));
    const bases = resistanceChecks.map(c => c.evidence?.resistanceBasis ?? null);
    const resistanceBasis: ResistanceBasis = bases.length > 0 && bases.every(b => b !== null && b === bases[0]) ? bases[0] : null;
    const utilization = utilizations.length === resistanceChecks.length ? Math.max(...utilizations) : null;
    const resistanceMissing = resistanceChecks.flatMap(c => c.blockers.filter(b => !b.startsWith('RESISTANCE_SCREEN_IS_NOT_CONSTRUCTION_APPROVAL')));
    const record: FrameMemberDemandRecord = {
      memberId: element.id, role, kind: element.kind, checkId: checkForRole(role), revisionId: analysis.input.revisionId,
      stageId: analysis.input.stageId, loadCaseId: analysis.input.loadCaseId, actionBasis, endI, endJ,
      signedAxialByEndN: axial, secondOrderAxialForceN,
      envelope: envelopeValues, status, resistanceBasis, utilization, resistanceChecks,
      missingInputs: [...missingForRole(role), ...resistanceMissing],
    };
    Object.values(record.envelope).forEach((v, i) => finite(v, `${element.id}:demand envelope ${i}`, true));
    return record;
  });
  const blockers = ['FRAME_MEMBER_DEMANDS_ARE_ACTIONS_ONLY_NOT_RESISTANCE', 'FRAME_MEMBER_DEMAND_END_FORCES_USE_LINEAR_RESULTANTS',
    'FRAME_SECOND_ORDER_END_BENDING_AND_SHEAR_RESULTANTS_NOT_RECONSTRUCTED', 'FRAME_DEMAND_COVERAGE_REQUIRES_EVERY_MEMBER_STAGE_CASE_AND_REVISION'];
  const status: FrameMemberDemandScreen['status'] = records.some(r => r.status === 'FAIL') ? 'FAIL' : records.length > 0 && records.every(r => r.status === 'SCREENED') ? 'SCREENED' : 'INCOMPLETE';
  if (status === 'SCREENED') blockers.push('FRAME_RESISTANCE_SCREENING_IS_NOT_CONSTRUCTION_APPROVAL');
  else blockers.push('FRAME_RESISTANCE_EVIDENCE_REQUIRED_FOR_EACH_MEMBER_QUANTITY');
  return {engineVersion: FRAME_MEMBER_DEMAND_ENGINE, status, inputRevision: analysis.input.revisionId,
    stageId: analysis.input.stageId, loadCaseId: analysis.input.loadCaseId, actionBasis, records: clone(records), blockers,
    constructionRelease: 'NO_GO'};
}
