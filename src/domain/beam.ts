/** Practical beam formwork screening: soffit (plywood → transverse joists → longitudinal bearers → shores) and
 * side forms (plywood → vertical studs → optional tie rows with twin walers). Units: mm, N, MPa, kPa, kN.
 * Results are screening only: status is FAIL or INCOMPLETE, never PASS. */
import {CC_VALUES,lateralPressure,type PressureMethod,type PressureModel} from './pressure.js';
import {FACE_GRAINS,PLYWOOD_GRADES,PLYWOOD_SPANS,plywoodDesign,type FaceGrain,type PlywoodDesign,type PlywoodGrade,type PlywoodSpans} from './plywoodGrades.js';
import {sectionById,timberGrade} from './sectionStock.js';
import {bearingCheck,checker,fx,liveMinimums,material,plywoodOptions,plywoodSource,type MemberMaterial} from './members.js';
export type {MemberMaterial} from './members.js';
import {continuousSupportFactor, equalPositions} from './mechanics.js';
export {continuousSupportFactor} from './mechanics.js';
import type {Check,Status} from './index.js';

export const BEAM_ENGINE_VERSION = 'beam-0.3.0-screening';
export const ACI_LOADS_REFERENCE = 'ACI PRC-347-14(21) §4.2.1 (น้ำหนักบรรทุกแนวดิ่ง) และ §4.2.3.2 (แรงด้านข้างของแบบหล่อพื้นยก)';
export interface BeamInput {
  /** Beam width b, total depth h (top of slab to soffit), slab thickness, clear length, floor-to-soffit height (mm). */
  b: number; h: number; slabT: number; length: number; soffitHeight: number;
  /** Number of sides with a slab framing in (0 = isolated beam, 1 = edge beam, 2 = interior beam). */
  slabSides: 0 | 1 | 2;
  /** Slab strip widths (mm) beside the beam carried by this beam's joists (must lie between the bearer lines). */
  slabLeft: number; slabRight: number;
  confirmed: boolean;
  gamma: number; formDead: number; liveLoad: number; motorized: boolean; deflectionRatio: number;
  pressureMethod: PressureMethod; pourRate: number; concreteTemp: number; slump: number; vibrationDepth: number; chemistryCc: number;
  plywood: number; plywoodGrade: PlywoodGrade; plywoodSpans: PlywoodSpans; plywoodFaceGrain: FaceGrain; plywoodE: number; plywoodFb: number;
  timberGrade: string; steelFy: number; steelE: number; steelOmegaB: number; steelOmegaShear: number;
  /** Soffit: transverse joists at joistSpacing along the beam, spanning shoreWidth between two bearer lines. */
  joistSectionId: string; joistSpacing: number;
  /** Bearers run along the beam on the shore heads; bearerCount members per line share the load equally. */
  bearerSectionId: string; bearerCount: 1 | 2; shoreSpacing: number; shoreWidth: number;
  /** Shore safe working load at the actual extension (kN, manufacturer data). 0 = unknown → INCOMPLETE. */
  shoreSWL: number; shoreReference: string;
  /** Side forms: vertical studs at studSpacing; tieRows rows of through ties at tieSpacing with twin walers. */
  studSectionId: string; studSpacing: number; tieRows: number; tieSpacing: number; tieDiameter: number;
  /** Tie assembly safe working load (kN, manufacturer data incl. ACI Table 4.4 SF 2.0). 0 = unknown → INCOMPLETE. */
  tieSWL: number; walerSectionId: string;
  /** Tie rod body screen Fy·Ag/Ω (same basis as the wall module). */
  tieFy: number; tieOmega: number;
  /** Tie rod ultimate tensile strength (MPa) for the ACI Table 4.4 check (safety factor 2.0 on ultimate). */
  tieFu: number;
  /** Designed capacities along the beam (kN/m, user/manufacturer data): side-form bottom kicker, side-form top restraint,
   * soffit lateral bracing (ACI §4.2.3.2). 0 = not designed → INCOMPLETE. */
  kickerCapacity: number; topRestraintCapacity: number; lateralCapacity: number; restraintReference: string;
}
export const beamDefaults: BeamInput = {
  b: 300, h: 600, slabT: 120, length: 6000, soffitHeight: 3000, slabSides: 2, slabLeft: 0, slabRight: 0, confirmed: false,
  gamma: 24, formDead: 0.5, liveLoad: 2.4, motorized: false, deflectionRatio: 360,
  pressureMethod: 'HYDROSTATIC', pourRate: 2, concreteTemp: 30, slump: 100, vibrationDepth: 1, chemistryCc: 1.2,
  plywood: 20, plywoodGrade: 'PLYFORM_I', plywoodSpans: 'AUTO', plywoodFaceGrain: 'ACROSS', plywoodE: 4800, plywoodFb: 5.3,
  timberGrade: 'TIMBER-BOOK-SOFT', steelFy: 245, steelE: 200000, steelOmegaB: 1.67, steelOmegaShear: 1.67,
  joistSectionId: 'PAP-TIS107-SHS-50x50x2.3', joistSpacing: 300,
  bearerSectionId: 'PAP-TIS107-RHS-100x50x3.2', bearerCount: 1, shoreSpacing: 1200, shoreWidth: 900,
  shoreSWL: 0, shoreReference: '',
  studSectionId: 'PAP-TIS107-SHS-50x50x2.3', studSpacing: 300, tieRows: 0, tieSpacing: 600, tieDiameter: 12,
  tieSWL: 0, walerSectionId: 'PAP-TIS107-SHS-50x50x2.3',
  tieFy: 390, tieOmega: 1.67, tieFu: 560, kickerCapacity: 0, topRestraintCapacity: 0, lateralCapacity: 0, restraintReference: '',
};
/** Fields added after beam-0.1.0; stored beams without them read these values. */
const LATER = {tieFy: 390, tieOmega: 1.67, tieFu: 560, kickerCapacity: 0, topRestraintCapacity: 0, lateralCapacity: 0, restraintReference: ''};
const TEXT_KEYS = ['confirmed', 'motorized', 'pressureMethod', 'plywoodGrade', 'plywoodSpans', 'plywoodFaceGrain', 'timberGrade', 'joistSectionId', 'bearerSectionId',
  'studSectionId', 'walerSectionId', 'shoreReference', 'slabSides', 'bearerCount', 'restraintReference'] as const;
