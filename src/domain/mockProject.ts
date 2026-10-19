import {defaults, validateInput, type Input} from './index.js';
import {beamFromCase, validateBeamInput, type BeamInput} from './beam.js';
import {slabFromCase, validateSlabInput, type SlabInput} from './slab.js';
import {wallFromCase, validateWallInput, type WallInput} from './wall.js';
import type {ElementType} from './workflowV07/common.js';
import {fromLegacy, type WorkflowModel} from './workflowV07/model.js';
import {createStoredWorkflowDraft, type StoredWorkflowDraft} from './workflowV07/storage.js';
import {selectReference} from './workflowV07/catalogues.js';
import {selectRinglockResearch} from './workflowV07/ringlockResearch.js';
import {selectRinglockPlan} from './workflowV07/ringlockPlan.js';
import {references} from '../workflowV07References.js';

/** SYNTHETIC demonstration project: two cases for each element type. All dimensions are
 * illustrative mock-up values (mm), unconfirmed, and carry no engineering approval. Beam, slab
 * and wall inputs reuse the app's editable demo defaults; equipment SWL stays zero/unknown. */
export interface MockCase {id: string; name: string; input: Input; workflowElementType: ElementType; workflowV07?: StoredWorkflowDraft; beam?: BeamInput; slab?: SlabInput; wall?: WallInput}
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
const MOCK_V07_SOURCE = `PROJECT-EXAMPLE · ${PROJECT_EXAMPLE_REFERENCES.sections}`;
const MOCK_V07_BASIS = `PROJECT-EXAMPLE-v0.7 · ${PROJECT_EXAMPLE_REFERENCES.loads}`;
const MOCK_V07_EVIDENCE = 'MOCK-UP / REFERENCE_ONLY / ตรวจสอบกับสินค้าจริงและแบบโครงการก่อนใช้';
const MOCK_V07_SECTION_ID = 'PAP-2026-CLIP-100x50x20x3.2';
const MOCK_V07_MATERIAL_ID = 'STEEL-SS400';
const MOCK_V07_RINGLOCK_ID = 'DOKA21-301011500';
const MOCK_V07_PLYWOOD_ID = 'PLY-UPM007-18';
const MOCK_DRAFT_SAVED_AT_MS = Date.parse('2026-10-19T00:00:00+07:00');

function referenceRow(rows: Record<string, unknown>[], key: string, id: string) {
  const row = rows.find(value => value[key] === id);
  if (!row) throw Error(`Project Example reference row missing: ${key}=${id}`);
  return row;
}

function numericReference(row: Record<string, unknown>, key: string, label: string) {
  const value = row[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) throw Error(`Project Example reference value missing: ${label}`);
  return value;
}

function projectExampleCheckCatalogue() {
  return {version: '0.7', specifications: references.checks.map(row => ({
    id: String(row.check_id), group: String(row.group), description: String(row.description), appliesTo: String(row.applicable_to),
  }))};
}

/** Build a v0.7 walkthrough draft for every Project Example case.  The values are
 * deliberately labelled mock-up/reference-only; no unknown product resistance is invented. */
