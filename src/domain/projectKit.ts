/** Project formwork kit: one plywood, one stud/joist, one waler and one bearer section plus the hardware and design criteria
 * that every Design Case of the project uses, so ordering and site work deal with a few standard items. Cases follow the kit;
 * a case that differs is reported as off-kit unless the user records a reason. Capacities (SWL) stay manufacturer data (0 = unknown). */
import {validateInput, type Input} from './index.js';
import {beamFromCase, validateBeamInput, type BeamInput} from './beam.js';
import {slabFromCase, validateSlabInput, type SlabInput} from './slab.js';
import {validateWallInput, wallFromCase, type WallInput} from './wall.js';
import {FACE_GRAINS, PLYWOOD_GRADES, type FaceGrain, type PlywoodGrade} from './plywoodGrades.js';
import {WALER_TYPE, isTimber, sectionById, timberGrade} from './sectionStock.js';
import type {ElementType} from './workflowV07/common.js';

export interface ProjectKit {
  /** Kit revision shown on reports and drawings (e.g. K1). */
  revision: string;
  plywood: number; plywoodGrade: PlywoodGrade; plywoodFaceGrain: FaceGrain; plywoodE: number; plywoodFb: number;
  /** Stud = wall/column/footing stud, beam/slab joist and beam side stud; waler = twin waler; bearer = beam/slab bearer. */
  studSectionId: string; walerSectionId: string; bearerSectionId: string; timberGrade: string;
  tieDiameter: number; tieFy: number; tieFu: number; tieSWL: number;
  shoreSWL: number; shoreReference: string; braceSWL: number; braceReference: string;
  gamma: number; liveLoad: number; deflectionRatio: number; windPressure: number;
  /** Spacings are suggested and rounded down in this step (mm). */
  spacingStep: number;
}
export const KIT_STEPS = [25, 50, 100] as const;
export const kitDefaults: ProjectKit = {
  revision: 'K1', plywood: 20, plywoodGrade: 'PLYFORM_I', plywoodFaceGrain: 'ACROSS', plywoodE: 4800, plywoodFb: 5.3,
  studSectionId: 'PAP-TIS107-SHS-50x50x2.3', walerSectionId: 'PAP-TIS107-RHS-100x50x3.2', bearerSectionId: 'PAP-TIS107-RHS-100x50x3.2', timberGrade: 'TIMBER-BOOK-SOFT',
  tieDiameter: 16, tieFy: 390, tieFu: 560, tieSWL: 0, shoreSWL: 0, shoreReference: '', braceSWL: 0, braceReference: '',
  gamma: 24, liveLoad: 2.4, deflectionRatio: 360, windPressure: 0.72, spacingStep: 50,
};
const TEXT = ['revision', 'plywoodGrade', 'plywoodFaceGrain', 'studSectionId', 'walerSectionId', 'bearerSectionId', 'timberGrade', 'shoreReference', 'braceReference'];
const NON_NEGATIVE = ['tieSWL', 'shoreSWL', 'braceSWL'];

