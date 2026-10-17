import {analyzeBeam, beamAt as beamAt2, type BeamAnalysis, type BeamInput} from './beam.js';
import {analyzeSidePressureDeck} from './sidePressure.js';
import {screenBeamMemberResistance} from './beamResistance.js';
import {canonical, finite, identifier, record, uniqueIds} from './common.js';
import {analyzeLinearFrame, assembleFrameStiffness, type FrameAction, type FrameVector, type LinearFrameInput} from './frameLinear.js';
import type {PhysicalFace} from './geometry.js';
export type {PhysicalFace};
import {sidePlywoodEvidenceReference, type analyzeSideLayout, type SideEndpoint, type SideLayoutDefinition} from './sideLayout.js';
import {screenTieAssembly} from './assemblies.js';
import {evaluateTieDossier, tieGeometryContext} from './tieDossier.js';
import type {Topology} from './geometry.js';
import {screenSideLocalChecks, SIDE_COUPLED_LIMIT_KINDS, validateSideLocalEvidence, type SideLocalDemand, type SideLocalEvidence} from './sideLocalChecks.js';

/** Waler-level support compatibility. Unknowns: outward displacement of every actual waler
 * support, of every stud-line/waler crossing, of rail ends joined by declared corner
 * connectors, and the axial end motions of rail groups (E·A/L when declared, else rigid).
 * Studs bring their own load and stiffness over the actual levels; ties are tension-only
 * E·A/L springs with optional slack or pretension; corner connectors are isotropic springs with
 * an optional slip gap; the frame enters through its exact linear flexibility at mapped nodes
 * (mixed formulation) plus its displacement under the other frame actions.
 */
/** pretensionN: initial clamping force; slackMm: take-up elongation before the tie engages.
 * The tie force is max(0, P0 + k·(e − s)); a pretensioned tie cannot also be slack. */
export interface SideCouplingTie {tieId: string; E_MPa: number | null; A_mm2: number | null; effectiveLengthMm: number | null; evidenceRef: string; pretensionN?: number | null; slackMm?: number | null}
/** slipGapMm: free relative movement (bolt-hole/seat clearance) before the connector bears. */
export interface SideCouplingCorner {id: string; faceAId: string; walerAId: string; faceBId: string; walerBId: string; stiffnessNPerMm: number | null; evidenceRef: string; slipGapMm?: number | null}
/** Total axial stiffness E·A (N) of one face/level rail group between its two corner points. */
export interface SideCouplingRailAxial {faceId: string; walerId: string; EA_N: number | null; evidenceRef: string}
export interface SideCouplingDefinition {
  schemaVersion: '1'; assumptionsEvidenceRef: string;
  ties: SideCouplingTie[]; corners: SideCouplingCorner[]; limits: SideLocalEvidence[];
  railAxial?: SideCouplingRailAxial[] | null;
}
export const emptySideCoupling = (): SideCouplingDefinition => ({schemaVersion: '1', assumptionsEvidenceRef: '', ties: [], corners: [], limits: []});
export const emptyCouplingTie = (tieId = ''): SideCouplingTie => ({tieId, E_MPa: null, A_mm2: null, effectiveLengthMm: null, evidenceRef: ''});
export const emptyCouplingCorner = (id: string): SideCouplingCorner => ({id, faceAId: '', walerAId: '', faceBId: '', walerBId: '', stiffnessNPerMm: null, evidenceRef: ''});
export const emptyCouplingRailAxial = (faceId = '', walerId = ''): SideCouplingRailAxial => ({faceId, walerId, EA_N: null, evidenceRef: ''});
/** Limits are bound to the declared tie, corner and rail-axial stiffness data (not to the limits themselves). */
export const sideCouplingReference = (c: Pick<SideCouplingDefinition, 'ties' | 'corners' | 'railAxial'>) =>
  canonical({role: 'SIDE_COUPLING', ties: c.ties, corners: c.corners, ...(c.railAxial?.length ? {railAxial: c.railAxial} : {})});

function text(v: unknown, label: string) {if (typeof v !== 'string' || v.length > 2000) throw Error(`Invalid coupling ${label}`);}
function exact(raw: unknown, keys: string[], label: string, optional: string[] = []) {
  const r = record(raw);
  if (keys.some(k => !Object.hasOwn(r, k)) || Object.keys(r).some(k => !keys.includes(k) && !optional.includes(k))) throw Error(`${label}: unknown/missing fields or authority metadata`);
  return r;
}
const optionalNonnegative = (v: unknown, label: string) => {if (v !== null && v !== undefined) finite(v, label, true);};
export function validateSideCoupling(raw: unknown): asserts raw is SideCouplingDefinition {
  const c = exact(raw, Object.keys(emptySideCoupling()), 'side coupling', ['railAxial']);
  if (c.schemaVersion !== '1' || !Array.isArray(c.ties) || c.ties.length > 1000 || !Array.isArray(c.corners) || c.corners.length > 200 || !Array.isArray(c.limits) || c.limits.length > SIDE_COUPLED_LIMIT_KINDS.length) throw Error('Invalid side coupling lists');
  text(c.assumptionsEvidenceRef, 'assumption evidence');
  for (const t of c.ties as SideCouplingTie[]) {
    exact(t, Object.keys(emptyCouplingTie()), 'coupling tie', ['pretensionN', 'slackMm']); text(t.tieId, 'tie id'); text(t.evidenceRef, 'tie evidence');
    for (const k of ['E_MPa', 'A_mm2', 'effectiveLengthMm'] as const) if (t[k] !== null) finite(t[k], `tie ${k}`);
    optionalNonnegative(t.pretensionN, 'tie pretension'); optionalNonnegative(t.slackMm, 'tie slack');
    if ((t.pretensionN ?? 0) > 0 && (t.slackMm ?? 0) > 0) throw Error(`${t.tieId}: a pretensioned tie cannot also have slack`);
  }
  uniqueIds((c.ties as SideCouplingTie[]).map(t => ({id: t.tieId})), 'coupling ties');
  for (const k of c.corners as SideCouplingCorner[]) {
    exact(k, Object.keys(emptyCouplingCorner('')), 'coupling corner', ['slipGapMm']);
    for (const f of ['id', 'faceAId', 'walerAId', 'faceBId', 'walerBId', 'evidenceRef'] as const) text(k[f], f);
    if (k.stiffnessNPerMm !== null) finite(k.stiffnessNPerMm, 'corner stiffness');
    optionalNonnegative(k.slipGapMm, 'corner slip gap');
  }
  uniqueIds(c.corners as SideCouplingCorner[], 'coupling corners');
  if (c.railAxial != null) {
    if (!Array.isArray(c.railAxial) || c.railAxial.length > 400) throw Error('Invalid rail axial stiffness list');
    for (const r of c.railAxial as SideCouplingRailAxial[]) {
      exact(r, Object.keys(emptyCouplingRailAxial()), 'rail axial stiffness');
      text(r.faceId, 'rail axial face'); text(r.walerId, 'rail axial waler'); text(r.evidenceRef, 'rail axial evidence');
      if (r.EA_N !== null) finite(r.EA_N, 'rail EA');
    }
    uniqueIds((c.railAxial as SideCouplingRailAxial[]).map(r => ({id: canonical([r.faceId, r.walerId])})), 'rail axial groups');
  }
  for (const l of c.limits as SideLocalEvidence[]) {
    validateSideLocalEvidence(l);
    if (l.kind !== null && !(SIDE_COUPLED_LIMIT_KINDS as readonly string[]).includes(l.kind)) throw Error('Coupling limits accept only corner connector, rail axial and tie axial kinds');
  }
  if (canonical(c).length > 500000) throw Error('Side coupling 500000-character limit');
}

