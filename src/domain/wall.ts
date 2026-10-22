/** Practical two-sided wall formwork screening: pressure → plywood → vertical studs → horizontal twin walers → through ties,
 * plus the ACI §4.2.3 bracing demand for alignment/stability. Units: mm, N, MPa, kPa, kN. Status is FAIL or INCOMPLETE, never PASS. */
import {CC_VALUES,lateralPressure,type PressureMethod,type PressureModel} from './pressure.js';
import {FACE_GRAINS,PLYWOOD_GRADES,PLYWOOD_SPANS,plywoodDesign,type FaceGrain,type PlywoodDesign,type PlywoodGrade,type PlywoodSpans} from './plywoodGrades.js';
import {sectionById,timberGrade} from './sectionStock.js';
import {equalPositions} from './mechanics.js';
import {bearingCheck,checker,fx,material,plywoodOptions,plywoodSource,type MemberMaterial} from './members.js';
import type {Check,Status} from './index.js';

export const WALL_ENGINE_VERSION = 'wall-0.2.0-screening';
export const ACI_BRACING_REFERENCE = 'ACI PRC-347-14(21) §4.2.3.1 (ลมไม่น้อยกว่า 0.72 kPa) และ §4.2.3.3 (แรงด้านข้างไม่น้อยกว่า 1.5 kN/m ที่ยอดแบบ)';
export type WallSystem = 'TWO_SIDED' | 'SINGLE_SIDED';
export interface WallInput {
  /** Wall length, thickness and pour height (mm). TWO_SIDED = forms on both faces with through ties; SINGLE_SIDED = one form against soil/existing wall, held by strongbacks + braces. */
  length: number; t: number; height: number; confirmed: boolean; system: WallSystem;
  gamma: number; deflectionRatio: number;
  pressureMethod: PressureMethod; pourRate: number; concreteTemp: number; slump: number; vibrationDepth: number; chemistryCc: number;
  plywood: number; plywoodGrade: PlywoodGrade; plywoodSpans: PlywoodSpans; plywoodFaceGrain: FaceGrain; plywoodE: number; plywoodFb: number;
  timberGrade: string; steelFy: number; steelE: number; steelOmegaB: number; steelOmegaShear: number;
  /** Vertical studs at studSpacing along the wall; horizontal twin walers at walerSpacing up the height. */
  studSectionId: string; studSpacing: number; walerSectionId: string; walerSpacing: number;
  /** Through ties along each waler level at tieSpacing. Body screen Fy·Ag/Ω; assembly SWL from the manufacturer (0 = unknown). */
  tieSpacing: number; tieDiameter: number; tieFy: number; tieOmega: number; tieSWL: number;
  /** Tie rod ultimate tensile strength (MPa) for the ACI Table 4.4 check (safety factor 2.0 on ultimate). */
  tieFu: number;
  /** Design wind pressure on the form (kPa) from the site/local code; ACI §4.2.3.1 minimum 0.72 kPa. */
  windPressure: number;
  /** Push-pull braces on one face: spacing along the wall, attachment height, angle from horizontal (deg), SWL (kN, 0 = unknown). */
  braceSpacing: number; braceHeight: number; braceAngle: number; braceSWL: number; braceReference: string;
  /** Single-sided only: vertical strongbacks at every brace station (strongbackCount members), base anchor SWL per strongback (kN, 0 = unknown). */
  strongbackSectionId: string; strongbackCount: 1 | 2; anchorSWL: number;
}
export const wallDefaults: WallInput = {
  length: 6000, t: 250, height: 3000, confirmed: false, system: 'TWO_SIDED', gamma: 24, deflectionRatio: 360,
  pressureMethod: 'HYDROSTATIC', pourRate: 2, concreteTemp: 30, slump: 100, vibrationDepth: 1, chemistryCc: 1.2,
  plywood: 20, plywoodGrade: 'PLYFORM_I', plywoodSpans: 'AUTO', plywoodFaceGrain: 'ACROSS', plywoodE: 4800, plywoodFb: 5.3,
  timberGrade: 'TIMBER-BOOK-SOFT', steelFy: 245, steelE: 200000, steelOmegaB: 1.67, steelOmegaShear: 1.67,
  studSectionId: 'PAP-TIS107-SHS-50x50x2.3', studSpacing: 300, walerSectionId: 'PAP-TIS107-RHS-100x50x3.2', walerSpacing: 600,
  tieSpacing: 600, tieDiameter: 16, tieFy: 390, tieOmega: 1.67, tieSWL: 0, tieFu: 560, windPressure: 0.72,
  braceSpacing: 2000, braceHeight: 2000, braceAngle: 60, braceSWL: 0, braceReference: '',
  strongbackSectionId: 'PAP-TIS107-RHS-100x50x3.2', strongbackCount: 2, anchorSWL: 0,
};
/** Fields added after the first release; stored walls without them keep the two-sided model. */
const LATER = {system: 'TWO_SIDED', strongbackSectionId: wallDefaults.strongbackSectionId, strongbackCount: wallDefaults.strongbackCount, anchorSWL: 0, tieFu: 560, windPressure: 0.72};
const TEXT_KEYS = ['confirmed', 'system', 'pressureMethod', 'plywoodGrade', 'plywoodSpans', 'plywoodFaceGrain', 'timberGrade', 'studSectionId', 'walerSectionId', 'braceReference', 'strongbackSectionId', 'strongbackCount'];
const NON_NEGATIVE = ['tieSWL', 'braceSWL', 'anchorSWL'];