const NON_NEGATIVE = ['slabT', 'slabLeft', 'slabRight', 'shoreSWL', 'tieSWL', 'tieRows', 'formDead', 'kickerCapacity', 'topRestraintCapacity', 'lateralCapacity'] as const;

export function validateBeamInput(v: unknown): BeamInput {
  if (!v || typeof v !== 'object') throw Error('ข้อมูลคานไม่ถูกต้อง');
  const q = {...LATER, ...v} as Record<string, unknown>, keys = Object.keys(beamDefaults) as (keyof BeamInput)[];
  if (Object.keys(q).some(k => !keys.includes(k as keyof BeamInput))) throw Error('มีช่องข้อมูลคานที่ไม่รองรับ');
  for (const k of keys.filter(k => !(TEXT_KEYS as readonly string[]).includes(k))) {
    const n = q[k], min = (NON_NEGATIVE as readonly string[]).includes(k) ? 0 : Number.MIN_VALUE;
    if (typeof n !== 'number' || !Number.isFinite(n) || n < min) throw Error((min === 0 ? 'ค่าต้องไม่ติดลบ: ' : 'ค่าต้องเป็นจำนวนบวก: ') + k);
  }
  const x = q as unknown as BeamInput;
  if (typeof x.confirmed !== 'boolean' || typeof x.motorized !== 'boolean') throw Error('สถานะยืนยันไม่ถูกต้อง');
  if (![0, 1, 2].includes(x.slabSides) || ![1, 2].includes(x.bearerCount) || ![0, 1, 2, 3].includes(x.tieRows)) throw Error('จำนวนด้านพื้น จำนวนคานรับ หรือแถว Tie ไม่ถูกต้อง');
  if (!PLYWOOD_GRADES.includes(x.plywoodGrade) || !PLYWOOD_SPANS.includes(x.plywoodSpans) || !FACE_GRAINS.includes(x.plywoodFaceGrain)) throw Error('ชนิด จำนวนช่วง หรือทิศลายไม้อัดไม่ถูกต้อง');
  if (!['HYDROSTATIC', 'ACI347'].includes(x.pressureMethod) || !CC_VALUES.includes(x.chemistryCc as typeof CC_VALUES[number])) throw Error('วิธีคำนวณแรงดันหรือค่า Cc ไม่ถูกต้อง');
  if (typeof x.timberGrade !== 'string' || !timberGrade(x.timberGrade)) throw Error('ชั้นไม้ไม่ถูกต้อง');
  if (typeof x.shoreReference !== 'string' || x.shoreReference.length > 300) throw Error('แหล่งอ้างอิงค้ำยันไม่ถูกต้อง');
  if (typeof x.restraintReference !== 'string' || x.restraintReference.length > 300) throw Error('แหล่งอ้างอิงจุดยึดแบบไม่ถูกต้อง');
  if (x.tieFy > 1000 || x.tieFu > 2000 || x.tieFu < x.tieFy || x.tieOmega < 1 || x.tieOmega > 10 || x.tieDiameter > 50) throw Error('ค่า Tie (Fy, Fu, Ω, Ø) อยู่นอกขอบเขต');
  for (const [k, role] of [['joistSectionId', 'stud'], ['studSectionId', 'stud'], ['bearerSectionId', 'waler'], ['walerSectionId', 'waler']] as const) {
    const s = typeof x[k] === 'string' ? sectionById(x[k]) : undefined;
    if (!s || !s.roles.includes(role)) throw Error('ไม่พบหน้าตัดในตารางเหล็ก/ไม้: ' + k);
  }
  if (x.b > 3000 || x.h > 4000 || x.length > 30000 || x.soffitHeight > 20000 || x.gamma > 40 || x.plywood > 100) throw Error('ขนาดคานอยู่นอกขอบเขต');
  if (x.slabSides === 0 ? x.slabT !== 0 : x.slabT <= 0 || x.slabT >= x.h) throw Error(x.slabSides === 0 ? 'คานไม่มีพื้นต่อ ความหนาพื้นต้องเป็น 0' : 'ความหนาพื้นต้องมากกว่า 0 และน้อยกว่าความลึกคาน');
  if (x.slabSides === 0 && (x.slabLeft > 0 || x.slabRight > 0)) throw Error('คานไม่มีพื้นต่อ ไม่มีแถบพื้นที่รับ');
  if (x.slabSides === 1 && x.slabLeft > 0) throw Error('คานขอบ: พื้นอยู่ด้านขวา แถบพื้นด้านซ้ายต้องเป็น 0');
  if (x.slabLeft + x.b + x.slabRight > x.shoreWidth || x.b + 2 * Math.max(x.slabLeft, x.slabRight) > x.shoreWidth) throw Error('ความกว้างคาน + แถบพื้น ต้องอยู่ระหว่างแนวคานรับทั้งสอง (ระยะค้ำยันตามขวาง)');
  if (x.deflectionRatio > 2000 || x.steelFy > 1000 || x.steelE > 300000 || [x.steelOmegaB, x.steelOmegaShear].some(o => o < 1 || o > 10)) throw Error('พารามิเตอร์วัสดุอยู่นอกขอบเขต');
  if (x.pourRate > 20 || x.concreteTemp < 5 || x.concreteTemp > 45 || x.slump > 300 || x.vibrationDepth > 10) throw Error('อัตราการเท อุณหภูมิ ค่ายุบตัว หรือความลึกเครื่องจี้อยู่นอกขอบเขต');
  if (x.joistSpacing > x.length || x.shoreSpacing > x.length || x.studSpacing > x.length || x.tieSpacing > x.length) throw Error('ระยะสมาชิกมากกว่าความยาวคาน');
  return Object.fromEntries(keys.map(k => [k, x[k]])) as unknown as BeamInput;
}

