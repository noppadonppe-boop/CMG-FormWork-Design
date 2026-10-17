import {polygon, validateInput, type Input} from '../index.js';
import {canonical, clone, finite, record, WORKFLOW_VERSION, type ElementType, type Point2} from './common.js';
import {pairFaces} from './geometry.js';
import {beamLoads, loadOwnershipIssues, slabLoads, type LoadAction} from './loads.js';
import {analyzeLoadPath, type PathMember} from './loadPath.js';
import {coverageIssues, type RequiredCheck, type RepresentativeCheck, type CoverageAssignment} from './coverage.js';
import {screenRinglock, type RinglockConfiguration} from './ringlock.js';
import {validateSelectionSnapshot, type SelectionSnapshot} from './catalogues.js';
import {buildSoffitCandidate, validateSoffitBindings, type SoffitLayout} from './soffit.js';
import {screenRinglockResearch, type RinglockResearchSnapshot} from './ringlockResearch.js';
import {analyzeSideLayout, stampSideLayout, validateSidePairDrafts, type AppliedSideLayout} from './sideLayout.js';
import {evaluateFrameLayout, refreshProducedFrameContractAudit, stampFrameLayout, validateFrameLayout, type AppliedFrameLayout} from './frameWorkflow.js';
import {evaluateCoverageReview, stampCoverageReview, validateCoverageReview, type AppliedCoverageReview, type CoverageReviewDefinition} from './coverageReview.js';
import {evaluateRinglockAssembly, stampRinglockAssembly, validateRinglockAssembly, type AppliedRinglockAssembly} from './ringlockAssembly.js';
import {CASE_ACTIONS, actionFactor, validateAnalysisCase, type AnalysisCase} from './caseFactors.js';
import {evaluateLoadCases, validateLoadCases, type AppliedLoadCases} from './loadCases.js';
import {evaluateStageStudy, validateStageStudy, previewBeams, type AppliedStageStudy} from './stageStudy.js';
import {validateAppliedCandidate, type AppliedLayoutCandidate} from './layoutCandidate.js';
import {evaluateSupportLayout, stampSupportLayout, validateSupportLayout, type AppliedSupportLayout} from './supportLayout.js';
import {evaluateHeadBearings} from './headBearing.js';
import {contractSignal, emptyRinglockContractAudit, overlayContractSignals} from './contractAudit.js';