export function validateWallInput(v: unknown): WallInput {
  if (!v || typeof v !== 'object') throw Error('ข้อมูลผนังไม่ถูกต้อง');
  const q: Record<string, unknown> = {...LATER, ...(v as Record<string, unknown>)}, keys = Object.keys(wallDefaults) as (keyof WallInput)[];
  if (Object.keys(q).some(k => !keys.includes(k as keyof WallInput))) throw Error('มีช่องข้อมูลผนังที่ไม่รองรับ');
  for (const k of keys.filter(k => !TEXT_KEYS.includes(k))) {
    const n = q[k], min = NON_NEGATIVE.includes(k) ? 0 : Number.MIN_VALUE;
    if (typeof n !== 'number' || !Number.isFinite(n) || n < min) throw Error((min === 0 ? 'ค่าต้องไม่ติดลบ: ' : 'ค่าต้องเป็นจำนวนบวก: ') + k);
  }
  const x = q as unknown as WallInput;
  if (typeof x.confirmed !== 'boolean' || !['TWO_SIDED', 'SINGLE_SIDED'].includes(x.system) || ![1, 2].includes(x.strongbackCount)) throw Error('สถานะยืนยัน ระบบแบบ หรือจำนวน strongback ไม่ถูกต้อง');
  if (!PLYWOOD_GRADES.includes(x.plywoodGrade) || !PLYWOOD_SPANS.includes(x.plywoodSpans) || !FACE_GRAINS.includes(x.plywoodFaceGrain)) throw Error('ชนิด จำนวนช่วง หรือทิศลายไม้อัดไม่ถูกต้อง');
  if (!['HYDROSTATIC', 'ACI347'].includes(x.pressureMethod) || !CC_VALUES.includes(x.chemistryCc as typeof CC_VALUES[number])) throw Error('วิธีคำนวณแรงดันหรือค่า Cc ไม่ถูกต้อง');
  if (typeof x.timberGrade !== 'string' || !timberGrade(x.timberGrade)) throw Error('ชั้นไม้ไม่ถูกต้อง');
  if (typeof x.braceReference !== 'string' || x.braceReference.length > 300) throw Error('แหล่งอ้างอิงค้ำยันไม่ถูกต้อง');
  for (const [k, role] of [['studSectionId', 'stud'], ['walerSectionId', 'waler'], ['strongbackSectionId', 'waler']] as const) {
    const s = typeof x[k] === 'string' ? sectionById(x[k]) : undefined;
    if (!s || !s.roles.includes(role)) throw Error('ไม่พบหน้าตัดในตารางเหล็ก/ไม้: ' + k);
  }
  if (x.length > 30000 || x.t > 3000 || x.height > 15000 || x.gamma > 40 || x.plywood > 100 || x.tieDiameter > 50) throw Error('ขนาดผนังอยู่นอกขอบเขต');
  if (x.deflectionRatio > 2000 || x.steelFy > 1000 || x.steelE > 300000 || x.tieFy > 1000 || [x.steelOmegaB, x.steelOmegaShear, x.tieOmega].some(o => o < 1 || o > 10)) throw Error('พารามิเตอร์วัสดุอยู่นอกขอบเขต');
  if (x.pourRate > 20 || x.concreteTemp < 5 || x.concreteTemp > 45 || x.slump > 300 || x.vibrationDepth > 10) throw Error('อัตราการเท อุณหภูมิ ค่ายุบตัว หรือความลึกเครื่องจี้อยู่นอกขอบเขต');
  if (x.studSpacing > x.length || x.tieSpacing > x.length || x.braceSpacing > x.length || x.walerSpacing > x.height) throw Error('ระยะสมาชิกมากกว่าขนาดผนัง');
  if (x.braceHeight > x.height || x.braceAngle < 20 || x.braceAngle > 75) throw Error('จุดยึดค้ำยันต้องไม่สูงกว่าผนัง และมุมค้ำยัน 20–75°');
  if (x.windPressure < 0.72 || x.windPressure > 10) throw Error('แรงลมออกแบบต้องไม่น้อยกว่า 0.72 kPa (ACI §4.2.3.1) และไม่เกิน 10 kPa');
  if (x.tieFu < x.tieFy || x.tieFu > 2000) throw Error('Fu ของ Tie ต้องไม่น้อยกว่า Fy');
  return Object.fromEntries(keys.map(k => [k, x[k]])) as unknown as WallInput;
}

