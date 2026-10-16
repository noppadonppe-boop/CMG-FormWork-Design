import {canonical, clone, finite, record, signed} from './common.js';
import {analyzeBearingContact} from './bearingContact.js';
import {analyzeLoadPath, type DeliveredReaction} from './loadPath.js';
import type {WorkflowModel} from './model.js';
import type {evaluateRinglockAssembly} from './ringlockAssembly.js';
import {ringlockAssemblyInputDefinition} from './ringlockAssembly.js';
import type {RequiredCheck} from './coverage.js';
import {buildSoffitCandidate} from './soffit.js';

type Nullable3 = [number | null, number | null, number | null];
/** Measured head-seat geometry and an explicit conditional contact hypothesis, never a rating. */
export interface HeadBearingDefinition {
  schemaVersion: '1'; productRef: string; geometryEvidenceRef: string;
  layout: 'SINGLE_FLAT_BEARER' | 'MULTIPLE_BEARERS_OR_RAILS' | null;
  seatCenterMm: Nullable3; seatLocalX: [number | null, number | null];
  plateLengthMm: number | null; plateWidthMm: number | null; plateThicknessMm: number | null;
  cavityOffsetYMm: number | null; insideClearWidthMm: number | null; minimumSideClearanceMm: number | null;
  bearerWidthMm: number | null; bearerDepthMm: number | null; bearerCenterOffsetYMm: number | null; bearerGeometryEvidenceRef: string;
  contactCenterMm: Nullable3; contactLengthMm: number | null; contactWidthMm: number | null;
  sideBlocking: 'BOTH_SIDES' | 'NONE' | null; sideBlockingEvidenceRef: string;
  pressureModel: 'RIGID_HORIZONTAL_RECTANGLE_AFFINE_COMPRESSION_ONLY' | null; pressureModelEvidenceRef: string;
}
export const emptyHeadBearing = (): HeadBearingDefinition => ({schemaVersion: '1', productRef: '', geometryEvidenceRef: '', layout: null,
  seatCenterMm: [null, null, null], seatLocalX: [null, null], plateLengthMm: null, plateWidthMm: null, plateThicknessMm: null,
  cavityOffsetYMm: null, insideClearWidthMm: null, minimumSideClearanceMm: null, bearerWidthMm: null, bearerDepthMm: null, bearerCenterOffsetYMm: null, bearerGeometryEvidenceRef: '',
  contactCenterMm: [null, null, null], contactLengthMm: null, contactWidthMm: null, sideBlocking: null, sideBlockingEvidenceRef: '', pressureModel: null, pressureModelEvidenceRef: ''});