export function validateKit(v: unknown): ProjectKit {
  if (!v || typeof v !== 'object') throw Error('ข้อมูลชุดมาตรฐานไม่ถูกต้อง');
  const q = v as Record<string, unknown>, keys = Object.keys(kitDefaults) as (keyof ProjectKit)[];
  if (Object.keys(q).some(k => !keys.includes(k as keyof ProjectKit))) throw Error('มีช่องข้อมูลชุดมาตรฐานที่ไม่รองรับ');
  for (const k of keys.filter(k => !TEXT.includes(k))) {
    const n = q[k], min = NON_NEGATIVE.includes(k) ? 0 : Number.MIN_VALUE;
    if (typeof n !== 'number' || !Number.isFinite(n) || n < min) throw Error('ค่าชุดมาตรฐานไม่ถูกต้อง: ' + k);
  }
  const x = q as unknown as ProjectKit;
  if (typeof x.revision !== 'string' || !x.revision.trim() || x.revision.length > 20) throw Error('Rev ของชุดมาตรฐานต้องมี 1–20 ตัวอักษร');
  if (!PLYWOOD_GRADES.includes(x.plywoodGrade) || !FACE_GRAINS.includes(x.plywoodFaceGrain) || x.plywood > 40 || x.plywoodE > 50000 || x.plywoodFb > 100) throw Error('ข้อมูลไม้อัดของชุดมาตรฐานไม่ถูกต้อง');
  for (const [k, role] of [['studSectionId', 'stud'], ['walerSectionId', 'waler'], ['bearerSectionId', 'waler']] as const) {
    const s = typeof x[k] === 'string' ? sectionById(x[k]) : undefined;
    if (!s || !s.roles.includes(role)) throw Error('ไม่พบหน้าตัดในตารางเหล็ก/ไม้: ' + k);
  }
  const waler = sectionById(x.walerSectionId)!;
  if (!(waler.family in WALER_TYPE)) throw Error('คานคู่ของชุดมาตรฐานต้องเป็นหน้าตัดคานคู่ในตาราง');
  if (typeof x.timberGrade !== 'string' || !timberGrade(x.timberGrade)) throw Error('ชั้นไม้ไม่ถูกต้อง');
  if (x.tieDiameter > 50 || x.tieFy > 1000 || x.tieFu < x.tieFy || x.tieFu > 2000) throw Error('ข้อมูล Tie ของชุดมาตรฐานไม่ถูกต้อง');
  if ([x.shoreReference, x.braceReference].some(s => typeof s !== 'string' || s.length > 300)) throw Error('เอกสารอ้างอิงยาวเกินไป');
  if (x.gamma > 40 || x.liveLoad > 20 || x.deflectionRatio < 100 || x.deflectionRatio > 2000) throw Error('เกณฑ์ออกแบบของชุดมาตรฐานอยู่นอกขอบเขต');
  if (x.windPressure < 0.72 || x.windPressure > 10) throw Error('แรงลมออกแบบต้องไม่น้อยกว่า 0.72 kPa (ACI §4.2.3.1)');
  if (!(KIT_STEPS as readonly number[]).includes(x.spacingStep)) throw Error('ขั้นระยะต้องเป็น 25, 50 หรือ 100 mm');
  return Object.fromEntries(keys.map(k => [k, x[k]])) as unknown as ProjectKit;
}
/** Stored kit, or undefined when absent or unreadable (the project then has no kit). */
export function parseKit(raw: unknown): ProjectKit | undefined {
  if (raw == null) return undefined;
  try {return validateKit(raw);} catch {return undefined;}
}

/** Labels of the kit groups, in display order. */
export const KIT_GROUP_LABEL = {plywood: 'ไม้อัด', stud: 'คร่าว', waler: 'คานคู่', bearer: 'คานรับ', timber: 'ชั้นไม้', tie: 'Tie', shore: 'ค้ำยัน', brace: 'ค้ำยันเอียง', criteria: 'เกณฑ์ออกแบบ'} as const;
type KitGroup = keyof typeof KIT_GROUP_LABEL;
type Field = [key: string, value: unknown, group: KitGroup];

const plywoodFields = (k: ProjectKit): Field[] => [['plywood', k.plywood, 'plywood'], ['plywoodGrade', k.plywoodGrade, 'plywood'], ['plywoodFaceGrain', k.plywoodFaceGrain, 'plywood'],
  ...(k.plywoodGrade === 'CUSTOM' ? [['plywoodE', k.plywoodE, 'plywood'], ['plywoodFb', k.plywoodFb, 'plywood']] as Field[] : [])];
const tieGrade = (k: ProjectKit) => k.tieFy === 390 && k.tieFu === 560 ? 'SD40' : k.tieFy === 235 && k.tieFu === 385 ? 'SR24' : 'CUSTOM';

/** Input fields the kit sets for one element type. */
function kitFields(kind: ElementType, k: ProjectKit): Field[] {
  const tie: Field[] = [['tieDiameter', k.tieDiameter, 'tie'], ['tieFy', k.tieFy, 'tie'], ['tieFu', k.tieFu, 'tie'], ['tieSWL', k.tieSWL, 'tie']];
  const shore: Field[] = [['shoreSWL', k.shoreSWL, 'shore'], ['shoreReference', k.shoreReference, 'shore']];
  const brace: Field[] = [['braceSWL', k.braceSWL, 'brace'], ['braceReference', k.braceReference, 'brace']];
  const soffit: Field[] = [['gamma', k.gamma, 'criteria'], ['liveLoad', k.liveLoad, 'criteria'], ['deflectionRatio', k.deflectionRatio, 'criteria']];
  if (kind === 'SLAB') return [...plywoodFields(k), ['joistSectionId', k.studSectionId, 'stud'], ['bearerSectionId', k.bearerSectionId, 'bearer'], ['timberGrade', k.timberGrade, 'timber'], ...shore, ...soffit];
  if (kind === 'BEAM') return [...plywoodFields(k), ['joistSectionId', k.studSectionId, 'stud'], ['studSectionId', k.studSectionId, 'stud'], ['bearerSectionId', k.bearerSectionId, 'bearer'],
    ['walerSectionId', k.walerSectionId, 'waler'], ['timberGrade', k.timberGrade, 'timber'], ...tie, ...shore, ...soffit];
  if (kind === 'WALL') return [...plywoodFields(k), ['studSectionId', k.studSectionId, 'stud'], ['walerSectionId', k.walerSectionId, 'waler'], ['timberGrade', k.timberGrade, 'timber'],
    ...tie, ...brace, ['gamma', k.gamma, 'criteria'], ['deflectionRatio', k.deflectionRatio, 'criteria'], ['windPressure', k.windPressure, 'criteria']];
  // Footing / column: catalogue ids carry their dimensions (the legacy engine checks them against the catalogue).
  const stud = sectionById(k.studSectionId)!, waler = sectionById(k.walerSectionId)!;
  return [...plywoodFields(k), ['studSectionId', k.studSectionId, 'stud'], ['rhsB', stud.B, 'stud'], ['rhsH', stud.H, 'stud'], ...(isTimber(stud) ? [] : [['rhsT', stud.t, 'stud']] as Field[]),
    ['walerSectionId', k.walerSectionId, 'waler'], ['walerType', WALER_TYPE[waler.family as keyof typeof WALER_TYPE], 'waler'], ['walerB', waler.B, 'waler'], ['walerH', waler.H, 'waler'], ['walerT', waler.t, 'waler'],
    ['studTimberGrade', k.timberGrade, 'timber'], ['tieDiameter', k.tieDiameter, 'tie'], ['tieGrade', tieGrade(k), 'tie'], ['tieFy', k.tieFy, 'tie'], ['tieFu', k.tieFu, 'tie'], ['tieAssemblySWL', k.tieSWL, 'tie'],
    ...(kind === 'COLUMN' ? brace : []), ['gamma', k.gamma, 'criteria'], ['deflectionRatio', k.deflectionRatio, 'criteria'], ['windPressure', k.windPressure, 'criteria']];
}

