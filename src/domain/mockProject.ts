import {defaults, validateInput, type Input} from './index.js';
import {beamFromCase, validateBeamInput, type BeamInput} from './beam.js';
import {slabFromCase, validateSlabInput, type SlabInput} from './slab.js';
import {wallFromCase, validateWallInput, type WallInput} from './wall.js';
import type {ElementType} from './workflowV07/common.js';

/** SYNTHETIC demonstration project: two cases for each element type. All dimensions are
 * illustrative mock-up values (mm), unconfirmed, and carry no engineering approval. Beam, slab
 * and wall inputs reuse the app's editable demo defaults; equipment SWL stays zero/unknown. */
export interface MockCase {id: string; name: string; input: Input; workflowElementType: ElementType; beam?: BeamInput; slab?: SlabInput; wall?: WallInput}
export interface MockProject {id: string; name: string; code: string; cases: MockCase[]}

/**
 * Evidence used by the generated Project Example.  These are source labels only;
 * they do not turn a reference table into a product rating or a construction release.
 */
export const PROJECT_EXAMPLE_REFERENCES = {
  loads: 'ACI PRC-347-14(21) §4.2.1 และ §4.2.3.2 · ค่าขั้นต่ำงานแบบหล่อ ต้องตรวจ Design Basis โครงการ',
  plywood: 'APA Concrete Forming Design/Construction Guide V345 (2012) Tables 12–13 · ต้องยืนยันแผ่นจริง',
  sections: 'PAP-TIS107-2026 · TIS 107-2566 Table ข.1 p16 / Table ค.1 p22 · gross properties, REVIEW_REQUIRED',
  timber: 'Design Form Work ตาราง 3.4 (อ้าง ว.ส.ท.) · ต้องยืนยันชนิดไม้ ขนาดหลังไส และความชื้น',
  ringlock: 'src/reference/workflow-v07/ringlock-research-2026-10-15.json · REFERENCE_ONLY_REQUIRES_PROJECT_PRODUCT_EVIDENCE · NO_GO',
  formTie: 'docs/closure-pack-preview26-v1/data/form_tie_machine_bridge.json และ baseline/formtie_v0.6.2 · reference-only · capacity UNKNOWN',
} as const;

const MOCK_SECTION_WALER = 'PAP-TIS107-RHS-100x50x3.2';
const MOCK_SECTION_STUD = 'PAP-TIS107-SHS-50x50x2.3';
const MOCK_CONNECTION_REFERENCE = `MOCK-UP only · ${PROJECT_EXAMPLE_REFERENCES.formTie}; ${PROJECT_EXAMPLE_REFERENCES.ringlock}`;
const MOCK_SHORING_REFERENCE = `MOCK-UP only · SWL ยังไม่ระบุ; ${PROJECT_EXAMPLE_REFERENCES.ringlock}`;
const MOCK_BRACE_REFERENCE = `MOCK-UP only · SWL ค้ำ/พุกยังไม่ระบุ; ${PROJECT_EXAMPLE_REFERENCES.ringlock}`;

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

function createMockProject(code: string, newId: () => string, name: string, caseName: (c: typeof MOCK_CASES[number]) => string): MockProject {
  return {id: newId(), name, code,
    cases: MOCK_CASES.map(c => {
      const input = validateInput({...c.input(), rhsB: 50, rhsH: 50, rhsT: 2.3, walerSectionId: MOCK_SECTION_WALER, studSectionId: MOCK_SECTION_STUD, cornerReference: MOCK_CONNECTION_REFERENCE});
      const footprint = {width: input.width, length: input.length, height: input.height};
      const base = {id: newId(), name: caseName(c), input, workflowElementType: c.type};
      if (c.type === 'BEAM') {
        const beam = beamFromCase(null, footprint);
        const example = c.code === 'B01'
          ? {slabSides: 2 as const, slabLeft: 600, slabRight: 600, shoreWidth: 1800, tieRows: 2, tieSpacing: 600}
          : {slabSides: 1 as const, slabLeft: 0, slabRight: 800, shoreWidth: 2000, tieRows: 3, tieSpacing: 600};
        return {...base, beam: validateBeamInput({...beam, ...example, shoreReference: MOCK_SHORING_REFERENCE})};
      }
      if (c.type === 'SLAB') {
        const slab = slabFromCase(null, footprint);
        return {...base, slab: validateSlabInput({...slab, bearerCount: c.code === 'S02' ? 2 as const : 1 as const, shoreReference: MOCK_SHORING_REFERENCE})};
      }
      if (c.type === 'WALL') {
        const wall = wallFromCase(null, footprint);
        return {...base, wall: validateWallInput({...wall, ...(c.code === 'W02' ? {system: 'SINGLE_SIDED' as const} : {}), braceReference: MOCK_BRACE_REFERENCE})};
      }
      return base;
    })};
}

/** Existing generic demo name kept for backwards-compatible imports and tests. */
export function mockProject(code: string, newId: () => string = () => globalThis.crypto.randomUUID()): MockProject {
  return createMockProject(code, newId, 'โครงการตัวอย่าง MOCK-UP · ห้ามใช้ก่อสร้าง · ฐานราก เสา ผนัง คาน พื้น', c => `${c.code} · ${c.name} · MOCK`);
}

/** Complete editable walkthrough project shown by the UI as exactly “Project Example”. */
export function projectExample(code = 'PROJECT-EXAMPLE-001', newId: () => string = () => globalThis.crypto.randomUUID()): MockProject {
  return createMockProject(code, newId, 'Project Example', c => `Project Example · ${c.code} · ${c.name} · MOCK-UP`);
}
