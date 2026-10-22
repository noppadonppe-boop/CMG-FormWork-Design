import type {Element3D, PartGroup} from './model3d.js';

/** One editable field of a component group in the 3D view; values are written to the case input of the element. */
export type EditField =
  | {kind: 'number'; key: string; label: string; unit?: string; help?: string}
  | {kind: 'section'; key: string; label: string; role: 'stud' | 'waler'}
  | {kind: 'select'; key: string; label: string; options: [number | string | boolean, string][]}
  /** Footing/column stud + waler catalogue sections (existing SectionPicker). */
  | {kind: 'legacySection'};

const num = (key: string, label: string, unit = 'mm', help?: string): EditField => ({kind: 'number', key, label, unit, help});
const sec = (key: string, label: string, role: 'stud' | 'waler'): EditField => ({kind: 'section', key, label, role});
const count = (key: string, label: string): EditField => ({kind: 'select', key, label, options: [[1, '1 ตัว'], [2, '2 ตัวคู่']]});
const SPAN = 'ระยะ = ระยะสูงสุดที่ขอ ระบบแบ่งช่วงเท่ากัน';
/** The beam engine accepts 0–3 tie rows only. */
const TIE_ROWS: EditField = {kind: 'select', key: 'tieRows', label: 'จำนวนแถว Tie', options: [[0, 'ไม่มี Tie (ไม้กันตีน)'], [1, '1 แถว'], [2, '2 แถว'], [3, '3 แถว']]};

