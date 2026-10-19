import {canonical, clone, identifier, record, uniqueIds, WORKFLOW_VERSION} from './common.js';
import {definitionHash} from './definitionHash.js';
import {CASE_ACTIONS, actionFactor, validateAnalysisCase, type AnalysisCase} from './caseFactors.js';
import {previewSingleWorkflow, regenerateDraftLayouts, parseWorkflowModel, type WorkflowModel} from './model.js';
import type {RequiredCheck} from './coverage.js';
export interface LoadCasesDefinition {schemaVersion: '1'; cases: AnalysisCase[]}
export interface AppliedLoadCases extends LoadCasesDefinition {revisionId: string; inputDefinition: string}
export function loadCasesInputDefinition(model: WorkflowModel) {
  const {loadCases: _book, analysisCase: _context, stageStudy: _stages, representatives: _reps, coverage: _coverage, coverageReview: _review, ...inputs} = model;
  return definitionHash({engineVersion: WORKFLOW_VERSION, inputs});
}
export function validateLoadCases(raw: unknown): asserts raw is AppliedLoadCases {
  const p = record(raw), keys = ['schemaVersion', 'cases', 'revisionId', 'inputDefinition'];
  if (p.schemaVersion !== '1' || Object.keys(p).some(k => !keys.includes(k)) || keys.some(k => !Object.hasOwn(p, k)) || !Array.isArray(p.cases) || p.cases.length > 8) throw Error('Invalid load-case book/schema/authority or eight-case limit');
  identifier(p.revisionId, 'load-case source revision'); if (typeof p.inputDefinition !== 'string' || p.inputDefinition.length > 2000000) throw Error('Load-case source definition limit');
  p.cases.forEach(validateAnalysisCase); uniqueIds(p.cases as AnalysisCase[], 'analysis cases');
  const named = (p.cases as AnalysisCase[]).filter(c => c.stageId.trim() && c.loadCaseId.trim()).map(c => canonical([c.stageId, c.loadCaseId]));
  if (new Set(named).size !== named.length || canonical(p.cases).length > 100000) throw Error('Duplicate stage/case or load-case definition size limit');
}
export function stampLoadCases(model: WorkflowModel, definition: LoadCasesDefinition): AppliedLoadCases {
  const book = {...clone(definition), revisionId: model.revisionId, inputDefinition: loadCasesInputDefinition(model)}; validateLoadCases(book); return book;
}
export function applyLoadCases(model: WorkflowModel, definition: LoadCasesDefinition): WorkflowModel {
  if (model.analysisCase) throw Error('Cannot nest a case book inside a compiled analysis case');
  const next = regenerateDraftLayouts(model, {loadCases: stampLoadCases(model, definition)}, {allowIncomplete: true});
  return parseWorkflowModel({...next, loadCases: stampLoadCases(next, definition)});
}
export type SinglePreview = ReturnType<typeof previewSingleWorkflow>;
export interface LoadCaseResult {definition: AnalysisCase; model: WorkflowModel | null; preview: SinglePreview | null; requiredChecks: RequiredCheck[]; errors: string[]; status: 'BLOCKED' | 'FAIL'}
/** Explicitly shares only the same authored physical stage. Changed supports/topology/stages need
 * their own authored layouts, never a coefficient masquerading as erection/reshoring geometry. */
