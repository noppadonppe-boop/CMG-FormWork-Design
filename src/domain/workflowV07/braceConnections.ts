import type {FrameVector, LinearFrameInput} from './frameLinear.js';
import {assessResistanceEvidence, type ResistanceAssessment, type ResistanceEvidence} from './resistanceEvidence.js';

/** Brace end fixings and base anchors.
 *
 * Demands come from the solved frame: the axial force of every AXIAL_BAR at each end, and the
 * reaction at every restrained BASE node (uplift and horizontal resultant). Capacities are
 * reviewer evidence only; end eccentricity, slip, pin bearing and hardware geometry are not
 * modelled and stay as standing blockers.
 */
export interface BraceEndEvidence {I: ResistanceEvidence[] | null; J: ResistanceEvidence[] | null}
type Analysis = {input: LinearFrameInput; elements: {id: string; kind: string; nodeI: string; nodeJ: string; axialForceN: number | null}[];
  nodes: {id: string; reactionForceN: FrameVector; reactionMomentNmm: FrameVector}[]};

export interface BraceEndRecord {elementId: string; end: 'I' | 'J'; nodeId: string; axialForceN: number; tension: ResistanceAssessment; compression: ResistanceAssessment; status: 'INCOMPLETE' | 'SCREENED' | 'FAIL'}
export interface AnchorRecord {nodeId: string; upliftN: number; horizontalN: number; bearingN: number; uplift: ResistanceAssessment; horizontal: ResistanceAssessment; status: 'INCOMPLETE' | 'SCREENED' | 'FAIL'}

const pick = (list: ResistanceEvidence[] | null | undefined, quantity: ResistanceEvidence['quantity']) => {
  const rows = (list ?? []).filter(e => e.quantity === quantity);
  return rows.length > 1 ? 'DUPLICATE' as const : rows[0] ?? null;
};
function assess(list: ResistanceEvidence[] | null | undefined, quantity: 'AXIAL_TENSION' | 'AXIAL_COMPRESSION' | 'SHEAR_Y', demand: number, basis: 'SERVICE' | 'FACTORED', revision: string): ResistanceAssessment {
  const e = pick(list, quantity);
  if (e === 'DUPLICATE') return {quantity, demand, evidence: null, status: 'INCOMPLETE', utilization: null, blockers: ['DUPLICATE_RESISTANCE_QUANTITY_RECORD']};
  return assessResistanceEvidence(e, quantity, demand, basis, revision);
}
const worst = (...a: ResistanceAssessment[]) => a.some(x => x.status === 'FAIL') ? 'FAIL' as const : a.every(x => x.status === 'SCREENED') ? 'SCREENED' as const : 'INCOMPLETE' as const;