/** Stored beam input, or a draft seeded from a beam case footprint (X = length, Y = width, height = depth); never confirmed. */
export function beamFromCase(stored: unknown, footprint?: {width: number; length: number; height: number}): BeamInput {
  if (stored != null) {try {return validateBeamInput(stored);} catch { /* unreadable → seed below */ }}
  if (footprint) {
    const b = footprint.length, h = footprint.height;
    try {return validateBeamInput({...beamDefaults, b, h, length: footprint.width, slabT: Math.min(beamDefaults.slabT, h / 2), shoreWidth: Math.max(beamDefaults.shoreWidth, b + 600), confirmed: false});} catch { /* fall through */ }
  }
  return {...beamDefaults};
}

/** Simply supported span L with uniform patches w (N/mm) on [a, c]. Exact Macaulay moment/deflection, sampled for the maxima. */
export function patchBeam(L: number, patches: {a: number; c: number; w: number}[], E: number, I: number) {
  if ([L, E, I].some(v => !Number.isFinite(v) || v <= 0) || patches.some(p => p.a < 0 || p.c > L + 1e-9 || p.c <= p.a || p.w < 0)) throw Error('Invalid patch beam');
  const B = (x: number, a: number) => Math.max(0, x - a);
  const total = patches.reduce((s, p) => s + p.w * (p.c - p.a), 0), RB = patches.reduce((s, p) => s + p.w * (p.c - p.a) * (p.a + p.c) / 2, 0) / L, RA = total - RB;
  const M = (x: number) => RA * x - patches.reduce((s, p) => s + p.w * (B(x, p.a) ** 2 - B(x, p.c) ** 2) / 2, 0);
  const C = (RA * L ** 3 / 6 - patches.reduce((s, p) => s + p.w * (B(L, p.a) ** 4 - B(L, p.c) ** 4) / 24, 0)) / L;
  const d = (x: number) => (C * x - RA * x ** 3 / 6 + patches.reduce((s, p) => s + p.w * (B(x, p.a) ** 4 - B(x, p.c) ** 4) / 24, 0)) / (E * I);
  let Mmax = 0, xM = 0, dmax = 0;
  for (let i = 0; i <= 2000; i++) {const x = L * i / 2000, m = M(x), y = d(x); if (m > Mmax) {Mmax = m; xM = x;} if (y > dmax) dmax = y;}
  return {RA, RB, total, Mmax, xM, Vmax: Math.max(RA, RB), dmax};
}

