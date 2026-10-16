import {previewWorkflow, regenerateDraftLayouts, type WorkflowModel} from '../../src/domain/workflowV07/model';
import {captureSupportLayout, emptyBearingInterface, stampSupportLayout, type BearingInterface, type SupportLayoutDefinition} from '../../src/domain/workflowV07/supportLayout';
import {frameApplied} from './workflow-v07-frame-workflow';

// All dimensions, weight, ground hypotheses and limits in these tests are SYNTHETIC.
// They are not data for actual Ringlock, soil, sole boards or concrete slabs.
export function supportFixture(model: WorkflowModel = frameApplied(), sole = false) {
  const definition = captureSupportLayout(model, previewWorkflow(model).frame!); definition.evidenceRef = 'SYNTHETIC support study only';
  definition.bases.forEach(b => {
    const n = model.frameLayout!.nodes.find(n => n.id === b.frameNodeId)!;
    b.datum = 'FRAME_BASE_IS_JACK_FOOTPLATE_CONTACT'; b.datumEvidenceRef = 'SYNTHETIC source footplate plane';
    b.path = sole ? 'SOLE_BOARD' : 'DIRECT'; b.soleBoardThicknessMm = sole ? 50 : 0; b.supportKind = 'SOIL'; b.supportEvidenceRef = 'SYNTHETIC ground, no bearing approval';
    const make = (id: string, lower: boolean): BearingInterface => ({...emptyBearingInterface(id), role: sole ? lower ? 'SOLE_BOARD_TO_SUPPORT' : 'JACK_TO_SOLE_BOARD' : 'JACK_TO_SUPPORT',
      centerMm: [n.pointMm[0], n.pointMm[1], n.pointMm[2]! - (lower ? 50 : 0)], localX: [1, 0], localY: [0, 1], lengthXMm: lower ? 400 : 200, widthYMm: lower ? 800 : 400,
      geometryEvidenceRef: 'SYNTHETIC rectangle', model: 'RIGID_HORIZONTAL_RECTANGLE_AFFINE_COMPRESSION_ONLY', modelEvidenceRef: 'SYNTHETIC conditional pressure-law study',
      weight: {mode: 'ADD_SELF_WEIGHT', ownershipId: `${b.id}:${id}:WEIGHT`, rawForceN: 0, pointMm: [null, null, null], evidenceRef: 'SYNTHETIC explicit zero weight test'}});
    b.interfaces = sole ? [make('UPPER', false), make('LOWER', true)] : [make('DIRECT', false)];
  });
  return {model, definition};
}
export function applySupportFixture(model: WorkflowModel, definition: SupportLayoutDefinition) {return regenerateDraftLayouts(model, {supportLayout: stampSupportLayout(model, definition)}, {allowIncomplete: true});}
export function supportApplied(sole = false) {const {model, definition} = supportFixture(undefined, sole); return applySupportFixture(model, definition);}
