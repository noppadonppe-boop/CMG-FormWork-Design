import {analyzeBeam, type BeamAnalysis, type BeamInput} from './beam.js';
import {canonical, finite, identifier, record, uniqueIds} from './common.js';
import {analyzeLinearFrame, assembleFrameStiffness, type FrameAction, type FrameVector, type LinearFrameInput} from './frameLinear.js';
import type {PhysicalFace} from './geometry.js';
export type {PhysicalFace};
import type {analyzeSideLayout, SideEndpoint} from './sideLayout.js';
import {screenSideLocalChecks, SIDE_COUPLED_LIMIT_KINDS, validateSideLocalEvidence, type SideLocalDemand, type SideLocalEvidence} from './sideLocalChecks.js';

/** Waler-level support compatibility. Unknowns: outward displacement of every actual waler
 * support, outward displacement of rail ends joined by declared corner connectors, and one
 * rigid axial displacement per rail group. Ties are tension-only E·A/L springs; the frame
 * enters through its exact linear flexibility at the mapped nodes (mixed formulation) plus its
 * displacement under the other frame actions. Corner connectors are user-declared isotropic
 * linear springs. Stud→waler transfer stays the rigid-support analysis (one-way).
 */
export interface SideCouplingTie {tieId: string; E_MPa: number | null; A_mm2: number | null; effectiveLengthMm: number | null; evidenceRef: string}
export interface SideCouplingCorner {id: string; faceAId: string; walerAId: string; faceBId: string; walerBId: string; stiffnessNPerMm: number | null; evidenceRef: string}
export interface SideCouplingDefinition {
  schemaVersion: '1'; assumptionsEvidenceRef: string;
  ties: SideCouplingTie[]; corners: SideCouplingCorner[]; limits: SideLocalEvidence[];
}
export const emptySideCoupling = (): SideCouplingDefinition => ({schemaVersion: '1', assumptionsEvidenceRef: '', ties: [], corners: [], limits: []});
export const emptyCouplingTie = (tieId = ''): SideCouplingTie => ({tieId, E_MPa: null, A_mm2: null, effectiveLengthMm: null, evidenceRef: ''});
export const emptyCouplingCorner = (id: string): SideCouplingCorner => ({id, faceAId: '', walerAId: '', faceBId: '', walerBId: '', stiffnessNPerMm: null, evidenceRef: ''});
/** Limits are bound to the declared tie and corner stiffness data (not to the limits themselves). */
export const sideCouplingReference = (c: Pick<SideCouplingDefinition, 'ties' | 'corners'>) => canonical({role: 'SIDE_COUPLING', ties: c.ties, corners: c.corners});

