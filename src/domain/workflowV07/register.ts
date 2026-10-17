import type {ElementType} from './common.js';

/** Outstanding-information register: groups the engine's blocker codes by the formwork
 * component they belong to, so each wizard step can show what is still missing. Grouping
 * is presentational only; it never removes, merges or re-words a blocker. */
export const REGISTER_GROUPS = ['GEOMETRY', 'SOFFIT', 'SIDE', 'SHORING', 'SUPPORT', 'CASES', 'REVIEW', 'GENERAL'] as const;
export type RegisterGroup = typeof REGISTER_GROUPS[number];
export const REGISTER_GROUP_LABEL: Record<RegisterGroup, string> = {
  GEOMETRY: 'รูปทรง แรงดัน และโหลด', SOFFIT: 'แบบท้อง · ไม้อัด / คร่าว / คานรับ', SIDE: 'แบบข้าง · ไม้อัด / คร่าว / คานรัด / ไทร์ / มุม',
  SHORING: 'Shoring / Ringlock / เฟรม / ค้ำยัน / เสถียรภาพ', SUPPORT: 'ฐานรองรับ / พื้นดิน', CASES: 'กรณีโหลด / Stage', REVIEW: 'หลักฐาน การตรวจ และการอนุมัติ', GENERAL: 'ทั่วไป'};

const RULES: [RegisterGroup, RegExp][] = [
  ['CASES', /LOAD_CASE|STAGE|COMBINATION|CASE_FACTOR|ACTION_BASIS|IMPOSED_MOVEMENT/],
  ['SUPPORT', /SUPPORT_LAYOUT|BASE_(JACK|PLATE|DATUM|REACTION)|GROUND|BEARING_(SOIL|SLAB)|FOUNDATION|SETTLEMENT/],
  ['SHORING', /FRAME|RINGLOCK|ASSEMBLY|SECOND_ORDER|STABILITY|BRACE|BRACING|ANCHOR|LEDGER|STANDARD|SPIGOT|U_HEAD|HEAD_JACK|TUBE|LATERAL/],
  ['SIDE', /SIDE|TIE|PLYWOOD_STRIP|STUD|RAIL|WALER|CORNER|PRESSURE|HYDROSTATIC|FACE|COUPLED|YOKE|CLAMP/],
  ['SOFFIT', /SOFFIT|JOIST|BEARER|PLYWOOD|DECK|LOAD_PATH|VERTICAL/],
  ['REVIEW', /EVIDENCE|REVIEW|RESISTANCE|COVERAGE|REPRESENTATIVE|REFERENCE_ONLY|METHOD|CONSTRUCTION|RELEASE|CONTRACT|SCREEN|CERTIF|VENDOR|APPROV|NO_GO|CATALOG/],
  ['GEOMETRY', /GEOMETRY|VERTEX|VERTICES|POLYGON|HEIGHT|GAMMA|DIMENSION|SOURCE_REF|DESIGN_BASIS|HUMAN_INPUT|TOPOLOGY|THICKNESS|WIDTH|STRIP_MM|UNKNOWN_(SLAB|BEAM)/],
];
/** Blocker codes often carry an entity prefix such as `F1/W1/S1:` or `STAGE-2:`; classify the code itself. */
const codeOf = (blocker: string) => blocker.split(':').pop() ?? blocker;

export function classifyBlocker(blocker: string): RegisterGroup {
  const code = codeOf(blocker).toUpperCase();
  for (const [group, pattern] of RULES) if (pattern.test(code)) return group;
  return 'GENERAL';
}
export interface RegisterRow {group: RegisterGroup; blocker: string}
export function outstandingRegister(blockers: string[]) {
  const rows: RegisterRow[] = [...new Set(blockers)].map(blocker => ({group: classifyBlocker(blocker), blocker}));
  const counts = Object.fromEntries(REGISTER_GROUPS.map(g => [g, rows.filter(r => r.group === g).length])) as Record<RegisterGroup, number>;
  return {rows, counts, total: rows.length};
}
/** Wizard steps follow the load path of each formwork system (docs/OBJECTIVES.md). */
export type WizardStep = 'GEOMETRY' | 'SOFFIT' | 'SIDE' | 'SHORING' | 'SUPPORT' | 'CASES' | 'REVIEW';
export const WIZARD_STEP_LABEL: Record<WizardStep, string> = {
  GEOMETRY: '1 · รูปทรง แรงดัน โหลด', SOFFIT: 'แบบท้อง', SIDE: 'แบบข้าง', SHORING: 'Shoring / เฟรม / ค้ำยัน', SUPPORT: 'ฐานรองรับ', CASES: 'กรณีโหลด / Stage', REVIEW: 'ตรวจ · รายงาน'};
export function wizardSteps(elementType: ElementType): WizardStep[] {
  switch (elementType) {
    case 'SLAB': return ['GEOMETRY', 'SOFFIT', 'SHORING', 'SUPPORT', 'CASES', 'REVIEW'];
    case 'BEAM': return ['GEOMETRY', 'SOFFIT', 'SIDE', 'SHORING', 'SUPPORT', 'CASES', 'REVIEW'];
    default: return ['GEOMETRY', 'SIDE', 'SHORING', 'SUPPORT', 'CASES', 'REVIEW'];
  }
}
/** Which register groups a step is responsible for (GENERAL/REVIEW are shown on the review step). */
export const STEP_GROUPS: Record<WizardStep, RegisterGroup[]> = {
  GEOMETRY: ['GEOMETRY'], SOFFIT: ['SOFFIT'], SIDE: ['SIDE'], SHORING: ['SHORING'], SUPPORT: ['SUPPORT'], CASES: ['CASES'], REVIEW: ['REVIEW', 'GENERAL']};
