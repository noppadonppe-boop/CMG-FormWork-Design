import {previewWorkflow, regenerateDraftLayouts} from '../../src/domain/workflowV07/model';
import {emptyFrameElement, frameGeometryFromSoffit, stampFrameLayout, type FrameLayoutDefinition} from '../../src/domain/workflowV07/frameWorkflow';
import {builtModel} from './workflow-v07-soffit';

export function frameFixture() {
  const model = builtModel(), reactions = previewWorkflow(model).loadPath!.reactions;
  const definition: FrameLayoutDefinition = frameGeometryFromSoffit(model, reactions);
  definition.actionBasis = 'SERVICE'; definition.acknowledgeLinearScope = true;
  definition.assumptionEvidenceRef = 'SYNTHETIC independent columns with fixed bases; not a stock Ringlock assembly';
  for (const n of definition.nodes) n.boundary = Array.from({length: 6}, () => ({kind: n.role === 'BASE' ? 'FIXED' as const : 'FREE' as const}));
  for (let i = 1; i <= 6; i++) definition.elements.push({...emptyFrameElement(`STD-${i}`), nodeI: `FB-${i}`, nodeJ: `FH-${i}`,
    role: 'STANDARD', kind: 'BEAM_COLUMN', E_MPa: 200000, G_MPa: 80000, A_mm2: 200, Iy_mm4: 1e6, Iz_mm4: 2e6, J_mm4: 3e6,
    localY: [0, 1, 0], evidenceRef: 'SYNTHETIC beam-column, not product data'});
  return {model, definition};
}
export function frameApplied() {const {model, definition} = frameFixture(); return regenerateDraftLayouts(model, {frameLayout: stampFrameLayout(model, definition)});}
