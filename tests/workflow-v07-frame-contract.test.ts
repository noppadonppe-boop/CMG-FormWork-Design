import {expect, it} from 'vitest';
import {auditRinglockContract, CONTRACT_CHECK_IDS, contractSignal, emptyRinglockContractAudit} from '../src/domain/workflowV07/contractAudit';
import {previewWorkflow, regenerateDraftLayouts} from '../src/domain/workflowV07/model';
import {contentHash, documentView, freezeDesign} from '../src/domain/workflowV07/snapshot';
import {frameApplied, frameFixture} from './fixtures/workflow-v07-frame-workflow';
import {emptySecondOrderDefinition} from '../src/domain/workflowV07/frameSecondOrder';
import {stampFrameLayout} from '../src/domain/workflowV07/frameWorkflow';
import {casesApplied} from './fixtures/workflow-v07-loadcases';
import {headBearingApplied} from './fixtures/workflow-v07-head-bearing';
import {supportApplied} from './fixtures/workflow-v07-support';
import {applyStageStudy, captureStage, emptyStage} from '../src/domain/workflowV07/stageStudy';

it('retains all twelve contract checks with one revision/stage/case and no inferred entity or approval', () => {
  const audit = emptyRinglockContractAudit('REV-1', 'POUR-1', 'SERVICE-1');
  expect(audit.schemaVersion).toBe('ringlock-analysis-contract-1.0');
  expect(audit.checks.map(c => c.checkId)).toEqual(CONTRACT_CHECK_IDS);
  expect(audit.checks.every(c => c.inputRevision === 'REV-1' && c.stageId === 'POUR-1' && c.loadCaseId === 'SERVICE-1')).toBe(true);
  expect(audit.checks.every(c => c.status === 'INCOMPLETE' && c.entityIds.length === 0)).toBe(true);
  expect(audit.status).toBe('INCOMPLETE'); expect(audit.confirmed).toBe(false); expect(audit.constructionRelease).toBe('NO_GO');
});

it('maps a real frame draft to the contract without turning demand-only standards into capacity checks', () => {
  const model = frameApplied(), p = previewWorkflow(model), audit = p.frame!.contractAudit;
  expect(audit).toBe(p.contractAudit);
  expect(audit.checks).toHaveLength(12);
  const standard = audit.checks.find(c => c.checkId === 'STANDARD_N_M_V')!;
  expect(standard.entityIds).toEqual(['STD-1', 'STD-2', 'STD-3', 'STD-4', 'STD-5', 'STD-6']);
  expect(standard.status).toBe('INCOMPLETE');
  expect(standard.missingInputs).toContain('STANDARD_N_M_V_REVIEWED_RESISTANCE_REQUIRED');
  expect(audit.checks.find(c => c.checkId === 'SLS')!.status).toBe('INCOMPLETE');
  expect(audit.checks.every(c => c.inputRevision === model.revisionId && c.stageId === model.frameLayout!.stageId && c.loadCaseId === model.frameLayout!.loadCaseId)).toBe(true);
  expect(audit.confirmed).toBe(false); expect(audit.constructionRelease).toBe('NO_GO');
});

it('records a P-Delta screen as SCREENED while retaining global stability blockers and the same revision', () => {
  const {model, definition} = frameFixture();
  const secondOrder = emptySecondOrderDefinition(definition.nodes.map(n => n.id));
  secondOrder.evidenceRef = 'SYNTHETIC explicit imperfection method';
  secondOrder.imperfections = definition.nodes.map(n => ({nodeId: n.id, offsetMm: [0, 0, 0], evidenceRef: 'SYNTHETIC datum'}));
  definition.secondOrder = secondOrder;
  const ready = regenerateDraftLayouts(model, {frameLayout: stampFrameLayout(model, definition)}), audit = previewWorkflow(ready).contractAudit;
  const global = audit.checks.find(c => c.checkId === 'GLOBAL_STABILITY')!;
  expect(global.status).toBe('SCREENED');
  expect(global.blockers).toContain('GLOBAL_SWAY_TORSION_BOUNDARY_STIFFNESS_AND_SYSTEM_STABILITY_UNVERIFIED');
  expect(audit.status).toBe('INCOMPLETE'); expect(global.inputRevision).toBe(ready.revisionId);
});

it('preserves a known FAIL and never downgrades it because another contract check is incomplete', () => {
  const audit = auditRinglockContract({inputRevision: 'REV-FAIL', stageId: 'S1', loadCaseId: 'LC1', signals: {
    STANDARD_N_M_V: contractSignal('FAIL', ['STD-1'], [], ['STANDARD_N_M_V_LIMIT_EXCEEDED']),
  }});
  expect(audit.checks.find(c => c.checkId === 'STANDARD_N_M_V')!.status).toBe('FAIL');
  expect(audit.status).toBe('FAIL');
  expect(audit.checks.find(c => c.checkId === 'SLS')!.status).toBe('INCOMPLETE');
  expect(audit.blockers).toContain('STANDARD_N_M_V_LIMIT_EXCEEDED');
});

