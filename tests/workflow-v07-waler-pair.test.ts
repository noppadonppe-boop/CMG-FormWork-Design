import {expect, it} from 'vitest';
import {canonical} from '../src/domain/workflowV07/common';
import {analyzeSideLayout, stampSideLayout} from '../src/domain/workflowV07/sideLayout';
import {analyzeSidePanel, type SidePanelInput} from '../src/domain/workflowV07/sidePanel';
import {emptyWalerPair, resolveWalerPair, screenWalerTieFit, validateWalerPair} from '../src/domain/workflowV07/walerPair';
import {parseWorkflowModel, previewWorkflow, regenerateDraftLayouts, reviseDraft} from '../src/domain/workflowV07/model';
import {contentHash, documentView, freezeDesign} from '../src/domain/workflowV07/snapshot';
import {sideDefinition, sideModel} from './fixtures/workflow-v07-side';
import {explicitRailPair, explicitSideDefinition} from './fixtures/workflow-v07-waler-pair';

it('uses each physical rail E/I and its declared share without reading unknown common properties or sorting the lighter rail first', () => {
  const model = sideModel(), d = explicitSideDefinition(), r = analyzeSideLayout(model, stampSideLayout(model, d));
  const w = r.faces[0].result.walers[0]; expect(w.railDefinitions.map(r => r.share)).toEqual([.25, .75]);
  expect(w.railDefinitions.map(r => [r.E_MPa, r.I_mm4])).toEqual([[200000, 1e6], [100000, 4e6]]);
  expect(w.rails[0].totalLoadN / w.rails[1].totalLoadN).toBeCloseTo(1 / 3, 10);
  // Same geometry/load pattern: delta1/delta2 = (share1/share2)*(E2*I2)/(E1*I1) = 2/3.
  expect(w.rails[0].maxDeflectionMm / w.rails[1].maxDeflectionMm).toBeCloseTo(2 / 3, 10);
  expect(w.rails[0].maxMomentNmm / w.rails[1].maxMomentNmm).toBeCloseTo(1 / 3, 10);
  expect(r.faces[0].result.expectedForceN).toBe(10000); expect(r.status).toBe('BLOCKED');
});
it('changing only one rail I scales only its deflection and preserves transmitted force and first moments', () => {
  const model = sideModel(), d = explicitSideDefinition(), before = analyzeSideLayout(model, stampSideLayout(model, d));
  d.faces[0].walers[0].pair!.rails[1].bendingI_mm4! *= 4;
  const after = analyzeSideLayout(model, stampSideLayout(model, d)), a = before.faces[0].result.walers[0], b = after.faces[0].result.walers[0];
  expect(b.rails[1].maxDeflectionMm).toBeCloseTo(a.rails[1].maxDeflectionMm / 4, 12);
  expect(b.rails[0]).toEqual(a.rails[0]); expect(after.nodes).toEqual(before.nodes);
  expect(after.faces[0].result.residuals.forceN).toBeCloseTo(0, 5); expect(after.faces[0].result.residuals.heightLeverNmm).toBeCloseTo(0, 3);
});
it('retains different physical rail definitions and shares at every level rather than applying one face-wide pair', () => {
  const model = sideModel(), d = explicitSideDefinition(); d.faces[0].walers[1].pair!.rail1Share = .8;
  d.faces[0].walers[1].pair!.rails[0].id = 'UPPER-RAIL-A';
  const r = analyzeSideLayout(model, stampSideLayout(model, d)), rows = r.faces[0].result.walers;
  expect(rows[0].rails[0].totalLoadN / rows[0].rails[1].totalLoadN).toBeCloseTo(1 / 3, 10);
  expect(rows[1].rails[0].totalLoadN / rows[1].rails[1].totalLoadN).toBeCloseTo(4, 10);
  expect(rows[1].railDefinitions[0].id).toBe('UPPER-RAIL-A');
});
it('preserves the old common-property calculation through an explicit compatibility route and flags its missing physical data', () => {
  const model = sideModel(), old = sideDefinition(), d = explicitSideDefinition();
  for (const f of d.faces) for (const w of f.walers) {w.pair!.rail1Share = .6; for (const r of w.pair!.rails) {r.E_MPa = 200000; r.bendingI_mm4 = 1e6;}}
  const a = analyzeSideLayout(model, stampSideLayout(model, old)), b = analyzeSideLayout(model, stampSideLayout(model, d));
  expect(b.nodes).toEqual(a.nodes);
  expect(b.faces.flatMap(f => f.result.walers.flatMap(w => w.rails))).toEqual(a.faces.flatMap(f => f.result.walers.flatMap(w => w.rails)));
  expect(a.blockers.some(x => x.includes('SHARED_LEGACY_RAIL_PROPERTIES'))).toBe(true);
});
it('never treats an unmodelled splice, unknown continuity or an extra release flag as a continuous rail', () => {
  const p = explicitRailPair(); p.rails[0].continuity = 'SPLICED'; p.rails[0].spliceStationsMm = [400];
  expect(() => resolveWalerPair(p, 1000, ['S1', 'S2'])).toThrow(/splice stiffness/);
  p.rails[0].continuity = 'CONTINUOUS'; expect(() => resolveWalerPair(p, 1000, ['S1', 'S2'])).toThrow(/splice stiffness/);
  p.rails[0].spliceStationsMm = [null]; expect(() => resolveWalerPair(p, 1000, ['S1', 'S2'])).toThrow(/interior splice/);
  expect(() => validateWalerPair({...explicitRailPair(), endReleases: 'PINNED'})).toThrow(/fields/);
});
it('preserves nulls in drafts while rejecting authority metadata, bad shares, duplicate rails and invalid stiffness', () => {
  const p = emptyWalerPair(); validateWalerPair(p); expect(p.rail1Share).toBeNull(); expect(p.rails[0].E_MPa).toBeNull();
  expect(() => resolveWalerPair(p, 1000, ['S1', 'S2'])).toThrow(/share required/);
  expect(() => validateWalerPair({...explicitRailPair(), compositeAction: true})).toThrow(/noncomposite/);
  expect(() => validateWalerPair({...explicitRailPair(), confirmed: true})).toThrow(/authority/);
  const duplicate = explicitRailPair(); duplicate.rails[1].id = duplicate.rails[0].id; expect(() => validateWalerPair(duplicate)).toThrow();
  const bad = explicitRailPair(); bad.rails[0].E_MPa = -1; expect(() => validateWalerPair(bad)).toThrow();
  const model = sideModel(), d = explicitSideDefinition(); (d.faces[0].walers[0].pair as unknown as Record<string, unknown>).confirmed = true;
  expect(() => parseWorkflowModel({...model, sideLayout: {...d, revisionId: model.revisionId, inputDefinition: ''}})).toThrow(/authority/);
});
it('reports adverse measured clearances as FAIL without changing or dividing the full serial tie demand', () => {
  const model = sideModel(), d = explicitSideDefinition(); d.faces[0].walers[0].pair!.clearGapMm = 14;
  d.faces[0].walers[0].pair!.supportFittings[0].clearHoleDiameterMm = 12;
  const ready = {...model, sideLayout: stampSideLayout(model, d)}, p = previewWorkflow(ready), tie = p.side!.ties[0];
  expect(tie.fits[0]?.issues).toContain('TIE_ENVELOPE_EXCEEDS_CLEAR_RAIL_GAP');
  expect(tie.fits[0]?.issues).toContain('TIE_ENVELOPE_EXCEEDS_CLEAR_PLATE_HOLE');
  expect(tie.demandKN).toBeCloseTo(tie.a.forceN / 1000, 10); expect(p.status).toBe('FAIL'); expect(p.constructionEligible).toBe(false);
});
it('distinguishes radial clearance, unknown geometry and dimensional impossibility without ever certifying contact', () => {
  const p = explicitRailPair(); p.supportFittings[0].requiredRadialClearanceMm = 3;
  expect(screenWalerTieFit(p, 'S1', 16).issues).toContain('DECLARED_REQUIRED_GAP_CLEARANCE_NOT_MET');
  p.supportFittings[0].requiredRadialClearanceMm = 2;
  const equal = screenWalerTieFit(p, 'S1', 16); expect(equal.status).toBe('BLOCKED'); expect(equal.issues).toEqual([]);
  expect(equal.availableGapMm).toBe(4); expect(equal.requiredDiametralClearanceMm).toBe(4);
  p.supportFittings[0].plateWidthAcrossRailsMm = 20; expect(screenWalerTieFit(p, 'S1', 16).issues).toContain('PLATE_WIDTH_CANNOT_BRIDGE_CLEAR_RAIL_GAP');
  p.clearGapMm = null; p.supportFittings = []; const unknown = screenWalerTieFit(p, 'S1', 16);
  expect(unknown.availableGapMm).toBeNull(); expect(unknown.availableHoleMm).toBeNull(); expect(unknown.requiredDiametralClearanceMm).toBeNull(); expect(unknown.status).toBe('BLOCKED');
});
it('requires actual fitting IDs and leaves normal-stack, curved contact and cold-formed checks explicitly open', () => {
  const p = explicitRailPair(); p.separationAxis = 'FACE_NORMAL'; p.rails[0].family = 'CHS'; p.rails[1].family = 'C_LIP';
  const r = resolveWalerPair(p, 1000, ['S1', 'S2']);
  expect(r.blockers.some(b => b.includes('NORMAL_STACK'))).toBe(true); expect(r.blockers.some(b => b.includes('SADDLE'))).toBe(true); expect(r.blockers.some(b => b.includes('DISTORTIONAL'))).toBe(true);
  expect(screenWalerTieFit(p, 'S1', 16).availableGapMm).toBeNull();
  p.supportFittings[0].supportId = 'NOT-ACTUAL'; expect(() => resolveWalerPair(p, 1000, ['S1', 'S2'])).toThrow(/unknown actual support/);
});
it('does not silently fall back from missing per-level definitions or accept ignored beam release fields', () => {
  const pair = resolveWalerPair(explicitRailPair(), 1000, ['S1', 'S2']);
  const input: SidePanelInput = {faceId: 'F1', revision: 'R1', lengthMm: 1000, heightMm: 1000, pourHeadMm: 1000, gammaKNm3: 20,
    studPositionsMm: [0, 500, 1000], walerLevelsMm: [100, 900], walerSupports: [{id: 'S1', xMm: 250}, {id: 'S2', xMm: 750}],
    studE_MPa: 200000, studI_mm4: 1e6, sharingEvidence: 'SYNTHETIC', independentRailsByLevel: [pair.rails, pair.rails]};
  expect(analyzeSidePanel(input).expectedForceN).toBe(10000);
  expect(() => analyzeSidePanel({...input, independentRailsByLevel: [pair.rails]})).toThrow(/every waler|Every waler/);
  const invalid = structuredClone(input); (invalid.independentRailsByLevel![0][0] as unknown as Record<string, unknown>).endReleases = 'PIN';
  expect(() => analyzeSidePanel(invalid)).toThrow(/Unsupported rail analysis/);
});
it('freezes both actual rail definitions/results, detects source edits and rejects rehashed altered stiffness', async () => {
  const model = sideModel(), ready = regenerateDraftLayouts(model, {sideLayout: stampSideLayout(model, explicitSideDefinition())});
  const frozen = await freezeDesign(ready), view = await documentView(frozen, ready);
  expect(view.report.preview.side!.faces[0].result.walers[0].railDefinitions[1].I_mm4).toBe(4e6);
  expect(Object.isFrozen(frozen.content.model.sideLayout!.faces[0].walers[0].pair)).toBe(true);
  const editedDefinition = explicitSideDefinition(); editedDefinition.faces[0].walers[0].pair!.rails[1].E_MPa = 120000;
  const edited = reviseDraft(ready, {sideLayout: stampSideLayout(ready, editedDefinition)});
  expect(previewWorkflow(edited).side).toBeNull(); expect((await documentView(frozen, edited)).freshness).toBe('STALE');
  const tampered = structuredClone(frozen); tampered.content.model.sideLayout!.faces[0].walers[0].pair!.rails[1].E_MPa = 120000;
  tampered.inputHash = await contentHash(tampered.content.model); tampered.snapshotHash = await contentHash(tampered.content);
  await expect(documentView(tampered, ready)).rejects.toThrow(/calculation mismatch/);
  expect(canonical(frozen.content.model)).not.toBe(canonical(tampered.content.model));
});
