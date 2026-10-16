import {geometry as legacyGeometry, segmentInside} from '../index.js';
import {finite, signed, type Point2} from './common.js';

export interface PhysicalFace {
  id: string; a: Point2; b: Point2; lengthMm: number; normal: Point2;
}
export interface OpposingPairRegion {
  id: string; normalAxis: 'X' | 'Y'; faceAId: string; faceBId: string;
  normalAMm: number; normalBMm: number; startMm: number; endMm: number; chordMm: number;
  physicalSpliceCreated: false; mirrorReuse: 'NOT_EVALUATED';
}
export interface Topology {
  status: 'GEOMETRY_ONLY'; vertices: Point2[]; heightMm: number; faces: PhysicalFace[];
  pairs: OpposingPairRegion[]; areaM2: number; perimeterM: number; sideAreaM2: number;
  constructionRelease: 'NO_GO';
}
export function pairFaces(raw: Point2[], heightMm: number, options: {hasHoles?: boolean; uniformHeight?: boolean} = {}): Topology {
  finite(heightMm, 'heightMm');
  if (options.hasHoles || options.uniformHeight === false) throw Error('BLOCKED_UNSUPPORTED: holes or varying heights');
  if (!Array.isArray(raw) || raw.length < 4 || raw.length > 64) throw Error('4–64 vertices required');
  const vertices = raw.map(p => ({x: signed(p?.x, 'x'), y: signed(p?.y, 'y')}));
  const g = legacyGeometry(vertices);
  if (!Number.isFinite(g.area) || !Number.isFinite(g.perimeter)) throw Error('Geometry magnitude out of analysis bounds');
  const faces = vertices.map((a, i): PhysicalFace => {
    const b = vertices[(i + 1) % vertices.length], c = vertices[(i + 2) % vertices.length];
    if ((a.x === b.x) === (a.y === b.y)) throw Error('BLOCKED_UNSUPPORTED: non-orthogonal edge');
    if ((a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y)) throw Error('Remove collinear intermediate vertices');
    const lengthMm = Math.hypot(b.x - a.x, b.y - a.y);
    return {id: `F${i + 1}`, a, b, lengthMm, normal: {x: (b.y - a.y) / lengthMm * g.winding, y: -(b.x - a.x) / lengthMm * g.winding}};
  });
  const pairs: OpposingPairRegion[] = [];
  for (const normal of ['x', 'y'] as const) {
    const tangent = normal === 'x' ? 'y' : 'x';
    const cuts = [...new Set(vertices.map(p => p[tangent]))].sort((a, b) => a - b);
    let previous = new Map<string, OpposingPairRegion>();
    for (let j = 1; j < cuts.length; j++) {
      const lo = cuts[j - 1], hi = cuts[j], mid = (lo + hi) / 2;
      const crossings = faces.filter(f => f.a[normal] === f.b[normal] && Math.min(f.a[tangent], f.b[tangent]) < mid && mid < Math.max(f.a[tangent], f.b[tangent]))
        .sort((a, b) => a.a[normal] - b.a[normal]);
      if (crossings.length % 2) throw Error('Invalid concrete corridors');
      const current = new Map<string, OpposingPairRegion>();
      for (let k = 0; k < crossings.length; k += 2) {
        const a = crossings[k], b = crossings[k + 1], key = `${a.id}/${b.id}/${a.a[normal]}/${b.a[normal]}`;
        let pair = previous.get(key);
        if (pair && pair.endMm === lo) pair.endMm = hi;
        else {
          pair = {id: `PAIR-${pairs.length + 1}`, normalAxis: normal === 'x' ? 'X' : 'Y', faceAId: a.id, faceBId: b.id,
            normalAMm: a.a[normal], normalBMm: b.a[normal], startMm: lo, endMm: hi, chordMm: b.a[normal] - a.a[normal],
            physicalSpliceCreated: false, mirrorReuse: 'NOT_EVALUATED'};
          pairs.push(pair);
        }
        current.set(key, pair);
      }
      previous = current;
    }
  }
  for (const f of faces) {
    const tangent = f.a.x === f.b.x ? 'y' : 'x';
    const intervals = pairs.filter(p => p.faceAId === f.id || p.faceBId === f.id).sort((a, b) => a.startMm - b.startMm);
    let cursor = Math.min(f.a[tangent], f.b[tangent]);
    for (const p of intervals) {if (Math.abs(p.startMm - cursor) > 1e-7) throw Error('Boundary gap or duplicate coverage'); cursor = p.endMm;}
    if (Math.abs(cursor - Math.max(f.a[tangent], f.b[tangent])) > 1e-7) throw Error('Incomplete face coverage');
  }
  return {status: 'GEOMETRY_ONLY', vertices, heightMm, faces, pairs, areaM2: g.area / 1e6, perimeterM: g.perimeter / 1000,
    sideAreaM2: g.perimeter * heightMm / 1e6, constructionRelease: 'NO_GO'};
}

