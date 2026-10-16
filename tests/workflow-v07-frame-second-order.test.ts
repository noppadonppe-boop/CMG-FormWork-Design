import {expect, it} from 'vitest';
import {analyzeLinearFrame, type LinearFrameInput} from '../src/domain/workflowV07/frameLinear';
import {analyzeSecondOrderFrame, emptySecondOrderDefinition, type SecondOrderDefinition} from '../src/domain/workflowV07/frameSecondOrder';
import {frameFixture} from './fixtures/workflow-v07-frame-workflow';
import {previewWorkflow, regenerateDraftLayouts} from '../src/domain/workflowV07/model';
import {stampFrameLayout} from '../src/domain/workflowV07/frameWorkflow';
import {applyStageStudy, captureStage, copyToDraftStage, emptyStage} from '../src/domain/workflowV07/stageStudy';
import {contentHash, documentView, freezeDesign} from '../src/domain/workflowV07/snapshot';
import {emptySlsLimitEvidence} from '../src/domain/workflowV07/frameSls';

const beamInput = (axialN = -100000, lateralN = 100): LinearFrameInput => ({
  schemaVersion: 'frame-linear-1', units: 'N_MM_MPA_RAD', id: 'SECOND-ORDER-SYNTHETIC', revisionId: 'R1', stageId: 'S1', loadCaseId: 'LC1',
  assumptionEvidenceRef: 'SYNTHETIC elastic beam; no product or construction claim',
  nodes: [
    {id: 'A', pointMm: [0, 0, 0], boundary: [0, 0, 0, 0, 0, 0]},
    {id: 'B', pointMm: [0, 0, 1000], boundary: ['FREE', 'FREE', 'FREE', 'FREE', 'FREE', 'FREE']},
  ],
  elements: [{id: 'AB', nodeI: 'A', nodeJ: 'B', kind: 'BEAM_COLUMN', E_MPa: 200000, G_MPa: 80000, A_mm2: 1000,
    Iy_mm4: 2e6, Iz_mm4: 1e6, J_mm4: 3e6, localY: [1, 0, 0], evidenceRef: 'SYNTHETIC elastic section'}],
  actions: [{id: 'P', nodeId: 'B', revisionId: 'R1', stageId: 'S1', loadCaseId: 'LC1', evidenceRef: 'SYNTHETIC nodal load',
    forceN: [lateralN, 0, axialN], momentNmm: [0, 0, 0], application: 'AT_NODE'}],
});
const definition = (input: LinearFrameInput, offsetB: [number, number, number] = [0, 0, 0]): SecondOrderDefinition => ({
  ...emptySecondOrderDefinition(), evidenceRef: 'SYNTHETIC explicit nodal imperfection; screening only', maxIterations: 30,
  displacementToleranceMm: 1e-8, axialForceToleranceN: 1e-4,
  imperfections: input.nodes.map(n => ({nodeId: n.id, offsetMm: n.id === 'B' ? offsetB : [0, 0, 0], evidenceRef: 'SYNTHETIC measured imperfection record'})),
});

it('requires one explicit imperfection record per actual frame node', () => {
  const input = beamInput(), d = definition(input).imperfections.slice(1);
  const result = analyzeSecondOrderFrame(input, {...definition(input), imperfections: d});
  expect(result.stability).toBe('UNAVAILABLE'); expect(result.converged).toBe(false);
  expect(result.blockers).toContain('EVERY_ACTUAL_FRAME_NODE_REQUIRES_EXPLICIT_IMPERFECTION_RECORD');
});

it('iterates signed compression geometric stiffness and retains the first-order comparison', () => {
  const input = beamInput(), first = analyzeLinearFrame(input), result = analyzeSecondOrderFrame(input, definition(input, [0.5, 0, 0]));
  expect(result.stability).toBe('CONVERGED_SCREEN'); expect(result.converged).toBe(true); expect(result.iterations).toBeGreaterThan(0);
  expect(result.nodes).toHaveLength(2); expect(result.elements[0].firstOrderAxialForceN).toBeCloseTo(first.elements[0].axialForceN!, 5);
  expect(result.elements[0].secondOrderAxialForceN).toBeLessThan(0); expect(result.diagnostics.secondOrderMaxCompressionN).toBeGreaterThan(0);
  expect(Math.abs(result.nodes[1].totalDisplacementMm[0])).toBeGreaterThan(Math.abs(first.nodes[1].displacementMm[0]));
  expect(result.diagnostics.elasticTangentMultiplier).toBeGreaterThan(1); expect(result.blockers).toContain('ELASTIC_TANGENT_MULTIPLIER_IS_NOT_RINGLOCK_SWL_OR_MEMBER_RESISTANCE');
  expect(result.blockers).toContain('SECOND_ORDER_DEMANDS_REQUIRE_MEMBER_CONNECTION_AND_SYSTEM_RESISTANCE_REVIEW');
  expect(result.confirmed).toBe(false); expect(result.constructionEligible).toBe(false); expect(result.constructionRelease).toBe('NO_GO');
  expect(result.equilibrium.maxFreeResidualN).toBeLessThan(1e-5); expect(result.nodes.flatMap(n => n.totalDisplacementMm).every(Number.isFinite)).toBe(true);
});

