import {canonical, clone, finite, identifier, record, signed, uniqueIds} from './common.js';
import {installedHeight, type HeightContributions} from './ringlock.js';
import type {WorkflowModel} from './model.js';
import type {AppliedFrameLayout} from './frameWorkflow.js';
import type {RequiredCheck} from './coverage.js';
import {buildSoffitCandidate} from './soffit.js';
import {validateHeadBearing, type HeadBearingDefinition} from './headBearing.js';

export interface InstalledJack {
  productRef: string; nominalLengthMm: number | null; installedHeightMm: number | null;
  extensionMm: number | null; engagementMm: number | null; maxExtensionMm: number | null; minEngagementMm: number | null;
  geometryEvidenceRef: string; limitEvidenceRef: string;
}
export interface InstalledStandard {id: string; productRef: string; nominalLengthMm: number | null; installedRiseMm: number | null; datumEvidenceRef: string}
export interface InstalledSpigot {
  id: string; lowerStandardId: string; upperStandardId: string; productRef: string;
  gapMm: number | null; overallLengthMm: number | null; lowerInsertionMm: number | null; upperInsertionMm: number | null; evidenceRef: string;
}
export interface LegAssembly {
  legId: string; headNodeId: string; xMm: number; yMm: number; groundElevationMm: number; headBearingElevationMm: number;
  soffitElevationMm: number | null; toleranceMm: number | null;
  soleBoard: {thicknessMm: number | null; evidenceRef: string}; baseJack: InstalledJack; headJack: InstalledJack;
  standards: InstalledStandard[]; spigots: InstalledSpigot[];
  upperStack: {bearerDepthMm: number | null; joistDepthMm: number | null; plywoodThicknessMm: number | null; evidenceRef: string};
  headBearing?: HeadBearingDefinition | null;
}
export interface RinglockAssemblyDefinition {
  schemaVersion: '1'; stageId: string; loadCaseId: string; evidenceRef: string;
  headDatum: 'U_HEAD_BEARING_SURFACE' | null; headDatumEvidenceRef: string; legs: LegAssembly[];
}
export interface AppliedRinglockAssembly extends RinglockAssemblyDefinition {revisionId: string; inputDefinition: string}
export const emptyInstalledJack = (): InstalledJack => ({productRef: '', nominalLengthMm: null, installedHeightMm: null, extensionMm: null, engagementMm: null,
  maxExtensionMm: null, minEngagementMm: null, geometryEvidenceRef: '', limitEvidenceRef: ''});
