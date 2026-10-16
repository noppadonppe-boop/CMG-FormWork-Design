import {finite, type CheckState} from './common.js';

export const TIE_ROLES = ['INNER', 'OUTER_LEFT', 'OUTER_RIGHT', 'END_LEFT', 'END_RIGHT', 'THREAD_LEFT', 'THREAD_RIGHT',
  'NUT_LEFT', 'NUT_RIGHT', 'PLATE_LEFT', 'PLATE_RIGHT', 'WALER_LOCAL_LEFT', 'WALER_LOCAL_RIGHT'] as const;
export type TieRole = typeof TIE_ROLES[number];
export interface TieComponent {
  role: TieRole; productId: string; capacityKN: number | null; basis: 'ALLOWABLE' | 'DESIGN' | 'ULTIMATE_TEST' | null;
  /** Ratio of local component force to the single tie force, from the load-sharing model. */
  demandFraction: number; sourceRef: string | null;
}
export interface TieAssembly {
  topology: 'SEGMENTED_INNER_OUTER'; demandKN: number; demandBasis: 'ALLOWABLE' | 'DESIGN'; components: TieComponent[];
  compatibilityEvidence: string | null; engagementLeftMm: number | null; engagementRightMm: number | null;
  requiredEngagementLeftMm: number | null; requiredEngagementRightMm: number | null;
}
export function screenTieAssembly(a: TieAssembly) {
  finite(a.demandKN, 'tie demand', true);
  const blockers: string[] = ['TIE_ENGINEERING_RULES_AND_TRUSTED_REVIEW_REQUIRED'];
  let failed = false;
  if (a.topology !== 'SEGMENTED_INNER_OUTER' || !['ALLOWABLE', 'DESIGN'].includes(a.demandBasis)) throw Error('Unsupported assembly topology/load basis');
  if (!a.compatibilityEvidence?.trim()) blockers.push('MISSING_ASSEMBLY_COMPATIBILITY');
  const capacities: number[] = [];
  for (const role of TIE_ROLES) {
    const rows = a.components.filter(c => c.role === role);
    if (rows.length !== 1) {blockers.push(`${role}:MISSING_OR_DUPLICATE`); continue;}
    const c = rows[0]; finite(c.demandFraction, 'component load share');
    if (c.demandFraction > 1 || (!role.startsWith('WALER_LOCAL') && c.demandFraction !== 1)) throw Error('Serial inner/outer/thread/end/nut/plate components carry full tie force');
    if (!c.productId?.trim() || !c.sourceRef?.trim() || c.basis !== a.demandBasis || c.capacityKN === null) {blockers.push(`${role}:MISSING_PRODUCT_CAPACITY_OR_MATCHED_BASIS`); continue;}
    const capacity = finite(c.capacityKN, `${role} capacity`) / c.demandFraction;
    capacities.push(capacity); if (a.demandKN > capacity) failed = true;
  }
  if (a.components.some(c => !TIE_ROLES.includes(c.role))) blockers.push('UNKNOWN_ASSEMBLY_COMPONENT');
  for (const side of ['Left', 'Right'] as const) {
    const actual = a[`engagement${side}Mm`], required = a[`requiredEngagement${side}Mm`];
    if (actual === null || required === null) blockers.push(`${side}:UNKNOWN_ENGAGEMENT`);
    else if (finite(actual, 'actual engagement', true) < finite(required, 'required engagement')) failed = true;
  }
  const capacityKN = capacities.length === TIE_ROLES.length ? Math.min(...capacities) : null;
  return {status: (failed ? 'FAIL' : 'BLOCKED') as CheckState, capacityKN, utilization: capacityKN === null ? null : a.demandKN / capacityKN,
    blockers, constructionRelease: 'NO_GO' as const};
}
