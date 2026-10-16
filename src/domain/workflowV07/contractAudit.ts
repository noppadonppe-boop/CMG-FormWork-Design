import {canonical, clone, identifier, WORKFLOW_VERSION} from './common.js';

/** The v0.7 contract is a coverage/audit surface, not a source of product ratings.
 * Every row is retained for the current physical revision and stays NO_GO.  A
 * SCREENED row means that the corresponding software path produced a traceable
 * result; it never means that the Ringlock system or connection is approved.
 */
export const RINGLOCK_CONTRACT_SCHEMA = 'ringlock-analysis-contract-1.0' as const;
export const RINGLOCK_CONTRACT_REVISION = '2026-10-15' as const;
export const CONTRACT_CHECK_IDS = [
  'LOAD_PATH', 'GLOBAL_STABILITY', 'STANDARD_N_M_V', 'LEDGER_MEMBER', 'BRACE_T_C',
  'LEDGER_ROSETTE', 'ROSETTE_WELD', 'SPIGOT', 'JACK_HEAD_BASE', 'SUPPORT_CONTACT', 'SLS', 'STAGE_RELEASE',
] as const;
export type ContractCheckId = typeof CONTRACT_CHECK_IDS[number];
export type ContractCheckStatus = 'INCOMPLETE' | 'SCREENED' | 'FAIL';

export interface ContractCheckSignal {
  status: ContractCheckStatus;
  entityIds: string[];
  missingInputs: string[];
  blockers: string[];
  evidenceRefs?: string[];
}

export interface ContractAuditContext {
  inputRevision: string;
  stageId: string;
  loadCaseId: string;
  signals: Partial<Record<ContractCheckId, ContractCheckSignal>>;
}

export interface ContractCheckAudit {
  checkId: ContractCheckId;
  inputRevision: string;
  stageId: string;
  loadCaseId: string;
  entityIds: string[];
  status: ContractCheckStatus;
  missingInputs: string[];
  blockers: string[];
  evidenceRefs: string[];
  constructionRelease: 'NO_GO';
}

export interface ContractAudit {
  schemaVersion: typeof RINGLOCK_CONTRACT_SCHEMA;
  contractRevision: typeof RINGLOCK_CONTRACT_REVISION;
  engineVersion: typeof WORKFLOW_VERSION;
  inputRevision: string;
  stageId: string;
  loadCaseId: string;
  checks: ContractCheckAudit[];
  status: ContractCheckStatus;
  confirmed: false;
  blockers: string[];
  constructionRelease: 'NO_GO';
}

const unique = (values: string[]) => [...new Set(values.filter(v => typeof v === 'string' && v.trim()))];
// INCOMPLETE dominates SCREENED: a partial screen can never hide another
// contract row that still lacks required evidence. FAIL remains dominant.
const statusRank: Record<ContractCheckStatus, number> = {SCREENED: 0, INCOMPLETE: 1, FAIL: 2};

function normalizeSignal(id: ContractCheckId, signal: ContractCheckSignal | undefined): ContractCheckSignal {
  if (!signal) return {
    status: 'INCOMPLETE', entityIds: [], evidenceRefs: [],
    missingInputs: ['CONTRACT_CHECK_IMPLEMENTATION_REQUIRED'],
    blockers: [`${id}:CHECK_NOT_IMPLEMENTED_BY_CURRENT_HANDOFF`],
  };
  const status = ['INCOMPLETE', 'SCREENED', 'FAIL'].includes(signal.status) ? signal.status : 'INCOMPLETE';
  return {
    status,
    entityIds: unique(signal.entityIds),
    evidenceRefs: unique(signal.evidenceRefs ?? []),
    missingInputs: unique(signal.missingInputs),
    blockers: unique(signal.blockers),
  };
}

function validateContext(context: ContractAuditContext) {
  identifier(context.inputRevision, 'contract input revision');
  if (typeof context.stageId !== 'string' || typeof context.loadCaseId !== 'string') throw Error('Contract stage/load case text required');
  if (!context.signals || typeof context.signals !== 'object' || Array.isArray(context.signals)) throw Error('Contract signals object required');
}

/** Build all twelve contract rows without inferring missing entities, loads or capacities. */
export function auditRinglockContract(context: ContractAuditContext): ContractAudit {
  validateContext(context);
  const checks = CONTRACT_CHECK_IDS.map(checkId => {
    const signal = normalizeSignal(checkId, context.signals[checkId]);
    return {
      checkId,
      inputRevision: context.inputRevision,
      stageId: context.stageId,
      loadCaseId: context.loadCaseId,
      entityIds: [...signal.entityIds],
      status: signal.status,
      missingInputs: [...signal.missingInputs],
      blockers: [...signal.blockers],
      evidenceRefs: [...(signal.evidenceRefs ?? [])],
      constructionRelease: 'NO_GO' as const,
    };
  });
  const status = checks.reduce<ContractCheckStatus>((current, row) => statusRank[row.status] > statusRank[current] ? row.status : current, 'SCREENED');
  return {
    schemaVersion: RINGLOCK_CONTRACT_SCHEMA,
    contractRevision: RINGLOCK_CONTRACT_REVISION,
    engineVersion: WORKFLOW_VERSION,
    inputRevision: context.inputRevision,
    stageId: context.stageId,
    loadCaseId: context.loadCaseId,
    checks: clone(checks),
    status,
    confirmed: false,
    blockers: unique(checks.flatMap(row => row.blockers)),
    constructionRelease: 'NO_GO',
  };
}

/** Rebuild an audit with evidence produced by a later workflow path.
 * The overlay can refine entity IDs and blockers, but it cannot change the
 * contract's revision/stage/case identity or grant construction release.
 */
export function overlayContractSignals(audit: ContractAudit, overrides: Partial<Record<ContractCheckId, ContractCheckSignal>>) {
  const signals: Partial<Record<ContractCheckId, ContractCheckSignal>> = {};
  for (const row of audit.checks) signals[row.checkId] = contractSignal(row.status, row.entityIds, row.missingInputs, row.blockers, row.evidenceRefs);
  for (const checkId of CONTRACT_CHECK_IDS) if (overrides[checkId]) signals[checkId] = overrides[checkId];
  return auditRinglockContract({inputRevision: audit.inputRevision, stageId: audit.stageId, loadCaseId: audit.loadCaseId, signals});
}

/** A safe empty audit for a draft that has no frame analysis yet. */
export function emptyRinglockContractAudit(inputRevision: string, stageId = '', loadCaseId = '') {
  return auditRinglockContract({inputRevision, stageId, loadCaseId, signals: {}});
}

/** Small helper for callers that need a deterministic signal without granting authority. */
export function contractSignal(status: ContractCheckStatus, entityIds: string[] = [], missingInputs: string[] = [], blockers: string[] = [], evidenceRefs: string[] = []): ContractCheckSignal {
  return {status, entityIds: [...entityIds], missingInputs: [...missingInputs], blockers: [...blockers], evidenceRefs: [...evidenceRefs]};
}

/** A canonical identity used by frozen report/drawing comparisons. */
export function contractAuditIdentity(audit: ContractAudit) {
  return canonical({schemaVersion: audit.schemaVersion, contractRevision: audit.contractRevision, inputRevision: audit.inputRevision,
    stageId: audit.stageId, loadCaseId: audit.loadCaseId, checks: audit.checks});
}
