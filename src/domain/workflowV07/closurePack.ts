import {canonical, clone, finite, record, signed} from './common.js';
import {effectiveTieProduct, validateTieDossier, type TieDossier} from './tieDossier.js';
import type {TieRole} from './assemblies.js';

/**
 * Closure Pack v1 is a handoff data contract.  It is deliberately kept beside
 * the v0.7 domain model: loading a reference record must not turn it into a
 * project rating or an approval record.
 */
export const CLOSURE_SCHEMA_VERSION = 'closure-v1' as const;
export const CLOSURE_TIE_SLOTS = ['INNER_UNIT', 'THREAD_END_LEFT', 'THREAD_END_RIGHT', 'OUTER_LEFT', 'OUTER_RIGHT',
  'END_CONNECTION_LEFT', 'END_CONNECTION_RIGHT', 'NUT_LEFT', 'NUT_RIGHT', 'PLATE_LEFT', 'PLATE_RIGHT',
  'WALER_LOCAL_LEFT', 'WALER_LOCAL_RIGHT'] as const;
export type ClosureTieSlot = typeof CLOSURE_TIE_SLOTS[number];
export const CLOSURE_TIE_ROLE_ALIASES = Object.freeze({BEARING_PLATE_LEFT: 'PLATE_LEFT', BEARING_PLATE_RIGHT: 'PLATE_RIGHT'} as const);
export const CLOSURE_TIE_TEMPLATE_IDS = ['SEGMENTED_INNER_B', 'SEGMENTED_INNER_C', 'SEGMENTED_INNER_BC', 'SEGMENTED_INNER_D',
  'CONTINUOUS_THROUGH_ROD', 'CUSTOM_ENGINEERED'] as const;
export type ClosureTieTemplateId = typeof CLOSURE_TIE_TEMPLATE_IDS[number];
export type SupportedClosureTieTemplateId = typeof CLOSURE_TIE_TEMPLATE_IDS[0] | typeof CLOSURE_TIE_TEMPLATE_IDS[1] |
  typeof CLOSURE_TIE_TEMPLATE_IDS[2] | typeof CLOSURE_TIE_TEMPLATE_IDS[3];
export type ClosureDemandBasis = 'WORKING' | 'FACTORED_DESIGN';
export type ClosureResistanceBasis = 'ALLOWABLE' | 'DESIGN_RESISTANCE';

export interface ClosureAnalysisContext {
  projectId: string | null; revisionId: string | null; designSnapshotHash: string | null;
  activeStageId: string | null; capturedStageId: string | null; loadCaseId: string | null;
}
export type ClosureDraftContext = {
  projectId: string; revisionId: string; designSnapshotHash: string;
  activeStageId: string; capturedStageId: string; loadCaseId: string;
};

export interface ClosureTieReference {record_id: string; scope: 'SEPARATOR_ONLY'; automatic_design_use: false;
  source_id: string; breaking_load_kN: number | null; allowable_tensile_load_kN: number | null; [key: string]: unknown}
export interface ClosureTieTemplate {template_id: ClosureTieTemplateId; [key: string]: unknown}
export interface ClosureFormTieBridge {
  schema_version: typeof CLOSURE_SCHEMA_VERSION; library_id: string; baseline_version: string; as_of: string;
  data_role: 'REFERENCE_NOT_PROJECT_APPROVAL'; records: ClosureTieReference[]; record_count: 11;
  templates: ClosureTieTemplate[]; check_slots: ClosureTieSlot[];
  role_aliases: {BEARING_PLATE_LEFT: 'PLATE_LEFT'; BEARING_PLATE_RIGHT: 'PLATE_RIGHT'};
  slot_semantics: string; assembly_constraints: Record<string, unknown>; selection: Record<string, unknown>;
  confirmed: false; constructionRelease: 'NO_GO'; legacy_source_id_aliases: Record<string, string>;
}

