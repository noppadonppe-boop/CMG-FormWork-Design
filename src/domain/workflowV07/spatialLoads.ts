import {canonical, clone, finite, identifier, record, signed, uniqueIds} from './common.js';
import type {LoadAction} from './loads.js';
import type {PlywoodSurfacePatch} from './plywood.js';
import type {WorkflowModel} from './model.js';
import type {SoffitLayout} from './soffit.js';
import type {PathMember} from './loadPath.js';
import {actionFactor} from './caseFactors.js';

export interface SurfaceRegion {
  id: string; kind: 'CONCRETE' | 'ADDITIONAL_DL' | 'CONSTRUCTION_LL' | 'PLACEMENT' | 'OTHER' | null;
  x0: number | null; x1: number | null; y0: number | null; y1: number | null;
  placedDepthMm: number | null; qKPa: number | null; ownershipId: string; evidenceRef: string;
}
export interface MemberAction {
  id: string; kind: 'ADDITIONAL_DL' | 'CONSTRUCTION_LL' | 'SELF_WEIGHT' | 'PLACEMENT' | 'OTHER' | null;
  targetMemberId: string; shape: 'POINT' | 'LINE' | null; startMm: number | null; endMm: number | null;
  forceN: number | null; lineLoadNPerMm: number | null; ownershipId: string; evidenceRef: string;
  separateFromSurfaceAndMemberWeight: boolean | null;
  applicationLine: 'MEMBER_ANALYSIS_LINE' | null;
}
export interface SpatialLoading {
  schemaVersion: '1'; surfaceScope: 'COMPLETE_FOR_DECLARED_STAGE' | null; evidenceRef: string; omittedAreasEvidenceRef: string;
  regions: SurfaceRegion[]; memberActions: MemberAction[];
}
export const emptySpatialLoading = (): SpatialLoading => ({schemaVersion: '1', surfaceScope: null, evidenceRef: '', omittedAreasEvidenceRef: '', regions: [], memberActions: []});
export const emptySurfaceRegion = (id: string): SurfaceRegion => ({id, kind: null, x0: null, x1: null, y0: null, y1: null, placedDepthMm: null, qKPa: null, ownershipId: '', evidenceRef: ''});
export const emptyMemberAction = (id: string): MemberAction => ({id, kind: null, targetMemberId: '', shape: null, startMm: null, endMm: null, forceN: null, lineLoadNPerMm: null, ownershipId: '', evidenceRef: '', separateFromSurfaceAndMemberWeight: null, applicationLine: null});
function exact(v: unknown, keys: string[], label: string) {const r = record(v); if (keys.some(k => !Object.hasOwn(r, k)) || Object.keys(r).some(k => !keys.includes(k))) throw Error(`${label}: unknown/missing fields or authority metadata`); return r;}
function text(v: unknown) {if (typeof v !== 'string' || v.length > 2000) throw Error('Invalid spatial load text');}
export function validateSpatialLoading(raw: unknown): asserts raw is SpatialLoading {
  const r = exact(raw, Object.keys(emptySpatialLoading()), 'spatial load plan');
  if (r.schemaVersion !== '1' || ![null, 'COMPLETE_FOR_DECLARED_STAGE'].includes(r.surfaceScope as string | null) || !Array.isArray(r.regions) || r.regions.length > 40 || !Array.isArray(r.memberActions) || r.memberActions.length > 80) throw Error('Invalid spatial plan or 40-region/80-member-action limit');
  text(r.evidenceRef); text(r.omittedAreasEvidenceRef); uniqueIds(r.regions as SurfaceRegion[], 'surface regions'); uniqueIds(r.memberActions as MemberAction[], 'member actions');
  for (const v of r.regions) {
    const p = exact(v, Object.keys(emptySurfaceRegion('SCHEMA')), 'surface region');
    if (![null, 'CONCRETE', 'ADDITIONAL_DL', 'CONSTRUCTION_LL', 'PLACEMENT', 'OTHER'].includes(p.kind as string | null)) throw Error('Invalid surface action kind');
    for (const k of ['x0', 'x1', 'y0', 'y1']) if (p[k] !== null) signed(p[k], k);
    for (const k of ['placedDepthMm', 'qKPa']) if (p[k] !== null) finite(p[k], k, k === 'qKPa');
    text(p.ownershipId); text(p.evidenceRef);
  }
  for (const v of r.memberActions) {
    const a = exact(v, Object.keys(emptyMemberAction('SCHEMA')), 'member action');
    if (![null, 'ADDITIONAL_DL', 'CONSTRUCTION_LL', 'SELF_WEIGHT', 'PLACEMENT', 'OTHER'].includes(a.kind as string | null) || ![null, 'POINT', 'LINE'].includes(a.shape as string | null) || ![null, false, true].includes(a.separateFromSurfaceAndMemberWeight as boolean | null) || ![null, 'MEMBER_ANALYSIS_LINE'].includes(a.applicationLine as string | null)) throw Error('Invalid member action kind/shape/ownership/application line');
    for (const k of ['startMm', 'endMm', 'forceN', 'lineLoadNPerMm']) if (a[k] !== null) finite(a[k], k, true);
    text(a.targetMemberId); text(a.ownershipId); text(a.evidenceRef);
  }
  if (canonical(r).length > 200000) throw Error('Spatial plan size limit; no actions omitted');
}
type Bounds = {x0: number; y0: number; widthX: number; widthY: number};
/** Every region replaces the full-strip source distribution. Empty sets mean explicitly unloaded
 * only after the author declares complete stage scope and documents omitted areas. */
