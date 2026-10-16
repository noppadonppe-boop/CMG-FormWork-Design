import {readFileSync} from 'node:fs';
import {expect, it} from 'vitest';
import {analyzeSideLayout, stampSideLayout} from '../src/domain/workflowV07/sideLayout';
import {previewWorkflow, regenerateDraftLayouts, reviseDraft} from '../src/domain/workflowV07/model';
import {documentView, freezeDesign} from '../src/domain/workflowV07/snapshot';
import {TIE_ROLES} from '../src/domain/workflowV07/assemblies';
import {sideApplied, sideDefinition, sideFace, sideModel} from './fixtures/workflow-v07-side';
import {builtModel} from './fixtures/workflow-v07-soffit';

it('conserves hydrostatic face force and first moments through actual independent paired rails', () => {
  const model = sideApplied(), result = analyzeSideLayout(model, model.sideLayout);
  expect(result.faces).toHaveLength(4); expect(result.nodes).toHaveLength(16);
  for (const f of result.faces) {
    expect(f.result.expectedForceN).toBe(10000);
    expect(f.result.residuals.forceN).toBeCloseTo(0, 5);
    expect(f.result.residuals.faceLeverNmm).toBeCloseTo(0, 3);
    expect(f.result.residuals.heightLeverNmm).toBeCloseTo(0, 3);
  }
  expect(result.faces[0].result.walers[0].supportDemands[0].forceN).toBeCloseTo(10000 * (900 - 1000 / 3) / 800 / 2, 5);
  const rails = result.faces[0].result.walers[0].rails;
  expect(rails[0].totalLoadN / rails[1].totalLoadN).toBeCloseTo(1.5, 8);
  expect(result.blockers).toContain('REBAR_CLEARANCE_NOT_VERIFIED'); expect(result.status).toBe('BLOCKED');
});
it('plywood peak-pressure strip agrees with a simply supported hand solution and is not counted again in face force', () => {
  const model = sideApplied(), result = analyzeSideLayout(model, model.sideLayout), p = result.faces[0].panels[0];
  // q=20N/mm for a 1m strip, L=250mm, E=8000MPa, I=1000*12³/12=144000mm⁴.
  expect(p.analysis.maxMomentNmm).toBeCloseTo(20 * 250 ** 2 / 8, 5);
  expect(p.analysis.maxDeflectionMm).toBeCloseTo(5 * 20 * 250 ** 4 / (384 * 8000 * 144000), 10);
  expect(p.stressDemandMPa).toBeCloseTo((20 * 250 ** 2 / 8) / 24000, 8);
  expect(result.nodes.filter(n => n.faceId === 'F1').reduce((s, n) => s + n.forceN, 0)).toBeCloseTo(10000, 5);
});
it('matched opposite ends use one full tie force; unequal ends never become an averaged/max design demand', () => {
  const model = sideApplied(), balanced = analyzeSideLayout(model, model.sideLayout);
  expect(balanced.ties).toHaveLength(8);
  const t = balanced.ties[0]; expect(t.demandKN).toBeCloseTo(t.a.forceN / 1000, 7);
  expect(t.demandKN).not.toBeCloseTo((t.a.forceN + t.b.forceN) / 1000, 3);
  const definition = sideDefinition();
  for (const w of definition.faces[2].walers) w.supports.splice(1, 0, {id: 'S-MIDDLE', xMm: 500});
  const unbalanced = analyzeSideLayout(model, stampSideLayout(model, definition));
  expect(unbalanced.ties.some(t => t.demandKN === null)).toBe(true);
  expect(unbalanced.blockers.some(b => b.includes('OPPOSITE_END_DEMANDS_REQUIRE_COUPLED_MODEL'))).toBe(true);
});
it('actual tie paths detect cross-direction envelope collisions and do not treat pair regions as routes', () => {
  const model = sideModel(), definition = sideDefinition();
  for (const f of definition.faces) f.walers.forEach((w, i) => w.zMm = [100, 900][i]);
  const result = analyzeSideLayout(model, stampSideLayout(model, definition));
  expect(result.blockers.some(b => b.includes('TIE_COLLISION'))).toBe(true);
  const missing = sideDefinition(); missing.ties[0].a.supportId = 'MISSING';
  expect(() => analyzeSideLayout(model, stampSideLayout(model, missing))).toThrow(/unknown actual support/);
  const duplicate = sideDefinition(); duplicate.ties[1].a = duplicate.ties[0].a;
  expect(() => analyzeSideLayout(model, stampSideLayout(model, duplicate))).toThrow(/assigned twice/);
});
it('a long L-shape face remains two full paired walers instead of artificial pair-boundary segments', () => {
  const model = sideModel(); model.vertices = [[0, 0], [6000, 0], [6000, 2000], [2000, 2000], [2000, 5000], [0, 5000]].map(([x, y]) => ({x, y}));
  const definition = {...sideDefinition(), faces: [sideFace('F1', 6000)], ties: []};
  const result = analyzeSideLayout(model, stampSideLayout(model, definition));
  expect(result.faces[0].result.walers).toHaveLength(2);
  expect(result.faces[0].result.walers.flatMap(w => w.rails)).toHaveLength(4);
  expect(result.faces[0].result.expectedForceN).toBe(60000);
  expect(result.blockers.filter(b => b.includes('PHYSICAL_SIDE_FACE_LAYOUT_MISSING'))).toHaveLength(5);
});
it('supports at different waler levels are analyzed at their own stations', () => {
  const model = sideModel(), definition = {...sideDefinition(), faces: [sideFace('F1')], ties: []};
  definition.faces[0].walers[1].supports = [{id: 'UP-A', xMm: 200}, {id: 'UP-B', xMm: 800}];
  const r = analyzeSideLayout(model, stampSideLayout(model, definition));
  expect(r.nodes.filter(n => n.walerId === 'W2').map(n => n.localXMm)).toEqual([200, 800]);
  expect(r.faces[0].result.residuals.faceLeverNmm).toBeCloseTo(0, 3);
});
it('column clamp/ground brace topologies do not silently become through ties', () => {
  for (const sideTopology of ['COLUMN_YOKE', 'GROUND_BRACED'] as const) {
    const model = {...sideModel(), sideTopology};
    expect(() => analyzeSideLayout(model, stampSideLayout(model, sideDefinition()))).toThrow(/cannot substitute/);
    const result = analyzeSideLayout(model, stampSideLayout(model, {...sideDefinition(), ties: []}));
    expect(result.blockers.some(b => b.includes(sideTopology === 'COLUMN_YOKE' ? 'CLOSED_COLUMN_YOKE' : 'GROUND_BRACE_ANCHOR'))).toBe(true);
  }
});
it('serial Inner/Outer assemblies receive the full service tie force and propagate unfavorable failure', () => {
  const model = {...sideModel(), sideTopology: 'SEGMENTED_TIE' as const}, definition = sideDefinition();
  definition.ties[0].assembly = {topology: 'SEGMENTED_INNER_OUTER', components: TIE_ROLES.map(role => ({role, productId: 'SYNTHETIC',
    capacityKN: role === 'INNER' ? 2 : 100, basis: 'ALLOWABLE', demandFraction: 1, sourceRef: 'SYNTHETIC test only'})), compatibilityEvidence: 'SYNTHETIC',
    engagementLeftMm: 50, engagementRightMm: 50, requiredEngagementLeftMm: 50, requiredEngagementRightMm: 50};
  const ready = {...model, sideLayout: stampSideLayout(model, definition)}, r = previewWorkflow(ready);
  expect(r.side?.ties[0].assembly?.status).toBe('FAIL'); expect(r.status).toBe('FAIL'); expect(r.constructionEligible).toBe(false);
  definition.ties[0].assembly!.components.find(c => c.role === 'WALER_LOCAL_LEFT')!.demandFraction = .5;
  expect(() => analyzeSideLayout(model, stampSideLayout(model, definition))).toThrow(/contact model/);
});
it('rejects unknown stiffness, panel overhang/joints, invalid head and stale or tampered input stamps', () => {
  const model = sideModel(), missing = sideDefinition(); missing.faces[0].stud.E_MPa = null;
  expect(() => analyzeSideLayout(model, stampSideLayout(model, missing))).toThrow(/actual E/);
  const edge = sideDefinition(); edge.faces[0].studPositionsMm[0] = 10;
  expect(() => analyzeSideLayout(model, stampSideLayout(model, edge))).toThrow(/panel overhang/);
  const joints = sideDefinition(); joints.faces[0].plywood.jointsAtEveryStud = null;
  expect(() => analyzeSideLayout(model, stampSideLayout(model, joints))).toThrow(/plywood grain/);
  expect(() => analyzeSideLayout(model, stampSideLayout(model, {...sideDefinition(), pourHeadMm: 1100}))).toThrow(/pour head/);
  const applied = sideApplied(); applied.gammaKNm3 = 24;
  expect(previewWorkflow(applied).side).toBeNull(); expect(previewWorkflow(applied).blockers).toContain('SIDE_LAYOUT:STALE_SIDE_LAYOUT_REANALYSIS_REQUIRED');
});
it('freezes actual side members/routes and derives actual member/check coverage without favorable results', async () => {
  const checks = JSON.parse(readFileSync('src/reference/workflow-v07/checks.json', 'utf8'));
  const model = sideModel(); model.checkCatalogue = {version: '0.7', specifications: checks.map((c: Record<string, string>) => ({id: c.check_id, group: c.group, description: c.description, appliesTo: c.applicable_to}))};
  const ready = regenerateDraftLayouts(model, {sideLayout: stampSideLayout(model, sideDefinition())}), p = previewWorkflow(ready);
  expect(p.side?.requiredChecks.filter(c => c.checkId === 'SIDE-04')).toHaveLength(20);
  expect(p.requiredChecks.filter(c => c.checkId === 'SIDE-09')).toHaveLength(8);
  expect(p.specificationGaps).not.toContain('SIDE-04'); expect(p.coverageIssues.length).toBeGreaterThan(0);
  const frozen = await freezeDesign(ready), view = await documentView(frozen, ready);
  expect(view.report.preview.side?.ties).toHaveLength(8); expect(view.report.preview.side?.nodes[0].point.zMm).toBe(2100);
  expect(view.constructionEligible).toBe(false);
});
it('explicit regeneration keeps side and soffit on one revision without an endless stale/rebuild cycle', () => {
  const model = {...builtModel(), elementType: 'BEAM' as const, heightMm: 600, slabThicknessMm: 0, beamWidthMm: 1500, concreteStripMm: 1500, deadStripMm: 1500, liveStripMm: 1500};
  const definition = {...sideDefinition(), pourHeadMm: 600, faces: [sideFace('F1', 2400, [100, 500])], ties: []};
  const ready = regenerateDraftLayouts(model, {sideLayout: stampSideLayout(model, definition),
    soffitLayout: {...model.soffitLayout!, deadStripStartYMm: 0, liveStripStartYMm: 0}});
  expect(previewWorkflow(ready).loadPath).not.toBeNull(); expect(previewWorkflow(ready).side).not.toBeNull();
  const edited = reviseDraft(ready, {gammaKNm3: 25}); expect(previewWorkflow(edited).side).toBeNull(); expect(previewWorkflow(edited).loadPath).toBeNull();
  const rebuilt = regenerateDraftLayouts(edited);
  expect(previewWorkflow(rebuilt).side?.revisionId).toBe(rebuilt.revisionId);
  expect(previewWorkflow(rebuilt).loadPath?.analyses.every(a => a.revision === rebuilt.revisionId)).toBe(true);
});
it('additional dead/live loads do not become lateral hydrostatic pressure', () => {
  const model = sideApplied(), original = previewWorkflow(model).side!;
  const changed = {...model, additionalDeadKPa: 500, constructionLiveKPa: 1000};
  const result = previewWorkflow(changed).side!;
  expect(result.faces.map(f => f.result.expectedForceN)).toEqual(original.faces.map(f => f.result.expectedForceN));
  expect(result.faces.map(f => f.result.pressureBaseKPa)).toEqual([20, 20, 20, 20]);
});
it('translated/rotated/reversed physical faces conserve the vector resultant and global moments of closed hydrostatic pressure', () => {
  for (const reverse of [false, true]) {
    const model = sideModel(); model.vertices = model.vertices.map(p => ({x: 7000 - p.y, y: p.x - 5000}));
    if (reverse) model.vertices.reverse();
    const result = analyzeSideLayout(model, stampSideLayout(model, {...sideDefinition(), ties: []}));
    const sum = result.nodes.reduce((r, n) => {const fx = n.forceN * n.normal.x, fy = n.forceN * n.normal.y;
      return {fx: r.fx + fx, fy: r.fy + fy, mx: r.mx - n.point.zMm * fy, my: r.my + n.point.zMm * fx,
        mz: r.mz + n.point.xMm * fy - n.point.yMm * fx};}, {fx: 0, fy: 0, mx: 0, my: 0, mz: 0});
    Object.values(sum).forEach(v => expect(v).toBeCloseTo(0, 3));
  }
});
