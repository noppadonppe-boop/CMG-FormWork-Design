import {expect, it} from 'vitest';
import {emptyFrameLayout, evaluateFrameLayout, frameGeometryFromSide, stampFrameLayout, validateFrameLayout} from '../src/domain/workflowV07/frameWorkflow';
import {previewWorkflow, regenerateDraftLayouts, reviseDraft} from '../src/domain/workflowV07/model';
import {analyzeSideLayout, stampSideLayout} from '../src/domain/workflowV07/sideLayout';
import {sideSupportKey, transferSideReactionsToFrame, validateSideFrame} from '../src/domain/workflowV07/sideFrameTransfer';
import {compileLoadCase} from '../src/domain/workflowV07/loadCases';
import {removeStageLayout} from '../src/domain/workflowV07/stageStudy';
import {contentHash, documentView, freezeDesign} from '../src/domain/workflowV07/snapshot';
import {sideFrameApplied, sideFrameFixture} from './fixtures/workflow-v07-side-frame';
import {caseDefinition} from './fixtures/workflow-v07-loadcases';
import {frameFixture} from './fixtures/workflow-v07-frame-workflow';
import {sideFace} from './fixtures/workflow-v07-side';
import {pairFaces} from '../src/domain/workflowV07/geometry';

it('captures actual side support coordinates with no invented anchors, members, connection proofs, fixities or scope acceptance', () => {
  const {model} = sideFrameFixture(), d = frameGeometryFromSide(model);
  expect(d.nodes).toHaveLength(16); expect(d.nodes[0].pointMm).toEqual([250, 0, 2100]);
  expect(d.nodes.every(n => n.role === 'SIDE_SUPPORT' && n.boundary.every(b => b.kind === 'UNKNOWN'))).toBe(true);
  expect(d.elements).toEqual([]); expect(d.sideTransfers?.mode).toBeNull(); expect(d.sideTransfers?.separationEvidenceRef).toBe('');
  expect(d.sideTransfers?.mappings.every(m => !m.connectionEvidenceRef && m.offsetEvidenceRef === null)).toBe(true);
  expect(d.actionBasis).toBeNull(); expect(d.acknowledgeLinearScope).toBe(false);
});
it.each(['GROUND_BRACED', 'COLUMN_YOKE'] as const)('retains individual signed %s support demands and independent cantilever reactions/deflections while system checks remain blocked', topology => {
  const m = sideFrameApplied(topology), p = previewWorkflow(m), f = p.frame!;
  expect(f.analysis).not.toBeNull(); expect(f.sideTransfer?.sources).toHaveLength(16);
  const t = f.sideTransfer!, a = f.analysis!;
  // F1 = gamma * H²/2 * width = 3,600 N; opposite F3 = 10,000 N.
  expect(t.sources.filter(s => s.source.faceId === 'F1').reduce((n, s) => n + s.source.forceN, 0)).toBeCloseTo(3600, 6);
  expect(t.sources.filter(s => s.source.faceId === 'F3').reduce((n, s) => n + s.source.forceN, 0)).toBeCloseTo(10000, 6);
  expect(t.equilibrium.sourceForceN[1]).toBeCloseTo(6400, 6);
  expect(a.nodes.reduce((n, r) => n + r.reactionForceN[1], 0)).toBeCloseTo(-6400, 5);
  const s = t.sources.find(s => s.source.faceId === 'F1' && s.source.walerId === 'W1' && s.source.supportId === 'S1')!;
  expect(s.action.forceN[1]).toBeCloseTo(-1575, 6);
  const node = a.nodes.find(n => n.id === s.action.nodeId)!;
  expect(node.displacementMm[1]).toBeCloseTo(-1575 * 2100 ** 3 / (3 * 200000 * 1e6), 7);
  expect(a.equilibrium.forceResidualN.every(v => Math.abs(v) < 1e-6)).toBe(true);
  expect(a.equilibrium.momentResidualNmm.every(v => Math.abs(v) < 1e-3)).toBe(true);
  expect(f.blockers).toContain('SIDE_FRAME_ONE_WAY_SUPPORT_DEMANDS_ONLY_DISPLACEMENT_FEEDBACK_NOT_MODELED');
  expect(p.blockers).toContain(topology === 'COLUMN_YOKE' ? 'CLOSED_COLUMN_YOKE_CORNER_CONTACT_AND_CLAMP_MODEL_REQUIRED' : 'GROUND_BRACE_ANCHOR_AND_SUPPORT_MODEL_REQUIRED');
  expect(f.status).toBe('BLOCKED'); expect(p.constructionRelease).toBe('NO_GO');
});
it('applies the physical offset couple once and retains the actual source point and distinct base moments', () => {
  const {model, definition} = sideFrameFixture(), node = definition.nodes[0]; node.pointMm[0]! -= 100;
  definition.nodes.find(n => n.id === 'BASE-1')!.pointMm[0]! -= 100;
  let p = previewWorkflow(regenerateDraftLayouts(model, {frameLayout: stampFrameLayout(model, definition)}));
  expect(p.frame!.analysis).toBeNull(); expect(p.frame!.blockers.some(b => b.includes('offset'))).toBe(true);
  definition.sideTransfers!.mappings[0].offsetEvidenceRef = 'SYNTHETIC explicit rigid transfer 100 mm global X';
  p = previewWorkflow(regenerateDraftLayouts(model, {frameLayout: stampFrameLayout(model, definition)}));
  const f = p.frame!, row = f.sideTransfer!.sources.find(s => s.action.nodeId === node.id)!;
  expect(row.action.momentNmm).toEqual([0, 0, 0]); expect(row.action.application).toMatchObject({offsetMm: [100, 0, 0]});
  const applied = f.analysis!.appliedActions.find(a => a.id === row.action.id)!;
  expect(applied).toMatchObject({nodeId: node.id});
  const base = f.analysis!.nodes.find(n => n.id === 'BASE-1')!;
  expect(base.reactionMomentNmm[2]).toBeCloseTo(157500, 4);
  expect(f.sideTransfer!.equilibrium.momentResidualNmm.every(v => Math.abs(v) < 1e-7)).toBe(true);
});
it('rejects changed, partial and tampered upstream sources, incomplete/extra/duplicate mappings, missing connection evidence and wrong node roles', () => {
  const {model, definition} = sideFrameFixture(), source = analyzeSideLayout(model, model.sideLayout!).nodes;
  const context = {revisionId: model.revisionId, stageId: definition.stageId, loadCaseId: definition.loadCaseId};
  const nodes = definition.nodes.map(n => ({id: n.id, pointMm: n.pointMm as [number, number, number], boundary: [0, 0, 0, 0, 0, 0] as [number, number, number, number, number, number]}));
  const transfer = (input = source, d = definition.sideTransfers!) => transferSideReactionsToFrame(model, input, nodes, d, context);
  expect(() => transfer(source.slice(1))).toThrow(/STALE_TAMPERED_OR_INCOMPLETE/);
  const forged = structuredClone(source); forged[0].forceN += 1; expect(() => transfer(forged)).toThrow(/TAMPERED/);
  const missing = structuredClone(definition.sideTransfers!); missing.mappings.pop(); expect(() => transfer(source, missing)).toThrow(/Missing/);
  const extra = structuredClone(definition.sideTransfers!); extra.mappings.push({...extra.mappings[0], supportId: 'NONEXISTENT'}); expect(() => transfer(source, extra)).toThrow(/Unused/);
  const dup = structuredClone(definition.sideTransfers!); dup.mappings.push(dup.mappings[0]); expect(() => transfer(source, dup)).toThrow(/Duplicate/);
  definition.sideTransfers!.mappings[0].connectionEvidenceRef = ''; expect(() => transfer()).toThrow(/connection evidence/);
  definition.sideTransfers!.mappings[0].connectionEvidenceRef = 'SYNTHETIC'; definition.nodes[0].role = 'HEAD';
  expect(evaluateFrameLayout(model, stampFrameLayout(model, definition), null, source).blockers.some(b => b.includes('DECLARED_SIDE_SUPPORT'))).toBe(true);
});
it('does not collapse different opposing support points into a common receiving node even when an offset reference is supplied', () => {
  const {model, definition} = sideFrameFixture(), a = definition.sideTransfers!.mappings[0], b = definition.sideTransfers!.mappings[8];
  b.frameNodeId = a.frameNodeId; b.offsetEvidenceRef = 'SYNTHETIC unverified attempt to combine opposing demands';
  const p = previewWorkflow(regenerateDraftLayouts(model, {frameLayout: stampFrameLayout(model, definition)}));
  expect(p.frame?.analysis).toBeNull(); expect(p.frame?.blockers.some(b => b.includes('DISTINCT_SIDE_SUPPORT_POINTS_REQUIRE_DISTINCT_FRAME_NODES'))).toBe(true);
});
it('never uses side forces from a different stage/case/revision and never substitutes external bracing for ties', () => {
  for (const field of ['stageId', 'loadCaseId'] as const) {
    const {model, definition} = sideFrameFixture(); definition[field] = 'OTHER';
    const p = previewWorkflow(regenerateDraftLayouts(model, {frameLayout: stampFrameLayout(model, definition)}));
    expect(p.frame?.analysis).toBeNull(); expect(p.frame?.blockers.some(b => b.includes('SAME_STAGE_CASE'))).toBe(true);
  }
  const ready = sideFrameApplied(), stale = reviseDraft(ready, {gammaKNm3: 21});
  expect(previewWorkflow(stale).frame?.analysis).toBeNull();
  const tied = regenerateDraftLayouts(ready, {sideTopology: 'THROUGH_TIE'});
  expect(previewWorkflow(tied).frame?.blockers.some(b => b.includes('TOPOLOGY_WITHOUT_TIES'))).toBe(true);
});
it('keeps unknown stiffness and boundaries blocked instead of manufacturing a stable support frame', () => {
  const {model, definition} = sideFrameFixture(); definition.elements[0].E_MPa = null;
  expect(previewWorkflow(regenerateDraftLayouts(model, {frameLayout: stampFrameLayout(model, definition)})).frame?.analysis).toBeNull();
  definition.elements[0].E_MPa = 200000; definition.nodes[0].boundary[0] = {kind: 'UNKNOWN'};
  expect(previewWorkflow(regenerateDraftLayouts(model, {frameLayout: stampFrameLayout(model, definition)})).frame?.blockers.some(b => b.includes('boundary unknown'))).toBe(true);
});
it('combines actual head and side reactions without dropping either source or multiplying transferred pressure again', () => {
  const {model, definition} = frameFixture(); model.sideTopology = 'GROUND_BRACED';
  const faces = pairFaces(model.vertices, model.heightMm).faces;
  model.sideLayout = stampSideLayout(model, {schemaVersion: '1', stageId: definition.stageId, loadCaseId: definition.loadCaseId, evidenceRef: 'SYNTHETIC sides of slab',
    pourHeadMm: 150, baseElevationMm: 3200, rebarClearanceEvidence: null, ties: [], faces: faces.map(f => sideFace(f.id, f.lengthMm, [20, 130]))});
  const side = frameGeometryFromSide(model);
  side.nodes.forEach((n, i) => {
    n.boundary = Array.from({length: 6}, () => ({kind: 'FREE'}));
    const id = `SIDE-BASE-${i + 1}`;
    definition.nodes.push({id, role: 'BASE', pointMm: [n.pointMm[0], n.pointMm[1], 0], boundary: Array.from({length: 6}, () => ({kind: 'FIXED'})), evidenceRef: 'SYNTHETIC separate fixed support'});
    definition.elements.push({...definition.elements[0], id: `SIDE-CANT-${i + 1}`, role: 'OTHER', nodeI: id, nodeJ: n.id});
  });
  definition.nodes.push(...side.nodes); definition.sideTransfers = side.sideTransfers;
  definition.sideTransfers!.mode = 'DOWNSTREAM_SIDE_SUPPORTS_ONLY'; definition.sideTransfers!.separationEvidenceRef = 'SYNTHETIC distinct support structures';
  definition.sideTransfers!.mappings.forEach(m => m.connectionEvidenceRef = 'SYNTHETIC direct support');
  let m = regenerateDraftLayouts(model, {frameLayout: stampFrameLayout(model, definition), designBasisRef: 'SYNTHETIC'});
  expect(previewWorkflow(m).frame?.blockers.some(b => b.includes('UNUSED_SIDE_TRANSFER_DEFINITION'))).toBe(true);
  definition.loadSource = 'SOFFIT_AND_SIDE_REACTIONS'; m = regenerateDraftLayouts(model, {frameLayout: stampFrameLayout(model, definition), designBasisRef: 'SYNTHETIC'});
  const p = previewWorkflow(m); expect(p.frame?.analysis, p.frame?.blockers.join('; ')).not.toBeNull(); expect(p.frame?.input?.actions).toHaveLength(22);
  expect(p.frame!.input!.actions.filter(a => a.id.startsWith('HEAD:')).reduce((n, a) => n - a.forceN[2], 0)).toBeCloseTo(23760, 5);
  const c = caseDefinition('INDEPENDENT'); c.factors.HYDROSTATIC_SIDE = 1.7; c.factors.CONCRETE = 1.2;
  const cp = previewWorkflow(compileLoadCase(m, c));
  expect(cp.frame?.analysis).not.toBeNull();
  const sum = (s: typeof p) => s.frame!.sideTransfer!.sources.reduce((n, a) => n + a.source.forceN, 0);
  expect(sum(cp) / sum(p)).toBeCloseTo(1.7, 9);
  expect(cp.frame!.input!.actions.filter(a => a.id.startsWith('HEAD:')).reduce((n, a) => n - a.forceN[2], 0)).toBeCloseTo(26352, 5);
  expect(cp.frame!.sideTransfer!.sources.every(s => s.action.loadCaseId === c.loadCaseId && s.upstreamRevision === m.revisionId)).toBe(true);
});
it('requires explicit source inclusion and distinct ownership; removal clears the side mapping and method acceptance', () => {
  const {model, definition} = sideFrameFixture(); definition.loadSource = 'FRAME_ACTIONS_ONLY'; definition.sideTransfers = null; definition.excludeSoffitReason = 'SYNTHETIC omission request';
  expect(previewWorkflow(regenerateDraftLayouts(model, {frameLayout: stampFrameLayout(model, definition)})).frame?.blockers.some(b => b.includes('SIDE_REACTIONS_CANNOT_BE_OMITTED'))).toBe(true);
  const ready = sideFrameApplied(), removed = removeStageLayout(ready, 'SIDE');
  expect(removed.frameLayout?.sideTransfers).toBeNull(); expect(removed.frameLayout?.loadSource).toBeNull(); expect(removed.frameLayout?.acknowledgeLinearScope).toBe(false);
  const f = sideFrameFixture(); f.definition.additionalActions = [{id: 'DOUBLE', nodeId: f.definition.nodes[0].id, kind: 'WIND', ownershipId: 'F1-CONCRETE', evidenceRef: 'SYNTHETIC duplicated source',
    forceN: [0, 1, 0], momentNmm: [0, 0, 0], atNode: true, offsetMm: [null, null, null], offsetEvidenceRef: ''}];
  expect(previewWorkflow(regenerateDraftLayouts(f.model, {frameLayout: stampFrameLayout(f.model, f.definition)})).frame?.blockers.some(b => b.includes('DUPLICATE_FRAME_OWNED_LOAD'))).toBe(true);
});
it('covers actual support/frame entities and freezes source mapping and demands with the same report/drawing hash', async () => {
  const m = sideFrameApplied(), p = previewWorkflow(m), f = p.frame!;
  expect(f.requiredChecks.filter(c => c.checkId === 'SIDE-10')).toHaveLength(49);
  expect(f.requiredChecks.every(c => c.revision === m.revisionId && c.applicability.stageId === m.frameLayout!.stageId)).toBe(true);
  expect(p.coverageReview.checkedCount).toBe(0);
  const frozen = await freezeDesign(m), view = await documentView(frozen, m);
  expect(view.drawing.frame?.sideTransfer).toEqual(view.report.preview.frame?.sideTransfer);
  const forged = structuredClone(frozen); forged.content.preview.frame!.sideTransfer!.sources[0].source.forceN += 1; forged.snapshotHash = await contentHash(forged.content);
  await expect(documentView(forged, m)).rejects.toThrow(/calculation mismatch/);
});
it('rejects authority/unknown schemas, oversized data and keeps older frame drafts without a side field valid', () => {
  const {model, definition} = sideFrameFixture(), d = definition.sideTransfers!;
  expect(() => validateSideFrame({...d, confirmed: true})).toThrow(/authority/);
  expect(() => validateSideFrame({...d, mappings: Array.from({length: 1001}, () => d.mappings[0])})).toThrow(/limit/);
  expect(() => validateSideFrame({...d, separationEvidenceRef: 'x'.repeat(2001)})).toThrow(/text/);
  const plain = stampFrameLayout(model, emptyFrameLayout()); expect(() => validateFrameLayout(plain)).not.toThrow(); expect(plain).not.toHaveProperty('sideTransfers');
  expect(new Set(d.mappings.map(sideSupportKey)).size).toBe(16);
});
it.each([false, true])('projects forces and pressure moments on translated and reversed face axes (reversed=%s)', reversed => {
  const {model} = sideFrameFixture();
  model.vertices = model.vertices.map(p => ({x: 1e6 - p.y, y: -2e6 + p.x})); if (reversed) model.vertices.reverse();
  model.sideLayout = stampSideLayout(model, model.sideLayout!);
  const d = frameGeometryFromSide(model); d.sideTransfers!.mode = 'DOWNSTREAM_SIDE_SUPPORTS_ONLY'; d.sideTransfers!.separationEvidenceRef = 'SYNTHETIC independent support only';
  d.sideTransfers!.mappings.forEach(m => m.connectionEvidenceRef = 'SYNTHETIC actual point');
  const nodes = d.nodes.map(n => ({id: n.id, pointMm: n.pointMm as [number, number, number], boundary: [0, 0, 0, 0, 0, 0] as [number, number, number, number, number, number]}));
  const t = transferSideReactionsToFrame(model, analyzeSideLayout(model, model.sideLayout!).nodes, nodes, d.sideTransfers!, {revisionId: model.revisionId, stageId: d.stageId, loadCaseId: d.loadCaseId});
  expect(t.equilibrium.sourceForceN[0]).toBeCloseTo(reversed ? 6400 : -6400, 5);
  expect(t.equilibrium.sourceForceN[1]).toBeCloseTo(0, 5);
  expect(t.equilibrium.momentResidualNmm.every(v => Math.abs(v) < 1e-3)).toBe(true);
  expect(t.missingPhysicalFaceIds).toEqual([]);
});
