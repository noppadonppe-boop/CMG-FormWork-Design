import {expect, it} from 'vitest';
import {applyStageStudy, captureStage, compileStage, copyToDraftStage, emptyStage, loadStageForEditing, removeStageLayout, stageInputsDefinition, stampStageStudy} from '../src/domain/workflowV07/stageStudy';
import {applyCoverageReview, parseWorkflowModel, previewWorkflow, regenerateDraftLayouts, reviseDraft} from '../src/domain/workflowV07/model';
import {applyLoadCases} from '../src/domain/workflowV07/loadCases';
import {requirementKey, requirementRef} from '../src/domain/workflowV07/coverageReview';
import {documentView, freezeDesign, importDraft, contentHash} from '../src/domain/workflowV07/snapshot';
import {coverageModel} from './fixtures/workflow-v07-coverage';
import {caseDefinition, loadCaseSource} from './fixtures/workflow-v07-loadcases';
import {frameFixture} from './fixtures/workflow-v07-frame-workflow';
import {stampFrameLayout} from '../src/domain/workflowV07/frameWorkflow';
import type {WorkflowModel} from '../src/domain/workflowV07/model';

export const captured = (model: WorkflowModel, id = 'POUR') => captureStage(model, {...emptyStage(id), stageId: model.soffitLayout?.stageId ?? model.frameLayout!.stageId,
  label: `SYNTHETIC ${id}`, evidenceRef: 'SYNTHETIC independent stage scope, not a construction sequence'});