export interface ClosureTieCheck {
  slot: ClosureTieSlot; product_id: string | null; reference_record_id: string | null;
  capacity_kN: number | null; capacity_basis: ClosureResistanceBasis | null;
  capacity_scope: 'EQUIVALENT_AXIAL_TIE_LIMIT'; evidence_ref: string | null;
  actual_engagement_mm: number | null; required_engagement_mm: number | null;
}
export interface ClosureTieDraft {
  schema_version: typeof CLOSURE_SCHEMA_VERSION; kind: 'TIE_ASSEMBLY_DRAFT'; origin: 'USER_DRAFT' | 'SYNTHETIC_EXAMPLE';
  context: ClosureDraftContext; template_id: SupportedClosureTieTemplateId;
  demand: {axial_kN: number | null; basis: ClosureDemandBasis | null; reaction_ref: string | null; symmetry_and_alignment_evidence_ref: string | null};
  checks: ClosureTieCheck[]; actual_assembly_compatibility_evidence_ref: string | null;
  confirmed: false; constructionRelease: 'NO_GO';
}

export interface ClosureRinglockRecord {
  manufacturer: string; system_ref: string; source_id: string; source_pdf_page: number; source_edition: string;
  rating_scope: 'COMPONENT_REFERENCE_NOT_COMPLETE_SHORING_CONFIGURATION'; source_basis_text: string;
  source_gamma_M: number; source_gamma_F: number; basis_mapping_status: 'ENGINEER_CONFIRMATION_REQUIRED';
  automatic_design_use: false; interpolation_allowed: false; extrapolation_allowed: false;
  rating_id: string; kind: 'STANDARD' | 'BRACE' | 'JOINT'; selector: Record<string, string | number>;
  limits: Record<string, string | number>; conditions: string[]; [key: string]: unknown;
}
export interface ClosureRinglockSidecar {
  schema_version: typeof CLOSURE_SCHEMA_VERSION; sidecar_id: string; records: ClosureRinglockRecord[]; count: 17;
  material_identity_reference: Record<string, unknown>; full_configuration_capacity: null; head_base_capacity: null;
  connection_stiffness: null; preserve_existing_ringlock_json: true; confirmed: false; constructionRelease: 'NO_GO';
}

export type ClosureInputFormType = 'ringlock_configuration' | 'support_soil' | 'support_slab' | 'serviceability' | 'stage_release';
export interface ClosureEvidenceReview {
  engineerId: string | null; evidenceRef: string | null; acceptedSnapshotHash: string | null;
  acceptedStageId: string | null; acceptedLoadCaseId: string | null; trustedVerificationStatus: 'NOT_VERIFIED';
}
export interface ClosureProjectInputTemplate {
  schema_version: typeof CLOSURE_SCHEMA_VERSION; form_type: ClosureInputFormType; context: ClosureAnalysisContext;
  inputs: Record<string, unknown>; review: ClosureEvidenceReview; confirmed: false; constructionRelease: 'NO_GO';
}

function text(value: unknown, label: string, allowEmpty = false): string {
  if (typeof value !== 'string' || (!allowEmpty && !value.trim())) throw Error(`${label}: nonempty string required`);
  return value;
}
function exactKeys(value: Record<string, unknown>, keys: readonly string[], label: string) {
  const actual = Object.keys(value).sort(), expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, i) => key !== expected[i])) throw Error(`${label}: unknown or missing fields`);
}
function positiveOrNull(value: unknown, label: string) {
  if (value !== null) finite(value, label);
}
function sameKeys(a: Record<string, unknown>, b: Record<string, unknown>) {
  const ak = Object.keys(a).sort(), bk = Object.keys(b).sort();
  return ak.length === bk.length && ak.every((key, index) => key === bk[index] && a[key] === b[key]);
}

