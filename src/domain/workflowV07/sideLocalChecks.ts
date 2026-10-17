import {beamAt, type BeamAnalysis} from './beam.js';
import {canonical, finite, record, signed} from './common.js';

/** Reviewer-supplied local limits for actual side-form contacts. Demands come only from the
 * current physical analysis. No bearing, buckling, plate, connection or corner capacity is
 * derived here, and SCREENED never grants construction release.
 */
export const SIDE_LOCAL_EVIDENCE_SCHEMA = 'side-local-evidence-1' as const;
export const SIDE_LOCAL_CHECK_KINDS = ['STUD_RAIL_BEARING', 'SUPPORT_PLATE_BEARING', 'SUPPORT_CONNECTION', 'STUD_BUCKLING', 'RAIL_BUCKLING', 'CORNER_OPENING'] as const;
/** Demands that exist only in the coupled tie/frame/corner support model. */
export const SIDE_COUPLED_LIMIT_KINDS = ['CORNER_CONNECTOR', 'RAIL_AXIAL', 'TIE_AXIAL'] as const;
const ALL_KINDS: readonly string[] = [...SIDE_LOCAL_CHECK_KINDS, ...SIDE_COUPLED_LIMIT_KINDS];
export type SideLocalCheckKind = typeof SIDE_LOCAL_CHECK_KINDS[number] | typeof SIDE_COUPLED_LIMIT_KINDS[number];
export type SideLocalUnit = 'N' | 'NMM' | 'MM';
export const sideLocalUnit = (kind: SideLocalCheckKind): SideLocalUnit =>
  kind === 'CORNER_OPENING' ? 'MM' : kind === 'STUD_BUCKLING' || kind === 'RAIL_BUCKLING' ? 'NMM' : 'N';

export interface SideLocalEvidence {
  schemaVersion: typeof SIDE_LOCAL_EVIDENCE_SCHEMA;
  kind: SideLocalCheckKind | null; unit: SideLocalUnit | null; limit: number | null;
  actionBasis: 'SERVICE' | 'FACTORED' | null; limitBasis: 'ALLOWABLE' | 'DESIGN' | 'SLS_LIMIT' | null;
  memberEvidenceRef: string; scopeEvidenceRef: string; maximumUnbracedLengthMm: number | null;
  methodId: string; sourceRef: string; sourceRevision: string; evidenceRef: string; reviewRef: string;
  status: 'ENGINEER_REVIEWED' | 'REFERENCE_ONLY';
}
export const emptySideLocalEvidence = (kind: SideLocalCheckKind | null = null, memberEvidenceRef = ''): SideLocalEvidence => ({
  schemaVersion: SIDE_LOCAL_EVIDENCE_SCHEMA, kind, unit: kind ? sideLocalUnit(kind) : null, limit: null, actionBasis: null, limitBasis: null,
  memberEvidenceRef, scopeEvidenceRef: '', maximumUnbracedLengthMm: null, methodId: '', sourceRef: '', sourceRevision: '', evidenceRef: '', reviewRef: '', status: 'REFERENCE_ONLY'});

function text(v: unknown, name: string) {if (typeof v !== 'string' || v.length > 2000) throw Error(`Invalid side local evidence ${name}`);}
export function validateSideLocalEvidence(raw: unknown): asserts raw is SideLocalEvidence {
  const r = record(raw), keys = Object.keys(emptySideLocalEvidence());
  if (keys.some(k => !Object.hasOwn(r, k)) || Object.keys(r).some(k => !keys.includes(k))) throw Error('Side local evidence unknown/missing fields or authority metadata');
  const e = r as unknown as SideLocalEvidence;
  if (e.schemaVersion !== SIDE_LOCAL_EVIDENCE_SCHEMA || (e.kind !== null && !ALL_KINDS.includes(e.kind)) || (e.unit !== null && !['N', 'NMM', 'MM'].includes(e.unit)) ||
    ![null, 'SERVICE', 'FACTORED'].includes(e.actionBasis) || ![null, 'ALLOWABLE', 'DESIGN', 'SLS_LIMIT'].includes(e.limitBasis) ||
    !['ENGINEER_REVIEWED', 'REFERENCE_ONLY'].includes(e.status)) throw Error('Invalid side local evidence schema/kind/basis/status');
  for (const k of ['memberEvidenceRef', 'scopeEvidenceRef', 'methodId', 'sourceRef', 'sourceRevision', 'evidenceRef', 'reviewRef'] as const) text(e[k], k);
  if (e.kind !== null && e.unit !== sideLocalUnit(e.kind)) throw Error(`${e.kind}: explicit ${sideLocalUnit(e.kind)} unit required`);
  if (e.limit !== null) finite(e.limit, 'side local limit', true);
  if (e.maximumUnbracedLengthMm !== null) finite(e.maximumUnbracedLengthMm, 'maximum unbraced length');
  if (e.status === 'ENGINEER_REVIEWED' && !e.reviewRef.trim()) throw Error('Reviewed side local evidence requires review reference');
}
export function validateSideLocalEvidenceList(raw: unknown) {
  if (raw === null || raw === undefined) return;
  if (!Array.isArray(raw) || raw.length > SIDE_LOCAL_CHECK_KINDS.length) throw Error('At most one side local evidence row per kind');
  raw.forEach(validateSideLocalEvidence);
}

