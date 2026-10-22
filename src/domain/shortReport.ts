/** Short calculation report ("รายการคำนวณแบบย่อ"): per member, the governing check (highest demand/limit ratio) and a
 * textbook-style derivation (formula → substitution → result) taken from the engine's own checks. Never changes a status:
 * a check without a limit stays "ยังไม่ครบ", nothing becomes PASS. Layout follows หนังสือ Design Form Work ตัวอย่างที่ 6.1. */
import type {Check, Result} from './index.js';
import {usesTies} from './index.js';
import type {MemberMaterial} from './members.js';
import type {PlywoodDesign} from './plywoodGrades.js';
import type {SlabResult} from './slab.js';
import type {BeamResult} from './beam.js';
import type {WallResult} from './wall.js';
import type {PressureModel} from './pressure.js';
import {sectionById, timberGrade} from './sectionStock.js';

/** One line of a derivation: label, operator (default "=") and expression, as in the textbook. */
export interface EqRow {label?: string; op?: string; expr: string; strong?: boolean; ref?: string}
/** Uniformly loaded simple span (N/mm, mm) shared by `count` equal members, as built by `checker().uniform/member`. */
export interface UniformModel {w: number; L: number; m: MemberMaterial; count: number; deflectionRatio: number}
export interface ShortMember {
  /** Number of the governing location on the plan/elevation (1, 2, 3 …; letters are section marks) or '' when not marked. */
  tag: string; name: string; use: string; where: string; from: string; given: string;
  checks: Check[]; governing: Check | null; rows: EqRow[];
  /** Simple-span diagram data for the figure (w in N/mm = kN/m, L in mm). */
  diagram?: {L: number; w: number; title: string; unit?: string; spans?: 1 | 2 | 3};
  /** Largest spacing without FAIL for this member, when the advice search covers it. */
  maxSpacing?: string;
}
export interface ShortModel {
  /** English term for "คร่าว" in this system: joists under a soffit, studs on side forms. */
  stud: "Joist" | "Stud" | "Stud/joist";
  title: string; subtitle: string; chain: string; info: [string, string][]; standards: string[];
  criteria: [string, string, string][]; materials: [string, string, string, string][]; materialNote: string;
  loadTitle: string; loadRows: EqRow[]; pressure: PressureModel | null;
  members: ShortMember[]; blockers: string[]; status: string; engineVersion: string;
}

const n = (v: number, d = 2) => v.toLocaleString('en-US', {minimumFractionDigits: d, maximumFractionDigits: d});
const sp = (L: number, list: number[]) => L / (list.length - 1);
const close = (a: number, b: number) => Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(b));

/** Last part of a check label, e.g. "คร่าว (Joist): หน่วยแรงดัด" → "หน่วยแรงดัด". */
export const checkKind = (c: Check) => c.label.split(/[:·]/).pop()!.trim();

/** Highest utilization among checks with a limit; without any limit, the first check (stays "ยังไม่ครบ"). */
export function governingCheck(checks: Check[]): Check | null {
  const rated = checks.filter(c => c.utilization !== null);
  return rated.length ? rated.reduce((a, b) => (b.utilization! > a.utilization! ? b : a)) : checks[0] ?? null;
}

export const verdict = (c: Check | null): 'FAIL' | 'OK' | 'INCOMPLETE' => !c || c.limit === null || c.demand === null ? 'INCOMPLETE' : c.status === 'FAIL' ? 'FAIL' : 'OK';
export const VERDICT_LABEL = {OK: 'ไม่เกินเกณฑ์', FAIL: 'เกินเกณฑ์', INCOMPLETE: 'ยังไม่ครบ'} as const;

/** Joins short parts with " · " so a derivation stays compact (about 70 characters per line). */
const lines = (parts: string[]) => parts.reduce<string[]>((out, p) => {
  const last = out.at(-1);
  if (last !== undefined && last.length + p.length < 70) out[out.length - 1] = last + ' · ' + p; else out.push(p);
  return out;
}, []);

/** Generic derivation from the engine text: formula parts, substitution parts, result and limit. */
export function rowsFromCheck(c: Check): EqRow[] {
  const parts = (s: string) => s.split(';').map(t => t.trim()).filter(Boolean);
  return [
    ...parts(c.formula).map((expr, i) => ({label: i ? undefined : 'สูตร', op: i ? '' : ':', expr})),
    ...lines(parts(c.substitution)).map((expr, i) => ({label: i ? undefined : 'แทนค่า', op: i ? '' : ':', expr})),
    ...(c.demand === null ? [] : [{label: checkKind(c), expr: `${n(c.demand, 3)} ${c.unit}`, strong: true}]),
    {label: 'ค่าที่ยอมให้', expr: c.limit === null ? 'ยังไม่ระบุ (ต้องใช้ค่ารับรองจากผู้ผลิต)' : `${n(c.limit, 3)} ${c.unit}`},
  ];
}