const LEGACY: Partial<Record<PartGroup, EditField[]>> = {
  concrete: [num('width', 'ขนาดรวม X'), num('length', 'ขนาดรวม Y'), num('height', 'ความลึก / ความสูง'), num('armX', 'แขนรูปตัว L แนวตั้ง', 'mm', 'ใช้เมื่อรูปทรงเป็นตัว L'), num('armY', 'แขนรูปตัว L แนวนอน', 'mm', 'ใช้เมื่อรูปทรงเป็นตัว L')],
  plywood: [num('plywood', 'ความหนาไม้อัด')],
  stud: [num('studSpacing', 'ระยะคร่าวสูงสุด', 'mm', SPAN), {kind: 'legacySection'}],
  waler: [num('walerSpacing', 'ช่วงพาดคร่าว (ระยะคานคู่)', 'mm', SPAN), num('pairShare', 'α คานตัวที่รับมาก', ''), {kind: 'legacySection'}],
  tie: [num('tieSpacing', 'ระยะ Tie สูงสุด', 'mm', SPAN), num('tieDiameter', 'Tie Ø'), num('tieAssemblySWL', 'SWL ชุด Tie', 'kN', '0 = ยังไม่ทราบ')],
};
const BEAM: Partial<Record<PartGroup, EditField[]>> = {
  concrete: [num('b', 'ความกว้างคาน b'), num('h', 'ความลึกคาน h (รวมพื้น)'), num('slabT', 'ความหนาพื้น'), num('length', 'ความยาวคาน'), num('soffitHeight', 'ความสูงพื้นล่างถึงท้องคาน')],
  plywood: [num('plywood', 'ความหนาไม้อัด')],
  joist: [num('joistSpacing', 'ระยะคร่าวท้อง', 'mm', SPAN), sec('joistSectionId', 'หน้าตัดคร่าวท้อง', 'stud')],
  bearer: [sec('bearerSectionId', 'หน้าตัดคานรับ', 'waler'), count('bearerCount', 'จำนวนต่อแนว'), num('shoreWidth', 'ระยะระหว่างแนวคานรับ')],
  shore: [num('shoreSpacing', 'ระยะค้ำยันตามแนวคาน', 'mm', SPAN), num('shoreWidth', 'ระยะระหว่างแนวค้ำยัน'), num('shoreSWL', 'SWL ค้ำยันที่ความยาวใช้งาน', 'kN', '0 = ยังไม่ทราบ')],
  stud: [num('studSpacing', 'ระยะคร่าวข้าง', 'mm', SPAN), sec('studSectionId', 'หน้าตัดคร่าวข้าง', 'stud')],
  waler: [sec('walerSectionId', 'หน้าตัดคานคู่', 'waler'), TIE_ROWS],
  tie: [num('tieSpacing', 'ระยะ Tie', 'mm', SPAN), num('tieDiameter', 'Tie Ø'), TIE_ROWS, num('tieSWL', 'SWL ชุด Tie', 'kN', '0 = ยังไม่ทราบ')],
  kicker: [],
};
const SLAB: Partial<Record<PartGroup, EditField[]>> = {
  concrete: [num('lx', 'ช่วงพื้น X'), num('ly', 'ช่วงพื้น Y'), num('t', 'ความหนาพื้น'), num('soffitHeight', 'ความสูงพื้นล่างถึงท้องพื้น')],
  plywood: [num('plywood', 'ความหนาไม้อัด')],
  joist: [num('joistSpacing', 'ระยะคร่าว', 'mm', SPAN), sec('joistSectionId', 'หน้าตัดคร่าว', 'stud')],
  bearer: [num('bearerSpacing', 'ระยะคานรับ', 'mm', SPAN), sec('bearerSectionId', 'หน้าตัดคานรับ', 'waler'), count('bearerCount', 'จำนวนต่อแนว')],
  shore: [num('shoreSpacing', 'ระยะค้ำยัน (แนว X)', 'mm', SPAN), num('bearerSpacing', 'ระยะแนวค้ำยัน (แนว Y)', 'mm', SPAN), num('shoreSWL', 'SWL ค้ำยัน', 'kN', '0 = ยังไม่ทราบ')],
};
const WALL: Partial<Record<PartGroup, EditField[]>> = {
  concrete: [num('length', 'ความยาวผนัง'), num('t', 'ความหนาผนัง'), num('height', 'ความสูงเทต่อครั้ง')],
  plywood: [num('plywood', 'ความหนาไม้อัด')],
  stud: [num('studSpacing', 'ระยะคร่าว', 'mm', SPAN), sec('studSectionId', 'หน้าตัดคร่าว', 'stud')],
  waler: [num('walerSpacing', 'ระยะคานคู่', 'mm', SPAN), sec('walerSectionId', 'หน้าตัดคานคู่', 'waler')],
  tie: [num('tieSpacing', 'ระยะ Tie', 'mm', SPAN), num('tieDiameter', 'Tie Ø'), num('tieSWL', 'SWL ชุด Tie', 'kN', '0 = ยังไม่ทราบ')],
  brace: [num('braceSpacing', 'ระยะค้ำยันเอียง', 'mm', SPAN), num('braceHeight', 'ความสูงจุดยึด'), num('braceAngle', 'มุมค้ำยันจากแนวราบ', '°'), num('braceSWL', 'SWL ค้ำยัน', 'kN', '0 = ยังไม่ทราบ')],
  strongback: [sec('strongbackSectionId', 'หน้าตัด Strongback', 'waler'), count('strongbackCount', 'จำนวนต่อสถานี'), num('braceSpacing', 'ระยะ Strongback / ค้ำยัน', 'mm', SPAN), num('anchorSWL', 'SWL พุกฐาน', 'kN', '0 = ยังไม่ทราบ')],
};

/** Column formwork system: external yoke only, or through ties (then the tie group appears in the model). */
const COLUMN_TIES: EditField = {kind: 'select', key: 'columnTies', label: 'ระบบยึดแบบเสา', options: [[false, 'ไม่ใช้ Tie · วงรัดภายนอก'], [true, 'ใช้ Tie ทะลุเสา + วงรัดมุม']]};
export function editFields(element: Element3D, group: PartGroup): EditField[] {
  const table = element === 'BEAM' ? BEAM : element === 'SLAB' ? SLAB : element === 'WALL' ? WALL : LEGACY;
  const fields = table[group] ?? [];
  return element === 'COLUMN' && (group === 'waler' || group === 'tie') ? [COLUMN_TIES, ...fields] : fields;
}
/** Editing a concrete dimension changes the geometry: the dimension confirmation must be given again. */
export const isGeometryEdit = (group: PartGroup) => group === 'concrete';
/** Groups that can be edited for an element, listed even when the model cannot be built (so an invalid value can be corrected). */
export function editableGroups(element: Element3D): PartGroup[] {
  const order: PartGroup[] = ['concrete', 'plywood', 'joist', 'bearer', 'shore', 'stud', 'waler', 'tie', 'brace', 'strongback'];
  return order.filter(g => editFields(element, g).length > 0);
}
