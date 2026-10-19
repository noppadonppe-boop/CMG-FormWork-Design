import {canonical, clone, finite, identifier, record, signed, uniqueIds} from './common.js';
import {definitionHash} from './definitionHash.js';
import {TIE_ROLES, type TieRole, type TieAssembly} from './assemblies.js';
import type {Topology} from './geometry.js';
import type {SideLayoutDefinition, SideTieDefinition} from './sideLayout.js';

export const TIE_PROPERTIES = ['capacityKN', 'tensileEffectiveAreaMm2', 'stiffnessAreaMm2', 'E_MPa', 'steelLengthMm', 'orderLengthMm', 'outerExposedLengthMm', 'coneRecessMm'] as const;
export interface TieProductRecord {
  productId: string; manufacturer: string; model: string; lotRef: string; threadMark: string; materialRef: string;
  sourceVersion: string; sourceRef: string; capacityBasis: 'ALLOWABLE' | 'DESIGN' | 'ULTIMATE_TEST' | null; capacityScopeRef: string; lengthDatumRef: string;
  properties: Record<typeof TIE_PROPERTIES[number], number | null>;
}
export interface TieProductEdit {
  field: typeof TIE_PROPERTIES[number]; before: number | null; after: number | null; reason: string; evidenceRef: string;
  actor: string; at: string; revision: string; referenceDefinition: string;
}
export interface TieComponentRecord {role: TieRole; reference: TieProductRecord; edits: TieProductEdit[]}
export const ROD_ROLES = ['INNER', 'OUTER_LEFT', 'OUTER_RIGHT'] as const;
export interface TieRodGauge {id: string; role: typeof ROD_ROLES[number] | null; startMm: number | null; endMm: number | null; evidenceRef: string}
export interface ThreadDescription {standard: string; designation: string; nominalDiameterMm: number | null; leadSystem: 'MM_PITCH' | 'TPI' | null; lead: number | null; hand: 'LEFT' | 'RIGHT' | null; fitClass: string}
export interface TieThreadInterface {
  id: string; side: 'LEFT' | 'RIGHT' | null; maleRole: TieRole | null; femaleRole: TieRole | null;
  male: ThreadDescription; female: ThreadDescription;
  actualEngagementMm: number | null; requiredEngagementMm: number | null; measurementEvidenceRef: string; requirementEvidenceRef: string; compatibilityEvidenceRef: string;
}
export interface TieDossier {
  schemaVersion: '1'; topology: 'SEGMENTED_INNER_OUTER'; components: TieComponentRecord[];
  compatibilityEvidenceRef: string; geometryEvidenceRef: string; boundGeometry: string | null;
  rodScope: 'DECLARED_NONOVERLAPPING_BODY_GAUGES' | null; rodGauges: TieRodGauge[];
  threadScope: 'DECLARED_LOADED_THREAD_INTERFACES' | null; threads: TieThreadInterface[];
  legacySourceDefinition: string | null;
}
export const emptyTieProduct = (): TieProductRecord => ({productId: '', manufacturer: '', model: '', lotRef: '', threadMark: '', materialRef: '', sourceVersion: '', sourceRef: '', capacityBasis: null, capacityScopeRef: '', lengthDatumRef: '', properties: {capacityKN: null, tensileEffectiveAreaMm2: null, stiffnessAreaMm2: null, E_MPa: null, steelLengthMm: null, orderLengthMm: null, outerExposedLengthMm: null, coneRecessMm: null}});
export const emptyThreadDescription = (): ThreadDescription => ({standard: '', designation: '', nominalDiameterMm: null, leadSystem: null, lead: null, hand: null, fitClass: ''});
export const emptyThreadInterface = (id: string): TieThreadInterface => ({id, side: null, maleRole: null, femaleRole: null, male: emptyThreadDescription(), female: emptyThreadDescription(), actualEngagementMm: null, requiredEngagementMm: null, measurementEvidenceRef: '', requirementEvidenceRef: '', compatibilityEvidenceRef: ''});
export const emptyRodGauge = (id: string): TieRodGauge => ({id, role: null, startMm: null, endMm: null, evidenceRef: ''});
export const emptyTieDossier = (): TieDossier => ({schemaVersion: '1', topology: 'SEGMENTED_INNER_OUTER', components: TIE_ROLES.map(role => ({role, reference: emptyTieProduct(), edits: []})), compatibilityEvidenceRef: '', geometryEvidenceRef: '', boundGeometry: null, rodScope: null, rodGauges: [], threadScope: null, threads: [], legacySourceDefinition: null});
function exact(v: unknown, keys: string[], label: string) {const r = record(v); if (Object.keys(r).some(k => !keys.includes(k)) || keys.some(k => !Object.hasOwn(r, k))) throw Error(`${label}: unknown/missing fields or authority metadata`); return r;}
function text(v: unknown, label: string, max = 2000) {if (typeof v !== 'string' || v.length > max) throw Error(`Invalid ${label}`);}
function property(v: unknown, name: string) {if (v !== null) finite(v, name, ['capacityKN', 'outerExposedLengthMm', 'coneRecessMm'].includes(name));}
export function validateTieProduct(raw: unknown): asserts raw is TieProductRecord {
  const p = exact(raw, Object.keys(emptyTieProduct()), 'declared tie product');
  if (![null, 'ALLOWABLE', 'DESIGN', 'ULTIMATE_TEST'].includes(p.capacityBasis as string | null)) throw Error('Invalid declared tie capacity basis');
  for (const k of Object.keys(emptyTieProduct()).filter(k => !['properties', 'capacityBasis'].includes(k))) text(p[k], k);
  const props = exact(p.properties, [...TIE_PROPERTIES], 'declared product properties'); for (const k of TIE_PROPERTIES) property(props[k], k);
}
/** Reconstruct numeric overrides. Identity, thread marks, material and load basis cannot be changed
 * by a numeric Custom edit. All evidence/actor/time claims remain unauthenticated draft data. */
