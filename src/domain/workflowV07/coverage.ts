import {canonical, type CheckState} from './common.js';

export interface RequiredCheck {memberId: string; checkId: string; loadCaseId: string; revision: string; applicability: Record<string, unknown>}
export interface RepresentativeCheck {
  id: string; checkId: string; loadCaseId: string; revision: string; applicability: Record<string, unknown>; status: CheckState;
}
export interface CoverageAssignment {
  memberId: string; checkId: string; loadCaseId: string; revision: string;
  representativeId: string | null; evidenceRef: string | null; notApplicableReason: string | null;
}
const key = (r: {memberId: string; checkId: string; loadCaseId: string; revision: string}) => canonical([r.memberId, r.checkId, r.loadCaseId, r.revision]);
/** Required checks are supplied by the versioned authoritative catalogue, never derived from results. */
export function coverageIssues(required: RequiredCheck[], representatives: RepresentativeCheck[], assignments: CoverageAssignment[]): string[] {
  if (!required.length) return ['EMPTY_REQUIRED_CHECKS'];
  const issues: string[] = [], keys = required.map(key);
  if (new Set(keys).size !== keys.length || required.some(r => !r.memberId || !r.checkId || !r.loadCaseId || !r.revision)) issues.push('INVALID_REQUIRED_CHECK_SET');
  if (new Set(representatives.map(r => r.id)).size !== representatives.length) issues.push('DUPLICATE_REPRESENTATIVE_ID');
  for (const r of required) {
    const found = assignments.filter(a => key(a) === key(r));
    if (found.length !== 1) {issues.push(`${key(r)}:MISSING_OR_DUPLICATE_COVERAGE`); continue;}
    const a = found[0];
    if (!a.evidenceRef?.trim()) {issues.push(`${key(r)}:MISSING_APPLICABILITY_EVIDENCE`); continue;}
    if (a.notApplicableReason?.trim() && a.representativeId === null) continue;
    const matches = representatives.filter(p => p.id === a.representativeId);
    if (matches.length !== 1) {issues.push(`${key(r)}:MISSING_REPRESENTATIVE`); continue;}
    const p = matches[0];
    if (p.revision !== r.revision || p.loadCaseId !== r.loadCaseId || p.checkId !== r.checkId) issues.push(`${key(r)}:STALE_OR_WRONG_CHECK`);
    if (canonical(p.applicability) !== canonical(r.applicability)) issues.push(`${key(r)}:NON_EQUIVALENT_GEOMETRY_LOADS_SUPPORTS_MATERIALS`);
    if (p.status !== 'CHECKED_IN_SCOPE') issues.push(`${key(r)}:REPRESENTATIVE_NOT_CHECKED`);
  }
  if (assignments.some(a => !keys.includes(key(a)))) issues.push('UNKNOWN_OR_STALE_COVERAGE_ASSIGNMENT');
  return issues;
}