export function screenBraceConnections(input: {
  analysis: Analysis; actionBasis: 'SERVICE' | 'FACTORED';
  elements: {id: string; kind: string | null; role: string | null; endResistance?: BraceEndEvidence | null}[];
  nodes: {id: string; role: string | null; boundary: {kind: string}[]; anchorResistance?: ResistanceEvidence[] | null}[];
  slackElementIds?: string[];
}) {
  const revision = input.analysis.input.revisionId, blockers: string[] = ['BRACE_END_ECCENTRICITY_PIN_BEARING_SLIP_AND_HARDWARE_GEOMETRY_NOT_MODELED', 'ANCHOR_EMBEDMENT_EDGE_DISTANCE_AND_SUBSTRATE_RESISTANCE_METHODS_REQUIRED'];
  const braces = input.elements.filter(e => e.kind === 'AXIAL_BAR');
  const ends: BraceEndRecord[] = braces.flatMap(e => {
    const solved = input.analysis.elements.find(x => x.id === e.id);
    // A slack tension-only brace carries nothing; its ends are reported with zero demand but still need evidence for the case it engages.
    const n = solved?.axialForceN ?? 0, draft = input.analysis.input.elements.find(x => x.id === e.id);
    const nodeOf = (end: 'I' | 'J') => (solved ?? draft)?.[end === 'I' ? 'nodeI' : 'nodeJ'] ?? '';
    return (['I', 'J'] as const).map(end => {
      const tension = assess(e.endResistance?.[end], 'AXIAL_TENSION', Math.max(0, n), input.actionBasis, revision);
      const compression = assess(e.endResistance?.[end], 'AXIAL_COMPRESSION', Math.max(0, -n), input.actionBasis, revision);
      return {elementId: e.id, end, nodeId: nodeOf(end), axialForceN: n, tension, compression, status: worst(tension, compression)};
    });
  });
  const anchors: AnchorRecord[] = input.nodes.filter(nd => nd.role === 'BASE' && nd.boundary.some(b => b.kind === 'FIXED' || b.kind === 'PRESCRIBED')).map(nd => {
    const solved = input.analysis.nodes.find(x => x.id === nd.id), r = solved?.reactionForceN ?? [0, 0, 0];
    // Reaction acts on the structure: +Z pushes the base up (bearing); −Z means the anchor holds the base down.
    const upliftN = Math.max(0, -r[2]), bearingN = Math.max(0, r[2]), horizontalN = Math.hypot(r[0], r[1]);
    const uplift = assess(nd.anchorResistance, 'AXIAL_TENSION', upliftN, input.actionBasis, revision);
    const horizontal = assess(nd.anchorResistance, 'SHEAR_Y', horizontalN, input.actionBasis, revision);
    return {nodeId: nd.id, upliftN, horizontalN, bearingN, uplift, horizontal, status: worst(uplift, horizontal)};
  });
  for (const id of input.slackElementIds ?? []) blockers.push(`${id}:TENSION_ONLY_BRACE_SLACK_IN_THIS_CASE_NO_FORCE_TRANSFERRED`);
  const all = [...ends.map(e => e.status), ...anchors.map(a => a.status)];
  return {engineVersion: 'brace-connections-1' as const, ends, anchors, status: all.includes('FAIL') ? 'FAIL' as const : all.length && all.every(s => s === 'SCREENED') ? 'SCREENED' as const : 'INCOMPLETE' as const,
    blockers: [...new Set([...blockers, ...ends.flatMap(e => [...e.tension.blockers, ...e.compression.blockers].map(b => `${e.elementId}:${e.end}:${b}`)), ...anchors.flatMap(a => [...a.uplift.blockers, ...a.horizontal.blockers].map(b => `${a.nodeId}:${b}`))])],
    constructionRelease: 'NO_GO' as const};
}

/** Tension-only brace active set: analyse, drop AXIAL_BAR elements flagged tension-only that
 * end up in compression, repeat until the set is stable. Removing a brace that leaves a
 * mechanism makes the solve fail, which is reported rather than hidden. */
export function tensionOnlyActiveSet<A extends {elements: {id: string; axialForceN: number | null}[]; nodes: {id: string; displacementMm: FrameVector; pointMm: FrameVector}[]}>(
  input: LinearFrameInput, tensionOnlyIds: Set<string>, solve: (input: LinearFrameInput) => A, maxIterations = 20) {
  let slack = new Set<string>(), analysis = solve(input), iterations = 1;
  if (!tensionOnlyIds.size) return {analysis, input, slack: [] as string[], iterations};
  for (; iterations <= maxIterations; iterations++) {
    const next = new Set<string>();
    for (const id of tensionOnlyIds) {
      const solved = analysis.elements.find(e => e.id === id);
      if (solved) {if ((solved.axialForceN ?? 0) < -1e-9) next.add(id); continue;}
      // Inactive: re-engage when the node gap along the bar is closing into tension.
      const e = input.elements.find(x => x.id === id)!, ni = analysis.nodes.find(n => n.id === e.nodeI)!, nj = analysis.nodes.find(n => n.id === e.nodeJ)!;
      const axis = nj.pointMm.map((v, d) => v - ni.pointMm[d]), L = Math.hypot(...axis), elongation = axis.reduce((s, v, d) => s + v / L * (nj.displacementMm[d] - ni.displacementMm[d]), 0);
      if (elongation <= 1e-12) next.add(id);
    }
    if (next.size === slack.size && [...next].every(id => slack.has(id))) break;
    slack = next;
    analysis = solve({...input, elements: input.elements.filter(e => !slack.has(e.id))});
  }
  if (iterations > maxIterations) throw Error('TENSION_ONLY_BRACE_ACTIVE_SET_DID_NOT_CONVERGE');
  return {analysis, input: {...input, elements: input.elements.filter(e => !slack.has(e.id))}, slack: [...slack].sort(), iterations};
}
