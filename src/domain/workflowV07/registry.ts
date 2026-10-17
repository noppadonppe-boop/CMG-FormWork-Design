import {canonical, finite, record} from './common.js';
import {BEAM_MEMBER_EVIDENCE_SCHEMA, BEAM_MEMBER_QUANTITIES, type BeamMemberEvidence, type BeamMemberQuantity} from './beamResistance.js';
import {SIDE_COUPLED_LIMIT_KINDS, SIDE_LOCAL_CHECK_KINDS, SIDE_LOCAL_EVIDENCE_SCHEMA, sideLocalUnit, type SideLocalCheckKind, type SideLocalEvidence} from './sideLocalChecks.js';
import {RESISTANCE_EVIDENCE_SCHEMA, RESISTANCE_QUANTITIES, type ResistanceEvidence, type ResistanceQuantity} from './resistanceEvidence.js';

/** Reviewed method and product/material registry.
 *
 * Entries carry reviewer-entered limits with their source, revision and scope. Nothing here is
 * derived by the software: an entry without a reviewer-entered limit cannot produce a limit, a
 * DRAFT entry only produces REFERENCE_ONLY evidence, and a REVIEWED entry produces
 * ENGINEER_REVIEWED evidence that the check modules still screen (never PASS).
 */
export const REGISTRY_SCHEMA = 'formwork-registry-1' as const;
export const CATALOG_KINDS = ['PLYWOOD', 'STEEL_SECTION', 'TIE', 'CORNER_HARDWARE', 'SHORING', 'BRACE', 'OTHER'] as const;
export type CatalogKind = typeof CATALOG_KINDS[number];
export const REGISTRY_STATUSES = ['DRAFT', 'REVIEWED', 'RETIRED'] as const;
export type RegistryStatus = typeof REGISTRY_STATUSES[number];
export const CATALOG_KIND_LABEL: Record<CatalogKind, string> = {
  PLYWOOD: 'ไม้อัดแบบหล่อ', STEEL_SECTION: 'หน้าตัดเหล็ก (คร่าว/คานรัด/คานรับ)', TIE: 'ไทร์และอุปกรณ์ปลาย', CORNER_HARDWARE: 'อุปกรณ์มุม/clamp',
  SHORING: 'Shoring / Ringlock / U-head / ฐาน', BRACE: 'ค้ำยัน (เช่น ท่อ 34 มม.)', OTHER: 'อื่นๆ'};
export const LIMIT_CHECKS = [...BEAM_MEMBER_QUANTITIES, ...SIDE_LOCAL_CHECK_KINDS, ...SIDE_COUPLED_LIMIT_KINDS, ...RESISTANCE_QUANTITIES] as const;
export type LimitCheck = typeof LIMIT_CHECKS[number];
export type LimitUnit = 'N' | 'NMM' | 'MM';
export const limitUnit = (check: LimitCheck): LimitUnit => {
  if (check === 'FLEXURE' || check === 'MOMENT_Y' || check === 'MOMENT_Z' || check === 'TORSION') return 'NMM';
  if (check === 'DEFLECTION') return 'MM';
  if ((SIDE_LOCAL_CHECK_KINDS as readonly string[]).includes(check) || (SIDE_COUPLED_LIMIT_KINDS as readonly string[]).includes(check)) return sideLocalUnit(check as SideLocalCheckKind);
  return 'N';
};

