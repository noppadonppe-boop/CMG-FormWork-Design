import {finite, identifier, record, signed, uniqueIds} from './common.js';
import {resolveMemberElastic, validateElasticBinding, type ElasticMemberBinding} from './elasticBinding.js';
import {beamMemberEvidenceReference, validateBeamMemberEvidence, type BeamMemberEvidence} from './beamResistance.js';

export interface IndependentWalerRail {
  id: string; family: 'SHS' | 'RHS' | 'CHS' | 'C' | 'C_LIP' | null;
  E_MPa: number | null; bendingI_mm4: number | null; orientationDeg: 0 | 90 | null;
  sectionRef: string; materialRef: string; axisEvidenceRef: string;
  continuity: 'CONTINUOUS' | 'SPLICED' | null; spliceStationsMm: (number | null)[]; spliceEvidenceRef: string;
  binding?: ElasticMemberBinding | null;
  resistanceEvidence?: BeamMemberEvidence[] | null;
}
export interface WalerSupportFitting {
  supportId: string; plateRef: string; plateWidthAcrossRailsMm: number | null; plateThicknessMm: number | null;
  clearHoleDiameterMm: number | null; requiredRadialClearanceMm: number | null; contactEvidenceRef: string;
}
export interface IndependentWalerPair {
  schemaVersion: '1'; mode: 'INDEPENDENT_NONCOMPOSITE'; railCount: 2; compositeAction: false;
  rails: [IndependentWalerRail, IndependentWalerRail]; rail1Share: number | null; sharingEvidenceRef: string;
  clearGapMm: number | null; separationAxis: 'FACE_VERTICAL' | 'FACE_NORMAL' | null; geometryEvidenceRef: string;
  supportFittings: WalerSupportFitting[];
}
export function emptyWalerPair(): IndependentWalerPair {
  const rail = (id: string): IndependentWalerRail => ({id, family: null, E_MPa: null, bendingI_mm4: null, orientationDeg: null,
    sectionRef: '', materialRef: '', axisEvidenceRef: '', continuity: null, spliceStationsMm: [], spliceEvidenceRef: ''});
  return {schemaVersion: '1', mode: 'INDEPENDENT_NONCOMPOSITE', railCount: 2, compositeAction: false, rails: [rail('R1'), rail('R2')],
    rail1Share: null, sharingEvidenceRef: '', clearGapMm: null, separationAxis: null, geometryEvidenceRef: '', supportFittings: []};
}
function exact(raw: unknown, keys: string[], label: string, optional: string[] = []): Record<string, unknown> {
  const value = record(raw);
  if (Object.keys(value).some(k => !keys.includes(k) && !optional.includes(k)) || keys.some(k => !Object.hasOwn(value, k))) throw Error(`Invalid ${label} fields or authority metadata`);
  return value;
}
function text(value: unknown, label: string, required = false) {
  if (typeof value !== 'string' || value.length > 2000 || (required && !value.trim())) throw Error(`${label} required or invalid`);
}
/** Unknown draft values are retained; malformed values and unsupported authority flags are rejected. */
export function validateWalerPair(raw: unknown): asserts raw is IndependentWalerPair {
  const p = exact(raw, Object.keys(emptyWalerPair()), 'independent waler pair');
  if (p.schemaVersion !== '1' || p.mode !== 'INDEPENDENT_NONCOMPOSITE' || p.railCount !== 2 || p.compositeAction !== false) throw Error('Two independent noncomposite rails required; built-up action unsupported');
  if (!Array.isArray(p.rails) || p.rails.length !== 2) throw Error('Exactly two physical rails required');
  uniqueIds(p.rails as IndependentWalerRail[], 'physical waler rails');
  for (const rawRail of p.rails) {
    const r = exact(rawRail, Object.keys(emptyWalerPair().rails[0]), 'waler rail', ['binding', 'resistanceEvidence']);
    if (r.binding !== null && r.binding !== undefined) validateElasticBinding(r.binding);
    if (r.resistanceEvidence !== null && r.resistanceEvidence !== undefined) {
      if (!Array.isArray(r.resistanceEvidence) || r.resistanceEvidence.length > 3) throw Error('At most three 1D member evidence rows are supported per rail');
      r.resistanceEvidence.forEach(validateBeamMemberEvidence);
    }
    if (![null, 'SHS', 'RHS', 'CHS', 'C', 'C_LIP'].includes(r.family as string | null) || ![null, 0, 90].includes(r.orientationDeg as number | null) || ![null, 'CONTINUOUS', 'SPLICED'].includes(r.continuity as string | null)) throw Error('Invalid waler family/orientation/continuity');
    for (const key of ['E_MPa', 'bendingI_mm4']) if (r[key] !== null) finite(r[key], key);
    for (const key of ['sectionRef', 'materialRef', 'axisEvidenceRef', 'spliceEvidenceRef']) text(r[key], key);
    if (!Array.isArray(r.spliceStationsMm) || r.spliceStationsMm.length > 40) throw Error('Invalid splice station list');
    r.spliceStationsMm.forEach(v => {if (v !== null) signed(v, 'splice station');});
  }
  if (p.rail1Share !== null && (typeof p.rail1Share !== 'number' || !Number.isFinite(p.rail1Share) || p.rail1Share < 0 || p.rail1Share > 1)) throw Error('Rail 1 share must be explicitly between 0 and 1');
  if (p.clearGapMm !== null) finite(p.clearGapMm, 'clear rail gap', true);
  if (![null, 'FACE_VERTICAL', 'FACE_NORMAL'].includes(p.separationAxis as string | null)) throw Error('Invalid rail separation axis');
  text(p.sharingEvidenceRef, 'sharing evidence'); text(p.geometryEvidenceRef, 'pair geometry evidence');
  if (!Array.isArray(p.supportFittings) || p.supportFittings.length > 40) throw Error('Invalid support fittings');
  uniqueIds((p.supportFittings as WalerSupportFitting[]).map(f => ({id: f.supportId})), 'waler fitting support IDs');
  for (const rawFitting of p.supportFittings) {
    const f = exact(rawFitting, ['supportId', 'plateRef', 'plateWidthAcrossRailsMm', 'plateThicknessMm', 'clearHoleDiameterMm', 'requiredRadialClearanceMm', 'contactEvidenceRef'], 'support fitting');
    for (const key of ['plateRef', 'contactEvidenceRef']) text(f[key], key);
    for (const key of ['plateWidthAcrossRailsMm', 'plateThicknessMm', 'clearHoleDiameterMm', 'requiredRadialClearanceMm']) if (f[key] !== null) finite(f[key], key, key === 'requiredRadialClearanceMm');
  }
}
export function resolveWalerPair(pair: IndependentWalerPair, lengthMm: number, supportIds: string[]) {
  validateWalerPair(pair); finite(lengthMm, 'waler length');
  const blockers = ['WALER_PAIR_ACTUAL_PLATE_CONTACT_AND_EFFECTIVE_SUPPORT_LINE_UNVERIFIED', 'WALER_PAIR_TORSION_LOCAL_BEARING_AND_STABILITY_RULES_REQUIRED'];
  if (pair.rail1Share === null) throw Error('Explicit rail 1 share required; stiffness does not imply load sharing');
  text(pair.sharingEvidenceRef, 'declared sharing assumption evidence', true);
  if (pair.clearGapMm === null || !pair.separationAxis || !pair.geometryEvidenceRef.trim()) blockers.push('WALER_PAIR_GAP_OR_ORIENTATION_GEOMETRY_UNKNOWN');
  if (pair.separationAxis === 'FACE_NORMAL') blockers.push('WALER_PAIR_NORMAL_STACK_CONTACT_AND_LOAD_TRANSFER_UNSUPPORTED');
  const rails = pair.rails.map((r, i) => {
    const bound = r.binding ? resolveMemberElastic({E_MPa: r.E_MPa, I_mm4: r.bendingI_mm4, evidenceRef: r.axisEvidenceRef, binding: r.binding}, 'WALER') : null;
    const family = bound && 'family' in bound ? bound.family : r.family;
    if (bound) {
      if ((r.family !== null && r.family !== family) || (r.orientationDeg !== null && r.orientationDeg !== r.binding!.orientationDeg)) throw Error(`${r.id}: duplicated rail family/orientation conflicts with binding`);
      blockers.push(...bound.blockers.map(b => `${r.id}:${b}`));
    } else {
      if (!r.family || r.orientationDeg === null) throw Error(`${r.id}: physical family and bending orientation required`);
      text(r.sectionRef, `${r.id}: section source`, true); text(r.materialRef, `${r.id}: material source`, true); text(r.axisEvidenceRef, `${r.id}: chosen bending axis evidence`, true);
    }
    text(r.spliceEvidenceRef, `${r.id}: continuity evidence`, true);
    if (r.spliceStationsMm.some((x, j) => x === null || x <= 0 || x >= lengthMm || (j > 0 && x <= r.spliceStationsMm[j - 1]!))) throw Error(`${r.id}: sorted actual interior splice stations required`);
    if (r.continuity !== 'CONTINUOUS' || r.spliceStationsMm.length) throw Error(`${r.id}: actual splice stiffness/transfer model required; continuity cannot be assumed across a splice`);
    if (family === 'CHS') blockers.push(`${r.id}:CHS_SADDLE_RETAINER_AND_CURVED_CONTACT_REQUIRED`);
    if (family === 'C_LIP') blockers.push(`${r.id}:C_LIP_EFFECTIVE_SECTION_DISTORTIONAL_AND_LOCAL_METHOD_REQUIRED`);
    return {id: r.id, E_MPa: bound?.E_MPa ?? finite(r.E_MPa, `${r.id}: E`), I_mm4: bound?.I_mm4 ?? finite(r.bendingI_mm4, `${r.id}: actual bending I`),
      share: i === 0 ? pair.rail1Share! : 1 - pair.rail1Share!,
      memberEvidenceRef: beamMemberEvidenceReference('WALER_RAIL', {id: r.id, family: r.family, E_MPa: r.E_MPa, bendingI_mm4: r.bendingI_mm4,
        orientationDeg: r.orientationDeg, sectionRef: r.sectionRef, materialRef: r.materialRef, axisEvidenceRef: r.axisEvidenceRef, binding: r.binding ?? null}),
      resistanceEvidence: r.resistanceEvidence ?? []};
  }) as [
    {id: string; E_MPa: number; I_mm4: number; share: number; memberEvidenceRef: string; resistanceEvidence: BeamMemberEvidence[]},
    {id: string; E_MPa: number; I_mm4: number; share: number; memberEvidenceRef: string; resistanceEvidence: BeamMemberEvidence[]}
  ];
  for (const f of pair.supportFittings) if (!supportIds.includes(f.supportId)) throw Error(`Fitting refers to unknown actual support ${f.supportId}`);
  for (const id of supportIds) {
    const f = pair.supportFittings.find(f => f.supportId === id);
    if (!f || !f.plateRef.trim() || !f.contactEvidenceRef.trim() || f.plateWidthAcrossRailsMm === null || f.plateThicknessMm === null || f.clearHoleDiameterMm === null || f.requiredRadialClearanceMm === null) blockers.push(`${id}:ACTUAL_SUPPORT_PLATE_AND_CLEARANCE_DATA_MISSING`);
  }
  return {rails, blockers};
}
/** Pure measured-envelope checks only; a fitting envelope never certifies plate/contact capacity. */
export function screenWalerTieFit(pair: IndependentWalerPair, supportId: string, outsideDiameterMm: number) {
  validateWalerPair(pair); finite(outsideDiameterMm, 'tie outer envelope'); identifier(supportId, 'support fitting');
  const fitting = pair.supportFittings.find(f => f.supportId === supportId), issues: string[] = [];
  const availableGapMm = pair.separationAxis === 'FACE_VERTICAL' && pair.clearGapMm !== null ? pair.clearGapMm - outsideDiameterMm : null;
  const availableHoleMm = fitting?.clearHoleDiameterMm == null ? null : fitting.clearHoleDiameterMm - outsideDiameterMm;
  const requiredDiametralClearanceMm = fitting?.requiredRadialClearanceMm == null ? null : 2 * fitting.requiredRadialClearanceMm;
  if (availableGapMm !== null && availableGapMm < 0) issues.push('TIE_ENVELOPE_EXCEEDS_CLEAR_RAIL_GAP');
  if (availableHoleMm !== null && availableHoleMm < 0) issues.push('TIE_ENVELOPE_EXCEEDS_CLEAR_PLATE_HOLE');
  if (pair.separationAxis === 'FACE_VERTICAL' && pair.clearGapMm !== null && fitting?.plateWidthAcrossRailsMm != null && fitting.plateWidthAcrossRailsMm <= pair.clearGapMm) issues.push('PLATE_WIDTH_CANNOT_BRIDGE_CLEAR_RAIL_GAP');
  if (requiredDiametralClearanceMm !== null) {
    if (availableGapMm !== null && availableGapMm < requiredDiametralClearanceMm) issues.push('DECLARED_REQUIRED_GAP_CLEARANCE_NOT_MET');
    if (availableHoleMm !== null && availableHoleMm < requiredDiametralClearanceMm) issues.push('DECLARED_REQUIRED_HOLE_CLEARANCE_NOT_MET');
  }
  return {status: issues.length ? 'FAIL' as const : 'BLOCKED' as const, availableGapMm, availableHoleMm, requiredDiametralClearanceMm, issues,
    blockers: ['WALER_PLATE_TIE_CENTRE_OFFSET_EDGE_DISTANCES_AND_CONTACT_NOT_VERIFIED'], constructionRelease: 'NO_GO' as const};
}
