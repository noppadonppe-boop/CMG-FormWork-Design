import {defaults} from '../../src/domain';
import {fromLegacy, type WorkflowModel} from '../../src/domain/workflowV07/model';
import {stampSideLayout, type SideFaceLayout, type SideLayoutDefinition, type SideTieDefinition} from '../../src/domain/workflowV07/sideLayout';

export function sideModel(): WorkflowModel {
  return {...fromLegacy({...defaults, width: 1000, length: 1000, height: 1000, walerSpacing: 500}, 'SIDE-TEST'),
    revisionId: 'SIDE-R1', gammaKNm3: 20};
}
export function sideFace(faceId: string, length = 1000, levels = [100, 900]): SideFaceLayout {
  return {faceId, evidenceRef: 'SYNTHETIC face', studPositionsMm: [0, length / 4, length / 2, 3 * length / 4, length],
    walers: levels.map((zMm, i) => ({id: `W${i + 1}`, zMm, supports: [{id: 'S1', xMm: length / 4}, {id: 'S2', xMm: 3 * length / 4}]})),
    stud: {E_MPa: 200000, I_mm4: 1e6, evidenceRef: 'SYNTHETIC stud'}, rail: {E_MPa: 200000, I_mm4: 1e6, evidenceRef: 'SYNTHETIC rail'},
    plywood: {thicknessMm: 12, effectiveE_MPa: 8000, grainAxis: 'ALONG_FACE', jointsAtEveryStud: true, evidenceRef: 'SYNTHETIC plywood strip'},
    heavierRailShare: .6, sharingEvidence: 'SYNTHETIC declared split, not verified contact'};
}
export function sideDefinition(): SideLayoutDefinition {
  const faces = ['F1', 'F2', 'F3', 'F4'].map((id, i) => sideFace(id, 1000, i % 2 ? [120, 880] : [100, 900]));
  const ties: SideTieDefinition[] = [];
  for (const [faceA, faceB] of [['F1', 'F3'], ['F2', 'F4']]) for (const walerId of ['W1', 'W2']) for (const [sa, sb] of [['S1', 'S2'], ['S2', 'S1']]) {
    ties.push({id: `${faceA}-${walerId}-${sa}`, a: {faceId: faceA, walerId, supportId: sa}, b: {faceId: faceB, walerId, supportId: sb}, diameterMm: 16, assembly: null});
  }
  return {schemaVersion: '1', stageId: 'TEST-POUR', loadCaseId: 'TEST-SERVICE', evidenceRef: 'SYNTHETIC side layout',
    pourHeadMm: 1000, baseElevationMm: 2000, rebarClearanceEvidence: null, faces, ties};
}
export function sideApplied() {const model = sideModel(); return {...model, sideLayout: stampSideLayout(model, sideDefinition())};}
