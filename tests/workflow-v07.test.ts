import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {calculate, defaults} from '../src/domain';
import {pairFaces, tieRouteIssues, type TieRoute} from '../src/domain/workflowV07/geometry';
import {beamLoads, slabLoads, loadOwnershipIssues, type LoadAction} from '../src/domain/workflowV07/loads';
import {normalizeSection, referenceRows, selectReference, steelStrengthForThickness} from '../src/domain/workflowV07/catalogues';
import {coverageIssues, type CoverageAssignment, type RequiredCheck, type RepresentativeCheck} from '../src/domain/workflowV07/coverage';
import {pairedContactForces} from '../src/domain/workflowV07/loadPath';
import {TIE_ROLES, screenTieAssembly, type TieAssembly} from '../src/domain/workflowV07/assemblies';
import {compatibleBrace, installedHeight, screenRinglock, type RinglockConfiguration} from '../src/domain/workflowV07/ringlock';
import {canonical, units} from '../src/domain/workflowV07/common';
import {fromLegacy, parseWorkflowModel, previewWorkflow, reviseDraft} from '../src/domain/workflowV07/model';
import {contentHash, documentView, freezeDesign, importDraft} from '../src/domain/workflowV07/snapshot';
import {workflowV07Enabled} from '../src/workflowV07Flag';

const root = path.resolve('src/reference/workflow-v07');
const data = (name: string): unknown => JSON.parse(readFileSync(path.join(root, name), 'utf8'));
const rect = [{x: 0, y: 0}, {x: 6000, y: 0}, {x: 6000, y: 4000}, {x: 0, y: 4000}];
const L = [{x: 0, y: 0}, {x: 6000, y: 0}, {x: 6000, y: 2000}, {x: 2000, y: 2000}, {x: 2000, y: 5000}, {x: 0, y: 5000}];
describe('v0.7 topology and physical tie routes', () => {
  it('rectangle has four faces/two regions; L has six faces/four regions without new hinges', () => {
    expect(pairFaces(rect, 500).pairs).toHaveLength(2);
    const r = pairFaces(L, 500);
    expect(r.faces).toHaveLength(6); expect(r.pairs).toHaveLength(4);
    expect([r.areaM2, r.perimeterM, r.sideAreaM2]).toEqual([18, 22, 11]);
    expect(r.pairs.map(p => p.chordMm).sort()).toEqual([2000, 2000, 5000, 6000]);
    expect(r.pairs.every(p => !p.physicalSpliceCreated && p.mirrorReuse === 'NOT_EVALUATED')).toBe(true);
  });
  it('preserves geometry under rotation/mirroring/winding; U is not forced into four pairs', () => {
    for (const shape of [L.map(p => ({x: -p.x, y: p.y})), L.map(p => ({x: p.y, y: -p.x})), [...L].reverse()]) {
      const r = pairFaces(shape, 500); expect(r.pairs).toHaveLength(4); expect(r.sideAreaM2).toBe(11);
    }
    expect(pairFaces([[0, 0], [6, 0], [6, 5], [4, 5], [4, 2], [2, 2], [2, 5], [0, 5]].map(([x, y]) => ({x, y})), 500).pairs).toHaveLength(6);
  });
  it('rejects holes, varying heights, diagonals, self intersection and duplicate closure', () => {
    expect(() => pairFaces(rect, 500, {hasHoles: true})).toThrow(/UNSUPPORTED/);
    expect(() => pairFaces(rect, 500, {uniformHeight: false})).toThrow(/UNSUPPORTED/);
    expect(() => pairFaces([...rect, rect[0]], 500)).toThrow();
    expect(() => pairFaces([{x: 0, y: 0}, {x: 5, y: 0}, {x: 4, y: 5}, {x: 0, y: 5}], 500)).toThrow(/UNSUPPORTED/);
    expect(() => pairFaces([{x: 0, y: 0}, {x: 4, y: 0}, {x: 4, y: 4}, {x: 2, y: 4}, {x: 2, y: -1}, {x: 1, y: -1}, {x: 1, y: 3}, {x: 0, y: 3}], 500)).toThrow();
  });
  it('rejects ties through a notch and exposes crossing/height/rebar checks', () => {
    const topology = pairFaces(L, 500);
    const bad: TieRoute = {id: 'BAD', faceAId: 'F6', faceBId: 'F2', a: {x: 0, y: 4000}, b: {x: 6000, y: 4000}, zMm: 200, diameterMm: 16};
    expect(tieRouteIssues(topology, [bad], null)).toEqual(expect.arrayContaining(['REBAR_CLEARANCE_NOT_VERIFIED', 'BAD:UNSUPPORTED_TIE_PATH']));
    const routes: TieRoute[] = [{id: 'X', faceAId: 'F6', faceBId: 'F2', a: {x: 0, y: 1000}, b: {x: 6000, y: 1000}, zMm: 200, diameterMm: 16},
      {id: 'Y', faceAId: 'F1', faceBId: 'F5', a: {x: 1000, y: 0}, b: {x: 1000, y: 5000}, zMm: 200, diameterMm: 16}];
    expect(tieRouteIssues(topology, routes, 'rebar drawing')).toContain('X/Y:TIE_COLLISION');
    expect(tieRouteIssues(topology, [routes[0], {...routes[1], zMm: 220}], 'rebar drawing')).toEqual([]);
  });
});

