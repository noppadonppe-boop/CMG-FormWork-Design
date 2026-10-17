import {canonical, clone, finite, identifier, record, signed, uniqueIds} from './common.js';
import {analyzeLinearFrame, type FrameAction, type FrameBoundary, type FrameElement, type FrameNode, type FrameVector, type LinearFrameInput} from './frameLinear.js';
import {transferSoffitReactionsToFrame, type FrameHeadMapping} from './frameLoadTransfer.js';
import type {WorkflowModel} from './model.js';
import type {RequiredCheck} from './coverage.js';
import type {DeliveredReaction} from './loadPath.js';
import {resolveFrameTubeBinding, validateFrameTubeBinding, type FrameTubeBinding} from './frameBinding.js';
import {assemblyFrameIssues, evaluateRinglockAssembly} from './ringlockAssembly.js';
import {actionFactor} from './caseFactors.js';
import {analyzeSideLayout, type SideNode} from './sideLayout.js';
import {emptySideFrame, transferSideReactionsToFrame, validateSideFrame, type SideFrameDefinition} from './sideFrameTransfer.js';
import {analyzeCoupledSideSupports} from './sideCoupled.js';
import {pairFaces} from './geometry.js';
import {analyzeSecondOrderFrame, validateSecondOrderDefinition, type SecondOrderDefinition} from './frameSecondOrder.js';
import {screenFrameMemberDemands, type FrameMemberDemandScreen} from './frameDemands.js';
import {validateResistanceEvidence, type ResistanceEvidence} from './resistanceEvidence.js';
import {screenBraceConnections, tensionOnlyActiveSet, type BraceEndEvidence} from './braceConnections.js';
import {screenFrameSls, validateSlsLimitEvidence, type FrameSlsScreen, type SlsLimitEvidence} from './frameSls.js';
import {auditRinglockContract, contractSignal, type ContractAudit, type ContractCheckStatus} from './contractAudit.js';

export type NullableVector = [number | null, number | null, number | null];
export type FrameBoundaryDraft = {kind: 'UNKNOWN'} | {kind: 'FREE'} | {kind: 'FIXED'} | {kind: 'PRESCRIBED'; value: number | null};
export const FRAME_ROLES = ['STANDARD', 'LEDGER', 'BRACE', 'HEAD_JACK', 'BASE_JACK', 'SPIGOT', 'LEDGER_JOINT', 'BRACE_JOINT', 'OTHER'] as const;
export interface FrameNodeDraft {id: string; role: 'HEAD' | 'SIDE_SUPPORT' | 'BASE' | 'ROSETTE' | 'SPLICE' | 'OTHER' | null; pointMm: NullableVector; boundary: FrameBoundaryDraft[]; evidenceRef: string;
  /** BASE nodes: reviewer evidence for anchor uplift (AXIAL_TENSION) and horizontal resultant (SHEAR_Y). */
  anchorResistance?: ResistanceEvidence[] | null}
export interface FrameElementDraft {
  id: string; nodeI: string; nodeJ: string; role: typeof FRAME_ROLES[number] | null; kind: FrameElement['kind'] | null;
  E_MPa: number | null; G_MPa: number | null; A_mm2: number | null; Iy_mm4: number | null; Iz_mm4: number | null; J_mm4: number | null;
  localX: NullableVector; localY: NullableVector; stiffness: (number | null)[]; evidenceRef: string;
  binding?: FrameTubeBinding | null;
  resistance?: ResistanceEvidence[] | null;
  /** AXIAL_BAR only: drops out of the solve when it would carry compression (active-set iteration). */
  tensionOnly?: boolean | null;
  /** Reviewer evidence for the fixing at each end of an AXIAL_BAR brace. */
  endResistance?: BraceEndEvidence | null;
}
export interface FrameActionDraft {
  id: string; nodeId: string; kind: 'SELF_WEIGHT' | 'WIND' | 'PLACEMENT' | 'OTHER' | null; ownershipId: string; evidenceRef: string;
  forceN: NullableVector; momentNmm: NullableVector; atNode: boolean | null; offsetMm: NullableVector; offsetEvidenceRef: string;
}
export interface FrameLayoutDefinition {
  schemaVersion: '1'; stageId: string; loadCaseId: string; actionBasis: 'SERVICE' | 'FACTORED' | null; assumptionEvidenceRef: string; acknowledgeLinearScope: boolean;
  loadSource: 'SOFFIT_REACTIONS' | 'SIDE_REACTIONS' | 'SOFFIT_AND_SIDE_REACTIONS' | 'FRAME_ACTIONS_ONLY' | null; excludeSoffitReason: string;
  nodes: FrameNodeDraft[]; elements: FrameElementDraft[]; headMappings: FrameHeadMapping[]; additionalActions: FrameActionDraft[];
  sls?: SlsLimitEvidence[] | null;
  sideTransfers?: SideFrameDefinition | null; secondOrder?: SecondOrderDefinition | null;
}
export interface AppliedFrameLayout extends FrameLayoutDefinition {revisionId: string; inputDefinition: string}
export const unknownFrameBoundary = (): FrameBoundaryDraft[] => Array.from({length: 6}, () => ({kind: 'UNKNOWN'}));
// Ephemeral calculation lineage only. Serialized/client JSON is never a produced analysis.
// This grants no product, engineering-review or construction authority.
const producedFrames = new WeakMap<object, {revision: string; inputs: string; layout: string; output: string}>();
export function currentProducedFrame(model: WorkflowModel, result: ReturnType<typeof evaluateFrameLayout>) {
  const source = producedFrames.get(result);
  if (!source || !model.frameLayout || source.revision !== model.revisionId || source.inputs !== frameInputDefinition(model) || source.layout !== canonical(model.frameLayout) || source.output !== canonical(result)) throw Error('CURRENT_UNMODIFIED_IN_PROCESS_FRAME_ANALYSIS_REQUIRED');
  if (!result.input || !result.analysis) throw Error('SOLVED_CURRENT_FRAME_ANALYSIS_REQUIRED');
  return result.analysis;
}

/** Attach a later audit overlay without breaking the ephemeral frame lineage
 * used by support transfer. The object identity and canonical output remain
 * the same produced calculation; only its traceability audit is refreshed. */
