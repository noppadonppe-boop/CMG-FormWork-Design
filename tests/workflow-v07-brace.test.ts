import {describe, expect, it} from 'vitest';
import {analyzeLinearFrame, type LinearFrameInput} from '../src/domain/workflowV07/frameLinear';
import {screenBraceConnections, tensionOnlyActiveSet} from '../src/domain/workflowV07/braceConnections';
import {emptyResistanceEvidence, type ResistanceEvidence, type ResistanceQuantity} from '../src/domain/workflowV07/resistanceEvidence';

// SYNTHETIC X-braced portal: two fixed bases, two columns, a top beam, two diagonals. No product data.
const beam = (id: string, nodeI: string, nodeJ: string) => ({id, nodeI, nodeJ, kind: 'BEAM_COLUMN' as const, E_MPa: 200000, G_MPa: 80000, A_mm2: 500, Iy_mm4: 5e5, Iz_mm4: 5e5, J_mm4: 1e6, localY: [0, 1, 0] as [number, number, number], evidenceRef: 'SYNTHETIC'});
const bar = (id: string, nodeI: string, nodeJ: string) => ({id, nodeI, nodeJ, kind: 'AXIAL_BAR' as const, E_MPa: 200000, A_mm2: 100, evidenceRef: 'SYNTHETIC'});
const portal = (lateralN: number): LinearFrameInput => ({
  schemaVersion: 'frame-linear-1', units: 'N_MM_MPA_RAD', id: 'PORTAL', revisionId: 'R1', stageId: 'S1', loadCaseId: 'LC1', assumptionEvidenceRef: 'SYNTHETIC',
  nodes: [
    {id: 'B1', pointMm: [0, 0, 0], boundary: [0, 0, 0, 0, 0, 0]}, {id: 'B2', pointMm: [1000, 0, 0], boundary: [0, 0, 0, 0, 0, 0]},
    {id: 'T1', pointMm: [0, 0, 1000], boundary: ['FREE', 0, 'FREE', 0, 'FREE', 0]}, {id: 'T2', pointMm: [1000, 0, 1000], boundary: ['FREE', 0, 'FREE', 0, 'FREE', 0]},
  ],
  elements: [beam('C1', 'B1', 'T1'), beam('C2', 'B2', 'T2'), beam('TB', 'T1', 'T2'), bar('D1', 'B1', 'T2'), bar('D2', 'B2', 'T1')],
  actions: [{id: 'H', nodeId: 'T1', revisionId: 'R1', stageId: 'S1', loadCaseId: 'LC1', evidenceRef: 'SYNTHETIC lateral', forceN: [lateralN, 0, 0], momentNmm: [0, 0, 0], application: 'AT_NODE'}],
});
const reviewed = (quantity: ResistanceQuantity, capacity: number): ResistanceEvidence => ({...emptyResistanceEvidence(quantity), quantity, unit: 'N', capacity, actionBasis: 'SERVICE', resistanceBasis: 'ALLOWABLE',
  methodId: 'SYNTHETIC', sourceRef: 'SYNTHETIC', sourceRevision: 'R1', evidenceRef: 'SYNTHETIC', reviewRef: 'SYNTHETIC reviewer', status: 'ENGINEER_REVIEWED'});

describe('tension-only braces', () => {
  it('drops the compression diagonal, keeps the tension diagonal, converges and re-engages when the load reverses', () => {
    const both = analyzeLinearFrame(portal(1000));
    expect(both.elements.find(e => e.id === 'D1')!.axialForceN!).toBeGreaterThan(0);
    expect(both.elements.find(e => e.id === 'D2')!.axialForceN!).toBeLessThan(0);
    const result = tensionOnlyActiveSet(portal(1000), new Set(['D1', 'D2']), analyzeLinearFrame);
    expect(result.slack).toEqual(['D2']);
    expect(result.analysis.elements.map(e => e.id)).not.toContain('D2');
    const d1 = result.analysis.elements.find(e => e.id === 'D1')!.axialForceN!;
    expect(d1).toBeGreaterThan(both.elements.find(e => e.id === 'D1')!.axialForceN!); // the remaining diagonal carries more
    expect(result.iterations).toBeLessThanOrEqual(3);
    const reversed = tensionOnlyActiveSet(portal(-1000), new Set(['D1', 'D2']), analyzeLinearFrame);
    expect(reversed.slack).toEqual(['D1']);
    // Equilibrium of the active set: horizontal reactions balance the lateral load.
    const hx = result.analysis.nodes.reduce((s, n) => s + n.reactionForceN[0], 0);
    expect(hx).toBeCloseTo(-1000, 6);
  });
  it('leaves non-flagged bars alone and reports an unsolvable active set instead of hiding it', () => {
    const plain = tensionOnlyActiveSet(portal(1000), new Set(), analyzeLinearFrame);
    expect(plain.slack).toEqual([]); expect(plain.analysis.elements).toHaveLength(5);
    // A frame held only by a diagonal: dropping it leaves a mechanism, which must surface as an error.
    const onlyBrace: LinearFrameInput = {...portal(1000), elements: [bar('D2', 'B2', 'T1'), beam('TB', 'T1', 'T2'), beam('C2', 'B2', 'T2')],
      nodes: portal(1000).nodes.map(n => n.id === 'T1' ? {...n, boundary: ['FREE', 0, 'FREE', 0, 0, 0]} : n)};
    expect(() => tensionOnlyActiveSet(onlyBrace, new Set(['D2']), analyzeLinearFrame)).toThrow();
  });
});

