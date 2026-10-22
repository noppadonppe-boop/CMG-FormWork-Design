/** Project order list: the quantities of every Design Case added up by plywood sheet, member section (cut lengths packed
 * into stock bars) and hardware item, so one list goes to purchasing. Quantities come from each engine's own take-off. */
import {calculate, type Input} from './index.js';
import {buildFormworkLayout} from './formworkLayout.js';
import {beamFromCase, calculateBeam, type BeamInput} from './beam.js';
import {calculateSlab, slabFromCase, type SlabInput} from './slab.js';
import {calculateWall, wallFromCase, type WallInput} from './wall.js';
import {PLYWOOD_GRADE_LABEL} from './plywoodGrades.js';
import {sectionById} from './sectionStock.js';
import type {ElementType} from './workflowV07/common.js';

export type OrderCategory = 'PLYWOOD' | 'MEMBER' | 'HARDWARE';
/** One take-off line of one case: plywood sheets, linear members (with cut length) or hardware items. */
export interface OrderLine {category: OrderCategory; key: string; label: string; unit: string; qty: number; length?: number}
/** How many identical elements the case stands for, and how many pours one formwork set serves. */
export interface CaseOrder {count: number; reuse: number}
export const defaultOrder: CaseOrder = {count: 1, reuse: 1};
export function parseOrder(raw: unknown): CaseOrder | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const {count, reuse} = raw as Record<string, unknown>;
  return [count, reuse].every(v => typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 1000) ? {count: count as number, reuse: reuse as number} : undefined;
}
/** Formwork sets to buy for a case: ceil(count / reuse). */
export const setsFor = (o: CaseOrder) => Math.ceil(o.count / o.reuse);

export interface OrderCase {name: string; input: Input; workflowElementType?: ElementType; beam?: BeamInput; slab?: SlabInput; wall?: WallInput; order?: CaseOrder}
const plywoodLine = (t: number, grade: keyof typeof PLYWOOD_GRADE_LABEL, qty: number): OrderLine =>
  ({category: 'PLYWOOD', key: `ply|${t}|${grade}`, label: `ไม้อัด ${t} mm · ${PLYWOOD_GRADE_LABEL[grade]}`, unit: 'แผ่น', qty});
const memberLine = (section: string, qty: number, length: number): OrderLine => ({category: 'MEMBER', key: `mem|${section}`, label: section, unit: 'ท่อน', qty, length: Math.round(length)});
const hardwareLine = (item: string, spec: string, unit: string, qty: number): OrderLine => ({category: 'HARDWARE', key: `hw|${item}|${spec}|${unit}`, label: `${item} · ${spec}`, unit, qty});

/** Take-off lines of one formwork set of the case (throws when the case cannot be calculated). */
export function caseOrderLines(z: OrderCase): OrderLine[] {
  const kind = z.workflowElementType ?? z.input.kind, fp = {width: z.input.width, length: z.input.length, height: z.input.height};
  if (kind === 'BEAM' || kind === 'SLAB' || kind === 'WALL') {
    const r = kind === 'BEAM' ? calculateBeam(z.beam ?? beamFromCase(null, fp)) : kind === 'SLAB' ? calculateSlab(z.slab ?? slabFromCase(null, fp)) : calculateWall(z.wall ?? wallFromCase(null, fp));
    const x = r.input;
    return r.quantities.flatMap((q): OrderLine[] => q.qty <= 0 ? [] : q.unit === 'แผ่น' ? [plywoodLine(x.plywood, x.plywoodGrade, q.qty)]
      : q.section && q.length ? [memberLine(q.section, q.qty, q.length)] : [hardwareLine(q.item, q.spec, q.unit, q.qty)]);
  }
  const r = calculate(z.input), L = buildFormworkLayout(r);
  return L.bom.flatMap((b): OrderLine[] => {
    if (b.qty === null || b.qty <= 0 || b.unit === 'm³') return [];
    if (b.unit === 'แผ่น') return [plywoodLine(r.input.plywood, r.input.plywoodGrade, b.qty)];
    if (b.group === 'B' && b.cutLength) return [memberLine(L.stud.label, b.qty, b.cutLength)];
    if (b.group === 'C' && b.cutLength) return [memberLine(L.waler.sectionId ? sectionById(L.waler.sectionId)?.designation ?? L.waler.spec : L.waler.spec, b.qty, b.cutLength)];
    return [hardwareLine(b.item, b.cutLength ? `${b.spec} · ยาว ${Math.round(b.cutLength)} mm` : b.spec, b.unit, b.qty)];
  });
}

