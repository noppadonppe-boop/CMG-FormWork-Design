import {bindTieDossier, emptyThreadInterface, emptyTieDossier, tieGeometryContext, type TieDossier} from '../../src/domain/workflowV07/tieDossier';
import {pairFaces} from '../../src/domain/workflowV07/geometry';
import {regenerateDraftLayouts} from '../../src/domain/workflowV07/model';
import {stampSideLayout} from '../../src/domain/workflowV07/sideLayout';
import {sideDefinition, sideModel} from './workflow-v07-side';
import {checkCatalogue} from './workflow-v07-coverage';

// Arbitrary SYNTHETIC serial-rod/thread/register data. No real product capacity or stock is asserted.
export function tieDossierFixture(): TieDossier {
  const d = emptyTieDossier(); d.compatibilityEvidenceRef = 'SYNTHETIC compatible-series assumption, not a vendor certificate'; d.geometryEvidenceRef = 'SYNTHETIC face-A datum and nonoverlapping rod gauges'; d.rodScope = 'DECLARED_NONOVERLAPPING_BODY_GAUGES'; d.threadScope = 'DECLARED_LOADED_THREAD_INTERFACES';
  for (const c of d.components) {
    c.reference = {...c.reference, productId: `SYN-${c.role}`, manufacturer: 'SYNTHETIC', model: c.role, lotRef: 'SYNTHETIC no stock inspection', threadMark: 'SYN-T', materialRef: 'SYNTHETIC rod elastic properties', sourceVersion: 'SYN-1', sourceRef: 'SYNTHETIC reference only', capacityScopeRef: 'SYNTHETIC full tie force, not certified', capacityBasis: 'ALLOWABLE'};
    c.reference.properties.capacityKN = 100;
    if (['INNER', 'OUTER_LEFT', 'OUTER_RIGHT'].includes(c.role)) {c.reference.properties.tensileEffectiveAreaMm2 = 50; c.reference.properties.stiffnessAreaMm2 = 80; c.reference.properties.E_MPa = 200000; c.reference.properties.steelLengthMm = c.role === 'INNER' ? 1000 : 200; c.reference.lengthDatumRef = 'SYNTHETIC total rod steel extent';}
  }
  d.rodGauges = [{id: 'L', role: 'OUTER_LEFT', startMm: -200, endMm: -50, evidenceRef: 'SYNTHETIC 150 mm outer body gauge'}, {id: 'I', role: 'INNER', startMm: 25, endMm: 975, evidenceRef: 'SYNTHETIC 950 mm inner body gauge'}, {id: 'R', role: 'OUTER_RIGHT', startMm: 1050, endMm: 1200, evidenceRef: 'SYNTHETIC 150 mm outer body gauge'}];
  for (const side of ['LEFT', 'RIGHT'] as const) {
    const j = emptyThreadInterface(`J-${side}`); j.side = side; j.maleRole = side === 'LEFT' ? 'OUTER_LEFT' : 'OUTER_RIGHT'; j.femaleRole = side === 'LEFT' ? 'END_LEFT' : 'END_RIGHT';
    j.male = {standard: 'SYNTHETIC', designation: 'SYN-T', nominalDiameterMm: 12, leadSystem: 'MM_PITCH', lead: 1.5, hand: 'RIGHT', fitClass: 'SYN-MALE'}; j.female = {...j.male, fitClass: 'SYN-FEMALE'};
    j.actualEngagementMm = 30; j.requiredEngagementMm = 25; j.measurementEvidenceRef = 'SYNTHETIC effective engagement measurement'; j.requirementEvidenceRef = 'SYNTHETIC limit only, not manufacturer minimum'; j.compatibilityEvidenceRef = 'SYNTHETIC interface fit assumption'; d.threads.push(j);
  }
  return d;
}
export function tieDossierApplied() {
  const model = {...sideModel(), sideTopology: 'SEGMENTED_TIE' as const, designBasisRef: 'SYNTHETIC tie screening only', checkCatalogue: checkCatalogue()}, definition = sideDefinition(), context = tieGeometryContext(pairFaces(model.vertices, model.heightMm), definition, definition.ties[0]);
  definition.ties[0].dossier = bindTieDossier(tieDossierFixture(), context);
  return regenerateDraftLayouts(model, {sideLayout: stampSideLayout(model, definition)});
}