export interface WorkflowModel {
  schemaVersion: '0.7.0'; id: string; revisionId: string; elementType: ElementType; vertices: Point2[]; heightMm: number;
  humanInputReviewed: boolean; sourceRef: string | null; designBasisRef: string | null;
  sideTopology: 'THROUGH_TIE' | 'SEGMENTED_TIE' | 'COLUMN_YOKE' | 'GROUND_BRACED' | null;
  gammaKNm3: number | null; slabThicknessMm: number | null; beamWidthMm: number | null;
  concreteStripMm: number | null; deadStripMm: number | null; liveStripMm: number | null;
  additionalDeadKPa: number | null; constructionLiveKPa: number | null;
  selections: {section: SelectionSnapshot | null; material: SelectionSnapshot | null; ringlock: SelectionSnapshot | null};
  checkCatalogue: {version: string; specifications: {id: string; group: string; description: string; appliesTo: string}[]} | null;
  actions: LoadAction[]; members: PathMember[]; requiredChecks: RequiredCheck[];
  representatives: RepresentativeCheck[]; coverage: CoverageAssignment[];
  ringlock: RinglockConfiguration | null; ringlockRating: Record<string, unknown> | null;
  soffitLayout?: SoffitLayout | null;
  ringlockResearch?: RinglockResearchSnapshot | null;
  sideLayout?: AppliedSideLayout | null;
  frameLayout?: AppliedFrameLayout | null;
  coverageReview?: AppliedCoverageReview | null;
  ringlockAssembly?: AppliedRinglockAssembly | null;
  analysisCase?: AnalysisCase | null;
  loadCases?: AppliedLoadCases | null;
  stageStudy?: AppliedStageStudy | null;
  layoutCandidate?: AppliedLayoutCandidate | null;
  supportLayout?: AppliedSupportLayout | null;
  legacy: {engineVersion: string; input: Input; unknowns: Record<string, number | null>} | null;
}
export function fromLegacy(raw: Input, id: string): WorkflowModel {
  const input = validateInput(raw);
  return {schemaVersion: '0.7.0', id, revisionId: 'DRAFT-1', elementType: input.kind, vertices: polygon(input), heightMm: input.height,
    humanInputReviewed: false, sourceRef: null, designBasisRef: null, sideTopology: input.kind === 'COLUMN' ? 'COLUMN_YOKE' : input.shape === 'RECTANGLE' ? 'THROUGH_TIE' : null,
    gammaKNm3: input.gamma, slabThicknessMm: null, beamWidthMm: null, concreteStripMm: null, deadStripMm: null, liveStripMm: null,
    additionalDeadKPa: null, constructionLiveKPa: null, selections: {section: null, material: null, ringlock: null},
    checkCatalogue: null, actions: [], members: [], requiredChecks: [], representatives: [], coverage: [], ringlock: null, ringlockRating: null, soffitLayout: null, ringlockResearch: null, sideLayout: null, frameLayout: null,
    legacy: {engineVersion: '0.3.0-screening', input: clone(input), unknowns: {tieNetArea: input.tieNetArea || null, tieAssemblySWL: input.tieAssemblySWL || null,
      cornerCapacityX: input.cornerCapacityX || null, cornerCapacityY: input.cornerCapacityY || null}}};
}
export function parseWorkflowModel(raw: unknown): WorkflowModel {
  const r = record(raw);
  const keys = ['schemaVersion', 'id', 'revisionId', 'elementType', 'vertices', 'heightMm', 'humanInputReviewed', 'sourceRef', 'designBasisRef', 'sideTopology',
    'gammaKNm3', 'slabThicknessMm', 'beamWidthMm', 'concreteStripMm', 'deadStripMm', 'liveStripMm', 'additionalDeadKPa', 'constructionLiveKPa',
    'selections', 'checkCatalogue', 'actions', 'members', 'requiredChecks', 'representatives', 'coverage', 'ringlock', 'ringlockRating', 'legacy', 'soffitLayout', 'ringlockResearch', 'sideLayout', 'frameLayout', 'coverageReview', 'ringlockAssembly', 'analysisCase', 'loadCases', 'stageStudy', 'layoutCandidate', 'supportLayout'];
  if (r.schemaVersion !== '0.7.0' || typeof r.id !== 'string' || !r.id.trim() || r.id.length > 200 ||
    typeof r.revisionId !== 'string' || !r.revisionId.trim() || r.revisionId.length > 100 ||
    !['FOOTING', 'COLUMN', 'WALL', 'BEAM', 'SLAB'].includes(String(r.elementType)) || typeof r.humanInputReviewed !== 'boolean' ||
    keys.filter(k => !['soffitLayout', 'ringlockResearch', 'sideLayout', 'frameLayout', 'coverageReview', 'ringlockAssembly', 'analysisCase', 'loadCases', 'stageStudy', 'layoutCandidate', 'supportLayout'].includes(k)).some(k => !Object.hasOwn(r, k)) || Object.keys(r).some(k => !keys.includes(k))) throw Error('Invalid v0.7 model schema; authority fields are not accepted');
  if (![null, 'THROUGH_TIE', 'SEGMENTED_TIE', 'COLUMN_YOKE', 'GROUND_BRACED'].includes(r.sideTopology as string | null)) throw Error('Invalid side topology');
  for (const key of ['sourceRef', 'designBasisRef']) if (r[key] !== null && (typeof r[key] !== 'string' || String(r[key]).length > 2000)) throw Error(`Invalid ${key}`);
  for (const key of ['gammaKNm3', 'slabThicknessMm', 'beamWidthMm', 'concreteStripMm', 'deadStripMm', 'liveStripMm', 'additionalDeadKPa', 'constructionLiveKPa']) {
    if (r[key] !== null) finite(r[key], key, ['additionalDeadKPa', 'constructionLiveKPa', 'slabThicknessMm'].includes(key));
  }
  const selection = record(r.selections);
  if (Object.keys(selection).length !== 3 || ['section', 'material', 'ringlock'].some(k => !Object.hasOwn(selection, k))) throw Error('Invalid reference selection slots');
  if (r.checkCatalogue !== null) {
    const catalogue = record(r.checkCatalogue);
    if (typeof catalogue.version !== 'string' || !catalogue.version.trim() || !Array.isArray(catalogue.specifications) || !catalogue.specifications.length || catalogue.specifications.length > 300) throw Error('Versioned nonempty check catalogue required');
    const ids = catalogue.specifications.map(s => {
      const spec = record(s);
      if (['id', 'group', 'description', 'appliesTo'].some(k => typeof spec[k] !== 'string' || !String(spec[k]).trim())) throw Error('Invalid check specification');
      return spec.id;
    });
    if (new Set(ids).size !== ids.length) throw Error('Duplicate check specification');
  }
  for (const key of ['section', 'material', 'ringlock']) if (selection[key] !== null) {
    validateSelectionSnapshot(selection[key]);
  }
  for (const key of ['actions', 'members', 'requiredChecks', 'representatives', 'coverage']) if (!Array.isArray(r[key]) || (r[key] as unknown[]).length > (['requiredChecks', 'representatives', 'coverage'].includes(key) ? 20000 : 1000)) throw Error(`Invalid ${key}`);
  if (r.soffitLayout !== null && r.soffitLayout !== undefined && record(r.soffitLayout).schemaVersion !== '1') throw Error('Unsupported soffit layout schema');
  if (r.soffitLayout !== null && r.soffitLayout !== undefined) validateSoffitBindings(r.soffitLayout as SoffitLayout);
  if (r.sideLayout !== null && r.sideLayout !== undefined && record(r.sideLayout).schemaVersion !== '1') throw Error('Unsupported side layout schema');
  if (r.sideLayout !== null && r.sideLayout !== undefined) validateSidePairDrafts(r.sideLayout as AppliedSideLayout);
  if (r.frameLayout !== null && r.frameLayout !== undefined) validateFrameLayout(r.frameLayout);
  if (r.coverageReview !== null && r.coverageReview !== undefined) validateCoverageReview(r.coverageReview);
  if (r.ringlockAssembly !== null && r.ringlockAssembly !== undefined) validateRinglockAssembly(r.ringlockAssembly);
  if (r.analysisCase !== null && r.analysisCase !== undefined) {
    validateAnalysisCase(r.analysisCase);
    for (const k of CASE_ACTIONS) actionFactor({analysisCase: r.analysisCase}, k);
    const c = r.analysisCase, layouts = [r.soffitLayout, r.sideLayout, r.frameLayout, r.ringlockAssembly, r.supportLayout].filter(v => v != null).map(record);
    if (!c.stageId.trim() || !c.loadCaseId.trim() || !c.basisEvidenceRef.trim() || !c.sharedLayoutEvidenceRef.trim() || !layouts.length || layouts.some(l => l.stageId !== c.stageId || l.loadCaseId !== c.loadCaseId)) throw Error('Compiled case requires matched authored stage/case layouts and evidence');
  }
  if (r.loadCases !== null && r.loadCases !== undefined) validateLoadCases(r.loadCases);
  if (r.stageStudy !== null && r.stageStudy !== undefined) validateStageStudy(r.stageStudy);
  if (r.layoutCandidate !== null && r.layoutCandidate !== undefined) validateAppliedCandidate(r.layoutCandidate);
  if (r.supportLayout !== null && r.supportLayout !== undefined) validateSupportLayout(r.supportLayout);
  if (r.analysisCase && r.stageStudy) throw Error('Compiled case cannot contain a stage study');
  if (r.analysisCase && r.loadCases) throw Error('Nested analysis case books are not supported');
  if (r.ringlockResearch !== null && r.ringlockResearch !== undefined) screenRinglockResearch(r.ringlockResearch as RinglockResearchSnapshot, null);
  if (r.ringlock !== null) {
    const config = record(r.ringlock);
    if (config.planLayout !== undefined) {
      const plan = record(config.planLayout);
      if (plan.bearerAxis !== 'X' || plan.headAlignment !== 'STANDARD_AXIS' || Object.keys(plan).some(k => !['bearerAxis', 'headAlignment'].includes(k))) throw Error('Unsupported Ringlock plan layout');
      finite(config.bayXMm, 'Ringlock plan X'); finite(config.bayYMm, 'Ringlock plan Y');
    }
  }
  pairFaces(r.vertices as Point2[], r.heightMm as number);
  return clone(r) as unknown as WorkflowModel;
}

