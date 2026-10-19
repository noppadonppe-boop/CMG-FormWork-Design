import {canonical, clone, finite, identifier, record, signed, uniqueIds} from './common.js';
import {definitionHash} from './definitionHash.js';
import {currentProducedFrame, frameInputDefinition, type evaluateFrameLayout} from './frameWorkflow.js';
import type {FrameVector} from './frameLinear.js';
import type {WorkflowModel} from './model.js';
import type {RequiredCheck} from './coverage.js';
import {analyzeBearingContact} from './bearingContact.js';
import {actionFactor} from './caseFactors.js';
import {evaluateRinglockAssembly} from './ringlockAssembly.js';

type Nullable3 = [number | null, number | null, number | null];
type Nullable2 = [number | null, number | null];
export interface SupportWeight {
  mode: 'ADD_SELF_WEIGHT' | 'ALREADY_IN_FRAME' | null; ownershipId: string; rawForceN: number | null; pointMm: Nullable3; evidenceRef: string;
}
export interface BearingInterface {
  id: string; role: 'JACK_TO_SUPPORT' | 'JACK_TO_SOLE_BOARD' | 'SOLE_BOARD_TO_SUPPORT' | null;
  centerMm: Nullable3; localX: Nullable2; localY: Nullable2; lengthXMm: number | null; widthYMm: number | null;
  geometryEvidenceRef: string; model: 'RIGID_HORIZONTAL_RECTANGLE_AFFINE_COMPRESSION_ONLY' | null; modelEvidenceRef: string;
  weight: SupportWeight;
  declaredPressureLimitMPa: number | null; resistanceBasis: 'ALLOWABLE' | 'DESIGN' | 'CHARACTERISTIC' | 'TEST' | null; limitEvidenceRef: string;
  soilSpringNPerMm3: number | null; soilSpringEvidenceRef: string;
}
export interface BaseSupport {
  id: string; frameNodeId: string; datum: 'FRAME_BASE_IS_JACK_FOOTPLATE_CONTACT' | null; datumEvidenceRef: string;
  path: 'DIRECT' | 'SOLE_BOARD' | null; soleBoardThicknessMm: number | null;
  supportKind: 'SOIL' | 'EXISTING_SLAB' | 'YOUNG_SLAB' | null; supportEvidenceRef: string; interfaces: BearingInterface[];
}
export interface SupportLayoutDefinition {schemaVersion: '1'; stageId: string; loadCaseId: string; evidenceRef: string; bases: BaseSupport[]}
export interface AppliedSupportLayout extends SupportLayoutDefinition {revisionId: string; inputDefinition: string}
export const emptySupportWeight = (): SupportWeight => ({mode: null, ownershipId: '', rawForceN: null, pointMm: [null, null, null], evidenceRef: ''});
export const emptyBearingInterface = (id: string): BearingInterface => ({id, role: null, centerMm: [null, null, null], localX: [null, null], localY: [null, null], lengthXMm: null, widthYMm: null,
  geometryEvidenceRef: '', model: null, modelEvidenceRef: '', weight: emptySupportWeight(), declaredPressureLimitMPa: null, resistanceBasis: null, limitEvidenceRef: '', soilSpringNPerMm3: null, soilSpringEvidenceRef: ''});
