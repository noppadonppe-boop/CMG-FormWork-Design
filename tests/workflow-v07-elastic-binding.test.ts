import {expect, it} from 'vitest';
import {canonical} from '../src/domain/workflowV07/common';
import {selectReference, validateSelectionSnapshot} from '../src/domain/workflowV07/catalogues';
import {emptyElasticBinding, resolveElasticBinding, resolveMemberElastic, validateElasticBinding} from '../src/domain/workflowV07/elasticBinding';
import {analyzeSideLayout, stampSideLayout} from '../src/domain/workflowV07/sideLayout';
import {analyzeLoadPath} from '../src/domain/workflowV07/loadPath';
import {buildSoffitCandidate} from '../src/domain/workflowV07/soffit';
import {parseWorkflowModel, previewWorkflow, regenerateDraftLayouts, reviseDraft} from '../src/domain/workflowV07/model';
import {contentHash, documentView, freezeDesign} from '../src/domain/workflowV07/snapshot';
import {steelBinding, timberBinding, sourceMaterials, sourceSections} from './fixtures/workflow-v07-elastic-binding';
import {sideDefinition, sideModel} from './fixtures/workflow-v07-side';
import {explicitSideDefinition} from './fixtures/workflow-v07-waler-pair';
import {builtModel, layoutFixture, slabModel} from './fixtures/workflow-v07-soffit';

