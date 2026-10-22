/**
 * Plywood for concrete forming, APA "Concrete Forming Design/Construction Guide", Form V345 (May 2012 revision):
 *  - Table 12: Plyform effective section properties per foot of width (I, KS, Ib/Q) for stress parallel and perpendicular to face grain.
 *  - Table 13: design stresses already adjusted for wet use and the concrete setting factor Cs = 1.625 (E adjusted / Ee unadjusted, Fb, Fs).
 *  - pp. 22–23: continuous-span design — moment wl₁²/8 (2 spans) or wl₁²/10 (3 spans), shear 0.625 / 0.6 wl₂, bending deflection
 *    wl₃⁴/(2220 EI) or /(1743 EI) and shear deflection Cwt²l₂²/(1270 Ee I); l₁ = centre-to-centre, l₂ = clear span, l₃ = clear span + ¼″ (2″ framing)
 *    or + ⅝″ (4″ framing). Span continuity rule: face grain across supports → 3 spans up to 32″ (813 mm), 2 beyond; parallel → 3 spans up to 16″ (406 mm).
 * Thickness between tabulated panels is interpolated; outside the table it is clamped (reported in the note).
 * CUSTOM uses the user's E / Fb on the gross section b·t (no rolling-shear or shear-deflection data).
 */
export type PlywoodGrade = 'PLYFORM_I' | 'PLYFORM_II' | 'STRUCT_I' | 'CUSTOM';
export type PlywoodSpans = 'AUTO' | 'SINGLE' | 'TWO' | 'THREE';
export type FaceGrain = 'ACROSS' | 'PARALLEL';
export const PLYWOOD_GRADES: PlywoodGrade[] = ['PLYFORM_I', 'PLYFORM_II', 'STRUCT_I', 'CUSTOM'];
export const PLYWOOD_SPANS: PlywoodSpans[] = ['AUTO', 'SINGLE', 'TWO', 'THREE'];
export const FACE_GRAINS: FaceGrain[] = ['ACROSS', 'PARALLEL'];
export const PLYWOOD_GRADE_LABEL: Record<PlywoodGrade, string> = {
  PLYFORM_I: 'APA Plyform Class I (ไม้อัดแบบหล่อมาตรฐาน)', PLYFORM_II: 'APA Plyform Class II', STRUCT_I: 'APA Structural I Plyform', CUSTOM: 'กำหนดเอง (จากใบรับรองผู้ผลิต)'};
