import type {Point, Result} from './index.js';
import {equalPositions} from './mechanics.js';
import {sectionById, timberGrade} from './sectionStock.js';

/**
 * Element-agnostic formwork layout used by drawings, BOM and reports.
 * Built from the footing/column screening engine today; other element engines can produce the same shape later.
 * All lengths are mm; plan coordinates match the engine polygon (X right, Y up), Z is up from the concrete base.
 */
/** extStart/extEnd: waler extension past each end (positive at convex corners, negative = stops short at re-entrant corners). */
export interface LayoutFace {id: string; a: Point; b: Point; length: number; dir: Point; normal: Point; studs: number[]; ties: number[]; extStart: number; extEnd: number}
/** Waler end extensions for a counter-clockwise polygon: extend past convex corners, stop short of re-entrant ones. */
export function walerExtensions(points: Point[], extension: number, outer: number) {
  const n = points.length, dir = (i: number) => {const a = points[i], b = points[(i + 1) % n], l = Math.hypot(b.x - a.x, b.y - a.y); return {x: (b.x - a.x) / l, y: (b.y - a.y) / l};};
  const convex = (i: number) => {const p = dir((i - 1 + n) % n), c = dir(i); return p.x * c.y - p.y * c.x > 0;};
  return points.map((_, i) => ({start: convex(i) ? extension : -outer, end: convex((i + 1) % n) ? extension : -outer}));
}
export interface LayoutTie {id: string; axis: 'X' | 'Y'; position: number; z: number; a: Point; b: Point; length: number}
export interface BomRow {group: string; item: string; spec: string; unit: string; qty: number | null; cutLength: number | null; total: string; remark: string}
export interface FormworkLayout {
  kind: 'FOOTING' | 'COLUMN'; shape: 'RECTANGLE' | 'L'; points: Point[]; width: number; length: number; height: number; armX: number; armY: number;
  plywood: {t: number; sheetW: number; sheetH: number};
  /** material TIMBER = solid rectangle (t unused); area in mm². */
  stud: {B: number; H: number; t: number; label: string; material: 'STEEL' | 'TIMBER'; area: number; source: string | null};
  /** shape: RHS box, catalogue hot-rolled C (tw/tf), catalogue lipped C (t, lip) or the engine's idealised unlipped C. area in mm². */
  waler: {type: 'RHS' | 'C' | 'L' | 'CHS'; B: number; H: number; t: number; gap: number; label: string; spec: string; area: number; sectionId: string;
    shape: 'RHS' | 'C' | 'C_LIP' | 'C_PLAIN' | 'L' | 'CHS'; tw: number; tf: number; lip: number; source: string | null};
  tie: {d: number; label: string} | null;
  offsets: {stud: number; waler: number; outer: number; extension: number};
  levels: number[];
  faces: LayoutFace[];
  ties: LayoutTie[];
  bom: BomRow[];
  status: Result['status']; confirmed: boolean; pressure: number; volume: number; formArea: number;
  warnings: string[];
}

export const PLYWOOD_SHEET = {w: 1220, h: 2440};
const r1 = (v: number) => Math.round(v);

