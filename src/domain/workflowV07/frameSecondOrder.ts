import {clone, finite, identifier, record, signed} from './common.js';
import {analyzeLinearFrame, assembleFrameStiffness, equivalentFrameLoadVector, type FrameVector, type LinearFrameInput, type Matrix, type PreparedFrameElement} from './frameLinear.js';

/**
 * A deliberately narrow geometric second-order screening method.  It uses the
 * explicit first-order member axial forces to assemble an elastic geometric
 * stiffness matrix and iterates the P-Delta response.  It is a demand preview:
 * no section, connection, Ringlock or support resistance is inferred here.
 */
export const SECOND_ORDER_METHOD = 'ITERATIVE_P_DELTA_GEOMETRIC_STIFFNESS' as const;

export interface FrameImperfection {
  nodeId: string;
  offsetMm: FrameVector;
  evidenceRef: string;
}

export interface SecondOrderDefinition {
  schemaVersion: '1';
  method: typeof SECOND_ORDER_METHOD;
  evidenceRef: string;
  maxIterations: number;
  displacementToleranceMm: number;
  axialForceToleranceN: number;
  includeTensionStiffening: boolean;
  imperfections: FrameImperfection[];
}

export interface SecondOrderNodeResult {
  id: string;
  pointMm: FrameVector;
  imperfectionMm: FrameVector;
  displacementMm: FrameVector;
  totalDisplacementMm: FrameVector;
  rotationRad: [number, number, number];
}

export interface SecondOrderElementResult {
  id: string;
  kind: string;
  nodeI: string;
  nodeJ: string;
  firstOrderAxialForceN: number | null;
  secondOrderAxialForceN: number | null;
  axialForceChangeN: number | null;
  compressionN: number | null;
}

export interface SecondOrderAnalysis {
  engineVersion: 'frame-second-order-1.0';
  method: typeof SECOND_ORDER_METHOD;
  status: 'DEMAND_PREVIEW' | 'FAIL' | 'BLOCKED';
  stability: 'CONVERGED_SCREEN' | 'UNSTABLE_TANGENT' | 'NOT_CONVERGED' | 'UNAVAILABLE';
  converged: boolean;
  iterations: number;
  input: LinearFrameInput;
  definition: SecondOrderDefinition;
  nodes: SecondOrderNodeResult[];
  elements: SecondOrderElementResult[];
  equilibrium: {maxFreeResidualN: number | null; residualVectorN: number[]};
  diagnostics: {
    minScaledPivot: number | null;
    maxTranslationMm: number | null;
    maxTotalTranslationMm: number | null;
    maxIterationDisplacementChangeMm: number | null;
    maxAxialForceChangeN: number | null;
    firstOrderMaxCompressionN: number | null;
    secondOrderMaxCompressionN: number | null;
    elasticTangentMultiplier: number | null;
  };
  blockers: string[];
  confirmed: false;
  constructionEligible: false;
  constructionRelease: 'NO_GO';
}

const zeros = (n: number, m = n): Matrix => Array.from({length: n}, () => Array(m).fill(0));
const dot = (a: number[], b: number[]) => a.reduce((s, v, i) => s + v * b[i], 0);
const add = (a: number[], b: number[]) => a.map((v, i) => v + b[i]);
const finiteVector = (raw: unknown, label: string): FrameVector => {
  if (!Array.isArray(raw) || raw.length !== 3) throw Error(`${label}: three explicit components required`);
  return raw.map(v => signed(v, label)) as FrameVector;
};
function text(raw: unknown, label: string, required = false) {
  if (typeof raw !== 'string' || raw.length > 2000 || (required && !raw.trim())) throw Error(`Invalid ${label}`);
}
function exact(raw: unknown, keys: string[], label: string) {
  const r = record(raw);
  if (Object.keys(r).some(k => !keys.includes(k)) || keys.some(k => !Object.hasOwn(r, k))) throw Error(`${label}: unsupported or missing fields`);
  return r;
}

export const emptySecondOrderDefinition = (_nodeIds: string[] = []): SecondOrderDefinition => ({
  schemaVersion: '1', method: SECOND_ORDER_METHOD, evidenceRef: '', maxIterations: 20,
  displacementToleranceMm: 1e-6, axialForceToleranceN: 1e-3, includeTensionStiffening: false,
  imperfections: [],
});

/** Validate authored method controls and evidence.  Node completeness is checked against the
 * actual frame input by analyzeSecondOrderFrame; a partially authored draft remains BLOCKED. */
