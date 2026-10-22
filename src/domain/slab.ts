/** Practical slab soffit formwork screening: plywood → joists → bearers → shores (one bay, regular grid).
 * Units: mm, N, MPa, kPa, kN. Status is FAIL or INCOMPLETE, never PASS. */
import {FACE_GRAINS,PLYWOOD_GRADES,PLYWOOD_SPANS,plywoodDesign,type FaceGrain,type PlywoodDesign,type PlywoodGrade,type PlywoodSpans} from './plywoodGrades.js';
import {sectionById,timberGrade} from './sectionStock.js';
import {continuousSupportFactor, equalPositions} from './mechanics.js';
import {bearingCheck,checker,fx,liveMinimums,material,plywoodOptions,plywoodSource,type MemberMaterial} from './members.js';
import type {Check,Status} from './index.js';

export const SLAB_ENGINE_VERSION = 'slab-0.2.0-screening';
export interface SlabInput {
  /** Bay size: X = along the bearers, Y = along the joists; slab thickness; floor-to-soffit height (mm). */
  lx: number; ly: number; t: number; soffitHeight: number; confirmed: boolean;
  gamma: number; formDead: number; liveLoad: number; motorized: boolean; deflectionRatio: number;
  plywood: number; plywoodGrade: PlywoodGrade; plywoodSpans: PlywoodSpans; plywoodFaceGrain: FaceGrain; plywoodE: number; plywoodFb: number;
  timberGrade: string; steelFy: number; steelE: number; steelOmegaB: number; steelOmegaShear: number;
  /** Joists run along Y at joistSpacing (in X), spanning bearerSpacing. */
  joistSectionId: string; joistSpacing: number;
  /** Bearers run along X at bearerSpacing (in Y), spanning shoreSpacing; bearerCount members per line share the load. */
  bearerSectionId: string; bearerCount: 1 | 2; bearerSpacing: number; shoreSpacing: number;
  /** Shore safe working load at the actual extension (kN, manufacturer). 0 = unknown → INCOMPLETE. */
  shoreSWL: number; shoreReference: string;
}
export const slabDefaults: SlabInput = {
  lx: 6000, ly: 4000, t: 150, soffitHeight: 3000, confirmed: false,
  gamma: 24, formDead: 0.5, liveLoad: 2.4, motorized: false, deflectionRatio: 360,
  plywood: 20, plywoodGrade: 'PLYFORM_I', plywoodSpans: 'AUTO', plywoodFaceGrain: 'ACROSS', plywoodE: 4800, plywoodFb: 5.3,
  timberGrade: 'TIMBER-BOOK-SOFT', steelFy: 245, steelE: 200000, steelOmegaB: 1.67, steelOmegaShear: 1.67,
  joistSectionId: 'PAP-TIS107-SHS-50x50x2.3', joistSpacing: 300,
  bearerSectionId: 'PAP-TIS107-RHS-100x50x3.2', bearerCount: 1, bearerSpacing: 1200, shoreSpacing: 1200,
  shoreSWL: 0, shoreReference: '',
};
const TEXT_KEYS = ['confirmed', 'motorized', 'plywoodGrade', 'plywoodSpans', 'plywoodFaceGrain', 'timberGrade', 'joistSectionId', 'bearerSectionId', 'shoreReference', 'bearerCount'];
const NON_NEGATIVE = ['shoreSWL', 'formDead'];

