import {expect, it} from 'vitest';
import {analyzeBeam, type BeamInput} from '../src/domain/workflowV07/beam';
import {beamMemberEvidenceReference, emptyBeamMemberEvidence, screenBeamMemberResistance, type BeamMemberEvidence, type BeamMemberQuantity} from '../src/domain/workflowV07/beamResistance';
import {previewWorkflow} from '../src/domain/workflowV07/model';
import {builtModel, layoutFixture, slabModel} from './fixtures/workflow-v07-soffit';
import {analyzeSideLayout, stampSideLayout} from '../src/domain/workflowV07/sideLayout';
import {sideDefinition, sideModel} from './fixtures/workflow-v07-side';

const beam = (patch: Partial<BeamInput> = {}): BeamInput => ({id: 'JOIST-1', revision: 'R1', lengthMm: 1000, E_MPa: 200000, I_mm4: 1e6,
  supports: [{id: 'A', xMm: 0}, {id: 'B', xMm: 1000}], points: [],
  patches: [{id: 'q', startMm: 0, endMm: 1000, startNPerMm: 10, endNPerMm: 10}], ...patch});
const memberRef = 'SYNTHETIC checked 100x100 timber member';
function evidence(quantity: BeamMemberQuantity, limit: number): BeamMemberEvidence {
  const row = emptyBeamMemberEvidence(quantity, memberRef);
  return {...row, limit, actionBasis: 'SERVICE', limitBasis: quantity === 'DEFLECTION' ? 'SLS_LIMIT' : 'ALLOWABLE',
    scopeEvidenceRef: 'SYNTHETIC support and unsupported-length review', maximumUnsupportedSpanMm: 1000,
    methodId: `SYNTHETIC-${quantity}`, sourceRef: 'SYNTHETIC design source', sourceRevision: 'REV-A',
    evidenceRef: 'SYNTHETIC member-specific capacity', reviewRef: 'SYNTHETIC engineering review', status: 'ENGINEER_REVIEWED'};
}

it('screens only explicit reviewed flexure, shear and service deflection limits and stays NO_GO', () => {
  const input = beam({actionBasis: 'SERVICE', memberEvidenceRef: memberRef,
    resistanceEvidence: [evidence('FLEXURE', 2e6), evidence('SHEAR', 6000), evidence('DEFLECTION', 1)]});
  const analysis = analyzeBeam(input);
  expect(analysis.resistanceScreen.status).toBe('SCREENED');
  expect(analysis.resistanceScreen.checks.map(check => check.utilization)).toEqual([
    expect.closeTo(1.25e6 / 2e6, 8), expect.closeTo(5000 / 6000, 8), expect.closeTo(.6510416666666667, 8),
  ]);
  expect(analysis.resistanceScreen.blockers).toContain('BEAM_MEMBER_SCREEN_IS_NOT_CONSTRUCTION_APPROVAL');
  expect(analysis.resistanceScreen.constructionRelease).toBe('NO_GO');
  expect(analysis.status).toBe('LOAD_PREVIEW');
});

it('keeps missing, mismatched, unreviewed and out-of-scope member evidence INCOMPLETE', () => {
  const base = beam();
  const missing = screenBeamMemberResistance({maximumUnsupportedSpanMm: 1000,
    demands: {FLEXURE: 1e6, SHEAR: 4000, DEFLECTION: 1}});
  expect(missing.status).toBe('INCOMPLETE');
  expect(missing.checks.every(check => check.status === 'INCOMPLETE' && check.utilization === null)).toBe(true);

  const bad = evidence('FLEXURE', 2e6);
  bad.memberEvidenceRef = 'different member';
  bad.maximumUnsupportedSpanMm = 800;
  bad.status = 'REFERENCE_ONLY';
  const analysis = analyzeBeam({...base, actionBasis: 'SERVICE', memberEvidenceRef: memberRef, resistanceEvidence: [bad]});
  const flexure = analysis.resistanceScreen.checks.find(check => check.quantity === 'FLEXURE')!;
  expect(flexure.status).toBe('INCOMPLETE');
  expect(flexure.blockers).toEqual(expect.arrayContaining([
    'BEAM_MEMBER_SOURCE_IS_REFERENCE_ONLY',
    'BEAM_MEMBER_SECTION_ORIENTATION_EVIDENCE_MISMATCH',
    'ACTUAL_UNSUPPORTED_SPAN_EXCEEDS_REVIEWED_EVIDENCE_SCOPE',
  ]));

  const factored = analyzeBeam({...base, actionBasis: 'FACTORED', memberEvidenceRef: memberRef,
    resistanceEvidence: [evidence('DEFLECTION', 1)]});
  expect(factored.resistanceScreen.checks.find(check => check.quantity === 'DEFLECTION')?.blockers).toContain('DEFLECTION_CHECK_REQUIRES_SERVICE_ACTIONS');
});

