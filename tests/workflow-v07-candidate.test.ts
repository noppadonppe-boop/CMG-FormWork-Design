import {expect, it} from 'vitest';
import {applyLayoutCandidate, createLayoutCandidateRequest, reviewLayoutCandidate, validateLayoutCandidate, validateAppliedCandidate} from '../src/domain/workflowV07/layoutCandidate';
import {fromLegacy, parseWorkflowModel, previewWorkflow, reviseDraft} from '../src/domain/workflowV07/model';
import {contentHash, documentView, freezeDesign, importDraft} from '../src/domain/workflowV07/snapshot';
import {defaults} from '../src/domain';
import {candidateFixture} from './fixtures/workflow-v07-candidate';
import {sideFrameApplied} from './fixtures/workflow-v07-side-frame';
import {tieDossierApplied} from './fixtures/workflow-v07-tie-dossier';
import {spatialApplied} from './fixtures/workflow-v07-spatial-loads';
import {casesApplied} from './fixtures/workflow-v07-loadcases';
import {applyStageStudy, captureStage, emptyStage} from '../src/domain/workflowV07/stageStudy';

it('binds an offline coordinate request to exact current inputs, units, stage, case and engine without exposing writable engineering fields', async () => {
  const {model, request, proposal} = await candidateFixture(), before = structuredClone(model);
  expect(request.binding.inputHash).toBe(await contentHash(model)); expect(request.binding.units).toBe('MM'); expect(request.binding.modelId).toBe(model.id);
  expect(request.readOnlyContext.vertices).toEqual(model.vertices); expect(request.responseTemplate.soffit).not.toHaveProperty('joist');
  expect(request.responseTemplate).not.toHaveProperty('loads'); expect(request.responseTemplate).not.toHaveProperty('capacities');
  const r = await reviewLayoutCandidate(model, request, proposal); expect(r.changes.map(c => c.path)).toEqual(['SOFFIT/joistXMm']); expect(model).toEqual(before);
});
it('applies only reviewed coordinates, rebuilds real source loads/reactions at one new revision and preserves every locked engineering input', async () => {
  const {model, request, proposal} = await candidateFixture(), review = await reviewLayoutCandidate(model, request, proposal);
  const next = await applyLayoutCandidate(model, request, proposal, review.proposalHash, true), p = previewWorkflow(next);
  expect(next.revisionId).not.toBe(model.revisionId); expect(next.humanInputReviewed).toBe(false); expect(next.soffitLayout!.joistXMm).toHaveLength(7);
  for (const key of ['vertices', 'heightMm', 'gammaKNm3', 'designBasisRef', 'sourceRef', 'selections', 'ringlockResearch', 'additionalDeadKPa', 'constructionLiveKPa', 'legacy'] as const) expect(next[key]).toEqual(model[key]);
  expect(next.soffitLayout!.joist).toEqual(model.soffitLayout!.joist); expect(next.soffitLayout!.bearer).toEqual(model.soffitLayout!.bearer);
  expect(p.loadPath?.reactions.reduce((n, r) => n + r.forceN, 0)).toBeCloseTo(23760, 5); expect(p.loadPath?.analyses.every(a => a.revision === next.revisionId)).toBe(true);
  expect(next.frameLayout).toEqual(model.frameLayout); expect(p.frame?.analysis).toBeNull(); expect(p.frame?.blockers.some(b => b.includes('STALE_FRAME_LAYOUT'))).toBe(true);
  expect(next.layoutCandidate?.proposalHash).toBe(review.proposalHash); expect(p.constructionEligible).toBe(false);
});
it('rejects a response from another request, changed source inputs and modified proposals after review', async () => {
  const {model, request, proposal} = await candidateFixture(), review = await reviewLayoutCandidate(model, request, proposal);
  await expect(applyLayoutCandidate(model, request, proposal, review.proposalHash, false)).rejects.toThrow(/human coordinate review/);
  const changed = structuredClone(proposal); changed.soffit!.joistXMm = [0, 800, 1600, 2400];
  await expect(applyLayoutCandidate(model, request, changed, review.proposalHash, true)).rejects.toThrow(/changed after review/);
  const other = await createLayoutCandidateRequest(model, 'SOFFIT', request.binding.stageId, request.binding.loadCaseId);
  await expect(reviewLayoutCandidate(model, other, proposal)).rejects.toThrow(/STALE_OR_MISMATCHED/);
  await expect(reviewLayoutCandidate(reviseDraft(model, {constructionLiveKPa: 3}), request, proposal)).rejects.toThrow(/STALE_OR_MISMATCHED/);
  const sameRevision = structuredClone(model); sameRevision.soffitLayout!.joist.I_mm4 = 2e6;
  await expect(reviewLayoutCandidate(sameRevision, request, proposal)).rejects.toThrow(/STALE_OR_MISMATCHED/);
});
it.each(['capacityKN', 'forceN', 'approved', 'E_MPa'])('rejects an injected %s field at root and coordinate levels', async field => {
  const {proposal} = await candidateFixture(); expect(() => validateLayoutCandidate({...proposal, [field]: 1})).toThrow(/forbidden/);
  expect(() => validateLayoutCandidate({...proposal, soffit: {...proposal.soffit, [field]: 1}})).toThrow(/forbidden/);
});
it('requires matching stage/scope, exact units, sorted physical stations and complete load-bearing geometry', async () => {
  const {model, request, proposal} = await candidateFixture();
  await expect(createLayoutCandidateRequest(model, 'SOFFIT', 'OTHER-STAGE', request.binding.loadCaseId)).rejects.toThrow(/same authored physical Stage/);
  expect(() => validateLayoutCandidate({...proposal, binding: {...proposal.binding, units: 'cm'}})).toThrow(/units/);
  expect(() => validateLayoutCandidate({...proposal, side: {faces: [], ties: []}})).toThrow(/scope/);
  const bad = structuredClone(proposal); bad.soffit!.joistXMm = [0, 800, 400, 2400]; expect(() => validateLayoutCandidate(bad)).toThrow(/sorted/);
  bad.soffit!.joistXMm = [1, 400, 2400]; await expect(reviewLayoutCandidate(model, request, bad)).rejects.toThrow(/coverage/);
  const noChange = structuredClone(request.responseTemplate); noChange.sourceRef = 'SYNTHETIC'; noChange.rationale = 'SYNTHETIC'; await expect(reviewLayoutCandidate(model, request, noChange)).rejects.toThrow(/no coordinate changes/);
});
it('retains unknown engineering properties on newly proposed side components instead of importing AI material or load guesses', async () => {
  const model = {...fromLegacy(defaults, 'NEW-SIDE'), sideTopology: 'GROUND_BRACED' as const}, request = await createLayoutCandidateRequest(model, 'SIDE', 'POUR-A', 'RAW-A'), p = structuredClone(request.responseTemplate);
  p.sourceRef = 'SYNTHETIC dimensions only'; p.rationale = 'SYNTHETIC candidate only';
  p.side!.faces = request.readOnlyContext.faces.map(f => ({faceId: f.id, studPositionsMm: [0, f.lengthMm / 2, f.lengthMm], walers: [model.heightMm / 4, 3 * model.heightMm / 4].map((zMm, i) => ({id: `W${i}`, zMm, supports: [{id: 'A', xMm: f.lengthMm / 4}, {id: 'B', xMm: 3 * f.lengthMm / 4}]}))}));
  const r = await reviewLayoutCandidate(model, request, p), n = await applyLayoutCandidate(model, request, p, r.proposalHash, true);
  expect(n.sideLayout!.pourHeadMm).toBeNull(); expect(n.sideLayout!.baseElevationMm).toBeNull(); expect(n.sideLayout!.faces.every(f => f.stud.E_MPa === null && f.rail.I_mm4 === null && f.plywood.thicknessMm === null && f.heavierRailShare === null)).toBe(true);
  expect(n.frameLayout).toBeNull(); expect(n.ringlock).toBeNull(); expect(previewWorkflow(n).side).toBeNull(); expect(n.humanInputReviewed).toBe(false);
});
it('keeps measured tie product/history records and all downstream frame data while coordinate edits make actual bindings stale', async () => {
  const model = tieDossierApplied(), request = await createLayoutCandidateRequest(model, 'SIDE', model.sideLayout!.stageId, model.sideLayout!.loadCaseId), p = structuredClone(request.responseTemplate);
  p.sourceRef = 'SYNTHETIC revised stud positions'; p.rationale = 'SYNTHETIC no product change'; p.side!.faces[0].studPositionsMm = [0, 200, 400, 600, 800, 1000];
  p.side!.faces[0].walers[0].supports[0].xMm = 200; p.side!.faces[2].walers[0].supports[1].xMm = 800;
  const r = await reviewLayoutCandidate(model, request, p), n = await applyLayoutCandidate(model, request, p, r.proposalHash, true);
  expect(n.sideLayout!.ties[0].dossier).toEqual(model.sideLayout!.ties[0].dossier); expect(n.sideLayout!.faces[0].plywood).toEqual(model.sideLayout!.faces[0].plywood);
  expect(previewWorkflow(n).side?.ties[0].dossier?.current).toBe(false);
  const remove = structuredClone(p); remove.side!.ties.shift(); await expect(reviewLayoutCandidate(model, request, remove)).rejects.toThrow(/Protected tie/);
});
it('does not retarget locked direct-member loads when candidate joist geometry changes', async () => {
  const model = spatialApplied(), request = await createLayoutCandidateRequest(model, 'SOFFIT', model.soffitLayout!.stageId, model.soffitLayout!.loadCaseId), p = structuredClone(request.responseTemplate);
  p.sourceRef = 'SYNTHETIC'; p.rationale = 'SYNTHETIC'; p.soffit!.joistXMm = [0, 400, 800, 1200, 1600, 2000, 2400];
  expect(model.soffitLayout!.loading!.memberActions.length).toBeGreaterThan(0);
  await expect(reviewLayoutCandidate(model, request, p)).rejects.toThrow(/Direct member-bearing loads are locked/);
});
it('requires all actual side faces and forbids replacing a yoke with tie routes or omitting tied support routes', async () => {
  const model = sideFrameApplied(), request = await createLayoutCandidateRequest(model, 'SIDE', model.sideLayout!.stageId, model.sideLayout!.loadCaseId), p = structuredClone(request.responseTemplate);
  p.sourceRef = 'SYNTHETIC'; p.rationale = 'SYNTHETIC'; p.side!.faces[0].studPositionsMm = [0, 200, 400, 600, 800, 1000];
  p.side!.faces.pop(); await expect(reviewLayoutCandidate(model, request, p)).rejects.toThrow(/every actual physical face/);
  p.side = structuredClone(request.responseTemplate.side); p.side!.ties = [{id: 'FAKE-TIE', a: {faceId: 'F1', walerId: 'W1', supportId: 'S1'}, b: {faceId: 'F3', walerId: 'W1', supportId: 'S2'}}];
  await expect(reviewLayoutCandidate(model, request, p)).rejects.toThrow(/cannot replace selected yoke/);
});
it('preserves original request input identity during asynchronous source mutation and rejects oversized or authority-bearing provenance', async () => {
  const {model} = await candidateFixture(), before = structuredClone(model), pending = createLayoutCandidateRequest(model, 'SOFFIT', model.soffitLayout!.stageId, model.soffitLayout!.loadCaseId);
  model.gammaKNm3 = 99; expect((await pending).binding.inputHash).toBe(await contentHash(before));
  const {proposal} = await candidateFixture(); expect(() => validateLayoutCandidate({...proposal, rationale: 'x'.repeat(4001)})).toThrow(/bounded/);
  const a = {schemaVersion: 'local-layout-candidate-1', proposal, proposalHash: 'a'.repeat(64), appliedRevision: 'R'};
  expect(() => validateAppliedCandidate({...a, confirmed: true})).toThrow(/forbidden/);
  expect(() => parseWorkflowModel({...before, layoutCandidate: {...a, approved: true}})).toThrow(/forbidden/);
  const tooMany = structuredClone(proposal); tooMany.soffit!.joistXMm = Array.from({length: 41}, (_, i) => i * 60); expect(() => validateLayoutCandidate(tooMany)).toThrow(/40-row limit/);
  const collision = structuredClone(proposal); collision.soffit!.bearers[0].id = 'JOIST-1'; expect(() => validateLayoutCandidate(collision)).toThrow(/IDs collide/);
});
it('applies a combined side/soffit proposal atomically while missing new side properties remain unknown', async () => {
  const {model} = await candidateFixture(); model.sideTopology = 'GROUND_BRACED';
  const request = await createLayoutCandidateRequest(model, 'BOTH', model.soffitLayout!.stageId, model.soffitLayout!.loadCaseId), p = structuredClone(request.responseTemplate);
  p.sourceRef = 'SYNTHETIC complete coordinates only'; p.rationale = 'SYNTHETIC both paths'; p.soffit!.joistXMm = [0, 400, 800, 1200, 1600, 2000, 2400];
  p.side!.faces = request.readOnlyContext.faces.map(f => ({faceId: f.id, studPositionsMm: [0, f.lengthMm / 2, f.lengthMm], walers: [25, 125].map((zMm, i) => ({id: `W${i}`, zMm, supports: [{id: 'A', xMm: f.lengthMm / 4}, {id: 'B', xMm: 3 * f.lengthMm / 4}]}))}));
  const r = await reviewLayoutCandidate(model, request, p), n = await applyLayoutCandidate(model, request, p, r.proposalHash, true), preview = previewWorkflow(n);
  expect(n.sideLayout!.revisionId).toBe(n.revisionId); expect(n.sideLayout!.stageId).toBe(n.soffitLayout!.stageId); expect(n.soffitLayout!.joistXMm).toHaveLength(7);
  expect(preview.loadPath?.reactions.reduce((v, r) => v + r.forceN, 0)).toBeCloseTo(23760, 5); expect(preview.side).toBeNull(); expect(preview.constructionRelease).toBe('NO_GO');
});
it('preserves assembly, frame, case and Stage definitions as stale data until their own explicit reapply', async () => {
  const source = casesApplied(), row = captureStage(source, {...emptyStage('POUR'), stageId: source.soffitLayout!.stageId, evidenceRef: 'SYNTHETIC stage'});
  const model = applyStageStudy(source, {schemaVersion: '1', stages: [row]}), request = await createLayoutCandidateRequest(model, 'SOFFIT', model.soffitLayout!.stageId, model.soffitLayout!.loadCaseId), p = structuredClone(request.responseTemplate);
  p.sourceRef = 'SYNTHETIC'; p.rationale = 'SYNTHETIC changed joists'; p.soffit!.joistXMm = [0, 400, 800, 1200, 1600, 2000, 2400];
  const r = await reviewLayoutCandidate(model, request, p), n = await applyLayoutCandidate(model, request, p, r.proposalHash, true), preview = previewWorkflow(n);
  for (const key of ['frameLayout', 'ringlockAssembly', 'loadCases', 'stageStudy'] as const) expect(n[key]).toEqual(model[key]);
  expect(preview.loadCases?.current).toBe(false); expect(preview.stageStudy?.current).toBe(false); expect(preview.assembly?.frameGeometryReady).toBe(false); expect(preview.frame?.analysis).toBeNull();
});
it('allows unrelated joist changes when each directly loaded physical member retains its actual ID, axis, line and span', async () => {
  const model = spatialApplied(), request = await createLayoutCandidateRequest(model, 'SOFFIT', model.soffitLayout!.stageId, model.soffitLayout!.loadCaseId), p = structuredClone(request.responseTemplate);
  p.sourceRef = 'SYNTHETIC'; p.rationale = 'SYNTHETIC no movement of loaded JOIST-3 or B2'; p.soffit!.joistXMm = [0, 600, 1200, 1500, 1800, 2100, 2400];
  const r = await reviewLayoutCandidate(model, request, p), n = await applyLayoutCandidate(model, request, p, r.proposalHash, true), before = previewWorkflow(model), after = previewWorkflow(n);
  expect(n.soffitLayout!.loading!.memberActions).toEqual(model.soffitLayout!.loading!.memberActions);
  expect(after.loadPath).not.toBeNull(); expect(after.soffit!.terminalForceN).toBeCloseTo(before.soffit!.terminalForceN, 5);
  expect(after.loadPath!.analyses.find(a => a.id === 'JOIST-3')?.input.points).toEqual(before.loadPath!.analyses.find(a => a.id === 'JOIST-3')?.input.points);
});
it('freezes full proposal provenance in the same report/drawing while import and later input edits cannot turn it into approval', async () => {
  const {model, request, proposal} = await candidateFixture(), r = await reviewLayoutCandidate(model, request, proposal), n = await applyLayoutCandidate(model, request, proposal, r.proposalHash, true);
  const frozen = await freezeDesign(n), view = await documentView(frozen, n);
  expect(view.drawing.layoutCandidate).toEqual(view.report.model.layoutCandidate); expect(view.approval).toBeNull(); expect(view.constructionEligible).toBe(false);
  expect(importDraft(n).humanInputReviewed).toBe(false); expect(importDraft(n).layoutCandidate?.proposal).toEqual(proposal);
  expect((await documentView(frozen, reviseDraft(n, {additionalDeadKPa: 1}))).freshness).toBe('STALE');
  const forged = structuredClone(frozen); (forged.content.model.layoutCandidate!.proposal as unknown as Record<string, unknown>).approved = true;
  forged.inputHash = await contentHash(forged.content.model); forged.snapshotHash = await contentHash(forged.content);
  await expect(documentView(forged, forged.content.model)).rejects.toThrow(/forbidden/);
});
