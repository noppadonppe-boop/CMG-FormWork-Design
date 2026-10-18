// @vitest-environment jsdom
import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {webcrypto} from 'node:crypto';
import {TextEncoder} from 'node:util';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {ClosureInputEditor} from '../src/components/ClosureInputEditor';
import WorkflowV07Panel from '../src/components/WorkflowV07Panel';
import {defaults} from '../src/domain';
import {closureReferences} from '../src/closurePackReferences';
import type {ClosureProjectInputTemplate} from '../src/domain/workflowV07/closurePack';
import {fromLegacy, parseWorkflowModel, previewWorkflow} from '../src/domain/workflowV07/model';

const baselines = {
  ringlock_configuration: closureReferences.templates.ringlockConfiguration,
  support_soil: closureReferences.templates.supportSoil,
  support_slab: closureReferences.templates.supportSlab,
  serviceability: closureReferences.templates.serviceability,
  stage_release: closureReferences.templates.stageRelease,
};
const context = {projectId: 'PROJECT-1', revisionId: 'REV-1', designSnapshotHash: null, activeStageId: 'STAGE-1', capturedStageId: 'STAGE-1', loadCaseId: 'LC-1'};
afterEach(() => {vi.restoreAllMocks(); vi.unstubAllGlobals();});

describe('project evidence input editor', () => {
  it('round-trips editable evidence packets inside the saved workflow draft model', () => {
    const template = {...structuredClone(baselines.support_soil), context};
    const model = fromLegacy(defaults, 'CASE-1'), parsed = parseWorkflowModel({...model, closureInputs: [template]});
    const restored = parseWorkflowModel(JSON.parse(JSON.stringify(parsed)));
    expect(restored.closureInputs).toEqual([template]);
    expect(() => parseWorkflowModel({...restored, closureInputs: [template, template]})).toThrow(/Duplicate Closure/);
  });

  it('lets an engineer fill Ringlock values and saves them bound to the current draft as unverified evidence', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const host = document.createElement('div'), root = createRoot(host), onSave = vi.fn(), onRebind = vi.fn(); document.body.append(host);
    try {
      await act(async () => root.render(<ClosureInputEditor templates={[]} baselines={baselines} context={context} currentRevisionId="REV-1" onSave={onSave} onRebind={onRebind}/>));
      const ringlock = Array.from(host.querySelectorAll('details')).find(row => row.querySelector('summary')?.textContent?.includes('Ringlock'))!;
      const manufacturer = ringlock.querySelector<HTMLInputElement>('input[aria-label="ผู้ผลิต"]')!;
      await act(async () => {Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(manufacturer, 'Project Supplier'); manufacturer.dispatchEvent(new Event('input', {bubbles: true}));});
      const save = Array.from(ringlock.querySelectorAll('button')).find(button => button.textContent === 'บันทึกร่างกับ Case นี้')!;
      await act(async () => save.click());
      const saved = onSave.mock.calls[0][0] as ClosureProjectInputTemplate;
      expect(saved.form_type).toBe('ringlock_configuration');
      expect(saved.inputs.manufacturer).toBe('Project Supplier');
      expect(saved.context).toEqual(context);
      expect(saved.review.trustedVerificationStatus).toBe('NOT_VERIFIED');
      expect(saved.confirmed).toBe(false);
      expect(saved.constructionRelease).toBe('NO_GO');
    } finally {await act(async () => root.unmount()); host.remove();}
  });

  it('offers two sourced Ringlock profiles and switches edited preset values to Custom without importing a capacity', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const host = document.createElement('div'), root = createRoot(host); document.body.append(host);
    try {
      await act(async () => root.render(<ClosureInputEditor templates={[]} baselines={baselines} context={context} currentRevisionId="REV-1" onSave={vi.fn()} onRebind={vi.fn()}/>));
      const ringlock = Array.from(host.querySelectorAll('details.closure-input-form')).find(row => row.querySelector('summary')?.textContent?.includes('Ringlock'))!;
      const preset = ringlock.querySelector<HTMLSelectElement>('select[aria-label="เลือกระบบ Ringlock ตั้งต้น"]')!;
      await act(async () => {preset.value = 'DOKA_RINGLOCK_2020'; preset.dispatchEvent(new Event('change', {bubbles: true}));});
      expect((ringlock.querySelector('input[aria-label="ผู้ผลิต"]') as HTMLInputElement).value).toBe('Doka / AT-PAC');
      expect(ringlock.textContent).toContain('Compression kN'); expect(ringlock.textContent).toContain('62');
      expect((ringlock.querySelector('textarea[aria-label="กำลังต่อจุด (JSON array)"]') as HTMLTextAreaElement).value).toBe('[]');
      await act(async () => {preset.value = 'CORONET_RINGLOCK_2024'; preset.dispatchEvent(new Event('change', {bubbles: true}));});
      expect((ringlock.querySelector('input[aria-label="ผู้ผลิต"]') as HTMLInputElement).value).toBe('Coronet Scaffold');
      expect(ringlock.textContent).toContain('Safe Axial Load kN'); expect(ringlock.textContent).toContain('65'); expect(ringlock.textContent).toContain('28');
      expect((ringlock.querySelector('textarea[aria-label="กำลังต่อจุด (JSON array)"]') as HTMLTextAreaElement).value).toBe('[]');
      await act(async () => {preset.value = 'TCB_RINGLOCK'; preset.dispatchEvent(new Event('change', {bubbles: true}));});
      expect((ringlock.querySelector('input[aria-label="ผู้ผลิต"]') as HTMLInputElement).value).toBe('T.C.B. Home Center Co., Ltd.');
      expect(ringlock.textContent).toContain('OD 48.3 x 2.75 mm'); expect(ringlock.textContent).toContain('ไม่พบกำลังเสา');
      const manufacturer = ringlock.querySelector<HTMLInputElement>('input[aria-label="ผู้ผลิต"]')!;
      await act(async () => {Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(manufacturer, 'Project Custom System'); manufacturer.dispatchEvent(new Event('input', {bubbles: true}));});
      expect(preset.value).toBe('CUSTOM');
      expect((ringlock.querySelector('input[aria-label="ผู้ผลิต"]') as HTMLInputElement).value).toBe('Project Custom System');
      expect((ringlock.querySelector('textarea[aria-label="กำลังต่อจุด (JSON array)"]') as HTMLTextAreaElement).value).toBe('[]');
    } finally {await act(async () => root.unmount()); host.remove();}
  });

  it('keeps a saved project packet visibly stale after the design revision changes', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const saved: ClosureProjectInputTemplate = {...structuredClone(baselines.support_slab), context};
    expect(saved.form_type).toBe('support_slab');
    const host = document.createElement('div'), root = createRoot(host); document.body.append(host);
    try {
      await act(async () => root.render(<ClosureInputEditor templates={[saved]} baselines={baselines} context={{...context, revisionId: 'REV-2'}} currentRevisionId="REV-2" onSave={vi.fn()} onRebind={vi.fn()}/>));
      const slab = Array.from(host.querySelectorAll('details')).find(row => row.querySelector('summary')?.textContent?.includes('พื้นคอนกรีต'))!;
      expect(slab.querySelector('summary')?.textContent).toContain('Revision เก่า');
      expect(slab.textContent).toContain('Revision: REV-1');
      expect(Array.from(slab.querySelectorAll('button')).find(button => button.textContent === 'ผูกกับ Revision ปัจจุบัน')?.disabled).toBe(false);
    } finally {await act(async () => root.unmount()); host.remove();}
  });

  it('persists the saved project packet from the actual workflow panel and binds it to the new revision', async () => {
    vi.stubGlobal('crypto', webcrypto); vi.stubGlobal('TextEncoder', TextEncoder); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const host = document.createElement('div'), root = createRoot(host), persisted = vi.fn(); document.body.append(host);
    try {
      await act(async () => root.render(<WorkflowV07Panel input={{...defaults}} caseId="CLOSURE-PERSIST" onPersist={persisted}/>));
      const review = Array.from(host.querySelectorAll('nav.wizard-steps button')).at(-1)!;
      await act(async () => review.click());
      const ringlock = Array.from(host.querySelectorAll('.closure-input-form')).find(row => row.querySelector('summary')?.textContent?.includes('Ringlock'))!;
      const manufacturer = ringlock.querySelector<HTMLInputElement>('input[aria-label="ผู้ผลิต"]')!;
      await act(async () => {Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(manufacturer, 'Editable Site Stock'); manufacturer.dispatchEvent(new Event('input', {bubbles: true}));});
      await act(async () => Array.from(ringlock.querySelectorAll('button')).find(button => button.textContent === 'บันทึกร่างกับ Case นี้')!.click());
      await act(async () => {await new Promise(resolve => setTimeout(resolve, 800));});
      expect(persisted).toHaveBeenCalledTimes(1);
      const savedModel = persisted.mock.calls[0][0].model;
      expect(savedModel.closureInputs[0].inputs.manufacturer).toBe('Editable Site Stock');
      expect(savedModel.closureInputs[0].context.revisionId).toBe(savedModel.revisionId);
      expect(savedModel.closureInputs[0].review.trustedVerificationStatus).toBe('NOT_VERIFIED');
      expect(previewWorkflow(savedModel).constructionRelease).toBe('NO_GO');
    } finally {await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals();}
  });
});