export function refreshProducedFrameContractAudit(result: ReturnType<typeof evaluateFrameLayout>, contractAudit: ContractAudit) {
  result.contractAudit = contractAudit;
  result.blockers = [...new Set([...result.blockers, ...contractAudit.blockers])];
  const source = producedFrames.get(result);
  if (source) source.output = canonical(result);
  return result;
}
export function emptyFrameLayout(): FrameLayoutDefinition {
  return {schemaVersion: '1', stageId: '', loadCaseId: '', actionBasis: null, assumptionEvidenceRef: '', acknowledgeLinearScope: false,
    loadSource: null, excludeSoffitReason: '', nodes: [], elements: [], headMappings: [], additionalActions: [], secondOrder: null};
}
export function emptyFrameElement(id: string): FrameElementDraft {
  return {id, nodeI: '', nodeJ: '', role: null, kind: null, E_MPa: null, G_MPa: null, A_mm2: null, Iy_mm4: null, Iz_mm4: null, J_mm4: null,
    localX: [null, null, null], localY: [null, null, null], stiffness: Array(6).fill(null), evidenceRef: '', binding: null};
}
function exact(raw: object, keys: string[], name: string, optional: string[] = []) {
  if (Object.keys(raw).some(k => !keys.includes(k) && !optional.includes(k)) || keys.some(k => !Object.hasOwn(raw, k))) throw Error(`Invalid ${name}: unknown/missing fields or authority metadata`);
}
function text(raw: unknown, name: string, max = 2000) {if (typeof raw !== 'string' || raw.length > max) throw Error(`Invalid ${name}`);}
function requiredText(raw: unknown, label: string) {text(raw, label); if (!(raw as string).trim()) throw Error(`${label} required`);}
function tuple(raw: unknown, count: number, label: string, positive = false, zero = false) {
  if (!Array.isArray(raw) || raw.length !== count) throw Error(`Invalid ${label}`);
  raw.forEach(v => {if (v !== null) {if (positive) finite(v, label, zero); else signed(v, label);}});
}
/** Draft validation permits explicit unknowns, not invalid values or imported verdicts. */
export function validateFrameLayout(raw: unknown): asserts raw is AppliedFrameLayout {
  const f = record(raw);
  exact(f, ['schemaVersion', 'stageId', 'loadCaseId', 'actionBasis', 'assumptionEvidenceRef', 'acknowledgeLinearScope', 'loadSource', 'excludeSoffitReason', 'nodes', 'elements', 'headMappings', 'additionalActions', 'revisionId', 'inputDefinition'], 'frame draft', ['sideTransfers', 'secondOrder', 'sls']);
  if (f.schemaVersion !== '1' || ![null, 'SERVICE', 'FACTORED'].includes(f.actionBasis as string | null) || ![null, 'SOFFIT_REACTIONS', 'SIDE_REACTIONS', 'SOFFIT_AND_SIDE_REACTIONS', 'FRAME_ACTIONS_ONLY'].includes(f.loadSource as string | null) || typeof f.acknowledgeLinearScope !== 'boolean') throw Error('Invalid frame method/source/basis');
  if (f.sideTransfers != null) validateSideFrame(f.sideTransfers);
  if (f.secondOrder != null) validateSecondOrderDefinition(f.secondOrder);
  if (f.sls !== undefined && f.sls !== null) {
    if (!Array.isArray(f.sls) || f.sls.length > 480) throw Error('Invalid frame SLS limit evidence list');
    f.sls.forEach(validateSlsLimitEvidence);
  }
  for (const key of ['stageId', 'loadCaseId', 'assumptionEvidenceRef', 'excludeSoffitReason', 'revisionId']) text(f[key], key);
  text(f.inputDefinition, 'frame input definition', 500000);
  for (const [key, max] of [['nodes', 80], ['elements', 240], ['headMappings', 80], ['additionalActions', 1000]] as const) if (!Array.isArray(f[key]) || (f[key] as unknown[]).length > max) throw Error(`Invalid frame ${key}`);
  const layout = f as unknown as AppliedFrameLayout;
  uniqueIds(layout.nodes, 'frame draft nodes'); uniqueIds(layout.elements, 'frame draft elements'); uniqueIds(layout.additionalActions, 'frame draft actions');
  for (const n of layout.nodes) {
    exact(n, ['id', 'role', 'pointMm', 'boundary', 'evidenceRef'], 'frame node draft', ['anchorResistance']);
    if (![null, 'HEAD', 'SIDE_SUPPORT', 'BASE', 'ROSETTE', 'SPLICE', 'OTHER'].includes(n.role)) throw Error('Invalid node role');
    if (n.anchorResistance != null) {
      if (!Array.isArray(n.anchorResistance) || n.anchorResistance.length > 8) throw Error(`${n.id}: invalid anchor evidence list`);
      n.anchorResistance.forEach(validateResistanceEvidence);
      if (n.role !== 'BASE') throw Error(`${n.id}: anchor evidence applies to BASE nodes only`);
    }
    tuple(n.pointMm, 3, 'node coordinates'); text(n.evidenceRef, 'node evidence');
    if (!Array.isArray(n.boundary) || n.boundary.length !== 6) throw Error('Six frame boundary entries required');
    for (const b of n.boundary) {record(b); exact(b, b.kind === 'PRESCRIBED' ? ['kind', 'value'] : ['kind'], 'boundary');
      if (!['UNKNOWN', 'FREE', 'FIXED', 'PRESCRIBED'].includes(b.kind)) throw Error('Unknown boundary kind');
      if (b.kind === 'PRESCRIBED' && b.value !== null) signed(b.value, 'prescribed displacement');}
  }
  let bindingSize = 0;
  for (const e of layout.elements) {
    exact(e, Object.keys(emptyFrameElement('SCHEMA')).filter(k => k !== 'binding'), 'frame member draft', ['binding', 'resistance', 'tensionOnly', 'endResistance']);
    if (e.tensionOnly != null && (typeof e.tensionOnly !== 'boolean' || (e.tensionOnly && e.kind !== 'AXIAL_BAR'))) throw Error(`${e.id}: tension-only applies to AXIAL_BAR members`);
    if (e.endResistance != null) {
      exact(e.endResistance, ['I', 'J'], 'brace end evidence');
      if (e.kind !== 'AXIAL_BAR') throw Error(`${e.id}: end fixing evidence applies to AXIAL_BAR braces`);
      for (const end of ['I', 'J'] as const) if (e.endResistance[end] != null) {
        if (!Array.isArray(e.endResistance[end]) || e.endResistance[end]!.length > 8) throw Error(`${e.id}: invalid ${end} end evidence list`);
        e.endResistance[end]!.forEach(validateResistanceEvidence);
      }
    }
    if (e.binding !== undefined && e.binding !== null) {validateFrameTubeBinding(e.binding); bindingSize += canonical(e.binding).length;}
    if (e.resistance !== undefined && e.resistance !== null) {
      if (!Array.isArray(e.resistance) || e.resistance.length > 32) throw Error(`${e.id}: invalid resistance evidence list`);
      e.resistance.forEach(validateResistanceEvidence);
    }
    if (!(e.role === null || FRAME_ROLES.includes(e.role)) || ![null, 'BEAM_COLUMN', 'AXIAL_BAR', 'JOINT_SPRING'].includes(e.kind)) throw Error('Invalid frame role/kind');
    for (const k of ['nodeI', 'nodeJ', 'evidenceRef']) text(e[k as keyof FrameElementDraft], k);
    for (const k of ['E_MPa', 'G_MPa', 'A_mm2', 'Iy_mm4', 'Iz_mm4', 'J_mm4'] as const) if (e[k] !== null) finite(e[k], k);
    tuple(e.localX, 3, 'local X'); tuple(e.localY, 3, 'local Y'); tuple(e.stiffness, 6, 'joint stiffness', true, true);
  }
  if (bindingSize > 1000000) throw Error('FRAME_CAPTURED_BINDINGS_EXCEED_1000000_CHARACTER_LIMIT; no members omitted');
  for (const m of layout.headMappings) {exact(m, ['headNodeId', 'frameNodeId', 'offsetEvidenceRef'], 'head mapping'); text(m.headNodeId, 'head ID', 300); text(m.frameNodeId, 'frame node ID', 300); if (m.offsetEvidenceRef !== null) text(m.offsetEvidenceRef, 'offset evidence');}
  const knownHeads = layout.headMappings.map(m => m.headNodeId).filter(Boolean);
  if (new Set(knownHeads).size !== knownHeads.length) throw Error('Duplicate head mapping');
  for (const a of layout.additionalActions) {
    exact(a, ['id', 'nodeId', 'kind', 'ownershipId', 'evidenceRef', 'forceN', 'momentNmm', 'atNode', 'offsetMm', 'offsetEvidenceRef'], 'frame action draft');
    if (![null, 'SELF_WEIGHT', 'WIND', 'PLACEMENT', 'OTHER'].includes(a.kind) || ![null, true, false].includes(a.atNode)) throw Error('Invalid action kind/application');
    for (const k of ['nodeId', 'ownershipId', 'evidenceRef', 'offsetEvidenceRef'] as const) text(a[k], k);
    tuple(a.forceN, 3, 'force N'); tuple(a.momentNmm, 3, 'moment Nmm'); tuple(a.offsetMm, 3, 'load offset mm');
  }
}
export function frameInputDefinition(model: WorkflowModel) {
  return canonical({id: model.id, elementType: model.elementType, vertices: model.vertices, heightMm: model.heightMm,
    gammaKNm3: model.gammaKNm3, designBasisRef: model.designBasisRef, selections: model.selections, ringlockResearch: model.ringlockResearch ?? null,
    soffitLayout: model.soffitLayout ?? null, sideLayout: model.sideLayout ?? null, ringlockAssembly: model.ringlockAssembly ?? null, analysisCase: model.analysisCase ?? null, members: model.members, actions: model.actions, ringlock: model.ringlock});
}
export function stampFrameLayout(model: WorkflowModel, definition: FrameLayoutDefinition): AppliedFrameLayout {
  const result = {...clone(definition), revisionId: model.revisionId, inputDefinition: frameInputDefinition(model)};
  validateFrameLayout(result); return result;
}
/** Geometry capture creates no members, properties, supports or capacities. */
export function frameGeometryFromSoffit(model: WorkflowModel, reactions: DeliveredReaction[]): FrameLayoutDefinition {
  if (!model.soffitLayout || !model.ringlock || !reactions.length || reactions.some(r => r.kind !== 'U_HEAD' || r.upstreamRevision !== model.revisionId)) throw Error('Current authored soffit U-head reactions required');
  const result = {...emptyFrameLayout(), stageId: model.soffitLayout.stageId, loadCaseId: model.soffitLayout.loadCaseId, loadSource: 'SOFFIT_REACTIONS' as const};
  const ids = [...new Set(reactions.map(r => r.nodeId))];
  if (ids.length * 2 > 80) throw Error('FRAME_GEOMETRY_EXCEEDS_80_NODE_LIMIT; no heads were omitted');
  ids.forEach((id, i) => {
    const leg = model.ringlock!.legs.find(l => l.headNodeId === id), r = reactions.find(r => r.nodeId === id)!;
    if (!leg || Math.hypot(leg.xMm - r.point.xMm, leg.yMm - r.point.yMm, leg.headElevationMm - r.point.zMm) > 1e-7) throw Error('Head coordinates do not match actual leg geometry');
    result.nodes.push({id: `FH-${i + 1}`, role: 'HEAD', pointMm: [r.point.xMm, r.point.yMm, r.point.zMm], boundary: unknownFrameBoundary(), evidenceRef: `GEOMETRY_ONLY:${model.revisionId}:${id}`});
    result.nodes.push({id: `FB-${i + 1}`, role: 'BASE', pointMm: [leg.xMm, leg.yMm, leg.baseElevationMm], boundary: unknownFrameBoundary(), evidenceRef: `GEOMETRY_ONLY:${model.revisionId}:${leg.id}`});
    result.headMappings.push({headNodeId: id, frameNodeId: `FH-${i + 1}`, offsetEvidenceRef: null});
  });
  return result;
}
/** Only actual side support datums. No anchors, braces, connection stiffness or fixities. */
export function frameGeometryFromSide(model: WorkflowModel): FrameLayoutDefinition {
  const mixed = !!model.sideLayout?.ties.length && ['THROUGH_TIE', 'SEGMENTED_TIE'].includes(model.sideTopology ?? '');
  if (!model.sideLayout || (!mixed && (!['COLUMN_YOKE', 'GROUND_BRACED'].includes(model.sideTopology ?? '') || model.sideLayout.ties.length))) throw Error('Explicit current yoke/ground-braced side layout without ties, or tied layout with untied supports, required');
  const side = analyzeSideLayout(model, model.sideLayout), tied = new Set(side.ties.flatMap(t => [t.a.id, t.b.id]));
  // Mixed capture only lists untied supports; the scope still has to be selected explicitly.
  const actual = side.nodes.filter(n => !tied.has(n.id));
  if (!actual.length || actual.length > 80) throw Error('SIDE_FRAME_GEOMETRY_EXCEEDS_80_NODE_LIMIT_OR_EMPTY; no support omitted');
  const result: FrameLayoutDefinition = {...emptyFrameLayout(), stageId: model.sideLayout.stageId, loadCaseId: model.sideLayout.loadCaseId,
    loadSource: 'SIDE_REACTIONS', sideTransfers: emptySideFrame()};
  actual.forEach((s, i) => {
    const id = `FS-${i + 1}`;
    result.nodes.push({id, role: 'SIDE_SUPPORT', pointMm: [s.point.xMm, s.point.yMm, s.point.zMm], boundary: unknownFrameBoundary(), evidenceRef: `GEOMETRY_ONLY:${model.revisionId}`});
    result.sideTransfers!.mappings.push({faceId: s.faceId, walerId: s.walerId, supportId: s.supportId, frameNodeId: id, connectionEvidenceRef: '', offsetEvidenceRef: null});
  });
  return result;
}
function valueVector(v: NullableVector, label: string): FrameVector {return v.map(n => signed(n, label)) as FrameVector;}
/** Authored component datums only. Separate splice nodes never imply rigid joint stiffness. */
export function frameGeometryFromAssembly(model: WorkflowModel): FrameLayoutDefinition {
  if (!model.ringlockAssembly) throw Error('No authored Ringlock assembly');
  const a = evaluateRinglockAssembly(model, model.ringlockAssembly);
  if (!a.frameGeometryReady) throw Error('CURRENT_CLOSED_RINGLOCK_ASSEMBLY_GEOMETRY_REQUIRED');
  const result: FrameLayoutDefinition = {...emptyFrameLayout(), stageId: model.ringlockAssembly.stageId, loadCaseId: model.ringlockAssembly.loadCaseId, loadSource: 'SOFFIT_REACTIONS'};
  result.nodes = a.rows.flatMap(r => r.nodes.map(n => ({...n, boundary: unknownFrameBoundary()})));
  result.elements = a.rows.flatMap(r => r.segments.map(e => ({...emptyFrameElement(e.id), nodeI: e.nodeI, nodeJ: e.nodeJ, role: e.role, kind: e.kind})));
  result.headMappings = a.rows.map(r => ({headNodeId: r.headNodeId, frameNodeId: r.nodes.find(n => n.role === 'HEAD')!.id, offsetEvidenceRef: null}));
  if (result.nodes.length > 80 || result.elements.length > 240) throw Error('ASSEMBLY_FRAME_EXCEEDS_80_NODE_OR_240_ELEMENT_LIMIT; no leg omitted');
  return result;
}
function frameRequirements(model: WorkflowModel, layout: AppliedFrameLayout): RequiredCheck[] {
  if (!layout.stageId.trim() || !layout.loadCaseId.trim()) return [];
  const all = layout.elements, nodes = layout.nodes, system = `FRAME:${model.id}`;
  const role = (...roles: (typeof FRAME_ROLES[number])[]) => all.filter(e => e.role !== null && roles.includes(e.role)).map(e => `FRAME:${e.id}`);
  const checks: RequiredCheck[] = [];
  for (const spec of model.checkCatalogue?.specifications ?? []) {
    if (spec.appliesTo !== 'ALL' && !spec.appliesTo.split('|').includes(model.elementType)) continue;
    let targets: string[] = [];
    if (spec.id === 'SLS') {
      // SLS limits are authored per actual node/DOF, not inherited from a
      // member or a typical mirror. The six quantity rows are screened by
      // frameSls.ts and remain blocked until each node has evidence.
      targets = nodes.map(n => `FRAME-NODE:${n.id}`);
    } else if (spec.group === 'RINGLOCK') {
      targets = spec.id === 'RINGLOCK-01' ? all.map(e => `FRAME:${e.id}`) : spec.id === 'RINGLOCK-03' || spec.id === 'RINGLOCK-11' ? role('BRACE', 'BRACE_JOINT') :
        spec.id === 'RINGLOCK-05' ? role('HEAD_JACK') : spec.id === 'RINGLOCK-06' ? role('BASE_JACK') : ['RINGLOCK-07', 'RINGLOCK-08'].includes(spec.id) ? role('STANDARD') :
        spec.id === 'RINGLOCK-09' ? role('SPIGOT') : spec.id === 'RINGLOCK-10' ? role('LEDGER', 'LEDGER_JOINT') :
        ['RINGLOCK-16', 'RINGLOCK-17'].includes(spec.id) ? nodes.filter(n => n.role === 'BASE').map(n => `FRAME-NODE:${n.id}`) : [system];
    } else if (spec.id === 'SIDE-10' && ['SIDE_REACTIONS', 'SOFFIT_AND_SIDE_REACTIONS'].includes(layout.loadSource ?? '')) targets = [system, ...all.map(e => `FRAME:${e.id}`), ...nodes.filter(n => ['BASE', 'SIDE_SUPPORT'].includes(n.role ?? '')).map(n => `FRAME-NODE:${n.id}`)];
    else if (spec.group === 'TYPICAL') targets = all.map(e => `FRAME:${e.id}`);
    for (const memberId of targets) checks.push({memberId, checkId: spec.id, loadCaseId: layout.loadCaseId, revision: layout.revisionId,
      applicability: {stageId: layout.stageId, analysisCase: model.analysisCase ?? null, method: layout.secondOrder ? 'ITERATIVE_P_DELTA_GEOMETRIC_STIFFNESS' : 'FIRST_ORDER_LINEAR_ELASTIC_3D', memberId, assumptionEvidenceRef: layout.assumptionEvidenceRef,
        memberDefinition: all.find(e => `FRAME:${e.id}` === memberId) ?? nodes.find(n => `FRAME-NODE:${n.id}` === memberId) ?? {frameSystem: true}}});
  }
  return checks;
}

