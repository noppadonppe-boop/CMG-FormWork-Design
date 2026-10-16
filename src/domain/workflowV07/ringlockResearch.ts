import {clone, finite, identifier, record} from './common.js';
import type {RinglockConfiguration} from './ringlock.js';
import {screenSupplierCatalogue, type SupplierCatalogueState} from './ringlockSuppliers.js';

export type RinglockRole = 'STANDARD' | 'LEDGER' | 'DIAGONAL_BRACE';
export interface RinglockResearchData {
  schema_version: string; checked_on: string; sections: Record<string, unknown>[]; sources: Record<string, unknown>[];
  product_reference_groups: Record<string, unknown>[]; material_grade_references: Record<string, unknown>[];
  elastic_reference_set: Record<string, unknown>;
}
export interface RinglockResearchChoice {
  groupId: string | null; role: RinglockRole | null; sectionId: string | null; materialGrade: string | null;
  useElasticReference: boolean; hypothesisRef: string;
  supplierCatalogue?: SupplierCatalogueState;
}
export interface RinglockResearchSnapshot {
  schemaVersion: '1'; sourceVersion: string; sourceSha256: string; choice: RinglockResearchChoice;
  group: Record<string, unknown> | null; section: Record<string, unknown> | null;
  material: Record<string, unknown> | null; elastic: Record<string, unknown> | null; sources: Record<string, unknown>[];
  status: 'UNVERIFIED_PROJECT_REFERENCE'; constructionRelease: 'NO_GO';
}
export const emptyRinglockResearchChoice = (): RinglockResearchChoice => ({groupId: null, role: null, sectionId: null, materialGrade: null, useElasticReference: false, hypothesisRef: ''});
/** Product groups retain their own section assignments. A matching diameter in another group
 * never supplies missing TNV metric grade, section, connection stiffness or system resistance.
 */
