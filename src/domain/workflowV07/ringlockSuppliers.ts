import {canonical, clone, finite, identifier, record, uniqueIds} from './common.js';

export const SUPPLIER_SOURCE_SHA256 = '0b57c7c48f4bd85092cdab76a46de115115e23ccb0c89372c005da6217e042a2';
export type SupplierRow = {id: string; [key: string]: unknown};
export type SupplierCollection = 'suppliers' | 'families' | 'components' | 'capacity_records';
export interface SupplierCatalogue {
  suppliers: SupplierRow[]; families: SupplierRow[]; components: SupplierRow[]; capacity_records: SupplierRow[];
  sources: SupplierRow[];
}
export interface SupplierEdit {
  id: string; collection: SupplierCollection; recordId: string; before: SupplierRow | null; after: SupplierRow;
  reason: string; documentRef: string; editedAt: string;
}
export interface SupplierCatalogueState {
  schemaVersion: '1'; sourceVersion: string; sourceSha256: string; original: SupplierCatalogue; edits: SupplierEdit[];
  selection: {supplierId: string | null; familyId: string | null; componentId: string | null; capacityId: string | null};
  status: 'REFERENCE_ONLY'; confirmed: false; constructionRelease: 'NO_GO';
}
export const supplierFields: Record<SupplierCollection, readonly string[]> = {
  suppliers: ['name', 'phone', 'line', 'province', 'note_th'],
  families: ['label', 'module_system', 'published_ledger_labels_mm', 'standard_lengths_mm', 'rosette_pitch_mm'],
  components: ['role', 'D_mm', 't_mm', 'published_grade_label', 'Fy_MPa', 'Fu_MPa', 'E_MPa', 'material_standard_edition', 'note_th'],
  capacity_records: ['kind', 'value', 'unit', 'resistance_basis', 'load_basis', 'bay_x_mm', 'bay_y_mm', 'lift_mm', 'total_height_mm', 'head_extension_mm', 'base_extension_mm', 'bracing_pattern_ref', 'top_restraint_ref', 'base_restraint_ref', 'document_ref', 'document_revision', 'source_page'],
};
const collections: SupplierCollection[] = ['suppliers', 'families', 'components', 'capacity_records'];
const optionalText = (v: unknown, name: string) => {if (v !== null && (typeof v !== 'string' || v.length > 4000)) throw Error(`${name}: text or null required`);};
const optionalPositive = (v: unknown, name: string, zero = false) => {if (v !== null && v !== undefined) finite(v, name, zero);};
function validateCatalogue(data: SupplierCatalogue) {
  for (const key of [...collections, 'sources'] as const) {
    if (!Array.isArray(data[key]) || data[key].length > 1000) throw Error(`Invalid supplier ${key}`);
    data[key].forEach(r => record(r)); uniqueIds(data[key], key);
  }
  for (const s of data.suppliers) {identifier(s.name, 'supplier name'); for (const k of ['phone','line','province','note_th']) if (s[k] !== undefined) optionalText(s[k], k);}
  for (const f of data.families) {
    identifier(f.label, 'family label');
    if (!['METRIC','FOOT_BASED','CUSTOM'].includes(String(f.module_system))) throw Error('Invalid module system');
    if (!data.suppliers.some(s => s.id === f.supplier_id)) throw Error('Supplier family parent missing');
    for (const key of ['published_ledger_labels_mm', 'standard_lengths_mm']) {
      if (!Array.isArray(f[key]) || (f[key] as unknown[]).length > 100) throw Error(`Invalid ${key}`);
      (f[key] as unknown[]).forEach(n => finite(n, key));
      if (new Set(f[key] as unknown[]).size !== (f[key] as unknown[]).length) throw Error(`Duplicate ${key}`);
    }
    optionalPositive(f.rosette_pitch_mm, 'rosette pitch');
  }
  for (const c of data.components) {
    if (!data.families.some(f => f.id === c.family_id)) throw Error('Component family missing');
    if (!['STANDARD','LEDGER','BRACE','BASE_JACK','U_HEAD','JACK_HEAD_BASE'].includes(String(c.role))) throw Error('Invalid component role');
    for (const key of ['D_mm','t_mm','Fy_MPa','Fu_MPa','E_MPa']) optionalPositive(c[key], key);
    for (const key of ['published_grade_label','material_standard_edition','note_th']) if (c[key] !== undefined) optionalText(c[key], key);
    if (typeof c.D_mm === 'number' && typeof c.t_mm === 'number' && 2*c.t_mm >= c.D_mm) throw Error('ความหนาท่อต้องน้อยกว่าครึ่งหนึ่งของ OD');
    if (typeof c.Fy_MPa === 'number' && typeof c.Fu_MPa === 'number' && c.Fu_MPa < c.Fy_MPa) throw Error('Fu ต้องไม่น้อยกว่า Fy');
    if (c.project_verified !== false) throw Error('Supplier reference cannot verify a project component');
  }
  for (const c of data.capacity_records) {
    if (!data.families.some(f => f.id === c.family_id)) throw Error('Capacity family missing');
    if (!['LEDGER_ROSETTE','BRACE_CONNECTION','SPIGOT','U_HEAD','BASE_JACK','SYSTEM_CONFIGURATION'].includes(String(c.kind))) throw Error('กรุณาเลือกรายการตรวจสำหรับข้อมูลกำลัง');
    for (const k of ['value','bay_x_mm','bay_y_mm','lift_mm','total_height_mm']) optionalPositive(c[k], k);
    for (const k of ['head_extension_mm','base_extension_mm']) optionalPositive(c[k], k, true);
    if (c.unit !== null && !['N','kN','Nmm','kNm','N/mm','Nmm/rad'].includes(String(c.unit))) throw Error('Invalid capacity unit');
    if (c.resistance_basis !== null && !['ALLOWABLE','DESIGN_Rd','CHARACTERISTIC_Rk','ULTIMATE_TEST','STIFFNESS'].includes(String(c.resistance_basis))) throw Error('Invalid resistance basis');
    if (c.value !== null && (!c.unit || !c.resistance_basis)) throw Error('กรอกค่ากำลังแล้วต้องระบุหน่วยและฐานกำลังด้วย');
    if (c.unit && c.resistance_basis && (['N/mm','Nmm/rad'].includes(String(c.unit)) !== (c.resistance_basis === 'STIFFNESS'))) throw Error('หน่วยความแข็งต้องใช้ฐาน STIFFNESS และแยกจากค่ากำลัง');
    if (c.verified !== false) throw Error('Capacity entry cannot approve a product configuration');
  }
}
export function createSupplierCatalogue(raw: unknown): SupplierCatalogueState {
  const r = record(raw);
  if (r.schema_version !== 'thai-ringlock-suppliers-1.0') throw Error('Invalid supplier source version');
  const original = Object.fromEntries([...collections, 'sources'].map(k => [k, r[k]])) as unknown as SupplierCatalogue;
  validateCatalogue(original);
  return clone({schemaVersion: '1', sourceVersion: `${r.schema_version}@${r.checked_on}`, sourceSha256: SUPPLIER_SOURCE_SHA256, original, edits: [],
    selection: {supplierId: null, familyId: null, componentId: null, capacityId: null}, status: 'REFERENCE_ONLY', confirmed: false, constructionRelease: 'NO_GO'});
}
/** Replay auditable changes on copies. Neither a numeric entry nor a source label is authority. */
export function resolveSupplierCatalogue(state: SupplierCatalogueState): SupplierCatalogue {
  if (state.schemaVersion !== '1' || state.sourceSha256 !== SUPPLIER_SOURCE_SHA256 || state.status !== 'REFERENCE_ONLY' || state.confirmed !== false || state.constructionRelease !== 'NO_GO') throw Error('Invalid supplier reference state');
  identifier(state.sourceVersion, 'supplier source version'); validateCatalogue(state.original);
  if (!Array.isArray(state.edits) || state.edits.length > 1000) throw Error('Invalid supplier edit history');
  uniqueIds(state.edits, 'supplier edit');
  const current = clone(state.original);
  for (const edit of state.edits) {
    if (!collections.includes(edit.collection)) throw Error('Invalid supplier collection');
    identifier(edit.recordId, 'edited record'); identifier(edit.reason, 'เหตุผล'); identifier(edit.documentRef, 'เอกสารอ้างอิง');
    if (!Number.isFinite(Date.parse(edit.editedAt))) throw Error('Invalid supplier edit date');
    const rows = current[edit.collection], index = rows.findIndex(r => r.id === edit.recordId), before = index < 0 ? null : rows[index];
    if (canonical(before) !== canonical(edit.before) || edit.after.id !== edit.recordId) throw Error('Supplier history does not match original record');
    if (before) {
      for (const key of new Set([...Object.keys(before), ...Object.keys(edit.after)])) {
        if (!supplierFields[edit.collection].includes(key) && canonical(before[key] ?? null) !== canonical(edit.after[key] ?? null)) throw Error(`Supplier field is not editable: ${key}`);
      }
    }
    if (index < 0) rows.push(clone(edit.after)); else rows[index] = clone(edit.after);
    validateCatalogue(current);
  }
  const {supplierId, familyId, componentId, capacityId} = state.selection;
  if (supplierId !== null && !current.suppliers.some(s => s.id === supplierId)) throw Error('Unknown selected supplier');
  if (familyId !== null && !current.families.some(f => f.id === familyId && f.supplier_id === supplierId)) throw Error('Selected family does not belong to supplier');
  if (componentId !== null && !current.components.some(c => c.id === componentId && c.family_id === familyId)) throw Error('Selected component does not belong to family');
  if (capacityId !== null && !current.capacity_records.some(c => c.id === capacityId && c.family_id === familyId)) throw Error('Selected capacity does not belong to family');
  return current;
}
export function selectSupplierRecord(state: SupplierCatalogueState, key: keyof SupplierCatalogueState['selection'], id: string | null) {
  const selection = {...state.selection, [key]: id};
  if (key === 'supplierId') {selection.familyId = null; selection.componentId = null; selection.capacityId = null;}
  if (key === 'familyId') {selection.componentId = null; selection.capacityId = null;}
  const next = {...clone(state), selection}; resolveSupplierCatalogue(next); return next;
}
export function editSupplierRecord(state: SupplierCatalogueState, collection: SupplierCollection, recordId: string, changes: Record<string, unknown>, reason: string, documentRef: string): SupplierCatalogueState {
  const catalogue = resolveSupplierCatalogue(state), before = catalogue[collection].find(r => r.id === recordId) ?? null;
  const allowed = [...supplierFields[collection], ...(before ? [] : ['supplier_id','family_id'])];
  for (const [key, value] of Object.entries(changes)) {
    if (!allowed.includes(key)) throw Error(`Supplier field is not editable: ${key}`);
    if (typeof value === 'string') optionalText(value, key);
  }
  const defaults = collection === 'suppliers' ? {family_ids: [], source_id: null} : collection === 'families' ? {source_id: null, installed_configuration_verified: false} : collection === 'components' ? {source_id: null, capacity_record_id: null, project_verified: false} : {component_id: null, verified: false, status: 'USER_ENTRY_UNVERIFIED'};
  const after = {...(before ?? defaults), ...clone(changes), id: recordId} as SupplierRow;
  const edit: SupplierEdit = {id: globalThis.crypto.randomUUID(), collection, recordId, before: clone(before), after, reason, documentRef, editedAt: new Date().toISOString()};
  const next = {...clone(state), edits: [...state.edits, edit]}; resolveSupplierCatalogue(next); return next;
}
export function screenSupplierCatalogue(state: SupplierCatalogueState, plan: {bayXMm: number | null; bayYMm: number | null} | null) {
  const data = resolveSupplierCatalogue(state), selection = state.selection;
  const supplier = data.suppliers.find(s => s.id === selection.supplierId) ?? null;
  const family = data.families.find(f => f.id === selection.familyId) ?? null;
  const component = data.components.find(c => c.id === selection.componentId) ?? null;
  const capacity = data.capacity_records.find(c => c.id === selection.capacityId) ?? null;
  const labels = family?.published_ledger_labels_mm as number[] | undefined;
  const planMatches = plan && labels ? {x: typeof plan.bayXMm === 'number' && labels.includes(plan.bayXMm), y: typeof plan.bayYMm === 'number' && labels.includes(plan.bayYMm)} : null;
  const blockers = ['THAI_SUPPLIER_REFERENCE_NOT_PROJECT_VERIFIED', 'THAI_SUPPLIER_CONNECTION_AND_SYSTEM_EVIDENCE_REQUIRED'];
  if (!supplier || !family) blockers.push('THAI_SUPPLIER_AND_FAMILY_NOT_SELECTED');
  if (planMatches && (!planMatches.x || !planMatches.y)) blockers.push('THAI_SUPPLIER_MODULE_DOES_NOT_MATCH_PLAN');
  if (state.edits.length) blockers.push('THAI_SUPPLIER_USER_CHANGES_REQUIRE_REVIEW');
  if (capacity?.value !== null && capacity?.value !== undefined) blockers.push('THAI_SUPPLIER_CAPACITY_ENTRY_NOT_USED_AS_RATING');
  return {supplier, family, component, capacity, planMatches, blockers, status: 'REFERENCE_ONLY' as const, constructionRelease: 'NO_GO' as const};
}
