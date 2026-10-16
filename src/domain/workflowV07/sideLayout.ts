import {analyzeSidePanel} from './sidePanel.js';
import {analyzeBeam} from './beam.js';
import {canonical, clone, finite, identifier, signed, uniqueIds, type Point2} from './common.js';
import {pairFaces, tieRouteIssues, type PhysicalFace, type TieRoute} from './geometry.js';
import {screenTieAssembly, type TieAssembly} from './assemblies.js';
import type {WorkflowModel} from './model.js';
import type {RequiredCheck} from './coverage.js';
import {resolveWalerPair, screenWalerTieFit, validateWalerPair, type IndependentWalerPair} from './walerPair.js';
import {resolveMemberElastic, validateElasticBinding, type ElasticMemberBinding} from './elasticBinding.js';
import {resolvePlywoodElastic, validatePlywoodBinding, type PlywoodProductBinding} from './plywood.js';
import {actionFactor} from './caseFactors.js';
import {compileSidePressure, pressureZones, validateSidePressure, type SidePressureDefinition} from './sidePressure.js';
import {evaluateTieDossier, tieGeometryContext, validateTieDossier, type TieDossier} from './tieDossier.js';

export interface SideStiffness {E_MPa: number | null; I_mm4: number | null; evidenceRef: string; binding?: ElasticMemberBinding | null}
export interface SideFaceLayout {
  faceId: string; evidenceRef: string; studPositionsMm: number[];
  walers: {id: string; zMm: number; supports: {id: string; xMm: number}[]; pair?: IndependentWalerPair | null}[];
  stud: SideStiffness; rail: SideStiffness;
  plywood: {thicknessMm: number | null; effectiveE_MPa: number | null; grainAxis: 'ALONG_FACE' | 'VERTICAL' | null;
    jointsAtEveryStud: boolean | null; evidenceRef: string; binding?: PlywoodProductBinding | null};
  heavierRailShare: number | null; sharingEvidence: string | null;
  pressure?: SidePressureDefinition | null;
}
export interface SideEndpoint {faceId: string; walerId: string; supportId: string}
export interface SideTieDefinition {
  id: string; a: SideEndpoint; b: SideEndpoint; diameterMm: number | null;
  assembly: Omit<TieAssembly, 'demandKN' | 'demandBasis'> | null;
  dossier?: TieDossier | null;
}
export interface SideLayoutDefinition {
  schemaVersion: '1'; stageId: string; loadCaseId: string; evidenceRef: string;
  pourHeadMm: number | null; baseElevationMm: number | null; rebarClearanceEvidence: string | null;
  faces: SideFaceLayout[]; ties: SideTieDefinition[];
}
export interface AppliedSideLayout extends SideLayoutDefinition {revisionId: string; inputDefinition: string}
export interface SideNode extends SideEndpoint {
  id: string; point: {xMm: number; yMm: number; zMm: number}; localXMm: number; localZMm: number;
  forceN: number; normal: Point2; momentNmm: number;
}
export function sideInputDefinition(model: WorkflowModel) {
  return canonical({elementType: model.elementType, vertices: model.vertices, heightMm: model.heightMm,
    gammaKNm3: model.gammaKNm3, sideTopology: model.sideTopology, analysisCase: model.analysisCase ?? null});
}
export function stampSideLayout(model: WorkflowModel, layout: SideLayoutDefinition): AppliedSideLayout {
  validateSidePairDrafts(layout);
  return {...clone(layout), revisionId: model.revisionId, inputDefinition: sideInputDefinition(model)};
}
export function validateSidePairDrafts(layout: SideLayoutDefinition) {
  let dossierSize = 0;
  if (Array.isArray(layout.ties)) for (const t of layout.ties) if (t.dossier != null) {validateTieDossier(t.dossier); if (t.assembly) throw Error('Legacy assembly and authored tie dossier cannot compete'); dossierSize += canonical(t.dossier).length;}
  if (dossierSize > 500000) throw Error('Aggregate tie dossiers exceed 500000 characters; no records omitted');
  if (Array.isArray(layout.faces)) for (const f of layout.faces) {
    if (f.pressure != null) validateSidePressure(f.pressure);
    for (const s of [f.stud, f.rail]) if (s?.binding !== null && s?.binding !== undefined) validateElasticBinding(s.binding);
    if (f.plywood?.binding !== null && f.plywood?.binding !== undefined) validatePlywoodBinding(f.plywood.binding);
    if (Array.isArray(f.walers)) for (const w of f.walers) if (w.pair !== null && w.pair !== undefined) validateWalerPair(w.pair);
  }
}
const endpointKey = (p: SideEndpoint) => canonical([p.faceId, p.walerId, p.supportId]);
export function pointOnFace(face: PhysicalFace, xMm: number) {
  return {x: face.a.x + (face.b.x - face.a.x) * xMm / face.lengthMm, y: face.a.y + (face.b.y - face.a.y) * xMm / face.lengthMm};
}
/** Actual physical faces, never pair-region beams. Legacy hydrostatic or explicit face fields.
 * Each case retains its declared basis and pressure-source factors. End demands
 * are retained independently; incompatible opposite reactions never become an average tie load.
 */
