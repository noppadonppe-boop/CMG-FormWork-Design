import {readFileSync} from 'node:fs';
import {selectReference} from '../../src/domain/workflowV07/catalogues';
import {emptyElasticBinding, type ElasticMemberBinding} from '../../src/domain/workflowV07/elasticBinding';
export const sourceSections = JSON.parse(readFileSync('src/reference/workflow-v07/sections.json', 'utf8')).sections as Record<string, unknown>[];
export const sourceMaterials = JSON.parse(readFileSync('src/reference/workflow-v07/materials.json', 'utf8')).materials as Record<string, unknown>[];
export function steelBinding(orientationDeg: 0 | 90 = 0): ElasticMemberBinding {
  return {...emptyElasticBinding(), section: selectReference(sourceSections.find(s => s.family === 'C' && s.candidate_selectable === true), '0.4'),
    material: selectReference(sourceMaterials.find(m => m.material_id === 'STEEL-SS400'), '0.5.0'), orientationDeg, elasticPropertyKey: 'E_MPa',
    materialMatchEvidenceRef: 'SYNTHETIC test matching, not certified stock', serviceConditionRef: 'SYNTHETIC ambient elastic case', axisEvidenceRef: 'SYNTHETIC selected source axis'};
}
export function timberBinding(orientationDeg: 0 | 90 = 0): ElasticMemberBinding {
  return {...emptyElasticBinding(), sectionMode: 'MEASURED_TIMBER_RECT', actualWidthMm: 38, actualDepthMm: 70, nominalLabel: 'SYNTHETIC nominal label only',
    measurementEvidenceRef: 'SYNTHETIC measured dimensions', material: selectReference(sourceMaterials.find(m => m.material_id === 'TIMBER-EN338-C24'), '0.5.0'),
    orientationDeg, elasticPropertyKey: 'E0_mean_MPa', grainParallelToMember: true, materialMatchEvidenceRef: 'SYNTHETIC class reference, not site certification',
    serviceConditionRef: 'SYNTHETIC reference moisture case', axisEvidenceRef: 'SYNTHETIC longitudinal bending axis'};
}
