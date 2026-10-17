// @vitest-environment jsdom
import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {webcrypto} from 'node:crypto';
import {TextEncoder} from 'node:util';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {defaults} from '../src/domain';
import WorkflowV07Panel from '../src/components/WorkflowV07Panel';
import {WORKFLOW_VERSION} from '../src/domain/workflowV07/common';
import {fromLegacy, previewWorkflow, regenerateDraftLayouts} from '../src/domain/workflowV07/model';
import {createStoredWorkflowDraft, parseStoredWorkflowDraft, restoreWorkflowDraft, type StoredWorkflowDraft} from '../src/domain/workflowV07/storage';
import {stampSideLayout} from '../src/domain/workflowV07/sideLayout';
import {sideDefinition, sideModel} from './fixtures/workflow-v07-side';

afterEach(() => vi.unstubAllGlobals());
function cryptoSetup() {vi.stubGlobal('crypto', webcrypto); vi.stubGlobal('TextEncoder', TextEncoder);}

describe('stored v0.7 drafts', () => {
  it('round-trips a model with stamped layouts through JSON and keeps every analysis recomputable', () => {
    cryptoSetup();
    const model = sideModel(), applied = regenerateDraftLayouts(model, {sideLayout: stampSideLayout(model, sideDefinition())});
    const draft = createStoredWorkflowDraft(applied, defaults, 1700000000000);
    const restored = parseStoredWorkflowDraft(JSON.parse(JSON.stringify(draft)));
    expect(restored.engineVersion).toBe(WORKFLOW_VERSION);
    expect(restored.model).toEqual(applied);
    const {model: same, staleEngine, sourceChanged} = restoreWorkflowDraft(restored, defaults);
    expect(staleEngine).toBe(false); expect(sourceChanged).toBe(false);
    expect(same.revisionId).toBe(applied.revisionId);
    expect(previewWorkflow(same).side).not.toBeNull();
  });
  it('marks drafts from another engine stale with a new revision so stamped layouts must be re-analysed', () => {
    cryptoSetup();
    const model = sideModel(), applied = regenerateDraftLayouts(model, {sideLayout: stampSideLayout(model, sideDefinition())});
    const old: StoredWorkflowDraft = {...createStoredWorkflowDraft(applied, defaults), engineVersion: '0.7.0-preview.1'};
    const {model: stale, staleEngine} = restoreWorkflowDraft(old, defaults, () => 'REV-NEW');
    expect(staleEngine).toBe(true);
    expect(stale.revisionId).toBe('REV-NEW');
    expect(stale.sideLayout).toEqual(applied.sideLayout);
    expect(previewWorkflow(stale).side).toBeNull();
    expect(previewWorkflow(stale).blockers.some(b => /STALE|revision/i.test(b))).toBe(true);
    const fresh = regenerateDraftLayouts(stale, {}, {allowIncomplete: true});
    expect(previewWorkflow(fresh).side).not.toBeNull();
  });
  it('reports a changed legacy source and rejects malformed or authority-bearing drafts', () => {
    cryptoSetup();
    const draft = createStoredWorkflowDraft(fromLegacy(defaults, 'F1'), defaults);
    expect(restoreWorkflowDraft(draft, {...defaults, width: 3500}).sourceChanged).toBe(true);
    expect(() => parseStoredWorkflowDraft({...draft, extra: 1})).toThrow(/fields/);
    expect(() => parseStoredWorkflowDraft({...draft, schemaVersion: 'other'})).toThrow();
    expect(() => parseStoredWorkflowDraft({...draft, model: {...draft.model, constructionEligible: true}})).toThrow(/authority/);
  });
});

it('panel restores a saved draft instead of the legacy seed and persists edits once, with a visible save state', async () => {
  cryptoSetup();
  (globalThis as unknown as {IS_REACT_ACT_ENVIRONMENT: boolean}).IS_REACT_ACT_ENVIRONMENT = true;
  const saved = createStoredWorkflowDraft({...fromLegacy(defaults, 'W1'), elementType: 'WALL', designBasisRef: 'SYNTHETIC saved basis'}, defaults, 1700000000000);
  const persisted: StoredWorkflowDraft[] = [];
  const host = document.createElement('div'), root = createRoot(host);
  document.body.append(host);
  try {
    await act(async () => root.render(<WorkflowV07Panel input={{...defaults}} caseId="W1" initialElementType="WALL" stored={saved} onPersist={d => {persisted.push(d);}}/>));
    expect((host.querySelector('select') as HTMLSelectElement).value).toBe('WALL');
    expect(host.textContent).toContain('บันทึกร่างแล้ว');
    expect(host.textContent).not.toContain('stale');
    await new Promise(r => setTimeout(r, 900));
    expect(persisted).toHaveLength(0); // restoring is not a change
    const basis = Array.from(host.querySelectorAll('input')).find(i => i.value === 'SYNTHETIC saved basis')!;
    expect(basis).toBeTruthy();
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    await act(async () => {setter.call(basis, 'SYNTHETIC edited basis'); basis.dispatchEvent(new Event('input', {bubbles: true}));});
    await vi.waitFor(() => expect(persisted).toHaveLength(1), {timeout: 3000});
    expect(persisted[0].engineVersion).toBe(WORKFLOW_VERSION);
    expect(persisted[0].model.designBasisRef).toBe('SYNTHETIC edited basis');
    expect(persisted[0].model.elementType).toBe('WALL');
    await vi.waitFor(() => expect(host.textContent).toContain('บันทึกร่างแล้ว'));
  } finally {await act(async () => root.unmount()); host.remove();}
});

it('panel shows the stale-engine warning and does not save until the user acts; read-only mode never persists', async () => {
  cryptoSetup();
  (globalThis as unknown as {IS_REACT_ACT_ENVIRONMENT: boolean}).IS_REACT_ACT_ENVIRONMENT = true;
  const old: StoredWorkflowDraft = {...createStoredWorkflowDraft(fromLegacy(defaults, 'F1'), defaults), engineVersion: '0.7.0-preview.1'};
  const persisted: StoredWorkflowDraft[] = [];
  const host = document.createElement('div'), root = createRoot(host);
  try {
    await act(async () => root.render(<WorkflowV07Panel input={{...defaults}} caseId="F1" stored={old} canPersist={false} onPersist={d => {persisted.push(d);}}/>));
    expect(host.textContent).toContain('0.7.0-preview.1');
    expect(host.textContent).toContain('สิทธิ์ดูอย่างเดียว');
    const button = Array.from(host.querySelectorAll('button')).find(b => b.textContent?.includes('คำนวณ Layout ทั้งหมดใหม่'))!;
    await act(async () => button.click());
    await new Promise(r => setTimeout(r, 900));
    expect(persisted).toHaveLength(0);
  } finally {await act(async () => root.unmount());}
});