export function canonicalClosureTieSlot(slot: unknown): ClosureTieSlot {
  if (typeof slot !== 'string') throw Error('Unsupported tie check slot');
  const canonicalSlot = Object.hasOwn(CLOSURE_TIE_ROLE_ALIASES, slot)
    ? CLOSURE_TIE_ROLE_ALIASES[slot as keyof typeof CLOSURE_TIE_ROLE_ALIASES] : slot;
  if (!(CLOSURE_TIE_SLOTS as readonly string[]).includes(canonicalSlot)) throw Error(`Unsupported tie check slot: ${slot}`);
  return canonicalSlot as ClosureTieSlot;
}

export function normalizeClosureFormTieBridge(raw: unknown): ClosureFormTieBridge {
  const r = record(raw);
  exactKeys(r, ['schema_version', 'library_id', 'baseline_version', 'as_of', 'data_role', 'records', 'record_count', 'templates',
    'check_slots', 'role_aliases', 'slot_semantics', 'assembly_constraints', 'selection', 'confirmed', 'constructionRelease', 'legacy_source_id_aliases'], 'Form Tie bridge');
  if (r.schema_version !== CLOSURE_SCHEMA_VERSION || r.data_role !== 'REFERENCE_NOT_PROJECT_APPROVAL' || r.confirmed !== false || r.constructionRelease !== 'NO_GO') throw Error('Form Tie bridge release gate/schema mismatch');
  text(r.library_id, 'Form Tie library'); text(r.baseline_version, 'Form Tie baseline'); text(r.as_of, 'Form Tie as-of');
  if (r.record_count !== 11 || !Array.isArray(r.records) || r.records.length !== 11) throw Error('Form Tie bridge requires exactly 11 records');
  if (!Array.isArray(r.check_slots) || r.check_slots.length !== CLOSURE_TIE_SLOTS.length || r.check_slots.some((slot, i) => slot !== CLOSURE_TIE_SLOTS[i])) throw Error('Form Tie bridge check slots are not the canonical 13');
  const aliases = record(r.role_aliases); exactKeys(aliases, ['BEARING_PLATE_LEFT', 'BEARING_PLATE_RIGHT'], 'Form Tie aliases');
  if (aliases.BEARING_PLATE_LEFT !== 'PLATE_LEFT' || aliases.BEARING_PLATE_RIGHT !== 'PLATE_RIGHT') throw Error('Unsupported Form Tie plate alias');
  if (!Array.isArray(r.templates) || r.templates.length !== CLOSURE_TIE_TEMPLATE_IDS.length) throw Error('Form Tie bridge requires six templates');
  const templateIds = r.templates.map(value => text(record(value).template_id, 'Form Tie template id'));
  if (new Set(templateIds).size !== CLOSURE_TIE_TEMPLATE_IDS.length || CLOSURE_TIE_TEMPLATE_IDS.some(id => !templateIds.includes(id))) throw Error('Form Tie template inventory mismatch');
  for (const rawRecord of r.records) {
    const row = record(rawRecord);
    for (const key of ['record_id', 'source_id', 'scope'] as const) text(row[key], `Form Tie ${key}`);
    if (row.scope !== 'SEPARATOR_ONLY' || row.automatic_design_use !== false) throw Error('Form Tie records must remain separator-only reference data');
    positiveOrNull(row.breaking_load_kN, 'Form Tie breaking load'); positiveOrNull(row.allowable_tensile_load_kN, 'Form Tie allowable load');
  }
  const constraints = record(r.assembly_constraints);
  if (constraints.certified_complete_assembly_capacity_kN !== null || constraints.min_engagement_mm !== null || constraints.never_use_breaking_load_as_allowable !== true) throw Error('Form Tie bridge contains an unsafe default or inferred capacity');
  return clone(raw as ClosureFormTieBridge);
}

export function supportedClosureTieTemplate(templateId: unknown): templateId is SupportedClosureTieTemplateId {
  return typeof templateId === 'string' && (CLOSURE_TIE_TEMPLATE_IDS.slice(0, 4) as readonly string[]).includes(templateId);
}

