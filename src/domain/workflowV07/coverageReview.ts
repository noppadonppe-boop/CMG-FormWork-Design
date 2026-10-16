import {canonical, clone, finite, identifier, record, uniqueIds, WORKFLOW_VERSION} from './common.js';
import type {BeamAnalysis, BeamInput} from './beam.js';
import type {RequiredCheck} from './coverage.js';
import type {WorkflowModel} from './model.js';

export type RequirementRef = Pick<RequiredCheck, 'memberId' | 'checkId' | 'loadCaseId' | 'revision'>;
export type EquivalenceMode = 'EXACT_APPLICABILITY' | 'LOCAL_1D_SAME' | 'LOCAL_1D_REVERSED' | 'NOT_APPLICABLE_CLAIM';
export interface CoverageReviewGroup {
  id: string; representative: RequirementRef | null; targets: RequirementRef[]; mode: EquivalenceMode | null;
  evidenceRef: string; notApplicableReason: string;
}
export interface CoverageReviewDefinition {schemaVersion: '1'; groups: CoverageReviewGroup[]}
export interface AppliedCoverageReview extends CoverageReviewDefinition {revisionId: string; inputDefinition: string}
export const emptyCoverageReview = (): CoverageReviewDefinition => ({schemaVersion: '1', groups: []});
export const requirementKey = (r: RequirementRef) => canonical([r.memberId, r.checkId, r.loadCaseId, r.revision]);
export const requirementRef = (r: RequiredCheck): RequirementRef => ({memberId: r.memberId, checkId: r.checkId, loadCaseId: r.loadCaseId, revision: r.revision});
function exact(v: unknown, keys: string[], label: string) {
  const r = record(v); if (Object.keys(r).some(k => !keys.includes(k)) || keys.some(k => !Object.hasOwn(r, k))) throw Error(`${label}: unknown/missing fields or authority metadata`); return r;
}
function text(v: unknown, label: string, max = 2000) {if (typeof v !== 'string' || v.length > max) throw Error(`Invalid ${label}`);}
function reference(r: unknown) {const v = exact(r, ['memberId', 'checkId', 'loadCaseId', 'revision'], 'requirement reference'); for (const k of Object.keys(v)) {if (k === 'memberId') {text(v[k], k, 1000); if (!String(v[k]).trim()) throw Error('Empty member reference');} else identifier(v[k], k);}}
export function validateCoverageReview(raw: unknown): asserts raw is AppliedCoverageReview {
  const p = exact(raw, ['schemaVersion', 'groups', 'revisionId', 'inputDefinition'], 'coverage review') as unknown as AppliedCoverageReview;
  if (p.schemaVersion !== '1' || !Array.isArray(p.groups) || p.groups.length > 2000) throw Error('Invalid coverage review groups');
  identifier(p.revisionId, 'review revision'); text(p.inputDefinition, 'review source definition', 6000000);
  uniqueIds(p.groups, 'coverage review groups'); let targets = 0;
  for (const g of p.groups) {
    exact(g, ['id', 'representative', 'targets', 'mode', 'evidenceRef', 'notApplicableReason'], 'coverage review group');
    if (![null, 'EXACT_APPLICABILITY', 'LOCAL_1D_SAME', 'LOCAL_1D_REVERSED', 'NOT_APPLICABLE_CLAIM'].includes(g.mode)) throw Error('Invalid review equivalence mode');
    if (g.representative !== null) reference(g.representative);
    if (!Array.isArray(g.targets)) throw Error('Invalid actual review targets'); g.targets.forEach(reference); targets += g.targets.length;
    text(g.evidenceRef, 'applicability evidence'); text(g.notApplicableReason, 'N/A claim reason');
  }
  if (targets > 20000 || canonical(p.groups).length > 4000000) throw Error('COVERAGE_REVIEW_SIZE_LIMIT; no target omitted');
}
/** Review metadata changes snapshot identity but do not change/rebase engineering inputs. */
export function coverageReviewInputDefinition(model: WorkflowModel) {
  const {coverageReview: _review, representatives: _representatives, coverage: _coverage, ...inputs} = model;
  return canonical({engineVersion: WORKFLOW_VERSION, inputs});
}
export function stampCoverageReview(model: WorkflowModel, definition: CoverageReviewDefinition): AppliedCoverageReview {
  const result = {...clone(definition), revisionId: model.revisionId, inputDefinition: coverageReviewInputDefinition(model)};
  validateCoverageReview(result); return result;
}
/** The comparison proves only the declared prismatic 1D input, never material resistance,
 * global frames, physical mirror axes, local bearing, connection/contact or bracing equivalence.
 * No tolerance merging, load aggregation or favorable-result envelope is used. */
