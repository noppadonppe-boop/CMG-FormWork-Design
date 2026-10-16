import {canonical, clone, freezeDeep, NOTICE, WORKFLOW_VERSION} from './common.js';
import {parseWorkflowModel, previewWorkflow, type WorkflowModel} from './model.js';

export async function contentHash(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonical(value));
  const hash = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
}
export interface FrozenDesign {
  content: {schemaVersion: '0.7.0'; notice: string; model: WorkflowModel; preview: ReturnType<typeof previewWorkflow>};
  inputHash: string; snapshotHash: string;
  // Operational metadata does not enter deterministic engineering content identity.
  createdAt: string;
}
export async function freezeDesign(raw: WorkflowModel): Promise<FrozenDesign> {
  // Copy before awaiting. A concurrently edited draft cannot change an in-flight snapshot.
  const model = parseWorkflowModel(raw);
  const content = {schemaVersion: '0.7.0' as const, notice: NOTICE, model, preview: previewWorkflow(model)};
  const [inputHash, snapshotHash] = await Promise.all([contentHash(model), contentHash(content)]);
  return freezeDeep({content, inputHash, snapshotHash, createdAt: new Date().toISOString()});
}
export async function documentView(snapshot: FrozenDesign, currentDraft: WorkflowModel) {
  if (await contentHash(snapshot.content) !== snapshot.snapshotHash || await contentHash(snapshot.content.model) !== snapshot.inputHash) throw Error('Snapshot integrity mismatch');
  if (snapshot.content.preview.engineVersion !== WORKFLOW_VERSION) throw Error('Snapshot engine version differs: recalculate and freeze a new draft with the current engine');
  // Recompute rather than accepting serialized verdicts or user-filled approval fields.
  if (canonical(previewWorkflow(snapshot.content.model)) !== canonical(snapshot.content.preview)) throw Error('Snapshot calculation mismatch');
  const freshness = await contentHash(parseWorkflowModel(currentDraft)) === snapshot.inputHash ? 'CURRENT' as const : 'STALE' as const;
  return freezeDeep({notice: NOTICE, snapshotHash: snapshot.snapshotHash, inputHash: snapshot.inputHash, freshness,
    report: {model: clone(snapshot.content.model), preview: clone(snapshot.content.preview)},
    drawing: {topology: clone(snapshot.content.preview.topology), layoutCandidate: clone(snapshot.content.model.layoutCandidate ?? null), analyses: clone(snapshot.content.preview.loadPath?.analyses ?? []), side: clone(snapshot.content.preview.side), frame: clone(snapshot.content.preview.frame), contractAudit: clone(snapshot.content.preview.contractAudit), contractAudits: clone(snapshot.content.preview.contractAudits), assembly: clone(snapshot.content.preview.assembly), supports: clone(snapshot.content.preview.supports), headBearings: clone(snapshot.content.preview.headBearings), loadCases: clone(snapshot.content.preview.loadCases), stageStudy: clone(snapshot.content.preview.stageStudy), coverageReview: clone(snapshot.content.preview.coverageReview)},
    constructionEligible: false as const, approval: null});
}
export function importDraft(raw: unknown): WorkflowModel {
  const model = parseWorkflowModel(raw);
  return {...model, revisionId: globalThis.crypto.randomUUID(), humanInputReviewed: false, representatives: [], coverage: []};
}