export function validateHeadBearing(raw: unknown): asserts raw is HeadBearingDefinition {
  const r = record(raw), keys = Object.keys(emptyHeadBearing());
  if (keys.some(k => !Object.hasOwn(r, k)) || Object.keys(r).some(k => !keys.includes(k)) || r.schemaVersion !== '1') throw Error('Invalid head-bearing schema, missing/unknown fields or authority metadata');
  if (![null, 'SINGLE_FLAT_BEARER', 'MULTIPLE_BEARERS_OR_RAILS'].includes(r.layout as null | string) || ![null, 'BOTH_SIDES', 'NONE'].includes(r.sideBlocking as null | string) || ![null, 'RIGID_HORIZONTAL_RECTANGLE_AFFINE_COMPRESSION_ONLY'].includes(r.pressureModel as null | string)) throw Error('Invalid head-bearing layout, retention or contact model');
  for (const k of ['productRef', 'geometryEvidenceRef', 'bearerGeometryEvidenceRef', 'sideBlockingEvidenceRef', 'pressureModelEvidenceRef']) if (typeof r[k] !== 'string' || (r[k] as string).length > 2000) throw Error('Invalid head-bearing source');
  for (const k of ['seatCenterMm', 'seatLocalX', 'contactCenterMm']) {const a = r[k]; if (!Array.isArray(a) || a.length !== (k === 'seatLocalX' ? 2 : 3)) throw Error('Explicit head-bearing vector slots required'); a.forEach(v => {if (v !== null) signed(v, 'head-bearing coordinate/axis');});}
  for (const k of ['plateLengthMm', 'plateWidthMm', 'plateThicknessMm', 'insideClearWidthMm', 'minimumSideClearanceMm', 'bearerWidthMm', 'bearerDepthMm', 'contactLengthMm', 'contactWidthMm']) if (r[k] !== null) finite(r[k], k, k === 'minimumSideClearanceMm');
  if (r.cavityOffsetYMm !== null) signed(r.cavityOffsetYMm, 'actual cavity offset');
  if (r.bearerCenterOffsetYMm !== null) signed(r.bearerCenterOffsetYMm, 'actual bearer body offset from analysis line');
}
type V3 = [number, number, number];
const vec = (v: Nullable3): V3 => v.map(n => signed(n, 'actual head/contact coordinate')) as V3;
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: number[], b: number[]) => a.reduce((s, v, i) => s + v * b[i], 0);
type Wrench = {pointMm: V3; forceN: V3; momentNmm: V3};
function translate(w: Wrench, pointMm: V3): Wrench {
  const arm = w.pointMm.map((v, i) => v - pointMm[i]) as V3, extra = cross(arm, w.forceN);
  const result = {pointMm, forceN: [...w.forceN] as V3, momentNmm: w.momentNmm.map((v, i) => v + extra[i]) as V3}; canonical(result); return result;
}
function boundEnvelope(m: WorkflowModel) {
  const b = m.soffitLayout?.bearer.binding; if (!b) return null;
  if (b.orientationDeg === null) throw Error('Bound bearer orientation is unknown');
  if (b.sectionMode === 'MEASURED_TIMBER_RECT') return {family: 'TIMBER_RECT', widthMm: b.orientationDeg === 0 ? b.actualWidthMm : b.actualDepthMm, depthMm: b.orientationDeg === 0 ? b.actualDepthMm : b.actualWidthMm};
  const s = b.section?.effective; if (!s) throw Error('Bound bearer section is missing');
  if (s.family === 'CHS') throw Error('CHS_CURVED_SEAT_SADDLE_RETAINER_AND_CONTACT_MODEL_REQUIRED');
  return {family: String(s.family), widthMm: b.orientationDeg === 0 ? s.B_mm : s.H_mm, depthMm: b.orientationDeg === 0 ? s.H_mm : s.B_mm};
}
/** One-way actual bearer reactions only. No guessed head plate, seat, friction, restraint or capacity. */
export function evaluateHeadBearings(m: WorkflowModel, assembly: ReturnType<typeof evaluateRinglockAssembly>, delivered: DeliveredReaction[] | null) {
  const a = m.ringlockAssembly!;
  const blockers = ['HEAD_CONTACT_DEMAND_ONLY_PLATE_BENDING_LOCAL_BEARING_SPINDLE_THREAD_AND_SYSTEM_RESISTANCE_UNVERIFIED',
    'HEAD_BLOCKING_STIFFNESS_FRICTION_ROLLING_TORSION_AND_CONNECTION_CAPACITY_UNVERIFIED', 'HEAD_CONTACT_OR_SETTLEMENT_FEEDBACK_TO_BEARER_AND_FRAME_NOT_MODELED'];
  let reactions: DeliveredReaction[] | null = null;
  // Recompute once only for authored contact records. An empty draft cannot invent a source force.
  if (a.legs.some(l => l.headBearing != null)) try {
    if (!assembly.current || a.revisionId !== m.revisionId || a.inputDefinition !== ringlockAssemblyInputDefinition(m) || !delivered || !m.soffitLayout || a.stageId !== m.soffitLayout.stageId || a.loadCaseId !== m.soffitLayout.loadCaseId) throw Error('Current same Stage/case assembly and soffit analysis required');
    const built = buildSoffitCandidate(m, m.soffitLayout);
    if (canonical(built.members) !== canonical(m.members) || canonical(built.actions) !== canonical(m.actions) || canonical(built.ringlock.legs) !== canonical(m.ringlock?.legs ?? null)) throw Error('Authored soffit and actual member/action/head graph differ');
    const actual = analyzeLoadPath(m.members).reactions.filter(r => r.kind === 'U_HEAD');
    const ordered = (rows: DeliveredReaction[]) => [...rows].sort((x, y) => canonical([x.nodeId, x.upstreamAnalysisId, x.supportId]).localeCompare(canonical([y.nodeId, y.upstreamAnalysisId, y.supportId])));
    if (canonical(ordered(actual)) !== canonical(ordered(delivered.filter(r => r.kind === 'U_HEAD'))) || actual.some(r => r.upstreamRevision !== m.revisionId)) throw Error('Actual head reaction source is stale, missing or altered');
    reactions = actual;
  } catch (e) {blockers.push(`HEAD_SOURCE:${(e as Error).message}`);}
  const rows = assembly.rows.map(row => {
    const leg = a.legs.find(l => l.legId === row.legId), d = leg?.headBearing ?? null, issues: string[] = [];
    let source: Wrench | null = null, shaftDemand: Wrench | null = null, contactDemand: Wrench | null = null;
    let sourceLink: {upstreamAnalysisId: string; upstreamRevision: string; supportId: string; stationMm: number; headNodeId: string; stageId: string; loadCaseId: string} | null = null;
    let contact: ReturnType<typeof analyzeBearingContact> | null = null;
    let geometry: {leftClearanceMm: number; rightClearanceMm: number; requiredSideClearanceMm: number; plateMarginsMm: number[]; bearerMarginsMm: number[]; contactAreaMm2: number; localY: [number, number]} | null = null;
    let failed = false, geometryReady = false;
    try {
      if (!leg) throw Error('ACTUAL_U_HEAD_SEAT_BEARING_AND_BLOCKING_DATA_REQUIRED');
      if (!row.frameGeometryReady || !reactions) throw Error('Current closed assembly and verified upstream source required');
      const actual = reactions.filter(r => r.nodeId === row.headNodeId);
      if (actual.length !== 1) throw Error('Exactly one actual bearer support per head required; combined/coupled rails need a coupled contact model');
      const r = actual[0], member = m.members.find(s => s.role === 'BEARER' && s.beam.id === r.upstreamAnalysisId);
      const support = member?.beam.supports.find(s => s.id === r.supportId && s.xMm === r.coordinateMm), link = member?.links.find(l => l.supportId === r.supportId && l.target.kind === 'U_HEAD' && l.target.nodeId === row.headNodeId);
      if (!member || !support || !link || member.beam.revision !== m.revisionId) throw Error('Actual current bearer support and U-head link required');
      sourceLink = {upstreamAnalysisId: r.upstreamAnalysisId, upstreamRevision: r.upstreamRevision, supportId: r.supportId, stationMm: r.coordinateMm, headNodeId: r.nodeId, stageId: a.stageId, loadCaseId: a.loadCaseId};
      source = {pointMm: [r.point.xMm, r.point.yMm, r.point.zMm], forceN: [0, 0, -r.forceN], momentNmm: member.placement.axis === 'X' ? [0, r.momentNmm, 0] : [-r.momentNmm, 0, 0]}; canonical(source);
      shaftDemand = translate(source, [leg.xMm, leg.yMm, leg.headBearingElevationMm]);
      if (!d) throw Error('ACTUAL_U_HEAD_SEAT_BEARING_AND_BLOCKING_DATA_REQUIRED'); validateHeadBearing(d);
      if (!d.productRef.trim() || d.productRef !== leg.headJack.productRef || !d.geometryEvidenceRef.trim() || !d.bearerGeometryEvidenceRef.trim()) throw Error('Actual same head product and measured head/bearer geometry sources required');
      if (d.layout !== 'SINGLE_FLAT_BEARER') throw Error('MULTIPLE_ROUND_OR_UNKNOWN_BEARERS_REQUIRE_ACTUAL_COUPLED_OR_SADDLE_CONTACT_MODEL');
      const p = vec(d.seatCenterMm), c = vec(d.contactCenterMm), x = d.seatLocalX.map(v => signed(v, 'explicit U-head open axis')), y: [number, number] = [-x[1], x[0]];
      if (Math.abs(Math.hypot(...x) - 1) > 1e-9) throw Error('Explicit unit horizontal U-head open axis required');
      const beamAxis = member.placement.axis === 'X' ? [1, 0] : [0, 1];
      if (Math.abs(x[0] * beamAxis[1] - x[1] * beamAxis[0]) > 1e-9) throw Error('BLOCKED_UNSUPPORTED_OBLIQUE_BEARER_THROUGH_U_HEAD');
      if (Math.abs(p[2] - leg.headBearingElevationMm) > 1e-7 || Math.abs(c[2] - p[2]) > 1e-7 || Math.abs(source.pointMm[2] - p[2]) > 1e-7) throw Error('Actual plate/contact/bearer analysis bearing planes must close without silent height shifts');
      const L = finite(d.plateLengthMm, 'actual plate length'), W = finite(d.plateWidthMm, 'actual plate width'); finite(d.plateThicknessMm, 'actual plate thickness');
      const b = finite(d.bearerWidthMm, 'actual bearer width'), depth = finite(d.bearerDepthMm, 'actual bearer depth'), CL = finite(d.contactLengthMm, 'actual bearing length'), CW = finite(d.contactWidthMm, 'actual flat bearing width');
      if (Math.abs(depth - finite(leg.upperStack.bearerDepthMm, 'installed bearer depth')) > 1e-7) throw Error('Measured bearer depth differs from installed stack');
      const bound = boundEnvelope(m);
      if (bound && (Math.abs(b - finite(bound.widthMm, 'bound physical bearer width')) > 1e-7 || Math.abs(depth - finite(bound.depthMm, 'bound physical bearer depth')) > 1e-7)) throw Error('Measured bearer envelope conflicts with current bound section/orientation');
      const cavity = signed(d.cavityOffsetYMm, 'actual cavity offset from plate centre'), inside = finite(d.insideClearWidthMm, 'actual clear opening'), clearance = finite(d.minimumSideClearanceMm, 'declared side clearance', true);
      const bodyOffsetY = signed(d.bearerCenterOffsetYMm, 'actual body-centre offset from bearer analysis line');
      const bodyLocalY = dot(source.pointMm.slice(0, 2).map((v, i) => v - p[i]), y) + bodyOffsetY, contactLocal = [dot(c.slice(0, 2).map((v, i) => v - p[i]), x), dot(c.slice(0, 2).map((v, i) => v - p[i]), y)];
      const left = bodyLocalY - b / 2 - (cavity - inside / 2), right = cavity + inside / 2 - (bodyLocalY + b / 2);
      const plateMargins = [L / 2 + contactLocal[0] - CL / 2, L / 2 - contactLocal[0] - CL / 2, W / 2 + contactLocal[1] - CW / 2, W / 2 - contactLocal[1] - CW / 2];
      const station = (member.placement.axis === 'X' ? c[0] - member.placement.origin.xMm : c[1] - member.placement.origin.yMm), widthOffset = dot(c.slice(0, 2).map((v, i) => v - source!.pointMm[i]), y) - bodyOffsetY;
      const bearerMargins = [station - CL / 2, member.beam.lengthMm - station - CL / 2, b / 2 + widthOffset - CW / 2, b / 2 - widthOffset - CW / 2];
      geometry = {leftClearanceMm: left, rightClearanceMm: right, requiredSideClearanceMm: clearance, plateMarginsMm: plateMargins, bearerMarginsMm: bearerMargins, contactAreaMm2: finite(CL * CW, 'actual bearing area'), localY: y}; canonical(geometry);
      if (left < clearance - 1e-7 || right < clearance - 1e-7) {failed = true; issues.push('BEARER_ENVELOPE_EXCEEDS_ACTUAL_U_HEAD_OPENING_OR_REQUIRED_SIDE_CLEARANCE');}
      if (plateMargins.some(v => v < -1e-7)) {failed = true; issues.push('DECLARED_CONTACT_PATCH_OUTSIDE_ACTUAL_HEAD_PLATE');}
      if (bearerMargins.some(v => v < -1e-7)) {failed = true; issues.push('DECLARED_CONTACT_PATCH_OUTSIDE_ACTUAL_BEARER_END_OR_FACE');}
      geometryReady = !failed;
      if (d.sideBlocking !== 'BOTH_SIDES' || !d.sideBlockingEvidenceRef.trim()) issues.push('ACTUAL_TWO_SIDED_BLOCKING_AND_RETENTION_EVIDENCE_REQUIRED');
      if (!geometryReady) throw Error('CONTACT_GEOMETRY_CONFLICT_NO_PRESSURE_SUBSTITUTION');
      contactDemand = translate(source, c);
      if (d.pressureModel !== 'RIGID_HORIZONTAL_RECTANGLE_AFFINE_COMPRESSION_ONLY' || !d.pressureModelEvidenceRef.trim()) throw Error('Declared flat rigid contact law and applicability evidence required');
      contact = analyzeBearingContact({lengthXMm: CL, widthYMm: CW, compressionN: -contactDemand.forceN[2], loadMxNmm: dot(contactDemand.momentNmm.slice(0, 2), x), loadMyNmm: dot(contactDemand.momentNmm.slice(0, 2), y)});
      if (contact.status === 'FAIL') failed = true;
    } catch (e) {issues.push((e as Error).message);}
    return {legId: row.legId, headNodeId: row.headNodeId, definition: clone(d), sourceLink, source, shaftDemand, contactDemand, geometry, geometryReady, contact, issues, status: failed ? 'FAIL' as const : 'BLOCKED' as const};
  });
  const requiredChecks: RequiredCheck[] = [];
  for (const spec of m.checkCatalogue?.specifications ?? []) if ((spec.appliesTo === 'ALL' || spec.appliesTo.split('|').includes(m.elementType)) && (['SOFFIT-06', 'SOFFIT-07', 'SOFFIT-08', 'RINGLOCK-01', 'RINGLOCK-02', 'RINGLOCK-05', 'RINGLOCK-15'].includes(spec.id) || spec.group === 'TYPICAL')) {
    for (const row of rows) {const leg = a.legs.find(l => l.legId === row.legId);
      requiredChecks.push({memberId: `HEAD_BEARING:${canonical([row.legId, row.headNodeId])}`, checkId: spec.id, loadCaseId: a.loadCaseId, revision: m.revisionId,
        applicability: {stageId: a.stageId, analysisCase: m.analysisCase ?? null, sourceRevision: a.revisionId, headNodeId: row.headNodeId, legId: row.legId,
          definition: row.definition, sourceLink: row.sourceLink, headJack: leg?.headJack ?? null,
          shaftPointMm: leg ? [leg.xMm, leg.yMm, leg.headBearingElevationMm] : null, method: 'DECLARED_SINGLE_FLAT_BEARER_U_HEAD_GEOMETRY_AND_CONTACT_DEMAND'}});
    }
  }
  return {revisionId: m.revisionId, stageId: a.stageId, loadCaseId: a.loadCaseId, rows, requiredChecks, blockers, status: rows.some(r => r.status === 'FAIL') ? 'FAIL' as const : 'BLOCKED' as const, constructionRelease: 'NO_GO' as const, constructionEligible: false as const};
}