export interface BeamLoads {concrete: number; formDead: number; liveUsed: number; liveMin: number; totalMin: number; beam: number; slab: number; steps: string[]}
/** Vertical design loads per ACI PRC-347-14(21) §4.2.1 (kPa). */
export function beamLoads(x: BeamInput): BeamLoads {
  const {liveMin, totalMin} = liveMinimums(x.motorized), liveUsed = Math.max(x.liveLoad, liveMin);
  const concrete = x.gamma * x.h / 1000, slabC = x.gamma * x.slabT / 1000;
  const beam = Math.max(concrete + x.formDead + liveUsed, totalMin), slab = x.slabT > 0 ? Math.max(slabC + x.formDead + liveUsed, totalMin) : 0;
  const f = (v: number) => v.toFixed(2);
  const steps = [
    `คอนกรีต + เหล็กเสริมเหนือท้องคาน γh = ${f(x.gamma)} × ${f(x.h / 1000)} = ${f(concrete)} kPa`,
    `น้ำหนักแบบหล่อ (ค่าที่ผู้ใช้กำหนด) = ${f(x.formDead)} kPa`,
    `น้ำหนักจรขณะก่อสร้าง ใช้ max(${f(x.liveLoad)}, ${f(liveMin)}) = ${f(liveUsed)} kPa (ACI §4.2.1: ไม่น้อยกว่า ${liveMin} kPa${x.motorized ? ' เมื่อใช้รถเข็นติดเครื่องยนต์' : ''})`,
    `ท้องคาน q = max(${f(concrete)} + ${f(x.formDead)} + ${f(liveUsed)}, ${f(totalMin)}) = ${f(beam)} kPa (รวม D+L ไม่น้อยกว่า ${totalMin} kPa)`,
    ...(x.slabT > 0 && (x.slabLeft > 0 || x.slabRight > 0) ? [`แถบพื้นข้างคาน q = max(${f(x.gamma)} × ${f(x.slabT / 1000)} + ${f(x.formDead)} + ${f(liveUsed)}, ${f(totalMin)}) = ${f(slab)} kPa`] : []),
  ];
  return {concrete, formDead: x.formDead, liveUsed, liveMin, totalMin, beam, slab, steps};
}

export interface BeamQuantity {item: string; spec: string; qty: number; unit: string; note: string}
export interface BeamResult {
  engineVersion: string; input: BeamInput; status: Status; checks: Check[]; blockers: string[];
  loads: BeamLoads; pressureModel: PressureModel; soffitPlywood: PlywoodDesign; sidePlywood: PlywoodDesign;
  joist: MemberMaterial; bearer: MemberMaterial; stud: MemberMaterial; waler: MemberMaterial;
  /** Stations along the beam (mm from the beam start). */
  joists: number[]; shores: number[]; studs: number[]; ties: number[];
  /** Side form heights (mm): [left, right]; tie row levels measured up from the soffit. */
  sideHeights: [number, number]; tieLevels: number[];
  /** Transverse layout (mm from the left bearer line): beam and slab strips. */
  beamStart: number; joistReaction: number; bearerLine: number; shoreLoad: number; studSpan: number; tieForce: number | null;
  kickerForcePerM: number; topForcePerM: number; shoreFactor: number; lateralPerM: number; shoreLength: number; volume: number; quantities: BeamQuantity[];
}