export function createClosureTieDraft(library: ClosureFormTieBridge, context: ClosureDraftContext, templateId: ClosureTieTemplateId, origin: ClosureTieDraft['origin'] = 'USER_DRAFT'): ClosureTieDraft {
  normalizeClosureFormTieBridge(library);
  if (!supportedClosureTieTemplate(templateId)) throw Error('UNSUPPORTED_TEMPLATE: only segmented Inner B/C/BC/D has a numerical draft helper');
  const checks = CLOSURE_TIE_SLOTS.map(slot => ({slot, product_id: null, reference_record_id: null, capacity_kN: null, capacity_basis: null,
    capacity_scope: 'EQUIVALENT_AXIAL_TIE_LIMIT' as const, evidence_ref: null, actual_engagement_mm: null, required_engagement_mm: null}));
  return {schema_version: CLOSURE_SCHEMA_VERSION, kind: 'TIE_ASSEMBLY_DRAFT', origin, context: clone(context), template_id: templateId,
    demand: {axial_kN: null, basis: null, reaction_ref: null, symmetry_and_alignment_evidence_ref: null}, checks,
    actual_assembly_compatibility_evidence_ref: null, confirmed: false, constructionRelease: 'NO_GO'};
}

export function closureContextIssues(context: ClosureAnalysisContext | null | undefined): string[] {
  if (!context) return ['CONTEXT_REQUIRED'];
  const issues: string[] = [];
  for (const key of ['projectId', 'revisionId', 'designSnapshotHash', 'activeStageId', 'capturedStageId', 'loadCaseId'] as const) if (!context[key]?.trim()) issues.push(`CONTEXT_MISSING:${key}`);
  if (context.designSnapshotHash?.trim() && !/^[a-f0-9]{64}$/i.test(context.designSnapshotHash)) issues.push('CONTEXT_HASH_FORMAT');
  if (context.activeStageId && context.capturedStageId && context.activeStageId !== context.capturedStageId) issues.push('CAPTURED_STAGE_NOT_ACTIVE');
  return issues;
}

