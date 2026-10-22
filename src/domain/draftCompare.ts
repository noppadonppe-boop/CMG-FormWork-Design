import {calculate, type Input} from './index.js';
import {calculateWall, type WallInput} from './wall.js';
import type {BeamInput} from './beam.js';
import type {SlabInput} from './slab.js';
import type {WorkflowModel} from './workflowV07/model.js';
import type {ElementType} from './workflowV07/common.js';

/** One layout row compared between the page (practical/legacy input, also edited by the 3D model) and the v0.7 draft. */
export interface LayoutCompareRow {label: string; page: number | string | null; draft: number | string | null; simplified?: boolean}

const count = (length: number, spacing: number) => spacing > 0 ? Math.ceil(length / spacing - 1e-9) + 1 : null;
const sectionOf = (s: {evidenceRef: string; binding?: unknown} | undefined) => {
  if (!s) return null;
  const b = s.binding as {section?: {effective?: Record<string, unknown>} | null} | null | undefined;
  return String(b?.section?.effective?.section_id ?? s.evidenceRef.split(' · ')[0]);
};
const attempt = <T,>(f: () => T) => {try {return f();} catch {return null;}};

/**
 * Rows for the layout page. Counts that the detailed v0.7 model reduces to fit its size limits (waler levels, shore grid,
 * slab bearer lines) are flagged as simplified instead of as a conflict.
 */
export function layoutCompare(element: ElementType, data: {input: Input; beam: BeamInput; slab: SlabInput; wall: WallInput}, m: WorkflowModel): LayoutCompareRow[] {
  const rows: LayoutCompareRow[] = [], face = m.sideLayout?.faces[0], soffit = m.soffitLayout;
  const studLen = face?.studPositionsMm.at(-1) ?? 0, joistLen = soffit?.joistXMm.at(-1) ?? 0;
  const side = element === 'WALL' ? {ply: data.wall.plywood, stud: data.wall.studSpacing, studId: data.wall.studSectionId, railId: data.wall.walerSectionId, tieD: data.wall.system === 'TWO_SIDED' ? data.wall.tieDiameter : null,
      levels: attempt(() => calculateWall(data.wall).levels.length)}
    : element === 'BEAM' ? {ply: data.beam.plywood, stud: data.beam.studSpacing, studId: data.beam.studSectionId, railId: data.beam.tieRows > 0 ? data.beam.walerSectionId : null, tieD: data.beam.tieRows > 0 ? data.beam.tieDiameter : null, levels: data.beam.tieRows}
    : element === 'SLAB' ? null
    : {ply: data.input.plywood, stud: data.input.studSpacing, studId: data.input.studSectionId || null, railId: data.input.walerSectionId || null, tieD: element === 'FOOTING' || data.input.columnTies ? data.input.tieDiameter : null,
      levels: attempt(() => calculate(data.input).waler.levels.length)};
  if (side && face) {
    rows.push({label: 'ความหนาไม้อัด (mm)', page: side.ply, draft: face.plywood.thicknessMm});
    rows.push({label: 'จำนวนคร่าวต่อด้าน (ด้านแรก)', page: count(studLen, side.stud), draft: face.studPositionsMm.length});
    rows.push({label: 'หน้าตัดคร่าว', page: side.studId, draft: sectionOf(face.stud)});
    if (side.railId) rows.push({label: 'หน้าตัดคานคู่', page: side.railId, draft: sectionOf(face.rail)});
    if (side.levels !== null) rows.push({label: 'จำนวนระดับคานคู่', page: side.levels, draft: face.walers.length, simplified: side.levels !== face.walers.length});
    if (side.tieD !== null) rows.push({label: 'Tie Ø (mm)', page: side.tieD, draft: m.sideLayout?.ties[0]?.diameterMm ?? null});
  }
  const deck = element === 'BEAM' ? {ply: data.beam.plywood, joist: data.beam.joistSpacing, joistId: data.beam.joistSectionId, bearerId: data.beam.bearerSectionId, shore: data.beam.shoreSpacing, bearerLines: null}
    : element === 'SLAB' ? {ply: data.slab.plywood, joist: data.slab.joistSpacing, joistId: data.slab.joistSectionId, bearerId: data.slab.bearerSectionId, shore: data.slab.shoreSpacing, bearerLines: data.slab.bearerSpacing}
    : null;
  if (deck && soffit) {
    if (!side) rows.push({label: 'ความหนาไม้อัด (mm)', page: deck.ply, draft: soffit.plywood?.thicknessMm ?? null});
    rows.push({label: 'จำนวนคร่าวท้อง', page: count(joistLen, deck.joist), draft: soffit.joistXMm.length});
    rows.push({label: 'หน้าตัดคร่าวท้อง', page: deck.joistId, draft: sectionOf(soffit.joist)});
    rows.push({label: 'หน้าตัดคานรับ', page: deck.bearerId, draft: sectionOf(soffit.bearer)});
    const heads = soffit.bearers[0]?.headsXMm ?? [], headLen = Math.max(...heads) - Math.min(...heads);
    const shores = count(headLen, deck.shore);
    rows.push({label: 'จำนวนค้ำยันต่อแนว', page: shores, draft: heads.length, simplified: shores !== heads.length});
    if (deck.bearerLines) {
      const ys = soffit.bearers.map(b => b.yMm), lines = count(Math.max(...ys) - Math.min(...ys), deck.bearerLines);
      rows.push({label: 'จำนวนแนวคานรับ', page: lines, draft: ys.length, simplified: lines !== ys.length});
    }
  }
  return rows;
}
/** True when the row agrees (numbers within 0.5, strings equal). */
export const rowMatches = (r: LayoutCompareRow) => r.page !== null && r.draft !== null && (typeof r.page === 'number' && typeof r.draft === 'number' ? Math.abs(r.page - r.draft) <= 0.5 : String(r.page) === String(r.draft));