describe('brace end fixings and base anchors', () => {
  const solved = tensionOnlyActiveSet(portal(1000), new Set(['D1', 'D2']), analyzeLinearFrame);
  const nodes = portal(1000).nodes.map(n => ({id: n.id, role: n.id.startsWith('B') ? 'BASE' : 'OTHER', boundary: n.boundary.map(b => ({kind: b === 'FREE' ? 'FREE' : 'FIXED'}))}));
  it('reports end demands equal to the brace axial force and anchor uplift/horizontal from reactions; missing evidence stays INCOMPLETE', () => {
    const r = screenBraceConnections({analysis: solved.analysis, actionBasis: 'SERVICE', elements: portal(1000).elements.map(e => ({id: e.id, kind: e.kind, role: e.kind === 'AXIAL_BAR' ? 'BRACE' : 'STANDARD'})), nodes, slackElementIds: solved.slack});
    const d1 = solved.analysis.elements.find(e => e.id === 'D1')!.axialForceN!;
    const ends = r.ends.filter(e => e.elementId === 'D1');
    expect(ends.map(e => e.nodeId)).toEqual(['B1', 'T2']);
    expect(ends.every(e => e.axialForceN === d1 && e.tension.demand === d1 && e.compression.demand === 0)).toBe(true);
    expect(r.ends.filter(e => e.elementId === 'D2').every(e => e.axialForceN === 0)).toBe(true);
    expect(r.anchors.map(a => a.nodeId)).toEqual(['B1', 'B2']);
    const b1 = solved.analysis.nodes.find(n => n.id === 'B1')!;
    expect(r.anchors[0].upliftN).toBeCloseTo(Math.max(0, -b1.reactionForceN[2]), 9);
    expect(r.anchors[0].horizontalN).toBeCloseTo(Math.hypot(b1.reactionForceN[0], b1.reactionForceN[1]), 9);
    expect(r.anchors.some(a => a.upliftN > 0)).toBe(true); // overturning lifts one base
    expect(r.status).toBe('INCOMPLETE');
    expect(r.blockers).toContain('D2:TENSION_ONLY_BRACE_SLACK_IN_THIS_CASE_NO_FORCE_TRANSFERRED');
    expect(r.blockers).toContain('BRACE_END_ECCENTRICITY_PIN_BEARING_SLIP_AND_HARDWARE_GEOMETRY_NOT_MODELED');
  });
  it('screens with reviewed end and anchor evidence and fails when a declared capacity is below demand', () => {
    const d1 = solved.analysis.elements.find(e => e.id === 'D1')!.axialForceN!;
    const endEvidence = {I: [reviewed('AXIAL_TENSION', 1e6), reviewed('AXIAL_COMPRESSION', 1e6)], J: [reviewed('AXIAL_TENSION', 1e6), reviewed('AXIAL_COMPRESSION', 1e6)]};
    const anchorEvidence = [reviewed('AXIAL_TENSION', 1e6), reviewed('SHEAR_Y', 1e6)];
    const elements = portal(1000).elements.map(e => ({id: e.id, kind: e.kind, role: e.kind === 'AXIAL_BAR' ? 'BRACE' : 'STANDARD', endResistance: e.kind === 'AXIAL_BAR' ? endEvidence : null}));
    const ok = screenBraceConnections({analysis: solved.analysis, actionBasis: 'SERVICE', elements, nodes: nodes.map(n => ({...n, anchorResistance: n.role === 'BASE' ? anchorEvidence : null})), slackElementIds: solved.slack});
    expect(ok.status).toBe('SCREENED'); expect(ok.constructionRelease).toBe('NO_GO');
    expect(ok.ends.find(e => e.elementId === 'D1')!.tension.utilization).toBeCloseTo(d1 / 1e6, 9);
    const weak = screenBraceConnections({analysis: solved.analysis, actionBasis: 'SERVICE', elements: elements.map(e => e.id === 'D1' ? {...e, endResistance: {...endEvidence, J: [reviewed('AXIAL_TENSION', d1 / 2), reviewed('AXIAL_COMPRESSION', 1e6)]}} : e),
      nodes: nodes.map(n => ({...n, anchorResistance: n.role === 'BASE' ? anchorEvidence : null}))});
    expect(weak.status).toBe('FAIL');
    expect(weak.ends.find(e => e.elementId === 'D1' && e.end === 'J')!.tension.status).toBe('FAIL');
  });
});