export function screenClosureTieAssembly(library: ClosureFormTieBridge, draft: ClosureTieDraft) {
  normalizeClosureFormTieBridge(library);
  const issues = [...closureContextIssues(draft.context)];
  if (draft.confirmed !== false || draft.constructionRelease !== 'NO_GO') issues.push('CLIENT_APPROVAL_CLAIM_REJECTED');
  if (!supportedClosureTieTemplate(draft.template_id)) issues.push('UNSUPPORTED_TEMPLATE');
  if (!Array.isArray(draft.checks) || draft.checks.length !== CLOSURE_TIE_SLOTS.length) issues.push('MISSING_OR_EXTRA_CHECK_SLOTS');
  const slots = new Set<string>(), capacities: number[] = [];
  const demand = draft.demand;
  const wanted: ClosureResistanceBasis | null = demand?.basis === 'WORKING' ? 'ALLOWABLE' : demand?.basis === 'FACTORED_DESIGN' ? 'DESIGN_RESISTANCE' : null;
  if (!wanted) issues.push('DEMAND_BASIS_REQUIRED');
  if (typeof demand?.axial_kN !== 'number' || !Number.isFinite(demand.axial_kN) || demand.axial_kN < 0) issues.push('DEMAND_FINITE_NONNEGATIVE_REQUIRED');
  if (!demand?.reaction_ref?.trim()) issues.push('ACTUAL_REACTION_REFERENCE_REQUIRED');
  if (!demand?.symmetry_and_alignment_evidence_ref?.trim()) issues.push('SYMMETRY_ALIGNMENT_EVIDENCE_REQUIRED');
  if (!draft.actual_assembly_compatibility_evidence_ref?.trim()) issues.push('ASSEMBLY_COMPATIBILITY_EVIDENCE_REQUIRED');
  for (const check of Array.isArray(draft.checks) ? draft.checks : []) {
    let slot: ClosureTieSlot;
    try {slot = canonicalClosureTieSlot(check.slot);} catch {issues.push('UNKNOWN_CHECK_SLOT'); continue;}
    if (slots.has(slot)) issues.push(`DUPLICATE_CHECK:${slot}`); slots.add(slot);
    if (!check.product_id?.trim() || !check.evidence_ref?.trim()) issues.push(`PRODUCT_OR_EVIDENCE_MISSING:${slot}`);
    if (check.capacity_kN === null || typeof check.capacity_kN !== 'number' || !Number.isFinite(check.capacity_kN) || check.capacity_kN <= 0) issues.push(`CAPACITY_MISSING_OR_INVALID:${slot}`);
    else capacities.push(check.capacity_kN);
    if (!wanted || check.capacity_basis !== wanted) issues.push(`CAPACITY_BASIS_MISMATCH:${slot}`);
    if (check.capacity_scope !== 'EQUIVALENT_AXIAL_TIE_LIMIT') issues.push(`NOT_NORMALIZED_TO_TIE_FORCE:${slot}`);
    if (check.reference_record_id !== null) {
      const ref = library.records.find(row => row.record_id === check.reference_record_id);
      if (!ref) issues.push(`UNKNOWN_REFERENCE:${slot}`);
      else if (slot !== 'INNER_UNIT') issues.push(`SEPARATOR_REFERENCE_CANNOT_RATE_OTHER_PART:${slot}`);
      if (ref?.scope !== 'SEPARATOR_ONLY' || ref?.automatic_design_use !== false) issues.push(`REFERENCE_SCOPE_INVALID:${slot}`);
    }
    if (slot.startsWith('THREAD_END_')) {
      if (check.actual_engagement_mm === null || typeof check.actual_engagement_mm !== 'number' || !Number.isFinite(check.actual_engagement_mm) || check.actual_engagement_mm <= 0 ||
          check.required_engagement_mm === null || typeof check.required_engagement_mm !== 'number' || !Number.isFinite(check.required_engagement_mm) || check.required_engagement_mm <= 0) issues.push(`ENGAGEMENT_UNKNOWN:${slot}`);
      else if (check.actual_engagement_mm < check.required_engagement_mm) issues.push(`ENGAGEMENT_INSUFFICIENT:${slot}`);
    }
  }
  for (const slot of CLOSURE_TIE_SLOTS) if (!slots.has(slot)) issues.push(`CHECK_MISSING:${slot}`);
  if (issues.length) return {status: 'BLOCKED_DATA' as const, issues: [...new Set(issues)], assemblyCapacity_kN: null, utilization: null, engineeringEvidenceVerified: false as const, confirmed: false as const, constructionRelease: 'NO_GO' as const};
  const assemblyCapacity_kN = Math.min(...capacities), utilization = (demand.axial_kN as number) / assemblyCapacity_kN;
  return {status: utilization <= 1 ? 'NUMERIC_WITHIN_SUPPLIED_LIMITS' as const : 'NUMERIC_EXCEEDS_SUPPLIED_LIMITS' as const, issues: [], assemblyCapacity_kN, utilization,
    engineeringEvidenceVerified: false as const, scope: 'INPUT_COMPLETENESS_AND_ARITHMETIC_ONLY; EVIDENCE_STRINGS_ARE_NOT_TRUSTED_VERIFICATION', confirmed: false as const, constructionRelease: 'NO_GO' as const};
}

const CURRENT_TIE_ROLE_TO_CLOSURE_SLOT: Record<TieRole, ClosureTieSlot> = {
  INNER: 'INNER_UNIT', OUTER_LEFT: 'OUTER_LEFT', OUTER_RIGHT: 'OUTER_RIGHT', END_LEFT: 'END_CONNECTION_LEFT', END_RIGHT: 'END_CONNECTION_RIGHT',
  THREAD_LEFT: 'THREAD_END_LEFT', THREAD_RIGHT: 'THREAD_END_RIGHT', NUT_LEFT: 'NUT_LEFT', NUT_RIGHT: 'NUT_RIGHT',
  PLATE_LEFT: 'PLATE_LEFT', PLATE_RIGHT: 'PLATE_RIGHT', WALER_LOCAL_LEFT: 'WALER_LOCAL_LEFT', WALER_LOCAL_RIGHT: 'WALER_LOCAL_RIGHT',
};