it('preserves every other material property when a Custom edit supplies only one numeric property', () => {
  const master = sourceMaterials.find(m => m.material_id === 'STEEL-SS400')!, before = canonical(master);
  const s = selectReference(master, '0.5.0', {changes: {properties: {E_MPa: 190000}}, reason: 'SYNTHETIC', evidenceRef: 'SYNTHETIC'});
  expect(s.effective.properties).toEqual({...master.properties as object, E_MPa: 190000});
  expect(s.reference).toEqual(master); expect(canonical(master)).toBe(before); validateSelectionSnapshot(s);
});
it('rejects forged Standard differences, removed property keys, authority changes and malformed provenance', () => {
  const s = steelBinding().material!, changed = structuredClone(s); (changed.effective.properties as Record<string, unknown>).E_MPa = 190000;
  expect(() => validateSelectionSnapshot(changed)).toThrow(/Standard reference/);
  const removed = selectReference(s.reference, '0.5.0', {changes: {properties: {E_MPa: 190000}}, reason: 'SYNTHETIC', evidenceRef: 'SYNTHETIC'});
  delete (removed.effective.properties as Record<string, unknown>).G_MPa; expect(() => validateSelectionSnapshot(removed)).toThrow(/keys/);
  expect(() => validateSelectionSnapshot({...s, confirmed: true})).toThrow(/authority/);
  expect(() => validateSelectionSnapshot({...s, provenance: {...s.provenance, reason: {approved: true}}})).toThrow(/evidence/);
  const custom = structuredClone(steelBinding().section!); custom.mode = 'CUSTOM'; custom.provenance.reason = 'x'; custom.provenance.evidenceRef = 'y'; custom.effective.candidate_selectable = false;
  expect(() => validateSelectionSnapshot(custom)).toThrow(/authority/);
});
it('converts catalogue cm4 to mm4 and selects the declared source axis without swapping E or strength properties', () => {
  const b = steelBinding(), s = b.section!.effective;
  const x = resolveElasticBinding(b, 'WALER'), y = resolveElasticBinding({...b, orientationDeg: 90}, 'WALER');
  expect(x.I_mm4).toBe(Number(s.Ix_cm4) * 10000); expect(y.I_mm4).toBe(Number(s.Iy_cm4) * 10000);
  expect(x.E_MPa).toBe(200000); expect(y.E_MPa).toBe(x.E_MPa); expect(x.constructionRelease).toBe('NO_GO');
  expect(() => resolveElasticBinding(b, 'JOIST')).toThrow(/incompatible/);
});
it('refuses inherited/quarantined selection flags and known nonzero coupled bending instead of promoting reference data', () => {
  const b = steelBinding(); b.section = selectReference(sourceSections.find(s => s.family === 'RHS'), '0.4');
  expect(() => resolveElasticBinding(b, 'WALER')).toThrow(/NOT_EXPLICITLY_SELECTABLE/);
  const coupled = steelBinding(); coupled.section = selectReference(coupled.section!.reference, '0.4', {changes: {Ixy_cm4: 1}, reason: 'SYNTHETIC', evidenceRef: 'SYNTHETIC'});
  expect(() => resolveElasticBinding(coupled, 'WALER')).toThrow(/Coupled unsymmetric/);
});
it('uses measured timber dimensions and longitudinal E with independent hand-calculated axis properties, never the nominal label', () => {
  const b = timberBinding(), a = resolveElasticBinding(b, 'STUD'), rotated = resolveElasticBinding({...b, orientationDeg: 90, nominalLabel: '1.5x3 inches'}, 'JOIST');
  expect(a.I_mm4).toBeCloseTo(38 * 70 ** 3 / 12, 7); expect(rotated.I_mm4).toBeCloseTo(70 * 38 ** 3 / 12, 7);
  expect(a.areaMm2).toBe(38 * 70); expect(a.E_MPa).toBe(11000); expect(a.blockers.join()).toContain('GEOMETRY_ONLY');
  expect(() => resolveElasticBinding({...b, actualWidthMm: null, nominalLabel: '1.5x3 inches'}, 'JOIST')).toThrow(/actual timber width/);
  expect(() => resolveElasticBinding({...b, measurementEvidenceRef: ''}, 'JOIST')).toThrow(/measured/);
  expect(() => resolveElasticBinding(b, 'WALER')).toThrow(/incompatible/);
});
it('rejects wrong elastic keys, wrong grain, unknown modulus and out-of-scope product family/thickness', () => {
  expect(() => validateElasticBinding({...steelBinding(), elasticPropertyKey: 'Fy_MPa'})).toThrow(/property/);
  expect(() => resolveElasticBinding({...timberBinding(), grainParallelToMember: false}, 'JOIST')).toThrow(/grain/);
  const unknown = timberBinding(); unknown.elasticPropertyKey = 'E_ref_MPa'; expect(() => resolveElasticBinding(unknown, 'JOIST')).toThrow(/elastic modulus/);
  const wrong = steelBinding(); wrong.material = timberBinding().material; expect(() => resolveElasticBinding(wrong, 'WALER')).toThrow(/product form/);
  const thick = steelBinding(); thick.section = selectReference(thick.section!.reference, '0.4', {changes: {tw_mm: 41}, reason: 'SYNTHETIC', evidenceRef: 'SYNTHETIC'});
  expect(() => resolveElasticBinding(thick, 'WALER')).toThrow(/thickness applicability/);
});
it('preserves unknown bindings in drafts but rejects authority fields and simultaneous manual E/I overrides', () => {
  const b = emptyElasticBinding(); validateElasticBinding(b); expect(b.orientationDeg).toBeNull(); expect(b.material).toBeNull();
  expect(() => resolveElasticBinding(b, 'JOIST')).toThrow(/requires explicit/);
  expect(() => validateElasticBinding({...timberBinding(), approved: true})).toThrow(/authority/);
  expect(() => resolveMemberElastic({E_MPa: 11000, I_mm4: null, evidenceRef: '', binding: timberBinding()}, 'JOIST')).toThrow(/manual E/);
});
it('drives actual side stud/rail analysis from binding snapshots while retaining pressure and full support reactions', () => {
  const model = sideModel(), d = sideDefinition();
  for (const f of d.faces) {f.stud = {E_MPa: null, I_mm4: null, evidenceRef: '', binding: timberBinding()}; f.rail = {E_MPa: null, I_mm4: null, evidenceRef: '', binding: steelBinding()};}
  const r = analyzeSideLayout(model, stampSideLayout(model, d));
  expect(r.faces[0].elasticInputs.stud.I_mm4).toBeCloseTo(38 * 70 ** 3 / 12, 7);
  expect(r.faces[0].result.walers[0].railDefinitions[0].I_mm4).toBe(1950 * 10000);
  expect(r.faces.every(f => Math.abs(f.result.expectedForceN - 10000) < 1e-6)).toBe(true);
  expect(r.ties.every(t => t.demandKN !== null && Math.abs(t.demandKN! - t.a.forceN / 1000) < 1e-7)).toBe(true);
  expect(r.status).toBe('BLOCKED');
});
it('binds individual physical rails to different catalogue axes rather than one face-wide property record', () => {
  const model = sideModel(), d = explicitSideDefinition();
  for (const f of d.faces) for (const w of f.walers) w.pair!.rails.forEach((r, i) => Object.assign(r, {E_MPa: null, bendingI_mm4: null, family: null, orientationDeg: null, binding: steelBinding(i ? 90 : 0)}));
  const r = analyzeSideLayout(model, stampSideLayout(model, d)), w = r.faces[0].result.walers[0];
  expect(w.railDefinitions.map(r => r.I_mm4)).toEqual([1950e4, 168e4]);
  expect(w.rails[0].maxDeflectionMm / w.rails[1].maxDeflectionMm).toBeCloseTo((1 / 3) * 168 / 1950, 10);
  d.faces[0].walers[0].pair!.rails[0].family = 'RHS'; expect(() => analyzeSideLayout(model, stampSideLayout(model, d))).toThrow(/conflicts/);
});
it('binds joists and bearers through the generated soffit graph and conserves the actual unequal U-head reactions', () => {
  const model = slabModel(), layout = layoutFixture(), baseline = builtModel(), before = analyzeLoadPath(baseline.members);
  layout.joist = {...layout.joist, E_MPa: null, I_mm4: null, binding: timberBinding()}; layout.bearer = {...layout.bearer, E_MPa: null, I_mm4: null, binding: steelBinding()};
  const c = buildSoffitCandidate(model, layout), p = analyzeLoadPath(c.members), j = p.analyses.find(a => a.id === 'JOIST-2')!, original = before.analyses.find(a => a.id === 'JOIST-2')!;
  expect(c.members.find(m => m.role === 'JOIST')!.beam.E_MPa).toBe(11000);
  expect(j.maxDeflectionMm / original.maxDeflectionMm).toBeCloseTo(200000 * 1e6 / (11000 * (38 * 70 ** 3 / 12)), 8);
  expect(p.reactions.reduce((s, r) => s + r.forceN, 0)).toBeCloseTo(23760, 5);
  expect(p.reactions.find(r => r.nodeId === 'B1:HEAD-2')!.forceN).toBeCloseTo(7053.75, 5);
  expect(c.ownedForceN.componentSelfWeight).toBe(0); expect(c.elasticInputs.bearer.E_MPa).toBe(200000);
});
it('keeps bound snapshots independent of later generic reference selection and only adopts replacements explicitly', () => {
  const model = slabModel(), layout = layoutFixture(); layout.bearer = {...layout.bearer, E_MPa: null, I_mm4: null, binding: steelBinding()};
  const ready = regenerateDraftLayouts(model, {soffitLayout: layout});
  const custom = selectReference(steelBinding().material!.reference, '0.5.0', {changes: {properties: {E_MPa: 190000}}, reason: 'SYNTHETIC', evidenceRef: 'SYNTHETIC'});
  const changed = regenerateDraftLayouts(reviseDraft(ready, {selections: {...ready.selections, material: custom}}));
  expect(changed.members.find(m => m.role === 'BEARER')!.beam.E_MPa).toBe(200000);
  const replacement = structuredClone(changed.soffitLayout!); replacement.bearer.binding!.material = custom;
  const adopted = regenerateDraftLayouts(changed, {soffitLayout: replacement}); expect(adopted.members.find(m => m.role === 'BEARER')!.beam.E_MPa).toBe(190000);
  expect(adopted.revisionId).not.toBe(changed.revisionId);
});
it('freezes the original/effective binding sources with results, invalidates ordinary edits and rejects a rehashed forged binding result', async () => {
  const model = slabModel(), layout = layoutFixture(); layout.joist = {...layout.joist, E_MPa: null, I_mm4: null, binding: timberBinding()};
  const ready = regenerateDraftLayouts(model, {soffitLayout: layout}), frozen = await freezeDesign(ready), view = await documentView(frozen, ready);
  expect(view.report.preview.soffit!.elasticInputs.joist.E_MPa).toBe(11000); expect(Object.isFrozen(frozen.content.model.soffitLayout!.joist.binding!.material!.reference)).toBe(true);
  const edited = reviseDraft(ready, {gammaKNm3: 25}); expect(previewWorkflow(edited).loadPath).toBeNull(); expect((await documentView(frozen, edited)).freshness).toBe('STALE');
  const fake = structuredClone(frozen); fake.content.preview.soffit!.elasticInputs.joist.E_MPa = 200000; fake.snapshotHash = await contentHash(fake.content);
  await expect(documentView(fake, ready)).rejects.toThrow(/calculation mismatch/);
});
it('validates nested bindings when parsing models and retains incomplete unknown drafts with no usable source forces', async () => {
  const model = slabModel(), layout = layoutFixture(); layout.joist = {...layout.joist, E_MPa: null, I_mm4: null, binding: emptyElasticBinding()};
  const ready = regenerateDraftLayouts(model, {soffitLayout: layout}, {allowIncomplete: true}); expect(previewWorkflow(ready).loadPath).toBeNull();
  expect((await documentView(await freezeDesign(ready), ready)).report.model.soffitLayout!.joist.binding!.material).toBeNull();
  const bad = structuredClone(ready); (bad.soffitLayout!.joist.binding as unknown as Record<string, unknown>).confirmed = true;
  expect(() => parseWorkflowModel(bad)).toThrow(/authority/);
});