export function analyzeSideLayout(model: WorkflowModel, layout: AppliedSideLayout) {
  if (layout.schemaVersion !== '1' || layout.revisionId !== model.revisionId || layout.inputDefinition !== sideInputDefinition(model)) throw Error('STALE_SIDE_LAYOUT_REANALYSIS_REQUIRED');
  const topology = pairFaces(model.vertices, model.heightMm);
  for (const key of ['stageId', 'loadCaseId', 'evidenceRef'] as const) identifier(layout[key], key);
  const base = signed(layout.baseElevationMm, 'side concrete base elevation');
  if (layout.pourHeadMm !== null && finite(layout.pourHeadMm, 'explicit pour head', true) > model.heightMm) throw Error('BLOCKED_UNSUPPORTED: pour head above the modeled full-height panel');
  if (!Array.isArray(layout.faces) || !layout.faces.length || layout.faces.length > topology.faces.length) throw Error('Actual side face layouts required');
  const analysisCount = layout.faces.reduce((sum, f) => sum + 2 * (f.studPositionsMm?.length ?? 0) - 1 + 2 * (f.walers?.length ?? 0), 0);
  const supportCount = layout.faces.reduce((sum, f) => sum + (f.walers ?? []).reduce((n, w) => n + (w.supports?.length ?? 0), 0), 0);
  if (analysisCount > 400 || supportCount > 1000) throw Error('BLOCKED_MODEL_SIZE: side preview supports at most 400 actual strip/member analyses and 1000 support nodes per case');
  uniqueIds(layout.faces.map(f => ({id: f.faceId})), 'side faces');
  const blockers = [layout.faces.every(f => f.pressure) ? 'SIDE_DECLARED_PRESSURE_FIELD_METHOD_AND_COMBINATIONS_REQUIRE_ENGINEERING_REVIEW' : layout.faces.some(f => f.pressure) ? 'SIDE_MIXED_HYDROSTATIC_AND_DECLARED_PRESSURE_METHODS_REQUIRE_REVIEW' : 'SIDE_SERVICE_HYDROSTATIC_ONLY_LOAD_COMBINATIONS_AND_POUR_METHOD_REQUIRED', 'SIDE_MEMBER_SELF_WEIGHT_AND_INSTALLATION_ACTIONS_REQUIRED',
    'PLYWOOD_PRODUCT_GRAIN_MOISTURE_AND_RESISTANCE_RULES_REQUIRED', 'WALER_FIT_CONTACT_SPLICES_AND_CORNERS_REQUIRE_VERIFICATION'];
  const nodes: SideNode[] = [];
  let analysesUsed = 0;
  const faces = layout.faces.map(input => {
    const face = topology.faces.find(f => f.id === input.faceId);
    if (!face) throw Error(`Unknown physical face ${input.faceId}`);
    identifier(input.evidenceRef, 'face source');
    const studElastic = resolveMemberElastic(input.stud, 'STUD'), sharedRailElastic = input.walers.some(w => !w.pair) ? resolveMemberElastic(input.rail, 'WALER') : null;
    blockers.push(...studElastic.blockers.map(b => `${face.id}/STUD:${b}`), ...(sharedRailElastic?.blockers ?? []).map(b => `${face.id}/SHARED_RAIL:${b}`));
    const panel = input.plywood, t = finite(panel.thicknessMm, 'plywood thickness');
    if (!['ALONG_FACE', 'VERTICAL'].includes(String(panel.grainAxis)) || panel.jointsAtEveryStud !== true) throw Error('BLOCKED_UNSUPPORTED: explicit plywood grain and simply spanning strips with joints on each stud required');
    identifier(panel.evidenceRef, 'plywood product/axis/moisture evidence');
    const plywoodElastic = resolvePlywoodElastic({...panel, grainRelativeDeg: panel.grainAxis === 'ALONG_FACE' ? 0 : 90}), E = plywoodElastic.E_MPa;
    blockers.push(...plywoodElastic.blockers.map(b => `${face.id}:${b}`));
    if (!Array.isArray(input.walers) || input.walers.length < 2 || input.walers.length > 12) throw Error('2–12 actual waler levels required');
    uniqueIds(input.walers, 'waler levels');
    const walers = [...input.walers].sort((a, b) => a.zMm - b.zMm);
    for (const row of walers) {
      signed(row.zMm, 'waler height');
      if (!Array.isArray(row.supports) || row.supports.length < 2 || row.supports.length > 40) throw Error('2–40 actual supports per waler required');
      uniqueIds(row.supports, 'waler supports');
      if (row.supports.some((s, i) => !Number.isFinite(s.xMm) || s.xMm < 0 || s.xMm > face.lengthMm || (i > 0 && s.xMm <= row.supports[i - 1].xMm) || Object.hasOwn(s, 'rotationFixed'))) throw Error('Sorted pinned actual waler support stations required');
    }
    const railPairs = walers.map(w => {
      if (w.pair) {const resolved = resolveWalerPair(w.pair, face.lengthMm, w.supports.map(s => s.id)); blockers.push(...resolved.blockers.map(b => `${face.id}/${w.id}:${b}`)); return resolved.rails;}
      blockers.push(`${face.id}/${w.id}:SHARED_LEGACY_RAIL_PROPERTIES_AND_PHYSICAL_PAIR_DATA_UNVERIFIED`);
      const share = finite(input.heavierRailShare, 'declared rail load share');
      if (share < .5 || share > 1) throw Error('Legacy heavier rail share must be between .5 and 1');
      return [{id: 'RAIL-1', E_MPa: sharedRailElastic!.E_MPa, I_mm4: sharedRailElastic!.I_mm4, share}, {id: 'RAIL-2', E_MPa: sharedRailElastic!.E_MPa, I_mm4: sharedRailElastic!.I_mm4, share: 1 - share}] as [{id: string; E_MPa: number; I_mm4: number; share: number}, {id: string; E_MPa: number; I_mm4: number; share: number}];
    });
    const pressurePatches = input.pressure ? compileSidePressure(model, input.pressure, face.lengthMm) : null;
    const head = pressurePatches ? layout.pourHeadMm : finite(layout.pourHeadMm, 'explicit pour head');
    if (!pressurePatches && head! > model.heightMm) throw Error('BLOCKED_UNSUPPORTED: pour head above the modeled full-height panel');
    analysesUsed += input.studPositionsMm.length + 2 * walers.length + (pressurePatches ? 2 * (input.studPositionsMm.length - 1) * (pressureZones(pressurePatches, model.heightMm).length - 1) : input.studPositionsMm.length - 1);
    if (analysesUsed > 400) throw Error('BLOCKED_MODEL_SIZE: complete side pressure/member analysis exceeds 400; no zones omitted');
    const result = analyzeSidePanel({faceId: face.id, revision: model.revisionId, lengthMm: face.lengthMm, heightMm: model.heightMm, pourHeadMm: head,
      gammaKNm3: pressurePatches ? null : finite(model.gammaKNm3, 'concrete unit weight') * actionFactor(model, 'HYDROSTATIC_SIDE'),
      ...(pressurePatches ? {pressurePatches, plywoodE_MPa: E, plywoodI_mm4: plywoodElastic.I_mm4} : {}),
      studPositionsMm: input.studPositionsMm, walerLevelsMm: walers.map(w => w.zMm), walerSupports: [], walerSupportsByLevel: walers.map(w => w.supports),
      studE_MPa: studElastic.E_MPa, studI_mm4: studElastic.I_mm4, railE_MPa: sharedRailElastic?.E_MPa ?? null, railI_mm4: sharedRailElastic?.I_mm4 ?? null,
      heavierRailShare: input.heavierRailShare, sharingEvidence: input.sharingEvidence,
      independentRailsByLevel: railPairs, sharingEvidenceByLevel: walers.map(w => w.pair?.sharingEvidenceRef ?? input.sharingEvidence)});
    blockers.push(...result.blockers.map(b => `${face.id}:${b}`));
    for (let i = 0; i < result.walers.length; i++) for (const d of result.walers[i].supportDemands) {
      const p = pointOnFace(face, d.xMm), endpoint = {faceId: face.id, walerId: walers[i].id, supportId: d.supportId};
      nodes.push({...endpoint, id: endpointKey(endpoint), point: {xMm: p.x, yMm: p.y, zMm: base + walers[i].zMm},
        localXMm: d.xMm, localZMm: walers[i].zMm, forceN: d.forceN, momentNmm: d.momentNmm, normal: face.normal});
    }
    // Governing hydrostatic pressure envelope per 1m vertical design strip; never fed into studs again.
    const panels = result.pressureDeck ? result.pressureDeck.panels.map(p => ({...p, stressDemandMPa: p.analysis.maxMomentNmm / plywoodElastic.S_mm3})) : input.studPositionsMm.slice(1).map((x, i) => {
      const length = x - input.studPositionsMm[i], I = 1000 * t ** 3 / 12;
      const analysis = analyzeBeam({id: `${face.id}:PLY:${i + 1}`, revision: model.revisionId, lengthMm: length, E_MPa: E, I_mm4: I,
        supports: [{id: 'A', xMm: 0}, {id: 'B', xMm: length}], points: [],
        patches: [{id: 'PEAK-HYDRO-1M-STRIP', startMm: 0, endMm: length, startNPerMm: result.pressureBaseKPa!, endNPerMm: result.pressureBaseKPa!}]});
      return {id: analysis.id, startMm: input.studPositionsMm[i], endMm: x, designStripMm: 1000 as const, analysis,
        lowerZMm: 0, upperZMm: head!, evaluationZMm: 0, sourceActionIds: ['LEGACY_HYDROSTATIC_PEAK_ENVELOPE'],
        stressDemandMPa: analysis.maxMomentNmm / (1000 * t ** 2 / 6)};
    });
    return {face, input, result, panels, elasticInputs: {stud: studElastic, sharedRail: sharedRailElastic, plywood: plywoodElastic}, pressureAction: {id: `${model.id}:${face.id}:HYDRO`, stageId: layout.stageId, loadCaseId: layout.loadCaseId,
      sourceRef: input.pressure?.evidenceRef ?? layout.evidenceRef, forceN: result.expectedForceN, normal: face.normal,
      centroid: result.expectedForceN === 0 ? null : {...pointOnFace(face, result.expectedXMomentNmm / result.expectedForceN), zMm: base + result.expectedZMomentNmm / result.expectedForceN}}};
  });
  for (const f of topology.faces) if (!layout.faces.some(i => i.faceId === f.id)) blockers.push(`${f.id}:PHYSICAL_SIDE_FACE_LAYOUT_MISSING`);
  if (!Array.isArray(layout.ties) || layout.ties.length > 1000) throw Error('Invalid actual side ties');
  uniqueIds(layout.ties, 'side ties');
  const used = new Set<string>(), routes: TieRoute[] = [];
  const ties = layout.ties.map(t => {
    if (!['THROUGH_TIE', 'SEGMENTED_TIE'].includes(String(model.sideTopology))) throw Error('Tie routes cannot substitute for a closed column yoke/clamp or ground-braced system');
    const ends = [t.a, t.b].map(e => {const key = endpointKey(e), node = nodes.find(n => n.id === key); if (!node) throw Error(`${t.id}: unknown actual support endpoint`);
      if (used.has(key)) throw Error(`${t.id}: support endpoint assigned twice`); used.add(key); return node;});
    const [a, b] = ends, diameter = finite(t.diameterMm, 'tie outside envelope diameter');
    if (Math.abs(a.localZMm - b.localZMm) > 1e-7) throw Error(`${t.id}: tie endpoints must be at the same physical height`);
    const route: TieRoute = {id: t.id, faceAId: a.faceId, faceBId: b.faceId, a: {x: a.point.xMm, y: a.point.yMm}, b: {x: b.point.xMm, y: b.point.yMm}, zMm: a.localZMm, diameterMm: diameter};
    const routeIssues = tieRouteIssues(topology, [route], layout.rebarClearanceEvidence);
    if (routeIssues.some(i => /UNSUPPORTED_TIE_PATH|OUTSIDE_HEIGHT/.test(i))) throw Error(routeIssues.join('; '));
    routes.push(route);
    const balanced = Math.abs(a.forceN - b.forceN) <= Math.max(1, Math.abs(a.forceN), Math.abs(b.forceN)) * 1e-7 &&
      a.forceN >= 0 && b.forceN >= 0 && Math.abs(a.momentNmm) < 1e-6 && Math.abs(b.momentNmm) < 1e-6;
    const demandKN = balanced ? Math.max(a.forceN, b.forceN) / 1000 : null;
    if (!balanced) blockers.push(`${t.id}:OPPOSITE_END_DEMANDS_REQUIRE_COUPLED_MODEL`);
    const fits = ends.map(end => {const pair = layout.faces.find(f => f.faceId === end.faceId)!.walers.find(w => w.id === end.walerId)!.pair;
      return pair ? screenWalerTieFit(pair, end.supportId, diameter) : null;});
    for (const fit of fits) if (fit) blockers.push(...fit.issues.map(issue => `${t.id}:${issue}`), ...fit.blockers.map(b => `${t.id}:${b}`));
    let assembly: ReturnType<typeof screenTieAssembly> | null = null;
    if (t.assembly && model.sideTopology !== 'SEGMENTED_TIE') throw Error('Segmented Inner/Outer assembly cannot be used as a through-rod product or column clamp');
    if (t.assembly && t.assembly.components.some(c => c.role.startsWith('WALER_LOCAL') && c.demandFraction !== 1)) throw Error('Local waler assembly demand cannot be reduced without a verified plate/contact model');
    if (t.assembly && demandKN !== null) assembly = screenTieAssembly({...t.assembly, demandKN, demandBasis: model.analysisCase?.basis === 'FACTORED' ? 'DESIGN' : 'ALLOWABLE'});
    if (t.dossier && model.sideTopology !== 'SEGMENTED_TIE') throw Error('Tie product dossier applies only to the actual segmented Inner/Outer topology');
    const dossier = t.dossier ? evaluateTieDossier(t.dossier, tieGeometryContext(topology, layout, t), demandKN, model.analysisCase?.basis === 'FACTORED' ? 'DESIGN' : 'ALLOWABLE') : null;
    if (dossier) blockers.push(...dossier.blockers.map(b => `${t.id}:${b}`));
    if (assembly) blockers.push(...assembly.blockers.map(b => `${t.id}:${b}`));
    else blockers.push(`${t.id}:COMPLETE_PRODUCT_ASSEMBLY_AND_SERVICE_ALLOWABLE_BASIS_REQUIRED`);
    return {id: t.id, a, b, route, endForcesN: [a.forceN, b.forceN], demandKN, assembly, dossier, fits};
  });
  blockers.push(...tieRouteIssues(topology, routes, layout.rebarClearanceEvidence));
  for (const n of nodes) if (!used.has(n.id)) blockers.push(`${n.faceId}/${n.walerId}/${n.supportId}:TIE_CLAMP_OR_END_RESTRAINT_NOT_MODELED`);
  if (model.sideTopology === 'COLUMN_YOKE') blockers.push('CLOSED_COLUMN_YOKE_CORNER_CONTACT_AND_CLAMP_MODEL_REQUIRED');
  if (model.sideTopology === 'GROUND_BRACED') blockers.push('GROUND_BRACE_ANCHOR_AND_SUPPORT_MODEL_REQUIRED');
  const requiredChecks: RequiredCheck[] = [];
  // Physical demand inputs are shared. Keep dossier data local to its actual entity rather
  // than repeating every product/history record on every plywood/stud requirement.
  const layoutDefinition = canonical({...layout, ties: layout.ties.map(({assembly: _assembly, dossier: _dossier, ...geometry}) => geometry)});
  const assemblyEntities = layout.ties.flatMap(t => t.dossier ? [
    ...t.dossier.components.map(c => ({id: `TIE:${t.id}:ROLE:${c.role}`, input: c})),
    ...t.dossier.threads.map(j => ({id: `TIE:${t.id}:THREAD:${j.id}`, input: j})),
    ...t.dossier.rodGauges.map(g => ({id: `TIE:${t.id}:BODY:${g.id}`, input: {gauge: g, component: t.dossier!.components.find(c => c.role === g.role) ?? null}})),
  ] : []);
  const panels = faces.flatMap(f => f.panels.map(p => p.id)), studs = faces.flatMap(f => f.result.studs.map(s => s.analysis.id));
  const rails = faces.flatMap(f => f.result.walers.flatMap(w => w.rails.map(r => r.id))), faceIds = faces.map(f => `SIDE:${f.face.id}`);
  for (const spec of model.checkCatalogue?.specifications ?? []) {
    if (spec.appliesTo !== 'ALL' && !spec.appliesTo.split('|').includes(model.elementType)) continue;
    const targets = ['SIDE-01', 'SIDE-02', 'SIDE-03'].includes(spec.id) ? panels : ['SIDE-04', 'SIDE-05'].includes(spec.id) ? studs :
      ['SIDE-06', 'SIDE-07', 'SIDE-08'].includes(spec.id) ? rails : spec.id === 'SIDE-09' ? [...ties.map(t => `TIE:${t.id}`), ...assemblyEntities.map(e => e.id)] : spec.id === 'SIDE-10' ? faceIds :
      spec.group === 'PAIR' ? topology.pairs.map(p => p.id) : spec.group === 'TYPICAL' ? [...panels, ...studs, ...rails, ...ties.map(t => `TIE:${t.id}`), ...assemblyEntities.map(e => e.id)] :
      (!model.soffitLayout && ['INPUT', 'RELEASE'].includes(spec.group)) ? [`SIDE:${model.id}`] : [];
    for (const memberId of targets) requiredChecks.push({memberId, checkId: spec.id, loadCaseId: layout.loadCaseId, revision: model.revisionId,
      applicability: {stageId: layout.stageId, sideLayoutInput: layout.inputDefinition, memberId, evidenceRef: layout.evidenceRef, sideLayoutDefinition: layoutDefinition,
        tieEntityDefinition: assemblyEntities.find(e => e.id === memberId)?.input ?? layout.ties.find(t => `TIE:${t.id}` === memberId) ?? null}});
  }
  return {status: ties.some(t => t.assembly?.status === 'FAIL' || t.dossier?.status === 'FAIL' || t.fits.some(f => f?.status === 'FAIL')) ? 'FAIL' as const : 'BLOCKED' as const, revisionId: model.revisionId,
    faces, nodes, ties, routes, requiredChecks, blockers: [...new Set(blockers)], constructionRelease: 'NO_GO' as const};
}
