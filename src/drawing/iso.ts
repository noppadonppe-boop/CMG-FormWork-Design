import {LAYER_COLORS, type Layer, type Solid} from '../domain/scene';

export type IsoFace = {d: string; depth: number; fill: string; opacity: number; layer: Layer};
/** Painter's-algorithm projection with back-face culling. Output path coordinates are model mm, screen Y down. */
export function projectSolids(solids: Solid[], yaw: number, pitch: number, hidden: Layer[] = []) {
  const all = solids.flatMap(s => s.vertices);
  const mid = [0, 1, 2].map(a => {let lo = Infinity, hi = -Infinity; for (const v of all) {lo = Math.min(lo, v[a]); hi = Math.max(hi, v[a]);} return (lo + hi) / 2;});
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const faces: IsoFace[] = [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of solids) {
    if (hidden.includes(s.layer)) continue;
    const pts = s.vertices.map(([x, y, z]) => {
      const X = x - mid[0], Y = y - mid[1], Z = z - mid[2], rx = X * cy - Y * sy, ry = X * sy + Y * cy;
      return {rx, ry, Z, sx: rx, sy: -(ry * sp + Z * cp), depth: -ry * cp + Z * sp};
    });
    const {rgb, alpha} = LAYER_COLORS[s.layer];
    for (const [i, j, k] of s.triangles) {
      const a = pts[i], b = pts[j], c = pts[k];
      const u = [b.rx - a.rx, b.ry - a.ry, b.Z - a.Z], w = [c.rx - a.rx, c.ry - a.ry, c.Z - a.Z];
      const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]], len = Math.hypot(...n) || 1;
      const facing = (-n[1] * cp + n[2] * sp) / len;
      if (facing <= 1e-6) continue;
      const shade = 0.55 + 0.45 * facing;
      for (const p of [a, b, c]) {minX = Math.min(minX, p.sx); maxX = Math.max(maxX, p.sx); minY = Math.min(minY, p.sy); maxY = Math.max(maxY, p.sy);}
      faces.push({d: `M${a.sx.toFixed(1)} ${a.sy.toFixed(1)}L${b.sx.toFixed(1)} ${b.sy.toFixed(1)}L${c.sx.toFixed(1)} ${c.sy.toFixed(1)}Z`,
        depth: (a.depth + b.depth + c.depth) / 3, fill: `rgb(${rgb.map(v => Math.round(v * shade * 255)).join(',')})`, opacity: alpha, layer: s.layer});
    }
  }
  faces.sort((p, q) => p.depth - q.depth);
  return {faces, bounds: faces.length ? {minX, minY, maxX, maxY} : {minX: 0, minY: 0, maxX: 1, maxY: 1}};
}
