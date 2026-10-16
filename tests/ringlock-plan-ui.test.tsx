// @vitest-environment jsdom
import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {expect, it} from 'vitest';
import {defaults} from '../src/domain';
import WorkflowV07Panel from '../src/components/WorkflowV07Panel';

it('initializes beam/slab plans at 1.20 × 1.50 and updates dimensions and aligned heads for all five options', async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div'), root = createRoot(host);
  document.body.append(host);
  const field = (text: string) => Array.from(host.querySelectorAll('label')).find(l => l.querySelector('span')?.textContent === text)!.querySelector('select')!;
  const change = async (select: HTMLSelectElement, value: string) => {
    await act(async () => {select.value = value; select.dispatchEvent(new Event('change', {bubbles: true}));});
  };
  try {
    await act(async () => root.render(<WorkflowV07Panel input={defaults} caseId="S1"/>));
    expect(host.querySelector('.ringlock-plan')).toBeNull();
    await change(field('ประเภทองค์อาคาร'), 'BEAM');
    const dropdown = field('ขนาดแปลน Ringlock (X × Y)');
    expect(dropdown.value).toBe('1200x1500');
    expect(Array.from(dropdown.options).map(o => o.value)).toEqual(['900x900', '900x1200', '1200x1200', '1200x1500', '1500x1500']);
    for (const option of dropdown.options) {
      await change(dropdown, option.value);
      const [x, y] = option.value.split('x').map(Number);
      const drawing = host.querySelector('.ringlock-plan svg')!;
      const supports = Array.from(drawing.querySelectorAll('[data-support-x-mm]')).map(n => [Number(n.getAttribute('data-support-x-mm')), Number(n.getAttribute('data-support-y-mm'))]);
      expect(supports).toEqual([[0, y], [0, 0], [x, y], [x, 0]]);
      expect(drawing.getAttribute('aria-label')).toContain(`X ${(x / 1000).toFixed(2)} ม. Y ${(y / 1000).toFixed(2)} ม.`);
      expect(host.querySelector('.ringlock-plan')!.textContent).toContain(`ช่วงรองรับคานรับตง ${(x / 1000).toFixed(2)} ม.`);
      expect(host.querySelector('.ringlock-plan')!.textContent).toContain(`ช่วงพาดตงระหว่างแนวคาน ${(y / 1000).toFixed(2)} ม.`);
      expect(host.querySelector('.ringlock-plan')!.textContent).toContain('คานรับตง: ตามแกน X');
    }
    await change(field('ประเภทองค์อาคาร'), 'SLAB');
    expect(field('ขนาดแปลน Ringlock (X × Y)').value).toBe('1500x1500');
    await change(field('ประเภทองค์อาคาร'), 'FOOTING');
    expect(host.querySelector('.ringlock-plan')).toBeNull();
    await act(async () => root.render(<WorkflowV07Panel input={defaults} caseId="S2"/>));
    await change(field('ประเภทองค์อาคาร'), 'SLAB');
    expect(field('ขนาดแปลน Ringlock (X × Y)').value).toBe('1200x1500');
  } finally {await act(async () => root.unmount()); host.remove();}
});