function headContractSignal(model: WorkflowModel, assembly: ReturnType<typeof evaluateRinglockAssembly> | null,
  headBearings: ReturnType<typeof evaluateHeadBearings> | null) {
  const assemblyEntities = assembly?.rows.flatMap(row => [...row.nodes.filter(n => ['BASE', 'HEAD'].includes(n.role)).map(n => n.id),
    ...row.segments.filter(s => ['BASE_JACK', 'HEAD_JACK'].includes(s.role)).map(s => s.id)]) ?? [];
  const bearingEntities = headBearings?.rows.flatMap(row => [`HEAD_BEARING:${row.legId}`, row.headNodeId]) ?? [];
  const entityIds = [...assemblyEntities, ...bearingEntities];
  if (!entityIds.length) return contractSignal('INCOMPLETE', [], ['JACK_HEAD_BASE_ENTITY_SET_REQUIRED'], ['JACK_HEAD_BASE_NO_ACTUAL_ASSEMBLY_OR_HEAD_ENTITY']);
  const failures = [...(assembly?.rows.filter(row => row.status === 'FAIL').map(row => `${row.legId}:ASSEMBLY_FAIL`) ?? []),
    ...(headBearings?.rows.filter(row => row.status === 'FAIL').map(row => `${row.legId}:HEAD_BEARING_FAIL`) ?? [])];
  const blockers = [...(assembly?.blockers ?? []), ...(assembly?.rows.flatMap(row => row.issues.map(issue => `${row.legId}:${issue}`)) ?? []),
    ...(headBearings?.blockers ?? []), ...(headBearings?.rows.flatMap(row => row.issues.map(issue => `${row.legId}:${issue}`)) ?? [])];
  const missing = ['JACK_HEAD_BASE_RESISTANCE_AND_CONNECTION_REVIEW_REQUIRED'];
  if (!assembly?.frameGeometryReady) missing.push('ACTUAL_JACK_SPIGOT_DATUM_CLOSURE_REQUIRED');
  if (!headBearings || headBearings.rows.some(row => !row.geometryReady)) missing.push('HEAD_SEAT_GEOMETRY_AND_CONTACT_DEMAND_REQUIRED');
  const evidenceRefs = [...(model.ringlockAssembly?.evidenceRef ? [model.ringlockAssembly.evidenceRef] : []),
    ...(model.ringlockAssembly?.headDatumEvidenceRef ? [model.ringlockAssembly.headDatumEvidenceRef] : []),
    ...(model.ringlockAssembly?.legs.flatMap(leg => [leg.soleBoard.evidenceRef, leg.baseJack.geometryEvidenceRef, leg.baseJack.limitEvidenceRef,
      leg.headJack.geometryEvidenceRef, leg.headJack.limitEvidenceRef, ...(leg.headBearing ? [leg.headBearing.geometryEvidenceRef, leg.headBearing.bearerGeometryEvidenceRef, leg.headBearing.pressureModelEvidenceRef] : [])]) ?? [])];
  return contractSignal(failures.length ? 'FAIL' : 'INCOMPLETE', entityIds, missing, blockers.length ? blockers : ['JACK_HEAD_BASE_SCREENING_REQUIRES_RESISTANCE_REVIEW'], evidenceRefs);
}

