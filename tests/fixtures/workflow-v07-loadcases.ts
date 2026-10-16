import {CASE_ACTIONS, emptyAnalysisCase, type AnalysisCase} from '../../src/domain/workflowV07/caseFactors';
import {applyLoadCases} from '../../src/domain/workflowV07/loadCases';
import {regenerateDraftLayouts} from '../../src/domain/workflowV07/model';
import {assemblyFrameApplied} from './workflow-v07-assembly';

// Arbitrary SYNTHETIC coefficients, not normative combinations or real project Design Basis.
export const loadCaseSource = () => regenerateDraftLayouts(assemblyFrameApplied(), {designBasisRef: 'SYNTHETIC explicit load-factor sensitivity only'});
export function caseDefinition(id = 'C1', patch: Partial<AnalysisCase> = {}): AnalysisCase {
  return {...emptyAnalysisCase(id), stageId: 'POUR-TEST', loadCaseId: `SYNTHETIC-${id}`, basis: 'FACTORED', basisEvidenceRef: 'SYNTHETIC coefficients, not a code combination',
    sharedLayoutEvidenceRef: 'SYNTHETIC same authored stage geometry, stiffness and supports', factors: Object.fromEntries(CASE_ACTIONS.map(k => [k, 1])) as AnalysisCase['factors'], ...patch};
}
export function casesApplied() {
  const a = caseDefinition('C1'), b = caseDefinition('C2', {basis: 'SERVICE'}); a.factors = {...a.factors, CONCRETE: 1.2, ADDITIONAL_DL: 1.1, CONSTRUCTION_LL: 1.5};
  b.factors.CONSTRUCTION_LL = 0;
  return applyLoadCases(loadCaseSource(), {schemaVersion: '1', cases: [a, b]});
}
