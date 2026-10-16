import {expect, it} from 'vitest';
import {analyzeBeam, type BeamInput} from '../src/domain/workflowV07/beam';
import {compareLocalBeamInputs, evaluateCoverageReview, requirementKey, requirementRef, stampCoverageReview, validateCoverageReview} from '../src/domain/workflowV07/coverageReview';
import {applyCoverageReview, parseWorkflowModel, previewWorkflow, regenerateDraftLayouts, reviseDraft} from '../src/domain/workflowV07/model';
import {contentHash, documentView, freezeDesign, importDraft} from '../src/domain/workflowV07/snapshot';
import {checkCatalogue, coverageModel, representativeGroup} from './fixtures/workflow-v07-coverage';
import {frameApplied} from './fixtures/workflow-v07-frame-workflow';
import {sideApplied} from './fixtures/workflow-v07-side';

const asymmetricBeam = (): BeamInput => ({id: 'SYN-A', revision: 'R1', lengthMm: 1000, E_MPa: 200000, I_mm4: 1e6,
  supports: [{id: 'LEFT', xMm: 100, rotationFixed: true}, {id: 'RIGHT', xMm: 800}], points: [{id: 'P', xMm: 350, forceN: 200}],
  patches: [{id: 'Q', startMm: 100, endMm: 600, startNPerMm: 2, endNPerMm: 7}]});
const mirroredBeam = (): BeamInput => ({id: 'SYN-B', revision: 'R1', lengthMm: 1000, E_MPa: 200000, I_mm4: 1e6,
  supports: [{id: 'OTHER-PIN', xMm: 200, rotationFixed: false}, {id: 'OTHER-FIX', xMm: 900, rotationFixed: true}], points: [{id: 'OTHER-P', xMm: 650, forceN: 200}],
  patches: [{id: 'OTHER-Q', startMm: 400, endMm: 900, startNPerMm: 7, endNPerMm: 2}]});
