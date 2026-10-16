import {analyzeBeam, type BeamAnalysis, type BeamInput} from './beam.js';
import {finite, uniqueIds} from './common.js';

export interface ReactionLink {
  supportId: string;
  target: {kind: 'MEMBER'; memberId: string; xMm: number} | {kind: 'TIE' | 'U_HEAD' | 'GROUND'; nodeId: string};
}
export interface PathMember {
  beam: BeamInput; links: ReactionLink[]; role: 'JOIST' | 'BEARER';
  placement: {axis: 'X' | 'Y'; origin: {xMm: number; yMm: number; zMm: number}};
}
export interface DeliveredReaction {
  nodeId: string; kind: 'TIE' | 'U_HEAD' | 'GROUND'; upstreamAnalysisId: string; upstreamRevision: string;
  supportId: string; coordinateMm: number; forceN: number; momentNmm: number;
  point: {xMm: number; yMm: number; zMm: number};
}
/** Explicit directed graph. A bearer is never silently replaced by a ledger.
 * Links locate reactions on receiving members; no total-load/leg-count shortcut.
 */
export function analyzeLoadPath(members: PathMember[]) {
  if (!members.length || members.length > 400) throw Error('1–400 actual members required');
  uniqueIds(members.map(m => ({id: m.beam.id})), 'members');
  if (new Set(members.map(m => m.beam.revision)).size !== 1) throw Error('STALE: mixed upstream/downstream revisions');
  const ids = new Set(members.map(m => m.beam.id));
  const point = (m: PathMember, x: number) => ({xMm: m.placement.origin.xMm + (m.placement.axis === 'X' ? x : 0),
    yMm: m.placement.origin.yMm + (m.placement.axis === 'Y' ? x : 0), zMm: m.placement.origin.zMm});
  for (const m of members) {
    if (!['JOIST', 'BEARER'].includes(m.role) || !m.placement || !['X', 'Y'].includes(m.placement.axis) ||
      Object.values(m.placement.origin).some(v => !Number.isFinite(v))) throw Error('Actual soffit member placement required');
    if (m.links.length !== m.beam.supports.length || new Set(m.links.map(l => l.supportId)).size !== m.links.length || m.links.some(l => !m.beam.supports.some(s => s.id === l.supportId))) throw Error('Every support requires exactly one downstream link');
    for (const l of m.links) if (l.target.kind === 'MEMBER') {
      if (!ids.has(l.target.memberId) || l.target.memberId === m.beam.id) throw Error('Unknown/self downstream member');
      const downstream = members.find(n => n.beam.id === (l.target as {memberId: string}).memberId)!;
      if (!(m.role === 'JOIST' && downstream.role === 'BEARER')) throw Error('Unsupported load-path transition');
      const sourcePoint = point(m, m.beam.supports.find(s => s.id === l.supportId)!.xMm), targetPoint = point(downstream, l.target.xMm);
      if (Math.hypot(sourcePoint.xMm - targetPoint.xMm, sourcePoint.yMm - targetPoint.yMm) > 1e-7) throw Error('Support is not on receiving bearer');
    } else if (!l.target.nodeId || !((m.role === 'BEARER' && l.target.kind === 'U_HEAD') || l.target.kind === 'GROUND')) throw Error('Unsupported terminal support');
  }
  const pending = [...members], completed = new Map<string, BeamAnalysis>();
  const incoming = new Map<string, {id: string; xMm: number; forceN: number}[]>(), reactions: DeliveredReaction[] = [], blockers: string[] = [];
  while (pending.length) {
    const index = pending.findIndex(m => members.filter(u => u.links.some(l => l.target.kind === 'MEMBER' && l.target.memberId === m.beam.id)).every(u => completed.has(u.beam.id)));
    if (index < 0) throw Error('Cyclic load path');
    const m = pending.splice(index, 1)[0], transferred = incoming.get(m.beam.id) ?? [];
    const result = analyzeBeam({...m.beam, points: [...m.beam.points, ...transferred]});
    completed.set(m.beam.id, result);
    for (const r of result.reactions) {
      const link = m.links.find(l => l.supportId === r.supportId)!, forceN = -r.forceN, momentNmm = -r.momentNmm;
      if (forceN < -1e-7) blockers.push(`${m.beam.id}/${r.supportId}:UPLIFT_CONNECTION_REQUIRED`);
      if (link.target.kind === 'MEMBER') {
        if (Math.abs(momentNmm) > 1e-6 || forceN < -1e-7) throw Error('BLOCKED_UNSUPPORTED: moment/uplift transfer needs a coupled node model');
        const list = incoming.get(link.target.memberId) ?? [];
        list.push({id: `from:${m.beam.id}:${r.supportId}`, xMm: link.target.xMm, forceN: Math.max(0, forceN)});
        incoming.set(link.target.memberId, list);
      } else reactions.push({nodeId: link.target.nodeId, kind: link.target.kind, upstreamAnalysisId: result.id, upstreamRevision: result.revision,
        supportId: r.supportId, coordinateMm: r.xMm, point: point(m, r.xMm), forceN, momentNmm});
    }
  }
  return {status: 'LOAD_PREVIEW' as const, analyses: [...completed.values()], reactions, blockers, constructionRelease: 'NO_GO' as const};
}

export function pairedContactForces(forceN: number, contactSpacingMm: number, eccentricityMm: number) {
  finite(forceN, 'tie force', true); finite(contactSpacingMm, 'contact centroid spacing');
  if (!Number.isFinite(eccentricityMm) || Math.abs(eccentricityMm) >= contactSpacingMm / 2) throw Error('BLOCKED_CONTACT_LOSS');
  return {rail1N: forceN * (.5 - eccentricityMm / contactSpacingMm), rail2N: forceN * (.5 + eccentricityMm / contactSpacingMm),
    status: 'LOAD_PREVIEW' as const, basis: 'RIGID_TWO_CONTACT_STATICS_ONLY', constructionRelease: 'NO_GO' as const};
}
