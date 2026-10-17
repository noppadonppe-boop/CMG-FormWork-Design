import {describe, expect, it} from 'vitest';
import {analyzeBeam, beamAt, type BeamInput} from '../src/domain/workflowV07/beam';
import {analyzeLoadPath, type PathMember} from '../src/domain/workflowV07/loadPath';
import {analyzeSidePanel} from '../src/domain/workflowV07/sidePanel';

const beam = (patch: Partial<BeamInput> = {}): BeamInput => ({id: 'B1', revision: 'R1', lengthMm: 1000, E_MPa: 200000, I_mm4: 1e6,
  supports: [{id: 'A', xMm: 0}, {id: 'B', xMm: 1000}], points: [], patches: [], ...patch});
const udl = (start = 10, end = start) => [{id: 'q', startMm: 0, endMm: 1000, startNPerMm: start, endNPerMm: end}];

describe('independent continuous-beam benchmarks, N/mm/MPa', () => {
  it('prescribed middle-support settlement of a two-span beam gives 6EIδ/L³ and 3EIδ/L³ self-equilibrated reactions', () => {
    const L = 1000, delta = 2, EI = 200000 * 1e6;
    const r = analyzeBeam(beam({lengthMm: 2 * L, supports: [{id: 'A', xMm: 0}, {id: 'M', xMm: L, displacementMm: delta}, {id: 'C', xMm: 2 * L}]}));
    expect(r.reactions.find(q => q.supportId === 'M')!.forceN).toBeCloseTo(6 * EI * delta / L ** 3, 6);
    expect(r.reactions.find(q => q.supportId === 'A')!.forceN).toBeCloseTo(-3 * EI * delta / L ** 3, 6);
    expect(r.maxMomentNmm).toBeCloseTo(3 * EI * delta / L ** 2, 3);
    expect(r.maxDeflectionMm).toBeCloseTo(delta, 9);
  });
  it('uniform simply-supported beam agrees with the hand solution', () => {
    const r = analyzeBeam(beam({patches: udl()}));
    expect(r.reactions.map(s => s.forceN)).toEqual([-5000, -5000]);
    expect(r.maxMomentNmm).toBeCloseTo(1250000, 5);
    expect(r.maxDeflectionMm).toBeCloseTo(.6510416666666667, 10);
    expect(r.criticalStations.moment).toMatchObject({stationMm: 500, segmentIndex: 0, side: 'INTERIOR'});
    expect(r.criticalStations.deflection.stationMm).toBeCloseTo(500, 8);
    expect(r.criticalStations.shear).toMatchObject({stationMm: 0, side: 'RIGHT_LIMIT'});
    expect(beamAt(r.segments[0], 1000).deflectionMm).toBeCloseTo(0, 10);
  });
  it('central and quarter-span point loads agree with analytical solutions', () => {
    const middle = analyzeBeam(beam({points: [{id: 'P', xMm: 500, forceN: 10000}]}));
    expect(middle.maxMomentNmm).toBeCloseTo(2500000, 5);
    expect(middle.maxDeflectionMm).toBeCloseTo(1.0416666666666667, 10);
    const quarter = analyzeBeam(beam({points: [{id: 'P', xMm: 250, forceN: 12000}]}));
    expect(quarter.reactions.map(s => Math.round(s.forceN))).toEqual([-9000, -3000]);
    expect(quarter.maxDeflectionMm).toBeCloseTo(12000 * 250 * (1000 ** 2 - 250 ** 2) ** 1.5 / (9 * Math.sqrt(3) * 1000 * 200000 * 1e6), 10);
    const nearEnd = analyzeBeam(beam({points: [{id: 'P', xMm: 900, forceN: 10000}]}));
    expect(nearEnd.maxShearN).toBeCloseTo(9000, 7);
    expect(nearEnd.criticalStations.shear).toMatchObject({stationMm: 900, segmentIndex: 1, side: 'RIGHT_LIMIT'});
  });
  it('triangular load has unequal reactions and a true off-centre maximum', () => {
    const r = analyzeBeam(beam({patches: udl(0, 12)}));
    expect(r.reactions[0].forceN).toBeCloseTo(-2000, 7);
    expect(r.reactions[1].forceN).toBeCloseTo(-4000, 7);
    expect(r.maxMomentNmm).toBeCloseTo(12 * 1000 ** 2 / (9 * Math.sqrt(3)), 5);
    expect(r.criticalStations.moment.stationMm).toBeCloseTo(1000 / Math.sqrt(3), 7);
    expect(r.criticalStations.shear).toMatchObject({stationMm: 1000, side: 'LEFT_LIMIT'});
    // Integrating the triangular-load ODE gives y/(wL^4/EI)=7r/360-r^3/36+r^5/120.
    const stationRatio = Math.sqrt(1 - 2 * Math.sqrt(30) / 15);
    expect(r.maxDeflectionMm).toBeCloseTo(12 * 1000 ** 4 / (200000 * 1e6) *
      (7 * stationRatio / 360 - stationRatio ** 3 / 36 + stationRatio ** 5 / 120), 10);
    expect(r.criticalStations.deflection.stationMm).toBeCloseTo(1000 * stationRatio, 7);
  });
  it('two equal continuous spans retain the middle reaction, not pinned-bay reactions', () => {
    const r = analyzeBeam(beam({lengthMm: 1200, supports: [{id: 'A', xMm: 0}, {id: 'B', xMm: 600}, {id: 'C', xMm: 1200}],
      patches: [{id: 'q', startMm: 0, endMm: 1200, startNPerMm: 32.4, endNPerMm: 32.4}]}));
    expect(r.reactions.map(s => -s.forceN / 1000)).toEqual(expect.arrayContaining([expect.closeTo(7.29, 8), expect.closeTo(24.3, 8)]));
    expect(r.maxMomentNmm).toBeCloseTo(32.4 * 600 ** 2 / 8, 5);
    expect(r.forceResidualN).toBeCloseTo(0, 6); expect(r.momentResidualNmm).toBeCloseTo(0, 4);
  });
  it('fixed cantilever and loaded overhang include restraint moment/uplift', () => {
    const r = analyzeBeam(beam({supports: [{id: 'FIX', xMm: 0, rotationFixed: true}], points: [{id: 'tip', xMm: 1000, forceN: 10000}]}));
    expect(r.reactions[0].forceN).toBeCloseTo(-10000, 7);
    expect(r.reactions[0].momentNmm).toBeCloseTo(-10000000, 5);
    expect(r.maxDeflectionMm).toBeCloseTo(10000 * 1000 ** 3 / (3 * 200000 * 1e6), 10);
    const overhang = analyzeBeam(beam({supports: [{id: 'A', xMm: 200}, {id: 'B', xMm: 800}], points: [{id: 'tip', xMm: 1000, forceN: 6000}]}));
    expect(overhang.reactions[0].forceN).toBeCloseTo(2000, 6);
    expect(overhang.reactions[1].forceN).toBeCloseTo(-8000, 6);
  });
  it('direct support loads are counted once, and mechanisms/invalid supports are rejected', () => {
    const r = analyzeBeam(beam({points: [{id: 'P', xMm: 0, forceN: 5000}]}));
    expect(r.maxMomentNmm).toBe(0); expect(r.maxDeflectionMm).toBe(0); expect(r.reactions[0].forceN).toBe(-5000);
    expect(() => analyzeBeam(beam({supports: [{id: 'A', xMm: 0}]}))).toThrow(/UNSTABLE/);
    expect(() => analyzeBeam(beam({supports: [{id: 'A', xMm: 0}, {id: 'B', xMm: 0}]}))).toThrow(/Duplicate/);
    expect(() => analyzeBeam(beam({E_MPa: NaN}))).toThrow();
    expect(() => analyzeBeam(beam({points: [{id: 'P', xMm: 500, forceN: -1}]}))).toThrow();
  });
});

