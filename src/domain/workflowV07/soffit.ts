import {canonical, finite, identifier, record, signed, uniqueIds, type Point2} from './common.js';
import type {PathMember} from './loadPath.js';
import {beamLoads, loadOwnershipIssues, slabLoads, type LoadAction} from './loads.js';
import type {WorkflowModel} from './model.js';
import type {RinglockConfiguration, RinglockLeg} from './ringlock.js';
import type {RequiredCheck} from './coverage.js';
import {pairFaces} from './geometry.js';
import {resolveMemberElastic, validateElasticBinding, type ElasticMemberBinding} from './elasticBinding.js';
import {analyzePlywoodDeck, assertDeckCoverage, validateSoffitPlywood, type PlywoodSurfacePatch, type SoffitPlywoodDefinition} from './plywood.js';
import {beamMemberEvidenceReference, validateBeamMemberEvidence, type BeamMemberEvidence} from './beamResistance.js';
import {actionFactor} from './caseFactors.js';
import {applySpatialMemberActions, compileSpatialSurfaces, validateSpatialLoading, type SpatialLoading} from './spatialLoads.js';

export interface MemberStiffness {
  E_MPa: number | null; I_mm4: number | null; selfWeightKNPerM: number | null; evidenceRef: string;
  binding?: ElasticMemberBinding | null;
  resistanceEvidence?: BeamMemberEvidence[] | null;
}
export interface SoffitLayout {
  schemaVersion: '1'; stageId: string; loadCaseId: string; ownershipId: string; evidenceRef: string;
  /** All XY stations are offsets from the concrete polygon's minimum X/Y, not floor axes. */
  joistXMm: number[]; joistStartYMm: number | null; joistEndYMm: number | null;
  bearerStartXMm: number | null; bearerEndXMm: number | null;
  bearers: {id: string; yMm: number; headsXMm: number[]}[];
  headNodeElevationMm: number | null; baseElevationMm: number | null;
  baseDatumsByHead?: {headNodeId: string; localXMm: number; localYMm: number; elevationMm: number | null; evidenceRef: string}[] | null;
  concreteStripStartYMm: number | null; deadStripStartYMm: number | null; liveStripStartYMm: number | null;
  joist: MemberStiffness; bearer: MemberStiffness;
  plywood?: SoffitPlywoodDefinition | null;
  loading?: SpatialLoading | null;
}
export function rectangularBounds(vertices: Point2[]) {
  if (vertices.length !== 4) throw Error('BLOCKED_UNSUPPORTED: soffit layout requires an axis-aligned rectangle');
  const x0 = Math.min(...vertices.map(p => p.x)), x1 = Math.max(...vertices.map(p => p.x));
  const y0 = Math.min(...vertices.map(p => p.y)), y1 = Math.max(...vertices.map(p => p.y));
  if (vertices.some(p => ![x0, x1].includes(p.x) || ![y0, y1].includes(p.y)) || x1 <= x0 || y1 <= y0) throw Error('Invalid rectangular soffit footprint');
  return {x0, x1, y0, y1, widthX: x1 - x0, widthY: y1 - y0};
}
function stations(values: number[], min: number, max: number, label: string) {
  if (!Array.isArray(values) || values.length < 2 || values.length > 40 || values.some((v, i) => !Number.isFinite(v) || v < min || v > max || (i > 0 && v <= values[i - 1]))) {
    throw Error(`${label}: 2–40 sorted, distinct actual coordinates within member bounds required`);
  }
}
export function validateSoffitBindings(layout: SoffitLayout) {
  if (layout.loading != null) validateSpatialLoading(layout.loading);
  if (layout.baseDatumsByHead !== undefined && layout.baseDatumsByHead !== null) {
    if (!Array.isArray(layout.baseDatumsByHead) || layout.baseDatumsByHead.length > 400) throw Error('Invalid per-head base datums');
    uniqueIds(layout.baseDatumsByHead.map(r => ({id: r.headNodeId})), 'base datum heads');
    for (const row of layout.baseDatumsByHead) {
      const r = record(row); if (Object.keys(r).length !== 5 || ['headNodeId', 'localXMm', 'localYMm', 'elevationMm', 'evidenceRef'].some(k => !Object.hasOwn(r, k))) throw Error('Invalid base datum fields or authority metadata');
      signed(row.localXMm, 'base datum local X'); signed(row.localYMm, 'base datum local Y'); if (row.elevationMm !== null) signed(row.elevationMm, 'base datum Z');
      if (typeof row.evidenceRef !== 'string' || row.evidenceRef.length > 2000) throw Error('Invalid base datum evidence');
    }
  }
  for (const s of [layout.joist, layout.bearer]) {
    if (s?.binding !== null && s?.binding !== undefined) validateElasticBinding(s.binding);
    if (s?.resistanceEvidence !== null && s?.resistanceEvidence !== undefined) {
      if (!Array.isArray(s.resistanceEvidence) || s.resistanceEvidence.length > 3) throw Error('At most three 1D member evidence rows are supported');
      s.resistanceEvidence.forEach(validateBeamMemberEvidence);
    }
  }
  if (layout.plywood !== null && layout.plywood !== undefined) validateSoffitPlywood(layout.plywood);
}
function stiffness(s: MemberStiffness, role: 'joist' | 'bearer') {
  if (!s.binding) {finite(s.E_MPa, `${role} E`); finite(s.I_mm4, `${role} I`);}
  const resolved = resolveMemberElastic(s, role === 'joist' ? 'JOIST' : 'BEARER');
  return {E: resolved.E_MPa, I: resolved.I_mm4, selfWeight: finite(s.selfWeightKNPerM, `${role} self-weight (explicit zero permitted)`, true),
    evidence: identifier(s.evidenceRef, `${role} stiffness/self-weight evidence`), resolved};
}
/** Builds only the explicitly supplied one-way rectangular soffit candidate. No stock/grid/grade
 * is invented. Patch loads retain their individual widths; Bc, BDL and BLL are independent.
 * Beam axis X; joists Y; primary bearers X. Panel/connection/frame capacities remain unverified.
 */
