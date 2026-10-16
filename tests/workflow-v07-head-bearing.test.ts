import {expect, it} from 'vitest';
import {canonical} from '../src/domain/workflowV07/common';
import {emptyHeadBearing, evaluateHeadBearings, validateHeadBearing} from '../src/domain/workflowV07/headBearing';
import {stampRinglockAssembly} from '../src/domain/workflowV07/ringlockAssembly';
import {parseWorkflowModel, previewWorkflow, regenerateDraftLayouts, reviseDraft} from '../src/domain/workflowV07/model';
import {compileLoadCase} from '../src/domain/workflowV07/loadCases';
import {captureStage, compileStage, copyToDraftStage, applyStageStudy, emptyStage} from '../src/domain/workflowV07/stageStudy';
import {createLayoutCandidateRequest, reviewLayoutCandidate, applyLayoutCandidate} from '../src/domain/workflowV07/layoutCandidate';
import {freezeDesign, contentHash, documentView} from '../src/domain/workflowV07/snapshot';
import {headBearingApplied, headBearingFixture} from './fixtures/workflow-v07-head-bearing';
import {assemblyFrameApplied} from './fixtures/workflow-v07-assembly';
import {caseDefinition} from './fixtures/workflow-v07-loadcases';
import {timberBinding} from './fixtures/workflow-v07-elastic-binding';
import {steelBinding, sourceMaterials} from './fixtures/workflow-v07-elastic-binding';
import {selectReference} from '../src/domain/workflowV07/catalogues';

