import {expect, it} from 'vitest';
import {actionFactor, emptyAnalysisCase} from '../src/domain/workflowV07/caseFactors';
import {applyLoadCases, compileLoadCase, stampLoadCases, validateLoadCases} from '../src/domain/workflowV07/loadCases';
import {parseWorkflowModel, previewWorkflow, regenerateDraftLayouts, reviseDraft, applyCoverageReview} from '../src/domain/workflowV07/model';
import {contentHash, documentView, freezeDesign, importDraft} from '../src/domain/workflowV07/snapshot';
import {requirementRef} from '../src/domain/workflowV07/coverageReview';
import {screenRinglock} from '../src/domain/workflowV07/ringlock';
import {sideApplied} from './fixtures/workflow-v07-side';
import {plywoodFixture} from './fixtures/workflow-v07-plywood';
import {caseDefinition, casesApplied, loadCaseSource} from './fixtures/workflow-v07-loadcases';

it('has no factor defaults in a case, rejects unknown/negative gravity coefficients, and permits explicitly signed vector reversals', () => {
  const d = emptyAnalysisCase('X'); expect(Object.values(d.factors).every(v => v === null)).toBe(true); expect(d.basis).toBeNull();
  expect(() => actionFactor({analysisCase: d}, 'CONCRETE')).toThrow(/basis/);
  const c = caseDefinition(); c.factors.CONCRETE = null; expect(() => compileLoadCase(loadCaseSource(), c)).toThrow(/explicit factor/);
  c.factors.CONCRETE = -1; expect(() => compileLoadCase(loadCaseSource(), c)).toThrow(/factor/);
  c.factors.CONCRETE = 1; c.factors.WIND = -1; expect(actionFactor({analysisCase: c}, 'WIND')).toBe(-1);
});
it('recomputes separate concrete/DL/LL through every member and preserves gamma, stiffness, geometry and one design revision', () => {
  const source = loadCaseSource(), c = caseDefinition(); c.factors = {...c.factors, CONCRETE: 1.2, ADDITIONAL_DL: 1.1, CONSTRUCTION_LL: 1.5};
  const child = compileLoadCase(source, c), p = previewWorkflow(child), expected = 12960 * 1.2 + 1800 * 1.1 + 9000 * 1.5;
  expect(p.soffit!.ownedForceN).toMatchObject({concrete: 15552, additionalDead: 1980, constructionLive: 13500}); expect(p.soffit!.terminalForceN).toBeCloseTo(expected, 6);
  expect(child.gammaKNm3).toBe(24); expect(child.additionalDeadKPa).toBe(.5); expect(child.revisionId).toBe(source.revisionId); expect(child.humanInputReviewed).toBe(false);
  const bases = p.frame!.analysis!.nodes.filter(n => n.id.endsWith(':BASE')); expect(bases.reduce((s, n) => s + n.reactionForceN[2], 0)).toBeCloseTo(expected, 4);
  expect(bases[1].reactionForceN[2]).toBeCloseTo(expected * 19 / 64, 4); expect(p.frame!.actionBasis).toBe('FACTORED');
  expect(child.frameLayout!.elements[0].E_MPa).toBe(source.frameLayout!.elements[0].E_MPa); expect(p.assembly!.frameGeometryReady).toBe(true); expect(p.status).toBe('BLOCKED');
});
it('scales separated plywood and member weights once while included plywood uses the owning DL factor rather than self-weight factor', () => {
  let source = loadCaseSource(), layout = structuredClone(source.soffitLayout!); layout.plywood = {...plywoodFixture(), selfWeightKPa: .1}; layout.joist.selfWeightKNPerM = .01; layout.bearer.selfWeightKNPerM = .02;
  source = regenerateDraftLayouts(source, {soffitLayout: layout}); const c = caseDefinition(); c.factors.SELF_WEIGHT = 2; c.factors.ADDITIONAL_DL = 1.5;
  let p = previewWorkflow(compileLoadCase(source, c)); expect(p.soffit!.ownedForceN.componentSelfWeight).toBeCloseTo(2 * (360 + 75 + 96), 6);
  expect(p.soffit!.terminalForceN).toBeCloseTo(12960 + 1800 * 1.5 + 9000 + 2 * 531, 5);
  layout.plywood!.selfWeightOwnership = 'IN_ADDITIONAL_DL'; source = regenerateDraftLayouts(source, {soffitLayout: layout}); p = previewWorkflow(compileLoadCase(source, c));
  expect(p.soffit!.plywood!.selfWeight.declaredForceN).toBeCloseTo(540, 6); expect(p.soffit!.plywood!.selfWeight.additionalForceN).toBe(0);
  expect(p.soffit!.ownedForceN.componentSelfWeight).toBeCloseTo(2 * (75 + 96), 6); expect(p.soffit!.terminalForceN).toBeCloseTo(12960 + 2700 + 9000 + 342, 5);
});
it('keeps all-zero known combinations explicit and computes unloaded plywood/head/frame results without turning an unknown into zero', () => {
  const source = loadCaseSource(), layout = {...source.soffitLayout!, plywood: {...plywoodFixture(), selfWeightKPa: .1, selfWeightOwnership: 'IN_ADDITIONAL_DL' as const}}, ready = regenerateDraftLayouts(source, {soffitLayout: layout});
  const c = caseDefinition(); for (const k of Object.keys(c.factors)) c.factors[k as keyof typeof c.factors] = 0;
  const p = previewWorkflow(compileLoadCase(ready, c)); expect(p.soffit!.terminalForceN).toBe(0); expect(p.soffit!.plywood!.strips.every(s => s.qKPa === 0)).toBe(true); expect(p.frame!.analysis).not.toBeNull(); expect(p.constructionEligible).toBe(false);
  c.factors.SELF_WEIGHT = null; expect(() => compileLoadCase(ready, c)).toThrow(/explicit factor/);
});
it('factors side hydrostatic pressure independently of vertical concrete/DL/LL, including explicitly zero lateral action', () => {
  const source = regenerateDraftLayouts(sideApplied(), {designBasisRef: 'SYNTHETIC'}), c = caseDefinition('SIDE', {stageId: 'TEST-POUR'});
  c.factors.CONCRETE = 10; c.factors.ADDITIONAL_DL = 5; c.factors.HYDROSTATIC_SIDE = .5;
  let p = previewWorkflow(compileLoadCase(source, c)); expect(p.side!.faces[0].result.pressureBaseKPa).toBe(10); expect(p.side!.faces[0].result.expectedForceN).toBe(5000);
  expect(p.side!.ties[0].demandKN).toBeGreaterThan(0); c.factors.HYDROSTATIC_SIDE = 0;
  p = previewWorkflow(compileLoadCase(source, c)); expect(p.side!.faces[0].result.expectedForceN).toBe(0); expect(p.side!.ties.every(t => t.demandKN === 0)).toBe(true);
});
it('factors additional frame force and couple vectors once, preserves offsets and supports signed wind reversal without refactoring transferred heads', () => {
  let source = loadCaseSource(), frame = structuredClone(source.frameLayout!), head = frame.headMappings[0].frameNodeId;
  frame.additionalActions.push({id: 'WIND', nodeId: head, kind: 'WIND', ownershipId: 'SYN-WIND', evidenceRef: 'SYNTHETIC wind vector', forceN: [100, 0, 0], momentNmm: [0, 0, 50], atNode: false, offsetMm: [0, 0, 100], offsetEvidenceRef: 'SYNTHETIC eccentricity'});
  source = regenerateDraftLayouts(source, {frameLayout: frame}); const c = caseDefinition(); c.factors.WIND = -2;
  const p = previewWorkflow(compileLoadCase(source, c)), a = p.frame!.input!.actions.find(a => a.id === 'EXTRA:WIND')!;
  expect(a.forceN).toEqual([-200, 0, 0]); expect(a.momentNmm).toEqual([0, 0, -100]); expect(a.application).toMatchObject({offsetMm: [0, 0, 100]});
  expect(p.frame!.input!.actions.filter(a => a.id.startsWith('HEAD:')).reduce((n, a) => n - a.forceN[2], 0)).toBeCloseTo(23760, 5);
  expect(p.frame!.analysis!.nodes.filter(n => n.id.endsWith(':BASE')).reduce((n, a) => n + a.reactionForceN[0], 0)).toBeCloseTo(200, 5);
  c.factors.WIND = 1e308; const overflow = previewWorkflow(compileLoadCase(source, c)); expect(overflow.frame!.input).toBeNull(); expect(overflow.frame!.analysis).toBeNull(); expect(overflow.frame!.blockers.some(b => b.includes('canonical number'))).toBe(true);
});
it('requires explicit project basis and same-stage shared-layout evidence instead of assuming erection/support changes from coefficients', () => {
  const source = loadCaseSource(), c = caseDefinition(); c.sharedLayoutEvidenceRef = ''; expect(() => compileLoadCase(source, c)).toThrow(/sharing evidence/);
  c.sharedLayoutEvidenceRef = 'SYNTHETIC'; c.stageId = 'ERECTION'; expect(() => compileLoadCase(source, c)).toThrow(/stage-dependent/);
  c.stageId = 'POUR-TEST'; c.loadCaseId = source.soffitLayout!.loadCaseId; expect(() => compileLoadCase(source, c)).toThrow(/different name/);
  c.loadCaseId = 'NEW'; expect(() => compileLoadCase({...source, designBasisRef: null}, c)).toThrow(/Design Basis/);
});
it('separately factors prescribed translations/rotations, retaining source boundaries and rejecting an unknown movement even with a zero factor', () => {
  let source = loadCaseSource(); const frame = structuredClone(source.frameLayout!), base = frame.nodes.find(n => n.role === 'BASE')!;
  base.boundary[2] = {kind: 'PRESCRIBED', value: 1}; base.boundary[3] = {kind: 'PRESCRIBED', value: 1e-4}; source = regenerateDraftLayouts(source, {frameLayout: frame});
  const c = caseDefinition(); c.factors.IMPOSED_MOVEMENT = -2; const child = compileLoadCase(source, c), p = previewWorkflow(child);
  expect(child.frameLayout!.nodes.find(n => n.id === base.id)!.boundary[2]).toEqual({kind: 'PRESCRIBED', value: 1});
  expect(p.frame!.input!.nodes.find(n => n.id === base.id)!.boundary[2]).toBe(-2); expect(p.frame!.analysis!.nodes.find(n => n.id === base.id)!.displacementMm[2]).toBeCloseTo(-2, 9);
  expect(p.frame!.input!.nodes.find(n => n.id === base.id)!.boundary[3]).toBe(-2e-4); expect(p.frame!.analysis!.nodes.find(n => n.id === base.id)!.rotationRad[0]).toBeCloseTo(-2e-4, 10);
  const sourceHead = previewWorkflow(source).frame!.analysis!.nodes.find(n => n.id === source.frameLayout!.headMappings[0].frameNodeId)!.displacementMm[2]!;
  const caseHead = p.frame!.analysis!.nodes.find(n => n.id === child.frameLayout!.headMappings[0].frameNodeId)!.displacementMm[2]!;
  expect(caseHead - sourceHead).toBeCloseTo(-3, 8);
  const unknown = structuredClone(source); (unknown.frameLayout!.nodes.find(n => n.id === base.id)!.boundary[2] as {value: number | null}).value = null; c.factors.IMPOSED_MOVEMENT = 0;
  expect(previewWorkflow(compileLoadCase(unknown, c)).frame!.analysis).toBeNull();
});
it('keeps case contexts, member reactions, assembly nodes and graph requirements in the shared revision while leaving base input arrays unchanged', () => {
  const source = loadCaseSource(), before = structuredClone(source), child = compileLoadCase(source, caseDefinition());
  expect(source).toEqual(before); expect(child.loadCases).toBeNull(); expect(child.soffitLayout!.loadCaseId).toBe('SYNTHETIC-C1'); expect(child.ringlockAssembly!.loadCaseId).toBe('SYNTHETIC-C1');
  const p = previewWorkflow(child); expect(p.requiredChecks.every(r => r.loadCaseId === 'SYNTHETIC-C1' && r.revision === source.revisionId)).toBe(true);
  expect(child.frameLayout!.nodes).toEqual(source.frameLayout!.nodes); expect(child.coverage).toEqual([]); expect(p.coverageReview.checkedCount).toBe(0);
});
it('retains every named case, physical source, per-case force and required row instead of averaging or selecting only an envelope', () => {
  const model = casesApplied(), p = previewWorkflow(model), cases = p.loadCases!.cases; expect(cases).toHaveLength(2); expect(p.loadCases!.current).toBe(true);
  expect(cases.every(c => c.errors.length === 0)).toBe(true); expect(cases[0].preview!.soffit!.terminalForceN).toBeCloseTo(31032, 6); expect(cases[1].preview!.soffit!.terminalForceN).toBeCloseTo(14760, 6);
  expect(cases.every(c => c.model!.revisionId === model.revisionId)).toBe(true); expect(p.requiredChecks).toHaveLength(model.requiredChecks.length + p.frame!.requiredChecks.length + p.assembly!.requiredChecks.length + p.headBearings!.requiredChecks.length + cases.reduce((n, c) => n + c.requiredChecks.length, 0));
  // Every physical head remains a mandatory fit/retention check in each named case,
  // including missing head geometry; a new subassembly cannot disappear from coverage.
  for (const c of cases) for (const leg of c.model!.ringlock!.legs) {
    expect(c.requiredChecks.filter(r => r.memberId.startsWith('HEAD_BEARING:') && r.checkId === 'SOFFIT-08' && r.applicability.headNodeId === leg.headNodeId && r.loadCaseId === c.definition.loadCaseId && r.revision === model.revisionId)).toHaveLength(1);
  }
  expect(p.coverageReview.rows).toHaveLength(p.requiredChecks.length); expect(p.loadCases!.status).toBe('BLOCKED');
});
it('records unresolved case requirements and explicit errors without borrowing base-case reactions or hiding missing case coverage', () => {
  const source = loadCaseSource(), unknown = caseDefinition(); unknown.factors.CONCRETE = null;
  const model = applyLoadCases(source, {schemaVersion: '1', cases: [unknown]}), p = previewWorkflow(model), c = p.loadCases!.cases[0];
  expect(c.preview).toBeNull(); expect(c.errors[0]).toContain('explicit factor'); expect(c.requiredChecks.length).toBeGreaterThan(0); expect(c.requiredChecks.every(r => r.applicability.unresolvedCase === true)).toBe(true);
  const targets = p.requiredChecks.filter(r => r.loadCaseId === unknown.loadCaseId && r.checkId === 'SOFFIT-05').slice(1, 3).map(requirementRef);
  const reviewed = applyCoverageReview(model, {schemaVersion: '1', groups: [{id: 'X', representative: targets[0], targets, mode: 'LOCAL_1D_SAME', evidenceRef: 'SYNTHETIC', notApplicableReason: ''}]});
  expect(previewWorkflow(reviewed).coverageReview.rows.filter(r => r.groupId === 'X').every(r => r.localDemandEquivalent !== true)).toBe(true);
});
it('scopes representative input comparison to the actual named case, never reuses the unscaled base member with the same ID', () => {
  const model = casesApplied(), p = previewWorkflow(model), targets = p.requiredChecks.filter(r => r.loadCaseId === 'SYNTHETIC-C1' && r.checkId === 'SOFFIT-05' && ['JOIST-2', 'JOIST-3'].includes(r.memberId)).map(requirementRef);
  const reviewed = applyCoverageReview(model, {schemaVersion: '1', groups: [{id: 'C1-TYP', representative: targets[0], targets, mode: 'LOCAL_1D_SAME', evidenceRef: 'SYNTHETIC same local inputs only', notApplicableReason: ''}]});
  const rows = previewWorkflow(reviewed).coverageReview.rows.filter(r => r.groupId === 'C1-TYP'); expect(rows.every(r => r.localDemandEquivalent === true)).toBe(true); expect(rows.every(r => r.status === 'BLOCKED')).toBe(true);
});
it('retains unresolved inventory under the target case when a physical source is unknown, and rejects a forged compiled layout context', () => {
  const source = reviseDraft(loadCaseSource(), {gammaKNm3: null}), d = caseDefinition(), model = applyLoadCases(source, {schemaVersion: '1', cases: [d]}), result = previewWorkflow(model).loadCases!.cases[0];
  expect(result.preview!.loadPath).toBeNull(); expect(result.errors).toContain('CASE_SOFFIT_ANALYSIS_NOT_AVAILABLE');
  expect(result.requiredChecks.every(r => r.loadCaseId === d.loadCaseId && r.revision === model.revisionId)).toBe(true);
  const child = compileLoadCase(loadCaseSource(), d); child.analysisCase!.loadCaseId = 'FORGED-OTHER'; expect(() => parseWorkflowModel(child)).toThrow(/matched authored stage\/case/);
});
it('invalidates case results after source changes and requires explicit reapplication; imported books and downstream review stay stale', () => {
  const model = casesApplied(), edited = reviseDraft(model, {constructionLiveKPa: 3}); let p = previewWorkflow(edited);
  expect(p.loadCases!.current).toBe(false); expect(p.loadCases!.cases.every(c => c.preview === null)).toBe(true);
  const definition = {schemaVersion: '1' as const, cases: edited.loadCases!.cases}; const reviewed = applyLoadCases(edited, definition); p = previewWorkflow(reviewed);
  expect(p.loadCases!.current).toBe(true); expect(p.loadCases!.cases[0].preview!.soffit!.terminalForceN).toBeCloseTo(33732, 5); expect(previewWorkflow(importDraft(model)).loadCases!.current).toBe(false);
});
it('rejects authority metadata, nested books, duplicate case names and exceeding bounds without silently dropping cases', () => {
  const source = loadCaseSource(), a = caseDefinition(), b = caseDefinition('C2', {loadCaseId: a.loadCaseId});
  expect(() => stampLoadCases(source, {schemaVersion: '1', cases: [a, b]})).toThrow(/Duplicate/);
  const book = stampLoadCases(source, {schemaVersion: '1', cases: [a]}); expect(() => validateLoadCases({...book, approved: true})).toThrow(/authority/);
  expect(() => stampLoadCases(source, {schemaVersion: '1', cases: Array.from({length: 9}, (_, i) => caseDefinition(`C${i}`))})).toThrow(/eight-case/);
  const child = compileLoadCase(source, a); expect(() => applyLoadCases(child, {schemaVersion: '1', cases: []})).toThrow(/nest/);
  expect(() => parseWorkflowModel({...child, loadCases: book})).toThrow(/Nested/);
});
it('does not compare factored leg demands to a service/allowable reference rating', () => {
  const source = loadCaseSource(), config = {...source.ringlock!, manufacturer: 'SYN', systemId: 'SYN', configurationId: 'SYN', ratingId: 'SYN'};
  const rating = {manufacturer: 'SYN', system_id: 'SYN', configuration_id: 'SYN', rating_id: 'SYN', demand_basis: 'SERVICE', resistance_basis: 'ALLOWABLE', dimensions: {bay_x_mm: config.bayXMm, bay_y_mm: config.bayYMm, total_height_mm: config.totalHeightMm, head_extension_mm: config.headExtensionMm, base_extension_mm: config.baseExtensionMm, lift_heights_mm: config.liftHeightsMm}, resistance: {leg_kN: .001}};
  const result = screenRinglock(config, previewWorkflow(source).loadPath!.reactions, rating, source.revisionId, 'FACTORED'); expect(result.status).toBe('BLOCKED'); expect(result.blockers).toContain('FACTORED_DEMAND_REQUIRES_MATCHED_DESIGN_RESISTANCE_METHOD');
});
it('freezes definitions, individual case models/forces and the entire coverage matrix with the report/drawing and rejects rehashed forged case outputs', async () => {
  const model = casesApplied(), frozen = await freezeDesign(model), view = await documentView(frozen, model);
  expect(view.drawing.loadCases).toEqual(view.report.preview.loadCases); expect(Object.isFrozen(frozen.content.preview.loadCases!.cases[0].model)).toBe(true);
  const bad = structuredClone(frozen); bad.content.preview.loadCases!.cases[0].preview!.soffit!.terminalForceN = 1; bad.snapshotHash = await contentHash(bad.content);
  await expect(documentView(bad, model)).rejects.toThrow(/calculation mismatch/);
  const changed = {schemaVersion: '1' as const, cases: structuredClone(model.loadCases!.cases)}; changed.cases[0].factors.CONCRETE = 1.3;
  expect((await documentView(frozen, applyLoadCases(model, changed))).freshness).toBe('STALE');
});