function supportContractSignal(model: WorkflowModel, supports: ReturnType<typeof evaluateSupportLayout> | null) {
  const entityIds = supports?.rows.flatMap(row => [row.id, row.frameNodeId, ...row.contacts.map(contact => `${row.id}/${contact.id}`)]) ?? [];
  if (!entityIds.length) return contractSignal('INCOMPLETE', [], ['SUPPORT_ENTITY_SET_REQUIRED'], ['SUPPORT_CONTACT_NO_ACTUAL_SUPPORT_PATH']);
  const failures = supports?.rows.filter(row => row.status === 'FAIL').map(row => `${row.id}:SUPPORT_FAIL`) ?? [];
  const blockers = [...(supports?.blockers ?? []), ...(supports?.rows.flatMap(row => [...row.issues.map(issue => `${row.id}:${issue}`),
    ...row.contacts.flatMap(contact => contact.issues.map(issue => `${row.id}/${contact.id}:${issue}`))]) ?? [])];
  const missing = ['SUPPORT_CONTACT_RESISTANCE_SETTLEMENT_AND_SUPPORT_BASIS_REQUIRED'];
  if (!supports?.completeTerminalWrenchCoverage) missing.push('COMPLETE_BASE_TO_SUPPORT_WRENCH_COVERAGE_REQUIRED');
  if (model.supportLayout?.bases.some(base => !base.supportEvidenceRef.trim() || !base.supportKind)) missing.push('ACTUAL_FOUNDATION_OR_SLAB_SUPPORT_EVIDENCE_REQUIRED');
  const evidenceRefs = [...(model.supportLayout?.evidenceRef ? [model.supportLayout.evidenceRef] : []), ...(model.supportLayout?.bases.flatMap(base => [base.datumEvidenceRef, base.supportEvidenceRef,
    ...base.interfaces.flatMap(contact => [contact.geometryEvidenceRef, contact.modelEvidenceRef, contact.limitEvidenceRef, contact.soilSpringEvidenceRef])]) ?? [])];
  return contractSignal(failures.length ? 'FAIL' : 'INCOMPLETE', entityIds, missing, blockers.length ? blockers : ['SUPPORT_CONTACT_SCREENING_REQUIRES_RESISTANCE_AND_GROUND_REVIEW'], evidenceRefs);
}

