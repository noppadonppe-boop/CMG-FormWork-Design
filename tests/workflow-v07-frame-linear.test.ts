import {expect, it} from 'vitest';
import {analyzeLinearFrame, type FrameAction, type FrameBoundary, type FrameElement, type FrameNode, type FrameVector, type LinearFrameInput} from '../src/domain/workflowV07/frameLinear';
import {transferSoffitReactionsToFrame} from '../src/domain/workflowV07/frameLoadTransfer';
import {analyzeLoadPath, type PathMember} from '../src/domain/workflowV07/loadPath';
import {previewWorkflow} from '../src/domain/workflowV07/model';
import {builtModel} from './fixtures/workflow-v07-soffit';

// All properties/restraints/loads below are explicit SYNTHETIC mechanics benchmarks, not Ringlock stock or ratings.
const fixed = (): FrameBoundary => [0, 0, 0, 0, 0, 0];
const free = (): FrameBoundary => ['FREE', 'FREE', 'FREE', 'FREE', 'FREE', 'FREE'];
const axialFree = (): FrameBoundary => ['FREE', 0, 0, 'FREE', 'FREE', 'FREE'];
const node = (id: string, pointMm: FrameVector, boundary = free()): FrameNode => ({id, pointMm, boundary});
const beam = (id = 'B1', nodeI = 'A', nodeJ = 'B', localY: FrameVector = [0, 1, 0]): FrameElement => ({id, nodeI, nodeJ, kind: 'BEAM_COLUMN',
  E_MPa: 200000, G_MPa: 80000, A_mm2: 200, Iy_mm4: 1e6, Iz_mm4: 2e6, J_mm4: 3e6, localY, evidenceRef: 'SYNTHETIC beam'});
const bar = (id: string, nodeI: string, nodeJ: string): FrameElement => ({id, nodeI, nodeJ, kind: 'AXIAL_BAR', E_MPa: 200000, A_mm2: 100, evidenceRef: 'SYNTHETIC axial bar'});
const action = (id: string, nodeId: string, forceN: FrameVector, momentNmm: FrameVector = [0, 0, 0]): FrameAction => ({id, nodeId, forceN, momentNmm,
  revisionId: 'R1', stageId: 'S1', loadCaseId: 'LC1', evidenceRef: 'SYNTHETIC point action', application: 'AT_NODE'});
const input = (nodes: FrameNode[], elements: FrameElement[], actions: FrameAction[] = []): LinearFrameInput => ({schemaVersion: 'frame-linear-1', units: 'N_MM_MPA_RAD',
  id: 'SYNTHETIC-FRAME', revisionId: 'R1', stageId: 'S1', loadCaseId: 'LC1', assumptionEvidenceRef: 'SYNTHETIC idealizations only', nodes, elements, actions});
const cantilever = (actions = [action('P', 'B', [5000, 12000, 6000], [3e6, 0, 0])]) => input([node('A', [0, 0, 0], fixed()), node('B', [1000, 0, 0])], [beam()], actions);
const closeVector = (actual: (number | null)[], expected: number[], digits = 6) => actual.forEach((v, i) => expect(v).toBeCloseTo(expected[i], digits));

