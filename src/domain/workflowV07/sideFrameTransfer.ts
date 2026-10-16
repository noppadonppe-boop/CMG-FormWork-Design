import {canonical, identifier, record, signed} from './common.js';
import type {FrameAction, FrameNode, FrameVector} from './frameLinear.js';
import {pairFaces} from './geometry.js';
import type {WorkflowModel} from './model.js';
import {analyzeSideLayout, type SideEndpoint, type SideNode} from './sideLayout.js';

export interface SideFrameMapping extends SideEndpoint {
  frameNodeId: string; connectionEvidenceRef: string; offsetEvidenceRef: string | null;
}
export interface SideFrameDefinition {
  schemaVersion: '1'; mode: 'DOWNSTREAM_SIDE_SUPPORTS_ONLY' | null;
  separationEvidenceRef: string; mappings: SideFrameMapping[];
}
export const emptySideFrame = (): SideFrameDefinition => ({schemaVersion: '1', mode: null, separationEvidenceRef: '', mappings: []});
export const sideSupportKey = (s: SideEndpoint) => canonical([s.faceId, s.walerId, s.supportId]);
function text(v: unknown, max: number) {if (typeof v !== 'string' || v.length > max) throw Error('Invalid side/frame text');}
function exact(raw: unknown, keys: string[]) {
  const v = record(raw);
  if (keys.some(k => !Object.hasOwn(v, k)) || Object.keys(v).some(k => !keys.includes(k))) throw Error('Side/frame unknown/missing fields or authority metadata');
  return v;
}
export function validateSideFrame(raw: unknown): asserts raw is SideFrameDefinition {
  const d = exact(raw, Object.keys(emptySideFrame()));
  if (d.schemaVersion !== '1' || ![null, 'DOWNSTREAM_SIDE_SUPPORTS_ONLY'].includes(d.mode as string | null) || !Array.isArray(d.mappings) || d.mappings.length > 1000) throw Error('Invalid side/frame schema/mode or 1000-mapping limit');
  text(d.separationEvidenceRef, 2000);
  for (const m of d.mappings) {
    const r = exact(m, ['faceId', 'walerId', 'supportId', 'frameNodeId', 'connectionEvidenceRef', 'offsetEvidenceRef']);
    for (const k of ['faceId', 'walerId', 'supportId', 'frameNodeId']) text(r[k], 300);
    text(r.connectionEvidenceRef, 2000); if (r.offsetEvidenceRef !== null) text(r.offsetEvidenceRef, 2000);
  }
  const keys = (d.mappings as SideFrameMapping[]).filter(m => m.faceId && m.walerId && m.supportId).map(sideSupportKey);
  if (new Set(keys).size !== keys.length) throw Error('Duplicate side support mapping');
  if (canonical(d).length > 500000) throw Error('Side/frame 500000-character limit; no mappings omitted');
}
const cross = (a: FrameVector, b: FrameVector): FrameVector => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** One-way handoff of independently analysed waler support demands. The downstream frame
 * excludes those plywood/stud/waler members. It does not feed support displacement back
 * into their analysis, solve corner contact, or establish a clamp/anchor resistance method.
 * Outward-positive waler demand becomes load ON the support frame, without averaging.
 */