function apply(f: ReturnType<typeof headBearingFixture>) {return regenerateDraftLayouts(f.model, {ringlockAssembly: stampRinglockAssembly(f.model, f.definition)}, {allowIncomplete: true});}
it('keeps empty head-seat inputs unknown and every actual head in the requirement matrix', () => {
  const m = assemblyFrameApplied(), p = previewWorkflow(m), rows = p.headBearings!.rows;
  expect(rows).toHaveLength(6); expect(rows.every(r => r.definition === null && r.contact === null && !r.geometryReady)).toBe(true);
  expect(p.headBearings!.requiredChecks.filter(r => r.checkId === 'SOFFIT-08')).toHaveLength(6);
  const d = emptyHeadBearing(); expect(d.seatLocalX).toEqual([null, null]); expect(d.minimumSideClearanceMm).toBeNull(); expect(d.plateThicknessMm).toBeNull(); expect(d.sideBlocking).toBeNull();
});
it('computes unequal actual head pressure demands with exact full bearing areas and no product approval', () => {
  const m = headBearingApplied(), p = previewWorkflow(m), result = p.headBearings!, row = result.rows[1];
  expect(result.rows.every(r => r.geometryReady && !!r.contact?.result)).toBe(true); expect(row.source!.forceN[2]).toBeCloseTo(-7053.75, 5);
  expect(row.contact!.result!.pressureMaxMPa).toBeCloseTo(7053.75 / 10000, 10); expect(result.rows[0].contact!.result!.pressureMaxMPa).toBeCloseTo(2413.125 / 10000, 10);
  expect(row.geometry?.leftClearanceMm).toBe(20); expect(row.geometry?.rightClearanceMm).toBe(20); expect(row.geometry?.contactAreaMm2).toBe(10000);
  expect(row.sourceLink).toMatchObject({upstreamAnalysisId: 'B1', supportId: row.headNodeId, upstreamRevision: m.revisionId, stageId: m.soffitLayout!.stageId, loadCaseId: m.soffitLayout!.loadCaseId});
  expect(result.rows.reduce((s, r) => s - r.source!.forceN[2], 0)).toBeCloseTo(23760, 5); expect(result.status).toBe('BLOCKED'); expect(p.constructionEligible).toBe(false);
});
it('uses actual body width and each side clearance instead of passing by plate width or total spare gap', () => {
  const f = headBearingFixture(), d = f.definition.legs[0].headBearing!; d.cavityOffsetYMm = 15;
  let r = previewWorkflow(apply(f)).headBearings!.rows[0]; expect(r.geometry!.leftClearanceMm).toBe(5); expect(r.geometry!.rightClearanceMm).toBe(35); expect(r.status).toBe('FAIL'); expect(r.contact).toBeNull();
  d.cavityOffsetYMm = 0; d.bearerCenterOffsetYMm = 15; r = previewWorkflow(apply(f)).headBearings!.rows[0];
  expect(r.geometry!.leftClearanceMm).toBe(35); expect(r.geometry!.rightClearanceMm).toBe(5); expect(r.status).toBe('FAIL');
});
it('rejects a bearing patch outside the real plate or bearer end rather than shortening it silently', () => {
  const f = headBearingFixture(); f.definition.legs[0].headBearing!.contactLengthMm = 240;
  let r = previewWorkflow(apply(f)).headBearings!.rows[0]; expect(r.status).toBe('FAIL'); expect(r.issues).toContain('DECLARED_CONTACT_PATCH_OUTSIDE_ACTUAL_HEAD_PLATE'); expect(r.contact).toBeNull();
  const g = headBearingFixture(); g.model.soffitLayout!.bearerStartXMm = 0;
  r = previewWorkflow(apply(g)).headBearings!.rows[0]; expect(r.status).toBe('FAIL'); expect(r.issues).toContain('DECLARED_CONTACT_PATCH_OUTSIDE_ACTUAL_BEARER_END_OR_FACE'); expect(r.contact).toBeNull();
});
it('keeps bearing width distinct from the physical bearer envelope and checks the actual contact face', () => {
  const f = headBearingFixture(), d = f.definition.legs[0].headBearing!; d.contactWidthMm = 120;
  const r = previewWorkflow(apply(f)).headBearings!.rows[0]; expect(r.status).toBe('FAIL'); expect(r.issues).toContain('DECLARED_CONTACT_PATCH_OUTSIDE_ACTUAL_BEARER_END_OR_FACE');
});
it('recovers eccentric partial compression under the declared flat law and retains its signed reference moment once', () => {
  const f = headBearingFixture(), d = f.definition.legs[1].headBearing!; d.contactCenterMm[0]! += 25;
  const r = previewWorkflow(apply(f)).headBearings!.rows[1], N = -r.source!.forceN[2];
  expect(r.contactDemand!.momentNmm[1]).toBeCloseTo(-25 * N, 5); expect(r.shaftDemand!.momentNmm[1]).toBeCloseTo(0, 5);
  expect(r.contact!.result!.contact).toBe('PARTIAL_COMPRESSION'); expect(r.contact!.result!.contactAreaMm2).toBeCloseTo(7500, 4); expect(r.contact!.result!.pressureMaxMPa).toBeCloseTo(2 * N / 7500, 8);
  expect(r.contact!.result!.eccentricityMm!.x).toBeCloseTo(-25, 8); expect(r.status).toBe('BLOCKED');
});
it('keeps a physically impossible contact resultant as FAIL relative to the law without inventing tension anchors', () => {
  const f = headBearingFixture(), d = f.definition.legs[1].headBearing!; d.contactLengthMm = 40; d.contactCenterMm[0]! += 30;
  const r = previewWorkflow(apply(f)).headBearings!.rows[1]; expect(r.geometryReady).toBe(true); expect(r.contact!.status).toBe('FAIL'); expect(r.contact!.result).toBeNull(); expect(r.status).toBe('FAIL');
});
it('supports explicit reversed seat axes and refuses unknown/nonunit/oblique axes', () => {
  const f = headBearingFixture(); f.definition.legs[1].headBearing!.seatLocalX = [-1, 0];
  expect(previewWorkflow(apply(f)).headBearings!.rows[1].geometryReady).toBe(true);
  for (const axis of [[null, null], [2, 0], [0, 1], [1, 1e-6]] as [number | null, number | null][]) {f.definition.legs[1].headBearing!.seatLocalX = axis; expect(previewWorkflow(apply(f)).headBearings!.rows[1].contact).toBeNull();}
});
it('retains known upstream wrench when a drafted head property or pressure-law source is unknown', () => {
  const f = headBearingFixture(); f.definition.legs[0].headBearing = emptyHeadBearing();
  let r = previewWorkflow(apply(f)).headBearings!.rows[0]; expect(r.source?.forceN[2]).toBeCloseTo(-2413.125, 5); expect(r.contact).toBeNull();
  const g = headBearingFixture(); g.definition.legs[0].headBearing!.pressureModelEvidenceRef = ''; r = previewWorkflow(apply(g)).headBearings!.rows[0]; expect(r.geometryReady).toBe(true); expect(r.contactDemand).not.toBeNull(); expect(r.contact).toBeNull();
  const h = headBearingFixture(); h.definition.legs[0].headBearing!.bearerCenterOffsetYMm = null; r = previewWorkflow(apply(h)).headBearings!.rows[0]; expect(r.source).not.toBeNull(); expect(r.geometry).toBeNull(); expect(r.contact).toBeNull();
});
it('does not interpret missing side blocking or a NONE declaration as an approved restraint', () => {
  for (const mode of [null, 'NONE', 'BOTH_SIDES'] as const) {const f = headBearingFixture(), d = f.definition.legs[0].headBearing!; d.sideBlocking = mode; d.sideBlockingEvidenceRef = '';
    const r = previewWorkflow(apply(f)).headBearings!.rows[0]; expect(r.geometryReady).toBe(true); expect(r.status).toBe('BLOCKED'); expect(r.issues).toContain('ACTUAL_TWO_SIDED_BLOCKING_AND_RETENTION_EVIDENCE_REQUIRED');
  }
});
it('refuses product substitution, conflicting stack depth and mismatched bearing datums', () => {
  const variants = [(d: ReturnType<typeof emptyHeadBearing>) => {d.productRef = 'OTHER';}, (d: ReturnType<typeof emptyHeadBearing>) => {d.bearerDepthMm = 99;}, (d: ReturnType<typeof emptyHeadBearing>) => {d.seatCenterMm[2]! += 1;}];
  for (const change of variants) {const f = headBearingFixture(); change(f.definition.legs[0].headBearing!); const r = previewWorkflow(apply(f)).headBearings!.rows[0]; expect(r.contact).toBeNull(); expect(r.geometryReady).toBe(false);}
});
it('checks measured timber orientation/envelope against its bound actual geometry without using its nominal label', () => {
  const f = headBearingFixture(), soffit = f.model.soffitLayout!; soffit.bearer.binding = timberBinding(); soffit.bearer.E_MPa = null; soffit.bearer.I_mm4 = null;
  for (const l of f.definition.legs) {l.upperStack.bearerDepthMm = 70; l.soffitElevationMm = 3157; l.headBearing!.bearerDepthMm = 70; l.headBearing!.contactWidthMm = 38;}
  let r = previewWorkflow(apply(f)).headBearings!.rows[0]; expect(r.geometryReady).toBe(false); expect(r.issues.some(s => s.includes('bound section'))).toBe(true);
  for (const l of f.definition.legs) l.headBearing!.bearerWidthMm = 38;
  r = previewWorkflow(apply(f)).headBearings!.rows[0]; expect(r.geometryReady).toBe(true); expect(r.contact?.result).not.toBeNull();
});
it('does not model coupled multiple rails or curved tube seats as one equivalent flat rectangle', () => {
  const f = headBearingFixture(); f.definition.legs[0].headBearing!.layout = 'MULTIPLE_BEARERS_OR_RAILS';
  const r = previewWorkflow(apply(f)).headBearings!.rows[0]; expect(r.contact).toBeNull(); expect(r.source).not.toBeNull(); expect(r.issues.some(s => s.includes('COUPLED_OR_SADDLE'))).toBe(true);
});
it('requires a saddle model for a bound CHS even if a flat-contact declaration and envelope would otherwise fit', () => {
  const f = headBearingFixture(), binding = steelBinding();
  binding.section = selectReference({section_id: 'SYNTHETIC-CHS-NOT-STOCK', family: 'CHS', candidate_selectable: true, B_mm: 100, H_mm: 100, t_mm: 3, A_cm2: 10, Ix_cm4: 100, Iy_cm4: 100, Sx_cm3: 20, Sy_cm3: 20}, 'SYNTHETIC only');
  binding.material = selectReference(sourceMaterials.find(m => m.material_id === 'STEEL-STK400'), '0.5.0');
  f.model.soffitLayout!.bearer.binding = binding; f.model.soffitLayout!.bearer.E_MPa = null; f.model.soffitLayout!.bearer.I_mm4 = null;
  const r = previewWorkflow(apply(f)).headBearings!.rows[0]; expect(r.source).not.toBeNull(); expect(r.contact).toBeNull(); expect(r.issues).toContain('CHS_CURVED_SEAT_SADDLE_RETAINER_AND_CONTACT_MODEL_REQUIRED');
});
it('rejects altered reaction rows and authored-vs-generated graph inconsistencies, not just revision strings', () => {
  const m = headBearingApplied(), p = previewWorkflow(m), fake = structuredClone(p.loadPath!.reactions); fake[0].forceN += 1;
  let r = evaluateHeadBearings(m, p.assembly!, fake); expect(r.rows.every(row => row.contact === null)).toBe(true); expect(r.blockers.some(s => s.includes('altered'))).toBe(true);
  const changed = structuredClone(m); changed.constructionLiveKPa = 10;
  r = evaluateHeadBearings(changed, p.assembly!, p.loadPath!.reactions); expect(r.rows.every(row => row.contact === null)).toBe(true); expect(r.blockers.some(s => s.includes('graph differ'))).toBe(true);
});
it('marks reactions/contact stale after edits and recomputes changed demands only on explicit regeneration', () => {
  const m = headBearingApplied(), changed = reviseDraft(m, {constructionLiveKPa: 3}); expect(previewWorkflow(changed).headBearings!.rows.every(r => r.contact === null)).toBe(true);
  const next = regenerateDraftLayouts(changed, {}, {allowIncomplete: true}); expect(previewWorkflow(next).headBearings!.rows.every(r => r.geometryReady)).toBe(true);
  expect(previewWorkflow(next).headBearings!.rows[1].contact!.result!.pressureMaxMPa).toBeGreaterThan(previewWorkflow(m).headBearings!.rows[1].contact!.result!.pressureMaxMPa);
});
it('uses each case source force once without reapplying its factors at the head contact', () => {
  const m = headBearingApplied(); m.designBasisRef = 'SYNTHETIC coefficient sensitivity'; const c = caseDefinition('HEAD'); c.factors.CONCRETE = 1.2; c.factors.CONSTRUCTION_LL = 1.5;
  const child = compileLoadCase(m, c), p = previewWorkflow(child), r = p.headBearings!.rows[1];
  expect(r.source!.forceN[2]).toBeCloseTo(-p.loadPath!.reactions.find(q => q.nodeId === r.headNodeId)!.forceN, 5); expect(r.contact!.result!.pressureMaxMPa).toBeCloseTo(-r.source!.forceN[2] / 10000, 10); expect(p.headBearings!.loadCaseId).toBe(c.loadCaseId); expect(r.status).toBe('BLOCKED');
});
it('rebuilds independent Stage heads and clears copied retention/contact-law evidence without erasing physical dimensions', () => {
  const m = headBearingApplied(), row = captureStage(m, {...emptyStage('H'), stageId: m.soffitLayout!.stageId, evidenceRef: 'SYNTHETIC stage'});
  const book = applyStageStudy(m, {schemaVersion: '1', stages: [row]}), stage = compileStage(book, row); expect(previewWorkflow(stage).headBearings!.rows.every(r => !!r.contact?.result)).toBe(true);
  const copy = copyToDraftStage(book, 'NEXT'), d = copy.ringlockAssembly!.legs[0].headBearing!; expect(d.plateWidthMm).toBe(160); expect(d.sideBlockingEvidenceRef).toBe(''); expect(d.pressureModelEvidenceRef).toBe('');
});
it('retains measured head-seat definitions with stale assembly stamps after a coordinate proposal', async () => {
  const m = headBearingApplied(), req = await createLayoutCandidateRequest(m, 'SOFFIT', m.soffitLayout!.stageId, m.soffitLayout!.loadCaseId), proposal = structuredClone(req.responseTemplate);
  proposal.sourceRef = 'SYNTHETIC'; proposal.rationale = 'SYNTHETIC'; proposal.soffit!.joistXMm = [0, 400, 800, 1200, 1600, 2000, 2400];
  const review = await reviewLayoutCandidate(m, req, proposal), next = await applyLayoutCandidate(m, req, proposal, review.proposalHash, true);
  expect(next.ringlockAssembly).toEqual(m.ringlockAssembly); expect(previewWorkflow(next).headBearings!.rows.every(r => r.contact === null)).toBe(true);
});
it('rejects authority/force/capacity injection and refuses nonfinite geometry without publishing Infinity', () => {
  const d = emptyHeadBearing(); expect(() => validateHeadBearing({...d, confirmed: true})).toThrow(/authority/); expect(() => validateHeadBearing({...d, forceN: 0})).toThrow(); expect(() => validateHeadBearing({...d, swlKN: 60})).toThrow();
  expect(() => validateHeadBearing({...d, plateWidthMm: Infinity})).toThrow(); const f = headBearingFixture(); f.definition.legs[0].headBearing!.contactCenterMm[0] = 1e308;
  const r = previewWorkflow(apply(f)).headBearings!; expect(r.rows[0].contact).toBeNull(); expect(() => canonical(r)).not.toThrow();
  expect(() => parseWorkflowModel({...f.model, ringlockAssembly: {...f.definition, approved: true}})).toThrow();
});
it('freezes actual head demands/geometry with the same report and drawing and rejects rehashed forged pressures', async () => {
  const m = headBearingApplied(), frozen = await freezeDesign(m), view = await documentView(frozen, m);
  expect(view.drawing.headBearings).toEqual(view.report.preview.headBearings); expect(view.approval).toBeNull(); expect(view.constructionEligible).toBe(false);
  const bad = structuredClone(frozen); bad.content.preview.headBearings!.rows[0].contact!.result!.pressureMaxMPa = 0; bad.snapshotHash = await contentHash(bad.content);
  await expect(documentView(bad, m)).rejects.toThrow(/calculation mismatch/);
});
