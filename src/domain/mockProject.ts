import {defaults, validateInput, type Input} from './index.js';
import {beamFromCase, type BeamInput} from './beam.js';
import {slabFromCase, type SlabInput} from './slab.js';
import {wallFromCase, type WallInput} from './wall.js';
import type {ElementType} from './workflowV07/common.js';

/** SYNTHETIC demonstration project: two cases for each element type. All dimensions are
 * illustrative mock-up values (mm), unconfirmed, and carry no engineering approval. Beam, slab
 * and wall inputs reuse the app's editable demo defaults; equipment SWL stays zero/unknown. */
export interface MockCase {id: string; name: string; input: Input; workflowElementType: ElementType; beam?: BeamInput; slab?: SlabInput; wall?: WallInput}
export interface MockProject {id: string; name: string; code: string; cases: MockCase[]}

const footing = (o: Partial<Input>): Input => validateInput({...defaults, kind: 'FOOTING', confirmed: false, ...o});
const column = (o: Partial<Input>): Input => validateInput({...defaults, kind: 'COLUMN', confirmed: false, ...o});

export const MOCK_CASES: {code: string; name: string; type: ElementType; input: () => Input}[] = [
  {code: 'F01', name: 'ฐานรากเดี่ยว 2.0 × 2.0 ม. ลึก 0.80 ม.', type: 'FOOTING', input: () => footing({width: 2000, length: 2000, height: 800, armX: 1000, armY: 1000, walerSpacing: 400, tieSpacing: 600})},
  {code: 'F02', name: 'ฐานรากรูปตัว L 4.0 × 3.0 ม. ลึก 1.20 ม.', type: 'FOOTING', input: () => footing({shape: 'L', width: 4000, length: 3000, height: 1200, armX: 2000, armY: 2000, walerSpacing: 600})},
  {code: 'C01', name: 'เสา 0.60 × 0.60 ม. สูง 4.0 ม.', type: 'COLUMN', input: () => column({width: 600, length: 600, height: 4000, armX: 300, armY: 300, studSpacing: 200, tieSpacing: 300})},
  {code: 'C02', name: 'เสา 0.80 × 0.40 ม. สูง 3.5 ม.', type: 'COLUMN', input: () => column({width: 800, length: 400, height: 3500, armX: 400, armY: 200, studSpacing: 200, tieSpacing: 400})},
  // Workflow v0.7 footprints: X = length along the element, Y = thickness/width, height = depth.
  {code: 'W01', name: 'ผนัง หนา 0.25 ม. ยาว 6.0 ม. สูง 3.0 ม.', type: 'WALL', input: () => footing({width: 6000, length: 250, height: 3000, armX: 3000, armY: 125})},
  {code: 'W02', name: 'ผนังกันดิน หนา 0.30 ม. ยาว 8.0 ม. สูง 4.0 ม.', type: 'WALL', input: () => footing({width: 8000, length: 300, height: 4000, armX: 4000, armY: 150})},
  {code: 'B01', name: 'คาน 0.30 × 0.60 ม. ช่วง 6.0 ม.', type: 'BEAM', input: () => footing({width: 6000, length: 300, height: 600, armX: 3000, armY: 150})},
  {code: 'B02', name: 'คาน 0.40 × 0.80 ม. ช่วง 8.0 ม.', type: 'BEAM', input: () => footing({width: 8000, length: 400, height: 800, armX: 4000, armY: 200})},
  {code: 'S01', name: 'พื้น 6.0 × 4.0 ม. หนา 0.15 ม.', type: 'SLAB', input: () => footing({width: 6000, length: 4000, height: 150, armX: 3000, armY: 2000, walerSpacing: 150})},
  {code: 'S02', name: 'พื้น 5.0 × 5.0 ม. หนา 0.20 ม.', type: 'SLAB', input: () => footing({width: 5000, length: 5000, height: 200, armX: 2500, armY: 2500, walerSpacing: 200})},
];

export function mockProject(code: string, newId: () => string = () => globalThis.crypto.randomUUID()): MockProject {
  return {id: newId(), name: 'โครงการตัวอย่าง MOCK-UP · ห้ามใช้ก่อสร้าง · ฐานราก เสา ผนัง คาน พื้น', code,
    cases: MOCK_CASES.map(c => {
      const input = c.input(), footprint = {width: input.width, length: input.length, height: input.height};
      const base = {id: newId(), name: `${c.code} · ${c.name} · MOCK`, input, workflowElementType: c.type};
      if (c.type === 'BEAM') return {...base, beam: beamFromCase(null, footprint)};
      if (c.type === 'SLAB') return {...base, slab: slabFromCase(null, footprint)};
      if (c.type === 'WALL') {
        const wall = wallFromCase(null, footprint);
        return {...base, wall: c.code === 'W02' ? {...wall, system: 'SINGLE_SIDED' as const} : wall};
      }
      return base;
    })};
}
