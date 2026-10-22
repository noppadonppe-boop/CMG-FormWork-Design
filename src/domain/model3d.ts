/**
 * Interactive 3D formwork model (browser-safe, deterministic). Builds one part per physical member from the same
 * engine results that drive the calculations and drawings, so every edit made in the 3D view recalculates through
 * the normal input → engine path. Visualization only: NTS for connection details, never a construction model.
 */
import type {Result} from './index.js';
import {buildScene, type Layer} from './scene.js';
import type {BeamResult} from './beam.js';
import type {SlabResult} from './slab.js';
import type {WallResult} from './wall.js';

export type V3 = [number, number, number];
/** Editable component groups; clicking any part selects its whole group. */
export type PartGroup = 'concrete' | 'plywood' | 'stud' | 'waler' | 'tie' | 'joist' | 'bearer' | 'shore' | 'kicker' | 'brace' | 'strongback' | 'soil';
export interface Part3D {id: string; group: PartGroup; label: string; vertices: V3[]; triangles: [number, number, number][]}
export interface FormworkModel3D {parts: Part3D[]; bounds: {min: V3; max: V3}; notes: string[]}
export type Element3D = 'FOOTING' | 'COLUMN' | 'BEAM' | 'SLAB' | 'WALL';

export const GROUP_LABEL: Record<PartGroup, string> = {concrete: 'คอนกรีต', plywood: 'ไม้อัด', stud: 'คร่าว', waler: 'คานคู่ / คานรัด', tie: 'Tie rod',
  joist: 'คร่าวท้อง', bearer: 'คานรับ', shore: 'ค้ำยัน', kicker: 'ไม้กันตีน', brace: 'ค้ำยันเอียง', strongback: 'Strongback', soil: 'ดิน / ผนังเดิม'};
/** Colours match the A3 drawing palette (src/drawing/views.tsx). */
export const GROUP_COLOR: Record<PartGroup, string> = {concrete: '#b9bec4', plywood: '#d9a55a', stud: '#3f6fb0', waler: '#b23a3a', tie: '#1e7b34',
  joist: '#3f6fb0', bearer: '#b23a3a', shore: '#6c4fa0', kicker: '#8a5a24', brace: '#6c4fa0', strongback: '#7a2424', soil: '#9b8668'};
/** Check id prefixes per group, used to show the governing checks of the selected component. */
export const GROUP_CHECKS: Record<PartGroup, string[]> = {concrete: [], plywood: ['ply', 'sof-ply', 'side-ply'], stud: ['stud'], waler: ['waler', 'column'],
  tie: ['tie'], joist: ['joist'], bearer: ['bearer'], shore: ['shore', 'lateral'], kicker: ['kicker'], brace: ['brace', 'lateral'], strongback: ['strongback', 'anchor'], soil: []};

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
/** Parallelepiped from an origin and three edge vectors (outward-facing triangles). */
export function boxPart(id: string, group: PartGroup, label: string, o: V3, u: V3, v: V3, w: V3): Part3D {
  if (cross(u, v).reduce((s, c, i) => s + c * w[i], 0) < 0) [u, v] = [v, u];
  const base = [o, add(o, u), add(add(o, u), v), add(o, v)], vertices = [...base, ...base.map(p => add(p, w))];
  const triangles: [number, number, number][] = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7]];
  for (let a = 0; a < 4; a++) {const b = (a + 1) % 4; triangles.push([a, b, b + 4], [a, b + 4, a + 4]);}
  return {id, group, label, vertices, triangles};
}
/** Axis-aligned box from min/max corners. */
const aabb = (id: string, group: PartGroup, label: string, [x0, y0, z0]: V3, [x1, y1, z1]: V3) =>
  boxPart(id, group, label, [Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)], [Math.abs(x1 - x0), 0, 0], [0, Math.abs(y1 - y0), 0], [0, 0, Math.abs(z1 - z0)]);
