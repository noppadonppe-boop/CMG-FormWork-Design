// @vitest-environment jsdom
import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {webcrypto} from 'node:crypto';
import {TextEncoder} from 'node:util';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {defaults} from '../src/domain';
import WorkflowV07Panel from '../src/components/WorkflowV07Panel';
import {fromLegacy, previewWorkflow} from '../src/domain/workflowV07/model';
import {classifyBlocker, outstandingRegister, STEP_GROUPS, wizardSteps} from '../src/domain/workflowV07/register';

afterEach(() => vi.unstubAllGlobals());

describe('outstanding-information register and wizard steps', () => {
  it('classifies blocker codes by component, ignoring entity prefixes, and never drops or merges a blocker', () => {
    expect(classifyBlocker('F1/W1/S1:TIE_CLAMP_OR_END_RESTRAINT_NOT_MODELED')).toBe('SIDE');
    expect(classifyBlocker('SOFFIT_PLYWOOD_EVIDENCE_REQUIRED')).toBe('SOFFIT');
    expect(classifyBlocker('FRAME_FIRST_ORDER_DEMANDS_ONLY_SECOND_ORDER_AND_STABILITY_REQUIRED')).toBe('SHORING');
    expect(classifyBlocker('STAGE-2:LOAD_CASE_BOOK_REQUIRED')).toBe('CASES');
    expect(classifyBlocker('SUPPORT_LAYOUT_REQUIRED')).toBe('SUPPORT');
    expect(classifyBlocker('UNKNOWN_SLAB_THICKNESS')).toBe('GEOMETRY');
    expect(classifyBlocker('ENGINEERING_CAPACITY_METHODS')).toBe('REVIEW');
    expect(classifyBlocker('SOMETHING_ELSE')).toBe('GENERAL');
    const blockers = ['A:X_TIE', 'A:X_TIE', 'FRAME_Y', 'Z'], register = outstandingRegister(blockers);
    expect(register.total).toBe(3);
    expect(register.rows.map(r => r.blocker)).toEqual(['A:X_TIE', 'FRAME_Y', 'Z']);
    expect(Object.values(register.counts).reduce((a, b) => a + b, 0)).toBe(register.total);
  });
  it('orders steps along each system load path and covers every register group exactly once', () => {
    expect(wizardSteps('SLAB')).toEqual(['GEOMETRY', 'SOFFIT', 'SHORING', 'SUPPORT', 'CASES', 'REVIEW']);
    expect(wizardSteps('BEAM')).toEqual(['GEOMETRY', 'SOFFIT', 'SIDE', 'SHORING', 'SUPPORT', 'CASES', 'REVIEW']);
    for (const t of ['FOOTING', 'COLUMN', 'WALL'] as const) expect(wizardSteps(t)).toEqual(['GEOMETRY', 'SIDE', 'SHORING', 'SUPPORT', 'CASES', 'REVIEW']);
    const groups = Object.values(STEP_GROUPS).flat();
    expect(new Set(groups).size).toBe(groups.length); expect(groups.sort()).toEqual(['CASES', 'GENERAL', 'GEOMETRY', 'REVIEW', 'SHORING', 'SIDE', 'SOFFIT', 'SUPPORT']);
  });
  it('every real preview blocker lands in a group that some step displays', () => {
    const model = fromLegacy(defaults, 'F1'), preview = previewWorkflow(model);
    expect(preview.blockers.length).toBeGreaterThan(0);
    const shown = new Set(Object.values(STEP_GROUPS).flat());
    for (const b of preview.blockers) expect(shown.has(classifyBlocker(b))).toBe(true);
  });
});

it('panel shows the wizard with per-step missing counts and keeps hidden steps mounted', async () => {
  vi.stubGlobal('crypto', webcrypto); vi.stubGlobal('TextEncoder', TextEncoder);
  (globalThis as unknown as {IS_REACT_ACT_ENVIRONMENT: boolean}).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div'), root = createRoot(host);
  document.body.append(host);
  try {
    await act(async () => root.render(<WorkflowV07Panel input={{...defaults}} caseId="B1" initialElementType="BEAM"/>));
    const nav = host.querySelector('nav.wizard-steps')!, buttons = Array.from(nav.querySelectorAll('button'));
    expect(buttons.map(b => b.textContent?.split('.')[0])).toEqual(['1', '2', '3', '4', '5', '6', '7']);
    expect(buttons[1].textContent).toContain('แบบท้อง');
    expect(host.textContent).toContain('ทะเบียนข้อมูลที่ยังขาด');
    const stepPanels = Array.from(host.querySelectorAll('section.workflow-v07 > div[hidden]'));
    expect(stepPanels.length).toBe(6); // all but the active step are hidden, not unmounted
    await act(async () => buttons[6].click());
    expect(buttons[6].getAttribute('aria-current')).toBe('step');
    expect(Array.from(host.querySelectorAll('section.workflow-v07 > div[hidden]')).length).toBe(6);
  } finally {await act(async () => root.unmount()); host.remove();}
});