it('reports FAIL only when a reviewed explicit limit is exceeded', () => {
  const analysis = analyzeBeam(beam({actionBasis: 'SERVICE', memberEvidenceRef: memberRef,
    resistanceEvidence: [evidence('FLEXURE', 1e6), evidence('SHEAR', 6000), evidence('DEFLECTION', 1)]}));
  const flexure = analysis.resistanceScreen.checks.find(check => check.quantity === 'FLEXURE')!;
  expect(flexure.status).toBe('FAIL');
  expect(flexure.blockers).toContain('DECLARED_BEAM_MEMBER_LIMIT_EXCEEDED');
  expect(analysis.resistanceScreen.status).toBe('FAIL');
  expect(analysis.resistanceScreen.constructionRelease).toBe('NO_GO');
});

it('screens authored joist/bearer evidence on the current slab load path and propagates an unfavorable failure', () => {
  const layout = layoutFixture();
  const joistEvidenceRef = beamMemberEvidenceReference('JOIST', {E_MPa: layout.joist.E_MPa, I_mm4: layout.joist.I_mm4, evidenceRef: layout.joist.evidenceRef, binding: null});
  const bearerEvidenceRef = beamMemberEvidenceReference('BEARER', {E_MPa: layout.bearer.E_MPa, I_mm4: layout.bearer.I_mm4, evidenceRef: layout.bearer.evidenceRef, binding: null});
  layout.joist.resistanceEvidence = [evidence('FLEXURE', 2e6), evidence('SHEAR', 1e6), evidence('DEFLECTION', 5)]
    .map(row => ({...row, memberEvidenceRef: joistEvidenceRef, maximumUnsupportedSpanMm: 1500}));
  layout.bearer.resistanceEvidence = [evidence('FLEXURE', 2e6), evidence('SHEAR', 1e6), evidence('DEFLECTION', 5)]
    .map(row => ({...row, memberEvidenceRef: bearerEvidenceRef, maximumUnsupportedSpanMm: 2400}));
  const model = builtModel(slabModel(), layout), preview = previewWorkflow(model);
  expect(preview.loadPath?.analyses.every(a => a.resistanceScreen.status === 'SCREENED')).toBe(true);
  expect(preview.status).toBe('BLOCKED');
  expect(preview.constructionEligible).toBe(false);

  const failingLayout = structuredClone(layout);
  failingLayout.joist.resistanceEvidence![0].limit = 0;
  const failingModel = builtModel(slabModel(), failingLayout), failingPreview = previewWorkflow(failingModel);
  expect(failingPreview.loadPath?.analyses.some(a => a.resistanceScreen.status === 'FAIL')).toBe(true);
  expect(failingPreview.status).toBe('FAIL');
  expect(failingPreview.constructionEligible).toBe(false);
  expect(failingPreview.constructionRelease).toBe('NO_GO');
});

it('screens wall studs and shared waler rails with member-scoped evidence and blocks stale evidence', () => {
  const model = sideModel(), definition = sideDefinition(), face = definition.faces[0];
  const studRef = beamMemberEvidenceReference('SIDE_STUD', {E_MPa: face.stud.E_MPa, I_mm4: face.stud.I_mm4, evidenceRef: face.stud.evidenceRef, binding: null});
  const railRef = beamMemberEvidenceReference('SIDE_SHARED_RAIL', {E_MPa: face.rail.E_MPa, I_mm4: face.rail.I_mm4, evidenceRef: face.rail.evidenceRef, binding: null});
  for (const f of definition.faces) {
    f.stud.resistanceEvidence = [evidence('FLEXURE', 1e9), evidence('SHEAR', 1e9), evidence('DEFLECTION', 100)].map(row => ({...row, memberEvidenceRef: studRef, maximumUnsupportedSpanMm: 1000}));
    f.rail.resistanceEvidence = [evidence('FLEXURE', 1e9), evidence('SHEAR', 1e9), evidence('DEFLECTION', 100)].map(row => ({...row, memberEvidenceRef: railRef, maximumUnsupportedSpanMm: 1000}));
  }
  const side = analyzeSideLayout(model, stampSideLayout(model, definition));
  const screens = side.faces.flatMap(f => [...f.result.studs.map(s => s.analysis), ...f.result.walers.flatMap(w => w.rails)]).map(a => a.resistanceScreen);
  expect(screens.length).toBeGreaterThan(0);
  expect(screens.every(s => s.status === 'SCREENED' && s.constructionRelease === 'NO_GO')).toBe(true);
  expect(side.blockers).not.toContain('SIDE_ONE_D_MEMBER_RESISTANCE_EVIDENCE_REQUIRED');
  expect(side.constructionRelease).toBe('NO_GO');

  const stale = structuredClone(definition);
  stale.faces[0].stud.I_mm4 = 2e6;
  const staleSide = analyzeSideLayout(model, stampSideLayout(model, stale));
  expect(staleSide.faces[0].result.studs[0].analysis.resistanceScreen.blockers).toContain('BEAM_MEMBER_SECTION_ORIENTATION_EVIDENCE_MISMATCH');
  expect(staleSide.blockers).toContain('SIDE_ONE_D_MEMBER_RESISTANCE_EVIDENCE_REQUIRED');

  const failing = structuredClone(definition);
  failing.faces[0].rail.resistanceEvidence![0].limit = 0;
  const failingSide = analyzeSideLayout(model, stampSideLayout(model, failing));
  expect(failingSide.status).toBe('FAIL');
  expect(failingSide.constructionRelease).toBe('NO_GO');
});
