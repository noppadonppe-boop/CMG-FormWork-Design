/** One report outline and one check numbering for all five formwork systems, shared by the UI results table,
 * the A4 calculation report and the A3 check summary so a check keeps the same number everywhere. */
import type {Check} from './index.js';

/** Section headings of every A4 calculation report (numbered 1–9). */
export const REPORT_SECTIONS = ['ขอบเขตและเกณฑ์การออกแบบ', 'รูปทรงและการจัดวางแบบหล่อ', 'น้ำหนักบรรทุกและแรงดันคอนกรีตสด', 'การตรวจสอบองค์อาคาร',
  'ค้ำยัน จุดยึด และเสถียรภาพ', 'สรุปผลและคำแนะนำ', 'ปริมาณวัสดุ', 'ข้อจำกัดและรายการที่ยังขาด', 'เอกสารอ้างอิง'] as const;

/** Member checks live in section 4, bracing/restraint/stability checks in section 5. */
export interface CheckGroup {no: string; title: string; prefixes: string[]}
export interface NumberedCheck {no: string; check: Check}
export interface NumberedGroup extends CheckGroup {items: NumberedCheck[]}

export function legacyCheckGroups(kind: 'FOOTING' | 'COLUMN', columnTies: boolean): CheckGroup[] {
  return [{no: '4.1', title: 'ไม้อัด (Plywood)', prefixes: ['ply-']}, {no: '4.2', title: 'คร่าว (Stud)', prefixes: ['stud-']},
    {no: '4.3', title: 'คานคู่ (Twin waler)', prefixes: ['waler-']},
    {no: '4.4', title: kind === 'COLUMN' ? (columnTies ? 'Tie rod + ชุดรัดเสา (Column yoke)' : 'ชุดรัดเสา (Column yoke)') : 'Tie rod', prefixes: ['tie', 'column-']}, {no: '4.5', title: 'แรงกดที่จุดสัมผัส (ไม้ตั้งฉากเสี้ยน)', prefixes: ['bear-']},
    kind === 'COLUMN' ? {no: '5.1', title: 'ค้ำยันเสา (ลม ACI §4.2.3.1)', prefixes: ['brace-']} : {no: '5.1', title: 'จุดต่อมุมแบบฐานราก', prefixes: ['corner-']}];
}
export function beamCheckGroups(): CheckGroup[] {
  return [{no: '4.1', title: 'ไม้อัดท้องคาน', prefixes: ['sof-']}, {no: '4.2', title: 'คร่าวท้องคาน (ตามขวาง)', prefixes: ['joist-']},
    {no: '4.3', title: 'คานรับท้อง (ตามยาว)', prefixes: ['bearer-']}, {no: '4.4', title: 'ค้ำยัน', prefixes: ['shore-']},
    {no: '4.5', title: 'ไม้อัดแบบข้าง', prefixes: ['side-']}, {no: '4.6', title: 'คร่าวแบบข้าง (แนวตั้ง)', prefixes: ['stud-']},
    {no: '4.7', title: 'คานคู่และ Tie ทะลุคาน', prefixes: ['waler-', 'tie-']}, {no: '4.8', title: 'แรงกดที่จุดสัมผัส (ไม้ตั้งฉากเสี้ยน)', prefixes: ['bear-']},
    {no: '5.1', title: 'แรงด้านข้างของแบบท้องคาน (ACI §4.2.3.2)', prefixes: ['lateral']}, {no: '5.2', title: 'จุดยึดแบบข้าง: ไม้กันตีนและจุดยึดบน', prefixes: ['kicker', 'top']}];
}
export function slabCheckGroups(): CheckGroup[] {
  return [{no: '4.1', title: 'ไม้อัดท้องพื้น', prefixes: ['ply-']}, {no: '4.2', title: 'คร่าว (Joist)', prefixes: ['joist-']},
    {no: '4.3', title: 'คานรับ (Bearer)', prefixes: ['bearer-']}, {no: '4.4', title: 'ค้ำยัน', prefixes: ['shore-']}, {no: '4.5', title: 'แรงกดที่จุดสัมผัส (ไม้ตั้งฉากเสี้ยน)', prefixes: ['bear-']},
    {no: '5.1', title: 'แรงด้านข้าง (ACI §4.2.3.2)', prefixes: ['lateral']}];
}
export function wallCheckGroups(singleSided: boolean): CheckGroup[] {
  return [{no: '4.1', title: 'ไม้อัด', prefixes: ['ply-']}, {no: '4.2', title: 'คร่าว (แนวตั้ง)', prefixes: ['stud-']}, {no: '4.3', title: 'คานคู่ (แนวนอน)', prefixes: ['waler-']},
    singleSided ? {no: '4.4', title: 'Strongback', prefixes: ['strongback']} : {no: '4.4', title: 'Tie ทะลุผนัง', prefixes: ['tie-']}, {no: '4.5', title: 'แรงกดที่จุดสัมผัส (ไม้ตั้งฉากเสี้ยน)', prefixes: ['bear-']},
    {no: '5.1', title: 'ค้ำยันเอียง', prefixes: ['brace-']}, ...(singleSided ? [{no: '5.2', title: 'พุกฐาน strongback', prefixes: ['anchor']}] : [])];
}

