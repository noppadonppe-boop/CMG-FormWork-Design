import {readFileSync} from 'node:fs';
import {expect, it} from 'vitest';
import {analyzePlywoodDeck, emptyPlywoodBinding, emptySoffitPlywood, resolvePlywoodElastic, validatePlywoodBinding, validateSoffitPlywood} from '../src/domain/workflowV07/plywood';
import {selectReference} from '../src/domain/workflowV07/catalogues';
import {analyzeSideLayout, stampSideLayout} from '../src/domain/workflowV07/sideLayout';
import {buildSoffitCandidate} from '../src/domain/workflowV07/soffit';
import {analyzeLoadPath} from '../src/domain/workflowV07/loadPath';
import {loadOwnershipIssues} from '../src/domain/workflowV07/loads';
import {parseWorkflowModel, previewWorkflow, regenerateDraftLayouts, reviseDraft} from '../src/domain/workflowV07/model';
import {contentHash, documentView, freezeDesign} from '../src/domain/workflowV07/snapshot';
import {sideDefinition, sideModel} from './fixtures/workflow-v07-side';
import {builtModel, layoutFixture, slabModel} from './fixtures/workflow-v07-soffit';
import {plywoodBinding, plywoodFixture} from './fixtures/workflow-v07-plywood';
import {frameApplied} from './fixtures/workflow-v07-frame-workflow';

