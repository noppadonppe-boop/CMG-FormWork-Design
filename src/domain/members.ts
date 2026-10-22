/** Shared screening helpers for soffit systems (beam, slab): member materials from the Thai section tables,
 * the check builder (bending / shear / deflection of simply supported members) and plywood settings. */
import type {FaceGrain, PlywoodGrade, PlywoodSpans} from './plywoodGrades.js';
import {catalogueProperties, isTimber, sectionById, timberGrade, type StockSection, type TimberGrade} from './sectionStock.js';
import type {Check} from './index.js';

export interface MaterialSettings {timberGrade: string; steelFy: number; steelE: number; steelOmegaB: number; steelOmegaShear: number}
export interface PlywoodSettings {plywood: number; plywoodGrade: PlywoodGrade; plywoodSpans: PlywoodSpans; plywoodFaceGrain: FaceGrain; plywoodE: number; plywoodFb: number; deflectionRatio: number}
export interface MemberMaterial {name: string; section: StockSection; timber: boolean; E: number; S: number; I: number; A: number; shearArea: number;
  Fb: number; Fv: number | null; /** Timber compression perpendicular to grain (MPa, textbook Table 3.4); null for steel. */ Fc90: number | null; source: string}

export function material(id: string, x: MaterialSettings): MemberMaterial {
  const s = sectionById(id)!, p = catalogueProperties(s), timber = isTimber(s), g = timberGrade(x.timberGrade)!;
  return {name: s.designation, section: s, timber, E: timber ? g.E : x.steelE, S: p.S, I: p.I, A: p.area, shearArea: p.shearArea,
    Fb: timber ? g.Fb : x.steelFy / x.steelOmegaB, Fv: timber ? g.Fv : x.steelFy / (Math.sqrt(3) * x.steelOmegaShear), Fc90: timber ? timberFc90(g) : null,
    source: timber ? 'หนังสือ Design Form Work ตาราง 3.4 (อ้าง ว.ส.ท.) · ' + g.label + ' · ค่าอ้างอิงเดิม ต้องยืนยันชนิดไม้/ความชื้น'
      : s.designation + ' ค่า gross จาก ' + s.source + ' · Fy ' + x.steelFy + ' MPa / Ω (AISC 360 ASD) · ไม่ตรวจ local/lateral-torsional buckling และจุดต่อ'};
}

/** ACI PRC-347-14(21) §4.2.1: live load ≥ 2.4 kPa (3.6 with motorized carts); D + L ≥ 4.8 kPa (6.0). */
export const liveMinimums = (motorized: boolean) => ({liveMin: motorized ? 3.6 : 2.4, totalMin: motorized ? 6.0 : 4.8});

export const fx = (v: number, d = 2) => v.toFixed(d);
/** Timber allowable compression perpendicular to grain (MPa) from the textbook table (stored in ksc). */
export const timberFc90 = (g: TimberGrade) => g.raw_ksc.Fc90_base_MPa == null ? null : g.raw_ksc.Fc90_base_MPa * 0.0980665;
/** Contact bearing where member `a` crosses member `b` (contact = a.B × b.B per crossing, `crossings` members sharing the force).
 * Checked only when a timber member is in the contact (perpendicular-to-grain crushing); steel-on-steel local bearing stays a blocker. */
