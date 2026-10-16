import {clone, finite, identifier, signed, uniqueIds} from './common.js';

/** First-order, small-displacement Euler–Bernoulli/St Venant demand engine, N/mm/MPa/rad.
 * It is a numerical building block, NOT a Ringlock frame/system resistance method.
 * Shared beam nodes are rigid within this idealization. Real joints must be represented
 * explicitly; no manufacturer, spring, restraint, load factor or capacity is inferred.
 */
export type FrameVector = [number, number, number];
export type FrameBoundary = [number | 'FREE' | null, number | 'FREE' | null, number | 'FREE' | null,
  number | 'FREE' | null, number | 'FREE' | null, number | 'FREE' | null];
export interface FrameNode {id: string; pointMm: FrameVector; boundary: FrameBoundary}
interface ElementIdentity {id: string; nodeI: string; nodeJ: string; evidenceRef: string}
export type FrameElement = ElementIdentity & ({kind: 'BEAM_COLUMN'; E_MPa: number | null; G_MPa: number | null; A_mm2: number | null;
  Iy_mm4: number | null; Iz_mm4: number | null; J_mm4: number | null; localY: FrameVector} |
  {kind: 'AXIAL_BAR'; E_MPa: number | null; A_mm2: number | null} |
  {kind: 'JOINT_SPRING'; localX: FrameVector; localY: FrameVector;
    /** UX/UY/UZ: N/mm. RX/RY/RZ: Nmm/rad. Zero is an explicit release; null is unknown. */
    stiffness: [number | null, number | null, number | null, number | null, number | null, number | null]});