export function previewSingleWorkflow(raw: WorkflowModel) {
  const model = parseWorkflowModel(raw), topology = pairFaces(model.vertices, model.heightMm);
  const blockers: string[] = ['ENGINEERING_CAPACITY_METHODS_AND_TRUSTED_REVISION_REVIEW_REQUIRED'];
  if (!model.humanInputReviewed) blockers.push('HUMAN_INPUT_REVIEW_REQUIRED');
  if (!model.sourceRef?.trim()) blockers.push('SOURCE_GEOMETRY_EVIDENCE_REQUIRED');
  if (!model.designBasisRef?.trim()) blockers.push('DESIGN_BASIS_REQUIRED');
  if (model.legacy) blockers.push('LEGACY_DEMO_INPUTS_REQUIRE_EXPLICIT_PRODUCT_AND_CRITERIA_REVIEW');
  if (!model.selections.section || !model.selections.material) blockers.push('SECTION_MATERIAL_SELECTION_REQUIRED');
  if (model.elementType !== 'SLAB' && !model.sideTopology) blockers.push('SIDE_TIE_OR_CLAMP_TOPOLOGY_REQUIRED');
  let verticalLoads: ReturnType<typeof slabLoads> | ReturnType<typeof beamLoads> | null = null;
  try {
    if (model.elementType === 'SLAB') {
      if (model.slabThicknessMm !== model.heightMm) throw Error('Slab thickness must match concrete geometry height');
      verticalLoads = slabLoads(finite(model.gammaKNm3, 'gamma'), finite(model.slabThicknessMm, 'slab thickness'), model.additionalDeadKPa, model.constructionLiveKPa);
    }
    if (model.elementType === 'BEAM') verticalLoads = beamLoads({gamma: finite(model.gammaKNm3, 'gamma'), bMm: finite(model.beamWidthMm, 'beam width'), hMm: model.heightMm,
      slabThicknessMm: finite(model.slabThicknessMm, 'slab thickness', true), concreteStripMm: finite(model.concreteStripMm, 'concrete strip'), deadKPa: model.additionalDeadKPa,
      deadStripMm: finite(model.deadStripMm, 'dead strip'), liveKPa: model.constructionLiveKPa, liveStripMm: finite(model.liveStripMm, 'live strip')});
  } catch (e) {blockers.push(`VERTICAL_LOADS:${(e as Error).message}`);}
  let candidate: ReturnType<typeof buildSoffitCandidate> | null = null, mappingValid = true;
  if (model.soffitLayout) {
    try {
      candidate = buildSoffitCandidate(model, model.soffitLayout);
      if (canonical(candidate.members) !== canonical(model.members) || canonical(candidate.actions) !== canonical(model.actions) ||
        canonical(candidate.ringlock.legs) !== canonical(model.ringlock?.legs ?? null) || canonical(candidate.requiredChecks) !== canonical(model.requiredChecks)) {
        mappingValid = false; blockers.push('SOFFIT_LAYOUT_LOAD_OR_MEMBER_MAPPING_STALE');
      }
      blockers.push(...candidate.configurationIssues, ...candidate.assumptions.map(a => `SOFFIT_SCOPE:${a}`));
    } catch (e) {mappingValid = false; blockers.push(`SOFFIT_LAYOUT:${(e as Error).message}`);}
  }
  let loadPath: ReturnType<typeof analyzeLoadPath> | null = null;
  if (!model.members.length && ['BEAM', 'SLAB'].includes(model.elementType)) blockers.push('ACTUAL_MEMBER_SUPPORT_LOAD_PATH_REQUIRED');
  else if (!model.members.length) { /* Side-only elements have no implied soffit graph. */ }
  else if (!mappingValid) blockers.push('SOFFIT_CANDIDATE_REGENERATION_REQUIRED');
  else if (model.members.some(m => m.beam.revision !== model.revisionId)) blockers.push('UPSTREAM_ANALYSIS_REVISION_STALE');
  else try {loadPath = analyzeLoadPath(model.members); blockers.push(...loadPath.blockers);} catch (e) {blockers.push(`ANALYSIS:${(e as Error).message}`);}
  const terminalForceN = loadPath ? loadPath.reactions.reduce((s, r) => s + r.forceN, 0) : null;
  const forceResidualN = candidate && terminalForceN !== null ? terminalForceN - candidate.expectedForceN : null;
  const momentResidual = candidate && loadPath ? {
    xLeverNmm: loadPath.reactions.reduce((s, r) => s + r.forceN * r.point.xMm, 0) - candidate.expectedXMomentNmm,
    yLeverNmm: loadPath.reactions.reduce((s, r) => s + r.forceN * r.point.yMm, 0) - candidate.expectedYMomentNmm} : null;
  if (candidate && forceResidualN !== null && Math.abs(forceResidualN) > Math.max(1, candidate.expectedForceN) * 1e-7) {
    blockers.push('SOFFIT_GLOBAL_LOAD_BALANCE_FAILED'); loadPath = null;
  }
  const leverScale = (axis: 'xMm' | 'yMm') => Math.max(1, loadPath?.reactions.reduce((s, r) => s + Math.abs(r.forceN * r.point[axis]), 0) ?? 0);
  if (candidate && momentResidual && (Math.abs(momentResidual.xLeverNmm) > leverScale('xMm') * 1e-7 ||
    Math.abs(momentResidual.yLeverNmm) > leverScale('yMm') * 1e-7)) {
    blockers.push('SOFFIT_GLOBAL_MOMENT_BALANCE_FAILED'); loadPath = null;
  }
  const beamResistanceStatus = loadPath?.analyses.length
    ? loadPath.analyses.some(a => a.resistanceScreen.status === 'FAIL') ? 'FAIL'
      : loadPath.analyses.every(a => a.resistanceScreen.status === 'SCREENED') ? 'SCREENED' : 'INCOMPLETE'
    : null;
  if (beamResistanceStatus === 'FAIL') blockers.push('ONE_D_MEMBER_RESISTANCE_LIMIT_EXCEEDED');
  else if (beamResistanceStatus === 'INCOMPLETE') blockers.push('ONE_D_MEMBER_RESISTANCE_EVIDENCE_REQUIRED');
  let side: ReturnType<typeof analyzeSideLayout> | null = null;
  if (model.sideLayout) {
    try {side = analyzeSideLayout(model, model.sideLayout); blockers.push(...side.blockers);} catch (e) {blockers.push(`SIDE_LAYOUT:${(e as Error).message}`);}
  } else if (model.elementType !== 'SLAB') blockers.push('ACTUAL_SIDE_FACE_STUD_WALER_RESTRAINT_LAYOUT_REQUIRED');
  if (model.sideLayout && model.soffitLayout && (model.sideLayout.stageId !== model.soffitLayout.stageId || model.sideLayout.loadCaseId !== model.soffitLayout.loadCaseId)) blockers.push('SIDE_SOFFIT_STAGE_OR_LOADCASE_DIFFER_COMMON_SYSTEM_ANALYSIS_NOT_ESTABLISHED');
  if (model.sideLayout && model.soffitLayout) blockers.push('SIDE_SOFFIT_PHYSICAL_VERTICAL_DATUM_AND_CONTACT_CLOSURE_REQUIRED');
  if (!model.actions.length && side) blockers.push('SIDE_PRESSURE_LEDGER_ONLY_OTHER_ACTIONS_UNVERIFIED');
  else blockers.push(...loadOwnershipIssues(model.actions));
  const assembly = model.ringlockAssembly ? evaluateRinglockAssembly(model, model.ringlockAssembly) : null;
  if (assembly) blockers.push(...assembly.blockers, ...assembly.rows.flatMap(r => r.issues.map(s => `${r.legId}:${s}`)));
  const frame = model.frameLayout ? evaluateFrameLayout(model, model.frameLayout, loadPath?.reactions ?? null, side?.nodes ?? null) : null;
  if (frame) blockers.push(...frame.blockers);
  else if (['BEAM', 'SLAB'].includes(model.elementType)) blockers.push('ACTUAL_FRAME_GEOMETRY_CONNECTIONS_BOUNDARIES_AND_METHOD_REQUIRED');
  const supports = model.supportLayout ? evaluateSupportLayout(model, model.supportLayout, frame) : null;
  const headBearings = assembly ? evaluateHeadBearings(model, assembly, loadPath?.reactions ?? null) : null;
  if (headBearings) blockers.push(...headBearings.blockers, ...headBearings.rows.flatMap(r => r.issues.map(i => `${r.legId}/HEAD_CONTACT:${i}`)));
  if (supports) blockers.push(...supports.blockers, ...supports.rows.flatMap(r => [...r.issues.map(i => `${r.id}:${i}`), ...r.contacts.flatMap(c => c.issues.map(i => `${r.id}/${c.id}:${i}`))]));
  else if (frame?.analysis) blockers.push('ACTUAL_BASE_TO_SUPPORT_CONTACT_AND_FOUNDATION_PATH_REQUIRED');
  const requiredChecks = [...model.requiredChecks, ...(side?.requiredChecks ?? []), ...(frame?.requiredChecks ?? []), ...(assembly?.requiredChecks ?? []), ...(supports?.requiredChecks ?? []), ...(headBearings?.requiredChecks ?? [])];
  const coverage = coverageIssues(requiredChecks, model.representatives, model.coverage);
  const coverageReview = evaluateCoverageReview(model, requiredChecks, [...loadPath?.analyses ?? [], ...candidate?.plywood?.strips.map(s => s.analysis) ?? [],
    ...side?.faces.flatMap(f => [...f.panels.map(p => p.analysis), ...f.result.studs.map(s => s.analysis), ...f.result.walers.flatMap(w => w.rails)]) ?? []]);
  blockers.push('REQUIRED_CHECK_ENGINEERING_RESULTS_AND_TYPICAL_APPLICABILITY_REVIEW_REQUIRED');
  blockers.push(...coverage);
  const specificationGaps = model.checkCatalogue?.specifications.filter(s => (s.appliesTo === 'ALL' || s.appliesTo.split('|').includes(model.elementType)) && !requiredChecks.some(r => r.checkId === s.id)).map(s => s.id) ?? [];
  if (!model.checkCatalogue) blockers.push('VERSIONED_REQUIRED_CHECK_CATALOGUE_MISSING');
  if (specificationGaps.length) blockers.push('REQUIRED_SPECIFICATIONS_NOT_ASSIGNED_TO_ACTUAL_MEMBERS');
  if (requiredChecks.some(r => r.revision !== model.revisionId)) blockers.push('REQUIRED_CHECK_REVISION_STALE');
  let ringlock: ReturnType<typeof screenRinglock> | null = null;
  let ringlockReference: ReturnType<typeof screenRinglockResearch> | null = null;
  if (model.elementType === 'BEAM' || model.elementType === 'SLAB') {
    if (model.ringlockResearch) {ringlockReference = screenRinglockResearch(model.ringlockResearch, model.ringlock); blockers.push(...ringlockReference.blockers);}
    else blockers.push('RINGLOCK_PROJECT_SECTION_MATERIAL_AND_JOINT_DATA_REQUIRED');
    if (!model.ringlock) blockers.push('RINGLOCK_CONFIGURATION_REQUIRED');
    else {ringlock = screenRinglock(model.ringlock, loadPath?.reactions.filter(r => r.kind === 'U_HEAD') ?? [], model.ringlockRating, model.revisionId, model.analysisCase?.basis ?? 'SERVICE'); blockers.push(...ringlock.blockers);}
  }
  let contractAudit = frame?.contractAudit ?? emptyRinglockContractAudit(model.revisionId, model.frameLayout?.stageId ?? '', model.frameLayout?.loadCaseId ?? '');
  const overlays: Parameters<typeof overlayContractSignals>[1] = {};
  if (assembly || headBearings) overlays.JACK_HEAD_BASE = headContractSignal(model, assembly, headBearings);
  if (supports) overlays.SUPPORT_CONTACT = supportContractSignal(model, supports);
  contractAudit = overlayContractSignals(contractAudit, overlays);
  if (frame) refreshProducedFrameContractAudit(frame, contractAudit);
  blockers.push(...contractAudit.blockers);
  return {engineVersion: WORKFLOW_VERSION, status: ringlock?.status === 'FAIL' || side?.status === 'FAIL' || assembly?.status === 'FAIL' || frame?.status === 'FAIL' || supports?.status === 'FAIL' || headBearings?.status === 'FAIL' || beamResistanceStatus === 'FAIL' ? 'FAIL' as const : 'BLOCKED' as const, topology,
    pressureBaseKPa: side ? side.faces[0].result.pressureBaseKPa : model.sideLayout || model.elementType === 'SLAB' || model.gammaKNm3 === null ? null : model.gammaKNm3 * model.heightMm / 1000 * actionFactor(model, 'HYDROSTATIC_SIDE'),
    verticalLoads, loadPath, ringlock, ringlockReference,
    soffit: candidate ? {expectedForceN: candidate.expectedForceN, terminalForceN, forceResidualN, momentResidual,
      ownedForceN: candidate.ownedForceN, additionalForceN: candidate.additionalForceN, spatialLoading: candidate.spatialLoading,
      assumptions: candidate.assumptions, elasticInputs: candidate.elasticInputs, plywood: candidate.plywood} : null,
    side, frame, assembly, supports, headBearings, contractAudit, contractAudits: [contractAudit], requiredChecks, coverageReview, coverageIssues: coverage, specificationGaps, blockers: [...new Set(blockers)], constructionEligible: false as const, constructionRelease: 'NO_GO' as const};
}

