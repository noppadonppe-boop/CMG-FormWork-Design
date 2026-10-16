import {expect, it} from 'vitest';
import {captureFrameElasticReference, captureFrameResearchGeometry, captureFrameSupplierGeometry, emptyFrameTubeBinding, resolveFrameTubeBinding, validateFrameTubeBinding} from '../src/domain/workflowV07/frameBinding';
import {editSupplierRecord, selectSupplierRecord} from '../src/domain/workflowV07/ringlockSuppliers';
import {analyzeLinearFrame, type LinearFrameInput} from '../src/domain/workflowV07/frameLinear';
import {evaluateFrameLayout, stampFrameLayout, validateFrameLayout} from '../src/domain/workflowV07/frameWorkflow';
import {parseWorkflowModel, previewWorkflow, regenerateDraftLayouts, reviseDraft} from '../src/domain/workflowV07/model';
import {contentHash, documentView, freezeDesign, importDraft} from '../src/domain/workflowV07/snapshot';
import {frameFixture} from './fixtures/workflow-v07-frame-workflow';
import {boundFrame, frameReference, nullFrameProperties, supplierSelection, tubeBinding} from './fixtures/workflow-v07-frame-binding';

const resolved = (binding = tubeBinding(), role = 'STANDARD', kind = 'BEAM_COLUMN') => resolveFrameTubeBinding(binding, role, kind, nullFrameProperties());
it('uses the updated gross annulus with independent mean-diameter identities and explicit E/G, without using a strength grade', () => {
  const b = tubeBinding(), p = resolved(b), D = 48.3, t = 3.2, m = D - t;
  expect(p.A_mm2).toBeCloseTo(Math.PI * t * m, 8); expect(p.Iy_mm4).toBeCloseTo(Math.PI * t * m * (m * m + t * t) / 8, 6);
  expect(p.Iz_mm4).toBe(p.Iy_mm4); expect(p.J_mm4).toBeCloseTo(2 * p.Iy_mm4, 8);
  expect(p.E_MPa).toBe(210000); expect(p.G_MPa).toBeCloseTo(210000 / 2.6, 8); expect(b.researchSnapshot?.material).toBeNull();
  expect(b.researchSnapshot?.elastic).toBeNull(); expect(p.status).toBe('REFERENCE_ONLY'); expect(p.constructionRelease).toBe('NO_GO');
});
it('does not insert E/G or a source into an empty draft, infer G from supplier E, or accept conflicting manual values', () => {
  expect(emptyFrameTubeBinding().elasticSnapshot).toBeNull();
  expect(() => captureFrameElasticReference(frameReference('STANDARD', false))).toThrow(/Explicitly select/);
  const b = tubeBinding(true); b.elasticSnapshot = null;
  expect(() => resolved(b)).toThrow(/explicit E\/G/);
  expect(() => resolveFrameTubeBinding(tubeBinding(), 'STANDARD', 'BEAM_COLUMN', {...nullFrameProperties(), E_MPa: 210000})).toThrow(/conflict/);
});
it('requires actual-role and segment evidence and prohibits straight tube substitution for threaded jacks, spigots and springs', () => {
  for (const role of ['HEAD_JACK', 'BASE_JACK', 'SPIGOT', 'LEDGER_JOINT', 'OTHER']) expect(() => resolved(tubeBinding(), role)).toThrow(/Standard\/Ledger\/Brace only/);
  expect(() => resolved(tubeBinding(), 'LEDGER')).toThrow(/does not match/);
  expect(() => resolved(tubeBinding(), 'STANDARD', 'JOINT_SPRING')).toThrow(/only/);
  expect(() => resolved(tubeBinding(), 'STANDARD', 'AXIAL_BAR')).toThrow(/beam-column/);
  for (const key of ['straightSegmentEvidenceRef', 'actualProductMatchEvidenceRef', 'elasticBasisEvidenceRef'] as const) {
    const b = tubeBinding(); b[key] = ''; expect(() => resolved(b)).toThrow(/required/);
  }
});
it('retains independent role sections for ledger and brace rather than copying the standard wall thickness', () => {
  for (const [role, wall] of [['LEDGER', 2.75], ['BRACE', 2.5]] as const) {
    const b = tubeBinding(); b.researchSnapshot = captureFrameResearchGeometry(frameReference(role === 'BRACE' ? 'DIAGONAL_BRACE' : role));
    expect(resolved(b, role, role === 'BRACE' ? 'AXIAL_BAR' : 'BEAM_COLUMN').gross.t_mm).toBe(wall);
  }
});
it('matches independent axial, cantilever bending and torsion equations when bound properties enter the frame solver', () => {
  const p = resolved(), L = 1000, N = 5000, V = 200, T = 3e4;
  const input: LinearFrameInput = {schemaVersion: 'frame-linear-1', units: 'N_MM_MPA_RAD', id: 'SYNTHETIC', revisionId: 'R', stageId: 'S', loadCaseId: 'C', assumptionEvidenceRef: 'SYNTHETIC straight tube, not actual stock',
    nodes: [{id: 'A', pointMm: [0, 0, 0], boundary: [0, 0, 0, 0, 0, 0]}, {id: 'B', pointMm: [L, 0, 0], boundary: ['FREE', 'FREE', 'FREE', 'FREE', 'FREE', 'FREE']}],
    elements: [{id: 'E', nodeI: 'A', nodeJ: 'B', evidenceRef: 'SYNTHETIC', kind: 'BEAM_COLUMN', E_MPa: p.E_MPa, G_MPa: p.G_MPa, A_mm2: p.A_mm2, Iy_mm4: p.Iy_mm4, Iz_mm4: p.Iz_mm4, J_mm4: p.J_mm4, localY: [0, 1, 0]}],
    actions: [{id: 'P', nodeId: 'B', revisionId: 'R', stageId: 'S', loadCaseId: 'C', evidenceRef: 'SYNTHETIC', application: 'AT_NODE', forceN: [N, V, 0], momentNmm: [T, 0, 0]}]};
  const r = analyzeLinearFrame(input), end = r.nodes[1];
  expect(end.displacementMm[0]).toBeCloseTo(N * L / (p.E_MPa * Math.PI * 3.2 * 45.1), 9);
  expect(end.displacementMm[1]).toBeCloseTo(V * L ** 3 / (3 * p.E_MPa * p.Iz_mm4), 9);
  expect(end.rotationRad[0]).toBeCloseTo(T * L / (p.G_MPa * p.J_mm4), 10);
  expect(r.nodes[0].reactionMomentNmm[2]).toBeCloseTo(-V * L, 6);
});
it('captures only the selected supplier originals and relevant edit history, retaining a different actual D/t and no capacity', () => {
  let s = supplierSelection(); s = editSupplierRecord(s, 'components', 'SU48-ST', {t_mm: 3.1, E_MPa: 200000}, 'SYNTHETIC alternate wall', 'SYNTHETIC local evidence');
  s = editSupplierRecord(s, 'components', 'SU48-LE', {t_mm: 2.6}, 'unrelated', 'SYNTHETIC');
  const b = tubeBinding(true); b.supplierSnapshot = captureFrameSupplierGeometry(s);
  const p = resolved(b), c = b.supplierSnapshot;
  expect(c.original.components).toHaveLength(1); expect(c.original.components[0].t_mm).not.toBe(3.1); expect(c.edits).toHaveLength(1);
  expect(c.original.capacity_records).toEqual([]); expect(c.selection.capacityId).toBeNull();
  expect(p.gross.t_mm).toBe(3.1); expect(p.E_MPa).toBe(210000); expect(p.blockers).toContain('FRAME_SUPPLIER_E_DIFFERS_FROM_EXPLICIT_ELASTIC_HYPOTHESIS');
  expect(s.edits).toHaveLength(2); expect(c.confirmed).toBe(false);
});
it('replays captured newly entered supplier/family/component rows with null originals and preserves unverified status', () => {
  let s = supplierSelection();
  s = editSupplierRecord(s, 'suppliers', 'SYN-S', {name: 'SYNTHETIC new supplier'}, 'add', 'SYNTHETIC'); s = selectSupplierRecord(s, 'supplierId', 'SYN-S');
  s = editSupplierRecord(s, 'families', 'SYN-F', {supplier_id: 'SYN-S', label: 'SYNTHETIC family', module_system: 'CUSTOM', published_ledger_labels_mm: [1200], standard_lengths_mm: [2000]}, 'add', 'SYNTHETIC'); s = selectSupplierRecord(s, 'familyId', 'SYN-F');
  s = editSupplierRecord(s, 'components', 'SYN-C', {family_id: 'SYN-F', role: 'STANDARD', D_mm: 50, t_mm: 3}, 'add', 'SYNTHETIC'); s = selectSupplierRecord(s, 'componentId', 'SYN-C');
  const b = tubeBinding(true); b.supplierSnapshot = captureFrameSupplierGeometry(s);
  expect(b.supplierSnapshot.original.components).toEqual([]); expect(b.supplierSnapshot.edits).toHaveLength(3); expect(resolved(b).gross.D_mm).toBe(50);
});
it('blocks missing supplier dimensions, incompatible source roles, altered audit history and imported approval flags', () => {
  const b = tubeBinding(true); b.supplierSnapshot = captureFrameSupplierGeometry(editSupplierRecord(supplierSelection(), 'components', 'SU48-ST', {D_mm: null}, 'unknown', 'SYNTHETIC'));
  expect(() => resolved(b)).toThrow(/OD/);
  b.supplierSnapshot.edits[0].before!.D_mm = 5; expect(() => validateFrameTubeBinding(b)).toThrow(/history/);
  const x = tubeBinding(true); x.supplierSnapshot!.confirmed = true as false; expect(() => validateFrameTubeBinding(x)).toThrow(/state/);
  const y = tubeBinding(); y.elasticSnapshot!.reference.project_design_basis_selected = true; expect(() => validateFrameTubeBinding(y)).toThrow(/cannot approve/);
  const stock = tubeBinding(); stock.researchSnapshot!.group!.project_stock_verified = true; expect(() => validateFrameTubeBinding(stock)).toThrow(/cannot verify/);
  const family = tubeBinding(true); family.supplierSnapshot!.original.families[0].installed_configuration_verified = true; expect(() => validateFrameTubeBinding(family)).toThrow(/cannot verify/);
  expect(() => validateFrameTubeBinding({...tubeBinding(), confirmed: true})).toThrow(/authority/);
});
it('checks E/G/nu consistency, gross section consistency, strict schema and explicit size limits without omitting members', () => {
  const b = tubeBinding(); b.elasticSnapshot!.reference.G_MPa = 1; expect(() => validateFrameTubeBinding(b)).toThrow(/Inconsistent/);
  const s = tubeBinding(); s.researchSnapshot!.section!.Iy_mm4 = 1; expect(() => validateFrameTubeBinding(s)).toThrow(/inconsistent/);
  const torsion = tubeBinding(); torsion.researchSnapshot!.section!.J_mm4 = 1; expect(() => validateFrameTubeBinding(torsion)).toThrow(/torsion J inconsistent/);
  const missing = tubeBinding(); missing.researchSnapshot!.sources = []; expect(() => validateFrameTubeBinding(missing)).toThrow(/Missing captured research source/);
  const supplier = tubeBinding(true); supplier.supplierSnapshot!.original.sources = []; expect(() => validateFrameTubeBinding(supplier)).toThrow(/Missing captured supplier source/);
  const j = tubeBinding(); (j.elasticSnapshot!.reference as Record<string, unknown>).approved = true; expect(() => validateFrameTubeBinding(j)).toThrow(/authority/);
  const huge = tubeBinding(); huge.researchSnapshot!.section!.note = 'a'.repeat(100001); expect(() => validateFrameTubeBinding(huge)).toThrow(/LIMIT/);
  const {model, definition} = frameFixture(), big = tubeBinding(); big.researchSnapshot!.section!.note = 'a'.repeat(60000);
  definition.elements = Array.from({length: 20}, (_, i) => ({...definition.elements[0], id: `M${i}`, ...nullFrameProperties(), binding: big}));
  expect(() => stampFrameLayout(model, definition)).toThrow(/1000000/);
});
it('delivers the complete unequal individual U-head forces to bound members in the same revision, keeping all release checks blocked', () => {
  const model = boundFrame(), p = previewWorkflow(model), f = p.frame!;
  expect(f.analysis).not.toBeNull(); expect(f.analysis!.input.revisionId).toBe(model.revisionId);
  const bases = f.analysis!.nodes.filter(n => n.id.startsWith('FB-'));
  expect(bases.reduce((sum, n) => sum + n.reactionForceN[2], 0)).toBeCloseTo(23760, 5); expect(bases.find(n => n.id === 'FB-2')!.reactionForceN[2]).toBeCloseTo(7053.75, 5);
  expect(f.input!.elements.every(e => e.kind === 'BEAM_COLUMN' && e.A_mm2! > 450 && e.A_mm2! < 454)).toBe(true);
  expect(f.blockers.some(b => b.includes('SELF_WEIGHT_OWNERSHIP_RECONCILIATION_REQUIRED'))).toBe(true);
  expect(f.blockers.some(b => b.includes('MODULE_DOES_NOT_MATCH_SELECTED_PLAN'))).toBe(true);
  expect(f.status).toBe('BLOCKED'); expect(p.constructionEligible).toBe(false); expect(model.ringlockRating).toBeNull();
});
it('retains backward compatibility for manual members and keeps partial bound drafts blocked instead of restoring old manual values', () => {
  const {model, definition} = frameFixture(); delete definition.elements[0].binding;
  const layout = stampFrameLayout(model, definition); expect(() => validateFrameLayout(layout)).not.toThrow();
  definition.elements[0] = {...definition.elements[0], ...nullFrameProperties(), binding: emptyFrameTubeBinding()};
  const f = evaluateFrameLayout(model, stampFrameLayout(model, definition), previewWorkflow(model).loadPath!.reactions);
  expect(f.analysis).toBeNull(); expect(definition.elements[0].E_MPa).toBeNull();
});
it('uses independent per-member copies, keeps them unchanged after global selection edits, and invalidates prior results', () => {
  const model = boundFrame(), captured = structuredClone(model.frameLayout!.elements[0].binding);
  const edited = reviseDraft(model, {ringlockResearch: frameReference('LEDGER')});
  expect(edited.frameLayout!.elements[0].binding).toEqual(captured); expect(previewWorkflow(edited).frame!.analysis).toBeNull();
  const rebuilt = regenerateDraftLayouts(edited), f = previewWorkflow(rebuilt).frame!;
  expect(f.analysis).not.toBeNull(); expect(f.input!.elements[0]).toMatchObject({E_MPa: 210000, A_mm2: resolved().A_mm2});
  const one = structuredClone(rebuilt.frameLayout!); one.elements[0].binding = tubeBinding(true); one.elements[1].binding = captured;
  const changed = regenerateDraftLayouts(rebuilt, {frameLayout: stampFrameLayout(rebuilt, one)});
  expect(changed.frameLayout!.elements[1].binding).toEqual(captured); expect(previewWorkflow(changed).frame!.analysis).not.toBeNull();
});
it('freezes source copies and exact resolved inputs with the report/drawing, rejects forged rehashed results, and marks later changes stale', async () => {
  const model = boundFrame(), frozen = await freezeDesign(model), view = await documentView(frozen, model);
  expect(view.drawing.frame).toEqual(view.report.preview.frame); expect(Object.isFrozen(frozen.content.model.frameLayout!.elements[0].binding)).toBe(true);
  expect(view.report.preview.frame!.input!.elements[0]).toMatchObject({E_MPa: 210000, A_mm2: resolved().A_mm2});
  const tampered = structuredClone(frozen); tampered.content.preview.frame!.input!.elements[0] = {...tampered.content.preview.frame!.input!.elements[0], E_MPa: 200000} as never;
  tampered.snapshotHash = await contentHash(tampered.content); await expect(documentView(tampered, model)).rejects.toThrow(/calculation mismatch/);
  expect((await documentView(frozen, reviseDraft(model, {designBasisRef: 'new'}))).freshness).toBe('STALE');
  const imported = importDraft(model); expect(imported.humanInputReviewed).toBe(false); expect(previewWorkflow(imported).frame!.analysis).toBeNull(); expect(parseWorkflowModel(model).frameLayout).toEqual(model.frameLayout);
});
