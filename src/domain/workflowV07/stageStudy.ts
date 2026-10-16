import {canonical, clone, identifier, record, WORKFLOW_VERSION} from './common.js';
import {parseWorkflowModel, previewCaseWorkflow, regenerateDraftLayouts, reviseDraft, type WorkflowModel} from './model.js';
import {stampLoadCases} from './loadCases.js';
import type {RequiredCheck} from './coverage.js';
import type {BeamAnalysis} from './beam.js';

/** Independent static studies; there is no time/history, concrete-age or reshoring solver. */
export interface StageRecord {
  id: string; label: string; stageId: string; evidenceRef: string;
  capturedRevision: string; capturedEngineVersion: string; inputs: WorkflowModel | null;
}
export interface StageStudyDefinition {schemaVersion: '1'; stages: StageRecord[]}
export interface AppliedStageStudy extends StageStudyDefinition {revisionId: string; inputDefinition: string}
export const emptyStage = (id: string): StageRecord => ({id, label: '', stageId: '', evidenceRef: '', capturedRevision: '', capturedEngineVersion: '', inputs: null});
const layouts = (m: WorkflowModel) => [m.soffitLayout, m.sideLayout, m.frameLayout, m.ringlockAssembly, m.supportLayout].filter(l => l != null);
export const authoredStageIds = (m: WorkflowModel) => [...new Set(layouts(m).map(l => l.stageId))];
export function stageCoreDefinition(m: WorkflowModel) {
  return canonical({id: m.id, elementType: m.elementType, vertices: m.vertices, heightMm: m.heightMm, gammaKNm3: m.gammaKNm3,
    slabThicknessMm: m.slabThicknessMm, beamWidthMm: m.beamWidthMm, sourceRef: m.sourceRef, designBasisRef: m.designBasisRef, checkCatalogue: m.checkCatalogue});
}
/** Store authored input only. Derived loads/reactions and all review claims must be rebuilt. */
export function stageInputs(m: WorkflowModel): WorkflowModel {
  if (m.analysisCase) throw Error('Compiled case cannot be captured as physical stage input');
  const next = clone(m); delete next.stageStudy; delete next.analysisCase;
  next.revisionId = 'CAPTURED_INPUT'; next.humanInputReviewed = false; next.coverageReview = null; next.representatives = []; next.coverage = [];
  if (next.soffitLayout) {next.members = []; next.actions = []; next.requiredChecks = []; if (next.ringlock) next.ringlock.legs = [];}
  for (const key of ['sideLayout', 'frameLayout', 'ringlockAssembly', 'supportLayout', 'loadCases'] as const) if (next[key]) {
    next[key]!.revisionId = 'CAPTURED_INPUT'; next[key]!.inputDefinition = '';
  }
  return next;
}
export function stageInputsDefinition(m: WorkflowModel) {const inputs = stageInputs(m); inputs.legacy = null; return canonical(inputs);}
export function captureStage(m: WorkflowModel, row: StageRecord): StageRecord {
  identifier(row.stageId, 'captured stage'); const stages = authoredStageIds(m);
  if (!stages.length || stages.some(s => s !== row.stageId)) throw Error('Capture requires authored layouts with the declared Stage ID');
  if (!m.soffitLayout && (m.members.length || m.actions.length || m.requiredChecks.length)) throw Error('Unreconstructed member/load graph cannot be captured as a stage');
  return {...clone(row), capturedRevision: m.revisionId, capturedEngineVersion: WORKFLOW_VERSION, inputs: stageInputs(m)};
}
function exact(v: unknown, keys: string[], label: string) {const r = record(v); if (Object.keys(r).some(k => !keys.includes(k)) || keys.some(k => !Object.hasOwn(r, k))) throw Error(`${label}: unknown/missing fields or authority metadata`); return r;}
export function validateStageStudy(raw: unknown): asserts raw is AppliedStageStudy {
  const p = exact(raw, ['schemaVersion', 'stages', 'revisionId', 'inputDefinition'], 'stage study');
  if (p.schemaVersion !== '1' || !Array.isArray(p.stages) || p.stages.length > 6) throw Error('Invalid stage study or six-stage limit');
  identifier(p.revisionId, 'stage study revision'); if (typeof p.inputDefinition !== 'string' || p.inputDefinition.length > 100000) throw Error('Invalid stage study source definition');
  const ids: string[] = [], stages: string[] = [];
  for (const v of p.stages) {
    const row = exact(v, ['id', 'label', 'stageId', 'evidenceRef', 'capturedRevision', 'capturedEngineVersion', 'inputs'], 'stage record');
    identifier(row.id, 'stage record'); if (String(row.id).length > 64 || !/^[A-Za-z0-9_-]+$/.test(String(row.id))) throw Error('Stage record ID: use at most 64 ASCII letters, digits, underscore or hyphen'); ids.push(String(row.id));
    for (const key of ['label', 'stageId', 'evidenceRef', 'capturedRevision', 'capturedEngineVersion']) if (typeof row[key] !== 'string' || String(row[key]).length > (key === 'evidenceRef' ? 2000 : 300)) throw Error(`Invalid stage ${key}`);
    if (String(row.stageId).trim()) stages.push(String(row.stageId));
    if (row.inputs !== null) {
      const input = record(row.inputs);
      // Check before recursive schema parsing, including explicitly-null nested study fields.
      if (Object.hasOwn(input, 'stageStudy') || input.analysisCase != null) throw Error('Nested stage studies/compiled cases are forbidden');
      if (canonical(input).length > 1000000) throw Error('Stage input size limit'); parseWorkflowModel(input);
    }
  }
  if (new Set(ids).size !== ids.length || new Set(stages).size !== stages.length) throw Error('Duplicate stage record or Stage ID');
  if (canonical(p.stages).length > 4000000) throw Error('Stage study total size limit; no stage truncated');
}
export function stampStageStudy(m: WorkflowModel, d: StageStudyDefinition): AppliedStageStudy {
  const book = {...clone(d), revisionId: m.revisionId, inputDefinition: canonical({engineVersion: WORKFLOW_VERSION, core: stageCoreDefinition(m)})}; validateStageStudy(book); return book;
}
export function applyStageStudy(m: WorkflowModel, d: StageStudyDefinition): WorkflowModel {
  if (m.analysisCase) throw Error('Compiled case cannot contain a stage study');
  let next = regenerateDraftLayouts(m, {stageStudy: stampStageStudy(m, d)}, {allowIncomplete: true});
  if (next.loadCases) next = {...next, loadCases: stampLoadCases(next, next.loadCases)};
  return parseWorkflowModel({...next, stageStudy: stampStageStudy(next, d)});
}
export function compileStage(root: WorkflowModel, row: StageRecord): WorkflowModel {
  if (!row.inputs || !row.evidenceRef.trim() || !row.capturedRevision.trim() || !row.capturedEngineVersion.trim()) throw Error('Stage captured input, source provenance and scope evidence required');
  return rebuildStage(root, row);
}
function rebuildStage(root: WorkflowModel, row: StageRecord): WorkflowModel {
  if (!row.inputs) throw Error('Stage input missing');
  if (stageCoreDefinition(root) !== stageCoreDefinition(row.inputs)) throw Error('STAGE_SHARED_GEOMETRY_OR_DESIGN_BASIS_DIFFERS_RECAPTURE_REQUIRED');
  const stages = authoredStageIds(row.inputs);
  if (!stages.length || stages.some(s => s !== row.stageId)) throw Error('STAGE_LAYOUT_ID_MISMATCH');
  if (!row.inputs.soffitLayout && (row.inputs.members.length || row.inputs.actions.length || row.inputs.requiredChecks.length)) throw Error('STAGE_UNRECONSTRUCTED_MEMBER_GRAPH');
  let next = stageInputs(row.inputs); next.revisionId = root.revisionId;
  next = regenerateDraftLayouts(next, {}, {allowIncomplete: true});
  if (next.loadCases) next = {...next, loadCases: stampLoadCases(next, next.loadCases)};
  return parseWorkflowModel(next);
}
/** Loading restores authored fields into the private editor, never prior numerical results. */
export function loadStageForEditing(root: WorkflowModel, row: StageRecord): WorkflowModel {
  if (!row.inputs || stageCoreDefinition(root) !== stageCoreDefinition(row.inputs)) throw Error('Compatible captured stage input required');
  const next = stageInputs(row.inputs); next.revisionId = globalThis.crypto.randomUUID(); next.stageStudy = clone(root.stageStudy ?? null);
  return parseWorkflowModel(next);
}
/** Explicit copy proposal. No carry-over analysis, case book, review or method acceptance. */
export function copyToDraftStage(root: WorkflowModel, stageId: string): WorkflowModel {
  identifier(stageId, 'new Stage ID');
  const current = root.stageStudy?.stages.find(s => s.inputs && stageInputsDefinition(s.inputs) === stageInputsDefinition(root));
  if (!current || root.stageStudy?.stages.some(s => s.stageId === stageId) || !authoredStageIds(root).length) throw Error('Capture the current applied inputs before copying to a distinct new Stage ID');
  const next = stageInputs(root); next.revisionId = globalThis.crypto.randomUUID(); next.stageStudy = clone(root.stageStudy ?? null); next.loadCases = null;
  for (const l of layouts(next)) l.stageId = stageId;
  if (next.frameLayout) {
    next.frameLayout.acknowledgeLinearScope = false; next.frameLayout.assumptionEvidenceRef = '';
    if (next.frameLayout.secondOrder) next.frameLayout.secondOrder = {...clone(next.frameLayout.secondOrder), evidenceRef: '', imperfections: []};
    if (next.frameLayout.sls) next.frameLayout.sls = next.frameLayout.sls.map(limit => ({...clone(limit), sourceRevision: '', evidenceRef: '', reviewRef: '', status: 'REFERENCE_ONLY' as const}));
  }
  if (next.supportLayout) {next.supportLayout.evidenceRef = ''; for (const b of next.supportLayout.bases) if (b.supportKind === 'YOUNG_SLAB') b.supportEvidenceRef = '';}
  for (const l of next.ringlockAssembly?.legs ?? []) if (l.headBearing) {l.headBearing.pressureModelEvidenceRef = ''; l.headBearing.sideBlockingEvidenceRef = '';}
  return parseWorkflowModel(next);
}
export function removeStageLayout(root: WorkflowModel, kind: 'SOFFIT' | 'SIDE'): WorkflowModel {
  const patch: Partial<WorkflowModel> = {loadCases: null};
  if (kind === 'SIDE') {
    patch.sideLayout = null;
    if (root.frameLayout?.sideTransfers != null || ['SIDE_REACTIONS', 'SOFFIT_AND_SIDE_REACTIONS'].includes(root.frameLayout?.loadSource ?? '')) patch.frameLayout = {...clone(root.frameLayout!), sideTransfers: null, loadSource: null, assumptionEvidenceRef: '', acknowledgeLinearScope: false};
  }
  else {
    patch.soffitLayout = null; patch.ringlockAssembly = null; patch.members = []; patch.actions = []; patch.requiredChecks = []; patch.ringlock = null; patch.ringlockRating = null;
    if (root.frameLayout) patch.frameLayout = {...clone(root.frameLayout), headMappings: [], loadSource: null, excludeSoffitReason: '', assumptionEvidenceRef: '', acknowledgeLinearScope: false};
  }
  return reviseDraft(root, patch);
}
export const scopedStageMember = (id: string, member: string) => `STAGE:${id}:${member}`;
export function previewBeams(p: ReturnType<typeof previewCaseWorkflow>) {
  return [...p.loadPath?.analyses ?? [], ...p.soffit?.plywood?.strips.map(s => s.analysis) ?? [], ...p.side?.faces.flatMap(f => [...f.panels.map(a => a.analysis), ...f.result.studs.map(a => a.analysis), ...f.result.walers.flatMap(w => w.rails)]) ?? []];
}
export function evaluateStageStudy(m: WorkflowModel) {
  const book = m.stageStudy ?? null; if (!book) return null; validateStageStudy(book);
  const current = book.revisionId === m.revisionId && book.inputDefinition === stampStageStudy(m, {schemaVersion: '1', stages: []}).inputDefinition;
  const activeCaptured = book.stages.some(s => s.inputs && s.stageId && authoredStageIds(m).length > 0 && authoredStageIds(m).every(id => id === s.stageId) && stageInputsDefinition(s.inputs) === stageInputsDefinition(m));
  const rows = book.stages.map(definition => {
    let model: WorkflowModel | null = null, preview: ReturnType<typeof previewCaseWorkflow> | null = null; const errors: string[] = [];
    if (!current) errors.push('STALE_STAGE_STUDY_REAPPLY_REQUIRED');
    else try {
      model = compileStage(m, definition); preview = previewCaseWorkflow(model);
      if (model.soffitLayout && !preview.loadPath) errors.push('STAGE_SOFFIT_ANALYSIS_NOT_AVAILABLE');
      if (model.sideLayout && !preview.side) errors.push('STAGE_SIDE_ANALYSIS_NOT_AVAILABLE');
      if (model.frameLayout && !preview.frame?.analysis) errors.push('STAGE_FRAME_ANALYSIS_NOT_AVAILABLE');
    } catch (e) {errors.push((e as Error).message);}
    // Even a stale/unresolved stage keeps its own expected inventory, never the active stage's.
    if (definition.inputs?.ringlockRating) errors.push('STAGE_SAVED_RATING_REQUIRES_REVISION_SPECIFIC_REVIEW_NOT_REBASED');
    let inventory = preview?.requiredChecks ?? [];
    if (!preview && definition.inputs) try {inventory = previewCaseWorkflow(rebuildStage(m, definition)).requiredChecks;} catch {errors.push('STAGE_REQUIREMENT_INVENTORY_UNRESOLVED');}
    const requiredChecks: RequiredCheck[] = inventory.map(r => ({...clone(r), memberId: scopedStageMember(definition.id, r.memberId), revision: m.revisionId,
      applicability: {...clone(r.applicability), stageId: definition.stageId, stageRecordId: definition.id, physicalMemberId: r.memberId, unresolvedStage: !preview}}));
    const scopedBeams: {analysis: BeamAnalysis; loadCaseId: string}[] = [];
    if (preview && model) {
      const cases = [...new Set(layouts(model).map(l => l.loadCaseId))];
      if (cases.length === 1) for (const a of previewBeams(preview)) scopedBeams.push({analysis: {...a, id: scopedStageMember(definition.id, a.id)}, loadCaseId: cases[0]});
      for (const c of preview.loadCases?.cases ?? []) if (c.preview) for (const a of previewBeams({...c.preview, loadCases: null})) scopedBeams.push({analysis: {...a, id: scopedStageMember(definition.id, a.id)}, loadCaseId: c.definition.loadCaseId});
    }
    return {definition: clone(definition), model, preview, errors, requiredChecks, scopedBeams, status: preview?.status === 'FAIL' ? 'FAIL' as const : 'BLOCKED' as const};
  });
  return {current, activeCaptured, stages: rows, status: rows.some(r => r.status === 'FAIL') ? 'FAIL' as const : 'BLOCKED' as const,
    blockers: [...(!activeCaptured ? ['ACTIVE_STAGE_INPUTS_NOT_CAPTURED'] : []), 'INDEPENDENT_STATIC_STAGE_STUDIES_ONLY_NO_HISTORY_OR_RESHORING_LOAD_TRANSFER', 'STAGE_TRANSITIONS_CONCRETE_AGE_SUPPORT_REMOVAL_AND_PARTIAL_POUR_SCOPE_UNVERIFIED'], constructionRelease: 'NO_GO' as const};
}