type Side = ReturnType<typeof analyzeSideLayout>;
const key = (e: SideEndpoint) => canonical([e.faceId, e.walerId, e.supportId]);
const same = (p: {x: number; y: number}, q: {x: number; y: number}) => Math.hypot(p.x - q.x, p.y - q.y) <= 1e-6;

/** Pivoted dense elimination. Rank-deficient columns (rigid modes) are set to zero only when
 * every equation is still satisfied; otherwise the load is unbalanced on an unrestrained mode. */
function solveSystem(A0: number[][], b0: number[]) {
  // Diagonal equilibration so stiff rotational/frame terms do not hide soft support terms.
  const s = A0.map((r, i) => {const d = Math.abs(r[i]); return d > 0 && Number.isFinite(d) ? Math.sqrt(d) : Math.sqrt(Math.max(1e-30, ...r.map(Math.abs)));});
  const scaled = solveScaled(A0.map((r, i) => r.map((v, j) => v / s[i] / s[j])), b0.map((v, i) => v / s[i]));
  const x = scaled.x.map((v, i) => v / s[i]);
  const scale = Math.max(1, ...b0.map(Math.abs)) + Math.max(0, ...A0.map(r => r.reduce((t, v, j) => t + Math.abs(v * x[j]), 0)));
  const residual = Math.max(0, ...A0.map((r, i) => Math.abs(r.reduce((t, v, j) => t + v * x[j], 0) - b0[i])));
  if (x.some(v => !Number.isFinite(v)) || residual > scale * 1e-8) throw Error('COUPLED_SYSTEM_UNRESTRAINED_RIGID_MOTION_WITH_UNBALANCED_LOAD_OR_ILL_CONDITIONED');
  return {x, rankDeficiency: scaled.rankDeficiency};
}
function solveScaled(A: number[][], b: number[]) {
  const n = b.length, M = A.map((r, i) => [...r, b[i]]), cols = Array.from({length: n}, (_, i) => i);
  const norm = Math.max(1e-30, ...A.flatMap(r => r.map(Math.abs)));
  let rank = 0;
  for (; rank < n; rank++) {
    let pr = -1, pc = -1, best = 0;
    for (let i = rank; i < n; i++) for (let j = rank; j < n; j++) if (Math.abs(M[i][j]) > best) {best = Math.abs(M[i][j]); pr = i; pc = j;}
    if (best <= norm * 1e-11) break;
    [M[rank], M[pr]] = [M[pr], M[rank]];
    for (const row of M) [row[rank], row[pc]] = [row[pc], row[rank]];
    [cols[rank], cols[pc]] = [cols[pc], cols[rank]];
    for (let i = 0; i < n; i++) if (i !== rank) {
      const f = M[i][rank] / M[rank][rank];
      if (f !== 0) for (let j = rank; j <= n; j++) M[i][j] -= f * M[rank][j];
    }
  }
  const x = Array(n).fill(0) as number[];
  for (let i = 0; i < rank; i++) x[cols[i]] = M[i][n] / M[i][i];
  return {x, rankDeficiency: n - rank};
}
const beamAt = (input: BeamInput) => {
  try {return analyzeBeam(input);} catch (e) {throw Error(`${input.id}: ${(e as Error).message}`);}
};
const spanOf = (xs: number[], length: number) => {
  const s = [...new Set([0, length, ...xs])].sort((p, q) => p - q);
  return Math.max(...s.slice(1).map((x, i) => x - s[i]));
};