export interface RegistryReview {status: RegistryStatus; reviewedBy: string; reviewedAtMs: number | null; note: string}
export interface RegistryMethod {
  schemaVersion: typeof REGISTRY_SCHEMA; id: string; name: string; sourceRef: string; sourceRevision: string; scope: string;
  limitBasis: 'ALLOWABLE' | 'DESIGN' | 'SLS_LIMIT'; review: RegistryReview; updatedAtMs: number;
}
export interface RegistryLimit {
  check: LimitCheck; unit: LimitUnit; value: number | null; actionBasis: 'SERVICE' | 'FACTORED'; limitBasis: 'ALLOWABLE' | 'DESIGN' | 'SLS_LIMIT';
  /** Largest unsupported/unbraced length the limit covers (mm); null when not applicable. */
  maximumSpanMm: number | null; methodId: string; scopeNote: string;
}
export interface RegistryEntry {
  schemaVersion: typeof REGISTRY_SCHEMA; id: string; kind: CatalogKind; name: string; productRef: string;
  /** Reference properties copied from the source (dimensions, E, I, …); never used to derive limits. */
  properties: Record<string, number | string | null>;
  limits: RegistryLimit[]; sourceRef: string; sourceRevision: string; evidenceRef: string; scopeEvidenceRef: string;
  review: RegistryReview; updatedAtMs: number;
}
export interface Registry {methods: RegistryMethod[]; entries: RegistryEntry[]}
export const emptyRegistry = (): Registry => ({methods: [], entries: []});
export const emptyReview = (): RegistryReview => ({status: 'DRAFT', reviewedBy: '', reviewedAtMs: null, note: ''});
export const emptyLimit = (check: LimitCheck, methodId = ''): RegistryLimit => ({check, unit: limitUnit(check), value: null, actionBasis: 'SERVICE',
  limitBasis: check === 'DEFLECTION' || check === 'CORNER_OPENING' ? 'SLS_LIMIT' : 'ALLOWABLE', maximumSpanMm: null, methodId, scopeNote: ''});
export const emptyEntry = (id: string, kind: CatalogKind, now = Date.now()): RegistryEntry => ({schemaVersion: REGISTRY_SCHEMA, id, kind, name: '', productRef: '', properties: {}, limits: [],
  sourceRef: '', sourceRevision: '', evidenceRef: '', scopeEvidenceRef: '', review: emptyReview(), updatedAtMs: now});
export const emptyMethod = (id: string, now = Date.now()): RegistryMethod => ({schemaVersion: REGISTRY_SCHEMA, id, name: '', sourceRef: '', sourceRevision: '', scope: '', limitBasis: 'ALLOWABLE', review: emptyReview(), updatedAtMs: now});