export function validateSlabInput(v: unknown): SlabInput {
  if (!v || typeof v !== 'object') throw Error('ข้อมูลพื้นไม่ถูกต้อง');
  const q = v as Record<string, unknown>, keys = Object.keys(slabDefaults) as (keyof SlabInput)[];
  if (Object.keys(q).some(k => !keys.includes(k as keyof SlabInput))) throw Error('มีช่องข้อมูลพื้นที่ไม่รองรับ');
  for (const k of keys.filter(k => !TEXT_KEYS.includes(k))) {
    const n = q[k], min = NON_NEGATIVE.includes(k) ? 0 : Number.MIN_VALUE;
    if (typeof n !== 'number' || !Number.isFinite(n) || n < min) throw Error((min === 0 ? 'ค่าต้องไม่ติดลบ: ' : 'ค่าต้องเป็นจำนวนบวก: ') + k);
  }
  const x = q as unknown as SlabInput;
  if (typeof x.confirmed !== 'boolean' || typeof x.motorized !== 'boolean') throw Error('สถานะยืนยันไม่ถูกต้อง');
  if (![1, 2].includes(x.bearerCount)) throw Error('จำนวนคานรับต่อแนวไม่ถูกต้อง');
  if (!PLYWOOD_GRADES.includes(x.plywoodGrade) || !PLYWOOD_SPANS.includes(x.plywoodSpans) || !FACE_GRAINS.includes(x.plywoodFaceGrain)) throw Error('ชนิด จำนวนช่วง หรือทิศลายไม้อัดไม่ถูกต้อง');
  if (typeof x.timberGrade !== 'string' || !timberGrade(x.timberGrade)) throw Error('ชั้นไม้ไม่ถูกต้อง');
  if (typeof x.shoreReference !== 'string' || x.shoreReference.length > 300) throw Error('แหล่งอ้างอิงค้ำยันไม่ถูกต้อง');
  for (const [k, role] of [['joistSectionId', 'stud'], ['bearerSectionId', 'waler']] as const) {
    const s = typeof x[k] === 'string' ? sectionById(x[k]) : undefined;
    if (!s || !s.roles.includes(role)) throw Error('ไม่พบหน้าตัดในตารางเหล็ก/ไม้: ' + k);
  }
  if (x.lx > 30000 || x.ly > 30000 || x.t > 1500 || x.soffitHeight > 20000 || x.gamma > 40 || x.plywood > 100) throw Error('ขนาดพื้นอยู่นอกขอบเขต');
  if (x.deflectionRatio > 2000 || x.steelFy > 1000 || x.steelE > 300000 || [x.steelOmegaB, x.steelOmegaShear].some(o => o < 1 || o > 10)) throw Error('พารามิเตอร์วัสดุอยู่นอกขอบเขต');
  if (x.joistSpacing > x.lx || x.shoreSpacing > x.lx || x.bearerSpacing > x.ly) throw Error('ระยะสมาชิกมากกว่าขนาดพื้น');
  return Object.fromEntries(keys.map(k => [k, x[k]])) as unknown as SlabInput;
}

/** Stored slab input, or a draft seeded from a slab case footprint (X, Y, height = thickness); never confirmed. */
export function slabFromCase(stored: unknown, footprint?: {width: number; length: number; height: number}): SlabInput {
  if (stored != null) {try {return validateSlabInput(stored);} catch { /* unreadable → seed below */ }}
  if (footprint) {try {return validateSlabInput({...slabDefaults, lx: footprint.width, ly: footprint.length, t: footprint.height, confirmed: false});} catch { /* fall through */ }}
  return {...slabDefaults};
}

export interface SlabLoads {concrete: number; formDead: number; liveUsed: number; liveMin: number; totalMin: number; q: number; steps: string[]}
export function slabLoads(x: SlabInput): SlabLoads {
  const {liveMin, totalMin} = liveMinimums(x.motorized), liveUsed = Math.max(x.liveLoad, liveMin), concrete = x.gamma * x.t / 1000;
  const q = Math.max(concrete + x.formDead + liveUsed, totalMin);
  return {concrete, formDead: x.formDead, liveUsed, liveMin, totalMin, q, steps: [
    `คอนกรีต + เหล็กเสริม γt = ${fx(x.gamma)} × ${fx(x.t / 1000, 3)} = ${fx(concrete)} kPa`,
    `น้ำหนักแบบหล่อ (ค่าที่ผู้ใช้กำหนด) = ${fx(x.formDead)} kPa`,
    `น้ำหนักจรขณะก่อสร้าง ใช้ max(${fx(x.liveLoad)}, ${fx(liveMin)}) = ${fx(liveUsed)} kPa (ACI §4.2.1: ไม่น้อยกว่า ${liveMin} kPa${x.motorized ? ' เมื่อใช้รถเข็นติดเครื่องยนต์' : ''})`,
    `q = max(${fx(concrete)} + ${fx(x.formDead)} + ${fx(liveUsed)}, ${fx(totalMin)}) = ${fx(q)} kPa (รวม D+L ไม่น้อยกว่า ${totalMin} kPa)`]};
}