/** Kit groups in which the case differs from the kit (empty = on kit). */
export function kitDiff(kind: ElementType, input: Record<string, unknown>, k: ProjectKit): string[] {
  const groups = new Set<KitGroup>();
  for (const [key, value, group] of kitFields(kind, k)) if (input[key] !== value) groups.add(group);
  return (Object.keys(KIT_GROUP_LABEL) as KitGroup[]).filter(g => groups.has(g)).map(g => KIT_GROUP_LABEL[g]);
}

/** The case input with every kit field applied and validated by its own engine (throws when the kit does not fit the case). */
export function applyKit(kind: 'FOOTING' | 'COLUMN', input: Input, k: ProjectKit): Input;
export function applyKit(kind: 'BEAM', input: BeamInput, k: ProjectKit): BeamInput;
export function applyKit(kind: 'SLAB', input: SlabInput, k: ProjectKit): SlabInput;
export function applyKit(kind: 'WALL', input: WallInput, k: ProjectKit): WallInput;
export function applyKit(kind: ElementType, input: Input | BeamInput | SlabInput | WallInput, k: ProjectKit) {
  const next = {...input, ...Object.fromEntries(kitFields(kind, k).map(([key, value]) => [key, value]))};
  if (kind === 'BEAM') return validateBeamInput(next);
  if (kind === 'SLAB') return validateSlabInput(next);
  if (kind === 'WALL') return validateWallInput(next);
  return validateInput(next);
}

/** Kit seeded from one case so a project can start from the values already in use. */
export function kitFromCase(kind: ElementType, input: Record<string, unknown>): ProjectKit {
  const pick = <K extends keyof ProjectKit>(key: K, ...from: string[]) => {for (const f of from) if (input[f] !== undefined) return input[f] as ProjectKit[K]; return kitDefaults[key];};
  const k: ProjectKit = {...kitDefaults,
    plywood: pick('plywood', 'plywood'), plywoodGrade: pick('plywoodGrade', 'plywoodGrade'), plywoodFaceGrain: pick('plywoodFaceGrain', 'plywoodFaceGrain'),
    plywoodE: pick('plywoodE', 'plywoodE'), plywoodFb: pick('plywoodFb', 'plywoodFb'),
    studSectionId: pick('studSectionId', kind === 'SLAB' || kind === 'BEAM' ? 'joistSectionId' : 'studSectionId'), walerSectionId: pick('walerSectionId', 'walerSectionId'),
    bearerSectionId: pick('bearerSectionId', 'bearerSectionId'), timberGrade: pick('timberGrade', 'timberGrade', 'studTimberGrade'),
    tieDiameter: pick('tieDiameter', 'tieDiameter'), tieFy: pick('tieFy', 'tieFy'), tieFu: pick('tieFu', 'tieFu'), tieSWL: pick('tieSWL', 'tieSWL', 'tieAssemblySWL'),
    shoreSWL: pick('shoreSWL', 'shoreSWL'), shoreReference: pick('shoreReference', 'shoreReference'), braceSWL: pick('braceSWL', 'braceSWL'), braceReference: pick('braceReference', 'braceReference'),
    gamma: pick('gamma', 'gamma'), liveLoad: pick('liveLoad', 'liveLoad'), deflectionRatio: pick('deflectionRatio', 'deflectionRatio'), windPressure: pick('windPressure', 'windPressure')};
  // Legacy cases without a catalogue id fall back to the default kit sections.
  for (const key of ['studSectionId', 'walerSectionId', 'bearerSectionId'] as const) if (!k[key] || !sectionById(k[key])) k[key] = kitDefaults[key];
  try {return validateKit(k);} catch {return {...kitDefaults};}
}

