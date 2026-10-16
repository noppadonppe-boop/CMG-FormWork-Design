import {segmentInside} from '../index.js';
import {canonical, clone, identifier, record, signed, uniqueIds, WORKFLOW_VERSION} from './common.js';
import {pairFaces} from './geometry.js';
import {parseWorkflowModel, regenerateDraftLayouts, type WorkflowModel} from './model.js';
import {pointOnFace, stampSideLayout, type SideEndpoint, type SideLayoutDefinition} from './sideLayout.js';
import {rectangularBounds, type SoffitLayout} from './soffit.js';

/** Untrusted coordinate proposals only. No material, load, strength, verdict or approval fields. */
export type CandidateScope = 'SIDE' | 'SOFFIT' | 'BOTH';
export interface CandidateBinding {
  requestId: string; modelId: string; revisionId: string; inputHash: string; engineVersion: string;
  scope: CandidateScope; stageId: string; loadCaseId: string; units: 'MM';
}
export interface SideCoordinates {
  faces: {faceId: string; studPositionsMm: number[]; walers: {id: string; zMm: number; supports: {id: string; xMm: number}[]}[]}[];
  ties: {id: string; a: SideEndpoint; b: SideEndpoint}[];
}
export interface SoffitCoordinates {
  joistXMm: number[]; joistStartYMm: number | null; joistEndYMm: number | null; bearerStartXMm: number | null; bearerEndXMm: number | null;
  bearers: {id: string; yMm: number; headsXMm: number[]}[];
}
export interface LayoutCandidate {
  schemaVersion: 'layout-coordinates-1'; binding: CandidateBinding; sourceRef: string; rationale: string;
  side: SideCoordinates | null; soffit: SoffitCoordinates | null;
}
export interface CandidateRequest {
  binding: CandidateBinding;
  instructions: string[];
  readOnlyContext: {elementType: WorkflowModel['elementType']; vertices: WorkflowModel['vertices']; heightMm: number; sideTopology: WorkflowModel['sideTopology']; geometrySourceRef: string | null; faces: ReturnType<typeof pairFaces>['faces']};
  responseTemplate: LayoutCandidate;
}
export interface AppliedLayoutCandidate {
  schemaVersion: 'local-layout-candidate-1'; proposal: LayoutCandidate; proposalHash: string; appliedRevision: string;
}
export interface CandidateChange {path: string; before: unknown; after: unknown}
export interface CandidateReview {proposal: LayoutCandidate; proposalHash: string; changes: CandidateChange[]; notices: string[]}
const bindingKeys = ['requestId', 'modelId', 'revisionId', 'inputHash', 'engineVersion', 'scope', 'stageId', 'loadCaseId', 'units'];
const hash = (v: unknown) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
function exact(raw: unknown, keys: string[]) {
  const r = record(raw);
  if (keys.some(k => !Object.hasOwn(r, k)) || Object.keys(r).some(k => !keys.includes(k))) throw Error('Candidate unknown/missing fields; loads, materials, capacities and authority fields are forbidden');
  return r;
}
function text(raw: unknown, label: string, max = 2000, required = false) {
  if (typeof raw !== 'string' || raw.length > max || (required && !raw.trim())) throw Error(`${label}: explicit bounded text required`);
}
function array(raw: unknown, max: number, label: string): unknown[] {if (!Array.isArray(raw) || raw.length > max) throw Error(`${label}: ${max}-row limit; no rows omitted`); return raw;}
function stations(raw: unknown, label: string) {
  const v = array(raw, 40, label); if (v.length < 2) throw Error(`${label}: at least two stations required`);
  v.forEach((n, i) => {signed(n, label); if (i && Number(n) <= Number(v[i - 1])) throw Error(`${label}: sorted distinct stations required`);});
}
function validateBinding(raw: unknown) {
  const b = exact(raw, bindingKeys);
  for (const k of ['requestId', 'modelId', 'revisionId', 'stageId', 'loadCaseId']) identifier(b[k], k);
  if (!hash(b.inputHash) || typeof b.engineVersion !== 'string' || b.engineVersion.length > 100 || !['SIDE', 'SOFFIT', 'BOTH'].includes(String(b.scope)) || b.units !== 'MM') throw Error('Invalid candidate binding/hash/scope/units');
}
export function validateLayoutCandidate(raw: unknown): asserts raw is LayoutCandidate {
  const p = exact(raw, ['schemaVersion', 'binding', 'sourceRef', 'rationale', 'side', 'soffit']);
  if (p.schemaVersion !== 'layout-coordinates-1') throw Error('Unsupported candidate schema'); validateBinding(p.binding);
  text(p.sourceRef, 'Proposal source', 2000, true); text(p.rationale, 'Proposal rationale', 4000, true);
  const b = p.binding as CandidateBinding;
  if ((b.scope !== 'SOFFIT') !== (p.side !== null) || (b.scope !== 'SIDE') !== (p.soffit !== null)) throw Error('Candidate geometry must match declared scope exactly');
  if (p.side !== null) {
    const s = exact(p.side, ['faces', 'ties']), faces = array(s.faces, 64, 'candidate faces'), ties = array(s.ties, 1000, 'candidate ties');
    if (!faces.length) throw Error('Complete physical face coordinates required');
    uniqueIds(faces.map(f => ({id: String(record(f).faceId)})), 'candidate faces');
    let supports = 0, analyses = 0;
    for (const v of faces) {
      const f = exact(v, ['faceId', 'studPositionsMm', 'walers']); identifier(f.faceId, 'physical face'); stations(f.studPositionsMm, 'actual stud stations');
      const walers = array(f.walers, 12, 'walers'); if (walers.length < 2) throw Error('At least two actual waler levels required');
      uniqueIds(walers as {id: string}[], 'candidate walers'); analyses += 2 * (f.studPositionsMm as number[]).length - 1 + 2 * walers.length;
      walers.forEach((w, i) => {
        const r = exact(w, ['id', 'zMm', 'supports']); identifier(r.id, 'waler'); signed(r.zMm, 'waler Z');
        if (i && Number(r.zMm) <= Number(record(walers[i - 1]).zMm)) throw Error('Sorted distinct waler levels required');
        const rows = array(r.supports, 40, 'waler supports'); uniqueIds(rows as {id: string}[], 'candidate supports'); stations(rows.map(s => record(s).xMm), 'support stations');
        rows.forEach(s => {const q = exact(s, ['id', 'xMm']); identifier(q.id, 'support');}); supports += rows.length;
      });
    }
    if (supports > 1000 || analyses > 400) throw Error('Complete candidate side graph exceeds 1000 supports or 400 baseline analyses; no rows omitted');
    uniqueIds(ties as {id: string}[], 'candidate ties');
    for (const v of ties) {const t = exact(v, ['id', 'a', 'b']); identifier(t.id, 'tie');
      for (const endpoint of [t.a, t.b]) {const e = exact(endpoint, ['faceId', 'walerId', 'supportId']); Object.values(e).forEach(v => identifier(v, 'tie endpoint'));}}
  }
  if (p.soffit !== null) {
    const s = exact(p.soffit, ['joistXMm', 'joistStartYMm', 'joistEndYMm', 'bearerStartXMm', 'bearerEndXMm', 'bearers']);
    stations(s.joistXMm, 'joist stations');
    for (const k of ['joistStartYMm', 'joistEndYMm', 'bearerStartXMm', 'bearerEndXMm']) signed(s[k], k);
    const bearers = array(s.bearers, 40, 'primary bearers'); if (bearers.length < 2) throw Error('At least two primary bearers required');
    uniqueIds(bearers as {id: string}[], 'candidate bearers'); let heads = 0;
    bearers.forEach((v, i) => {const b = exact(v, ['id', 'yMm', 'headsXMm']); identifier(b.id, 'bearer'); signed(b.yMm, 'bearer Y'); stations(b.headsXMm, 'actual head stations'); heads += (b.headsXMm as number[]).length;
      if (i && Number(b.yMm) <= Number(record(bearers[i - 1]).yMm)) throw Error('Sorted distinct bearer levels required');});
    if (heads > 400) throw Error('400-head candidate limit; no heads omitted');
    const memberIds = [...(s.joistXMm as number[]).map((_, i) => `JOIST-${i + 1}`), ...(bearers as {id: string}[]).map(b => b.id)];
    if (new Set(memberIds).size !== memberIds.length) throw Error('Candidate joist/bearer member IDs collide');
  }
  if (canonical(raw).length > 150000) throw Error('150000-character candidate limit; no fields omitted');
}
export function validateAppliedCandidate(raw: unknown): asserts raw is AppliedLayoutCandidate {
  const a = exact(raw, ['schemaVersion', 'proposal', 'proposalHash', 'appliedRevision']);
  if (a.schemaVersion !== 'local-layout-candidate-1' || !hash(a.proposalHash)) throw Error('Invalid local candidate provenance');
  identifier(a.appliedRevision, 'candidate application revision'); validateLayoutCandidate(a.proposal);
}
async function digest(value: unknown) {
  const data = canonical(value); if (data.length > 8000000) throw Error('Candidate source exceeds 8000000 characters; no source fields omitted');
  const bytes = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
}
const sideCoordinates = (m: WorkflowModel): SideCoordinates | null => m.sideLayout ? ({faces: m.sideLayout.faces.map(f => ({faceId: f.faceId, studPositionsMm: clone(f.studPositionsMm),
  walers: f.walers.map(w => ({id: w.id, zMm: w.zMm, supports: clone(w.supports)}))})), ties: m.sideLayout.ties.map(t => ({id: t.id, a: clone(t.a), b: clone(t.b)}))}) : null;