export interface SlabQuantity {item: string; spec: string; qty: number; unit: string; note: string;
  /** Linear members: catalogue designation and cut length per piece (mm), for the project order list. */
  section?: string; length?: number}
export interface SlabResult {
  engineVersion: string; input: SlabInput; status: Status; checks: Check[]; blockers: string[]; loads: SlabLoads; plywood: PlywoodDesign;
  joist: MemberMaterial; bearer: MemberMaterial;
  /** Joist stations along X, bearer lines along Y, shore stations along X (mm from the bay corner). */
  joists: number[]; bearers: number[]; shores: number[];
  joistLine: number; bearerLine: number; shoreLoad: number; shoreCount: number; shoreLength: number;
  /** Continuous-span interior reaction factors (three-moment equation): joists over the bearers, bearers over the shores. */
  joistFactor: number; shoreFactor: number;
  /** ACI §4.2.3.2 horizontal load per metre of slab edge for loads in X (applied along the Y edge) and in Y. */
  lateralX: number; lateralY: number; volume: number; quantities: SlabQuantity[];
}

export function calculateSlab(raw: unknown): SlabResult {
  const x = validateSlabInput(raw), loads = slabLoads(x), {checks, add, uniform} = checker(x.deflectionRatio), q = loads.q;
  const joist = material(x.joistSectionId, x), bearer = material(x.bearerSectionId, x), plySource = plywoodSource(x.plywoodGrade);
  const joists = equalPositions(x.lx, x.joistSpacing), sj = x.lx / (joists.length - 1);
  const bearers = equalPositions(x.ly, x.bearerSpacing), sb = x.ly / (bearers.length - 1);
  const shores = equalPositions(x.lx, x.shoreSpacing), ss = x.lx / (shores.length - 1);
  const plywood = plywoodDesign({...plywoodOptions(x), pressure: q, spacing: sj, studWidth: joist.section.B});
  for (const k of plywood.checks) add(k.id, 'ไม้อัดท้องพื้น · ' + k.label, k.demand, k.limit, k.unit, k.formula, k.substitution + `; q = ${fx(q)} kPa`, k.note, plySource);
  const joistLine = q / 1000 * sj;
  uniform('joist', 'คร่าว (Joist)', joist, 1, joistLine, sb, `w = q × sj = ${fx(q)} × ${fx(sj, 0)} / 1000 = ${fx(joistLine, 3)} N/mm; L = ระยะคานรับ ${fx(sb, 0)} mm`);
  // Joists lap over the bearers and bearers over the shore heads: interior supports take k·wL (three-moment equation, equal spans).
  const joistFactor = continuousSupportFactor(bearers.length - 1), shoreFactor = continuousSupportFactor(shores.length - 1);
  const bearerLine = joistFactor * q / 1000 * sb;
  uniform('bearer', 'คานรับ (Bearer)', bearer, x.bearerCount, bearerLine, ss, `w = kj × q × sb = ${fx(joistFactor, 3)} × ${fx(q)} × ${fx(sb, 0)} / 1000 = ${fx(bearerLine, 3)} N/mm (แรงจากคร่าวเฉลี่ยเป็นแรงแผ่); L = ระยะค้ำยัน ${fx(ss, 0)} mm`);
  const shoreLoad = shoreFactor * bearerLine * ss / 1000;
  add('shore-p', 'ค้ำยัน: แรงอัดต่อต้น (ต้นภายใน)', shoreLoad, x.shoreSWL > 0 ? x.shoreSWL : null, 'kN', 'P = kb × kj × q × sb × ss ≤ SWL (ผู้ผลิต)',
    `kj = ${fx(joistFactor, 3)} (คร่าวต่อเนื่อง ${bearers.length - 1} ช่วง), kb = ${fx(shoreFactor, 3)} (คานรับต่อเนื่อง ${shores.length - 1} ช่วง); P = ${fx(shoreFactor, 3)} × ${fx(joistFactor, 3)} × ${fx(q)} kPa × ${fx(sb / 1000, 3)} m × ${fx(ss / 1000, 3)} m = ${fx(shoreLoad)} kN` + (x.shoreSWL > 0 ? `; SWL = ${fx(x.shoreSWL)} kN` : '; ยังไม่มี SWL ของค้ำยันที่ความยาวใช้งาน'),
    'k จากสมการสามโมเมนต์ของคานต่อเนื่องช่วงเท่ากัน (1 ช่วง k = 1); ต้องยืนยันความยาวยืด ความเอียง และฐานรองรับ',
    x.shoreSWL > 0 ? 'ค่าผู้ผลิต: ' + (x.shoreReference || 'ไม่ระบุแหล่งอ้างอิง') : 'ACI PRC-347-14(21) §4.3: ใช้ค่ารับน้ำหนักที่ผู้ผลิตแนะนำพร้อมผลทดสอบ');
  const joistBearing = bearingCheck(add, 'bear-joist', 'แรงกดที่จุดสัมผัส: คร่าวบนคานรับ', joistFactor * q * sj * sb / 1e6 * 1000, joist, bearer, x.bearerCount,
    `R = kj × q × sj × sb = ${fx(joistFactor, 3)} × ${fx(q)} kPa × ${fx(sj / 1000, 3)} m × ${fx(sb / 1000, 3)} m (คร่าวเหนือคานรับภายใน)`);
  // ACI §4.2.3.2: max(1.5 kN/m of floor edge, 2 % of total dead load distributed along that edge).
  const DL = (loads.concrete + x.formDead) * x.lx * x.ly / 1e6, lateralX = Math.max(1.5, 0.02 * DL / (x.ly / 1000)), lateralY = Math.max(1.5, 0.02 * DL / (x.lx / 1000));
  add('lateral', 'แรงด้านข้างที่ต้องค้ำ (ACI §4.2.3.2)', Math.max(lateralX, lateralY), null, 'kN/m', 'H = max(1.5 kN/m, 2% DL / ความยาวขอบ)',
    `DL รวม = ${fx(DL)} kN; แนว X: max(1.5, 0.02 × ${fx(DL)} / ${fx(x.ly / 1000)}) = ${fx(lateralX, 3)} kN/m (รวม ${fx(lateralX * x.ly / 1000)} kN); แนว Y: ${fx(lateralY, 3)} kN/m (รวม ${fx(lateralY * x.lx / 1000)} kN)`,
    'ต้องออกแบบค้ำยันทแยง/ledger หรือยึดกับโครงสร้างเดิมให้รับแรงนี้ (ยังไม่มีวิธีตรวจใน engine)', 'ACI PRC-347-14(21) §4.2.3.2');
  const shoreLength = x.soffitHeight - (x.plywood + joist.section.H + bearer.section.H), shoreCount = bearers.length * shores.length;
  const blockers = [
    ...(!x.confirmed ? ['ยังไม่ยืนยันมิติพื้นจากแบบต้นฉบับ'] : []),
    ...(x.shoreSWL > 0 ? [] : ['ต้องกรอก SWL ค้ำยันที่ความยาวใช้งาน (ข้อมูลผู้ผลิต)']),
    `ออกแบบค้ำยันทแยง/ledger ให้รับแรงด้านข้าง ${fx(lateralX)} kN/m (แนว X) และ ${fx(lateralY)} kN/m (แนว Y) และตรวจเสถียรภาพนั่งร้าน`,
    'ตรวจการยึดหัวค้ำ (U-head) กับคานรับ และการต่อทาบคานรับเหนือหัวค้ำ',
    ...(joistBearing ? [] : ['ตรวจแรงกดเฉพาะที่ของคร่าวเหล็กบนคานรับเหล็ก (local yielding/web crippling ตาม AISC 360 หรือข้อมูลผู้ผลิต)']),
    ...(shoreLength <= 0 ? ['ความสูงใต้ท้องพื้นน้อยกว่าความสูงชุดแบบหล่อ'] : []),
    'ตรวจกำลังรับน้ำหนักของพื้น/ดินใต้ค้ำยัน แผ่นรองฐาน และลำดับการถอดค้ำ/ค้ำซ้ำ (ACI §4.5)',
  ];
  const area = x.lx * x.ly / 1e6;
  const quantities: SlabQuantity[] = [
    {item: 'ไม้อัดท้องพื้น', spec: `${x.plywood} mm · ${x.plywoodGrade}`, qty: Math.ceil(area / (1.22 * 2.44) * 1.05), unit: 'แผ่น', note: `${fx(area)} m² + เผื่อตัด 5%`},
    {item: 'คร่าว (Joist)', spec: joist.name, qty: joists.length, unit: 'ท่อน', section: joist.name, length: x.ly, note: `ยาว ${fx(x.ly, 0)} mm @ ${fx(sj, 0)} mm (ต่อทาบเหนือคานรับ)`},
    {item: 'คานรับ (Bearer)', spec: bearer.name + (x.bearerCount > 1 ? ' (คู่)' : ''), qty: bearers.length * x.bearerCount, unit: 'เส้น', section: bearer.name, length: x.lx, note: `ยาว ${fx(x.lx, 0)} mm @ ${fx(sb, 0)} mm (ต่อทาบเหนือหัวค้ำ)`},
    {item: 'ค้ำยัน + U-head + แผ่นฐาน', spec: x.shoreReference || 'ระบุรุ่นจากผู้ผลิต', qty: shoreCount, unit: 'ต้น', note: `ยาวใช้งาน ${fx(shoreLength, 0)} mm · ${shores.length} × ${bearers.length} ต้น @ ${fx(ss, 0)} × ${fx(sb, 0)} mm`},
  ];
  return {engineVersion: SLAB_ENGINE_VERSION, input: x, status: checks.some(k => k.status === 'FAIL') ? 'FAIL' : 'INCOMPLETE', checks, blockers, loads, plywood, joist, bearer,
    joists, bearers, shores, joistLine, bearerLine, shoreLoad, shoreCount, joistFactor, shoreFactor, shoreLength, lateralX, lateralY, volume: area * x.t / 1000, quantities};
}