function roleEntityIds(layout: AppliedFrameLayout, roles: string[]) {
  return layout.elements.filter(e => e.role !== null && roles.includes(e.role)).map(e => e.id);
}

function roleDemandSignal(demands: FrameMemberDemandScreen | null, layout: AppliedFrameLayout, roles: string[], label: string) {
  const entityIds = roleEntityIds(layout, roles);
  const records = demands?.records.filter(r => r.role !== null && roles.includes(r.role)) ?? [];
  if (!entityIds.length) return contractSignal('INCOMPLETE', [], [`${label}_ENTITY_SET_REQUIRED`], [`${label}_NO_ACTUAL_ENTITY_OR_EXPLICIT_NA_REVIEW`]);
  if (!demands || !records.length) return contractSignal('INCOMPLETE', entityIds, [`${label}_DEMAND_AND_RESISTANCE_SCREEN_REQUIRED`], [`${label}_DEMAND_SCREEN_NOT_AVAILABLE`]);
  const status: ContractCheckStatus = records.some(r => r.status === 'FAIL') ? 'FAIL' : records.every(r => r.status === 'SCREENED') ? 'SCREENED' : 'INCOMPLETE';
  return contractSignal(status, entityIds,
    [...records.flatMap(r => r.missingInputs), ...(status === 'SCREENED' ? [] : [`${label}_REVIEWED_RESISTANCE_REQUIRED`])],
    [...(demands.blockers ?? []), `${label}_SCREENING_IS_NOT_CONSTRUCTION_APPROVAL`],
    records.flatMap(r => r.resistanceChecks.flatMap(c => c.evidence?.evidenceRef ? [c.evidence.evidenceRef] : [])));
}