const soffitCoordinates = (m: WorkflowModel): SoffitCoordinates | null => m.soffitLayout ? Object.fromEntries(['joistXMm', 'joistStartYMm', 'joistEndYMm', 'bearerStartXMm', 'bearerEndXMm', 'bearers'].map(k => [k, clone(m.soffitLayout![k as keyof SoffitLayout])])) as unknown as SoffitCoordinates : null;
function sameStage(m: WorkflowModel, stage: string, loadCase: string) {
  if (m.analysisCase) throw Error('Compiled analysis cases cannot receive layout proposals');
  const layouts = [m.sideLayout, m.soffitLayout, m.frameLayout, m.ringlockAssembly, m.supportLayout].filter(l => l != null);
  if (layouts.some(l => l.stageId !== stage || l.loadCaseId !== loadCase)) throw Error('Use the same authored physical Stage/case; change stages explicitly before requesting a candidate');
}
export async function createLayoutCandidateRequest(raw: WorkflowModel, scope: CandidateScope, stageId: string, loadCaseId: string): Promise<CandidateRequest> {
  const m = parseWorkflowModel(raw); identifier(stageId, 'request stage'); identifier(loadCaseId, 'request case'); sameStage(m, stageId, loadCaseId);
  if (!['SIDE', 'SOFFIT', 'BOTH'].includes(scope)) throw Error('Explicit candidate scope required');
  if (scope !== 'SIDE' && !['BEAM', 'SLAB'].includes(m.elementType)) throw Error('Only BEAM/SLAB can propose a soffit');
  const topology = pairFaces(m.vertices, m.heightMm);
  const binding: CandidateBinding = {requestId: globalThis.crypto.randomUUID(), modelId: m.id, revisionId: m.revisionId, inputHash: await digest(m), engineVersion: WORKFLOW_VERSION, scope, stageId, loadCaseId, units: 'MM'};
  return {binding, instructions: [
    'Return responseTemplate as one strict JSON object. This is an untrusted coordinate proposal, never an approval or engineering check.',
    'Echo binding exactly. Change coordinate fields only. Concrete geometry, topology, loads, material/section/product selections, stiffness, capacities and design basis are locked.',
    'Side X is measured from the named physical face start; side Z is above the concrete base. Keep all physical faces; pair-region cuts are not hinges or splices.',
    'Soffit XY stations are offsets from polygon minimum X/Y: joists run Y, PRIMARY bearers X, and heads are actual stations. A Ringlock ledger is not a primary bearer.',
    'Keep existing product-bearing tie/waler IDs. Do not guess material, stiffness, tie diameter, elevation, pressure, head/base datum, stock, rating or resistance.',
    'Provide sourceRef and rationale as unverified source claims for human inspection. Missing engineering properties remain null in the local draft; do not add fields.',
    'Do not claim an optimized/rated layout: product/configuration rules and independent engineering acceptance are incomplete. No services are called by this handoff.'
  ], readOnlyContext: {elementType: m.elementType, vertices: clone(m.vertices), heightMm: m.heightMm, sideTopology: m.sideTopology, geometrySourceRef: m.sourceRef, faces: topology.faces},
    responseTemplate: {schemaVersion: 'layout-coordinates-1', binding: clone(binding), sourceRef: '', rationale: '', side: scope === 'SOFFIT' ? null : sideCoordinates(m) ?? {faces: topology.faces.map(f => ({faceId: f.id, studPositionsMm: [], walers: []})), ties: []},
      soffit: scope === 'SIDE' ? null : soffitCoordinates(m) ?? {joistXMm: [], joistStartYMm: null, joistEndYMm: null, bearerStartXMm: null, bearerEndXMm: null, bearers: []}}};
}
function geometryPatch(m: WorkflowModel, p: LayoutCandidate): Partial<WorkflowModel> {
  const patch: Partial<WorkflowModel> = {}, topology = pairFaces(m.vertices, m.heightMm);
  if (p.side) {
    if (!m.sideTopology) throw Error('Human must select side tie/yoke/brace topology before a candidate');
    if (p.side.faces.length !== topology.faces.length || topology.faces.some(f => !p.side!.faces.some(s => s.faceId === f.id))) throw Error('Candidate must include every actual physical face, including ends/corners');
    for (const f of p.side.faces) {
      const face = topology.faces.find(s => s.id === f.faceId)!;
      if (f.studPositionsMm[0] !== 0 || f.studPositionsMm.at(-1) !== face.lengthMm || f.studPositionsMm.some(x => x < 0 || x > face.lengthMm)) throw Error('Stud stations must cover actual face edges without invented overhang behavior');
      for (const w of f.walers) if (w.zMm < 0 || w.zMm > m.heightMm || w.supports.some(s => s.xMm < 0 || s.xMm > face.lengthMm)) throw Error('Waler/support station outside actual face');
      const previous = m.sideLayout?.faces.find(s => s.faceId === f.faceId);
      if (previous?.walers.some(w => w.pair && !f.walers.some(n => n.id === w.id))) throw Error('Protected paired-waler product data cannot be removed by a coordinate proposal; edit manually');
    }
    if (m.sideLayout?.ties.some(t => (t.assembly || t.dossier) && !p.side!.ties.some(n => n.id === t.id))) throw Error('Protected tie product/history cannot be removed by a coordinate proposal; edit manually');
    const used = new Set<string>(), key = (e: SideEndpoint) => canonical([e.faceId, e.walerId, e.supportId]);
    for (const tie of p.side.ties) {
      if (!['THROUGH_TIE', 'SEGMENTED_TIE'].includes(m.sideTopology)) throw Error('Tie routes cannot replace selected yoke/ground-braced topology');
      const ends = [tie.a, tie.b].map(e => {
        const f = p.side!.faces.find(f => f.faceId === e.faceId), w = f?.walers.find(w => w.id === e.walerId), s = w?.supports.find(s => s.id === e.supportId), face = topology.faces.find(f => f.id === e.faceId);
        if (!s || !w || !face || used.has(key(e))) throw Error('Missing/reused actual tie endpoint'); used.add(key(e)); return {face, w, point: pointOnFace(face, s.xMm)};
      });
      if (Math.abs(ends[0].w.zMm - ends[1].w.zMm) > 1e-7 || ends[0].face.normal.x * ends[1].face.normal.x + ends[0].face.normal.y * ends[1].face.normal.y > -1 + 1e-7 || !segmentInside(ends[0].point, ends[1].point, m.vertices)) throw Error('Tie centerline must join opposite actual supports at equal height through concrete');
    }
    if (['THROUGH_TIE', 'SEGMENTED_TIE'].includes(m.sideTopology) && used.size !== p.side.faces.reduce((n, f) => n + f.walers.reduce((n, w) => n + w.supports.length, 0), 0)) throw Error('Every actual waler support needs a declared tie route; no silent clamp substitution');
    const faces = p.side.faces.map(f => {
      const old = m.sideLayout?.faces.find(s => s.faceId === f.faceId);
      return {...(old ? clone(old) : {evidenceRef: '', stud: {E_MPa: null, I_mm4: null, evidenceRef: ''}, rail: {E_MPa: null, I_mm4: null, evidenceRef: ''}, plywood: {thicknessMm: null, effectiveE_MPa: null, grainAxis: null, jointsAtEveryStud: null, evidenceRef: ''}, heavierRailShare: null, sharingEvidence: null}),
        ...clone(f), walers: f.walers.map(w => ({...clone(w), ...(old?.walers.find(s => s.id === w.id)?.pair ? {pair: clone(old.walers.find(s => s.id === w.id)!.pair)} : {})}))};
    });
    const definition: SideLayoutDefinition = {...(m.sideLayout ? clone(m.sideLayout) : {schemaVersion: '1', stageId: p.binding.stageId, loadCaseId: p.binding.loadCaseId, evidenceRef: '', pourHeadMm: null, baseElevationMm: null, rebarClearanceEvidence: null}), faces,
      ties: p.side.ties.map(t => ({...(m.sideLayout?.ties.find(s => s.id === t.id) ? clone(m.sideLayout.ties.find(s => s.id === t.id)!) : {diameterMm: null, assembly: null}), ...clone(t)}))};
    patch.sideLayout = stampSideLayout(m, definition);
  }
  if (p.soffit) {
    if (!['BEAM', 'SLAB'].includes(m.elementType)) throw Error('Only BEAM/SLAB have a candidate soffit');
    const b = rectangularBounds(m.vertices), s = p.soffit;
    if (s.joistXMm[0] !== 0 || s.joistXMm.at(-1) !== b.widthX || s.joistXMm.some(x => x < 0 || x > b.widthX) || s.bearerEndXMm! <= s.bearerStartXMm! || s.joistEndYMm! <= s.joistStartYMm! || s.bearerStartXMm! > 0 || s.bearerEndXMm! < b.widthX || s.joistStartYMm! > 0 || s.joistEndYMm! < b.widthY) throw Error('Actual rectangular soffit coverage/member ends required');
    if (s.bearers.some(r => r.yMm < s.joistStartYMm! || r.yMm > s.joistEndYMm! || r.headsXMm.some(x => x < s.bearerStartXMm! || x > s.bearerEndXMm!))) throw Error('Candidate bearer/head station outside actual member');
    const line = (l: SoffitCoordinates, id: string) => {
      const j = l.joistXMm.findIndex((_, i) => id === `JOIST-${i + 1}`), bearer = l.bearers.find(b => b.id === id);
      return j >= 0 ? canonical({axis: 'Y', x: l.joistXMm[j], y0: l.joistStartYMm, y1: l.joistEndYMm}) : bearer ? canonical({axis: 'X', x0: l.bearerStartXMm, x1: l.bearerEndXMm, y: bearer.yMm}) : null;
    };
    if (m.soffitLayout?.loading?.memberActions.some(a => line(soffitCoordinates(m)!, a.targetMemberId) === null || line(soffitCoordinates(m)!, a.targetMemberId) !== line(s, a.targetMemberId))) throw Error('Direct member-bearing loads are locked to actual members; relocate/review them manually before a coordinate proposal');
    patch.soffitLayout = {...(m.soffitLayout ? clone(m.soffitLayout) : {schemaVersion: '1', stageId: p.binding.stageId, loadCaseId: p.binding.loadCaseId, ownershipId: '', evidenceRef: '', headNodeElevationMm: null, baseElevationMm: null,
      concreteStripStartYMm: null, deadStripStartYMm: null, liveStripStartYMm: null, joist: {E_MPa: null, I_mm4: null, selfWeightKNPerM: null, evidenceRef: ''}, bearer: {E_MPa: null, I_mm4: null, selfWeightKNPerM: null, evidenceRef: ''}}), ...clone(s)};
  }
  return patch;
}
function changes(m: WorkflowModel, p: LayoutCandidate): CandidateChange[] {
  const result: CandidateChange[] = [], add = (path: string, before: unknown, after: unknown) => {if (canonical(before) !== canonical(after)) result.push({path, before, after});};
  if (p.side) {
    for (const f of p.side.faces) {const old = sideCoordinates(m)?.faces.find(o => o.faceId === f.faceId); add(`SIDE/${f.faceId}/studPositionsMm`, old?.studPositionsMm ?? null, f.studPositionsMm); add(`SIDE/${f.faceId}/walers`, old?.walers ?? null, f.walers);}
    add('SIDE/tieRoutes', sideCoordinates(m)?.ties ?? null, p.side.ties);
  }
  if (p.soffit) for (const k of Object.keys(p.soffit) as (keyof SoffitCoordinates)[]) add(`SOFFIT/${k}`, soffitCoordinates(m)?.[k] ?? null, p.soffit[k]);
  return result;
}
export async function reviewLayoutCandidate(raw: WorkflowModel, request: CandidateRequest, candidate: unknown): Promise<CandidateReview> {
  const m = parseWorkflowModel(raw); validateBinding(request.binding); validateLayoutCandidate(candidate); const p = clone(candidate);
  if (canonical(p.binding) !== canonical(request.binding) || p.binding.engineVersion !== WORKFLOW_VERSION || p.binding.modelId !== m.id || p.binding.revisionId !== m.revisionId || p.binding.inputHash !== await digest(m)) throw Error('STALE_OR_MISMATCHED_LAYOUT_CANDIDATE_SOURCE; create a new request after source changes');
  sameStage(m, p.binding.stageId, p.binding.loadCaseId); geometryPatch(m, p);
  const diff = changes(m, p); if (!diff.length) throw Error('Candidate makes no coordinate changes');
  return {proposal: p, proposalHash: await digest(p), changes: diff, notices: [
    'DRAFT / NO_GO: source citations and rationale are unverified external claims, not design approval.',
    'Concrete geometry/topology, loads, products, material/section properties and design basis are preserved. New physical components retain unknown engineering properties.',
    'Human input review resets. All downstream results and coverage are invalidated; existing frame/assembly/support/case/Stage source data are retained as stale inputs.',
    'Actual tie fit/thread/body geometry, head/base datums, direct bearing, corners/contact, capacity and global checks still require explicit review.'
  ]};
}
export async function applyLayoutCandidate(raw: WorkflowModel, request: CandidateRequest, candidate: unknown, reviewedProposalHash: string, humanReviewedCoordinates: boolean): Promise<WorkflowModel> {
  const m = parseWorkflowModel(raw);
  if (humanReviewedCoordinates !== true) throw Error('Explicit human coordinate review required before applying an external proposal');
  const review = await reviewLayoutCandidate(m, request, candidate);
  if (review.proposalHash !== reviewedProposalHash) throw Error('Candidate changed after review; review the complete new diff');
  let next = regenerateDraftLayouts(m, {...geometryPatch(m, review.proposal), humanInputReviewed: false}, {allowIncomplete: true});
  // Keep downstream physical/audit data, but do not auto-rebase a previously authored
  // frame, assembly, combinations or applicability review onto AI-changed coordinates.
  for (const key of ['frameLayout', 'ringlockAssembly', 'supportLayout', 'loadCases', 'stageStudy', 'coverageReview'] as const) if (m[key] !== undefined) (next as unknown as Record<string, unknown>)[key] = clone(m[key]);
  next = {...next, layoutCandidate: {schemaVersion: 'local-layout-candidate-1', proposal: review.proposal, proposalHash: review.proposalHash, appliedRevision: next.revisionId}};
  return parseWorkflowModel(next);
}