function text(v: unknown, label: string) {if (typeof v !== 'string' || v.length > 2000) throw Error(`Invalid coupling ${label}`);}
function exact(raw: unknown, keys: string[], label: string) {
  const r = record(raw);
  if (keys.some(k => !Object.hasOwn(r, k)) || Object.keys(r).some(k => !keys.includes(k))) throw Error(`${label}: unknown/missing fields or authority metadata`);
  return r;
}
export function validateSideCoupling(raw: unknown): asserts raw is SideCouplingDefinition {
  const c = exact(raw, Object.keys(emptySideCoupling()), 'side coupling');
  if (c.schemaVersion !== '1' || !Array.isArray(c.ties) || c.ties.length > 1000 || !Array.isArray(c.corners) || c.corners.length > 200 || !Array.isArray(c.limits) || c.limits.length > SIDE_COUPLED_LIMIT_KINDS.length) throw Error('Invalid side coupling lists');
  text(c.assumptionsEvidenceRef, 'assumption evidence');
  for (const t of c.ties as SideCouplingTie[]) {
    exact(t, Object.keys(emptyCouplingTie()), 'coupling tie'); text(t.tieId, 'tie id'); text(t.evidenceRef, 'tie evidence');
    for (const k of ['E_MPa', 'A_mm2', 'effectiveLengthMm'] as const) if (t[k] !== null) finite(t[k], `tie ${k}`);
  }
  uniqueIds((c.ties as SideCouplingTie[]).map(t => ({id: t.tieId})), 'coupling ties');
  for (const k of c.corners as SideCouplingCorner[]) {
    exact(k, Object.keys(emptyCouplingCorner('')), 'coupling corner');
    for (const f of ['id', 'faceAId', 'walerAId', 'faceBId', 'walerBId', 'evidenceRef'] as const) text(k[f], f);
    if (k.stiffnessNPerMm !== null) finite(k.stiffnessNPerMm, 'corner stiffness');
  }
  uniqueIds(c.corners as SideCouplingCorner[], 'coupling corners');
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

export function analyzeCoupledSideSupports(input: {
  side: Side; coupling: SideCouplingDefinition; actionBasis: 'SERVICE' | 'FACTORED';
  frame: LinearFrameInput; mappings: {faceId: string; walerId: string; supportId: string; frameNodeId: string; connectionEvidenceRef: string}[];
  context: {revisionId: string; stageId: string; loadCaseId: string; evidenceRef: string};
}) {
  const {side, coupling, frame} = input;
  validateSideCoupling(coupling);
  identifier(coupling.assumptionsEvidenceRef, 'coupled model assumption evidence');
  const blockers = ['COUPLED_STUD_TO_WALER_TRANSFER_REMAINS_RIGID_SUPPORT_ONE_WAY', 'COUPLED_RAILS_AXIALLY_RIGID_AND_PAIRED_RAIL_ENDS_MOVE_TOGETHER',
    'COUPLED_TIE_AND_CORNER_STIFFNESS_ARE_USER_DECLARED_LINEAR_NO_SLIP_GAP_OR_PRETENSION', 'TIE_PRODUCT_SCREENS_IN_SIDE_LAYOUT_USE_RIGID_SUPPORT_DEMANDS_COUPLED_TIE_FORCES_GOVERN',
    'SIDE_SYSTEM_STABILITY_ONLY_THROUGH_FRAME_LATERAL_CASE_AND_SECOND_ORDER'];
  // Rail groups: one per actual face and waler level; paired rails share their support movement.
  type Group = {id: string; faceId: string; walerId: string; zMm: number; face: PhysicalFace; rails: BeamAnalysis[];
    supports: {id: string; xMm: number; dof: number}[]; ends: {A: number | null; B: number | null}; axial: number | null};
  const groups: Group[] = [];
  let dofs = 0;
  const nodeDof = new Map<string, number>();
  for (const f of side.faces) {
    const levels = [...f.input.walers].sort((a, b) => a.zMm - b.zMm);
    f.result.walers.forEach((w, level) => {
      const walerId = levels[level].id;
      const supports = levels[level].supports.map(s => {
        const k = key({faceId: f.face.id, walerId, supportId: s.id});
        if (!nodeDof.has(k)) nodeDof.set(k, dofs++);
        return {id: s.id, xMm: s.xMm, dof: nodeDof.get(k)!};
      });
      if (supports.some(s => s.id.startsWith('CORNER-'))) throw Error('Support ids starting with CORNER- are reserved for corner connector stations');
      groups.push({id: `${f.face.id}:${walerId}`, faceId: f.face.id, walerId, zMm: w.zMm, face: f.face, rails: w.rails, supports, ends: {A: null, B: null}, axial: null});
    });
  }
  // Corner connectors at actual shared polygon vertices and equal waler heights.
  const corners = coupling.corners.map(c => {
    const ga = groups.find(g => g.faceId === c.faceAId && g.walerId === c.walerAId), gb = groups.find(g => g.faceId === c.faceBId && g.walerId === c.walerBId);
    if (!ga || !gb || ga === gb) throw Error(`${c.id}: corner must join two actual rail groups`);
    identifier(c.evidenceRef, `${c.id} connector evidence`);
    const k = finite(c.stiffnessNPerMm, `${c.id} corner connector stiffness`);
    if (Math.abs(ga.zMm - gb.zMm) > 1e-7) throw Error(`${c.id}: corner rails must be at the same height`);
    const vertex = [ga.face.a, ga.face.b].find(p => same(p, gb.face.a) || same(p, gb.face.b));
    if (!vertex) throw Error(`${c.id}: faces do not share an actual corner vertex`);
    const endOf = (g: Group) => {
      const end = same(vertex, g.face.a) ? 'A' as const : 'B' as const, x = end === 'A' ? 0 : g.face.lengthMm;
      if (g.supports.some(s => Math.abs(s.xMm - x) < 1e-7)) throw Error(`${c.id}: waler support at the corner end is unsupported in the coupled model`);
      if (g.ends[end] !== null) throw Error(`${c.id}: rail end already has a corner connector`);
      g.ends[end] = dofs++; if (g.axial === null) g.axial = dofs++;
      return end;
    };
    return {definition: c, k, a: {group: ga, end: endOf(ga)}, b: {group: gb, end: endOf(gb)}, point: vertex};
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
    return {tie: t, k: finite(d.E_MPa, `${t.id} E`) * finite(d.A_mm2, `${t.id} A`) / Le, a: nodeDof.get(t.a.id)!, b: nodeDof.get(t.b.id)!, lengthMm: Le};
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
  // Rail transverse stiffness: reactions to unit support movement; base reactions under loads.
  const railStations = (g: Group) => [...g.supports.map(s => ({id: s.id, xMm: s.xMm, dof: s.dof})),
    ...(g.ends.A !== null ? [{id: 'CORNER-A', xMm: 0, dof: g.ends.A}] : []), ...(g.ends.B !== null ? [{id: 'CORNER-B', xMm: g.face.lengthMm, dof: g.ends.B}] : [])];
  const strip = (r: BeamAnalysis): BeamInput => ({id: r.input.id, revision: r.input.revision, lengthMm: r.input.lengthMm, E_MPa: r.input.E_MPa, I_mm4: r.input.I_mm4, supports: [], points: r.input.points, patches: r.input.patches});
  const K0 = Array.from({length: dofs}, () => Array(dofs).fill(0) as number[]), d0 = Array(dofs).fill(0) as number[];
  for (const g of groups) {
    const st = railStations(g);
    for (const r of g.rails) {
      const loaded = analyzeBeam({...strip(r), supports: st.map(s => ({id: s.id, xMm: s.xMm}))});
      st.forEach(s => {d0[s.dof] -= loaded.reactions.find(q => q.supportId === s.id)!.forceN;});
      st.forEach(sj => {
        const unit = analyzeBeam({...strip(r), points: [], patches: [], supports: st.map(s => ({id: s.id, xMm: s.xMm, displacementMm: s === sj ? 1 : 0}))});
        st.forEach(si => {K0[si.dof][sj.dof] += unit.reactions.find(q => q.supportId === si.id)!.forceN;});
      });
    }
  }
  for (const c of corners) {
    const gen = (side: {group: Group; end: 'A' | 'B'}) => {
      const t = {x: (side.group.face.b.x - side.group.face.a.x) / side.group.face.lengthMm, y: (side.group.face.b.y - side.group.face.a.y) / side.group.face.lengthMm};
      return {dofs: [side.group.ends[side.end]!, side.group.axial!], map: [[side.group.face.normal.x, t.x], [side.group.face.normal.y, t.y]], t};
    };
    const A = gen(c.a), B = gen(c.b), ids = [...A.dofs, ...B.dofs];
    const M = [[A.map[0][0], A.map[0][1], -B.map[0][0], -B.map[0][1]], [A.map[1][0], A.map[1][1], -B.map[1][0], -B.map[1][1]]];
    ids.forEach((p, i) => ids.forEach((q, j) => {K0[p][q] += c.k * (M[0][i] * M[0][j] + M[1][i] * M[1][j]);}));
  }
  // Tension-only tie active set; frame compatibility rows close the mixed system.
  let active = tieRows.map(() => true), solution: number[] = [], rankDeficiency = 0, iterations = 0;
  for (; iterations < 30; iterations++) {
    const A = K0.map(r => [...r]), b = [...d0];
    tieRows.forEach((t, i) => {if (!active[i]) return; for (const p of [t.a, t.b]) for (const q of [t.a, t.b]) A[p][q] += t.k;});
    framed.forEach((f, i) => {
      A[f.dof][f.force] += 1;
      A[f.force][f.dof] = 1; framed.forEach((g, j) => {A[f.force][g.force] -= flex[i][j];}); b[f.force] = u0[i];
    });
    const solved = solveSystem(A, b); solution = solved.x; rankDeficiency = solved.rankDeficiency;
    const next = tieRows.map(t => t.k * (solution[t.a] + solution[t.b]) > -1e-9 * Math.max(1, t.k));
    if (next.every((v, i) => v === active[i])) break;
    active = next;
  }
  if (iterations >= 30) throw Error('COUPLED_TIE_ACTIVE_SET_DID_NOT_CONVERGE');
  if (rankDeficiency) blockers.push(`COUPLED_MODEL_HAS_${rankDeficiency}_UNRESTRAINED_RIGID_MODES_SELF_EQUILIBRATED_LOAD_ONLY`);
  // Final rail analyses with the compatible support movement (resistance screens re-run).
  const railAnalyses = groups.flatMap(g => g.rails.map(r => analyzeBeam({...r.input, id: `${r.id}:COUPLED`, supports: railStations(g).map(s => ({id: s.id, xMm: s.xMm, displacementMm: solution[s.dof]}))})));
  const demandAt = (g: Group, id: string) => -railAnalyses.filter(a => g.rails.some(r => `${r.id}:COUPLED` === a.id)).reduce((s, a) => s + a.reactions.find(q => q.supportId === id)!.forceN, 0);
  const ties = tieRows.map((t, i) => ({id: t.tie.id, stiffnessNPerMm: t.k, effectiveLengthMm: t.lengthMm, elongationMm: solution[t.a] + solution[t.b],
    forceN: active[i] ? t.k * (solution[t.a] + solution[t.b]) : 0, slack: !active[i], rigidSupportForcesN: [t.tie.a.forceN, t.tie.b.forceN] as [number, number]}));
  for (const t of ties) if (t.slack) blockers.push(`${t.id}:TIE_SLACK_IN_COUPLED_SOLUTION_COMPRESSION_NOT_TRANSFERRED`);
  const frameForces = framed.map(f => ({...f, forceN: solution[f.force]}));
  const supports = groups.flatMap(g => g.supports.map(s => {
    const k = key({faceId: g.faceId, walerId: g.walerId, supportId: s.id}), node = side.nodes.find(n => n.id === k)!;
    const tieForce = ties.filter((t, i) => tieRows[i].a === s.dof || tieRows[i].b === s.dof).reduce((sum, t) => sum + t.forceN, 0);
    const frameForce = frameForces.find(f => f.dof === s.dof)?.forceN ?? 0, demandN = demandAt(g, s.id);
    return {id: k, faceId: g.faceId, walerId: g.walerId, supportId: s.id, point: node.point, displacementMm: solution[s.dof], demandN, tieForceN: tieForce, frameForceN: frameForce,
      rigidDemandN: node.forceN, residualN: demandN - tieForce - frameForce};
  }));
  const cornerRows = corners.map(c => {
    const D = (s: {group: Group; end: 'A' | 'B'}) => {
      const t = {x: (s.group.face.b.x - s.group.face.a.x) / s.group.face.lengthMm, y: (s.group.face.b.y - s.group.face.a.y) / s.group.face.lengthMm}, e = solution[s.group.ends[s.end]!], w = solution[s.group.axial!];
      return {x: e * s.group.face.normal.x + w * t.x, y: e * s.group.face.normal.y + w * t.y};
    };
    // Restoring connector force applied ON rail A (equal and opposite on rail B at the same vertex).
    const da = D(c.a), db = D(c.b), force = {x: -c.k * (da.x - db.x), y: -c.k * (da.y - db.y)};
    return {id: c.definition.id, faceAId: c.a.group.faceId, faceBId: c.b.group.faceId, walerAId: c.a.group.walerId, walerBId: c.b.group.walerId, point: c.point,
      stiffnessNPerMm: c.k, relativeDisplacementMm: Math.hypot(da.x - db.x, da.y - db.y), forceOnFaceAN: force, connectorForceN: Math.hypot(force.x, force.y)};
  });
  const railAxial = groups.filter(g => g.axial !== null).map(g => {
    const t = {x: (g.face.b.x - g.face.a.x) / g.face.lengthMm, y: (g.face.b.y - g.face.a.y) / g.face.lengthMm};
    // Tension positive: the connector force acting on end B along +t.
    const endB = cornerRows.find((c, i) => (corners[i].a.group === g && corners[i].a.end === 'B') || (corners[i].b.group === g && corners[i].b.end === 'B'));
    const endA = cornerRows.find((c, i) => (corners[i].a.group === g && corners[i].a.end === 'A') || (corners[i].b.group === g && corners[i].b.end === 'A'));
    const onRail = (row: typeof cornerRows[number] | undefined) => {
      if (!row) return 0; const sign = row.faceAId === g.faceId && row.walerAId === g.walerId ? 1 : -1;
      return sign * (row.forceOnFaceAN.x * t.x + row.forceOnFaceAN.y * t.y);
    };
    const span = (() => {const xs = [...new Set([0, g.face.lengthMm, ...railStations(g).map(s => s.xMm)])].sort((p, q) => p - q); return Math.max(...xs.slice(1).map((x, i) => x - xs[i]));})();
    return {groupId: g.id, faceId: g.faceId, walerId: g.walerId, axialForceN: (onRail(endB) - onRail(endA)) / 2,
      endBalanceN: onRail(endA) + onRail(endB), maximumUnsupportedSpanMm: span};
  });
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
    standingBlockers: ['COUPLED_LIMITS_DO_NOT_COVER_CONNECTOR_SLIP_ROTATION_OR_PRODUCT_COMPATIBILITY', 'RAIL_PAIR_AXIAL_SHARING_UNVERIFIED']});
  blockers.push(...limits.blockers);
  const railFail = railAnalyses.some(a => a.resistanceScreen.status === 'FAIL');
  if (railFail) blockers.push('COUPLED_RAIL_MEMBER_LIMIT_EXCEEDED');
  else if (railAnalyses.some(a => a.resistanceScreen.status !== 'SCREENED')) blockers.push('COUPLED_RAIL_MEMBER_EVIDENCE_REQUIRED');
  return {engineVersion: 'side-coupled-1' as const, status: limits.status === 'FAIL' || railFail ? 'FAIL' as const : 'BLOCKED' as const,
    iterations: iterations + 1, rankDeficiency, supports, ties, corners: cornerRows, railAxial, railAnalyses, actions,
    frameCompatibility: frameForces.map(f => ({frameNodeId: f.mapping.frameNodeId, normal: f.node.normal, displacementMm: solution[f.dof]})),
    equilibrium: {originMm: origin, pressureForceN, pressureMomentNmm, frameForceN, frameMomentNmm, forceResidualN, momentResidualNmm, maxSupportResidualN: maxSupportResidual},
    limits, blockers: [...new Set(blockers)], constructionRelease: 'NO_GO' as const};
}