export const SLAB_SPACINGS = [
  {key: 'joistSpacing', label: 'ระยะคร่าว (Joist)', prefixes: ['ply-', 'joist-']},
  {key: 'bearerSpacing', label: 'ระยะคานรับ (Bearer)', prefixes: ['joist-', 'bearer-', 'shore-']},
  {key: 'shoreSpacing', label: 'ระยะค้ำยันตามแนวคานรับ', prefixes: ['bearer-', 'shore-']},
] as const;
/** Largest requested spacing (25 mm steps) without FAIL in the members it governs. Never changes sections. */
export function slabAdvice(x: SlabInput, step = 25) {
  return SLAB_SPACINGS.map(s => {
    const cap = Math.min(s.key === 'bearerSpacing' ? x.ly : x.lx, 3000);
    const ok = (v: number) => {try {return !calculateSlab({...x, [s.key]: v}).checks.some(k => s.prefixes.some(p => k.id.startsWith(p)) && k.status === 'FAIL');} catch {return false;}};
    let best: number | null = null;
    for (let v = Math.floor(cap / step) * step; v >= 100; v -= step) if (ok(v)) {best = v; break;}
    const unchecked = calculateSlab(x).checks.filter(k => s.prefixes.some(p => k.id.startsWith(p)) && k.limit === null).map(k => k.label);
    return {key: s.key, label: s.label, current: x[s.key], max: best, unchecked};
  });
}