/** Stored wall input, or a draft seeded from a wall case footprint (X = length, Y = thickness, height); never confirmed. */
export function wallFromCase(stored: unknown, footprint?: {width: number; length: number; height: number}): WallInput {
  if (stored != null) {try {return validateWallInput(stored);} catch { /* unreadable → seed below */ }}
  if (footprint) {
    const H = footprint.height;
    try {return validateWallInput({...wallDefaults, length: footprint.width, t: footprint.length, height: H, braceHeight: Math.min(wallDefaults.braceHeight, Math.round(H * 2 / 3)), confirmed: false});} catch { /* fall through */ }
  }
  return {...wallDefaults};
}

/** Uniform load w (N/mm) on a member of length L pinned at x = 0 and supported at x = a (overhang L − a).
 * Returns reactions, the governing moment/shear and the larger of the span and tip deflections (with their limits' reference length). */
export function proppedOverhang(w: number, L: number, a: number, E: number, I: number) {
  if ([w, L, a, E, I].some(v => !Number.isFinite(v) || v <= 0) || a > L) throw Error('Invalid overhang member');
  const Ra = w * L * L / (2 * a), R0 = w * L - Ra, c = L - a;
  const M = (x: number) => R0 * x + (x > a ? Ra * (x - a) : 0) - w * x * x / 2;
  const Mspan = R0 > 0 ? Math.max(0, R0 * R0 / (2 * w)) : 0, Msupport = w * c * c / 2;
  const V = Math.max(Math.abs(R0), Math.abs(R0 - w * a), w * c);
  // EI y'' = M, y(0) = y(a) = 0, integrated numerically (trapezoid, 4000 steps).
  const n = 4000, h = L / n, slope = [0], y = [0];
  for (let i = 1; i <= n; i++) slope.push(slope[i - 1] + (M((i - 1) * h) + M(i * h)) / 2 * h);
  for (let i = 1; i <= n; i++) y.push(y[i - 1] + (slope[i - 1] + slope[i]) / 2 * h);
  const ia = Math.round(a / h), k = y[ia] / (ia * h), d = y.map((v, i) => (v - k * i * h) / (E * I));
  const span = Math.max(...d.slice(0, ia + 1).map(Math.abs)), tip = Math.abs(d[n]);
  return {R0, Ra, Mmax: Math.max(Mspan, Msupport), V, span, tip, c};
}

export interface WallQuantity {item: string; spec: string; qty: number; unit: string; note: string}
export interface WallResult {
  engineVersion: string; input: WallInput; status: Status; checks: Check[]; blockers: string[]; pressureModel: PressureModel; plywood: PlywoodDesign;
  stud: MemberMaterial; waler: MemberMaterial; strongback: MemberMaterial | null;
  /** Stud and tie stations along the wall, waler levels up the height, brace/strongback stations (mm). Ties are empty for single-sided walls. */
  studs: number[]; levels: number[]; ties: number[]; braces: number[];
  studLine: number; walerLine: number; tieForce: number; tieBody: number;
  /** Governing ACI §4.2.3 overturning moment per metre (kN·m/m), its source, and the axial force per brace (kN). */
  braceMoment: number; braceGoverning: string; braceForce: number;
  /** Single-sided: strongback reactions per station (kN) at the base and at the brace, base anchor shear/uplift (kN). */
  strongbackBase: number | null; strongbackBrace: number | null; anchorShear: number | null; anchorUplift: number | null;
  volume: number; formArea: number; quantities: WallQuantity[];
}