export interface FrameAction {
  id: string; nodeId: string; revisionId: string; stageId: string; loadCaseId: string; evidenceRef: string;
  forceN: FrameVector; momentNmm: FrameVector;
  application: 'AT_NODE' | {offsetMm: FrameVector; evidenceRef: string};
}
export interface LinearFrameInput {
  schemaVersion: 'frame-linear-1'; units: 'N_MM_MPA_RAD'; id: string; revisionId: string; stageId: string; loadCaseId: string;
  assumptionEvidenceRef: string; nodes: FrameNode[]; elements: FrameElement[]; actions: FrameAction[];
}
export type Matrix = number[][];
export type Axes = {x: FrameVector; y: FrameVector | null; z: FrameVector | null};
export interface PreparedFrameElement {
  element: FrameElement; axes: Axes; lengthMm: number | null; k: Matrix; T: Matrix; global: Matrix; dofs: number[];
}
const dofNames = ['UX', 'UY', 'UZ', 'RX', 'RY', 'RZ'] as const;
const zeros = (n: number, m = n): Matrix => Array.from({length: n}, () => Array(m).fill(0));
const dot = (a: number[], b: number[]) => a.reduce((sum, value, i) => sum + value * b[i], 0);
const sub = (a: FrameVector, b: FrameVector) => a.map((v, i) => v - b[i]) as FrameVector;
const cross = (a: FrameVector, b: FrameVector): FrameVector => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
function vector(raw: unknown, label: string): FrameVector {
  if (!Array.isArray(raw) || raw.length !== 3) throw Error(`${label}: three explicit components required`);
  return raw.map(v => signed(v, label)) as FrameVector;
}
function evidence(raw: unknown) {if (typeof raw !== 'string' || !raw.trim() || raw.length > 2000) throw Error('Explicit idealization/source evidence required');}
function exactKeys(value: object, keys: string[], label: string) {
  if (Object.keys(value).some(k => !keys.includes(k)) || keys.some(k => !Object.hasOwn(value, k))) throw Error(`${label}: unsupported or missing fields; omitted loads/releases/methods are not inferred`);
}
function unit(v: FrameVector): FrameVector {const length = finite(Math.hypot(...v), 'axis magnitude'); return v.map(x => x / length) as FrameVector;}
function axesOf(x: FrameVector, yReference: FrameVector): Axes {
  const yGiven = unit(yReference), component = dot(x, yGiven), projected = yGiven.map((v, i) => v - component * x[i]) as FrameVector;
  if (Math.hypot(...projected) < 1e-10) throw Error('Local Y reference is parallel to the element axis');
  const y = unit(projected); return {x, y, z: unit(cross(x, y))};
}
function transformation(axes: Axes): Matrix {
  const T = zeros(12), rows = [axes.x, axes.y, axes.z];
  for (const offset of [0, 3, 6, 9]) for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) T[offset + i][offset + j] = rows[i]?.[j] ?? 0;
  return T;
}
function transposeTimes(T: Matrix, a: number[]) {return T[0].map((_, j) => T.reduce((s, row, i) => s + row[j] * a[i], 0));}
function transformedStiffness(k: Matrix, T: Matrix) {
  const kt = k.map(row => T[0].map((_, j) => row.reduce((s, value, i) => s + value * T[i][j], 0)));
  return T[0].map((_, i) => T[0].map((__, j) => T.reduce((s, row, p) => s + row[i] * kt[p][j], 0)));
}
function pairBlock(k: Matrix, i: number, j: number, value: number) {
  k[i][i] += value; k[j][j] += value; k[i][j] -= value; k[j][i] -= value;
}
function bending(k: Matrix, ids: number[], EI: number, L: number, rotationSign: number) {
  const a = 12 * EI / L ** 3, b = 6 * EI / L ** 2, c = 4 * EI / L, d = 2 * EI / L;
  const block = [[a, b, -a, b], [b, c, -b, d], [-a, -b, a, -b], [b, d, -b, c]], signs = [1, rotationSign, 1, rotationSign];
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) k[ids[i]][ids[j]] += block[i][j] * signs[i] * signs[j];
}
function prepareElement(e: FrameElement, input: LinearFrameInput): PreparedFrameElement {
  const common = ['id', 'nodeI', 'nodeJ', 'evidenceRef', 'kind'];
  exactKeys(e, [...common, ...(e.kind === 'BEAM_COLUMN' ? ['E_MPa', 'G_MPa', 'A_mm2', 'Iy_mm4', 'Iz_mm4', 'J_mm4', 'localY'] :
    e.kind === 'AXIAL_BAR' ? ['E_MPa', 'A_mm2'] : e.kind === 'JOINT_SPRING' ? ['localX', 'localY', 'stiffness'] : [])], 'frame element');
  evidence(e.evidenceRef);
  const i = input.nodes.findIndex(n => n.id === e.nodeI), j = input.nodes.findIndex(n => n.id === e.nodeJ);
  if (i < 0 || j < 0 || i === j) throw Error(`${e.id}: unknown/self element endpoint`);
  const delta = sub(input.nodes[j].pointMm, input.nodes[i].pointMm), L = Math.hypot(...delta), k = zeros(12);
  let axes: Axes;
  if (e.kind === 'JOINT_SPRING') {
    if (L > 1e-7) throw Error(`${e.id}: joint spring nodes must be coincident; rigid offsets require a separate model`);
    axes = axesOf(unit(vector(e.localX, 'spring local X')), vector(e.localY, 'spring local Y'));
    if (!Array.isArray(e.stiffness) || e.stiffness.length !== 6) throw Error('Six explicit local spring stiffnesses required');
    e.stiffness.forEach((v, d) => pairBlock(k, d, d + 6, finite(v, 'spring stiffness (zero=declared release; null=unknown)', true)));
  } else if (e.kind === 'BEAM_COLUMN' || e.kind === 'AXIAL_BAR') {
    finite(L, 'actual member length');
    const x = unit(delta), E = finite(e.E_MPa, 'member E'), A = finite(e.A_mm2, 'member area');
    pairBlock(k, 0, 6, E * A / L);
    if (e.kind === 'BEAM_COLUMN') {
      axes = axesOf(x, vector(e.localY, 'beam local Y'));
      pairBlock(k, 3, 9, finite(e.G_MPa, 'member G') * finite(e.J_mm4, 'member J') / L);
      bending(k, [1, 5, 7, 11], E * finite(e.Iz_mm4, 'member Iz'), L, 1);
      bending(k, [2, 4, 8, 10], E * finite(e.Iy_mm4, 'member Iy'), L, -1);
    } else axes = {x, y: null, z: null}; // axial bars have no invented transverse section orientation
  } else throw Error('Unsupported frame element kind');
  const T = transformation(axes), global = transformedStiffness(k, T), dofs = [i, j].flatMap(n => Array.from({length: 6}, (_, d) => n * 6 + d));
  if (global.some(row => row.some(v => !Number.isFinite(v)))) throw Error('FRAME_NUMERIC_RANGE_EXCEEDED');
  return {element: e, axes, lengthMm: e.kind === 'JOINT_SPRING' ? null : L, k, T, global, dofs};
}
/** Prepare the explicit member matrices for a validated frame input.  This is shared by
 * the first-order and geometric second-order screening paths; it adds no restraints or
 * properties and must only be called after the caller has validated the input. */
