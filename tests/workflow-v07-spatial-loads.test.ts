import {expect, it} from 'vitest';
import {analyzePlywoodDeck} from '../src/domain/workflowV07/plywood';
import {applyLoadCases, compileLoadCase} from '../src/domain/workflowV07/loadCases';
import {previewWorkflow, regenerateDraftLayouts, reviseDraft, parseWorkflowModel} from '../src/domain/workflowV07/model';
import {buildSoffitCandidate} from '../src/domain/workflowV07/soffit';
import {emptySpatialLoading, validateSpatialLoading} from '../src/domain/workflowV07/spatialLoads';
import {captureStage, applyStageStudy, emptyStage} from '../src/domain/workflowV07/stageStudy';
import {documentView, contentHash, freezeDesign} from '../src/domain/workflowV07/snapshot';
import {plywoodFixture} from './fixtures/workflow-v07-plywood';
import {region, spatialApplied, spatialDefinition} from './fixtures/workflow-v07-spatial-loads';
import {caseDefinition, loadCaseSource} from './fixtures/workflow-v07-loadcases';
import {layoutFixture, slabModel} from './fixtures/workflow-v07-soffit';
import {coverageModel} from './fixtures/workflow-v07-coverage';

it('uses actual partial-span plywood patches and unequal statics reactions, preserving X/Y first moments without spreading the load', () => {
  const p = analyzePlywoodDeck({modelId: 'SYN', revision: 'R', stageId: 'S', loadCaseId: 'L', joistXMm: [0, 600, 1200], definition: plywoodFixture(),
    surfaces: [{id: 'PATCH', kind: 'PLACEMENT', startX: 100, endX: 400, startY: 200, endY: 700, qKPa: 10}]});
  expect(p.expectedForceN).toBe(1500); expect(p.residuals.forceN).toBeCloseTo(0, 7); expect(p.residuals.xLeverNmm).toBeCloseTo(0, 5); expect(p.residuals.yLeverNmm).toBeCloseTo(0, 5);
  const strip = p.strips.find(s => s.startXMm === 0 && s.startYMm === 200)!;
  expect(strip.analysis.input.patches).toEqual([{id: 'PATCH', startMm: 100, endMm: 400, startNPerMm: 10, endNPerMm: 10}]);
  expect(-strip.analysis.reactions[0].forceN).toBeCloseTo(1750, 7); expect(-strip.analysis.reactions[1].forceN).toBeCloseTo(1250, 7); expect(strip.qKPa).toBe(5);
  const joists = p.transfers.filter(t => t.startYMm === 200); expect(joists.find(t => t.targetJoistId === 'JOIST-1')!.lineLoadNPerMm).toBeCloseTo(1.75, 8);
  expect(joists.find(t => t.targetJoistId === 'JOIST-2')!.lineLoadNPerMm).toBeCloseTo(1.25, 8); expect(p.strips.find(s => s.startXMm === 600 && s.startYMm === 200)!.analysis.totalLoadN).toBe(0);
});
it('replaces full-stage concrete distribution with actual half placement and transmits separate direct point/line actions once', () => {
  const m = spatialApplied(), p = previewWorkflow(m); expect(p.soffit!.ownedForceN).toEqual({concrete: 6480, additionalDead: 1800, constructionLive: 9000, componentSelfWeight: 0});
  expect(p.soffit!.additionalForceN).toBe(2200); expect(p.soffit!.expectedForceN).toBe(19480); expect(p.soffit!.terminalForceN).toBeCloseTo(19480, 6);
  expect(p.soffit!.momentResidual!.xLeverNmm).toBeCloseTo(0, 4); expect(p.soffit!.momentResidual!.yLeverNmm).toBeCloseTo(0, 4);
  const reactions = p.loadPath!.reactions, xMoment = reactions.reduce((s, r) => s + r.forceN * r.point.xMm, 0), yMoment = reactions.reduce((s, r) => s + r.forceN * r.point.yMm, 0);
  expect(xMoment).toBeCloseTo(6480 * 600 + (1800 + 9000 + 2200) * 1200, 5); expect(yMoment).toBeCloseTo((6480 + 1800 + 9000) * 750 + 1000 * 300 + 1200 * 1500, 5);
  expect(p.loadPath!.analyses.find(a => a.id === 'JOIST-3')!.input.points).toContainEqual({id: 'EXTRA:POINT', xMm: 300, forceN: 1000});
  expect(p.loadPath!.analyses.find(a => a.id === 'B2')!.input.patches).toContainEqual({id: 'EXTRA:LINE', startMm: 600, endMm: 1800, startNPerMm: 1, endNPerMm: 1});
  expect(m.gammaKNm3).toBe(24); expect(m.heightMm).toBe(150); expect(p.constructionEligible).toBe(false);
});
it('respects asymmetric non-joist-aligned patch boundaries and physical translations without midpoint tributary approximation', () => {
  const m = spatialApplied(), l = structuredClone(m.soffitLayout!); l.loading!.regions[0] = region('C', {x0: 100, x1: 700, y0: 200, y1: 700, placedDepthMm: 100}); l.loading!.memberActions = [];
  const shifted = {...m, vertices: m.vertices.map(p => ({x: p.x + 300, y: p.y - 200}))}, ready = regenerateDraftLayouts(shifted, {soffitLayout: l}), p = previewWorkflow(ready);
  expect(p.soffit!.ownedForceN.concrete).toBe(720); expect(p.soffit!.terminalForceN).toBeCloseTo(11520, 6);
  expect(p.loadPath!.reactions.reduce((s, r) => s + r.forceN * r.point.xMm, 0)).toBeCloseTo(720 * 700 + 10800 * 1500, 5);
  expect(p.loadPath!.reactions.reduce((s, r) => s + r.forceN * r.point.yMm, 0)).toBeCloseTo(720 * 250 + 10800 * 550, 5);
});
it('requires complete explicit spatial scope and does not fill empty stage regions with full-strip default loads', () => {
  const m = spatialApplied(), l = structuredClone(m.soffitLayout!); l.loading = emptySpatialLoading(); expect(() => buildSoffitCandidate(m, l)).toThrow(/Complete spatial/);
  l.loading = {...spatialDefinition(), regions: [], memberActions: []}; const c = buildSoffitCandidate(m, l); expect(c.expectedForceN).toBe(0); expect(c.plywood!.strips.every(s => s.analysis.totalLoadN === 0)).toBe(true);
  l.loading.omittedAreasEvidenceRef = ''; expect(() => buildSoffitCandidate(m, l)).toThrow(/omitted-area/);
  l.loading = spatialDefinition(); l.loading.regions[0].placedDepthMm = null; expect(() => buildSoffitCandidate(m, l)).toThrow(/placed concrete depth/);
});
it('keeps unknown source magnitudes unknown even with empty regions, zero factors or an explicitly zero direct action', () => {
  const m = spatialApplied(), l = {...m.soffitLayout!, loading: {...spatialDefinition(), regions: [], memberActions: []}};
  expect(() => buildSoffitCandidate({...m, additionalDeadKPa: null}, l)).toThrow(/source additional DL/);
  const c = caseDefinition(); c.factors.CONCRETE = 0; const broken = structuredClone(m); broken.soffitLayout!.loading!.regions[0].placedDepthMm = null;
  expect(previewWorkflow(compileLoadCase(broken, c)).loadPath).toBeNull();
  l.loading = spatialDefinition(); l.loading.memberActions[0].forceN = 0; expect(buildSoffitCandidate(m, l).spatialLoading!.memberActions[0].appliedForceN).toBe(0);
  l.loading.memberActions[0].forceN = null; expect(() => buildSoffitCandidate(m, l)).toThrow(/point force/);
});
it('rejects source overlap, duplicated ownership, excessive placed depth, out-of-deck regions and unknown target members', () => {
  const m = spatialApplied(), check = (f: (l: NonNullable<typeof m.soffitLayout>) => void, pattern: RegExp) => {const l = structuredClone(m.soffitLayout!); f(l); expect(() => buildSoffitCandidate(m, l)).toThrow(pattern);};
  check(l => l.loading!.regions.push(region('DUP')), /Duplicate ownership|overlapping/);
  check(l => l.loading!.regions[1].ownershipId = l.loading!.regions[0].ownershipId, /Duplicate ownership/);
  check(l => l.loading!.regions[0].placedDepthMm = 151, /exceeds final/);
  check(l => l.loading!.regions[0].x1 = 2401, /outside actual/);
  check(l => l.loading!.memberActions[0].targetMemberId = 'NEAREST-JOIST', /exact actual target/);
  check(l => l.loading!.memberActions[0].separateFromSurfaceAndMemberWeight = false, /separate load ownership/);
  check(l => l.loading!.memberActions[0].applicationLine = null, /no unknown eccentricity/);
  check(l => l.loading!.memberActions[0].ownershipId = l.loading!.regions[0].ownershipId, /Duplicate direct/);
  check(l => l.loading!.memberActions[1].endMm = 2500, /outside actual target/);
  check(l => l.loading!.memberActions[0].lineLoadNPerMm = 1, /Point load/);
});
it('preserves beam/slab final-section geometry and independent Bc/DL/LL ownership while placing actual depths in split regions', () => {
  const m = {...slabModel(), elementType: 'BEAM' as const, heightMm: 600, slabThicknessMm: 150, beamWidthMm: 300, concreteStripMm: 900, deadStripMm: 1000, liveStripMm: 1200,
    vertices: [{x: 0, y: 0}, {x: 2400, y: 0}, {x: 2400, y: 300}, {x: 0, y: 300}]};
  const l = {...layoutFixture(), joistStartYMm: -500, joistEndYMm: 1000, concreteStripStartYMm: -300, deadStripStartYMm: -200, liveStripStartYMm: -500,
    bearers: [{id: 'B1', yMm: -500, headsXMm: [0, 1200, 2400]}, {id: 'B2', yMm: 1000, headsXMm: [0, 1200, 2400]}], plywood: {...plywoodFixture(), startYMm: -500, endYMm: 1000},
    loading: {...spatialDefinition(), memberActions: [], regions: [region('BEAM', {x1: 1200, y0: 0, y1: 300, placedDepthMm: 600}), region('WING', {x1: 1200, y0: -300, y1: 0, placedDepthMm: 150}),
      region('DL', {kind: 'ADDITIONAL_DL', x1: 2400, y0: -200, y1: 800, placedDepthMm: null}), region('LL', {kind: 'CONSTRUCTION_LL', x1: 2400, y0: -500, y1: 700, placedDepthMm: null})]}};
  const c = buildSoffitCandidate(m, l); expect(c.ownedForceN.concrete).toBeCloseTo(24 * 1.2 * (.3 * .6 + .3 * .15) * 1000, 6);
  expect(c.ownedForceN.additionalDead).toBe(1200); expect(c.ownedForceN.constructionLive).toBe(7200);
  l.loading.regions[1].placedDepthMm = 600; expect(() => buildSoffitCandidate(m, l)).toThrow(/exceeds final/);
  l.loading.regions[1].placedDepthMm = 150; l.loading.regions[2].y0 = -300; expect(() => buildSoffitCandidate(m, l)).toThrow(/independently owned ADDITIONAL_DL/);
});
it('transmits new spatial surface and direct actions through actual assembled heads/jacks/frame bases and preserves surface placement coefficients', () => {
  const m = loadCaseSource(), loading = spatialDefinition(); loading.regions.push(region('P', {kind: 'PLACEMENT', x0: 500, x1: 700, y0: 400, y1: 800, placedDepthMm: null, qKPa: 5}));
  const ready = regenerateDraftLayouts(m, {soffitLayout: {...m.soffitLayout!, plywood: plywoodFixture(), loading}}), p = previewWorkflow(ready);
  expect(p.soffit!.expectedForceN).toBe(19880); expect(p.frame!.analysis).not.toBeNull(); const bases = p.frame!.analysis!.nodes.filter(n => n.id.endsWith(':BASE'));
  expect(bases.reduce((s, n) => s + n.reactionForceN[2], 0)).toBeCloseTo(19880, 5); expect(p.assembly!.frameGeometryReady).toBe(true);
  const c = caseDefinition(); c.factors.PLACEMENT = 2; const casePreview = previewWorkflow(compileLoadCase(ready, c)); expect(casePreview.soffit!.additionalForceN).toBe(400 * 2 + 1000 * 2 + 1200);
  expect(casePreview.frame!.analysis!.nodes.filter(n => n.id.endsWith(':BASE')).reduce((s, n) => s + n.reactionForceN[2], 0)).toBeCloseTo(21280, 4);
});
it('requires plywood instead of smearing spatial patches and checks included plywood weight in every real X/Y zone even for zero-factored DL', () => {
  const m = spatialApplied(), l = structuredClone(m.soffitLayout!); l.plywood = null; expect(() => buildSoffitCandidate(m, l)).toThrow(/Actual plywood/);
  l.plywood = {...plywoodFixture(), selfWeightKPa: .1, selfWeightOwnership: 'IN_ADDITIONAL_DL'};
  l.loading!.regions[1].x1 = 1200; expect(() => buildSoffitCandidate(m, l)).toThrow(/every actual X\/Y zone/);
  const c = caseDefinition(); c.factors.ADDITIONAL_DL = 0; const candidate = compileLoadCase({...m, soffitLayout: l}, c); expect(previewWorkflow(candidate).loadPath).toBeNull();
  l.loading!.regions[1].x1 = 2400; const good = regenerateDraftLayouts(m, {soffitLayout: l}), p = previewWorkflow(good); expect(p.soffit!.plywood!.selfWeight.additionalForceN).toBe(0); expect(p.soffit!.terminalForceN).toBeCloseTo(19480, 6);
});
it('factors every spatial category/direct load once and preserves raw depth, gamma, positions and independent coefficients', () => {
  const m = spatialApplied(), c = caseDefinition(); c.factors = {...c.factors, CONCRETE: 1.2, ADDITIONAL_DL: 1.1, CONSTRUCTION_LL: 1.5, PLACEMENT: 2, OTHER: 3};
  const child = compileLoadCase(m, c), p = previewWorkflow(child); expect(p.soffit!.expectedForceN).toBeCloseTo(6480 * 1.2 + 1800 * 1.1 + 9000 * 1.5 + 1000 * 2 + 1200 * 3, 6);
  expect(p.soffit!.terminalForceN).toBeCloseTo(p.soffit!.expectedForceN, 6); expect(child.soffitLayout!.loading).toEqual(m.soffitLayout!.loading); expect(p.soffit!.spatialLoading!.memberActions[1].appliedLineNPerMm).toBe(3);
  const categorized = structuredClone(m); categorized.soffitLayout!.loading!.memberActions[0].kind = 'CONSTRUCTION_LL'; categorized.soffitLayout!.loading!.memberActions[1].kind = 'SELF_WEIGHT'; c.factors.SELF_WEIGHT = 2;
  const grouped = previewWorkflow(compileLoadCase(categorized, c)); expect(grouped.soffit!.ownedForceN.constructionLive).toBe(15000); expect(grouped.soffit!.ownedForceN.componentSelfWeight).toBe(2400); expect(grouped.soffit!.additionalForceN).toBe(0);
  expect(Object.values(grouped.soffit!.ownedForceN).reduce((s, n) => s + n, 0)).toBeCloseTo(grouped.soffit!.terminalForceN!, 5);
  c.factors.PLACEMENT = -1; expect(previewWorkflow(compileLoadCase(m, c)).loadPath).toBeNull();
  c.factors.PLACEMENT = 1e308; const overflow = previewWorkflow(compileLoadCase(m, c)); expect(overflow.loadPath).toBeNull(); expect(overflow.soffit).toBeNull();
});
it('recomputes every case and independent Stage with its own placement rather than borrowing an all-poured source', async () => {
  const m = spatialApplied(), first = captureStage(m, {...emptyStage('HALF'), stageId: 'POUR-TEST', evidenceRef: 'SYNTHETIC'}), layout = structuredClone(m.soffitLayout!);
  layout.stageId = 'FULL'; layout.loading!.regions[0].x1 = 2400;
  const full = regenerateDraftLayouts(m, {soffitLayout: layout}), c = caseDefinition('FULL-CASE', {stageId: 'FULL'}); c.factors.CONCRETE = 2;
  const cases = applyLoadCases(full, {schemaVersion: '1', cases: [c]}), second = captureStage(cases, {...emptyStage('FULL'), stageId: 'FULL', evidenceRef: 'SYNTHETIC'}), ready = applyStageStudy(cases, {schemaVersion: '1', stages: [first, second]}), p = previewWorkflow(ready);
  expect(p.stageStudy!.stages[0].preview!.soffit!.terminalForceN).toBeCloseTo(19480, 5); expect(p.stageStudy!.stages[1].preview!.soffit!.terminalForceN).toBeCloseTo(25960, 5);
  expect(p.stageStudy!.stages[1].preview!.loadCases!.cases[0].preview!.soffit!.terminalForceN).toBeCloseTo(38920, 5);
  const view = await documentView(await freezeDesign(ready), ready); expect(view.drawing.stageStudy!.stages[0].model!.soffitLayout!.loading!.regions[0].x1).toBe(1200);
});
it('invalidates graphs and snapshots after spatial edits, rejects forged results and validates bounded imported definitions', async () => {
  const m = spatialApplied(), l = structuredClone(m.soffitLayout!); l.loading!.memberActions[0].startMm = 800;
  const changed = reviseDraft(m, {soffitLayout: l}); expect(previewWorkflow(changed).loadPath).toBeNull();
  const frozen = await freezeDesign(m); expect((await documentView(frozen, changed)).freshness).toBe('STALE');
  const forged = structuredClone(frozen); forged.content.preview.soffit!.spatialLoading!.memberActions[0].appliedForceN = 0; forged.snapshotHash = await contentHash(forged.content); await expect(documentView(forged, m)).rejects.toThrow(/calculation mismatch/);
  expect(() => parseWorkflowModel({...m, soffitLayout: {...m.soffitLayout, loading: {...spatialDefinition(), approved: true}}})).toThrow(/authority/);
  expect(() => validateSpatialLoading({...spatialDefinition(), regions: Array.from({length: 41}, (_, i) => region(`X${i}`))})).toThrow(/40-region/);
  expect(() => validateSpatialLoading({...spatialDefinition(), regions: [region('X', {qKPa: NaN})]})).toThrow();
  expect(coverageModel().soffitLayout).not.toHaveProperty('loading');
});
