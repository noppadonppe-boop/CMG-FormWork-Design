import {expect, it} from 'vitest';
import {canonical} from '../src/domain/workflowV07/common';
import {captureSupportLayout, evaluateSupportLayout, stampSupportLayout, validateSupportLayout} from '../src/domain/workflowV07/supportLayout';
import {currentProducedFrame, stampFrameLayout} from '../src/domain/workflowV07/frameWorkflow';
import {parseWorkflowModel, previewWorkflow, regenerateDraftLayouts, reviseDraft} from '../src/domain/workflowV07/model';
import {compileLoadCase} from '../src/domain/workflowV07/loadCases';
import {applyStageStudy, captureStage, compileStage, copyToDraftStage, emptyStage} from '../src/domain/workflowV07/stageStudy';
import {contentHash, documentView, freezeDesign} from '../src/domain/workflowV07/snapshot';
import {applyLayoutCandidate, createLayoutCandidateRequest, reviewLayoutCandidate} from '../src/domain/workflowV07/layoutCandidate';
import {frameApplied, frameFixture} from './fixtures/workflow-v07-frame-workflow';
import {assemblyFrameApplied} from './fixtures/workflow-v07-assembly';
import {caseDefinition} from './fixtures/workflow-v07-loadcases';
import {applySupportFixture, supportApplied, supportFixture} from './fixtures/workflow-v07-support';

