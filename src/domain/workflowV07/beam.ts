import {clone, finite, signed, uniqueIds} from './common.js';
import {screenBeamMemberResistance, type BeamMemberActionBasis, type BeamMemberEvidence, type BeamMemberResistanceScreen} from './beamResistance.js';

/** displacementMm: prescribed translation in the load-positive direction (coupled support movement). */
export interface BeamSupport {id: string; xMm: number; rotationFixed?: boolean; displacementMm?: number}
export interface BeamLoad {id: string; xMm: number; forceN: number}
export interface BeamPatch {id: string; startMm: number; endMm: number; startNPerMm: number; endNPerMm: number}
export interface BeamInput {
  id: string; revision: string; lengthMm: number; E_MPa: number; I_mm4: number;
  supports: BeamSupport[]; points: BeamLoad[]; patches: BeamPatch[];
  actionBasis?: BeamMemberActionBasis;
  memberEvidenceRef?: string | null;
  resistanceEvidence?: BeamMemberEvidence[] | null;
}
export interface BeamReaction {supportId: string; xMm: number; forceN: number; momentNmm: number}
export interface BeamSegment {
  startMm: number; lengthMm: number; EI: number; displacementMm: number; rotation: number;
  moment0Nmm: number; shear0N: number; q0NPerMm: number; gradient: number;
}
export interface BeamCriticalStation {
  stationMm: number;
  segmentIndex: number;
  /** At a point-load/support split, identifies the one-sided segment value. */
  side: 'LEFT_LIMIT' | 'INTERIOR' | 'RIGHT_LIMIT';
}
export interface BeamAnalysis {
  input: BeamInput;
  id: string; revision: string; model: 'ELASTIC_CONTINUOUS_BEAM'; segments: BeamSegment[];
  reactions: BeamReaction[]; maxMomentNmm: number; maxShearN: number; maxDeflectionMm: number;
  criticalStations: {moment: BeamCriticalStation; shear: BeamCriticalStation; deflection: BeamCriticalStation};
  resistanceScreen: BeamMemberResistanceScreen;
  totalLoadN: number; forceResidualN: number; momentResidualNmm: number; status: 'LOAD_PREVIEW';
}
const evaluate = (a: number[], x: number) => a.reduceRight((s, c) => s * x + c, 0);
/** Isolate roots between derivative roots; no sampled governing maximum. Coefficients use x/L. */
function roots(coefficients: number[], lo = 0, hi = 1): number[] {
  const a = [...coefficients], scale = Math.max(...a.map(Math.abs), 1e-30);
  while (a.length > 1 && Math.abs(a.at(-1)!) < scale * 1e-14) a.pop();
  if (a.length < 2) return [];
  if (a.length === 2) {const r = -a[0] / a[1]; return r >= lo && r <= hi ? [r] : [];}
  const knots = [lo, ...roots(a.slice(1).map((v, i) => v * (i + 1)), lo, hi), hi];
  const found = knots.filter(x => Math.abs(evaluate(a, x)) <= scale * 1e-12);
  for (let i = 1; i < knots.length; i++) {
    let l = knots[i - 1], r = knots[i];
    if (evaluate(a, l) * evaluate(a, r) >= 0) continue;
    for (let n = 0; n < 65; n++) {const m = (l + r) / 2; if (evaluate(a, l) * evaluate(a, m) <= 0) r = m; else l = m;}
    found.push((l + r) / 2);
  }
  return found;
}
function solve(matrix: number[][], rhs: number[]): number[] {
  if (!rhs.length) return [];
  const a = matrix.map((r, i) => [...r, rhs[i]]), n = rhs.length;
  const norm = Math.max(...matrix.map(r => Math.max(...r.map(Math.abs))));
  for (let i = 0; i < n; i++) {
    let pivot = i;
    for (let j = i + 1; j < n; j++) if (Math.abs(a[j][i]) > Math.abs(a[pivot][i])) pivot = j;
    if (!Number.isFinite(a[pivot][i]) || Math.abs(a[pivot][i]) <= norm * 1e-12) throw Error('BLOCKED_UNSTABLE_OR_ILL_CONDITIONED_BEAM');
    [a[i], a[pivot]] = [a[pivot], a[i]];
    for (let j = i + 1; j < n; j++) {
      const ratio = a[j][i] / a[i][i];
      for (let k = i; k <= n; k++) a[j][k] -= ratio * a[i][k];
    }
  }
  const x = Array(n).fill(0) as number[];
  for (let i = n - 1; i >= 0; i--) {
    let value = a[i][n];
    for (let j = i + 1; j < n; j++) value -= a[i][j] * x[j];
    x[i] = value / a[i][i];
    if (!Number.isFinite(x[i])) throw Error('Nonfinite beam solution');
  }
  return x;
}
export function beamAt(s: BeamSegment, xMm: number) {
  signed(xMm, 'beam station');
  if (xMm < 0 || xMm > s.lengthMm) throw Error('Station outside segment');
  const x = xMm, {moment0Nmm: m, shear0N: v, q0NPerMm: q, gradient: g, EI} = s;
  return {momentNmm: m + v * x - q * x ** 2 / 2 - g * x ** 3 / 6,
    shearN: v - q * x - g * x ** 2 / 2,
    deflectionMm: s.displacementMm + s.rotation * x - m * x ** 2 / (2 * EI) - v * x ** 3 / (6 * EI) + q * x ** 4 / (24 * EI) + g * x ** 5 / (120 * EI)};
}

