import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe, expect, it} from 'vitest';
import {RegistryPanel} from '../src/components/RegistryPanel';
import {screenBeamMemberResistance} from '../src/domain/workflowV07/beamResistance';
import {beamEvidenceFromRegistry, emptyEntry, emptyLimit, emptyMethod, entriesForCheck, markDraft, markReviewed, resistanceEvidenceFromRegistry, seedRegistry,
  sideLocalEvidenceFromRegistry, validateRegistry, validateRegistryEntry, type Registry} from '../src/domain/workflowV07/registry';
import {screenSideLocalChecks} from '../src/domain/workflowV07/sideLocalChecks';

const REVIEWER = 'Noppadon P · Engineer', NOW = 1_700_000_000_000;
function reviewedRegistry(): Registry {
  const method = markReviewed({...emptyMethod('M-RHS-ASD', NOW), name: 'RHS allowable bending/shear (SYNTHETIC)', sourceRef: 'SYNTHETIC source', sourceRevision: 'A', scope: 'Spans ≤ 1500 mm, laterally restrained by plywood'}, REVIEWER, NOW);
  const entry = markReviewed({...emptyEntry('RHS-50x100x3.2', 'STEEL_SECTION', NOW), name: 'RHS 50×100×3.2 (SYNTHETIC limits)', productRef: 'TIS 107 generic', sourceRef: 'SYNTHETIC certificate', sourceRevision: '2026-01', evidenceRef: 'DOC-001', scopeEvidenceRef: 'Plywood-restrained compression flange; spans ≤ 1500 mm',
    properties: {B_mm: 50, H_mm: 100, t_mm: 3.2, I_mm4: 1.1e6},
    limits: [{...emptyLimit('FLEXURE', 'M-RHS-ASD'), value: 2.5e6, maximumSpanMm: 1500}, {...emptyLimit('SHEAR', 'M-RHS-ASD'), value: 40000, maximumSpanMm: 1500},
      {...emptyLimit('DEFLECTION', 'M-RHS-ASD'), value: 3, limitBasis: 'SLS_LIMIT', maximumSpanMm: 1500}, {...emptyLimit('STUD_RAIL_BEARING', 'M-RHS-ASD'), value: 15000}, {...emptyLimit('AXIAL_COMPRESSION', 'M-RHS-ASD'), value: 60000}]}, REVIEWER, NOW);
  return {methods: [method], entries: [entry]};
}

