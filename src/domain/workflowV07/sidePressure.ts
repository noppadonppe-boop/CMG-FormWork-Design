import {analyzeBeam, type BeamPatch} from './beam.js';
import {canonical, clone, finite, identifier, record, uniqueIds} from './common.js';
import {actionFactor} from './caseFactors.js';
import type {WorkflowModel} from './model.js';

export interface SidePressureSource {
  id: string; kind: 'HYDROSTATIC' | 'DECLARED_LATERAL' | 'WIND' | 'PLACEMENT' | null;
  x0Mm: number | null; x1Mm: number | null; headMm: number | null;
  z0Mm: number | null; z1Mm: number | null; p0KPa: number | null; p1KPa: number | null;
  ownershipId: string; evidenceRef: string; mappingBasisRef: string;
}
export interface SidePressureDefinition {
  schemaVersion: '1'; scope: 'REPLACE_COMPLETE_FACE_FOR_STAGE' | null; evidenceRef: string; omittedAreasEvidenceRef: string;
  sources: SidePressureSource[];
}
export interface PressurePatch {
  id: string; kind: NonNullable<SidePressureSource['kind']>; x0Mm: number; x1Mm: number; z0Mm: number; z1Mm: number;
  p0KPa: number; p1KPa: number; ownershipId: string; evidenceRef: string; mappingBasisRef: string;
}
export const emptySidePressure = (): SidePressureDefinition => ({schemaVersion: '1', scope: null, evidenceRef: '', omittedAreasEvidenceRef: '', sources: []});
export const emptyPressureSource = (id: string): SidePressureSource => ({id, kind: null, x0Mm: null, x1Mm: null, headMm: null, z0Mm: null, z1Mm: null, p0KPa: null, p1KPa: null, ownershipId: '', evidenceRef: '', mappingBasisRef: ''});
function exact(v: unknown, keys: string[]) {const r = record(v); if (keys.some(k => !Object.hasOwn(r, k)) || Object.keys(r).some(k => !keys.includes(k))) throw Error('Side pressure: unknown/missing fields or authority metadata'); return r;}
function text(v: unknown) {if (typeof v !== 'string' || v.length > 2000) throw Error('Invalid side pressure text');}
export function validateSidePressure(raw: unknown): asserts raw is SidePressureDefinition {
  const p = exact(raw, Object.keys(emptySidePressure()));
  if (p.schemaVersion !== '1' || ![null, 'REPLACE_COMPLETE_FACE_FOR_STAGE'].includes(p.scope as string | null) || !Array.isArray(p.sources) || p.sources.length > 40) throw Error('Invalid side pressure schema/scope or 40-source limit');
  text(p.evidenceRef); text(p.omittedAreasEvidenceRef); uniqueIds(p.sources as SidePressureSource[], 'face pressure sources');
  for (const v of p.sources) {
    const s = exact(v, Object.keys(emptyPressureSource('SCHEMA')));
    if (![null, 'HYDROSTATIC', 'DECLARED_LATERAL', 'WIND', 'PLACEMENT'].includes(s.kind as string | null)) throw Error('Invalid face pressure source kind');
    for (const k of ['x0Mm', 'x1Mm', 'headMm', 'z0Mm', 'z1Mm', 'p0KPa', 'p1KPa']) if (s[k] !== null) finite(s[k], k, true);
    for (const k of ['ownershipId', 'evidenceRef', 'mappingBasisRef']) text(s[k]);
  }
  if (canonical(p).length > 150000) throw Error('Side pressure definition size limit; no sources omitted');
}
/** Complete authored normal-outward pressure field. No vertical DL/LL conversion, pressure
 * coefficient, SCC/placement model or wet region is inferred from a geometry/shape label. */