export function effectiveTieProduct(c: TieComponentRecord) {
  validateTieProduct(c.reference); if (!Array.isArray(c.edits) || c.edits.length > 16) throw Error('Tie Custom edit limit'); const effective = clone(c.reference);
  for (const e of c.edits) {
    exact(e, ['field', 'before', 'after', 'reason', 'evidenceRef', 'actor', 'at', 'revision', 'referenceDefinition'], 'tie Custom edit');
    if (!TIE_PROPERTIES.includes(e.field)) throw Error('Only declared numeric tie properties can be Custom'); property(e.before, e.field); property(e.after, e.field);
    for (const k of ['reason', 'evidenceRef', 'actor', 'revision'] as const) {text(e[k], k); if (!e[k].trim()) throw Error('Custom reason, evidence, declared actor and revision required');}
    text(e.at, 'Custom time', 100); if (!Number.isFinite(Date.parse(e.at)) || new Date(e.at).toISOString() !== e.at) throw Error('Canonical ISO Custom timestamp required');
    text(e.referenceDefinition, 'Custom original reference', 30000);
    if (e.referenceDefinition !== canonical(c.reference) || e.before !== effective.properties[e.field]) throw Error('Custom original/reference history changed or is discontinuous');
    effective.properties[e.field] = e.after;
  }
  return effective;
}
export function editTieProduct(c: TieComponentRecord, edit: Pick<TieProductEdit, 'field' | 'after' | 'reason' | 'evidenceRef' | 'actor' | 'at' | 'revision'>): TieComponentRecord {
  const before = effectiveTieProduct(c).properties[edit.field], next = {...clone(c), edits: [...clone(c.edits), {...clone(edit), before, referenceDefinition: canonical(c.reference)}]}; effectiveTieProduct(next); return next;
}
function validateThread(raw: unknown) {
  const t = exact(raw, Object.keys(emptyThreadDescription()), 'thread description');
  if (![null, 'MM_PITCH', 'TPI'].includes(t.leadSystem as string | null) || ![null, 'LEFT', 'RIGHT'].includes(t.hand as string | null)) throw Error('Invalid thread lead system/hand');
  for (const k of ['standard', 'designation', 'fitClass']) text(t[k], k);
  for (const k of ['nominalDiameterMm', 'lead']) if (t[k] !== null) finite(t[k], k);
}
export function validateTieDossier(raw: unknown): asserts raw is TieDossier {
  const d = exact(raw, Object.keys(emptyTieDossier()), 'tie dossier');
  if (d.schemaVersion !== '1' || d.topology !== 'SEGMENTED_INNER_OUTER' || !Array.isArray(d.components) || d.components.length > 13 || !Array.isArray(d.rodGauges) || d.rodGauges.length > 40 || !Array.isArray(d.threads) || d.threads.length > 12) throw Error('Invalid tie dossier topology/13-role/40-gauge/12-interface bound');
  if (![null, 'DECLARED_NONOVERLAPPING_BODY_GAUGES'].includes(d.rodScope as string | null) || ![null, 'DECLARED_LOADED_THREAD_INTERFACES'].includes(d.threadScope as string | null)) throw Error('Invalid declared tie scopes');
  text(d.compatibilityEvidenceRef, 'tie compatibility'); text(d.geometryEvidenceRef, 'tie geometry'); if (d.boundGeometry !== null) text(d.boundGeometry, 'tie geometry binding', 30000);
  if (d.legacySourceDefinition !== null) text(d.legacySourceDefinition, 'legacy tie source', 30000);
  const roles: string[] = [];
  for (const v of d.components) {const c = exact(v, ['role', 'reference', 'edits'], 'tie component') as unknown as TieComponentRecord; if (!TIE_ROLES.includes(c.role)) throw Error('Unknown tie role'); roles.push(c.role); effectiveTieProduct(c); if (canonical(c).length > 20000) throw Error('Tie component record exceeds 20000 characters');}
  if (new Set(roles).size !== roles.length) throw Error('Duplicate tie component role');
  uniqueIds(d.rodGauges as TieRodGauge[], 'rod gauge'); uniqueIds(d.threads as TieThreadInterface[], 'thread interface');
  for (const v of d.rodGauges) {const g = exact(v, Object.keys(emptyRodGauge('SCHEMA')), 'rod gauge'); if (g.role !== null && !ROD_ROLES.includes(g.role as typeof ROD_ROLES[number])) throw Error('Only physical Inner/Outer rod body gauges supported'); for (const k of ['startMm', 'endMm']) if (g[k] !== null) signed(g[k], k); text(g.evidenceRef, 'body gauge evidence');}
  for (const v of d.threads) {
    const j = exact(v, Object.keys(emptyThreadInterface('SCHEMA')), 'thread interface');
    if (![null, 'LEFT', 'RIGHT'].includes(j.side as string | null)) throw Error('Invalid thread side');
    for (const k of ['maleRole', 'femaleRole']) if (j[k] !== null && (!TIE_ROLES.includes(j[k] as TieRole) || String(j[k]).startsWith('WALER_') || String(j[k]).startsWith('PLATE_') || String(j[k]).startsWith('THREAD_'))) throw Error('Thread interface needs physical product roles, not a limit-state row');
    validateThread(j.male); validateThread(j.female);
    for (const k of ['actualEngagementMm', 'requiredEngagementMm']) if (j[k] !== null) finite(j[k], k, k === 'actualEngagementMm');
    for (const k of ['measurementEvidenceRef', 'requirementEvidenceRef', 'compatibilityEvidenceRef']) text(j[k], k);
  }
  if (canonical(d).length > 100000) throw Error('Tie dossier exceeds 100000 characters; no records omitted');
}
export function tieGeometryContext(topology: Topology, layout: Pick<SideLayoutDefinition, 'stageId' | 'baseElevationMm' | 'faces'>, tie: Pick<SideTieDefinition, 'id' | 'a' | 'b' | 'diameterMm'>) {
  const base = signed(layout.baseElevationMm, 'tie base datum'), diameter = finite(tie.diameterMm, 'tie outside diameter'); identifier(layout.stageId, 'tie Stage'); identifier(tie.id, 'tie ID');
  const ends = [tie.a, tie.b].map(end => {
    const f = topology.faces.find(f => f.id === end.faceId), row = layout.faces.find(f => f.faceId === end.faceId)?.walers.find(w => w.id === end.walerId), support = row?.supports.find(s => s.id === end.supportId);
    if (!f || !row || !support) throw Error('Actual selected tie endpoints required for binding');
    const x = signed(support.xMm, 'support station'), z = signed(row.zMm, 'waler level'); if (x < 0 || x > f.lengthMm || z < 0 || z > topology.heightMm) throw Error('Tie binding outside physical face');
    return {...clone(end), point: {x: f.a.x + (f.b.x - f.a.x) * x / f.lengthMm, y: f.a.y + (f.b.y - f.a.y) * x / f.lengthMm, z: base + z}};
  });
  const chordMm = Math.hypot(ends[1].point.x - ends[0].point.x, ends[1].point.y - ends[0].point.y, ends[1].point.z - ends[0].point.z); finite(chordMm, 'actual tie chord');
  return {definition: canonical({schemaVersion: '1', tieId: tie.id, stageId: layout.stageId, vertices: topology.vertices, heightMm: topology.heightMm, diameterMm: diameter, ends}), chordMm, ends};
}
export function tieDossierBinding(d: TieDossier, context: ReturnType<typeof tieGeometryContext>) {
  return definitionHash({route: context.definition, geometryEvidenceRef: d.geometryEvidenceRef, rodScope: d.rodScope, threadScope: d.threadScope, rodGauges: d.rodGauges, threads: d.threads,
    products: d.components.map(c => {const p = effectiveTieProduct(c); return {role: c.role, productId: p.productId, manufacturer: p.manufacturer, model: p.model, materialRef: p.materialRef, threadMark: p.threadMark, lengthDatumRef: p.lengthDatumRef,
      geometry: Object.fromEntries(TIE_PROPERTIES.filter(k => !['capacityKN', 'E_MPa'].includes(k)).map(k => [k, p.properties[k]]))};})});
}
export function bindTieDossier(d: TieDossier, context: ReturnType<typeof tieGeometryContext>): TieDossier {if (!d.geometryEvidenceRef.trim()) throw Error('Measured geometry/product datum evidence required before binding'); const next = {...clone(d), boundGeometry: tieDossierBinding(d, context)}; validateTieDossier(next); return next;}
export function migrateLegacyTieAssembly(old: Omit<TieAssembly, 'demandKN' | 'demandBasis'>): TieDossier {
  const next = emptyTieDossier(); next.legacySourceDefinition = canonical(old); next.compatibilityEvidenceRef = old.compatibilityEvidence ?? '';
  for (const c of next.components) {const rows = old.components.filter(r => r.role === c.role); if (rows.length !== 1) continue; const p = rows[0]; c.reference.productId = p.productId; c.reference.sourceRef = p.sourceRef ?? ''; c.reference.capacityBasis = p.basis; c.reference.properties.capacityKN = p.demandFraction === 1 ? p.capacityKN : null;}
  for (const side of ['LEFT', 'RIGHT'] as const) {const j = {...emptyThreadInterface(`IMPORTED-${side}`), side}; j.actualEngagementMm = old[side === 'LEFT' ? 'engagementLeftMm' : 'engagementRightMm']; j.requiredEngagementMm = old[side === 'LEFT' ? 'requiredEngagementLeftMm' : 'requiredEngagementRightMm']; next.threads.push(j);}
  validateTieDossier(next); return next;
}
export function copyTieProductTemplate(d: TieDossier): TieDossier {
  validateTieDossier(d); const next = clone(d); next.boundGeometry = null; next.geometryEvidenceRef = ''; next.rodScope = null; next.threadScope = null;
  next.rodGauges.forEach(g => {g.startMm = null; g.endMm = null; g.evidenceRef = '';});
  next.threads.forEach(j => {j.actualEngagementMm = null; j.measurementEvidenceRef = '';});
  return next;
}
/** Screening is always NO_GO. Even complete positive numeric comparisons cannot certify any
 * product, thread, end/plate/waler resistance, installed stock or engineering release. */