export interface TieRoute {id: string; faceAId: string; faceBId: string; a: Point2; b: Point2; zMm: number; diameterMm: number}
export function tieRouteIssues(topology: Topology, routes: TieRoute[], rebarClearanceEvidence: string | null): string[] {
  const issues: string[] = [], ids = new Set<string>();
  if (!rebarClearanceEvidence?.trim()) issues.push('REBAR_CLEARANCE_NOT_VERIFIED');
  for (const r of routes) {
    if (!r.id || ids.has(r.id)) issues.push(`${r.id}:DUPLICATE_OR_MISSING_ID`);
    ids.add(r.id);
    finite(r.diameterMm, 'tie diameter'); signed(r.zMm, 'tie z');
    const fa = topology.faces.find(f => f.id === r.faceAId), fb = topology.faces.find(f => f.id === r.faceBId);
    const on = (p: Point2, f: PhysicalFace) => Math.abs((f.b.x - f.a.x) * (p.y - f.a.y) - (f.b.y - f.a.y) * (p.x - f.a.x)) < 1e-6 &&
      p.x >= Math.min(f.a.x, f.b.x) && p.x <= Math.max(f.a.x, f.b.x) && p.y >= Math.min(f.a.y, f.b.y) && p.y <= Math.max(f.a.y, f.b.y);
    if (!fa || !fb || fa.id === fb.id || !on(r.a, fa) || !on(r.b, fb) || fa.normal.x * fb.normal.x + fa.normal.y * fb.normal.y > -.999999 ||
      (r.a.x !== r.b.x && r.a.y !== r.b.y) || !segmentInside(r.a, r.b, topology.vertices)) issues.push(`${r.id}:UNSUPPORTED_TIE_PATH`);
    if (r.zMm < r.diameterMm / 2 || r.zMm > topology.heightMm - r.diameterMm / 2) issues.push(`${r.id}:OUTSIDE_HEIGHT`);
  }
  // Orthogonal paths: include centreline crossings and parallel sleeve envelope clashes.
  for (let i = 0; i < routes.length; i++) for (let j = i + 1; j < routes.length; j++) {
    const a = routes[i], b = routes[j], gap = (a.diameterMm + b.diameterMm) / 2;
    const overlaps = (a0: number, a1: number, b0: number, b1: number) => Math.max(Math.min(a0, a1), Math.min(b0, b1)) <= Math.min(Math.max(a0, a1), Math.max(b0, b1));
    const aX = a.a.y === a.b.y, bX = b.a.y === b.b.y;
    let distance = Infinity;
    if (aX === bX) {
      if (aX && overlaps(a.a.x, a.b.x, b.a.x, b.b.x)) distance = Math.hypot(a.a.y - b.a.y, a.zMm - b.zMm);
      if (!aX && overlaps(a.a.y, a.b.y, b.a.y, b.b.y)) distance = Math.hypot(a.a.x - b.a.x, a.zMm - b.zMm);
    } else {
      const h = aX ? a : b, v = aX ? b : a;
      if (overlaps(h.a.x, h.b.x, v.a.x, v.a.x) && overlaps(v.a.y, v.b.y, h.a.y, h.a.y)) distance = Math.abs(a.zMm - b.zMm);
    }
    if (distance < gap) issues.push(`${a.id}/${b.id}:TIE_COLLISION`);
  }
  return issues;
}