export function validateSecondOrderDefinition(raw: unknown): asserts raw is SecondOrderDefinition {
  const d = exact(raw, ['schemaVersion', 'method', 'evidenceRef', 'maxIterations', 'displacementToleranceMm', 'axialForceToleranceN', 'includeTensionStiffening', 'imperfections'], 'second-order definition') as unknown as SecondOrderDefinition;
  if (d.schemaVersion !== '1' || d.method !== SECOND_ORDER_METHOD || typeof d.includeTensionStiffening !== 'boolean') throw Error('Invalid second-order method');
  text(d.evidenceRef, 'second-order evidence');
  if (!Number.isInteger(d.maxIterations) || d.maxIterations < 1 || d.maxIterations > 50) throw Error('Second-order iterations must be an integer from 1 to 50');
  finite(d.displacementToleranceMm, 'second-order displacement tolerance');
  finite(d.axialForceToleranceN, 'second-order axial-force tolerance');
  if (!(d.displacementToleranceMm > 0) || !(d.axialForceToleranceN > 0)) throw Error('Second-order tolerances must be positive');
  if (!Array.isArray(d.imperfections) || d.imperfections.length > 80) throw Error('Second-order imperfection list exceeds 80 nodes');
  const ids = d.imperfections.map(i => i.nodeId); if (new Set(ids).size !== ids.length) throw Error('Duplicate second-order imperfection node');
  for (const i of d.imperfections) {
    exact(i, ['nodeId', 'offsetMm', 'evidenceRef'], 'second-order imperfection');
    identifier(i.nodeId, 'imperfection node'); finiteVector(i.offsetMm, 'imperfection offset'); text(i.evidenceRef, 'imperfection evidence');
  }
}