function text(v: unknown, label: string, max = 2000) {if (typeof v !== 'string' || v.length > max) throw Error(`Invalid registry ${label}`);}
function exact(raw: unknown, keys: string[], label: string) {
  const r = record(raw);
  if (keys.some(k => !Object.hasOwn(r, k)) || Object.keys(r).some(k => !keys.includes(k))) throw Error(`${label}: unknown/missing fields or authority metadata`);
  return r;
}
function validateReview(raw: unknown) {
  const r = exact(raw, Object.keys(emptyReview()), 'registry review') as unknown as RegistryReview;
  if (!REGISTRY_STATUSES.includes(r.status)) throw Error('Invalid registry status');
  text(r.reviewedBy, 'reviewer', 300); text(r.note, 'review note');
  if (r.reviewedAtMs !== null) finite(r.reviewedAtMs, 'review time', true);
  if (r.status === 'REVIEWED' && (!r.reviewedBy.trim() || r.reviewedAtMs === null)) throw Error('REVIEWED requires reviewer identity and time');
}
export function validateRegistryMethod(raw: unknown): asserts raw is RegistryMethod {
  const m = exact(raw, Object.keys(emptyMethod('x')), 'registry method') as unknown as RegistryMethod;
  if (m.schemaVersion !== REGISTRY_SCHEMA) throw Error('Invalid registry method schema');
  text(m.id, 'method id', 120); if (!m.id.trim()) throw Error('Method id required');
  for (const k of ['name', 'sourceRef', 'sourceRevision', 'scope'] as const) text(m[k], k);
  if (!['ALLOWABLE', 'DESIGN', 'SLS_LIMIT'].includes(m.limitBasis)) throw Error('Invalid method limit basis');
  validateReview(m.review); finite(m.updatedAtMs, 'method update time', true);
  if (m.review.status === 'REVIEWED' && [m.name, m.sourceRef, m.sourceRevision, m.scope].some(v => !v.trim())) throw Error('REVIEWED method requires name, source, revision and scope');
}
export function validateRegistryEntry(raw: unknown): asserts raw is RegistryEntry {
  const e = exact(raw, Object.keys(emptyEntry('x', 'OTHER')), 'registry entry') as unknown as RegistryEntry;
  if (e.schemaVersion !== REGISTRY_SCHEMA || !CATALOG_KINDS.includes(e.kind)) throw Error('Invalid registry entry schema/kind');
  text(e.id, 'entry id', 120); if (!e.id.trim()) throw Error('Entry id required');
  for (const k of ['name', 'productRef', 'sourceRef', 'sourceRevision', 'evidenceRef', 'scopeEvidenceRef'] as const) text(e[k], k);
  const props = record(e.properties);
  if (Object.keys(props).length > 100) throw Error('Too many registry properties');
  for (const [k, v] of Object.entries(props)) {text(k, 'property name', 100); if (v !== null && typeof v !== 'string' && (typeof v !== 'number' || !Number.isFinite(v))) throw Error(`Invalid property ${k}`); if (typeof v === 'string') text(v, k, 500);}
  if (!Array.isArray(e.limits) || e.limits.length > LIMIT_CHECKS.length) throw Error('At most one limit per check');
  for (const l of e.limits) {
    const r = exact(l, Object.keys(emptyLimit('FLEXURE')), 'registry limit') as unknown as RegistryLimit;
    if (!LIMIT_CHECKS.includes(r.check) || r.unit !== limitUnit(r.check) || !['SERVICE', 'FACTORED'].includes(r.actionBasis) || !['ALLOWABLE', 'DESIGN', 'SLS_LIMIT'].includes(r.limitBasis)) throw Error(`Invalid registry limit ${String(r.check)}`);
    if (r.value !== null) finite(r.value, `${r.check} limit`, true);
    if (r.maximumSpanMm !== null) finite(r.maximumSpanMm, `${r.check} span`);
    text(r.methodId, 'limit method id', 120); text(r.scopeNote, 'limit scope note');
  }
  if (new Set(e.limits.map(l => l.check)).size !== e.limits.length) throw Error('Duplicate registry limit check');
  validateReview(e.review); finite(e.updatedAtMs, 'entry update time', true);
  if (e.review.status === 'REVIEWED') {
    if ([e.name, e.sourceRef, e.sourceRevision, e.evidenceRef].some(v => !v.trim())) throw Error('REVIEWED entry requires name, source, revision and evidence');
    for (const l of e.limits) if (l.value === null || !l.methodId.trim()) throw Error(`REVIEWED entry limit ${l.check} requires a value and method id`);
    if (e.limits.length && !e.scopeEvidenceRef.trim() && e.limits.some(l => !l.scopeNote.trim())) throw Error('REVIEWED limits require a scope statement (entry scope or per-limit note)');
  }
  if (canonical(e).length > 200000) throw Error('Registry entry 200000-character limit');
}
export function validateRegistry(raw: unknown): asserts raw is Registry {
  const r = exact(raw, ['methods', 'entries'], 'registry');
  if (!Array.isArray(r.methods) || !Array.isArray(r.entries) || r.methods.length > 500 || r.entries.length > 2000) throw Error('Registry list limits');
  r.methods.forEach(validateRegistryMethod); r.entries.forEach(validateRegistryEntry);
  for (const list of [r.methods as RegistryMethod[], r.entries as RegistryEntry[]]) if (new Set(list.map(x => x.id)).size !== list.length) throw Error('Duplicate registry id');
}

/** Stable reference written into every evidence record produced from an entry. */
export const registryEvidenceRef = (entry: RegistryEntry) => `registry:${entry.id}@${entry.updatedAtMs}`;
const reviewRef = (entry: RegistryEntry, method: RegistryMethod | null) =>
  entry.review.status === 'REVIEWED' && entry.review.reviewedAtMs !== null && method?.review.status === 'REVIEWED'
    ? `${entry.review.reviewedBy} · ${new Date(entry.review.reviewedAtMs).toISOString().slice(0, 10)} · method ${method.id}` : '';