it('axial bar agrees with EA/L, support equilibrium and strain energy', () => {
  const r = analyzeLinearFrame(input([node('A', [0, 0, 0], [0, 0, 0, 'FREE', 'FREE', 'FREE']), node('B', [1000, 0, 0], axialFree())], [bar('AB', 'A', 'B')], [action('P', 'B', [10000, 0, 0])]));
  expect(r.nodes[1].displacementMm[0]).toBeCloseTo(.5, 10);
  expect(r.elements[0].axialForceN).toBeCloseTo(10000, 8);
  expect(r.nodes[0].reactionForceN[0]).toBeCloseTo(-10000, 8);
  expect(r.diagnostics.strainEnergyNmm).toBeCloseTo(2500, 8);
  expect(r.diagnostics.unusedRotations).toHaveLength(6);
  expect(r.nodes[0].rotationRad).toEqual([null, null, null]); expect(r.nodes[1].rotationRad).toEqual([null, null, null]);
  expect(r.diagnostics.maxFullyModelledRotationRad).toBeNull();
});
it('3D cantilever matches independent axial, two-axis bending and St Venant torsion solutions', () => {
  const r = analyzeLinearFrame(cantilever());
  closeVector(r.nodes[1].displacementMm, [.125, 10, 10]);
  closeVector(r.nodes[1].rotationRad, [.0125, -.015, .015], 10);
  closeVector(r.nodes[0].reactionForceN, [-5000, -12000, -6000]);
  closeVector(r.nodes[0].reactionMomentNmm, [-3e6, 6e6, -12e6], 3);
  closeVector(r.equilibrium.forceResidualN, [0, 0, 0]); closeVector(r.equilibrium.momentResidualNmm, [0, 0, 0], 3);
});
it('mesh subdivision preserves the point-loaded beam solution and end actions', () => {
  const single = analyzeLinearFrame(cantilever([action('P', 'B', [0, 12000, 0])]));
  const r = analyzeLinearFrame(input([node('A', [0, 0, 0], fixed()), node('M', [500, 0, 0]), node('B', [1000, 0, 0])],
    [beam('AM', 'A', 'M'), beam('MB', 'M', 'B')], [action('P', 'B', [0, 12000, 0])]));
  expect(r.nodes[1].displacementMm[1]).toBeCloseTo(12000 * 500 ** 2 * (3000 - 500) / (6 * 200000 * 2e6), 8);
  closeVector(r.nodes[2].displacementMm, single.nodes[1].displacementMm, 7);
  expect(r.elements[0].localNodalActionsOnElement[5]).toBeCloseTo(-12e6, 3);
  expect(r.elements[1].localNodalActionsOnElement[11]).toBeCloseTo(0, 3);
});
it('a simply supported beam with a central nodal force matches PL³/48EI and P/2 reactions', () => {
  const left: FrameBoundary = [0, 0, 0, 0, 'FREE', 'FREE'], right: FrameBoundary = ['FREE', 0, 0, 'FREE', 'FREE', 'FREE'];
  const r = analyzeLinearFrame(input([node('A', [0, 0, 0], left), node('M', [500, 0, 0]), node('B', [1000, 0, 0], right)],
    [beam('AM', 'A', 'M'), beam('MB', 'M', 'B')], [action('P', 'M', [0, -12000, 0])]));
  expect(r.nodes[1].displacementMm[1]).toBeCloseTo(-12000 * 1000 ** 3 / (48 * 200000 * 2e6), 9);
  expect(r.nodes[0].reactionForceN[1]).toBeCloseTo(6000, 6); expect(r.nodes[2].reactionForceN[1]).toBeCloseTo(6000, 6);
  closeVector(r.nodes[0].reactionMomentNmm, [0, 0, 0], 5);
});
it('a planar pin truss has correct signed brace forces and does not invent out-of-plane restraints', () => {
  const nodes = [node('A', [0, 0, 0], [0, 0, 0, 'FREE', 'FREE', 'FREE']), node('B', [1000, 0, 0], [0, 0, 0, 'FREE', 'FREE', 'FREE']),
    node('C', [500, 500, 0], ['FREE', 'FREE', 0, 'FREE', 'FREE', 'FREE'])];
  const c = input(nodes, [bar('AC', 'A', 'C'), bar('BC', 'B', 'C')], [action('P', 'C', [0, -10000, 0])]), r = analyzeLinearFrame(c);
  expect(r.nodes[2].displacementMm[1]).toBeCloseTo(-10000 * Math.sqrt(500 ** 2 + 500 ** 2) / (200000 * 100), 9);
  r.elements.forEach(e => expect(e.axialForceN).toBeCloseTo(-10000 / Math.sqrt(2), 6));
  c.nodes[2].boundary[2] = 'FREE'; expect(() => analyzeLinearFrame(c)).toThrow(/UNSTABLE_FRAME/);
});
it('an axial connection spring in series adds its displacement and retains the full force', () => {
  const spring: FrameElement = {id: 'J', kind: 'JOINT_SPRING', nodeI: 'B', nodeJ: 'C', localX: [1, 0, 0], localY: [0, 1, 0], stiffness: [1000, 0, 0, 0, 0, 0], evidenceRef: 'SYNTHETIC k'};
  const r = analyzeLinearFrame(input([node('A', [0, 0, 0], fixed()), node('B', [1000, 0, 0], axialFree()), node('C', [1000, 0, 0], axialFree())],
    [bar('AB', 'A', 'B'), spring], [action('P', 'C', [10000, 0, 0])]));
  expect(r.nodes[2].displacementMm[0]).toBeCloseTo(.5 + 10, 8);
  expect(r.elements[1].relativeJointDof?.[0]).toBeCloseTo(10, 8);
  expect(r.elements[1].localNodalActionsOnElement[6]).toBeCloseTo(10000, 7);
});
it('a rotational root spring contributes ML/k to cantilever tip displacement', () => {
  const spring: FrameElement = {id: 'J', kind: 'JOINT_SPRING', nodeI: 'G', nodeJ: 'A', localX: [1, 0, 0], localY: [0, 1, 0],
    stiffness: [1e9, 1e9, 1e9, 1e9, 1e9, 1e9], evidenceRef: 'SYNTHETIC 6DOF linear joint'};
  const r = analyzeLinearFrame(input([node('G', [0, 0, 0], fixed()), node('A', [0, 0, 0]), node('B', [1000, 0, 0])], [spring, beam()], [action('P', 'B', [0, 100, 0])]));
  expect(r.nodes[2].displacementMm[1]).toBeCloseTo(100 / 1e9 + 100 * 1000 ** 3 / (3 * 200000 * 2e6) + 100 * 1000 ** 2 / 1e9, 8);
  expect(r.elements[0].relativeJointDof?.[5]).toBeCloseTo(.0001, 10);
});
it('arbitrary 3D rotation and translation preserve the transformed physical response', () => {
  // Independent Rodrigues rotation, not the solver's axis construction.
  const axis = [1, 2, 3].map(v => v / Math.sqrt(14)), angle = .63, C = Math.cos(angle), S = Math.sin(angle);
  const rotate = (v: number[]): FrameVector => {const d = axis.reduce((s, a, i) => s + a * v[i], 0), cross = [axis[1] * v[2] - axis[2] * v[1], axis[2] * v[0] - axis[0] * v[2], axis[0] * v[1] - axis[1] * v[0]];
    return v.map((x, i) => C * x + S * cross[i] + (1 - C) * d * axis[i]) as FrameVector;};
  const c = cantilever(), base = analyzeLinearFrame(c), move = [130, -70, 300];
  c.nodes.forEach(n => n.pointMm = rotate(n.pointMm).map((v, i) => v + move[i]) as FrameVector);
  (c.elements[0] as Extract<FrameElement, {kind: 'BEAM_COLUMN'}>).localY = rotate([0, 1, 0]);
  c.actions.forEach(a => {a.forceN = rotate(a.forceN); a.momentNmm = rotate(a.momentNmm);});
  const result = analyzeLinearFrame(c);
  closeVector(result.nodes[1].displacementMm, rotate(base.nodes[1].displacementMm), 6);
  closeVector(result.nodes[1].rotationRad, rotate(base.nodes[1].rotationRad as number[]), 9);
  closeVector(result.nodes[0].reactionMomentNmm, rotate(base.nodes[0].reactionMomentNmm), 3);
});
it('reversing a member orientation preserves global response, while strong/weak axis choice matters', () => {
  const c = cantilever(), original = analyzeLinearFrame(c);
  c.elements[0].nodeI = 'B'; c.elements[0].nodeJ = 'A';
  closeVector(analyzeLinearFrame(c).nodes[1].displacementMm, original.nodes[1].displacementMm, 7);
  const weak = cantilever([action('P', 'B', [0, 12000, 0])]);
  (weak.elements[0] as Extract<FrameElement, {kind: 'BEAM_COLUMN'}>).localY = [0, 0, 1];
  expect(analyzeLinearFrame(weak).nodes[1].displacementMm[1]).toBeCloseTo(20, 7);
});
it('a bent spatial frame satisfies Maxwell–Betti reciprocity and element/global energy agreement', () => {
  const c = input([node('A', [0, 0, 0], fixed()), node('B', [1000, 0, 0]), node('C', [1000, 500, 500])], [beam('AB'), beam('BC', 'B', 'C', [1, 0, 0])]);
  const a = analyzeLinearFrame({...c, actions: [action('P1', 'B', [0, 1000, 0])]}), b = analyzeLinearFrame({...c, actions: [action('P2', 'C', [1500, 0, 0])]});
  expect(1000 * b.nodes[1].displacementMm[1]).toBeCloseTo(1500 * a.nodes[2].displacementMm[0], 4);
  const energy = a.elements.reduce((sum, e) => sum + e.localDisplacement.reduce((s, d, i) => s + d * e.localNodalActionsOnElement[i], 0) / 2, 0);
  expect(energy).toBeCloseTo(a.diagnostics.strainEnergyNmm, 5);
});
it('prescribed settlement produces the correct axial strain force without an invented nodal action', () => {
  const c = input([node('A', [0, 0, 0], fixed()), node('B', [1000, 0, 0], [1, 0, 0, 0, 0, 0])], [bar('AB', 'A', 'B')]);
  const r = analyzeLinearFrame(c); expect(r.elements[0].axialForceN).toBeCloseTo(20000, 7);
  closeVector(r.nodes[0].reactionForceN, [-20000, 0, 0]); closeVector(r.nodes[1].reactionForceN, [20000, 0, 0]);
});
it('force applied at a fixed node is counted exactly once and does not deform the free beam', () => {
  const r = analyzeLinearFrame(cantilever([action('P', 'A', [0, 0, -10000])]));
  closeVector(r.nodes[1].displacementMm, [0, 0, 0], 10); closeVector(r.nodes[0].reactionForceN, [0, 0, 10000]);
});
it('an eccentric vertical action supplies r×F and the corresponding cantilever response', () => {
  const a = action('P', 'B', [0, 0, -10000]); a.application = {offsetMm: [100, 0, 0], evidenceRef: 'SYNTHETIC rigid transfer'};
  const r = analyzeLinearFrame(input([node('A', [0, 0, 0], fixed()), node('B', [0, 0, 1000])], [beam()], [a]));
  closeVector(r.appliedActions[0].equivalentMomentNmm, [0, 1e6, 0]);
  expect(r.nodes[1].displacementMm[0]).toBeCloseTo(2.5, 7); closeVector(r.nodes[0].reactionMomentNmm, [0, -1e6, 0], 3);
});
it('rejects missing properties/restraints, unsupported silent releases/loads and false method/authority flags', () => {
  const unknown = cantilever(); (unknown.elements[0] as Extract<FrameElement, {kind: 'BEAM_COLUMN'}>).G_MPa = null;
  expect(() => analyzeLinearFrame(unknown)).toThrow(/member G/);
  const boundary = cantilever(); boundary.nodes[1].boundary[0] = null;
  expect(() => analyzeLinearFrame(boundary)).toThrow(/null is unknown/);
  expect(() => analyzeLinearFrame({...cantilever(), confirmed: true} as LinearFrameInput)).toThrow(/approval/);
  expect(() => analyzeLinearFrame({...cantilever(), units: 'KN_M_DEG'} as unknown as LinearFrameInput)).toThrow(/units/);
  const releases = cantilever(); Object.assign(releases.elements[0], {endReleases: [true, true]});
  expect(() => analyzeLinearFrame(releases)).toThrow(/unsupported or missing fields/);
  const stale = cantilever(); stale.actions[0].loadCaseId = 'OTHER'; expect(() => analyzeLinearFrame(stale)).toThrow(/wrong stage\/load case/);
});
it('rejects real rigid-body mechanisms and loads on inactive bar rotations without penalty stiffness', () => {
  const floating = cantilever(); floating.nodes[0].boundary = free(); expect(() => analyzeLinearFrame(floating)).toThrow(/UNSTABLE/);
  const moment = input([node('A', [0, 0, 0], fixed()), node('B', [1000, 0, 0], axialFree())], [bar('AB', 'A', 'B')], [action('M', 'B', [0, 0, 0], [1, 0, 0])]);
  expect(() => analyzeLinearFrame(moment)).toThrow(/UNUSED_ROTATIONAL_DOF/);
});
it('rejects parallel local axes, noncoincident joint springs, and unknown zero-vs-null stiffness', () => {
  const axes = cantilever(); (axes.elements[0] as Extract<FrameElement, {kind: 'BEAM_COLUMN'}>).localY = [1, 0, 0];
  expect(() => analyzeLinearFrame(axes)).toThrow(/parallel/);
  const joint: FrameElement = {id: 'J', kind: 'JOINT_SPRING', nodeI: 'A', nodeJ: 'B', localX: [1, 0, 0], localY: [0, 1, 0], stiffness: [1, 1, 1, 1, 1, 1], evidenceRef: 'SYNTHETIC'};
  expect(() => analyzeLinearFrame(input([node('A', [0, 0, 0], fixed()), node('B', [1, 0, 0])], [joint]))).toThrow(/coincident/);
  joint.stiffness[0] = null;
  expect(() => analyzeLinearFrame(input([node('A', [0, 0, 0], fixed()), node('B', [0, 0, 0])], [joint]))).toThrow(/null=unknown/);
});
it('does not relabel first-order demands as a second-order buckling, connection or system pass', () => {
  const r = analyzeLinearFrame(cantilever([action('P', 'B', [-1e6, 12000, 0])]));
  expect(r.nodes[1].displacementMm[1]).toBeCloseTo(10, 7); // axial force does not update geometric stiffness in this method
  expect(r.blockers).toContain('GEOMETRIC_SECOND_ORDER_AND_MEMBER_IMPERFECTION_METHOD_REQUIRED');
  expect(r.confirmed).toBe(false); expect(r.constructionEligible).toBe(false); expect(r.status).toBe('DEMAND_PREVIEW');
});
it('transfers every unequal actual U-head reaction into its own spatial column without averaging', () => {
  const model = builtModel(), reactions = previewWorkflow(model).loadPath!.reactions;
  const heads = model.ringlock!.legs.map(l => node(l.headNodeId, [l.xMm, l.yMm, l.headElevationMm]));
  const bases = heads.map(h => node(`BASE:${h.id}`, [h.pointMm[0], h.pointMm[1], 0], fixed())), nodes = [...bases, ...heads];
  const context = {revisionId: model.revisionId, stageId: model.soffitLayout!.stageId, loadCaseId: model.soffitLayout!.loadCaseId, evidenceRef: 'SYNTHETIC rigid head mapping'};
  const actions = transferSoffitReactionsToFrame(reactions, model.members, nodes, heads.map(h => ({headNodeId: h.id, frameNodeId: h.id, offsetEvidenceRef: null})), context);
  const c = {...input(nodes, heads.map(h => beam(`STD:${h.id}`, `BASE:${h.id}`, h.id))), revisionId: context.revisionId, stageId: context.stageId, loadCaseId: context.loadCaseId, actions};
  const r = analyzeLinearFrame(c);
  expect(r.nodes.slice(0, 6).reduce((s, n) => s + n.reactionForceN[2], 0)).toBeCloseTo(23760, 5);
  expect(r.nodes[1].reactionForceN[2]).toBeCloseTo(7053.75, 5);
  expect(r.nodes[0].reactionForceN[2]).toBeCloseTo(2413.125, 5);
});
function overhangSource(axis: 'X' | 'Y', fixedEnd = false): PathMember[] {
  const supports = fixedEnd ? [{id: 'H-A', xMm: 0, rotationFixed: true}] : [{id: 'H-A', xMm: 200}, {id: 'H-B', xMm: 800}];
  return [{role: 'BEARER', placement: {axis, origin: {xMm: 0, yMm: 0, zMm: 3000}},
    beam: {id: 'BEARER', revision: 'R1', lengthMm: 1000, E_MPa: 200000, I_mm4: 1e6, supports, points: [{id: 'P', xMm: 1000, forceN: 6000}], patches: []},
    links: supports.map(s => ({supportId: s.id, target: {kind: 'U_HEAD', nodeId: s.id}}))}];
}
it('keeps signed uplift and physical load offsets, and rejects omitted/tampered reactions', () => {
  const members = overhangSource('X'), reactions = analyzeLoadPath(members).reactions;
  const nodes = reactions.map(r => node(r.nodeId, [r.point.xMm, r.point.yMm, r.point.zMm]));
  const mapping = nodes.map(n => ({headNodeId: n.id, frameNodeId: n.id, offsetEvidenceRef: null as string | null})), context = {revisionId: 'R1', stageId: 'S1', loadCaseId: 'LC1', evidenceRef: 'SYNTHETIC'};
  const a = transferSoffitReactionsToFrame(reactions, members, nodes, mapping, context);
  expect(a[0].forceN[2]).toBeCloseTo(2000, 6); expect(a[1].forceN[2]).toBeCloseTo(-8000, 6);
  nodes[0].pointMm[0] -= 100;
  expect(() => transferSoffitReactionsToFrame(reactions, members, nodes, mapping, context)).toThrow(/offset/);
  mapping[0].offsetEvidenceRef = 'SYNTHETIC offset';
  expect(transferSoffitReactionsToFrame(reactions, members, nodes, mapping, context)[0].application).toMatchObject({offsetMm: [100, 0, 0]});
  const tampered = structuredClone(reactions); tampered[0].forceN = 0;
  expect(() => transferSoffitReactionsToFrame(tampered, members, nodes, mapping, context)).toThrow(/STALE_OR_TAMPERED/);
  expect(() => transferSoffitReactionsToFrame(reactions.slice(1), members, nodes, mapping, context)).toThrow(/STALE_OR_TAMPERED/);
});
it('retains an upstream bearer restraint moment with the correct global X/Y sign convention', () => {
  for (const axis of ['X', 'Y'] as const) {
    const members = overhangSource(axis, true), reactions = analyzeLoadPath(members).reactions, p = reactions[0].point;
    const actions = transferSoffitReactionsToFrame(reactions, members, [node('H-A', [p.xMm, p.yMm, p.zMm])], [{headNodeId: 'H-A', frameNodeId: 'H-A', offsetEvidenceRef: null}],
      {revisionId: 'R1', stageId: 'S1', loadCaseId: 'LC1', evidenceRef: 'SYNTHETIC moment transfer'});
    closeVector(actions[0].momentNmm, axis === 'X' ? [0, 6e6, 0] : [-6e6, 0, 0], 3);
  }
});