export const SPAN_LABEL: Record<PlywoodSpans, string> = {AUTO: 'อัตโนมัติตามขนาดแผ่นและกฎ APA', SINGLE: 'ช่วงเดี่ยว (ปลอดภัยที่สุด)', TWO: 'ต่อเนื่อง 2 ช่วง', THREE: 'ต่อเนื่อง 3 ช่วงขึ้นไป'};
export const GRAIN_LABEL: Record<FaceGrain, string> = {ACROSS: 'ลายไม้ขวางคร่าว (วางแผ่นแนวนอน · ทิศแข็งแรง)', PARALLEL: 'ลายไม้ขนานคร่าว (วางแผ่นแนวตั้ง)'};
export const APA_REFERENCE = 'APA Concrete Forming Design/Construction Guide, Form V345 (2012) Table 12–13';
const PSI = 0.00689476, IN = 25.4, FT = 304.8, KPA_TO_PSF = 20.8854;
type Row = [number, number, number, number, number, number, number];
// [t (in), I∥, KS∥, Ib/Q∥, I⊥, KS⊥, Ib/Q⊥] per foot of width — Table 12 (∥ = stress parallel with face grain = face grain across supports).
const T12: Record<Exclude<PlywoodGrade, 'CUSTOM'>, Row[]> = {
  PLYFORM_I: [[.469, .066, .244, 4.743, .018, .107, 2.419], [.5, .077, .268, 5.153, .024, .130, 2.739], [.594, .115, .335, 5.438, .029, .146, 2.834], [.625, .130, .358, 5.717, .038, .175, 3.094],
    [.688, .164, .409, 6.175, .044, .183, 3.524], [.719, .180, .430, 7.009, .072, .247, 3.798], [.75, .199, .455, 7.187, .092, .306, 4.063], [.875, .296, .584, 8.555, .151, .422, 6.028],
    [1, .427, .737, 9.374, .270, .634, 7.014], [1.125, .554, .849, 10.430, .398, .799, 8.419]],
  PLYFORM_II: [[.469, .063, .243, 4.499, .015, .138, 2.434], [.5, .075, .267, 4.891, .020, .167, 2.727], [.594, .115, .334, 5.326, .025, .188, 2.812], [.625, .130, .357, 5.593, .032, .225, 3.074],
    [.688, .164, .409, 6.020, .036, .236, 3.496], [.719, .180, .430, 6.504, .060, .317, 3.781], [.75, .198, .454, 6.631, .075, .392, 4.049], [.875, .300, .591, 7.990, .123, .542, 5.997],
    [1, .421, .754, 8.614, .220, .812, 6.987], [1.125, .566, .869, 9.571, .323, 1.023, 8.388]],
  STRUCT_I: [[.469, .067, .246, 4.503, .021, .147, 2.405], [.5, .078, .271, 4.908, .029, .178, 2.725], [.594, .116, .338, 5.018, .034, .199, 2.811], [.625, .131, .361, 5.258, .045, .238, 3.073],
    [.688, .167, .418, 5.621, .051, .249, 3.493], [.719, .183, .439, 6.109, .085, .338, 3.780], [.75, .202, .464, 6.189, .108, .418, 4.047], [.875, .317, .626, 7.539, .179, .579, 5.991],
    [1, .479, .827, 7.978, .321, .870, 6.981], [1.125, .623, .955, 8.841, .474, 1.098, 8.377]],
};
// Table 13 (psi): E adjusted (bending deflection when shear deflection is added), Ee unadjusted (shear deflection), Fb, Fs.
const T13: Record<Exclude<PlywoodGrade, 'CUSTOM'>, {E: number; Ee: number; Fb: number; Fs: number}> = {
  PLYFORM_I: {E: 1650000, Ee: 1500000, Fb: 1930, Fs: 72}, PLYFORM_II: {E: 1430000, Ee: 1300000, Fb: 1330, Fs: 72}, STRUCT_I: {E: 1650000, Ee: 1500000, Fb: 1930, Fs: 102}};
/** Beam coefficients for 1, 2 and 3+ equal spans under uniform load (APA V345 constants 96/120, 19.2/20, 2220/1743 in SI form). */
const COEF = {1: {m: 1 / 8, v: 0.5, d: 5 / 384}, 2: {m: 1 / 8, v: 0.625, d: 12 / 2220}, 3: {m: 1 / 10, v: 0.6, d: 12 / 1743}} as const;
/** The same coefficients for figures and reports (moment, shear, deflection per equal-span count). */
export const SPAN_COEF = COEF;

export interface PlywoodProperties {grade: PlywoodGrade; faceGrain: FaceGrain;
  /** MPa: E for bending deflection (adjusted when shear deflection is added), Ee unadjusted, allowable Fb and rolling shear Fs. */
  E: number; Ee: number | null; Fb: number; Fs: number | null;
  /** effective section per mm of width: KS (mm³/mm), I (mm⁴/mm), Ib/Q (mm²/mm). */
  KS: number; I: number; IbQ: number | null;
  /** gross-section equivalents for comparison: Fb·KS/(t²/6) and Ee·I/(t³/12) (presets) or the user values (CUSTOM). */
  eqFb: number; eqE: number; t_table: number | null; note: string}