export function compileLoadCase(source: WorkflowModel, definition: AnalysisCase): WorkflowModel {
  validateAnalysisCase(definition); identifier(definition.stageId, 'case stage'); identifier(definition.loadCaseId, 'case name');
  if (!definition.basis || !definition.basisEvidenceRef.trim() || !definition.sharedLayoutEvidenceRef.trim() || !source.designBasisRef?.trim()) throw Error('Explicit case basis, project Design Basis and physical-layout sharing evidence required');
  for (const k of CASE_ACTIONS) actionFactor({analysisCase: definition}, k);
  const layouts = [source.soffitLayout, source.sideLayout, source.frameLayout, source.ringlockAssembly, source.supportLayout].filter(l => l != null);
  if (!layouts.length || layouts.some(l => l.stageId !== definition.stageId)) throw Error('Case must match one authored physical stage; separate stage-dependent layouts required');
  if (layouts.some(l => l.stageId === definition.stageId && l.loadCaseId === definition.loadCaseId)) throw Error('Additional case must have a different name from its source case');
  const next = clone(source); delete next.stageStudy; next.loadCases = null; next.analysisCase = clone(definition); next.humanInputReviewed = false;
  next.representatives = []; next.coverage = []; next.coverageReview = null;
  for (const key of ['soffitLayout', 'sideLayout', 'frameLayout', 'ringlockAssembly', 'supportLayout'] as const) if (next[key]) {
    const layout = next[key]!; layout.stageId = definition.stageId; layout.loadCaseId = definition.loadCaseId;
  }
  if (next.frameLayout) next.frameLayout.actionBasis = definition.basis;
  return regenerateDraftLayouts(next, {}, {allowIncomplete: true});
}
export function evaluateLoadCases(model: WorkflowModel, base: SinglePreview) {
  const book = model.loadCases ?? null; if (!book) return null; validateLoadCases(book);
  const current = book.revisionId === model.revisionId && book.inputDefinition === loadCasesInputDefinition(model);
  const cases: LoadCaseResult[] = book.cases.map(definition => {
    let child: WorkflowModel | null = null, preview: SinglePreview | null = null; const errors: string[] = [];
    if (!current) errors.push('STALE_LOAD_CASE_SOURCE_REAPPLY_AFTER_SOURCE_REVIEW');
    else try {
      child = compileLoadCase(model, definition); preview = previewSingleWorkflow(child);
      if (child.soffitLayout && !preview.loadPath) errors.push('CASE_SOFFIT_ANALYSIS_NOT_AVAILABLE');
      if (child.sideLayout && !preview.side) errors.push('CASE_SIDE_ANALYSIS_NOT_AVAILABLE');
      if (child.frameLayout && !preview.frame?.analysis) errors.push('CASE_FRAME_ANALYSIS_NOT_AVAILABLE');
      if (child.supportLayout && !preview.supports?.completeTerminalWrenchCoverage) errors.push('CASE_SUPPORT_TRANSFER_NOT_AVAILABLE');
    } catch (e) {errors.push((e as Error).message);}
    const caseId = definition.loadCaseId || `UNRESOLVED:${definition.id}`, actual = preview?.requiredChecks.filter(r => r.loadCaseId === caseId && r.revision === model.revisionId) ?? [];
    const keys = new Set(actual.map(r => canonical([r.memberId, r.checkId])));
    const requiredChecks = [...actual, ...base.requiredChecks.filter(r => !keys.has(canonical([r.memberId, r.checkId]))).map(r => ({...clone(r), revision: model.revisionId, loadCaseId: caseId,
      applicability: {...clone(r.applicability), analysisCase: clone(definition), unresolvedCase: true}}))];
    return {definition: clone(definition), model: child, preview, requiredChecks, errors, status: preview?.status === 'FAIL' ? 'FAIL' : 'BLOCKED'};
  });
  return {current, cases, status: cases.some(c => c.status === 'FAIL') ? 'FAIL' as const : 'BLOCKED' as const,
    blockers: ['LOAD_CASE_FACTORS_AND_SHARED_STAGE_SCOPE_REQUIRE_ENGINEERING_REVIEW', 'COMPLETE_COMBINATIONS_OTHER_STAGES_AND_SECOND_ORDER_UNVERIFIED', 'CASE_SOFFIT_FRAME_SETTLEMENT_AND_CONTACT_COUPLING_UNVERIFIED'], constructionRelease: 'NO_GO' as const};
}
