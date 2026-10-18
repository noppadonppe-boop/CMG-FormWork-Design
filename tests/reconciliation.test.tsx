import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe, expect, it} from 'vitest';
import {ReconciliationPanel} from '../src/components/ReconciliationPanel';
import {buildReconciliationDecisionTemplate, buildReconciliationRows, parseReconciliationDecisionTemplate, reconciliationReadyForOwner} from '../src/domain/reconciliation';

describe('case reconciliation intake', () => {
  it('creates explicit allowed decisions for duplicate names and prefix/type conflicts', () => {
    const rows = buildReconciliationRows([
      {id: 'f1', name: 'F01 · ฐานราก', storedType: 'WALL'},
      {id: 'b1', name: 'B02 · คาน', storedType: 'BEAM'},
      {id: 'b2', name: 'B02 · คาน', storedType: 'SLAB'},
    ]);
    expect(rows[0].allowed).toContain('USE_NAME_SUGGESTED_TYPE');
    expect(rows[0].nameSuggestedType).toBe('FOOTING');
    expect(rows[1].allowed).toEqual(expect.arrayContaining(['KEEP', 'RENAME', 'MERGE_AFTER_DOCUMENT_REVIEW']));
    expect(rows[2].allowed).toEqual(expect.arrayContaining(['KEEP', 'RENAME', 'MERGE_AFTER_DOCUMENT_REVIEW']));
    expect(rows.every(row => row.decision === null)).toBe(true);
  });

  it('keeps exported decisions non-mutating until all owner controls are present', () => {
    const rows = buildReconciliationRows([{id: 'f1', name: 'F01', storedType: 'FOOTING'}]).map(row => ({...row, decision: 'KEEP' as const}));
    const template = buildReconciliationDecisionTemplate({projectId: 'p', projectCode: 'CMG-001', sourceBackup: 'backup.json', owner: 'Owner', rows, approvedBy: 'Engineer', approvedAt: '2026-10-18T10:00:00.000Z', reason: 'verified against source drawings', newBackupBeforeWrite: true});
    expect(reconciliationReadyForOwner(template)).toBe(true);
    expect(template.apply.applyToProduction).toBe(false);
    const parsed = parseReconciliationDecisionTemplate(template, 'p', rows);
    expect(parsed.rows[0].decision).toBe('KEEP');
    expect(renderToStaticMarkup(<ReconciliationPanel projectId="p" projectCode="CMG-001" cases={[{id: 'f1', name: 'F01', storedType: 'FOOTING'}]} canEdit/>)).toContain('Export decision template');
  });

  it('rejects a template that attempts to enable production apply', () => {
    const rows = buildReconciliationRows([{id: 'f1', name: 'F01', storedType: 'FOOTING'}]);
    const template = buildReconciliationDecisionTemplate({projectId: 'p', projectCode: 'CMG-001', sourceBackup: 'backup.json', owner: null, rows, approvedBy: null, approvedAt: null, reason: null, newBackupBeforeWrite: false});
    expect(() => parseReconciliationDecisionTemplate({...template, apply: {...template.apply, applyToProduction: true}}, 'p', rows)).toThrow(/applyToProduction/);
  });
});
