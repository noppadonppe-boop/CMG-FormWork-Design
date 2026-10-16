/**
 * Lateral pressure of fresh concrete on vertical formwork.
 *  - HYDROSTATIC: p = ρ g h over the full pour height (always safe; ACI 4.2.2 default).
 *  - ACI347: ACI PRC-347-14(21) "Guide to Formwork for Concrete" (= ACI 347R-14, reapproved 2021), §4.2.2.1b SI version,
 *    equation chosen by Table 4.2.2.1b, chemistry coefficient Cc (Table 4.2.2.1a(b)) and unit weight coefficient Cw (Table 4.2.2.1a(c)).
 *    CCPmax is not less than 30·Cw kPa and never greater than ρ g h. Distribution (Fig. 4.2.2): hydrostatic down to h_cap = CCPmax/(ρ g),
 *    then constant CCPmax.
 * SCC and other cases outside Table 4.2.2.1b (slump > 175 mm, internal vibration deeper than 1.2 m, walls R > 4.5 m/h) use ρ g h.
 */
export type PressureMethod = 'HYDROSTATIC' | 'ACI347';
export type AciEquation = '4.2.2.1b(a)' | '4.2.2.1b(b)' | '4.2.2.1b(c)';
export const CC_VALUES = [1.0, 1.2, 1.4, 1.5] as const;
export const ACI_REFERENCE = 'ACI PRC-347-14(21) Guide to Formwork for Concrete (ACI 347R-14, reapproved 2021) §4.2.2';
const G = 0.00981; // kN/kg (ACI notation g)

export interface PressureInput {pressureMethod: PressureMethod; gamma: number; height: number; width: number; length: number;
  pourRate: number; concreteTemp: number; slump: number; vibrationDepth: number; chemistryCc: number}
export interface PressureModel {
  method: PressureMethod; equation: AciEquation | 'HYDROSTATIC'; element: 'COLUMN' | 'WALL'; reason: string;
  rho: number; Cw: number; Cc: number; R: number; T: number; H: number;
  /** kPa */ hydrostatic: number; equationValue: number | null; minimum: number | null; pmax: number;
  /** depth (mm) below the top at which pressure reaches pmax */ hcap: number;
  /** resultant per metre of face, kN/m */ forcePerM: number;
  steps: string[];
}

/** Unit weight coefficient Cw, ACI Table 4.2.2.1a(c) SI. */
export function unitWeightCoefficient(rho: number) {
  return rho < 2240 ? Math.max(0.8, 0.5 * (1 + rho / 2320)) : rho <= 2400 ? 1 : rho / 2320;
}
const f = (v: number, d = 2) => v.toFixed(d);

export function lateralPressure(x: PressureInput): PressureModel {
  const rho = x.gamma / G, H = x.height / 1000, hyd = rho * G * H, R = x.pourRate, T = x.concreteTemp, Cc = x.chemistryCc, Cw = unitWeightCoefficient(rho);
  // ACI: columns have no plan dimension exceeding 2 m; walls have at least one plan dimension exceeding 2 m.
  const element: 'COLUMN' | 'WALL' = Math.max(x.width, x.length) <= 2000 ? 'COLUMN' : 'WALL';
  const steps = [`ρ = γ/g = ${f(x.gamma, 1)} / ${G} = ${f(rho, 0)} kg/m³`, `แรงดันของเหลว ρgh = ${f(rho, 0)} × ${G} × ${f(H, 3)} = ${f(hyd)} kPa`];
  const done = (equation: PressureModel['equation'], reason: string, eq: number | null, min: number | null, pmax: number): PressureModel => {
    const hcap = Math.min(H, pmax / (rho * G)), force = rho * G * hcap ** 2 / 2 + pmax * (H - hcap);
    return {method: x.pressureMethod, equation, element, reason, rho, Cw, Cc, R, T, H: x.height, hydrostatic: hyd, equationValue: eq, minimum: min, pmax,
      hcap: hcap * 1000, forcePerM: force, steps};
  };
  if (x.pressureMethod === 'HYDROSTATIC') return done('HYDROSTATIC', 'เลือกใช้แรงดันของเหลวเต็มความสูง (ปลอดภัยเสมอ)', null, null, hyd);
  let eq: AciEquation, reason: string;
  if (x.slump > 175) [eq, reason] = ['4.2.2.1b(a)', `ค่ายุบตัว ${x.slump} mm > 175 mm (รวมคอนกรีต SCC) → ใช้แรงดันของเหลว`];
  else if (x.vibrationDepth > 1.2) [eq, reason] = ['4.2.2.1b(a)', `ความลึกเครื่องจี้ ${x.vibrationDepth} m > 1.2 m → ใช้แรงดันของเหลว`];
  else if (element === 'COLUMN') [eq, reason] = ['4.2.2.1b(b)', 'เสา (ไม่มีด้านใดในแปลนเกิน 2 m) · ทุกอัตราการเท'];
  else if (R > 4.5) [eq, reason] = ['4.2.2.1b(a)', `ผนัง · อัตราการเท ${R} m/h > 4.5 m/h → ใช้แรงดันของเหลว`];
  else if (R >= 2.1) [eq, reason] = ['4.2.2.1b(c)', `ผนัง · อัตราการเท 2.1–4.5 m/h`];
  else if (H > 4.2) [eq, reason] = ['4.2.2.1b(c)', `ผนังสูง ${f(H, 2)} m > 4.2 m · อัตราการเท < 2.1 m/h`];
  else [eq, reason] = ['4.2.2.1b(b)', `ผนังสูง ${f(H, 2)} m ≤ 4.2 m · อัตราการเท < 2.1 m/h`];
  steps.push(`ตาราง 4.2.2.1b: ${reason} → สมการ ${eq}`, `Cw (ตาราง 4.2.2.1a(c), ρ = ${f(rho, 0)} kg/m³) = ${f(Cw, 3)} · Cc (ตาราง 4.2.2.1a(b)) = ${f(Cc, 1)}`);
  if (eq === '4.2.2.1b(a)') return done(eq, reason, hyd, null, hyd);
  const k = T + 17.8;
  const value = eq === '4.2.2.1b(b)' ? Cc * Cw * (7.2 + 785 * R / k) : Cc * Cw * (7.2 + 1156 / k + 244 * R / k);
  steps.push(eq === '4.2.2.1b(b)'
    ? `CCPmax = Cc Cw [7.2 + 785R/(T+17.8)] = ${f(Cc, 1)} × ${f(Cw, 3)} × [7.2 + 785 × ${R} / (${T} + 17.8)] = ${f(value)} kPa`
    : `CCPmax = Cc Cw [7.2 + 1156/(T+17.8) + 244R/(T+17.8)] = ${f(Cc, 1)} × ${f(Cw, 3)} × [7.2 + 1156/${f(k, 1)} + 244 × ${R}/${f(k, 1)}] = ${f(value)} kPa`);
  const min = 30 * Cw, pmax = Math.min(hyd, Math.max(min, value));
  steps.push(`ขั้นต่ำ 30 Cw = ${f(min)} kPa · สูงสุดไม่เกิน ρgh = ${f(hyd)} kPa → pmax = ${f(pmax)} kPa`);
  steps.push(`ความลึกที่แรงดันถึง pmax: hcap = pmax/(ρg) = ${f(Math.min(H, pmax / (rho * G)) * 1000, 0)} mm`);
  return done(eq, reason, value, min, pmax);
}