function transform(local: Matrix, T: Matrix): Matrix {
  const kt = local.map(row => T[0].map((_, j) => row.reduce((s, value, i) => s + value * T[i][j], 0)));
  return T[0].map((_, i) => T[0].map((__, j) => T.reduce((s, row, p) => s + row[i] * kt[p][j], 0)));
}
function addBlock(k: Matrix, ids: number[], block: Matrix, scale: number, rotationSign: number) {
  const signs = [1, rotationSign, 1, rotationSign];
  for (let i = 0; i < ids.length; i++) for (let j = 0; j < ids.length; j++) k[ids[i]][ids[j]] += block[i][j] * signs[i] * signs[j] * scale;
}
function geometricLocal(p: PreparedFrameElement, axialForceN: number, includeTensionStiffening: boolean): Matrix {
  const kg = zeros(12);
  if (p.lengthMm === null || p.element.kind !== 'BEAM_COLUMN') return kg;
  const signedContribution = axialForceN < 0 || includeTensionStiffening ? axialForceN : 0;
  if (signedContribution === 0) return kg;
  // N is positive in tension in the linear element result.  Compression therefore
  // subtracts this matrix from elastic stiffness and can make the tangent indefinite.
  const L = p.lengthMm, block = [[36, 3 * L, -36, 3 * L], [3 * L, 4 * L * L, -3 * L, -L * L],
    [-36, -3 * L, 36, -3 * L], [3 * L, -L * L, -3 * L, 4 * L * L]];
  addBlock(kg, [1, 5, 7, 11], block, signedContribution / (30 * L), 1);
  addBlock(kg, [2, 4, 8, 10], block, signedContribution / (30 * L), -1);
  return kg;
}
function addGeometricGlobal(Kg: Matrix, p: PreparedFrameElement, axialForceN: number, includeTensionStiffening: boolean) {
  const global = transform(geometricLocal(p, axialForceN, includeTensionStiffening), p.T);
  for (let i = 0; i < 12; i++) for (let j = 0; j < 12; j++) Kg[p.dofs[i]][p.dofs[j]] += global[i][j];
}
function matrixVector(m: Matrix, v: number[]) {return m.map(row => dot(row, v));}
function maxAbs(values: number[]) {return values.length ? Math.max(...values.map(Math.abs)) : 0;}
function displacementVector(nodes: {displacementMm: FrameVector; rotationRad: [number | null, number | null, number | null]}[]): number[] {
  return nodes.flatMap(n => [...n.displacementMm, ...n.rotationRad.map(v => {if (v === null) throw Error('SECOND_ORDER_UNUSED_ROTATIONAL_DOF_UNKNOWN'); return v;})]);
}
function memberAxial(p: PreparedFrameElement, total: number[]): number | null {
  if (p.element.kind === 'JOINT_SPRING') return null;
  const local = p.T.map(row => dot(row, p.dofs.map(d => total[d])));
  const value = dot(p.k[6], local);
  if (!Number.isFinite(value)) throw Error('FRAME_NUMERIC_RANGE_EXCEEDED');
  return value;
}
function scaledSolve(K: Matrix, rhs: number[]) {
  if (!rhs.length) return {solution: [], minScaledPivot: null};
  const scales = K.map((row, i) => {if (!(row[i] > 0)) throw Error('SECOND_ORDER_TANGENT_NOT_POSITIVE_DEFINITE'); return Math.sqrt(row[i]);});
  const A = K.map((row, i) => row.map((v, j) => v / scales[i] / scales[j])), b = rhs.map((v, i) => v / scales[i]), L = zeros(rhs.length);
  let minScaledPivot = Infinity;
  for (let i = 0; i < rhs.length; i++) for (let j = 0; j <= i; j++) {
    let value = A[i][j]; for (let p = 0; p < j; p++) value -= L[i][p] * L[j][p];
    if (i === j) {if (!Number.isFinite(value) || value <= 1e-11) throw Error('SECOND_ORDER_TANGENT_NOT_POSITIVE_DEFINITE'); minScaledPivot = Math.min(minScaledPivot, value); L[i][j] = Math.sqrt(value);}
    else L[i][j] = value / L[j][j];
  }
  const y = Array(rhs.length).fill(0), x = Array(rhs.length).fill(0);
  for (let i = 0; i < rhs.length; i++) {let v = b[i]; for (let j = 0; j < i; j++) v -= L[i][j] * y[j]; y[i] = v / L[i][i];}
  for (let i = rhs.length - 1; i >= 0; i--) {let v = y[i]; for (let j = i + 1; j < rhs.length; j++) v -= L[j][i] * x[j]; x[i] = v / L[i][i];}
  const solution = x.map((v, i) => v / scales[i]);
  if (solution.some(v => !Number.isFinite(v))) throw Error('FRAME_NUMERIC_RANGE_EXCEEDED');
  return {solution, minScaledPivot};
}
type SolvedBoundary = number | 'FREE';
function solveWithBoundary(K: Matrix, F: number[], boundary: SolvedBoundary[]) {
  const fixed = boundary.map((b, i) => typeof b === 'number' ? i : -1).filter(i => i >= 0), free: number[] = [], unusedRotations: number[] = [];
  for (let i = 0; i < boundary.length; i++) if (boundary[i] === 'FREE') {
    if (K[i].every(v => v === 0)) {
      if (i % 6 < 3) throw Error('SECOND_ORDER_UNSTABLE_UNRESTRAINED_TRANSLATION');
      if (F[i] !== 0) throw Error('SECOND_ORDER_ACTION_ON_UNUSED_ROTATIONAL_DOF');
      unusedRotations.push(i);
    } else free.push(i);
  }
  const displacement = boundary.map(b => typeof b === 'number' ? b : 0), rhs = free.map(i => F[i] - fixed.reduce((s, j) => s + K[i][j] * displacement[j], 0));
  const solved = scaledSolve(free.map(i => free.map(j => K[i][j])), rhs); free.forEach((d, i) => displacement[d] = solved.solution[i]);
  return {displacement, free, unusedRotations, minScaledPivot: solved.minScaledPivot};
}
function tangentIsPositive(K: Matrix, boundary: SolvedBoundary[]) {
  const free = boundary.map((b, i) => b === 'FREE' && !K[i].every(v => v === 0) ? i : -1).filter(i => i >= 0);
  try {scaledSolve(free.map(i => free.map(j => K[i][j])), Array(free.length).fill(0)); return true;} catch {return false;}
}
/** Estimate the elastic tangent-loss multiplier relative to the final signed member force
 * state.  This is a numerical stability indicator only; it is never a product SWL or a
 * construction resistance. */
function elasticTangentMultiplier(K: Matrix, prepared: PreparedFrameElement[], axial: (number | null)[], boundary: SolvedBoundary[], includeTensionStiffening: boolean) {
  if (!axial.some(n => n !== null && (n < 0 || includeTensionStiffening && n !== 0))) return null;
  const count = K.length, kg = zeros(count); prepared.forEach((p, i) => {if (axial[i] !== null) addGeometricGlobal(kg, p, axial[i]!, includeTensionStiffening);});
  if (kg.every(row => row.every(v => v === 0))) return null;
  const isStable = (scale: number) => tangentIsPositive(K.map((row, i) => row.map((v, j) => v + scale * kg[i][j])), boundary);
  if (!isStable(1)) return 0;
  let lo = 1, hi = 1;
  while (hi < 1e6 && isStable(hi)) {lo = hi; hi *= 2;}
  if (hi >= 1e6 && isStable(hi)) return null;
  for (let i = 0; i < 40; i++) {const mid = (lo + hi) / 2; if (isStable(mid)) lo = mid; else hi = mid;}
  return lo;
}