/** Numbers checks as group.item (e.g. 4.3.2). A check belongs to the first group with a matching prefix; any check no
 * group claims goes to an extra group at the end of section 4, so every check always gets a number. */
export function numberChecks(groups: CheckGroup[], checks: Check[]): {groups: NumberedGroup[]; ordered: NumberedCheck[]; byId: Record<string, string>} {
  const taken = new Set<string>(), out: NumberedGroup[] = groups.map(g => {
    const items = checks.filter(c => !taken.has(c.id) && g.prefixes.some(p => c.id.startsWith(p)));
    items.forEach(c => taken.add(c.id));
    return {...g, items: items.map((check, i) => ({no: `${g.no}.${i + 1}`, check}))};
  });
  const rest = checks.filter(c => !taken.has(c.id));
  if (rest.length) {
    const last = Math.max(0, ...groups.filter(g => g.no.startsWith('4.')).map(g => Number(g.no.split('.')[1]))), no = `4.${last + 1}`;
    out.splice(out.findIndex(g => !g.no.startsWith('4.')) < 0 ? out.length : out.findIndex(g => !g.no.startsWith('4.')), 0,
      {no, title: 'รายการตรวจอื่น', prefixes: [], items: rest.map((check, i) => ({no: `${no}.${i + 1}`, check}))});
  }
  const kept = out.filter(g => g.items.length), ordered = kept.flatMap(g => g.items);
  return {groups: kept, ordered, byId: Object.fromEntries(ordered.map(i => [i.check.id, i.no]))};
}

/** Screening state of one check. Status stays FAIL or INCOMPLETE (never PASS); INCOMPLETE is split by whether a limit exists. */
export type ScreenState = 'FAIL' | 'WITHIN' | 'NO_LIMIT';
export const screenState = (c: Check): ScreenState => c.status === 'FAIL' ? 'FAIL' : c.limit === null ? 'NO_LIMIT' : 'WITHIN';
export const SCREEN_LABEL: Record<ScreenState, string> = {FAIL: 'FAIL · เกินเกณฑ์', WITHIN: 'INCOMPLETE · ไม่เกินเกณฑ์', NO_LIMIT: 'INCOMPLETE · ขาดค่ากำลัง'};
/** Short labels for the A3 check summary column. */
export const SCREEN_SHORT: Record<ScreenState, string> = {FAIL: 'FAIL', WITHIN: 'ไม่เกินเกณฑ์', NO_LIMIT: 'ขาดค่ากำลัง'};
export const SCREEN_LEGEND = 'FAIL = เกินเกณฑ์ · ไม่เกินเกณฑ์ และ ขาดค่ากำลัง = สถานะ INCOMPLETE (ยังไม่ใช่ PASS: ต้องมีข้อมูลรับรองและวิศวกรตรวจ) · เลขข้อตรงกับรายการคำนวณ A4';

/** Rows of an A3 check summary table: numbered label, demand, limit, ratio, short state. */
export function summaryRows(items: NumberedCheck[], fmt: (v: number | null) => string): string[][] {
  return items.map(({no, check: c}) => [`${no} ${c.label}`, `${fmt(c.demand)} ${c.unit}`, c.limit === null ? 'ยังไม่ทราบ' : `${fmt(c.limit)} ${c.unit}`, fmt(c.utilization), SCREEN_SHORT[screenState(c)]]);
}
