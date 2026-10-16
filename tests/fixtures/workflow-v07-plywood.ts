import {readFileSync} from 'node:fs';
import {selectReference} from '../../src/domain/workflowV07/catalogues';
import {emptyPlywoodBinding, emptySoffitPlywood, type PlywoodProductBinding, type SoffitPlywoodDefinition} from '../../src/domain/workflowV07/plywood';
export function plywoodBinding(): PlywoodProductBinding {
  const material = JSON.parse(readFileSync('src/reference/workflow-v07/materials.json', 'utf8')).materials.find((m: {material_id: string}) => m.material_id === 'PLY-UPM007-12');
  return {...emptyPlywoodBinding(), material: selectReference(material, '0.5.0'), parallelToGrainKey: 'Eb0_mean_MPa',
    axisMappingEvidenceRef: 'SYNTHETIC source-axis mapping; not product verification', productMatchEvidenceRef: 'SYNTHETIC product/thickness assumption', serviceConditionRef: 'SYNTHETIC reference service, not wet-site certification'};
}
export function plywoodFixture(): SoffitPlywoodDefinition {
  return {...emptySoffitPlywood(), thicknessMm: 12, grainAxis: 'X', jointsAtEveryJoist: true, evidenceRef: 'SYNTHETIC actual simple joints/extent',
    startYMm: 0, endYMm: 1500, selfWeightKPa: 0, selfWeightOwnership: 'SEPARATE_ACTION', selfWeightEvidenceRef: 'SYNTHETIC explicit zero only', binding: plywoodBinding()};
}