export interface SideLocalDemand {kind: SideLocalCheckKind; id: string; memberId: string; demand: number; lengthMm: number | null; issue: string | null}
export interface SideLocalCheck extends SideLocalDemand {
  unit: SideLocalUnit; limit: number | null; status: 'INCOMPLETE' | 'SCREENED' | 'FAIL'; utilization: number | null; blockers: string[];
}

/** Every actual contact/member row of a face. Rail loads and reactions are taken from the
 * rail analyses themselves, so declared rail sharing is not re-applied here. */
export function sideLocalDemands(faceId: string, studs: {xMm: number; analysis: BeamAnalysis}[], walers: {zMm: number; rails: BeamAnalysis[]}[], lengthMm: number): SideLocalDemand[] {
  const rows: SideLocalDemand[] = [];
  const span = (a: BeamAnalysis) => {
    const xs = [...new Set([0, a.input.lengthMm, ...a.input.supports.map(s => s.xMm)])].sort((p, q) => p - q);
    return Math.max(...xs.slice(1).map((x, i) => x - xs[i]));
  };
  for (const s of studs) rows.push({kind: 'STUD_BUCKLING', id: `${s.analysis.id}:LTB`, memberId: s.analysis.id, demand: s.analysis.maxMomentNmm, lengthMm: span(s.analysis), issue: null});
  walers.forEach(w => w.rails.forEach(rail => {
    rows.push({kind: 'RAIL_BUCKLING', id: `${rail.id}:LTB`, memberId: rail.id, demand: rail.maxMomentNmm, lengthMm: span(rail), issue: null});
    for (const p of rail.input.points) rows.push({kind: 'STUD_RAIL_BEARING', id: `${rail.id}:${p.id}`, memberId: rail.id, demand: Math.max(0, p.forceN), lengthMm: null,
      issue: p.forceN < 0 ? 'STUD_RAIL_CONTACT_REVERSAL' : null});
    for (const r of rail.reactions) {
      const demand = -r.forceN;
      rows.push({kind: 'SUPPORT_PLATE_BEARING', id: `${rail.id}:${r.supportId}`, memberId: rail.id, demand: Math.max(0, demand), lengthMm: null,
        issue: demand < -Math.max(1e-9, Math.abs(r.forceN) * 1e-12) ? 'SUPPORT_PLATE_CONTACT_REVERSAL' : null});
    }
    for (const [end, x] of [['A', 0], ['B', lengthMm]] as const) {
      const segment = x === 0 ? rail.segments[0] : rail.segments.at(-1)!;
      const opening = Math.abs(beamAt(segment, x - segment.startMm).deflectionMm);
      rows.push({kind: 'CORNER_OPENING', id: `${rail.id}:END-${end}`, memberId: rail.id, demand: opening, lengthMm: null, issue: null});
    }
  }));
  const supportIds = [...new Set(walers.flatMap(w => w.rails.flatMap(r => r.reactions.map(q => q.supportId))))];
  walers.forEach((w, level) => supportIds.forEach(id => {
    const reactions = w.rails.map(r => r.reactions.find(q => q.supportId === id)).filter(Boolean);
    if (!reactions.length) return;
    const total = -reactions.reduce((sum, r) => sum + r!.forceN, 0);
    rows.push({kind: 'SUPPORT_CONNECTION', id: `${faceId}:LEVEL:${level}:${id}`, memberId: `${faceId}:LEVEL:${level}`, demand: Math.max(0, total), lengthMm: null,
      issue: total < 0 ? 'SUPPORT_CONNECTION_REVERSAL_REQUIRES_TENSION_MODEL' : null});
  }));
  for (const r of rows) signed(r.demand, `${r.kind} demand`);
  return rows;
}