it('captures actual analysis inputs by value, including transferred joist reactions rather than the unapplied bearer definition', () => {
  const raw = asymmetricBeam(), result = analyzeBeam(raw); raw.patches[0].startNPerMm = 100;
  expect(result.input.patches[0].startNPerMm).toBe(2);
  const model = coverageModel(), p = previewWorkflow(model), bearer = p.loadPath!.analyses.find(a => a.id === 'B1')!;
  expect(model.members.find(m => m.beam.id === 'B1')!.beam.points).toEqual([]); expect(bearer.input.points).toHaveLength(5);
  expect(bearer.input.points.reduce((n, p) => n + p.forceN, 0)).toBeCloseTo(11880, 6);
});
it('proves a reversed asymmetric 1D input and independent reaction/moment/deflection symmetry without asserting a physical mirror system', () => {
  const a = asymmetricBeam(), b = mirroredBeam(); expect(compareLocalBeamInputs(a, b).equivalent).toBe(false);
  const proof = compareLocalBeamInputs(a, b, true); expect(proof.equivalent).toBe(true); expect(proof.scope).toBe('PRISMATIC_1D_ELASTIC_DEMAND_INPUT_ONLY');
  const x = analyzeBeam(a), y = analyzeBeam(b);
  expect(x.maxMomentNmm).toBeCloseTo(y.maxMomentNmm, 5); expect(x.maxDeflectionMm).toBeCloseTo(y.maxDeflectionMm, 9);
  expect(x.reactions[0].forceN).toBeCloseTo(y.reactions[1].forceN, 7); expect(x.reactions[0].momentNmm).toBeCloseTo(-y.reactions[1].momentNmm, 5);
  expect(proof.constructionRelease).toBe('NO_GO');
});
it('distinguishes supports, stiffness, load coordinates and triangular direction; equal resultant or EI alone is insufficient', () => {
  const original = asymmetricBeam();
  for (const change of [(b: BeamInput) => b.supports[0].rotationFixed = false, (b: BeamInput) => b.points[0].xMm++, (b: BeamInput) => b.patches[0].startNPerMm = 3,
    (b: BeamInput) => {b.E_MPa /= 2; b.I_mm4 *= 2;}, (b: BeamInput) => b.revision = 'R0']) {
    const b = structuredClone(original); change(b); expect(compareLocalBeamInputs(original, b).equivalent).toBe(false);
  }
  const reversed = mirroredBeam(); reversed.patches[0].startNPerMm = 2; reversed.patches[0].endNPerMm = 7; expect(compareLocalBeamInputs(original, reversed, true).differences).toContain('patches');
  const tiny = structuredClone(original); tiny.points[0].xMm += 1e-7; expect(compareLocalBeamInputs(original, tiny).equivalent).toBe(false);
});
it('ignores load/support labels and input order while rejecting unknown local model fields, bad stations and ambiguous restraints', () => {
  const a = asymmetricBeam(), b = structuredClone(a); b.id = 'OTHER'; b.supports.reverse(); b.supports[0].id = 'RENAMED'; expect(compareLocalBeamInputs(a, b).equivalent).toBe(true);
  expect(() => compareLocalBeamInputs(a, {...b, composite: true} as BeamInput)).toThrow(/authority/);
  b.points[0].xMm = 1001; expect(() => compareLocalBeamInputs(a, b)).toThrow(/station/);
  b.points[0].xMm = 350; b.supports[0].rotationFixed = null as never; expect(() => compareLocalBeamInputs(a, b)).toThrow(/restraint/);
});
it('retains every actual member/check/case/revision row and all unassigned specifications rather than inferring coverage from present representatives', () => {
  const model = coverageModel(), p = previewWorkflow(model), matrix = p.coverageReview;
  expect(matrix.rows.map(requirementKey)).toEqual(p.requiredChecks.map(requirementKey)); expect(matrix.total).toBe(p.requiredChecks.length);
  expect(matrix.total).toBeGreaterThan(100); expect(matrix.counts.UNASSIGNED).toBe(matrix.total); expect(matrix.checkedCount).toBe(0);
  expect(p.specificationGaps).toContain('SOFFIT-03'); expect(p.constructionEligible).toBe(false);
});
it('compares interior joist demands per check while retaining capacity/material/contact scope blockers and distinguishing an edge joist', () => {
  const {model, group} = representativeGroup(), edge = requirementRef(previewWorkflow(model).requiredChecks.find(r => r.memberId === 'JOIST-1' && r.checkId === 'SOFFIT-05')!);
  group.targets.push(edge); const p = previewWorkflow(applyCoverageReview(model, {schemaVersion: '1', groups: [group]}));
  const interior = p.coverageReview.rows.find(r => r.memberId === 'JOIST-3' && r.checkId === 'SOFFIT-05')!, outer = p.coverageReview.rows.find(r => requirementKey(r) === requirementKey(edge))!;
  expect(interior.localDemandEquivalent).toBe(true); expect(interior.exactApplicability).toBe(false); expect(interior.state).toBe('REPRESENTATIVE_PENDING');
  expect(interior.comparisonIssues).toContain('MATERIAL_ORIENTATION_CONTACT_RESTRAINTS_AND_CHECK_SCOPE_REVIEW_REQUIRED');
  expect(outer.localDemandEquivalent).toBe(false); expect(outer.state).toBe('NON_EQUIVALENT'); expect(p.coverageReview.checkedCount).toBe(0); expect(p.status).toBe('BLOCKED');
});
it('requires exact applicability for the exact mode, never dropping member-specific IDs or declaring longest-member envelopes', () => {
  const {model, group} = representativeGroup(); group.mode = 'EXACT_APPLICABILITY';
  const rows = previewWorkflow(applyCoverageReview(model, {schemaVersion: '1', groups: [group]})).coverageReview.rows;
  expect(rows.find(r => r.memberId === 'JOIST-2' && r.checkId === 'SOFFIT-05')!.state).toBe('REPRESENTATIVE_PENDING');
  expect(rows.find(r => r.memberId === 'JOIST-3' && r.checkId === 'SOFFIT-05')!.state).toBe('NON_EQUIVALENT');
});
it('preserves the design revision and source analysis for plan-only edits, changes frozen identity and leaves pending group checks unapproved', async () => {
  const {model, group} = representativeGroup(), frozen = await freezeDesign(model), changed = applyCoverageReview(model, {schemaVersion: '1', groups: [group]});
  expect(changed.revisionId).toBe(model.revisionId); expect(previewWorkflow(changed).loadPath).toEqual(previewWorkflow(model).loadPath);
  expect((await documentView(frozen, changed)).freshness).toBe('STALE'); expect(changed.representatives).toEqual([]); expect(changed.coverage).toEqual([]);
});
it('invalidates review after source changes and preserves old requirement references through explicit upstream regeneration', () => {
  const {applied, group} = representativeGroup(), edited = reviseDraft(applied, {constructionLiveKPa: 3});
  expect(previewWorkflow(edited).coverageReview.sourceCurrent).toBe(false);
  const rebuilt = regenerateDraftLayouts(edited), matrix = previewWorkflow(rebuilt).coverageReview;
  expect(matrix.rows.every(r => r.state === 'STALE_PLAN')).toBe(true); expect(matrix.diagnostics.some(s => s.includes('STALE_TARGET'))).toBe(true);
  expect(rebuilt.coverageReview!.groups[0].targets).toEqual(group.targets);
});
it('retains duplicate, missing and wrong-case assignments as explicit diagnostics without allowing them to hide uncovered rows', () => {
  const {model, group} = representativeGroup(), duplicate = {...structuredClone(group), id: 'DUP'};
  let p = previewWorkflow(applyCoverageReview(model, {schemaVersion: '1', groups: [group, duplicate]})); expect(p.coverageReview.counts.DUPLICATE_ASSIGNMENT).toBe(2);
  const wrong = structuredClone(group); wrong.representative!.loadCaseId = 'OTHER';
  p = previewWorkflow(applyCoverageReview(model, {schemaVersion: '1', groups: [wrong]})); expect(p.coverageReview.counts.NON_EQUIVALENT).toBe(2);
  expect(p.coverageReview.diagnostics.some(s => s.includes('UNKNOWN_OR_STALE_REPRESENTATIVE'))).toBe(true);
  const missing = structuredClone(group); missing.targets[0].memberId = 'DOES-NOT-EXIST';
  p = previewWorkflow(applyCoverageReview(model, {schemaVersion: '1', groups: [missing]})); expect(p.coverageReview.diagnostics.some(s => s.includes('UNKNOWN_OR_STALE_TARGET'))).toBe(true);
  const applied = applyCoverageReview(model, {schemaVersion: '1', groups: [group]}), beams = previewWorkflow(applied).loadPath!.analyses;
  const ambiguous = evaluateCoverageReview(applied, p.requiredChecks, [...beams, structuredClone(beams.find(b => b.id === 'JOIST-2')!)]);
  expect(ambiguous.rows.find(r => r.memberId === 'JOIST-3' && r.checkId === 'SOFFIT-05')!.comparisonIssues).toContain('AMBIGUOUS_ACTUAL_ANALYSIS_ID');
  expect(ambiguous.rows.find(r => r.memberId === 'JOIST-3' && r.checkId === 'SOFFIT-05')!.localDemandEquivalent).toBeNull();
});
it('records N/A proposals and partial groups with evidence but never converts draft reasons or imported check-status strings into verified results', () => {
  const {model, group} = representativeGroup(); group.mode = 'NOT_APPLICABLE_CLAIM'; group.representative = null; group.notApplicableReason = 'SYNTHETIC requires geometry/rule review';
  let changed = applyCoverageReview(model, {schemaVersion: '1', groups: [group]}), p = previewWorkflow(changed);
  expect(p.coverageReview.counts.NA_PENDING).toBe(2); expect(p.coverageReview.verifiedNotApplicableCount).toBe(0);
  const r = p.requiredChecks[0]; changed = {...changed, representatives: [{id: 'CLAIM', ...requirementRef(r), applicability: r.applicability, status: 'CHECKED_IN_SCOPE'}]};
  expect(previewWorkflow(changed).coverageReview.checkedCount).toBe(0);
  group.evidenceRef = ''; p = previewWorkflow(applyCoverageReview(model, {schemaVersion: '1', groups: [group]})); expect(p.coverageReview.counts.INCOMPLETE_GROUP).toBe(2);
  expect(evaluateCoverageReview(model, [], []).status).toBe('BLOCKED');
});
it('refuses local 1D scope for global frame/check entities and keeps opposite-face local matches separate from corner/mirror-system proof', () => {
  const frame = regenerateDraftLayouts({...frameApplied(), checkCatalogue: checkCatalogue()}), p = previewWorkflow(frame), frameRow = p.requiredChecks.find(r => r.memberId.startsWith('FRAME:') && r.checkId === 'RINGLOCK-08')!;
  const g = {id: 'FRAME', representative: requirementRef(frameRow), targets: [requirementRef(frameRow)], mode: 'LOCAL_1D_SAME' as const, evidenceRef: 'SYNTHETIC', notApplicableReason: ''};
  expect(previewWorkflow(applyCoverageReview(frame, {schemaVersion: '1', groups: [g]})).coverageReview.rows.find(r => requirementKey(r) === requirementKey(frameRow))!.state).toBe('NON_EQUIVALENT');
  const side = {...sideApplied(), checkCatalogue: checkCatalogue()}, sp = previewWorkflow(side), ref = (memberId: string) => requirementRef(sp.requiredChecks.find(r => r.memberId === memberId && r.checkId === 'SIDE-04')!);
  const sg = {...g, representative: ref('F1:STUD:3'), targets: [ref('F3:STUD:3')]};
  const sr = previewWorkflow(applyCoverageReview(side, {schemaVersion: '1', groups: [sg]})).coverageReview.rows.find(r => requirementKey(r) === requirementKey(sg.targets[0]))!;
  expect(sr.localDemandEquivalent).toBe(true); expect(sr.exactApplicability).toBe(false); expect(sr.status).toBe('BLOCKED');
});
it('rejects authority/unknown schema and oversized plans without silently truncating actual requirement references', () => {
  const {model, group} = representativeGroup(), plan = stampCoverageReview(model, {schemaVersion: '1', groups: [group]});
  expect(() => validateCoverageReview({...plan, approved: true})).toThrow(/authority/);
  expect(() => validateCoverageReview({...plan, groups: [{...group, status: 'CHECKED_IN_SCOPE'}]})).toThrow(/authority/);
  expect(() => stampCoverageReview(model, {schemaVersion: '1', groups: [{...group, targets: Array(20001).fill(group.targets[0])}]})).toThrow(/SIZE_LIMIT/);
  expect(parseWorkflowModel(model).coverageReview).toBeUndefined();
});
it('freezes complete matrix and actual beam inputs with the report/drawing, rejects rehashed fake check results and marks imported plans stale', async () => {
  const {applied} = representativeGroup(), frozen = await freezeDesign(applied), view = await documentView(frozen, applied);
  expect(view.drawing.coverageReview).toEqual(view.report.preview.coverageReview); expect(view.report.preview.coverageReview.rows.length).toBe(view.report.preview.requiredChecks.length);
  const bad = structuredClone(frozen); bad.content.preview.coverageReview.checkedCount = 1; bad.snapshotHash = await contentHash(bad.content);
  await expect(documentView(bad, applied)).rejects.toThrow(/calculation mismatch/);
  const imported = importDraft(applied); expect(previewWorkflow(imported).coverageReview.sourceCurrent).toBe(false); expect(imported.humanInputReviewed).toBe(false);
});