const status = (entry: RegistryEntry, method: RegistryMethod | null) => entry.review.status === 'REVIEWED' && method?.review.status === 'REVIEWED' ? 'ENGINEER_REVIEWED' as const : 'REFERENCE_ONLY' as const;
function limitFor(entry: RegistryEntry, check: LimitCheck) {
  const limit = entry.limits.find(l => l.check === check);
  if (!limit) throw Error(`${entry.id}: no reviewed limit for ${check}`);
  return limit;
}
const methodOf = (registry: Registry, id: string) => registry.methods.find(m => m.id === id) ?? null;

/** Beam/stud/rail member evidence bound to the current member reference. Both the entry and its
 * method must be REVIEWED for ENGINEER_REVIEWED status; otherwise the record stays REFERENCE_ONLY. */
export function beamEvidenceFromRegistry(registry: Registry, entry: RegistryEntry, quantity: BeamMemberQuantity, memberEvidenceRef: string): BeamMemberEvidence {
  validateRegistryEntry(entry);
  const l = limitFor(entry, quantity), method = methodOf(registry, l.methodId);
  return {schemaVersion: BEAM_MEMBER_EVIDENCE_SCHEMA, quantity, unit: l.unit, limit: l.value, actionBasis: l.actionBasis, limitBasis: l.limitBasis, memberEvidenceRef,
    scopeEvidenceRef: [entry.scopeEvidenceRef, l.scopeNote].filter(Boolean).join(' · '), maximumUnsupportedSpanMm: l.maximumSpanMm, methodId: l.methodId,
    sourceRef: entry.sourceRef, sourceRevision: entry.sourceRevision, evidenceRef: registryEvidenceRef(entry), reviewRef: reviewRef(entry, method), status: status(entry, method)};
}
export function sideLocalEvidenceFromRegistry(registry: Registry, entry: RegistryEntry, kind: SideLocalCheckKind, memberEvidenceRef: string): SideLocalEvidence {
  validateRegistryEntry(entry);
  const l = limitFor(entry, kind), method = methodOf(registry, l.methodId);
  return {schemaVersion: SIDE_LOCAL_EVIDENCE_SCHEMA, kind, unit: sideLocalUnit(kind), limit: l.value, actionBasis: l.actionBasis, limitBasis: l.limitBasis, memberEvidenceRef,
    scopeEvidenceRef: [entry.scopeEvidenceRef, l.scopeNote].filter(Boolean).join(' · '), maximumUnbracedLengthMm: l.maximumSpanMm, methodId: l.methodId,
    sourceRef: entry.sourceRef, sourceRevision: entry.sourceRevision, evidenceRef: registryEvidenceRef(entry), reviewRef: reviewRef(entry, method), status: status(entry, method)};
}
export function resistanceEvidenceFromRegistry(registry: Registry, entry: RegistryEntry, quantity: ResistanceQuantity): ResistanceEvidence {
  validateRegistryEntry(entry);
  const l = limitFor(entry, quantity), method = methodOf(registry, l.methodId);
  if (l.limitBasis === 'SLS_LIMIT') throw Error(`${entry.id}: resistance evidence cannot use an SLS limit`);
  return {schemaVersion: RESISTANCE_EVIDENCE_SCHEMA, quantity, unit: l.unit as 'N' | 'NMM', capacity: l.value, actionBasis: l.actionBasis, resistanceBasis: l.limitBasis,
    methodId: l.methodId, sourceRef: entry.sourceRef, sourceRevision: entry.sourceRevision, evidenceRef: registryEvidenceRef(entry), reviewRef: reviewRef(entry, method), status: status(entry, method)};
}
/** Entries offering a given check; DRAFT/RETIRED entries are listed but flagged so the picker can show why they stay REFERENCE_ONLY. */
export function entriesForCheck(registry: Registry, check: LimitCheck, kinds?: readonly CatalogKind[]) {
  return registry.entries.filter(e => (!kinds || kinds.includes(e.kind)) && e.limits.some(l => l.check === check)).map(e => {
    const method = methodOf(registry, e.limits.find(l => l.check === check)!.methodId);
    return {entry: e, reviewed: status(e, method) === 'ENGINEER_REVIEWED', methodKnown: method !== null};
  });
}
/** Starting registry: published-source references only, all DRAFT, no limits. The reviewer
 * must enter limits and mark each item REVIEWED; the 34 mm brace is an explicit unknown. */