export function calculateWall(raw: unknown): WallResult {
  const x = validateWallInput(raw), {checks, add, member, uniform} = checker(x.deflectionRatio), single = x.system === 'SINGLE_SIDED';
  const stud = material(x.studSectionId, x), waler = material(x.walerSectionId, x), strongback = single ? material(x.strongbackSectionId, x) : null, plySource = plywoodSource(x.plywoodGrade);
  const pressureModel = lateralPressure({pressureMethod: x.pressureMethod, gamma: x.gamma, height: x.height, width: x.t, length: x.length, pourRate: x.pourRate,
    concreteTemp: x.concreteTemp, slump: x.slump, vibrationDepth: x.vibrationDepth, chemistryCc: x.chemistryCc}), p = pressureModel.pmax;
  const studs = equalPositions(x.length, x.studSpacing), st = x.length / (studs.length - 1);
  const levels = equalPositions(x.height, x.walerSpacing), sw = x.height / (levels.length - 1);
  const ties = single ? [] : equalPositions(x.length, x.tieSpacing), stt = single ? 0 : x.length / (ties.length - 1);
  const braces = equalPositions(x.length, x.braceSpacing), sb = x.length / (braces.length - 1);
  const plywood = plywoodDesign({...plywoodOptions(x), pressure: p, spacing: st, studWidth: stud.section.B});
  for (const k of plywood.checks) add(k.id, 'ไม้อัด · ' + k.label, k.demand, k.limit, k.unit, k.formula, k.substitution + `; pmax = ${fx(p)} kPa`, k.note, plySource);
  const studLine = p / 1000 * st;
  uniform('stud', 'คร่าว (แนวตั้ง)', stud, 1, studLine, sw, `w = pmax × s = ${fx(p)} × ${fx(st, 0)} / 1000 = ${fx(studLine, 3)} N/mm; L = ระยะคานคู่ ${fx(sw, 0)} mm`);
  const walerLine = p / 1000 * sw, walerSpan = single ? sb : stt;
  uniform('waler', 'คานคู่ (แนวนอน)', waler, 2, walerLine, walerSpan, `w = pmax × ระยะคานคู่ = ${fx(p)} × ${fx(sw, 0)} / 1000 = ${fx(walerLine, 3)} N/mm (แรงจากคร่าวเฉลี่ยเป็นแรงแผ่); L = ${single ? 'ระยะ strongback' : 'ระยะ Tie'} ${fx(walerSpan, 0)} mm`);
  const studBearing = bearingCheck(add, 'bear-stud', 'แรงกดที่จุดสัมผัส: คร่าวบนคานคู่', studLine * sw, stud, waler, 2,
    `R = w_stud × ระยะคานคู่ = ${fx(studLine, 3)} × ${fx(sw, 0)} (คร่าวภายใน, คานคู่ 2 ตัว)`);
  const Ag = Math.PI * x.tieDiameter ** 2 / 4, tieBody = x.tieFy * Ag / x.tieOmega / 1000, tieForce = single ? 0 : walerLine * stt / 1000;
  if (!single) {
    add('tie-body', 'Tie: ตัวเหล็กเริ่มคราก', tieForce, tieBody, 'kN', 'T = pmax × sw × st ≤ Fy Ag / Ω',
      `T = ${fx(p)} kPa × ${fx(sw / 1000, 3)} m × ${fx(stt / 1000, 3)} m = ${fx(tieForce)} kN; Ag = π × ${x.tieDiameter}² / 4 = ${fx(Ag, 0)} mm²; Fy = ${x.tieFy} MPa; Ω = ${x.tieOmega}`,
      'ตรวจเฉพาะหน้าตัดเต็มของเหล็ก ไม่รวมเกลียว นัต แผ่นรอง หรือปลอก', 'Fy ตาม มอก. 24 (SD40 = 390 MPa) · ต้องยืนยันใบรับรอง');
    const tieUlt = x.tieFu * Ag / 2 / 1000;
    add('tie-ult', 'Tie: กำลังประลัย / 2.0 (ACI Table 4.4)', tieForce, tieUlt, 'kN', 'T ≤ Fu Ag / 2.0',
      `T = ${fx(tieForce)} kN; Fu = ${x.tieFu} MPa; Ag = ${fx(Ag, 0)} mm² → ${fx(tieUlt)} kN`, 'ACI Table 4.4 ส่วนปลอดภัย 2.0 เทียบกำลังประลัย ใช้หน้าตัดเต็ม ถ้าเป็นเหล็กเกลียวต้องใช้พื้นที่สุทธิหรือ SWL ของชุด Tie', 'ACI PRC-347-14(21) Table 4.4 · Fu ตาม มอก. 24 (SD40 = 560 MPa)');
    add('tie-t', 'Tie: ชุดอุปกรณ์ (SWL)', tieForce, x.tieSWL > 0 ? x.tieSWL : null, 'kN', 'T ≤ SWL ชุด Tie (ผู้ผลิต)', `T = ${fx(tieForce)} kN` + (x.tieSWL > 0 ? `; SWL = ${fx(x.tieSWL)} kN` : '; ยังไม่มี SWL ชุด Tie'),
      'ACI Table 4.4: ส่วนปลอดภัย ≥ 2.0 เทียบกำลังประลัยของชุด Tie ใหม่', 'ACI PRC-347-14(21) Table 4.4 · ค่าผู้ผลิต');
  }
  // ACI §4.2.3: overturning per metre from 1.5 kN/m at the top or the design wind (≥ 0.72 kPa) over the height, resisted by braces at braceHeight.
  const H = x.height / 1000, w = x.windPressure, Mtop = 1.5 * H, Mwind = w * H * H / 2, braceMoment = Math.max(Mtop, Mwind), braceGoverning = Mtop >= Mwind ? '1.5 kN/m ที่ยอด' : `ลม ${fx(w)} kPa`;
  const rad = x.braceAngle * Math.PI / 180, cos = Math.cos(rad), lateralForce = braceMoment * sb / 1000 / (x.braceHeight / 1000 * cos);
  let braceForce = lateralForce, strongbackBase: number | null = null, strongbackBrace: number | null = null, anchorShear: number | null = null, anchorUplift: number | null = null;
  const lateralSub = `M = max(1.5 × ${fx(H)}, ${fx(w)} × ${fx(H)}² / 2) = ${fx(braceMoment, 3)} kN·m/m (${braceGoverning})`;
  if (single && strongback) {
    // Strongback at every brace station: pinned at the base, held by the brace at hb, overhang above; full pmax over the height (screening envelope).
    const ws = p / 1000 * sb, sbm = proppedOverhang(ws, x.height, x.braceHeight, strongback.E, strongback.I);
    member('strongback', 'Strongback (แนวตั้ง ต่อสถานีค้ำยัน)', strongback, x.strongbackCount, sbm.Mmax, sbm.V, sbm.span, x.braceHeight,
      `w = pmax × sb = ${fx(p)} × ${fx(sb, 0)} / 1000 = ${fx(ws, 3)} N/mm; ฐานเป็นจุดหมุน รองรับที่ค้ำยัน hb = ${fx(x.braceHeight, 0)} mm, ยื่น ${fx(sbm.c, 0)} mm; R_brace = wH²/(2hb) = ${fx(sbm.Ra / 1000)} kN, R_base = wH − R_brace = ${fx(sbm.R0 / 1000)} kN`);
    if (sbm.c > 0) add('strongback-tip', 'Strongback: การโก่งปลายยื่น', sbm.tip / x.strongbackCount, 2 * sbm.c / x.deflectionRatio, 'mm', 'δปลาย ≤ 2c / n',
      `c = ${fx(sbm.c, 0)} mm; δ จากการอินทิเกรต EIy″ = M (y(0) = y(hb) = 0)`, 'ปลายยื่นเหนือจุดค้ำ ใช้ความยาวอ้างอิง 2c', strongback.source);
    strongbackBase = sbm.R0 / 1000; strongbackBrace = sbm.Ra / 1000;
    braceForce = strongbackBrace / cos + lateralForce;
    anchorShear = Math.abs(strongbackBase); anchorUplift = braceForce * Math.sin(rad);
    add('anchor', 'พุก/ฐานแบบด้านเดียว: แรงลัพธ์ต่อสถานี', Math.hypot(anchorShear, anchorUplift), x.anchorSWL > 0 ? x.anchorSWL : null, 'kN', 'R = √(V² + U²); V = R_base, U = P sin θ',
      `V = ${fx(anchorShear)} kN; U = ${fx(braceForce)} × sin ${x.braceAngle}° = ${fx(anchorUplift)} kN` + (x.anchorSWL > 0 ? `; SWL = ${fx(x.anchorSWL)} kN` : '; ยังไม่มี SWL พุก'),
      'แรงยกจากองค์ประกอบแนวดิ่งของค้ำยัน (ACI §4.1.4d) ไม่หักน้ำหนักแบบ · ต้องตรวจระยะฝังและคอนกรีตฐาน', 'ACI PRC-347-14(21) §4.1.4d · ค่าผู้ผลิตพุก');
  }
  add('brace-p', 'ค้ำยันเอียง: แรงตามแนวแกนต่อตัว', braceForce, x.braceSWL > 0 ? x.braceSWL : null, 'kN',
    single ? 'P = R_brace / cos θ + M × sb / (hb cos θ)' : 'P = M × sb / (hb cos θ); M = max(1.5 H, w H²/2)',
    (single ? `แรงดันคอนกรีต: ${fx(strongbackBrace!)} / cos ${x.braceAngle}° = ${fx(strongbackBrace! / cos)} kN; ` : '') +
    `${lateralSub}; แรงด้านข้าง = ${fx(braceMoment, 3)} × ${fx(sb / 1000, 3)} / (${fx(x.braceHeight / 1000)} × cos ${x.braceAngle}°) = ${fx(lateralForce)} kN` + (single ? ` → รวม ${fx(braceForce)} kN` : '') +
    (x.braceSWL > 0 ? `; SWL = ${fx(x.braceSWL)} kN` : '; ยังไม่มี SWL ค้ำยัน'),
    single ? 'แบบด้านเดียว: ค้ำยันรับแรงดันคอนกรีตทั้งหมด (รวมกับแรงด้านข้าง ACI แบบปลอดภัยไว้ก่อน) ต้องตรวจการโก่งเดาะของค้ำยันตามความยาวจริง' : 'ฐานแบบเป็นจุดหมุน ค้ำยันรับแรงทั้งดึงและอัด (push-pull) ต้องตรวจจุดยึดปลายและพุกฐาน',
    x.braceSWL > 0 ? 'ค่าผู้ผลิต: ' + (x.braceReference || 'ไม่ระบุแหล่งอ้างอิง') : ACI_BRACING_REFERENCE);
  const blockers = [
    ...(!x.confirmed ? ['ยังไม่ยืนยันมิติผนังจากแบบต้นฉบับ'] : []),
    ...(!single && !(x.tieSWL > 0) ? ['ต้องกรอก SWL ชุด Tie (ข้อมูลผู้ผลิต)'] : []),
    ...(x.braceSWL > 0 ? [] : ['ต้องกรอก SWL ค้ำยันเอียงที่ความยาวใช้งาน (ข้อมูลผู้ผลิต)']),
    ...(single && !(x.anchorSWL > 0) ? ['ต้องกรอก SWL พุกฐานแบบ/ค้ำยัน (ข้อมูลผู้ผลิต) และตรวจคอนกรีตฐาน'] : []),
    single ? 'แบบด้านเดียว: ตรวจการยึด strongback กับคานคู่ การโก่งเดาะของค้ำยัน และความแข็งของผิวที่เทชน (ดิน/ผนังเดิม)' : 'ออกแบบจุดยึดค้ำยันกับคานคู่/คร่าว และพุกฐานค้ำยัน (ดึงขึ้นและแรงเฉือน)',
    'ตรวจมุมผนัง ปลายผนัง และรอยต่อแบบ (ต้องมีชุดยึดมุมหรือ Tie มุมเพิ่ม)',
    ...(studBearing ? [] : ['ตรวจแรงกดเฉพาะที่ของคร่าวเหล็กบนคานคู่เหล็ก (local yielding/web crippling ตาม AISC 360 หรือข้อมูลผู้ผลิต)']),
  ];
  const faces = single ? 1 : 2, formArea = faces * x.length * x.height / 1e6, sheet = 1.22 * 2.44, tieLength = x.t + 2 * (x.plywood + stud.section.H + waler.section.H + 80);
  const braceLength = x.braceHeight / Math.sin(rad), side = single ? 'ด้านเดียว' : 'สองด้าน';
  const quantities: WallQuantity[] = [
    {item: `ไม้อัด (${side})`, spec: `${x.plywood} mm · ${x.plywoodGrade}`, qty: Math.ceil(formArea / sheet * 1.05), unit: 'แผ่น', note: `${fx(formArea)} m² + เผื่อตัด 5%`},
    {item: 'คร่าว (แนวตั้ง)', spec: stud.name, qty: faces * studs.length, unit: 'ท่อน', note: `ยาว ${fx(x.height, 0)} mm @ ${fx(st, 0)} mm ${side}`},
    {item: 'คานคู่ (แนวนอน)', spec: waler.name + ' (คู่)', qty: faces * 2 * levels.length, unit: 'เส้น', note: `ยาว ${fx(x.length, 0)} mm · ${levels.length} ระดับ × ${faces} ด้าน`},
    ...(single ? [{item: 'Strongback (แนวตั้ง)', spec: strongback!.name + (x.strongbackCount > 1 ? ' (คู่)' : ''), qty: braces.length * x.strongbackCount, unit: 'ท่อน', note: `ยาว ${fx(x.height, 0)} mm ที่ทุกสถานีค้ำยัน`},
      {item: 'พุกฐานแบบ', spec: 'ระบุรุ่นจากผู้ผลิต', qty: braces.length, unit: 'ชุด', note: 'ที่ฐาน strongback ทุกสถานี'}]
      : [{item: 'Tie ทะลุผนัง + ปลอก + นัต/แผ่นรอง', spec: `Ø${x.tieDiameter} mm`, qty: levels.length * ties.length, unit: 'ชุด', note: `ยาว ≈ ${fx(tieLength, 0)} mm @ ${fx(stt, 0)} mm`}]),
    {item: 'ค้ำยันเอียง (push-pull) + พุก', spec: x.braceReference || 'ระบุรุ่นจากผู้ผลิต', qty: braces.length, unit: 'ตัว', note: `ยาว ≈ ${fx(braceLength, 0)} mm @ ${fx(sb, 0)} mm ด้านเดียว`},
  ];
  return {engineVersion: WALL_ENGINE_VERSION, input: x, status: checks.some(k => k.status === 'FAIL') ? 'FAIL' : 'INCOMPLETE', checks, blockers, pressureModel, plywood, stud, waler, strongback,
    studs, levels, ties, braces, studLine, walerLine, tieForce, tieBody, braceMoment, braceGoverning, braceForce, strongbackBase, strongbackBrace, anchorShear, anchorUplift,
    volume: x.length * x.t * x.height / 1e9, formArea, quantities};
}