const action = (patch: Partial<LoadAction> = {}): LoadAction => ({id: 'A', ownershipId: 'BEAM_STRIP', kind: 'CONCRETE', stageId: 'POUR1', loadCaseId: 'SLS', source: 'synthetic',
  direction: 'VERTICAL_DOWN', units: 'kPa', magnitude: 10, region: {x0: 0, x1: 1000, y0: 0, y1: 1000}, includedInActionId: null, ...patch});
describe('explicit units, vertical actions and spatial ownership', () => {
  it('keeps cm catalogues separate from the N/mm solver and rejects unknown/nonfinite conversions', () => {
    expect([units.cm2ToMm2(1), units.cm3ToMm3(1), units.cm4ToMm4(1), units.kPaToMPa(1)]).toEqual([100, 1000, 10000, .001]);
    expect(() => units.cm4ToMm4(NaN)).toThrow(); expect(() => canonical({unknown: undefined})).toThrow();
  });
  it('reproduces synthetic slab/beam arithmetic without treating missing loads as zero', () => {
    expect(slabLoads(24, 150, .5, 2.5).listedServiceKPa).toBeCloseTo(6.6);
    expect(() => slabLoads(24, 150, null, 2.5)).toThrow(); expect(slabLoads(24, 150, 0, 0).listedServiceKPa).toBeCloseTo(3.6);
    const r = beamLoads({gamma: 24, bMm: 300, hMm: 600, slabThicknessMm: 150, concreteStripMm: 1200, deadKPa: .5, deadStripMm: 1200, liveKPa: 2.5, liveStripMm: 1200});
    expect(r.concreteKNPerM).toBeCloseTo(7.56); expect(r.listedServiceKNPerM).toBeCloseTo(11.16);
    expect(r.sidePressureTopKPa).toBeCloseTo(3.6, 10); expect(r.sidePressureBottomKPa).toBeCloseTo(14.4, 10);
    expect(r.includesSelfWeight).toBe(false);
  });
  it('detects overlapping concrete even with different ownership ids, and allows different actions/stages', () => {
    expect(loadOwnershipIssues([action(), action({id: 'B', ownershipId: 'SLAB_STRIP'})])).toContain('A/B:DUPLICATE_OWNED_LOAD');
    expect(loadOwnershipIssues([action(), action({id: 'B', kind: 'ADDITIONAL_DL'})])).toEqual([]);
    expect(loadOwnershipIssues([action(), action({id: 'B', stageId: 'POUR2'})])).toEqual([]);
    expect(loadOwnershipIssues([action(), action({id: 'B', includedInActionId: 'A'})])).toEqual([]);
    expect(loadOwnershipIssues([])).toContain('MISSING_ACTION_LEDGER');
  });
});