/** Explicit simple-span steps for checks built by `checker().uniform`; null when the numbers would not reproduce the engine. */
export function uniformRows(c: Check, u: UniformModel): EqRow[] | null {
  const {w, L, m, count: k} = u, kind = c.id.split('-').pop(), over = (sym: string, v: number) => k > 1 ? [`(n·${sym})`, `(${n(v, 0)} × ${k})`] : [sym, n(v, 0)];
  let rows: EqRow[], value: number;
  if (kind === 'b') {
    const M = w * L * L / 8; value = M / k / m.S;
    rows = [{label: 'โมเมนต์ M', expr: 'wL² / 8'}, {expr: `${n(w, 3)} × ${n(L, 0)}² / 8`}, {expr: `${n(M / 1e6, 3)} kN·m`, strong: true},
      {label: 'หน่วยแรงดัด fb', expr: `M / ${over('S', m.S)[0]} = ${n(M, 0)} / ${over('S', m.S)[1]}`}, {expr: `${n(value, 2)} MPa`, strong: true},
      {label: 'ค่าที่ยอมให้ Fb', expr: `${n(m.Fb, 2)} MPa`, ref: m.timber ? 'ว.ส.ท. (ตาราง 3.4)' : 'Fy / Ωb (AISC ASD)'}];
  } else if (kind === 'v') {
    const V = w * L / 2; value = m.timber ? 1.5 * V / k / m.A : V / k / m.shearArea;
    rows = [{label: 'แรงเฉือน V', expr: `wL / 2 = ${n(w, 3)} × ${n(L, 0)} / 2`}, {expr: `${n(V / 1000, 3)} kN`, strong: true},
      m.timber ? {label: 'หน่วยแรงเฉือน fv', expr: `1.5V / ${over('A', m.A)[0]} = 1.5 × ${n(V, 0)} / ${over('A', m.A)[1]}`} : {label: 'หน่วยแรงเฉือน τ', expr: `V / ${over('Av', m.shearArea)[0]} = ${n(V, 0)} / ${over('Av', m.shearArea)[1]}`},
      {expr: `${n(value, 2)} MPa`, strong: true},
      {label: 'ค่าที่ยอมให้ Fv', expr: m.Fv === null ? 'ไม่มีค่าในตาราง' : `${n(m.Fv, 2)} MPa`, ref: m.timber ? 'ว.ส.ท. (ตาราง 3.4)' : 'Fy / (√3 Ωv)'}];
  } else if (kind === 'd') {
    value = 5 * w * L ** 4 / (384 * m.E * m.I) / k;
    rows = [{label: 'การโก่งตัว δ', expr: `5wL⁴ / (384 E I${k > 1 ? ' n' : ''})`}, {expr: `5 × ${n(w, 3)} × ${n(L, 0)}⁴ / (384 × ${n(m.E, 0)} × ${n(m.I, 0)}${k > 1 ? ` × ${k}` : ''})`},
      {expr: `${n(value, 3)} mm`, strong: true},
      {label: 'ค่าที่ยอมให้', expr: `L / ${u.deflectionRatio} = ${n(L, 0)} / ${u.deflectionRatio} = ${n(L / u.deflectionRatio, 3)} mm`, ref: 'เกณฑ์โครงการ'}];
  } else return null;
  return c.demand !== null && close(value, c.demand) ? rows : null;
}

interface MemberSpec extends Omit<ShortMember, 'checks' | 'governing' | 'rows'> {prefix: string | string[]; uniform?: UniformModel}
function member(checks: Check[], s: MemberSpec): ShortMember | null {
  const prefixes = Array.isArray(s.prefix) ? s.prefix : [s.prefix], own = checks.filter(c => prefixes.some(p => c.id === p || c.id.startsWith(p)));
  if (!own.length) return null;
  const governing = governingCheck(own), rows = governing ? (s.uniform && uniformRows(governing, s.uniform)) || rowsFromCheck(governing) : [];
  const {prefix: _p, uniform: _u, ...rest} = s;
  return {...rest, checks: own, governing, rows};
}
const present = (list: (ShortMember | null)[]) => list.filter((m): m is ShortMember => m !== null);