/** Euler–Bernoulli, prismatic constant EI, small displacement, rigid vertical supports (zero or explicitly prescribed translation).
 * Actual point and linear patch loads. Downward force and clockwise nodal rotation/moment positive.
 * Does not implement steel/plywood strength, frame stability, springs, joint slip or second order.
 */
export function analyzeBeam(o: BeamInput): BeamAnalysis {
  const L = finite(o.lengthMm, 'length'), E = finite(o.E_MPa, 'E'), I = finite(o.I_mm4, 'I');
  if (!o.id || !o.revision || !o.supports.length) throw Error('Beam identity, revision and supports required');
  if (o.supports.length + o.points.length + o.patches.length * 2 > 120) throw Error('Beam node limit exceeded');
  uniqueIds(o.supports, 'supports'); uniqueIds(o.points, 'point loads'); uniqueIds(o.patches, 'patch loads');
  const station = (v: number) => {signed(v, 'station'); if (v < 0 || v > L) throw Error('Station outside beam'); return v;};
  o.supports.forEach(s => {station(s.xMm); if (s.displacementMm !== undefined) signed(s.displacementMm, 'prescribed support displacement');});
  if (new Set(o.supports.map(s => s.xMm)).size !== o.supports.length) throw Error('Duplicate supports at one station');
  o.points.forEach(p => {station(p.xMm); finite(p.forceN, 'point load', true);});
  o.patches.forEach(p => {station(p.startMm); station(p.endMm); if (p.endMm <= p.startMm) throw Error('Invalid patch'); finite(p.startNPerMm, 'patch start', true); finite(p.endNPerMm, 'patch end', true);});
  const xs = [...new Set([0, L, ...o.supports.map(s => s.xMm), ...o.points.map(p => p.xMm), ...o.patches.flatMap(p => [p.startMm, p.endMm])])].sort((a, b) => a - b);
  const n = xs.length * 2, K = Array.from({length: n}, () => Array(n).fill(0) as number[]), F = Array(n).fill(0) as number[];
  const elements: {ids: number[]; k: number[][]; f: number[]; q0: number; gradient: number; length: number}[] = [];
  for (let i = 1; i < xs.length; i++) {
    const start = xs[i - 1], len = xs[i] - start;
    if (len < L * 1e-8) throw Error('Beam stations too close');
    let q0 = 0, q1 = 0;
    for (const p of o.patches) if (p.startMm <= start && p.endMm >= xs[i]) {
      const gradient = (p.endNPerMm - p.startNPerMm) / (p.endMm - p.startMm);
      q0 += p.startNPerMm + gradient * (start - p.startMm); q1 += p.startNPerMm + gradient * (xs[i] - p.startMm);
    }
    const scale = [1, 1 / L, 1, 1 / L]; // rotations scaled to displacement units before elimination
    const raw = [[12, 6 * len, -12, 6 * len], [6 * len, 4 * len ** 2, -6 * len, 2 * len ** 2],
      [-12, -6 * len, 12, -6 * len], [6 * len, 2 * len ** 2, -6 * len, 4 * len ** 2]];
    const k = raw.map((row, a) => row.map((v, b) => v * E * I / len ** 3 * scale[a] * scale[b]));
    const f = [len * (7 * q0 + 3 * q1) / 20, len ** 2 * (3 * q0 + 2 * q1) / 60,
      len * (3 * q0 + 7 * q1) / 20, -(len ** 2) * (2 * q0 + 3 * q1) / 60].map((v, a) => v * scale[a]);
    const ids = [(i - 1) * 2, (i - 1) * 2 + 1, i * 2, i * 2 + 1];
    ids.forEach((a, j) => {F[a] += f[j]; ids.forEach((b, z) => K[a][b] += k[j][z]);});
    elements.push({ids, k, f, q0, gradient: (q1 - q0) / len, length: len});
  }
  o.points.forEach(p => F[xs.indexOf(p.xMm) * 2] += p.forceN);
  const fixed = new Set<number>();
  o.supports.forEach(s => {const i = xs.indexOf(s.xMm) * 2; fixed.add(i); if (s.rotationFixed) fixed.add(i + 1);});
  const free = Array.from({length: n}, (_, i) => i).filter(i => !fixed.has(i));
  const d = Array(n).fill(0) as number[];
  o.supports.forEach(s => {d[xs.indexOf(s.xMm) * 2] = s.displacementMm ?? 0;});
  const solution = solve(free.map(a => free.map(b => K[a][b])), free.map(i => F[i] - [...fixed].reduce((sum, j) => sum + K[i][j] * d[j], 0)));
  free.forEach((id, i) => d[id] = solution[i]);
  const residual = K.map((row, i) => row.reduce((v, k, j) => v + k * d[j], -F[i]));
  const reactions = o.supports.map(s => {const i = xs.indexOf(s.xMm) * 2; return {supportId: s.id, xMm: s.xMm, forceN: residual[i], momentNmm: s.rotationFixed ? residual[i + 1] * L : 0};});
  const segments = elements.map((e, i): BeamSegment => {
    const end = e.k.map((row, a) => row.reduce((v, k, j) => v + k * d[e.ids[j]], -e.f[a]));
    return {startMm: xs[i], lengthMm: e.length, EI: E * I, displacementMm: d[e.ids[0]], rotation: d[e.ids[1]] / L,
      moment0Nmm: end[1] * L, shear0N: -end[0], q0NPerMm: e.q0, gradient: e.gradient};
  });
  let maxMomentNmm = 0, maxShearN = 0, maxDeflectionMm = 0;
  let momentStation: BeamCriticalStation | null = null, shearStation: BeamCriticalStation | null = null, deflectionStation: BeamCriticalStation | null = null;
  const locate = (s: BeamSegment, segmentIndex: number, localXMm: number): BeamCriticalStation => {
    const tolerance = Math.max(1, s.lengthMm) * 1e-10;
    const side = localXMm <= tolerance ? 'RIGHT_LIMIT' : s.lengthMm - localXMm <= tolerance ? 'LEFT_LIMIT' : 'INTERIOR';
    return {stationMm: s.startMm + localXMm, segmentIndex, side};
  };
  for (const [segmentIndex, s] of segments.entries()) {
    const l = s.lengthMm, m = s.moment0Nmm, v = s.shear0N, q = s.q0NPerMm, g = s.gradient;
    const momentStations = [0, 1, ...roots([v, -q * l, -g * l * l / 2])];
    const shearStations = [0, 1, ...roots([q, g * l])];
    const deflectionStations = [0, 1, ...roots([s.rotation, -m * l / s.EI, -v * l * l / (2 * s.EI), q * l ** 3 / (6 * s.EI), g * l ** 4 / (24 * s.EI)])];
    for (const t of momentStations) {
      const localXMm = t * l, value = Math.abs(beamAt(s, localXMm).momentNmm);
      if (!momentStation || value > maxMomentNmm) {maxMomentNmm = value; momentStation = locate(s, segmentIndex, localXMm);}
    }
    for (const t of shearStations) {
      const localXMm = t * l, value = Math.abs(beamAt(s, localXMm).shearN);
      if (!shearStation || value > maxShearN) {maxShearN = value; shearStation = locate(s, segmentIndex, localXMm);}
    }
    for (const t of deflectionStations) {
      const localXMm = t * l, value = Math.abs(beamAt(s, localXMm).deflectionMm);
      if (!deflectionStation || value > maxDeflectionMm) {maxDeflectionMm = value; deflectionStation = locate(s, segmentIndex, localXMm);}
    }
  }
  if (!momentStation || !shearStation || !deflectionStation) throw Error('Beam governing stations missing');
  const totalLoadN = o.points.reduce((s, p) => s + p.forceN, 0) + o.patches.reduce((s, p) => s + (p.startNPerMm + p.endNPerMm) / 2 * (p.endMm - p.startMm), 0);
  const loadMoment = o.points.reduce((s, p) => s + p.forceN * p.xMm, 0) + o.patches.reduce((s, p) => {
    const len = p.endMm - p.startMm; return s + p.startMm * (p.startNPerMm + p.endNPerMm) * len / 2 + len ** 2 * (p.startNPerMm / 6 + p.endNPerMm / 3);
  }, 0);
  const forceResidualN = totalLoadN + reactions.reduce((s, r) => s + r.forceN, 0);
  const momentResidualNmm = loadMoment + reactions.reduce((s, r) => s + r.forceN * r.xMm + r.momentNmm, 0);
  // Prescribed movement creates self-equilibrated reactions, so scale by reaction magnitudes too.
  // Rigid-body support movement gives ~zero reactions, so round-off is bounded by EI·δ terms.
  const movedMm = Math.max(0, ...o.supports.map(s => Math.abs(s.displacementMm ?? 0))), shortest = Math.min(...xs.slice(1).map((x, i) => x - xs[i]));
  const reactionScale = reactions.reduce((s, r) => s + Math.abs(r.forceN), 0) + E * I * movedMm / shortest ** 3;
  const reactionMomentScale = reactions.reduce((s, r) => s + Math.abs(r.forceN * r.xMm) + Math.abs(r.momentNmm), 0) + E * I * movedMm / shortest ** 3 * L;
  if (Math.abs(forceResidualN) > Math.max(1, Math.abs(totalLoadN), reactionScale) * 1e-7 || Math.abs(momentResidualNmm) > Math.max(1, Math.abs(totalLoadN) * L, reactionMomentScale) * 1e-7) throw Error(`Beam equilibrium failed (force residual ${forceResidualN} N, moment residual ${momentResidualNmm} N·mm)`);
  const supportStations = [...new Set([0, L, ...o.supports.map(s => s.xMm)])].sort((a, b) => a - b);
  const maximumUnsupportedSpanMm = Math.max(...supportStations.slice(1).map((x, i) => x - supportStations[i]));
  const resistanceScreen = screenBeamMemberResistance({evidence: o.resistanceEvidence, actionBasis: o.actionBasis,
    memberEvidenceRef: o.memberEvidenceRef, maximumUnsupportedSpanMm,
    demands: {FLEXURE: maxMomentNmm, SHEAR: maxShearN, DEFLECTION: maxDeflectionMm}});
  return {input: clone(o), id: o.id, revision: o.revision, model: 'ELASTIC_CONTINUOUS_BEAM', segments, reactions, maxMomentNmm, maxShearN, maxDeflectionMm,
    criticalStations: {moment: momentStation, shear: shearStation, deflection: deflectionStation},
    resistanceScreen,
    totalLoadN, forceResidualN, momentResidualNmm, status: 'LOAD_PREVIEW'};
}
