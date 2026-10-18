// @vitest-environment jsdom
import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {webcrypto} from 'node:crypto';
import {TextEncoder} from 'node:util';
import {afterEach, expect, it, vi} from 'vitest';
import {defaults} from '../src/domain';
import {fromLegacy} from '../src/domain/workflowV07/model';
import {WorkflowV07Output} from '../src/components/WorkflowV07Output';
import {defaultTitleBlock} from '../src/domain/titleBlock';

afterEach(() => vi.unstubAllGlobals());

it('renders results/drawings output from one v0.7 snapshot identity', async () => {
  vi.stubGlobal('crypto', webcrypto); vi.stubGlobal('TextEncoder', TextEncoder);
  (globalThis as unknown as {IS_REACT_ACT_ENVIRONMENT: boolean}).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div'), root = createRoot(host);
  try {
    const model = {...fromLegacy({...defaults, shape: 'RECTANGLE', width: 2000, length: 2000, height: 1000}, 'B-SNAPSHOT'), elementType: 'BEAM' as const, revisionId: 'REV-SNAPSHOT'};
    const props = {model, project: 'Test Project', code: 'TEST', caseName: 'Beam A', titleBlock: defaultTitleBlock(), canEdit: false, onTitleBlockChange: vi.fn()};
    await act(async () => root.render(<WorkflowV07Output {...props} mode="report"/>));
    await vi.waitFor(() => expect(host.textContent).toContain('Design Revision: REV-SNAPSHOT'));
    expect(host.textContent).toContain('รายงานจาก Snapshot v0.7');
    expect(host.textContent).toContain('DRAFT / NO_GO');
    expect(host.textContent).toContain('snapshot hash:');
    const snapshotHash = host.textContent?.match(/snapshot hash: ([a-f0-9]{64})/i)?.[1];
    expect(snapshotHash).toMatch(/^[a-f0-9]{64}$/i);

    await act(async () => root.render(<WorkflowV07Output {...props} mode="drawings"/>));
    await vi.waitFor(() => expect(host.querySelectorAll('.a3-page').length).toBeGreaterThan(0));
    expect(host.querySelectorAll('.a3-page')).toHaveLength(8);
    expect(host.textContent).toContain('Design Revision: REV-SNAPSHOT');
    expect(host.textContent).toContain(snapshotHash);
    expect(host.textContent).toContain('SNAPSHOT SHA-256');
    expect(host.textContent).toContain('NOT FOR CONSTRUCTION');
  } finally {await act(async () => root.unmount()); host.remove();}
});