describe('reviewed registry', () => {
  it('seeds published-source DRAFT items without limits and validates', () => {
    const seed = seedRegistry(NOW);
    validateRegistry(seed);
    expect(seed.entries.every(e => e.review.status === 'DRAFT' && e.limits.length === 0)).toBe(true);
    expect(seed.entries.find(e => e.id === 'BRACE-34MM-UNKNOWN')!.properties.wallThicknessMm).toBeNull();
    expect(entriesForCheck(seed, 'FLEXURE')).toHaveLength(0);
  });
  it('requires reviewer identity, values and method ids before an item can be REVIEWED', () => {
    expect(() => markReviewed(emptyEntry('X', 'OTHER', NOW), '   ', NOW)).toThrow(/Reviewer identity/);
    const incomplete = markReviewed({...emptyEntry('X', 'OTHER', NOW), name: 'n', sourceRef: 's', sourceRevision: 'r', evidenceRef: 'e', limits: [emptyLimit('SHEAR')]}, REVIEWER, NOW);
    expect(() => validateRegistryEntry(incomplete)).toThrow(/requires a value and method id/);
    const noSource = markReviewed({...emptyEntry('Y', 'OTHER', NOW), name: 'n'}, REVIEWER, NOW);
    expect(() => validateRegistryEntry(noSource)).toThrow(/requires name, source, revision and evidence/);
    const noScope = markReviewed({...emptyEntry('W', 'OTHER', NOW), name: 'n', sourceRef: 's', sourceRevision: 'r', evidenceRef: 'e', limits: [{...emptyLimit('SHEAR', 'M'), value: 1}]}, REVIEWER, NOW);
    expect(() => validateRegistryEntry(noScope)).toThrow(/scope statement/);
    expect(() => validateRegistryEntry({...emptyEntry('Z', 'OTHER', NOW), constructionEligible: true})).toThrow(/authority/);
  });
  it('turns a REVIEWED entry + REVIEWED method into ENGINEER_REVIEWED evidence that the beam screen accepts as SCREENED, never PASS', () => {
    const registry = reviewedRegistry(), entry = registry.entries[0], ref = 'member-ref-1';
    const evidence = (['FLEXURE', 'SHEAR', 'DEFLECTION'] as const).map(q => beamEvidenceFromRegistry(registry, entry, q, ref));
    expect(evidence.every(e => e.status === 'ENGINEER_REVIEWED' && e.reviewRef.startsWith(REVIEWER) && e.evidenceRef === `registry:${entry.id}@${NOW}`)).toBe(true);
    const screen = screenBeamMemberResistance({evidence, actionBasis: 'SERVICE', memberEvidenceRef: ref, maximumUnsupportedSpanMm: 1200, demands: {FLEXURE: 1e6, SHEAR: 10000, DEFLECTION: 1}});
    expect(screen.status).toBe('SCREENED');
    expect(JSON.stringify(screen)).not.toMatch(/"PASS"/);
    expect(screenBeamMemberResistance({evidence, actionBasis: 'SERVICE', memberEvidenceRef: ref, maximumUnsupportedSpanMm: 1800, demands: {FLEXURE: 1e6, SHEAR: 10000, DEFLECTION: 1}}).status).toBe('INCOMPLETE');
    expect(screenBeamMemberResistance({evidence, actionBasis: 'SERVICE', memberEvidenceRef: 'other-member', maximumUnsupportedSpanMm: 1200, demands: {FLEXURE: 1e6, SHEAR: 10000, DEFLECTION: 1}}).status).toBe('INCOMPLETE');
    const side = screenSideLocalChecks({demands: [{kind: 'STUD_RAIL_BEARING', id: 'r', memberId: 'm', demand: 9000, lengthMm: null, issue: null}], evidence: [sideLocalEvidenceFromRegistry(registry, entry, 'STUD_RAIL_BEARING', ref)], actionBasis: 'SERVICE', memberEvidenceRef: ref});
    expect(side.status).toBe('SCREENED');
    expect(resistanceEvidenceFromRegistry(registry, entry, 'AXIAL_COMPRESSION').status).toBe('ENGINEER_REVIEWED');
  });
  it('keeps evidence REFERENCE_ONLY (INCOMPLETE) when the entry or its method is DRAFT, and after any edit', () => {
    const registry = reviewedRegistry(), ref = 'member-ref-1';
    const draftEntry = {...registry, entries: [markDraft(registry.entries[0], NOW + 1)]};
    const e1 = beamEvidenceFromRegistry(draftEntry, draftEntry.entries[0], 'FLEXURE', ref);
    expect(e1.status).toBe('REFERENCE_ONLY'); expect(e1.reviewRef).toBe('');
    const draftMethod = {...registry, methods: [markDraft(registry.methods[0], NOW + 1)]};
    expect(beamEvidenceFromRegistry(draftMethod, draftMethod.entries[0], 'FLEXURE', ref).status).toBe('REFERENCE_ONLY');
    expect(entriesForCheck(draftMethod, 'FLEXURE')[0]).toMatchObject({reviewed: false, methodKnown: true});
    const screen = screenBeamMemberResistance({evidence: [e1], actionBasis: 'SERVICE', memberEvidenceRef: ref, maximumUnsupportedSpanMm: 1200, demands: {FLEXURE: 1e6, SHEAR: 10000, DEFLECTION: 1}});
    expect(screen.status).toBe('INCOMPLETE');
    expect(() => beamEvidenceFromRegistry(registry, registry.entries[0], 'FLEXURE', ref)).not.toThrow();
    expect(() => sideLocalEvidenceFromRegistry(registry, registry.entries[0], 'CORNER_OPENING', ref)).toThrow(/no reviewed limit/);
  });
  it('renders the library with reviewer identity and statuses but no approval wording', () => {
    const registry = reviewedRegistry();
    const html = renderToStaticMarkup(<RegistryPanel registry={{...registry, entries: [...registry.entries, ...seedRegistry(NOW).entries]}} reviewerName={REVIEWER} canReview canDelete onSave={() => {}} onDelete={() => {}}/>);
    expect(html).toContain('RHS-50x100x3.2'); expect(html).toContain('REVIEWED · Noppadon P · Engineer');
    expect(html).toContain('BRACE-34MM-UNKNOWN'); expect(html).toContain('ยังไม่มีขีดจำกัด');
    expect(html).not.toMatch(/<td>[^<]*\b(PASS|APPROVED)\b/);
  });
});