const FACE_STANDING_BLOCKERS = ['CORNER_FORCE_TRANSFER_HARDWARE_NOT_MODELED_FACE_ENDS_ANALYSED_AS_FREE', 'SIDE_SYSTEM_STABILITY_REQUIRES_LATERAL_ACTIONS_BRACING_AND_FRAME_ANALYSIS'];
export function screenSideLocalChecks(input: {demands: SideLocalDemand[]; evidence?: SideLocalEvidence[] | null; actionBasis: 'SERVICE' | 'FACTORED'; memberEvidenceRef: string; standingBlockers?: string[]}) {
  const evidence = input.evidence ?? [];
  if (evidence.length > ALL_KINDS.length) throw Error('At most one side local evidence row per kind');
  evidence.forEach(validateSideLocalEvidence);
  const checks: SideLocalCheck[] = input.demands.map(d => {
    const unit = sideLocalUnit(d.kind), matches = evidence.filter(e => e.kind === d.kind), e = matches[0] ?? null, blockers: string[] = [];
    if (d.issue) blockers.push(d.issue);
    if (matches.length > 1) blockers.push('DUPLICATE_SIDE_LOCAL_EVIDENCE_KIND');
    if (!e) blockers.push('SIDE_LOCAL_EVIDENCE_REQUIRED');
    else {
      if (e.status !== 'ENGINEER_REVIEWED') blockers.push('SIDE_LOCAL_SOURCE_IS_REFERENCE_ONLY');
      if (![e.scopeEvidenceRef, e.methodId, e.sourceRef, e.sourceRevision, e.evidenceRef, e.reviewRef].every(v => v.trim())) blockers.push('SIDE_LOCAL_METHOD_SCOPE_SOURCE_AND_REVIEW_REQUIRED');
      if (e.memberEvidenceRef !== input.memberEvidenceRef) blockers.push('SIDE_LOCAL_EVIDENCE_NOT_BOUND_TO_CURRENT_FACE_MEMBERS');
      if (e.actionBasis !== input.actionBasis) blockers.push('SIDE_LOCAL_ACTION_BASIS_MISMATCH');
      const expected = d.kind === 'CORNER_OPENING' ? 'SLS_LIMIT' : input.actionBasis === 'SERVICE' ? 'ALLOWABLE' : 'DESIGN';
      if (e.limitBasis !== expected) blockers.push('SIDE_LOCAL_LIMIT_BASIS_NOT_COMPARABLE');
      if (d.kind === 'CORNER_OPENING' && input.actionBasis !== 'SERVICE') blockers.push('CORNER_OPENING_REQUIRES_SERVICE_ACTIONS');
      if (d.lengthMm !== null) {
        if (e.maximumUnbracedLengthMm === null) blockers.push('BUCKLING_MAXIMUM_UNBRACED_LENGTH_REQUIRED');
        else if (d.lengthMm > e.maximumUnbracedLengthMm) blockers.push('ACTUAL_UNBRACED_LENGTH_EXCEEDS_REVIEWED_SCOPE');
      }
      if (e.limit === null) blockers.push('SIDE_LOCAL_LIMIT_UNKNOWN');
    }
    if (!blockers.length) {
      const limit = e!.limit!;
      if (limit === 0 && d.demand > 0) return {...d, unit, limit, status: 'FAIL', utilization: null, blockers: ['DECLARED_ZERO_LOCAL_LIMIT_EXCEEDED']};
      const utilization = limit === 0 ? 0 : d.demand / limit;
      return {...d, unit, limit, status: utilization > 1 ? 'FAIL' : 'SCREENED', utilization, blockers: [utilization > 1 ? 'DECLARED_LOCAL_LIMIT_EXCEEDED' : 'SIDE_LOCAL_SCREEN_IS_NOT_CONSTRUCTION_APPROVAL']};
    }
    return {...d, unit, limit: e?.limit ?? null, status: 'INCOMPLETE', utilization: null, blockers};
  });
  const unassigned = evidence.some(e => e.kind === null);
  const status = checks.some(c => c.status === 'FAIL') ? 'FAIL' as const : !unassigned && checks.every(c => c.status === 'SCREENED') ? 'SCREENED' as const : 'INCOMPLETE' as const;
  const governing = ALL_KINDS.map(kind => {
    const rows = checks.filter(c => c.kind === kind);
    return rows.length ? rows.reduce((a, b) => b.demand > a.demand ? b : a) : null;
  }).filter((c): c is SideLocalCheck => c !== null);
  return {engineVersion: SIDE_LOCAL_EVIDENCE_SCHEMA, status, checks, governing,
    blockers: [...new Set([...checks.flatMap(c => c.blockers), ...(unassigned ? ['UNASSIGNED_SIDE_LOCAL_EVIDENCE_ROW'] : []),
      ...(input.standingBlockers ?? FACE_STANDING_BLOCKERS)])],
    constructionRelease: 'NO_GO' as const};
}
const member = (raw: unknown) => {const {resistanceEvidence: _e, ...m} = record(raw); return {...m, binding: m.binding ?? null};};
/** Binds local evidence to the face's actual stud, shared-rail and paired-rail definitions. */
export function sideLocalMemberReference(face: {stud: unknown; rail: unknown; walers: {id: string; pair?: {rails: unknown[]} | null}[]}) {
  return canonical({role: 'SIDE_FACE_LOCAL', stud: member(face.stud), rail: member(face.rail),
    pairs: face.walers.map(w => ({id: w.id, rails: w.pair ? w.pair.rails.map(member) : null}))});
}