function baseResult(linear: LinearFrameInput, definition: SecondOrderDefinition, blockers: string[], status: SecondOrderAnalysis['status'], stability: SecondOrderAnalysis['stability']): SecondOrderAnalysis {
  return {engineVersion: 'frame-second-order-1.0', method: SECOND_ORDER_METHOD, status, stability, converged: false, iterations: 0,
    input: clone(linear), definition: clone(definition), nodes: [], elements: [], equilibrium: {maxFreeResidualN: null, residualVectorN: [],
    }, diagnostics: {minScaledPivot: null, maxTranslationMm: null, maxTotalTranslationMm: null, maxIterationDisplacementChangeMm: null,
      maxAxialForceChangeN: null, firstOrderMaxCompressionN: null, secondOrderMaxCompressionN: null, elasticTangentMultiplier: null}, blockers: [...new Set(blockers)], confirmed: false,
    constructionEligible: false, constructionRelease: 'NO_GO'};
}

/** Run the bounded P-Delta screening method for a current, already validated linear frame. */
export function analyzeSecondOrderFrame(linear: LinearFrameInput, definition: SecondOrderDefinition): SecondOrderAnalysis {
  validateSecondOrderDefinition(definition);
  const blockers = ['SECOND_ORDER_DEMANDS_REQUIRE_MEMBER_CONNECTION_AND_SYSTEM_RESISTANCE_REVIEW',
    'NODAL_IMPERFECTION_ONLY_NO_DISTRIBUTED_MEMBER_CURVATURE_MODEL', 'SUPPORT_CONTACT_UPLIFT_SLIDING_AND_JOINT_NONLINEARITY_UNVERIFIED',
    'MANUFACTURER_RINGLOCK_RATING_AND_INDEPENDENT_ENGINEERING_REVIEW_REQUIRED'];
  if (!definition.evidenceRef.trim()) return baseResult(linear, definition, [...blockers, 'SECOND_ORDER_METHOD_EVIDENCE_REQUIRED'], 'BLOCKED', 'UNAVAILABLE');
  if (definition.imperfections.some(i => !i.evidenceRef.trim())) return baseResult(linear, definition, [...blockers, 'SECOND_ORDER_IMPERFECTION_EVIDENCE_REQUIRED'], 'BLOCKED', 'UNAVAILABLE');
  const baseline = analyzeLinearFrame(linear);
  const ids = linear.nodes.map(n => n.id), imperfections = new Map(definition.imperfections.map(i => [i.nodeId, i]));
  if (definition.imperfections.length !== ids.length || ids.some(id => !imperfections.has(id))) return baseResult(linear, definition, [...blockers, 'EVERY_ACTUAL_FRAME_NODE_REQUIRES_EXPLICIT_IMPERFECTION_RECORD'], 'BLOCKED', 'UNAVAILABLE');
  if (baseline.nodes.some(n => n.rotationRad.some(v => v === null))) return baseResult(linear, definition, [...blockers, 'SECOND_ORDER_UNUSED_ROTATIONAL_DOF_UNKNOWN'], 'BLOCKED', 'UNAVAILABLE');
  const {prepared, K, count} = assembleFrameStiffness(linear), F = equivalentFrameLoadVector(linear), boundary = linear.nodes.flatMap(n => n.boundary) as SolvedBoundary[];
  const imperfection = ids.flatMap(id => [...imperfections.get(id)!.offsetMm, 0, 0, 0]);
  const initial = displacementVector(baseline.nodes.map((n, i) => ({...n, imperfectionMm: imperfection.slice(i * 6, i * 6 + 3) as FrameVector, totalDisplacementMm: add(n.displacementMm, imperfection.slice(i * 6, i * 6 + 3)) as FrameVector})));
  let structural = initial.slice(), previousAxial: (number | null)[] = prepared.map(p => memberAxial(p, add(initial, imperfection))), lastSolve: ReturnType<typeof solveWithBoundary> | null = null;
  const firstOrderAxial = prepared.map(p => memberAxial(p, initial));
  if (prepared.some((p, i) => p.element.kind === 'AXIAL_BAR' && (firstOrderAxial[i] ?? 0) < 0)) blockers.push('SECOND_ORDER_AXIAL_BAR_TRANSVERSE_STABILITY_UNMODELED');
  let finalAxial = previousAxial.slice(), maxDispChange: number | null = null, maxAxialChange: number | null = null, iterations = 0, converged = false, residual = Array(count).fill(0), minPivot: number | null = null;
  try {
    for (let iteration = 1; iteration <= definition.maxIterations; iteration++) {
      const Kg = zeros(count); prepared.forEach((p, i) => {if (previousAxial[i] !== null) addGeometricGlobal(Kg, p, previousAxial[i]!, definition.includeTensionStiffening);});
      const tangent = K.map((row, i) => row.map((v, j) => v + Kg[i][j])), rhs = F.map((v, i) => v - matrixVector(Kg, imperfection)[i]);
      lastSolve = solveWithBoundary(tangent, rhs, boundary); minPivot = lastSolve.minScaledPivot;
      const next = lastSolve.displacement, total = add(next, imperfection), nextAxial = prepared.map(p => memberAxial(p, total));
      maxDispChange = maxAbs(next.map((v, i) => v - structural[i]));
      maxAxialChange = maxAbs(nextAxial.map((v, i) => (v ?? 0) - (previousAxial[i] ?? 0)));
      structural = next; finalAxial = nextAxial; residual = tangent.map((row, i) => dot(row, structural) + matrixVector(Kg, imperfection)[i] - F[i]); iterations = iteration;
      if (maxDispChange <= definition.displacementToleranceMm && maxAxialChange <= definition.axialForceToleranceN) {converged = true; break;}
      previousAxial = nextAxial;
    }
  } catch (e) {
    return baseResult(linear, definition, [...blockers, `SECOND_ORDER_SOLVE:${(e as Error).message}`], 'FAIL', 'UNSTABLE_TANGENT');
  }
  if (!converged) blockers.push('SECOND_ORDER_ITERATION_NOT_CONVERGED_WITHIN_EXPLICIT_LIMIT');
  const nodes = linear.nodes.map((n, i) => ({id: n.id, pointMm: n.pointMm, imperfectionMm: imperfection.slice(i * 6, i * 6 + 3) as FrameVector,
    displacementMm: structural.slice(i * 6, i * 6 + 3) as FrameVector, totalDisplacementMm: add(structural.slice(i * 6, i * 6 + 3), imperfection.slice(i * 6, i * 6 + 3)) as FrameVector,
    rotationRad: structural.slice(i * 6 + 3, i * 6 + 6) as [number, number, number]}));
  const elements = prepared.map((p, i) => ({id: p.element.id, kind: p.element.kind, nodeI: p.element.nodeI, nodeJ: p.element.nodeJ,
    firstOrderAxialForceN: firstOrderAxial[i], secondOrderAxialForceN: finalAxial[i], axialForceChangeN: firstOrderAxial[i] === null || finalAxial[i] === null ? null : finalAxial[i]! - firstOrderAxial[i]!,
    compressionN: finalAxial[i] === null ? null : Math.max(0, -finalAxial[i]!)}));
  const freeResidual = boundary.map((b, i) => b === 'FREE' ? residual[i] : 0), maxFreeResidualN = maxAbs(freeResidual);
  const firstCompressions = firstOrderAxial.filter((n): n is number => n !== null).map(n => Math.max(0, -n)), secondCompressions = finalAxial.filter((n): n is number => n !== null).map(n => Math.max(0, -n));
  const tangentMultiplier = elasticTangentMultiplier(K, prepared, finalAxial, boundary, definition.includeTensionStiffening);
  if (tangentMultiplier !== null) blockers.push('ELASTIC_TANGENT_MULTIPLIER_IS_NOT_RINGLOCK_SWL_OR_MEMBER_RESISTANCE');
  return {engineVersion: 'frame-second-order-1.0', method: SECOND_ORDER_METHOD, status: converged ? 'DEMAND_PREVIEW' : 'BLOCKED', stability: converged ? 'CONVERGED_SCREEN' : 'NOT_CONVERGED',
    converged, iterations, input: clone(linear), definition: clone(definition), nodes, elements, equilibrium: {maxFreeResidualN, residualVectorN: residual}, diagnostics: {
      minScaledPivot: minPivot, maxTranslationMm: nodes.length ? Math.max(...nodes.map(n => Math.hypot(...n.displacementMm))) : null,
      maxTotalTranslationMm: nodes.length ? Math.max(...nodes.map(n => Math.hypot(...n.totalDisplacementMm))) : null, maxIterationDisplacementChangeMm: maxDispChange,
      maxAxialForceChangeN: maxAxialChange, firstOrderMaxCompressionN: firstCompressions.length ? Math.max(...firstCompressions) : null,
      secondOrderMaxCompressionN: secondCompressions.length ? Math.max(...secondCompressions) : null, elasticTangentMultiplier: tangentMultiplier}, blockers: [...new Set(blockers)], confirmed: false, constructionEligible: false, constructionRelease: 'NO_GO'};
}