export function previewCaseWorkflow(raw: WorkflowModel) {
  const model = parseWorkflowModel(raw), base = previewSingleWorkflow(model), loadCases = evaluateLoadCases(model, base);
  if (!loadCases) return {...base, loadCases: null, contractAudits: base.contractAudits};
  const requiredChecks = [...base.requiredChecks, ...loadCases.cases.flatMap(c => c.requiredChecks)];
  const coverage = coverageIssues(requiredChecks, model.representatives, model.coverage);
  const beams = [...base.loadPath?.analyses ?? [], ...base.soffit?.plywood?.strips.map(s => s.analysis) ?? [], ...base.side?.faces.flatMap(f => [...f.panels.map(p => p.analysis), ...f.result.studs.map(s => s.analysis), ...f.result.walers.flatMap(w => w.rails)]) ?? []];
  const scoped = loadCases.cases.flatMap(c => c.preview ? [...c.preview.loadPath?.analyses ?? [], ...c.preview.soffit?.plywood?.strips.map(s => s.analysis) ?? [], ...c.preview.side?.faces.flatMap(f => [...f.panels.map(p => p.analysis), ...f.result.studs.map(s => s.analysis), ...f.result.walers.flatMap(w => w.rails)]) ?? []].map(analysis => ({analysis, loadCaseId: c.definition.loadCaseId})) : []);
  const contractAudits = [base.contractAudit, ...loadCases.cases.map(c => c.preview?.contractAudit).filter((a): a is NonNullable<typeof a> => a != null)];
  return {...base, loadCases, contractAudits, requiredChecks, coverageIssues: coverage, coverageReview: evaluateCoverageReview(model, requiredChecks, beams, scoped),
    status: base.status === 'FAIL' || loadCases.status === 'FAIL' ? 'FAIL' as const : 'BLOCKED' as const,
    blockers: [...new Set([...base.blockers, ...coverage, ...loadCases.blockers, ...loadCases.cases.flatMap(c => c.errors.map(e => `${c.definition.id}:${e}`))])]};
}

