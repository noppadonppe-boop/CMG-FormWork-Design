import {readFileSync} from 'node:fs';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect, it} from 'vitest';
import {FrameResults} from '../src/components/FrameResults';
import {emptyFrameElement, frameGeometryFromSide, stampFrameLayout, type FrameActionDraft} from '../src/domain/workflowV07/frameWorkflow';
import {previewWorkflow, regenerateDraftLayouts, type WorkflowModel} from '../src/domain/workflowV07/model';
import {emptyCouplingCorner, emptySideCoupling, sideCouplingReference, type SideCouplingDefinition} from '../src/domain/workflowV07/sideCoupled';
import {analyzeSideLayout, stampSideLayout} from '../src/domain/workflowV07/sideLayout';
import {emptySideLocalEvidence} from '../src/domain/workflowV07/sideLocalChecks';
import {emptyPressureSource} from '../src/domain/workflowV07/sidePressure';
import {sideDefinition, sideFace, sideModel} from './fixtures/workflow-v07-side';

// SYNTHETIC stiffness values only: not a tie product, connector rating or frame configuration.
function coupledFixture(o: {tieE?: number; tieA?: number; I?: (i: number) => number; corners?: boolean; unbalanced?: boolean; lateral?: boolean; threeSupports?: boolean} = {}) {
  const model = {...sideModel(), designBasisRef: 'SYNTHETIC factor sensitivity only'};
  const side = sideDefinition();
  if (o.corners) side.faces = ['F1', 'F2', 'F3', 'F4'].map(id => sideFace(id));
  if (o.threeSupports) for (const f of side.faces.filter(f => f.faceId === 'F2' || f.faceId === 'F4')) for (const w of f.walers) w.supports = [{id: 'S1', xMm: 250}, {id: 'S2', xMm: 500}, {id: 'S3', xMm: 750}];
  // An untied, framed middle support on the tied faces restrains their common translation.
  if (o.unbalanced) for (const f of side.faces.filter(f => f.faceId === 'F1' || f.faceId === 'F3')) for (const w of f.walers) w.supports = [{id: 'S1', xMm: 250}, {id: 'S3', xMm: 500}, {id: 'S2', xMm: 750}];
  side.ties = side.ties.filter(t => t.id.startsWith('F1-'));
  if (o.unbalanced) side.faces[0].pressure = {schemaVersion: '1', scope: 'REPLACE_COMPLETE_FACE_FOR_STAGE', evidenceRef: 'SYNTHETIC F1 head 600', omittedAreasEvidenceRef: 'SYNTHETIC remainder unloaded',
    sources: [{...emptyPressureSource('PARTIAL-HEAD'), kind: 'HYDROSTATIC', x0Mm: 0, x1Mm: 1000, headMm: 600, ownershipId: 'F1-CONCRETE', evidenceRef: 'SYNTHETIC'}]};
  const applied: WorkflowModel = {...model, sideLayout: stampSideLayout(model, side)};
  const specs = JSON.parse(readFileSync('src/reference/workflow-v07/checks.json', 'utf8'));
  applied.checkCatalogue = {version: '0.7', specifications: specs.map((c: Record<string, string>) => ({id: c.check_id, group: c.group, description: c.description, appliesTo: c.applicable_to}))};
  const definition = frameGeometryFromSide(applied);
  definition.actionBasis = 'SERVICE'; definition.acknowledgeLinearScope = true;
  definition.assumptionEvidenceRef = 'SYNTHETIC untied supports feed independent cantilevers';
  definition.sideTransfers!.mode = 'COUPLED_TIE_FRAME_SUPPORTS';
  definition.sideTransfers!.separationEvidenceRef = 'SYNTHETIC frame excludes plywood, studs, walers and tie rods';
  [...definition.nodes].forEach((n, i) => {
    n.boundary = Array.from({length: 6}, () => ({kind: 'FREE'}));
    definition.nodes.push({id: `BASE-${i + 1}`, role: 'BASE', pointMm: [n.pointMm[0], n.pointMm[1], 0], boundary: Array.from({length: 6}, () => ({kind: 'FIXED'})), evidenceRef: 'SYNTHETIC fixed base'});
    const I = o.I?.(i) ?? 1e6;
    definition.elements.push({...emptyFrameElement(`CANT-${i + 1}`), nodeI: `BASE-${i + 1}`, nodeJ: n.id, role: 'OTHER', kind: 'BEAM_COLUMN',
      E_MPa: 200000, G_MPa: 80000, A_mm2: 200, Iy_mm4: I, Iz_mm4: I, J_mm4: 3e6, localY: [1, 0, 0], evidenceRef: 'SYNTHETIC elastic properties'});
    definition.sideTransfers!.mappings[i].connectionEvidenceRef = 'SYNTHETIC direct force at actual waler support';
  });
  const coupling: SideCouplingDefinition = {...emptySideCoupling(), assumptionsEvidenceRef: 'SYNTHETIC coupled support review',
    ties: side.ties.map(t => ({tieId: t.id, E_MPa: o.tieE ?? 200000, A_mm2: o.tieA ?? 150, effectiveLengthMm: 1000, evidenceRef: 'SYNTHETIC tie EA/L'}))};
  if (o.corners) for (const w of ['W1', 'W2']) [['F1', 'F2'], ['F2', 'F3'], ['F3', 'F4'], ['F4', 'F1']].forEach(([a, b]) =>
    coupling.corners.push({...emptyCouplingCorner(`${a}${b}-${w}`), faceAId: a, walerAId: w, faceBId: b, walerBId: w, stiffnessNPerMm: 5000, evidenceRef: 'SYNTHETIC connector stiffness'}));
  definition.sideTransfers!.coupling = coupling;
  if (o.lateral) definition.additionalActions.push({id: 'WIND-X', nodeId: definition.nodes[0].id, kind: 'WIND', ownershipId: 'WIND-X', evidenceRef: 'SYNTHETIC declared lateral case',
    forceN: [100, 0, 0], momentNmm: [0, 0, 0], atNode: true, offsetMm: [0, 0, 0], offsetEvidenceRef: ''} as FrameActionDraft);
  return {model: applied, definition};
}
function solve(f: ReturnType<typeof coupledFixture>) {
  const ready = regenerateDraftLayouts(f.model, {frameLayout: stampFrameLayout(f.model, f.definition)}), p = previewWorkflow(ready);
  const coupled = p.frame!.sideCoupling;
  if (!coupled) throw Error(p.frame!.blockers.filter(b => b.startsWith('FRAME_INPUT_OR_SOLVE')).join('; '));
  return {p, coupled, side: analyzeSideLayout(ready, ready.sideLayout!)};
}