/** Square rod between two points (ties, braces). */
function rod(id: string, group: PartGroup, label: string, a: V3, b: V3, size: number): Part3D {
  const d: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L = Math.hypot(...d) || 1, t: V3 = [d[0] / L, d[1] / L, d[2] / L];
  const ref: V3 = Math.abs(t[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0], n1 = cross(t, ref), l1 = Math.hypot(...n1), u: V3 = [n1[0] / l1 * size, n1[1] / l1 * size, n1[2] / l1 * size];
  const n2 = cross(t, u), l2 = Math.hypot(...n2), v: V3 = [n2[0] / l2 * size, n2[1] / l2 * size, n2[2] / l2 * size];
  return boxPart(id, group, label, [a[0] - u[0] / 2 - v[0] / 2, a[1] - u[1] / 2 - v[1] / 2, a[2] - u[2] / 2 - v[2] / 2], u, v, d);
}
function finish(parts: Part3D[], notes: string[]): FormworkModel3D {
  const min: V3 = [Infinity, Infinity, Infinity], max: V3 = [-Infinity, -Infinity, -Infinity];
  for (const p of parts) for (const v of p.vertices) for (let i = 0; i < 3; i++) {min[i] = Math.min(min[i], v[i]); max[i] = Math.max(max[i], v[i]);}
  return {parts, bounds: {min, max}, notes};
}
const n0 = (v: number) => Math.round(v).toLocaleString('en-US');

/** Footing / column: the screened layout scene (plywood, studs, paired walers, ties) with editable groups. */
export function legacyModel3D(r: Result): FormworkModel3D {
  const map: Record<Layer, PartGroup> = {CONCRETE: 'concrete', PLYWOOD: 'plywood', STUD: 'stud', WALER: 'waler', TIE: 'tie'};
  const scene = buildScene(r), x = r.input;
  const labels: Record<PartGroup, string> = {...GROUP_LABEL, stud: `คร่าว @ ${n0(x.studSpacing)}`, waler: `คานคู่ @ ${n0(x.walerSpacing)}`, tie: `Tie Ø${x.tieDiameter} @ ${n0(x.tieSpacing)}`, plywood: `ไม้อัด ${x.plywood} mm`};
  const thai = (w: string) => w.startsWith('Ties in X and Y') ? 'Tie แนว X และ Y แสดงที่ระดับเดียวกันจึงชนกัน ยังไม่ได้ออกแบบการเหลื่อมระดับจริง'
    : w.startsWith('Re-entrant corner') ? 'มุมในของรูปตัว L: คานคู่หยุดก่อนถึงมุม ยังไม่ได้ออกแบบรายละเอียดมุม' : w;
  return finish(scene.solids.map(s => ({id: s.id, group: map[s.layer], label: labels[map[s.layer]], vertices: s.vertices, triangles: s.triangles})), scene.warnings.map(thai));
}

/** Beam: X along the beam, Y across (0 = beam centre line), Z up from the floor. Shores are drawn full height. */
export function beamModel3D(r: BeamResult): FormworkModel3D {
  const x = r.input, L = x.length, b2 = x.b / 2, t = x.plywood, sw2 = x.shoreWidth / 2, parts: Part3D[] = [];
  const jB = r.joist.section.B, jH = r.joist.section.H, bB = r.bearer.section.B * x.bearerCount, bH = r.bearer.section.H;
  const sB = r.stud.section.B, sH = r.stud.section.H, wB = r.waler.section.B, wH = r.waler.section.H;
  const shoreTop = r.shoreLength, bearerTop = shoreTop + bH, joistTop = bearerTop + jH, soffit = x.soffitHeight, top = soffit + x.h;
  parts.push(aabb('concrete-web', 'concrete', `คาน ${n0(x.b)} × ${n0(x.h)}`, [0, -b2, soffit], [L, b2, top]));
  const slabExt = Math.max(500, sw2 - b2 + 300);
  if (x.slabSides >= 1 && x.slabT > 0) parts.push(aabb('concrete-slab-r', 'concrete', `พื้นหนา ${n0(x.slabT)}`, [0, b2, top - x.slabT], [L, b2 + slabExt, top]));
  if (x.slabSides === 2 && x.slabT > 0) parts.push(aabb('concrete-slab-l', 'concrete', `พื้นหนา ${n0(x.slabT)}`, [0, -b2 - slabExt, top - x.slabT], [L, -b2, top]));
  parts.push(aabb('plywood-soffit', 'plywood', `ไม้อัดท้อง ${t} mm`, [0, -b2 - t - sH, joistTop], [L, b2 + t + sH, soffit]));
  r.joists.forEach((s, i) => parts.push(aabb(`joist-${i + 1}`, 'joist', `คร่าวท้อง ${r.joist.name} @ ${n0(x.joistSpacing)}`,
    [Math.max(0, s - jB / 2), -sw2 - bB, bearerTop], [Math.min(L, s + jB / 2), sw2 + bB, joistTop])));
  for (const y of [-sw2, sw2]) parts.push(aabb(`bearer-${y < 0 ? 'L' : 'R'}`, 'bearer', `คานรับ ${x.bearerCount > 1 ? '2×' : ''}${r.bearer.name}`, [0, y - bB / 2, shoreTop], [L, y + bB / 2, bearerTop]));
  r.shores.forEach((s, i) => {for (const y of [-sw2, sw2]) {
    parts.push(aabb(`shore-${i + 1}-${y < 0 ? 'L' : 'R'}`, 'shore', `ค้ำยัน @ ${n0(x.shoreSpacing)} · ${r.shoreLoad.toFixed(1)} kN/ต้น`, [s - 24, y - 24, 8], [s + 24, y + 24, shoreTop]));
    parts.push(aabb(`shore-base-${i + 1}-${y < 0 ? 'L' : 'R'}`, 'shore', 'แผ่นรองค้ำยัน', [s - 75, y - 75, 0], [s + 75, y + 75, 8]));
  }});
  for (const d of [-1, 1] as const) {
    const h = r.sideHeights[d < 0 ? 0 : 1], face = d * b2, k0 = face + d * t, k1 = k0 + d * sH, side = d < 0 ? 'L' : 'R';
    parts.push(aabb(`plywood-side-${side}`, 'plywood', `ไม้อัดข้าง ${t} mm`, [0, face, soffit], [L, k0, soffit + h]));
    r.studs.forEach((s, i) => parts.push(aabb(`stud-${side}-${i + 1}`, 'stud', `คร่าวข้าง ${r.stud.name} @ ${n0(x.studSpacing)}`,
      [Math.max(0, s - sB / 2), k0, joistTop + t], [Math.min(L, s + sB / 2), k1, soffit + h])));
    parts.push(aabb(`kicker-${side}`, 'kicker', 'ไม้กันตีน', [0, k1, joistTop], [L, k1 + d * 38, joistTop + 75]));
    r.tieLevels.forEach((z, i) => [z + 10, z - 10 - wB].forEach((z0, j) => parts.push(aabb(`waler-${side}-${i + 1}-${j + 1}`, 'waler', `คานคู่ ${r.waler.name}`,
      [0, k1, soffit + z0], [L, k1 + d * wH, soffit + z0 + wB]))));
  }
  const reach = b2 + t + sH + wH + 60;
  r.ties.forEach((s, i) => r.tieLevels.forEach((z, j) => parts.push(rod(`tie-${i + 1}-${j + 1}`, 'tie', `Tie Ø${x.tieDiameter} @ ${n0(x.tieSpacing)}`, [s, -reach, soffit + z], [s, reach, soffit + z], x.tieDiameter))));
  return finish(parts, ['แบบพื้นข้างคานแสดงเป็นบริบท (ออกแบบแยก)', 'ค้ำยันแสดงเต็มความสูง หัวและฐานแม่แรงเป็นสัญลักษณ์']);
}

/** Slab: X along the bearers, Y along the joists, Z up. */
export function slabModel3D(r: SlabResult): FormworkModel3D {
  const x = r.input, parts: Part3D[] = [], jB = r.joist.section.B, jH = r.joist.section.H, bB = r.bearer.section.B * x.bearerCount, bH = r.bearer.section.H;
  const shoreTop = r.shoreLength, bearerTop = shoreTop + bH, joistTop = bearerTop + jH, soffit = x.soffitHeight;
  parts.push(aabb('concrete-slab', 'concrete', `พื้น ${n0(x.lx)} × ${n0(x.ly)} หนา ${n0(x.t)}`, [0, 0, soffit], [x.lx, x.ly, soffit + x.t]));
  parts.push(aabb('plywood-soffit', 'plywood', `ไม้อัดท้อง ${x.plywood} mm`, [0, 0, joistTop], [x.lx, x.ly, soffit]));
  r.joists.forEach((s, i) => parts.push(aabb(`joist-${i + 1}`, 'joist', `คร่าว ${r.joist.name} @ ${n0(x.joistSpacing)}`, [Math.max(0, s - jB / 2), 0, bearerTop], [Math.min(x.lx, s + jB / 2), x.ly, joistTop])));
  r.bearers.forEach((y, i) => parts.push(aabb(`bearer-${i + 1}`, 'bearer', `คานรับ ${x.bearerCount > 1 ? '2×' : ''}${r.bearer.name} @ ${n0(x.bearerSpacing)}`, [0, Math.max(0, y - bB / 2), shoreTop], [x.lx, Math.min(x.ly, y + bB / 2), bearerTop])));
  r.bearers.forEach((y, j) => r.shores.forEach((s, i) => {
    parts.push(aabb(`shore-${i + 1}-${j + 1}`, 'shore', `ค้ำยัน @ ${n0(x.shoreSpacing)} · ${r.shoreLoad.toFixed(1)} kN/ต้น`, [s - 24, y - 24, 8], [s + 24, y + 24, shoreTop]));
    parts.push(aabb(`shore-base-${i + 1}-${j + 1}`, 'shore', 'แผ่นรองค้ำยัน', [s - 75, y - 75, 0], [s + 75, y + 75, 8]));
  }));
  return finish(parts, ['ค้ำยันแสดงเต็มความสูง ค้ำยันทแยงและ ledger ยังไม่ออกแบบ']);
}

/** Wall: X along the wall, Y through the thickness (0 = front face), Z up. Single-sided walls show the retained side. */
export function wallModel3D(r: WallResult): FormworkModel3D {
  const x = r.input, L = x.length, H = x.height, t = x.plywood, single = x.system === 'SINGLE_SIDED', parts: Part3D[] = [];
  const sB = r.stud.section.B, sH = r.stud.section.H, wB = r.waler.section.B, wH = r.waler.section.H, gap = x.tieDiameter + 6;
  parts.push(aabb('concrete-wall', 'concrete', `ผนัง ${n0(L)} × ${n0(x.t)} สูง ${n0(H)}`, [0, 0, 0], [L, x.t, H]));
  if (single) parts.push(aabb('soil', 'soil', 'ดิน / ผนังเดิมด้านหลัง', [0, x.t, 0], [L, x.t + 600, H]));
  const faces: {d: -1 | 1; face: number; id: string}[] = single ? [{d: -1, face: 0, id: 'F'}] : [{d: -1, face: 0, id: 'F'}, {d: 1, face: x.t, id: 'B'}];
  let outer = 0;
  for (const {d, face, id} of faces) {
    const k0 = face + d * t, k1 = k0 + d * sH, k2 = k1 + d * wH;
    if (d < 0) outer = k2;
    parts.push(aabb(`plywood-${id}`, 'plywood', `ไม้อัด ${t} mm`, [0, face, 0], [L, k0, H]));
    r.studs.forEach((s, i) => parts.push(aabb(`stud-${id}-${i + 1}`, 'stud', `คร่าว ${r.stud.name} @ ${n0(x.studSpacing)}`, [Math.max(0, s - sB / 2), k0, 0], [Math.min(L, s + sB / 2), k1, H])));
    r.levels.forEach((z, i) => [z + gap / 2, z - gap / 2 - wB].forEach((z0, j) => parts.push(aabb(`waler-${id}-${i + 1}-${j + 1}`, 'waler', `คานคู่ ${r.waler.name} @ ${n0(x.walerSpacing)}`,
      [0, k1, Math.max(0, z0)], [L, k2, Math.min(H, z0 + wB)]))));
  }
  if (!single) {
    const reach = t + sH + wH + 60;
    r.ties.forEach((s, i) => r.levels.forEach((z, j) => parts.push(rod(`tie-${i + 1}-${j + 1}`, 'tie', `Tie Ø${x.tieDiameter} @ ${n0(x.tieSpacing)}`, [s, -reach, z], [s, x.t + reach, z], x.tieDiameter))));
  }
  let face = outer;
  if (single && r.strongback) {
    const bW = r.strongback.section.B * x.strongbackCount, bD = r.strongback.section.H;
    r.braces.forEach((s, i) => parts.push(aabb(`strongback-${i + 1}`, 'strongback', `Strongback ${x.strongbackCount > 1 ? '2×' : ''}${r.strongback!.name} @ ${n0(x.braceSpacing)}`,
      [s - bW / 2, outer, 0], [s + bW / 2, outer - bD, H])));
    face = outer - bD;
  }
  const run = x.braceHeight / Math.tan(x.braceAngle * Math.PI / 180);
  r.braces.forEach((s, i) => parts.push(rod(`brace-${i + 1}`, 'brace', `ค้ำยันเอียง @ ${n0(x.braceSpacing)} · ${r.braceForce.toFixed(1)} kN`, [s, face, x.braceHeight], [s, face - run, 0], 60)));
  return finish(parts, single ? ['ผนังด้านเดียว: แรงดันทั้งหมดผ่าน strongback ไปค้ำยันและพุกฐาน'] : ['ค้ำยันเอียงแสดงด้านหน้าเท่านั้น จุดยึดและพุกเป็นสัญลักษณ์']);
}