describe('owner reference libraries and Custom snapshots', () => {
  it('copied reference files retain their original bytes and library metadata', () => {
    const manifest = data('package-manifest.json') as {files: {path: string; sha256: string}[]};
    const paths: Record<string, string> = {'sections.json': 'baseline/RC-FormWork_Sections_v0.4/RC-FormWork_Sections_v0.4.json', 'materials.json': 'baseline/RC-FormWork_Materials_v0.5/RC-FormWork_Material_Library_v0.5.json',
      'ringlock.json': 'data/ringlock_components_v0.7.json', 'checks.json': 'engineering/check_catalogue_v0.7.json'};
    for (const [file, original] of Object.entries(paths)) expect(createHash('sha256').update(readFileSync(path.join(root, file))).digest('hex')).toBe(manifest.files.find(f => f.path === original)!.sha256);
    expect(referenceRows(data('sections.json'), 'sections')).toHaveLength(182);
    expect(referenceRows(data('materials.json'), 'materials')).toHaveLength(39);
    const ringlock = referenceRows(data('ringlock.json'), 'components'); expect(ringlock).toHaveLength(46);
    expect(ringlock.every(r => r.rated_capacity_kN === null && r.design_capacity_available === false)).toBe(true);
  });
  it('normalizes declared principal axes and refuses quarantined/inherited-unreviewed sections', () => {
    const section = {section_id: 'DEMO', family: 'RHS', candidate_selectable: true, A_cm2: 10, Ix_cm4: 100, Iy_cm4: 50, Sx_cm3: 20, Sy_cm3: 10, Ixy_cm4: 2};
    expect(normalizeSection(section, 90)).toMatchObject({areaMm2: 1000, bendingI_mm4: 500000, bendingS_mm3: 10000, Ixy_mm4: -20000});
    expect(() => normalizeSection({...section, candidate_selectable: false}, 0)).toThrow();
    expect(() => normalizeSection({...section, candidate_selectable: null}, 0)).toThrow();
  });
  it('applies product thickness bands without treating timber as steel', () => {
    const materials = referenceRows(data('materials.json'), 'materials'), steel = materials.find(m => m.material_id === 'STEEL-SS400')!;
    expect(steelStrengthForThickness(steel, 'H', 16).Fy_MPa).toBe(245);
    expect(steelStrengthForThickness(steel, 'H', 16.1).Fy_MPa).toBe(235);
    expect(() => steelStrengthForThickness(steel, 'RHS', 5)).toThrow();
    expect(() => steelStrengthForThickness(materials.find(m => m.category === 'TIMBER'), 'TIMBER_RECT', 38)).toThrow();
  });
  it('Custom keeps original data/evidence and cannot overwrite authority metadata', () => {
    const master = {section_id: 'S1', thickness: 3, candidate_selectable: true};
    const custom = selectReference(master, '0.4', {changes: {thickness: 3.2}, reason: 'measured', evidenceRef: 'measurement'});
    expect(master.thickness).toBe(3); expect(custom.reference.thickness).toBe(3); expect(custom.effective.thickness).toBe(3.2);
    expect(custom.constructionRelease).toBe('NO_GO');
    expect(() => selectReference(master, '0.4', {changes: {candidate_selectable: true}, reason: 'x', evidenceRef: 'y'})).toThrow();
    expect(() => selectReference({...master, family: 'RHS'}, '0.4', {changes: {family: 'C_LIP'}, reason: 'x', evidenceRef: 'y'})).toThrow();
  });
});

