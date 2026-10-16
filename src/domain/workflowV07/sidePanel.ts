import {analyzeBeam, type BeamSupport} from './beam.js';
import {finite, uniqueIds} from './common.js';
import {analyzeSidePressureDeck, type PressurePatch} from './sidePressure.js';

export interface SidePanelInput {
  faceId: string; revision: string; lengthMm: number; heightMm: number; pourHeadMm: number | null; gammaKNm3: number | null;
  studPositionsMm: number[]; walerLevelsMm: number[]; walerSupports: BeamSupport[];
  /** Explicit rows may have different support stations. Legacy callers may use the shared list. */
  walerSupportsByLevel?: BeamSupport[][];
  studE_MPa: number; studI_mm4: number; railE_MPa?: number | null; railI_mm4?: number | null;
  heavierRailShare?: number | null; sharingEvidence: string | null;
  independentRailsByLevel?: [{id: string; E_MPa: number; I_mm4: number; share: number}, {id: string; E_MPa: number; I_mm4: number; share: number}][];
  sharingEvidenceByLevel?: (string | null)[];
  pressurePatches?: PressurePatch[];
  plywoodE_MPa?: number; plywoodI_mm4?: number;
}
function positions(xs: number[], length: number, label: string) {
  if (!xs.length || xs.length > 40 || xs.some(x => !Number.isFinite(x) || x < 0 || x > length) || xs.some((x, i) => i > 0 && x <= xs[i - 1])) throw Error(`Invalid actual ${label} coordinates`);
}
/** One face under legacy hydrostatic head or explicit normal-outward pressure patches;
 * all actual levels and overhangs retained. Explicit fields transfer actual plywood reactions.
 * Rail sharing is a declared uniform distribution assumption, not proof of plate/contact behavior.
 * Polygon corners, opposite-face tie compatibility, sheathing and strength remain separate checks.
 */
