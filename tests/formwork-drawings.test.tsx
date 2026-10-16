// @vitest-environment jsdom
import React, {act, useState} from 'react';
import {defaultTitleBlock, type TitleBlock} from '../src/domain/titleBlock';
import {createRoot} from 'react-dom/client';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe, expect, it, vi} from 'vitest';
import {calculate, defaults, type Input} from '../src/domain';
import {buildFormworkLayout, walerExtensions} from '../src/domain/formworkLayout';
import {fitScale} from '../src/drawing/primitives';
import {DrawingSet} from '../src/components/DrawingSet';

const column: Input = {...defaults, kind: 'COLUMN', width: 600, length: 800, height: 3500, studSpacing: 250, walerSpacing: 600, tieSpacing: 600};
const lshape: Input = {...defaults, shape: 'L', width: 4000, length: 3000, armX: 2000, armY: 1500};

describe('formwork layout model', () => {
  it('derives studs, waler levels, through ties and BOM consistently with the engine', () => {
    const r = calculate(defaults), L = buildFormworkLayout(r);
    expect(L.levels).toHaveLength(r.waler.levels.length);
    expect(L.faces.map(f => f.studs.length)).toEqual(r.faces.map(f => Math.ceil(f.length / defaults.studSpacing - 1e-9) + 1));
    const tiesX = L.faces[0].ties.length, tiesY = L.faces[1].ties.length;
    expect(L.ties).toHaveLength((tiesX + tiesY) * L.levels.length);
    expect(L.ties.every(t => t.length === (t.axis === 'Y' ? defaults.length : defaults.width) + 2 * (L.offsets.outer + 50))).toBe(true);
    const row = (item: string) => L.bom.filter(b => b.item.startsWith(item));
    expect(row('คร่าว')[0]).toMatchObject({qty: L.faces.reduce((n, f) => n + f.studs.length, 0), cutLength: defaults.height});
    expect(row('คานคู่').reduce((n, b) => n + b.qty!, 0)).toBe(4 * 2 * L.levels.length);
    expect(row('Tie rod').reduce((n, b) => n + b.qty!, 0)).toBe(L.ties.length);
    // Face grain across studs: sheets laid horizontally (2440 along the face, 1220 high): faces 3000 → 2, 4000 → 2 across; 2500 high → 3 rows.
    expect(row('ไม้อัด')[0].qty).toBe(2 * (2 + 2) * 3);
    expect(buildFormworkLayout(calculate({...defaults, plywoodFaceGrain: 'PARALLEL'})).bom.find(b => b.item.startsWith('ไม้อัด'))!.qty).toBe(2 * (3 + 4) * 2);
  });
  it('uses corner yokes instead of through ties for columns', () => {
    const L = buildFormworkLayout(calculate(column));
    expect(L.tie).toBeNull();
    expect(L.ties).toEqual([]);
    expect(L.bom.find(b => b.item.includes('Corner yoke'))?.qty).toBe(4 * L.levels.length);
  });
  it('stops walers short of the re-entrant corner of an L shape', () => {
    const L = buildFormworkLayout(calculate(lshape));
    const ext = walerExtensions(L.points, 220, 220);
    expect(ext.map(e => [e.start, e.end])).toEqual([[220, 220], [220, 220], [220, -220], [-220, 220], [220, 220], [220, 220]]);
    expect(L.faces[2].extEnd).toBe(-L.offsets.outer);
  });
  it('picks the smallest standard scale that fits', () => {
    expect(fitScale(3580, 4580, 226, 172)).toBe(30);
    expect(fitScale(100, 100, 50, 50)).toBe(2);
  });
});

describe('A3 drawing set', () => {
  it.each([['footing', defaults], ['column', column], ['L footing', lshape]] as const)('renders four titled A3 sheets for %s', (_, input) => {
    const html = renderToStaticMarkup(<DrawingSet result={calculate(input)} project="โครงการทดสอบ" code="CMG-001" caseName="F01" titleBlock={defaultTitleBlock("วิศวกร")} onTitleBlockChange={() => undefined}/>);
    const sheets = html.match(/<svg[^>]*class="a3-sheet"[\s\S]*?<\/svg>/g)!;
    expect(sheets).toHaveLength(4);
    for (const s of sheets) {
      expect(s).toContain('viewBox="0 0 420 297"');
      expect(s).toContain('CMG ENGINEERING &amp; CONSTRUCTION');
      expect(s).toContain('PRELIMINARY – NOT FOR CONSTRUCTION');
      expect(s).toContain('CMG-001');
      expect(s).not.toMatch(/NaN|Infinity|undefined/);
    }
    expect(sheets.map(s => s.match(/FW-0\d/)?.[0])).toEqual(['FW-01', 'FW-02', 'FW-03', 'FW-04']);
    expect(sheets[0]).toContain('แปลนแบบหล่อ (FORMWORK PLAN)');
    expect(sheets[1]).toContain('รูปตัด A-A');
    expect(sheets[3]).toContain('ตารางวัสดุ (BILL OF MATERIALS)');
    expect(sheets[0]).toMatch(/มาตราส่วน 1:\d+/);
  });
  it('fills the title block from inputs and prints through the A3 page mode', async () => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    const host = document.createElement('div'), root = createRoot(host), print = vi.spyOn(window, 'print').mockImplementation(() => {
      expect(document.body.classList.contains('print-a3')).toBe(true);
    });
    document.body.append(host);
    try {
      let saved: TitleBlock | null = null;
      function Harness() {
        const [tb, setTb] = useState(defaultTitleBlock('สมชาย'));
        return <DrawingSet result={calculate(defaults)} project="P" code="C" caseName="F01" titleBlock={tb} onTitleBlockChange={v => {saved = v; setTb(v);}}/>;
      }
      await act(async () => root.render(<Harness/>));
      const type = async (el: HTMLInputElement, value: string) => act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value);
        el.dispatchEvent(new Event('input', {bubbles: true}));
      });
      await type(Array.from(host.querySelectorAll<HTMLInputElement>('.a3-controls input'))[4], 'วิศวกรตรวจ');
      expect(host.querySelector('.a3-sheet')?.textContent).toContain('วิศวกรตรวจ');
      expect(host.querySelector('.a3-sheet')?.textContent).toContain('สมชาย');
      expect(saved).toMatchObject({checkedBy: 'วิศวกรตรวจ'});
      await type(host.querySelector<HTMLInputElement>('.revision-note input')!, 'ปรับระยะคร่าว');
      await act(async () => Array.from(host.querySelectorAll('button')).find(b => b.textContent === 'เพิ่ม Rev')!.click());
      expect(saved).toMatchObject({rev: 'B', revisions: [{rev: 'A'}, {rev: 'B', description: 'ปรับระยะคร่าว'}]});
      expect(host.querySelector('.a3-sheet')?.textContent).toContain('ปรับระยะคร่าว');
      await act(async () => Array.from(host.querySelectorAll('button')).find(b => b.textContent?.includes('A3'))!.click());
      expect(print).toHaveBeenCalledOnce();
      window.dispatchEvent(new Event('afterprint'));
      expect(document.body.classList.contains('print-a3')).toBe(false);
    } finally {await act(async () => root.unmount()); host.remove(); print.mockRestore();}
  });
});
