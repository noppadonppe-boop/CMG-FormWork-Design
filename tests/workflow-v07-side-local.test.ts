import {readFileSync} from 'node:fs';
import {expect, it} from 'vitest';
import {emptyBeamMemberEvidence, type BeamMemberEvidence, type BeamMemberQuantity} from '../src/domain/workflowV07/beamResistance';
import {emptyFrameElement, frameGeometryFromSide, stampFrameLayout} from '../src/domain/workflowV07/frameWorkflow';
import {previewWorkflow, regenerateDraftLayouts} from '../src/domain/workflowV07/model';
import {transferSideReactionsToFrame} from '../src/domain/workflowV07/sideFrameTransfer';
import {analyzeSideLayout, sidePlywoodEvidenceReference, stampSideLayout} from '../src/domain/workflowV07/sideLayout';
import {emptySideLocalEvidence, SIDE_LOCAL_CHECK_KINDS, sideLocalMemberReference, type SideLocalCheckKind, type SideLocalEvidence} from '../src/domain/workflowV07/sideLocalChecks';
import {emptyPressureSource} from '../src/domain/workflowV07/sidePressure';
import {sideDefinition, sideModel} from './fixtures/workflow-v07-side';

const reviewed = {scopeEvidenceRef: 'SYNTHETIC scope', methodId: 'SYNTHETIC-METHOD', sourceRef: 'SYNTHETIC source', sourceRevision: 'REV-A',
  evidenceRef: 'SYNTHETIC evidence', reviewRef: 'SYNTHETIC review', status: 'ENGINEER_REVIEWED' as const, actionBasis: 'SERVICE' as const};
function plywoodRow(quantity: BeamMemberQuantity, limit: number, ref: string, span = 250): BeamMemberEvidence {
  return {...emptyBeamMemberEvidence(quantity, ref), ...reviewed, limit, maximumUnsupportedSpanMm: span, limitBasis: quantity === 'DEFLECTION' ? 'SLS_LIMIT' : 'ALLOWABLE'};
}
function localRow(kind: SideLocalCheckKind, limit: number, ref: string): SideLocalEvidence {
  return {...emptySideLocalEvidence(kind, ref), ...reviewed, limit, limitBasis: kind === 'CORNER_OPENING' ? 'SLS_LIMIT' : 'ALLOWABLE',
    maximumUnbracedLengthMm: kind.endsWith('BUCKLING') ? 1000 : null};
}

it('screens side plywood 1000 mm strips only against reviewed per-strip limits within the declared span scope', () => {
  const model = sideModel(), definition = sideDefinition();
  for (const f of definition.faces) {
    const ref = sidePlywoodEvidenceReference(f.plywood);
    f.plywood.resistanceEvidence = [plywoodRow('FLEXURE', 1e9, ref), plywoodRow('SHEAR', 1e9, ref), plywoodRow('DEFLECTION', 100, ref)];
  }
  const side = analyzeSideLayout(model, stampSideLayout(model, definition));
  const panels = side.faces.flatMap(f => f.panels);
  expect(panels.length).toBeGreaterThan(0);
  expect(panels.every(p => p.resistanceScreen.status === 'SCREENED' && p.resistanceScreen.checks[0].demand === p.analysis.maxMomentNmm)).toBe(true);
  expect(side.blockers).not.toContain('SIDE_PLYWOOD_STRIP_RESISTANCE_EVIDENCE_REQUIRED');

  const narrow = structuredClone(definition);
  narrow.faces[0].plywood.resistanceEvidence!.forEach(row => {row.maximumUnsupportedSpanMm = 200;});
  const narrowSide = analyzeSideLayout(model, stampSideLayout(model, narrow));
  expect(narrowSide.faces[0].panels[0].resistanceScreen.blockers).toContain('ACTUAL_UNSUPPORTED_SPAN_EXCEEDS_REVIEWED_EVIDENCE_SCOPE');
  expect(narrowSide.blockers).toContain('SIDE_PLYWOOD_STRIP_RESISTANCE_EVIDENCE_REQUIRED');

  const changed = structuredClone(definition); changed.faces[0].plywood.thicknessMm = 15;
  expect(analyzeSideLayout(model, stampSideLayout(model, changed)).faces[0].panels[0].resistanceScreen.blockers).toContain('BEAM_MEMBER_SECTION_ORIENTATION_EVIDENCE_MISMATCH');

  const failing = structuredClone(definition); failing.faces[0].plywood.resistanceEvidence![0].limit = 1;
  const failingSide = analyzeSideLayout(model, stampSideLayout(model, failing));
  expect(failingSide.status).toBe('FAIL'); expect(failingSide.blockers).toContain('SIDE_PLYWOOD_STRIP_LIMIT_EXCEEDED');
  expect(failingSide.constructionRelease).toBe('NO_GO');
});

