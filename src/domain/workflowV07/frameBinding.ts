import {canonical, clone, finite, identifier, record} from './common.js';
import {nominalTubeProperties, screenRinglockResearch, type RinglockResearchSnapshot} from './ringlockResearch.js';
import {resolveSupplierCatalogue, screenSupplierCatalogue, type SupplierCatalogueState} from './ringlockSuppliers.js';
import type {RinglockConfiguration} from './ringlock.js';

/** Captured references for sensitivity analysis, never a finished-product or system rating. */
export interface FrameElasticReference {
  schemaVersion: '1'; sourceVersion: string; sourceSha256: string;
  reference: Record<string, unknown>; sources: Record<string, unknown>[]; hypothesisRef: string;
  status: 'UNVERIFIED_PROJECT_REFERENCE'; constructionRelease: 'NO_GO';
}
export interface FrameTubeBinding {
  schemaVersion: '1'; geometryScope: 'STRAIGHT_GROSS_CHS_SEGMENT';
  geometrySource: 'RESEARCH_REFERENCE' | 'SUPPLIER_COMPONENT' | null;
  researchSnapshot: RinglockResearchSnapshot | null; supplierSnapshot: SupplierCatalogueState | null;
  elasticSnapshot: FrameElasticReference | null;
  straightSegmentEvidenceRef: string; actualProductMatchEvidenceRef: string; elasticBasisEvidenceRef: string;
}
export const FRAME_ELASTIC_KEYS = ['E_MPa', 'G_MPa', 'A_mm2', 'Iy_mm4', 'Iz_mm4', 'J_mm4'] as const;
export const emptyFrameTubeBinding = (): FrameTubeBinding => ({schemaVersion: '1', geometryScope: 'STRAIGHT_GROSS_CHS_SEGMENT', geometrySource: null,
  researchSnapshot: null, supplierSnapshot: null, elasticSnapshot: null, straightSegmentEvidenceRef: '', actualProductMatchEvidenceRef: '', elasticBasisEvidenceRef: ''});
