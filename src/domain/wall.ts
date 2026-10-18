/** Practical two-sided wall formwork screening: pressure → plywood → vertical studs → horizontal twin walers → through ties,
 * plus the ACI §4.2.3 bracing demand for alignment/stability. Units: mm, N, MPa, kPa, kN. Status is FAIL or INCOMPLETE, never PASS. */
import {CC_VALUES,lateralPressure,type PressureMethod,type PressureModel} from './pressure.js';
import {FACE_GRAINS,PLYWOOD_GRADES,PLYWOOD_SPANS,plywoodDesign,type FaceGrain,type PlywoodDesign,type PlywoodGrade,type PlywoodSpans} from './plywoodGrades.js';
import {sectionById,timberGrade} from './sectionStock.js';
import {equalPositions} from './mechanics.js';
import {checker,fx,material,plywoodOptions,plywoodSource,type MemberMaterial} from './members.js';
import type {Check,Status} from './index.js';

export const WALL_ENGINE_VERSION = 'wall-0.1.0-screening';
export const ACI_BRACING_REFERENCE = 'ACI PRC-347-14(21) §4.2.3.1 (ลมไม่น้อยกว่า 0.72 kPa) และ §4.2.3.3 (แรงด้านข้างไม่น้อยกว่า 1.5 kN/m ที่ยอดแบบ)';
export interface WallInput {
  /** Wall length, thickness and pour height (mm). */
  length: number; t: number; height: number; confirmed: boolean;
  gamma: number; deflectionRatio: number;
  pressureMethod: PressureMethod; pourRate: number; concreteTemp: number; slump: number; vibrationDepth: number; chemistryCc: number;
  plywood: number; plywoodGrade: PlywoodGrade; plywoodSpans: PlywoodSpans; plywoodFaceGrain: FaceGrain; plywoodE: number; plywoodFb: number;
  timberGrade: string; steelFy: number; steelE: number; steelOmegaB: number; steelOmegaShear: number;
  /** Vertical studs at studSpacing along the wall; horizontal twin walers at walerSpacing up the height. */
  studSectionId: string; studSpacing: number; walerSectionId: string; walerSpacing: number;
  /** Through ties along each waler level at tieSpacing. Body screen Fy·Ag/Ω; assembly SWL from the manufacturer (0 = unknown). */
  tieSpacing: number; tieDiameter: number; tieFy: number; tieOmega: number; tieSWL: number;
  /** Push-pull braces on one face: spacing along the wall, attachment height, angle from horizontal (deg), SWL (kN, 0 = unknown). */
  braceSpacing: number; braceHeight: number; braceAngle: number; braceSWL: number; braceReference: string;
}
export const wallDefaults: WallInput = {
  length: 6000, t: 250, height: 3000, confirmed: false, gamma: 24, deflectionRatio: 360,
  pressureMethod: 'HYDROSTATIC', pourRate: 2, concreteTemp: 30, slump: 100, vibrationDepth: 1, chemistryCc: 1.2,
  plywood: 20, plywoodGrade: 'PLYFORM_I', plywoodSpans: 'AUTO', plywoodFaceGrain: 'ACROSS', plywoodE: 4800, plywoodFb: 5.3,
  timberGrade: 'TIMBER-BOOK-SOFT', steelFy: 245, steelE: 200000, steelOmegaB: 1.67, steelOmegaShear: 1.67,
  studSectionId: 'PAP-TIS107-SHS-50x50x2.3', studSpacing: 300, walerSectionId: 'PAP-TIS107-RHS-100x50x3.2', walerSpacing: 600,
  tieSpacing: 600, tieDiameter: 16, tieFy: 390, tieOmega: 1.67, tieSWL: 0,
  braceSpacing: 2000, braceHeight: 2000, braceAngle: 60, braceSWL: 0, braceReference: '',
};
const TEXT_KEYS = ['confirmed', 'pressureMethod', 'plywoodGrade', 'plywoodSpans', 'plywoodFaceGrain', 'timberGrade', 'studSectionId', 'walerSectionId', 'braceReference'];
const NON_NEGATIVE = ['tieSWL', 'braceSWL'];

