import {calculate, usesTies, type Check, type Input, type Result} from './index.js';
import {buildFormworkLayout, type FormworkLayout} from './formworkLayout.js';
import {WALER_TYPE, catalogueProperties, sectionById, type StockSection} from './sectionStock.js';
import {sectionProperties} from './mechanics.js';

/**
 * Part 2 layout optimizer for footing/column screening.
 * Searches plywood thickness and stud / waler / tie spacing (+ tie body Ø) so that no screening check exceeds the target ratio.
 * It only changes layout parameters; sections, materials and certified capacities are never invented.
 * A result without FAIL is still INCOMPLETE: missing certified data and unchecked limit states remain blockers.
 */
export const PLYWOOD_THICKNESSES = [12, 15, 18, 20, 25];
export const TIE_DIAMETERS = [12, 16, 20, 25, 28, 32];
const GROUPS = {
  plywood: (id: string) => id.startsWith('ply-'),
  stud: (id: string) => id.startsWith('stud-'),
  waler: (id: string) => id.startsWith('waler-'),
  tie: (id: string) => id.startsWith('tie'),
  column: (id: string) => id.startsWith('column-'),
};
type Group = keyof typeof GROUPS;
export type LayoutChanges = Pick<Input, 'plywood' | 'studSpacing' | 'walerSpacing' | 'tieSpacing' | 'tieDiameter' | 'rhsB' | 'rhsH' | 'rhsT' | 'walerType' | 'walerB' | 'walerH' | 'walerT' | 'walerSectionId' | 'studSectionId'>;
export interface OptimizeOption {label: string; input: Input; changes: Partial<LayoutChanges>; result: Result; maxRatio: number; governing: string;
  pieces: number; steelKg: number; quantities: {studs: number; walers: number; ties: number; plywoodSheets: number}; passes: boolean;
  studSection: string; walerSection: string}
export interface Advice {checkId: string; label: string; ratio: number; text: string}
/** Project kit lock: sections, plywood and tie Ø stay as the kit; only spacings change, in multiples of `step` (mm). */
export interface KitLock {step: number}
export const KIT_SHORT = 'ชุดมาตรฐานโครงการไม่พอที่ระยะต่ำสุด: ใช้ชุดงานหนัก หรือบันทึกเหตุผลใช้นอกชุดมาตรฐาน';
/** Compact, recalculated optimizer summary for AI context (chat / MCP). */
export function optimizerBrief(x: Input, stock: StockSection[], target = 1, limit = 3) {
  const round = (v: number) => Math.round(v * 1000) / 1000;
  return {target, advice: adviseLayout(x, target, stock).map(a => ({check: a.checkId, ratio: round(a.ratio), fix: a.text})),
    options: optimizeLayout(x, target, stock).slice(0, limit).map(o => ({label: o.label, changes: o.changes, maxRatio: round(o.maxRatio), governing: o.governing,
      steelKg: o.steelKg, studSection: o.studSection, walerSection: o.walerSection, quantities: o.quantities}))};
}
/** Candidate member section with the properties the engine will use (catalogue channels keep published values). */
type Sec = {B: number; H: number; t: number; label: string; id: string; family: string; I: number; A: number};

const desc = (from: number, to: number, step: number) => {const out: number[] = []; for (let v = Math.floor(from / step) * step; v >= to; v -= step) out.push(v); return out;};
function tryCalc(x: Input): Result | null {try {return calculate(x);} catch {return null;}}
const over = (c: Check, target: number) => c.utilization !== null && c.utilization > target + 1e-9;
function ok(r: Result | null, groups: Group[], target: number) {return !!r && !r.checks.some(c => groups.some(g => GROUPS[g](c.id)) && over(c, target));}
const maxRatio = (r: Result) => r.checks.reduce((m, c) => Math.max(m, c.utilization ?? 0), 0);
const governing = (r: Result) => r.checks.reduce<Check | null>((g, c) => (c.utilization ?? -1) > (g?.utilization ?? -1) ? c : g, null)?.label ?? '—';
const ranges = (x: Input) => {const span = Math.max(x.width, x.length); return {stud: Math.min(600, span), waler: Math.min(1200, x.height), tie: Math.min(1500, span)};};
const area = (s: {B: number; H: number; t: number}) => s.B * s.H - (s.B - 2 * s.t) * (s.H - 2 * s.t);
const STEEL = 7.85e-6; // kg/mm³
/** Gross steel mass of studs (steel only), walers and tie rods (kg), from the layout BOM geometry. */
export function steelMass(L: FormworkLayout) {
  const stud = L.stud.material === 'TIMBER' ? 0 : L.faces.reduce((n, f) => n + f.studs.length, 0) * L.height * L.stud.area;
  const walerSec = L.waler.area;
  const waler = L.faces.reduce((n, f) => n + (f.length + f.extStart + f.extEnd) * 2 * L.levels.length, 0) * walerSec;
  const tie = L.tie ? L.ties.reduce((n, t) => n + t.length, 0) * Math.PI * L.tie.d ** 2 / 4 : 0;
  return (stud + waler + tie) * STEEL;
}