const plywoodMember = (prefix: string, name: string, t: number, d: PlywoodDesign, p: number, spacing: number, pLabel: string, uniformTo: string): MemberSpec => ({
  prefix, tag: '', name: `${name} ${t} mm`, use: 'แถบกว้าง 1 m', where: `แผ่นต่อเนื่องเหนือ${uniformTo}`,
  from: `${pLabel} = ${n(p)} kPa, ช่วง ${n(spacing, 0)} mm, ${d.spans === 1 ? 'ช่วงเดี่ยว' : `ต่อเนื่อง ${d.spans} ช่วง`}`,
  given: `แถบกว้าง 1 m พาดบน${uniformTo} @ ${n(spacing, 0)} mm (${d.spans === 1 ? 'ช่วงเดี่ยว' : `ต่อเนื่อง ${d.spans} ช่วง ตาม APA V345`}) · รับแรงดันได้สูงสุด ${n(d.allowablePressure, 1)} kPa`,
  diagram: {L: spacing, w: p, title: 'ไม้อัดแถบ 1 m', unit: 'kN/m', spans: d.spans},
});
const plyMaterial = (label: string, d: PlywoodDesign): [string, string, string, string] => [label, n(d.props.E, 0), n(d.props.Fb), d.props.Fs === null ? '—' : n(d.props.Fs, 3) + '*'];
const memberMaterial = (label: string, m: MemberMaterial): [string, string, string, string] => [`${label} ${m.name}`, n(m.E, 0), n(m.Fb), m.Fv === null ? '—' : n(m.Fv)];
const MATERIAL_NOTE = '* แรงเฉือนกลิ้ง (rolling shear) ของไม้อัดตาม APA V345 · เหล็ก: Fb = Fy/Ωb, Fv = Fy/(√3 Ωv) (AISC 360 ASD) · ไม้: ว.ส.ท. (หนังสือ ตาราง 3.4)';
const STD_ACI = 'ACI PRC-347-14(21) Guide to Formwork for Concrete — §4.2.1 น้ำหนักแนวดิ่ง, §4.2.2 แรงดันด้านข้าง, §4.2.3 แรงด้านข้าง, §4.3 กำลังอุปกรณ์';
const STD_APA = 'APA Form V345 (2012) Concrete Forming Design/Construction Guide — ไม้อัด Plyform ตาราง 12–13';
const STD_STEEL = 'มอก. 107 / มอก. 1227 — ตารางหน้าตัดเหล็ก (แคตตาล็อกผู้ผลิต) · AISC 360 (ASD) ตัวหารกำลัง Ωb, Ωv';
const STD_BOOK = (ch: string) => `หนังสือ Design Form Work ${ch} — ลำดับการคำนวณและหน่วยแรงที่ยอมให้ของไม้ (ตาราง 3.4)`;
const rowsOf = (steps: string[]): EqRow[] => steps.map(expr => ({op: '', expr}));
const spacingText = (a?: {max: number | null; unchecked: readonly string[] | string[]}) => !a ? undefined : a.max === null ? 'ต้องเปลี่ยนหน้าตัด' : `${a.max} mm${a.unchecked.length ? '*' : ''}`;
type Advice = {key: string; max: number | null; unchecked: readonly string[] | string[]}[];

export function slabShortModel(r: SlabResult, advice: Advice = []): ShortModel {
  const x = r.input, q = r.loads.q, sj = sp(x.lx, r.joists), sb = sp(x.ly, r.bearers), ss = sp(x.lx, r.shores), a = (k: string) => spacingText(advice.find(v => v.key === k));
  const members = present([
    member(r.checks, {...plywoodMember('ply-', 'ไม้อัดท้องพื้น', x.plywood, r.plywood, q, sj, 'q', 'คร่าว'), maxSpacing: a('joistSpacing') && `คร่าว ≤ ${a('joistSpacing')}`}),
    member(r.checks, {prefix: 'joist-', tag: '1', name: `คร่าว ${r.joist.name}`, use: `@ ${n(sj, 0)} mm`, where: 'คร่าวภายใน กลางช่วงระหว่างคานรับ',
      from: `w = q × ${n(sj / 1000)} m = ${n(r.joistLine, 3)} kN/m`, given: `คร่าวภายในพาดระหว่างคานรับ L = ${n(sb, 0)} mm (ช่วงเดี่ยว) · w = q × sj = ${n(q)} × ${n(sj / 1000)} = ${n(r.joistLine, 3)} kN/m`,
      uniform: {w: r.joistLine, L: sb, m: r.joist, count: 1, deflectionRatio: x.deflectionRatio}, diagram: {L: sb, w: r.joistLine, title: `คร่าว ${r.joist.name}`}, maxSpacing: a('joistSpacing')}),
    member(r.checks, {prefix: 'bearer-', tag: '2', name: `คานรับ ${x.bearerCount > 1 ? '2×' : ''}${r.bearer.name}`, use: `@ ${n(sb, 0)} mm`, where: 'คานรับภายใน กลางช่วงระหว่างค้ำยัน',
      from: `w = kj × q × ${n(sb / 1000)} m = ${n(r.bearerLine, 3)} kN/m`, given: `คานรับภายในพาดระหว่างค้ำยัน L = ${n(ss, 0)} mm · แรงจากคร่าวต่อเนื่องเฉลี่ยเป็นแรงแผ่ w = kj × q × sb = ${n(r.joistFactor, 3)} × ${n(q)} × ${n(sb / 1000)} = ${n(r.bearerLine, 3)} kN/m`,
      uniform: {w: r.bearerLine, L: ss, m: r.bearer, count: x.bearerCount, deflectionRatio: x.deflectionRatio}, diagram: {L: ss, w: r.bearerLine, title: `คานรับ ${r.bearer.name}`}, maxSpacing: a('bearerSpacing')}),
    member(r.checks, {prefix: 'shore-', tag: '3', name: 'ค้ำยัน', use: `@ ${n(ss, 0)} × ${n(sb, 0)} mm`, where: 'ต้นภายใน (พื้นที่รับแรงเต็ม)',
      from: `P = kb × kj × q × ${n(sb / 1000)} × ${n(ss / 1000)} m² (k = ${n(r.shoreFactor, 3)}, ${n(r.joistFactor, 3)})`, given: `ต้นภายในรับพื้นที่ ${n(sb / 1000)} × ${n(ss / 1000)} m · ความยาวใช้งาน ≈ ${n(r.shoreLength, 0)} mm`, maxSpacing: a('shoreSpacing')}),
    member(r.checks, {prefix: 'lateral', tag: '', name: 'แรงด้านข้าง', use: 'ค้ำทแยง / ledger', where: 'ขอบพื้นแต่ละด้าน', from: 'max(1.5 kN/m, 2% DL)', given: 'ACI §4.2.3.2 แรงด้านข้างที่ต้องค้ำที่ขอบพื้น'}),
  ]);
  return {
    stud: 'Joist', title: 'รายการคำนวณแบบหล่อพื้น (แบบย่อ)', subtitle: 'SLAB FORMWORK — SHORT DESIGN CALCULATION', chain: 'ไม้อัด → คร่าว → คานรับ → ค้ำยัน',
    info: [['ขนาดช่วงพื้น', `${n(x.lx / 1000)} × ${n(x.ly / 1000)} m`], ['ความหนาพื้น', `${x.t} mm`], ['สูงใต้ท้องพื้น', `${n(x.soffitHeight / 1000)} m`], ['แบบอ้างอิง', 'SF-01 ถึง SF-03']],
    standards: [STD_ACI, STD_APA, STD_STEEL, STD_BOOK('บทที่ 6 (ตัวอย่างที่ 6.1)')],
    criteria: [['หน่วยน้ำหนักคอนกรีต γ', `${n(x.gamma, 1)} kN/m³`, 'สมมติฐานโครงการ'], ['น้ำหนักแบบหล่อ', `${n(x.formDead)} kPa`, 'ผู้ใช้กำหนด'],
      ['น้ำหนักจรขณะเท', `${n(r.loads.liveUsed)} kPa`, `ACI §4.2.1 ≥ ${r.loads.liveMin}`], ['รวม D + L ขั้นต่ำ', `${n(r.loads.totalMin)} kPa`, 'ACI §4.2.1'],
      ['การโก่งตัวยอมให้', `L / ${x.deflectionRatio}`, 'เกณฑ์โครงการ'], ['แบบจำลองคร่าว/คานรับ', 'คานช่วงเดี่ยว', 'ปลอดภัยกว่า wl²/10 ในหนังสือ']],
    materials: [plyMaterial(`ไม้อัด ${x.plywood} mm`, r.plywood), memberMaterial('คร่าว', r.joist), memberMaterial('คานรับ', r.bearer),
      ['ค้ำยัน', 'SWL ผู้ผลิต', x.shoreSWL > 0 ? `${n(x.shoreSWL)} kN` : 'ยังไม่ระบุ', '—']],
    materialNote: MATERIAL_NOTE, loadTitle: 'น้ำหนักบรรทุกออกแบบ', loadRows: rowsOf(r.loads.steps), pressure: null,
    members, blockers: r.blockers, status: r.status, engineVersion: r.engineVersion,
  };
}

