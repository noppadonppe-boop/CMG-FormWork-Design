import {readFileSync} from 'node:fs';
import {expect, it} from 'vitest';
import {emptyFrameLayout, evaluateFrameLayout, frameGeometryFromSoffit, stampFrameLayout, validateFrameLayout} from '../src/domain/workflowV07/frameWorkflow';
import {parseWorkflowModel, previewWorkflow, regenerateDraftLayouts, reviseDraft} from '../src/domain/workflowV07/model';
import {contentHash, documentView, freezeDesign} from '../src/domain/workflowV07/snapshot';
import {frameApplied, frameFixture} from './fixtures/workflow-v07-frame-workflow';
import {builtModel} from './fixtures/workflow-v07-soffit';

it('captures exact head/base coordinates without inventing restraints, stiffness or a prismatic whole leg', () => {
  const model = builtModel(), captured = frameGeometryFromSoffit(model, previewWorkflow(model).loadPath!.reactions);
  expect(captured.nodes).toHaveLength(12); expect(captured.elements).toEqual([]);
  expect(captured.nodes.every(n => n.boundary.every(b => b.kind === 'UNKNOWN'))).toBe(true);
  expect(captured.nodes[0].pointMm).toEqual([0, 0, 3000]); expect(captured.nodes[1].pointMm).toEqual([0, 0, 0]);
  expect(captured.acknowledgeLinearScope).toBe(false); expect(captured.actionBasis).toBeNull();
});
it('connects current individual head forces to a declared first-order frame while every release gate remains blocked', () => {
  const model = frameApplied(), p = previewWorkflow(model), f = p.frame!;
  expect(f.analysis).not.toBeNull(); expect(f.analysis?.nodes.find(n => n.id === 'FB-2')?.reactionForceN[2]).toBeCloseTo(7053.75, 5);
  expect(f.analysis?.nodes.filter(n => n.id.startsWith('FB-')).reduce((s, n) => s + n.reactionForceN[2], 0)).toBeCloseTo(23760, 5);
  expect(f.analysis?.input.revisionId).toBe(model.revisionId); expect(f.status).toBe('BLOCKED'); expect(p.constructionEligible).toBe(false);
  expect(f.blockers).toContain('FRAME_FIRST_ORDER_DEMANDS_ONLY_SECOND_ORDER_AND_STABILITY_REQUIRED');
});
it('keeps partial unknown frame data in a frozen draft without treating it as zero or a solved model', async () => {
  const model = builtModel(), definition = frameGeometryFromSoffit(model, previewWorkflow(model).loadPath!.reactions);
  const ready = regenerateDraftLayouts(model, {frameLayout: stampFrameLayout(model, definition)}, {allowIncomplete: true});
  const p = previewWorkflow(ready); expect(p.frame?.analysis).toBeNull(); expect(ready.frameLayout?.actionBasis).toBeNull();
  const frozen = await freezeDesign(ready), view = await documentView(frozen, ready);
  expect(view.report.model.frameLayout?.nodes[0].boundary[0]).toEqual({kind: 'UNKNOWN'});
  expect(view.drawing.frame?.analysis).toBeNull(); expect(view.constructionEligible).toBe(false);
});
it('invalidates frame results after a source-load edit and rebuilds all authored layouts only on explicit analysis', () => {
  const ready = frameApplied(), edited = reviseDraft(ready, {constructionLiveKPa: 3});
  expect(previewWorkflow(edited).frame?.analysis).toBeNull();
  expect(previewWorkflow(edited).frame?.blockers).toContain('FRAME_INPUT_OR_SOLVE:STALE_FRAME_LAYOUT_REANALYSIS_REQUIRED');
  const rebuilt = regenerateDraftLayouts(edited), p = previewWorkflow(rebuilt);
  expect(p.frame?.analysis).not.toBeNull(); expect(p.frame?.analysis?.input.revisionId).toBe(rebuilt.revisionId);
  expect(p.loadPath?.analyses.every(a => a.revision === rebuilt.revisionId)).toBe(true);
  expect(p.frame?.analysis?.nodes.filter(n => n.id.startsWith('FB-')).reduce((s, n) => s + n.reactionForceN[2], 0)).toBeCloseTo(25560, 4);
});
it('rejects mismatched stage/case source mapping and does not permit omission from the same poured case', () => {
  const {model, definition} = frameFixture(); definition.loadCaseId = 'OTHER';
  let f = evaluateFrameLayout(model, stampFrameLayout(model, definition), previewWorkflow(model).loadPath!.reactions);
  expect(f.analysis).toBeNull(); expect(f.blockers.some(b => b.includes('SAME_STAGE_CASE'))).toBe(true);
  definition.loadCaseId = model.soffitLayout!.loadCaseId; definition.loadSource = 'FRAME_ACTIONS_ONLY'; definition.headMappings = [];
  definition.excludeSoffitReason = 'SYNTHETIC omission request';
  f = evaluateFrameLayout(model, stampFrameLayout(model, definition), null);
  expect(f.analysis).toBeNull(); expect(f.blockers.some(b => b.includes('CANNOT_BE_OMITTED'))).toBe(true);
});
it('supports separately declared frame-only stage actions with explicit ownership and no copied concrete actions', () => {
  const {model, definition} = frameFixture(); definition.loadSource = 'FRAME_ACTIONS_ONLY'; definition.stageId = 'ERECTION'; definition.loadCaseId = 'EMPTY-FRAME';
  definition.excludeSoffitReason = 'SYNTHETIC erection case without placed concrete'; definition.headMappings = [];
  definition.additionalActions = [{id: 'WIND', nodeId: 'FH-1', kind: 'WIND', ownershipId: 'SYNTHETIC-WIND-AREA', evidenceRef: 'SYNTHETIC action',
    forceN: [100, 0, 0], momentNmm: [0, 0, 0], atNode: true, offsetMm: [null, null, null], offsetEvidenceRef: ''}];
  const f = evaluateFrameLayout(model, stampFrameLayout(model, definition), null);
  expect(f.analysis?.input.actions).toHaveLength(1); expect(f.analysis?.input.actions[0].forceN).toEqual([100, 0, 0]);
  expect(f.status).toBe('BLOCKED');
});
it('rejects duplicated ownership, a missing head mapping and undocumented physical head offsets', () => {
  const {model, definition} = frameFixture();
  definition.additionalActions = [{id: 'DUP', nodeId: 'FH-1', kind: 'OTHER', ownershipId: model.actions[0].ownershipId, evidenceRef: 'SYNTHETIC',
    forceN: [0, 0, -100], momentNmm: [0, 0, 0], atNode: true, offsetMm: [null, null, null], offsetEvidenceRef: ''}];
  expect(evaluateFrameLayout(model, stampFrameLayout(model, definition), previewWorkflow(model).loadPath!.reactions).blockers.some(b => b.includes('DUPLICATE_FRAME_OWNED_LOAD'))).toBe(true);
  definition.additionalActions = []; definition.headMappings.pop();
  expect(evaluateFrameLayout(model, stampFrameLayout(model, definition), previewWorkflow(model).loadPath!.reactions).analysis).toBeNull();
  const fresh = frameFixture(); fresh.definition.nodes[0].pointMm[0] = -100;
  expect(evaluateFrameLayout(fresh.model, stampFrameLayout(fresh.model, fresh.definition), previewWorkflow(fresh.model).loadPath!.reactions).blockers.some(b => b.includes('offset'))).toBe(true);
});
it('returns an explicit blocked diagnostic for incomplete properties, mechanisms or unknown boundaries', () => {
  const {model, definition} = frameFixture(); definition.elements[0].G_MPa = null;
  expect(evaluateFrameLayout(model, stampFrameLayout(model, definition), previewWorkflow(model).loadPath!.reactions).analysis).toBeNull();
  definition.elements[0].G_MPa = 80000; definition.nodes[1].boundary = Array.from({length: 6}, () => ({kind: 'FREE'}));
  expect(evaluateFrameLayout(model, stampFrameLayout(model, definition), previewWorkflow(model).loadPath!.reactions).blockers.some(b => b.includes('UNSTABLE'))).toBe(true);
});
it('adds role-specific required checks for actual frame entities without generated representatives or approvals', () => {
  const checks = JSON.parse(readFileSync('src/reference/workflow-v07/checks.json', 'utf8')), {model, definition} = frameFixture();
  model.checkCatalogue = {version: '0.7', specifications: checks.map((c: Record<string, string>) => ({id: c.check_id, group: c.group, description: c.description, appliesTo: c.applicable_to}))};
  const ready = regenerateDraftLayouts(model, {frameLayout: stampFrameLayout(model, definition)}), p = previewWorkflow(ready);
  expect(p.frame?.requiredChecks.filter(c => c.checkId === 'RINGLOCK-08')).toHaveLength(6);
  expect(p.frame?.requiredChecks.filter(c => c.checkId === 'RINGLOCK-17')).toHaveLength(6);
  expect(p.frame?.requiredChecks.every(c => c.revision === ready.revisionId)).toBe(true);
  expect(ready.coverage).toEqual([]); expect(ready.representatives).toEqual([]); expect(p.coverageIssues.length).toBeGreaterThan(0);
});
it('freezes graph, input, output and drawing results together and rejects a recomputed-hash forged verdict/result', async () => {
  const model = frameApplied(), frozen = await freezeDesign(model), view = await documentView(frozen, model);
  expect(view.drawing.frame).toEqual(view.report.preview.frame);
  expect(view.report.preview.frame?.analysis?.nodes).toHaveLength(12); expect(Object.isFrozen(frozen.content.model.frameLayout)).toBe(true);
  const tampered = structuredClone(frozen); tampered.content.preview.frame!.analysis!.nodes[0].reactionForceN[2] = 1;
  tampered.snapshotHash = await contentHash(tampered.content);
  await expect(documentView(tampered, model)).rejects.toThrow(/calculation mismatch/);
});
it('rejects imported authority metadata and retains backward compatibility for models with no frame field', () => {
  const {model, definition} = frameFixture(), layout = stampFrameLayout(model, definition);
  expect(() => validateFrameLayout({...layout, confirmed: true})).toThrow(/authority/);
  const old = {...model}; delete old.frameLayout; expect(parseWorkflowModel(old).frameLayout).toBeUndefined();
  const partial = regenerateDraftLayouts(model, {frameLayout: stampFrameLayout(model, emptyFrameLayout()), gammaKNm3: null}, {allowIncomplete: true});
  expect(partial.gammaKNm3).toBeNull(); expect(previewWorkflow(partial).frame?.analysis).toBeNull();
});
