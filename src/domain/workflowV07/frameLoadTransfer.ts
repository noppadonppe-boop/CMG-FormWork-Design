import {canonical, identifier, signed} from './common.js';
import type {FrameAction, FrameNode, FrameVector} from './frameLinear.js';
import {analyzeLoadPath, type DeliveredReaction, type PathMember} from './loadPath.js';

export interface FrameHeadMapping {headNodeId: string; frameNodeId: string; offsetEvidenceRef: string | null}
/** Convert downward-positive soffit reactions to upward-positive global Z frame actions.
 * Each actual force is retained. A receiving-node offset creates r×F in the frame engine;
 * neither the force nor an upstream restraint moment is averaged or silently discarded.
 */
export function transferSoffitReactionsToFrame(reactions: DeliveredReaction[], members: PathMember[], nodes: FrameNode[], mapping: FrameHeadMapping[],
  context: {revisionId: string; stageId: string; loadCaseId: string; evidenceRef: string}): FrameAction[] {
  for (const k of ['revisionId', 'stageId', 'loadCaseId'] as const) identifier(context[k], k);
  if (typeof context.evidenceRef !== 'string' || !context.evidenceRef.trim() || context.evidenceRef.length > 2000) throw Error('Reaction-transfer idealization evidence required');
  if (!reactions.length || reactions.length > 1000) throw Error('Actual U-head reactions required');
  const ordered = (rows: DeliveredReaction[]) => [...rows].sort((a, b) => canonical([a.nodeId, a.upstreamAnalysisId, a.supportId]).localeCompare(canonical([b.nodeId, b.upstreamAnalysisId, b.supportId])));
  const recalculated = analyzeLoadPath(members).reactions.filter(r => r.kind === 'U_HEAD');
  if (canonical(ordered(reactions)) !== canonical(ordered(recalculated))) throw Error('UPSTREAM_REACTION_MAPPING_STALE_OR_TAMPERED');
  if (new Set(mapping.map(m => m.headNodeId)).size !== mapping.length) throw Error('Duplicate head-to-frame mapping');
  const used = new Set<string>();
  const actions = reactions.map(r => {
    if (r.kind !== 'U_HEAD' || r.upstreamRevision !== context.revisionId) throw Error('STALE_OR_UNSUPPORTED_UPSTREAM_REACTION');
    signed(r.forceN, 'actual head force'); signed(r.momentNmm, 'actual head moment');
    const m = members.find(m => m.role === 'BEARER' && m.beam.id === r.upstreamAnalysisId && m.beam.revision === context.revisionId);
    const support = m?.beam.supports.find(s => s.id === r.supportId && s.xMm === r.coordinateMm);
    const link = m?.links.find(l => l.supportId === r.supportId && l.target.kind === 'U_HEAD' && l.target.nodeId === r.nodeId);
    const map = mapping.find(m => m.headNodeId === r.nodeId), node = nodes.find(n => n.id === map?.frameNodeId);
    if (!m || !support || !link || !map || !node) throw Error('Missing actual upstream support/link or receiving frame node');
    if (!Array.isArray(node.pointMm) || node.pointMm.length !== 3) throw Error('Actual receiving frame coordinates required');
    node.pointMm.forEach(v => signed(v, 'receiving frame coordinate'));
    const p = [m.placement.origin.xMm + (m.placement.axis === 'X' ? support.xMm : 0),
      m.placement.origin.yMm + (m.placement.axis === 'Y' ? support.xMm : 0), m.placement.origin.zMm];
    const actual: FrameVector = [r.point.xMm, r.point.yMm, r.point.zMm]; actual.forEach(v => signed(v, 'actual reaction point'));
    if (Math.hypot(...p.map((v, i) => v - actual[i])) > 1e-7) throw Error('Reaction is not at its actual upstream support');
    const offset = actual.map((v, i) => v - node.pointMm[i]) as FrameVector;
    if (Math.hypot(...offset) > 1e-7 && !map.offsetEvidenceRef?.trim()) throw Error('Physical head offset/rigid transfer evidence required');
    const moment: FrameVector = m.placement.axis === 'X' ? [0, r.momentNmm, 0] : [-r.momentNmm, 0, 0];
    used.add(map.headNodeId);
    return {id: `HEAD:${r.upstreamAnalysisId}:${r.supportId}`, nodeId: node.id, revisionId: context.revisionId, stageId: context.stageId, loadCaseId: context.loadCaseId,
      evidenceRef: `${context.evidenceRef}; upstream ${r.upstreamAnalysisId}/${r.supportId}`, forceN: [0, 0, -r.forceN] as FrameVector, momentNmm: moment,
      application: offset.every(v => v === 0) ? 'AT_NODE' as const : {offsetMm: offset, evidenceRef: map.offsetEvidenceRef || context.evidenceRef}};
  });
  if (mapping.some(m => !used.has(m.headNodeId))) throw Error('Unused/stale head mapping has no actual reaction');
  return actions;
}
