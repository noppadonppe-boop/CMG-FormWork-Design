import {expect, it} from 'vitest';
import {auditCaseIdentities, inspectCaseIdentity, suggestedElementTypeFromName} from '../src/domain/caseIntegrity';

it('maps an explicit case name prefix to an element type without guessing arbitrary names', () => {
  expect(suggestedElementTypeFromName('F01 · ฐานราก')).toBe('FOOTING');
  expect(suggestedElementTypeFromName('B02 คาน')).toBe('BEAM');
  expect(suggestedElementTypeFromName('misc case')).toBeUndefined();
});

it('detects a saved v0.7 draft whose element type differs from the case', () => {
  const issues = inspectCaseIdentity({id: 'f1', name: 'F01 · ฐานราก', workflowElementType: 'WALL', workflowV07: {model: {elementType: 'BEAM'}}, input: {kind: 'FOOTING'}, wall: {}});
  expect(issues.map(x => x.code)).toContain('STORED_DRAFT_TYPE_MISMATCH');
});

it('detects a name prefix that disagrees with the stored element type', () => {
  const issues = inspectCaseIdentity({id: 'f1', name: 'F01 · ฐานราก', workflowElementType: 'WALL', input: {kind: 'FOOTING'}, wall: {}});
  expect(issues.map(x => x.code)).toContain('NAME_PREFIX_TYPE_MISMATCH');
});

it('does not flag legacy FOOTING input for a practical beam case when the explicit workflow type is present', () => {
  const issues = inspectCaseIdentity({id: 'b1', name: 'B01 · คาน', workflowElementType: 'BEAM', input: {kind: 'FOOTING'}, beam: {}});
  expect(issues).toEqual([]);
});

it('reports duplicate ids and names without changing case data', () => {
  const audit = auditCaseIdentities([
    {id: 'c1', name: 'B01', workflowElementType: 'BEAM', input: {kind: 'FOOTING'}, beam: {}},
    {id: 'c1', name: 'B01', workflowElementType: 'BEAM', input: {kind: 'FOOTING'}, beam: {}},
  ]);
  expect(audit.duplicateIds).toEqual(['c1']);
  expect(audit.duplicateNames).toEqual(['b01']);
  expect(audit.byCase.c1.map(x => x.code)).toEqual(expect.arrayContaining(['DUPLICATE_CASE_ID', 'DUPLICATE_CASE_NAME']));
});