export function beamShortModel(r: BeamResult, advice: Advice = []): ShortModel {
  const x = r.input, p = r.pressureModel.pmax, sj = sp(x.length, r.joists), ss = sp(x.length, r.shores), st = sp(x.length, r.studs);
  const stt = r.ties.length > 1 ? sp(x.length, r.ties) : 0, ws = p / 1000 * st, ww = p / 1000 * r.studSpan, a = (k: string) => spacingText(advice.find(v => v.key === k));
  const members = present([
    member(r.checks, {...plywoodMember('sof-', 'ไม้อัดท้องคาน', x.plywood, r.soffitPlywood, r.loads.beam, sj, 'q', 'คร่าวท้อง'), maxSpacing: a('joistSpacing') && `คร่าว ≤ ${a('joistSpacing')}`}),
    member(r.checks, {prefix: 'joist-', tag: '1', name: `คร่าวท้องคาน ${r.joist.name}`, use: `@ ${n(sj, 0)} mm`, where: 'คร่าวพาดขวางระหว่างคานรับสองแนว',
      from: `แถบคาน b = ${x.b} mm${x.slabLeft + x.slabRight > 0 ? ' + แถบพื้นข้างคาน' : ''}`, given: `คร่าวพาดระหว่างคานรับ L = ${n(x.shoreWidth, 0)} mm รับแรงแผ่บางส่วนจากท้องคาน (คานรับแรงแผ่บางช่วง คำนวณตรง)`, maxSpacing: a('joistSpacing')}),
    member(r.checks, {prefix: 'bearer-', tag: '2', name: `คานรับท้อง ${x.bearerCount > 1 ? '2×' : ''}${r.bearer.name}`, use: `@ ${n(ss, 0)} mm (ค้ำยัน)`, where: 'คานรับด้านที่รับแรงมาก กลางช่วงระหว่างค้ำยัน',
      from: `w = Rmax / sj = ${n(r.bearerLine, 3)} kN/m`, given: `คานรับพาดระหว่างค้ำยัน L = ${n(ss, 0)} mm · w = แรงปฏิกิริยาคร่าวสูงสุด / ระยะคร่าว = ${n(r.joistReaction / 1000, 3)} / ${n(sj / 1000)} = ${n(r.bearerLine, 3)} kN/m`,
      uniform: {w: r.bearerLine, L: ss, m: r.bearer, count: x.bearerCount, deflectionRatio: x.deflectionRatio}, diagram: {L: ss, w: r.bearerLine, title: `คานรับ ${r.bearer.name}`}, maxSpacing: a('shoreSpacing')}),
    member(r.checks, {prefix: 'shore-', tag: '3', name: 'ค้ำยัน', use: `@ ${n(ss, 0)} mm สองแนว`, where: 'ต้นใต้คานรับด้านที่รับแรงมาก',
      from: `P = k × w × ss`, given: `คานรับต่อเนื่อง k = ${n(r.shoreFactor, 3)} · ความยาวใช้งาน ≈ ${n(r.shoreLength, 0)} mm`, maxSpacing: a('shoreSpacing')}),
    member(r.checks, {...plywoodMember('side-', 'ไม้อัดแบบข้าง', x.plywood, r.sidePlywood, p, st, 'pmax', 'คร่าวแบบข้าง'), maxSpacing: a('studSpacing') && `คร่าว ≤ ${a('studSpacing')}`}),
    member(r.checks, {prefix: 'stud-', tag: '4', name: `คร่าวแบบข้าง ${r.stud.name}`, use: `@ ${n(st, 0)} mm`, where: 'ช่วงคร่าวระหว่างจุดยึด (ล่าง/แถว Tie/บน)',
      from: `w = pmax × ${n(st / 1000)} m = ${n(ws, 3)} kN/m`, given: `คร่าวแนวตั้งช่วง L = ${n(r.studSpan, 0)} mm · w = pmax × s = ${n(p)} × ${n(st / 1000)} = ${n(ws, 3)} kN/m`,
      uniform: {w: ws, L: r.studSpan, m: r.stud, count: 1, deflectionRatio: x.deflectionRatio}, diagram: {L: r.studSpan, w: ws, title: `คร่าว ${r.stud.name}`}, maxSpacing: a('studSpacing')}),
    member(r.checks, {prefix: 'waler-', tag: '5', name: `คานคู่แบบข้าง 2×${r.waler.name}`, use: `@ Tie ${n(stt, 0)} mm`, where: 'ช่วงคานคู่ระหว่าง Tie',
      from: `w = pmax × ${n(r.studSpan / 1000)} m = ${n(ww, 3)} kN/m`, given: `คานคู่พาดระหว่าง Tie L = ${n(stt, 0)} mm แบ่งแรงสองตัว · w = pmax × L_stud = ${n(p)} × ${n(r.studSpan / 1000)} = ${n(ww, 3)} kN/m`,
      uniform: {w: ww, L: stt, m: r.waler, count: 2, deflectionRatio: x.deflectionRatio}, diagram: {L: stt, w: ww, title: `คานคู่ 2×${r.waler.name}`}, maxSpacing: a('tieSpacing')}),
    member(r.checks, {prefix: 'tie-', tag: '6', name: `Tie Ø${x.tieDiameter}`, use: `@ ${n(stt, 0)} mm`, where: 'Tie ภายใน', from: 'T = pmax × L_stud × s_tie', given: 'Tie รับแรงจากคานคู่สองด้านของช่วง'}),
    member(r.checks, {prefix: ['lateral', 'kicker', 'top'], tag: '', name: 'แรงด้านข้าง / จุดยึดล่างและบน', use: 'ค้ำทแยง, ไม้กันตีน, จุดยึดบน', where: 'ตลอดแนวคาน', from: 'ACI §4.2.3.2 · R = pmax L / 2', given: 'แรงที่ต้องออกแบบอุปกรณ์ยึด (ยังไม่มีวิธีตรวจใน engine)'}),
  ]);
  return {
    stud: 'Stud/joist', title: 'รายการคำนวณแบบหล่อคาน (แบบย่อ)', subtitle: 'BEAM FORMWORK — SHORT DESIGN CALCULATION', chain: 'ท้องคาน: ไม้อัด → คร่าว → คานรับ → ค้ำยัน · แบบข้าง: ไม้อัด → คร่าว → คานคู่ → Tie',
    info: [['ขนาดคาน b × h', `${x.b} × ${x.h} mm`], ['ความยาว', `${n(x.length / 1000)} m`], ['สูงใต้ท้องคาน', `${n(x.soffitHeight / 1000)} m`], ['แบบอ้างอิง', 'BF-01 ถึง BF-03']],
    standards: [STD_ACI, STD_APA, STD_STEEL, STD_BOOK('บทที่ 7 (แบบหล่อคาน)')],
    criteria: [['หน่วยน้ำหนักคอนกรีต γ', `${n(x.gamma, 1)} kN/m³`, 'สมมติฐานโครงการ'], ['น้ำหนักแบบหล่อ / น้ำหนักจร', `${n(x.formDead)} / ${n(r.loads.liveUsed)} kPa`, `ACI §4.2.1 ≥ ${r.loads.liveMin}`],
      ['แรงดันด้านข้าง', `${r.pressureModel.method === 'ACI347' ? 'ACI 347 สมการ ' + r.pressureModel.equation : 'ของเหลว ρgh'} → ${n(p)} kPa`, 'ACI §4.2.2'],
      ['การโก่งตัวยอมให้', `L / ${x.deflectionRatio}`, 'เกณฑ์โครงการ'], ['แบบจำลองสมาชิก', 'คานช่วงเดี่ยว · แรงค้ำยันจากคานรับต่อเนื่อง (k)', 'ปลอดภัยกว่าคานต่อเนื่อง']],
    materials: [plyMaterial(`ไม้อัด ${x.plywood} mm`, r.soffitPlywood), memberMaterial('คร่าวท้อง', r.joist), memberMaterial('คานรับ', r.bearer), memberMaterial('คร่าวข้าง', r.stud),
      ...(x.tieRows > 0 ? [memberMaterial('คานคู่', r.waler)] : []), ['ค้ำยัน / Tie', 'SWL ผู้ผลิต', `${x.shoreSWL > 0 ? n(x.shoreSWL) + ' kN' : 'ยังไม่ระบุ'}${x.tieRows > 0 ? ` / ${x.tieSWL > 0 ? n(x.tieSWL) + ' kN' : 'ยังไม่ระบุ'}` : ''}`, '—']],
    materialNote: MATERIAL_NOTE, loadTitle: 'น้ำหนักบรรทุกและแรงดันคอนกรีต', loadRows: [...rowsOf(r.loads.steps), ...rowsOf(r.pressureModel.steps)], pressure: r.pressureModel,
    members, blockers: r.blockers, status: r.status, engineVersion: r.engineVersion,
  };
}