export const emptyRinglockAssembly = (): RinglockAssemblyDefinition => ({schemaVersion: '1', stageId: '', loadCaseId: '', evidenceRef: '', headDatum: null, headDatumEvidenceRef: '', legs: []});
function exact(v: unknown, keys: string[], label: string, optional: string[] = []) {
  const r = record(v); if (Object.keys(r).some(k => !keys.includes(k) && !optional.includes(k)) || keys.some(k => !Object.hasOwn(r, k))) throw Error(`${label}: unknown/missing fields or authority metadata`); return r;
}
function text(v: unknown) {if (typeof v !== 'string' || v.length > 2000) throw Error('Invalid assembly evidence/reference');}
function numbers(v: object, fields: string[], zero: string[] = []) {for (const key of fields) {const n = (v as Record<string, unknown>)[key]; if (n !== null) finite(n, key, zero.includes(key));}}
export function validateRinglockAssembly(raw: unknown): asserts raw is AppliedRinglockAssembly {
  const a = exact(raw, ['schemaVersion', 'stageId', 'loadCaseId', 'evidenceRef', 'headDatum', 'headDatumEvidenceRef', 'legs', 'revisionId', 'inputDefinition'], 'Ringlock assembly') as unknown as AppliedRinglockAssembly;
  if (a.schemaVersion !== '1' || ![null, 'U_HEAD_BEARING_SURFACE'].includes(a.headDatum) || !Array.isArray(a.legs) || a.legs.length > 80) throw Error('Invalid Ringlock assembly schema/datums/leg count');
  for (const k of ['stageId', 'loadCaseId', 'evidenceRef', 'headDatumEvidenceRef', 'revisionId'] as const) text(a[k]);
  if (typeof a.inputDefinition !== 'string' || a.inputDefinition.length > 2000000) throw Error('Assembly source definition limit');
  uniqueIds(a.legs.map(l => ({id: l.legId})), 'assembly legs'); uniqueIds(a.legs.map(l => ({id: l.headNodeId})), 'assembly heads');
  for (const l of a.legs) {
    exact(l, ['legId', 'headNodeId', 'xMm', 'yMm', 'groundElevationMm', 'headBearingElevationMm', 'soffitElevationMm', 'toleranceMm', 'soleBoard', 'baseJack', 'headJack', 'standards', 'spigots', 'upperStack'], 'leg assembly', ['headBearing']);
    if (l.headBearing != null) validateHeadBearing(l.headBearing);
    for (const k of ['xMm', 'yMm', 'groundElevationMm', 'headBearingElevationMm'] as const) signed(l[k], k);
    if (l.soffitElevationMm !== null) signed(l.soffitElevationMm, 'soffit datum'); numbers(l, ['toleranceMm'], ['toleranceMm']);
    exact(l.soleBoard, ['thicknessMm', 'evidenceRef'], 'sole-board datum'); numbers(l.soleBoard, ['thicknessMm'], ['thicknessMm']); text(l.soleBoard.evidenceRef);
    exact(l.upperStack, ['bearerDepthMm', 'joistDepthMm', 'plywoodThicknessMm', 'evidenceRef'], 'upper datums'); numbers(l.upperStack, ['bearerDepthMm', 'joistDepthMm', 'plywoodThicknessMm']); text(l.upperStack.evidenceRef);
    for (const jack of [l.baseJack, l.headJack]) {exact(jack, Object.keys(emptyInstalledJack()), 'installed jack');
      numbers(jack, ['nominalLengthMm', 'installedHeightMm', 'extensionMm', 'engagementMm', 'maxExtensionMm', 'minEngagementMm'], ['installedHeightMm', 'extensionMm', 'maxExtensionMm']);
      for (const k of ['productRef', 'geometryEvidenceRef', 'limitEvidenceRef'] as const) text(jack[k]);}
    if (!Array.isArray(l.standards) || l.standards.length > 20 || !Array.isArray(l.spigots) || l.spigots.length > 19) throw Error('Assembly stack count limit');
    uniqueIds(l.standards, 'standard pieces'); uniqueIds(l.spigots, 'splices');
    for (const s of l.standards) {exact(s, ['id', 'productRef', 'nominalLengthMm', 'installedRiseMm', 'datumEvidenceRef'], 'installed standard'); numbers(s, ['nominalLengthMm', 'installedRiseMm']); text(s.productRef); text(s.datumEvidenceRef);}
    for (const s of l.spigots) {exact(s, ['id', 'lowerStandardId', 'upperStandardId', 'productRef', 'gapMm', 'overallLengthMm', 'lowerInsertionMm', 'upperInsertionMm', 'evidenceRef'], 'installed spigot');
      numbers(s, ['gapMm', 'overallLengthMm', 'lowerInsertionMm', 'upperInsertionMm'], ['gapMm']); text(s.productRef); text(s.evidenceRef); text(s.lowerStandardId); text(s.upperStandardId);}
  }
  if (canonical(a.legs).length > 1000000) throw Error('ASSEMBLY_DETAIL_SIZE_LIMIT; no leg omitted');
}
export function ringlockAssemblyInputDefinition(model: WorkflowModel) {
  return canonical({id: model.id, elementType: model.elementType, vertices: model.vertices, heightMm: model.heightMm, designBasisRef: model.designBasisRef,
    soffitLayout: model.soffitLayout ?? null, ringlock: model.ringlock, research: model.ringlockResearch ?? null, analysisCase: model.analysisCase ?? null});
}
export function stampRinglockAssembly(model: WorkflowModel, definition: RinglockAssemblyDefinition): AppliedRinglockAssembly {
  const a = {...clone(definition), revisionId: model.revisionId, inputDefinition: ringlockAssemblyInputDefinition(model)}; validateRinglockAssembly(a); return a;
}
/** Copy only current known head/ground geometry; no stack, depth, jack extension or tolerance defaults. */
export function captureRinglockAssembly(model: WorkflowModel): RinglockAssemblyDefinition {
  if (!model.soffitLayout || !model.ringlock?.legs.length || !currentSoffitSource(model)) throw Error('Current authored soffit heads required before assembly capture');
  if (model.ringlock.legs.length > 80) throw Error('ASSEMBLY_RECORD_EXCEEDS_80_LEG_LIMIT; no head omitted');
  const a = {...emptyRinglockAssembly(), stageId: model.soffitLayout.stageId, loadCaseId: model.soffitLayout.loadCaseId};
  a.legs = model.ringlock.legs.map(l => ({legId: l.id, headNodeId: l.headNodeId, xMm: l.xMm, yMm: l.yMm, groundElevationMm: l.baseElevationMm, headBearingElevationMm: l.headElevationMm,
    soffitElevationMm: null, toleranceMm: null, soleBoard: {thicknessMm: null, evidenceRef: ''}, baseJack: emptyInstalledJack(), headJack: emptyInstalledJack(), standards: [], spigots: [],
    upperStack: {bearerDepthMm: null, joistDepthMm: null, plywoodThicknessMm: null, evidenceRef: ''}}));
  return a;
}
export interface AssemblyNode {id: string; role: 'HEAD' | 'BASE' | 'SPLICE'; pointMm: [number, number, number]; evidenceRef: string}
export interface AssemblySegment {id: string; role: 'STANDARD' | 'SPIGOT' | 'HEAD_JACK' | 'BASE_JACK'; kind: 'BEAM_COLUMN' | 'JOINT_SPRING'; nodeI: string; nodeJ: string; productRef: string}
const prefix = (legId: string, name: string) => identifier(`RL:${legId}:${name}`, 'assembly graph ID');
function currentSoffitSource(model: WorkflowModel) {
  if (!model.soffitLayout || model.members.some(m => m.beam.revision !== model.revisionId)) return false;
  try {const c = buildSoffitCandidate(model, model.soffitLayout); return canonical(c.members) === canonical(model.members) && canonical(c.actions) === canonical(model.actions) && canonical(c.ringlock.legs) === canonical(model.ringlock?.legs ?? null);}
  catch {return false;}
}
export function evaluateRinglockAssembly(model: WorkflowModel, a: AppliedRinglockAssembly) {
  validateRinglockAssembly(a);
  const blockers = ['RINGLOCK_ASSEMBLY_GEOMETRY_NOT_SYSTEM_APPROVAL', 'RINGLOCK_ACTUAL_PRODUCT_JOINT_BRACING_BASE_AND_SECOND_ORDER_RULES_REQUIRED'];
  const current = a.revisionId === model.revisionId && a.inputDefinition === ringlockAssemblyInputDefinition(model);
  if (!current) blockers.push('STALE_RINGLOCK_ASSEMBLY_REANALYSIS_REQUIRED');
  const sourceReady = current && currentSoffitSource(model);
  if (!sourceReady) blockers.push('CURRENT_SOFFIT_HEAD_BASE_MAPPING_REQUIRED');
  const scopeReady = sourceReady && !!model.soffitLayout && a.stageId === model.soffitLayout.stageId && a.loadCaseId === model.soffitLayout.loadCaseId && a.headDatum === 'U_HEAD_BEARING_SURFACE' && !!a.evidenceRef.trim() && !!a.headDatumEvidenceRef.trim();
  if (!scopeReady) blockers.push('ASSEMBLY_SAME_STAGE_CASE_AND_EXPLICIT_HEAD_BEARING_DATUM_REQUIRED');
  const actual = model.ringlock?.legs ?? [], unknownLegIds = a.legs.filter(l => !actual.some(p => p.id === l.legId)).map(l => l.legId);
  if (!actual.length) blockers.push('ASSEMBLY_HAS_NO_CURRENT_ACTUAL_LEGS');
  if (unknownLegIds.length) blockers.push('ASSEMBLY_UNKNOWN_OR_STALE_LEGS');
  const rows = actual.map(leg => {
    const l = a.legs.find(l => l.legId === leg.id), issues: string[] = [], nodes: AssemblyNode[] = [], segments: AssemblySegment[] = [];
    let failed = false, geometryKnown = scopeReady && unknownLegIds.length === 0, exactClosure = false;
    const need = (v: number | null | undefined, name: string) => {if (v === null || v === undefined) {issues.push(`MISSING_${name}`); geometryKnown = false; return false;} return true;};
    if (!l) return {legId: leg.id, headNodeId: leg.headNodeId, geometryReady: false, frameGeometryReady: false, height: null, headResidualMm: null, spigotChecks: [], issues: ['MISSING_ACTUAL_LEG_ASSEMBLY'], nodes, segments, status: 'BLOCKED' as const};
    if (l.headNodeId !== leg.headNodeId || l.xMm !== leg.xMm || l.yMm !== leg.yMm || l.groundElevationMm !== leg.baseElevationMm || l.headBearingElevationMm !== leg.headElevationMm) {issues.push('ASSEMBLY_COORDINATES_DIFFER_FROM_CURRENT_SOFFIT_HEAD_OR_GROUND'); geometryKnown = false;}
    if (!l.soleBoard.evidenceRef.trim() || !l.upperStack.evidenceRef.trim()) {issues.push('SOLEBOARD_AND_UPPER_LAYER_DATUM_EVIDENCE_REQUIRED'); geometryKnown = false;}
    need(l.soleBoard.thicknessMm, 'SOLEBOARD_HEIGHT'); need(l.soffitElevationMm, 'SOFFIT_ELEVATION'); need(l.toleranceMm, 'DECLARED_DATUM_TOLERANCE');
    for (const k of ['bearerDepthMm', 'joistDepthMm', 'plywoodThicknessMm'] as const) need(l.upperStack[k], k);
    if (model.soffitLayout?.plywood && l.upperStack.plywoodThicknessMm !== model.soffitLayout.plywood.thicknessMm) {issues.push('ASSEMBLY_PLYWOOD_THICKNESS_DIFFERS_FROM_ANALYSIS'); geometryKnown = false;}
    for (const [name, jack] of [['BASE', l.baseJack], ['HEAD', l.headJack]] as const) {
      need(jack.installedHeightMm, `${name}_INSTALLED_HEIGHT`);
      if (!jack.geometryEvidenceRef.trim()) {issues.push(`${name}_NONOVERLAPPING_INSTALLED_DATUM_EVIDENCE_REQUIRED`); geometryKnown = false;}
      if (jack.installedHeightMm === 0) {issues.push(`${name}_ZERO_HEIGHT_CONTACT_REDUCTION_NOT_MODELED`); geometryKnown = false;}
      if (!jack.productRef.trim() || !jack.limitEvidenceRef.trim() || jack.extensionMm === null || jack.engagementMm === null || jack.maxExtensionMm === null || jack.minEngagementMm === null) issues.push(`${name}_PRODUCT_EXTENSION_ENGAGEMENT_AND_LIMIT_EVIDENCE_REQUIRED`);
      if (jack.productRef.trim() && jack.limitEvidenceRef.trim() &&
        ((jack.extensionMm !== null && jack.maxExtensionMm !== null && jack.extensionMm > jack.maxExtensionMm) || (jack.engagementMm !== null && jack.minEngagementMm !== null && jack.engagementMm < jack.minEngagementMm))) {
        failed = true; issues.push(`${name}_RECORDED_EXTENSION_OR_ENGAGEMENT_LIMIT_EXCEEDED`);
      }
      issues.push(`${name}_RECORDED_LIMITS_ARE_NOT_PROJECT_CERTIFICATION`);
    }
    if (!l.standards.length || l.spigots.length !== l.standards.length - 1) {issues.push('EXACT_STANDARD_SEQUENCE_AND_EACH_SPLICE_REQUIRED'); geometryKnown = false;}
    for (const s of l.standards) {need(s.installedRiseMm, `${s.id}_INSTALLED_RISE`); if (!s.datumEvidenceRef.trim()) {geometryKnown = false; issues.push(`${s.id}_STANDARD_END_DATUM_EVIDENCE_REQUIRED`);} if (!s.productRef.trim()) issues.push(`${s.id}_PRODUCT_TRACEABILITY_REQUIRED`);}
    const spigotChecks = l.spigots.map((s, i) => {
      if (s.lowerStandardId !== l.standards[i]?.id || s.upperStandardId !== l.standards[i + 1]?.id) {geometryKnown = false; issues.push(`${s.id}_SPLICE_SEQUENCE_MISMATCH`);}
      need(s.gapMm, `${s.id}_EXPOSED_GAP`);
      if (!s.evidenceRef.trim()) {geometryKnown = false; issues.push(`${s.id}_SPLICE_DATUM_EVIDENCE_REQUIRED`);}
      const residualMm = s.overallLengthMm !== null && s.lowerInsertionMm !== null && s.upperInsertionMm !== null && s.gapMm !== null ? s.overallLengthMm - s.lowerInsertionMm - s.upperInsertionMm - s.gapMm : null;
      if (residualMm === null || !s.productRef.trim()) issues.push(`${s.id}_ACTUAL_SPIGOT_LENGTH_INSERTIONS_AND_PRODUCT_REQUIRED`);
      else if (l.toleranceMm !== null && Math.abs(residualMm) > l.toleranceMm) {failed = true; geometryKnown = false; issues.push(`${s.id}_INSERTIONS_PLUS_GAP_DO_NOT_CLOSE`);}
      return {id: s.id, residualMm, status: residualMm === null || l.toleranceMm === null ? 'BLOCKED' as const : Math.abs(residualMm) <= l.toleranceMm ? 'GEOMETRY_ONLY' as const : 'FAIL' as const};
    });
    const stack = l.standards.length && l.standards.every(s => s.installedRiseMm !== null) && l.spigots.every(s => s.gapMm !== null) ? l.standards.reduce((n, s) => n + s.installedRiseMm!, 0) + l.spigots.reduce((n, s) => n + s.gapMm!, 0) : null;
    const terms: HeightContributions = {soleBoard: l.soleBoard.thicknessMm, baseInstalled: l.baseJack.installedHeightMm, effectiveStandardStack: stack, headInstalled: l.headJack.installedHeightMm,
      bearer: l.upperStack.bearerDepthMm, joist: l.upperStack.joistDepthMm, plywood: l.upperStack.plywoodThicknessMm};
    let height: ReturnType<typeof installedHeight> | null = null, headResidualMm: number | null = null;
    if (geometryKnown) {
      try {
        height = installedHeight(l.groundElevationMm, l.soffitElevationMm!, terms, l.toleranceMm!);
        headResidualMm = l.headBearingElevationMm - l.groundElevationMm - l.soleBoard.thicknessMm! - l.baseJack.installedHeightMm! - stack! - l.headJack.installedHeightMm!;
        if (!height.withinTolerance || Math.abs(headResidualMm) > l.toleranceMm!) {failed = true; geometryKnown = false; issues.push('INSTALLED_HEIGHT_OR_HEAD_BEARING_CLOSURE_FAILED');}
        exactClosure = Math.abs(height.residualMm) <= 1e-7 && Math.abs(headResidualMm) <= 1e-7;
        if (!exactClosure) issues.push('RECONCILE_DATUM_RESIDUAL_BEFORE_FRAME_CREATION_NO_SILENT_SNAP');
      } catch (e) {geometryKnown = false; issues.push(`DATUM_HEIGHT:${(e as Error).message}`);}
    }
    const frameGeometryReady = geometryKnown && exactClosure;
    if (frameGeometryReady) {
      const addNode = (name: string, role: AssemblyNode['role'], z: number, evidenceRef: string) => {const id = prefix(l.legId, name); nodes.push({id, role, pointMm: [l.xMm, l.yMm, z], evidenceRef}); return id;};
      const add = (name: string, role: AssemblySegment['role'], nodeI: string, nodeJ: string, productRef: string, kind: AssemblySegment['kind'] = 'BEAM_COLUMN') => segments.push({id: prefix(l.legId, name), role, kind, nodeI, nodeJ, productRef});
      let z = l.groundElevationMm + l.soleBoard.thicknessMm!, previous = addNode('BASE', 'BASE', z, l.soleBoard.evidenceRef); z += l.baseJack.installedHeightMm!;
      for (let i = 0; i < l.standards.length; i++) {
        const s = l.standards[i], start = addNode(`${s.id}:I`, 'SPLICE', z, s.datumEvidenceRef);
        if (i === 0) add('BASE-JACK', 'BASE_JACK', previous, start, l.baseJack.productRef);
        else {const splice = l.spigots[i - 1]; add(`SPLICE:${splice.id}`, 'SPIGOT', previous, start, splice.productRef, splice.gapMm === 0 ? 'JOINT_SPRING' : 'BEAM_COLUMN');}
        z += s.installedRiseMm!; previous = addNode(`${s.id}:J`, 'SPLICE', z, s.datumEvidenceRef); add(`STANDARD:${s.id}`, 'STANDARD', start, previous, s.productRef);
        if (i < l.spigots.length) z += l.spigots[i].gapMm!;
      }
      const head = addNode('HEAD', 'HEAD', l.headBearingElevationMm, a.headDatumEvidenceRef); add('HEAD-JACK', 'HEAD_JACK', previous, head, l.headJack.productRef);
    }
    issues.push('UPPER_MEMBER_CENTROIDS_CONTACT_OFFSETS_AND_SUPPORT_RESISTANCE_UNVERIFIED');
    return {legId: l.legId, headNodeId: l.headNodeId, geometryReady: geometryKnown, frameGeometryReady, height, headResidualMm, spigotChecks, issues, nodes, segments, status: failed ? 'FAIL' as const : 'BLOCKED' as const};
  });
  const requiredChecks: RequiredCheck[] = [];
  for (const spec of model.checkCatalogue?.specifications ?? []) {
    if (spec.appliesTo !== 'ALL' && !spec.appliesTo.split('|').includes(model.elementType)) continue;
    if (!['RINGLOCK', 'TYPICAL'].includes(spec.group)) continue;
    for (const l of a.legs) {
      const id = (s: string) => prefix(l.legId, s), all = [id('DATUMS'), id('BASE-JACK'), id('HEAD-JACK'), ...l.standards.map(s => id(`STANDARD:${s.id}`)), ...l.spigots.map(s => id(`SPLICE:${s.id}`)), id('SUPPORT')];
      const targets = spec.group === 'TYPICAL' || spec.id === 'RINGLOCK-01' ? all : spec.id === 'RINGLOCK-04' ? [id('DATUMS')] : spec.id === 'RINGLOCK-05' ? [id('HEAD-JACK')] : spec.id === 'RINGLOCK-06' ? [id('BASE-JACK')] :
        ['RINGLOCK-07', 'RINGLOCK-08'].includes(spec.id) ? l.standards.map(s => id(`STANDARD:${s.id}`)) : spec.id === 'RINGLOCK-09' ? l.spigots.map(s => id(`SPLICE:${s.id}`)) : ['RINGLOCK-16', 'RINGLOCK-17'].includes(spec.id) ? [id('SUPPORT')] : [];
      for (const memberId of targets) requiredChecks.push({memberId: `ASSEMBLY:${memberId}`, checkId: spec.id, loadCaseId: a.loadCaseId, revision: a.revisionId, applicability: {stageId: a.stageId, analysisCase: model.analysisCase ?? null, memberId, legDefinition: l, headDatum: a.headDatum, evidenceRef: a.evidenceRef}});
    }
  }
  return {status: rows.some(r => r.status === 'FAIL') ? 'FAIL' as const : 'BLOCKED' as const, current, rows, unknownLegIds, requiredChecks,
    frameGeometryReady: scopeReady && rows.length > 0 && rows.every(r => r.frameGeometryReady) && unknownLegIds.length === 0, blockers, constructionRelease: 'NO_GO' as const};
}
export function assemblyFrameIssues(model: WorkflowModel, frame: AppliedFrameLayout): string[] {
  if (!model.ringlockAssembly) return [];
  const result = evaluateRinglockAssembly(model, model.ringlockAssembly), issues: string[] = [];
  if (!result.frameGeometryReady) return ['CURRENT_CLOSED_RINGLOCK_ASSEMBLY_GEOMETRY_REQUIRED'];
  if (frame.stageId !== model.ringlockAssembly.stageId || frame.loadCaseId !== model.ringlockAssembly.loadCaseId || !['SOFFIT_REACTIONS', 'SOFFIT_AND_SIDE_REACTIONS'].includes(frame.loadSource ?? '')) issues.push('ASSEMBLY_FRAME_STAGE_CASE_OR_LOAD_SOURCE_MISMATCH');
  const expected = result.rows.flatMap(r => r.segments), ids = new Set(expected.map(e => e.id));
  for (const r of result.rows) {
    for (const n of r.nodes) {const actual = frame.nodes.find(p => p.id === n.id); if (!actual || actual.role !== n.role || actual.pointMm.some((v, i) => v === null || Math.abs(v - n.pointMm[i]) > 1e-7)) issues.push(`${n.id}:ASSEMBLY_NODE_GEOMETRY_MISMATCH`);}
    for (const e of r.segments) {const actual = frame.elements.find(p => p.id === e.id); if (!actual || actual.role !== e.role || actual.kind !== e.kind || actual.nodeI !== e.nodeI || actual.nodeJ !== e.nodeJ) issues.push(`${e.id}:ASSEMBLY_MEMBER_OR_SPLICE_MAPPING_MISMATCH`);}
    if (!frame.headMappings.some(m => m.headNodeId === r.headNodeId && m.frameNodeId === prefix(r.legId, 'HEAD'))) issues.push(`${r.headNodeId}:ASSEMBLY_HEAD_MAPPING_MISMATCH`);
  }
  for (const e of frame.elements) if (['STANDARD', 'BASE_JACK', 'HEAD_JACK', 'SPIGOT'].includes(e.role ?? '') && !ids.has(e.id)) issues.push(`${e.id}:UNMAPPED_ADDITIONAL_VERTICAL_ASSEMBLY_MEMBER`);
  return issues;
}