export function analyzeCoupledSideSupports(input: {
  side: Side; coupling: SideCouplingDefinition;
  /** Authored layout and topology let tie product screens use the coupled tie force. */
  layout?: SideLayoutDefinition; topology?: Topology; actionBasis: 'SERVICE' | 'FACTORED';
  frame: LinearFrameInput; mappings: {faceId: string; walerId: string; supportId: string; frameNodeId: string; connectionEvidenceRef: string}[];
  context: {revisionId: string; stageId: string; loadCaseId: string; evidenceRef: string};
}) {
  const {side, coupling, frame} = input;
  validateSideCoupling(coupling);
  identifier(coupling.assumptionsEvidenceRef, 'coupled model assumption evidence');
  const blockers = ['COUPLED_PLYWOOD_TO_STUD_TRANSFER_REMAINS_RIGID_SUPPORT_ONE_WAY',
    'COUPLED_STUD_WALER_CONTACT_IS_A_POINT_AT_THE_STUD_LINE_AND_PAIRED_RAILS_SHARE_CROSSING_AND_END_DISPLACEMENT',
    'COUPLED_TIE_SLACK_PRETENSION_AND_CORNER_GAP_ARE_USER_DECLARED_NO_FRICTION_SLIP_LOAD_CREEP_OR_CONNECTOR_ROTATION',
    'SIDE_LAYOUT_TIE_PRODUCT_SCREENS_USE_RIGID_DEMANDS_COUPLED_TIE_PRODUCT_SCREENS_GOVERN',
    'SIDE_SYSTEM_STABILITY_ONLY_THROUGH_FRAME_LATERAL_CASE_AND_SECOND_ORDER'];
  type Station = {id: string; xMm: number; dof: number; kind: 'SUPPORT' | 'END' | 'CROSSING'};
  type Group = {id: string; faceId: string; walerId: string; level: number; zMm: number; face: PhysicalFace; rails: BeamAnalysis[]; declaredShares: number[];
    supports: {id: string; xMm: number; dof: number}[]; ends: {A: number | null; B: number | null}; stations: Station[];
    axialA: number | null; axialB: number | null; axialStiffness: number | null};
  const groups: Group[] = [];
  let dofs = 0;
  const nodeDof = new Map<string, number>();
  for (const f of side.faces) {
    const levels = [...f.input.walers].sort((a, b) => a.zMm - b.zMm);
    f.result.walers.forEach((w, level) => {
      const walerId = levels[level].id;
      if (w.rails.some(r => r.input.patches.length)) throw Error('COUPLED_RAIL_DISTRIBUTED_LOADS_UNSUPPORTED');
      const supports = levels[level].supports.map(s => {
        const k = key({faceId: f.face.id, walerId, supportId: s.id});
        if (!nodeDof.has(k)) nodeDof.set(k, dofs++);
        return {id: s.id, xMm: s.xMm, dof: nodeDof.get(k)!};
      });
      if (supports.some(s => s.id.startsWith('CORNER-') || s.id.startsWith('STUD:'))) throw Error('Support ids starting with CORNER- or STUD: are reserved for coupled stations');
      groups.push({id: `${f.face.id}:${walerId}`, faceId: f.face.id, walerId, level, zMm: w.zMm, face: f.face, rails: w.rails, declaredShares: w.railDefinitions.map(r => r.share),
        supports, ends: {A: null, B: null}, stations: [], axialA: null, axialB: null, axialStiffness: null});
    });
  }
  // Corner connectors at actual shared polygon vertices and equal waler heights.
  const corners = coupling.corners.map(c => {
    const ga = groups.find(g => g.faceId === c.faceAId && g.walerId === c.walerAId), gb = groups.find(g => g.faceId === c.faceBId && g.walerId === c.walerBId);
    if (!ga || !gb || ga === gb) throw Error(`${c.id}: corner must join two actual rail groups`);
    identifier(c.evidenceRef, `${c.id} connector evidence`);
    const k = finite(c.stiffnessNPerMm, `${c.id} corner connector stiffness`), gap = c.slipGapMm ?? 0;
    if (Math.abs(ga.zMm - gb.zMm) > 1e-7) throw Error(`${c.id}: corner rails must be at the same height`);
    const vertex = [ga.face.a, ga.face.b].find(p => same(p, gb.face.a) || same(p, gb.face.b));
    if (!vertex) throw Error(`${c.id}: faces do not share an actual corner vertex`);
    const endOf = (g: Group) => {
      const end = same(vertex, g.face.a) ? 'A' as const : 'B' as const, x = end === 'A' ? 0 : g.face.lengthMm;
      if (g.supports.some(s => Math.abs(s.xMm - x) < 1e-7)) throw Error(`${c.id}: waler support at the corner end is unsupported in the coupled model`);
      if (g.ends[end] !== null) throw Error(`${c.id}: rail end already has a corner connector`);
      g.ends[end] = dofs++;
      return end;
    };
    return {definition: c, k, gap, a: {group: ga, end: endOf(ga)}, b: {group: gb, end: endOf(gb)}, point: vertex};
  });
  // Rail axial motion: two ends joined by the declared E·A/L, otherwise one rigid motion.
  for (const g of groups) {
    if (g.ends.A === null && g.ends.B === null) continue;
    const declared = coupling.railAxial?.find(r => r.faceId === g.faceId && r.walerId === g.walerId);
    if (g.ends.A !== null && g.ends.B !== null && declared) {
      identifier(declared.evidenceRef, `${g.id} rail axial stiffness evidence`);
      g.axialStiffness = finite(declared.EA_N, `${g.id} rail EA`) / g.face.lengthMm; g.axialA = dofs++; g.axialB = dofs++;
    } else {
      g.axialA = g.axialB = dofs++;
      if (g.ends.A !== null && g.ends.B !== null) blockers.push(`${g.id}:RAIL_AXIAL_TREATED_RIGID_NO_DECLARED_EA`);
    }
  }
  for (const r of coupling.railAxial ?? []) {
    const g = groups.find(g => g.faceId === r.faceId && g.walerId === r.walerId);
    if (!g || g.ends.A === null || g.ends.B === null) throw Error(`${r.faceId}/${r.walerId}: rail axial stiffness needs corner connectors at both rail ends`);
  }
  // Stud crossings: each actual stud line on each level shares one displacement with the rails.
  const studCrossings = new Map<string, number[]>();
  for (const g of groups) {
    g.stations = [...g.supports.map(s => ({...s, kind: 'SUPPORT' as const})),
      ...(g.ends.A !== null ? [{id: 'CORNER-A', xMm: 0, dof: g.ends.A, kind: 'END' as const}] : []),
      ...(g.ends.B !== null ? [{id: 'CORNER-B', xMm: g.face.lengthMm, dof: g.ends.B, kind: 'END' as const}] : [])];
  }
  for (const f of side.faces) f.result.studs.forEach((s, i) => {
    const row = groups.filter(g => g.faceId === f.face.id).sort((a, b) => a.level - b.level).map(g => {
      const existing = g.stations.find(st => Math.abs(st.xMm - s.xMm) < 1e-7);
      if (existing) return existing.dof;
      const dof = dofs++; g.stations.push({id: `STUD:${i + 1}`, xMm: s.xMm, dof, kind: 'CROSSING'}); return dof;
    });
    studCrossings.set(s.analysis.id, row);
  });
  // Tie stiffness for every actual tie route; normal to both faces and collinear.
  const tieRows = side.ties.map(t => {
    const d = coupling.ties.find(r => r.tieId === t.id);
    if (!d) throw Error(`${t.id}: coupled tie stiffness definition required`);
    identifier(d.evidenceRef, `${t.id} tie stiffness evidence`);
    const L = Math.hypot(t.b.point.xMm - t.a.point.xMm, t.b.point.yMm - t.a.point.yMm), Le = finite(d.effectiveLengthMm, `${t.id} effective length`);
    if (Le < L * (1 - 1e-9)) throw Error(`${t.id}: effective tie length shorter than the actual route`);
    const axis = {x: (t.b.point.xMm - t.a.point.xMm) / L, y: (t.b.point.yMm - t.a.point.yMm) / L};
    if (Math.abs(t.a.normal.x + axis.x) > 1e-9 || Math.abs(t.a.normal.y + axis.y) > 1e-9 || Math.abs(t.b.normal.x - axis.x) > 1e-9 || Math.abs(t.b.normal.y - axis.y) > 1e-9) throw Error(`${t.id}: coupled tie must be normal to both faces`);
    return {tie: t, k: finite(d.E_MPa, `${t.id} E`) * finite(d.A_mm2, `${t.id} A`) / Le, a: nodeDof.get(t.a.id)!, b: nodeDof.get(t.b.id)!, lengthMm: Le,
      pretensionN: d.pretensionN ?? 0, slackMm: d.slackMm ?? 0};
  });
  if (coupling.ties.some(d => !side.ties.some(t => t.id === d.tieId))) throw Error('Unused/stale coupled tie definition');
  // Frame flexibility at mapped nodes along the face normal.
  const tied = new Set(side.ties.flatMap(t => [t.a.id, t.b.id]));
  const framed = input.mappings.map(m => {
    const k = key(m), node = side.nodes.find(n => n.id === k), fn = frame.nodes.findIndex(n => n.id === m.frameNodeId);
    if (!node || fn < 0) throw Error('Coupled mapping requires an actual side support and frame node');
    if (tied.has(k)) throw Error('TIED_SUPPORT_CANNOT_ALSO_BE_MAPPED_TO_FRAME');
    if (!m.connectionEvidenceRef.trim()) throw Error('Actual waler-to-frame connection evidence required');
    const p = frame.nodes[fn].pointMm;
    if (Math.hypot(p[0] - node.point.xMm, p[1] - node.point.yMm, p[2] - node.point.zMm) > 1e-7) throw Error('COUPLED_MODE_REQUIRES_FRAME_NODE_AT_ACTUAL_SUPPORT_POINT');
    return {mapping: m, node, frameIndex: fn, dof: nodeDof.get(k)!, force: dofs++};
  });
  if (new Set(framed.map(f => f.mapping.frameNodeId)).size !== framed.length) throw Error('DISTINCT_SIDE_SUPPORT_POINTS_REQUIRE_DISTINCT_FRAME_NODES');
  for (const n of side.nodes) if (!tied.has(n.id) && !framed.some(f => f.node.id === n.id)) blockers.push(`${n.faceId}/${n.walerId}/${n.supportId}:DECLARED_SUPPORT_HAS_NO_TIE_OR_FRAME_RESTRAINT_IN_COUPLED_MODEL`);
  if (dofs > 600) throw Error('COUPLED_SIDE_MODEL_EXCEEDS_600_UNKNOWNS; no support omitted');
  const base = analyzeLinearFrame(frame);
  const flex: number[][] = framed.map(() => framed.map(() => 0)), u0 = framed.map(f => {
    const d = base.nodes[f.frameIndex].displacementMm; return d[0] * f.node.normal.x + d[1] * f.node.normal.y;
  });
  if (framed.length) {
    const {K, count} = assembleFrameStiffness(frame), boundary = frame.nodes.flatMap(n => n.boundary);
    const free = Array.from({length: count}, (_, i) => i).filter(i => boundary[i] === 'FREE' && K[i].some(v => v !== 0));
    const index = new Map(free.map((d, i) => [d, i]));
    const Kff = free.map(i => free.map(j => K[i][j]));
    framed.forEach((load, j) => {
      const rhs = free.map(() => 0);
      for (const [d, v] of [[6 * load.frameIndex, load.node.normal.x], [6 * load.frameIndex + 1, load.node.normal.y]] as const) {
        if (!index.has(d)) {if (v !== 0) throw Error('COUPLED_FRAME_NODE_NORMAL_DOF_IS_RESTRAINED_OR_UNUSED'); continue;}
        rhs[index.get(d)!] = v;
      }
      const x = solveSystem(Kff, rhs).x;
      framed.forEach((at, i) => {
        const dx = index.has(6 * at.frameIndex) ? x[index.get(6 * at.frameIndex)!] : 0, dy = index.has(6 * at.frameIndex + 1) ? x[index.get(6 * at.frameIndex + 1)!] : 0;
        flex[i][j] = dx * at.node.normal.x + dy * at.node.normal.y;
      });
    });
  }
  // Member stiffness from unit station movements. Rails carry no direct load; every stud
  // brings its own plywood/pressure load and stiffness over its actual waler levels.
  const strip = (r: BeamAnalysis, loads = true): BeamInput => ({id: r.input.id, revision: r.input.revision, lengthMm: r.input.lengthMm, E_MPa: r.input.E_MPa, I_mm4: r.input.I_mm4,
    supports: [], points: loads ? r.input.points : [], patches: loads ? r.input.patches : []});
  const K0 = Array.from({length: dofs}, () => Array(dofs).fill(0) as number[]), d0 = Array(dofs).fill(0) as number[];
  for (const g of groups) for (const r of g.rails) g.stations.forEach(sj => {
    const unit = beamAt({...strip(r, false), supports: g.stations.map(s => ({id: s.id, xMm: s.xMm, displacementMm: s === sj ? 1 : 0}))});
    g.stations.forEach(si => {K0[si.dof][sj.dof] += unit.reactions.find(q => q.supportId === si.id)!.forceN;});
  });
  const studs = side.faces.flatMap(f => f.result.studs.map(s => ({faceId: f.face.id, analysis: s.analysis, dofs: studCrossings.get(s.analysis.id)!})));
  // Stud loads are the plywood strip reactions; for continuous sheets they depend on stud movement and are iterated below.
  const studPatches = new Map(studs.map(s => [s.analysis.id, s.analysis.input.patches]));
  const studLoads = () => {
    const d = [...d0];
    for (const s of studs) {
      const levels = s.analysis.input.supports;
      const loaded = beamAt({...strip(s.analysis, false), patches: studPatches.get(s.analysis.id)!, supports: levels.map(l => ({id: l.id, xMm: l.xMm}))});
      levels.forEach((l, j) => {d[s.dofs[j]] -= loaded.reactions.find(q => q.supportId === l.id)!.forceN;});
    }
    return d;
  };
  for (const s of studs) {
    const levels = s.analysis.input.supports;
    if (levels.length !== s.dofs.length) throw Error(`${s.analysis.id}: stud levels do not match the actual waler levels`);
    levels.forEach((lj, j) => {
      const unit = beamAt({...strip(s.analysis, false), supports: levels.map(l => ({id: l.id, xMm: l.xMm, displacementMm: l === lj ? 1 : 0}))});
      levels.forEach((li, i) => {K0[s.dofs[i]][s.dofs[j]] += unit.reactions.find(q => q.supportId === li.id)!.forceN;});
    });
  }
  // Corner kinematics: rail end displacement D = e·n + w·t (w of the rail end at that vertex).
  const tangent = (f: PhysicalFace) => ({x: (f.b.x - f.a.x) / f.lengthMm, y: (f.b.y - f.a.y) / f.lengthMm});
  const cornerMap = corners.map(c => {
    const gen = (s: {group: Group; end: 'A' | 'B'}) => {
      const t = tangent(s.group.face);
      return {dofs: [s.group.ends[s.end]!, s.end === 'A' ? s.group.axialA! : s.group.axialB!], map: [[s.group.face.normal.x, t.x], [s.group.face.normal.y, t.y]]};
    };
    const A = gen(c.a), B = gen(c.b);
    return {ids: [...A.dofs, ...B.dofs], M: [[A.map[0][0], A.map[0][1], -B.map[0][0], -B.map[0][1]], [A.map[1][0], A.map[1][1], -B.map[1][0], -B.map[1][1]]]};
  });
  for (const g of groups) if (g.axialStiffness !== null) for (const [p, q, v] of [[g.axialA!, g.axialA!, 1], [g.axialB!, g.axialB!, 1], [g.axialA!, g.axialB!, -1], [g.axialB!, g.axialA!, -1]] as const) K0[p][q] += v * g.axialStiffness;
  // Piecewise-linear state: tension-only ties with slack/pretension and gapped corner connectors.
  const delta = (i: number, x: number[]) => {const {ids, M} = cornerMap[i]; return [0, 1].map(r => ids.reduce((s, d, j) => s + M[r][j] * x[d], 0));};
  let tieActive = tieRows.map(() => true), cornerActive = corners.map(() => true), cornerDir: ({x: number; y: number} | null)[] = corners.map(() => null);
  let solution: number[] = [], rankDeficiency = 0, iterations = 0;
  function solveState() {
  let converged = false; iterations = 0;
  const dLoad = studLoads();
  for (; iterations < 80; iterations++) {
    const A = K0.map(r => [...r]), b = [...dLoad];
    tieRows.forEach((t, i) => {
      if (!tieActive[i]) return;
      for (const p of [t.a, t.b]) {for (const q of [t.a, t.b]) A[p][q] += t.k; b[p] -= t.pretensionN - t.k * t.slackMm;}
    });
    corners.forEach((c, i) => {
      if (!cornerActive[i]) return;
      const {ids, M} = cornerMap[i];
      ids.forEach((p, a) => ids.forEach((q, z) => {A[p][q] += c.k * (M[0][a] * M[0][z] + M[1][a] * M[1][z]);}));
      const n = cornerDir[i];
      if (c.gap > 0 && n) ids.forEach((p, a) => {b[p] += c.k * c.gap * (M[0][a] * n.x + M[1][a] * n.y);});
    });
    framed.forEach((f, i) => {
      A[f.dof][f.force] += 1;
      A[f.force][f.dof] = 1; framed.forEach((g, j) => {A[f.force][g.force] -= flex[i][j];}); b[f.force] = u0[i];
    });
    const solved = solveSystem(A, b); solution = solved.x; rankDeficiency = solved.rankDeficiency;
    const nextTies = tieRows.map(t => t.pretensionN + t.k * (solution[t.a] + solution[t.b] - t.slackMm) > -1e-9 * Math.max(1, t.k));
    let directionsSettled = true;
    const nextCorners = corners.map((c, i) => {
      const [dx, dy] = delta(i, solution), mag = Math.hypot(dx, dy);
      if (c.gap === 0) return true;
      const dir = mag > 0 ? {x: dx / mag, y: dy / mag} : null, prev = cornerDir[i];
      if (mag > c.gap && (!prev || !dir || Math.hypot(dir.x - prev.x, dir.y - prev.y) > 1e-9)) directionsSettled = false;
      cornerDir[i] = dir;
      return mag > c.gap * (1 + 1e-12);
    });
    if (directionsSettled && nextTies.every((v, i) => v === tieActive[i]) && nextCorners.every((v, i) => v === cornerActive[i])) {converged = true; break;}
    tieActive = nextTies; cornerActive = nextCorners;
  }
  if (!converged) throw Error('COUPLED_TIE_OR_CORNER_GAP_STATE_DID_NOT_CONVERGE');
  }
  const studAnalysisAt = (s: typeof studs[number], x: number[]) => beamAt({...s.analysis.input, patches: studPatches.get(s.analysis.id)!, id: `${s.analysis.id}:COUPLED`, supports: s.analysis.input.supports.map((l, j) => ({...l, displacementMm: x[s.dofs[j]]}))});
  const displacementAt = (a: BeamAnalysis, z: number) => {
    const seg = a.segments.find((sg, i) => z >= sg.startMm - 1e-9 && (i === a.segments.length - 1 || z < a.segments[i + 1].startMm)) ?? a.segments.at(-1)!;
    return beamAt2(seg, z - seg.startMm).deflectionMm;
  };
  // Plywood ↔ stud compatibility: faces whose continuous sheet strips are statically indeterminate
  // get their strip reactions re-evaluated with the studs' displacement at each zone boundary
  // (affine between boundaries, as in the rigid deck) until the stud loads stop changing.
  const coupledFaces = side.faces.filter(f => f.result.pressureDeck && f.result.pressureDeck.segments.some(sg => sg.studsMm.length > 2));
  const plywoodFaces: {faceId: string; panels: ReturnType<typeof analyzeSidePressureDeck>['panels']; deck: ReturnType<typeof analyzeSidePressureDeck>}[] = [];
  let plywoodIterations = 0, plywoodMaxChangeNPerMm = 0;
  solveState();
  if (coupledFaces.length) {
    const relax = 0.7;
    let settled = false;
    for (; plywoodIterations < 60 && !settled; plywoodIterations++) {
      settled = true; plywoodMaxChangeNPerMm = 0; plywoodFaces.length = 0;
      for (const f of coupledFaces) {
        const faceStuds = studs.filter(s => s.faceId === f.face.id).sort((a, b) => f.result.studs.findIndex(x => x.analysis.id === a.analysis.id) - f.result.studs.findIndex(x => x.analysis.id === b.analysis.id));
        const analyses = faceStuds.map(s => studAnalysisAt(s, solution)), deck0 = f.result.pressureDeck!;
        const deck = analyzeSidePressureDeck({faceId: f.face.id, revision: f.result.studs[0].analysis.input.revision, lengthMm: f.face.lengthMm, heightMm: f.result.studs[0].analysis.input.lengthMm,
          studsMm: f.result.studs.map(s => s.xMm), E_MPa: f.elasticInputs.plywood.E_MPa, I_mm4: f.elasticInputs.plywood.I_mm4, patches: deck0.patches,
          sheetJointsMm: f.input.plywood.jointsAtEveryStud === false ? f.input.plywood.sheetJointsMm ?? null : null, studDisplacementMm: (index, z) => displacementAt(analyses[index], z)});
        plywoodFaces.push({faceId: f.face.id, panels: deck.panels, deck});
        faceStuds.forEach((s, i) => {
          const old = studPatches.get(s.analysis.id)!, fresh = deck.studPatches[i];
          if (old.length !== fresh.length) throw Error('COUPLED_PLYWOOD_ZONE_MISMATCH');
          const next = fresh.map((p, k) => ({...p, startNPerMm: old[k].startNPerMm + relax * (p.startNPerMm - old[k].startNPerMm), endNPerMm: old[k].endNPerMm + relax * (p.endNPerMm - old[k].endNPerMm)}));
          const change = Math.max(0, ...fresh.map((p, k) => Math.max(Math.abs(p.startNPerMm - old[k].startNPerMm), Math.abs(p.endNPerMm - old[k].endNPerMm))));
          const scale = Math.max(1e-9, ...fresh.map(p => Math.max(Math.abs(p.startNPerMm), Math.abs(p.endNPerMm))));
          plywoodMaxChangeNPerMm = Math.max(plywoodMaxChangeNPerMm, change);
          if (change > 1e-9 * scale) settled = false;
          studPatches.set(s.analysis.id, next);
        });
      }
      if (!settled) solveState();
    }
    if (!settled) throw Error('COUPLED_PLYWOOD_STUD_COMPATIBILITY_DID_NOT_CONVERGE');
    blockers.push('COUPLED_PLYWOOD_STUD_COMPATIBILITY_EVALUATED_AT_PRESSURE_ZONE_BOUNDARIES_AFFINE_BETWEEN');
    // A negative strip reaction means the sheet pulls on the stud through its fasteners.
    for (const s of studs) if (studPatches.get(s.analysis.id)!.some(p => Math.min(p.startNPerMm, p.endNPerMm) < -1e-9)) blockers.push(`${s.analysis.id}:PLYWOOD_LIFTS_OFF_STUD_FASTENER_TENSION_REQUIRED`);
  } else blockers.push('PLYWOOD_STRIPS_SIMPLY_SPANNING_OR_NO_PRESSURE_DECK_STUD_MOVEMENT_CANNOT_CHANGE_STRIP_REACTIONS');
  if (rankDeficiency) blockers.push(`COUPLED_MODEL_HAS_${rankDeficiency}_UNRESTRAINED_RIGID_MODES_SELF_EQUILIBRATED_LOAD_ONLY`);
  // Member responses at the compatible displacements. Rail resistance scope uses actual supports
  // and corner points only; stud-line contact stations are load points, not supports.
  const reactionSum = Array(dofs).fill(0) as number[];
  const railAnalyses = groups.flatMap(g => g.rails.map(r => {
    const a = beamAt({...strip(r, false), id: `${r.id}:COUPLED`, supports: g.stations.map(s => ({id: s.id, xMm: s.xMm, displacementMm: solution[s.dof]}))});
    g.stations.forEach(s => {reactionSum[s.dof] += a.reactions.find(q => q.supportId === s.id)!.forceN;});
    const resistanceScreen = screenBeamMemberResistance({evidence: r.input.resistanceEvidence ?? [], actionBasis: r.input.actionBasis, memberEvidenceRef: r.input.memberEvidenceRef,
      maximumUnsupportedSpanMm: spanOf(g.stations.filter(s => s.kind !== 'CROSSING').map(s => s.xMm), g.face.lengthMm),
      demands: {FLEXURE: a.maxMomentNmm, SHEAR: a.maxShearN, DEFLECTION: a.maxDeflectionMm}});
    return {...a, resistanceScreen, groupId: g.id};
  }));
  const studAnalyses = studs.map(s => {
    const a = studAnalysisAt(s, solution);
    s.analysis.input.supports.forEach((l, j) => {reactionSum[s.dofs[j]] += a.reactions.find(q => q.supportId === l.id)!.forceN;});
    return {...a, faceId: s.faceId, levelDofs: s.dofs};
  });
  const crossings = studAnalyses.flatMap(a => a.input.supports.map((l, j) => {
    const onRail = -a.reactions.find(q => q.supportId === l.id)!.forceN;
    return {studId: a.id.replace(/:COUPLED$/, ''), faceId: a.faceId, level: j, displacementMm: solution[a.levelDofs[j]], forceOnRailsN: onRail};
  }));
  const forceScale = Math.max(1, ...crossings.map(c => Math.abs(c.forceOnRailsN)));
  for (const c of crossings) if (c.forceOnRailsN < -forceScale * 1e-9) blockers.push(`${c.studId}:LEVEL:${c.level}:STUD_WALER_CONTACT_LOSS_TENSION_NOT_TRANSFERRED`);
  for (const g of groups) for (const s of g.stations.filter(s => s.kind === 'CROSSING')) {
    if (Math.abs(reactionSum[s.dof]) > forceScale * 1e-6) throw Error(`${g.id}/${s.id}:COUPLED_STUD_RAIL_CONTACT_EQUILIBRIUM_FAILED`);
  }
  // Paired rails: the share now follows contact compatibility, not the declared split.
  const railShares = groups.filter(g => g.rails.length === 2).map(g => {
    const rows = railAnalyses.filter(a => a.groupId === g.id), crossingsOnly = g.stations.filter(s => s.kind === 'CROSSING');
    const shares = crossingsOnly.map(s => {
      const f = rows.map(a => a.reactions.find(q => q.supportId === s.id)!.forceN), total = f[0] + f[1];
      return Math.abs(total) > forceScale * 1e-9 ? f[0] / total : null;
    }).filter((v): v is number => v !== null);
    const maxDeviation = shares.length ? Math.max(...shares.map(v => Math.abs(v - g.declaredShares[0]))) : 0;
    if (maxDeviation > 1e-3) blockers.push(`${g.id}:RAIL_SHARE_SET_BY_STUD_CONTACT_COMPATIBILITY_NOT_DECLARED_SHARE`);
    return {groupId: g.id, declaredRail1Share: g.declaredShares[0], compatibleRail1Shares: shares, maxDeviation};
  });
  const ties = tieRows.map((t, i) => {
    const e = solution[t.a] + solution[t.b];
    return {id: t.tie.id, stiffnessNPerMm: t.k, effectiveLengthMm: t.lengthMm, pretensionN: t.pretensionN, slackMm: t.slackMm, elongationMm: e,
      forceN: tieActive[i] ? t.pretensionN + t.k * (e - t.slackMm) : 0, slack: !tieActive[i], rigidSupportForcesN: [t.tie.a.forceN, t.tie.b.forceN] as [number, number]};
  });
  for (const t of ties) if (t.slack) blockers.push(`${t.id}:TIE_SLACK_IN_COUPLED_SOLUTION_NO_FORCE_TRANSFERRED`);
  // Re-run each authored tie product screen with the single coupled tie force (kN, same basis).
  const demandBasis = input.actionBasis === 'FACTORED' ? 'DESIGN' as const : 'ALLOWABLE' as const;
  const tieProducts = ties.map(t => {
    const def = input.layout?.ties.find(d => d.id === t.id), demandKN = t.forceN / 1000;
    const assembly = def?.assembly ? screenTieAssembly({...def.assembly, demandKN, demandBasis}) : null;
    const dossier = def?.dossier && input.layout && input.topology ? evaluateTieDossier(def.dossier, tieGeometryContext(input.topology, input.layout, def), demandKN, demandBasis) : null;
    if (!assembly && !dossier) blockers.push(`${t.id}:COUPLED_TIE_FORCE_HAS_NO_AUTHORED_PRODUCT_ASSEMBLY_OR_DOSSIER`);
    blockers.push(...(assembly?.blockers ?? []).map(b => `${t.id}:COUPLED:${b}`), ...(dossier?.blockers ?? []).map(b => `${t.id}:COUPLED:${b}`));
    return {id: t.id, demandKN, demandBasis, assembly, dossier,
      status: assembly?.status === 'FAIL' || dossier?.status === 'FAIL' ? 'FAIL' as const : 'BLOCKED' as const};
  });
  const tieProductFail = tieProducts.some(p => p.status === 'FAIL');
  if (tieProductFail) blockers.push('COUPLED_TIE_PRODUCT_SCREEN_EXCEEDED');
  const frameForces = framed.map(f => ({...f, forceN: solution[f.force]}));
  const supports = groups.flatMap(g => g.supports.map(s => {
    const k = key({faceId: g.faceId, walerId: g.walerId, supportId: s.id}), node = side.nodes.find(n => n.id === k)!;
    const tieForce = ties.filter((t, i) => tieRows[i].a === s.dof || tieRows[i].b === s.dof).reduce((sum, t) => sum + t.forceN, 0);
    const frameForce = frameForces.find(f => f.dof === s.dof)?.forceN ?? 0, demandN = -reactionSum[s.dof];
    return {id: k, faceId: g.faceId, walerId: g.walerId, supportId: s.id, point: node.point, displacementMm: solution[s.dof], demandN, tieForceN: tieForce, frameForceN: frameForce,
      rigidDemandN: node.forceN, residualN: demandN - tieForce - frameForce};
  }));
  const cornerRows = corners.map((c, i) => {
    const [dx, dy] = delta(i, solution), mag = Math.hypot(dx, dy), engaged = cornerActive[i] && mag > 0;
    const scaleF = engaged ? -c.k * (mag - c.gap) / mag : 0;
    // Restoring connector force applied ON rail A (equal and opposite on rail B at the same vertex).
    const force = {x: scaleF * dx, y: scaleF * dy};
    return {id: c.definition.id, faceAId: c.a.group.faceId, faceBId: c.b.group.faceId, walerAId: c.a.group.walerId, walerBId: c.b.group.walerId, point: c.point,
      stiffnessNPerMm: c.k, slipGapMm: c.gap, engaged, relativeDisplacementMm: mag, forceOnFaceAN: force, connectorForceN: Math.hypot(force.x, force.y)};
  });
  const railAxial = groups.filter(g => g.axialA !== null).map(g => {
    const t = tangent(g.face);
    const at = (end: 'A' | 'B') => cornerRows.find((c, i) => (corners[i].a.group === g && corners[i].a.end === end) || (corners[i].b.group === g && corners[i].b.end === end));
    const onRail = (row: typeof cornerRows[number] | undefined) => {
      if (!row) return 0; const sign = row.faceAId === g.faceId && row.walerAId === g.walerId ? 1 : -1;
      return sign * (row.forceOnFaceAN.x * t.x + row.forceOnFaceAN.y * t.y);
    };
    // Tension positive; with declared E·A this equals k·(wB − wA).
    const axialForceN = (onRail(at('B')) - onRail(at('A'))) / 2;
    return {groupId: g.id, faceId: g.faceId, walerId: g.walerId, axialForceN, endBalanceN: onRail(at('A')) + onRail(at('B')),
      axialStiffnessNPerMm: g.axialStiffness, elongationMm: g.axialStiffness === null ? 0 : solution[g.axialB!] - solution[g.axialA!],
      maximumUnsupportedSpanMm: spanOf(g.stations.filter(s => s.kind !== 'CROSSING').map(s => s.xMm), g.face.lengthMm)};
  });
  for (const r of railAxial) if (r.axialStiffnessNPerMm !== null && Math.abs(r.axialStiffnessNPerMm * r.elongationMm - r.axialForceN) > Math.max(1, Math.abs(r.axialForceN)) * 1e-6) throw Error(`${r.groupId}:COUPLED_RAIL_AXIAL_COMPATIBILITY_FAILED`);
  // Global closure: face pressure resultant equals frame-carried force; ties and corners are internal.
  const origin: FrameVector = [side.nodes[0].point.xMm, side.nodes[0].point.yMm, side.nodes[0].point.zMm];
  const pressureForceN: FrameVector = [0, 0, 0], pressureMomentNmm: FrameVector = [0, 0, 0], frameForceN: FrameVector = [0, 0, 0], frameMomentNmm: FrameVector = [0, 0, 0];
  const cross = (a: FrameVector, b: FrameVector): FrameVector => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  let scale = 1, momentScale = 1;
  for (const f of side.faces) {
    const p = f.pressureAction, v: FrameVector = [p.forceN * p.normal.x, p.forceN * p.normal.y, 0];
    const m = p.centroid ? cross([p.centroid.x - origin[0], p.centroid.y - origin[1], p.centroid.zMm - origin[2]], v) : [0, 0, 0];
    for (let d = 0; d < 3; d++) {pressureForceN[d] += v[d]; pressureMomentNmm[d] += m[d];}
    scale += Math.hypot(...v); momentScale += Math.hypot(...m);
  }
  const actions: FrameAction[] = frameForces.map((f, i) => {
    const v: FrameVector = [f.forceN * f.node.normal.x, f.forceN * f.node.normal.y, 0], m = cross([f.node.point.xMm - origin[0], f.node.point.yMm - origin[1], f.node.point.zMm - origin[2]], v);
    for (let d = 0; d < 3; d++) {frameForceN[d] += v[d]; frameMomentNmm[d] += m[d];}
    return {id: `SIDE-COUPLED:${i + 1}`, nodeId: f.mapping.frameNodeId, ...input.context, evidenceRef: f.mapping.connectionEvidenceRef, forceN: v, momentNmm: [0, 0, 0], application: 'AT_NODE'};
  });
  const forceResidualN = pressureForceN.map((v, d) => frameForceN[d] - v) as FrameVector, momentResidualNmm = pressureMomentNmm.map((v, d) => frameMomentNmm[d] - v) as FrameVector;
  const maxSupportResidual = Math.max(0, ...supports.map(s => Math.abs(s.residualN)));
  if (maxSupportResidual > scale * 1e-6 || Math.hypot(...forceResidualN) > scale * 1e-6 || Math.hypot(...momentResidualNmm) > momentScale * 1e-6) throw Error('COUPLED_SIDE_SUPPORT_EQUILIBRIUM_FAILED');
  // Reviewer limits for connector, rail axial and tie forces bound to the declared stiffness data.
  const demands: SideLocalDemand[] = [
    ...cornerRows.map(c => ({kind: 'CORNER_CONNECTOR' as const, id: c.id, memberId: c.id, demand: c.connectorForceN, lengthMm: null, issue: null})),
    ...railAxial.map(r => ({kind: 'RAIL_AXIAL' as const, id: `${r.groupId}:AXIAL`, memberId: r.groupId, demand: Math.abs(r.axialForceN), lengthMm: r.axialForceN < 0 ? r.maximumUnsupportedSpanMm : null,
      issue: Math.abs(r.endBalanceN) > Math.max(1, Math.abs(r.axialForceN)) * 1e-6 ? 'RAIL_AXIAL_END_FORCES_DO_NOT_BALANCE' : null})),
    ...ties.map(t => ({kind: 'TIE_AXIAL' as const, id: t.id, memberId: t.id, demand: t.forceN, lengthMm: null, issue: null})),
  ];
  const limits = screenSideLocalChecks({demands, evidence: coupling.limits, actionBasis: input.actionBasis, memberEvidenceRef: sideCouplingReference(coupling),
    standingBlockers: ['COUPLED_LIMITS_DO_NOT_COVER_CONNECTOR_ROTATION_OR_PRODUCT_COMPATIBILITY', 'RAIL_PAIR_AXIAL_SHARING_UNVERIFIED']});
  blockers.push(...limits.blockers);
  // Plywood strips at the compatible stud movement, screened per 1000 mm strip against the face's plywood limits.
  const plywood = plywoodFaces.map(pf => {
    const f = side.faces.find(x => x.face.id === pf.faceId)!, ref = sidePlywoodEvidenceReference(f.input.plywood), basis = f.result.studs[0].analysis.input.actionBasis ?? input.actionBasis;
    return {faceId: pf.faceId, panels: pf.panels.map(p => ({...p, resistanceScreen: screenBeamMemberResistance({evidence: f.input.plywood.resistanceEvidence ?? [], actionBasis: basis, memberEvidenceRef: ref,
      maximumUnsupportedSpanMm: spanOf(p.analysis.input.supports.map(s => s.xMm), p.analysis.input.lengthMm), demands: {FLEXURE: p.analysis.maxMomentNmm, SHEAR: p.analysis.maxShearN, DEFLECTION: p.analysis.maxDeflectionMm}})}))};
  });
  const plywoodFail = plywood.some(f => f.panels.some(p => p.resistanceScreen.status === 'FAIL'));
  if (plywoodFail) blockers.push('COUPLED_PLYWOOD_STRIP_LIMIT_EXCEEDED');
  const memberFail = plywoodFail || [...railAnalyses, ...studAnalyses].some(a => a.resistanceScreen.status === 'FAIL');
  if (memberFail) blockers.push('COUPLED_RAIL_OR_STUD_MEMBER_LIMIT_EXCEEDED');
  else if ([...railAnalyses, ...studAnalyses].some(a => a.resistanceScreen.status !== 'SCREENED')) blockers.push('COUPLED_RAIL_OR_STUD_MEMBER_EVIDENCE_REQUIRED');
  return {engineVersion: 'side-coupled-2' as const, status: limits.status === 'FAIL' || memberFail || tieProductFail ? 'FAIL' as const : 'BLOCKED' as const,
    iterations: iterations + 1, rankDeficiency, supports, crossings, railShares, ties, tieProducts, corners: cornerRows, railAxial, railAnalyses, studAnalyses, actions,
    plywood: {iterations: plywoodIterations, maxLoadChangeNPerMm: plywoodMaxChangeNPerMm, faces: plywood},
    frameCompatibility: frameForces.map(f => ({frameNodeId: f.mapping.frameNodeId, normal: f.node.normal, displacementMm: solution[f.dof]})),
    equilibrium: {originMm: origin, pressureForceN, pressureMomentNmm, frameForceN, frameMomentNmm, forceResidualN, momentResidualNmm, maxSupportResidualN: maxSupportResidual},
    limits, blockers: [...new Set(blockers)], constructionRelease: 'NO_GO' as const};
}