export function analyzeSidePanel(o: SidePanelInput) {
  const length = finite(o.lengthMm, 'face length'), H = finite(o.heightMm, 'face height');
  const head = o.pressurePatches ? null : finite(o.pourHeadMm, 'pour head');
  if (head !== null && head > H) throw Error('Unsupported head above modelled panel');
  if (!o.pressurePatches) finite(o.gammaKNm3, 'explicit effective pressure coefficient', true);
  positions(o.studPositionsMm, length, 'stud'); positions(o.walerLevelsMm, H, 'waler');
  if (o.studPositionsMm.length < 2 || o.studPositionsMm[0] !== 0 || o.studPositionsMm.at(-1) !== length) throw Error('BLOCKED_UNSUPPORTED: panel X edges require studs; panel overhang model required');
  if (o.walerLevelsMm.length < 2) throw Error('At least two actual waler supports required');
  if (o.walerSupportsByLevel && o.walerSupportsByLevel.length !== o.walerLevelsMm.length) throw Error('Every waler level requires its actual supports');
  if (o.independentRailsByLevel && o.independentRailsByLevel.length !== o.walerLevelsMm.length) throw Error('Every waler level requires its own rail definitions');
  if (o.independentRailsByLevel) for (let i = 0; i < o.independentRailsByLevel.length; i++) {
    const rows = o.independentRailsByLevel[i];
    if (!Array.isArray(rows) || rows.length !== 2 || !rows[0] || !rows[1]) throw Error('Two explicit rail definitions required at every level');
    uniqueIds(rows, 'level rails');
    if (rows.some(r => Object.keys(r).some(k => !['id', 'E_MPa', 'I_mm4', 'share'].includes(k)))) throw Error('Unsupported rail analysis fields');
  }
  if (o.sharingEvidenceByLevel && o.sharingEvidenceByLevel.length !== o.walerLevelsMm.length) throw Error('Every waler level requires its sharing evidence');
  if (!o.independentRailsByLevel && (typeof o.heavierRailShare !== 'number' || !Number.isFinite(o.heavierRailShare) || o.heavierRailShare < .5 || o.heavierRailShare > 1)) throw Error('Invalid rail share');
  const pressureDeck = o.pressurePatches ? analyzeSidePressureDeck({faceId: o.faceId, revision: o.revision, lengthMm: length, heightMm: H,
    studsMm: o.studPositionsMm, E_MPa: finite(o.plywoodE_MPa, 'pressure deck plywood E'), I_mm4: finite(o.plywoodI_mm4, 'pressure deck plywood I'), patches: o.pressurePatches}) : null;
  const studs = o.studPositionsMm.map((x, i) => {
    const left = i === 0 ? 0 : (o.studPositionsMm[i - 1] + x) / 2;
    const right = i === o.studPositionsMm.length - 1 ? length : (x + o.studPositionsMm[i + 1]) / 2;
    const result = analyzeBeam({id: `${o.faceId}:STUD:${i + 1}`, revision: o.revision, lengthMm: H, E_MPa: o.studE_MPa, I_mm4: o.studI_mm4,
      supports: o.walerLevelsMm.map((z, j) => ({id: `LEVEL:${j}`, xMm: z})), points: [],
      patches: pressureDeck ? pressureDeck.studPatches[i] : [{id: `HYDRO:${i}`, startMm: 0, endMm: head!, startNPerMm: o.gammaKNm3! * head! / 1e6 * (right - left), endNPerMm: 0}]});
    return {xMm: x, tributaryMm: right - left, analysis: result};
  });
  const walers = o.walerLevelsMm.map((z, level) => {
    const supports = o.walerSupportsByLevel?.[level] ?? o.walerSupports;
    const points = studs.map((s, j) => ({id: `STUD:${j}`, xMm: s.xMm, forceN: -s.analysis.reactions.find(r => r.supportId === `LEVEL:${level}`)!.forceN}));
    if (points.some(p => p.forceN < -1e-7)) throw Error('BLOCKED_UNSUPPORTED: stud uplift/contact loss at waler');
    const railDefinitions = o.independentRailsByLevel?.[level] ?? [o.heavierRailShare!, 1 - o.heavierRailShare!].map((share, i) => ({id: `RAIL-${i + 1}`, E_MPa: finite(o.railE_MPa, 'rail E'), I_mm4: finite(o.railI_mm4, 'rail I'), share}));
    if (railDefinitions.length !== 2 || railDefinitions.some(r => !Number.isFinite(r.share) || r.share < 0 || r.share > 1) || Math.abs(railDefinitions.reduce((s, r) => s + r.share, 0) - 1) > 1e-12) throw Error('Two declared rail shares must sum to 1');
    const rails = railDefinitions.map((r, i) => analyzeBeam({id: `${o.faceId}:WALER:${level}:RAIL:${i + 1}`, revision: o.revision,
      lengthMm: length, E_MPa: r.E_MPa, I_mm4: r.I_mm4, supports, patches: [],
      points: points.map(p => ({...p, forceN: Math.max(0, p.forceN) * r.share}))}));
    return {zMm: z, rails, railDefinitions, supportDemands: supports.map(s => ({supportId: s.id, xMm: s.xMm,
      forceN: -rails.reduce((sum, r) => sum + r.reactions.find(q => q.supportId === s.id)!.forceN, 0),
      momentNmm: -rails.reduce((sum, r) => sum + r.reactions.find(q => q.supportId === s.id)!.momentNmm, 0)}))};
  });
  const expectedForceN = pressureDeck?.expectedForceN ?? o.gammaKNm3! * length * head! ** 2 / 2e6;
  const expectedXMomentNmm = pressureDeck?.expectedXMomentNmm ?? expectedForceN * length / 2, expectedZMomentNmm = pressureDeck?.expectedZMomentNmm ?? expectedForceN * head! / 3;
  const demands = walers.flatMap(w => w.supportDemands.map(s => ({...s, zMm: w.zMm})));
  const residuals = {forceN: demands.reduce((s, d) => s + d.forceN, 0) - expectedForceN,
    faceLeverNmm: demands.reduce((s, d) => s + d.forceN * d.xMm + d.momentNmm, 0) - expectedXMomentNmm,
    heightLeverNmm: demands.reduce((s, d) => s + d.forceN * d.zMm, 0) - expectedZMomentNmm};
  if (Math.abs(residuals.forceN) > Math.max(1, expectedForceN) * 1e-7 || Math.abs(residuals.faceLeverNmm) > Math.max(1, expectedForceN * length) * 1e-7 ||
    Math.abs(residuals.heightLeverNmm) > Math.max(1, expectedForceN * H) * 1e-7) throw Error('SIDE_PANEL_FORCE_OR_MOMENT_BALANCE_FAILED');
  return {status: 'LOAD_PREVIEW' as const, studs, walers, pressureDeck, pressureBaseKPa: pressureDeck ? pressureDeck.pressureBaseKPa : o.gammaKNm3! * head! / 1000,
    maximumPressureKPa: pressureDeck?.maximumPressureKPa ?? o.gammaKNm3! * head! / 1000, expectedForceN, expectedXMomentNmm, expectedZMomentNmm, residuals,
    blockers: [...((o.sharingEvidenceByLevel ?? [o.sharingEvidence]).some(e => !e?.trim()) ? ['UNVERIFIED_RAIL_SHARING'] : []),
      ...(pressureDeck ? ['SIDE_ONE_WAY_SIMPLE_X_STRIPS_ON_RIGID_STUD_LINES_REQUIRE_REVIEW', 'SIDE_AFFINE_Z_ENDPOINT_ENVELOPE_NO_TWO_WAY_SHEAR_FASTENER_OR_CONTACT_APPROVAL'] : []),
      ...(walers.some(w => w.supportDemands.some(s => s.forceN < -1e-7 || Math.abs(s.momentNmm) > 1e-6)) ? ['SUPPORT_UPLIFT_OR_MOMENT_REQUIRES_ASSEMBLY_MODEL'] : []),
      'PLYWOOD_CONNECTIONS_CORNERS_AND_OPPOSING_TIE_ASSEMBLY_REQUIRED', 'MATERIAL_RESISTANCE_RULES_AND_SYSTEM_CHECKS_REQUIRED'],
    constructionRelease: 'NO_GO' as const};
}