const total = (m: ReturnType<typeof frameApplied>) => previewWorkflow(m).supports!.rows.reduce((s, b) => s - b.terminalWrench!.forceN[2], 0);
it('captures only actual BASE IDs/current scope with all engineering inputs unknown', () => {
  const m = frameApplied(), frame = previewWorkflow(m).frame!, d = captureSupportLayout(m, frame);
  expect(d.bases).toHaveLength(6); expect(d.bases.map(b => b.frameNodeId)).toEqual(['FB-1', 'FB-2', 'FB-3', 'FB-4', 'FB-5', 'FB-6']);
  expect(d.bases.every(b => !b.path && !b.datum && !b.supportKind && b.soleBoardThicknessMm === null && !b.interfaces.length)).toBe(true);
  expect(d.evidenceRef).toBe(''); expect(d.stageId).toBe(m.frameLayout!.stageId);
});
it('accepts only current in-process calculation lineage, rejecting copied, mutated and stale frame output', () => {
  const m = frameApplied(), frame = previewWorkflow(m).frame!;
  expect(currentProducedFrame(m, frame)).toBe(frame.analysis);
  expect(() => captureSupportLayout(m, structuredClone(frame))).toThrow(/produced|current/i);
  frame.analysis!.nodes[0].reactionForceN[2] += 1;
  expect(() => captureSupportLayout(m, frame)).toThrow();
  expect(() => captureSupportLayout(reviseDraft(m, {constructionLiveKPa: 3}), previewWorkflow(m).frame!)).toThrow();
});
it('preserves individual signed base wrenches, unequal pressures and zero settlement availability without ground basis', () => {
  const m = supportApplied(), p = previewWorkflow(m), s = p.supports!;
  expect(s.completeTerminalWrenchCoverage).toBe(true); expect(total(m)).toBeCloseTo(23760, 4);
  const b = s.rows.find(b => b.frameNodeId === 'FB-2')!, c = b.contacts[0];
  expect(b.sourceFrameToSupport!.forceN[2]).toBeCloseTo(-7053.75, 5); expect(c.contact?.result?.pressureMaxMPa).toBeCloseTo(7053.75 / 80000, 10);
  expect(new Set(s.rows.map(b => b.contacts[0].contact?.result?.pressureMaxMPa)).size).toBeGreaterThan(1);
  expect(s.rows.every(b => b.contacts[0].settlement === null && b.contacts[0].definition.declaredPressureLimitMPa === null)).toBe(true);
  expect(s.status).toBe('BLOCKED'); expect(s.constructionRelease).toBe('NO_GO'); expect(p.constructionEligible).toBe(false);
  expect(b.equilibrium?.forceResidualN.every(v => Math.abs(v) < 1e-9)).toBe(true);
});
it('transfers two serial interfaces with each component weight and eccentric moment added exactly once', () => {
  const {model, definition} = supportFixture(undefined, true), b = definition.bases[0], [u, l] = b.interfaces;
  u.weight.rawForceN = 100; u.weight.pointMm = [20, 0, 10]; l.weight.rawForceN = 200; l.weight.pointMm = [-10, 0, -25];
  const m = applySupportFixture(model, definition), row = previewWorkflow(m).supports!.rows[0], initial = -row.sourceFrameToSupport!.forceN[2];
  expect(-row.contacts[0].wrench!.forceN[2]).toBeCloseTo(initial + 100, 6); expect(-row.terminalWrench!.forceN[2]).toBeCloseTo(initial + 300, 6);
  expect(row.contacts[0].wrench!.momentNmm[1]).toBeCloseTo(2000, 5); expect(row.terminalWrench!.momentNmm[1]).toBeCloseTo(0, 5);
  expect(row.contacts[0].contact!.result!.areaFraction).toBe(1); expect(row.contacts[1].contact!.result!.pressureMaxMPa).toBeCloseTo((initial + 300) / 320000, 9);
  expect(total(m)).toBeCloseTo(24060, 4); expect(row.equilibrium!.momentResidualNmm.every(v => Math.abs(v) < 1e-6)).toBe(true);
});
it('changes moment reference by r cross F once while preserving transverse force and torsion', () => {
  const {model, definition: f} = frameFixture();
  f.additionalActions = [{id: 'H', nodeId: 'FH-1', kind: 'WIND', ownershipId: 'SYN-H', evidenceRef: 'SYNTHETIC', forceN: [1, 2, 0], momentNmm: [0, 0, 30], atNode: true, offsetMm: [null, null, null], offsetEvidenceRef: ''}];
  const m = regenerateDraftLayouts(model, {frameLayout: stampFrameLayout(model, f)}), fixture = supportFixture(m, true), result = previewWorkflow(applySupportFixture(m, fixture.definition)).supports!.rows[0];
  expect(result.sourceFrameToSupport!.forceN[0]).toBeCloseTo(1, 6); expect(result.sourceFrameToSupport!.forceN[1]).toBeCloseTo(2, 6);
  expect(result.contacts[1].wrench!.momentNmm[0] - result.sourceFrameToSupport!.momentNmm[0]).toBeCloseTo(-100, 6);
  expect(result.contacts[1].wrench!.momentNmm[1] - result.sourceFrameToSupport!.momentNmm[1]).toBeCloseTo(50, 6);
  expect(result.contacts[1].wrench!.momentNmm[2]).toBeCloseTo(30, 6);
  expect(result.contacts[1].requiredFrictionRatio).toBeCloseTo(Math.sqrt(5) / -result.sourceFrameToSupport!.forceN[2], 10);
});
it('blocks unknown weight and positive weight without a CG rather than using zero or a complete downstream pressure', () => {
  for (const raw of [null, 100]) {const {model, definition} = supportFixture(undefined, true); definition.bases[0].interfaces[0].weight.rawForceN = raw;
    const r = previewWorkflow(applySupportFixture(model, definition)).supports!;
    expect(r.completeTerminalWrenchCoverage).toBe(false); expect(r.rows[0].terminalWrench).toBeNull(); expect(r.rows[0].equilibrium).toBeNull();
    expect(r.rows[0].contacts.every(c => !c.completeWrench && c.contact === null)).toBe(true);
  }
});
it('keeps a known downstream wrench when only the upstream contact-law hypothesis is unknown', () => {
  const {model, definition} = supportFixture(undefined, true); definition.bases[0].interfaces[0].model = null;
  const r = previewWorkflow(applySupportFixture(model, definition)).supports!.rows[0];
  expect(r.contacts[0].contact).toBeNull(); expect(r.contacts[0].completeWrench).toBe(true); expect(r.contacts[1].contact?.result).not.toBeNull(); expect(r.terminalWrench).not.toBeNull();
});
it('does not hide unmapped restraints including non-BASE nodes or zero forces', () => {
  const {model, definition} = supportFixture(); definition.bases.pop();
  let s = previewWorkflow(applySupportFixture(model, definition)).supports!; expect(s.unmappedRestraints[0].frameNodeId).toBe('FB-6'); expect(s.completeTerminalWrenchCoverage).toBe(false);
  const {model: source, definition: f} = frameFixture(); f.nodes.find(n => n.id === 'FH-1')!.boundary[0] = {kind: 'FIXED'};
  const changed = regenerateDraftLayouts(source, {frameLayout: stampFrameLayout(source, f)}), fixture = supportFixture(changed); fixture.definition.bases[0].frameNodeId = 'FH-1';
  s = previewWorkflow(applySupportFixture(changed, fixture.definition)).supports!;
  expect(s.unmappedRestraints.map(n => n.frameNodeId)).toContain('FH-1'); expect(s.unmappedRestraints.map(n => n.frameNodeId)).toContain('FB-1'); expect(s.completeTerminalWrenchCoverage).toBe(false);
});
it('rejects duplicate weight ownership and references only actual included SELF_WEIGHT frame actions', () => {
  const {model, definition} = supportFixture(); definition.bases[1].interfaces[0].weight.ownershipId = definition.bases[0].interfaces[0].weight.ownershipId;
  let s = previewWorkflow(applySupportFixture(model, definition)).supports!; expect(s.blockers.some(b => b.includes('DUPLICATE_SUPPORT_WEIGHT'))).toBe(true); expect(s.rows.every(b => b.terminalWrench === null)).toBe(true);
  const {model: source, definition: f} = frameFixture(); f.additionalActions = [{id: 'W', nodeId: 'FH-1', kind: 'SELF_WEIGHT', ownershipId: 'SYN-W', evidenceRef: 'SYNTHETIC', forceN: [0, 0, -100], momentNmm: [0, 0, 0], atNode: true, offsetMm: [null, null, null], offsetEvidenceRef: ''}];
  const m = regenerateDraftLayouts(source, {frameLayout: stampFrameLayout(source, f)}), fixture = supportFixture(m); fixture.definition.bases[0].interfaces[0].weight = {mode: 'ALREADY_IN_FRAME', ownershipId: 'SYN-W', rawForceN: null, pointMm: [null, null, null], evidenceRef: 'SYNTHETIC existing weight'};
  expect(total(applySupportFixture(m, fixture.definition))).toBeCloseTo(23860, 4);
  fixture.definition.bases[0].interfaces[0].weight.ownershipId = 'NOT-IN-FRAME'; s = previewWorkflow(applySupportFixture(m, fixture.definition)).supports!; expect(s.rows[0].terminalWrench).toBeNull();
});
it('closes measured assembly datums and refuses omitted board thickness or an overhanging footplate', () => {
  const model = assemblyFrameApplied(), {definition} = supportFixture(model, true);
  expect(previewWorkflow(applySupportFixture(model, definition)).supports!.completeTerminalWrenchCoverage).toBe(true);
  definition.bases[0].interfaces[1].centerMm[2]! -= 1;
  expect(previewWorkflow(applySupportFixture(model, definition)).supports!.rows[0].terminalWrench).toBeNull();
  const direct = supportFixture(model); expect(previewWorkflow(applySupportFixture(model, direct.definition)).supports!.rows.every(r => r.terminalWrench === null)).toBe(true);
  const x = supportFixture(undefined, true); x.definition.bases[0].interfaces[0].lengthXMm = 500;
  expect(previewWorkflow(applySupportFixture(x.model, x.definition)).supports!.rows[0].status).toBe('FAIL');
});
it('compares only matching declared limit bases; favorable or characteristic/test limits never become PASS', () => {
  const {model, definition} = supportFixture(), c = definition.bases[0].interfaces[0]; c.declaredPressureLimitMPa = .001; c.limitEvidenceRef = 'SYNTHETIC comparison only';
  for (const basis of ['CHARACTERISTIC', 'TEST', 'DESIGN', 'ALLOWABLE'] as const) {c.resistanceBasis = basis; const r = previewWorkflow(applySupportFixture(model, definition)).supports!;
    expect(r.rows[0].contacts[0].declaredLimitExceeded).toBe(basis === 'ALLOWABLE'); expect(r.status).toBe(basis === 'ALLOWABLE' ? 'FAIL' : 'BLOCKED');
  }
  c.declaredPressureLimitMPa = 100; expect(previewWorkflow(applySupportFixture(model, definition)).supports!.status).toBe('BLOCKED');
});
it('uses optional explicit soil k only at the ground interface and never substitutes for slab or timber', () => {
  const {model, definition} = supportFixture(undefined, true), [u, l] = definition.bases[0].interfaces;
  for (const c of [u, l]) {c.soilSpringNPerMm3 = .01; c.soilSpringEvidenceRef = 'SYNTHETIC Winkler sensitivity only';}
  let r = previewWorkflow(applySupportFixture(model, definition)).supports!.rows[0]; expect(r.contacts[0].settlement).toBeNull(); expect(r.contacts[1].settlement!.maximumDownwardMm).toBeCloseTo(r.contacts[1].contact!.result!.pressureMaxMPa / .01, 10);
  definition.bases[0].supportKind = 'YOUNG_SLAB'; r = previewWorkflow(applySupportFixture(model, definition)).supports!.rows[0]; expect(r.contacts.every(c => c.settlement === null)).toBe(true); expect(r.contacts[1].issues.some(s => s.includes('ACTUAL_SLAB_GEOMETRY'))).toBe(true);
  definition.bases[0].supportKind = 'SOIL'; l.soilSpringNPerMm3 = 5e-324; r = previewWorkflow(applySupportFixture(model, definition)).supports!.rows[0]; expect(r.contacts[1].settlement).toBeNull(); expect(() => canonical(r)).not.toThrow();
});
it('recomputes case reactions and new support weights with distinct coefficients once, keeping soil k unscaled', () => {
  const {model, definition} = supportFixture(); definition.bases[0].interfaces[0].weight.rawForceN = 100; definition.bases[0].interfaces[0].weight.pointMm = [0, 0, 10];
  definition.bases[0].interfaces[0].soilSpringNPerMm3 = .01; definition.bases[0].interfaces[0].soilSpringEvidenceRef = 'SYNTHETIC';
  const m = applySupportFixture(model, definition); m.designBasisRef = 'SYNTHETIC coefficient sensitivity'; const c = caseDefinition('SUP', {stageId: m.frameLayout!.stageId}); c.factors.SELF_WEIGHT = 1.5; c.factors.CONCRETE = 1.2;
  const child = compileLoadCase(m, c), p = previewWorkflow(child), s = p.supports!;
  expect(s.rows[0].contacts[0].selfWeightAddedN).toBe(150); expect(s.loadCaseId).toBe(c.loadCaseId); expect(s.revisionId).toBe(child.revisionId);
  expect(s.rows[0].terminalWrench!.forceN[2]).toBeCloseTo(s.rows[0].sourceFrameToSupport!.forceN[2] - 150, 5); expect(total(child)).toBeCloseTo(p.frame!.analysis!.nodes.filter(n => n.id.startsWith('FB-')).reduce((s, n) => s + n.reactionForceN[2], 0) + 150, 5);
  expect(s.rows[0].contacts[0].definition.soilSpringNPerMm3).toBe(.01);
});
it('retains per-stage support input, recomputes results and clears scope/young-slab evidence on explicit stage copy', () => {
  const m = supportApplied(); m.supportLayout!.bases[0].supportKind = 'YOUNG_SLAB'; const row = captureStage(m, {...emptyStage('A'), stageId: m.frameLayout!.stageId, evidenceRef: 'SYNTHETIC stage'});
  expect(row.inputs!.supportLayout!.revisionId).toBe('CAPTURED_INPUT'); expect(row.inputs!.supportLayout!.inputDefinition).toBe('');
  const study = applyStageStudy(m, {schemaVersion: '1', stages: [row]}), stage = compileStage(study, row); expect(previewWorkflow(stage).supports!.completeTerminalWrenchCoverage).toBe(true);
  const copied = copyToDraftStage(study, 'NEXT'); expect(copied.supportLayout!.evidenceRef).toBe(''); expect(copied.supportLayout!.bases[0].supportEvidenceRef).toBe(''); expect(copied.supportLayout!.stageId).toBe('NEXT');
});
it('invalidates support data on input changes and keeps schema strict against duplicate mapping or fabricated approval', () => {
  const m = supportApplied(), changed = reviseDraft(m, {constructionLiveKPa: 3}); expect(previewWorkflow(changed).supports!.rows.every(r => r.terminalWrench === null)).toBe(true);
  const rebuilt = regenerateDraftLayouts(changed, {}, {allowIncomplete: true}); expect(previewWorkflow(rebuilt).supports!.completeTerminalWrenchCoverage).toBe(true);
  const p = structuredClone(m.supportLayout!); p.bases[1].frameNodeId = p.bases[0].frameNodeId; expect(() => validateSupportLayout(p)).toThrow(/Duplicate/);
  expect(() => parseWorkflowModel({...m, supportLayout: {...m.supportLayout!, approved: true}})).toThrow();
  expect(() => validateSupportLayout({...m.supportLayout!, bases: Array.from({length: 81}, (_, i) => ({...p.bases[0], id: `B${i}`}))})).toThrow(/80/);
  const freshFrame = previewWorkflow(m).frame!; expect(evaluateSupportLayout(changed, m.supportLayout!, freshFrame).rows.every(r => r.terminalWrench === null)).toBe(true);
});
it('freezes the same contacts and signed wrenches in report/drawing and rejects tampered calculation output despite a recomputed hash', async () => {
  const m = supportApplied(true), frozen = await freezeDesign(m), view = await documentView(frozen, m);
  expect(view.drawing.supports).toEqual(view.report.preview.supports); expect(view.drawing.supports!.rows[0].contacts).toHaveLength(2); expect(view.approval).toBeNull(); expect(view.constructionEligible).toBe(false);
  const fake = structuredClone(frozen); fake.content.preview.supports!.rows[0].contacts[0].contact!.result!.pressureMaxMPa = 0; fake.snapshotHash = await contentHash(fake.content);
  await expect(documentView(fake, m)).rejects.toThrow(/calculation mismatch/);
});
it('retains support definitions with stale source stamps after an offline coordinate proposal', async () => {
  const m = supportApplied(), request = await createLayoutCandidateRequest(m, 'SOFFIT', m.frameLayout!.stageId, m.frameLayout!.loadCaseId), proposal = structuredClone(request.responseTemplate);
  proposal.sourceRef = 'SYNTHETIC'; proposal.rationale = 'SYNTHETIC coordinate change'; proposal.soffit!.joistXMm = [0, 400, 800, 1200, 1600, 2000, 2400];
  const review = await reviewLayoutCandidate(m, request, proposal), next = await applyLayoutCandidate(m, request, proposal, review.proposalHash, true);
  expect(next.supportLayout).toEqual(m.supportLayout); expect(next.supportLayout!.revisionId).not.toBe(next.revisionId);
  expect(previewWorkflow(next).supports!.completeTerminalWrenchCoverage).toBe(false); expect(previewWorkflow(next).supports!.rows.every(r => r.terminalWrench === null)).toBe(true);
});
it('assigns mandatory checks to each actual path/interface without identity collisions from authored punctuation', () => {
  const {model, definition} = supportFixture(undefined, true); definition.bases[0].id = 'A'; definition.bases[0].interfaces[0].id = 'B:C'; definition.bases[1].id = 'A:B'; definition.bases[1].interfaces[0].id = 'C';
  model.checkCatalogue = {version: 'SYNTHETIC', specifications: ['RINGLOCK-15', 'RINGLOCK-16', 'RINGLOCK-17', 'SIDE-10'].map(id => ({id, group: 'SYNTHETIC', description: 'SYNTHETIC coverage only', appliesTo: 'ALL'}))};
  const m = applySupportFixture(model, definition), rows = previewWorkflow(m).supports!.requiredChecks;
  expect(rows).toHaveLength(6 * 3 * 4); expect(new Set(rows.map(r => canonical([r.memberId, r.checkId, r.loadCaseId, r.revision]))).size).toBe(rows.length);
  expect(rows.every(r => r.revision === m.revisionId && r.loadCaseId === m.supportLayout!.loadCaseId)).toBe(true);
});
it('uses declared local contact axes and rejects nonorthogonal axes instead of assuming global directions', () => {
  const {model, definition} = supportFixture(); const c = definition.bases[0].interfaces[0]; c.centerMm[0]! -= 20;
  c.localX = [0, 1]; c.localY = [-1, 0];
  let r = previewWorkflow(applySupportFixture(model, definition)).supports!.rows[0].contacts[0];
  expect(r.contact!.result!.eccentricityMm!.x).toBeCloseTo(0, 8); expect(r.contact!.result!.eccentricityMm!.y).toBeCloseTo(-20, 8);
  c.localY = [1, 1]; r = previewWorkflow(applySupportFixture(model, definition)).supports!.rows[0].contacts[0]; expect(r.contact).toBeNull(); expect(r.completeWrench).toBe(true);
});
it('reports impossible pressure equilibrium as a relative FAIL without clipping the resultant or inventing anchors', () => {
  const {model, definition} = supportFixture(); definition.bases[0].interfaces[0].centerMm[0]! -= 300;
  const r = previewWorkflow(applySupportFixture(model, definition)).supports!;
  expect(r.rows[0].status).toBe('FAIL'); expect(r.rows[0].contacts[0].contact!.result).toBeNull(); expect(r.rows[0].terminalWrench).not.toBeNull(); expect(r.constructionRelease).toBe('NO_GO');
});
it('does not erase an unknown weight or its unknown CG just because an explicit case coefficient is zero', () => {
  const {model, definition} = supportFixture(); definition.bases[0].interfaces[0].weight.rawForceN = 100;
  const m = applySupportFixture(model, definition); m.designBasisRef = 'SYNTHETIC'; const c = caseDefinition('ZERO', {stageId: m.frameLayout!.stageId}); c.factors.SELF_WEIGHT = 0;
  const child = compileLoadCase(m, c); expect(previewWorkflow(child).supports!.rows[0].terminalWrench).toBeNull();
  definition.bases[0].interfaces[0].weight.rawForceN = null; const unknown = applySupportFixture(model, definition); unknown.designBasisRef = 'SYNTHETIC';
  expect(previewWorkflow(compileLoadCase(unknown, c)).supports!.rows[0].terminalWrench).toBeNull();
});
it('blocks overflowing weight or lever-arm arithmetic without serializing Infinity or a partial downstream wrench', () => {
  const {model, definition} = supportFixture(); definition.bases[0].interfaces[0].weight.rawForceN = 1e308; definition.bases[0].interfaces[0].weight.pointMm = [1e308, 0, 10];
  const r = previewWorkflow(applySupportFixture(model, definition)).supports!; expect(r.rows[0].terminalWrench).toBeNull(); expect(r.rows[0].contacts[0].wrench).toBeNull(); expect(r.rows[0].contacts[0].selfWeightAddedN).toBeNull(); expect(() => canonical(r)).not.toThrow();
});