/**
 * Map the actual v0.7 TieDossier into the closure draft contract.  Only values
 * explicitly present in the dossier are copied.  Product references are not
 * guessed from a product name or thread designation, and a dossier capacity
 * never becomes an approved closure reference.
 */
export function closureDraftFromTieDossier(library: ClosureFormTieBridge, dossier: TieDossier, context: ClosureDraftContext,
  templateId: ClosureTieTemplateId, demand: ClosureTieDraft['demand'], origin: ClosureTieDraft['origin'] = 'USER_DRAFT') {
  validateTieDossier(dossier);
  const draft = createClosureTieDraft(library, context, templateId, origin);
  draft.demand = clone(demand);
  draft.actual_assembly_compatibility_evidence_ref = dossier.compatibilityEvidenceRef.trim() || null;
  for (const component of dossier.components) {
    const slot = CURRENT_TIE_ROLE_TO_CLOSURE_SLOT[component.role];
    const check = draft.checks.find(row => row.slot === slot)!;
    const product = effectiveTieProduct(component);
    check.product_id = product.productId.trim() || null;
    check.capacity_kN = product.properties.capacityKN;
    check.capacity_basis = product.capacityBasis === 'ALLOWABLE' ? 'ALLOWABLE' : product.capacityBasis === 'DESIGN' ? 'DESIGN_RESISTANCE' : null;
    check.evidence_ref = product.sourceRef.trim() || null;
  }
  for (const thread of dossier.threads) {
    const slot = thread.side === 'LEFT' ? 'THREAD_END_LEFT' : thread.side === 'RIGHT' ? 'THREAD_END_RIGHT' : null;
    if (!slot) continue;
    const check = draft.checks.find(row => row.slot === slot)!;
    check.actual_engagement_mm = thread.actualEngagementMm;
    check.required_engagement_mm = thread.requiredEngagementMm;
  }
  return draft;
}

export function normalizeClosureRinglockSidecar(raw: unknown): ClosureRinglockSidecar {
  const r = record(raw);
  exactKeys(r, ['schema_version', 'sidecar_id', 'records', 'count', 'material_identity_reference', 'full_configuration_capacity', 'head_base_capacity', 'connection_stiffness', 'preserve_existing_ringlock_json', 'confirmed', 'constructionRelease'], 'Ringlock sidecar');
  if (r.schema_version !== CLOSURE_SCHEMA_VERSION || r.confirmed !== false || r.constructionRelease !== 'NO_GO' || r.preserve_existing_ringlock_json !== true) throw Error('Ringlock sidecar release gate/schema mismatch');
  text(r.sidecar_id, 'Ringlock sidecar id');
  if (r.count !== 17 || !Array.isArray(r.records) || r.records.length !== 17) throw Error('Ringlock sidecar requires exactly 17 records');
  if (r.full_configuration_capacity !== null || r.head_base_capacity !== null || r.connection_stiffness !== null) throw Error('Ringlock sidecar cannot contain complete configuration defaults');
  for (const row of r.records) {
    const v = record(row); text(v.rating_id, 'Ringlock rating id'); text(v.system_ref, 'Ringlock system'); text(v.kind, 'Ringlock kind');
    if (v.automatic_design_use !== false || v.interpolation_allowed !== false || v.extrapolation_allowed !== false || v.rating_scope !== 'COMPONENT_REFERENCE_NOT_COMPLETE_SHORING_CONFIGURATION' || v.basis_mapping_status !== 'ENGINEER_CONFIRMATION_REQUIRED') throw Error('Ringlock sidecar contains an unsafe rating flag');
    const selector = record(v.selector), limits = record(v.limits); if (!Object.keys(selector).length || !Object.keys(limits).length) throw Error('Ringlock exact reference selector/limit required');
    for (const value of Object.values(selector)) if (typeof value !== 'string' && (typeof value !== 'number' || !Number.isFinite(value))) throw Error('Ringlock selector must be a finite exact key');
  }
  return clone(raw as ClosureRinglockSidecar);
}

