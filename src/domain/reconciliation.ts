import type {ElementType} from './workflowV07/common.js';
import {suggestedElementTypeFromName} from './caseIntegrity.js';

export const RECONCILIATION_DECISIONS = [
  'KEEP',
  'RENAME',
  'MERGE_AFTER_DOCUMENT_REVIEW',
  'USE_NAME_SUGGESTED_TYPE',
  'USE_STORED_TYPE',
  'CREATE_SEPARATE_CASE',
] as const;
export type ReconciliationDecision = typeof RECONCILIATION_DECISIONS[number];

export interface ReconciliationCaseInput {
  id: string;
  name: string;
  storedType: ElementType;
}

export interface ReconciliationCaseRow extends ReconciliationCaseInput {
  nameSuggestedType: ElementType | null;
  allowed: ReconciliationDecision[];
  decision: ReconciliationDecision | null;
}

export interface ReconciliationDecisionTemplate {
  schemaVersion: 'cmg-002-case-reconciliation-decision-1';
  projectId: string;
  projectCode: string;
  sourceBackup: string;
  owner: string | null;
  decisions: Array<{
    caseId: string;
    name: string;
    storedType: ElementType;
    nameSuggestedType: ElementType | null;
    decision: ReconciliationDecision | null;
    allowed: ReconciliationDecision[];
  }>;
  apply: {
    approvedBy: string | null;
    approvedAt: string | null;
    reason: string | null;
    newBackupBeforeWrite: boolean;
    applyToProduction: false;
  };
}

/** Build an explicit, non-mutating decision row for every case in a project. */
export function buildReconciliationRows(cases: readonly ReconciliationCaseInput[]): ReconciliationCaseRow[] {
  const counts = new Map<string, number>();
  for (const value of cases) {
    const key = value.name.trim().toLocaleLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return cases.map(value => {
    const suggested = suggestedElementTypeFromName(value.name) ?? null;
    const duplicate = (counts.get(value.name.trim().toLocaleLowerCase()) ?? 0) > 1;
    const allowed: ReconciliationDecision[] = duplicate
      ? ['KEEP', 'RENAME', 'MERGE_AFTER_DOCUMENT_REVIEW']
      : suggested && suggested !== value.storedType
        ? ['USE_NAME_SUGGESTED_TYPE', 'USE_STORED_TYPE', 'CREATE_SEPARATE_CASE']
        : ['KEEP'];
    return {...value, nameSuggestedType: suggested, allowed, decision: null};
  });
}

export function buildReconciliationDecisionTemplate(args: {
  projectId: string;
  projectCode: string;
  sourceBackup: string;
  owner: string | null;
  rows: readonly ReconciliationCaseRow[];
  approvedBy: string | null;
  approvedAt: string | null;
  reason: string | null;
  newBackupBeforeWrite: boolean;
}): ReconciliationDecisionTemplate {
  return {
    schemaVersion: 'cmg-002-case-reconciliation-decision-1',
    projectId: args.projectId,
    projectCode: args.projectCode,
    sourceBackup: args.sourceBackup,
    owner: args.owner,
    decisions: args.rows.map(row => ({
      caseId: row.id,
      name: row.name,
      storedType: row.storedType,
      nameSuggestedType: row.nameSuggestedType,
      decision: row.decision,
      allowed: row.allowed,
    })),
    apply: {
      approvedBy: args.approvedBy,
      approvedAt: args.approvedAt,
      reason: args.reason,
      newBackupBeforeWrite: args.newBackupBeforeWrite,
      applyToProduction: false,
    },
  };
}

export function reconciliationReadyForOwner(template: ReconciliationDecisionTemplate): boolean {
  return Boolean(template.sourceBackup.trim() && template.owner?.trim() && template.decisions.every(row => row.decision && row.allowed.includes(row.decision)) && template.apply.approvedBy?.trim() && template.apply.approvedAt && template.apply.reason?.trim() && template.apply.newBackupBeforeWrite);
}

/** Parse a completed template against the currently loaded project without mutating it. */
export function parseReconciliationDecisionTemplate(raw: unknown, projectId: string, currentRows: readonly ReconciliationCaseRow[]): {
  template: ReconciliationDecisionTemplate;
  rows: ReconciliationCaseRow[];
} {
  if (!raw || typeof raw !== 'object') throw Error('Decision template must be an object');
  const value = raw as Partial<ReconciliationDecisionTemplate>;
  if (value.schemaVersion !== 'cmg-002-case-reconciliation-decision-1') throw Error('Invalid reconciliation decision schema');
  if (value.projectId !== projectId) throw Error('Decision template project does not match the current project');
  if (value.apply?.applyToProduction !== false) throw Error('Decision template must keep applyToProduction=false');
  if (!Array.isArray(value.decisions) || value.decisions.length !== currentRows.length) throw Error('Decision template case count does not match the current project');
  const byId = new Map(currentRows.map(row => [row.id, row]));
  const imported = value.decisions.map(row => {
    if (!row || typeof row !== 'object' || typeof row.caseId !== 'string') throw Error('Decision template contains an invalid case row');
    const current = byId.get(row.caseId);
    if (!current || row.name !== current.name || !Array.isArray(row.allowed) || row.allowed.join('|') !== current.allowed.join('|')) throw Error(`Decision template case does not match current audit: ${row.caseId}`);
    const decision = row.decision ?? null;
    if (decision !== null && (!current.allowed.includes(decision as ReconciliationDecision) || !RECONCILIATION_DECISIONS.includes(decision as ReconciliationDecision))) throw Error(`Decision is not allowed for ${row.caseId}`);
    return {...current, decision};
  });
  if (new Set(imported.map(row => row.id)).size !== currentRows.length) throw Error('Decision template contains duplicate or missing case ids');
  return {template: value as ReconciliationDecisionTemplate, rows: imported};
}