export const WALL_SPACINGS = [
  {key: 'studSpacing', label: 'ระยะคร่าว', prefixes: ['ply-', 'stud-']},
  {key: 'walerSpacing', label: 'ระยะคานคู่ (แนวตั้ง)', prefixes: ['stud-', 'waler-', 'tie-']},
  {key: 'tieSpacing', label: 'ระยะ Tie', prefixes: ['waler-', 'tie-']},
  {key: 'braceSpacing', label: 'ระยะ strongback / ค้ำยัน', prefixes: ['waler-', 'strongback-', 'brace-', 'anchor']},
] as const;
/** Largest requested spacing (25 mm steps) without FAIL in the members it governs. Never changes sections. */
export function wallAdvice(x: WallInput) {
  // Single-sided walls have no ties; their walers span between strongbacks, so the brace spacing governs instead.
  return WALL_SPACINGS.filter(s => x.system === 'SINGLE_SIDED' ? s.key !== 'tieSpacing' : s.key !== 'braceSpacing').map(s => {
    const cap = Math.min(s.key === 'walerSpacing' ? x.height : x.length, 3000);
    const ok = (v: number) => {try {return !calculateWall({...x, [s.key]: v}).checks.some(k => s.prefixes.some(p => k.id.startsWith(p)) && k.status === 'FAIL');} catch {return false;}};
    let best: number | null = null;
    for (let v = cap; v >= 100; v -= 25) if (ok(v)) {best = v; break;}
    const unchecked = calculateWall(x).checks.filter(k => s.prefixes.some(p => k.id.startsWith(p)) && k.limit === null).map(k => k.label);
    return {key: s.key, label: s.label, current: x[s.key], max: best, unchecked};
  });
}
