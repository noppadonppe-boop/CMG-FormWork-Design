import {finite, record, signed, uniqueIds} from './common.js';
import type {DeliveredReaction} from './loadPath.js';

export const HEIGHT_TERMS = ['soleBoard', 'baseInstalled', 'effectiveStandardStack', 'headInstalled', 'bearer', 'joist', 'plywood'] as const;
export type HeightContributions = Record<typeof HEIGHT_TERMS[number], number | null>;
export function installedHeight(baseElevationMm: number, soffitElevationMm: number, terms: HeightContributions, toleranceMm: number) {
  signed(baseElevationMm, 'base elevation'); signed(soffitElevationMm, 'soffit elevation'); finite(toleranceMm, 'declared tolerance', true);
  if (Object.keys(terms).length !== HEIGHT_TERMS.length || HEIGHT_TERMS.some(k => !Object.hasOwn(terms, k))) throw Error('Named nonoverlapping installed datums required');
  const sumMm = HEIGHT_TERMS.reduce((s, k) => s + finite(terms[k], k, true), 0), requiredMm = soffitElevationMm - baseElevationMm;
  finite(requiredMm, 'installed height');
  return {sumMm, residualMm: requiredMm - sumMm, withinTolerance: Math.abs(requiredMm - sumMm) <= toleranceMm,
    status: 'GEOMETRY_ONLY' as const, constructionRelease: 'NO_GO' as const};
}
export interface RinglockLeg {id: string; headNodeId: string; xMm: number; yMm: number; headElevationMm: number; baseElevationMm: number}
export interface RinglockConfiguration {
  planLayout?: {bearerAxis: 'X'; headAlignment: 'STANDARD_AXIS'};
  manufacturer: string | null; systemId: string | null; configurationId: string | null; ratingId: string | null;
  bayXMm: number | null; bayYMm: number | null; liftHeightsMm: number[]; totalHeightMm: number | null;
  headExtensionMm: number | null; baseExtensionMm: number | null; headEngagementMm: number | null; baseEngagementMm: number | null;
  braceXRef: string | null; braceYRef: string | null; planRestraintRef: string | null; topRestraintRef: string | null; baseRestraintRef: string | null;
  jointStiffnessRef: string | null; groundOrSlabEvidence: string | null; legs: RinglockLeg[];
}
export function compatibleBrace(raw: unknown, systemId: string, bayMm: number, liftMm: number): boolean {
  const r = record(raw);
  return r.role === 'DIAGONAL_BRACE' && r.system_id === systemId && r.bay_label_mm === finite(bayMm, 'bay') && r.lift_label_mm === finite(liftMm, 'lift');
}
/** Reference strings/JSON status never grant authority. Configuration identity/dimensions must match
 * exactly; no interpolation, scaling Fy/A or fallback generic leg SWL. Frame checks remain blocked.
 */
