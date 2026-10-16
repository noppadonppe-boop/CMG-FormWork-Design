import {expect, it} from 'vitest';
import {analyzeLinearFrame, type LinearFrameInput} from '../src/domain/workflowV07/frameLinear';
import {screenFrameMemberDemands} from '../src/domain/workflowV07/frameDemands';
import {emptyResistanceEvidence, RESISTANCE_QUANTITIES, validateResistanceEvidence, type ResistanceEvidence, type ResistanceQuantity} from '../src/domain/workflowV07/resistanceEvidence';

// Software-only fixtures.  These values are not product ratings or engineering data.
const input: LinearFrameInput = {
  schemaVersion: 'frame-linear-1', units: 'N_MM_MPA_RAD', id: 'FRAME-RESISTANCE-SYNTHETIC', revisionId: 'R1', stageId: 'S1', loadCaseId: 'LC1',
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

const analysis = analyzeLinearFrame(input);
const allReviewed = (capacity = 1e12): ResistanceEvidence[] => RESISTANCE_QUANTITIES.map(quantity => ({
  ...emptyResistanceEvidence(quantity), quantity, unit: ['MOMENT_Y', 'MOMENT_Z', 'TORSION'].includes(quantity) ? 'NMM' : 'N', capacity,
  actionBasis: 'SERVICE', resistanceBasis: 'ALLOWABLE', methodId: `SYNTHETIC-${quantity}`, sourceRef: 'SYNTHETIC source record',
  sourceRevision: 'R1', evidenceRef: 'SYNTHETIC evidence record', reviewRef: 'SYNTHETIC engineer review record', status: 'ENGINEER_REVIEWED',
}));

it('keeps missing resistance as INCOMPLETE and never fills capacity with zero', () => {
  const result = screenFrameMemberDemands(analysis, null, [{id: 'AB', role: 'STANDARD'}], 'SERVICE');
  expect(result.status).toBe('INCOMPLETE');
  expect(result.records[0].resistanceChecks).toHaveLength(7);
  expect(result.records[0].resistanceChecks.every(c => c.status === 'INCOMPLETE' && c.evidence === null && c.utilization === null)).toBe(true);
  expect(result.records[0].resistanceChecks.some(c => c.demand === 0)).toBe(true);
  expect(result.records[0].resistanceChecks.some(c => c.evidence?.capacity === 0)).toBe(false);
});

it('screens only explicit reviewed records with a matching action basis and revision', () => {
  const result = screenFrameMemberDemands(analysis, null, [{id: 'AB', role: 'STANDARD', resistance: allReviewed()}], 'SERVICE');
  expect(result.status).toBe('SCREENED');
  expect(result.records[0].status).toBe('SCREENED');
  expect(result.records[0].resistanceChecks.every(c => c.status === 'SCREENED')).toBe(true);
  expect(result.records[0].utilization).toBeLessThan(1);
  expect(result.blockers).toContain('FRAME_RESISTANCE_SCREENING_IS_NOT_CONSTRUCTION_APPROVAL');
  expect(result.constructionRelease).toBe('NO_GO');
});

it('does not convert characteristic or test values into a comparable resistance', () => {
  const rows = allReviewed(); rows[0] = {...rows[0], resistanceBasis: 'CHARACTERISTIC'};
  const result = screenFrameMemberDemands(analysis, null, [{id: 'AB', role: 'STANDARD', resistance: rows}], 'SERVICE');
  const check = result.records[0].resistanceChecks.find(c => c.quantity === 'AXIAL_COMPRESSION');
  expect(check?.status).toBe('INCOMPLETE'); expect(check?.utilization).toBeNull();
  expect(check?.blockers).toContain('RESISTANCE_BASIS_NOT_COMPARABLE_WITH_ACTION_BASIS');
});

it('reports FAIL only when the user supplies a reviewed capacity below demand', () => {
  const rows = allReviewed(); rows[0] = {...rows[0], capacity: 0};
  const result = screenFrameMemberDemands(analysis, null, [{id: 'AB', role: 'STANDARD', resistance: rows}], 'SERVICE');
  const check = result.records[0].resistanceChecks.find(c => c.quantity === 'AXIAL_COMPRESSION');
  expect(check?.status).toBe('FAIL'); expect(check?.utilization).toBeNull(); expect(check?.blockers).toContain('DECLARED_ZERO_RESISTANCE_EXCEEDED');
  expect(result.status).toBe('FAIL'); expect(result.constructionRelease).toBe('NO_GO');
});

it('rejects imported authority metadata and incomplete reviewed records', () => {
  const row = emptyResistanceEvidence('AXIAL_COMPRESSION');
  expect(() => validateResistanceEvidence({...row, confirmed: true})).toThrow(/unknown\/missing fields|authority/);
  expect(() => validateResistanceEvidence({...row, status: 'ENGINEER_REVIEWED'})).toThrow(/review reference/);
});

it('keeps the declared quantity and unit explicit for each action component', () => {
  const quantity: ResistanceQuantity = 'MOMENT_Z';
  const row = emptyResistanceEvidence(quantity);
  expect(row.quantity).toBe(quantity); expect(row.unit).toBe('NMM'); expect(row.capacity).toBeNull();
});