const required: RequiredCheck = {memberId: 'M1', checkId: 'BENDING', loadCaseId: 'SLS', revision: 'R1', applicability: {section: 'S1', endConditions: 'CONTINUOUS', bracing: 'X/Y', unbracedLength: 1500}};
const representative: RepresentativeCheck = {id: 'T1', checkId: 'BENDING', loadCaseId: 'SLS', revision: 'R1', applicability: required.applicability, status: 'CHECKED_IN_SCOPE'};
const assignment: CoverageAssignment = {memberId: 'M1', checkId: 'BENDING', loadCaseId: 'SLS', revision: 'R1', representativeId: 'T1', evidenceRef: 'comparison', notApplicableReason: null};
describe('typical coverage is per member/check/load case/revision', () => {
  it('does not pass empty or incomplete coverage and rejects stale/non-equivalent representatives', () => {
    expect(coverageIssues([], [], [])).not.toEqual([]);
    expect(coverageIssues([required], [representative], [assignment])).toEqual([]);
    expect(coverageIssues([required, {...required, checkId: 'SHEAR'}], [representative], [assignment])).toHaveLength(1);
    expect(coverageIssues([required], [{...representative, revision: 'R0'}], [assignment]).join()).toContain('STALE');
    expect(coverageIssues([required], [{...representative, applicability: {section: 'S1', bracing: 'NONE'}}], [assignment]).join()).toContain('NON_EQUIVALENT');
    expect(coverageIssues([required], [representative], [assignment, assignment]).join()).toContain('DUPLICATE');
  });
  it('requires evidence for a genuine N/A', () => {
    expect(coverageIssues([required], [], [{...assignment, representativeId: null, notApplicableReason: 'No opening', evidenceRef: null}]).join()).toContain('MISSING_APPLICABILITY');
    expect(coverageIssues([required], [], [{...assignment, representativeId: null, notApplicableReason: 'No opening'}])).toEqual([]);
  });
});

describe('tie assembly and ringlock fail closed', () => {
  const assembly = (): TieAssembly => ({topology: 'SEGMENTED_INNER_OUTER', demandKN: 20, demandBasis: 'ALLOWABLE', compatibilityEvidence: 'synthetic',
    engagementLeftMm: 20, engagementRightMm: 20, requiredEngagementLeftMm: 15, requiredEngagementRightMm: 15,
    components: TIE_ROLES.map(role => ({role, productId: role, capacityKN: 30, basis: 'ALLOWABLE', demandFraction: 1, sourceRef: 'synthetic only'}))});
  it('each serial component carries full N, missing components block, and numeric failure remains visible', () => {
    const contact = pairedContactForces(24300, 120, 20);
    expect(contact.rail1N).toBeCloseTo(8100, 8); expect(contact.rail2N).toBeCloseTo(16200, 8);
    const a = assembly(); expect(screenTieAssembly(a).status).toBe('BLOCKED');
    a.components[0].capacityKN = null; expect(screenTieAssembly(a).capacityKN).toBeNull();
    a.components[0].capacityKN = 10; expect(screenTieAssembly(a).status).toBe('FAIL');
    a.components[0].demandFraction = .5; expect(() => screenTieAssembly(a)).toThrow(/full tie force/);
  });
  it('rejects mixing ultimate-test values into allowable assembly capacity', () => {
    const a = assembly(); a.components[0].basis = 'ULTIMATE_TEST'; expect(screenTieAssembly(a).capacityKN).toBeNull();
    expect(screenTieAssembly(a).constructionRelease).toBe('NO_GO');
  });
  it('height closure is geometry only; nominal jack length is not an extension', () => {
    const terms = {soleBoard: 50, baseInstalled: 157, effectiveStandardStack: 2500, headInstalled: 100, bearer: 100, joist: 75, plywood: 18};
    expect(installedHeight(0, 3000, terms, 0)).toMatchObject({sumMm: 3000, withinTolerance: true, constructionRelease: 'NO_GO'});
    expect(() => installedHeight(0, 3000, {...terms, headInstalled: null}, 0)).toThrow();
    const brace = referenceRows(data('ringlock.json'), 'components').find(r => r.role === 'DIAGONAL_BRACE')!;
    expect(compatibleBrace(brace, String(brace.system_id), Number(brace.bay_label_mm), Number(brace.lift_label_mm))).toBe(true);
    expect(compatibleBrace(brace, 'ANOTHER_SYSTEM', Number(brace.bay_label_mm), Number(brace.lift_label_mm))).toBe(false);
  });
  it('blank rating stays blocked even when client adds approval strings', () => {
    const config: RinglockConfiguration = {manufacturer: null, systemId: null, configurationId: null, ratingId: null, bayXMm: null, bayYMm: null,
      liftHeightsMm: [], totalHeightMm: null, headExtensionMm: null, baseExtensionMm: null, headEngagementMm: null, baseEngagementMm: null,
      braceXRef: null, braceYRef: null, planRestraintRef: null, topRestraintRef: null, baseRestraintRef: null, jointStiffnessRef: null, groundOrSlabEvidence: null, legs: []};
    const rating = {...data('ringlock-rating-template.json') as object, status: 'SOURCE_CONFIGURATION_REVIEWED', approved: true};
    const r = screenRinglock(config, [], rating, 'R1'); expect(r.status).toBe('BLOCKED'); expect(r.constructionEligible).toBe(false);
    expect(r.blockers).toContain('RATING_CONFIGURATION_MISMATCH_NO_INTERPOLATION');
    const unknown = screenRinglock({...config, legs: [{id: 'L1', headNodeId: 'H1', xMm: 0, yMm: 0, headElevationMm: 3000, baseElevationMm: 0}]}, [], rating, 'R1');
    expect(unknown.legDemands[0].forceKN).toBeNull(); expect(unknown.legDemands[0].momentKNmm).toBeNull();
  });
});