it('recovers the rigid-support demands when ties and frame are very stiff, and closes every support and the frame', () => {
  const {coupled, side} = solve(coupledFixture({tieE: 2e5, tieA: 1e9, I: () => 1e14}));
  for (const s of coupled.supports) expect(s.demandN).toBeCloseTo(side.nodes.find(n => n.id === s.id)!.forceN, 0);
  expect(coupled.equilibrium.maxSupportResidualN).toBeLessThan(1e-6);
  expect(Math.hypot(...coupled.equilibrium.forceResidualN)).toBeLessThan(1e-6);
  expect(coupled.ties.every(t => !t.slack && t.forceN > 0)).toBe(true);
  expect(coupled.constructionRelease).toBe('NO_GO');
});

it('redistributes support demands by actual stiffness while each face still carries its own pressure resultant', () => {
  // Two supports per rail are statically determinate: stiffness cannot change those reactions.
  const determinate = solve(coupledFixture({I: i => (i % 2 ? 5e5 : 5e7)})).coupled;
  for (const s of determinate.supports.filter(s => s.faceId === 'F2')) expect(s.demandN).toBeCloseTo(s.rigidDemandN, 6);
  // Three supports: a soft middle support sheds load to the stiffer outer supports.
  const {coupled, side} = solve(coupledFixture({threeSupports: true, I: i => (i % 3 === 1 ? 5e5 : 5e7)}));
  for (const face of ['F2', 'F4']) {
    const pressure = side.faces.find(f => f.face.id === face)!.pressureAction.forceN;
    expect(coupled.supports.filter(s => s.faceId === face).reduce((n, s) => n + s.frameForceN, 0)).toBeCloseTo(pressure, 4);
  }
  // With end overhangs the rigid middle reaction is a pull; the soft support attracts less of it.
  const middle = coupled.supports.filter(s => s.faceId === 'F2' && s.supportId === 'S2');
  expect(middle.every(s => Math.abs(s.demandN) < Math.abs(s.rigidDemandN) - 1)).toBe(true);
  // Frame compatibility: the solved frame displacement equals the coupled support movement (checked in the workflow).
  expect(coupled.frameCompatibility.length).toBe(12);
  expect(coupled.railAnalyses.filter(a => /^F[24]:/.test(a.id)).every(a => a.input.supports.some(s => (s.displacementMm ?? 0) !== 0))).toBe(true);
  // The tied pair's common translation is unrestrained; it is pinned to zero and reported, forces unaffected.
  expect(coupled.rankDeficiency).toBeGreaterThan(0);
  expect(coupled.blockers.some(b => b.includes('UNRESTRAINED_RIGID_MODES_SELF_EQUILIBRATED_LOAD_ONLY'))).toBe(true);
});