it('derives local bearing, plate, connection, buckling and corner-opening demands from the actual rail analyses', () => {
  const model = sideModel(), side = analyzeSideLayout(model, stampSideLayout(model, sideDefinition()));
  const face = side.faces[0], rails = face.result.walers.flatMap(w => w.rails);
  const bearing = face.local.checks.filter(c => c.kind === 'STUD_RAIL_BEARING');
  expect(bearing).toHaveLength(rails.reduce((n, r) => n + r.input.points.length, 0));
  expect(bearing.reduce((s, c) => s + c.demand, 0)).toBeCloseTo(rails.reduce((s, r) => s + r.input.points.reduce((t, p) => t + p.forceN, 0), 0), 6);
  const plates = face.local.checks.filter(c => c.kind === 'SUPPORT_PLATE_BEARING');
  expect(plates.reduce((s, c) => s + c.demand, 0)).toBeCloseTo(-rails.reduce((s, r) => s + r.reactions.reduce((t, q) => t + q.forceN, 0), 0), 6);
  const connections = face.local.checks.filter(c => c.kind === 'SUPPORT_CONNECTION');
  const nodes = side.nodes.filter(n => n.faceId === face.face.id);
  expect(connections.map(c => c.demand).sort()).toEqual(nodes.map(n => n.forceN).sort().map(v => expect.closeTo(v, 6)));
  expect(face.local.checks.filter(c => c.kind === 'CORNER_OPENING')).toHaveLength(rails.length * 2);
  expect(face.local.checks.filter(c => c.kind === 'STUD_BUCKLING').every(c => c.lengthMm === 800)).toBe(true);
  expect(face.local.status).toBe('INCOMPLETE');
  expect(face.local.blockers).toEqual(expect.arrayContaining(['SIDE_LOCAL_EVIDENCE_REQUIRED', 'CORNER_FORCE_TRANSFER_HARDWARE_NOT_MODELED_FACE_ENDS_ANALYSED_AS_FREE',
    'SIDE_SYSTEM_STABILITY_REQUIRES_LATERAL_ACTIONS_BRACING_AND_FRAME_ANALYSIS']));
});

it('screens reviewed local limits per face, rejects stale member binding and reports FAIL without release', () => {
  const model = sideModel(), definition = sideDefinition();
  for (const f of definition.faces) f.localEvidence = SIDE_LOCAL_CHECK_KINDS.map(k => localRow(k, k === 'CORNER_OPENING' ? 100 : 1e12, sideLocalMemberReference(f)));
  const side = analyzeSideLayout(model, stampSideLayout(model, definition));
  expect(side.faces.every(f => f.local.status === 'SCREENED')).toBe(true);
  expect(side.faces[0].local.blockers).toContain('CORNER_FORCE_TRANSFER_HARDWARE_NOT_MODELED_FACE_ENDS_ANALYSED_AS_FREE');
  expect(side.constructionRelease).toBe('NO_GO');

  const stale = structuredClone(definition); stale.faces[0].rail.I_mm4 = 2e6;
  expect(analyzeSideLayout(model, stampSideLayout(model, stale)).faces[0].local.blockers).toContain('SIDE_LOCAL_EVIDENCE_NOT_BOUND_TO_CURRENT_FACE_MEMBERS');

  const shortScope = structuredClone(definition); shortScope.faces[0].localEvidence!.find(e => e.kind === 'STUD_BUCKLING')!.maximumUnbracedLengthMm = 500;
  expect(analyzeSideLayout(model, stampSideLayout(model, shortScope)).faces[0].local.blockers).toContain('ACTUAL_UNBRACED_LENGTH_EXCEEDS_REVIEWED_SCOPE');

  const failing = structuredClone(definition); failing.faces[0].localEvidence!.find(e => e.kind === 'STUD_RAIL_BEARING')!.limit = 1;
  const failingSide = analyzeSideLayout(model, stampSideLayout(model, failing));
  expect(failingSide.status).toBe('FAIL'); expect(failingSide.blockers).toContain('SIDE_LOCAL_LIMIT_EXCEEDED');
});