function replacePreviewContractAudit(preview: ReturnType<typeof previewCaseWorkflow>, audit: ReturnType<typeof emptyRinglockContractAudit>) {
  const previous = preview.contractAudit;
  if (preview.frame) refreshProducedFrameContractAudit(preview.frame, audit);
  preview.contractAudit = audit;
  preview.contractAudits = preview.contractAudits.map(candidate => candidate === previous ||
    (candidate.inputRevision === previous.inputRevision && candidate.stageId === previous.stageId && candidate.loadCaseId === previous.loadCaseId) ? audit : candidate);
}

function stageReleaseContractSignal(stageStudy: NonNullable<ReturnType<typeof evaluateStageStudy>>, rows = stageStudy.stages) {
  const entityIds = rows.map(row => `STAGE:${row.definition.id}`);
  const failures = rows.filter(row => row.status === 'FAIL').map(row => `${row.definition.id}:STAGE_PREVIEW_FAIL`);
  const blockers = [...stageStudy.blockers, ...rows.flatMap(row => row.errors.map(error => `${row.definition.id}:${error}`))];
  const missing = ['STAGE_RELEASE_ENGINEER_REVIEW_AND_HISTORY_RESHORING_METHOD_REQUIRED'];
  if (!stageStudy.current) missing.push('CURRENT_STAGE_STUDY_REVISION_REQUIRED');
  if (!stageStudy.activeCaptured) missing.push('ACTIVE_STAGE_CAPTURE_REQUIRED');
  const evidenceRefs = rows.map(row => row.definition.evidenceRef).filter(ref => ref.trim());
  return contractSignal(failures.length ? 'FAIL' : 'INCOMPLETE', entityIds, missing, blockers.length ? blockers : ['STAGE_RELEASE_REQUIRES_ENGINEER_REVIEW'], evidenceRefs);
}