export function prepareFrameElements(input: LinearFrameInput): PreparedFrameElement[] {
  return input.elements.map(e => prepareElement(e, input));
}
export function assembleFrameStiffness(input: LinearFrameInput, prepared = prepareFrameElements(input)) {
  const count = input.nodes.length * 6, K = zeros(count);
  for (const p of prepared) for (let i = 0; i < 12; i++) for (let j = 0; j < 12; j++) K[p.dofs[i]][p.dofs[j]] += p.global[i][j];
  if (K.some(row => row.some(v => !Number.isFinite(v)))) throw Error('FRAME_NUMERIC_RANGE_EXCEEDED');
  return {prepared, K, count};
}
/** Return the exact equivalent nodal action vector used by the linear solver. */
export function equivalentFrameLoadVector(input: LinearFrameInput): number[] {
  const F = Array(input.nodes.length * 6).fill(0) as number[];
  for (const a of input.actions) {
    const n = input.nodes.findIndex(node => node.id === a.nodeId);
    if (n < 0) throw Error(`${a.id}: unknown action node`);
    const force = vector(a.forceN, 'force N'), moment = vector(a.momentNmm, 'moment Nmm');
    const offset = a.application === 'AT_NODE' ? [0, 0, 0] as FrameVector : vector(a.application.offsetMm, 'actual load offset mm');
    const equivalentMoment = moment.map((v, i) => v + cross(offset, force)[i]);
    [...force, ...equivalentMoment].forEach((v, d) => F[6 * n + d] += signed(v, 'equivalent node action'));
  }
  if (F.some(v => !Number.isFinite(v))) throw Error('FRAME_NUMERIC_RANGE_EXCEEDED');
  return F;
}
/** Diagonal scaling conditions translational and rotational equations without penalty supports.
 * A nonpositive/tiny normalized Cholesky pivot is rejected; no epsilon stiffness is added.
 */
