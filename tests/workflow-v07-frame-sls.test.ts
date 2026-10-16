import {expect, it} from 'vitest';
import {analyzeLinearFrame, type LinearFrameInput} from '../src/domain/workflowV07/frameLinear';
import {emptySlsLimitEvidence, FRAME_SLS_ENGINE, SLS_QUANTITIES, screenFrameSls, validateSlsLimitEvidence, type SlsLimitEvidence} from '../src/domain/workflowV07/frameSls';
import {frameFixture} from './fixtures/workflow-v07-frame-workflow';
import {previewWorkflow, regenerateDraftLayouts} from '../src/domain/workflowV07/model';
import {stampFrameLayout} from '../src/domain/workflowV07/frameWorkflow';
import {documentView, freezeDesign} from '../src/domain/workflowV07/snapshot';

// Software-only fixture; values do not represent a project serviceability limit.
const input: LinearFrameInput = {
  schemaVersion: 'frame-linear-1', units: 'N_MM_MPA_RAD', id: 'FRAME-SLS-SYNTHETIC', revisionId: 'R1', stageId: 'S1', loadCaseId: 'LC1',
  assumptionEvidenceRef: 'SYNTHETIC elastic beam; no construction claim',
  nodes: [
    {id: 'A', pointMm: [0, 0, 0], boundary: [0, 0, 0, 0, 0, 0]},
    {id: 'B', pointMm: [0, 0, 1000], boundary: ['FREE', 'FREE', 'FREE', 'FREE', 'FREE', 'FREE']},
  ],
  elements: [{id: 'AB', nodeI: 'A', nodeJ: 'B', kind: 'BEAM_COLUMN', E_MPa: 200000, G_MPa: 80000, A_mm2: 1000,
    Iy_mm4: 2e6, Iz_mm4: 1e6, J_mm4: 3e6, localY: [1, 0, 0], evidenceRef: 'SYNTHETIC elastic section'}],
  actions: [{id: 'P', nodeId: 'B', revisionId: 'R1', stageId: 'S1', loadCaseId: 'LC1', evidenceRef: 'SYNTHETIC nodal load',
    forceN: [100, 0, -1000], momentNmm: [0, 0, 0], application: 'AT_NODE'}],
};
const analysis = analyzeLinearFrame(input);
const allReviewed = (limit = 1e9): SlsLimitEvidence[] => input.nodes.flatMap(node => SLS_QUANTITIES.map(quantity => ({
  ...emptySlsLimitEvidence(node.id, quantity), nodeId: node.id, quantity, limit, actionBasis: 'SERVICE', methodId: `SYNTHETIC-${quantity}`,
  sourceRef: 'SYNTHETIC service limit source', sourceRevision: 'R1', evidenceRef: 'SYNTHETIC limit evidence', reviewRef: 'SYNTHETIC engineer review', status: 'ENGINEER_REVIEWED',
})));

it('keeps every node quantity incomplete with no default limit', () => {
  const result = screenFrameSls(analysis, [], 'SERVICE');
  expect(result.engineVersion).toBe(FRAME_SLS_ENGINE); expect(result.status).toBe('INCOMPLETE'); expect(result.records).toHaveLength(12);
  expect(result.records.every(r => r.evidence === null && r.utilization === null && r.status === 'INCOMPLETE')).toBe(true);
  expect(result.records.some(r => r.demand === 0)).toBe(true);
});

it('screens explicit reviewed service limits only when the source revision matches', () => {
  const result = screenFrameSls(analysis, allReviewed(), 'SERVICE');
  expect(result.status).toBe('SCREENED'); expect(result.records.every(r => r.status === 'SCREENED')).toBe(true);
  expect(result.blockers).toContain('FRAME_SLS_SCREENING_IS_NOT_CONSTRUCTION_APPROVAL'); expect(result.constructionRelease).toBe('NO_GO');
});

it('keeps stale or non-service limit records incomplete and does not treat unknown rotation as zero', () => {
  const rows = allReviewed(); rows[0] = {...rows[0], sourceRevision: 'OLD'}; rows[1] = {...rows[1], actionBasis: null};
  const result = screenFrameSls(analysis, rows, 'FACTORED');
  expect(result.status).toBe('INCOMPLETE'); expect(result.records[0].blockers).toContain('SLS_SOURCE_REVISION_MISMATCH');
  expect(result.records[1].blockers).toContain('SLS_REQUIRES_MATCHED_SERVICE_ACTION_BASIS');
});

it('reports FAIL only when a supplied service limit is exceeded', () => {
  const rows = allReviewed(); rows[6] = {...rows[6], limit: 0};
  const result = screenFrameSls(analysis, rows, 'SERVICE');
  expect(result.status).toBe('FAIL'); expect(result.records[6].status).toBe('FAIL'); expect(result.records[6].utilization).toBeNull();
});

it('rejects imported authority metadata and reviewed rows without review evidence', () => {
  const row = emptySlsLimitEvidence('A', 'TRANSLATION_X');
  expect(() => validateSlsLimitEvidence({...row, confirmed: true})).toThrow(/unknown\/missing fields|authority/);
  expect(() => validateSlsLimitEvidence({...row, status: 'ENGINEER_REVIEWED'})).toThrow(/review reference/);
});

it('keeps SLS rows identical in the frozen report and drawing for one frame revision', async () => {
  const {model, definition} = frameFixture();
  definition.sls = [emptySlsLimitEvidence(definition.nodes[0].id, 'TRANSLATION_X')];
  const ready = regenerateDraftLayouts(model, {frameLayout: stampFrameLayout(model, definition)}), snapshot = await freezeDesign(ready), view = await documentView(snapshot, ready);
  expect(view.drawing.frame?.sls).toEqual(view.report.preview.frame?.sls);
  expect(view.report.preview.frame?.sls?.inputRevision).toBe(ready.revisionId);
  expect(previewWorkflow(ready).frame?.sls?.constructionRelease).toBe('NO_GO');
});

it('maps an authored SLS catalogue item to every actual frame node for coverage', () => {
  const {model, definition} = frameFixture();
  model.checkCatalogue = {version: 'SYNTHETIC', specifications: [{id: 'SLS', group: 'TYPICAL', description: 'Synthetic SLS node limits', appliesTo: 'ALL'}]};
  const ready = regenerateDraftLayouts(model, {frameLayout: stampFrameLayout(model, definition)}), preview = previewWorkflow(ready);
  const rows = preview.frame?.requiredChecks.filter(r => r.checkId === 'SLS') ?? [];
  expect(rows).toHaveLength(definition.nodes.length); expect(rows.every(r => r.memberId.startsWith('FRAME-NODE:'))).toBe(true);
  expect(rows.every(r => r.revision === ready.revisionId && r.applicability.method === 'FIRST_ORDER_LINEAR_ELASTIC_3D')).toBe(true);
});
