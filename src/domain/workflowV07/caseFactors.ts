import {finite, identifier, record, signed} from './common.js';
export const CASE_ACTIONS = ['CONCRETE', 'ADDITIONAL_DL', 'CONSTRUCTION_LL', 'SELF_WEIGHT', 'HYDROSTATIC_SIDE', 'WIND', 'PLACEMENT', 'OTHER', 'IMPOSED_MOVEMENT'] as const;
export const SIGNED_CASE_ACTIONS: readonly string[] = ['WIND', 'PLACEMENT', 'OTHER', 'IMPOSED_MOVEMENT'];
export interface AnalysisCase {
  id: string; stageId: string; loadCaseId: string; basis: 'SERVICE' | 'FACTORED' | null;
  basisEvidenceRef: string; sharedLayoutEvidenceRef: string;
  factors: Record<typeof CASE_ACTIONS[number], number | null>;
}
export const emptyAnalysisCase = (id: string): AnalysisCase => ({id, stageId: '', loadCaseId: '', basis: null, basisEvidenceRef: '', sharedLayoutEvidenceRef: '',
  factors: Object.fromEntries(CASE_ACTIONS.map(k => [k, null])) as AnalysisCase['factors']});
export function validateAnalysisCase(raw: unknown): asserts raw is AnalysisCase {
  const c = record(raw), keys = ['id', 'stageId', 'loadCaseId', 'basis', 'basisEvidenceRef', 'sharedLayoutEvidenceRef', 'factors'];
  if (Object.keys(c).some(k => !keys.includes(k)) || keys.some(k => !Object.hasOwn(c, k)) || ![null, 'SERVICE', 'FACTORED'].includes(c.basis as string | null)) throw Error('Invalid analysis case fields/basis or authority metadata');
  identifier(c.id, 'analysis case ID');
  for (const k of ['stageId', 'loadCaseId', 'basisEvidenceRef', 'sharedLayoutEvidenceRef']) if (typeof c[k] !== 'string' || String(c[k]).length > 2000) throw Error(`Invalid case ${k}`);
  const f = record(c.factors); if (Object.keys(f).length !== CASE_ACTIONS.length || CASE_ACTIONS.some(k => !Object.hasOwn(f, k))) throw Error('Explicit factor slots required for every action category');
  for (const k of CASE_ACTIONS) if (f[k] !== null) {if (SIGNED_CASE_ACTIONS.includes(k)) signed(f[k], `${k} signed vector factor`); else finite(f[k], `${k} factor`, true);}
}
/** Absence retains the original unfactored source calculation. A present unknown is never 0 or 1. */
export function actionFactor(model: {analysisCase?: AnalysisCase | null}, kind: typeof CASE_ACTIONS[number]): number {
  if (!model.analysisCase) return 1;
  validateAnalysisCase(model.analysisCase); if (!model.analysisCase.basis) throw Error('Explicit analysis-case load basis required');
  const v = model.analysisCase.factors[kind], name = `${model.analysisCase.id}:${kind} explicit factor`;
  return SIGNED_CASE_ACTIONS.includes(kind) ? signed(v, name) : finite(v, name, true);
}