/** Map the current frame evidence to all twelve contract rows. Unknown product,
 * connection and support data remain explicit INCOMPLETE rows. */
function frameContractAudit(layout: AppliedFrameLayout, analysis: ReturnType<typeof analyzeLinearFrame> | null,
  secondOrder: ReturnType<typeof analyzeSecondOrderFrame> | null, demands: FrameMemberDemandScreen | null,
  sls: FrameSlsScreen | null, frameBlockers: string[]): ContractAudit {
  const nodeIds = layout.nodes.map(n => n.id), elementIds = layout.elements.map(e => e.id);
  const signals = {
    LOAD_PATH: layout.loadSource && analysis ? contractSignal('SCREENED', [...layout.headMappings.map(m => m.headNodeId), ...layout.additionalActions.map(a => a.id)],
      ['UPSTREAM_FORMWORK_RESISTANCE_AND_SUPPORT_REVIEW_REQUIRED'], ['FRAME_LOAD_PATH_IS_SCREENING_ONLY']) :
      contractSignal('INCOMPLETE', [], ['CURRENT_LOAD_PATH_AND_FRAME_ACTIONS_REQUIRED'], ['FRAME_LOAD_PATH_ANALYSIS_NOT_AVAILABLE']),
    GLOBAL_STABILITY: secondOrder ? contractSignal(secondOrder.status === 'FAIL' ? 'FAIL' : secondOrder.status === 'DEMAND_PREVIEW' ? 'SCREENED' : 'INCOMPLETE', elementIds,
      ['GLOBAL_SWAY_TORSION_BOUNDARY_STIFFNESS_AND_SYSTEM_RESISTANCE_REQUIRED'],
      [...secondOrder.blockers, 'GLOBAL_SWAY_TORSION_BOUNDARY_STIFFNESS_AND_SYSTEM_STABILITY_UNVERIFIED']) :
      contractSignal('INCOMPLETE', elementIds, ['EXPLICIT_SECOND_ORDER_AND_GLOBAL_STABILITY_METHOD_REQUIRED'], ['GLOBAL_STABILITY_SCREEN_NOT_AVAILABLE']),
    STANDARD_N_M_V: roleDemandSignal(demands, layout, ['STANDARD'], 'STANDARD_N_M_V'),
    LEDGER_MEMBER: roleDemandSignal(demands, layout, ['LEDGER'], 'LEDGER_MEMBER'),
    BRACE_T_C: roleDemandSignal(demands, layout, ['BRACE'], 'BRACE_T_C'),
    LEDGER_ROSETTE: layout.elements.some(e => e.role === 'LEDGER_JOINT' || e.role === 'LEDGER') ?
      contractSignal('INCOMPLETE', roleEntityIds(layout, ['LEDGER', 'LEDGER_JOINT']), ['ROSETTE_HOLE_OCCUPANCY_AND_COMBINED_ACTION_DATA_REQUIRED'], ['LEDGER_ROSETTE_RESISTANCE_NOT_IMPLEMENTED']) :
      contractSignal('INCOMPLETE', [], ['LEDGER_ROSETTE_ENTITY_SET_REQUIRED'], ['LEDGER_ROSETTE_NO_ACTUAL_ENTITY_OR_EXPLICIT_NA_REVIEW']),
    ROSETTE_WELD: layout.nodes.some(n => n.role === 'ROSETTE') ?
      contractSignal('INCOMPLETE', layout.nodes.filter(n => n.role === 'ROSETTE').map(n => n.id), ['ROSETTE_WELD_METHOD_AND_ALL_CONNECTED_ACTIONS_REQUIRED'], ['ROSETTE_WELD_RESISTANCE_NOT_IMPLEMENTED']) :
      contractSignal('INCOMPLETE', [], ['ROSETTE_ENTITY_SET_REQUIRED'], ['ROSETTE_WELD_NO_ACTUAL_ENTITY_OR_EXPLICIT_NA_REVIEW']),
    SPIGOT: layout.elements.some(e => e.role === 'SPIGOT') ?
      contractSignal('INCOMPLETE', roleEntityIds(layout, ['SPIGOT']), ['SPIGOT_BOLT_SLACK_AND_N_M_RESISTANCE_REQUIRED'], ['SPIGOT_RESISTANCE_NOT_IMPLEMENTED']) :
      contractSignal('INCOMPLETE', [], ['SPIGOT_ENTITY_SET_REQUIRED'], ['SPIGOT_NO_ACTUAL_ENTITY_OR_EXPLICIT_NA_REVIEW']),
    JACK_HEAD_BASE: layout.elements.some(e => ['HEAD_JACK', 'BASE_JACK'].includes(e.role ?? '')) ?
      contractSignal('INCOMPLETE', [...roleEntityIds(layout, ['HEAD_JACK', 'BASE_JACK']), ...layout.nodes.filter(n => ['HEAD', 'BASE'].includes(n.role ?? '')).map(n => n.id)],
        ['JACK_EXTENSION_ENGAGEMENT_THREAD_N_M_V_AND_PLATE_RESISTANCE_REQUIRED'], ['JACK_HEAD_BASE_RESISTANCE_NOT_IMPLEMENTED']) :
      contractSignal('INCOMPLETE', [], ['HEAD_BASE_ENTITY_SET_REQUIRED'], ['JACK_HEAD_BASE_NO_ACTUAL_ENTITY_OR_EXPLICIT_NA_REVIEW']),
    SUPPORT_CONTACT: layout.nodes.some(n => ['BASE', 'SIDE_SUPPORT'].includes(n.role ?? '')) ?
      contractSignal('INCOMPLETE', layout.nodes.filter(n => ['BASE', 'SIDE_SUPPORT'].includes(n.role ?? '')).map(n => n.id),
        ['PLATE_FOOTPRINT_SUPPORT_STIFFNESS_SOIL_SLAB_AND_CONTACT_RESISTANCE_REQUIRED'], ['SUPPORT_CONTACT_REQUIRES_FOUNDATION_AND_YOUNG_SLAB_BASIS']) :
      contractSignal('INCOMPLETE', [], ['SUPPORT_ENTITY_SET_REQUIRED'], ['SUPPORT_CONTACT_NO_ACTUAL_ENTITY_OR_EXPLICIT_NA_REVIEW']),
    SLS: sls ? contractSignal(sls.status, sls.records.map(r => r.nodeId), ['PROJECT_SERVICEABILITY_LIMITS_AND_SUPPORT_FEEDBACK_REQUIRED'], sls.blockers) :
      contractSignal('INCOMPLETE', nodeIds, ['FRAME_SLS_SCREEN_REQUIRED'], ['FRAME_SLS_SCREEN_NOT_AVAILABLE']),
    STAGE_RELEASE: contractSignal('INCOMPLETE', [...nodeIds, ...elementIds], ['ALL_CONTRACT_CHECKS_STAGE_SEQUENCE_AND_SUPPORT_EVIDENCE_REQUIRED'],
      ['STAGE_RELEASE_REQUIRES_ENGINEER_REVIEW_AND_IS_NOT_IMPLEMENTED']),
  } as const;
  const audit = auditRinglockContract({inputRevision: analysis?.input.revisionId ?? layout.revisionId, stageId: layout.stageId, loadCaseId: layout.loadCaseId, signals});
  const extra = frameBlockers.filter(b => b.startsWith('FRAME_INPUT_OR_SOLVE:'));
  if (extra.length) audit.blockers.push(...extra);
  return audit;
}
export function evaluateFrameLayout(model: WorkflowModel, layout: AppliedFrameLayout, reactions: DeliveredReaction[] | null, sideNodes: SideNode[] | null = null) {
  validateFrameLayout(layout);
  const sourceDefinition = frameInputDefinition(model);
  const blockers = [layout.secondOrder ? 'FRAME_SECOND_ORDER_SCREENING_STILL_REQUIRES_GLOBAL_STABILITY_AND_RESISTANCE_REVIEW' : 'FRAME_FIRST_ORDER_DEMANDS_ONLY_SECOND_ORDER_AND_STABILITY_REQUIRED', 'FRAME_ACTUAL_JACK_SPIGOT_CONNECTION_AND_INSTALLED_DATUMS_UNVERIFIED',
    'FRAME_BASE_AND_MEMBER_ACTIONS_NOT_CONNECTED_TO_RESISTANCE_RULES', 'FRAME_REQUIRED_ENTITY_STAGE_AND_COMBINATION_COMPLETENESS_UNVERIFIED'];
  const requiredChecks = frameRequirements(model, layout);
  let input: LinearFrameInput | null = null, analysis: ReturnType<typeof analyzeLinearFrame> | null = null;
  let secondOrder: ReturnType<typeof analyzeSecondOrderFrame> | null = null;
  let demands: FrameMemberDemandScreen | null = null;
  let sls: FrameSlsScreen | null = null;
  let sideTransfer: ReturnType<typeof transferSideReactionsToFrame> | null = null;
  let sideCoupling: ReturnType<typeof analyzeCoupledSideSupports> | null = null;
  let stability: {lateralActionIds: string[]; horizontalForceN: FrameVector; secondOrder: boolean; status: 'LATERAL_CASE_REQUIRED' | 'SECOND_ORDER_REQUIRED' | 'SCREENED_FOR_DECLARED_LATERAL_CASE'} | null = null;
  let slackBraces: string[] = [], braceConnections: ReturnType<typeof screenBraceConnections> | null = null;
  try {
    if (layout.revisionId !== model.revisionId || layout.inputDefinition !== sourceDefinition) throw Error('STALE_FRAME_LAYOUT_REANALYSIS_REQUIRED');
    const includesSide = ['SIDE_REACTIONS', 'SOFFIT_AND_SIDE_REACTIONS'].includes(layout.loadSource ?? '');
    const includesSoffit = ['SOFFIT_REACTIONS', 'SOFFIT_AND_SIDE_REACTIONS'].includes(layout.loadSource ?? '');
    if (includesSoffit && !['BEAM', 'SLAB'].includes(model.elementType)) throw Error('SOFFIT_FRAME_WORKFLOW_SUPPORTS_BEAM_SLAB_ONLY');
    identifier(layout.stageId, 'frame stage'); identifier(layout.loadCaseId, 'frame load case'); requiredText(layout.assumptionEvidenceRef, 'frame assumption evidence');
    if (!layout.acknowledgeLinearScope || !layout.actionBasis || layout.actionBasis !== (model.analysisCase ? model.analysisCase.basis : 'SERVICE')) throw Error('FRAME_FIRST_ORDER_SCOPE_AND_MATCHED_LOAD_BASIS_MUST_BE_EXPLICIT');
    if (!layout.loadSource) throw Error('FRAME_LOAD_SOURCE_REQUIRED');
    const assemblyIssues = assemblyFrameIssues(model, layout); if (assemblyIssues.length) throw Error(assemblyIssues.join('; '));
    const nodes: FrameNode[] = layout.nodes.map(n => {
      if (!n.role) throw Error(`${n.id}: node role required`); requiredText(n.evidenceRef, 'node geometry/boundary evidence');
      const boundary = n.boundary.map(b => {if (b.kind === 'UNKNOWN') throw Error(`${n.id}: boundary unknown`);
        if (b.kind === 'FREE') return 'FREE'; if (b.kind === 'FIXED') return 0;
        const value = signed(b.value, 'prescribed boundary'), factor = actionFactor(model, 'IMPOSED_MOVEMENT'); return value === 0 || factor === 0 ? 0 : value * factor;
      }) as FrameBoundary;
      return {id: n.id, pointMm: valueVector(n.pointMm, 'actual frame coordinate'), boundary};
    });
    const elements: FrameElement[] = layout.elements.map(e => {
      if (!e.role || !e.kind) throw Error(`${e.id}: physical member role and analysis kind required`);
      if ((['LEDGER_JOINT', 'BRACE_JOINT'].includes(e.role) && e.kind !== 'JOINT_SPRING') ||
        (['STANDARD', 'LEDGER', 'HEAD_JACK', 'BASE_JACK'].includes(e.role) && e.kind !== 'BEAM_COLUMN')) throw Error(`${e.id}: member role and kind are incompatible`);
      const common = {id: e.id, nodeI: e.nodeI, nodeJ: e.nodeJ, evidenceRef: e.evidenceRef};
      const properties = e.binding ? resolveFrameTubeBinding(e.binding, e.role, e.kind, e, model.ringlock) : e;
      if ('blockers' in properties) blockers.push(...properties.blockers.map(b => `${e.id}:${b}`));
      if (e.kind === 'AXIAL_BAR') return {...common, kind: e.kind, E_MPa: properties.E_MPa, A_mm2: properties.A_mm2};
      if (e.kind === 'JOINT_SPRING') return {...common, kind: e.kind, localX: valueVector(e.localX, 'spring X'), localY: valueVector(e.localY, 'spring Y'), stiffness: e.stiffness as [number | null, number | null, number | null, number | null, number | null, number | null]};
      return {...common, kind: e.kind, E_MPa: properties.E_MPa, G_MPa: properties.G_MPa, A_mm2: properties.A_mm2, Iy_mm4: properties.Iy_mm4, Iz_mm4: properties.Iz_mm4, J_mm4: properties.J_mm4, localY: valueVector(e.localY, 'beam Y')};
    });
    const context = {revisionId: model.revisionId, stageId: layout.stageId, loadCaseId: layout.loadCaseId, evidenceRef: layout.assumptionEvidenceRef};
    let actions: FrameAction[] = [];
    if (includesSoffit) {
      if (!model.soffitLayout || !reactions || model.soffitLayout.stageId !== layout.stageId || model.soffitLayout.loadCaseId !== layout.loadCaseId) throw Error('CURRENT_SAME_STAGE_CASE_SOFFIT_REACTIONS_REQUIRED');
      if (layout.headMappings.some(m => layout.nodes.find(n => n.id === m.frameNodeId)?.role !== 'HEAD')) throw Error('U_HEAD_REACTION_REQUIRES_DECLARED_HEAD_NODE');
      actions = transferSoffitReactionsToFrame(reactions.filter(r => r.kind === 'U_HEAD'), model.members, nodes, layout.headMappings, context);
    } else {
      if (layout.loadSource === 'FRAME_ACTIONS_ONLY') requiredText(layout.excludeSoffitReason, 'frame-only stage/omission reason');
      if (model.soffitLayout?.stageId === layout.stageId && model.soffitLayout.loadCaseId === layout.loadCaseId) throw Error('SOFFIT_REACTIONS_CANNOT_BE_OMITTED_FROM_SAME_STAGE_CASE');
      if (layout.headMappings.length) throw Error('FRAME_ONLY_CASE_HAS_UNUSED_HEAD_MAPPINGS');
    }
    const sameSide = model.sideLayout?.stageId === layout.stageId && model.sideLayout.loadCaseId === layout.loadCaseId;
    if (includesSide) {
      blockers.push('SIDE_FRAME_ONE_WAY_SUPPORT_DEMANDS_ONLY_DISPLACEMENT_FEEDBACK_NOT_MODELED', 'SIDE_FRAME_CORNERS_CONTACT_CLAMP_ANCHOR_AND_FULL_SURFACE_COVERAGE_UNVERIFIED');
      if (!layout.sideTransfers || !sideNodes) throw Error('CURRENT_SIDE_SUPPORT_MAPPING_AND_REACTIONS_REQUIRED');
      if (layout.sideTransfers.mappings.some(m => layout.nodes.find(n => n.id === m.frameNodeId)?.role !== 'SIDE_SUPPORT')) throw Error('SIDE_REACTION_REQUIRES_DECLARED_SIDE_SUPPORT_NODE');
      if (layout.sideTransfers.mode === 'MIXED_TIED_AND_FRAME_SUPPORTS') blockers.push('MIXED_TIE_FRAME_SUPPORTS_ONE_WAY_TIE_ELONGATION_AND_FRAME_DISPLACEMENT_COMPATIBILITY_NOT_MODELED');
      // The coupled compatibility solve needs every other frame action first (see below).
      if (layout.sideTransfers.mode !== 'COUPLED_TIE_FRAME_SUPPORTS') {
        sideTransfer = transferSideReactionsToFrame(model, sideNodes, nodes, layout.sideTransfers, context);
        actions.push(...sideTransfer.actions);
      }
    } else {
      if (layout.sideTransfers != null) throw Error('UNUSED_SIDE_TRANSFER_DEFINITION');
      if (sameSide && layout.loadSource === 'FRAME_ACTIONS_ONLY') throw Error('SIDE_REACTIONS_CANNOT_BE_OMITTED_FROM_SAME_STAGE_CASE');
      if (sameSide) blockers.push('SIDE_REACTIONS_NOT_INCLUDED_IN_FRAME');
    }
    const owned = new Set<string>();
    const sideOwners = includesSide ? model.sideLayout!.faces.flatMap(f => f.pressure?.sources.map(s => s.ownershipId) ?? []) : [];
    for (const a of layout.additionalActions) {
      identifier(a.ownershipId, 'frame action ownership'); requiredText(a.evidenceRef, 'frame action evidence');
      if (!a.kind || a.atNode === null) throw Error(`${a.id}: action kind/application required`);
      if (owned.has(a.ownershipId) || sideOwners.includes(a.ownershipId) || model.actions.some(old => old.ownershipId === a.ownershipId && old.stageId === layout.stageId && old.loadCaseId === layout.loadCaseId)) throw Error('DUPLICATE_FRAME_OWNED_LOAD');
      owned.add(a.ownershipId);
      const factor = actionFactor(model, a.kind);
      const scale = (v: number) => v === 0 || factor === 0 ? 0 : v * factor;
      actions.push({id: `EXTRA:${a.id}`, nodeId: a.nodeId, ...context, evidenceRef: a.evidenceRef, forceN: valueVector(a.forceN, 'explicit force N').map(scale) as FrameVector, momentNmm: valueVector(a.momentNmm, 'explicit moment Nmm').map(scale) as FrameVector,
        application: a.atNode ? 'AT_NODE' : {offsetMm: valueVector(a.offsetMm, 'force offset mm'), evidenceRef: a.offsetEvidenceRef}});
    }
    const frameInput = (list: FrameAction[]): LinearFrameInput => ({schemaVersion: 'frame-linear-1', units: 'N_MM_MPA_RAD', id: `${model.id}:FRAME`, revisionId: model.revisionId, stageId: layout.stageId,
      loadCaseId: layout.loadCaseId, assumptionEvidenceRef: layout.assumptionEvidenceRef, nodes, elements, actions: list});
    if (includesSide && layout.sideTransfers?.mode === 'COUPLED_TIE_FRAME_SUPPORTS') {
      const side = model.sideLayout && model.sideLayout.stageId === layout.stageId && model.sideLayout.loadCaseId === layout.loadCaseId ? analyzeSideLayout(model, model.sideLayout) : null;
      if (!side || !layout.sideTransfers.coupling || !layout.sideTransfers.separationEvidenceRef.trim()) throw Error('CURRENT_SAME_STAGE_CASE_SIDE_LAYOUT_COUPLING_DATA_AND_SEPARATION_EVIDENCE_REQUIRED');
      if (canonical([...side.nodes].sort((a, b) => a.id.localeCompare(b.id))) !== canonical([...sideNodes!].sort((a, b) => a.id.localeCompare(b.id)))) throw Error('SIDE_REACTIONS_STALE_TAMPERED_OR_INCOMPLETE');
      sideCoupling = analyzeCoupledSideSupports({side, coupling: layout.sideTransfers.coupling, actionBasis: layout.actionBasis!, frame: frameInput([...actions]),
        layout: model.sideLayout!, topology: pairFaces(model.vertices, model.heightMm),
        mappings: layout.sideTransfers.mappings, context});
      blockers.push(...sideCoupling.blockers);
      actions.push(...sideCoupling.actions);
    }
    const candidateInput = frameInput(actions);
    canonical(candidateInput);
    // Tension-only braces: iterate until no flagged brace is in compression; the analysed input is the active set.
    const tensionOnly = new Set(layout.elements.filter(e => e.tensionOnly && e.kind === 'AXIAL_BAR').map(e => e.id));
    const active = tensionOnlyActiveSet(candidateInput, tensionOnly, analyzeLinearFrame);
    input = active.input; analysis = active.analysis; slackBraces = active.slack; blockers.push(...analysis.blockers);
    if (tensionOnly.size) blockers.push('TENSION_ONLY_BRACES_SOLVED_BY_ACTIVE_SET_LINEAR_PER_CASE_NO_PRETENSION_OR_SLACK_LENGTH');
    if (sideCoupling) {
      // The solved frame must reproduce the coupled support movement at every mapped node.
      const scale = Math.max(1e-6, ...sideCoupling.frameCompatibility.map(c => Math.abs(c.displacementMm)));
      for (const c of sideCoupling.frameCompatibility) {
        const d = analysis.nodes.find(n => n.id === c.frameNodeId)!.displacementMm, value = d[0] * c.normal.x + d[1] * c.normal.y;
        if (Math.abs(value - c.displacementMm) > scale * 1e-6) throw Error(`${c.frameNodeId}:COUPLED_FRAME_DISPLACEMENT_COMPATIBILITY_FAILED`);
      }
    }
    if (layout.secondOrder) {secondOrder = analyzeSecondOrderFrame(input, layout.secondOrder); blockers.push(...secondOrder.blockers);}
    if (includesSide) {
      // Side-form stability is only screened through explicit lateral frame-node actions in this
      // same Stage/case plus the second-order frame path; nothing is inferred from face pressure.
      const lateral = actions.filter(a => a.id.startsWith('EXTRA:') && layout.additionalActions.find(d => `EXTRA:${d.id}` === a.id)?.kind !== 'SELF_WEIGHT' && Math.hypot(a.forceN[0], a.forceN[1]) > 0);
      const horizontal = [0, 1].map(d => lateral.reduce((s, a) => s + a.forceN[d], 0));
      stability = {lateralActionIds: lateral.map(a => a.id), horizontalForceN: [horizontal[0], horizontal[1], 0] as FrameVector, secondOrder: !!secondOrder,
        status: !lateral.length ? 'LATERAL_CASE_REQUIRED' as const : !secondOrder ? 'SECOND_ORDER_REQUIRED' as const : 'SCREENED_FOR_DECLARED_LATERAL_CASE' as const};
      blockers.push(stability.status === 'LATERAL_CASE_REQUIRED' ? 'SIDE_SYSTEM_STABILITY_REQUIRES_EXPLICIT_LATERAL_FRAME_ACTION_IN_THIS_CASE'
        : stability.status === 'SECOND_ORDER_REQUIRED' ? 'SIDE_SYSTEM_STABILITY_REQUIRES_SECOND_ORDER_ANALYSIS_WITH_LATERAL_CASE'
          : 'SIDE_SYSTEM_STABILITY_SCREENED_FOR_DECLARED_LATERAL_CASE_ONLY_COMBINATIONS_ANCHORS_AND_BRACING_REVIEW_REQUIRED');
    }
    demands = screenFrameMemberDemands(analysis, secondOrder, layout.elements.map(e => ({id: e.id, role: e.role, resistance: e.resistance ?? null})), layout.actionBasis);
    blockers.push(...demands.blockers, ...demands.records.flatMap(r => r.missingInputs.map(m => `${r.memberId}:${m}`)));
    braceConnections = screenBraceConnections({analysis, actionBasis: layout.actionBasis, elements: layout.elements, nodes: layout.nodes, slackElementIds: slackBraces});
    blockers.push(...braceConnections.blockers);
    sls = screenFrameSls(analysis, layout.sls ?? [], layout.actionBasis);
    blockers.push(...sls.blockers, ...sls.records.flatMap(r => r.blockers.map(b => `${r.nodeId}/${r.quantity}:${b}`)));
  } catch (e) {blockers.push(`FRAME_INPUT_OR_SOLVE:${(e as Error).message}`);}
  const contractAudit = frameContractAudit(layout, analysis, secondOrder, demands, sls, blockers);
  const result = {status: secondOrder?.status === 'FAIL' || demands?.status === 'FAIL' || sls?.status === 'FAIL' || sideCoupling?.status === 'FAIL' || braceConnections?.status === 'FAIL' ? 'FAIL' as const : 'BLOCKED' as const, actionBasis: layout.actionBasis, input, analysis, secondOrder, demands, sls, sideTransfer, sideCoupling, stability, braceConnections, slackBraces, requiredChecks, contractAudit, blockers: [...new Set([...blockers, ...contractAudit.blockers])], constructionEligible: false as const, constructionRelease: 'NO_GO' as const};
  producedFrames.set(result, {revision: model.revisionId, inputs: sourceDefinition, layout: canonical(layout), output: canonical(result)});
  return result;
}