export function projectExampleWorkflowDraft(input: Input, elementType: ElementType, caseId: string): StoredWorkflowDraft {
  const section = referenceRow(references.sections, 'section_id', MOCK_V07_SECTION_ID);
  const material = referenceRow(references.materials, 'material_id', MOCK_V07_MATERIAL_ID);
  const ringlockComponent = referenceRow(references.ringlock, 'component_id', MOCK_V07_RINGLOCK_ID);
  const plywood = referenceRow(references.materials, 'material_id', MOCK_V07_PLYWOOD_ID);
  const memberE = numericReference((material.properties as Record<string, unknown>), 'E_MPa', 'steel E_MPa');
  numericReference(section, 'Ix_cm4', 'Ix_cm4');
  numericReference((plywood.properties as Record<string, unknown>), 'Eb0_mean_MPa', 'plywood Eb0_mean_MPa');
  const base = fromLegacy(input, caseId);
  let model: WorkflowModel = {...base, revisionId: 'PROJECT-EXAMPLE-v0.7', elementType,
    humanInputReviewed: false, sourceRef: MOCK_V07_SOURCE, designBasisRef: MOCK_V07_BASIS,
    sideTopology: elementType === 'SLAB' ? null : elementType === 'COLUMN' ? 'COLUMN_YOKE' : 'THROUGH_TIE',
    gammaKNm3: input.gamma, slabThicknessMm: elementType === 'SLAB' ? input.height : elementType === 'BEAM' ? 0 : null,
    beamWidthMm: elementType === 'BEAM' ? input.length : null, concreteStripMm: elementType === 'BEAM' ? input.length : null,
    deadStripMm: elementType === 'BEAM' ? input.length : null, liveStripMm: elementType === 'BEAM' ? input.length : null,
    additionalDeadKPa: elementType === 'BEAM' || elementType === 'SLAB' ? 0.25 : null,
    constructionLiveKPa: elementType === 'BEAM' || elementType === 'SLAB' ? 1.5 : null,
    selections: {section: selectReference(section, 'PAP-TIS107-2026'), material: selectReference(material, 'workflow-v07-materials@0.5.0'), ringlock: selectReference(ringlockComponent, 'workflow-v07-ringlock@2026')},
    checkCatalogue: projectExampleCheckCatalogue(), ringlock: null, ringlockResearch: null};

  if (elementType === 'BEAM' || elementType === 'SLAB') {
    const ringlock = selectRinglockPlan(null, '1200x1500');
    const widthX = Math.max(...model.vertices.map(point => point.x)) - Math.min(...model.vertices.map(point => point.x));
    const widthY = Math.max(...model.vertices.map(point => point.y)) - Math.min(...model.vertices.map(point => point.y));
    model = {...model, ringlock: {...ringlock, manufacturer: String(ringlockComponent.manufacturer), systemId: String(ringlockComponent.system_id),
      configurationId: 'PROJECT-EXAMPLE-GEOMETRY-ONLY', ratingId: 'UNVERIFIED-NO-RATING', liftHeightsMm: [1500], totalHeightMm: model.heightMm + 300,
      headExtensionMm: 150, baseExtensionMm: 150, headEngagementMm: 100, baseEngagementMm: 100,
      braceXRef: 'UNVERIFIED-BRACE-X', braceYRef: 'UNVERIFIED-BRACE-Y', planRestraintRef: 'UNVERIFIED-PLAN-RESTRAINT',
      topRestraintRef: 'UNVERIFIED-TOP-RESTRAINT', baseRestraintRef: 'UNVERIFIED-BASE-RESTRAINT', jointStiffnessRef: 'UNVERIFIED-JOINT',
      groundOrSlabEvidence: `${MOCK_V07_EVIDENCE} · ${PROJECT_EXAMPLE_REFERENCES.ringlock}`,
      legs: [{id: 'LEG-1', headNodeId: 'HEAD-1', xMm: 0, yMm: 0, headElevationMm: model.heightMm + 300, baseElevationMm: 0},
        {id: 'LEG-2', headNodeId: 'HEAD-2', xMm: widthX, yMm: 0, headElevationMm: model.heightMm + 300, baseElevationMm: 0},
        {id: 'LEG-3', headNodeId: 'HEAD-3', xMm: widthX, yMm: widthY, headElevationMm: model.heightMm + 300, baseElevationMm: 0},
        {id: 'LEG-4', headNodeId: 'HEAD-4', xMm: 0, yMm: widthY, headElevationMm: model.heightMm + 300, baseElevationMm: 0}]},
      ringlockResearch: selectRinglockResearch(references.ringlockResearch, references.ringlockResearchSha256,
        {groupId: 'TCB-FOOT-BASED-REFERENCE', role: 'STANDARD', sectionId: 'CHS-48.3x3.2', materialGrade: 'Q235B', useElasticReference: true,
          hypothesisRef: `${MOCK_V07_EVIDENCE} · product group and metric plan compatibility remain unverified`})};
  }
  return createStoredWorkflowDraft(model, input, MOCK_DRAFT_SAVED_AT_MS);
}

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
      const id = newId();
      const base = {id, name: caseName(c), input, workflowElementType: c.type,
        ...(name === 'Project Example' ? {workflowV07: projectExampleWorkflowDraft(input, c.type, id)} : {})};
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
