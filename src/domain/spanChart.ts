/** Span charts of a project kit: the largest spacings (in kit steps) that keep every member within the screening limits,
 * by fresh-concrete pressure (wall / column / footing side forms) and by slab thickness (soffit). Same member formulas as the
 * wall and slab engines (uniform load, simple spans, APA V345 plywood). Screening only: never a release. */
import {plywoodDesign} from './plywoodGrades.js';
import {checker, liveMinimums, material, plywoodOptions} from './members.js';
import {wallDefaults} from './wall.js';
import {slabDefaults} from './slab.js';
import {sectionById} from './sectionStock.js';
import type {ProjectKit} from './projectKit.js';

/** Steel values the kit does not own: the engines' defaults (cases may differ). */
const STEEL = {steelFy: wallDefaults.steelFy, steelE: wallDefaults.steelE, steelOmegaB: wallDefaults.steelOmegaB, steelOmegaShear: wallDefaults.steelOmegaShear};
/** Equal-span interior reaction envelope used for continuous joists/bearers in the soffit chart (2 equal spans). */
export const CHART_CONTINUITY = 1.25;

const desc = (max: number, min: number, step: number) => {const out: number[] = []; for (let v = Math.floor(max / step) * step; v >= min; v -= step) out.push(v); return out;};
const within = (checks: {demand: number | null; limit: number | null}[]) => checks.every(c => c.demand === null || c.limit === null || c.demand <= c.limit + 1e-9);

function plywoodOk(k: ProjectKit, pressure: number, spacing: number) {
  const studB = sectionById(k.studSectionId)!.B;
  return within(plywoodDesign({...plywoodOptions({...k, plywoodSpans: 'AUTO'}), pressure, spacing, studWidth: studB}).checks);
}
function memberOk(k: ProjectKit, id: string, count: number, w: number, L: number) {
  const {checks, uniform} = checker(k.deflectionRatio);
  uniform('m', '', material(id, {...STEEL, timberGrade: k.timberGrade}), count, w, L, '');
  return within(checks);
}
const largest = (seq: number[], ok: (v: number) => boolean) => seq.find(ok) ?? null;

export interface WallChartRow {pressure: number; stud: number | null; waler: number | null; tie: number | null; tieLimit: string}
/** Side forms (wall, column, footing): stud spacing (plywood), waler spacing (stud span) and tie spacing (twin waler span and tie) per pressure. */
export function sideSpanChart(k: ProjectKit, pressures = [20, 30, 40, 50, 60, 70, 80]): WallChartRow[] {
  const Ag = Math.PI * k.tieDiameter ** 2 / 4, limits = [k.tieFy * Ag / wallDefaults.tieOmega / 1000, k.tieFu * Ag / 2 / 1000, ...(k.tieSWL > 0 ? [k.tieSWL] : [])], T = Math.min(...limits);
  const tieLimit = `${T.toFixed(1)} kN (${k.tieSWL > 0 ? 'รวม SWL ชุด Tie' : 'ตัวเหล็กเท่านั้น ยังไม่มี SWL ชุด Tie'})`;
  return pressures.map(p => {
    const stud = largest(desc(600, 100, k.spacingStep), s => plywoodOk(k, p, s));
    const waler = stud === null ? null : largest(desc(1500, 100, k.spacingStep), L => memberOk(k, k.studSectionId, 1, p / 1000 * stud, L));
    const tie = waler === null ? null : largest(desc(1500, 100, k.spacingStep), L => memberOk(k, k.walerSectionId, 2, p / 1000 * waler, L) && p * waler * L / 1e6 <= T + 1e-9);
    return {pressure: p, stud, waler, tie, tieLimit};
  });
}

export interface SlabChartRow {thickness: number; q: number; joist: number | null; bearer: number | null; shore: number | null; shoreLimited: boolean}
/** Slab soffit: joist spacing (plywood), bearer spacing (joist span) and shore spacing (bearer span and shore SWL) per thickness. */
export function slabSpanChart(k: ProjectKit, thicknesses = [100, 120, 150, 200, 250, 300]): SlabChartRow[] {
  const {liveMin, totalMin} = liveMinimums(false), k2 = CHART_CONTINUITY;
  const swl = k.shoreTable.length ? Math.min(...k.shoreTable.map(r => r.swl)) : k.shoreSWL;
  return thicknesses.map(t => {
    const q = Math.max(k.gamma * t / 1000 + slabDefaults.formDead + Math.max(k.liveLoad, liveMin), totalMin);
    const joist = largest(desc(600, 100, k.spacingStep), s => plywoodOk(k, q, s));
    const bearer = joist === null ? null : largest(desc(2000, 300, k.spacingStep), L => memberOk(k, k.studSectionId, 1, q / 1000 * joist, L));
    const shore = bearer === null ? null : largest(desc(2000, 300, k.spacingStep), L => memberOk(k, k.bearerSectionId, 1, k2 * q / 1000 * bearer, L) && (!(swl > 0) || k2 * k2 * q * bearer * L / 1e6 <= swl + 1e-9));
    return {thickness: t, q, joist, bearer, shore, shoreLimited: swl > 0};
  });
}