export function wallShortModel(r: WallResult, advice: Advice = []): ShortModel {
  const x = r.input, p = r.pressureModel.pmax, single = !!r.strongback, st = sp(x.length, r.studs), sw = sp(x.height, r.levels), sb = sp(x.length, r.braces);
  const stt = single ? sb : sp(x.length, r.ties), a = (k: string) => spacingText(advice.find(v => v.key === k));
  const members = present([
    member(r.checks, {...plywoodMember('ply-', 'ไม้อัด', x.plywood, r.plywood, p, st, 'pmax', 'คร่าว'), maxSpacing: a('studSpacing') && `คร่าว ≤ ${a('studSpacing')}`}),
    member(r.checks, {prefix: 'stud-', tag: '1', name: `คร่าว ${r.stud.name}`, use: `@ ${n(st, 0)} mm`, where: 'คร่าวช่วงล่างระหว่างคานคู่ (แรงดันสูงสุด)',
      from: `w = pmax × ${n(st / 1000)} m = ${n(r.studLine, 3)} kN/m`, given: `คร่าวแนวตั้งพาดระหว่างคานคู่ L = ${n(sw, 0)} mm · w = pmax × s = ${n(p)} × ${n(st / 1000)} = ${n(r.studLine, 3)} kN/m`,
      uniform: {w: r.studLine, L: sw, m: r.stud, count: 1, deflectionRatio: x.deflectionRatio}, diagram: {L: sw, w: r.studLine, title: `คร่าว ${r.stud.name}`}, maxSpacing: a('studSpacing')}),
    member(r.checks, {prefix: 'waler-', tag: '2', name: `คานคู่ 2×${r.waler.name}`, use: `@ ${n(sw, 0)} mm`, where: `คานคู่ระดับล่าง ช่วงระหว่าง${single ? ' strongback' : ' Tie'}`,
      from: `w = pmax × ${n(sw / 1000)} m = ${n(r.walerLine, 3)} kN/m`, given: `คานคู่พาดระหว่าง${single ? ' strongback' : ' Tie'} L = ${n(stt, 0)} mm แบ่งแรงสองตัว · w = pmax × sw = ${n(p)} × ${n(sw / 1000)} = ${n(r.walerLine, 3)} kN/m`,
      uniform: {w: r.walerLine, L: stt, m: r.waler, count: 2, deflectionRatio: x.deflectionRatio}, diagram: {L: stt, w: r.walerLine, title: `คานคู่ 2×${r.waler.name}`}, maxSpacing: a('walerSpacing')}),
    member(r.checks, {prefix: 'tie-', tag: '3', name: `Tie Ø${x.tieDiameter}`, use: `@ ${n(stt, 0)} × ${n(sw, 0)} mm`, where: 'Tie ภายในแถวล่าง',
      from: `T = pmax × ${n(sw / 1000)} × ${n(stt / 1000)} m²`, given: `Tie รับพื้นที่ ${n(sw / 1000)} × ${n(stt / 1000)} m ที่แรงดัน pmax`, maxSpacing: a('tieSpacing')}),
    member(r.checks, {prefix: 'strongback', tag: '3', name: `Strongback ${x.strongbackCount > 1 ? '2×' : ''}${r.strongback?.name ?? ''}`, use: `@ ${n(sb, 0)} mm`, where: 'ทุกสถานีค้ำยัน (ฐานเป็นจุดหมุน)',
      from: `w = pmax × ${n(sb / 1000)} m`, given: `strongback ฐานเป็นจุดหมุน รองรับที่ค้ำยัน hb = ${n(x.braceHeight, 0)} mm`, maxSpacing: a('braceSpacing')}),
    member(r.checks, {prefix: 'anchor', tag: '4', name: 'พุกฐาน', use: `ทุกสถานี @ ${n(sb, 0)} mm`, where: 'ฐาน strongback', from: 'R = √(V² + U²)', given: 'แรงเฉือนจากฐาน strongback และแรงยกจากค้ำยัน'}),
    member(r.checks, {prefix: 'brace-', tag: single ? '5' : '4', name: 'ค้ำยันเอียง', use: `@ ${n(sb, 0)} mm · ${x.braceAngle}°`, where: 'ทุกสถานีค้ำยัน',
      from: single ? 'แรงดันคอนกรีต + ACI §4.2.3' : `ACI §4.2.3: ${r.braceGoverning}`, given: `ค้ำยันยึดที่ระดับ hb = ${n(x.braceHeight, 0)} mm มุม ${x.braceAngle}° · M = ${n(r.braceMoment, 3)} kN·m/m`, maxSpacing: a('braceSpacing')}),
  ]);
  return {
    stud: 'Stud', title: `รายการคำนวณแบบหล่อผนัง${single ? 'ด้านเดียว' : ''} (แบบย่อ)`, subtitle: 'WALL FORMWORK — SHORT DESIGN CALCULATION',
    chain: single ? 'ไม้อัด → คร่าว → คานคู่ → strongback → ค้ำยัน / พุก' : 'ไม้อัด → คร่าว → คานคู่ → Tie · ค้ำยันเอียง',
    info: [['ผนัง ยาว × หนา', `${n(x.length / 1000)} m × ${x.t} mm`], ['ความสูงเท', `${n(x.height / 1000)} m`], ['ระบบ', single ? 'ด้านเดียว (ไม่มี Tie)' : 'สองด้าน + Tie'], ['แบบอ้างอิง', 'WF-01 ถึง WF-03']],
    standards: [STD_ACI, STD_APA, STD_STEEL, STD_BOOK('บทที่ 8 (แบบหล่อกำแพง)')],
    criteria: [['หน่วยน้ำหนักคอนกรีต γ', `${n(x.gamma, 1)} kN/m³`, 'สมมติฐานโครงการ'],
      ['แรงดันด้านข้าง', `${r.pressureModel.method === 'ACI347' ? 'ACI 347 สมการ ' + r.pressureModel.equation : 'ของเหลว ρgh'} → ${n(p)} kPa`, 'ACI §4.2.2'],
      ['แรงด้านข้างของแบบ', `max(1.5 kN/m ที่ยอด, ลม ${n(x.windPressure)} kPa)`, 'ACI §4.2.3 · ลมไม่น้อยกว่า 0.72 kPa'], ['การโก่งตัวยอมให้', `L / ${x.deflectionRatio}`, 'เกณฑ์โครงการ'],
      ['แบบจำลองสมาชิก', 'คานช่วงเดี่ยว ใช้ pmax คงที่', 'ซองแรงคัดกรอง']],
    materials: [plyMaterial(`ไม้อัด ${x.plywood} mm`, r.plywood), memberMaterial('คร่าว', r.stud), memberMaterial('คานคู่', r.waler), ...(r.strongback ? [memberMaterial('Strongback', r.strongback)] : []),
      [single ? 'ค้ำยัน / พุก' : 'Tie / ค้ำยัน', 'SWL ผู้ผลิต', single ? `${x.braceSWL > 0 ? n(x.braceSWL) + ' kN' : 'ยังไม่ระบุ'} / ${x.anchorSWL > 0 ? n(x.anchorSWL) + ' kN' : 'ยังไม่ระบุ'}`
        : `${x.tieSWL > 0 ? n(x.tieSWL) + ' kN' : 'ยังไม่ระบุ'} / ${x.braceSWL > 0 ? n(x.braceSWL) + ' kN' : 'ยังไม่ระบุ'}`, '—']],
    materialNote: MATERIAL_NOTE, loadTitle: 'แรงดันคอนกรีตสด', loadRows: rowsOf(r.pressureModel.steps), pressure: r.pressureModel,
    members, blockers: r.blockers, status: r.status, engineVersion: r.engineVersion,
  };
}

