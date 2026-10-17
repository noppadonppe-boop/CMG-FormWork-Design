/** v0.7 uses mm, N, N.mm and MPa at analysis boundaries. No engineering approval. */
export type ElementType = 'FOOTING' | 'COLUMN' | 'WALL' | 'BEAM' | 'SLAB';
export type Point2 = {x: number; y: number};
export type CheckState = 'BLOCKED' | 'FAIL' | 'CHECKED_IN_SCOPE' | 'NOT_APPLICABLE';
export const WORKFLOW_VERSION = '0.7.0-preview.30';
export const NOTICE = 'DRAFT / NO_GO / NOT FOR CONSTRUCTION';

export function finite(value: unknown, name: string, allowZero = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || (allowZero ? value < 0 : value <= 0)) {
    throw Error(`${name}: explicit finite ${allowZero ? 'nonnegative' : 'positive'} number required`);
  }
  return value;
}
export function signed(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw Error(`${name}: finite number required`);
  return value;
}
export function identifier(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 300) throw Error(`${name}: nonempty id required`);
  return value;
}
export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Object required');
  return value as Record<string, unknown>;
}
export function uniqueIds(values: {id: string}[], name: string) {
  const ids = values.map(v => identifier(v.id, name));
  if (new Set(ids).size !== ids.length) throw Error(`${name}: duplicate id`);
}
export const units = {
  cm2ToMm2: (v: number) => finite(v, 'cm2') * 100,
  cm3ToMm3: (v: number) => finite(v, 'cm3') * 1000,
  cm4ToMm4: (v: number) => finite(v, 'cm4') * 10000,
  kPaToMPa: (v: number) => finite(v, 'kPa', true) / 1000,
  kNToN: (v: number) => signed(v, 'kN') * 1000,
  // Numerically 1 kN/m = 1 N/mm. Mass is never interpreted as force.
  kNPerMToNPerMm: (v: number) => signed(v, 'kN/m'),
};

/** Reject ambiguous JSON rather than hashing null-converted NaN/undefined. */
export function canonical(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    signed(value, 'canonical number');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  const obj = record(value);
  if (Object.getPrototypeOf(obj) !== Object.prototype && Object.getPrototypeOf(obj) !== null) throw Error('Plain JSON required');
  return '{' + Object.keys(obj).sort().map(k => JSON.stringify(k) + ':' + canonical(obj[k])).join(',') + '}';
}
export function clone<T>(value: T): T {return JSON.parse(canonical(value)) as T;}
export function freezeDeep<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freezeDeep);
    Object.freeze(value);
  }
  return value;
}
