import {defaults, validateInput, type Input} from './domain/index.js';

/** One concrete element (footing/column) read by AI from the selected drawing page. Values are in `unit`. */
export type AiElement = {name: string; kind: 'FOOTING' | 'COLUMN' | 'UNKNOWN'; shape: 'RECTANGLE' | 'L' | 'UNKNOWN';
  width: number | null; length: number | null; height: number | null; armX: number | null; armY: number | null;
  unit: 'mm' | 'cm' | 'm' | 'UNKNOWN'; quantity: number | null; note: string};

const DIMENSIONS = ['width', 'length', 'height', 'armX', 'armY'] as const;
export function parseAiElements(raw: unknown): AiElement[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw) || raw.length > 100) throw Error('Invalid AI elements');
  return raw.map(item => {
    const e = item as Record<string, unknown>;
    if (!e || typeof e.name !== 'string' || e.name.length > 200 || typeof e.note !== 'string' || e.note.length > 2000 ||
      !['FOOTING', 'COLUMN', 'UNKNOWN'].includes(String(e.kind)) || !['RECTANGLE', 'L', 'UNKNOWN'].includes(String(e.shape)) ||
      !['mm', 'cm', 'm', 'UNKNOWN'].includes(String(e.unit)) ||
      (e.quantity !== null && (!Number.isInteger(e.quantity) || Number(e.quantity) < 1 || Number(e.quantity) > 10000)) ||
      DIMENSIONS.some(k => e[k] !== null && (typeof e[k] !== 'number' || !Number.isFinite(e[k]) || Number(e[k]) <= 0))) throw Error('Invalid AI elements');
    return {name: e.name, kind: e.kind, shape: e.shape, unit: e.unit, quantity: e.quantity, note: e.note,
      ...Object.fromEntries(DIMENSIONS.map(k => [k, e[k]]))} as AiElement;
  });
}

/** Builds a draft (unconfirmed) case input. Missing values are reported, never filled with guesses. */
export function elementToInput(e: AiElement, kind: 'FOOTING' | 'COLUMN' = e.kind === 'COLUMN' ? 'COLUMN' : 'FOOTING'): {input: Input | null; missing: string[]} {
  const factor = e.unit === 'm' ? 1000 : e.unit === 'cm' ? 10 : e.unit === 'mm' ? 1 : null;
  const missing = [...(factor ? [] : ['หน่วย']), ...(e.shape === 'UNKNOWN' ? ['รูปทรง'] : []),
    ...(['width', 'length', 'height'] as const).filter(k => e[k] === null).map(k => ({width: 'กว้าง', length: 'ยาว', height: 'สูง/ลึก'})[k]),
    ...(e.shape === 'L' ? (['armX', 'armY'] as const).filter(k => e[k] === null).map(k => 'แขน ' + k.slice(3)) : [])];
  if (missing.length || !factor || e.shape === 'UNKNOWN') return {input: null, missing};
  const mm = (v: number | null) => Math.round(Number(v) * factor * 10) / 10;
  const width = mm(e.width), length = mm(e.length), height = mm(e.height), span = Math.max(width, length);
  const input = validateInput({...defaults, kind, shape: e.shape, width, length, height, confirmed: false,
    armX: e.shape === 'L' ? mm(e.armX) : Math.round(width / 2), armY: e.shape === 'L' ? mm(e.armY) : Math.round(length / 2),
    studSpacing: Math.min(defaults.studSpacing, span), walerSpacing: Math.min(defaults.walerSpacing, height), tieSpacing: Math.min(defaults.tieSpacing, span)});
  return {input, missing};
}
