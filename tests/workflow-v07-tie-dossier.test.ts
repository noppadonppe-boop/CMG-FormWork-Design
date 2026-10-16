import {expect, it} from 'vitest';
import {bindTieDossier, copyTieProductTemplate, editTieProduct, effectiveTieProduct, emptyTieDossier, evaluateTieDossier, migrateLegacyTieAssembly, tieGeometryContext, validateTieDossier} from '../src/domain/workflowV07/tieDossier';
import {pairFaces} from '../src/domain/workflowV07/geometry';
import {parseWorkflowModel, previewWorkflow, regenerateDraftLayouts, reviseDraft} from '../src/domain/workflowV07/model';
import {stampSideLayout} from '../src/domain/workflowV07/sideLayout';
import {compileLoadCase, applyLoadCases} from '../src/domain/workflowV07/loadCases';
import {applyStageStudy, captureStage, emptyStage} from '../src/domain/workflowV07/stageStudy';
import {contentHash, documentView, freezeDesign, importDraft} from '../src/domain/workflowV07/snapshot';
import {TIE_ROLES} from '../src/domain/workflowV07/assemblies';
import {tieDossierApplied} from './fixtures/workflow-v07-tie-dossier';
import {caseDefinition} from './fixtures/workflow-v07-loadcases';

