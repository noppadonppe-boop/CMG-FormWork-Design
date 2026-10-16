import {clone, finite, identifier, record} from './common.js';
import {normalizeSection, validateSelectionSnapshot, type SelectionSnapshot} from './catalogues.js';

export const ELASTIC_KEYS = ['E_MPa', 'E0_mean_MPa', 'E_ref_MPa'] as const;
export interface ElasticMemberBinding {
  schemaVersion: '1'; sectionMode: 'CATALOGUE' | 'MEASURED_TIMBER_RECT'; section: SelectionSnapshot | null; material: SelectionSnapshot | null;
  orientationDeg: 0 | 90 | null; elasticPropertyKey: typeof ELASTIC_KEYS[number] | null;
  actualWidthMm: number | null; actualDepthMm: number | null; nominalLabel: string; measurementEvidenceRef: string;
  grainParallelToMember: boolean | null; materialMatchEvidenceRef: string; serviceConditionRef: string; axisEvidenceRef: string;
}
export const MEMBER_FAMILIES = {
  STUD: ['SHS', 'RHS', 'TIMBER_RECT'], JOIST: ['SHS', 'RHS', 'TIMBER_RECT'],
  WALER: ['SHS', 'RHS', 'CHS', 'C', 'C_LIP'], BEARER: ['SHS', 'RHS', 'CHS', 'C', 'C_LIP', 'TIMBER_RECT'],
} as const;
export type ElasticMemberRole = keyof typeof MEMBER_FAMILIES;
export function emptyElasticBinding(): ElasticMemberBinding {
  return {schemaVersion: '1', sectionMode: 'CATALOGUE', section: null, material: null, orientationDeg: null, elasticPropertyKey: null,
    actualWidthMm: null, actualDepthMm: null, nominalLabel: '', measurementEvidenceRef: '', grainParallelToMember: null,
    materialMatchEvidenceRef: '', serviceConditionRef: '', axisEvidenceRef: ''};
}
function text(value: unknown, name: string, required = false) {
  if (typeof value !== 'string' || value.length > 2000 || (required && !value.trim())) throw Error(`${name}: explicit evidence required`);
}
export function validateElasticBinding(raw: unknown): asserts raw is ElasticMemberBinding {
  const b = record(raw), keys = Object.keys(emptyElasticBinding());
  if (Object.keys(b).some(k => !keys.includes(k)) || keys.some(k => !Object.hasOwn(b, k)) || b.schemaVersion !== '1' || !['CATALOGUE', 'MEASURED_TIMBER_RECT'].includes(String(b.sectionMode))) throw Error('Invalid elastic binding fields/authority');
  if (![null, 0, 90].includes(b.orientationDeg as number | null) || !(b.elasticPropertyKey === null || ELASTIC_KEYS.includes(b.elasticPropertyKey as typeof ELASTIC_KEYS[number])) || ![null, true, false].includes(b.grainParallelToMember as boolean | null)) throw Error('Invalid elastic property/axis/grain');
  for (const k of ['section', 'material']) if (b[k] !== null) validateSelectionSnapshot(b[k]);
  for (const k of ['actualWidthMm', 'actualDepthMm']) if (b[k] !== null) finite(b[k], k);
  for (const k of ['nominalLabel', 'measurementEvidenceRef', 'materialMatchEvidenceRef', 'serviceConditionRef', 'axisEvidenceRef']) text(b[k], k);
}
/** References supply elastic inputs only. Actual grade/service/resistance certification remains unresolved. */
export function resolveElasticBinding(binding: ElasticMemberBinding, role: ElasticMemberRole) {
  validateElasticBinding(binding); const b = binding;
  if (b.orientationDeg === null || !b.material || !b.elasticPropertyKey) throw Error('Binding requires explicit section orientation, material and elastic property');
  text(b.materialMatchEvidenceRef, 'actual material match', true); text(b.serviceConditionRef, 'service/moisture condition', true); text(b.axisEvidenceRef, 'member bending axis', true);
  let family: string, sectionId: string, I_mm4: number, areaMm2: number, S_mm3: number;
  const blockers = ['BOUND_REFERENCE_MATERIAL_MATCH_SERVICE_AND_RESISTANCE_UNVERIFIED', 'BOUND_MEMBER_LATERAL_TORSIONAL_AND_CONNECTION_SCOPE_UNVERIFIED'];
  if (b.sectionMode === 'MEASURED_TIMBER_RECT') {
    if (b.section !== null) throw Error('Measured timber geometry cannot also use a catalogue section');
    text(b.measurementEvidenceRef, 'measured dressed timber dimensions', true);
    const width = finite(b.actualWidthMm, 'actual timber width'), depth = finite(b.actualDepthMm, 'actual timber depth');
    const w = b.orientationDeg === 0 ? width : depth, h = b.orientationDeg === 0 ? depth : width;
    family = 'TIMBER_RECT'; sectionId = `MEASURED:${width}x${depth}`; I_mm4 = w * h ** 3 / 12; S_mm3 = w * h ** 2 / 6; areaMm2 = width * depth;
    blockers.push('MEASURED_RECTANGLE_IS_GEOMETRY_ONLY_NOT_TIMBER_GRADE_CERTIFICATION');
  } else {
    if (!b.section) throw Error('Catalogue section snapshot required');
    identifier(b.section.effective.section_id, 'bound section identity');
    if (b.actualWidthMm !== null || b.actualDepthMm !== null || b.measurementEvidenceRef || b.nominalLabel) throw Error('Catalogue binding has unused measured geometry; choose one section source');
    const s = normalizeSection(b.section.effective, b.orientationDeg);
    if (s.family === 'TIMBER_RECT') throw Error('Timber requires explicitly measured dimensions, not nominal/catalogue dimensions');
    if (s.Ixy_mm4 !== null && Math.abs(s.Ixy_mm4) > 1e-8) throw Error('Coupled unsymmetric bending is unsupported by the scalar member model');
    family = s.family; sectionId = s.id; I_mm4 = s.bendingI_mm4; areaMm2 = s.areaMm2; S_mm3 = s.bendingS_mm3;
    if (s.family === 'C_LIP') blockers.push('BOUND_C_LIP_GROSS_ELASTIC_ONLY_EFFECTIVE_LOCAL_DISTORTIONAL_RULES_REQUIRED');
    if (s.family === 'CHS') blockers.push('BOUND_CHS_CONTACT_ROLLING_AND_LOCAL_OVALIZATION_REQUIRED');
  }
  if (!(MEMBER_FAMILIES[role] as readonly string[]).includes(family)) throw Error(`${family}: incompatible with ${role} role`);
  const material = b.material.effective, scope = record(material.applicability), props = record(material.properties);
  identifier(material.material_id, 'bound material identity');
  if (!Array.isArray(scope.compatible_section_families) || !scope.compatible_section_families.includes(family)) throw Error('Material product form does not cover the selected section family');
  if (family === 'TIMBER_RECT') {
    if (material.category !== 'TIMBER' || !['E0_mean_MPa', 'E_ref_MPa'].includes(b.elasticPropertyKey) || b.grainParallelToMember !== true) throw Error('Timber needs explicit longitudinal elastic property and grain parallel to member');
  } else {
    if (material.category !== 'STEEL' || b.elasticPropertyKey !== 'E_MPa') throw Error('Steel member requires steel E_MPa; strength/shear moduli cannot substitute');
    const section = b.section!.effective, thicknessKey = family === 'C' ? 'tw_mm' : 't_mm';
    if (typeof scope.thickness_min_mm === 'number' || typeof scope.thickness_max_mm === 'number') {
      const t = finite(section[thicknessKey], 'governing product thickness');
      if ((typeof scope.thickness_min_mm === 'number' && (scope.thickness_min_inclusive ? t < scope.thickness_min_mm : t <= scope.thickness_min_mm)) ||
        (typeof scope.thickness_max_mm === 'number' && t > scope.thickness_max_mm)) throw Error('Selected section is outside material product thickness applicability');
    }
  }
  const E_MPa = finite(props[b.elasticPropertyKey], 'selected elastic modulus');
  finite(I_mm4, 'derived bending I'); finite(areaMm2, 'derived area'); finite(S_mm3, 'derived bending modulus');
  return {E_MPa, I_mm4, areaMm2, S_mm3, family, sectionId, materialId: String(material.material_id), orientationDeg: b.orientationDeg,
    elasticPropertyKey: b.elasticPropertyKey, sources: clone(b), blockers, constructionRelease: 'NO_GO' as const};
}
export function resolveMemberElastic(s: {E_MPa: number | null; I_mm4: number | null; evidenceRef: string; binding?: ElasticMemberBinding | null}, role: ElasticMemberRole) {
  if (s.binding) {
    if (s.E_MPa !== null || s.I_mm4 !== null) throw Error('Bound member cannot also override manual E/I');
    return resolveElasticBinding(s.binding, role);
  }
  text(s.evidenceRef, 'manual stiffness evidence', true);
  return {E_MPa: finite(s.E_MPa, 'actual E'), I_mm4: finite(s.I_mm4, 'actual I'), blockers: ['MANUAL_MEMBER_PROPERTIES_NOT_BOUND_TO_CATALOGUE'], constructionRelease: 'NO_GO' as const};
}
