import {analyzeBeam} from './beam.js';
import {clone, finite, identifier, record, signed, uniqueIds} from './common.js';
import {validateSelectionSnapshot, type SelectionSnapshot} from './catalogues.js';
import type {LoadAction} from './loads.js';

export interface PlywoodProductBinding {
  schemaVersion: '1'; material: SelectionSnapshot | null; grossConvention: 'FULL_PANEL_GROSS';
  parallelToGrainKey: 'Eb0_mean_MPa' | 'Eb90_mean_MPa' | null;
  axisMappingEvidenceRef: string; productMatchEvidenceRef: string; serviceConditionRef: string;
}
export function emptyPlywoodBinding(): PlywoodProductBinding {
  return {schemaVersion: '1', material: null, grossConvention: 'FULL_PANEL_GROSS', parallelToGrainKey: null,
    axisMappingEvidenceRef: '', productMatchEvidenceRef: '', serviceConditionRef: ''};
}
function exact(raw: unknown, keys: string[], label: string, optional: string[] = []) {
  const o = record(raw);
  if (Object.keys(o).some(k => !keys.includes(k) && !optional.includes(k)) || keys.some(k => !Object.hasOwn(o, k))) throw Error(`Invalid ${label} fields/authority`);
  return o;
}
function text(value: unknown, label: string, required = false) {
  if (typeof value !== 'string' || value.length > 2000 || (required && !value.trim())) throw Error(`${label}: evidence required`);
}
export function validatePlywoodBinding(raw: unknown): asserts raw is PlywoodProductBinding {
  const b = exact(raw, Object.keys(emptyPlywoodBinding()), 'plywood binding');
  if (b.schemaVersion !== '1' || b.grossConvention !== 'FULL_PANEL_GROSS' || ![null, 'Eb0_mean_MPa', 'Eb90_mean_MPa'].includes(b.parallelToGrainKey as string | null)) throw Error('Only explicit full-panel gross bending convention supported');
  if (b.material !== null) validateSelectionSnapshot(b.material);
  for (const k of ['axisMappingEvidenceRef', 'productMatchEvidenceRef', 'serviceConditionRef']) text(b[k], k);
}
export function resolvePlywoodElastic(o: {thicknessMm: number | null; effectiveE_MPa: number | null; grainRelativeDeg: 0 | 90 | null; evidenceRef: string; binding?: PlywoodProductBinding | null}) {
  const thicknessMm = finite(o.thicknessMm, 'actual plywood thickness');
  if (![0, 90].includes(o.grainRelativeDeg as number)) throw Error('Actual plywood face grain relative to span required');
  let E_MPa: number, selectedKey: string | null = null, materialId: string | null = null;
  const blockers = ['PLYWOOD_PRODUCT_SERVICE_MOISTURE_DURATION_AND_RESISTANCE_RULES_UNVERIFIED', 'PLYWOOD_ROLLING_SHEAR_BEARING_FASTENERS_AND_CONNECTIONS_REQUIRED'];
  if (o.binding) {
    validatePlywoodBinding(o.binding); const b = o.binding;
    if (o.effectiveE_MPa !== null) throw Error('Bound plywood cannot also override manual E');
    if (!b.material || !b.parallelToGrainKey) throw Error('Plywood material and explicit source axis mapping required');
    for (const k of ['axisMappingEvidenceRef', 'productMatchEvidenceRef', 'serviceConditionRef'] as const) text(b[k], k, true);
    const m = b.material.effective, scope = record(m.applicability), props = record(m.properties);
    identifier(m.material_id, 'plywood material identity');
    if (m.category !== 'PLYWOOD' || !Array.isArray(scope.compatible_section_families) || !scope.compatible_section_families.includes('PLYWOOD_GROSS_STRIP')) throw Error('Plywood product bending data required; timber/steel E cannot substitute');
    if (Math.abs(finite(scope.nominal_thickness_mm, 'source plywood thickness') - thicknessMm) > 1e-8) throw Error('Plywood thickness differs from source product; no interpolation/tolerance or reduced-section rule assumed');
    if (typeof scope.gross_effective_convention !== 'string' || !scope.gross_effective_convention.trim()) throw Error('Source full-panel gross convention required');
    selectedKey = o.grainRelativeDeg === 0 ? b.parallelToGrainKey : b.parallelToGrainKey === 'Eb0_mean_MPa' ? 'Eb90_mean_MPa' : 'Eb0_mean_MPa';
    E_MPa = finite(props[selectedKey], 'directional plywood bending modulus'); materialId = m.material_id as string;
    blockers.push('PLYWOOD_SOURCE_AXIS_MAPPING_AND_ACTUAL_PRODUCT_MATCH_REQUIRE_ENGINEERING_REVIEW');
  } else {text(o.evidenceRef, 'manual plywood product/axis/service source', true); E_MPa = finite(o.effectiveE_MPa, 'plywood directional effective E'); blockers.push('PLYWOOD_MANUAL_ELASTIC_INPUT_NOT_BOUND_TO_PRODUCT');}
  const I_mm4 = 1000 * thicknessMm ** 3 / 12, S_mm3 = 1000 * thicknessMm ** 2 / 6;
  finite(I_mm4, 'plywood gross I'); finite(S_mm3, 'plywood gross S');
  return {thicknessMm, E_MPa, I_mm4, S_mm3, designStripMm: 1000 as const, selectedKey, materialId,
    binding: o.binding ? clone(o.binding) : null, blockers, constructionRelease: 'NO_GO' as const};
}
export interface SoffitPlywoodDefinition {
  schemaVersion: '1'; thicknessMm: number | null; effectiveE_MPa: number | null; grainAxis: 'X' | 'Y' | null;
  jointsAtEveryJoist: boolean | null; evidenceRef: string; startYMm: number | null; endYMm: number | null;
  selfWeightKPa: number | null; selfWeightOwnership: 'SEPARATE_ACTION' | 'IN_ADDITIONAL_DL' | null; selfWeightEvidenceRef: string;
  binding?: PlywoodProductBinding | null;
}
export function emptySoffitPlywood(): SoffitPlywoodDefinition {
  return {schemaVersion: '1', thicknessMm: null, effectiveE_MPa: null, grainAxis: null, jointsAtEveryJoist: null, evidenceRef: '',
    startYMm: null, endYMm: null, selfWeightKPa: null, selfWeightOwnership: null, selfWeightEvidenceRef: '', binding: null};
}
export function validateSoffitPlywood(raw: unknown): asserts raw is SoffitPlywoodDefinition {
  const p = exact(raw, Object.keys(emptySoffitPlywood()).filter(k => k !== 'binding'), 'soffit plywood', ['binding']);
  if (p.schemaVersion !== '1' || ![null, 'X', 'Y'].includes(p.grainAxis as string | null) || ![null, true, false].includes(p.jointsAtEveryJoist as boolean | null) || ![null, 'SEPARATE_ACTION', 'IN_ADDITIONAL_DL'].includes(p.selfWeightOwnership as string | null)) throw Error('Invalid plywood grain/joints/ownership');
  for (const k of ['thicknessMm', 'effectiveE_MPa', 'selfWeightKPa']) if (p[k] !== null) finite(p[k], k, k === 'selfWeightKPa');
  for (const k of ['startYMm', 'endYMm']) if (p[k] !== null) signed(p[k], k);
  for (const k of ['evidenceRef', 'selfWeightEvidenceRef']) text(p[k], k);
  if (p.binding !== null && p.binding !== undefined) validatePlywoodBinding(p.binding);
}
export interface PlywoodSurfacePatch {id: string; kind: LoadAction['kind']; startY: number; endY: number; qKPa: number; startX?: number; endX?: number}
export function assertDeckCoverage(surfaces: PlywoodSurfacePatch[], x0: number, x1: number, y0: number, y1: number, minimumQ: number) {
  const xs = [...new Set([x0, x1, ...surfaces.flatMap(s => [Math.max(x0, s.startX ?? x0), Math.min(x1, s.endX ?? x1)])])].filter(x => x >= x0 && x <= x1).sort((a, b) => a - b);
  const ys = [...new Set([y0, y1, ...surfaces.flatMap(s => [Math.max(y0, s.startY), Math.min(y1, s.endY)])])].filter(y => y >= y0 && y <= y1).sort((a, b) => a - b);
  for (let i = 1; i < xs.length; i++) for (let j = 1; j < ys.length; j++) if (surfaces.filter(s => (s.startX ?? x0) <= xs[i - 1] && (s.endX ?? x1) >= xs[i] && s.startY <= ys[j - 1] && s.endY >= ys[j]).reduce((q, s) => q + s.qKPa, 0) < minimumQ) throw Error('Owning additional DL does not cover plywood self-weight in every actual X/Y zone');
}
export function analyzePlywoodDeck(o: {modelId: string; revision: string; stageId: string; loadCaseId: string; joistXMm: number[]; definition: SoffitPlywoodDefinition; surfaces: PlywoodSurfacePatch[]}) {
  validateSoffitPlywood(o.definition); const p = o.definition;
  text(p.evidenceRef, 'actual plywood joints/extent source', true);
  for (const k of ['modelId', 'revision', 'stageId', 'loadCaseId'] as const) identifier(o[k], k);
  if (p.jointsAtEveryJoist !== true || !['X', 'Y'].includes(p.grainAxis as string)) throw Error('Plywood needs explicit face grain and simply spanning joints at every joist; continuity/two-way panels unsupported');
  const elastic = resolvePlywoodElastic({...p, grainRelativeDeg: p.grainAxis === 'X' ? 0 : 90});
  const y0 = signed(p.startYMm, 'actual plywood start Y'), y1 = signed(p.endYMm, 'actual plywood end Y');
  if (y1 <= y0) throw Error('Actual plywood Y extent required');
  if (!Array.isArray(o.joistXMm) || o.joistXMm.length < 2 || o.joistXMm.length > 40 || o.joistXMm.some((x, i) => !Number.isFinite(x) || (i > 0 && x <= o.joistXMm[i - 1]))) throw Error('Sorted actual panel support X coordinates required');
  if (!Array.isArray(o.surfaces) || !o.surfaces.length || o.surfaces.length > 80) throw Error('Explicit bounded actual plywood surface actions required');
  uniqueIds(o.surfaces, 'plywood surface actions');
  const x0 = o.joistXMm[0], x1 = o.joistXMm.at(-1)!;
  for (const s of o.surfaces) {finite(s.qKPa, 'surface pressure', true); signed(s.startY, 'surface start'); signed(s.endY, 'surface end'); if (!['CONCRETE', 'ADDITIONAL_DL', 'CONSTRUCTION_LL', 'SELF_WEIGHT', 'PLACEMENT', 'OTHER'].includes(s.kind)) throw Error('Unsupported plywood surface action mapping'); if ((s.startX === undefined) !== (s.endX === undefined)) throw Error('Both actual surface X bounds required'); const a = s.startX === undefined ? x0 : signed(s.startX, 'surface X0'), b = s.endX === undefined ? x1 : signed(s.endX, 'surface X1'); if (a < x0 || b > x1 || b <= a || s.startY < y0 || s.endY > y1 || s.endY <= s.startY) throw Error('Surface load outside actual plywood extent');}
  const boundaries = [...new Set([y0, y1, ...o.surfaces.flatMap(s => [s.startY, s.endY])])].sort((a, b) => a - b);
  const weight = finite(p.selfWeightKPa, 'explicit plywood self-weight', true); text(p.selfWeightEvidenceRef, 'plywood self-weight ownership source', true);
  if (!p.selfWeightOwnership) throw Error('Explicit plywood self-weight ownership required');
  const self = o.surfaces.filter(s => s.kind === 'SELF_WEIGHT');
  if (p.selfWeightOwnership === 'SEPARATE_ACTION') {
    if ((weight > 0 && self.length !== 1) || self.some(s => s.id !== 'SELF:PLYWOOD' || s.startY !== y0 || s.endY !== y1 || (s.startX ?? x0) !== x0 || (s.endX ?? x1) !== x1 || s.qKPa !== weight)) throw Error('Separate plywood self-weight surface mapping missing or duplicated');
  } else {
    if (self.length) throw Error('Included plywood weight cannot also have a separate surface action');
    assertDeckCoverage(o.surfaces.filter(s => s.kind === 'ADDITIONAL_DL'), x0, x1, y0, y1, weight);
  }
  if ((o.joistXMm.length - 1) * (boundaries.length - 1) > 400) throw Error('BLOCKED_MODEL_SIZE: at most 400 actual plywood span/zone analyses; no zones omitted');
  const strips: {id: string; startXMm: number; endXMm: number; startYMm: number; endYMm: number; qKPa: number; sourceActionIds: string[]; spatialPatches: {id: string; startXMm: number; endXMm: number; qKPa: number}[]; analysis: ReturnType<typeof analyzeBeam>; stressDemandMPa: number}[] = [];
  const transfers: {sourceStripId: string; upstreamRevision: string; targetJoistId: string; xMm: number; startYMm: number; endYMm: number; lineLoadNPerMm: number}[] = [];
  for (let j = 1; j < boundaries.length; j++) {
    const startY = boundaries[j - 1], endY = boundaries[j], zone = o.surfaces.filter(s => s.startY <= startY && s.endY >= endY);
    for (let i = 1; i < o.joistXMm.length; i++) {
      const a = o.joistXMm[i - 1], b = o.joistXMm[i], id = `${o.modelId}:PLY:${i}:ZONE:${j}`;
      const active = zone.filter(s => (s.startX ?? x0) < b && (s.endX ?? x1) > a), spatialPatches = active.map(s => ({id: s.id, startXMm: Math.max(a, s.startX ?? x0), endXMm: Math.min(b, s.endX ?? x1), qKPa: s.qKPa}));
      const qKPa = spatialPatches.every(s => s.startXMm === a && s.endXMm === b) ? active.reduce((v, s) => v + s.qKPa, 0) : spatialPatches.reduce((v, s) => v + s.qKPa * (s.endXMm - s.startXMm) / (b - a), 0);
      const analysis = analyzeBeam({id, revision: o.revision, lengthMm: b - a, E_MPa: elastic.E_MPa, I_mm4: elastic.I_mm4,
        supports: [{id: 'A', xMm: 0}, {id: 'B', xMm: b - a}], points: [],
        patches: spatialPatches.filter(s => s.qKPa > 0).map(s => ({id: s.id, startMm: s.startXMm - a, endMm: s.endXMm - a, startNPerMm: s.qKPa, endNPerMm: s.qKPa}))});
      strips.push({id, startXMm: a, endXMm: b, startYMm: startY, endYMm: endY, qKPa, sourceActionIds: active.map(s => s.id), spatialPatches, analysis, stressDemandMPa: analysis.maxMomentNmm / elastic.S_mm3});
      for (const [supportId, targetJoistId, xMm] of [['A', `JOIST-${i}`, a], ['B', `JOIST-${i + 1}`, b]] as const) transfers.push({sourceStripId: id, upstreamRevision: o.revision, targetJoistId, xMm, startYMm: startY, endYMm: endY, lineLoadNPerMm: -analysis.reactions.find(r => r.supportId === supportId)!.forceN / 1000});
    }
  }
  const force = (s: PlywoodSurfacePatch) => s.qKPa * ((s.endX ?? x1) - (s.startX ?? x0)) * (s.endY - s.startY) / 1000;
  const expectedForceN = o.surfaces.reduce((sum, s) => sum + force(s), 0);
  const expectedXMomentNmm = o.surfaces.reduce((sum, s) => sum + force(s) * ((s.startX ?? x0) + (s.endX ?? x1)) / 2, 0);
  const expectedYMomentNmm = o.surfaces.reduce((sum, s) => sum + force(s) * (s.startY + s.endY) / 2, 0);
  const residuals = {forceN: transfers.reduce((sum, t) => sum + t.lineLoadNPerMm * (t.endYMm - t.startYMm), 0) - expectedForceN,
    xLeverNmm: transfers.reduce((sum, t) => sum + t.lineLoadNPerMm * (t.endYMm - t.startYMm) * t.xMm, 0) - expectedXMomentNmm,
    yLeverNmm: transfers.reduce((sum, t) => sum + t.lineLoadNPerMm * (t.endYMm - t.startYMm) * (t.startYMm + t.endYMm) / 2, 0) - expectedYMomentNmm};
  if (Math.abs(residuals.forceN) > Math.max(1, expectedForceN) * 1e-7 || Math.abs(residuals.xLeverNmm) > Math.max(1, Math.abs(expectedXMomentNmm), expectedForceN * (x1 - x0)) * 1e-7 || Math.abs(residuals.yLeverNmm) > Math.max(1, Math.abs(expectedYMomentNmm), expectedForceN * (y1 - y0)) * 1e-7) throw Error('PLYWOOD_STRIP_TRANSFER_FORCE_OR_MOMENT_BALANCE_FAILED');
  return {status: 'LOAD_PREVIEW' as const, revisionId: o.revision, stageId: o.stageId, loadCaseId: o.loadCaseId, elastic, strips, transfers, expectedForceN, residuals,
    blockers: [...elastic.blockers, 'PLYWOOD_EXPLICIT_SIMPLE_JOINTS_AND_RIGID_JOIST_LINES_REQUIRE_VERIFICATION', 'PLYWOOD_CAPACITY_ROLLING_SHEAR_FASTENERS_AND_EDGE_BEARING_REQUIRED'], constructionRelease: 'NO_GO' as const};
}