/** Largest value in a descending sequence that satisfies the groups, holding other parameters. */
function largest(x: Input, key: 'studSpacing' | 'walerSpacing' | 'tieSpacing', seq: number[], groups: Group[], target: number) {
  for (const v of seq) {const r = tryCalc({...x, [key]: v}); if (ok(r, groups, target)) return v;}
  return null;
}
function smallestTie(x: Input, target: number) {
  for (const d of TIE_DIAMETERS) {const r = tryCalc({...x, tieDiameter: d}); if (ok(r, ['tie'], target)) return d;}
  return null;
}
const throughTies = (x: Input) => usesTies(x);
const withStud = (x: Input, s: Sec): Input => s.label === 'เดิม' ? x : {...x, studSectionId: s.id, rhsB: s.B, rhsH: s.H, ...(s.family === 'TIMBER' ? {} : {rhsT: s.t})};
const withWaler = (x: Input, s: Sec): Input => s.label === 'เดิม' ? x
  : {...x, walerType: WALER_TYPE[s.family as keyof typeof WALER_TYPE], walerSectionId: s.id, walerB: s.B, walerH: s.H, walerT: s.t};
const fromStock = (s: StockSection): Sec => {const p = catalogueProperties(s); return {B: s.B, H: s.H, t: s.t, label: s.designation, id: s.id, family: s.family, I: p.I, A: p.area};};
const currentStud = (x: Input): Sec => {const c = x.studSectionId ? sectionById(x.studSectionId) : undefined, p = c ? catalogueProperties(c) : sectionProperties('RHS', x.rhsB, x.rhsH, x.rhsT);
  return {B: x.rhsB, H: x.rhsH, t: x.rhsT, label: 'เดิม', id: x.studSectionId, family: c?.family ?? 'RHS', I: p.I, A: p.area};};
const currentWaler = (x: Input): Sec => {const c = x.walerSectionId ? sectionById(x.walerSectionId) : undefined, p = c ? catalogueProperties(c) : sectionProperties(x.walerType === 'C' ? 'C' : 'RHS', x.walerB, x.walerH, x.walerT);
  return {B: x.walerB, H: x.walerH, t: x.walerT, label: 'เดิม', id: x.walerSectionId, family: c?.family ?? x.walerType, I: p.I, A: p.area};};
/**
 * Current section first, then stock sections for the role that are at least as stiff (upgrades only), light to heavy.
 * Studs stay in their material (timber ↔ timber, steel ↔ steel boxes); walers may use any waler family in the stock.
 */
const sections = (stock: StockSection[], current: Sec, role: 'stud' | 'waler') => [current, ...stock.filter(s => s.roles.includes(role) && s.id !== current.id
    && (role === 'waler' || (s.family === 'TIMBER') === (current.family === 'TIMBER')))
  .map(fromStock).filter(s => s.I >= current.I - 1e-6).sort((a, b) => a.A - b.A)];

/** Waler stage for one waler section: largest waler/tie spacing (and smallest tie Ø) that keeps waler/tie/column checks within target. */
function walerStage(x: Input, wMax: number, target: number, lock?: KitLock): Input | null {
  const step = lock?.step ?? 50, walers = desc(Math.min(ranges(x).waler, wMax), 200, step), R = ranges(x);
  if (throughTies(x)) {
    if (!ok(tryCalc({...x, walerSpacing: 200, tieSpacing: 200}), ['waler'], target)) return null;
    for (const ws of walers) for (const t of desc(R.tie, 200, step)) {
      const trial = {...x, walerSpacing: ws, tieSpacing: t};
      if (!ok(tryCalc(trial), ['waler'], target)) continue;
      const d = lock ? trial.tieDiameter : smallestTie(trial, target);
      if (d !== null && ok(tryCalc({...trial, tieDiameter: d}), ['tie', 'column'], target)) return {...trial, tieDiameter: d};
    }
    return null;
  }
  if (!ok(tryCalc({...x, walerSpacing: 200}), ['waler', 'column'], target)) return null;
  for (const ws of walers) {const trial = {...x, walerSpacing: ws}; if (ok(tryCalc(trial), ['waler', 'column', 'tie'], target)) return trial;}
  return null;
}