it('solves an unbalanced tied pair that the one-way mixed mode rejects, with one force per tie, and rejects an unrestrained net force', () => {
  const {coupled} = solve(coupledFixture({unbalanced: true}));
  for (const t of coupled.ties) {
    const ends = coupled.supports.filter(s => s.tieForceN !== 0 && Math.abs(s.tieForceN - t.forceN) < 1e-6);
    expect(ends.length).toBeGreaterThanOrEqual(2);
    expect(t.rigidSupportForcesN[0]).not.toBeCloseTo(t.rigidSupportForcesN[1], 3);
  }
  const framedTiedFaces = coupled.supports.filter(s => (s.faceId === 'F1' || s.faceId === 'F3') && s.supportId === 'S3');
  expect(framedTiedFaces.reduce((n, s) => n + s.frameForceN, 0)).not.toBeCloseTo(0, 1);
  expect(coupled.equilibrium.maxSupportResidualN).toBeLessThan(1e-6);

  // Ties alone cannot resist a net force across the pair: this is a mechanism, not a result.
  const f = coupledFixture({unbalanced: true});
  f.definition.sideTransfers!.mappings = f.definition.sideTransfers!.mappings.filter(m => m.faceId !== 'F1' && m.faceId !== 'F3');
  const frame = previewWorkflow(regenerateDraftLayouts(f.model, {frameLayout: stampFrameLayout(f.model, f.definition)})).frame!;
  expect(frame.sideCoupling).toBeNull();
  expect(frame.blockers.some(b => b.includes('COUPLED_SYSTEM_UNRESTRAINED_RIGID_MOTION_WITH_UNBALANCED_LOAD'))).toBe(true);
});

it('joins rail ends with declared corner connectors and reports connector force, balanced rail axial force and reduced end opening', () => {
  const free = solve(coupledFixture({corners: false})), {coupled} = solve(coupledFixture({corners: true}));
  expect(coupled.corners).toHaveLength(8);
  expect(coupled.corners.some(c => c.connectorForceN > 1)).toBe(true);
  expect(coupled.railAxial.every(r => Math.abs(r.endBalanceN) <= Math.max(1, Math.abs(r.axialForceN)) * 1e-6)).toBe(true);
  expect(coupled.railAnalyses.every(a => a.input.supports.some(s => s.id === 'CORNER-A') && a.input.supports.some(s => s.id === 'CORNER-B'))).toBe(true);
  expect(free.coupled.corners).toHaveLength(0);
  expect(coupled.equilibrium.maxSupportResidualN).toBeLessThan(1e-6);
  expect(coupled.limits.blockers).toContain('SIDE_LOCAL_EVIDENCE_REQUIRED');
});