export const emptyBaseSupport = (id: string): BaseSupport => ({id, frameNodeId: '', datum: null, datumEvidenceRef: '', path: null, soleBoardThicknessMm: null, supportKind: null, supportEvidenceRef: '', interfaces: []});
export const emptySupportLayout = (): SupportLayoutDefinition => ({schemaVersion: '1', stageId: '', loadCaseId: '', evidenceRef: '', bases: []});
function exact(raw: unknown, keys: string[]) {const r = record(raw); if (keys.some(k => !Object.hasOwn(r, k)) || Object.keys(r).some(k => !keys.includes(k))) throw Error('Support unknown/missing fields or authority metadata'); return r;}
function text(v: unknown, name: string, max = 2000) {if (typeof v !== 'string' || v.length > max) throw Error(`Invalid support ${name}`);}
function tuple(v: unknown, size: number) {if (!Array.isArray(v) || v.length !== size) throw Error('Support vector size mismatch'); v.forEach(n => {if (n !== null) signed(n, 'support vector');});}
export function validateSupportLayout(raw: unknown): asserts raw is AppliedSupportLayout {
  const p = exact(raw, [...Object.keys(emptySupportLayout()), 'revisionId', 'inputDefinition']);
  if (p.schemaVersion !== '1' || !Array.isArray(p.bases) || p.bases.length > 80) throw Error('Invalid support schema or 80-base limit');
  for (const k of ['stageId', 'loadCaseId', 'evidenceRef', 'revisionId']) text(p[k], k); text(p.inputDefinition, 'input definition', 2500000);
  uniqueIds(p.bases as BaseSupport[], 'support bases'); const mapped: string[] = [];
  for (const v of p.bases) {
    const b = exact(v, Object.keys(emptyBaseSupport('SCHEMA'))) as unknown as BaseSupport;
    text(b.frameNodeId, 'frame node', 300); if (b.frameNodeId.trim()) mapped.push(b.frameNodeId);
    for (const k of ['datumEvidenceRef', 'supportEvidenceRef']) text(b[k as keyof BaseSupport], k);
    if (![null, 'FRAME_BASE_IS_JACK_FOOTPLATE_CONTACT'].includes(b.datum) || ![null, 'DIRECT', 'SOLE_BOARD'].includes(b.path) || ![null, 'SOIL', 'EXISTING_SLAB', 'YOUNG_SLAB'].includes(b.supportKind)) throw Error('Invalid support datum/path/kind');
    if (b.soleBoardThicknessMm !== null) finite(b.soleBoardThicknessMm, 'sole board thickness', true);
    if (!Array.isArray(b.interfaces) || b.interfaces.length > 2) throw Error('At most two actual serial contact interfaces required'); uniqueIds(b.interfaces, 'contact interfaces');
    for (const c of b.interfaces) {
      exact(c, Object.keys(emptyBearingInterface('SCHEMA')));
      if (![null, 'JACK_TO_SUPPORT', 'JACK_TO_SOLE_BOARD', 'SOLE_BOARD_TO_SUPPORT'].includes(c.role) || ![null, 'RIGID_HORIZONTAL_RECTANGLE_AFFINE_COMPRESSION_ONLY'].includes(c.model) || ![null, 'ALLOWABLE', 'DESIGN', 'CHARACTERISTIC', 'TEST'].includes(c.resistanceBasis)) throw Error('Invalid contact role/model/basis');
      tuple(c.centerMm, 3); tuple(c.localX, 2); tuple(c.localY, 2);
      for (const k of ['geometryEvidenceRef', 'modelEvidenceRef', 'limitEvidenceRef', 'soilSpringEvidenceRef']) text(c[k as keyof BearingInterface], k);
      for (const k of ['lengthXMm', 'widthYMm', 'declaredPressureLimitMPa', 'soilSpringNPerMm3'] as const) if (c[k] !== null) finite(c[k], k, ['declaredPressureLimitMPa', 'soilSpringNPerMm3'].includes(k));
      const w = exact(c.weight, Object.keys(emptySupportWeight())) as unknown as SupportWeight;
      if (![null, 'ADD_SELF_WEIGHT', 'ALREADY_IN_FRAME'].includes(w.mode)) throw Error('Invalid support weight mode'); text(w.ownershipId, 'weight ownership', 300); text(w.evidenceRef, 'weight source'); tuple(w.pointMm, 3); if (w.rawForceN !== null) finite(w.rawForceN, 'raw support weight', true);
    }
  }
  if (new Set(mapped).size !== mapped.length) throw Error('Duplicate base-to-support mapping');
  if (canonical(p.bases).length > 1000000) throw Error('Support definition exceeds 1000000 characters; no base omitted');
}
export function supportInputDefinition(m: WorkflowModel) {return definitionHash({frameInputs: frameInputDefinition(m), frameLayout: m.frameLayout ?? null, assembly: m.ringlockAssembly ?? null});}
export function stampSupportLayout(m: WorkflowModel, d: SupportLayoutDefinition): AppliedSupportLayout {
  const result = {...clone(d), revisionId: m.revisionId, inputDefinition: supportInputDefinition(m)}; validateSupportLayout(result); return result;
}
export function captureSupportLayout(m: WorkflowModel, frame: ReturnType<typeof evaluateFrameLayout>): SupportLayoutDefinition {
  const solved = currentProducedFrame(m, frame), nodes = m.frameLayout!.nodes.filter(n => n.role === 'BASE');
  if (!nodes.length || nodes.length > 80 || nodes.some(n => !solved.nodes.some(s => s.id === n.id))) throw Error('Current actual BASE nodes required; no base omitted');
  return {...emptySupportLayout(), stageId: m.frameLayout!.stageId, loadCaseId: m.frameLayout!.loadCaseId, bases: nodes.map((n, i) => ({...emptyBaseSupport(`SUP-${i + 1}`), frameNodeId: n.id}))};
}
type Wrench = {pointMm: FrameVector; forceN: FrameVector; momentNmm: FrameVector};
const cross = (a: FrameVector, b: FrameVector): FrameVector => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: number[], b: number[]) => a.reduce((s, v, i) => s + v * b[i], 0);
const vector = (v: Nullable3): FrameVector => v.map(n => signed(n, 'actual support point')) as FrameVector;
const shifted = (w: Wrench, p: FrameVector): Wrench => ({pointMm: p, forceN: [...w.forceN], momentNmm: cross(w.pointMm.map((v, i) => v - p[i]) as FrameVector, w.forceN).map((v, i) => v + w.momentNmm[i]) as FrameVector});
function axes(c: BearingInterface) {
  const x = c.localX.map(v => signed(v, 'contact local X')), y = c.localY.map(v => signed(v, 'contact local Y'));
  if (Math.abs(Math.hypot(...x) - 1) > 1e-9 || Math.abs(Math.hypot(...y) - 1) > 1e-9 || Math.abs(dot(x, y)) > 1e-9 || Math.abs(x[0] * y[1] - x[1] * y[0] - 1) > 1e-9) throw Error('Explicit unit orthogonal right-handed contact axes required');
  return {x, y};
}
function requirements(m: WorkflowModel, p: AppliedSupportLayout): RequiredCheck[] {
  if (!p.stageId.trim() || !p.loadCaseId.trim()) return [];
  const rows: RequiredCheck[] = [];
  for (const spec of m.checkCatalogue?.specifications ?? []) {
    if (spec.appliesTo !== 'ALL' && !spec.appliesTo.split('|').includes(m.elementType)) continue;
    if (!['RINGLOCK-15', 'RINGLOCK-16', 'RINGLOCK-17', 'SIDE-10'].includes(spec.id) && spec.group !== 'TYPICAL') continue;
    for (const b of p.bases) for (const actualInterface of [null, ...b.interfaces]) {
      const {interfaces, ...base} = b;
      // Structured identity prevents ':' in authored IDs from merging distinct physical paths.
      const memberId = `SUPPORT:${canonical([b.id, actualInterface?.id ?? null])}`;
      rows.push({memberId, checkId: spec.id, loadCaseId: p.loadCaseId, revision: m.revisionId,
        applicability: {stageId: p.stageId, analysisCase: m.analysisCase ?? null, sourceRevision: p.revisionId, frameRevision: m.frameLayout?.revisionId ?? null,
          support: base, interface: actualInterface ?? {interfaceIds: interfaces.map(c => c.id)}, memberId, method: 'ONE_WAY_BASE_WRENCH_AND_DECLARED_CONTACT_DEMAND'}});
    }
  }
  return rows;
}
export function evaluateSupportLayout(m: WorkflowModel, p: AppliedSupportLayout, frame: ReturnType<typeof evaluateFrameLayout> | null) {
  validateSupportLayout(p);
  const blockers = ['SUPPORT_ONE_WAY_DEMANDS_SETTLEMENT_FEEDBACK_TO_FRAME_NOT_MODELED', 'FOOTPLATE_SOLE_BOARD_RIGIDITY_BENDING_SHEAR_AND_PUNCHING_UNVERIFIED',
    'SUPPORT_SOIL_CAPACITY_SETTLEMENT_OR_SLAB_AGE_PUNCHING_METHOD_REQUIRED', 'SUPPORT_FRICTION_TORSION_ANCHORS_GLOBAL_STABILITY_AND_TRUSTED_REVIEW_REQUIRED'];
  const requiredChecks = requirements(m, p);
  let analysis: ReturnType<typeof currentProducedFrame> | null = null;
  try {
    if (p.revisionId !== m.revisionId || p.inputDefinition !== supportInputDefinition(m)) throw Error('STALE_SUPPORT_LAYOUT_REVIEW_AND_REAPPLY_REQUIRED');
    if (!frame || !m.frameLayout) throw Error('Current solved frame required before base transfer');
    analysis = currentProducedFrame(m, frame);
    if (!p.evidenceRef.trim() || !p.stageId.trim() || !p.loadCaseId.trim() || p.stageId !== m.frameLayout.stageId || p.loadCaseId !== m.frameLayout.loadCaseId) throw Error('Support scope and current same Stage/case required');
  } catch (e) {blockers.push(`SUPPORT_SOURCE:${(e as Error).message}`); analysis = null;}
  const actualRestraints = analysis?.nodes.filter(n => analysis!.input.nodes.find(s => s.id === n.id)!.boundary.some(v => typeof v === 'number')) ?? [];
  const unmappedRestraints = actualRestraints.filter(n => !p.bases.some(b => b.frameNodeId === n.id && m.frameLayout?.nodes.find(p => p.id === n.id)?.role === 'BASE')).map(n => ({frameNodeId: n.id, pointMm: n.pointMm, frameToSupportForceN: n.reactionForceN.map(v => -v) as FrameVector, frameToSupportMomentNmm: n.reactionMomentNmm.map(v => -v) as FrameVector}));
  if (unmappedRestraints.length) blockers.push('ACTUAL_FRAME_RESTRAINT_REACTIONS_NOT_ALL_MAPPED_TO_SUPPORT_PATHS');
  const occupied = new Set([...(m.actions.filter(a => a.stageId === p.stageId && a.loadCaseId === p.loadCaseId).map(a => a.ownershipId)), ...(m.frameLayout?.additionalActions.map(a => a.ownershipId) ?? []), ...(m.sideLayout?.stageId === p.stageId && m.sideLayout.loadCaseId === p.loadCaseId ? m.sideLayout.faces.flatMap(f => f.pressure?.sources.map(s => s.ownershipId) ?? []) : [])]);
  const addedOwners = new Set<string>();
  for (const b of p.bases) for (const c of b.interfaces) if (c.weight.mode === 'ADD_SELF_WEIGHT' && c.weight.ownershipId.trim()) {
    if (occupied.has(c.weight.ownershipId) || addedOwners.has(c.weight.ownershipId)) blockers.push(`${b.id}/${c.id}:DUPLICATE_SUPPORT_WEIGHT_OWNERSHIP`); addedOwners.add(c.weight.ownershipId);
  }
  const duplicateWeight = blockers.some(b => b.includes('DUPLICATE_SUPPORT_WEIGHT_OWNERSHIP'));
  const assembly = m.ringlockAssembly ? evaluateRinglockAssembly(m, m.ringlockAssembly) : null;
  const rows = p.bases.map(b => {
    const issues: string[] = []; let source: Wrench | null = null, pathReady = true;
    let knownFailure = false;
    try {
      const node = analysis?.nodes.find(n => n.id === b.frameNodeId), input = analysis?.input.nodes.find(n => n.id === b.frameNodeId);
      if (!node || !input || m.frameLayout?.nodes.find(n => n.id === b.frameNodeId)?.role !== 'BASE' || !input.boundary.some(v => typeof v === 'number')) throw Error('Current actual restrained BASE mapping required');
      source = {pointMm: node.pointMm, forceN: node.reactionForceN.map(v => -v) as FrameVector, momentNmm: node.reactionMomentNmm.map(v => -v) as FrameVector};
      if (b.datum !== 'FRAME_BASE_IS_JACK_FOOTPLATE_CONTACT' || !b.datumEvidenceRef.trim() || !b.supportKind || !b.supportEvidenceRef.trim()) throw Error('Actual footplate datum/support kind/evidence required');
      const roles = b.path === 'DIRECT' ? ['JACK_TO_SUPPORT'] : b.path === 'SOLE_BOARD' ? ['JACK_TO_SOLE_BOARD', 'SOLE_BOARD_TO_SUPPORT'] : [];
      if (!roles.length || b.interfaces.length !== roles.length || b.interfaces.some((c, i) => c.role !== roles[i])) throw Error('Exact direct or two-interface sole-board sequence required');
      const centers = b.interfaces.map(c => vector(c.centerMm));
      if (Math.abs(centers[0][2] - source.pointMm[2]) > 1e-7) throw Error('First contact is not at the declared frame footplate bearing elevation');
      if (b.path === 'DIRECT') {if (b.soleBoardThicknessMm !== 0) throw Error('Direct path requires explicit zero sole-board thickness');}
      else if (Math.abs(centers[0][2] - centers[1][2] - finite(b.soleBoardThicknessMm, 'measured sole-board thickness')) > 1e-7) throw Error('Sole-board top/bottom contact elevations do not close actual thickness');
      if (assembly) {
        const leg = assembly.rows.find(r => r.nodes.some(n => n.id === b.frameNodeId && n.role === 'BASE')), installed = m.ringlockAssembly!.legs.find(l => l.legId === leg?.legId);
        if (!assembly.frameGeometryReady || !leg || !installed || b.soleBoardThicknessMm !== installed.soleBoard.thicknessMm || centers.at(-1)![2] !== installed.groundElevationMm) throw Error('Support contact datums do not match current actual Ringlock assembly');
      }
      if (b.path === 'SOLE_BOARD') {
        const upper = b.interfaces[0], lower = b.interfaces[1], u = axes(upper), l = axes(lower), length = finite(upper.lengthXMm, 'upper footprint X'), width = finite(upper.widthYMm, 'upper footprint Y');
        const L = finite(lower.lengthXMm, 'actual sole-board X'), W = finite(lower.widthYMm, 'actual sole-board Y');
        for (const x of [-length / 2, length / 2]) for (const y of [-width / 2, width / 2]) {
          const d = [centers[0][0] + x * u.x[0] + y * u.y[0] - centers[1][0], centers[0][1] + x * u.x[1] + y * u.y[1] - centers[1][1]];
          if (Math.abs(dot(d, l.x)) > L / 2 + 1e-7 || Math.abs(dot(d, l.y)) > W / 2 + 1e-7) {knownFailure = true; throw Error('FOOTPLATE_CONTACT_OUTSIDE_DECLARED_FULL_SOLE_BOARD_RECTANGLE');}
        }
      }
    } catch (e) {issues.push((e as Error).message); pathReady = false;}
    let previous = source, complete = pathReady && !duplicateWeight;
    const contacts = b.interfaces.map(c => {
      const problems: string[] = []; let wrench: Wrench | null = null, weightForceN: number | null = null, weightPoint: FrameVector | null = null;
      let localWrenchComplete = false;
      let contact: ReturnType<typeof analyzeBearingContact> | null = null;
      let settlement: {centerMm: number; slopeX: number; slopeY: number; maximumDownwardMm: number; maximumUpwardGapMm: number} | null = null;
      let declaredLimitExceeded = false, requiredFrictionRatio: number | null = null;
      try {
        if (!previous || !complete) throw Error('Complete upstream wrench and actual contact path required');
        const center = vector(c.centerMm); wrench = shifted(previous, center);
        const w = c.weight; if (!w.mode || !w.evidenceRef.trim() || !w.ownershipId.trim()) throw Error('Explicit interface/component self-weight ownership and source required');
        if (w.mode === 'ALREADY_IN_FRAME') {
          if (w.rawForceN !== null || w.pointMm.some(v => v !== null) || !m.frameLayout?.additionalActions.some(a => a.kind === 'SELF_WEIGHT' && a.ownershipId === w.ownershipId && analysis?.input.actions.some(row => row.id === `EXTRA:${a.id}`))) throw Error('Included support weight must reference an actual current SELF_WEIGHT frame action without competing raw weight');
          weightForceN = 0;
        } else {
          const raw = finite(w.rawForceN, 'actual raw component self-weight', true), factor = actionFactor(m, 'SELF_WEIGHT');
          weightForceN = finite(raw === 0 || factor === 0 ? 0 : raw * factor, 'factored support self-weight', true);
          if (raw > 0) {weightPoint = vector(w.pointMm); if (weightPoint[2] < center[2] - 1e-7) throw Error('Owned component self-weight point is below its declared interface');}
          if (weightPoint) {const extra = shifted({pointMm: weightPoint, forceN: [0, 0, -weightForceN], momentNmm: [0, 0, 0]}, center);
            wrench.forceN = wrench.forceN.map((v, i) => v + extra.forceN[i]) as FrameVector; wrench.momentNmm = wrench.momentNmm.map((v, i) => v + extra.momentNmm[i]) as FrameVector;}
        }
        // The known zero-weight case creates no position/moment assumption. A positive weight
        // always requires its actual source point, including a zero-factor analysis case.
        canonical(wrench); previous = wrench; localWrenchComplete = true;
        if (!c.geometryEvidenceRef.trim() || c.model !== 'RIGID_HORIZONTAL_RECTANGLE_AFFINE_COMPRESSION_ONLY' || !c.modelEvidenceRef.trim()) throw Error('Declared full rectangular contact geometry and conditional rigid pressure-law evidence required');
        const a = axes(c), N = -wrench.forceN[2], Mx = dot(wrench.momentNmm.slice(0, 2), a.x), My = dot(wrench.momentNmm.slice(0, 2), a.y);
        contact = analyzeBearingContact({lengthXMm: finite(c.lengthXMm, 'actual contact length'), widthYMm: finite(c.widthYMm, 'actual contact width'), compressionN: N, loadMxNmm: Mx, loadMyNmm: My});
        requiredFrictionRatio = N > 0 ? finite(Math.hypot(wrench.forceN[0], wrench.forceN[1]) / N, 'required H/N numeric range', true) : null;
        if (contact.status === 'FAIL') knownFailure = true;
        if (c.declaredPressureLimitMPa === null || !c.limitEvidenceRef.trim() || !((frame!.actionBasis === 'SERVICE' && c.resistanceBasis === 'ALLOWABLE') || (frame!.actionBasis === 'FACTORED' && c.resistanceBasis === 'DESIGN'))) problems.push('MATCHED_DECLARED_PRESSURE_LIMIT_BASIS_AND_SOURCE_MISSING_NO_STRENGTH_CONVERSION');
        else if (contact.result && contact.result.pressureMaxMPa > c.declaredPressureLimitMPa) {declaredLimitExceeded = true; knownFailure = true; problems.push('DECLARED_CONTACT_PRESSURE_LIMIT_EXCEEDED');}
        if (c.soilSpringNPerMm3 !== null) {
          if (b.supportKind !== 'SOIL' || c.role === 'JACK_TO_SOLE_BOARD' || !c.soilSpringEvidenceRef.trim() || c.soilSpringNPerMm3 <= 0) problems.push('SOIL_SPRING_SCOPE_OR_SOURCE_INVALID_NO_SLAB_OR_TIMBER_SUBSTITUTION');
          else if (contact.result) {const k = c.soilSpringNPerMm3, coeff = contact.result.coefficientsMPa, rawCorners = contact.result.cornerPlaneMPa;
            settlement = {centerMm: coeff[0] / k, slopeX: coeff[1] / k, slopeY: coeff[2] / k, maximumDownwardMm: Math.max(0, ...rawCorners) / k, maximumUpwardGapMm: Math.max(0, ...rawCorners.map(v => -v)) / k}; canonical(settlement);}
        } else problems.push('SUPPORT_SETTLEMENT_NOT_AVAILABLE_WITHOUT_ACTUAL_SUBGRADE_LAW');
        if (b.supportKind !== 'SOIL') problems.push('ACTUAL_SLAB_GEOMETRY_REINFORCEMENT_AGE_HISTORY_AND_PUNCHING_METHOD_REQUIRED');
      } catch (e) {settlement = null; problems.push((e as Error).message); if (!localWrenchComplete) {complete = false; previous = null; wrench = null; weightForceN = null; weightPoint = null;}}
      return {id: c.id, role: c.role, definition: clone(c), wrench, selfWeightAddedN: weightForceN, selfWeightPointMm: weightPoint, completeWrench: complete && localWrenchComplete,
        contact, settlement, requiredFrictionRatio, declaredLimitExceeded, issues: problems, status: declaredLimitExceeded || contact?.status === 'FAIL' ? 'FAIL' as const : 'BLOCKED' as const};
    });
    let equilibrium: {referencePointMm: FrameVector; forceResidualN: FrameVector; momentResidualNmm: FrameVector} | null = null;
    if (source && complete && previous && contacts.length) {
      const expected: Wrench = clone(source), terminal = shifted(previous, source.pointMm);
      for (const c of contacts) if (c.selfWeightPointMm && c.selfWeightAddedN !== null) {
        const extra = shifted({pointMm: c.selfWeightPointMm, forceN: [0, 0, -c.selfWeightAddedN], momentNmm: [0, 0, 0]}, source.pointMm);
        expected.forceN = expected.forceN.map((v, i) => v + extra.forceN[i]) as FrameVector; expected.momentNmm = expected.momentNmm.map((v, i) => v + extra.momentNmm[i]) as FrameVector;
      }
      equilibrium = {referencePointMm: source.pointMm, forceResidualN: terminal.forceN.map((v, i) => v - expected.forceN[i]) as FrameVector, momentResidualNmm: terminal.momentNmm.map((v, i) => v - expected.momentNmm[i]) as FrameVector};
      if ([...equilibrium.forceResidualN, ...equilibrium.momentResidualNmm].some(v => !Number.isFinite(v)) || Math.hypot(...equilibrium.forceResidualN) > Math.max(1, Math.hypot(...expected.forceN)) * 1e-7 || Math.hypot(...equilibrium.momentResidualNmm) > Math.max(1, Math.hypot(...expected.momentNmm), Math.hypot(...source.pointMm.map((v, i) => v - previous!.pointMm[i])) * Math.hypot(...source.forceN)) * 1e-7) {
        equilibrium = null; complete = false; issues.push('BASE_SUPPORT_TRANSFER_FORCE_OR_MOMENT_BALANCE_FAILED');
        for (const c of contacts) {c.contact = null; c.settlement = null; c.completeWrench = false;}
      }
    }
    return {id: b.id, frameNodeId: b.frameNodeId, definition: clone(b), sourceFrameToSupport: source, contacts, equilibrium, terminalWrench: complete && contacts.length ? previous : null,
      status: knownFailure ? 'FAIL' as const : 'BLOCKED' as const, issues};
  });
  if (!p.bases.length) blockers.push('ACTUAL_BASE_SUPPORT_PATHS_REQUIRED');
  const failed = rows.some(r => r.status === 'FAIL');
  return {status: failed ? 'FAIL' as const : 'BLOCKED' as const, revisionId: m.revisionId, stageId: p.stageId, loadCaseId: p.loadCaseId,
    rows, unmappedRestraints, completeTerminalWrenchCoverage: analysis !== null && actualRestraints.length > 0 && unmappedRestraints.length === 0 && rows.length > 0 && rows.every(r => r.terminalWrench !== null), requiredChecks, blockers: [...new Set(blockers)], constructionEligible: false as const, constructionRelease: 'NO_GO' as const};
}