it('does not add tension stiffness unless the author explicitly enables it', () => {
  const input = beamInput(100000, 0), first = analyzeLinearFrame(input);
  const noTension = analyzeSecondOrderFrame(input, definition(input));
  const withTension = analyzeSecondOrderFrame(input, {...definition(input), includeTensionStiffening: true});
  expect(noTension.stability).toBe('CONVERGED_SCREEN'); expect(withTension.stability).toBe('CONVERGED_SCREEN');
  expect(noTension.elements[0].secondOrderAxialForceN).toBeCloseTo(first.elements[0].axialForceN!, 5);
  expect(withTension.elements[0].secondOrderAxialForceN).toBeCloseTo(first.elements[0].axialForceN!, 5);
});

it('keeps an explicit iteration limit as BLOCKED when convergence is not demonstrated', () => {
  const input = beamInput(), result = analyzeSecondOrderFrame(input, {...definition(input, [0.5, 0, 0]), maxIterations: 1, displacementToleranceMm: 1e-30, axialForceToleranceN: 1e-30});
  expect(result.converged).toBe(false); expect(result.stability).toBe('NOT_CONVERGED'); expect(result.status).toBe('BLOCKED');
  expect(result.blockers).toContain('SECOND_ORDER_ITERATION_NOT_CONVERGED_WITHIN_EXPLICIT_LIMIT');
});

it('rejects imported authority fields and non-finite imperfection geometry', () => {
  const input = beamInput();
  expect(() => analyzeSecondOrderFrame(input, {...definition(input), confirmed: true} as SecondOrderDefinition & {confirmed: boolean})).toThrow(/unsupported or missing fields/);
  const bad = definition(input); bad.imperfections[1].offsetMm[0] = Infinity;
  expect(() => analyzeSecondOrderFrame(input, bad)).toThrow(/finite|Invalid imperfection/);
});

it('stays on the same authored frame revision when the second-order screen is enabled', () => {
  const {model, definition: frame} = frameFixture();
  const d = emptySecondOrderDefinition(frame.nodes.map(n => n.id));
  d.evidenceRef = 'SYNTHETIC explicit zero imperfection record for workflow integration';
  d.imperfections = frame.nodes.map(n => ({nodeId: n.id, offsetMm: [0, 0, 0], evidenceRef: 'SYNTHETIC measured datum'}));
  frame.secondOrder = d;
  const ready = regenerateDraftLayouts(model, {frameLayout: stampFrameLayout(model, frame)}), p = previewWorkflow(ready);
  expect(p.frame?.secondOrder).not.toBeNull(); expect(p.frame?.secondOrder?.input.revisionId).toBe(ready.revisionId);
  expect(p.frame?.secondOrder?.definition.imperfections).toHaveLength(frame.nodes.length);
  expect(p.frame?.blockers).toContain('FRAME_SECOND_ORDER_SCREENING_STILL_REQUIRES_GLOBAL_STABILITY_AND_RESISTANCE_REVIEW');
  expect(p.constructionEligible).toBe(false);
});

it('clears second-order method evidence and imperfection records when copying a new physical Stage', () => {
  const {model, definition: frame} = frameFixture();
  const d = emptySecondOrderDefinition(frame.nodes.map(n => n.id)); d.evidenceRef = 'SYNTHETIC stage method';
  d.imperfections = frame.nodes.map(n => ({nodeId: n.id, offsetMm: [0, 0, 0], evidenceRef: 'SYNTHETIC stage datum'}));
  frame.secondOrder = d;
  frame.sls = [{...emptySlsLimitEvidence(frame.nodes[0].id, 'TRANSLATION_X'), limit: 2, actionBasis: 'SERVICE', methodId: 'SYNTHETIC SLS', sourceRef: 'SYNTHETIC source', sourceRevision: 'OLD', evidenceRef: 'SYNTHETIC evidence', reviewRef: 'SYNTHETIC review', status: 'ENGINEER_REVIEWED'}];
  const source = regenerateDraftLayouts(model, {frameLayout: stampFrameLayout(model, frame)}), captured = captureStage(source, {...emptyStage('POUR'), stageId: source.frameLayout!.stageId, label: 'SYNTHETIC frame stage', evidenceRef: 'SYNTHETIC stage capture'});
  const saved = applyStageStudy(source, {schemaVersion: '1', stages: [captured]}), copied = copyToDraftStage(saved, 'NEXT-STAGE');
  expect(copied.frameLayout?.secondOrder?.evidenceRef).toBe(''); expect(copied.frameLayout?.secondOrder?.imperfections).toEqual([]);
  expect(copied.frameLayout?.sls?.[0].sourceRevision).toBe(''); expect(copied.frameLayout?.sls?.[0].reviewRef).toBe(''); expect(copied.frameLayout?.sls?.[0].status).toBe('REFERENCE_ONLY');
});

it('freezes second-order report and drawing together and rejects a rehashed tangent edit', async () => {
  const {model, definition: frame} = frameFixture(); const d = emptySecondOrderDefinition(frame.nodes.map(n => n.id));
  d.evidenceRef = 'SYNTHETIC frozen P Delta method'; d.imperfections = frame.nodes.map(n => ({nodeId: n.id, offsetMm: [0, 0, 0], evidenceRef: 'SYNTHETIC frozen datum'})); frame.secondOrder = d;
  const ready = regenerateDraftLayouts(model, {frameLayout: stampFrameLayout(model, frame)}), frozen = await freezeDesign(ready), view = await documentView(frozen, ready);
  expect(view.drawing.frame?.secondOrder).toEqual(view.report.preview.frame?.secondOrder);
  const tampered = structuredClone(frozen); tampered.content.preview.frame!.secondOrder!.diagnostics.elasticTangentMultiplier = 0; tampered.snapshotHash = await contentHash(tampered.content);
  await expect(documentView(tampered, ready)).rejects.toThrow(/calculation mismatch/);
});