function data() {const m = tieDossierApplied(), result = previewWorkflow(m).side!.ties[0].dossier!; return {m, dossier: structuredClone(m.sideLayout!.ties[0].dossier!), context: result.context, N: result.demandKN!};}
it('starts thirteen functional slots with unknown product/strength/area/length/engagement data and never fills factory values', () => {
  const d = emptyTieDossier(); expect(d.components.map(c => c.role)).toEqual([...TIE_ROLES]); expect(d.components.every(c => Object.values(c.reference.properties).every(v => v === null))).toBe(true); expect(d.boundGeometry).toBeNull(); expect(d.rodGauges).toEqual([]); expect(d.threads).toEqual([]);
  const {context, N} = data(), r = evaluateTieDossier(d, context, N, 'ALLOWABLE'); expect(r.demandKN).toBeNull(); expect(r.declaredCapacityMinKN).toBeNull(); expect(r.rodBodyExtensionMm).toBeNull(); expect(r.status).toBe('BLOCKED'); expect(r.constructionRelease).toBe('NO_GO');
});
it('binds the actual full single tie force to every serial role and keeps separate tensile/stiffness areas and body-only elongation', () => {
  const {m, dossier, context, N} = data(), r = evaluateTieDossier(dossier, context, N, 'ALLOWABLE'); expect(N).toBeCloseTo(3.5416666666666665, 10);
  expect(r.components.every(c => c.fullDemandKN === N && c.status === 'BLOCKED')).toBe(true); expect(r.declaredCapacityMinKN).toBe(100);
  expect(r.gauges.find(g => g.definition.role === 'INNER')!.stressDemandMPa).toBeCloseTo(N * 1000 / 50, 10); expect(r.rodBodyExtensionMm).toBeCloseTo(N * 1000 * 1250 / (200000 * 80), 12); expect(r.assemblyMovementMm).toBeNull();
  expect(context.chordMm).toBe(1000); expect(r.components.find(c => c.role === 'INNER')!.effective!.properties.orderLengthMm).toBeNull(); expect(previewWorkflow(m).constructionEligible).toBe(false);
});
it('retains a known capacity failure with other missing capacities, does not mix ultimate values, and handles zero declared capacity without Infinity', () => {
  const {dossier: d, context, N} = data(); d.components[0].reference.properties.capacityKN = .1; d.components[1].reference.properties.capacityKN = null;
  let r = evaluateTieDossier(d, context, N, 'ALLOWABLE'); expect(r.status).toBe('FAIL'); expect(r.declaredCapacityMinKN).toBeNull(); expect(r.components[0].status).toBe('FAIL');
  d.components[0].reference.capacityBasis = 'ULTIMATE_TEST'; r = evaluateTieDossier(d, context, N, 'ALLOWABLE'); expect(r.status).toBe('BLOCKED'); expect(r.components[0].declaredCapacityKN).toBeNull();
  d.components[0].reference.capacityBasis = 'ALLOWABLE'; d.components[0].reference.properties.capacityKN = 0; r = evaluateTieDossier(d, context, N, 'ALLOWABLE'); expect(r.status).toBe('FAIL'); expect(r.components[0].utilization).toBeNull(); expect(JSON.stringify(r)).not.toMatch(/Infinity|NaN/);
});
it('rejects known nominal diameter/pitch/hand and effective engagement mismatches without inferring aliases or male/female fit-class equivalence', () => {
  const {dossier: d, context, N} = data(); expect(evaluateTieDossier(d, context, N, 'ALLOWABLE').threads[0].status).toBe('BLOCKED');
  d.threads[0].female.nominalDiameterMm = 10; d.threads[0].female.hand = 'LEFT'; d.threads[0].actualEngagementMm = 0; let r = evaluateTieDossier(d, context, null, 'ALLOWABLE'); expect(r.status).toBe('FAIL'); expect(r.threads[0].issues).toContain('DECLARED_MINIMUM_EFFECTIVE_ENGAGEMENT_NOT_MET'); expect(r.threads[0].issues).toContain('DECLARED_THREAD_HANDS_DIFFER');
  d.threads[0].female = {...d.threads[0].male, lead: 2}; d.threads[0].actualEngagementMm = 30; expect(evaluateTieDossier(d, context, N, 'ALLOWABLE').threads[0].status).toBe('FAIL');
  d.threads[0].female = {...d.threads[0].male, leadSystem: 'TPI', lead: 25.4 / 1.5}; r = evaluateTieDossier(d, context, N, 'ALLOWABLE'); expect(r.threads[0].status).toBe('BLOCKED'); expect(r.threads[0].issues).toContain('THREAD_PROFILE_STANDARD_OR_DESIGNATION_COMPATIBILITY_UNVERIFIED_NO_ALIAS_INFERENCE');
});
it('keeps missing actual/minimum engagement unknown and does not invent a universal engagement or turn unknown into zero', () => {
  const {dossier: d, context, N} = data(); d.threads[0].actualEngagementMm = null; d.threads[1].requiredEngagementMm = null;
  const r = evaluateTieDossier(d, context, N, 'ALLOWABLE'); expect(r.threads.every(j => j.status === 'BLOCKED' && j.issues.includes('ACTUAL_AND_REQUIRED_ENGAGEMENT_SOURCES_MISSING'))).toBe(true); expect(r.assemblyMovementMm).toBeNull();
  d.threads[1].requiredEngagementMm = 0; expect(() => validateTieDossier(d)).toThrow(/requiredEngagement/);
});
it('invalidates a moved route, preserves source products, and requires explicit binding before current demands/rod indicators can be used', () => {
  const {m, dossier, N} = data(), layout = structuredClone(m.sideLayout!); layout.faces[0].walers[0].supports[0].xMm = 300; layout.faces[2].walers[0].supports[1].xMm = 700;
  const ready = regenerateDraftLayouts(m, {sideLayout: stampSideLayout(m, layout)}), stale = previewWorkflow(ready).side!.ties[0].dossier!; expect(stale.current).toBe(false); expect(stale.demandKN).toBeNull(); expect(stale.rodBodyExtensionMm).toBeNull(); expect(ready.sideLayout!.ties[0].dossier!.components).toEqual(dossier.components);
  layout.ties[0].dossier = bindTieDossier(dossier, tieGeometryContext(pairFaces(m.vertices, m.heightMm), layout, layout.ties[0])); const rebound = previewWorkflow(regenerateDraftLayouts(m, {sideLayout: stampSideLayout(m, layout)})).side!.ties[0].dossier!; expect(rebound.current).toBe(true); expect(rebound.demandKN).not.toBeCloseTo(N, 6); expect(rebound.components.every(c => c.fullDemandKN === rebound.demandKN)).toBe(true);
});
it('reconstructs audited numeric Custom changes without rewriting identity, original values, basis or history', () => {
  const {dossier: d, context, N} = data(), original = structuredClone(d.components[0]), edit = {field: 'capacityKN' as const, after: .1, reason: 'SYNTHETIC sensitivity only', evidenceRef: 'SYNTHETIC', actor: 'Declared test author', at: '2026-10-15T00:00:00.000Z', revision: 'SYN-R'};
  d.components[0] = editTieProduct(d.components[0], edit); expect(d.components[0].reference).toEqual(original.reference); expect(effectiveTieProduct(d.components[0]).properties.capacityKN).toBe(.1); expect(evaluateTieDossier(d, context, N, 'ALLOWABLE').status).toBe('FAIL');
  const changed = structuredClone(d.components[0]); changed.reference.manufacturer = 'OTHER'; expect(() => effectiveTieProduct(changed)).toThrow(/history changed/);
  expect(() => editTieProduct(original, {...edit, actor: ''})).toThrow(/declared actor/); expect(() => editTieProduct(original, {...edit, at: '2026-02-30T00:00:00.000Z'})).toThrow(/timestamp/); expect(() => editTieProduct(original, {...edit, field: 'capacityBasis' as never})).toThrow();
  const forged = structuredClone(d); Object.assign(forged.components[0], {effective: {capacityKN: 9999}}); expect(() => validateTieDossier(forged)).toThrow(/authority/);
  const geometryEdit = structuredClone(d); geometryEdit.components[0] = editTieProduct(geometryEdit.components[0], {...edit, field: 'steelLengthMm', after: 900});
  const stale = evaluateTieDossier(geometryEdit, context, N, 'ALLOWABLE'); expect(stale.current).toBe(false); expect(stale.demandKN).toBeNull(); expect(stale.status).toBe('FAIL');
  const rebound = evaluateTieDossier(bindTieDossier(geometryEdit, context), context, N, 'ALLOWABLE'); expect(rebound.current).toBe(true); expect(rebound.rodBodyExtensionMm).toBeNull(); expect(rebound.lengthChecks[0].status).toBe('FAIL');
});
it('keeps At and EA computations independent and blocks missing/double-counted body gauges without adding thread or cone movement', () => {
  const {dossier: d, context, N} = data(), before = evaluateTieDossier(d, context, N, 'ALLOWABLE'); d.components[0].reference.properties.tensileEffectiveAreaMm2 = null;
  expect(evaluateTieDossier(d, context, N, 'ALLOWABLE').current).toBe(false);
  let r = evaluateTieDossier(bindTieDossier(d, context), context, N, 'ALLOWABLE'); expect(r.gauges.find(g => g.definition.role === 'INNER')!.stressDemandMPa).toBeNull(); expect(r.rodBodyExtensionMm).toBeCloseTo(before.rodBodyExtensionMm!, 12);
  d.components[0].reference.properties.stiffnessAreaMm2 = null; r = evaluateTieDossier(d, context, N, 'ALLOWABLE'); expect(r.rodBodyExtensionMm).toBeNull(); expect(r.assemblyMovementMm).toBeNull();
  const overlap = data().dossier; overlap.rodGauges.push({...overlap.rodGauges[1], id: 'DUPLICATE-GAUGE'}); r = evaluateTieDossier(overlap, context, N, 'ALLOWABLE'); expect(r.rodBodyExtensionMm).toBeNull(); expect(r.blockers).toContain('OVERLAPPING_ROD_BODY_GAUGES_WOULD_DOUBLE_COUNT_AXIAL_EXTENSION');
});
it('preserves independent adverse length/thread conditions and never infers order/cut length from concrete chord', () => {
  const {dossier: d, context, N} = data(); d.components.find(c => c.role === 'INNER')!.reference.properties.steelLengthMm = 900; d.components[0].reference.properties.E_MPa = null;
  const r = evaluateTieDossier(d, context, N, 'ALLOWABLE'); expect(r.status).toBe('FAIL'); expect(r.lengthChecks.find(l => l.role === 'INNER')!.status).toBe('FAIL'); expect(r.rodBodyExtensionMm).toBeNull(); expect(r.components[0].effective!.properties.orderLengthMm).toBeNull();
  d.components[0].reference.properties.E_MPa = 1e308; d.components[0].reference.properties.stiffnessAreaMm2 = 1e308; const huge = evaluateTieDossier(bindTieDossier(d, context), context, N, 'ALLOWABLE'); expect(huge.status).toBe('FAIL'); expect(huge.rodBodyExtensionMm).toBeNull(); expect(JSON.stringify(huge)).not.toMatch(/NaN|Infinity/);
});
it('copies product references/history while clearing actual geometry/body/engagement measurements on a new tie', () => {
  const {dossier: d} = data(), copy = copyTieProductTemplate(d); expect(copy.components).toEqual(d.components); expect(copy.boundGeometry).toBeNull(); expect(copy.geometryEvidenceRef).toBe(''); expect(copy.rodScope).toBeNull(); expect(copy.threads.every(j => j.actualEngagementMm === null && j.measurementEvidenceRef === '' && j.requiredEngagementMm === 25)).toBe(true); expect(copy.rodGauges.every(g => g.startMm === null && g.endMm === null)).toBe(true);
  copy.components[0].reference.productId = 'CHANGED'; expect(d.components[0].reference.productId).not.toBe('CHANGED');
});
it('migrates legacy declared values by explicit action, keeps the exact source and never promotes reduced local fractions to full-tie capacities', () => {
  const {context, N} = data(), old = {topology: 'SEGMENTED_INNER_OUTER' as const, components: TIE_ROLES.map(role => ({role, productId: `OLD-${role}`, sourceRef: 'SYNTHETIC imported', capacityKN: role === 'INNER' ? .1 : 100, basis: 'ALLOWABLE' as const, demandFraction: role === 'WALER_LOCAL_LEFT' ? .5 : 1})), compatibilityEvidence: 'SYNTHETIC', engagementLeftMm: 30, engagementRightMm: 30, requiredEngagementLeftMm: 25, requiredEngagementRightMm: 25}, before = structuredClone(old);
  const d = migrateLegacyTieAssembly(old); expect(JSON.parse(d.legacySourceDefinition!)).toEqual(old); expect(old).toEqual(before); expect(d.components.find(c => c.role === 'WALER_LOCAL_LEFT')!.reference.properties.capacityKN).toBeNull(); expect(d.threads.every(j => !j.measurementEvidenceRef && !j.requirementEvidenceRef)).toBe(true);
  d.geometryEvidenceRef = 'SYNTHETIC explicit rebound'; const r = evaluateTieDossier(bindTieDossier(d, context), context, N, 'ALLOWABLE'); expect(r.status).toBe('FAIL'); expect(r.declaredCapacityMinKN).toBeNull();
});
it('does not choose an average or maximum tie demand when opposite side forces differ, even with complete declared product rows', () => {
  const {m} = data(), layout = structuredClone(m.sideLayout!); layout.faces[2].walers[0].supports.splice(1, 0, {id: 'MID', xMm: 500});
  const r = previewWorkflow(regenerateDraftLayouts(m, {sideLayout: stampSideLayout(m, layout)})).side!.ties[0]; expect(r.demandKN).toBeNull(); expect(r.dossier!.demandKN).toBeNull(); expect(r.dossier!.gauges.every(g => g.stressDemandMPa === null && g.extensionMm === null)).toBe(true);
});
it('uses the actual named case basis/full force in each Stage and retains individual role/body/interface required rows', () => {
  const {m, N} = data(), c = caseDefinition('TIE', {stageId: 'TEST-POUR', basis: 'SERVICE'}); c.factors.HYDROSTATIC_SIDE = 2;
  const child = compileLoadCase(m, c), p = previewWorkflow(child); expect(p.side!.ties[0].dossier!.demandKN).toBeCloseTo(N * 2, 8); expect(p.side!.ties[0].dossier!.rodBodyExtensionMm).toBeCloseTo(N * 2 * 1000 * 1250 / (200000 * 80), 10);
  c.basis = 'FACTORED'; const factored = previewWorkflow(compileLoadCase(m, c)); expect(factored.side!.ties[0].dossier!.declaredCapacityMinKN).toBeNull(); expect(factored.side!.ties[0].dossier!.components.every(r => r.declaredCapacityKN === null)).toBe(true);
  const book = applyLoadCases(m, {schemaVersion: '1', cases: [c]}), row = captureStage(book, {...emptyStage('TIE'), stageId: 'TEST-POUR', evidenceRef: 'SYNTHETIC'}), ready = applyStageStudy(book, {schemaVersion: '1', stages: [row]}), all = previewWorkflow(ready);
  expect(all.requiredChecks.filter(r => r.checkId === 'SIDE-09')).toHaveLength((8 + 13 + 3 + 2) * 2); expect(all.requiredChecks.every(r => r.revision === ready.revisionId)).toBe(true); expect(all.coverageReview.checkedCount).toBe(0);
});
it('rejects malformed/authority/history/size records and competing topology/data rather than trusting client result fields', () => {
  const {m, dossier: d} = data(); const forged = structuredClone(d); Object.assign(forged, {approved: true}); expect(() => validateTieDossier(forged)).toThrow(/authority/);
  const dup = structuredClone(d); dup.components.push(dup.components[0]); expect(() => validateTieDossier(dup)).toThrow(/13-role/);
  const invalid = structuredClone(d); invalid.components[0].reference.properties.capacityKN = NaN; expect(() => validateTieDossier(invalid)).toThrow();
  const long = structuredClone(d); long.threads = Array.from({length: 13}, (_, i) => ({...long.threads[0], id: `X${i}`})); expect(() => validateTieDossier(long)).toThrow(/12-interface/);
  const other = {...m, sideTopology: 'THROUGH_TIE' as const}; expect(previewWorkflow(other).side).toBeNull(); const both = structuredClone(m); both.sideLayout!.ties[0].assembly = {topology: 'SEGMENTED_INNER_OUTER', components: [], compatibilityEvidence: null, engagementLeftMm: null, engagementRightMm: null, requiredEngagementLeftMm: null, requiredEngagementRightMm: null}; expect(() => parseWorkflowModel(both)).toThrow(/cannot compete/);
});
it('freezes original/effective/history/geometry/indicators with the drawing, invalidates edits/reimports and rejects rehashed forged favorable values', async () => {
  const {m} = data(), frozen = await freezeDesign(m), view = await documentView(frozen, m); expect(view.drawing.side!.ties[0].dossier!.gauges).toHaveLength(3); expect(view.constructionEligible).toBe(false);
  const layout = structuredClone(m.sideLayout!); layout.ties[0].dossier!.components[0].reference.properties.capacityKN = .1; const edited = reviseDraft(m, {sideLayout: stampSideLayout(m, layout)}); expect(previewWorkflow(edited).side).toBeNull(); expect((await documentView(frozen, edited)).freshness).toBe('STALE'); expect(previewWorkflow(importDraft(m)).side).toBeNull();
  const forged = structuredClone(frozen); forged.content.preview.side!.ties[0].dossier!.declaredCapacityMinKN = 999; forged.snapshotHash = await contentHash(forged.content); await expect(documentView(forged, m)).rejects.toThrow(/calculation mismatch/);
});