export function compileSpatialSurfaces(model: WorkflowModel, layout: SoffitLayout, bounds: Bounds) {
  const plan = layout.loading!; validateSpatialLoading(plan);
  if (plan.surfaceScope !== 'COMPLETE_FOR_DECLARED_STAGE' || !plan.evidenceRef.trim() || !plan.omittedAreasEvidenceRef.trim()) throw Error('Complete spatial Stage scope, source and omitted-area evidence required; no default full-strip loads');
  if (!layout.plywood) throw Error('Actual plywood analysis required for spatial surface loading; midpoint tributaries cannot substitute');
  const gamma = finite(model.gammaKNm3, 'gamma'), dead = finite(model.additionalDeadKPa, 'source additional DL', true), live = finite(model.constructionLiveKPa, 'source construction LL', true);
  const allowed: Record<string, [number, number]> = {};
  if (model.elementType === 'SLAB') {
    if (model.slabThicknessMm !== model.heightMm) throw Error('Slab thickness must match final geometry');
    for (const k of ['CONCRETE', 'ADDITIONAL_DL', 'CONSTRUCTION_LL']) allowed[k] = [0, bounds.widthY];
  } else {
    const b = finite(model.beamWidthMm, 'beam width'), t = finite(model.slabThicknessMm, 'slab thickness', true), bc = finite(model.concreteStripMm, 'concrete strip');
    if (b !== bounds.widthY || t >= model.heightMm || bc < b || (t === 0 && bc !== b)) throw Error('Invalid beam final section/concrete ownership');
    const c0 = t === 0 ? 0 : signed(layout.concreteStripStartYMm, 'concrete strip start');
    if (c0 > 0 || c0 + bc < b) throw Error('Concrete strip must include beam footprint');
    allowed.CONCRETE = [c0, c0 + bc];
    if (plan.regions.some(r => r.kind === 'ADDITIONAL_DL')) {const d0 = signed(layout.deadStripStartYMm, 'source DL strip start'); allowed.ADDITIONAL_DL = [d0, d0 + finite(model.deadStripMm, 'DL strip')];}
    if (plan.regions.some(r => r.kind === 'CONSTRUCTION_LL')) {const l0 = signed(layout.liveStripStartYMm, 'source LL strip start'); allowed.CONSTRUCTION_LL = [l0, l0 + finite(model.liveStripMm, 'LL strip')];}
  }
  const surfaces: PlywoodSurfacePatch[] = [], ledger: LoadAction[] = [], totals = {concrete: 0, additionalDead: 0, constructionLive: 0, additional: 0};
  const rows = plan.regions.map(r => {
    identifier(r.ownershipId, 'region ownership'); if (!r.evidenceRef.trim()) throw Error('Actual region evidence required'); if (!r.kind) throw Error(`${r.id}: surface kind required`);
    const x0 = signed(r.x0, 'region X0'), x1 = signed(r.x1, 'region X1'), y0 = signed(r.y0, 'region Y0'), y1 = signed(r.y1, 'region Y1');
    if (x0 < 0 || x1 > bounds.widthX || x1 <= x0 || y0 < signed(layout.joistStartYMm, 'joist start') || y1 > signed(layout.joistEndYMm, 'joist end') || y1 <= y0) throw Error(`${r.id}: region outside actual panel/joist extent`);
    const a = allowed[r.kind]; if (a && (y0 < a[0] || y1 > a[1])) throw Error(`${r.id}: region outside independently owned ${r.kind} strip`);
    let rawQ: number;
    if (r.kind === 'CONCRETE') {
      if (r.qKPa !== null) throw Error('Concrete pressure is computed from explicit placed depth and gamma');
      const depth = finite(r.placedDepthMm, 'placed concrete depth');
      const available = model.elementType === 'SLAB' || (y0 >= 0 && y1 <= bounds.widthY) ? model.heightMm : model.slabThicknessMm!;
      if (depth > available) throw Error(`${r.id}: placed depth exceeds final concrete section; split beam/slab regions at actual boundaries`);
      rawQ = gamma * depth / 1000;
    } else {
      if (r.placedDepthMm !== null) throw Error('Placed depth applies only to CONCRETE');
      if (r.kind === 'ADDITIONAL_DL' || r.kind === 'CONSTRUCTION_LL') {if (r.qKPa !== null) throw Error('DL/LL regions use the separate declared source pressures'); rawQ = r.kind === 'ADDITIONAL_DL' ? dead : live;}
      else rawQ = finite(r.qKPa, 'explicit additional surface pressure', true);
    }
    const qKPa = rawQ * actionFactor(model, r.kind); if (!Number.isFinite(qKPa) || qKPa < 0) throw Error('Nonnegative finite downward surface load required; uplift needs a separate physical model');
    const forceN = qKPa * (x1 - x0) * (y1 - y0) / 1000;
    const target = r.kind === 'CONCRETE' ? 'concrete' : r.kind === 'ADDITIONAL_DL' ? 'additionalDead' : r.kind === 'CONSTRUCTION_LL' ? 'constructionLive' : 'additional'; totals[target] += forceN;
    surfaces.push({id: `REGION:${r.id}`, kind: r.kind, startX: x0, endX: x1, startY: y0, endY: y1, qKPa});
    ledger.push({id: `${model.id}:REGION:${r.id}`, ownershipId: r.ownershipId, kind: r.kind, stageId: layout.stageId, loadCaseId: layout.loadCaseId, source: r.evidenceRef, direction: 'VERTICAL_DOWN', units: 'kPa', magnitude: qKPa,
      region: {x0: bounds.x0 + x0, x1: bounds.x0 + x1, y0: bounds.y0 + y0, y1: bounds.y0 + y1}, includedInActionId: ['CONCRETE', 'ADDITIONAL_DL', 'CONSTRUCTION_LL'].includes(r.kind) ? `${model.id}:${r.kind === 'CONCRETE' ? 'CONCRETE' : r.kind === 'ADDITIONAL_DL' ? 'DL' : 'LL'}` : null});
    return {...clone(r), appliedQKPa: qKPa, forceN};
  });
  for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
    const a = rows[i], b = rows[j];
    if (a.ownershipId === b.ownershipId || (a.kind === b.kind && Math.min(a.x1!, b.x1!) > Math.max(a.x0!, b.x0!) && Math.min(a.y1!, b.y1!) > Math.max(a.y0!, b.y0!))) throw Error('Duplicate ownership/overlapping same-kind spatial regions; split actual non-overlapping regions');
  }
  canonical({surfaces, totals, ledger}); return {surfaces, totals, ledger, rows};
}
/** Point/line loads act on the named real member. No imaginary plywood effective width or nearest
 * member snapping. This is declared direct bearing, not a plate/punching/contact verification. */