export interface ClosureRinglockLookup {system_ref: string; kind: ClosureRinglockRecord['kind']; selector: Record<string, string | number>}
export function lookupClosureRinglockReference(sidecar: ClosureRinglockSidecar, query: ClosureRinglockLookup) {
  normalizeClosureRinglockSidecar(sidecar);
  const matches = sidecar.records.filter(row => row.system_ref === query.system_ref && row.kind === query.kind && sameKeys(row.selector, query.selector));
  if (matches.length !== 1) return {status: 'BLOCKED_NO_UNIQUE_EXACT_REFERENCE' as const, record: null, engineeringEvidenceVerified: false as const, confirmed: false as const, constructionRelease: 'NO_GO' as const};
  return {status: 'REFERENCE_ONLY_NOT_CONFIGURATION_RATING' as const, record: clone(matches[0]), engineeringEvidenceVerified: false as const, confirmed: false as const, constructionRelease: 'NO_GO' as const};
}

export function parseClosureInputTemplate(raw: unknown): ClosureProjectInputTemplate {
  const r = record(raw); exactKeys(r, ['schema_version', 'form_type', 'context', 'inputs', 'review', 'confirmed', 'constructionRelease'], 'Closure input template');
  if (r.schema_version !== CLOSURE_SCHEMA_VERSION || !['ringlock_configuration', 'support_soil', 'support_slab', 'serviceability', 'stage_release'].includes(String(r.form_type)) || r.confirmed !== false || r.constructionRelease !== 'NO_GO') throw Error('Closure input template release gate/schema mismatch');
  const context = record(r.context); exactKeys(context, ['projectId', 'revisionId', 'designSnapshotHash', 'activeStageId', 'capturedStageId', 'loadCaseId'], 'Closure input context');
  for (const key of ['projectId', 'revisionId', 'designSnapshotHash', 'activeStageId', 'capturedStageId', 'loadCaseId']) if (context[key] !== null && typeof context[key] !== 'string') throw Error(`Closure input context ${key} must be string or null`);
  const review = record(r.review); exactKeys(review, ['engineerId', 'evidenceRef', 'acceptedSnapshotHash', 'acceptedStageId', 'acceptedLoadCaseId', 'trustedVerificationStatus'], 'Closure evidence review');
  if (review.trustedVerificationStatus !== 'NOT_VERIFIED') throw Error('Closure input cannot claim trusted verification');
  if (!r.inputs || typeof r.inputs !== 'object' || Array.isArray(r.inputs)) throw Error('Closure input fields must be an object');
  return clone(raw as ClosureProjectInputTemplate);
}

export function closurePackInventory(formTie: ClosureFormTieBridge, ringlock: ClosureRinglockSidecar) {
  normalizeClosureFormTieBridge(formTie); normalizeClosureRinglockSidecar(ringlock);
  return {schemaVersion: CLOSURE_SCHEMA_VERSION, formTieRecordCount: formTie.records.length, formTieTemplateCount: formTie.templates.length,
    formTieCheckSlotCount: formTie.check_slots.length, ringlockReferenceCount: ringlock.records.length, confirmed: false as const, constructionRelease: 'NO_GO' as const};
}

/** Compile-time use of signed/canonical helpers keeps the adapter on the same numeric rules as v0.7. */
export function closureSignedDatum(value: unknown, label = 'closure datum') {return signed(value, label);}
export function closureCanonical(value: unknown) {return canonical(value);}
