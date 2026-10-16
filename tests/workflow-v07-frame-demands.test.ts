import {expect, it} from 'vitest';
import {analyzeLinearFrame, type LinearFrameInput} from '../src/domain/workflowV07/frameLinear';
import {screenFrameMemberDemands} from '../src/domain/workflowV07/frameDemands';
import {previewWorkflow, regenerateDraftLayouts} from '../src/domain/workflowV07/model';
import {stampFrameLayout} from '../src/domain/workflowV07/frameWorkflow';
import {frameFixture} from './fixtures/workflow-v07-frame-workflow';

const input: LinearFrameInput = {
  schemaVersion: 'frame-linear-1', units: 'N_MM_MPA_RAD', id: 'FRAME-DEMAND-SYNTHETIC', revisionId: 'R1', stageId: 'S1', loadCaseId: 'LC1',
  assumptionEvidenceRef: 'SYNTHETIC elastic beam; no product or construction claim',
  nodes: [
    {id: 'A', pointMm: [0, 0, 0], boundary: [0, 0, 0, 0, 0, 0]},
    {id: 'B', pointMm: [0, 0, 1000], boundary: ['FREE', 'FREE', 'FREE', 'FREE', 'FREE', 'FREE']},
  ],
  elements: [{id: 'AB', nodeI: 'A', nodeJ: 'B', kind: 'BEAM_COLUMN', E_MPa: 200000, G_MPa: 80000, A_mm2: 1000,
    Iy_mm4: 2e6, Iz_mm4: 1e6, J_mm4: 3e6, localY: [1, 0, 0], evidenceRef: 'SYNTHETIC elastic section'}],
  actions: [{id: 'P', nodeId: 'B', revisionId: 'R1', stageId: 'S1', loadCaseId: 'LC1', evidenceRef: 'SYNTHETIC nodal load',
    forceN: [100, 0, -1000], momentNmm: [0, 0, 0], application: 'AT_NODE'}],
};

it('extracts signed end N/M/V/T demands without creating a resistance result', () => {
  const analysis = analyzeLinearFrame(input), result = screenFrameMemberDemands(analysis, null, [{id: 'AB', role: 'STANDARD'}], 'SERVICE');
  expect(result.status).toBe('INCOMPLETE'); expect(result.inputRevision).toBe('R1'); expect(result.records).toHaveLength(1);
  const row = result.records[0];
  expect(row.checkId).toBe('RINGLOCK-08'); expect(row.signedAxialByEndN.every(Number.isFinite)).toBe(true);
  expect(row.envelope.axialAbsN).toBeGreaterThan(0); expect(row.envelope.momentZAbsNmm).toBeGreaterThan(0);
  expect(row.resistanceBasis).toBeNull(); expect(row.utilization).toBeNull(); expect(row.missingInputs).toContain('STANDARD_EFFECTIVE_SECTION_AND_BUCKLING_RESISTANCE_REQUIRED');
  expect(result.blockers).toContain('FRAME_MEMBER_DEMANDS_ARE_ACTIONS_ONLY_NOT_RESISTANCE'); expect(result.constructionRelease).toBe('NO_GO');
});

it('carries an explicit second-order axial result while declaring end bending reconstruction unavailable', () => {
  const analysis = analyzeLinearFrame(input), result = screenFrameMemberDemands(analysis,
    {elements: [{id: 'AB', secondOrderAxialForceN: -1234}]} as never, [{id: 'AB', role: 'BRACE'}], 'FACTORED');
  expect(result.records[0].checkId).toBe('RINGLOCK-11'); expect(result.records[0].secondOrderAxialForceN).toBe(-1234);
  expect(result.records[0].actionBasis).toBe('FACTORED'); expect(result.blockers).toContain('FRAME_SECOND_ORDER_END_BENDING_AND_SHEAR_RESULTANTS_NOT_RECONSTRUCTED');
});

it('is attached to the same current frame revision and keeps every member incomplete', () => {
  const {model, definition} = frameFixture();
  const ready = regenerateDraftLayouts(model, {frameLayout: stampFrameLayout(model, definition)}), preview = previewWorkflow(ready);
  expect(preview.frame?.demands?.inputRevision).toBe(ready.revisionId);
  expect(preview.frame?.demands?.records).toHaveLength(preview.frame?.analysis?.elements.length ?? -1);
  expect(preview.frame?.demands?.records.every(r => r.status === 'INCOMPLETE')).toBe(true);
  expect(preview.frame?.blockers).toContain('FRAME_MEMBER_DEMANDS_ARE_ACTIONS_ONLY_NOT_RESISTANCE');
});