export interface OrderRow {category: OrderCategory; key: string; label: string; unit: string; qty: number;
  /** Members: total length (m), pieces per cut length, stock bars needed. */
  totalLength?: number; cuts?: {length: number; qty: number}[]; bars?: number; cases: string[]}
/** Stock bars for pieces of one cut length: whole pieces per bar, or spliced bars when a piece is longer than the stock. */
export function barsFor(length: number, qty: number, stock: number) {
  if (length <= stock) return Math.ceil(qty / Math.floor(stock / length));
  return qty * Math.ceil(length / stock);
}
/** Adds up all cases (each multiplied by its formwork sets). Cases that cannot be calculated are reported, not guessed. */
export function projectOrder(cases: OrderCase[], stock = 6000): {rows: OrderRow[]; errors: string[]} {
  const rows = new Map<string, OrderRow>(), errors: string[] = [];
  for (const z of cases) {
    let lines: OrderLine[];
    try {lines = caseOrderLines(z);} catch (e) {errors.push(`${z.name}: ${(e as Error).message}`); continue;}
    const sets = setsFor(z.order ?? defaultOrder);
    for (const l of lines) {
      const row = rows.get(l.key) ?? {category: l.category, key: l.key, label: l.label, unit: l.unit, qty: 0, cases: [], ...(l.category === 'MEMBER' ? {cuts: [], totalLength: 0, bars: 0} : {})};
      row.qty += l.qty * sets;
      if (!row.cases.includes(z.name)) row.cases.push(z.name);
      if (l.length && row.cuts) {
        const cut = row.cuts.find(c => c.length === l.length);
        if (cut) cut.qty += l.qty * sets; else row.cuts.push({length: l.length, qty: l.qty * sets});
      }
      rows.set(l.key, row);
    }
  }
  for (const row of rows.values()) if (row.cuts) {
    row.cuts.sort((a, b) => b.length - a.length);
    row.totalLength = row.cuts.reduce((n, c) => n + c.length * c.qty, 0) / 1000;
    row.bars = row.cuts.reduce((n, c) => n + barsFor(c.length, c.qty, stock), 0);
  }
  const order: OrderCategory[] = ['PLYWOOD', 'MEMBER', 'HARDWARE'];
  return {rows: [...rows.values()].sort((a, b) => order.indexOf(a.category) - order.indexOf(b.category) || a.label.localeCompare(b.label)), errors};
}

/** CSV for spreadsheets (UTF-8 with BOM so Excel reads Thai). */
export function orderCsv(rows: OrderRow[], stock: number) {
  const q = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const head = ['หมวด', 'รายการ', 'หน่วย', 'จำนวน', 'ความยาวรวม (m)', `ท่อนยาว ${stock} mm ที่ต้องสั่ง`, 'ความยาวตัด (mm × จำนวน)', 'ใช้ใน Design Case'];
  const cat = {PLYWOOD: 'ไม้อัด', MEMBER: 'คร่าว/คาน', HARDWARE: 'อุปกรณ์'} as const;
  const body = rows.map(r => [cat[r.category], r.label, r.unit, r.qty, r.totalLength?.toFixed(2) ?? '', r.bars ?? '', r.cuts?.map(c => `${c.length}×${c.qty}`).join(' ') ?? '', r.cases.join(', ')]);
  return '﻿' + [head, ...body].map(line => line.map(q).join(',')).join('\r\n');
}