export function referenceSectionIds(group: Record<string, unknown> | null, role: RinglockRole | null): string[] {
  if (!group || !role) return [];
  const candidates: unknown[] = [];
  if (Array.isArray(group.components)) candidates.push(...group.components.map(record).filter(c => c.role === role).map(c => c.section_id));
  const field = role === 'STANDARD' ? 'standard' : role === 'LEDGER' ? 'ledger' : 'brace';
  candidates.push(group[`${field}_section_id`]);
  if (group[field] && typeof group[field] === 'object') candidates.push(record(group[field]).section_id);
  if (role === 'STANDARD' && Array.isArray(group.variants)) candidates.push(...group.variants.map(record).map(c => c.section_id));
  return [...new Set(candidates.filter((id): id is string => typeof id === 'string' && !!id.trim()))];
}
export function nominalTubeProperties(D: number, t: number) {
  finite(D, 'tube OD'); finite(t, 'tube wall'); if (2 * t >= D) throw Error('Tube wall must be below OD/2');
  const d = D - 2 * t, A = Math.PI * (D ** 2 - d ** 2) / 4, I = Math.PI * (D ** 4 - d ** 4) / 64;
  return {D_mm: D, t_mm: t, d_mm: d, A_mm2: A, I_mm4: I, Wel_mm3: 2 * I / D, r_mm: Math.sqrt(I / A), J_mm4: 2 * I};
}
export function selectRinglockResearch(data: RinglockResearchData, sourceSha256: string, choice: RinglockResearchChoice): RinglockResearchSnapshot {
  if (data.schema_version !== 'research-1.0' || !/^[a-f0-9]{64}$/i.test(sourceSha256)) throw Error('Versioned research source and SHA-256 required');
  if (choice.role !== null && !['STANDARD', 'LEDGER', 'DIAGONAL_BRACE'].includes(choice.role)) throw Error('Unknown Ringlock role');
  if (typeof choice.useElasticReference !== 'boolean' || typeof choice.hypothesisRef !== 'string' || choice.hypothesisRef.length > 2000) throw Error('Invalid reference hypothesis');
  const group = choice.groupId === null ? null : data.product_reference_groups.find(g => g.id === choice.groupId);
  if (group === undefined) throw Error('Unknown product reference group');
  const section = choice.sectionId === null ? null : data.sections.find(s => s.id === choice.sectionId);
  if (section === undefined || (section && !referenceSectionIds(group, choice.role).includes(String(section.id)))) throw Error('Section is not evidenced for this product group/role');
  const material = choice.materialGrade === null ? null : data.material_grade_references.find(m => m.grade === choice.materialGrade);
  if (material === undefined) throw Error('Unknown material reference');
  const elastic = choice.useElasticReference ? data.elastic_reference_set : null;
  const sourceIds = new Set([...(Array.isArray(group?.source_ids) ? group.source_ids : []), ...(Array.isArray(section?.source_ids) ? section.source_ids : []), material?.source_id, elastic?.source_id].filter((s): s is string => typeof s === 'string'));
  const sources = [...sourceIds].map(id => {const source = data.sources.find(s => s.id === id); if (!source) throw Error(`Unknown reference source ${id}`); return source;});
  const result: RinglockResearchSnapshot = {schemaVersion: '1', sourceVersion: `${data.schema_version}@${data.checked_on}`, sourceSha256: sourceSha256.toLowerCase(),
    choice: clone(choice), group: group ?? null, section: section ?? null, material: material ?? null, elastic, sources,
    status: 'UNVERIFIED_PROJECT_REFERENCE', constructionRelease: 'NO_GO'};
  screenRinglockResearch(result, null);
  return clone(result);
}
export function screenRinglockResearch(snapshot: RinglockResearchSnapshot, config: RinglockConfiguration | null) {
  if (snapshot.schemaVersion !== '1' || snapshot.status !== 'UNVERIFIED_PROJECT_REFERENCE' || snapshot.constructionRelease !== 'NO_GO' || !/^[a-f0-9]{64}$/i.test(snapshot.sourceSha256)) throw Error('Invalid research reference snapshot');
  identifier(snapshot.sourceVersion, 'research version');
  const blockers = ['PROJECT_FINISHED_TUBE_BATCH_AND_SUPPLIER_EVIDENCE_REQUIRED', 'PROJECT_BRACE_END_NODE_STIFFNESS_AND_RESISTANCE_REQUIRED', 'NO_MATERIAL_PROPERTY_TO_SYSTEM_CAPACITY_CONVERSION'];
  const supplierReference = snapshot.choice.supplierCatalogue ? screenSupplierCatalogue(snapshot.choice.supplierCatalogue, config) : null;
  if (supplierReference) blockers.push(...supplierReference.blockers);
  const {choice, group, section, material, elastic} = snapshot;
  if ((group?.id ?? null) !== choice.groupId || (section?.id ?? null) !== choice.sectionId || (material?.grade ?? null) !== choice.materialGrade || !!elastic !== choice.useElasticReference) throw Error('Reference choice does not match frozen records');
  let gross: ReturnType<typeof nominalTubeProperties> | null = null;
  if (!section) blockers.push('RINGLOCK_ROLE_SECTION_REFERENCE_NOT_SELECTED');
  else {
    if (!referenceSectionIds(group, choice.role).includes(String(section.id))) throw Error('Reference section/group/role mismatch');
    gross = nominalTubeProperties(finite(section.D_mm, 'OD'), finite(section.t_mm, 'wall'));
    for (const [key, value] of [['A_mm2', gross.A_mm2], ['Iy_mm4', gross.I_mm4], ['Iz_mm4', gross.I_mm4], ['Wel_mm3', gross.Wel_mm3], ['r_mm', gross.r_mm]] as const) {
      if (Math.abs(finite(section[key], key) - value) > Math.max(1, value) * 1e-8) throw Error(`Nominal tube reference ${key} inconsistent with D/t`);
    }
    blockers.push('NOMINAL_GROSS_TUBE_ONLY_NET_ENDS_TOLERANCE_AND_CORROSION_UNVERIFIED');
  }
  if (!choice.hypothesisRef.trim()) blockers.push('REFERENCE_HYPOTHESIS_REASON_REQUIRED');
  if (!material) blockers.push('RINGLOCK_MATERIAL_REFERENCE_NOT_SELECTED');
  else {
    finite(material.Fy_min_MPa, 'reference Fy'); finite(material.Fu_min_MPa, 'reference Fu'); finite(material.thickness_max_mm, 'reference thickness band');
    if (section && Number(section.t_mm) > Number(material.thickness_max_mm)) blockers.push('MATERIAL_REFERENCE_THICKNESS_OUT_OF_SCOPE');
    blockers.push('FEEDSTOCK_GRADE_REFERENCE_IS_NOT_FINISHED_TUBE_CERTIFICATION');
  }
  if (elastic) {finite(elastic.E_MPa, 'reference E'); finite(elastic.G_MPa, 'reference G'); blockers.push('ELASTIC_REFERENCE_REQUIRES_PROJECT_DESIGN_BASIS');}
  const labels = Array.isArray(group?.ledger_labels_mm) ? group.ledger_labels_mm : [];
  const planMatches = config && group ? {x: labels.includes(config.bayXMm), y: labels.includes(config.bayYMm)} : null;
  if (planMatches && (!planMatches.x || !planMatches.y)) blockers.push('REFERENCE_PRODUCT_MODULE_DOES_NOT_MATCH_SELECTED_PLAN');
  // Even matching nominal module labels do not imply brace bay/lift, stock or node compatibility.
  blockers.push('REFERENCE_MODULE_LABELS_DO_NOT_VERIFY_INSTALLED_BRACES_OR_DATUMS');
  return {status: 'REFERENCE_ONLY' as const, gross, planMatches, blockers, constructionRelease: 'NO_GO' as const, ...(supplierReference ? {supplierReference} : {})};
}
