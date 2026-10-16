import {finite, identifier, signed} from './common.js';

export interface LoadAction {
  id: string; ownershipId: string; kind: 'CONCRETE' | 'ADDITIONAL_DL' | 'CONSTRUCTION_LL' | 'SELF_WEIGHT' | 'PLACEMENT' | 'WIND' | 'OTHER';
  stageId: string; loadCaseId: string; source: string; direction: 'VERTICAL_DOWN' | 'LATERAL_X' | 'LATERAL_Y';
  units: 'kPa' | 'kN/m' | 'kN'; magnitude: number | null;
  region: {x0: number; x1: number; y0: number; y1: number} | null;
  includedInActionId: string | null;
}
export function loadOwnershipIssues(actions: LoadAction[]): string[] {
  if (!actions.length) return ['MISSING_ACTION_LEDGER'];
  const issues: string[] = [], ids = new Set<string>();
  for (const a of actions) {
    identifier(a.id, 'action'); identifier(a.ownershipId, 'ownership'); identifier(a.stageId, 'stage'); identifier(a.loadCaseId, 'load case');
    if (ids.has(a.id)) issues.push(`${a.id}:DUPLICATE_ACTION`); ids.add(a.id);
    if (!a.source?.trim()) issues.push(`${a.id}:MISSING_SOURCE`);
    if (!['CONCRETE', 'ADDITIONAL_DL', 'CONSTRUCTION_LL', 'SELF_WEIGHT', 'PLACEMENT', 'WIND', 'OTHER'].includes(a.kind)) issues.push(`${a.id}:UNSUPPORTED_ACTION_KIND`);
    if (a.magnitude === null) issues.push(`${a.id}:UNKNOWN_LOAD`); else finite(a.magnitude, 'action magnitude', true);
    if (!['kPa', 'kN/m', 'kN'].includes(a.units) || !['VERTICAL_DOWN', 'LATERAL_X', 'LATERAL_Y'].includes(a.direction)) issues.push(`${a.id}:UNSUPPORTED_UNITS_OR_DIRECTION`);
    if (a.region) {Object.values(a.region).forEach(v => signed(v, 'action coordinate')); if (a.region.x1 <= a.region.x0 || a.region.y1 <= a.region.y0) issues.push(`${a.id}:INVALID_REGION`);}
    if (a.units === 'kPa' && !a.region) issues.push(`${a.id}:MISSING_SPATIAL_OWNERSHIP`);
    if (a.includedInActionId) {
      const parent = actions.find(p => p.id === a.includedInActionId);
      if (!parent || parent.id === a.id || parent.includedInActionId || parent.stageId !== a.stageId || parent.loadCaseId !== a.loadCaseId || parent.direction !== a.direction) issues.push(`${a.id}:INVALID_INCLUDED_ACTION`);
      // Parent owns the load; this child is documentary and must not be added again.
    }
  }
  const active = actions.filter(a => !a.includedInActionId);
  for (let i = 0; i < active.length; i++) for (let j = i + 1; j < active.length; j++) {
    const a = active[i], b = active[j];
    if (a.stageId !== b.stageId || a.loadCaseId !== b.loadCaseId || a.direction !== b.direction || a.kind !== b.kind) continue;
    const overlap = a.region && b.region && Math.min(a.region.x1, b.region.x1) > Math.max(a.region.x0, b.region.x0) && Math.min(a.region.y1, b.region.y1) > Math.max(a.region.y0, b.region.y0);
    if (a.ownershipId === b.ownershipId || overlap) issues.push(`${a.id}/${b.id}:DUPLICATE_OWNED_LOAD`);
  }
  return issues;
}
export function slabLoads(gamma: number, thicknessMm: number, deadKPa: number | null, liveKPa: number | null) {
  const concreteKPa = finite(gamma, 'concrete unit weight') * finite(thicknessMm, 'slab thickness') / 1000;
  const dead = finite(deadKPa, 'additional DL', true), live = finite(liveKPa, 'construction LL', true);
  return {concreteKPa, additionalDeadKPa: dead, constructionLiveKPa: live, listedServiceKPa: concreteKPa + dead + live,
    status: 'LOAD_PREVIEW' as const, includesSelfWeight: false as const, constructionRelease: 'NO_GO' as const};
}
export function beamLoads(o: {gamma: number; bMm: number; hMm: number; slabThicknessMm: number; concreteStripMm: number;
  deadKPa: number | null; deadStripMm: number; liveKPa: number | null; liveStripMm: number}) {
  const g = finite(o.gamma, 'gamma'), b = finite(o.bMm, 'beam width') / 1000, h = finite(o.hMm, 'total depth') / 1000;
  const t = finite(o.slabThicknessMm, 'slab thickness', true) / 1000, B = finite(o.concreteStripMm, 'concrete strip') / 1000;
  if (t >= h || B < b || (t === 0 && B !== b)) throw Error('Invalid concrete ownership: B includes b; isolated beam requires B=b');
  const concreteKNPerM = g * (b * (h - t) + B * t);
  const additionalDeadKNPerM = finite(o.deadKPa, 'additional DL', true) * finite(o.deadStripMm, 'DL strip') / 1000;
  const constructionLiveKNPerM = finite(o.liveKPa, 'construction LL', true) * finite(o.liveStripMm, 'LL strip') / 1000;
  return {concreteKNPerM, additionalDeadKNPerM, constructionLiveKNPerM,
    listedServiceKNPerM: concreteKNPerM + additionalDeadKNPerM + constructionLiveKNPerM,
    sidePressureTopKPa: g * t, sidePressureBottomKPa: g * h, includesSelfWeight: false as const,
    status: 'LOAD_PREVIEW' as const, constructionRelease: 'NO_GO' as const};
}