function exact(raw: unknown, keys: string[], label: string) {
  const r = record(raw); if (Object.keys(r).some(k => !keys.includes(k)) || keys.some(k => !Object.hasOwn(r, k))) throw Error(`${label}: unknown/missing fields or authority metadata`); return r;
}
function text(v: unknown, label: string, required = false) {
  if (typeof v !== 'string' || v.length > 2000 || (required && !v.trim())) throw Error(`${label} required`);
}
function sourceList(v: unknown) {
  if (!Array.isArray(v) || v.length > 50) throw Error('Invalid frame reference sources');
  const ids = v.map(s => identifier(record(s).id, 'reference source ID')); if (new Set(ids).size !== ids.length) throw Error('Duplicate reference source');
}
function research(raw: RinglockResearchSnapshot) {
  exact(raw, ['schemaVersion', 'sourceVersion', 'sourceSha256', 'choice', 'group', 'section', 'material', 'elastic', 'sources', 'status', 'constructionRelease'], 'frame research snapshot');
  exact(raw.choice, ['groupId', 'role', 'sectionId', 'materialGrade', 'useElasticReference', 'hypothesisRef'], 'captured research choice');
  if (![null, 'STANDARD', 'LEDGER', 'DIAGONAL_BRACE'].includes(raw.choice.role) || typeof raw.choice.useElasticReference !== 'boolean') throw Error('Invalid captured research choice');
  text(raw.choice.hypothesisRef, 'reference hypothesis'); sourceList(raw.sources);
  for (const value of [raw.group, raw.section, raw.material, raw.elastic]) if (value !== null) record(value);
  if (raw.section?.actual_product_verified !== undefined && raw.section.actual_product_verified !== false) throw Error('Nominal tube cannot verify an actual product');
  for (const key of ['project_stock_verified', 'thai_supplier_stock_verified'] as const) if (raw.group?.[key] !== undefined && raw.group[key] !== false) throw Error('Reference group cannot verify project stock');
  const screen = screenRinglockResearch(raw, null);
  const sourceIds: unknown[] = [];
  for (const row of [raw.group, raw.section]) if (row?.source_ids !== undefined) {
    if (!Array.isArray(row.source_ids)) throw Error('Invalid geometric source IDs'); sourceIds.push(...row.source_ids);
  }
  for (const row of [raw.material, raw.elastic]) if (row?.source_id !== undefined) sourceIds.push(row.source_id);
  for (const id of sourceIds) if (typeof id !== 'string' || !raw.sources.some(s => s.id === id)) throw Error(`Missing captured research source ${String(id)}`);
  if (screen.gross && raw.section?.J_mm4 !== undefined && Math.abs(finite(raw.section.J_mm4, 'nominal torsion J') - screen.gross.J_mm4) > screen.gross.J_mm4 * 1e-8) throw Error('Nominal closed-tube torsion J inconsistent with D/t');
  return screen;
}
/** Remove unrelated supplier rows and elastic data from a geometric copy. */
export function captureFrameResearchGeometry(snapshot: RinglockResearchSnapshot): RinglockResearchSnapshot {
  screenRinglockResearch(snapshot, null);
  const result = clone(snapshot); delete result.choice.supplierCatalogue; result.choice.useElasticReference = false; result.elastic = null;
  research(result); return result;
}
/** Preserve originals plus the selected records' replayable edit history; never copy capacity rows. */
export function captureFrameSupplierGeometry(state: SupplierCatalogueState): SupplierCatalogueState {
  resolveSupplierCatalogue(state);
  const {supplierId, familyId, componentId} = state.selection;
  if (!supplierId || !familyId || !componentId) throw Error('Select supplier, family and actual component before capture');
  const ids = {suppliers: supplierId, families: familyId, components: componentId};
  const original = {suppliers: state.original.suppliers.filter(r => r.id === supplierId), families: state.original.families.filter(r => r.id === familyId),
    components: state.original.components.filter(r => r.id === componentId), capacity_records: [], sources: state.original.sources};
  const edits = state.edits.filter(e => e.collection !== 'capacity_records' && e.recordId === ids[e.collection]);
  const used = new Set([...original.suppliers, ...original.families, ...original.components, ...edits.flatMap(e => [e.before, e.after])].filter(r => r !== null).map(r => r.source_id).filter(id => typeof id === 'string'));
  original.sources = original.sources.filter(s => used.has(s.id));
  const result: SupplierCatalogueState = clone({...state, original, edits, selection: {supplierId, familyId, componentId, capacityId: null}});
  supplier(result); return result;
}
function supplier(state: SupplierCatalogueState) {
  exact(state, ['schemaVersion', 'sourceVersion', 'sourceSha256', 'original', 'edits', 'selection', 'status', 'confirmed', 'constructionRelease'], 'captured supplier state');
  exact(state.original, ['suppliers', 'families', 'components', 'capacity_records', 'sources'], 'captured supplier originals');
  exact(state.selection, ['supplierId', 'familyId', 'componentId', 'capacityId'], 'captured supplier selection');
  const {supplierId, familyId, componentId, capacityId} = state.selection;
  if (!supplierId || !familyId || !componentId || capacityId !== null || state.original.capacity_records.length !== 0) throw Error('Frame binding requires one component and no capacity record');
  const ids = {suppliers: supplierId, families: familyId, components: componentId};
  for (const k of ['suppliers', 'families', 'components'] as const) {
    if (!Array.isArray(state.original[k]) || state.original[k].length > 1 || state.original[k].some(r => r.id !== ids[k])) throw Error('Unrelated supplier row in frame binding');
  }
  for (const edit of state.edits) {
    exact(edit, ['id', 'collection', 'recordId', 'before', 'after', 'reason', 'documentRef', 'editedAt'], 'captured supplier edit');
    if (edit.collection === 'capacity_records' || edit.recordId !== ids[edit.collection]) throw Error('Unrelated supplier history in frame binding');
  }
  sourceList(state.original.sources); const data = resolveSupplierCatalogue(state);
  for (const row of [...data.suppliers, ...data.families, ...data.components]) if (row.source_id !== undefined && row.source_id !== null && !data.sources.some(s => s.id === row.source_id)) throw Error(`Missing captured supplier source ${String(row.source_id)}`);
  if (data.families.some(f => f.installed_configuration_verified !== undefined && f.installed_configuration_verified !== false)) throw Error('Supplier family cannot verify an installed configuration');
  return {supplier: data.suppliers.find(r => r.id === supplierId)!, family: data.families.find(r => r.id === familyId)!, component: data.components.find(r => r.id === componentId)!};
}
export function captureFrameElasticReference(snapshot: RinglockResearchSnapshot): FrameElasticReference {
  screenRinglockResearch(snapshot, null);
  if (!snapshot.elastic || !snapshot.choice.useElasticReference) throw Error('Explicitly select the elastic reference before capture; E/G are not defaults');
  const ref: FrameElasticReference = clone({schemaVersion: '1', sourceVersion: snapshot.sourceVersion, sourceSha256: snapshot.sourceSha256,
    reference: snapshot.elastic, sources: snapshot.sources.filter(s => s.id === snapshot.elastic!.source_id), hypothesisRef: snapshot.choice.hypothesisRef,
    status: 'UNVERIFIED_PROJECT_REFERENCE', constructionRelease: 'NO_GO'});
  elastic(ref); return ref;
}
function elastic(v: FrameElasticReference) {
  exact(v, ['schemaVersion', 'sourceVersion', 'sourceSha256', 'reference', 'sources', 'hypothesisRef', 'status', 'constructionRelease'], 'frame elastic reference');
  if (v.schemaVersion !== '1' || v.status !== 'UNVERIFIED_PROJECT_REFERENCE' || v.constructionRelease !== 'NO_GO' || !/^[a-f0-9]{64}$/i.test(v.sourceSha256)) throw Error('Invalid elastic source metadata');
  identifier(v.sourceVersion, 'elastic version'); text(v.hypothesisRef, 'elastic hypothesis'); sourceList(v.sources);
  const r = exact(v.reference, ['id', 'E_MPa', 'nu', 'G_MPa', 'density_kg_m3', 'source_id', 'project_design_basis_selected', 'project_default_E_MPa'], 'elastic reference');
  identifier(r.id, 'elastic reference ID'); identifier(r.source_id, 'elastic source ID');
  if (!v.sources.some(s => s.id === r.source_id) || r.project_design_basis_selected !== false || r.project_default_E_MPa !== null) throw Error('Elastic reference cannot approve project design basis');
  const E = finite(r.E_MPa, 'captured E'), G = finite(r.G_MPa, 'captured G'); finite(r.density_kg_m3, 'reference density');
  if (typeof r.nu !== 'number' || !Number.isFinite(r.nu) || r.nu <= -1 || r.nu >= .5 || Math.abs(G - E / (2 * (1 + r.nu))) > G * 1e-8) throw Error('Inconsistent isotropic E/G/nu reference');
  return {E_MPa: E, G_MPa: G};
}
/** Permit incomplete drafts; refuse unknown keys, imported approval and unrelated catalogue copies. */
export function validateFrameTubeBinding(raw: unknown): asserts raw is FrameTubeBinding {
  const b = exact(raw, Object.keys(emptyFrameTubeBinding()), 'frame tube binding') as unknown as FrameTubeBinding;
  if (b.schemaVersion !== '1' || b.geometryScope !== 'STRAIGHT_GROSS_CHS_SEGMENT' || ![null, 'RESEARCH_REFERENCE', 'SUPPLIER_COMPONENT'].includes(b.geometrySource)) throw Error('Invalid frame tube geometry scope/source');
  if (canonical(b).length > 100000) throw Error('FRAME_BINDING_EXCEEDS_100000_CHARACTER_LIMIT');
  for (const k of ['straightSegmentEvidenceRef', 'actualProductMatchEvidenceRef', 'elasticBasisEvidenceRef'] as const) text(b[k], k);
  if (b.researchSnapshot !== null) research(b.researchSnapshot);
  if (b.supplierSnapshot !== null) supplier(b.supplierSnapshot);
  if (b.elasticSnapshot !== null) elastic(b.elasticSnapshot);
  if ((b.geometrySource !== 'RESEARCH_REFERENCE' && b.researchSnapshot !== null) || (b.geometrySource !== 'SUPPLIER_COMPONENT' && b.supplierSnapshot !== null)) throw Error('Unused competing frame geometry snapshot');
}
export function resolveFrameTubeBinding(binding: FrameTubeBinding, role: string | null, kind: string | null, manual: {[K in typeof FRAME_ELASTIC_KEYS[number]]: number | null}, config: RinglockConfiguration | null = null) {
  validateFrameTubeBinding(binding);
  if (!['STANDARD', 'LEDGER', 'BRACE'].includes(role ?? '') || !['BEAM_COLUMN', 'AXIAL_BAR'].includes(kind ?? '')) throw Error('Gross straight tube binding supports Standard/Ledger/Brace only; not jack, spigot or joint');
  if (role !== 'BRACE' && kind !== 'BEAM_COLUMN') throw Error('Standard and Ledger require beam-column idealization');
  if (FRAME_ELASTIC_KEYS.some(k => manual[k] !== null)) throw Error('Bound frame properties conflict with manual E/G/A/I/J');
  text(binding.straightSegmentEvidenceRef, 'straight segment extent/evidence', true); text(binding.actualProductMatchEvidenceRef, 'actual product matching evidence', true);
  text(binding.elasticBasisEvidenceRef, 'project elastic hypothesis evidence', true);
  if (!binding.elasticSnapshot) throw Error('Captured explicit E/G reference required; supplier grade/Fy are not elastic properties');
  text(binding.elasticSnapshot.hypothesisRef, 'captured elastic hypothesis', true);
  const properties = elastic(binding.elasticSnapshot), blockers = ['FRAME_BOUND_NOMINAL_GROSS_CHS_ONLY_NET_ENDS_AND_FINISHED_PRODUCT_UNVERIFIED',
    'FRAME_BOUND_ELASTIC_REFERENCE_IS_PROJECT_HYPOTHESIS_NOT_APPROVAL', 'FRAME_BOUND_MEMBER_SELF_WEIGHT_OWNERSHIP_RECONCILIATION_REQUIRED', 'FRAME_BOUND_PRODUCT_AND_CONNECTION_COMPATIBILITY_UNVERIFIED'];
  let D: number, t: number, sourceRole: unknown;
  if (binding.geometrySource === 'RESEARCH_REFERENCE' && binding.researchSnapshot) {
    const s = binding.researchSnapshot; text(s.choice.hypothesisRef, 'captured geometry hypothesis', true);
    const screen = screenRinglockResearch(s, config); if (!screen.gross) throw Error('Captured Ringlock role section required');
    D = screen.gross.D_mm; t = screen.gross.t_mm; sourceRole = s.choice.role === 'DIAGONAL_BRACE' ? 'BRACE' : s.choice.role; blockers.push(...screen.blockers);
  } else if (binding.geometrySource === 'SUPPLIER_COMPONENT' && binding.supplierSnapshot) {
    const s = supplier(binding.supplierSnapshot); D = finite(s.component.D_mm, 'supplier tube OD'); t = finite(s.component.t_mm, 'supplier tube wall'); sourceRole = s.component.role;
    blockers.push(...screenSupplierCatalogue(binding.supplierSnapshot, config).blockers);
    if (s.component.E_MPa !== null && s.component.E_MPa !== undefined && s.component.E_MPa !== properties.E_MPa) blockers.push('FRAME_SUPPLIER_E_DIFFERS_FROM_EXPLICIT_ELASTIC_HYPOTHESIS');
  } else throw Error('Captured frame geometry source required');
  if (sourceRole !== role) throw Error(`Captured tube role ${String(sourceRole)} does not match actual member role ${role}`);
  const gross = nominalTubeProperties(D, t);
  return {...properties, A_mm2: gross.A_mm2, Iy_mm4: gross.I_mm4, Iz_mm4: gross.I_mm4, J_mm4: gross.J_mm4, gross,
    blockers: [...new Set(blockers)], status: 'REFERENCE_ONLY' as const, constructionRelease: 'NO_GO' as const};
}