export function calculateBeam(raw: unknown): BeamResult {
  const x = validateBeamInput(raw), loads = beamLoads(x), {checks, add, member} = checker(x.deflectionRatio);
  const plyCommon = plywoodOptions(x);
  const plySource = plywoodSource(x.plywoodGrade);
  const joist = material(x.joistSectionId, x), bearer = material(x.bearerSectionId, x), stud = material(x.studSectionId, x), waler = material(x.walerSectionId, x);

  // Soffit plywood spans along the beam between joists.
  const joists = equalPositions(x.length, x.joistSpacing), sj = x.length / (joists.length - 1);
  const soffitPlywood = plywoodDesign({...plyCommon, pressure: loads.beam, spacing: sj, studWidth: joist.section.B});
  for (const k of soffitPlywood.checks) add('sof-' + k.id, 'ท้องคาน · ' + k.label, k.demand, k.limit, k.unit, k.formula, k.substitution + `; q = ${fx(loads.beam)} kPa`, k.note, plySource);

  // Joist: simple span between the bearer lines, beam strip centred, slab strips beside it.
  const L = x.shoreWidth, beamStart = (L - x.b) / 2, mm = (kPa: number) => kPa / 1000 * sj;
  const patches = [{a: beamStart, c: beamStart + x.b, w: mm(loads.beam)},
    ...(x.slabLeft > 0 ? [{a: beamStart - x.slabLeft, c: beamStart, w: mm(loads.slab)}] : []),
    ...(x.slabRight > 0 ? [{a: beamStart + x.b, c: beamStart + x.b + x.slabRight, w: mm(loads.slab)}] : [])];
  const jb = patchBeam(L, patches, joist.E, joist.I);
  member('joist', 'คร่าวท้องคาน (ตามขวาง)', joist, 1, jb.Mmax, jb.Vmax, jb.dmax, L,
    `ช่วง L = ${fx(L, 0)} mm; แถบคาน b = ${x.b} mm กลางช่วง w = q × sj = ${fx(loads.beam)} × ${fx(sj, 0)} / 1000 = ${fx(mm(loads.beam), 3)} N/mm` +
    (x.slabLeft + x.slabRight > 0 ? `; แถบพื้น ${x.slabLeft}/${x.slabRight} mm w = ${fx(mm(loads.slab), 3)} N/mm` : '') + `; RA = ${fx(jb.RA / 1000, 3)} kN, RB = ${fx(jb.RB / 1000, 3)} kN`);

  // Bearer: line load from joist reactions, simple span between shores.
  const joistBearing = bearingCheck(add, 'bear-joist', 'แรงกดที่จุดสัมผัส: คร่าวท้องบนคานรับ', jb.Vmax, joist, bearer, x.bearerCount,
    `R = max(RA, RB) = ${fx(jb.Vmax / 1000, 3)} kN (ปฏิกิริยาคร่าวท้องที่แนวคานรับ)`);
  const shores = equalPositions(x.length, x.shoreSpacing), ss = x.length / (shores.length - 1), bearerLine = jb.Vmax / sj;
  member('bearer', 'คานรับท้อง (ตามยาว)', bearer, x.bearerCount, bearerLine * ss ** 2 / 8, bearerLine * ss / 2, 5 * bearerLine * ss ** 4 / (384 * bearer.E * bearer.I), ss,
    `w = Rmax / sj = ${fx(jb.Vmax / 1000, 3)} kN / ${fx(sj, 0)} mm = ${fx(bearerLine, 3)} N/mm; L = ${fx(ss, 0)} mm; M = wL²/8, V = wL/2, δ = 5wL⁴/(384EI)`);
  // Bearers lap over the shore heads and act as continuous beams: the largest interior shore takes k·w·ss (k from the three-moment equation).
  const shoreFactor = continuousSupportFactor(shores.length - 1), shoreLoad = shoreFactor * bearerLine * ss / 1000;
  add('shore-p', 'ค้ำยัน: แรงอัดต่อต้น', shoreLoad, x.shoreSWL > 0 ? x.shoreSWL : null, 'kN', 'P = k × w × ss ≤ SWL (ผู้ผลิต)', `k = ${fx(shoreFactor, 3)} (คานรับต่อเนื่อง ${shores.length - 1} ช่วงเท่ากัน, ต้นภายในที่รับแรงมากสุด); P = ${fx(shoreFactor, 3)} × ${fx(bearerLine, 3)} N/mm × ${fx(ss, 0)} mm = ${fx(shoreLoad, 2)} kN` +
    (x.shoreSWL > 0 ? `; SWL = ${fx(x.shoreSWL)} kN` : '; ยังไม่มี SWL ของค้ำยันที่ความยาวใช้งาน'), 'k จากสมการสามโมเมนต์ของคานต่อเนื่องช่วงเท่ากันรับแรงแผ่สม่ำเสมอ (1 ช่วง k = 1); ต้องยืนยันความยาวยืด ความเอียง และฐานรองรับ',
    x.shoreSWL > 0 ? 'ค่าผู้ผลิต: ' + (x.shoreReference || 'ไม่ระบุแหล่งอ้างอิง') : 'ACI PRC-347-14(21) §4.3: ใช้ค่ารับน้ำหนักที่ผู้ผลิตแนะนำพร้อมผลทดสอบ');
  const DLperM = (loads.concrete + x.formDead) * x.b / 1000 + (x.slabLeft + x.slabRight) / 1000 * (x.gamma * x.slabT / 1000 + x.formDead), lateralPerM = Math.max(1.5, 0.02 * DLperM);
  const restraintSource = (capacity: number, fallback: string) => capacity > 0 ? 'ค่าที่ผู้ใช้กำหนด: ' + (x.restraintReference || 'ไม่ระบุแหล่งอ้างอิง') : fallback;
  add('lateral', 'แรงด้านข้างที่ต้องค้ำ (ACI §4.2.3.2)', lateralPerM, x.lateralCapacity > 0 ? x.lateralCapacity : null, 'kN/m', 'H = max(1.5 kN/m, 2% DL) ≤ กำลังค้ำยันทแยง/ledger',
    `DL = ${fx(DLperM, 3)} kN/m ต่อความยาวคาน → H = max(1.5, ${fx(0.02 * DLperM, 3)}) = ${fx(lateralPerM, 3)} kN/m` + (x.lateralCapacity > 0 ? `; กำลังที่ออกแบบ = ${fx(x.lateralCapacity)} kN/m` : '; ยังไม่มีกำลังค้ำยันทแยงที่ออกแบบ'),
    'กำลังต้องมาจากการออกแบบค้ำยันทแยง/ledger และจุดยึด (ผู้ผลิตหรือรายการคำนวณแยก)', restraintSource(x.lateralCapacity, ACI_LOADS_REFERENCE));

  // Side forms: pressure on depth h; plywood spans between vertical studs; studs span between soffit kicker, tie rows and top restraint.
  const pressureModel = lateralPressure({pressureMethod: x.pressureMethod, gamma: x.gamma, height: x.h, width: x.b, length: x.length, pourRate: x.pourRate,
    concreteTemp: x.concreteTemp, slump: x.slump, vibrationDepth: x.vibrationDepth, chemistryCc: x.chemistryCc}), p = pressureModel.pmax;
  // Edge beam: the slab frames in on the right; the left (outer) side form runs the full depth.
  const inner = x.slabSides > 0 ? x.h - x.slabT : x.h, sideHeights: [number, number] = [x.slabSides === 1 ? x.h : inner, inner], hSide = Math.max(...sideHeights);
  const studs = equalPositions(x.length, x.studSpacing), st = x.length / (studs.length - 1);
  const sidePlywood = plywoodDesign({...plyCommon, pressure: p, spacing: st, studWidth: stud.section.B});
  for (const k of sidePlywood.checks) add('side-' + k.id, 'แบบข้าง · ' + k.label, k.demand, k.limit, k.unit, k.formula, k.substitution + `; pmax = ${fx(p)} kPa`, k.note, plySource);
  const studSpan = hSide / (x.tieRows + 1), ws = p / 1000 * st;
  member('stud', 'คร่าวแบบข้าง (แนวตั้ง)', stud, 1, ws * studSpan ** 2 / 8, ws * studSpan / 2, 5 * ws * studSpan ** 4 / (384 * stud.E * stud.I), studSpan,
    `w = pmax × s = ${fx(p)} × ${fx(st, 0)} / 1000 = ${fx(ws, 3)} N/mm; L = hข้าง/(แถว Tie + 1) = ${fx(hSide, 0)} / ${x.tieRows + 1} = ${fx(studSpan, 0)} mm`);
  // Each stud span is simply supported, so the bottom kicker and the top restraint each carry half of the end span.
  const kickerForcePerM = p * studSpan / 2 / 1000, topForcePerM = kickerForcePerM;
  add('kicker', 'แรงที่ไม้กันตีน/จุดยึดล่างแบบข้าง', kickerForcePerM, x.kickerCapacity > 0 ? x.kickerCapacity : null, 'kN/m', 'R = pmax × L / 2 ≤ กำลังไม้กันตีน',
    `R = ${fx(p)} × ${fx(studSpan, 0)} / 2 / 1000 = ${fx(kickerForcePerM, 3)} kN/m` + (x.kickerCapacity > 0 ? `; กำลังที่ออกแบบ = ${fx(x.kickerCapacity)} kN/m` : '; ยังไม่มีกำลังไม้กันตีนที่ออกแบบ'),
    'กำลังต้องรวมไม้กันตีน ตะปู/สกรู และการยึดกับคร่าวท้องคาน', restraintSource(x.kickerCapacity, 'สมดุลแรง'));
  add('top', 'แรงที่จุดยึดบนแบบข้าง', topForcePerM, x.topRestraintCapacity > 0 ? x.topRestraintCapacity : null, 'kN/m', 'R = pmax × L / 2 ≤ กำลังจุดยึดบน',
    `R = ${fx(p)} × ${fx(studSpan, 0)} / 2 / 1000 = ${fx(topForcePerM, 3)} kN/m (ช่วงบนสุดของคร่าว)` + (x.topRestraintCapacity > 0 ? `; กำลังที่ออกแบบ = ${fx(x.topRestraintCapacity)} kN/m` : '; ยังไม่มีกำลังจุดยึดบนที่ออกแบบ'),
    x.tieRows > 0 ? 'ยอดคร่าวต้องยึดกับแบบพื้น/ค้ำยัน หรือเพิ่ม Tie แถวบนชิดขอบแบบ' : 'ไม่มี Tie: แรงดันครึ่งหนึ่งของความสูงแบบข้างต้องส่งเข้าจุดยึดบน (แบบพื้น ค้ำยัน หรือเหล็กรัดบนคาน)',
    restraintSource(x.topRestraintCapacity, 'สมดุลแรง'));
  let ties: number[] = [], tieLevels: number[] = [], tieForce: number | null = null, studOnWaler = false;
  if (x.tieRows > 0) {
    ties = equalPositions(x.length, x.tieSpacing); const stt = x.length / (ties.length - 1), ww = p / 1000 * studSpan;
    tieLevels = Array.from({length: x.tieRows}, (_, i) => studSpan * (i + 1));
    member('waler', 'คานคู่แบบข้าง (ต่อ 1 แถว Tie)', waler, 2, ww * stt ** 2 / 8, ww * stt / 2, 5 * ww * stt ** 4 / (384 * waler.E * waler.I), stt,
      `w = pmax × L_stud = ${fx(p)} × ${fx(studSpan, 0)} / 1000 = ${fx(ww, 3)} N/mm; ช่วง Tie = ${fx(stt, 0)} mm`);
    tieForce = ww * stt / 1000;
    const Ag = Math.PI * x.tieDiameter ** 2 / 4, tieBody = x.tieFy * Ag / x.tieOmega / 1000;
    add('tie-body', 'Tie ทะลุคาน: ตัวเหล็กเริ่มคราก', tieForce, tieBody, 'kN', 'T ≤ Fy Ag / Ω',
      `T = ${fx(tieForce, 2)} kN; Ag = π × ${x.tieDiameter}² / 4 = ${fx(Ag, 0)} mm²; Fy = ${x.tieFy} MPa; Ω = ${x.tieOmega} → ${fx(tieBody, 2)} kN`,
      'ตรวจเฉพาะหน้าตัดเต็มของเหล็ก ไม่รวมเกลียว นัต แผ่นรอง หรือปลอก', 'Fy ตาม มอก. 24 (SD40 = 390 MPa) · ต้องยืนยันใบรับรอง');
    const tieUlt = x.tieFu * Ag / 2 / 1000;
    add('tie-ult', 'Tie ทะลุคาน: กำลังประลัย / 2.0 (ACI Table 4.4)', tieForce, tieUlt, 'kN', 'T ≤ Fu Ag / 2.0',
      `T = ${fx(tieForce, 2)} kN; Fu = ${x.tieFu} MPa; Ag = ${fx(Ag, 0)} mm² → ${fx(x.tieFu, 0)} × ${fx(Ag, 0)} / 2.0 / 1000 = ${fx(tieUlt, 2)} kN`,
      'ACI Table 4.4 ส่วนปลอดภัย 2.0 เทียบกำลังประลัย ใช้หน้าตัดเต็ม ถ้าเป็นเหล็กเกลียวต้องใช้พื้นที่สุทธิหรือ SWL ของชุด Tie', 'ACI PRC-347-14(21) Table 4.4 · Fu ตาม มอก. 24 (SD40 = 560 MPa)');
    studOnWaler = bearingCheck(add, 'bear-stud', 'แรงกดที่จุดสัมผัส: คร่าวข้างบนคานคู่', p / 1000 * st * studSpan, stud, waler, 2,
      `R = pmax × s × L_stud = ${fx(p)} × ${fx(st, 0)} × ${fx(studSpan, 0)} / 1000 (คร่าวข้างที่แถว Tie, คานคู่ 2 ตัว)`);
    // Edge beam: rows are spaced over the full outer depth, but the inner side form stops at the slab soffit.
    if (sideHeights[0] !== sideHeights[1]) {
      const topTie = tieLevels[tieLevels.length - 1], innerTop = Math.min(...sideHeights) - waler.section.H / 2;
      add('tie-level', 'Tie แถวบนสุด: อยู่ในความสูงแบบข้างด้านใน', topTie, innerTop, 'mm', 'z_Tie ≤ h_ใน − H_คานคู่ / 2',
        `z_Tie = ${fx(topTie, 0)} mm จากท้องคาน; h_ใน = ${fx(Math.min(...sideHeights), 0)} mm; H_คานคู่ = ${fx(waler.section.H, 0)} mm → ${fx(innerTop, 0)} mm`,
        'คานขอบ: แบบข้างด้านพื้นสั้นกว่าด้านนอก Tie ที่สูงกว่าขอบแบบด้านในไม่มีคานคู่ให้ยึด ให้ลดแถว Tie หรือจัดระดับใหม่', 'เรขาคณิตแบบข้าง');
    }
    add('tie-t', 'Tie ทะลุคาน: แรงดึง', tieForce, x.tieSWL > 0 ? x.tieSWL : null, 'kN', 'T = pmax × L_stud × s_tie ≤ SWL', `T = ${fx(ww, 3)} × ${fx(stt, 0)} / 1000 = ${fx(tieForce, 2)} kN; Ø${x.tieDiameter} mm` +
      (x.tieSWL > 0 ? `; SWL = ${fx(x.tieSWL)} kN` : '; ยังไม่มี SWL ชุด Tie'), 'ACI Table 4.4 ต้องมีส่วนปลอดภัย ≥ 2.0 เทียบกำลังประลัย; ต้องตรวจแผ่นรองและนัต', 'ACI PRC-347-14(21) Table 4.4 · ค่าผู้ผลิต');
  }

  const stack = x.plywood + joist.section.H + bearer.section.H, shoreLength = x.soffitHeight - stack;
  const blockers = [
    ...(!x.confirmed ? ['ยังไม่ยืนยันมิติคานจากแบบต้นฉบับ'] : []),
    ...(x.shoreSWL > 0 ? [] : ['ต้องกรอก SWL ค้ำยันที่ความยาวใช้งาน (ข้อมูลผู้ผลิต)']),
    ...(x.tieRows > 0 && !(x.tieSWL > 0) ? ['ต้องกรอก SWL ชุด Tie (ข้อมูลผู้ผลิต)'] : []),
    ...(x.lateralCapacity > 0 ? ['ยืนยันเอกสารกำลังค้ำยันทแยง/ledger และตรวจเสถียรภาพนั่งร้าน'] : ['ออกแบบค้ำยันทแยง/ledger ให้รับแรงด้านข้าง ' + fx(lateralPerM) + ' kN/m และตรวจเสถียรภาพนั่งร้าน']),
    ...(x.kickerCapacity > 0 && x.topRestraintCapacity > 0 ? [] : ['ออกแบบจุดยึดแบบข้าง: ไม้กันตีน (ล่าง) และจุดยึดบน รับ ' + fx(kickerForcePerM) + ' kN/m ต่อด้าน']),
    'ตรวจการยึดหัวค้ำ (U-head) กับคานรับ',
    ...(joistBearing && (x.tieRows === 0 || studOnWaler) ? [] : ['ตรวจแรงกดเฉพาะที่ของสมาชิกเหล็กที่ซ้อนกัน (local yielding/web crippling ตาม AISC 360 หรือข้อมูลผู้ผลิต)']),
    ...(x.slabSides === 1 ? ['คานขอบ (พื้นด้านเดียว): ต้องป้องกันการหมุนของแบบคาน (ACI §4.1.4c)'] : []),
    ...(shoreLength <= 0 ? ['ความสูงใต้ท้องคานน้อยกว่าความสูงชุดแบบหล่อ'] : []),
    'ตรวจกำลังรับน้ำหนักของพื้น/ดินใต้ค้ำยัน และแผ่นรองฐาน',
  ];
  const sheet = 1.22 * 2.44, sideArea = (sideHeights[0] + sideHeights[1]) * x.length / 1e6, soffitArea = x.b * x.length / 1e6;
  const studH = (k: number) => sideHeights[k] + x.plywood;
  const quantities: BeamQuantity[] = [
    {item: 'ไม้อัดท้องคาน', spec: `${x.plywood} mm · ${x.plywoodGrade}`, qty: Math.ceil(soffitArea / sheet * 1.1), unit: 'แผ่น', note: `${fx(soffitArea)} m² + เผื่อตัด 10%`},
    {item: 'ไม้อัดแบบข้าง', spec: `${x.plywood} mm · ${x.plywoodGrade}`, qty: Math.ceil(sideArea / sheet * 1.1), unit: 'แผ่น', note: `${fx(sideArea)} m² (สองด้าน) + เผื่อตัด 10%`},
    {item: 'คร่าวท้องคาน', spec: joist.name, qty: joists.length, unit: 'ท่อน', note: `ยาว ${fx(L + 2 * bearer.section.B, 0)} mm @ ${fx(sj, 0)} mm`},
    {item: 'คานรับท้อง', spec: bearer.name + (x.bearerCount > 1 ? ' (คู่)' : ''), qty: 2 * x.bearerCount, unit: 'เส้น', note: `ยาว ${fx(x.length, 0)} mm (ต่อทาบเหนือหัวค้ำ)`},
    {item: 'ค้ำยัน + U-head + แผ่นฐาน', spec: x.shoreReference || 'ระบุรุ่นจากผู้ผลิต', qty: 2 * shores.length, unit: 'ต้น', note: `ยาวใช้งาน ${fx(shoreLength, 0)} mm @ ${fx(ss, 0)} mm`},
    {item: 'คร่าวแบบข้าง', spec: stud.name, qty: 2 * studs.length, unit: 'ท่อน', note: `ยาว ${fx(studH(0), 0)}/${fx(studH(1), 0)} mm @ ${fx(st, 0)} mm`},
    ...(x.tieRows > 0 ? [
      {item: 'คานคู่แบบข้าง', spec: waler.name + ' (คู่)', qty: 2 * 2 * x.tieRows, unit: 'เส้น', note: `ยาว ${fx(x.length, 0)} mm, ${x.tieRows} แถว/ด้าน`},
      {item: 'Tie ทะลุคาน + ปลอก + นัต/แผ่นรอง', spec: `Ø${x.tieDiameter} mm`, qty: x.tieRows * ties.length, unit: 'ชุด', note: `ยาว ≈ ${fx(x.b + 2 * (x.plywood + stud.section.H + waler.section.H + 60), 0)} mm`},
    ] : []),
  ];
  const status: Status = checks.some(k => k.status === 'FAIL') ? 'FAIL' : 'INCOMPLETE';
  return {engineVersion: BEAM_ENGINE_VERSION, input: x, status, checks, blockers, loads, pressureModel, soffitPlywood, sidePlywood, joist, bearer, stud, waler,
    joists, shores, studs, ties, sideHeights, tieLevels, beamStart, joistReaction: jb.Vmax, bearerLine, shoreLoad, studSpan, tieForce, kickerForcePerM, topForcePerM, shoreFactor, lateralPerM,
    shoreLength, volume: x.b * x.h * x.length / 1e9, quantities};
}

