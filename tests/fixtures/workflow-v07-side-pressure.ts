import {emptyPressureSource, emptySidePressure, type SidePressureSource, type SidePressureDefinition} from '../../src/domain/workflowV07/sidePressure';
import {regenerateDraftLayouts} from '../../src/domain/workflowV07/model';
import {stampSideLayout} from '../../src/domain/workflowV07/sideLayout';
import {sideModel, sideDefinition} from './workflow-v07-side';
import {checkCatalogue} from './workflow-v07-coverage';
export const pressureSource = (id = 'H', patch: Partial<SidePressureSource> = {}): SidePressureSource => ({...emptyPressureSource(id), kind: 'HYDROSTATIC', x0Mm: 0, x1Mm: 1000, headMm: 1000, ownershipId: `SYN-${id}`, evidenceRef: 'SYNTHETIC field source, not a project pressure method', ...patch});
export const pressureDefinition = (sources = [pressureSource()]): SidePressureDefinition => ({...emptySidePressure(), scope: 'REPLACE_COMPLETE_FACE_FOR_STAGE', evidenceRef: 'SYNTHETIC normal-outward pressure scope', omittedAreasEvidenceRef: 'SYNTHETIC no omitted loaded zones within declared field', sources});
export function pressureApplied() {
  const model = {...sideModel(), designBasisRef: 'SYNTHETIC pressure mechanics only', checkCatalogue: checkCatalogue()}, definition = sideDefinition();
  definition.pourHeadMm = null; definition.faces.forEach(f => f.pressure = pressureDefinition());
  return regenerateDraftLayouts(model, {sideLayout: stampSideLayout(model, definition)});
}