/** Footing and column (legacy engine): plywood → studs → twin walers → ties and/or column yoke. Member checks have their own
 * formulas (point loads on the walers), so the derivation is taken from the engine text. */
export function legacyShortModel(r: Result, advice: {checkId: string; text: string}[] = []): ShortModel {
  const x = r.input, column = x.kind === 'COLUMN', tied = usesTies(x), p = r.pressure, stud = r.checks.find(c => c.id === 'stud-b'), studV = r.checks.find(c => c.id === 'stud-v');
  const sc = x.studSectionId ? sectionById(x.studSectionId) : undefined, timber = sc?.family === 'TIMBER', studLabel = sc ? sc.designation : `RHS ${x.rhsB}×${x.rhsH}×${x.rhsT}`, studE = timber ? timberGrade(x.studTimberGrade)?.E ?? null : x.steelE, wStud = p / 1000 * x.studSpacing;
  const hint = (prefix: string) => advice.find(a => a.checkId.startsWith(prefix))?.text;
  const members = present([
    member(r.checks, plywoodMember('ply-', 'ไม้อัด', x.plywood, r.plywoodDesign, p, x.studSpacing, 'pmax', 'คร่าว')),
    member(r.checks, {prefix: 'stud-', tag: '1', name: `คร่าว ${studLabel}`, use: `@ ${x.studSpacing} mm`, where: 'คร่าวช่วงระหว่างคานคู่ที่ยาวที่สุด',
      from: `w = pmax × ${n(x.studSpacing / 1000)} m = ${n(wStud, 3)} kN/m`, given: `คร่าวพาดระหว่างคานคู่ ช่วงจริง ${n(r.waler.verticalSpan, 0)} mm · w = ${n(p)} × ${n(x.studSpacing / 1000)} = ${n(wStud, 3)} kN/m`,
      diagram: {L: r.waler.verticalSpan, w: wStud, title: 'คร่าว'}, maxSpacing: hint('stud')}),
    member(r.checks, {prefix: 'waler-', tag: '2', name: `คานคู่ ${x.walerType} ${x.walerB}×${x.walerH}×${x.walerT}`, use: `@ ${x.walerSpacing} mm`, where: 'ช่วงควบคุมของคานคู่ (ตัวที่รับแรงมาก)',
      from: 'แรงจุดจากคร่าว Pj = pmax · bj · hv', given: `คานคู่รับแรงจุดจากคร่าวพาดระหว่าง${column && !x.columnTies ? 'ชุดรัดมุม' : ' Tie'} · ช่วงพาดคร่าว ${n(r.waler.verticalSpan, 0)} mm`, maxSpacing: hint('waler')}),
    ...(tied ? [member(r.checks, {prefix: 'tie', tag: '3', name: `Tie Ø${x.tieDiameter} ${x.tieGrade}`, use: `@ ≤ ${x.tieSpacing} mm`, where: r.tie ? `Tie ที่รับแรงมากสุด (ด้าน ${r.tie.faceId})` : 'Tie ภายใน',
      from: 'T = แรงปฏิกิริยาคานคู่สองข้างของ Tie', given: 'ปฏิกิริยาคานคู่ที่จุด Tie (คำนวณจากแรงจุดของคร่าว)', maxSpacing: hint('tie')})] : []),
    ...(column ? [member(r.checks, {prefix: 'column-', tag: tied ? '4' : '3', name: 'ชุดรัดเสา (Column yoke)', use: `ทุกระดับคานคู่`, where: 'จุดต่อมุมของระดับที่รับแรงมาก',
      from: 'แรงปลายคานคู่ที่มุม', given: 'แรงที่มุมจากแรงปฏิกิริยาปลายคานคู่ทั้งสองแกน'})] : []),
  ]);
  return {
    stud: 'Stud', title: `รายการคำนวณแบบหล่อ${column ? 'เสา' : 'ฐานราก'} (แบบย่อ)`, subtitle: `${column ? 'COLUMN' : 'FOOTING'} FORMWORK — SHORT DESIGN CALCULATION`,
    chain: `ไม้อัด → คร่าว → คานคู่ → ${column ? (x.columnTies ? 'Tie + ชุดรัดเสา' : 'ชุดรัดเสา') : 'Tie'}`,
    info: [['ขนาด', `${x.width} × ${x.length} mm`], ['ความสูงเท', `${n(x.height / 1000)} m`], ['รูปทรง', x.shape === 'L' ? 'รูป L' : 'สี่เหลี่ยม'], ['แบบอ้างอิง', 'FW-01 ถึง FW-04']],
    standards: [STD_ACI, STD_APA, STD_STEEL, STD_BOOK(column ? 'บทที่ 9 (แบบหล่อเสา)' : 'บทที่ 2–5')],
    criteria: [['หน่วยน้ำหนักคอนกรีต γ', `${n(x.gamma, 1)} kN/m³`, 'สมมติฐานโครงการ'],
      ['แรงดันด้านข้าง', `${r.pressureModel.method === 'ACI347' ? 'ACI 347 สมการ ' + r.pressureModel.equation : 'ของเหลว ρgh'} → ${n(p)} kPa`, 'ACI §4.2.2'],
      ['การโก่งตัวยอมให้', `L / ${x.deflectionRatio}`, 'เกณฑ์โครงการ'], ['แบบจำลองสมาชิก', 'ไม้อัดต่อเนื่องตาม APA V345 · คร่าวช่วงเดี่ยว · คานคู่รับแรงจุด', 'ซองแรงคัดกรอง pmax คงที่']],
    materials: [[`ไม้อัด ${x.plywood} mm`, n(r.plywood.E, 0), n(r.plywood.Fb), r.plywood.Fs === null ? '—' : n(r.plywood.Fs, 3) + '*'],
      [`คร่าว ${studLabel}`, studE === null ? '—' : n(studE, 0), stud?.limit == null ? '—' : n(stud.limit), studV?.limit == null ? '—' : n(studV.limit)],
      [`คานคู่ ${x.walerType} ${x.walerB}×${x.walerH}×${x.walerT}`, n(x.steelE, 0), n(x.steelFy / x.steelOmegaB), n(x.steelFy / (Math.sqrt(3) * x.steelOmegaShear))],
      ...(tied ? [[`Tie Ø${x.tieDiameter}`, `Fy ${x.tieFy}`, `Fu ${x.tieFu}`, x.tieAssemblySWL ? `SWL ${x.tieAssemblySWL} kN` : 'SWL ยังไม่ระบุ'] as [string, string, string, string]] : [])],
    materialNote: MATERIAL_NOTE, loadTitle: 'แรงดันคอนกรีตสด', loadRows: rowsOf(r.pressureModel.steps), pressure: r.pressureModel,
    members, blockers: r.blockers, status: r.status, engineVersion: r.engineVersion,
  };
}
