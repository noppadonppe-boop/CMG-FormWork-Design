import {describe, expect, it} from 'vitest';
import {closureReferences} from '../src/closurePackReferences';
import {canonicalClosureTieSlot, createClosureTieDraft, lookupClosureRinglockReference, normalizeClosureFormTieBridge,
  normalizeClosureRinglockSidecar, parseClosureInputTemplate, screenClosureTieAssembly, closureDraftFromTieDossier, validateClosureInputTemplate} from '../src/domain/workflowV07/closurePack';
import {tieDossierFixture} from './fixtures/workflow-v07-tie-dossier';

const context = {projectId: 'P-CLOSURE', revisionId: 'R-CLOSURE', designSnapshotHash: 'a'.repeat(64), activeStageId: 'STAGE-1', capturedStageId: 'STAGE-1', loadCaseId: 'LC-SERVICE'};
const closure = closureReferences;

describe('Workflow v0.7 Closure Pack adapters', () => {
  it('loads the exact bridge/sidecar inventory without granting release', () => {
    expect(closure.inventory).toEqual({schemaVersion: 'closure-v1', formTieRecordCount: 11, formTieTemplateCount: 6,
      formTieCheckSlotCount: 13, ringlockReferenceCount: 17, confirmed: false, constructionRelease: 'NO_GO'});
    expect(closure.formTie.records).toHaveLength(11);
    expect(closure.ringlockSidecar.records).toHaveLength(17);
    expect(closure.formTie.confirmed).toBe(false);
    expect(closure.ringlockSidecar.constructionRelease).toBe('NO_GO');
  });

  it('normalizes only the explicit plate aliases and keeps check slots separate from BOM pieces', () => {
    expect(canonicalClosureTieSlot('BEARING_PLATE_LEFT')).toBe('PLATE_LEFT');
    expect(canonicalClosureTieSlot('BEARING_PLATE_RIGHT')).toBe('PLATE_RIGHT');
    expect(() => canonicalClosureTieSlot('CONE_LEFT')).toThrow(/Unsupported tie check slot/);
    expect(closure.formTie.slot_semantics).toMatch(/NOT 13 physical hardware pieces/);
    expect(() => normalizeClosureFormTieBridge({...structuredClone(closure.formTie), confirmed: true})).toThrow(/release gate/);
  });

  it('starts supported segmented drafts with unknown component capacities', () => {
    const draft = createClosureTieDraft(closure.formTie, context, 'SEGMENTED_INNER_B');
    expect(draft.checks).toHaveLength(13);
    expect(draft.checks.every(row => row.capacity_kN === null && row.product_id === null)).toBe(true);
    expect(draft.confirmed).toBe(false);
    expect(draft.constructionRelease).toBe('NO_GO');
    expect(() => createClosureTieDraft(closure.formTie, context, 'CONTINUOUS_THROUGH_ROD')).toThrow(/UNSUPPORTED_TEMPLATE/);
    const screened = screenClosureTieAssembly(closure.formTie, draft);
    expect(screened.status).toBe('BLOCKED_DATA');
    expect(screened.issues).toContain('ACTUAL_REACTION_REFERENCE_REQUIRED');
    expect(screened.issues).toContain('CAPACITY_MISSING_OR_INVALID:INNER_UNIT');
    expect(screened.engineeringEvidenceVerified).toBe(false);
  });

  it('screens a complete normalized draft arithmetically while preserving the engineering gate', () => {
    const draft = createClosureTieDraft(closure.formTie, context, 'SEGMENTED_INNER_D');
    draft.demand = {axial_kN: 5, basis: 'WORKING', reaction_ref: 'REACTION:R-CLOSURE', symmetry_and_alignment_evidence_ref: 'EVIDENCE:ALIGNMENT'};
    draft.actual_assembly_compatibility_evidence_ref = 'EVIDENCE:ASSEMBLY';
    for (const row of draft.checks) {
      row.product_id = `PRODUCT:${row.slot}`;
      row.capacity_kN = 10;
      row.capacity_basis = 'ALLOWABLE';
      row.evidence_ref = `EVIDENCE:${row.slot}`;
      if (row.slot === 'INNER_UNIT') row.reference_record_id = 'BOOK-T46-D';
      if (row.slot === 'THREAD_END_LEFT' || row.slot === 'THREAD_END_RIGHT') {row.actual_engagement_mm = 25; row.required_engagement_mm = 20;}
    }
    const result = screenClosureTieAssembly(closure.formTie, draft);
    expect(result.status).toBe('NUMERIC_WITHIN_SUPPLIED_LIMITS');
    expect(result.assemblyCapacity_kN).toBe(10);
    expect(result.utilization).toBeCloseTo(0.5);
    expect(result.engineeringEvidenceVerified).toBe(false);
    expect(result.constructionRelease).toBe('NO_GO');
  });

  it('maps the current TieDossier roles without inventing reference IDs or evidence', () => {
    const draft = closureDraftFromTieDossier(closure.formTie, tieDossierFixture(), context, 'SEGMENTED_INNER_B',
      {axial_kN: null, basis: 'WORKING', reaction_ref: null, symmetry_and_alignment_evidence_ref: null});
    expect(draft.checks.find(row => row.slot === 'INNER_UNIT')?.product_id).toBe('SYN-INNER');
    expect(draft.checks.find(row => row.slot === 'INNER_UNIT')?.reference_record_id).toBeNull();
    expect(draft.checks.find(row => row.slot === 'THREAD_END_LEFT')?.actual_engagement_mm).toBe(30);
    expect(draft.checks.find(row => row.slot === 'THREAD_END_RIGHT')?.required_engagement_mm).toBe(25);
    expect(draft.demand.symmetry_and_alignment_evidence_ref).toBeNull();
    expect(draft.constructionRelease).toBe('NO_GO');
  });

  it('performs exact Ringlock sidecar lookup only', () => {
    const exact = lookupClosureRinglockReference(closure.ringlockSidecar, {system_ref: 'DOKA_RINGLOCK_2020_11', kind: 'STANDARD', selector: {ledger_vertical_spacing_mm: 1500}});
    expect(exact.status).toBe('REFERENCE_ONLY_NOT_CONFIGURATION_RATING');
    expect(exact.record?.limits).toEqual({compression_kN: 43, tension_kN: 56});
    const noInterpolation = lookupClosureRinglockReference(closure.ringlockSidecar, {system_ref: 'DOKA_RINGLOCK_2020_11', kind: 'STANDARD', selector: {ledger_vertical_spacing_mm: 1750}});
    expect(noInterpolation.status).toBe('BLOCKED_NO_UNIQUE_EXACT_REFERENCE');
    const moment = lookupClosureRinglockReference(closure.ringlockSidecar, {system_ref: 'DOKA_RINGLOCK_2020_11', kind: 'JOINT', selector: {action: 'My'}});
    expect(moment.record?.limits).toEqual({value: 1.05, unit: 'kN.m'});
    expect(moment.record?.source_value).toBe(105);
    expect(moment.engineeringEvidenceVerified).toBe(false);
    expect(() => normalizeClosureRinglockSidecar({...structuredClone(closure.ringlockSidecar), full_configuration_capacity: 60})).toThrow(/complete configuration defaults/);
  });

  it('keeps input templates untrusted and unapproved', () => {
    const template = closure.templates.supportSlab;
    expect(parseClosureInputTemplate(template).review.trustedVerificationStatus).toBe('NOT_VERIFIED');
    expect(template.confirmed).toBe(false);
    expect(() => parseClosureInputTemplate({...structuredClone(template), confirmed: true})).toThrow(/release gate/);
  });

  it('allows project inputs to be filled while rejecting invented fields, wrong numeric types, and approval flags', () => {
    const template = closure.templates.supportSoil;
    const filled = {...structuredClone(template), inputs: {...template.inputs, allowableBearingPressure_kPa: 125, geotechnicalReportRef: 'GEOTECH-RPT-01'}};
    expect(validateClosureInputTemplate(filled, template).inputs.allowableBearingPressure_kPa).toBe(125);
    expect(() => validateClosureInputTemplate({...filled, inputs: {...filled.inputs, unknownCapacity: 999}}, template)).toThrow(/approved template inventory/);
    expect(() => validateClosureInputTemplate({...filled, inputs: {...filled.inputs, allowableBearingPressure_kPa: '125'}}, template)).toThrow(/finite/);
    expect(() => validateClosureInputTemplate({...filled, confirmed: true}, template)).toThrow(/release gate/);
  });
});
