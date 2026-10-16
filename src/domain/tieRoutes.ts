import type {Point} from './index.js';
import {equalPositions} from './mechanics.js';

/**
 * Straight through-tie routes for an orthogonal simple polygon (rectangle, L, …).
 * The plan is cut into slabs between distinct vertex coordinates; each slab gets equally spaced tie lines
 * (≤ spacing). A line is paired across the concrete with the next face it crosses, so every route joins two
 * opposite faces. For a rectangle this reproduces the equal face grid used before.
 * Positions are distances along each face from its start vertex, matching the engine face ids F1…Fn.
 */
export interface TieRoute {id: string; axis: 'X' | 'Y'; coord: number; a: Point; b: Point; length: number; faceA: string; posA: number; faceB: string; posB: number}
const EPS = 1e-6;

export function tieRoutes(points: Point[], spacing: number) {
  const n = points.length, faces = points.map((a, i) => ({id: 'F' + (i + 1), a, b: points[(i + 1) % n]}));
  const cutLines = (cuts: number[]) => cuts.slice(1).flatMap((c, i) => equalPositions(c - cuts[i], spacing).slice(1, -1).map(v => cuts[i] + v));
  const uniq = (v: number[]) => [...new Set(v.map(x => Math.round(x * 1e6) / 1e6))].sort((p, q) => p - q);
  const routes: TieRoute[] = [];
  const along = (f: typeof faces[number], p: Point) => Math.hypot(p.x - f.a.x, p.y - f.a.y);
  const cast = (axis: 'X' | 'Y', coord: number) => {
    // axis = direction the tie runs. A Y-tie at x=coord crosses horizontal faces; an X-tie at y=coord crosses vertical faces.
    const hits = faces.flatMap(f => {
      const horizontal = Math.abs(f.a.y - f.b.y) < EPS, vertical = Math.abs(f.a.x - f.b.x) < EPS;
      if (axis === 'Y' && horizontal && coord > Math.min(f.a.x, f.b.x) + EPS && coord < Math.max(f.a.x, f.b.x) - EPS) return [{f, p: {x: coord, y: f.a.y}, t: f.a.y}];
      if (axis === 'X' && vertical && coord > Math.min(f.a.y, f.b.y) + EPS && coord < Math.max(f.a.y, f.b.y) - EPS) return [{f, p: {x: f.a.x, y: coord}, t: f.a.x}];
      return [];
    }).sort((p, q) => p.t - q.t);
    for (let i = 0; i + 1 < hits.length; i += 2) {
      const A = hits[i], B = hits[i + 1];
      routes.push({id: `T${axis}${Math.round(coord)}-${i / 2 + 1}`, axis, coord, a: A.p, b: B.p, length: B.t - A.t, faceA: A.f.id, posA: along(A.f, A.p), faceB: B.f.id, posB: along(B.f, B.p)});
    }
  };
  for (const x of cutLines(uniq(points.map(p => p.x)))) cast('Y', x);
  for (const y of cutLines(uniq(points.map(p => p.y)))) cast('X', y);
  const supportsByFace: Record<string, number[]> = Object.fromEntries(faces.map(f => [f.id, [] as number[]]));
  for (const r of routes) {supportsByFace[r.faceA].push(r.posA); supportsByFace[r.faceB].push(r.posB);}
  for (const k of Object.keys(supportsByFace)) supportsByFace[k].sort((p, q) => p - q);
  return {routes, supportsByFace};
}