function mixedFixture(unbalanced = false) {
  const model = {...sideModel(), designBasisRef: 'SYNTHETIC factor sensitivity only'};
  const side = sideDefinition(); side.ties = side.ties.filter(t => t.id.startsWith('F1-'));
  if (unbalanced) side.faces[0].pressure = {schemaVersion: '1', scope: 'REPLACE_COMPLETE_FACE_FOR_STAGE', evidenceRef: 'SYNTHETIC F1 head 600', omittedAreasEvidenceRef: 'SYNTHETIC remainder unloaded',
    sources: [{...emptyPressureSource('PARTIAL-HEAD'), kind: 'HYDROSTATIC', x0Mm: 0, x1Mm: 1000, headMm: 600, ownershipId: 'F1-CONCRETE', evidenceRef: 'SYNTHETIC'}]};
  const applied = {...model, sideLayout: stampSideLayout(model, side)};
  const specs = JSON.parse(readFileSync('src/reference/workflow-v07/checks.json', 'utf8'));
  applied.checkCatalogue = {version: '0.7', specifications: specs.map((c: Record<string, string>) => ({id: c.check_id, group: c.group, description: c.description, appliesTo: c.applicable_to}))};
  const definition = frameGeometryFromSide(applied);
  definition.actionBasis = 'SERVICE'; definition.acknowledgeLinearScope = true;
  definition.assumptionEvidenceRef = 'SYNTHETIC untied supports feed independent cantilevers';
  definition.sideTransfers!.mode = 'MIXED_TIED_AND_FRAME_SUPPORTS';
  definition.sideTransfers!.separationEvidenceRef = 'SYNTHETIC frame excludes plywood, studs, walers and tie rods';
  [...definition.nodes].forEach((n, i) => {
    n.boundary = Array.from({length: 6}, () => ({kind: 'FREE'}));
    definition.nodes.push({id: `BASE-${i + 1}`, role: 'BASE', pointMm: [n.pointMm[0], n.pointMm[1], 0], boundary: Array.from({length: 6}, () => ({kind: 'FIXED'})), evidenceRef: 'SYNTHETIC fixed base'});
    definition.elements.push({...emptyFrameElement(`CANT-${i + 1}`), nodeI: `BASE-${i + 1}`, nodeJ: n.id, role: 'OTHER', kind: 'BEAM_COLUMN',
      E_MPa: 200000, G_MPa: 80000, A_mm2: 200, Iy_mm4: 1e6, Iz_mm4: 2e6, J_mm4: 3e6, localY: [1, 0, 0], evidenceRef: 'SYNTHETIC elastic properties'});
    definition.sideTransfers!.mappings[i].connectionEvidenceRef = 'SYNTHETIC direct force at actual waler support';
  });
  return {model: applied, definition};
}

it('routes only untied supports of a tied wall to the downstream frame and closes force and moment balance', () => {
  const {model, definition} = mixedFixture();
  expect(definition.sideTransfers!.mappings.every(m => m.faceId === 'F2' || m.faceId === 'F4')).toBe(true);
  expect(definition.sideTransfers!.mappings).toHaveLength(8);
  const ready = regenerateDraftLayouts(model, {frameLayout: stampFrameLayout(model, definition)}), p = previewWorkflow(ready);
  const transfer = p.frame!.sideTransfer!;
  expect(transfer.actions).toHaveLength(8);
  expect(transfer.tiedSupportIds).toHaveLength(8);
  expect(Math.hypot(...transfer.equilibrium.forceResidualN)).toBeLessThan(1e-6);
  expect(Math.hypot(...transfer.equilibrium.tiedForceN)).toBeLessThan(1e-6);
  expect(p.frame!.blockers).toContain('MIXED_TIE_FRAME_SUPPORTS_ONE_WAY_TIE_ELONGATION_AND_FRAME_DISPLACEMENT_COMPATIBILITY_NOT_MODELED');
  expect(p.side!.blockers.some(b => b.startsWith('F2/') && b.endsWith('ASSIGNED_TO_DOWNSTREAM_FRAME_ONE_WAY_TIE_FRAME_COMPATIBILITY_UNVERIFIED'))).toBe(true);
  expect(p.side!.blockers.some(b => b.startsWith('F2/') && b.endsWith('TIE_CLAMP_OR_END_RESTRAINT_NOT_MODELED'))).toBe(false);
  expect(p.constructionEligible).toBe(false); expect(p.constructionRelease).toBe('NO_GO');
});

it('rejects mapping a tied support to the frame and unbalanced tie ends in a mixed system', () => {
  const {model, definition} = mixedFixture(), side = analyzeSideLayout(model, model.sideLayout!);
  const nodes = definition.nodes.map(n => ({id: n.id, pointMm: n.pointMm as [number, number, number], boundary: Array.from({length: 6}, () => 'FREE' as const) as never}));
  const context = {revisionId: model.revisionId, stageId: model.sideLayout!.stageId, loadCaseId: model.sideLayout!.loadCaseId};
  const tied = structuredClone(definition.sideTransfers!), tie = side.ties[0];
  tied.mappings.push({faceId: tie.a.faceId, walerId: tie.a.walerId, supportId: tie.a.supportId, frameNodeId: tied.mappings[0].frameNodeId, connectionEvidenceRef: 'x', offsetEvidenceRef: null});
  expect(() => transferSideReactionsToFrame(model, side.nodes, nodes, tied, context)).toThrow(/TIED_SUPPORT_CANNOT_ALSO_BE_MAPPED/);
  const wrongMode = {...definition.sideTransfers!, mode: 'DOWNSTREAM_SIDE_SUPPORTS_ONLY' as const};
  expect(() => transferSideReactionsToFrame(model, side.nodes, nodes, wrongMode, context)).toThrow(/YOKE_OR_GROUND_BRACED/);

  const bad = mixedFixture(true), badSide = analyzeSideLayout(bad.model, bad.model.sideLayout!);
  const badNodes = bad.definition.nodes.map(n => ({id: n.id, pointMm: n.pointMm as [number, number, number], boundary: Array.from({length: 6}, () => 'FREE' as const) as never}));
  expect(() => transferSideReactionsToFrame(bad.model, badSide.nodes, badNodes, bad.definition.sideTransfers!, context)).toThrow(/MIXED_TIE_NOT_SELF_EQUILIBRATED/);
});
