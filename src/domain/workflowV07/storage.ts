import type {Input} from '../index.js';
import {canonical, record, WORKFLOW_VERSION} from './common.js';
import {parseWorkflowModel, type WorkflowModel} from './model.js';

/** Persisted authored draft of one Design Case. Holds inputs and stamped layouts only; every
 * analysis result is recomputed on load. Nothing here is an engineering snapshot or approval. */
export const WORKFLOW_DRAFT_SCHEMA = 'workflow-draft-1' as const;
export const WORKFLOW_DRAFT_LIMIT = 900_000;
export interface StoredWorkflowDraft {
  schemaVersion: typeof WORKFLOW_DRAFT_SCHEMA; engineVersion: string; savedAtMs: number; sourceInputHash: string; model: WorkflowModel;
}
/** Legacy geometry that seeds a v0.7 model; other legacy fields do not affect the draft. */
export const workflowSourceHash = (input: Pick<Input, 'kind' | 'shape' | 'width' | 'length' | 'height' | 'armX' | 'armY' | 'gamma'>) =>
  canonical({kind: input.kind, shape: input.shape, width: input.width, length: input.length, height: input.height, armX: input.armX, armY: input.armY, gamma: input.gamma});

export function createStoredWorkflowDraft(model: WorkflowModel, input: Parameters<typeof workflowSourceHash>[0], now = Date.now()): StoredWorkflowDraft {
  const draft: StoredWorkflowDraft = {schemaVersion: WORKFLOW_DRAFT_SCHEMA, engineVersion: WORKFLOW_VERSION, savedAtMs: now, sourceInputHash: workflowSourceHash(input), model: parseWorkflowModel(model)};
  if (JSON.stringify(draft).length > WORKFLOW_DRAFT_LIMIT) throw Error(`Workflow draft exceeds ${WORKFLOW_DRAFT_LIMIT} characters; reduce layouts or split the case`);
  return draft;
}
export function parseStoredWorkflowDraft(raw: unknown): StoredWorkflowDraft {
  const r = record(raw), keys = ['schemaVersion', 'engineVersion', 'savedAtMs', 'sourceInputHash', 'model'];
  if (keys.some(k => !Object.hasOwn(r, k)) || Object.keys(r).some(k => !keys.includes(k))) throw Error('Invalid workflow draft fields');
  if (r.schemaVersion !== WORKFLOW_DRAFT_SCHEMA || typeof r.engineVersion !== 'string' || !r.engineVersion.trim() || r.engineVersion.length > 50 ||
    typeof r.savedAtMs !== 'number' || !Number.isFinite(r.savedAtMs) || r.savedAtMs < 0 || typeof r.sourceInputHash !== 'string' || r.sourceInputHash.length > 2000) throw Error('Invalid workflow draft metadata');
  return {schemaVersion: WORKFLOW_DRAFT_SCHEMA, engineVersion: r.engineVersion, savedAtMs: r.savedAtMs, sourceInputHash: r.sourceInputHash, model: parseWorkflowModel(r.model)};
}
/** A draft saved by another engine version keeps its authored data but gets a new revision, so
 * every stamped layout reports stale until the user re-analyses. */
export function restoreWorkflowDraft(stored: StoredWorkflowDraft, input: Parameters<typeof workflowSourceHash>[0], newRevisionId: () => string = () => globalThis.crypto.randomUUID()) {
  const staleEngine = stored.engineVersion !== WORKFLOW_VERSION, sourceChanged = stored.sourceInputHash !== workflowSourceHash(input);
  const model = staleEngine ? parseWorkflowModel({...stored.model, revisionId: newRevisionId()}) : stored.model;
  return {model, staleEngine, sourceChanged, savedEngineVersion: stored.engineVersion};
}