export function seedRegistry(now = 0): Registry {
  const apa = 'APA Concrete Forming Design/Construction Guide, Form V345 (2012) Tables 12–13';
  const plywood = (id: string, name: string, props: Record<string, number | string | null>): RegistryEntry => ({...emptyEntry(id, 'PLYWOOD', now), name, productRef: 'APA grade (generic, not a manufacturer certificate)',
    properties: props, sourceRef: apa, sourceRevision: '2012', evidenceRef: '', scopeEvidenceRef: 'Dry-use published values; wet/field adjustments and manufacturer certificate not yet reviewed'});
  return {
    methods: [{...emptyMethod('APA-V345-PLYWOOD', now), name: 'APA Plyform strip bending/rolling-shear/deflection (per 1 m strip)', sourceRef: apa, sourceRevision: '2012',
      scope: 'Uniform pressure on 1, 2 or 3+ equal spans; allowable stresses on effective section; reviewer must state span and face-grain direction', limitBasis: 'ALLOWABLE'}],
    entries: [
      plywood('APA-PLYFORM-I', 'APA Plyform Class I', {E_MPa: 11376, Ee_MPa: 10342, Fb_MPa: 13.31, Fs_MPa: 0.50, note: 'Table 13 psi converted; limits per thickness/direction must be entered by reviewer'}),
      plywood('APA-PLYFORM-II', 'APA Plyform Class II', {E_MPa: 9860, Ee_MPa: 8963, Fb_MPa: 9.17, Fs_MPa: 0.50, note: 'Table 13 psi converted; limits per thickness/direction must be entered by reviewer'}),
      plywood('APA-STRUCT-I', 'APA Structural I Plyform', {E_MPa: 11376, Ee_MPa: 10342, Fb_MPa: 13.31, Fs_MPa: 0.70, note: 'Table 13 psi converted; limits per thickness/direction must be entered by reviewer'}),
      {...emptyEntry('BRACE-34MM-UNKNOWN', 'BRACE', now), name: 'ค้ำยันเหล็ก 34 มม. (ชนิด ความหนา ความยาว จุดยึด ยังไม่ทราบ)', productRef: 'UNKNOWN',
        properties: {outsideDiameterMm: 34, wallThicknessMm: null, lengthMm: null, endCondition: null}, scopeEvidenceRef: 'ต้องระบุชนิดท่อ/เหล็กตัน ความหนา ความยาว และจุดยึดก่อนกรอกขีดจำกัด'},
    ],
  };
}
/** Review transition: the reviewer is the signed-in user; the software never fills this in. */
export function markReviewed<T extends {review: RegistryReview; updatedAtMs: number}>(item: T, reviewedBy: string, now = Date.now(), note = ''): T {
  if (!reviewedBy.trim()) throw Error('Reviewer identity required');
  return {...item, review: {status: 'REVIEWED', reviewedBy: reviewedBy.trim(), reviewedAtMs: now, note}, updatedAtMs: now};
}
export function markDraft<T extends {review: RegistryReview; updatedAtMs: number}>(item: T, now = Date.now(), note = ''): T {
  return {...item, review: {status: 'DRAFT', reviewedBy: '', reviewedAtMs: null, note}, updatedAtMs: now};
}