export function compileSidePressure(model: WorkflowModel, definition: SidePressureDefinition, lengthMm: number) {
  validateSidePressure(definition); finite(lengthMm, 'face length');
  if (definition.scope !== 'REPLACE_COMPLETE_FACE_FOR_STAGE' || !definition.evidenceRef.trim() || !definition.omittedAreasEvidenceRef.trim()) throw Error('Complete face pressure scope and explicit source/unloaded-area evidence required');
  const patches: PressurePatch[] = definition.sources.map(s => {
    if (!s.kind || !s.evidenceRef.trim()) throw Error(`${s.id}: actual side-pressure kind/evidence required`); identifier(s.ownershipId, 'side pressure ownership');
    const x0Mm = finite(s.x0Mm, 'pressure X0', true), x1Mm = finite(s.x1Mm, 'pressure X1', true);
    if (x1Mm <= x0Mm || x1Mm > lengthMm) throw Error('Pressure X extent outside actual physical face');
    let z0Mm: number, z1Mm: number, p0KPa: number, p1KPa: number;
    if (s.kind === 'HYDROSTATIC') {
      if ([s.z0Mm, s.z1Mm, s.p0KPa, s.p1KPa].some(v => v !== null)) throw Error('Hydrostatic source uses explicit head and gamma, not competing pressure ramp fields');
      z0Mm = 0; z1Mm = finite(s.headMm, 'actual local hydrostatic head', true);
      if (z1Mm > model.heightMm) throw Error('Local hydrostatic head above physical panel');
      p0KPa = finite(model.gammaKNm3, 'raw concrete gamma') * z1Mm / 1000; p1KPa = 0;
    } else {
      if (s.headMm !== null || !s.mappingBasisRef.trim()) throw Error('Declared lateral pressure needs its own mapping/design basis; no vertical-load or head conversion');
      z0Mm = finite(s.z0Mm, 'pressure Z0', true); z1Mm = finite(s.z1Mm, 'pressure Z1', true);
      if (z1Mm <= z0Mm || z1Mm > model.heightMm) throw Error('Pressure Z extent outside actual physical panel');
      p0KPa = finite(s.p0KPa, 'actual outward pressure p0', true); p1KPa = finite(s.p1KPa, 'actual outward pressure p1', true);
    }
    const category = s.kind === 'HYDROSTATIC' ? 'HYDROSTATIC_SIDE' : s.kind === 'DECLARED_LATERAL' ? 'OTHER' : s.kind;
    const factor = actionFactor(model, category); p0KPa *= factor; p1KPa *= factor;
    if (![p0KPa, p1KPa].every(v => Number.isFinite(v) && v >= 0)) throw Error('Finite nonnegative outward side pressure required; signed suction/contact model unsupported');
    return {id: s.id, kind: s.kind, x0Mm, x1Mm, z0Mm, z1Mm, p0KPa, p1KPa, ownershipId: s.ownershipId, evidenceRef: s.evidenceRef, mappingBasisRef: s.mappingBasisRef};
  });
  for (let i = 0; i < patches.length; i++) for (let j = i + 1; j < patches.length; j++) {
    const a = patches[i], b = patches[j];
    if (a.ownershipId === b.ownershipId || (a.kind === 'HYDROSTATIC' && b.kind === 'HYDROSTATIC' && Math.min(a.x1Mm, b.x1Mm) > Math.max(a.x0Mm, b.x0Mm) && Math.min(a.z1Mm, b.z1Mm) > Math.max(a.z0Mm, b.z0Mm))) throw Error('Duplicate pressure ownership or overlapping concrete hydrostatic regions');
  }
  canonical(patches); return patches;
}
const valueAt = (p: PressurePatch, z: number) => p.p0KPa + (p.p1KPa - p.p0KPa) * (z - p.z0Mm) / (p.z1Mm - p.z0Mm);
export function pressureZones(patches: PressurePatch[], heightMm: number) {return [...new Set([0, heightMm, ...patches.flatMap(p => [p.z0Mm, p.z1Mm])])].sort((a, b) => a - b);}
/** One-way, simply spanning X strips. At a fixed Z, pressure is piecewise constant in X.
 * Between Z boundaries every response is affine in Z, so both endpoint analyses bound every
 * absolute elastic demand in that zone. Their actual reactions define affine stud line loads. */
/** Sheet segments: declared sheet joints split the face into continuous strips; every joint must
 * sit on a stud. Without declared joints each stud bay is its own simply supported strip. */