/** Kit status of one case: no kit, on kit, an approved exception (reason given) or off kit. */
export type KitStatus = {state: 'NONE'} | {state: 'ON'; revision: string} | {state: 'EXCEPTION' | 'OFF'; revision: string; diff: string[]; reason: string};
export function kitStatus(kind: ElementType, input: Record<string, unknown>, kit: ProjectKit | undefined, reason = ''): KitStatus {
  if (!kit) return {state: 'NONE'};
  const diff = kitDiff(kind, input, kit);
  if (!diff.length) return {state: 'ON', revision: kit.revision};
  return {state: reason.trim() ? 'EXCEPTION' : 'OFF', revision: kit.revision, diff, reason: reason.trim()};
}
/** One-line note for reports and drawings. */
export function kitNote(s: KitStatus): string | null {
  if (s.state === 'NONE') return null;
  if (s.state === 'ON') return `ชุดมาตรฐาน ${s.revision} · ตรงชุด`;
  return `ชุดมาตรฐาน ${s.revision} · ${s.state === 'EXCEPTION' ? 'ข้อยกเว้น' : 'นอกชุด'}: ${s.diff.join(', ')}${s.reason ? ` (${s.reason})` : ''}`;
}

/** A stored Design Case as far as the kit is concerned. */
export interface KitCase {input: Input; workflowElementType?: ElementType; beam?: BeamInput; slab?: SlabInput; wall?: WallInput; kitException?: string}
const caseKind = (z: KitCase): ElementType => z.workflowElementType ?? z.input.kind;
const footprint = (z: KitCase) => ({width: z.input.width, length: z.input.length, height: z.input.height});
/** The inputs the case is calculated with (practical systems fall back to the draft seeded from the case footprint). */
export function caseKitInput(z: KitCase): Record<string, unknown> {
  const kind = caseKind(z);
  if (kind === 'BEAM') return {...(z.beam ?? beamFromCase(null, footprint(z)))};
  if (kind === 'SLAB') return {...(z.slab ?? slabFromCase(null, footprint(z)))};
  if (kind === 'WALL') return {...(z.wall ?? wallFromCase(null, footprint(z)))};
  return {...z.input};
}
export const caseKitStatus = (z: KitCase, kit: ProjectKit | undefined) => kitStatus(caseKind(z), caseKitInput(z), kit, z.kitException ?? '');
/** Case with the kit applied (exception reason cleared), or the unchanged case and the reason the kit does not fit. */
export function applyKitToCase<T extends KitCase>(z: T, kit: ProjectKit): {value: T; error: string | null} {
  const kind = caseKind(z);
  try {
    const {kitException: _reason, ...rest} = z; void _reason;
    if (kind === 'BEAM') return {value: {...rest, beam: applyKit('BEAM', caseKitInput(z) as unknown as BeamInput, kit)} as T, error: null};
    if (kind === 'SLAB') return {value: {...rest, slab: applyKit('SLAB', caseKitInput(z) as unknown as SlabInput, kit)} as T, error: null};
    if (kind === 'WALL') return {value: {...rest, wall: applyKit('WALL', caseKitInput(z) as unknown as WallInput, kit)} as T, error: null};
    return {value: {...rest, input: applyKit(kind, z.input, kit)} as T, error: null};
  } catch (e) {return {value: z, error: (e as Error).message};}
}

/** Input keys the kit owns for one element type (hidden in simple mode). */
export const kitFieldKeys = (kind: ElementType): string[] => kitFields(kind, kitDefaults).map(([key]) => key);
/** One-line summary of the kit for pages and reports. */
export function kitSummary(k: ProjectKit): string {
  const s = (id: string) => sectionById(id)?.designation ?? id;
  return [`ไม้อัด ${k.plywood} mm ${k.plywoodGrade === 'CUSTOM' ? 'CUSTOM' : k.plywoodGrade.replace('_', ' ')}`, `คร่าว ${s(k.studSectionId)}`, `คานคู่ 2×${s(k.walerSectionId)}`, `คานรับ ${s(k.bearerSectionId)}`,
    `Tie Ø${k.tieDiameter}${k.tieSWL ? ` SWL ${k.tieSWL} kN` : ''}`, `ค้ำยัน SWL ${k.shoreSWL || '—'} kN`, `ขั้นระยะ ${k.spacingStep} mm`].join(' · ');
}