export function previewWorkflow(raw: WorkflowModel) {
  const model = parseWorkflowModel(raw), base = previewCaseWorkflow(model), stageStudy = evaluateStageStudy(model);
  if (!stageStudy) return {...base, stageStudy: null, contractAudits: base.contractAudits};
  replacePreviewContractAudit(base, overlayContractSignals(base.contractAudit, {STAGE_RELEASE: stageReleaseContractSignal(stageStudy)}));
  for (const row of stageStudy.stages) if (row.preview) replacePreviewContractAudit(row.preview, overlayContractSignals(row.preview.contractAudit,
    {STAGE_RELEASE: stageReleaseContractSignal(stageStudy, [row])}));
  // The active editor is a view of a captured stage, not an extra physical structure.
  const includeActive = !stageStudy.current || !stageStudy.activeCaptured;
  const requiredChecks = [...(includeActive ? base.requiredChecks : []), ...stageStudy.stages.flatMap(s => s.requiredChecks)];
  const coverage = coverageIssues(requiredChecks, model.representatives, model.coverage);
  const scoped = [...stageStudy.stages.flatMap(s => s.scopedBeams), ...(includeActive ? base.loadCases?.cases.flatMap(c => c.preview ? previewBeams({...c.preview, loadCases: null}).map(analysis => ({analysis, loadCaseId: c.definition.loadCaseId})) : []) ?? [] : [])];
  const contractAudits = [...base.contractAudits, ...stageStudy.stages.map(s => s.preview?.contractAudit).filter((a): a is NonNullable<typeof a> => a != null)];
  return {...base, stageStudy, contractAudits, requiredChecks, coverageIssues: coverage, coverageReview: evaluateCoverageReview(model, requiredChecks, includeActive ? previewBeams(base) : [], scoped),
    status: base.status === 'FAIL' || stageStudy.status === 'FAIL' ? 'FAIL' as const : 'BLOCKED' as const,
    blockers: [...new Set([...base.blockers, ...coverage, ...stageStudy.blockers, ...stageStudy.stages.flatMap(s => s.errors.map(e => `${s.definition.id}:${e}`))])]};
}

export function applyCoverageReview(model: WorkflowModel, definition: CoverageReviewDefinition): WorkflowModel {
  return parseWorkflowModel({...clone(model), coverageReview: stampCoverageReview(model, definition)});
}

/** Input edits create a new draft identity and invalidate applicability/review; legacy source is provenance only. */
export function reviseDraft(model: WorkflowModel, patch: Partial<Omit<WorkflowModel, 'schemaVersion' | 'id' | 'revisionId' | 'legacy'>>) {
  if (canonical({...model, ...patch}) === canonical(model)) return clone(model);
  const next = {...clone(model), ...clone(patch), revisionId: globalThis.crypto.randomUUID(), humanInputReviewed: patch.humanInputReviewed === true && Object.keys(patch).length === 1,
    representatives: [], coverage: []};
  return parseWorkflowModel(next);
}

/** Only the explicit Analyze action rebuilds all authored layouts for one revision. Ordinary
 * field edits keep old analysis stale. No arbitrary supplied member graph is silently rebased.
 */
export function regenerateDraftLayouts(model: WorkflowModel, patch: Partial<Omit<WorkflowModel, 'schemaVersion' | 'id' | 'revisionId' | 'legacy'>> = {}, options: {allowIncomplete?: boolean} = {}): WorkflowModel {
  let next = reviseDraft(model, patch);
  if (next.soffitLayout) {
    try {
      const c = buildSoffitCandidate(next, next.soffitLayout);
      next = {...next, members: c.members, actions: c.actions, ringlock: c.ringlock, requiredChecks: c.requiredChecks, ringlockRating: null};
    } catch (e) {if (!options.allowIncomplete) throw e;}
  }
  if (next.sideLayout) next = {...next, sideLayout: stampSideLayout(next, next.sideLayout)};
  if (next.ringlockAssembly) next = {...next, ringlockAssembly: stampRinglockAssembly(next, next.ringlockAssembly)};
  if (next.frameLayout) next = {...next, frameLayout: stampFrameLayout(next, next.frameLayout)};
  if (next.supportLayout) next = {...next, supportLayout: stampSupportLayout(next, next.supportLayout)};
  const ready = parseWorkflowModel(next), preview = previewSingleWorkflow(ready);
  if (!options.allowIncomplete && ((ready.sideLayout && !preview.side) || (ready.soffitLayout && !preview.loadPath))) throw Error(preview.blockers.filter(b => /SIDE_LAYOUT:|ANALYSIS:|SOFFIT_/.test(b)).join('; '));
  return ready;
}