export function applySpatialMemberActions(model: WorkflowModel, layout: SoffitLayout, members: PathMember[], actions: LoadAction[]) {
  const resolved: {definition: MemberAction; appliedForceN: number; appliedLineNPerMm: number | null; point: {xMm: number; yMm: number; zMm: number}}[] = [];
  const byKindN: Record<string, number> = {};
  let forceN = 0, xLeverNmm = 0, yLeverNmm = 0;
  for (const a of layout.loading?.memberActions ?? []) {
    if (!a.kind || !a.shape || a.separateFromSurfaceAndMemberWeight !== true) throw Error(`${a.id}: kind/shape and separate load ownership declaration required`);
    if (a.applicationLine !== 'MEMBER_ANALYSIS_LINE') throw Error(`${a.id}: actual application on member analysis line required; no unknown eccentricity interpreted as zero`);
    if (!a.evidenceRef.trim()) throw Error('Actual direct-bearing load evidence required'); identifier(a.ownershipId, 'direct load ownership');
    if (actions.some(old => old.ownershipId === a.ownershipId)) throw Error('Duplicate direct-member/source ownership');
    const m = members.find(m => m.beam.id === a.targetMemberId); if (!m) throw Error(`${a.id}: exact actual target member required`);
    const start = finite(a.startMm, 'load station', true), factor = actionFactor(model, a.kind); let total: number, q: number | null = null, centre = start;
    if (start > m.beam.lengthMm) throw Error(`${a.id}: station outside target member`);
    if (a.shape === 'POINT') {
      if (a.endMm !== null || a.lineLoadNPerMm !== null) throw Error('Point load cannot also supply line fields');
      total = finite(a.forceN, 'point force N', true) * factor;
      if (!Number.isFinite(total) || total < 0) throw Error('Finite nonnegative downward point force required');
      m.beam.points.push({id: `EXTRA:${a.id}`, xMm: start, forceN: total});
    } else {
      if (a.forceN !== null) throw Error('Line action cannot also supply point force'); const end = finite(a.endMm, 'line end station', true);
      if (end <= start || end > m.beam.lengthMm) throw Error('Line action outside actual target member');
      q = finite(a.lineLoadNPerMm, 'line action N/mm', true) * factor; if (!Number.isFinite(q) || q < 0) throw Error('Finite nonnegative downward line action required');
      total = q * (end - start); centre = (start + end) / 2;
      m.beam.patches.push({id: `EXTRA:${a.id}`, startMm: start, endMm: end, startNPerMm: q, endNPerMm: q});
    }
    const p = m.placement.origin, point = {xMm: p.xMm + (m.placement.axis === 'X' ? centre : 0), yMm: p.yMm + (m.placement.axis === 'Y' ? centre : 0), zMm: p.zMm};
    forceN += total; xLeverNmm += total * point.xMm; yLeverNmm += total * point.yMm;
    byKindN[a.kind] = (byKindN[a.kind] ?? 0) + total;
    actions.push({id: `${model.id}:MEMBER_ACTION:${a.id}`, ownershipId: a.ownershipId, kind: a.kind, stageId: layout.stageId, loadCaseId: layout.loadCaseId, source: a.evidenceRef,
      direction: 'VERTICAL_DOWN', units: 'kN', magnitude: total / 1000, region: null, includedInActionId: null});
    resolved.push({definition: clone(a), appliedForceN: total, appliedLineNPerMm: q, point});
  }
  canonical({forceN, xLeverNmm, yLeverNmm, resolved, byKindN}); return {forceN, xLeverNmm, yLeverNmm, resolved, byKindN};
}