describe('legacy preservation, feature gate and reproducible draft documents', () => {
  it('keeps original footing/column behavior and maps zero-unknowns explicitly', () => {
    const input = {...defaults, confirmed: true}, before = calculate(input), draft = fromLegacy(input, 'F1');
    expect(draft.humanInputReviewed).toBe(false); expect(draft.sideTopology).toBe('THROUGH_TIE'); expect(draft.legacy!.unknowns.tieNetArea).toBeNull();
    expect(calculate(input)).toEqual(before); expect(before.tie!.force).toBe(18); expect(before.status).not.toBe('PASS');
    const column = fromLegacy({...input, kind: 'COLUMN'}, 'C1'); expect(column.sideTopology).toBe('COLUMN_YOKE');
    expect(calculate(column.legacy!.input).tie).toBeNull();
  });
  it('cannot enable the feature by default or against production', () => {
    expect(workflowV07Enabled(undefined, false, false)).toBe(false);
    expect(workflowV07Enabled(true, false, false)).toBe(false);
    expect(workflowV07Enabled('true', true, false)).toBe(false);
    expect(workflowV07Enabled('true', false, false)).toBe(true);
    expect(workflowV07Enabled('true', true, true)).toBe(true);
  });
  it('enables production only with a second explicit string opt-in', () => {
    expect(workflowV07Enabled('true', true, false, 'true')).toBe(true);
    expect(workflowV07Enabled('true', true, false, true)).toBe(false);
    expect(workflowV07Enabled('true', true, false, 'false')).toBe(false);
    expect(workflowV07Enabled(undefined, true, false, 'true')).toBe(false);
  });
  it('rejects forged authority/unknown fields and invalidates applicability after edits/import', () => {
    const m = fromLegacy(defaults, 'F1');
    expect(() => parseWorkflowModel({...m, approved: true})).toThrow();
    const edited = reviseDraft({...m, representatives: [representative], coverage: [assignment], humanInputReviewed: true}, {gammaKNm3: 25});
    expect(edited.revisionId).not.toBe(m.revisionId); expect(edited.humanInputReviewed).toBe(false); expect(edited.coverage).toEqual([]);
    expect(importDraft({...m, humanInputReviewed: true}).humanInputReviewed).toBe(false);
  });
  it('one frozen snapshot drives report/drawing; edits become stale and tampering is rejected', async () => {
    const m = fromLegacy(defaults, 'F1'), a = await freezeDesign(m), b = await freezeDesign(m);
    expect(a.snapshotHash).toBe(b.snapshotHash); expect(a.inputHash).toBe(await contentHash(m));
    const current = await documentView(a, m); expect(current.freshness).toBe('CURRENT'); expect(current.approval).toBeNull();
    expect(current.report.preview.topology.vertices).toEqual(current.drawing.topology.vertices);
    expect((await documentView(a, {...m, gammaKNm3: 30})).freshness).toBe('STALE');
    const tampered = JSON.parse(JSON.stringify(a)); tampered.content.preview.status = 'PASS';
    await expect(documentView(tampered, m)).rejects.toThrow(/integrity/);
    expect(previewWorkflow(m).constructionEligible).toBe(false);
  });
  it('retains old input values when a snapshot runs concurrently with an edit', async () => {
    const m = fromLegacy(defaults, 'F1'), pending = freezeDesign(m); m.gammaKNm3 = 30;
    expect((await pending).content.model.gammaKNm3).toBe(24);
  });
});
