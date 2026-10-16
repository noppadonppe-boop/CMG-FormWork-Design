import {canonical, clone, finite, record, units} from './common.js';

export interface SelectionSnapshot {
  mode: 'STANDARD_REFERENCE' | 'CUSTOM'; reference: Record<string, unknown>; effective: Record<string, unknown>;
  provenance: {sourceVersion: string; reason: string | null; evidenceRef: string | null};
  constructionRelease: 'NO_GO';
}
/** Never mutate the manufacturer/reference master. Custom does not create a verified product. */
export function selectReference(reference: unknown, sourceVersion: string, custom?: {changes: Record<string, unknown>; reason: string; evidenceRef: string}): SelectionSnapshot {
  const original = clone(record(reference));
  if (!sourceVersion.trim()) throw Error('Source version required');
  if (custom && (!custom.reason.trim() || !custom.evidenceRef.trim())) throw Error('Custom reason and evidence required');
  if (custom && Object.keys(custom.changes).some(k => !Object.hasOwn(original, k) || /id$|status|release|verified|sha256|source|candidate_selectable|capacity_available/i.test(k))) throw Error('Custom identity/authority override rejected');
  if (custom) for (const [key, value] of Object.entries(custom.changes)) {
    if (key === 'properties') {
      const before = record(original.properties), changes = record(value);
      if (Object.keys(changes).some(k => !Object.hasOwn(before, k) || (before[k] !== null && typeof before[k] !== 'number') ||
        (changes[k] !== null && (typeof changes[k] !== 'number' || !Number.isFinite(changes[k]))))) throw Error('Custom properties must preserve numeric units/basis keys');
    } else if ((original[key] === null && !/_(mm|cm2|cm3|cm4|MPa|kg_m3)$/.test(key)) ||
      (original[key] !== null && typeof original[key] !== 'number') || (value !== null && (typeof value !== 'number' || !Number.isFinite(value)))) throw Error('Only explicit numeric property overrides are supported');
  }
  canonical(custom?.changes ?? {});
  const effective = {...clone(original), ...clone(custom?.changes ?? {})};
  if (custom?.changes.properties) effective.properties = {...record(original.properties), ...clone(record(custom.changes.properties))};
  return {mode: custom ? 'CUSTOM' : 'STANDARD_REFERENCE', reference: original, effective,
    provenance: {sourceVersion, reason: custom?.reason ?? null, evidenceRef: custom?.evidenceRef ?? null}, constructionRelease: 'NO_GO'};
}
/** Validate imported snapshots by reconstructing legal numeric changes, never trusting verdict fields. */
export function validateSelectionSnapshot(raw: unknown): asserts raw is SelectionSnapshot {
  const s = record(raw), keys = ['mode', 'reference', 'effective', 'provenance', 'constructionRelease'];
  if (Object.keys(s).length !== keys.length || keys.some(k => !Object.hasOwn(s, k)) || !['STANDARD_REFERENCE', 'CUSTOM'].includes(String(s.mode)) || s.constructionRelease !== 'NO_GO') throw Error('Invalid reference snapshot fields/authority');
  const original = record(s.reference), effective = record(s.effective), p = record(s.provenance);
  if (Object.keys(p).length !== 3 || ['sourceVersion', 'reason', 'evidenceRef'].some(k => !Object.hasOwn(p, k)) || typeof p.sourceVersion !== 'string' || !p.sourceVersion.trim() || p.sourceVersion.length > 2000) throw Error('Invalid reference provenance');
  for (const k of ['reason', 'evidenceRef']) if (p[k] !== null && (typeof p[k] !== 'string' || String(p[k]).length > 2000)) throw Error('Invalid Custom evidence');
  if (Object.keys(original).length !== Object.keys(effective).length || Object.keys(original).some(k => !Object.hasOwn(effective, k))) throw Error('Reference property keys cannot be removed/added');
  const changes: Record<string, unknown> = {};
  for (const key of Object.keys(original)) if (canonical(original[key]) !== canonical(effective[key])) {
    if (key === 'properties') {
      const before = record(original.properties), after = record(effective.properties);
      if (Object.keys(before).length !== Object.keys(after).length || Object.keys(before).some(k => !Object.hasOwn(after, k))) throw Error('Material property keys cannot be removed/added');
      changes.properties = Object.fromEntries(Object.keys(before).filter(k => canonical(before[k]) !== canonical(after[k])).map(k => [k, after[k]]));
    } else changes[key] = effective[key];
  }
  if (s.mode === 'STANDARD_REFERENCE' && (Object.keys(changes).length || p.reason !== null || p.evidenceRef !== null)) throw Error('Standard reference effective data/provenance differs from original');
  if (s.mode === 'CUSTOM' && (typeof p.reason !== 'string' || !p.reason.trim() || typeof p.evidenceRef !== 'string' || !p.evidenceRef.trim())) throw Error('Custom reason and evidence required');
  const reconstructed = selectReference(original, p.sourceVersion, s.mode === 'CUSTOM' ? {changes, reason: p.reason as string, evidenceRef: p.evidenceRef as string} : undefined);
  if (canonical(reconstructed) !== canonical(s)) throw Error('Reference snapshot does not match its legal numeric overrides');
}
export function normalizeSection(raw: unknown, orientation: 0 | 90) {
  if (orientation !== 0 && orientation !== 90) throw Error('Only declared principal orientations supported');
  const r = record(raw);
  if (r.candidate_selectable !== true) throw Error('BLOCKED_SECTION_NOT_EXPLICITLY_SELECTABLE');
  const family = String(r.family);
  if (!['RHS', 'SHS', 'CHS', 'C', 'C_LIP', 'TIMBER_RECT', 'PLYWOOD_GROSS_STRIP'].includes(family)) throw Error('Unsupported section family for this workflow');
  const ix = units.cm4ToMm4(finite(r.Ix_cm4, 'Ix_cm4')), iy = units.cm4ToMm4(finite(r.Iy_cm4, 'Iy_cm4'));
  const sx = units.cm3ToMm3(finite(r.Sx_cm3, 'Sx_cm3')), sy = units.cm3ToMm3(finite(r.Sy_cm3, 'Sy_cm3'));
  return {id: String(r.section_id), family, areaMm2: units.cm2ToMm2(finite(r.A_cm2, 'A_cm2')),
    bendingI_mm4: orientation === 0 ? ix : iy, bendingS_mm3: orientation === 0 ? sx : sy,
    Ixy_mm4: typeof r.Ixy_cm4 === 'number' ? r.Ixy_cm4 * 10000 * (orientation === 0 ? 1 : -1) : null,
    orientation, source: clone(r), status: 'REFERENCE_ONLY' as const};
}
export function steelStrengthForThickness(raw: unknown, family: string, thicknessMm: number) {
  const r = record(raw), scope = record(r.applicability), props = record(r.properties);
  finite(thicknessMm, 'governing product thickness');
  if (r.category !== 'STEEL' || r.strength_basis !== 'SPECIFIED_GRADE_LIMITS') throw Error('Steel specified-grade basis required');
  if (!Array.isArray(scope.compatible_section_families) || !scope.compatible_section_families.includes(family)) throw Error('Incompatible product family');
  const lower = typeof scope.thickness_min_mm === 'number' ? scope.thickness_min_mm : null;
  const upper = typeof scope.thickness_max_mm === 'number' ? scope.thickness_max_mm : null;
  if (lower === null || upper === null || thicknessMm > upper || (scope.thickness_min_inclusive ? thicknessMm < lower : thicknessMm <= lower)) throw Error('Outside material thickness scope');
  let fy = props.Fy_MPa;
  if (Array.isArray(r.strength_bands)) {
    const bands = r.strength_bands.map(record).filter(b => typeof b.min_mm === 'number' && typeof b.max_mm === 'number' &&
      (b.min_inclusive ? thicknessMm >= b.min_mm : thicknessMm > b.min_mm) && thicknessMm <= b.max_mm);
    if (bands.length !== 1) throw Error('No unique strength band');
    fy = bands[0].Fy_MPa;
  }
  return {Fy_MPa: finite(fy, 'Fy'), E_MPa: finite(props.E_MPa, 'E'), basis: 'SPECIFIED_GRADE_LIMITS' as const,
    source: clone(r), constructionRelease: 'NO_GO' as const};
}
export function referenceRows(raw: unknown, key: string): Record<string, unknown>[] {
  const rows = record(raw)[key];
  if (!Array.isArray(rows)) throw Error(`Missing reference array: ${key}`);
  return rows.map(record);
}