export function compareLocalBeamInputs(a: BeamInput, b: BeamInput, reversed = false) {
  function normalized(input: BeamInput, reverse: boolean) {
    exact(input, ['id', 'revision', 'lengthMm', 'E_MPa', 'I_mm4', 'supports', 'points', 'patches'], '1D beam input');
    identifier(input.id, 'beam identity'); identifier(input.revision, 'beam revision'); const L = finite(input.lengthMm, 'beam length');
    finite(input.E_MPa, 'beam E'); finite(input.I_mm4, 'beam I');
    const x = (v: number) => {if (!Number.isFinite(v) || v < 0 || v > L) throw Error('Invalid 1D station'); return reverse ? L - v : v;};
    const sorted = <T>(rows: T[]) => rows.sort((u, v) => canonical(u).localeCompare(canonical(v)));
    for (const k of ['supports', 'points', 'patches'] as const) {if (!Array.isArray(input[k]) || input[k].length > 120) throw Error('Invalid 1D input list'); uniqueIds(input[k], k);}
    if (!input.supports.length || input.supports.length + input.points.length + 2 * input.patches.length > 120) throw Error('Invalid 1D input size');
    const supports = sorted(input.supports.map(s => {
      const fields = Object.hasOwn(s, 'rotationFixed') ? ['id', 'xMm', 'rotationFixed'] : ['id', 'xMm']; exact(s, fields, 'beam support');
      if (s.rotationFixed !== undefined && typeof s.rotationFixed !== 'boolean') throw Error('Unknown rotational restraint');
      return {xMm: x(s.xMm), rotationFixed: s.rotationFixed === true};
    }));
    if (new Set(supports.map(s => s.xMm)).size !== supports.length) throw Error('Duplicate 1D support station');
    const points = sorted(input.points.map(p => {exact(p, ['id', 'xMm', 'forceN'], 'beam point load'); return {xMm: x(p.xMm), forceN: finite(p.forceN, 'point force', true)};}));
    const patches = sorted(input.patches.map(p => {
      exact(p, ['id', 'startMm', 'endMm', 'startNPerMm', 'endNPerMm'], 'beam patch');
      const start = x(p.startMm), end = x(p.endMm); if (p.endMm <= p.startMm) throw Error('Invalid 1D patch length');
      const q0 = finite(p.startNPerMm, 'patch q0', true), q1 = finite(p.endNPerMm, 'patch q1', true);
      return reverse ? {startMm: end, endMm: start, startNPerMm: q1, endNPerMm: q0} : {startMm: start, endMm: end, startNPerMm: q0, endNPerMm: q1};
    }));
    return {lengthMm: L, E_MPa: input.E_MPa, I_mm4: input.I_mm4, supports, points, patches};
  }
  const source = normalized(a, false), target = normalized(b, reversed);
  const differences = Object.keys(source).filter(k => canonical(source[k as keyof typeof source]) !== canonical(target[k as keyof typeof target]));
  return {equivalent: a.revision === b.revision && differences.length === 0, differences: [...(a.revision !== b.revision ? ['revision'] : []), ...differences],
    scope: 'PRISMATIC_1D_ELASTIC_DEMAND_INPUT_ONLY' as const, constructionRelease: 'NO_GO' as const};
}
export type ReviewRowState = 'UNASSIGNED' | 'STALE_PLAN' | 'DUPLICATE_ASSIGNMENT' | 'INCOMPLETE_GROUP' | 'NON_EQUIVALENT' | 'REPRESENTATIVE_PENDING' | 'NA_PENDING';
export interface CoverageReviewRow extends RequirementRef {
  groupId: string | null; representative: RequirementRef | null; evidenceRef: string | null; state: ReviewRowState;
  exactApplicability: boolean | null; localDemandEquivalent: boolean | null; comparisonIssues: string[];
  notApplicableReason: string | null; status: 'BLOCKED';
}
/** Every required row is retained even when the plan is missing, stale or invalid. Draft
 * strings never supply CHECKED_IN_SCOPE or a verified N/A. Legacy result claims are not trusted here. */
