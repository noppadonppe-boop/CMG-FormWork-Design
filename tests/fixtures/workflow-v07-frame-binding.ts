import {readFileSync} from 'node:fs';
import {references} from '../../src/workflowV07References';
import {emptyRinglockResearchChoice, selectRinglockResearch, type RinglockRole} from '../../src/domain/workflowV07/ringlockResearch';
import {createSupplierCatalogue, selectSupplierRecord} from '../../src/domain/workflowV07/ringlockSuppliers';
import {captureFrameElasticReference, captureFrameResearchGeometry, captureFrameSupplierGeometry, emptyFrameTubeBinding} from '../../src/domain/workflowV07/frameBinding';
import {frameFixture} from './workflow-v07-frame-workflow';
import {stampFrameLayout} from '../../src/domain/workflowV07/frameWorkflow';
import {regenerateDraftLayouts} from '../../src/domain/workflowV07/model';

export function frameReference(role: RinglockRole = 'STANDARD', useElasticReference = true) {
  return selectRinglockResearch(references.ringlockResearch, references.ringlockResearchSha256, {...emptyRinglockResearchChoice(),
    groupId: 'TCB-FOOT-BASED-REFERENCE', role, sectionId: role === 'STANDARD' ? 'CHS-48.3x3.2' : role === 'LEDGER' ? 'CHS-48.3x2.75' : 'CHS-48.3x2.5',
    useElasticReference, hypothesisRef: 'SYNTHETIC reference sensitivity; not installed product verification'});
}
export function supplierSelection() {
  let state = createSupplierCatalogue(JSON.parse(readFileSync('src/reference/workflow-v07/thai-ringlock-suppliers-2026-10-15.json', 'utf8')));
  state = selectSupplierRecord(state, 'supplierId', 'TH-SUCOOT'); state = selectSupplierRecord(state, 'familyId', 'SUCOOT-48');
  return selectSupplierRecord(state, 'componentId', 'SU48-ST');
}
export function tubeBinding(supplier = false) {
  const reference = frameReference();
  return {...emptyFrameTubeBinding(), geometrySource: supplier ? 'SUPPLIER_COMPONENT' as const : 'RESEARCH_REFERENCE' as const,
    researchSnapshot: supplier ? null : captureFrameResearchGeometry(reference), supplierSnapshot: supplier ? captureFrameSupplierGeometry(supplierSelection()) : null,
    elasticSnapshot: captureFrameElasticReference(reference), straightSegmentEvidenceRef: 'SYNTHETIC straight gross segment only; no rosette/jack/spigot',
    actualProductMatchEvidenceRef: 'SYNTHETIC comparison, not actual stock certification', elasticBasisEvidenceRef: 'SYNTHETIC first-order E/G sensitivity'};
}
export const nullFrameProperties = () => ({E_MPa: null, G_MPa: null, A_mm2: null, Iy_mm4: null, Iz_mm4: null, J_mm4: null});
export function boundFrame() {
  const {model, definition} = frameFixture(); definition.elements = definition.elements.map(e => ({...e, ...nullFrameProperties(), binding: tubeBinding()}));
  return regenerateDraftLayouts(model, {frameLayout: stampFrameLayout(model, definition)});
}