export function stagesFixture() {
  const source = coverageModel(), first = captured(source), layout = structuredClone(source.soffitLayout!);
  layout.stageId = 'CHANGED-SUPPORTS'; layout.bearers.forEach(b => b.headsXMm = [0, 800, 1600, 2400]); layout.joist.I_mm4 = 2e6;
  const second = regenerateDraftLayouts(source, {soffitLayout: layout, constructionLiveKPa: 1});
  return applyStageStudy(second, {schemaVersion: '1', stages: [first, captured(second, 'CHANGED')]});
}
it('stores independent physical member/support/stiffness inputs without carrying numerical outputs or review claims', () => {
  const source = coverageModel(), before = structuredClone(source), r = captured(source);
  expect(source).toEqual(before); expect(r.inputs!.members).toEqual([]); expect(r.inputs!.actions).toEqual([]); expect(r.inputs!.requiredChecks).toEqual([]);
  expect(r.inputs!.ringlock!.legs).toEqual([]); expect(r.inputs!.humanInputReviewed).toBe(false); expect(r.inputs).not.toHaveProperty('stageStudy');
  expect(r.capturedRevision).toBe(source.revisionId); expect(r.inputs!.soffitLayout).toEqual(source.soffitLayout);
});
it('rebuilds changed support layouts independently, retaining every reaction and distinct stiffness in one project revision', () => {
  const m = stagesFixture(), p = previewWorkflow(m), a = p.stageStudy!.stages[0], b = p.stageStudy!.stages[1];
  expect(a.errors).toEqual([]); expect(b.errors).toEqual([]); expect(p.stageStudy!.activeCaptured).toBe(true); expect(p.stageStudy!.current).toBe(true);
  expect(a.preview!.loadPath!.reactions).toHaveLength(6); expect(b.preview!.loadPath!.reactions).toHaveLength(8);
  expect(a.preview!.soffit!.terminalForceN).toBeCloseTo(23760, 6); expect(b.preview!.soffit!.terminalForceN).toBeCloseTo(18360, 6);
  expect(a.model!.soffitLayout!.joist.I_mm4).toBe(1e6); expect(b.model!.soffitLayout!.joist.I_mm4).toBe(2e6);
  const aa = a.preview!.loadPath!.analyses.find(v => v.id === 'JOIST-2')!, bb = b.preview!.loadPath!.analyses.find(v => v.id === 'JOIST-2')!;
  expect(bb.maxDeflectionMm / aa.maxDeflectionMm).toBeCloseTo(18360 / 23760 / 2, 9);
  expect(a.model!.revisionId).toBe(m.revisionId); expect(b.model!.revisionId).toBe(m.revisionId); expect(p.constructionEligible).toBe(false);
});
it('creates unambiguous stage/case/member requirements without counting the active editor twice', () => {
  const m = stagesFixture(), p = previewWorkflow(m), rows = p.stageStudy!.stages.flatMap(s => s.requiredChecks);
  expect(p.requiredChecks).toEqual(rows); expect(new Set(rows.map(requirementKey)).size).toBe(rows.length); expect(rows.every(r => r.memberId.startsWith('STAGE:') && r.revision === m.revisionId)).toBe(true);
  expect(rows.every(r => typeof r.applicability.physicalMemberId === 'string')).toBe(true); expect(p.coverageReview.total).toBe(rows.length); expect(p.coverageReview.checkedCount).toBe(0);
});
it('rejects a typical local-beam proof across physical stages even if the local 1D inputs happen to match', () => {
  const source = coverageModel(), a = captured(source), other = structuredClone(source); other.soffitLayout!.stageId = 'OTHER';
  const m = applyStageStudy(source, {schemaVersion: '1', stages: [a, captured(other, 'OTHER')]}), p = previewWorkflow(m);
  const ref = (id: string) => requirementRef(p.requiredChecks.find(r => r.memberId === `STAGE:${id}:JOIST-2` && r.checkId === 'SOFFIT-05')!);
  const reviewed = applyCoverageReview(m, {schemaVersion: '1', groups: [{id: 'X', representative: ref('POUR'), targets: [ref('OTHER')], mode: 'LOCAL_1D_SAME', evidenceRef: 'SYNTHETIC', notApplicableReason: ''}]});
  const row = previewWorkflow(reviewed).coverageReview.rows.find(r => r.groupId === 'X')!;
  expect(row.state).toBe('NON_EQUIVALENT'); expect(row.comparisonIssues).toContain('DIFFERENT_PHYSICAL_STAGE_REQUIRES_SEPARATE_APPLICABILITY_REVIEW'); expect(row.localDemandEquivalent).not.toBe(true);
});
it('permits a pending local 1D comparison within the same stage using that stage actual analysis only', () => {
  const m = stagesFixture(), p = previewWorkflow(m), refs = ['JOIST-2', 'JOIST-3'].map(id => requirementRef(p.requiredChecks.find(r => r.memberId === `STAGE:CHANGED:${id}` && r.checkId === 'SOFFIT-05')!));
  const reviewed = applyCoverageReview(m, {schemaVersion: '1', groups: [{id: 'X', representative: refs[0], targets: refs, mode: 'LOCAL_1D_SAME', evidenceRef: 'SYNTHETIC', notApplicableReason: ''}]});
  const rows = previewWorkflow(reviewed).coverageReview.rows.filter(r => r.groupId === 'X'); expect(rows.every(r => r.localDemandEquivalent === true && r.state === 'REPRESENTATIVE_PENDING' && r.status === 'BLOCKED')).toBe(true);
});
it('invalidates stage analyses after edits and refuses to silently absorb active editor changes on reapply', () => {
  const m = stagesFixture(), edited = reviseDraft(m, {constructionLiveKPa: 5}), stale = previewWorkflow(edited);
  expect(stale.stageStudy!.current).toBe(false); expect(stale.stageStudy!.activeCaptured).toBe(false); expect(stale.stageStudy!.stages.every(s => s.preview === null)).toBe(true);
  expect(stale.stageStudy!.stages.every(s => s.requiredChecks.length > 0 && s.requiredChecks.every(r => r.applicability.unresolvedStage === true))).toBe(true);
  const applied = applyStageStudy(edited, m.stageStudy!), p = previewWorkflow(applied); expect(p.stageStudy!.current).toBe(true); expect(p.stageStudy!.activeCaptured).toBe(false);
  expect(p.blockers).toContain('ACTIVE_STAGE_INPUTS_NOT_CAPTURED'); expect(p.stageStudy!.stages[1].preview!.soffit!.terminalForceN).toBeCloseTo(18360, 5);
  expect(p.requiredChecks.some(r => !r.memberId.startsWith('STAGE:'))).toBe(true);
});
it('requires matching final geometry/basis rather than transforming saved stages after a shared project edit', () => {
  const m = stagesFixture(), edited = reviseDraft(m, {designBasisRef: 'SYNTHETIC changed basis'}), p = previewWorkflow(applyStageStudy(edited, m.stageStudy!));
  expect(p.stageStudy!.stages.every(s => s.preview === null && s.errors.some(e => e.includes('SHARED_GEOMETRY_OR_DESIGN_BASIS')))).toBe(true);
  expect(() => loadStageForEditing(edited, m.stageStudy!.stages[0])).toThrow(/Compatible/);
});
it('solves a separately authored frame-only erection stage with wind and altered restraint, without copied concrete forces', () => {
  const {model, definition} = frameFixture(); model.checkCatalogue = coverageModel().checkCatalogue;
  const pour = regenerateDraftLayouts(model, {frameLayout: stampFrameLayout(model, definition)}), first = captured(pour), stripped = removeStageLayout(pour, 'SOFFIT');
  const frame = structuredClone(stripped.frameLayout!); frame.stageId = 'ERECTION'; frame.loadCaseId = 'WIND'; frame.loadSource = 'FRAME_ACTIONS_ONLY'; frame.excludeSoffitReason = 'SYNTHETIC independent empty frame'; frame.acknowledgeLinearScope = true; frame.assumptionEvidenceRef = 'SYNTHETIC no support-removal history';
  frame.additionalActions = [{id: 'W', nodeId: 'FH-1', kind: 'WIND', ownershipId: 'SYN-WIND', evidenceRef: 'SYNTHETIC', forceN: [100, 0, 0], momentNmm: [0, 0, 0], atNode: true, offsetMm: [null, null, null], offsetEvidenceRef: ''}];
  frame.nodes.find(n => n.id === 'FB-1')!.boundary[0] = {kind: 'PRESCRIBED', value: 1};
  const erection = regenerateDraftLayouts(stripped, {frameLayout: frame}), m = applyStageStudy(erection, {schemaVersion: '1', stages: [first, captured(erection, 'ERECTION')]}), p = previewWorkflow(m), e = p.stageStudy!.stages[1];
  expect(e.preview!.frame!.analysis).not.toBeNull(); expect(e.preview!.frame!.input!.actions).toHaveLength(1); expect(e.preview!.frame!.input!.actions[0].forceN).toEqual([100, 0, 0]);
  expect(e.preview!.loadPath).toBeNull(); expect(e.model!.actions).toEqual([]); expect(e.preview!.frame!.analysis!.nodes.filter(n => n.id.startsWith('FB')).reduce((s, n) => s + n.reactionForceN[0], 0)).toBeCloseTo(-100, 7);
  expect(p.stageStudy!.stages[0].preview!.soffit!.terminalForceN).toBeCloseTo(23760, 5);
});
it('restores/copies authored inputs only and requires explicit new frame scope and new cases after a stage copy', () => {
  let source = loadCaseSource(); source = applyLoadCases(source, {schemaVersion: '1', cases: [caseDefinition()]});
  const saved = applyStageStudy(source, {schemaVersion: '1', stages: [captured(source)]}), loaded = loadStageForEditing(saved, saved.stageStudy!.stages[0]);
  expect(stageInputsDefinition(loaded)).toBe(stageInputsDefinition(source)); expect(loaded.members).toEqual([]); expect(loaded.revisionId).not.toBe(saved.revisionId); expect(previewWorkflow(loaded).loadPath).toBeNull();
  const copied = copyToDraftStage(saved, 'NEW-STAGE'); expect(copied.loadCases).toBeNull(); expect(copied.frameLayout!.acknowledgeLinearScope).toBe(false); expect(copied.frameLayout!.assumptionEvidenceRef).toBe('');
  expect(copied.soffitLayout!.stageId).toBe('NEW-STAGE'); expect(copied.ringlockAssembly!.stageId).toBe('NEW-STAGE'); expect(copied.members).toEqual([]); expect(copied.stageStudy!.stages).toHaveLength(1);
  expect(() => copyToDraftStage(reviseDraft(saved, {constructionLiveKPa: 5}), 'OTHER')).toThrow(/Capture/);
});
it('keeps every independently recompiled load case inside each stage and does not nest books in compiled case inputs', () => {
  const source = applyLoadCases(loadCaseSource(), {schemaVersion: '1', cases: [caseDefinition()]}), m = applyStageStudy(source, {schemaVersion: '1', stages: [captured(source)]}), p = previewWorkflow(m), stage = p.stageStudy!.stages[0];
  expect(p.loadCases!.current).toBe(true); expect(stage.preview!.loadCases!.current).toBe(true); const c = stage.preview!.loadCases!.cases[0];
  expect(c.errors).toEqual([]); expect(c.model).not.toHaveProperty('stageStudy'); expect(c.model!.revisionId).toBe(m.revisionId); expect(c.preview!.frame!.analysis).not.toBeNull();
  expect(stage.requiredChecks.some(r => r.loadCaseId === 'SYNTHETIC-C1')).toBe(true);
});
it('retains unknown/null stage records, rejecting nested studies, authority fields, duplicates and size limits', () => {
  const m = coverageModel(), blank = applyStageStudy(m, {schemaVersion: '1', stages: [emptyStage('X')]}), p = previewWorkflow(blank);
  expect(p.stageStudy!.stages[0].preview).toBeNull(); expect(p.stageStudy!.stages[0].errors.join()).toContain('captured input');
  const r = captured(m); expect(() => stampStageStudy(m, {schemaVersion: '1', stages: [r, {...r, id: 'DUP'}]})).toThrow(/Duplicate/);
  const nested = {...r, inputs: {...r.inputs!, stageStudy: null}}; expect(() => stampStageStudy(m, {schemaVersion: '1', stages: [nested]})).toThrow(/Nested/);
  expect(() => parseWorkflowModel({...blank, stageStudy: {...blank.stageStudy, approved: true}})).toThrow(/authority/);
  expect(() => stampStageStudy(m, {schemaVersion: '1', stages: Array.from({length: 7}, (_, n) => emptyStage(`X${n}`))})).toThrow(/six-stage/);
  expect(() => captureStage(m, {...emptyStage('X'), stageId: 'WRONG'})).toThrow(/declared Stage/);
  const orphan = {...m, soffitLayout: null}; expect(() => captureStage(orphan, {...emptyStage('X'), stageId: 'POUR-TEST'})).toThrow();
});
it('keeps actual inventories with missing stage evidence and rejects a mechanism in only the affected frame stage', () => {
  const {model, definition} = frameFixture(); model.checkCatalogue = coverageModel().checkCatalogue;
  const source = regenerateDraftLayouts(model, {frameLayout: stampFrameLayout(model, definition)}), a = captured(source);
  const broken = structuredClone(source); broken.soffitLayout!.stageId = 'MECHANISM'; broken.frameLayout!.stageId = 'MECHANISM'; broken.frameLayout!.nodes.find(n => n.id === 'FB-1')!.boundary[5] = {kind: 'FREE'};
  const b = captured(broken, 'MECHANISM'), c = {...captured(source, 'MISSING'), stageId: 'MISSING', evidenceRef: ''}; c.inputs!.soffitLayout!.stageId = 'MISSING'; c.inputs!.frameLayout!.stageId = 'MISSING';
  const p = previewWorkflow(applyStageStudy(source, {schemaVersion: '1', stages: [a, b, c]})), rows = p.stageStudy!.stages;
  expect(rows[0].preview!.frame!.analysis).not.toBeNull(); expect(rows[1].preview!.frame!.analysis).toBeNull(); expect(rows[1].preview!.frame!.blockers.join()).toContain('UNSTABLE');
  expect(rows[1].requiredChecks.length).toBeGreaterThan(0); expect(rows[2].preview).toBeNull(); expect(rows[2].requiredChecks.length).toBeGreaterThan(0); expect(rows[2].requiredChecks.every(r => r.applicability.unresolvedStage === true)).toBe(true);
});
it('recomputes tampered derived loads from actual inputs and does not rebase a supplied orphan graph', () => {
  const m = coverageModel(), r = captured(m); r.inputs!.members = structuredClone(m.members); r.inputs!.members[0].beam.patches[0].startNPerMm = 1e9;
  const c = compileStage(m, r); expect(previewWorkflow(c).soffit!.terminalForceN).toBeCloseTo(23760, 5);
  r.inputs!.soffitLayout = null; expect(() => compileStage(m, r)).toThrow(/ID_MISMATCH|UNRECONSTRUCTED/);
});
it('freezes all stage sources/results in one report/drawing hash and makes imported/edited drafts stale', async () => {
  const m = stagesFixture(), frozen = await freezeDesign(m), v = await documentView(frozen, m);
  expect(v.drawing.stageStudy!.stages).toHaveLength(2); expect(v.drawing.stageStudy!.stages[1].preview!.soffit!.terminalForceN).toBeCloseTo(18360, 5); expect(v.constructionEligible).toBe(false);
  const imported = importDraft(m); expect(previewWorkflow(imported).stageStudy!.current).toBe(false); expect((await documentView(frozen, imported)).freshness).toBe('STALE');
  const altered = structuredClone(frozen); altered.content.preview.stageStudy!.stages[0].preview!.soffit!.terminalForceN = 0; altered.snapshotHash = await contentHash(altered.content);
  await expect(documentView(altered, m)).rejects.toThrow(/calculation mismatch/);
});