export function screenRinglock(config: RinglockConfiguration, delivered: DeliveredReaction[], rating: unknown, revision: string, demandBasis: 'SERVICE' | 'FACTORED' = 'SERVICE') {
  const blockers: string[] = ['VERIFIED_FRAME_SYSTEM_CHECKS_AND_TRUSTED_REVIEW_REQUIRED'];
  uniqueIds(config.legs, 'ringlock legs');
  if (!config.legs.length) blockers.push('MISSING_LEGS');
  if (new Set(config.legs.map(l => l.headNodeId)).size !== config.legs.length) blockers.push('DUPLICATE_HEAD_NODE');
  for (const l of config.legs) {signed(l.xMm, 'leg x'); signed(l.yMm, 'leg y'); signed(l.baseElevationMm, 'leg base'); signed(l.headElevationMm, 'head elevation');}
  for (const key of ['manufacturer', 'systemId', 'configurationId', 'ratingId', 'braceXRef', 'braceYRef', 'planRestraintRef', 'topRestraintRef', 'baseRestraintRef', 'jointStiffnessRef', 'groundOrSlabEvidence'] as const) {
    if (!config[key]?.trim()) blockers.push(`MISSING_${key}`);
  }
  for (const key of ['bayXMm', 'bayYMm', 'totalHeightMm', 'headEngagementMm', 'baseEngagementMm'] as const) {
    if (config[key] === null) blockers.push(`MISSING_${key}`); else finite(config[key], key);
  }
  for (const key of ['headExtensionMm', 'baseExtensionMm'] as const) {
    if (config[key] === null) blockers.push(`MISSING_${key}`); else finite(config[key], key, true);
  }
  if (!config.liftHeightsMm.length) blockers.push('MISSING_LIFTS'); else config.liftHeightsMm.forEach(l => finite(l, 'lift'));
  const heads = new Set(config.legs.map(l => l.headNodeId));
  for (const r of delivered) {
    signed(r.forceN, 'head reaction'); signed(r.momentNmm, 'head moment');
    if (r.kind !== 'U_HEAD' || !heads.has(r.nodeId) || r.upstreamRevision !== revision) blockers.push(`${r.nodeId}:UNKNOWN_OR_STALE_HEAD_REACTION`);
    const leg = config.legs.find(l => l.headNodeId === r.nodeId);
    if (!r.point || !leg || Math.hypot(r.point.xMm - leg.xMm, r.point.yMm - leg.yMm, r.point.zMm - leg.headElevationMm) > 1e-7) blockers.push(`${r.nodeId}:REACTION_NOT_ON_ACTUAL_STANDARD_HEAD`);
  }
  const legDemands = config.legs.map(l => {
    const rows = delivered.filter(r => r.kind === 'U_HEAD' && r.nodeId === l.headNodeId && r.upstreamRevision === revision);
    if (!rows.length) blockers.push(`${l.id}:MISSING_ACTUAL_NODAL_REACTION`);
    return {legId: l.id, headNodeId: l.headNodeId, forceKN: rows.length ? rows.reduce((s, r) => s + r.forceN, 0) / 1000 : null,
      momentKNmm: rows.length ? rows.reduce((s, r) => s + r.momentNmm, 0) / 1000 : null};
  });
  let failed = false, matched = false;
  if (!rating) blockers.push('MISSING_CONFIGURATION_RATING');
  else {
    const r = record(rating), dims = record(r.dimensions ?? {}), scope = record(r.scope ?? {}), resistance = record(r.resistance ?? {}), restraint = record(r.restraint ?? {});
    matched = r.manufacturer === config.manufacturer && r.system_id === config.systemId && r.configuration_id === config.configurationId && r.rating_id === config.ratingId &&
      !!config.systemId && !!config.configurationId && !!config.ratingId;
    const pairs = [['bay_x_mm', 'bayXMm'], ['bay_y_mm', 'bayYMm'], ['total_height_mm', 'totalHeightMm'],
      ['head_extension_mm', 'headExtensionMm'], ['base_extension_mm', 'baseExtensionMm']] as const;
    for (const [key, field] of pairs) if (config[field] === null || dims[key] !== config[field]) matched = false;
    if (JSON.stringify(dims.lift_heights_mm) !== JSON.stringify(config.liftHeightsMm)) matched = false;
    if (restraint.brace_layout_x_id !== config.braceXRef || restraint.brace_layout_y_id !== config.braceYRef ||
      restraint.horizontal_plan_restraint_id !== config.planRestraintRef || restraint.top_restraint_id !== config.topRestraintRef ||
      restraint.base_restraint_id !== config.baseRestraintRef || restraint.joint_stiffness_model_id !== config.jointStiffnessRef) matched = false;
    if (!matched) blockers.push('RATING_CONFIGURATION_MISMATCH_NO_INTERPOLATION');
    for (const key of ['evidence_ref', 'thai_compliance_mapping_ref', 'demand_basis', 'resistance_basis', 'design_code_id', 'code_edition']) if (typeof r[key] !== 'string' || !String(r[key]).trim()) blockers.push(`MISSING_RATING_${key}`);
    // Only like-for-like explicitly allowable service values can be numerically screened here.
    const basisMatches = demandBasis === 'SERVICE' && r.demand_basis === 'SERVICE' && r.resistance_basis === 'ALLOWABLE';
    if (demandBasis === 'FACTORED') blockers.push('FACTORED_DEMAND_REQUIRES_MATCHED_DESIGN_RESISTANCE_METHOD');
    if (!basisMatches) blockers.push('UNSUPPORTED_OR_UNKNOWN_RATING_BASIS');
    if (scope.second_order_considered !== true || scope.includes_assembly_imperfections !== true || typeof scope.includes_self_weight !== 'boolean') blockers.push('MISSING_RATING_SCOPE');
    for (const key of ['leg_kN', 'u_head_kN', 'base_jack_kN', 'diagonal_tension_kN', 'diagonal_compression_kN']) {
      if (resistance[key] === null || resistance[key] === undefined) blockers.push(`MISSING_${key}`); else finite(resistance[key], key);
    }
    if (!resistance.node_interaction_rule_id) blockers.push('MISSING_NODE_INTERACTION_RULE');
    if (matched && basisMatches) for (const d of legDemands) for (const key of ['leg_kN', 'u_head_kN', 'base_jack_kN']) {
      if (typeof resistance[key] === 'number' && d.forceKN !== null && d.forceKN > resistance[key]) failed = true;
    }
    if (!Number.isFinite(dims.head_min_engagement_mm) || !Number.isFinite(dims.base_min_engagement_mm)) blockers.push('MISSING_MANUFACTURER_ENGAGEMENT_LIMITS');
    else if ((config.headEngagementMm ?? -1) < Number(dims.head_min_engagement_mm) || (config.baseEngagementMm ?? -1) < Number(dims.base_min_engagement_mm)) failed = true;
  }
  if (legDemands.some(d => (d.forceKN !== null && d.forceKN < 0) || (d.momentKNmm !== null && Math.abs(d.momentKNmm) > 1e-8))) blockers.push('UPLIFT_OR_ECCENTRIC_N_M_MODEL_REQUIRED');
  return {status: failed ? 'FAIL' as const : 'BLOCKED' as const, legDemands, matchedRating: matched, blockers,
    constructionEligible: false as const, constructionRelease: 'NO_GO' as const};
}