export function buildSoffitCandidate(model: WorkflowModel, layout: SoffitLayout) {
  validateSoffitBindings(layout);
  if (!['BEAM', 'SLAB'].includes(model.elementType) || layout.schemaVersion !== '1') throw Error('BEAM/SLAB soffit layout required');
  pairFaces(model.vertices, model.heightMm);
  for (const k of ['stageId', 'loadCaseId', 'ownershipId', 'evidenceRef'] as const) identifier(layout[k], k);
  const bounds = rectangularBounds(model.vertices), L = bounds.widthX;
  const startY = signed(layout.joistStartYMm, 'joist start Y'), endY = signed(layout.joistEndYMm, 'joist end Y');
  const startX = signed(layout.bearerStartXMm, 'bearer start X'), endX = signed(layout.bearerEndXMm, 'bearer end X');
  if (endY <= startY || endX <= startX) throw Error('Member end must exceed start');
  stations(layout.joistXMm, 0, L, 'joists X');
  // Midpoint tributaries conserve force and first moment only with edge supports.
  // Panel cantilevers/two-way continuity need a separate panel model, never a shifted load.
  if (layout.joistXMm[0] !== 0 || layout.joistXMm.at(-1) !== L) throw Error('BLOCKED_UNSUPPORTED: first/last joist must support the concrete X edges; panel overhang model required');
  if (layout.joistXMm.some(x => x < startX || x > endX)) throw Error('Joist does not intersect bearer');
  const headZ = signed(layout.headNodeElevationMm, 'head analysis node elevation'), individualBases = layout.baseDatumsByHead !== undefined && layout.baseDatumsByHead !== null;
  if (individualBases && layout.baseElevationMm !== null) throw Error('Per-head base datums conflict with shared base elevation');
  const baseZ = individualBases ? null : signed(layout.baseElevationMm, 'base elevation');
  if (baseZ !== null && headZ <= baseZ) throw Error('Head analysis node must be above base');
  if (!Array.isArray(layout.bearers) || layout.bearers.length < 2 || layout.bearers.length > 12) throw Error('2–12 actual bearer lines required');
  const sorted = [...layout.bearers].sort((a, b) => a.yMm - b.yMm);
  stations(sorted.map(b => b.yMm), startY, endY, 'bearer Y');
  if (new Set(sorted.map(b => b.id)).size !== sorted.length) throw Error('Duplicate bearer id');
  for (const b of sorted) {identifier(b.id, 'bearer id'); stations(b.headsXMm, startX, endX, `${b.id} head X`);}
  const j = stiffness(layout.joist, 'joist'), b = stiffness(layout.bearer, 'bearer');
  const fC = actionFactor(model, 'CONCRETE'), fD = actionFactor(model, 'ADDITIONAL_DL'), fL = actionFactor(model, 'CONSTRUCTION_LL'), fS = actionFactor(model, 'SELF_WEIGHT');
  j.selfWeight *= fS; b.selfWeight *= fS;
  const surfaces: PlywoodSurfacePatch[] = [];
  let sourceConcreteN = 0, sourceDeadN = 0, sourceLiveN = 0;
  const g = finite(model.gammaKNm3, 'gamma');
  const surface = (id: string, kind: LoadAction['kind'], q: number, from: number, to: number) => {
    if (q === 0) return; // explicit zero action retained in the ledger; no fictitious patch or location
    if (to <= from || from < startY || to > endY) throw Error(`${id}: loaded strip is outside actual joist length`);
    surfaces.push({id, kind, qKPa: q, startY: from, endY: to});
  };
  let concreteRegion: LoadAction['region'], deadRegion: LoadAction['region'], liveRegion: LoadAction['region'];
  const spatial = layout.loading ? compileSpatialSurfaces(model, layout, bounds) : null;
  if (spatial) {
    surfaces.push(...spatial.surfaces); sourceConcreteN = spatial.totals.concrete; sourceDeadN = spatial.totals.additionalDead; sourceLiveN = spatial.totals.constructionLive;
    concreteRegion = deadRegion = liveRegion = null;
  } else if (model.elementType === 'SLAB') {
    if (model.slabThicknessMm !== model.heightMm) throw Error('Slab thickness must match concrete geometry');
    const q = slabLoads(g, finite(model.slabThicknessMm, 'slab thickness'), model.additionalDeadKPa, model.constructionLiveKPa);
    surface('CONCRETE', 'CONCRETE', q.concreteKPa * fC, 0, bounds.widthY);
    surface('DL', 'ADDITIONAL_DL', q.additionalDeadKPa * fD, 0, bounds.widthY);
    surface('LL', 'CONSTRUCTION_LL', q.constructionLiveKPa * fL, 0, bounds.widthY);
    sourceConcreteN = q.concreteKPa * fC * L * bounds.widthY / 1000;
    sourceDeadN = q.additionalDeadKPa * fD * L * bounds.widthY / 1000;
    sourceLiveN = q.constructionLiveKPa * fL * L * bounds.widthY / 1000;
    concreteRegion = deadRegion = liveRegion = {x0: bounds.x0, x1: bounds.x1, y0: bounds.y0, y1: bounds.y1};
  } else {
    const width = finite(model.beamWidthMm, 'beam width');
    if (width !== bounds.widthY) throw Error('Beam axis X: beam width must equal the concrete footprint Y width');
    const t = finite(model.slabThicknessMm, 'slab thickness', true), Bc = finite(model.concreteStripMm, 'concrete strip');
    const q = beamLoads({gamma: g, bMm: width, hMm: model.heightMm, slabThicknessMm: t, concreteStripMm: Bc,
      deadKPa: model.additionalDeadKPa, deadStripMm: finite(model.deadStripMm, 'DL strip'), liveKPa: model.constructionLiveKPa, liveStripMm: finite(model.liveStripMm, 'LL strip')});
    const concreteStart = t === 0 ? 0 : signed(layout.concreteStripStartYMm, 'owned concrete strip start Y');
    if (t > 0 && (concreteStart > 0 || concreteStart + Bc < width)) throw Error('Owned slab strip must include the beam footprint');
    const deadStart = model.additionalDeadKPa === 0 ? null : signed(layout.deadStripStartYMm, 'DL strip start Y');
    const liveStart = model.constructionLiveKPa === 0 ? null : signed(layout.liveStripStartYMm, 'LL strip start Y');
    surface('DOWNSTAND', 'CONCRETE', g * fC * (model.heightMm - t) / 1000, 0, width);
    surface('OWNED_SLAB', 'CONCRETE', g * fC * t / 1000, concreteStart, concreteStart + Bc);
    if (deadStart !== null) surface('DL', 'ADDITIONAL_DL', model.additionalDeadKPa! * fD, deadStart, deadStart + model.deadStripMm!);
    if (liveStart !== null) surface('LL', 'CONSTRUCTION_LL', model.constructionLiveKPa! * fL, liveStart, liveStart + model.liveStripMm!);
    sourceConcreteN = q.concreteKNPerM * fC * L; sourceDeadN = q.additionalDeadKNPerM * fD * L; sourceLiveN = q.constructionLiveKNPerM * fL * L;
    const region = (from: number, to: number) => ({x0: bounds.x0, x1: bounds.x1, y0: bounds.y0 + from, y1: bounds.y0 + to});
    concreteRegion = region(Math.min(0, concreteStart), Math.max(width, concreteStart + Bc));
    deadRegion = deadStart === null ? null : region(deadStart, deadStart + model.deadStripMm!);
    liveRegion = liveStart === null ? null : region(liveStart, liveStart + model.liveStripMm!);
  }
  let plywood: (ReturnType<typeof analyzePlywoodDeck> & {selfWeight: {declaredForceN: number; additionalForceN: number; ownership: 'SEPARATE_ACTION' | 'IN_ADDITIONAL_DL'}}) | null = null;
  let plywoodAddedN = 0, plywoodDeclaredN = 0;
  let plywoodRegion: LoadAction['region'] = null;
  if (layout.plywood) {
    const p = layout.plywood; validateSoffitPlywood(p);
    const from = signed(p.startYMm, 'actual plywood start Y'), to = signed(p.endYMm, 'actual plywood end Y');
    if (from < startY || to > endY || to <= from) throw Error('Plywood extent outside actual joist length');
    const rawQ = finite(p.selfWeightKPa, 'plywood self-weight (explicit zero permitted)', true), q = rawQ * (p.selfWeightOwnership === 'IN_ADDITIONAL_DL' ? fD : fS); identifier(p.selfWeightEvidenceRef, 'plywood self-weight source');
    if (!p.selfWeightOwnership) throw Error('Plywood self-weight ownership must be explicitly separate or included in additional DL');
    plywoodDeclaredN = q * L * (to - from) / 1000;
    plywoodRegion = {x0: bounds.x0, x1: bounds.x1, y0: bounds.y0 + from, y1: bounds.y0 + to};
    if (p.selfWeightOwnership === 'SEPARATE_ACTION') {plywoodAddedN = plywoodDeclaredN; surface('SELF:PLYWOOD', 'SELF_WEIGHT', q, from, to);}
    else if (spatial) assertDeckCoverage(spatial.surfaces.filter(s => s.kind === 'ADDITIONAL_DL').map(s => ({...s, qKPa: finite(model.additionalDeadKPa, 'raw owning DL', true)})), 0, L, from, to, rawQ);
    else if (!deadRegion || deadRegion.y0 > plywoodRegion.y0 || deadRegion.y1 < plywoodRegion.y1 || model.additionalDeadKPa! < rawQ) throw Error('Declared plywood weight is not fully covered by the owning additional DL pressure/region');
    if ((model.analysisCase || spatial) && !surfaces.length) surfaces.push({id: 'EXPLICIT-ZERO-CASE-SURFACE', kind: 'CONCRETE', qKPa: 0, startY: from, endY: to});
    const deck = analyzePlywoodDeck({modelId: model.id, revision: model.revisionId, stageId: layout.stageId, loadCaseId: layout.loadCaseId, joistXMm: layout.joistXMm, definition: {...p, selfWeightKPa: q}, surfaces});
    plywood = {...deck, selfWeight: {declaredForceN: plywoodDeclaredN, additionalForceN: plywoodAddedN, ownership: p.selfWeightOwnership}};
  }
  const makeAction = (id: string, kind: LoadAction['kind'], forceN: number, region: LoadAction['region']): LoadAction => ({
    id: `${model.id}:${id}`, ownershipId: `${layout.ownershipId}:${id}`, kind, direction: 'VERTICAL_DOWN', stageId: layout.stageId,
    loadCaseId: layout.loadCaseId, source: layout.evidenceRef, units: 'kN', magnitude: forceN / 1000, region, includedInActionId: null});
  const actions: LoadAction[] = [makeAction('CONCRETE', 'CONCRETE', sourceConcreteN, concreteRegion), makeAction('DL', 'ADDITIONAL_DL', sourceDeadN, deadRegion), makeAction('LL', 'CONSTRUCTION_LL', sourceLiveN, liveRegion)];
  if (spatial) actions.push(...spatial.ledger);
  if (layout.plywood) actions.push({...makeAction('SELF:PLYWOOD', 'SELF_WEIGHT', plywoodDeclaredN, plywoodRegion), source: layout.plywood.selfWeightEvidenceRef,
    includedInActionId: layout.plywood.selfWeightOwnership === 'IN_ADDITIONAL_DL' ? `${model.id}:DL` : null});
  const members: PathMember[] = [];
  let selfWeightN = 0;
  let sourceXMomentNmm = 0, sourceYMomentNmm = 0;
  for (const s of surfaces) {
    const force = s.qKPa * ((s.endX ?? L) - (s.startX ?? 0)) * (s.endY - s.startY) / 1000;
    sourceXMomentNmm += force * (bounds.x0 + ((s.startX ?? 0) + (s.endX ?? L)) / 2);
    sourceYMomentNmm += force * (bounds.y0 + (s.startY + s.endY) / 2);
  }
  for (let i = 0; i < layout.joistXMm.length; i++) {
    const x = layout.joistXMm[i], left = i === 0 ? 0 : (layout.joistXMm[i - 1] + x) / 2;
    const right = i === layout.joistXMm.length - 1 ? L : (x + layout.joistXMm[i + 1]) / 2;
    const trib = right - left, id = `JOIST-${i + 1}`;
    const transferred = new Map<string, {id: string; startMm: number; endMm: number; startNPerMm: number; endNPerMm: number}>();
    if (plywood) for (const t of plywood.transfers.filter(t => t.targetJoistId === id)) {
      const key = `${t.startYMm}:${t.endYMm}`, old = transferred.get(key);
      if (old) {old.startNPerMm += t.lineLoadNPerMm; old.endNPerMm += t.lineLoadNPerMm;}
      else transferred.set(key, {id: `PLY_ZONE:${id}:${key}`, startMm: t.startYMm - startY, endMm: t.endYMm - startY, startNPerMm: t.lineLoadNPerMm, endNPerMm: t.lineLoadNPerMm});
    }
    const patches = plywood ? [...transferred.values()] : surfaces.map(s => ({id: `${s.id}:${id}`, startMm: s.startY - startY, endMm: s.endY - startY,
      startNPerMm: s.qKPa * trib / 1000, endNPerMm: s.qKPa * trib / 1000}));
    patches.push({id: `SELF:${id}`, startMm: 0, endMm: endY - startY, startNPerMm: j.selfWeight, endNPerMm: j.selfWeight});
    members.push({role: 'JOIST', placement: {axis: 'Y', origin: {xMm: bounds.x0 + x, yMm: bounds.y0 + startY, zMm: headZ}},
      beam: {id, revision: model.revisionId, lengthMm: endY - startY, E_MPa: j.E, I_mm4: j.I, points: [], patches,
        supports: sorted.map(line => ({id: line.id, xMm: line.yMm - startY})),
        ...(layout.joist.resistanceEvidence?.length ? {actionBasis: model.analysisCase?.basis ?? 'SERVICE',
          memberEvidenceRef: beamMemberEvidenceReference('JOIST', {E_MPa: layout.joist.E_MPa, I_mm4: layout.joist.I_mm4,
            evidenceRef: layout.joist.evidenceRef, binding: layout.joist.binding ?? null}), resistanceEvidence: layout.joist.resistanceEvidence} : {})},
      links: sorted.map(line => ({supportId: line.id, target: {kind: 'MEMBER', memberId: line.id, xMm: x - startX}}))});
    const force = j.selfWeight * (endY - startY); selfWeightN += force;
    sourceXMomentNmm += force * (bounds.x0 + x); sourceYMomentNmm += force * (bounds.y0 + (startY + endY) / 2);
    actions.push({...makeAction(`SELF:${id}`, 'SELF_WEIGHT', force, null), source: j.evidence});
  }
  const legs: RinglockLeg[] = [];
  for (const line of sorted) {
    if (members.some(m => m.beam.id === line.id)) throw Error('Bearer id collides with joist id');
    const supports = line.headsXMm.map((x, i) => {
      const headId = `${line.id}:HEAD-${i + 1}`;
      const datum = layout.baseDatumsByHead?.find(r => r.headNodeId === headId);
      if (individualBases && (!datum || datum.localXMm !== x || datum.localYMm !== line.yMm || !datum.evidenceRef.trim())) throw Error(`${headId}: exact current per-head base coordinates and evidence required`);
      const actualBaseZ = individualBases ? signed(datum?.elevationMm, `${headId} base elevation`) : baseZ!;
      if (actualBaseZ >= headZ) throw Error(`${headId}: base must be below head`);
      legs.push({id: `${line.id}:LEG-${i + 1}`, headNodeId: headId, xMm: bounds.x0 + x, yMm: bounds.y0 + line.yMm, headElevationMm: headZ, baseElevationMm: actualBaseZ});
      return {id: headId, xMm: x - startX};
    });
    members.push({role: 'BEARER', placement: {axis: 'X', origin: {xMm: bounds.x0 + startX, yMm: bounds.y0 + line.yMm, zMm: headZ}},
      beam: {id: line.id, revision: model.revisionId, lengthMm: endX - startX, E_MPa: b.E, I_mm4: b.I, points: [], supports,
        patches: [{id: `SELF:${line.id}`, startMm: 0, endMm: endX - startX, startNPerMm: b.selfWeight, endNPerMm: b.selfWeight}],
        ...(layout.bearer.resistanceEvidence?.length ? {actionBasis: model.analysisCase?.basis ?? 'SERVICE',
          memberEvidenceRef: beamMemberEvidenceReference('BEARER', {E_MPa: layout.bearer.E_MPa, I_mm4: layout.bearer.I_mm4,
            evidenceRef: layout.bearer.evidenceRef, binding: layout.bearer.binding ?? null}), resistanceEvidence: layout.bearer.resistanceEvidence} : {})},
      links: supports.map(s => ({supportId: s.id, target: {kind: 'U_HEAD', nodeId: s.id}}))});
    const force = b.selfWeight * (endX - startX); selfWeightN += force;
    sourceXMomentNmm += force * (bounds.x0 + (startX + endX) / 2); sourceYMomentNmm += force * (bounds.y0 + line.yMm);
    actions.push({...makeAction(`SELF:${line.id}`, 'SELF_WEIGHT', force, null), source: b.evidence});
  }
  const direct = applySpatialMemberActions(model, layout, members, actions);
  sourceXMomentNmm += direct.xLeverNmm; sourceYMomentNmm += direct.yLeverNmm;
  const issues = loadOwnershipIssues(actions);
  if (issues.length) throw Error(issues.join('; '));
  if (!model.ringlock) throw Error('Select a Ringlock plan before defining the actual heads');
  const ringlock: RinglockConfiguration = {...model.ringlock, legs};
  if (individualBases && (layout.baseDatumsByHead!.length !== legs.length || layout.baseDatumsByHead!.some(r => !legs.some(l => l.headNodeId === r.headNodeId)))) throw Error('Unknown, missing or stale per-head base datum; no fallback to shared base');
  const requiredChecks: RequiredCheck[] = [];
  for (const spec of model.checkCatalogue?.specifications ?? []) {
    if (spec.appliesTo !== 'ALL' && !spec.appliesTo.split('|').includes(model.elementType)) continue;
    const targets = spec.group === 'RINGLOCK' ? legs.map(l => l.id) : spec.group === 'TYPICAL' ? [...members.map(m => m.beam.id), ...legs.map(l => l.id), ...(plywood?.strips.map(s => s.id) ?? [])] :
      ['SOFFIT-03', 'SOFFIT-04'].includes(spec.id) ? plywood?.strips.map(s => s.id) ?? [] :
      spec.id === 'SOFFIT-05' ? members.filter(m => m.role === 'JOIST').map(m => m.beam.id) : ['SOFFIT-06', 'SOFFIT-07', 'SOFFIT-08'].includes(spec.id) ? sorted.map(l => l.id) :
      ['INPUT', 'RELEASE'].includes(spec.group) || ['SOFFIT-01', 'SOFFIT-02'].includes(spec.id) ? [model.id] : [];
    for (const target of targets) requiredChecks.push({memberId: target, checkId: spec.id, loadCaseId: layout.loadCaseId, revision: model.revisionId,
      applicability: {stageId: layout.stageId, elementType: model.elementType, layoutEvidence: layout.evidenceRef, analysisDefinition: canonical({layout, analysisCase: model.analysisCase ?? null, vertices: model.vertices, gamma: model.gammaKNm3,
        heightMm: model.heightMm, slabThicknessMm: model.slabThicknessMm, concreteStripMm: model.concreteStripMm, deadStripMm: model.deadStripMm, liveStripMm: model.liveStripMm,
        additionalDeadKPa: model.additionalDeadKPa, constructionLiveKPa: model.constructionLiveKPa}), memberId: target}});
  }
  const configurationIssues: string[] = [];
  if (sorted.some((line, i) => (i > 0 && line.yMm - sorted[i - 1].yMm !== ringlock.bayYMm) || line.headsXMm.some((x, n) => n > 0 && x - line.headsXMm[n - 1] !== ringlock.bayXMm))) configurationIssues.push('ACTUAL_HEAD_SPACING_DIFFERS_FROM_SELECTED_RINGLOCK_PLAN');
  const additionalForceN = (spatial?.totals.additional ?? 0) + (direct.byKindN.PLACEMENT ?? 0) + (direct.byKindN.OTHER ?? 0);
  return {members, actions, ringlock, requiredChecks, configurationIssues, plywood, additionalForceN,
    spatialLoading: spatial ? {scopeEvidenceRef: layout.loading!.evidenceRef, omittedAreasEvidenceRef: layout.loading!.omittedAreasEvidenceRef, regions: spatial.rows, memberActions: direct.resolved, additionalForceN} : null,
    elasticInputs: {joist: j.resolved, bearer: b.resolved}, expectedForceN: sourceConcreteN + sourceDeadN + sourceLiveN + selfWeightN + plywoodAddedN + (spatial?.totals.additional ?? 0) + direct.forceN,
    expectedXMomentNmm: sourceXMomentNmm, expectedYMomentNmm: sourceYMomentNmm,
    ownedForceN: {concrete: sourceConcreteN, additionalDead: sourceDeadN + (direct.byKindN.ADDITIONAL_DL ?? 0), constructionLive: sourceLiveN + (direct.byKindN.CONSTRUCTION_LL ?? 0), componentSelfWeight: selfWeightN + plywoodAddedN + (direct.byKindN.SELF_WEIGHT ?? 0)},
    assumptions: ['ONE_WAY_PANEL_LOAD_DISTRIBUTION', 'RIGID_VERTICAL_JOIST_BEARER_SUPPORTS', individualBases ? 'COMMON_HEAD_ANALYSIS_PLANE_INDIVIDUAL_BASE_DATUMS' : 'COMMON_HEAD_ANALYSIS_PLANE_AND_FLAT_BASE',
      'EDGE_SUPPORTED_SIMPLY_SPANNING_TRANSVERSE_PANEL_STRIPS', plywood ? 'CONNECTOR_RINGLOCK_WEIGHT_REQUIRES_SEPARATE_OWNED_LOAD_EVIDENCE' : 'PLYWOOD_CONNECTOR_RINGLOCK_WEIGHT_REQUIRES_SEPARATE_OWNED_LOAD_EVIDENCE',
      spatial ? 'ONLY_EXPLICIT_SPATIAL_REGIONS_AND_DIRECT_MEMBER_ACTIONS_ADDED_NO_WIND_OR_DYNAMIC_INFERENCE' : 'NO_POINT_PATCH_EQUIPMENT_WIND_OR_HORIZONTAL_ACTIONS_ADDED',
      ...(spatial ? ['DIRECT_MEMBER_ACTIONS_REQUIRE_ACTUAL_BEARING_AND_LOCAL_CONTACT_VERIFICATION', 'INDEPENDENT_STAGE_PLACEMENT_NO_CONCRETE_HISTORY_OR_SUPPORT_REDISTRIBUTION'] : []), 'NO_PANEL_CONNECTION_OR_RINGLOCK_CAPACITY_APPROVAL',
      ...(spatial && model.sideLayout ? ['SPATIAL_CONCRETE_PLACEMENT_AND_SIDE_PRESSURE_PROFILE_COUPLING_UNVERIFIED'] : []),
      ...(plywood?.blockers ?? ['ACTUAL_PLYWOOD_ANALYSIS_AND_SELF_WEIGHT_DEFINITION_REQUIRED']), ...j.resolved.blockers, ...b.resolved.blockers]};
}
