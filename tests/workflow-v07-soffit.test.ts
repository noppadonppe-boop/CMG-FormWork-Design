import {expect, it} from 'vitest';
import {readFileSync} from 'node:fs';
import {buildSoffitCandidate} from '../src/domain/workflowV07/soffit';
import {previewWorkflow, reviseDraft} from '../src/domain/workflowV07/model';
import {analyzeLoadPath} from '../src/domain/workflowV07/loadPath';
import {contentHash, documentView, freezeDesign} from '../src/domain/workflowV07/snapshot';
import {builtModel, layoutFixture, slabModel} from './fixtures/workflow-v07-soffit';

it('slab service load reaches each actual U-head with continuous bearer reactions', () => {
  const model = builtModel(), p = previewWorkflow(model);
  // q=24*.15+.5+2.5=6.6kPa; area=3.6m² => 23.76kN. Each bearer gets 11.88kN.
  // Five discrete loads 1.485/2.97/2.97/2.97/1.485 kN on two continuous 1.2m spans.
  expect(p.soffit?.expectedForceN).toBeCloseTo(23760, 6);
  expect(p.loadPath?.reactions).toHaveLength(6);
  expect(p.loadPath?.reactions.map(r => r.forceN)).toEqual(expect.arrayContaining([expect.closeTo(2413.125, 5), expect.closeTo(7053.75, 5)]));
  expect(p.soffit?.forceResidualN).toBeCloseTo(0, 5);
  expect(p.soffit?.momentResidual?.xLeverNmm).toBeCloseTo(0, 3);
  expect(p.soffit?.momentResidual?.yLeverNmm).toBeCloseTo(0, 3);
  expect(p.ringlock?.legDemands.map(l => l.forceKN)).toEqual(p.loadPath?.reactions.map(r => r.forceN / 1000));
  expect(p.ringlock?.blockers).toContain('MISSING_CONFIGURATION_RATING');
  expect(p.constructionEligible).toBe(false); expect(p.status).toBe('BLOCKED');
});
it('separately owns every component self-weight exactly once', () => {
  const layout = layoutFixture(); layout.joist.selfWeightKNPerM = .1; layout.bearer.selfWeightKNPerM = .2;
  const model = builtModel(slabModel(), layout), p = previewWorkflow(model);
  // Five 1.5m joists + two 2.4m bearers: .75+.96=1.71kN.
  expect(p.soffit?.ownedForceN.componentSelfWeight).toBeCloseTo(1710, 8);
  expect(p.soffit?.terminalForceN).toBeCloseTo(25470, 5);
  expect(model.actions.reduce((s, a) => s + a.magnitude!, 0)).toBeCloseTo(25.47, 8);
});
it('beam downstand/slab, DL and LL keep independent widths and lateral positions', () => {
  const model = {...slabModel(), elementType: 'BEAM' as const, heightMm: 600, beamWidthMm: 300,
    vertices: [{x: 0, y: 0}, {x: 2400, y: 0}, {x: 2400, y: 300}, {x: 0, y: 300}],
    slabThicknessMm: 150, concreteStripMm: 1200, deadStripMm: 1500, liveStripMm: 1800};
  const layout = layoutFixture(); layout.joistStartYMm = -600; layout.joistEndYMm = 1200;
  layout.bearers[0].yMm = -600; layout.bearers[1].yMm = 1200;
  layout.concreteStripStartYMm = -300; layout.deadStripStartYMm = -500; layout.liveStripStartYMm = -600;
  const p = previewWorkflow(builtModel(model, layout));
  // Concrete=24*(.3*(.6-.15)+1.2*.15)=7.56kN/m, DL=.75, LL=4.5.
  expect(p.soffit?.ownedForceN).toEqual({concrete: expect.closeTo(18144, 6), additionalDead: 1800, constructionLive: 10800, componentSelfWeight: 0});
  expect(p.soffit?.forceResidualN).toBeCloseTo(0, 5);
  expect(p.soffit?.momentResidual?.yLeverNmm).toBeCloseTo(0, 3);
  const forces = p.loadPath!.reactions;
  expect(forces.slice(0, 3).reduce((s, r) => s + r.forceN, 0)).not.toBeCloseTo(forces.slice(3).reduce((s, r) => s + r.forceN, 0), 2);
});
it('isolated beam uses Bc=b and does not demand fictitious zero-load strip locations', () => {
  const model = {...slabModel(), elementType: 'BEAM' as const, heightMm: 600, beamWidthMm: 300,
    vertices: [{x: 0, y: 0}, {x: 2400, y: 0}, {x: 2400, y: 300}, {x: 0, y: 300}],
    slabThicknessMm: 0, concreteStripMm: 300, deadStripMm: 300, liveStripMm: 300, additionalDeadKPa: 0, constructionLiveKPa: 0};
  const p = previewWorkflow(builtModel(model));
  expect(p.soffit?.expectedForceN).toBeCloseTo(24 * .3 * .6 * 2.4 * 1000, 6);
  expect(p.soffit?.forceResidualN).toBeCloseTo(0, 5);
});
it('translation, irregular joist spacing and physical member overhangs preserve global force and moments', () => {
  const model = slabModel(); model.vertices = model.vertices.map(p => ({x: p.x - 9000, y: p.y + 4000}));
  const layout = layoutFixture(); layout.joistXMm = [0, 400, 1100, 1900, 2400];
  layout.joistStartYMm = -100; layout.joistEndYMm = 1600; layout.bearerStartXMm = -100; layout.bearerEndXMm = 2500;
  const p = previewWorkflow(builtModel(model, layout));
  expect(p.loadPath).not.toBeNull();
  expect(p.soffit?.forceResidualN).toBeCloseTo(0, 5);
  expect(p.soffit?.momentResidual?.xLeverNmm).toBeCloseTo(0, 2);
  expect(p.soffit?.momentResidual?.yLeverNmm).toBeCloseTo(0, 2);
  expect(p.loadPath!.reactions[0].point).toEqual({xMm: -9000, yMm: 4000, zMm: 3000});
});
it('rejects missing stiffness, unknown loads, wrong geometry and unsupported panel overhang', () => {
  const model = slabModel(); const layout = layoutFixture(); layout.joist.E_MPa = null;
  expect(() => buildSoffitCandidate(model, layout)).toThrow(/joist E/);
  expect(() => buildSoffitCandidate({...model, additionalDeadKPa: null}, layoutFixture())).toThrow(/DL/);
  const edge = layoutFixture(); edge.joistXMm[0] = 20;
  expect(() => buildSoffitCandidate(model, edge)).toThrow(/panel overhang/);
  const out = layoutFixture(); out.joistEndYMm = 1400;
  expect(() => buildSoffitCandidate(model, out)).toThrow();
  expect(() => buildSoffitCandidate({...model, slabThicknessMm: 200}, layoutFixture())).toThrow(/thickness/);
});
it('rejects transfer uplift instead of silently averaging or discarding it', () => {
  const layout = layoutFixture(); layout.bearers[0].yMm = 100; layout.bearers[1].yMm = 200;
  const candidate = buildSoffitCandidate(slabModel(), layout);
  expect(() => analyzeLoadPath(candidate.members)).toThrow(/uplift transfer/);
});
it('changes or tampering invalidate the load mapping and demand fresh explicit analysis', () => {
  const model = builtModel(); const stale = reviseDraft(model, {constructionLiveKPa: 3});
  expect(previewWorkflow(stale).loadPath).toBeNull();
  expect(previewWorkflow(stale).blockers).toContain('SOFFIT_LAYOUT_LOAD_OR_MEMBER_MAPPING_STALE');
  const tampered = structuredClone(model); tampered.members[0].beam.patches[0].startNPerMm = 999;
  expect(previewWorkflow(tampered).loadPath).toBeNull();
  const plan = structuredClone(model); plan.ringlock!.bayXMm = 900;
  expect(previewWorkflow(plan).blockers).toContain('ACTUAL_HEAD_SPACING_DIFFERS_FROM_SELECTED_RINGLOCK_PLAN');
});
it('actual nodal reactions and ownership are frozen into the shared report/drawing snapshot', async () => {
  const model = builtModel(), frozen = await freezeDesign(model), view = await documentView(frozen, model);
  expect(view.report.preview.loadPath?.reactions).toHaveLength(6);
  expect(view.report.model.soffitLayout).toEqual(layoutFixture());
  expect(view.drawing.analyses).toHaveLength(7);
  expect(Object.isFrozen(frozen.content.model.members)).toBe(true);
  expect(view.freshness).toBe('CURRENT');
});
it('assigns each applicable Ringlock/Typical requirement to every actual leg without inventing check outcomes', () => {
  const checks = JSON.parse(readFileSync('src/reference/workflow-v07/checks.json', 'utf8'));
  const model = slabModel(); model.checkCatalogue = {version: '0.7', specifications: checks.map((c: Record<string, string>) => ({id: c.check_id, group: c.group, description: c.description, appliesTo: c.applicable_to}))};
  const ready = builtModel(model), p = previewWorkflow(ready);
  for (const leg of ready.ringlock!.legs) {
    expect(ready.requiredChecks.filter(c => c.memberId === leg.id && c.checkId.startsWith('RINGLOCK-'))).toHaveLength(19);
    expect(ready.requiredChecks.filter(c => c.memberId === leg.id && c.checkId.startsWith('TYPICAL-'))).toHaveLength(6);
  }
  expect(p.coverageIssues.length).toBeGreaterThan(0);
  expect(p.specificationGaps).toContain('SOFFIT-04'); // panel model/strength remains unassigned
  expect(p.status).toBe('BLOCKED');
});
it('older engine snapshots require recalculation even when their stored hash is internally consistent', async () => {
  const model = builtModel(), old = structuredClone(await freezeDesign(model));
  old.content.preview.engineVersion = '0.7.0-preview.1'; old.snapshotHash = await contentHash(old.content);
  await expect(documentView(old, model)).rejects.toThrow(/engine version differs/);
});