it('selects the explicitly mapped product bending modulus and full gross strip, preserving both directional properties', () => {
  const b = plywoodBinding(), o = {thicknessMm: 12, effectiveE_MPa: null, evidenceRef: '', binding: b};
  const x = resolvePlywoodElastic({...o, grainRelativeDeg: 0}), y = resolvePlywoodElastic({...o, grainRelativeDeg: 90});
  expect(x.E_MPa).toBe(10719); expect(y.E_MPa).toBe(6781); expect(x.I_mm4).toBe(144000); expect(x.S_mm3).toBe(24000);
  expect(x.selectedKey).toBe('Eb0_mean_MPa'); expect(y.selectedKey).toBe('Eb90_mean_MPa'); expect(x.constructionRelease).toBe('NO_GO');
  const c = selectReference(b.material!.reference, '0.5.0', {changes: {properties: {Eb0_mean_MPa: 10000}}, reason: 'SYNTHETIC', evidenceRef: 'SYNTHETIC'});
  expect((c.effective.properties as Record<string, unknown>).Eb90_mean_MPa).toBe(6781); expect((b.material!.effective.properties as Record<string, unknown>).Eb0_mean_MPa).toBe(10719);
});
it('rejects missing mapping, mismatched thickness, manual/bound E conflicts, wrong products and reduced-section/authority flags', () => {
  const b = plywoodBinding(), o = {thicknessMm: 12, effectiveE_MPa: null, grainRelativeDeg: 0 as const, evidenceRef: '', binding: b};
  expect(() => resolvePlywoodElastic({...o, thicknessMm: 11.8})).toThrow(/differs/);
  expect(() => resolvePlywoodElastic({...o, effectiveE_MPa: 8000})).toThrow(/manual E/);
  expect(() => resolvePlywoodElastic({...o, binding: {...b, parallelToGrainKey: null}})).toThrow(/mapping required/);
  expect(() => validatePlywoodBinding({...b, parallelToGrainKey: 'Etc0_mean_MPa'})).toThrow(/convention/);
  expect(() => validatePlywoodBinding({...b, grossConvention: 'REDUCED_I'})).toThrow(/convention/);
  expect(() => validatePlywoodBinding({...b, confirmed: true})).toThrow(/authority/);
  const steel = JSON.parse(readFileSync('src/reference/workflow-v07/materials.json', 'utf8')).materials.find((m: {material_id: string}) => m.material_id === 'STEEL-SS400');
  expect(() => resolvePlywoodElastic({...o, binding: {...b, material: selectReference(steel, '0.5.0')}})).toThrow(/Plywood product/);
});
it('changes the actual side-panel directional deflection without adding peak-envelope strip loads to studs twice', () => {
  const model = sideModel(), d = sideDefinition();
  for (const f of d.faces) f.plywood = {...f.plywood, effectiveE_MPa: null, binding: plywoodBinding()};
  const a = analyzeSideLayout(model, stampSideLayout(model, d)); d.faces[0].plywood.grainAxis = 'VERTICAL';
  const b = analyzeSideLayout(model, stampSideLayout(model, d));
  expect(b.faces[0].panels[0].analysis.maxDeflectionMm / a.faces[0].panels[0].analysis.maxDeflectionMm).toBeCloseTo(10719 / 6781, 10);
  expect(b.nodes).toEqual(a.nodes); expect(b.faces[0].result.expectedForceN).toBe(10000); expect(b.status).toBe('BLOCKED');
});
it('agrees with independent simply supported strip formulas and uses those actual reactions in the joist graph', () => {
  const model = slabModel(), layout = {...layoutFixture(), plywood: plywoodFixture()}, c = buildSoffitCandidate(model, layout), p = c.plywood!, s = p.strips[0];
  expect(p.strips).toHaveLength(4); expect(s.analysis.maxMomentNmm).toBeCloseTo(6.6 * 600 ** 2 / 8, 6);
  expect(s.analysis.maxShearN).toBeCloseTo(6.6 * 600 / 2, 6);
  expect(s.analysis.maxDeflectionMm).toBeCloseTo(5 * 6.6 * 600 ** 4 / (384 * 10719 * 144000), 9);
  expect(s.stressDemandMPa).toBeCloseTo((6.6 * 600 ** 2 / 8) / 24000, 8);
  expect(c.members.filter(m => m.role === 'JOIST').every(m => m.beam.patches.some(p => p.id.startsWith('PLY_ZONE:')))).toBe(true);
  expect(c.members[0].beam.patches.some(p => p.id.startsWith('CONCRETE:'))).toBe(false);
  const path = analyzeLoadPath(c.members); expect(path.reactions.reduce((s, r) => s + r.forceN, 0)).toBeCloseTo(23760, 5);
  expect(path.reactions.find(r => r.nodeId === 'B1:HEAD-2')!.forceN).toBeCloseTo(7053.75, 6); expect(p.residuals.forceN).toBeCloseTo(0, 6);
});
it('retains every nonuniform span and all asymmetric beam/slab/DL/LL Y boundaries with global force and first-moment closure', () => {
  const model = {...slabModel(), elementType: 'BEAM' as const, heightMm: 600, vertices: [{x: 0, y: 0}, {x: 2400, y: 0}, {x: 2400, y: 300}, {x: 0, y: 300}],
    slabThicknessMm: 100, beamWidthMm: 300, concreteStripMm: 1200, deadStripMm: 800, liveStripMm: 600, additionalDeadKPa: 1, constructionLiveKPa: 2};
  const layout = layoutFixture(); layout.joistXMm = [0, 400, 1000, 1800, 2400]; layout.joistStartYMm = -600; layout.joistEndYMm = 1500;
  layout.bearers[0].yMm = -600; layout.concreteStripStartYMm = -400; layout.deadStripStartYMm = -600; layout.liveStripStartYMm = 600;
  layout.plywood = {...plywoodFixture(), startYMm: -600, selfWeightKPa: .1};
  const c = buildSoffitCandidate(model, layout), p = previewWorkflow({...model, soffitLayout: layout, members: c.members, actions: c.actions, ringlock: c.ringlock, requiredChecks: c.requiredChecks});
  expect(c.plywood!.strips).toHaveLength(32); expect(c.expectedForceN).toBeCloseTo(20856, 6);
  expect(c.plywood!.strips.find(s => s.startYMm === 0 && s.endYMm === 200)!.qKPa).toBeCloseTo(15.5, 10);
  expect(c.plywood!.strips.find(s => s.startYMm === 1200)!.qKPa).toBe(.1);
  expect(p.loadPath).not.toBeNull(); expect(p.soffit!.forceResidualN).toBeCloseTo(0, 5);
  expect(p.soffit!.momentResidual!.xLeverNmm).toBeCloseTo(0, 2); expect(p.soffit!.momentResidual!.yLeverNmm).toBeCloseTo(0, 2);
  model.vertices = model.vertices.map(v => ({x: v.x + 9000, y: v.y - 4000})); const translated = builtModel(model, layout);
  expect(previewWorkflow(translated).soffit!.momentResidual!.yLeverNmm).toBeCloseTo(0, 2);
});
it('adds explicitly separate plywood weight once through panel reactions and preserves its own spatial ledger', () => {
  const layout = {...layoutFixture(), plywood: {...plywoodFixture(), selfWeightKPa: .1}}, c = buildSoffitCandidate(slabModel(), layout);
  expect(c.expectedForceN).toBeCloseTo(24120, 5); expect(c.ownedForceN.componentSelfWeight).toBeCloseTo(360, 5);
  const action = c.actions.find(a => a.id.endsWith('SELF:PLYWOOD'))!;
  expect(action.magnitude).toBeCloseTo(.36, 8); expect(action.includedInActionId).toBeNull(); expect(action.region).toEqual({x0: 0, x1: 2400, y0: 0, y1: 1500});
  expect(loadOwnershipIssues(c.actions)).toEqual([]); expect(analyzeLoadPath(c.members).reactions.reduce((s, r) => s + r.forceN, 0)).toBeCloseTo(24120, 5);
});
it('documents plywood weight already owned by additional DL without adding a second panel patch or duplicating the total', () => {
  const layout = {...layoutFixture(), plywood: {...plywoodFixture(), selfWeightKPa: .1, selfWeightOwnership: 'IN_ADDITIONAL_DL' as const}}, c = buildSoffitCandidate(slabModel(), layout);
  expect(c.expectedForceN).toBe(23760); expect(c.plywood!.selfWeight.declaredForceN).toBe(360); expect(c.plywood!.selfWeight.additionalForceN).toBe(0);
  expect(c.actions.find(a => a.id.endsWith('SELF:PLYWOOD'))!.includedInActionId).toBe('SLAB-TEST:DL'); expect(loadOwnershipIssues(c.actions)).toEqual([]);
  expect(c.plywood!.strips.every(s => s.qKPa === 6.6)).toBe(true);
  expect(() => buildSoffitCandidate({...slabModel(), additionalDeadKPa: .05}, layout)).toThrow(/owning additional DL/);
  const beam = {...slabModel(), elementType: 'BEAM' as const, heightMm: 600, slabThicknessMm: 0, beamWidthMm: 300, concreteStripMm: 300, deadStripMm: 300, liveStripMm: 300,
    vertices: [{x: 0, y: 0}, {x: 2400, y: 0}, {x: 2400, y: 300}, {x: 0, y: 300}]};
  expect(() => buildSoffitCandidate(beam, {...layout, deadStripStartYMm: 0, liveStripStartYMm: 0})).toThrow(/owning additional DL/);
});
it('keeps explicitly unloaded board zones rather than omitting them or turning missing inputs into zero', () => {
  const layout = layoutFixture(); layout.joistStartYMm = -200; layout.joistEndYMm = 1700; layout.plywood = {...plywoodFixture(), startYMm: -200, endYMm: 1700};
  const c = buildSoffitCandidate(slabModel(), layout); expect(c.plywood!.strips).toHaveLength(12);
  expect(c.plywood!.strips.filter(s => s.qKPa === 0)).toHaveLength(8); expect(c.expectedForceN).toBe(23760);
  const unknown = {...layout, plywood: {...layout.plywood, selfWeightKPa: null}}; expect(() => buildSoffitCandidate(slabModel(), unknown)).toThrow(/self-weight/);
});
it('rejects unsupported continuity, uncovered loads, missing grain/ownership and overhanging panel supports', () => {
  const layout = {...layoutFixture(), plywood: plywoodFixture()};
  expect(() => buildSoffitCandidate(slabModel(), {...layout, plywood: {...layout.plywood, jointsAtEveryJoist: false}})).toThrow(/continuity/);
  expect(() => buildSoffitCandidate(slabModel(), {...layout, plywood: {...layout.plywood, startYMm: 100}})).toThrow(/outside actual plywood/);
  expect(() => buildSoffitCandidate(slabModel(), {...layout, plywood: {...layout.plywood, selfWeightOwnership: null}})).toThrow(/ownership/);
  expect(() => buildSoffitCandidate(slabModel(), {...layout, joistXMm: [10, 600, 1200, 2400]})).toThrow(/panel overhang/);
});
it('refuses omitted/doubled separate plywood weight in the direct deck analysis contract', () => {
  const definition = {...plywoodFixture(), selfWeightKPa: .1}, base = {modelId: 'P', revision: 'R', stageId: 'S', loadCaseId: 'C', joistXMm: [0, 600], definition,
    surfaces: [{id: 'CONCRETE', kind: 'CONCRETE' as const, startY: 0, endY: 1500, qKPa: 3.6}]};
  expect(() => analyzePlywoodDeck(base)).toThrow(/weight surface/);
  const self = {id: 'SELF:PLYWOOD', kind: 'SELF_WEIGHT' as const, startY: 0, endY: 1500, qKPa: .1};
  expect(analyzePlywoodDeck({...base, surfaces: [...base.surfaces, self]}).expectedForceN).toBeCloseTo(3330, 6);
  expect(() => analyzePlywoodDeck({...base, definition: {...definition, selfWeightOwnership: 'IN_ADDITIONAL_DL'}, surfaces: [...base.surfaces, self]})).toThrow(/cannot also/);
});
it('enforces the actual strip/zone size bound without truncation and rejects an empty surface list', () => {
  const base = {modelId: 'P', revision: 'R', stageId: 'S', loadCaseId: 'C', joistXMm: Array.from({length: 40}, (_, i) => i * 100), definition: plywoodFixture(),
    surfaces: Array.from({length: 12}, (_, i) => ({id: `C${i}`, kind: 'CONCRETE' as const, startY: i * 50, endY: (i + 1) * 50, qKPa: 1}))};
  expect(() => analyzePlywoodDeck(base)).toThrow(/400/); expect(() => analyzePlywoodDeck({...base, surfaces: []})).toThrow(/Explicit bounded/);
});
it('assigns panel requirements and Typical coverage to every actual span/zone without favorable outcomes', () => {
  const checks = JSON.parse(readFileSync('src/reference/workflow-v07/checks.json', 'utf8')), model = slabModel();
  model.checkCatalogue = {version: '0.7', specifications: checks.map((c: Record<string, string>) => ({id: c.check_id, group: c.group, description: c.description, appliesTo: c.applicable_to}))};
  const ready = regenerateDraftLayouts(model, {soffitLayout: {...layoutFixture(), plywood: plywoodFixture()}}), p = previewWorkflow(ready);
  expect(ready.requiredChecks.filter(c => c.checkId === 'SOFFIT-03')).toHaveLength(4); expect(ready.requiredChecks.filter(c => c.checkId === 'SOFFIT-04')).toHaveLength(4);
  expect(p.specificationGaps).not.toContain('SOFFIT-04'); expect(p.coverageIssues.length).toBeGreaterThan(0); expect(ready.coverage).toEqual([]); expect(p.status).toBe('BLOCKED');
});
it('freezes panel sources/reactions, detects source edits and rejects rehashed fabricated plywood results', async () => {
  const ready = regenerateDraftLayouts(slabModel(), {soffitLayout: {...layoutFixture(), plywood: plywoodFixture()}}), frozen = await freezeDesign(ready);
  const changedLayout = structuredClone(ready.soffitLayout!); changedLayout.plywood!.grainAxis = 'Y';
  const edited = reviseDraft(ready, {soffitLayout: changedLayout}); expect(previewWorkflow(edited).loadPath).toBeNull(); expect((await documentView(frozen, edited)).freshness).toBe('STALE');
  const rebuilt = regenerateDraftLayouts(edited), p = previewWorkflow(rebuilt); expect(p.soffit!.plywood!.elastic.E_MPa).toBe(6781);
  const fake = structuredClone(frozen); fake.content.preview.soffit!.plywood!.strips[0].analysis.maxDeflectionMm = 0; fake.snapshotHash = await contentHash(fake.content);
  await expect(documentView(fake, ready)).rejects.toThrow(/calculation mismatch/); expect(Object.isFrozen(frozen.content.model.soffitLayout!.plywood!.binding!.material!.reference)).toBe(true);
});
it('preserves unknown product/board drafts while rejecting imported authority metadata', async () => {
  validatePlywoodBinding(emptyPlywoodBinding()); const p = emptySoffitPlywood(); validateSoffitPlywood(p); expect(p.selfWeightKPa).toBeNull(); expect(p.grainAxis).toBeNull();
  const ready = regenerateDraftLayouts(slabModel(), {soffitLayout: {...layoutFixture(), plywood: p}}, {allowIncomplete: true});
  expect(previewWorkflow(ready).loadPath).toBeNull(); expect((await documentView(await freezeDesign(ready), ready)).report.model.soffitLayout!.plywood!.selfWeightOwnership).toBeNull();
  const forged = structuredClone(ready); (forged.soffitLayout!.plywood as unknown as Record<string, unknown>).approved = true;
  expect(() => parseWorkflowModel(forged)).toThrow(/authority/);
});
it('transmits newly added plywood weight through actual joists/bearers/heads into the declared frame on one revision', () => {
  const model = frameApplied();
  const ready = regenerateDraftLayouts(model, {soffitLayout: {...model.soffitLayout!, plywood: {...plywoodFixture(), selfWeightKPa: .1}}});
  const p = previewWorkflow(ready), frame = p.frame!.analysis!;
  expect(p.soffit!.plywood!.expectedForceN).toBeCloseTo(24120, 5);
  expect(frame.nodes.filter(n => n.id.startsWith('FB-')).reduce((sum, n) => sum + n.reactionForceN[2], 0)).toBeCloseTo(24120, 5);
  expect(frame.nodes.find(n => n.id === 'FB-2')!.reactionForceN[2]).toBeCloseTo(7160.625, 5);
  expect(frame.input.revisionId).toBe(ready.revisionId); expect(p.soffit!.plywood!.revisionId).toBe(ready.revisionId);
  expect(p.constructionEligible).toBe(false); expect(p.frame!.status).toBe('BLOCKED');
});
