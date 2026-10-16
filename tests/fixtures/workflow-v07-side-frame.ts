import {readFileSync} from 'node:fs';
import {emptyFrameElement, frameGeometryFromSide, stampFrameLayout} from '../../src/domain/workflowV07/frameWorkflow';
import {regenerateDraftLayouts} from '../../src/domain/workflowV07/model';
import {stampSideLayout} from '../../src/domain/workflowV07/sideLayout';
import {emptyPressureSource} from '../../src/domain/workflowV07/sidePressure';
import {sideDefinition, sideModel} from './workflow-v07-side';

// Independent fixed-base synthetic cantilevers. These are NOT an actual yoke, anchor,
// Ringlock configuration, manufacturer stiffness table or verified installation method.
export function sideFrameFixture(topology: 'GROUND_BRACED' | 'COLUMN_YOKE' = 'GROUND_BRACED') {
  const model = {...sideModel(), sideTopology: topology, designBasisRef: 'SYNTHETIC factor sensitivity only'};
  const side = sideDefinition(); side.ties = [];
  side.faces[0].pressure = {schemaVersion: '1', scope: 'REPLACE_COMPLETE_FACE_FOR_STAGE', evidenceRef: 'SYNTHETIC F1 head 600', omittedAreasEvidenceRef: 'SYNTHETIC remainder unloaded',
    sources: [{...emptyPressureSource('PARTIAL-HEAD'), kind: 'HYDROSTATIC', x0Mm: 0, x1Mm: 1000, headMm: 600, ownershipId: 'F1-CONCRETE', evidenceRef: 'SYNTHETIC'}]};
  const applied = {...model, sideLayout: stampSideLayout(model, side)};
  const specs = JSON.parse(readFileSync('src/reference/workflow-v07/checks.json', 'utf8'));
  applied.checkCatalogue = {version: '0.7', specifications: specs.map((c: Record<string, string>) => ({id: c.check_id, group: c.group, description: c.description, appliesTo: c.applicable_to}))};
  const definition = frameGeometryFromSide(applied);
  definition.actionBasis = 'SERVICE'; definition.acknowledgeLinearScope = true;
  definition.assumptionEvidenceRef = 'SYNTHETIC one-way fixed-side supports feeding independent cantilevers';
  definition.sideTransfers!.mode = 'DOWNSTREAM_SIDE_SUPPORTS_ONLY';
  definition.sideTransfers!.separationEvidenceRef = 'SYNTHETIC cantilevers exclude analysed plywood, studs and walers';
  const receiving = [...definition.nodes];
  receiving.forEach((n, i) => {
    n.boundary = Array.from({length: 6}, () => ({kind: 'FREE'}));
    const baseId = `BASE-${i + 1}`;
    definition.nodes.push({id: baseId, role: 'BASE', pointMm: [n.pointMm[0], n.pointMm[1], 0], boundary: Array.from({length: 6}, () => ({kind: 'FIXED'})), evidenceRef: 'SYNTHETIC explicit fixed-base idealization'});
    definition.elements.push({...emptyFrameElement(`CANT-${i + 1}`), nodeI: baseId, nodeJ: n.id, role: 'OTHER', kind: 'BEAM_COLUMN',
      E_MPa: 200000, G_MPa: 80000, A_mm2: 200, Iy_mm4: 1e6, Iz_mm4: 2e6, J_mm4: 3e6, localY: [1, 0, 0], evidenceRef: 'SYNTHETIC elastic properties, not rated equipment'});
    definition.sideTransfers!.mappings[i].connectionEvidenceRef = 'SYNTHETIC direct force application at actual waler support';
  });
  return {model: applied, definition};
}
export function sideFrameApplied(topology: 'GROUND_BRACED' | 'COLUMN_YOKE' = 'GROUND_BRACED') {
  const {model, definition} = sideFrameFixture(topology);
  return regenerateDraftLayouts(model, {frameLayout: stampFrameLayout(model, definition)});
}
