import {createLayoutCandidateRequest, type LayoutCandidate} from '../../src/domain/workflowV07/layoutCandidate';
import {frameApplied} from './workflow-v07-frame-workflow';
export async function candidateFixture() {
  const model = frameApplied(), request = await createLayoutCandidateRequest(model, 'SOFFIT', model.soffitLayout!.stageId, model.soffitLayout!.loadCaseId);
  const proposal: LayoutCandidate = structuredClone(request.responseTemplate);
  proposal.sourceRef = 'SYNTHETIC manually authored proposal, no AI provider invoked'; proposal.rationale = 'SYNTHETIC denser joist grid; no strength/spacing recommendation';
  proposal.soffit!.joistXMm = [0, 400, 800, 1200, 1600, 2000, 2400];
  return {model, request, proposal};
}