/** Largest requested spacing (25 mm steps) for which the members it governs have no FAIL. Never changes sections. */
export const BEAM_SPACINGS = [
  {key: 'joistSpacing', label: 'ระยะคร่าวท้องคาน', prefixes: ['sof-', 'joist-']},
  {key: 'shoreSpacing', label: 'ระยะค้ำยันตามยาว', prefixes: ['bearer-', 'shore-']},
  {key: 'studSpacing', label: 'ระยะคร่าวแบบข้าง', prefixes: ['side-', 'stud-']},
  {key: 'tieSpacing', label: 'ระยะ Tie ตามยาว', prefixes: ['waler-', 'tie-']},
] as const;
export function beamAdvice(x: BeamInput) {
  return BEAM_SPACINGS.filter(s => s.key !== 'tieSpacing' || x.tieRows > 0).map(s => {
    const ok = (v: number) => {try {return !calculateBeam({...x, [s.key]: v}).checks.some(k => s.prefixes.some(p => k.id.startsWith(p)) && k.status === 'FAIL');} catch {return false;}};
    let best: number | null = null;
    for (let v = Math.min(x.length, 3000); v >= 100; v -= 25) if (ok(v)) {best = v; break;}
    // Checks in this group without a capacity (e.g. shore/tie SWL not entered) did not limit the spacing.
    const unchecked = calculateBeam(x).checks.filter(k => s.prefixes.some(p => k.id.startsWith(p)) && k.limit === null).map(k => k.label);
    return {key: s.key, label: s.label, current: x[s.key], max: best, unchecked};
  });
}