function solveFor(base: Input, plywood: number, target: number, stock: StockSection[], lock?: KitLock): Input | null {
  if (lock) stock = [];
  const R = ranges(base), walers = desc(R.waler, 200, lock?.step ?? 50);
  let x: Input = {...base, plywood};
  const s = largest(x, 'studSpacing', desc(R.stud, 100, lock?.step ?? 25), ['plywood'], target); if (s === null) return null;
  x = {...x, studSpacing: s};
  // Stud and waler sections: try the current section, then stock from light to heavy; a heavier member that allows wider
  // spacing can be lighter overall, so up to STUD_TRIES × WALER_TRIES feasible combinations are compared by steel mass.
  let best: {input: Input; kg: number} | null = null, studs = 0;
  for (const sec of sections(stock, currentStud(base), 'stud')) {
    if (studs >= STUD_TRIES) break;
    const trial = withStud(x, sec);
    if (!ok(tryCalc({...trial, walerSpacing: 200}), ['stud'], target)) continue;
    const w = largest(trial, 'walerSpacing', walers, ['stud'], target); if (w === null) continue;
    studs++;
    let walerFound = 0;
    for (const ws of sections(stock, currentWaler(base), 'waler')) {
      if (walerFound >= WALER_TRIES) break;
      const solved = walerStage(withWaler({...trial, walerSpacing: w}, ws), w, target, lock); if (!solved) continue;
      walerFound++;
      const kg = steelMass(buildFormworkLayout(calculate(solved)));
      if (!best || kg < best.kg - 1e-6) best = {input: solved, kg};
    }
  }
  return best?.input ?? null;
}
const STUD_TRIES = 3, WALER_TRIES = 5;

const label = (x: {B: number; H: number; t: number}, type = 'RHS') => `${type} ${x.H}×${x.B}×${x.t}`;
function option(name: string, base: Input, input: Input): OptimizeOption {
  const result = calculate(input), L = buildFormworkLayout(result), q = (p: string) => L.bom.filter(b => b.item.startsWith(p)).reduce((n, b) => n + (b.qty ?? 0), 0);
  const quantities = {studs: q('คร่าว'), walers: q('คานคู่'), ties: q('Tie rod'), plywoodSheets: q('ไม้อัด')};
  const keys: (keyof LayoutChanges)[] = ['plywood', 'studSpacing', 'walerSpacing', 'tieSpacing', 'tieDiameter', 'rhsB', 'rhsH', 'rhsT', 'walerType', 'walerB', 'walerH', 'walerT', 'walerSectionId', 'studSectionId'];
  return {label: name, input, result, maxRatio: maxRatio(result), governing: governing(result), quantities, pieces: quantities.studs + quantities.walers + quantities.ties,
    steelKg: Math.round(steelMass(L)), passes: !result.checks.some(c => c.status === 'FAIL'),
    studSection: input.studSectionId ? sectionById(input.studSectionId)!.designation : label({B: input.rhsB, H: input.rhsH, t: input.rhsT}), walerSection: '2-' + (input.walerSectionId ? sectionById(input.walerSectionId)!.designation : label({B: input.walerB, H: input.walerH, t: input.walerT}, input.walerType)),
    changes: Object.fromEntries(keys.filter(k => input[k] !== base[k]).map(k => [k, input[k]])) as Partial<LayoutChanges>};
}

/** The values the user has chosen (layout page, section picker or 3D model), evaluated exactly like an optimizer alternative. */
export function currentOption(input: Input): OptimizeOption {return option('ค่าที่เลือกอยู่', input, input);}

/**
 * Feasible layouts (one per plywood thickness), lightest estimated steel first.
 * `stock` lists the sections the company can supply; when empty only spacing/plywood/tie Ø change and sections stay as entered.
 */
