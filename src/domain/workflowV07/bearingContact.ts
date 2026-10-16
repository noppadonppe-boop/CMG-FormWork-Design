import {canonical, finite, signed} from './common.js';

type V3 = [number, number, number];
type P2 = [number, number];
const rectangle: P2[] = [[-.5, -.5], [.5, -.5], [.5, .5], [-.5, .5]];
const dot = (a: number[], b: number[]) => a.reduce((s, v, i) => s + v * b[i], 0);
const plane = (t: V3, p: P2) => t[0] + t[1] * p[0] + t[2] * p[1];
function compressedPolygon(t: V3) {
  const result: P2[] = [];
  rectangle.forEach((a, i) => {
    const b = rectangle[(i + 1) % 4], qa = plane(t, a), qb = plane(t, b);
    if (qa >= 0 && qb >= 0) result.push(b);
    else if ((qa >= 0) !== (qb >= 0)) {
      const s = qa / (qa - qb), p: P2 = [a[0] + s * (b[0] - a[0]), a[1] + s * (b[1] - a[1])];
      result.push(p); if (qb >= 0) result.push(b);
    }
  });
  return result.filter((p, i) => !i || p[0] !== result[i - 1][0] || p[1] !== result[i - 1][1]);
}
/** Exact area/first/second polygon moments; pressure is affine on its compressed half-plane. */
function moments(p: P2[]) {
  let A = 0, X = 0, Y = 0, XX = 0, XY = 0, YY = 0;
  p.forEach((a, i) => {const b = p[(i + 1) % p.length], c = a[0] * b[1] - b[0] * a[1];
    A += c / 2; X += (a[0] + b[0]) * c / 6; Y += (a[1] + b[1]) * c / 6;
    XX += (a[0] ** 2 + a[0] * b[0] + b[0] ** 2) * c / 12;
    YY += (a[1] ** 2 + a[1] * b[1] + b[1] ** 2) * c / 12;
    XY += (2 * a[0] * a[1] + a[0] * b[1] + b[0] * a[1] + 2 * b[0] * b[1]) * c / 24;
  });
  return [[A, X, Y], [X, XX, XY], [Y, XY, YY]];
}
function state(t: V3, target: V3) {
  const polygon = compressedPolygon(t), H = moments(polygon), resultant = H.map(row => dot(row, t)) as V3;
  return {polygon, H, resultant, gradient: resultant.map((v, i) => v - target[i]) as V3, objective: dot(t, resultant) / 2 - dot(target, t)};
}
function solve(H: number[][], g: V3): V3 {
  const d = H.map((row, i) => Math.sqrt(finite(row[i], 'contact Jacobian diagonal'))), L = Array.from({length: 3}, () => [0, 0, 0]);
  for (let i = 0; i < 3; i++) for (let j = 0; j <= i; j++) {
    const v = H[i][j] / (d[i] * d[j]) - L[i].slice(0, j).reduce((s, x, k) => s + x * L[j][k], 0);
    if (i === j) {if (!Number.isFinite(v) || v <= 1e-13) throw Error('CONTACT_JACOBIAN_ILL_CONDITIONED'); L[i][j] = Math.sqrt(v);} else L[i][j] = v / L[j][j];
  }
  const y = [0, 0, 0], x = [0, 0, 0];
  for (let i = 0; i < 3; i++) y[i] = (g[i] / d[i] - L[i].slice(0, i).reduce((s, v, j) => s + v * y[j], 0)) / L[i][i];
  for (let i = 2; i >= 0; i--) x[i] = (y[i] - [0, 1, 2].filter(j => j > i).reduce((s, j) => s + L[j][i] * x[j], 0)) / L[i][i];
  return x.map((v, i) => v / d[i]) as V3;
}

/** Conditional rigid, horizontal rectangular contact with p=max(0,a+b*x+c*y).
 * Exact statics for that declared pressure law, not a plate/sole-board/slab/soil design rule.
 * Compression is positive; Mx/My are LOAD moments about contact centre. The pressure reaction
 * has Mx=-loadMx and My=-loadMy, so its centroid is (loadMy/N,-loadMx/N).
 * No stiffness, friction, bearing limit, settlement or engineering acceptance is inferred.
 */