export function transferSideReactionsToFrame(model: WorkflowModel, supplied: SideNode[], nodes: FrameNode[], definition: SideFrameDefinition,
  context: {revisionId: string; stageId: string; loadCaseId: string}) {
  validateSideFrame(definition);
  for (const k of ['revisionId', 'stageId', 'loadCaseId'] as const) identifier(context[k], k);
  const layout = model.sideLayout;
  if (context.revisionId !== model.revisionId || !layout || layout.stageId !== context.stageId || layout.loadCaseId !== context.loadCaseId) throw Error('CURRENT_SAME_STAGE_CASE_SIDE_REACTIONS_REQUIRED');
  if (!['COLUMN_YOKE', 'GROUND_BRACED'].includes(model.sideTopology ?? '') || layout.ties.length) throw Error('EXPLICIT_YOKE_OR_GROUND_BRACED_TOPOLOGY_WITHOUT_TIES_REQUIRED');
  if (definition.mode !== 'DOWNSTREAM_SIDE_SUPPORTS_ONLY' || !definition.separationEvidenceRef.trim()) throw Error('DOWNSTREAM_FRAME_SCOPE_AND_NO_DUPLICATED_SIDE_MEMBERS_EVIDENCE_REQUIRED');
  const side = analyzeSideLayout(model, layout), actual = side.nodes;
  const ordered = (v: SideNode[]) => [...v].sort((a, b) => sideSupportKey(a).localeCompare(sideSupportKey(b)));
  if (!actual.length || actual.length > 1000 || canonical(ordered(supplied)) !== canonical(ordered(actual))) throw Error('SIDE_REACTIONS_STALE_TAMPERED_OR_INCOMPLETE');
  const faces = pairFaces(model.vertices, model.heightMm).faces, used = new Set<string>();
  const receivingPoints = new Map<string, FrameVector>();
  const sources = ordered(actual).map((s, i) => {
    const key = sideSupportKey(s), mapping = definition.mappings.find(m => sideSupportKey(m) === key);
    const node = nodes.find(n => n.id === mapping?.frameNodeId), face = faces.find(f => f.id === s.faceId);
    if (!mapping || !node || !face) throw Error('Missing actual side support or receiving frame mapping');
    if (!mapping.connectionEvidenceRef.trim()) throw Error('Actual waler-to-downstream-frame connection evidence required');
    const pointMm: FrameVector = [s.point.xMm, s.point.yMm, s.point.zMm];
    [...pointMm, ...node.pointMm, s.forceN, s.momentNmm, s.normal.x, s.normal.y].forEach(v => signed(v, 'actual side/frame action/coordinate'));
    const previous = receivingPoints.get(node.id);
    if (previous && previous.some((v, d) => v !== pointMm[d])) throw Error('DISTINCT_SIDE_SUPPORT_POINTS_REQUIRE_DISTINCT_FRAME_NODES');
    receivingPoints.set(node.id, pointMm);
    const forceN: FrameVector = [s.forceN * s.normal.x, s.forceN * s.normal.y, 0];
    // The 1D waler couple follows tangent × outward normal in global coordinates.
    const momentNmm: FrameVector = [0, 0, s.momentNmm * ((face.b.x - face.a.x) * s.normal.y - (face.b.y - face.a.y) * s.normal.x) / face.lengthMm];
    const offsetMm = pointMm.map((v, d) => v - node.pointMm[d]) as FrameVector;
    if (offsetMm.some(v => v !== 0) && !mapping.offsetEvidenceRef?.trim()) throw Error('Physical side support offset/rigid transfer evidence required');
    const action: FrameAction = {id: `SIDE:${i + 1}`, nodeId: node.id, ...context, evidenceRef: mapping.connectionEvidenceRef, forceN, momentNmm,
      application: offsetMm.every(v => v === 0) ? 'AT_NODE' : {offsetMm, evidenceRef: mapping.offsetEvidenceRef!}};
    used.add(key);
    return {source: s, upstreamRevision: model.revisionId, mapping, action};
  });
  if (definition.mappings.some(m => !used.has(sideSupportKey(m)))) throw Error('Unused/stale side support mapping');
  // Check full signed force and moment resultants at actual application points. The kernel
  // applies offset × force once; that couple is NOT added to action.momentNmm here.
  const originMm = sources[0].source.point;
  const origin: FrameVector = [originMm.xMm, originMm.yMm, originMm.zMm];
  const sourceForceN: FrameVector = [0, 0, 0], sourceMomentNmm: FrameVector = [0, 0, 0];
  const pressureForceN: FrameVector = [0, 0, 0], pressureMomentNmm: FrameVector = [0, 0, 0];
  const forceResidualN: FrameVector = [0, 0, 0], momentResidualNmm: FrameVector = [0, 0, 0];
  let forceScale = 1, momentScale = 1;
  for (const f of side.faces) {
    const p = f.pressureAction, force: FrameVector = [p.forceN * p.normal.x, p.forceN * p.normal.y, 0];
    const moment = p.centroid ? cross([p.centroid.x - origin[0], p.centroid.y - origin[1], p.centroid.zMm - origin[2]], force) : [0, 0, 0];
    for (let d = 0; d < 3; d++) {pressureForceN[d] += force[d]; pressureMomentNmm[d] += moment[d];}
    forceScale += Math.hypot(...force); momentScale += Math.hypot(...moment);
  }
  for (const row of sources) {
    const a = row.action, p = row.source.point, target = nodes.find(n => n.id === a.nodeId)!;
    const sourceArm: FrameVector = [p.xMm - origin[0], p.yMm - origin[1], p.zMm - origin[2]];
    const targetArm = target.pointMm.map((v, d) => v - origin[d]) as FrameVector;
    const originalLever = cross(sourceArm, a.forceN), targetLever = cross(targetArm, a.forceN);
    const offsetLever = a.application === 'AT_NODE' ? [0, 0, 0] : cross(a.application.offsetMm, a.forceN);
    for (let d = 0; d < 3; d++) {
      sourceForceN[d] += a.forceN[d]; sourceMomentNmm[d] += a.momentNmm[d] + originalLever[d];
      forceResidualN[d] += a.forceN[d]; momentResidualNmm[d] += a.momentNmm[d] + targetLever[d] + offsetLever[d];
    }
    forceScale += Math.hypot(...a.forceN); momentScale += Math.hypot(...a.momentNmm) + Math.hypot(...originalLever) + Math.hypot(...targetLever) + Math.hypot(...offsetLever);
  }
  for (let d = 0; d < 3; d++) {forceResidualN[d] -= pressureForceN[d]; momentResidualNmm[d] -= pressureMomentNmm[d];}
  const result = {revisionId: model.revisionId, stageId: layout.stageId, loadCaseId: layout.loadCaseId, mode: definition.mode,
    separationEvidenceRef: definition.separationEvidenceRef, sources, actions: sources.map(s => s.action),
    missingPhysicalFaceIds: faces.filter(f => !layout.faces.some(s => s.faceId === f.id)).map(f => f.id),
    equilibrium: {originMm: origin, pressureForceN, pressureMomentNmm, sourceForceN, sourceMomentNmm, forceResidualN, momentResidualNmm}};
  canonical(result);
  if (Math.hypot(...forceResidualN) > forceScale * 1e-7 || Math.hypot(...momentResidualNmm) > momentScale * 1e-7) throw Error('SIDE_FRAME_FORCE_OR_MOMENT_TRANSFER_BALANCE_FAILED');
  return result;
}