export function optimizeLayout(base: Input, target = 1, stock: StockSection[] = [], lock?: KitLock): OptimizeOption[] {
  const found = (lock ? [base.plywood] : PLYWOOD_THICKNESSES).flatMap(t => {const x = solveFor(base, t, target, stock, lock); return x ? [option(lock ? `ชุดมาตรฐาน · ไม้อัด ${t} mm` : `ไม้อัด ${t} mm`, base, x)] : [];});
  return found.sort((a, b) => a.steelKg - b.steelKg || a.pieces - b.pieces || a.input.plywood - b.input.plywood)
    .map((o, i) => ({...o, label: (i === 0 ? 'แนะนำ · เหล็กเบาที่สุด · ' : '') + o.label}));
}

const either = (...parts: (string | null | undefined | false)[]) => parts.filter(Boolean).join(' หรือ ');
/** Plain-language fixes for each check above the target, computed from the current input one parameter at a time. */
export function adviseLayout(x: Input, target = 1, stock: StockSection[] = [], lock?: KitLock): Advice[] {
  const r = tryCalc(x); if (!r) return [];
  if (lock) stock = [];
  const st = (def: number) => lock?.step ?? def;
  const R = ranges(x), fmt = (v: number | null, unit = 'mm') => v === null ? null : `${v} ${unit}`;
  const lightest = (apply: (s: Sec) => Input, groups: Group[], cur: Sec, role: 'stud' | 'waler') => sections(stock, cur, role).slice(1).find(s => ok(tryCalc(apply(s)), groups, target))?.label;
  return r.checks.filter(c => over(c, target)).map(c => {
    let text: string;
    if (GROUPS.plywood(c.id)) {
      const s = fmt(largest(x, 'studSpacing', desc(Math.min(R.stud, x.studSpacing), 100, st(25)), ['plywood'], target));
      const t = lock ? undefined : PLYWOOD_THICKNESSES.find(t => ok(tryCalc({...x, plywood: t}), ['plywood'], target));
      text = either(s && `ลดระยะคร่าวเป็น ≤ ${s} (ไม้อัด ${x.plywood} mm เดิม)`, t !== undefined && `ใช้ไม้อัด ≥ ${t} mm ที่ระยะคร่าวเดิม`) || (lock ? KIT_SHORT : 'ต้องใช้ไม้อัดที่แข็งแรงกว่า หรือระยะคร่าวน้อยกว่า 100 mm');
    } else if (GROUPS.stud(c.id)) {
      const w = fmt(largest(x, 'walerSpacing', desc(Math.min(R.waler, x.walerSpacing), 200, st(50)), ['stud'], target));
      const sec = lightest(s => withStud(x, s), ['stud'], currentStud(x), 'stud');
      text = either(w && `ลดระยะคานคู่ (ช่วงพาดคร่าว) เป็น ≤ ${w}`, sec && `เปลี่ยนคร่าวเป็น ${sec} ที่ระยะเดิม`) || (lock ? KIT_SHORT : 'เพิ่มขนาดหน้าตัดคร่าว (ไม่มีหน้าตัดในคลังที่พอ)');
    } else if (GROUPS.waler(c.id)) {
      const t = throughTies(x) ? fmt(largest(x, 'tieSpacing', desc(Math.min(R.tie, x.tieSpacing), 200, st(50)), ['waler'], target)) : null;
      const sec = lightest(s => withWaler(x, s), ['waler'], currentWaler(x), 'waler');
      text = either(t && `ลดระยะ Tie เป็น ≤ ${t}`, sec && `เปลี่ยนคานคู่เป็น 2-${sec}`)
        || (lock ? KIT_SHORT : throughTies(x) ? 'เพิ่มขนาดคานคู่ หรือลดระยะคร่าว/คานคู่' : 'เสาไม่มี Tie ทะลุ: เพิ่มขนาดคานคู่ หรือลดระยะคานคู่');
    } else if (c.id === 'tie') {
      const d = lock ? null : smallestTie(x, target);
      text = d ? `เพิ่มขนาด Tie เป็น Ø${d} mm หรือลดระยะ Tie/คานคู่` : lock ? `ลดระยะ Tie หรือคานคู่ (ทวีคูณ ${lock.step} mm) · Tie Ø${x.tieDiameter} ตามชุดมาตรฐาน` : 'ลดระยะ Tie หรือคานคู่ (ขนาด Tie ในรายการไม่พอ)';
    } else text = 'ลดระยะ Tie/คานคู่ หรือใช้อุปกรณ์ที่มีกำลังรับรองสูงขึ้น (ต้องใช้ค่าจากผู้ผลิต)';
    return {checkId: c.id, label: c.label, ratio: c.utilization ?? 0, text};
  });
}
