import {describe, expect, it} from 'vitest';
import {analyzeSidePressureDeck, sheetSegments, type PressurePatch} from '../src/domain/workflowV07/sidePressure';
import {analyzeSideLayout, stampSideLayout} from '../src/domain/workflowV07/sideLayout';
import {sideDefinition, sideModel} from './fixtures/workflow-v07-side';

const uniform: PressurePatch[] = [{id: 'P', ownershipId: 'SYNTHETIC', kind: 'DECLARED_LATERAL', x0Mm: 0, x1Mm: 600, z0Mm: 0, z1Mm: 1000, p0KPa: 20, p1KPa: 20}];
const deck = (sheetJointsMm: number[] | null) => analyzeSidePressureDeck({faceId: 'F', revision: 'R', lengthMm: 600, heightMm: 1000, studsMm: [0, 300, 600], E_MPa: 10000, I_mm4: 1000 * 18 ** 3 / 12, patches: uniform, sheetJointsMm});

describe('plywood sheet continuity', () => {
  it('a two-span continuous sheet puts 1.25·wL on the interior stud (3/8·wL on the ends) while the simple-span model gives 1.0·wL; total is conserved', () => {
    const simple = deck(null), continuous = deck([]);
    const w = 20 / 1000 * 1000, L = 300; // N/mm on the 1 m strip
    const interior = (d: ReturnType<typeof deck>) => d.studPatches[1][0].startNPerMm * 1000, end = (d: ReturnType<typeof deck>) => d.studPatches[0][0].startNPerMm * 1000;
    expect(interior(simple)).toBeCloseTo(w * L, 6);
    expect(end(simple)).toBeCloseTo(0.5 * w * L, 6);
    expect(interior(continuous)).toBeCloseTo(1.25 * w * L, 6);
    expect(end(continuous)).toBeCloseTo(0.375 * w * L, 6);
    expect(continuous.studPatches.flat().reduce((s, p) => s + (p.endMm - p.startMm) * (p.startNPerMm + p.endNPerMm) / 2, 0)).toBeCloseTo(continuous.expectedForceN, 6);
    expect(continuous.segments).toEqual([{startMm: 0, endMm: 600, studsMm: [0, 300, 600]}]);
    // Continuous strip: lower midspan moment, support moment w·L²/8 at the interior stud.
    const m = continuous.panels[0].analysis.maxMomentNmm, mSimple = simple.panels[0].analysis.maxMomentNmm;
    expect(mSimple).toBeCloseTo(w * L * L / 8, 6); expect(m).toBeCloseTo(w * L * L / 8, 6); // hogging over the middle support equals the simple-span midspan value
    expect(continuous.panels[0].analysis.maxDeflectionMm).toBeLessThan(simple.panels[0].analysis.maxDeflectionMm);
  });
  it('rejects sheet joints that are not on a stud and keeps declared joints as segment boundaries', () => {
    expect(() => sheetSegments([0, 300, 600], 600, [150])).toThrow(/not on a stud/);
    expect(sheetSegments([0, 300, 600, 900], 900, [300])).toEqual([{startMm: 0, endMm: 300, studsMm: [0, 300]}, {startMm: 300, endMm: 900, studsMm: [300, 600, 900]}]);
    expect(sheetSegments([0, 300, 600], 600, null)).toHaveLength(2);
  });
  it('side layout accepts continuous sheets with declared joints, changes stud/waler demands, and blocks inconsistent declarations', () => {
    const model = sideModel(), base = sideDefinition();
    const rigid = analyzeSideLayout(model, stampSideLayout(model, base));
    const def = sideDefinition();
    for (const f of def.faces) {f.plywood.jointsAtEveryStud = false; f.plywood.sheetJointsMm = [500];}
    const continuous = analyzeSideLayout(model, stampSideLayout(model, def));
    // Stud at the sheet joint (x = 500) is an end support of both sheets; its neighbours become interior supports and attract more load.
    const stud = (r: typeof rigid, i: number) => r.faces[0].result.studs[i].analysis.reactions.reduce((s, q) => s - q.forceN, 0);
    expect(stud(continuous, 1)).toBeGreaterThan(stud(rigid, 1) * 1.2);
    expect(stud(continuous, 2)).toBeLessThan(stud(rigid, 2));
    expect([0, 1, 2, 3, 4].reduce((s, i) => s + stud(continuous, i), 0)).toBeCloseTo([0, 1, 2, 3, 4].reduce((s, i) => s + stud(rigid, i), 0), 4);
    expect(continuous.blockers.some(b => b.includes('CONTINUOUS_SHEET_STRIPS'))).toBe(true);
    const bad = sideDefinition(); bad.faces[0].plywood.jointsAtEveryStud = false; bad.faces[0].plywood.sheetJointsMm = [333];
    expect(() => analyzeSideLayout(model, stampSideLayout(model, bad))).toThrow(/not on a stud/);
    const mixed = sideDefinition(); mixed.faces[0].plywood.sheetJointsMm = [500];
    expect(() => analyzeSideLayout(model, stampSideLayout(model, mixed))).toThrow(/apply only to continuous/);
    const missing = sideDefinition(); missing.faces[0].plywood.jointsAtEveryStud = false;
    expect(() => analyzeSideLayout(model, stampSideLayout(model, missing))).toThrow(/declared sheet joint positions/);
  });
});