it('screens reviewed connector/tie/rail-axial limits bound to the declared stiffness data and rejects incomplete coupling data', () => {
  const f = coupledFixture({corners: true}), c = f.definition.sideTransfers!.coupling!, ref = sideCouplingReference(c);
  c.limits = (['CORNER_CONNECTOR', 'RAIL_AXIAL', 'TIE_AXIAL'] as const).map(kind => ({...emptySideLocalEvidence(kind, ref), limit: 1e12, actionBasis: 'SERVICE' as const, limitBasis: 'ALLOWABLE' as const,
    maximumUnbracedLengthMm: kind === 'RAIL_AXIAL' ? 1000 : null, scopeEvidenceRef: 'SYNTHETIC', methodId: 'SYNTHETIC', sourceRef: 'SYNTHETIC', sourceRevision: 'A', evidenceRef: 'SYNTHETIC', reviewRef: 'SYNTHETIC', status: 'ENGINEER_REVIEWED' as const}));
  const {coupled} = solve(f);
  expect(coupled.limits.status).toBe('SCREENED');
  expect(coupled.constructionRelease).toBe('NO_GO');

  const stale = coupledFixture({corners: true}); stale.definition.sideTransfers!.coupling!.limits = c.limits;
  stale.definition.sideTransfers!.coupling!.corners[0].stiffnessNPerMm = 1000;
  expect(solve(stale).coupled.limits.blockers).toContain('SIDE_LOCAL_EVIDENCE_NOT_BOUND_TO_CURRENT_FACE_MEMBERS');

  const missing = coupledFixture(); missing.definition.sideTransfers!.coupling!.ties = [];
  const ready = regenerateDraftLayouts(missing.model, {frameLayout: stampFrameLayout(missing.model, missing.definition)});
  const frame = previewWorkflow(ready).frame!;
  expect(frame.sideCoupling).toBeNull();
  expect(frame.blockers.some(b => /coupled tie stiffness definition required/.test(b))).toBe(true);
});

it('gates side-form stability on an explicit lateral frame-node case and second-order analysis', () => {
  const none = solve(coupledFixture());
  expect(none.p.frame!.stability!.status).toBe('LATERAL_CASE_REQUIRED');
  expect(none.p.frame!.blockers).toContain('SIDE_SYSTEM_STABILITY_REQUIRES_EXPLICIT_LATERAL_FRAME_ACTION_IN_THIS_CASE');
  const lateral = solve(coupledFixture({lateral: true}));
  expect(lateral.p.frame!.stability!.status).toBe('SECOND_ORDER_REQUIRED');
  expect(lateral.p.frame!.stability!.horizontalForceN[0]).toBe(100);
  expect(lateral.p.constructionEligible).toBe(false);
});

it('renders coupled supports, tie forces, corner connectors and the stability gate without any approval wording', () => {
  const f = coupledFixture({corners: true});
  const ready = regenerateDraftLayouts(f.model, {frameLayout: stampFrameLayout(f.model, f.definition)});
  const html = renderToStaticMarkup(createElement(FrameResults, {model: ready, preview: previewWorkflow(ready)}));
  expect(html).toContain('แบบจำลองร่วมไทร์–เฟรม–มุม');
  expect(html).toContain('แรงในอุปกรณ์มุม');
  expect(html).toContain('F1F2-W1');
  expect(html).toContain('LATERAL_CASE_REQUIRED');
  expect(html).toContain('NO_GO');
  // Existing disclaimers mention "ไม่ใช่ PASS"; no status cell may claim PASS/APPROVED.
  expect(html).not.toMatch(/<td>[^<]*\b(PASS|APPROVED)\b/);
});