export function validateWallInput(v: unknown): WallInput {
  if (!v || typeof v !== 'object') throw Error('ข้อมูลผนังไม่ถูกต้อง');
  const q = v as Record<string, unknown>, keys = Object.keys(wallDefaults) as (keyof WallInput)[];
  if (Object.keys(q).some(k => !keys.includes(k as keyof WallInput))) throw Error('มีช่องข้อมูลผนังที่ไม่รองรับ');
  for (const k of keys.filter(k => !TEXT_KEYS.includes(k))) {
    const n = q[k], min = NON_NEGATIVE.includes(k) ? 0 : Number.MIN_VALUE;
    if (typeof n !== 'number' || !Number.isFinite(n) || n < min) throw Error((min === 0 ? 'ค่าต้องไม่ติดลบ: ' : 'ค่าต้องเป็นจำนวนบวก: ') + k);
  }
  const x = q as unknown as WallInput;
  if (typeof x.confirmed !== 'boolean') throw Error('สถานะยืนยันไม่ถูกต้อง');
  if (!PLYWOOD_GRADES.includes(x.plywoodGrade) || !PLYWOOD_SPANS.includes(x.plywoodSpans) || !FACE_GRAINS.includes(x.plywoodFaceGrain)) throw Error('ชนิด จำนวนช่วง หรือทิศลายไม้อัดไม่ถูกต้อง');
  if (!['HYDROSTATIC', 'ACI347'].includes(x.pressureMethod) || !CC_VALUES.includes(x.chemistryCc as typeof CC_VALUES[number])) throw Error('วิธีคำนวณแรงดันหรือค่า Cc ไม่ถูกต้อง');
  if (typeof x.timberGrade !== 'string' || !timberGrade(x.timberGrade)) throw Error('ชั้นไม้ไม่ถูกต้อง');
  if (typeof x.braceReference !== 'string' || x.braceReference.length > 300) throw Error('แหล่งอ้างอิงค้ำยันไม่ถูกต้อง');
  for (const [k, role] of [['studSectionId', 'stud'], ['walerSectionId', 'waler']] as const) {
    const s = typeof x[k] === 'string' ? sectionById(x[k]) : undefined;
    if (!s || !s.roles.includes(role)) throw Error('ไม่พบหน้าตัดในตารางเหล็ก/ไม้: ' + k);
  }
  if (x.length > 30000 || x.t > 3000 || x.height > 15000 || x.gamma > 40 || x.plywood > 100 || x.tieDiameter > 50) throw Error('ขนาดผนังอยู่นอกขอบเขต');
  if (x.deflectionRatio > 2000 || x.steelFy > 1000 || x.steelE > 300000 || x.tieFy > 1000 || [x.steelOmegaB, x.steelOmegaShear, x.tieOmega].some(o => o < 1 || o > 10)) throw Error('พารามิเตอร์วัสดุอยู่นอกขอบเขต');
  if (x.pourRate > 20 || x.concreteTemp < 5 || x.concreteTemp > 45 || x.slump > 300 || x.vibrationDepth > 10) throw Error('อัตราการเท อุณหภูมิ ค่ายุบตัว หรือความลึกเครื่องจี้อยู่นอกขอบเขต');
  if (x.studSpacing > x.length || x.tieSpacing > x.length || x.braceSpacing > x.length || x.walerSpacing > x.height) throw Error('ระยะสมาชิกมากกว่าขนาดผนัง');
  if (x.braceHeight > x.height || x.braceAngle < 20 || x.braceAngle > 75) throw Error('จุดยึดค้ำยันต้องไม่สูงกว่าผนัง และมุมค้ำยัน 20–75°');
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

export interface WallQuantity {item: string; spec: string; qty: number; unit: string; note: string}
export interface WallResult {
  engineVersion: string; input: WallInput; status: Status; checks: Check[]; blockers: string[]; pressureModel: PressureModel; plywood: PlywoodDesign;
  stud: MemberMaterial; waler: MemberMaterial;
  /** Stud and tie stations along the wall, waler levels up the height (mm). */
  studs: number[]; levels: number[]; ties: number[]; braces: number[];
  studLine: number; walerLine: number; tieForce: number; tieBody: number;
  /** Governing overturning moment per metre (kN·m/m), its source, and the axial force per brace (kN). */
  braceMoment: number; braceGoverning: string; braceForce: number; volume: number; formArea: number; quantities: WallQuantity[];
}

export function calculateWall(raw: unknown): WallResult {
  const x = validateWallInput(raw), {checks, add, uniform} = checker(x.deflectionRatio);
  const stud = material(x.studSectionId, x), waler = material(x.walerSectionId, x), plySource = plywoodSource(x.plywoodGrade);
  const pressureModel = lateralPressure({pressureMethod: x.pressureMethod, gamma: x.gamma, height: x.height, width: x.t, length: x.length, pourRate: x.pourRate,
    concreteTemp: x.concreteTemp, slump: x.slump, vibrationDepth: x.vibrationDepth, chemistryCc: x.chemistryCc}), p = pressureModel.pmax;
  const studs = equalPositions(x.length, x.studSpacing), st = x.length / (studs.length - 1);
  const levels = equalPositions(x.height, x.walerSpacing), sw = x.height / (levels.length - 1);
  const ties = equalPositions(x.length, x.tieSpacing), stt = x.length / (ties.length - 1);
  const braces = equalPositions(x.length, x.braceSpacing), sb = x.length / (braces.length - 1);
  const plywood = plywoodDesign({...plywoodOptions(x), pressure: p, spacing: st, studWidth: stud.section.B});
  for (const k of plywood.checks) add(k.id, 'ไม้อัด · ' + k.label, k.demand, k.limit, k.unit, k.formula, k.substitution + `; pmax = ${fx(p)} kPa`, k.note, plySource);
  const studLine = p / 1000 * st;
  uniform('stud', 'คร่าว (แนวตั้ง)', stud, 1, studLine, sw, `w = pmax × s = ${fx(p)} × ${fx(st, 0)} / 1000 = ${fx(studLine, 3)} N/mm; L = ระยะคานคู่ ${fx(sw, 0)} mm`);
  const walerLine = p / 1000 * sw;
  uniform('waler', 'คานคู่ (แนวนอน)', waler, 2, walerLine, stt, `w = pmax × ระยะคานคู่ = ${fx(p)} × ${fx(sw, 0)} / 1000 = ${fx(walerLine, 3)} N/mm (แรงจากคร่าวเฉลี่ยเป็นแรงแผ่); L = ระยะ Tie ${fx(stt, 0)} mm`);
  const tieForce = walerLine * stt / 1000, Ag = Math.PI * x.tieDiameter ** 2 / 4, tieBody = x.tieFy * Ag / x.tieOmega / 1000;
  add('tie-body', 'Tie: ตัวเหล็กเริ่มคราก', tieForce, tieBody, 'kN', 'T = pmax × sw × st ≤ Fy Ag / Ω',
    `T = ${fx(p)} kPa × ${fx(sw / 1000, 3)} m × ${fx(stt / 1000, 3)} m = ${fx(tieForce)} kN; Ag = π × ${x.tieDiameter}² / 4 = ${fx(Ag, 0)} mm²; Fy = ${x.tieFy} MPa; Ω = ${x.tieOmega}`,
    'ตรวจเฉพาะหน้าตัดเต็มของเหล็ก ไม่รวมเกลียว นัต แผ่นรอง หรือปลอก', 'Fy ตาม มอก. 24 (SD40 = 390 MPa) · ต้องยืนยันใบรับรอง');
  add('tie-t', 'Tie: ชุดอุปกรณ์ (SWL)', tieForce, x.tieSWL > 0 ? x.tieSWL : null, 'kN', 'T ≤ SWL ชุด Tie (ผู้ผลิต)', `T = ${fx(tieForce)} kN` + (x.tieSWL > 0 ? `; SWL = ${fx(x.tieSWL)} kN` : '; ยังไม่มี SWL ชุด Tie'),
    'ACI Table 4.4: ส่วนปลอดภัย ≥ 2.0 เทียบกำลังประลัยของชุด Tie ใหม่', 'ACI PRC-347-14(21) Table 4.4 · ค่าผู้ผลิต');
  // ACI §4.2.3: overturning per metre from 1.5 kN/m at the top or 0.72 kPa wind over the height, resisted by braces at braceHeight.
  const H = x.height / 1000, Mtop = 1.5 * H, Mwind = 0.72 * H * H / 2, braceMoment = Math.max(Mtop, Mwind), braceGoverning = Mtop >= Mwind ? '1.5 kN/m ที่ยอด' : 'ลม 0.72 kPa';
  const cos = Math.cos(x.braceAngle * Math.PI / 180), braceForce = braceMoment * sb / 1000 / (x.braceHeight / 1000 * cos);
  add('brace-p', 'ค้ำยันเอียง: แรงตามแนวแกนต่อตัว', braceForce, x.braceSWL > 0 ? x.braceSWL : null, 'kN', 'P = M × sb / (hb cos θ); M = max(1.5 H, 0.72 H²/2)',
    `M = max(1.5 × ${fx(H)}, 0.72 × ${fx(H)}² / 2) = ${fx(braceMoment, 3)} kN·m/m (${braceGoverning}); P = ${fx(braceMoment, 3)} × ${fx(sb / 1000, 3)} / (${fx(x.braceHeight / 1000)} × cos ${x.braceAngle}°) = ${fx(braceForce)} kN` +
    (x.braceSWL > 0 ? `; SWL = ${fx(x.braceSWL)} kN` : '; ยังไม่มี SWL ค้ำยัน'), 'ฐานแบบเป็นจุดหมุน ค้ำยันรับแรงทั้งดึงและอัด (push-pull) ต้องตรวจจุดยึดปลายและพุกฐาน',
    x.braceSWL > 0 ? 'ค่าผู้ผลิต: ' + (x.braceReference || 'ไม่ระบุแหล่งอ้างอิง') : ACI_BRACING_REFERENCE);
  const blockers = [
    ...(!x.confirmed ? ['ยังไม่ยืนยันมิติผนังจากแบบต้นฉบับ'] : []),
    ...(x.tieSWL > 0 ? [] : ['ต้องกรอก SWL ชุด Tie (ข้อมูลผู้ผลิต)']),
    ...(x.braceSWL > 0 ? [] : ['ต้องกรอก SWL ค้ำยันเอียงที่ความยาวใช้งาน (ข้อมูลผู้ผลิต)']),
    'ออกแบบจุดยึดค้ำยันกับคานคู่/คร่าว และพุกฐานค้ำยัน (ดึงขึ้นและแรงเฉือน)',
    'ตรวจมุมผนัง ปลายผนัง และรอยต่อแบบ (ต้องมีชุดยึดมุมหรือ Tie มุมเพิ่ม)',
    'แบบจำลองนี้รองรับผนังที่มีแบบสองด้านเท่านั้น ผนังติดดิน/แบบด้านเดียวต้องออกแบบโครงค้ำแยก',
  ];
  const formArea = 2 * x.length * x.height / 1e6, sheet = 1.22 * 2.44, tieLength = x.t + 2 * (x.plywood + stud.section.H + waler.section.H + 80);
  const braceLength = x.braceHeight / Math.sin(x.braceAngle * Math.PI / 180);
  const quantities: WallQuantity[] = [
    {item: 'ไม้อัด (สองด้าน)', spec: `${x.plywood} mm · ${x.plywoodGrade}`, qty: Math.ceil(formArea / sheet * 1.05), unit: 'แผ่น', note: `${fx(formArea)} m² + เผื่อตัด 5%`},
    {item: 'คร่าว (แนวตั้ง)', spec: stud.name, qty: 2 * studs.length, unit: 'ท่อน', note: `ยาว ${fx(x.height, 0)} mm @ ${fx(st, 0)} mm สองด้าน`},
    {item: 'คานคู่ (แนวนอน)', spec: waler.name + ' (คู่)', qty: 2 * 2 * levels.length, unit: 'เส้น', note: `ยาว ${fx(x.length, 0)} mm · ${levels.length} ระดับ × 2 ด้าน`},
    {item: 'Tie ทะลุผนัง + ปลอก + นัต/แผ่นรอง', spec: `Ø${x.tieDiameter} mm`, qty: levels.length * ties.length, unit: 'ชุด', note: `ยาว ≈ ${fx(tieLength, 0)} mm @ ${fx(stt, 0)} mm`},
    {item: 'ค้ำยันเอียง (push-pull) + พุก', spec: x.braceReference || 'ระบุรุ่นจากผู้ผลิต', qty: braces.length, unit: 'ตัว', note: `ยาว ≈ ${fx(braceLength, 0)} mm @ ${fx(sb, 0)} mm ด้านเดียว`},
  ];
  return {engineVersion: WALL_ENGINE_VERSION, input: x, status: checks.some(k => k.status === 'FAIL') ? 'FAIL' : 'INCOMPLETE', checks, blockers, pressureModel, plywood, stud, waler,
    studs, levels, ties, braces, studLine, walerLine, tieForce, tieBody, braceMoment, braceGoverning, braceForce, volume: x.length * x.t * x.height / 1e9, formArea, quantities};
}

export const WALL_SPACINGS = [
  {key: 'studSpacing', label: 'ระยะคร่าว', prefixes: ['ply-', 'stud-']},
  {key: 'walerSpacing', label: 'ระยะคานคู่ (แนวตั้ง)', prefixes: ['stud-', 'waler-', 'tie-']},
  {key: 'tieSpacing', label: 'ระยะ Tie', prefixes: ['waler-', 'tie-']},
] as const;
/** Largest requested spacing (25 mm steps) without FAIL in the members it governs. Never changes sections. */
export function wallAdvice(x: WallInput) {
  return WALL_SPACINGS.map(s => {
    const cap = Math.min(s.key === 'walerSpacing' ? x.height : x.length, 3000);
    const ok = (v: number) => {try {return !calculateWall({...x, [s.key]: v}).checks.some(k => s.prefixes.some(p => k.id.startsWith(p)) && k.status === 'FAIL');} catch {return false;}};
    let best: number | null = null;
    for (let v = cap; v >= 100; v -= 25) if (ok(v)) {best = v; break;}
    const unchecked = calculateWall(x).checks.filter(k => s.prefixes.some(p => k.id.startsWith(p)) && k.limit === null).map(k => k.label);
    return {key: s.key, label: s.label, current: x[s.key], max: best, unchecked};
  });
}