it('keeps contract audit identical in the frozen report and installation drawing and rejects a rehashed edit', async () => {
  const model = frameApplied(), frozen = await freezeDesign(model), view = await documentView(frozen, model);
  expect(view.drawing.contractAudit).toEqual(view.report.preview.contractAudit);
  expect(view.drawing.contractAudits).toEqual(view.report.preview.contractAudits);
  const tampered = structuredClone(frozen);
  tampered.content.preview.contractAudit!.checks[0].status = 'FAIL';
  tampered.snapshotHash = await contentHash(tampered.content);
  await expect(documentView(tampered, model)).rejects.toThrow(/calculation mismatch/);
});

it('exposes an explicit twelve-row audit even before a frame layout exists', () => {
  const model = frameApplied(); delete model.frameLayout;
  const audit = previewWorkflow(model).contractAudit;
  expect(audit.checks.map(c => c.checkId)).toEqual(CONTRACT_CHECK_IDS);
  expect(audit.checks.every(c => c.status === 'INCOMPLETE')).toBe(true);
  expect(audit.checks.every(c => c.entityIds.length === 0)).toBe(true);
});

it('keeps one contract audit for the authored base case and every named load case', () => {
  const model = casesApplied(), preview = previewWorkflow(model);
  expect(preview.contractAudits).toHaveLength(3);
  expect(preview.contractAudits.every(a => a.checks.length === 12 && a.inputRevision === model.revisionId)).toBe(true);
  expect(preview.contractAudits.map(a => a.loadCaseId)).toEqual(expect.arrayContaining(['SYNTHETIC-C1', 'SYNTHETIC-C2']));
  expect(preview.contractAudits.every(a => a.constructionRelease === 'NO_GO' && a.confirmed === false)).toBe(true);
});

it('maps actual head-bearing geometry into JACK_HEAD_BASE while keeping resistance incomplete', () => {
  const model = headBearingApplied(), preview = previewWorkflow(model), row = preview.contractAudit.checks.find(c => c.checkId === 'JACK_HEAD_BASE')!;
  expect(row.entityIds.some(id => id.startsWith('HEAD_BEARING:'))).toBe(true);
  expect(row.entityIds.length).toBeGreaterThan(0);
  expect(row.status).toBe('INCOMPLETE');
  expect(row.missingInputs).toContain('JACK_HEAD_BASE_RESISTANCE_AND_CONNECTION_REVIEW_REQUIRED');
  expect(row.blockers.some(b => b.includes('RESISTANCE') || b.includes('UNVERIFIED'))).toBe(true);
});

it('maps actual support bases and contact interfaces into SUPPORT_CONTACT without a ground acceptance basis', () => {
  const model = supportApplied(), preview = previewWorkflow(model), row = preview.contractAudit.checks.find(c => c.checkId === 'SUPPORT_CONTACT')!;
  expect(row.entityIds.some(id => id.includes('/'))).toBe(true);
  expect(row.entityIds.length).toBeGreaterThan(0);
  expect(row.status).toBe('INCOMPLETE');
  expect(row.missingInputs).toContain('SUPPORT_CONTACT_RESISTANCE_SETTLEMENT_AND_SUPPORT_BASIS_REQUIRED');
  expect(row.blockers.some(b => b.includes('SETTLEMENT') || b.includes('SLAB') || b.includes('GROUND'))).toBe(true);
});

it('keeps stage-release evidence revision-scoped in active and captured-stage audits', () => {
  const model = headBearingApplied(), stage = captureStage(model, {...emptyStage('S1'), stageId: model.frameLayout!.stageId, evidenceRef: 'SYNTHETIC stage evidence'});
  const preview = previewWorkflow(applyStageStudy(model, {schemaVersion: '1', stages: [stage]}));
  const active = preview.contractAudit.checks.find(c => c.checkId === 'STAGE_RELEASE')!;
  const captured = preview.stageStudy!.stages[0].preview!.contractAudit.checks.find(c => c.checkId === 'STAGE_RELEASE')!;
  expect(active.entityIds).toEqual(['STAGE:S1']);
  expect(captured.entityIds).toEqual(['STAGE:S1']);
  expect(active.inputRevision).toBe(preview.contractAudit.inputRevision);
  expect(active.status).toBe('INCOMPLETE');
  expect(active.missingInputs).toContain('STAGE_RELEASE_ENGINEER_REVIEW_AND_HISTORY_RESHORING_METHOD_REQUIRED');
  expect(preview.stageStudy!.stages[0].preview!.frame!.contractAudit).toEqual(preview.stageStudy!.stages[0].preview!.contractAudit);
});

