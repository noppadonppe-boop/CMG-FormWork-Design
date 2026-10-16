import {expect, it} from 'vitest';
import {analyzeSidePressureDeck, compileSidePressure, emptySidePressure, validateSidePressure} from '../src/domain/workflowV07/sidePressure';
import {analyzeSideLayout, stampSideLayout} from '../src/domain/workflowV07/sideLayout';
import {parseWorkflowModel, previewWorkflow, regenerateDraftLayouts, reviseDraft} from '../src/domain/workflowV07/model';
import {compileLoadCase, applyLoadCases} from '../src/domain/workflowV07/loadCases';
import {applyStageStudy, captureStage, emptyStage} from '../src/domain/workflowV07/stageStudy';
import {contentHash, documentView, freezeDesign, importDraft} from '../src/domain/workflowV07/snapshot';
import {pressureApplied, pressureDefinition, pressureSource} from './fixtures/workflow-v07-side-pressure';
import {sideApplied} from './fixtures/workflow-v07-side';
import {analyzeBeam} from '../src/domain/workflowV07/beam';
import {caseDefinition} from './fixtures/workflow-v07-loadcases';

const ramp = () => pressureSource('R', {kind: 'DECLARED_LATERAL', headMm: null, x0Mm: 100, x1Mm: 400, z0Mm: 200, z1Mm: 700, p0KPa: 10, p1KPa: 0, mappingBasisRef: 'SYNTHETIC prescribed lateral field, not vertical DL conversion'});
it('reproduces uniform full-face hydrostatics through actual plywood reactions without adding pressure twice', () => {
  const m = pressureApplied(), p = previewWorkflow(m), old = previewWorkflow(sideApplied());
  expect(p.side!.faces).toHaveLength(4);
  for (let i = 0; i < 4; i++) {
    const f = p.side!.faces[i], previous = old.side!.faces[i]; expect(f.result.expectedForceN).toBe(10000); expect(f.result.pressureBaseKPa).toBe(20); expect(f.result.maximumPressureKPa).toBe(20);
    expect(f.result.pressureDeck!.residuals.forceN).toBeCloseTo(0, 7); expect(f.result.residuals.heightLeverNmm).toBeCloseTo(0, 3);
    f.result.walers.forEach((w, n) => w.supportDemands.forEach((d, j) => expect(d.forceN).toBeCloseTo(previous.result.walers[n].supportDemands[j].forceN, 7)));
    expect(f.panels).toHaveLength(8); expect(f.result.pressureDeck!.transfers.every(t => t.upstreamRevision === m.revisionId)).toBe(true);
  }
  expect(p.side!.ties.every(t => t.demandKN !== null)).toBe(true); expect(p.constructionEligible).toBe(false);
  const mixed = structuredClone(m.sideLayout!); mixed.faces[1].pressure = null;
  expect(() => analyzeSideLayout(m, stampSideLayout(m, mixed))).toThrow(/explicit pour head/); mixed.pourHeadMm = 1000;
  const partial = analyzeSideLayout(m, stampSideLayout(m, mixed)); expect(partial.faces[0].result.pressureDeck).not.toBeNull(); expect(partial.faces[1].result.pressureDeck).toBeNull(); expect(partial.faces.every(f => f.result.expectedForceN === 10000)).toBe(true); expect(partial.blockers).toContain('SIDE_MIXED_HYDROSTATIC_AND_DECLARED_PRESSURE_METHODS_REQUIRE_REVIEW');
});
it('retains actual partial X/Z patch geometry and unequal plywood reactions, conserving force and both first moments to studs', () => {
  const m = pressureApplied(), patches = compileSidePressure(m, pressureDefinition([ramp()]), 1000), deck = analyzeSidePressureDeck({faceId: 'F1', revision: 'R', lengthMm: 1000, heightMm: 1000, studsMm: [0, 250, 500, 750, 1000], E_MPa: 8000, I_mm4: 144000, patches});
  expect(deck.expectedForceN).toBe(750); expect(deck.expectedXMomentNmm).toBe(187500); expect(deck.expectedZMomentNmm).toBe(275000); expect(deck.maximumPressureKPa).toBe(10); expect(deck.pressureBaseKPa).toBe(0);
  expect(deck.residuals.forceN).toBeCloseTo(0, 6); expect(deck.residuals.xLeverNmm).toBeCloseTo(0, 5); expect(deck.residuals.zLeverNmm).toBeCloseTo(0, 5);
  const panel = deck.panels.find(p => p.startMm === 0 && p.lowerZMm === 200 && p.evaluationZMm === 200)!;
  expect(panel.analysis.input.patches[0]).toMatchObject({startMm: 100, endMm: 250, startNPerMm: 10}); expect(-panel.analysis.reactions[0].forceN).toBeCloseTo(450, 7); expect(-panel.analysis.reactions[1].forceN).toBeCloseTo(1050, 7);
  expect(deck.studPatches[1].find(p => p.startMm === 200)).toMatchObject({startNPerMm: expect.closeTo(2.1, 8), endNPerMm: 0});
  expect(deck.sourceResultants[0].centroidZMm).toBeCloseTo(1100 / 3, 8);
});
it('carries custom patch forces and global vector moments through the actual face, paired walers and source centroid', () => {
  const m = pressureApplied(), layout = structuredClone(m.sideLayout!); layout.faces = [layout.faces[0]]; layout.faces[0].pressure = pressureDefinition([ramp()]); layout.ties = [];
  const shifted = {...m, vertices: m.vertices.map(p => ({x: p.x + 7000, y: p.y - 5000}))}, ready = regenerateDraftLayouts(shifted, {sideLayout: stampSideLayout(shifted, layout)}), p = previewWorkflow(ready), f = p.side!.faces[0];
  expect(f.result.expectedForceN).toBe(750); expect(f.result.residuals.faceLeverNmm).toBeCloseTo(0, 5); expect(f.result.residuals.heightLeverNmm).toBeCloseTo(0, 5);
  const c = f.pressureAction.centroid!; expect(c.x).toBeCloseTo(7250, 8); expect(c.zMm).toBeCloseTo(2000 + 1100 / 3, 8);
  const n = f.face.normal, moments = p.side!.nodes.reduce((s, r) => ({fx: s.fx + r.forceN * n.x, fy: s.fy + r.forceN * n.y, mx: s.mx - r.point.zMm * r.forceN * n.y, my: s.my + r.point.zMm * r.forceN * n.x, mz: s.mz + r.point.xMm * r.forceN * n.y - r.point.yMm * r.forceN * n.x}), {fx: 0, fy: 0, mx: 0, my: 0, mz: 0});
  expect(moments.fx).toBeCloseTo(750 * n.x, 6); expect(moments.fy).toBeCloseTo(750 * n.y, 6); expect(moments.mx).toBeCloseTo(-c.zMm * 750 * n.y, 3); expect(moments.my).toBeCloseTo(c.zMm * 750 * n.x, 3); expect(moments.mz).toBeCloseTo(c.x * 750 * n.y - c.y * 750 * n.x, 3);
});
it('uses separate heads on disjoint real face regions and reports a nonuniform base field without inventing one scalar base pressure', () => {
  const m = pressureApplied(), definition = pressureDefinition([pressureSource('A', {x1Mm: 500, headMm: 500}), pressureSource('B', {x0Mm: 500, headMm: 1000})]), patches = compileSidePressure(m, definition, 1000);
  const deck = analyzeSidePressureDeck({faceId: 'F1', revision: 'R', lengthMm: 1000, heightMm: 1000, studsMm: [0, 250, 500, 750, 1000], E_MPa: 8000, I_mm4: 144000, patches});
  expect(deck.expectedForceN).toBe(6250); expect(deck.pressureBaseKPa).toBeNull(); expect(deck.maximumPressureKPa).toBe(20); expect(deck.sourceResultants.map(r => r.forceN)).toEqual([1250, 5000]);
  expect(deck.panels.some(p => p.lowerZMm === 500 && p.evaluationZMm === 500)).toBe(true); expect(deck.residuals.zLeverNmm).toBeCloseTo(0, 4);
});
it('retains both endpoint load shapes and bounds an interior-Z response instead of replacing different patches with their mean pressure', () => {
  const m = pressureApplied(), a = {...ramp(), id: 'A', ownershipId: 'A', x0Mm: 0, x1Mm: 250, z0Mm: 0, z1Mm: 1000}, b = {...ramp(), id: 'B', ownershipId: 'B', x0Mm: 250, x1Mm: 500, z0Mm: 0, z1Mm: 1000, p0KPa: 0, p1KPa: 10};
  const deck = analyzeSidePressureDeck({faceId: 'F', revision: 'R', lengthMm: 1000, heightMm: 1000, studsMm: [0, 500, 1000], E_MPa: 8000, I_mm4: 144000, patches: compileSidePressure(m, pressureDefinition([a, b]), 1000)}), ends = deck.panels.filter(p => p.startMm === 0);
  expect(ends).toHaveLength(2); ends.forEach(p => expect(p.analysis.maxMomentNmm).toBeCloseTo(9 * 10 * 500 ** 2 / 128, 5));
  const middle = analyzeBeam({id: 'HAND-MID', revision: 'R', lengthMm: 500, E_MPa: 8000, I_mm4: 144000, supports: [{id: 'A', xMm: 0}, {id: 'B', xMm: 500}], points: [], patches: [{id: 'KNOWN-MID-UDL', startMm: 0, endMm: 500, startNPerMm: 5, endNPerMm: 5}]});
  expect(middle.maxMomentNmm).toBeCloseTo(5 * 500 ** 2 / 8, 5); expect(middle.maxMomentNmm).toBeLessThan(ends[0].analysis.maxMomentNmm); expect(deck.studPatches[0][0]).toMatchObject({startNPerMm: expect.closeTo(1.875, 8), endNPerMm: expect.closeTo(.625, 8)});
});
it('requires complete face scope and cited independent lateral pressure, without inserting omitted hydrostatic pressure or converting DL/LL', () => {
  const m = pressureApplied(); expect(() => compileSidePressure(m, emptySidePressure(), 1000)).toThrow(/Complete face/);
  const definition = pressureDefinition([ramp()]); definition.sources[0].mappingBasisRef = ''; expect(() => compileSidePressure(m, definition, 1000)).toThrow(/own mapping/);
  definition.sources[0].mappingBasisRef = 'SYNTHETIC'; const original = compileSidePressure(m, definition, 1000), changed = compileSidePressure({...m, gammaKNm3: null, additionalDeadKPa: 9999, constructionLiveKPa: 8888}, definition, 1000);
  expect(changed).toEqual(original); expect(changed).toHaveLength(1); expect(changed[0].kind).toBe('DECLARED_LATERAL');
});
it('keeps zero head and empty declared field explicit and does not turn unknown heads/pressure/gamma into zero even with zero factors', () => {
  const m = pressureApplied(), layout = structuredClone(m.sideLayout!); layout.faces.forEach(f => f.pressure = pressureDefinition([]));
  let p = previewWorkflow(regenerateDraftLayouts(m, {sideLayout: stampSideLayout(m, layout)})); expect(p.side!.faces.every(f => f.result.expectedForceN === 0 && f.pressureAction.centroid === null)).toBe(true);
  layout.faces.forEach(f => f.pressure = pressureDefinition([pressureSource('ZERO', {headMm: 0})])); p = previewWorkflow(regenerateDraftLayouts(m, {sideLayout: stampSideLayout(m, layout)})); expect(p.side!.faces[0].result.pressureDeck!.patches[0].z1Mm).toBe(0); expect(p.side!.faces[0].result.expectedForceN).toBe(0);
  expect(() => compileSidePressure(m, pressureDefinition([pressureSource('X', {headMm: null})]), 1000)).toThrow(/local hydrostatic head/);
  const c = caseDefinition('ZERO', {stageId: 'TEST-POUR'}); c.factors.HYDROSTATIC_SIDE = 0; const broken = structuredClone(m); broken.gammaKNm3 = null; expect(previewWorkflow(compileLoadCase(broken, c)).side).toBeNull();
  const r = ramp(); r.p0KPa = null; expect(() => compileSidePressure(m, pressureDefinition([r]), 1000)).toThrow(/actual outward pressure/);
});
it('rejects overlapping hydrostatic sources, duplicate ownership, outside/invalid extents, competing inputs and signed inward pressure', () => {
  const m = pressureApplied(), check = (sources: ReturnType<typeof pressureSource>[], pattern: RegExp) => expect(() => compileSidePressure(m, pressureDefinition(sources), 1000)).toThrow(pattern);
  check([pressureSource('A'), pressureSource('B')], /overlapping concrete/); check([pressureSource('A', {x1Mm: 500}), pressureSource('B', {x0Mm: 500, ownershipId: 'SYN-A'})], /Duplicate pressure/);
  check([pressureSource('X', {headMm: 1001})], /above physical/); check([pressureSource('X', {x1Mm: 1001})], /outside actual/); check([pressureSource('X', {p0KPa: 10})], /competing pressure/);
  check([{...ramp(), z0Mm: 700, z1Mm: 200}], /Z extent/);
  const c = caseDefinition('IN', {stageId: 'TEST-POUR'}); c.factors.WIND = -1; const source = {...ramp(), kind: 'WIND' as const}; expect(() => compileSidePressure({...m, analysisCase: c}, pressureDefinition([source]), 1000)).toThrow(/signed suction/);
});
it('factors hydrostatic, declared lateral, wind and placement pressures independently once and retains raw authored input', () => {
  const m = pressureApplied(), layout = structuredClone(m.sideLayout!); layout.faces.forEach(f => f.pressure!.sources.push({...ramp(), id: 'U', x0Mm: 0, x1Mm: 1000, z0Mm: 0, z1Mm: 1000, p0KPa: 2, p1KPa: 2}));
  const ready = regenerateDraftLayouts(m, {sideLayout: stampSideLayout(m, layout)}), c = caseDefinition('FACTORED', {stageId: 'TEST-POUR'}); c.factors.HYDROSTATIC_SIDE = .5; c.factors.OTHER = 3; c.factors.CONCRETE = 100; c.factors.ADDITIONAL_DL = 200;
  const child = compileLoadCase(ready, c), p = previewWorkflow(child); expect(p.side!.faces[0].result.expectedForceN).toBe(11000); expect(p.side!.faces[0].result.maximumPressureKPa).toBe(16); expect(child.sideLayout!.faces[0].pressure).toEqual(ready.sideLayout!.faces[0].pressure);
  const wind = {...ramp(), kind: 'WIND' as const}; const placement = {...ramp(), id: 'P', ownershipId: 'SYN-P', kind: 'PLACEMENT' as const}; c.factors.WIND = 2; c.factors.PLACEMENT = 4;
  const ps = compileSidePressure({...m, analysisCase: c}, pressureDefinition([wind, placement]), 1000); expect(ps.map(p => p.p0KPa)).toEqual([20, 40]);
  c.factors.WIND = 1e308; expect(() => compileSidePressure({...m, analysisCase: c}, pressureDefinition([wind]), 1000)).toThrow(/Finite nonnegative/);
});
it('preserves unequal opposite-end demands for a changed pressure field instead of averaging or reusing the full-pour tie load', () => {
  const m = pressureApplied(), layout = structuredClone(m.sideLayout!); layout.faces[0].pressure = pressureDefinition([pressureSource('PART', {headMm: 500})]);
  const r = analyzeSideLayout(m, stampSideLayout(m, layout)); expect(r.faces[0].result.expectedForceN).toBe(2500); expect(r.faces[2].result.expectedForceN).toBe(10000); expect(r.ties.filter(t => t.a.faceId === 'F1').every(t => t.demandKN === null)).toBe(true);
  expect(r.blockers.some(b => b.includes('OPPOSITE_END_DEMANDS_REQUIRE_COUPLED_MODEL'))).toBe(true);
});
it('keeps every actual endpoint-panel requirement and Stage/case source in the same revision without substituting old envelope rows', () => {
  const m = pressureApplied(), c = caseDefinition('SIDE', {stageId: 'TEST-POUR'}); c.factors.HYDROSTATIC_SIDE = .5;
  const cases = applyLoadCases(m, {schemaVersion: '1', cases: [c]}), record = captureStage(cases, {...emptyStage('PRESSURE'), stageId: 'TEST-POUR', evidenceRef: 'SYNTHETIC scope'}), ready = applyStageStudy(cases, {schemaVersion: '1', stages: [record]}), p = previewWorkflow(ready), stage = p.stageStudy!.stages[0];
  expect(stage.preview!.side!.faces[0].result.expectedForceN).toBe(10000); expect(stage.preview!.loadCases!.cases[0].preview!.side!.faces[0].result.expectedForceN).toBe(5000);
  const requirements = p.requiredChecks.filter(r => r.checkId === 'SIDE-01'); expect(requirements).toHaveLength(64); expect(requirements.every(r => r.memberId.includes(':ZONE:') && r.revision === ready.revisionId)).toBe(true); expect(p.coverageReview.checkedCount).toBe(0);
});
it('makes source edits/reimports stale and retains raw/actual pressure, reactions and force centroids in tamper-checked frozen documents', async () => {
  const m = pressureApplied(), frozen = await freezeDesign(m), view = await documentView(frozen, m); expect(view.report.preview.side!.faces[0].result.pressureDeck!.sourceResultants[0].forceN).toBe(10000);
  const layout = structuredClone(m.sideLayout!); layout.faces[0].pressure!.sources[0].headMm = 600; const changed = reviseDraft(m, {sideLayout: stampSideLayout(m, layout)}); expect(previewWorkflow(changed).side).toBeNull(); expect((await documentView(frozen, changed)).freshness).toBe('STALE');
  expect(previewWorkflow(importDraft(m)).side).toBeNull(); const forged = structuredClone(frozen); forged.content.preview.side!.faces[0].result.pressureDeck!.sourceResultants[0].forceN = 0; forged.snapshotHash = await contentHash(forged.content); await expect(documentView(forged, m)).rejects.toThrow(/calculation mismatch/);
  expect(view.constructionEligible).toBe(false);
});
it('rejects authority/invalid imported data and bounded face/global analysis sizes without omitting any pressure zones', () => {
  const m = pressureApplied(), bad = structuredClone(m); Object.assign(bad.sideLayout!.faces[0].pressure!, {approved: true}); expect(() => parseWorkflowModel(bad)).toThrow(/authority/);
  expect(() => validateSidePressure(pressureDefinition(Array.from({length: 41}, (_, i) => pressureSource(`X${i}`))))).toThrow(/40-source/);
  expect(() => validateSidePressure(pressureDefinition([pressureSource('X', {headMm: NaN})]))).toThrow();
  const large = structuredClone(m.sideLayout!); large.ties = []; large.faces = [large.faces[0]]; large.faces[0].pressure = pressureDefinition(Array.from({length: 40}, (_, i) => ({...ramp(), id: `X${i}`, ownershipId: `OWN${i}`, z0Mm: 20 * i, z1Mm: 20 * i + 10})));
  expect(() => analyzeSideLayout(m, stampSideLayout(m, large))).toThrow(/exceeds 400/);
});