export function soffitPath(): PathMember[] {
  return [250, 750].map((x, i): PathMember => ({role: 'JOIST', placement: {axis: 'Y', origin: {xMm: x, yMm: 0, zMm: 3000}},
    beam: beam({id: `J${i}`, patches: udl(i === 0 ? 10 : 20)}), links: [{supportId: 'A', target: {kind: 'MEMBER', memberId: 'B0', xMm: x}}, {supportId: 'B', target: {kind: 'MEMBER', memberId: 'B1', xMm: x}}]}))
    .concat([0, 1].map((i): PathMember => ({role: 'BEARER', placement: {axis: 'X', origin: {xMm: 0, yMm: i * 1000, zMm: 2900}}, beam: beam({id: `B${i}`}),
      links: [{supportId: 'A', target: {kind: 'U_HEAD', nodeId: `H${i}A`}}, {supportId: 'B', target: {kind: 'U_HEAD', nodeId: `H${i}B`}}]})));
}
describe('actual load paths', () => {
  it('transfers joist reactions at their actual coordinates and gives unequal head reactions', () => {
    const r = analyzeLoadPath(soffitPath());
    expect(r.reactions.map(q => q.forceN)).toEqual(expect.arrayContaining([expect.closeTo(6250, 6), expect.closeTo(8750, 6)]));
    expect(r.reactions.reduce((s, q) => s + q.forceN, 0)).toBeCloseTo(30000, 6);
    expect(r.reactions[0].point).toEqual({xMm: 0, yMm: 0, zMm: 2900});
    expect(r.reactions.every(q => q.upstreamRevision === 'R1')).toBe(true);
  });
  it('rejects missing links, off-bearer nodes and mixed revisions', () => {
    const missing = soffitPath(); missing[0].links.pop(); expect(() => analyzeLoadPath(missing)).toThrow(/Every support/);
    const misplaced = soffitPath(); misplaced[0].placement.origin.xMm = 100; expect(() => analyzeLoadPath(misplaced)).toThrow(/not on receiving/);
    const stale = soffitPath(); stale[0].beam.revision = 'R0'; expect(() => analyzeLoadPath(stale)).toThrow(/STALE/);
  });
  it('side-panel hydrostatic load flows through every stud/rail at actual coordinates', () => {
    const r = analyzeSidePanel({faceId: 'F1', revision: 'R1', lengthMm: 1000, heightMm: 1000, pourHeadMm: 1000, gammaKNm3: 20,
      studPositionsMm: [0, 250, 500, 750, 1000], walerLevelsMm: [0, 1000], walerSupports: [{id: 'A', xMm: 0}, {id: 'B', xMm: 1000}],
      studE_MPa: 200000, studI_mm4: 1e6, railE_MPa: 200000, railI_mm4: 1e6, heavierRailShare: .6, sharingEvidence: null});
    expect(r.studs.reduce((s, q) => s + q.analysis.totalLoadN, 0)).toBeCloseTo(10000, 6);
    expect(r.walers.flatMap(w => w.supportDemands).reduce((s, q) => s + q.forceN, 0)).toBeCloseTo(10000, 6);
    expect(r.walers[0].supportDemands[0].forceN).toBeCloseTo(10000 / 3, 6);
    expect(r.blockers).toContain('UNVERIFIED_RAIL_SHARING'); expect(r.constructionRelease).toBe('NO_GO');
  });
});
