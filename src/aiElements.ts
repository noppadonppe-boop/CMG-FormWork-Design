import {defaults, validateInput, type Input} from './domain/index.js';
import {beamDefaults, validateBeamInput, type BeamInput} from './domain/beam.js';
import {slabDefaults, validateSlabInput, type SlabInput} from './domain/slab.js';
import {validateWallInput, wallDefaults, type WallInput} from './domain/wall.js';

export type AiKind = 'FOOTING' | 'COLUMN' | 'BEAM' | 'SLAB' | 'WALL';
export const AI_KINDS: AiKind[] = ['FOOTING', 'COLUMN', 'BEAM', 'SLAB', 'WALL'];
export const AI_KIND_LABEL: Record<AiKind, string> = {FOOTING: 'ฐานราก', COLUMN: 'เสา', BEAM: 'คาน', SLAB: 'พื้น', WALL: 'ผนัง'};
/** Field meaning per kind (values in `unit`): what width / length / height stand for. */
export const AI_FIELD_LABEL: Record<AiKind, {width: string; length: string; height: string}> = {
  FOOTING: {width: 'กว้าง', length: 'ยาว', height: 'ลึก'}, COLUMN: {width: 'กว้าง', length: 'ยาว', height: 'สูงเท'},
  BEAM: {width: 'กว้าง b', length: 'ยาวช่วง', height: 'ลึก h'}, SLAB: {width: 'ช่วง X', length: 'ช่วง Y', height: 'หนา'}, WALL: {width: 'ยาวผนัง', length: 'หนา', height: 'สูงเท'},
};

/** One concrete element read by AI from the selected drawing page. Values are in `unit`.
 * FOOTING/COLUMN: width × length plan, height = depth / pour height. BEAM: width = b, length = span, height = total depth, slabThickness = slab framing in.
 * SLAB: width × length = panel plan, height = thickness. WALL: width = wall length, length = thickness, height = pour height. */
export type AiElement = {name: string; kind: AiKind | 'UNKNOWN'; shape: 'RECTANGLE' | 'L' | 'UNKNOWN';
  width: number | null; length: number | null; height: number | null; armX: number | null; armY: number | null; slabThickness: number | null;
  unit: 'mm' | 'cm' | 'm' | 'UNKNOWN'; quantity: number | null; note: string};

const DIMENSIONS = ['width', 'length', 'height', 'armX', 'armY', 'slabThickness'] as const;
export function parseAiElements(raw: unknown): AiElement[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw) || raw.length > 100) throw Error('Invalid AI elements');
  return raw.map(item => {
    // slabThickness was added later: results saved before it mean "not read".
    const e: Record<string, unknown> | null = item && typeof item === 'object' ? {slabThickness: null, ...(item as Record<string, unknown>)} : null;
    if (!e || typeof e.name !== 'string' || e.name.length > 200 || typeof e.note !== 'string' || e.note.length > 2000 ||
      ![...AI_KINDS, 'UNKNOWN'].includes(String(e.kind)) || !['RECTANGLE', 'L', 'UNKNOWN'].includes(String(e.shape)) ||
      !['mm', 'cm', 'm', 'UNKNOWN'].includes(String(e.unit)) ||
      (e.quantity !== null && (!Number.isInteger(e.quantity) || Number(e.quantity) < 1 || Number(e.quantity) > 10000)) ||
      DIMENSIONS.some(k => e[k] !== null && (typeof e[k] !== 'number' || !Number.isFinite(e[k]) || Number(e[k]) <= 0))) throw Error('Invalid AI elements');
    return {name: e.name, kind: e.kind, shape: e.shape, unit: e.unit, quantity: e.quantity, note: e.note,
      ...Object.fromEntries(DIMENSIONS.map(k => [k, e[k]]))} as AiElement;
  });
}

const unitFactor = (e: AiElement) => e.unit === 'm' ? 1000 : e.unit === 'cm' ? 10 : e.unit === 'mm' ? 1 : null;
function missingFor(e: AiElement, kind: AiKind) {
  const labels = AI_FIELD_LABEL[kind], legacy = kind === 'FOOTING' || kind === 'COLUMN';
  return [...(unitFactor(e) ? [] : ['หน่วย']), ...(legacy && e.shape === 'UNKNOWN' ? ['รูปทรง'] : []),
    ...(['width', 'length', 'height'] as const).filter(k => e[k] === null).map(k => labels[k]),
    ...(legacy && e.shape === 'L' ? (['armX', 'armY'] as const).filter(k => e[k] === null).map(k => 'แขน ' + k.slice(3)) : [])];
}

