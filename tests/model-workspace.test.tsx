// @vitest-environment jsdom
import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {expect, it, vi} from 'vitest';
import {calculate, defaults} from '../src/domain';
import {ModelWorkspace} from '../src/components/ModelWorkspace';

it('renders the 3D model, quantities and undo for AI edits', async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div'), root = createRoot(host), onUndo = vi.fn();
  document.body.append(host);
  try {
    await act(async () => root.render(<ModelWorkspace caseName="F01" result={calculate(defaults)} error={null} history={[{note: 'ลึก 1200', at: 0}]} canEdit onUndo={onUndo} onEditGeometry={vi.fn()}/>));
    expect(host.querySelectorAll('.model3d-canvas path').length).toBeGreaterThan(100);
    expect(host.textContent).toMatch(/Tie rod\d+ เส้น/);
    expect(host.textContent).toContain('ลึก 1200');
    const tie = host.querySelectorAll<HTMLInputElement>('.model3d-layers input')[4], before = host.querySelectorAll('.model3d-canvas path').length;
    await act(async () => tie.click());
    expect(host.querySelectorAll('.model3d-canvas path').length).toBeLessThan(before);
    await act(async () => Array.from(host.querySelectorAll('button')).find(b => b.textContent?.includes('ย้อนการแก้ล่าสุด'))!.click());
    expect(onUndo).toHaveBeenCalledOnce();
  } finally {await act(async () => root.unmount()); host.remove();}
});