export function bearingCheck(add: ReturnType<typeof checker>['add'], id: string, label: string, force: number, a: MemberMaterial, b: MemberMaterial, crossings: number, sub: string) {
  const timber = [a, b].filter(m => m.timber && m.Fc90 !== null);
  if (!timber.length) return false;
  const area = a.section.B * b.section.B * crossings, f = force / area, limit = Math.min(...timber.map(m => m.Fc90!));
  add(id, label, f, limit, 'MPa', 'fc⊥ = R / (b₁ b₂ n) ≤ Fc⊥ (ไม้)', `${sub}; R = ${fx(force / 1000, 3)} kN; พื้นที่สัมผัส = ${fx(a.section.B, 0)} × ${fx(b.section.B, 0)} × ${crossings} = ${fx(area, 0)} mm²; Fc⊥ = ${fx(limit)} MPa`,
    'ไม้รับแรงกดตั้งฉากเสี้ยน ไม่รวมผลขอบไม้หรือแผ่นรอง ต้องยืนยันชนิดไม้และความชื้น', timber[0].source);
  return true;
}
/** Check list with screening status (FAIL when demand > limit, otherwise INCOMPLETE; never PASS). */
export function checker(deflectionRatio: number) {
  const checks: Check[] = [];
  const add = (id: string, label: string, demand: number | null, limit: number | null, unit: string, formula: string, substitution: string, note: string, source: string) =>
    checks.push({id, label, demand, limit, unit, utilization: demand === null || limit === null ? null : demand / limit,
      status: demand !== null && limit !== null && demand > limit ? 'FAIL' : 'INCOMPLETE', formula, substitution, source, note});
  /** Bending, shear and deflection of `count` equal members sharing M, V and δ (simple span L). */
  const member = (prefix: string, title: string, m: MemberMaterial, count: number, M: number, V: number, d: number, span: number, sub: string) => {
    const share = count > 1 ? ` · แบ่งแรงเท่ากัน ${count} ตัว` : '';
    add(prefix + '-b', title + ': หน่วยแรงดัด', M / count / m.S, m.Fb, 'MPa', 'fb = M / (n S) ≤ Fb', `${sub}; M = ${fx(M / 1e6, 3)} kN·m; S = ${fx(m.S, 0)} mm³; n = ${count}; Fb = ${fx(m.Fb)} MPa${share}`,
      m.timber ? 'ต้องยืนยันชนิดไม้ ขนาดจริงหลังไส และความชื้น' : 'ค่า gross ไม่ลดตาม local buckling; ไม่ตรวจ LTB/จุดต่อ', m.source);
    const fv = m.timber ? 1.5 * V / count / m.A : V / count / m.shearArea;
    add(prefix + '-v', title + ': หน่วยแรงเฉือน', fv, m.Fv, 'MPa', m.timber ? 'fv = 1.5 V / (n A) ≤ Fv' : 'τ = V / (n Av) ≤ Fy/(√3 Ωv)',
      `V = ${fx(V / 1000, 3)} kN; ${m.timber ? 'A = ' + fx(m.A, 0) : 'Av = ' + fx(m.shearArea, 0)} mm²${m.Fv === null ? '; ไม่มีค่า Fv ในตาราง' : ''}`, 'ไม่ลดแรงเฉือนใกล้จุดรองรับ', m.source);
    add(prefix + '-d', title + ': การโก่ง', d / count, span / deflectionRatio, 'mm', 'δ ≤ L/' + deflectionRatio, `L = ${fx(span, 0)} mm; E = ${fx(m.E, 0)} MPa; I = ${fx(m.I, 0)} mm⁴`,
      'โมเดลช่วงเดี่ยว (ปลอดภัยกว่าคานต่อเนื่อง) ภายใต้น้ำหนักรวม', m.source);
  };
  /** Uniform load w (N/mm) on a simple span L: M = wL²/8, V = wL/2, δ = 5wL⁴/(384EI). */
  const uniform = (prefix: string, title: string, m: MemberMaterial, count: number, w: number, L: number, sub: string) =>
    member(prefix, title, m, count, w * L * L / 8, w * L / 2, 5 * w * L ** 4 / (384 * m.E * m.I), L, sub + '; M = wL²/8, V = wL/2, δ = 5wL⁴/(384EI)');
  return {checks, add, member, uniform};
}

export const plywoodOptions = (x: PlywoodSettings) => ({grade: x.plywoodGrade, t: x.plywood, faceGrain: x.plywoodFaceGrain, spans: x.plywoodSpans, deflectionRatio: x.deflectionRatio,
  sheetAcross: x.plywoodFaceGrain === 'ACROSS' ? 2440 : 1220, custom: {E: x.plywoodE, Fb: x.plywoodFb}});
export const plywoodSource = (grade: PlywoodGrade) => grade === 'CUSTOM' ? 'ค่าไม้อัดที่ผู้ใช้กำหนด ต้องมีใบรับรองผู้ผลิต'
  : 'APA Concrete Forming Design/Construction Guide V345 (2012) Table 12–13 · ต้องยืนยันว่าแผ่นที่ใช้มีคุณสมบัติเทียบเท่า';
