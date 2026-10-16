import {defaults} from '../../src/domain';
import {fromLegacy, type WorkflowModel} from '../../src/domain/workflowV07/model';
import {buildSoffitCandidate, type SoffitLayout} from '../../src/domain/workflowV07/soffit';
import {selectRinglockPlan} from '../../src/domain/workflowV07/ringlockPlan';

// Synthetic analysis fixtures only. E/I/zero self-weight are explicit test assumptions, not stock data.
export function slabModel(): WorkflowModel {
  return {...fromLegacy({...defaults}, 'SLAB-TEST'), revisionId: 'R-SYNTHETIC', elementType: 'SLAB',
    vertices: [{x: 0, y: 0}, {x: 2400, y: 0}, {x: 2400, y: 1500}, {x: 0, y: 1500}], heightMm: 150,
    gammaKNm3: 24, slabThicknessMm: 150, additionalDeadKPa: .5, constructionLiveKPa: 2.5,
    ringlock: selectRinglockPlan(null)};
}
export function layoutFixture(): SoffitLayout {
  return {schemaVersion: '1', stageId: 'POUR-TEST', loadCaseId: 'SERVICE-TEST', ownershipId: 'AREA-TEST', evidenceRef: 'SYNTHETIC test assumptions',
    joistXMm: [0, 600, 1200, 1800, 2400], joistStartYMm: 0, joistEndYMm: 1500, bearerStartXMm: 0, bearerEndXMm: 2400,
    bearers: [{id: 'B1', yMm: 0, headsXMm: [0, 1200, 2400]}, {id: 'B2', yMm: 1500, headsXMm: [0, 1200, 2400]}],
    headNodeElevationMm: 3000, baseElevationMm: 0, concreteStripStartYMm: null, deadStripStartYMm: null, liveStripStartYMm: null,
    joist: {E_MPa: 200000, I_mm4: 1e6, selfWeightKNPerM: 0, evidenceRef: 'SYNTHETIC joist'},
    bearer: {E_MPa: 200000, I_mm4: 1e6, selfWeightKNPerM: 0, evidenceRef: 'SYNTHETIC bearer'}};
}
export function builtModel(model = slabModel(), layout = layoutFixture()): WorkflowModel {
  const candidate = buildSoffitCandidate(model, layout);
  return {...model, soffitLayout: layout, members: candidate.members, actions: candidate.actions,
    ringlock: candidate.ringlock, requiredChecks: candidate.requiredChecks};
}
