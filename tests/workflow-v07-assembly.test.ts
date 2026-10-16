import {expect, it} from 'vitest';
import {captureRinglockAssembly, evaluateRinglockAssembly, stampRinglockAssembly, validateRinglockAssembly} from '../src/domain/workflowV07/ringlockAssembly';
import {assemblyFrameIssues} from '../src/domain/workflowV07/ringlockAssembly';
import {frameGeometryFromAssembly, stampFrameLayout} from '../src/domain/workflowV07/frameWorkflow';
import {parseWorkflowModel, previewWorkflow, regenerateDraftLayouts, reviseDraft} from '../src/domain/workflowV07/model';
import {buildSoffitCandidate} from '../src/domain/workflowV07/soffit';
import {contentHash, documentView, freezeDesign, importDraft} from '../src/domain/workflowV07/snapshot';
import {assemblyApplied, assemblyFixture, assemblyFrameApplied, unevenBaseModel} from './fixtures/workflow-v07-assembly';
import {coverageModel} from './fixtures/workflow-v07-coverage';

it('uses every authored per-head ground elevation and preserves unequal loads without shifting the common head analysis plane', () => {
  const model = unevenBaseModel(), p = previewWorkflow(model);
  expect(model.ringlock!.legs.map(l => l.baseElevationMm)).toEqual([0, 20, 40, 60, 80, 100]); expect(model.ringlock!.legs.every(l => l.headElevationMm === 3000)).toBe(true);
  expect(p.loadPath!.reactions.reduce((s, r) => s + r.forceN, 0)).toBeCloseTo(23760, 6); expect(p.ringlock!.legDemands[1].forceKN).toBeCloseTo(7.05375, 6);
});
it('blocks missing/stale/competing base datums instead of using a shared base or zero, and preserves partial unknowns as a blocked draft', () => {
  const model = unevenBaseModel(), layout = structuredClone(model.soffitLayout!); layout.baseDatumsByHead![0].elevationMm = null;
  expect(() => buildSoffitCandidate(model, layout)).toThrow(/base elevation/);
  const partial = regenerateDraftLayouts(model, {soffitLayout: layout}, {allowIncomplete: true}); expect(previewWorkflow(partial).loadPath).toBeNull(); expect(() => captureRinglockAssembly(partial)).toThrow(/Current authored/);
  layout.baseDatumsByHead![0].elevationMm = 0; layout.baseDatumsByHead![0].localXMm++;
  expect(() => buildSoffitCandidate(model, layout)).toThrow(/coordinates/);
  layout.baseDatumsByHead![0].localXMm--; layout.baseElevationMm = 0; expect(() => buildSoffitCandidate(model, layout)).toThrow(/conflict/);
  layout.baseElevationMm = null; layout.baseDatumsByHead!.pop(); expect(() => buildSoffitCandidate(model, layout)).toThrow(/required/);
});
it('captures known head/ground coordinates without inserting stack, jack extension, engagement, depth or tolerance defaults', () => {
  const d = captureRinglockAssembly(unevenBaseModel()); expect(d.legs).toHaveLength(6); expect(d.headDatum).toBeNull();
  expect(d.legs[1].groundElevationMm).toBe(20); expect(d.legs[1].standards).toEqual([]); expect(d.legs[1].baseJack.extensionMm).toBeNull(); expect(d.legs[1].baseJack.installedHeightMm).toBeNull(); expect(d.legs[1].toleranceMm).toBeNull();
});
it('closes seven nonoverlapping height terms independently per leg without adding inserted spigot lengths to the stack', () => {
  const model = assemblyApplied(), a = previewWorkflow(model).assembly!; expect(a.frameGeometryReady).toBe(true); expect(a.rows).toHaveLength(6);
  for (let i = 0; i < a.rows.length; i++) {expect(a.rows[i].height!.sumMm).toBe(3187 - i * 20); expect(a.rows[i].headResidualMm).toBe(0); expect(a.rows[i].height!.residualMm).toBe(0); expect(a.rows[i].spigotChecks[0].residualMm).toBe(0);}
  expect(a.status).toBe('BLOCKED'); expect(a.constructionRelease).toBe('NO_GO');
});
it('creates separate jack/standard/splice geometry with unknown properties, explicit coincident splice nodes, and no default restraints or rigid connection', () => {
  const model = assemblyApplied(), graph = frameGeometryFromAssembly(model);
  expect(graph.nodes).toHaveLength(36); expect(graph.elements).toHaveLength(30); expect(graph.nodes.every(n => n.boundary.every(b => b.kind === 'UNKNOWN'))).toBe(true);
  expect(graph.elements.every(e => e.E_MPa === null && e.A_mm2 === null)).toBe(true); expect(graph.elements.filter(e => e.role === 'SPIGOT').every(e => e.kind === 'JOINT_SPRING' && e.stiffness.every(k => k === null))).toBe(true);
  const splice = graph.elements.find(e => e.role === 'SPIGOT')!; expect(splice.nodeI).not.toBe(splice.nodeJ); expect(graph.nodes.find(n => n.id === splice.nodeI)!.pointMm).toEqual(graph.nodes.find(n => n.id === splice.nodeJ)!.pointMm);
  expect(graph.nodes.find(n => n.role === 'BASE')!.pointMm[2]).toBe(50); expect(graph.actionBasis).toBeNull(); expect(graph.acknowledgeLinearScope).toBe(false);
  const partial = regenerateDraftLayouts(model, {frameLayout: stampFrameLayout(model, graph)}, {allowIncomplete: true}); expect(previewWorkflow(partial).frame!.analysis).toBeNull();
});
it('carries the full individual head force through each serial component and spring with independent EA/L plus spring-displacement agreement', () => {
  const model = assemblyFrameApplied(), p = previewWorkflow(model), f = p.frame!.analysis!; expect(f).not.toBeNull();
  const base = f.nodes.filter(n => n.id.endsWith(':BASE')); expect(base.reduce((n, b) => n + b.reactionForceN[2], 0)).toBeCloseTo(23760, 5);
  const leg = model.ringlock!.legs[1], head = f.nodes.find(n => n.id === `RL:${leg.id}:HEAD`)!;
  expect(f.nodes.find(n => n.id === `RL:${leg.id}:BASE`)!.reactionForceN[2]).toBeCloseTo(7053.75, 5);
  const force = 7053.75, physicalLength = 3000 - (20 + 50), expected = -force * physicalLength / (200000 * 2000) - force / 1e6;
  expect(head.displacementMm[2]).toBeCloseTo(expected, 8);
  for (const e of f.elements.filter(e => e.id.startsWith(`RL:${leg.id}:`) && e.kind !== 'JOINT_SPRING')) expect(e.axialForceN).toBeCloseTo(-force, 4);
  expect(p.status).toBe('BLOCKED'); expect(p.constructionEligible).toBe(false); expect(f.input.revisionId).toBe(model.revisionId);
});
it('retains label lengths separately from installed rise and never converts a 600mm catalogue jack into a maximum extension', () => {
  const {model, definition} = assemblyFixture(); const l = definition.legs[0]; l.standards[0].nominalLengthMm = 3000; l.baseJack.nominalLengthMm = 600; l.baseJack.extensionMm = 700; l.baseJack.maxExtensionMm = null;
  const a = evaluateRinglockAssembly(model, stampRinglockAssembly(model, definition)); expect(a.frameGeometryReady).toBe(true); expect(a.status).toBe('BLOCKED'); expect(a.rows[0].height!.residualMm).toBe(0);
  expect(a.rows[0].issues).toContain('BASE_PRODUCT_EXTENSION_ENGAGEMENT_AND_LIMIT_EVIDENCE_REQUIRED');
});
it('reports known jack-limit violations independently of unrelated unknown engagement data, while favorable recorded limits never approve the system', () => {
  const {model, definition} = assemblyFixture(); definition.legs[0].baseJack.extensionMm = 300; definition.legs[0].baseJack.engagementMm = null;
  const a = evaluateRinglockAssembly(model, stampRinglockAssembly(model, definition)); expect(a.status).toBe('FAIL'); expect(a.rows[0].issues).toContain('BASE_RECORDED_EXTENSION_OR_ENGAGEMENT_LIMIT_EXCEEDED');
  const favorable = assemblyApplied(); expect(evaluateRinglockAssembly(favorable, favorable.ringlockAssembly!).status).toBe('BLOCKED');
});
it('separates measurement tolerance screening from exact frame closure and refuses silently moving a head or changing a jack height', () => {
  const {model, definition} = assemblyFixture(); definition.legs[0].headJack.installedHeightMm = 301;
  let a = evaluateRinglockAssembly(model, stampRinglockAssembly(model, definition)); expect(a.status).toBe('FAIL'); expect(a.frameGeometryReady).toBe(false);
  definition.legs[0].toleranceMm = 2; const changed = regenerateDraftLayouts(model, {ringlockAssembly: stampRinglockAssembly(model, definition)}); a = previewWorkflow(changed).assembly!;
  expect(a.rows[0].geometryReady).toBe(true); expect(a.rows[0].frameGeometryReady).toBe(false); expect(a.rows[0].headResidualMm).toBe(-1); expect(() => frameGeometryFromAssembly(changed)).toThrow(/CLOSED/);
  expect(changed.ringlockAssembly!.legs[0].headJack.installedHeightMm).toBe(301);
  definition.legs[0].toleranceMm = null; a = evaluateRinglockAssembly(model, stampRinglockAssembly(model, definition)); expect(a.rows[0].spigotChecks[0].status).toBe('BLOCKED');
});
it('adds only a measured exposed splice gap, checks insertion-length closure and models a nonzero gap with unknown beam properties', () => {
  const {model, definition} = assemblyFixture(), l = definition.legs[0]; l.spigots[0].gapMm = 10; l.spigots[0].overallLengthMm = 210; l.headJack.installedHeightMm = 290;
  let a = evaluateRinglockAssembly(model, stampRinglockAssembly(model, definition)); expect(a.rows[0].frameGeometryReady).toBe(true); expect(a.rows[0].segments.find(s => s.role === 'SPIGOT')!.kind).toBe('BEAM_COLUMN');
  expect(a.rows[0].height!.residualMm).toBe(0); l.spigots[0].overallLengthMm = 200;
  a = evaluateRinglockAssembly(model, stampRinglockAssembly(model, definition)); expect(a.status).toBe('FAIL'); expect(a.rows[0].spigotChecks[0].residualMm).toBe(-10); expect(a.rows[0].frameGeometryReady).toBe(false);
});
it('blocks incomplete sequence, missing gaps/evidence, stale product-stage geometry and unknown actual legs without dropping records', () => {
  const {model, definition} = assemblyFixture(); definition.legs[0].spigots = [];
  expect(evaluateRinglockAssembly(model, stampRinglockAssembly(model, definition)).frameGeometryReady).toBe(false);
  const fresh = assemblyFixture(); fresh.definition.legs[0].xMm++; fresh.definition.loadCaseId = 'OTHER';
  const a = evaluateRinglockAssembly(fresh.model, stampRinglockAssembly(fresh.model, fresh.definition)); expect(a.frameGeometryReady).toBe(false); expect(a.rows[0].issues).toContain('ASSEMBLY_COORDINATES_DIFFER_FROM_CURRENT_SOFFIT_HEAD_OR_GROUND');
  const extra = assemblyFixture(); extra.definition.legs.push({...structuredClone(extra.definition.legs[0]), legId: 'UNKNOWN', headNodeId: 'UNKNOWN'});
  const r = evaluateRinglockAssembly(extra.model, stampRinglockAssembly(extra.model, extra.definition)); expect(r.unknownLegIds).toEqual(['UNKNOWN']); expect(r.rows).toHaveLength(6); expect(r.frameGeometryReady).toBe(false);
});
it('rejects fake current source geometry even if the same revision is restamped over an invalid per-head base record', () => {
  const model = assemblyApplied(), corrupted = structuredClone(model); corrupted.soffitLayout!.baseDatumsByHead![0].elevationMm = null;
  corrupted.ringlockAssembly = stampRinglockAssembly(corrupted, corrupted.ringlockAssembly!);
  expect(evaluateRinglockAssembly(corrupted, corrupted.ringlockAssembly).frameGeometryReady).toBe(false); expect(() => captureRinglockAssembly(corrupted)).toThrow(/Current authored/);
});
it('checks actual frame member/node/head mappings and refuses a whole-leg or changed-role substitute for the authored component chain', () => {
  const model = assemblyFrameApplied(), frame = structuredClone(model.frameLayout!); expect(assemblyFrameIssues(model, frame)).toEqual([]);
  const changed = frame.elements.find(e => e.role === 'SPIGOT')!; changed.role = 'STANDARD'; changed.kind = 'BEAM_COLUMN';
  expect(assemblyFrameIssues(model, frame).join()).toContain('MAPPING_MISMATCH');
  const ready = regenerateDraftLayouts(model, {frameLayout: frame}, {allowIncomplete: true}); expect(previewWorkflow(ready).frame!.analysis).toBeNull();
  frame.nodes[0].pointMm[2]!++; expect(assemblyFrameIssues(model, frame).join()).toContain('NODE_GEOMETRY_MISMATCH');
});
it('assigns actual component/check/case/revision requirements including every standard, spigot, jack and supporting surface', () => {
  const model = assemblyApplied(), p = previewWorkflow(model), required = p.assembly!.requiredChecks;
  expect(required.filter(r => r.checkId === 'RINGLOCK-08')).toHaveLength(12); expect(required.filter(r => r.checkId === 'RINGLOCK-09')).toHaveLength(6);
  expect(required.filter(r => r.checkId === 'RINGLOCK-05')).toHaveLength(6); expect(required.filter(r => r.checkId === 'RINGLOCK-17')).toHaveLength(6);
  expect(required.every(r => r.revision === model.revisionId && r.loadCaseId === model.soffitLayout!.loadCaseId)).toBe(true); expect(p.coverageReview.checkedCount).toBe(0);
});
it('rejects imported authority, unknown fields and frame size overflow without omitting authored physical pieces or heads', () => {
  const {model, definition} = assemblyFixture(), a = stampRinglockAssembly(model, definition);
  expect(() => validateRinglockAssembly({...a, confirmed: true})).toThrow(/authority/); expect(() => validateRinglockAssembly({...a, legs: [{...a.legs[0], capacity: 60}]})).toThrow(/authority/);
  for (const l of definition.legs) {
    l.standards = Array.from({length: 6}, (_, i) => ({id: `S${i}`, productRef: 'SYNTHETIC', nominalLengthMm: null, installedRiseMm: i === 5 ? 500 : 400, datumEvidenceRef: 'SYNTHETIC'}));
    l.spigots = Array.from({length: 5}, (_, i) => ({id: `P${i}`, lowerStandardId: `S${i}`, upperStandardId: `S${i + 1}`, productRef: 'SYNTHETIC', gapMm: 0, overallLengthMm: 200, lowerInsertionMm: 100, upperInsertionMm: 100, evidenceRef: 'SYNTHETIC'}));
  }
  const ready = regenerateDraftLayouts(model, {ringlockAssembly: stampRinglockAssembly(model, definition)}); expect(previewWorkflow(ready).assembly!.frameGeometryReady).toBe(true);
  expect(() => frameGeometryFromAssembly(ready)).toThrow(/80_NODE/); expect(ready.ringlockAssembly!.legs).toHaveLength(6); expect(ready.ringlockAssembly!.legs[0].standards).toHaveLength(6);
});
it('freezes partial unknowns and complete assembly data with report/drawing, rejects rehashed geometry/results and invalidates old input revisions', async () => {
  const source = unevenBaseModel(), partial = regenerateDraftLayouts(source, {ringlockAssembly: stampRinglockAssembly(source, captureRinglockAssembly(source))}, {allowIncomplete: true});
  const unknown = await documentView(await freezeDesign(partial), partial); expect(unknown.report.model.ringlockAssembly!.legs[0].baseJack.extensionMm).toBeNull(); expect(unknown.drawing.assembly!.frameGeometryReady).toBe(false);
  const model = assemblyFrameApplied(), f = await freezeDesign(model), v = await documentView(f, model); expect(v.drawing.assembly).toEqual(v.report.preview.assembly);
  const bad = structuredClone(f); bad.content.preview.assembly!.rows[0].nodes[0].pointMm[2]++; bad.snapshotHash = await contentHash(bad.content); await expect(documentView(bad, model)).rejects.toThrow(/calculation mismatch/);
  const edited = reviseDraft(model, {designBasisRef: 'new basis'}); expect(previewWorkflow(edited).assembly!.current).toBe(false); expect(previewWorkflow(importDraft(model)).frame!.analysis).toBeNull();
  expect(parseWorkflowModel(coverageModel()).ringlockAssembly).toBeUndefined();
});
