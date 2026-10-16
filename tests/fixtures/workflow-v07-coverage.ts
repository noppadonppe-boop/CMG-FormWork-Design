import {references} from '../../src/workflowV07References';
import {builtModel, slabModel} from './workflow-v07-soffit';
import {applyCoverageReview, previewWorkflow} from '../../src/domain/workflowV07/model';
import {requirementRef, type CoverageReviewGroup} from '../../src/domain/workflowV07/coverageReview';

export const checkCatalogue = () => ({version: '0.7', specifications: references.checks.map(c => ({id: String(c.check_id), group: String(c.group), description: String(c.description), appliesTo: String(c.applicable_to)}))});
export const coverageModel = () => builtModel({...slabModel(), checkCatalogue: checkCatalogue()});
export function representativeGroup() {
  const model = coverageModel(), p = previewWorkflow(model), row = (member: string) => requirementRef(p.requiredChecks.find(r => r.memberId === member && r.checkId === 'SOFFIT-05')!);
  const group: CoverageReviewGroup = {id: 'SYN-TYP', representative: row('JOIST-2'), targets: [row('JOIST-2'), row('JOIST-3')], mode: 'LOCAL_1D_SAME',
    evidenceRef: 'SYNTHETIC local input comparison; material/contact/check-scope review remains pending', notApplicableReason: ''};
  return {model, group, applied: applyCoverageReview(model, {schemaVersion: '1', groups: [group]})};
}