export function evaluateTieDossier(d: TieDossier, context: ReturnType<typeof tieGeometryContext>, demandKN: number | null, demandBasis: 'ALLOWABLE' | 'DESIGN') {
  validateTieDossier(d); if (demandKN !== null) finite(demandKN, 'actual single full tie demand', true);
  const current = d.boundGeometry === tieDossierBinding(d, context) && !!d.geometryEvidenceRef.trim(); const force = current ? demandKN : null;
  const blockers = ['FULL_FORM_TIE_V062_VENDOR_PACK_AND_TRUSTED_ENGINEERING_REVIEW_REQUIRED', 'DECLARED_PRODUCT_REFERENCE_OR_CUSTOM_DATA_NOT_CERTIFIED', 'THREAD_REGISTER_AND_BODY_GAUGE_COMPLETENESS_NOT_VERIFIED_AGAINST_VENDOR_DRAWING', 'THREAD_LOCAL_PLATE_WALER_AND_SYSTEM_RESISTANCE_RULES_REQUIRED', 'ASSEMBLY_SLIP_PRELOAD_CONTACT_AND_WALL_MOVEMENT_NOT_MODELED'];
  if (!current) blockers.push('TIE_GEOMETRY_BINDING_STALE_OR_MISSING'); if (force === null) blockers.push('CURRENT_BALANCED_SINGLE_TIE_FORCE_REQUIRED'); if (!d.compatibilityEvidenceRef.trim()) blockers.push('FULL_PRODUCT_ASSEMBLY_COMPATIBILITY_SOURCE_MISSING');
  const components = TIE_ROLES.map(role => {
    const c = d.components.find(c => c.role === role), effective = c ? effectiveTieProduct(c) : null, cap = effective?.properties.capacityKN ?? null;
    const matched = effective?.capacityBasis === demandBasis, issues: string[] = [];
    if (!effective || ![effective.productId, effective.manufacturer, effective.model, effective.sourceVersion, effective.sourceRef, effective.capacityScopeRef].every(s => s.trim())) issues.push('PRODUCT_IDENTITY_SOURCE_AND_RATING_SCOPE_INCOMPLETE');
    if (!matched || cap === null) issues.push('CAPACITY_OR_MATCHED_LOAD_BASIS_MISSING_NO_ULTIMATE_CONVERSION');
    const exceeded = force !== null && matched && cap !== null && force > cap;
    if (exceeded) issues.push('DECLARED_CAPACITY_EXCEEDED');
    let utilization = force !== null && matched && cap !== null && cap > 0 ? force / cap : null;
    if (utilization !== null && !Number.isFinite(utilization)) {issues.push('NUMERIC_UTILIZATION_OUTSIDE_FINITE_MODEL'); utilization = null;}
    return {role, reference: c?.reference ?? null, effective, mode: c?.edits.length ? 'CUSTOM' as const : 'DECLARED_REFERENCE' as const, edits: clone(c?.edits ?? []), fullDemandKN: force, declaredCapacityKN: matched ? cap : null, utilization,
      issues, status: exceeded ? 'FAIL' as const : 'BLOCKED' as const};
  });
  const threads = d.threads.map(j => {
    const issues: string[] = [], mismatch: string[] = [], a = j.male, b = j.female;
    if (a.nominalDiameterMm !== null && b.nominalDiameterMm !== null && a.nominalDiameterMm !== b.nominalDiameterMm) mismatch.push('DECLARED_NOMINAL_THREAD_DIAMETERS_DIFFER');
    if (a.hand !== null && b.hand !== null && a.hand !== b.hand) mismatch.push('DECLARED_THREAD_HANDS_DIFFER');
    if (a.leadSystem && a.leadSystem === b.leadSystem && a.lead !== null && b.lead !== null && a.lead !== b.lead) mismatch.push('DECLARED_THREAD_PITCH_OR_TPI_DIFFERS');
    if (a.leadSystem !== b.leadSystem || !a.standard.trim() || a.standard !== b.standard || !a.designation.trim() || a.designation !== b.designation) issues.push('THREAD_PROFILE_STANDARD_OR_DESIGNATION_COMPATIBILITY_UNVERIFIED_NO_ALIAS_INFERENCE');
    if (![a, b].every(t => t.nominalDiameterMm !== null && t.leadSystem && t.lead !== null && t.hand && t.fitClass.trim()) || !j.side || !j.maleRole || !j.femaleRole || j.maleRole === j.femaleRole) issues.push('ACTUAL_THREAD_GEOMETRY_AND_PHYSICAL_PRODUCT_ROLES_INCOMPLETE');
    if (j.side && [j.maleRole, j.femaleRole].some(r => r?.endsWith(j.side === 'LEFT' ? '_RIGHT' : '_LEFT'))) issues.push('THREAD_PRODUCT_ROLE_REFERENCES_OPPOSITE_SIDE');
    if ([[j.maleRole, a], [j.femaleRole, b]].some(([role, description]) => {const mark = components.find(c => c.role === role)?.effective?.threadMark; return !mark?.trim() || mark !== (description as ThreadDescription).designation;})) issues.push('THREAD_MARK_TO_SELECTED_PRODUCT_REFERENCE_NOT_VERIFIED');
    if (!j.measurementEvidenceRef.trim() || !j.requirementEvidenceRef.trim() || !j.compatibilityEvidenceRef.trim() || j.actualEngagementMm === null || j.requiredEngagementMm === null) issues.push('ACTUAL_AND_REQUIRED_ENGAGEMENT_SOURCES_MISSING');
    if (j.actualEngagementMm !== null && j.requiredEngagementMm !== null && j.actualEngagementMm < j.requiredEngagementMm) mismatch.push('DECLARED_MINIMUM_EFFECTIVE_ENGAGEMENT_NOT_MET');
    return {definition: clone(j), issues: [...issues, ...mismatch], status: mismatch.length ? 'FAIL' as const : 'BLOCKED' as const};
  });
  if (!d.threadScope || !['LEFT', 'RIGHT'].every(side => d.threads.some(j => j.side === side))) blockers.push('COMPLETE_LEFT_AND_RIGHT_LOADED_THREAD_INTERFACE_REGISTER_REQUIRED');
  const gauges = d.rodGauges.map(g => {
    const product = components.find(c => c.role === g.role)?.effective, props = product?.properties, issues: string[] = [];
    const lengthMm = g.startMm !== null && g.endMm !== null && g.endMm > g.startMm ? g.endMm - g.startMm : null;
    if (!g.role || lengthMm === null || !g.evidenceRef.trim()) issues.push('ACTUAL_NONOVERLAPPING_BODY_GAUGE_DATUM_OR_ROLE_MISSING');
    if (!product || ![product.productId, product.materialRef, product.sourceRef, product.sourceVersion].every(s => s.trim())) issues.push('ROD_PRODUCT_AND_ELASTIC_SOURCE_INCOMPLETE');
    let stressDemandMPa: number | null = null, extensionMm: number | null = null;
    try {
      if (force !== null && props?.tensileEffectiveAreaMm2 != null) stressDemandMPa = finite(finite(force * 1000, 'rod force N', true) / props.tensileEffectiveAreaMm2, 'rod stress indicator', force === 0);
    } catch {issues.push('NUMERIC_STRESS_INDICATOR_OUTSIDE_FINITE_MODEL');}
    try {
      if (force !== null && lengthMm !== null && g.evidenceRef.trim() && props?.stiffnessAreaMm2 != null && props.E_MPa !== null) extensionMm = finite(finite(force * 1000 * lengthMm, 'rod force-length', true) / finite(props.E_MPa * props.stiffnessAreaMm2, 'rod axial stiffness EA'), 'rod body extension', force === 0);
    } catch {issues.push('NUMERIC_BODY_INDICATOR_OUTSIDE_FINITE_MODEL');}
    if (stressDemandMPa === null || extensionMm === null) issues.push('DISTINCT_TENSILE_AREA_STIFFNESS_AREA_OR_E_SOURCE_MISSING');
    return {definition: clone(g), lengthMm, stressDemandMPa, extensionMm, issues};
  });
  let overlap = false;
  for (let i = 0; i < gauges.length; i++) for (let j = i + 1; j < gauges.length; j++) {const a = gauges[i].definition, b = gauges[j].definition; if (a.startMm !== null && a.endMm !== null && b.startMm !== null && b.endMm !== null && Math.min(a.endMm, b.endMm) > Math.max(a.startMm, b.startMm)) overlap = true;}
  if (overlap) blockers.push('OVERLAPPING_ROD_BODY_GAUGES_WOULD_DOUBLE_COUNT_AXIAL_EXTENSION');
  const lengthChecks = ROD_ROLES.map(role => {
    const p = components.find(c => c.role === role)?.effective, rows = gauges.filter(g => g.definition.role === role);
    const gaugeLengthMm = rows.length && rows.every(g => g.lengthMm !== null) ? rows.reduce((s, g) => s + g.lengthMm!, 0) : null;
    const known = !!p?.lengthDatumRef.trim() && p.properties.steelLengthMm !== null && gaugeLengthMm !== null;
    return {role, gaugeLengthMm, declaredSteelLengthMm: p?.properties.steelLengthMm ?? null, datumEvidenceRef: p?.lengthDatumRef ?? '', status: known && gaugeLengthMm! > p!.properties.steelLengthMm! ? 'FAIL' as const : 'BLOCKED' as const};
  });
  const rodComplete = current && d.rodScope && !overlap && lengthChecks.every(l => l.status !== 'FAIL') && ROD_ROLES.every(role => gauges.some(g => g.definition.role === role)) && gauges.every(g => g.extensionMm !== null && !g.issues.includes('ROD_PRODUCT_AND_ELASTIC_SOURCE_INCOMPLETE'));
  const rodBodyExtensionMm = rodComplete ? gauges.reduce((sum, g) => sum + g.extensionMm!, 0) : null;
  if (!rodComplete) blockers.push('COMPLETE_SEPARATE_BODY_GAUGES_WITH_AREA_E_AND_DATUM_EVIDENCE_REQUIRED');
  const declaredCapacityMinKN = current && components.every(c => c.declaredCapacityKN !== null && !c.issues.some(i => i !== 'DECLARED_CAPACITY_EXCEEDED')) ? Math.min(...components.map(c => c.declaredCapacityKN!)) : null;
  const result = {current, context: clone(context), demandKN: force, demandBasis, components, threads, gauges, lengthChecks, declaredCapacityMinKN, rodBodyExtensionMm, assemblyMovementMm: null, blockers,
    status: components.some(c => c.status === 'FAIL') || threads.some(t => t.status === 'FAIL') || lengthChecks.some(l => l.status === 'FAIL') ? 'FAIL' as const : 'BLOCKED' as const, constructionRelease: 'NO_GO' as const};
  canonical(result); return result;
}
