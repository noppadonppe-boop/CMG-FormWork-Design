import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {expect, it} from 'vitest';
import {emptyRinglockResearchChoice, nominalTubeProperties, referenceSectionIds, selectRinglockResearch, screenRinglockResearch, type RinglockResearchData} from '../src/domain/workflowV07/ringlockResearch';
import {previewWorkflow, reviseDraft} from '../src/domain/workflowV07/model';
import {documentView, freezeDesign} from '../src/domain/workflowV07/snapshot';
import {builtModel} from './fixtures/workflow-v07-soffit';

const bytes = readFileSync('src/reference/workflow-v07/ringlock-research-2026-10-15.json'), data = JSON.parse(bytes.toString()) as RinglockResearchData;
const sha = createHash('sha256').update(bytes).digest('hex');
const choice = () => ({...emptyRinglockResearchChoice(), groupId: 'TCB-FOOT-BASED-REFERENCE', role: 'STANDARD' as const, sectionId: 'CHS-48.3x3.2'});
it('preserves the updated research source byte-for-byte and keeps the original archive catalogue separate', () => {
  expect(bytes).toEqual(readFileSync('artifacts/ringlock-research-2026-10-15/ringlock-reference-data.json'));
  expect(sha).toBe('7ce08c7280340a1ab748746bb7a973cf3724fb66bdf7def1d1a9e3b5b0800a13');
  expect(data.sections).toHaveLength(5); expect(data.material_grade_references).toHaveLength(3);
  const original = JSON.parse(readFileSync('src/reference/workflow-v07/ringlock.json', 'utf8'));
  expect(original.components.every((c: Record<string, unknown>) => c.rated_capacity_kN === null)).toBe(true);
});
it('recomputes nominal tube properties with independent annulus identities and rejects inconsistent data', () => {
  for (const section of data.sections) {
    const D = Number(section.D_mm), t = Number(section.t_mm), p = nominalTubeProperties(D, t), meanD = D - t;
    expect(p.A_mm2).toBeCloseTo(Math.PI * t * meanD, 8);
    expect(p.I_mm4).toBeCloseTo(Math.PI * t * meanD * (meanD ** 2 + t ** 2) / 8, 6);
  }
  const snap = selectRinglockResearch(data, sha, choice()); snap.section!.Iy_mm4 = 999;
  expect(() => screenRinglockResearch(snap, null)).toThrow(/inconsistent/);
});
it('does not infer a TNV section, join TCB stock to metric modules, or assign any grade/elastic default', () => {
  const tnv = data.product_reference_groups.find(g => g.id === 'TNV-METRIC-REFERENCE')!;
  expect(referenceSectionIds(tnv, 'STANDARD')).toEqual([]);
  expect(() => selectRinglockResearch(data, sha, {...choice(), groupId: 'TNV-METRIC-REFERENCE'})).toThrow(/not evidenced/);
  const snap = selectRinglockResearch(data, sha, choice()), preview = screenRinglockResearch(snap, builtModel().ringlock);
  expect(snap.material).toBeNull(); expect(snap.elastic).toBeNull();
  expect(preview.planMatches).toEqual({x: false, y: false});
  expect(preview.blockers).toContain('REFERENCE_PRODUCT_MODULE_DOES_NOT_MATCH_SELECTED_PLAN');
});
it('keeps Q345B/Q355B and selected elastic constants as explicit reference hypotheses, never ratings', () => {
  const snap = selectRinglockResearch(data, sha, {...choice(), materialGrade: 'Q355B', useElasticReference: true, hypothesisRef: 'SYNTHETIC sensitivity only'});
  expect(snap.material?.Fy_min_MPa).toBe(355); expect(snap.elastic?.E_MPa).toBe(210000);
  const model = {...builtModel(), ringlockResearch: snap}, p = previewWorkflow(model);
  expect(model.ringlockRating).toBeNull(); expect(p.status).toBe('BLOCKED'); expect(p.constructionEligible).toBe(false);
  expect(p.blockers).toContain('FEEDSTOCK_GRADE_REFERENCE_IS_NOT_FINISHED_TUBE_CERTIFICATION');
  expect(p.blockers).toContain('PROJECT_BRACE_END_NODE_STIFFNESS_AND_RESISTANCE_REQUIRED');
  expect(p.loadPath?.reactions).toEqual(previewWorkflow(builtModel()).loadPath?.reactions);
});
it('compatible metric labels do not approve braces, project stock or imported foreign joint ratings', () => {
  const snap = selectRinglockResearch(data, sha, {...emptyRinglockResearchChoice(), groupId: 'TNV-METRIC-REFERENCE'});
  const p = screenRinglockResearch(snap, builtModel().ringlock);
  expect(p.planMatches).toEqual({x: true, y: true});
  expect(p.blockers).toContain('REFERENCE_MODULE_LABELS_DO_NOT_VERIFY_INSTALLED_BRACES_OR_DATUMS');
  expect(p.constructionRelease).toBe('NO_GO'); expect(snap).not.toHaveProperty('external_joint_model_example');
});
it('freezes selected original records and sources, with stale results after reference changes', async () => {
  const snap = selectRinglockResearch(data, sha, choice()), model = {...builtModel(), ringlockResearch: snap};
  const frozen = await freezeDesign(model), old = snap.section!.A_mm2; snap.section!.A_mm2 = 1;
  expect(frozen.content.model.ringlockResearch?.section?.A_mm2).toBe(old);
  const changed = reviseDraft(frozen.content.model, {ringlockResearch: selectRinglockResearch(data, sha, {...choice(), materialGrade: 'Q235B'})});
  expect((await documentView(frozen, changed)).freshness).toBe('STALE');
  expect(previewWorkflow(changed).loadPath).toBeNull(); // explicit regeneration after a revision change
});