export function buildFormworkLayout(r: Result): FormworkLayout {
  const x = r.input, H = x.height, gap = x.tieDiameter + 6;
  const offsets = {stud: x.plywood, waler: x.plywood + x.rhsH, outer: x.plywood + x.rhsH + x.walerH, extension: x.plywood + x.rhsH + x.walerH};
  const levels = r.waler.levels.map(l => Math.min(Math.max(H - l.depth, gap / 2 + x.walerB), H - gap / 2 - x.walerB)).sort((a, b) => a - b);
  const throughTies = r.tieRoutes.length > 0;
  const ext = walerExtensions(r.points, offsets.extension, offsets.outer);
  const faces: LayoutFace[] = r.faces.map((f, i) => {
    const supports = r.waler.faces.find(w => w.faceId === f.id)?.supports ?? [];
    return {id: f.id, a: f.a, b: f.b, length: f.length, dir: {x: (f.b.x - f.a.x) / f.length, y: (f.b.y - f.a.y) / f.length}, normal: f.normal, extStart: ext[i].start, extEnd: ext[i].end,
      studs: equalPositions(f.length, x.studSpacing).map(s => f.length <= x.rhsB ? f.length / 2 : Math.min(Math.max(s, x.rhsB / 2), f.length - x.rhsB / 2)),
      ties: throughTies ? supports.filter(s => s.role === 'TIE').map(s => s.position) : []};
  });
  const ties: LayoutTie[] = [];
  const over = offsets.outer + 50;
  for (const t of r.tieRoutes) for (const [i, z] of levels.entries()) {
    const u = t.axis === 'Y' ? {x: 0, y: Math.sign(t.b.y - t.a.y)} : {x: Math.sign(t.b.x - t.a.x), y: 0};
    ties.push({id: `${t.id}-L${i + 1}`, axis: t.axis, position: t.coord, z, a: {x: t.a.x - u.x * over, y: t.a.y - u.y * over}, b: {x: t.b.x + u.x * over, y: t.b.y + u.y * over}, length: t.length + 2 * over});
  }
  const studCount = faces.reduce((n, f) => n + f.studs.length, 0);
  // Face grain across the (vertical) studs = sheets laid horizontally (long side along the face); parallel = sheets vertical.
  const sheet = x.plywoodFaceGrain === 'ACROSS' ? {w: PLYWOOD_SHEET.h, h: PLYWOOD_SHEET.w} : PLYWOOD_SHEET;
  const sheetsAcross = (len: number) => Math.ceil(len / sheet.w - 1e-9), sheetsUp = Math.ceil(H / sheet.h - 1e-9);
  const sheets = faces.reduce((n, f) => n + sheetsAcross(f.length) * sheetsUp, 0);
  const walerRows = new Map<number, number>();
  for (const f of faces) {const len = r1(f.length + f.extStart + f.extEnd); walerRows.set(len, (walerRows.get(len) ?? 0) + 2 * levels.length);}
  const tieRows = new Map<number, number>();
  for (const t of ties) tieRows.set(r1(t.length), (tieRows.get(r1(t.length)) ?? 0) + 1);
  const m = (mm: number) => (mm / 1000).toFixed(2) + ' m';
  const sc = x.studSectionId ? sectionById(x.studSectionId) ?? null : null;
  const stud = {B: x.rhsB, H: x.rhsH, t: x.rhsT, label: sc ? sc.designation : `RHS ${x.rhsB}×${x.rhsH}×${x.rhsT}`, material: (sc?.family === 'TIMBER' ? 'TIMBER' : 'STEEL') as 'STEEL' | 'TIMBER',
    area: sc ? sc.A_cm2 * 100 : x.rhsB * x.rhsH - (x.rhsB - 2 * x.rhsT) * (x.rhsH - 2 * x.rhsT), source: sc ? `${sc.source}${sc.ref ? ' · ' + sc.ref : ''}` : null};
  const cat = x.walerSectionId ? sectionById(x.walerSectionId) ?? null : null;
  const spec = cat ? cat.designation : `${x.walerType} ${x.walerB}×${x.walerH}×${x.walerT}`;
  const waler = {type: x.walerType, B: x.walerB, H: x.walerH, t: x.walerT, gap, label: `2-${spec}`, spec, area: r.waler.section.area, sectionId: x.walerSectionId,
    shape: (cat ? (cat.family === 'SHS' ? 'RHS' : cat.family) : x.walerType === 'RHS' ? 'RHS' : 'C_PLAIN') as FormworkLayout['waler']['shape'],
    tw: cat?.tw ?? x.walerT, tf: cat?.tf ?? x.walerT, lip: cat?.lip ?? 0, source: cat ? `${cat.source}${cat.url ? ' · ' + cat.url : ''}` : null};
  const bom: BomRow[] = [
    {group: 'A', item: 'ไม้อัดแบบหล่อ (Plywood)', spec: `หนา ${x.plywood} mm · แผ่น 1220×2440 วาง${x.plywoodFaceGrain === 'ACROSS' ? 'แนวนอน (ลายไม้ขวางคร่าว)' : 'แนวตั้ง'}`, unit: 'แผ่น', qty: sheets, cutLength: null,
      total: `${r.formArea.toFixed(2)} m² (พื้นที่ผิวแบบ)`, remark: `นับแผ่นเต็มต่อด้าน ${x.plywoodFaceGrain === 'ACROSS' ? 'วางแผ่นแนวนอน' : 'ตั้งแผ่นแนวดิ่ง'} ยังไม่หักเศษ/ใช้ซ้ำ`},
    {group: 'B', item: 'คร่าวตั้ง (Stud)', spec: stud.label + (sc && sc.family !== 'TIMBER' ? ` (${sc.source})` : stud.material === 'TIMBER' ? ` · ${timberGrade(x.studTimberGrade)?.label ?? ''}` : ''), unit: 'ท่อน', qty: studCount, cutLength: r1(H), total: m(studCount * H), remark: `ระยะไม่เกิน ${x.studSpacing} mm`},
    ...[...walerRows].sort((a, b) => b[0] - a[0]).map(([len, qty]) => ({group: 'C', item: 'คานคู่ (Twin waler)', spec: cat ? `${spec} (${cat.source})` : spec, unit: 'ท่อน', qty, cutLength: len,
      total: m(qty * len), remark: `${levels.length} ระดับ × 2 ตัว · ยื่นพ้นมุมนอก ${r1(offsets.extension)} mm${x.shape === 'L' ? ' · มุมเว้าหยุดก่อนมุม' : ''}`})),
    ...(throughTies ? [...tieRows].map(([len, qty]) => ({group: 'D', item: 'Tie rod ทะลุ', spec: `Ø${x.tieDiameter} ${x.tieGrade}`, unit: 'เส้น', qty, cutLength: len, total: m(qty * len),
      remark: 'ความยาวถึงหลังคานคู่ +50 mm ต่อปลาย; ต้องเพิ่มเกลียว/นอต/แผ่นรองตามผู้ผลิต'})) : []),
    ...(throughTies && ties.length ? [{group: 'E', item: 'แผ่นรอง + นอต (Plate & nut)', spec: 'ยังไม่กำหนดรุ่น', unit: 'ชุด', qty: ties.length * 2, cutLength: null, total: '—', remark: 'ต้องใช้รุ่นที่มี SWL รับรองร่วมกับ Tie'}] : []),
    ...(x.kind === 'COLUMN' ? [{group: 'E', item: 'จุดต่อมุมชุดรัดเสา (Corner yoke)', spec: 'ยังไม่กำหนดรุ่น', unit: 'จุด', qty: faces.length * levels.length, cutLength: null, total: '—',
      remark: `กำลังจุดต่อ Cx/Cy ${x.cornerCapacityX && x.cornerCapacityY ? `${x.cornerCapacityX}/${x.cornerCapacityY} kN` : 'ยังไม่ทราบ'}`}] : []),
    {group: 'F', item: 'ค้ำยัน / ยึดฐาน', spec: 'ยังไม่ออกแบบ', unit: '—', qty: null, cutLength: null, total: '—', remark: 'ชนิด ความยาว ระยะ และ Anchor ต้องออกแบบเพิ่ม'},
    {group: 'G', item: 'คอนกรีต (อ้างอิง)', spec: `γ = ${x.gamma} kN/m³`, unit: 'm³', qty: Math.round(r.volume * 100) / 100, cutLength: null, total: `${r.volume.toFixed(2)} m³`, remark: 'ปริมาตรภายในแบบ'},
  ];
  const warnings = [
    ...(x.shape === 'L' ? [throughTies ? 'มุมเว้ารูป L: Tie เป็นเส้นตรงแยกตามช่วง ยังไม่ได้ออกแบบรายละเอียดมุมและจุดต่อคานคู่' : 'มุมเว้ารูป L: ยังไม่ได้ออกแบบรายละเอียดมุม'] : []),
    ...(r.tieRoutes.some(t => t.axis === 'X') && r.tieRoutes.some(t => t.axis === 'Y') ? ['Tie แนว X และ Y อยู่ระดับเดียวกัน ต้องกำหนดระยะเยื้องระดับจริงก่อนติดตั้ง'] : []),
    ...(x.kind === 'COLUMN' ? ['ชุดรัดเสา: จุดต่อมุมและเสถียรภาพยังไม่ได้ตรวจ'] : []),
  ];
  return {kind: x.kind, shape: x.shape, points: r.points, width: x.width, length: x.length, height: H, armX: x.armX, armY: x.armY,
    plywood: {t: x.plywood, sheetW: sheet.w, sheetH: sheet.h}, stud, waler, tie: throughTies ? {d: x.tieDiameter, label: `Ø${x.tieDiameter} ${x.tieGrade}`} : null,
    offsets, levels, faces, ties, bom, status: r.status, confirmed: x.confirmed, pressure: r.pressure, volume: r.volume, formArea: r.formArea, warnings};
}