export function plywoodProperties(grade: PlywoodGrade, t: number, custom: {E: number; Fb: number}, faceGrain: FaceGrain = 'ACROSS'): PlywoodProperties {
  if (grade === 'CUSTOM') return {grade, faceGrain, E: custom.E, Ee: null, Fb: custom.Fb, Fs: null, KS: t * t / 6, I: t ** 3 / 12, IbQ: null, eqFb: custom.Fb, eqE: custom.E, t_table: null,
    note: 'ค่าที่ผู้ใช้กำหนด ใช้กับหน้าตัดเต็มความหนา (bt²/6, bt³/12) · ไม่มีค่าแรงเฉือนกลิ้งและการโก่งจากแรงเฉือน'};
  const rows = T12[grade], ti = Math.min(Math.max(t / IN, rows[0][0]), rows.at(-1)![0]);
  const j = Math.max(1, rows.findIndex(r => r[0] >= ti)), [a, b] = [rows[j - 1], rows[j]], k = b[0] === a[0] ? 0 : (ti - a[0]) / (b[0] - a[0]);
  const o = faceGrain === 'ACROSS' ? 0 : 3, lerp = (i: number) => a[i + o] + k * (b[i + o] - a[i + o]), s = T13[grade];
  const KS = lerp(2) * IN ** 3 / FT, I = lerp(1) * IN ** 4 / FT, IbQ = lerp(3) * IN ** 2 / FT;
  return {grade, faceGrain, E: s.E * PSI, Ee: s.Ee * PSI, Fb: s.Fb * PSI, Fs: s.Fs * PSI, KS, I, IbQ,
    eqFb: s.Fb * PSI * KS / (t * t / 6), eqE: s.Ee * PSI * I / (t ** 3 / 12), t_table: ti * IN,
    note: `${APA_REFERENCE}: Fb ${s.Fb} psi, E ${s.E.toLocaleString('en-US')} / Ee ${s.Ee.toLocaleString('en-US')} psi, Fs ${s.Fs} psi · ${faceGrain === 'ACROSS' ? 'แรงขนานลายไม้ผิว' : 'แรงตั้งฉากลายไม้ผิว'} · KS = ${KS.toFixed(1)} mm³/mm, I = ${I.toFixed(0)} mm⁴/mm, Ib/Q = ${IbQ.toFixed(2)} mm²/mm ที่ t = ${(ti * IN).toFixed(1)} mm${Math.abs(ti * IN - t) > 0.05 ? ` (ความหนา ${t} mm อยู่นอกตาราง ใช้ค่าขอบตาราง)` : ''}`};
}

/** Number of continuous spans: fixed, or AUTO = spans that fit in one sheet across the studs, capped by the APA continuity rule. */
export function resolveSpans(spans: PlywoodSpans, faceGrain: FaceGrain, spacing: number, sheetAcross: number): {n: 1 | 2 | 3; reason: string} {
  if (spans !== 'AUTO') {const n = spans === 'SINGLE' ? 1 : spans === 'TWO' ? 2 : 3; return {n, reason: `กำหนด ${SPAN_LABEL[spans]}`};}
  const fit = Math.floor(sheetAcross / spacing + 1e-9), apa = faceGrain === 'ACROSS' ? (spacing <= 813 ? 3 : 2) : (spacing <= 406 ? 3 : 2);
  const n = Math.max(1, Math.min(3, fit, apa)) as 1 | 2 | 3;
  return {n, reason: `อัตโนมัติ: แผ่นกว้าง ${sheetAcross} mm ขวางคร่าว @ ${spacing} mm ได้ ${fit} ช่วง · กฎ APA ${faceGrain === 'ACROSS' ? 'ลายขวาง ≤ 813 mm → 3 ช่วง' : 'ลายขนาน ≤ 406 mm → 3 ช่วง'} → ใช้ ${n} ช่วง`};
}

export interface PlywoodCheck {id: 'ply-b' | 'ply-v' | 'ply-d'; label: string; demand: number; limit: number; unit: string; formula: string; substitution: string; note: string}
export interface PlywoodDesign {props: PlywoodProperties; spans: 1 | 2 | 3; spanReason: string; l1: number; l2: number; l3: number; checks: PlywoodCheck[];
  /** maximum pressure (kPa) the panel can carry at this spacing = min over bending, shear, deflection */ allowablePressure: number}