export function sheetSegments(studsMm: number[], lengthMm: number, sheetJointsMm: number[] | null | undefined) {
  if (sheetJointsMm == null) return studsMm.slice(1).map((x, i) => ({startMm: studsMm[i], endMm: x, studsMm: [studsMm[i], x]}));
  if (!Array.isArray(sheetJointsMm) || sheetJointsMm.length > 40) throw Error('Invalid plywood sheet joint list');
  const joints = [...new Set([0, lengthMm, ...sheetJointsMm])].sort((a, b) => a - b);
  for (const j of sheetJointsMm) {finite(j, 'sheet joint position', true); if (!studsMm.some(x => Math.abs(x - j) < 1e-7)) throw Error(`BLOCKED_UNSUPPORTED: plywood sheet joint at ${j} mm is not on a stud; unsupported sheet edges need their own model`);}
  return joints.slice(1).map((end, i) => {
    const start = joints[i], inside = studsMm.filter(x => x >= start - 1e-7 && x <= end + 1e-7);
    return {startMm: start, endMm: end, studsMm: inside};
  });
}
export function analyzeSidePressureDeck(o: {faceId: string; revision: string; lengthMm: number; heightMm: number; studsMm: number[]; E_MPa: number; I_mm4: number; patches: PressurePatch[]; sheetJointsMm?: number[] | null}) {
  identifier(o.faceId, 'pressure face'); identifier(o.revision, 'pressure revision'); finite(o.lengthMm, 'pressure face length'); finite(o.heightMm, 'pressure face height');
  finite(o.E_MPa, 'plywood E'); finite(o.I_mm4, 'plywood I');
  if (!Array.isArray(o.patches) || o.patches.length > 40 || !Array.isArray(o.studsMm) || o.studsMm.length < 2 || o.studsMm.length > 40 || o.studsMm[0] !== 0 || o.studsMm.at(-1) !== o.lengthMm || o.studsMm.some((x, i) => !Number.isFinite(x) || x < 0 || x > o.lengthMm || (i > 0 && x <= o.studsMm[i - 1]))) throw Error('Actual edge-supported pressure-deck coordinates and bounded patches required');
  uniqueIds(o.patches, 'compiled pressure patches');
  const segments = sheetSegments(o.studsMm, o.lengthMm, o.sheetJointsMm);
  for (const p of o.patches) {
    for (const k of ['x0Mm', 'x1Mm', 'z0Mm', 'z1Mm', 'p0KPa', 'p1KPa'] as const) finite(p[k], k, true);
    const explicitZeroHead = p.kind === 'HYDROSTATIC' && p.z0Mm === 0 && p.z1Mm === 0 && p.p0KPa === 0 && p.p1KPa === 0;
    if (p.x1Mm <= p.x0Mm || (!explicitZeroHead && p.z1Mm <= p.z0Mm) || p.x1Mm > o.lengthMm || p.z1Mm > o.heightMm) throw Error('Compiled pressure patch outside panel');
  }
  const zs = pressureZones(o.patches, o.heightMm);
  if (segments.length * (zs.length - 1) * 2 > 400) throw Error('SIDE_PRESSURE_DECK_SIZE_LIMIT: at most 400 exact endpoint analyses; no zones omitted');
  const panels: {id: string; startMm: number; endMm: number; lowerZMm: number; upperZMm: number; evaluationZMm: number; designStripMm: 1000; sourceActionIds: string[]; analysis: ReturnType<typeof analyzeBeam>}[] = [];
  const studPatches: BeamPatch[][] = o.studsMm.map(() => []);
  const transfers: {sourceAnalysisIds: string[]; targetStudId: string; xMm: number; startZMm: number; endZMm: number; startNPerMm: number; endNPerMm: number; upstreamRevision: string}[] = [];
  let maximumPressureKPa = 0;
  for (let z = 1; z < zs.length; z++) {
    const lower = zs[z - 1], upper = zs[z], active = o.patches.filter(p => p.z0Mm <= lower && p.z1Mm >= upper);
    const reactions = o.studsMm.map(() => [0, 0]);
    segments.forEach((seg, s) => {
      const a = seg.startMm, b = seg.endMm, src = active.filter(p => p.x0Mm < b && p.x1Mm > a), analyses: string[] = [];
      const supports = seg.studsMm.map(x => ({id: `S${o.studsMm.indexOf(x)}`, xMm: x - a}));
      const endReactions: Record<string, number>[] = [];
      for (const [end, atZ] of [lower, upper].entries()) {
        const id = `${o.faceId}:PLY:${s + 1}:ZONE:${z}:Z${end}`;
        const loads = src.map(p => ({id: p.id, startMm: Math.max(a, p.x0Mm) - a, endMm: Math.min(b, p.x1Mm) - a, startNPerMm: Math.max(0, valueAt(p, atZ)), endNPerMm: Math.max(0, valueAt(p, atZ))}));
        // Continuous sheet strip over every stud inside the segment (simply supported when the segment is one bay).
        const analysis = analyzeBeam({id, revision: o.revision, lengthMm: b - a, E_MPa: o.E_MPa, I_mm4: o.I_mm4, supports, points: [], patches: loads});
        panels.push({id, startMm: a, endMm: b, lowerZMm: lower, upperZMm: upper, evaluationZMm: atZ, designStripMm: 1000, sourceActionIds: src.map(p => p.id), analysis}); analyses.push(id);
        const byStud: Record<string, number> = {};
        for (const sup of supports) {const r = -analysis.reactions.find(q => q.supportId === sup.id)!.forceN / 1000; byStud[sup.id] = r; reactions[Number(sup.id.slice(1))][end] += r;}
        endReactions.push(byStud);
        const xs = [...new Set([a, b, ...loads.flatMap(p => [a + p.startMm, a + p.endMm])])].sort((u, v) => u - v);
        for (let k = 1; k < xs.length; k++) maximumPressureKPa = Math.max(maximumPressureKPa, src.filter(p => p.x0Mm <= xs[k - 1] && p.x1Mm >= xs[k]).reduce((sum, p) => sum + valueAt(p, atZ), 0));
      }
      for (const sup of supports) {
        const target = Number(sup.id.slice(1));
        transfers.push({sourceAnalysisIds: analyses, targetStudId: `${o.faceId}:STUD:${target + 1}`, xMm: o.studsMm[target], startZMm: lower, endZMm: upper,
          startNPerMm: endReactions[0][sup.id], endNPerMm: endReactions[1][sup.id], upstreamRevision: o.revision});
      }
    });
    for (let i = 0; i < reactions.length; i++) studPatches[i].push({id: `PRESSURE:ZONE:${z}`, startMm: lower, endMm: upper, startNPerMm: reactions[i][0], endNPerMm: reactions[i][1]});
  }
  const sourceResultants = o.patches.map(p => {
    const b = p.x1Mm - p.x0Mm, h = p.z1Mm - p.z0Mm, force = b * h * (p.p0KPa + p.p1KPa) / 2000;
    const xLeverNmm = force * (p.x0Mm + p.x1Mm) / 2, zLeverNmm = force * p.z0Mm + b * h * h * (p.p0KPa + 2 * p.p1KPa) / 6000;
    return {sourceId: p.id, ownershipId: p.ownershipId, kind: p.kind, forceN: force, xLeverNmm, zLeverNmm, centroidXMm: force === 0 ? null : xLeverNmm / force, centroidZMm: force === 0 ? null : zLeverNmm / force};
  });
  const expectedForceN = sourceResultants.reduce((s, r) => s + r.forceN, 0), expectedXMomentNmm = sourceResultants.reduce((s, r) => s + r.xLeverNmm, 0), expectedZMomentNmm = sourceResultants.reduce((s, r) => s + r.zLeverNmm, 0);
  const integral = (p: BeamPatch) => (p.endMm - p.startMm) * (p.startNPerMm + p.endNPerMm) / 2;
  const residuals = {forceN: studPatches.flat().reduce((s, p) => s + integral(p), 0) - expectedForceN,
    xLeverNmm: studPatches.reduce((s, ps, i) => s + ps.reduce((n, p) => n + integral(p), 0) * o.studsMm[i], 0) - expectedXMomentNmm,
    zLeverNmm: studPatches.flat().reduce((s, p) => s + integral(p) * p.startMm + (p.endMm - p.startMm) ** 2 * (p.startNPerMm + 2 * p.endNPerMm) / 6, 0) - expectedZMomentNmm};
  const scale = Math.max(1, expectedForceN), lever = Math.max(1, o.lengthMm, o.heightMm);
  if (Math.abs(residuals.forceN) > scale * 1e-7 || Math.abs(residuals.xLeverNmm) > scale * lever * 1e-7 || Math.abs(residuals.zLeverNmm) > scale * lever * 1e-7) throw Error('SIDE_PRESSURE_PLYWOOD_TO_STUD_FORCE_OR_MOMENT_BALANCE_FAILED');
  const baseXs = [...new Set([0, o.lengthMm, ...o.patches.flatMap(p => [p.x0Mm, p.x1Mm])])].sort((a, b) => a - b), bases: number[] = [];
  for (let i = 1; i < baseXs.length; i++) bases.push(o.patches.filter(p => p.z0Mm === 0 && p.x0Mm <= baseXs[i - 1] && p.x1Mm >= baseXs[i]).reduce((s, p) => s + p.p0KPa, 0));
  const pressureBaseKPa = bases.every(v => v === bases[0]) ? bases[0] : null;
  canonical({expectedForceN, expectedXMomentNmm, expectedZMomentNmm, pressureBaseKPa, maximumPressureKPa, residuals, studPatches});
  return {panels, studPatches, transfers, segments, patches: clone(o.patches), sourceResultants, expectedForceN, expectedXMomentNmm, expectedZMomentNmm, pressureBaseKPa, maximumPressureKPa, residuals, constructionRelease: 'NO_GO' as const};
}