/** Builds a draft (unconfirmed) footing/column input. Missing values are reported, never filled with guesses. */
export function elementToInput(e: AiElement, kind: 'FOOTING' | 'COLUMN' = e.kind === 'COLUMN' ? 'COLUMN' : 'FOOTING'): {input: Input | null; missing: string[]} {
  const factor = unitFactor(e), missing = missingFor(e, kind);
  if (missing.length || !factor || e.shape === 'UNKNOWN') return {input: null, missing};
  const mm = (v: number | null) => Math.round(Number(v) * factor * 10) / 10;
  const width = mm(e.width), length = mm(e.length), height = mm(e.height), span = Math.max(width, length);
  const input = validateInput({...defaults, kind, shape: e.shape, width, length, height, confirmed: false,
    armX: e.shape === 'L' ? mm(e.armX) : Math.round(width / 2), armY: e.shape === 'L' ? mm(e.armY) : Math.round(length / 2),
    studSpacing: Math.min(defaults.studSpacing, span), walerSpacing: Math.min(defaults.walerSpacing, height), tieSpacing: Math.min(defaults.tieSpacing, span)});
  return {input, missing};
}

export interface AiCase {name: string; input: Input; workflowElementType: AiKind; beam?: BeamInput; slab?: SlabInput; wall?: WallInput; notes: string[]}
/** Draft case for any of the five systems. Engineering inputs other than the read dimensions come from the module defaults
 * (editable, unconfirmed); spacings are only capped to fit the element. Throws when the dimensions are outside a module's range. */
export function elementToCase(e: AiElement, kind: AiKind): {item: AiCase | null; missing: string[]} {
  const label = AI_KIND_LABEL[kind], name = `${e.name}${e.quantity && e.quantity > 1 ? ` (×${e.quantity})` : ''} · ${label}`;
  if (kind === 'FOOTING' || kind === 'COLUMN') {
    const {input, missing} = elementToInput(e, kind);
    return {item: input ? {name, input, workflowElementType: kind, notes: []} : null, missing};
  }
  const missing = missingFor(e, kind), factor = unitFactor(e);
  if (missing.length || !factor) return {item: null, missing};
  const mm = (v: number | null) => Math.round(Number(v) * factor * 10) / 10, w = mm(e.width), l = mm(e.length), h = mm(e.height);
  const base = {name, input: {...defaults}, workflowElementType: kind};
  if (kind === 'BEAM') {
    // A slab thickness that is not stated is not guessed: the beam is drafted without a slab (full-depth sides, full γh soffit load).
    const t = e.slabThickness === null ? 0 : mm(e.slabThickness);
    const beam = validateBeamInput({...beamDefaults, b: w, length: l, h, slabSides: t > 0 ? 2 : 0, slabT: t, shoreWidth: Math.max(beamDefaults.shoreWidth, w + 600),
      joistSpacing: Math.min(beamDefaults.joistSpacing, l), shoreSpacing: Math.min(beamDefaults.shoreSpacing, l), studSpacing: Math.min(beamDefaults.studSpacing, l), tieSpacing: Math.min(beamDefaults.tieSpacing, l), confirmed: false});
    return {item: {...base, beam, notes: t > 0 ? ['ตั้งเป็นคานภายใน (พื้นสองด้าน) ต้องตรวจว่าเป็นคานขอบหรือไม่'] : ['แบบไม่ระบุความหนาพื้น จึงตั้งเป็นคานไม่มีพื้น (แบบข้างเต็มความลึก) ต้องตรวจ']}, missing: []};
  }
  if (kind === 'SLAB') {
    const slab = validateSlabInput({...slabDefaults, lx: w, ly: l, t: h, joistSpacing: Math.min(slabDefaults.joistSpacing, w), shoreSpacing: Math.min(slabDefaults.shoreSpacing, w),
      bearerSpacing: Math.min(slabDefaults.bearerSpacing, l), confirmed: false});
    return {item: {...base, slab, notes: []}, missing: []};
  }
  const wall = validateWallInput({...wallDefaults, length: w, t: l, height: h, walerSpacing: Math.min(wallDefaults.walerSpacing, h), braceHeight: Math.min(wallDefaults.braceHeight, Math.round(h * 2 / 3)),
    studSpacing: Math.min(wallDefaults.studSpacing, w), tieSpacing: Math.min(wallDefaults.tieSpacing, w), braceSpacing: Math.min(wallDefaults.braceSpacing, w), confirmed: false});
  return {item: {...base, wall, notes: ['รองรับผนังแบบสองด้าน ถ้าเป็นผนังติดดินต้องตรวจแยก']}, missing: []};
}