export function analyzeBearingContact(input: {lengthXMm: number; widthYMm: number; compressionN: number; loadMxNmm: number; loadMyNmm: number}) {
  const B = finite(input.lengthXMm, 'actual contact length X'), L = finite(input.widthYMm, 'actual contact width Y');
  const N = signed(input.compressionN, 'actual contact compression'), Mx = signed(input.loadMxNmm, 'actual contact Mx'), My = signed(input.loadMyNmm, 'actual contact My');
  const area = finite(B * L, 'actual rectangular area');
  const unavailable = (reason: string, status: 'BLOCKED' | 'FAIL' = 'BLOCKED') => ({status, reason, compressionN: N, areaMm2: area, result: null, constructionRelease: 'NO_GO' as const});
  if (N < 0 || (N === 0 && (Mx !== 0 || My !== 0))) return unavailable('NO_COMPRESSION_ONLY_EQUILIBRIUM_FOR_DECLARED_WRENCH', 'FAIL');
  const ex = N === 0 ? 0 : My / N / B, ey = N === 0 ? 0 : -Mx / N / L;
  if (![ex, ey].every(Number.isFinite)) return unavailable('CONTACT_NUMERIC_RANGE_EXCEEDED');
  if (Math.abs(ex) >= .5 || Math.abs(ey) >= .5) return unavailable('RESULTANT_ON_OR_OUTSIDE_RECTANGLE_NO_FINITE_COMPRESSION_FIELD', 'FAIL');
  if (.5 - Math.max(Math.abs(ex), Math.abs(ey)) < 1e-6) return unavailable('RESULTANT_TOO_NEAR_EDGE_FOR_CONTACT_NUMERIC_SCOPE');
  try {
    const target: V3 = [1, ex, ey]; let t: V3 = [1, 12 * ex, 12 * ey], s = state(t, target), iterations = 0;
    for (; iterations < 80 && Math.max(...s.gradient.map(Math.abs)) > 1e-11; iterations++) {
      const step = solve(s.H, s.gradient), descent = dot(s.gradient, step); let accepted = false, alpha = 1;
      if (!Number.isFinite(descent) || descent <= 0) throw Error('CONTACT_NEWTON_DIRECTION_UNAVAILABLE');
      for (let backtrack = 0; backtrack < 40; backtrack++, alpha /= 2) {
        const candidate = t.map((v, i) => v - alpha * step[i]) as V3, next = state(candidate, target);
        const residualImproves = Math.max(...next.gradient.map(Math.abs)) < Math.max(...s.gradient.map(Math.abs)) * (1 - 1e-3 * alpha);
        const withinObjectiveRoundoff = next.objective <= s.objective + 32 * Number.EPSILON * Math.max(1, Math.abs(s.objective));
        if (Number.isFinite(next.objective) && (next.objective <= s.objective - 1e-4 * alpha * descent || (residualImproves && withinObjectiveRoundoff))) {t = candidate; s = next; accepted = true; break;}
      }
      if (!accepted) throw Error('CONTACT_LINE_SEARCH_DID_NOT_CONVERGE');
    }
    if (Math.max(...s.gradient.map(Math.abs)) > 1e-10) throw Error('CONTACT_EQUILIBRIUM_DID_NOT_CONVERGE');
    const mean = N === 0 ? 0 : finite(N / area, 'contact mean pressure numeric range'), physical = (p: P2) => Math.max(0, plane(t, p)) * mean;
    const polygon = N === 0 ? [] : s.polygon.map(p => ({xMm: p[0] * B, yMm: p[1] * L, pressureMPa: physical(p)}));
    const cornerPressureMPa = rectangle.map(p => physical(p)), cornerPlaneMPa = rectangle.map(p => plane(t, p) * mean);
    const contactAreaMm2 = N === 0 ? 0 : s.H[0][0] * area, pressureMaxMPa = Math.max(...cornerPressureMPa);
    const result = {method: 'DECLARED_RIGID_RECTANGLE_AFFINE_COMPRESSION_ONLY' as const,
      contact: N === 0 ? 'UNLOADED' as const : rectangle.every(p => plane(t, p) >= 0) ? 'FULL_COMPRESSION' as const : 'PARTIAL_COMPRESSION' as const,
      eccentricityMm: N === 0 ? null : {x: ex * B, y: ey * L}, contactAreaMm2, areaFraction: contactAreaMm2 / area,
      meanFootprintPressureMPa: mean, meanCompressedPressureMPa: contactAreaMm2 > 0 ? N / contactAreaMm2 : null,
      pressureMaxMPa, pressureMinMPa: N === 0 || s.H[0][0] < 1 ? 0 : Math.min(...cornerPressureMPa), cornerPressureMPa, cornerPlaneMPa,
      coefficientsMPa: [t[0] * mean, t[1] * mean / B, t[2] * mean / L] as V3, compressedPolygon: polygon,
      equilibrium: {forceResidualN: N === 0 ? 0 : N * (s.resultant[0] - 1), loadMxResidualNmm: N === 0 ? 0 : -N * L * s.resultant[2] - Mx,
        loadMyResidualNmm: N === 0 ? 0 : N * B * s.resultant[1] - My}, iterations};
    canonical(result);
    if (Math.abs(result.equilibrium.forceResidualN) > Math.max(1, Math.abs(N)) * 1e-7 || Math.abs(result.equilibrium.loadMxResidualNmm) > Math.max(1, Math.abs(N * L)) * 1e-7 || Math.abs(result.equilibrium.loadMyResidualNmm) > Math.max(1, Math.abs(N * B)) * 1e-7) throw Error('CONTACT_PHYSICAL_FORCE_OR_MOMENT_BALANCE_FAILED');
    return {status: 'BLOCKED' as const, reason: 'CONDITIONAL_CONTACT_DEMAND_ONLY_RIGIDITY_AND_RESISTANCE_UNVERIFIED', compressionN: N, areaMm2: area, result, constructionRelease: 'NO_GO' as const};
  } catch (e) {return unavailable(`CONTACT_SOLVER:${(e as Error).message}`);}
}