function solvePositiveDefinite(K: Matrix, rhs: number[]) {
  if (!rhs.length) return {solution: [], minScaledPivot: null};
  const scales = K.map((row, i) => {if (!(row[i] > 0)) throw Error('UNSTABLE_OR_INDEFINITE_FRAME'); return Math.sqrt(row[i]);});
  const A = K.map((row, i) => row.map((v, j) => v / scales[i] / scales[j])), b = rhs.map((v, i) => v / scales[i]), L = zeros(rhs.length);
  let minScaledPivot = Infinity;
  for (let i = 0; i < rhs.length; i++) for (let j = 0; j <= i; j++) {
    let value = A[i][j]; for (let p = 0; p < j; p++) value -= L[i][p] * L[j][p];
    if (i === j) {if (!Number.isFinite(value) || value <= 1e-11) throw Error('UNSTABLE_OR_ILL_CONDITIONED_FRAME'); minScaledPivot = Math.min(minScaledPivot, value); L[i][j] = Math.sqrt(value);}
    else L[i][j] = value / L[j][j];
  }
  const y = Array(rhs.length).fill(0), x = Array(rhs.length).fill(0);
  for (let i = 0; i < rhs.length; i++) {let v = b[i]; for (let j = 0; j < i; j++) v -= L[i][j] * y[j]; y[i] = v / L[i][i];}
  for (let i = rhs.length - 1; i >= 0; i--) {let v = y[i]; for (let j = i + 1; j < rhs.length; j++) v -= L[j][i] * x[j]; x[i] = v / L[i][i];}
  const solution = x.map((v, i) => v / scales[i]);
  if (solution.some(v => !Number.isFinite(v))) throw Error('FRAME_NUMERIC_RANGE_EXCEEDED');
  return {solution, minScaledPivot};
}
export function analyzeLinearFrame(raw: LinearFrameInput) {
  const input = clone(raw);
  const keys = ['schemaVersion', 'units', 'id', 'revisionId', 'stageId', 'loadCaseId', 'assumptionEvidenceRef', 'nodes', 'elements', 'actions'];
  if (input.schemaVersion !== 'frame-linear-1' || input.units !== 'N_MM_MPA_RAD' || Object.keys(input).some(k => !keys.includes(k))) throw Error('Explicit linear frame schema/units required; approval/second-order fields are not accepted');
  exactKeys(input, keys, 'frame input');
  for (const k of ['id', 'revisionId', 'stageId', 'loadCaseId'] as const) identifier(input[k], k);
  evidence(input.assumptionEvidenceRef);
  if (!Array.isArray(input.nodes) || !input.nodes.length || input.nodes.length > 80 || !Array.isArray(input.elements) || !input.elements.length || input.elements.length > 240 || !Array.isArray(input.actions) || input.actions.length > 1000) throw Error('Frame preview size limit: 1–80 nodes, 1–240 elements, 0–1000 actions');
  uniqueIds(input.nodes, 'frame nodes'); uniqueIds(input.elements, 'frame elements'); uniqueIds(input.actions, 'frame actions');
  for (const n of input.nodes) {
    exactKeys(n, ['id', 'pointMm', 'boundary'], 'frame node');
    vector(n.pointMm, 'actual node coordinate');
    if (!Array.isArray(n.boundary) || n.boundary.length !== 6 || n.boundary.some(b => b !== 'FREE' && (typeof b !== 'number' || !Number.isFinite(b)))) throw Error(`${n.id}: six explicit boundaries required; null is unknown, not free/fixed`);
    if (!input.elements.some(e => e.nodeI === n.id || e.nodeJ === n.id)) throw Error(`${n.id}: disconnected frame node`);
  }
  const prepared = prepareFrameElements(input), count = input.nodes.length * 6, K = assembleFrameStiffness(input, prepared).K, F = Array(count).fill(0);
  const appliedActions = input.actions.map(a => {
    exactKeys(a, ['id', 'nodeId', 'revisionId', 'stageId', 'loadCaseId', 'evidenceRef', 'forceN', 'momentNmm', 'application'], 'frame action');
    const n = input.nodes.findIndex(n => n.id === a.nodeId);
    if (n < 0 || a.revisionId !== input.revisionId || a.stageId !== input.stageId || a.loadCaseId !== input.loadCaseId) throw Error(`${a.id}: unknown node or stale/wrong stage/load case`);
    evidence(a.evidenceRef);
    const force = vector(a.forceN, 'force N'), moment = vector(a.momentNmm, 'moment Nmm');
    let offset: FrameVector = [0, 0, 0];
    if (a.application !== 'AT_NODE') {if (!a.application || typeof a.application !== 'object') throw Error('Explicit load application point required'); exactKeys(a.application, ['offsetMm', 'evidenceRef'], 'load offset'); evidence(a.application.evidenceRef); offset = vector(a.application.offsetMm, 'actual load offset mm');}
    const eccentricMoment = cross(offset, force), equivalentMoment = moment.map((v, i) => v + eccentricMoment[i]) as FrameVector;
    [...force, ...equivalentMoment].forEach((v, d) => F[6 * n + d] += signed(v, 'equivalent node action'));
    return {id: a.id, nodeId: a.nodeId, forceN: force, originalMomentNmm: moment, offsetMm: offset, equivalentMomentNmm: equivalentMoment};
  });
  if (K.some(row => row.some(v => !Number.isFinite(v))) || F.some(v => !Number.isFinite(v))) throw Error('FRAME_NUMERIC_RANGE_EXCEEDED');
  const boundary = input.nodes.flatMap(n => n.boundary), fixed = boundary.map((b, i) => typeof b === 'number' ? i : -1).filter(i => i >= 0);
  const free: number[] = [], unusedRotations: {nodeId: string; dof: string}[] = [], unusedRotationDofs = new Set<number>();
  for (let i = 0; i < count; i++) if (boundary[i] === 'FREE') {
    if (K[i].every(v => v === 0)) {
      if (i % 6 < 3) throw Error(`UNSTABLE_FRAME: unrestrained translation ${input.nodes[Math.floor(i / 6)].id}/${dofNames[i % 6]}`);
      if (F[i] !== 0) throw Error('UNSUPPORTED_ACTION_ON_UNUSED_ROTATIONAL_DOF');
      unusedRotations.push({nodeId: input.nodes[Math.floor(i / 6)].id, dof: dofNames[i % 6]});
      unusedRotationDofs.add(i);
    } else free.push(i);
  }
  const displacement = boundary.map(b => typeof b === 'number' ? b : 0), rhs = free.map(i => F[i] - fixed.reduce((sum, j) => sum + K[i][j] * displacement[j], 0));
  const solved = solvePositiveDefinite(free.map(i => free.map(j => K[i][j])), rhs);
  free.forEach((d, i) => displacement[d] = solved.solution[i]);
  const internal = K.map(row => dot(row, displacement)), residual = internal.map((v, i) => v - F[i]);
  const freeForce = free.filter(i => i % 6 < 3), freeMoment = free.filter(i => i % 6 >= 3);
  const maxFreeForceResidualN = freeForce.reduce((max, i) => Math.max(max, Math.abs(residual[i])), 0);
  const maxFreeMomentResidualNmm = freeMoment.reduce((max, i) => Math.max(max, Math.abs(residual[i])), 0);
  const translationalScale = Math.max(1, ...F.filter((_, i) => i % 6 < 3).map(Math.abs), ...internal.filter((_, i) => i % 6 < 3).map(Math.abs));
  const rotationalScale = Math.max(1, ...F.filter((_, i) => i % 6 >= 3).map(Math.abs), ...internal.filter((_, i) => i % 6 >= 3).map(Math.abs));
  if (maxFreeForceResidualN > translationalScale * 1e-7 || maxFreeMomentResidualNmm > rotationalScale * 1e-7) throw Error('FRAME_NODE_EQUILIBRIUM_FAILED');
  const nodes = input.nodes.map((n, i) => ({id: n.id, pointMm: n.pointMm, displacementMm: displacement.slice(i * 6, i * 6 + 3) as FrameVector,
    // Zero is only an internal algebra representative for unloaded inactive rotations. The
    // observable rotation is indeterminate, not a secretly fixed zero-rotation support.
    rotationRad: [3, 4, 5].map(d => unusedRotationDofs.has(6 * i + d) ? null : displacement[6 * i + d]) as [number | null, number | null, number | null],
    reactionForceN: [0, 1, 2].map(d => typeof n.boundary[d] === 'number' ? residual[6 * i + d] : 0) as FrameVector,
    reactionMomentNmm: [3, 4, 5].map(d => typeof n.boundary[d] === 'number' ? residual[6 * i + d] : 0) as FrameVector}));
  const elements = prepared.map(p => {
    const d = p.T.map(row => dot(row, p.dofs.map(i => displacement[i]))), q = p.k.map(row => dot(row, d)), globalQ = transposeTimes(p.T, q);
    if ([...d, ...q, ...globalQ].some(v => !Number.isFinite(v))) throw Error('FRAME_NUMERIC_RANGE_EXCEEDED');
    return {id: p.element.id, kind: p.element.kind, nodeI: p.element.nodeI, nodeJ: p.element.nodeJ, lengthMm: p.lengthMm, localAxes: p.axes,
      localDisplacement: d, localNodalActionsOnElement: q, globalNodalActionsOnElement: globalQ,
      axialForceN: p.element.kind === 'JOINT_SPRING' ? null : q[6], relativeJointDof: p.element.kind === 'JOINT_SPRING' ? d.slice(6).map((v, i) => v - d[i]) : null};
  });
  // Check force/moment resultants about a numerical reference near the model; this does not
  // introduce a restraint or alter application-point eccentricities.
  const origin = [0, 1, 2].map(i => Math.min(...nodes.map(n => n.pointMm[i])) / 2 + Math.max(...nodes.map(n => n.pointMm[i])) / 2) as FrameVector;
  const forceResidual: FrameVector = [0, 0, 0], momentResidual: FrameVector = [0, 0, 0];
  let forceScale = 1, momentScale = 1;
  nodes.forEach((n, i) => {
    const force = F.slice(6 * i, 6 * i + 3).map((v, d) => v + n.reactionForceN[d]) as FrameVector;
    const moment = F.slice(6 * i + 3, 6 * i + 6).map((v, d) => v + n.reactionMomentNmm[d]) as FrameVector;
    const arm = sub(n.pointMm, origin), lever = cross(arm, force);
    force.forEach((v, d) => forceResidual[d] += v); moment.forEach((v, d) => momentResidual[d] += v + lever[d]);
    forceScale += Math.hypot(...F.slice(6 * i, 6 * i + 3)) + Math.hypot(...n.reactionForceN);
    momentScale += Math.hypot(...F.slice(6 * i + 3, 6 * i + 6)) + Math.hypot(...n.reactionMomentNmm) + Math.hypot(...arm) * (Math.hypot(...F.slice(6 * i, 6 * i + 3)) + Math.hypot(...n.reactionForceN));
  });
  if ([...displacement, ...internal, ...forceResidual, ...momentResidual].some(v => !Number.isFinite(v))) throw Error('FRAME_NUMERIC_RANGE_EXCEEDED');
  if (Math.hypot(...forceResidual) > forceScale * 1e-7 || Math.hypot(...momentResidual) > momentScale * 1e-7) throw Error('FRAME_GLOBAL_FORCE_OR_MOMENT_BALANCE_FAILED');
  const rotationNorms = nodes.filter(n => n.rotationRad.every(v => v !== null)).map(n => Math.hypot(...n.rotationRad as FrameVector));
  const strainEnergyNmm = dot(displacement, internal) / 2, maxTranslationMm = Math.max(...nodes.map(n => Math.hypot(...n.displacementMm)));
  const maxFullyModelledRotationRad = rotationNorms.length ? Math.max(...rotationNorms) : null;
  if (![strainEnergyNmm, maxTranslationMm, ...rotationNorms].every(Number.isFinite)) throw Error('FRAME_NUMERIC_RANGE_EXCEEDED');
  return {engineVersion: 'frame-linear-1.0', method: 'FIRST_ORDER_LINEAR_ELASTIC_3D' as const, status: 'DEMAND_PREVIEW' as const,
    input, nodes, elements, appliedActions, equilibrium: {originMm: origin, forceResidualN: forceResidual, momentResidualNmm: momentResidual, maxFreeForceResidualN, maxFreeMomentResidualNmm},
    diagnostics: {freeDofs: free.length, unusedRotations, minScaledPivot: solved.minScaledPivot, strainEnergyNmm, maxTranslationMm, maxFullyModelledRotationRad},
    blockers: ['SMALL_DISPLACEMENT_AND_EULER_BERNOULLI_SCOPE_REVIEW_REQUIRED', 'GEOMETRIC_SECOND_ORDER_AND_MEMBER_IMPERFECTION_METHOD_REQUIRED', 'ACTUAL_JOINT_SLACK_TENSION_COMPRESSION_AND_NONLINEARITY_REQUIRED',
      'MATERIAL_MEMBER_BUCKLING_AND_CONNECTION_RESISTANCE_METHODS_REQUIRED', 'BILATERAL_SUPPORT_IDEALIZATION_CONTACT_UPLIFT_SLIDING_UNVERIFIED',
      'ACTUAL_SELF_WEIGHT_WIND_STAGE_AND_DESIGN_COMBINATIONS_REQUIRED', 'TRUSTED_PRODUCT_AND_INDEPENDENT_ENGINEERING_REVIEW_REQUIRED'],
    confirmed: false as const, constructionEligible: false as const, constructionRelease: 'NO_GO' as const};
}