export function evaluateCoverageReview(model: WorkflowModel, required: RequiredCheck[], beams: BeamAnalysis[], scoped: {analysis: BeamAnalysis; loadCaseId: string}[] = []) {
  const plan = model.coverageReview ?? null;
  if (plan) validateCoverageReview(plan);
  const stale = !!plan && (plan.revisionId !== model.revisionId || plan.inputDefinition !== coverageReviewInputDefinition(model));
  const byKey = new Map(required.map(r => [requirementKey(r), r])), beamById = new Map<string, BeamAnalysis>(), ambiguousBeams = new Set<string>();
  for (const beam of beams) {if (beamById.has(beam.id)) ambiguousBeams.add(beam.id); else beamById.set(beam.id, beam);}
  const caseKey = (id: string, caseId: string, revision: string) => canonical([id, caseId, revision]), scopedByKey = new Map<string, BeamAnalysis>(), ambiguousScoped = new Set<string>();
  const sourceCases = new Set([model.soffitLayout?.loadCaseId, model.sideLayout?.loadCaseId, model.frameLayout?.loadCaseId]);
  for (const entry of scoped) {const k = caseKey(entry.analysis.id, entry.loadCaseId, entry.analysis.revision); if (scopedByKey.has(k)) ambiguousScoped.add(k); else scopedByKey.set(k, entry.analysis);}
  const targetGroups = new Map<string, CoverageReviewGroup[]>(), diagnostics: string[] = [];
  const keys = required.map(requirementKey);
  if (new Set(keys).size !== keys.length) diagnostics.push('DUPLICATE_ACTUAL_REQUIREMENT_KEYS');
  if (ambiguousBeams.size) diagnostics.push(...[...ambiguousBeams].map(id => `AMBIGUOUS_ACTUAL_ANALYSIS_ID:${id}`));
  for (const group of plan?.groups ?? []) {
    if (!group.targets.length) diagnostics.push(`${group.id}:NO_ACTUAL_TARGETS`);
    if (group.representative && !byKey.has(requirementKey(group.representative))) diagnostics.push(`${group.id}:UNKNOWN_OR_STALE_REPRESENTATIVE`);
    for (const target of group.targets) {
      const key = requirementKey(target); if (!byKey.has(key)) diagnostics.push(`${group.id}:UNKNOWN_OR_STALE_TARGET:${key}`);
      const existing = targetGroups.get(key); if (existing) existing.push(group); else targetGroups.set(key, [group]);
    }
  }
  const localChecks = new Set(['SIDE-01', 'SIDE-02', 'SIDE-03', 'SIDE-04', 'SIDE-05', 'SIDE-06', 'SIDE-07', 'SIDE-08', 'SOFFIT-03', 'SOFFIT-04', 'SOFFIT-05', 'SOFFIT-06', 'SOFFIT-07']);
  const rows: CoverageReviewRow[] = required.map(r => {
    const groups = targetGroups.get(requirementKey(r)) ?? [], g = groups[0];
    let state: ReviewRowState = stale ? 'STALE_PLAN' : groups.length > 1 ? 'DUPLICATE_ASSIGNMENT' : !g ? 'UNASSIGNED' : 'INCOMPLETE_GROUP';
    let exactApplicability: boolean | null = null, localDemandEquivalent: boolean | null = null;
    const comparisonIssues: string[] = [];
    if (g && !stale && groups.length === 1 && g.mode && g.evidenceRef.trim()) {
      if (g.mode === 'NOT_APPLICABLE_CLAIM') {
        state = g.notApplicableReason.trim() && g.representative === null ? 'NA_PENDING' : 'INCOMPLETE_GROUP';
        comparisonIssues.push('NA_GEOMETRY_AND_RULE_APPLICABILITY_NOT_VERIFIED');
      } else if (g.representative && !g.notApplicableReason.trim()) {
        const source = byKey.get(requirementKey(g.representative));
        if (!source || source.checkId !== r.checkId || source.loadCaseId !== r.loadCaseId || source.revision !== r.revision) {state = 'NON_EQUIVALENT'; comparisonIssues.push('WRONG_OR_STALE_CHECK_CASE_REVISION');}
        else if (source.applicability.stageId !== r.applicability.stageId || source.applicability.stageRecordId !== r.applicability.stageRecordId) {state = 'NON_EQUIVALENT'; comparisonIssues.push('DIFFERENT_PHYSICAL_STAGE_REQUIRES_SEPARATE_APPLICABILITY_REVIEW');}
        else {
          exactApplicability = canonical(source.applicability) === canonical(r.applicability);
          if (g.mode === 'EXACT_APPLICABILITY') state = exactApplicability ? 'REPRESENTATIVE_PENDING' : 'NON_EQUIVALENT';
          else {
            const sourceKey = caseKey(source.memberId, source.loadCaseId, source.revision), targetKey = caseKey(r.memberId, r.loadCaseId, r.revision);
            const sourceScoped = scopedByKey.get(sourceKey), targetScoped = scopedByKey.get(targetKey), a = sourceScoped ?? (sourceCases.has(source.loadCaseId) ? beamById.get(source.memberId) : undefined), b = targetScoped ?? (sourceCases.has(r.loadCaseId) ? beamById.get(r.memberId) : undefined);
            if (ambiguousScoped.has(sourceKey) || ambiguousScoped.has(targetKey) || (!sourceScoped && ambiguousBeams.has(source.memberId)) || (!targetScoped && ambiguousBeams.has(r.memberId))) {state = 'NON_EQUIVALENT'; comparisonIssues.push('AMBIGUOUS_ACTUAL_ANALYSIS_ID');}
            else if (!localChecks.has(r.checkId) || !a || !b) {state = 'NON_EQUIVALENT'; comparisonIssues.push('LOCAL_1D_PROOF_NOT_AVAILABLE_FOR_THIS_ENTITY_OR_CHECK');}
            else try {
              const comparison = compareLocalBeamInputs(a.input, b.input, g.mode === 'LOCAL_1D_REVERSED'); localDemandEquivalent = comparison.equivalent;
              comparisonIssues.push(...comparison.differences); state = comparison.equivalent ? 'REPRESENTATIVE_PENDING' : 'NON_EQUIVALENT';
            } catch (e) {state = 'NON_EQUIVALENT'; comparisonIssues.push(`INVALID_LOCAL_INPUT:${(e as Error).message}`);}
          }
          comparisonIssues.push('MATERIAL_ORIENTATION_CONTACT_RESTRAINTS_AND_CHECK_SCOPE_REVIEW_REQUIRED');
        }
      }
    }
    return {...requirementRef(r), groupId: g?.id ?? null, representative: g?.representative ?? null, evidenceRef: g?.evidenceRef || null,
      state, exactApplicability, localDemandEquivalent, comparisonIssues, notApplicableReason: g?.notApplicableReason || null, status: 'BLOCKED'};
  });
  return {revisionId: model.revisionId, sourceCurrent: !stale, rows, diagnostics, total: rows.length,
    counts: Object.fromEntries(['UNASSIGNED', 'STALE_PLAN', 'DUPLICATE_ASSIGNMENT', 'INCOMPLETE_GROUP', 'NON_EQUIVALENT', 'REPRESENTATIVE_PENDING', 'NA_PENDING'].map(s => [s, rows.filter(r => r.state === s).length])),
    checkedCount: 0, verifiedNotApplicableCount: 0, status: 'BLOCKED' as const, constructionRelease: 'NO_GO' as const};
}