export function plywoodDesign(o: {grade: PlywoodGrade; t: number; faceGrain: FaceGrain; spans: PlywoodSpans; pressure: number; spacing: number; studWidth: number;
  deflectionRatio: number; sheetAcross: number; custom: {E: number; Fb: number}}): PlywoodDesign {
  const props = plywoodProperties(o.grade, o.t, o.custom, o.faceGrain), {n, reason} = resolveSpans(o.spans, o.faceGrain, o.spacing, o.sheetAcross), c = COEF[n];
  const preset = o.grade !== 'CUSTOM', p = o.pressure / 1000; // MPa = N/mm per mm width
  const l1 = o.spacing, l2 = preset ? Math.max(l1 - o.studWidth, 0.5 * l1) : l1, l3 = preset ? l2 + (o.studWidth >= 89 ? 15.9 : 6.35) : l1;
  const spanTxt = n === 1 ? 'ช่วงเดี่ยว' : `ต่อเนื่อง ${n} ช่วง`, m = c.m === 1 / 8 ? '1/8' : '1/10';
  const sigma = c.m * p * l1 ** 2 / props.KS;
  const db = c.d * p * l3 ** 4 / (props.E * props.I);
  // APA shear deflection (mixed units as published): Δs = C w t² l₂² / (1270 Ee I), w psf, inches, psi, I in⁴/ft; C = 120 (grain across) / 60 (parallel).
  const ds = preset && props.Ee ? (o.faceGrain === 'ACROSS' ? 120 : 60) * o.pressure * KPA_TO_PSF * (o.t / IN) ** 2 * (l2 / IN) ** 2 / (1270 * props.Ee / PSI * props.I * FT / IN ** 4) * IN : 0;
  const limD = l1 / o.deflectionRatio;
  const checks: PlywoodCheck[] = [
    {id: 'ply-b', label: 'ไม้อัด: ดัด', demand: sigma, limit: props.Fb, unit: 'MPa',
      formula: `M = ${m} · p · l₁² (${spanTxt}); fb = M / ${preset ? 'KS (หน้าตัดประสิทธิผล)' : '(t²/6)'} ≤ Fb`,
      substitution: `p = ${o.pressure.toFixed(2)} kPa; l₁ = ${l1} mm; ${preset ? 'KS' : 'S'} = ${props.KS.toFixed(1)} mm³/mm; Fb = ${props.Fb.toFixed(2)} MPa`, note: `${reason} · ${props.note}`},
    ...(props.Fs !== null && props.IbQ !== null ? [{id: 'ply-v' as const, label: 'ไม้อัด: แรงเฉือนกลิ้ง (rolling shear)', demand: c.v * p * l2 / props.IbQ, limit: props.Fs, unit: 'MPa',
      formula: `V = ${c.v} · p · l₂ (${spanTxt}); fs = V / (Ib/Q) ≤ Fs`,
      substitution: `l₂ = ช่วงว่าง ${l2.toFixed(0)} mm (= l₁ − ความกว้างคร่าว ${o.studWidth} mm); Ib/Q = ${props.IbQ.toFixed(2)} mm²/mm; Fs = ${props.Fs.toFixed(3)} MPa`, note: reason}] : []),
    {id: 'ply-d', label: 'ไม้อัด: การโก่ง', demand: db + ds, limit: limD, unit: 'mm',
      formula: `Δb = ${c.d.toFixed(5)} · p · l₃⁴ / (E I)${preset ? ' ; Δs = C w t² l₂² / (1270 Ee I) (APA) ; Δ = Δb + Δs' : ''} ≤ l₁/${o.deflectionRatio}`,
      substitution: `l₃ = ${l3.toFixed(1)} mm; E = ${props.E.toFixed(0)} MPa; I = ${props.I.toFixed(0)} mm⁴/mm; Δb = ${db.toFixed(3)} mm${preset ? `; Δs = ${ds.toFixed(3)} mm` : ''}`,
      note: preset ? 'ใช้ E ที่ปรับแล้วสำหรับการโก่งจากการดัด และ Ee สำหรับการโก่งจากแรงเฉือนตาม APA' : 'ค่าผู้ใช้กำหนด ไม่รวมการโก่งจากแรงเฉือน'},
  ];
  // Allowable pressure at this spacing (kPa): every check scales linearly with p.
  const allowablePressure = Math.min(...checks.map(k => o.pressure * k.limit / k.demand));
  return {props, spans: n, spanReason: reason, l1, l2, l3, checks, allowablePressure};
}
