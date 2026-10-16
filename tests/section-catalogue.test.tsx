// @vitest-environment jsdom
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {describe, expect, it} from 'vitest';
import {calculate, defaults, type Input} from '../src/domain';
import {applyChanges} from '../src/domain/scene';
import {optimizeLayout} from '../src/domain/optimize';
import {buildFormworkLayout} from '../src/domain/formworkLayout';
import {FAMILY_LABEL, SECTION_STOCK, TIMBER_GRADES, catalogueProperties, parseSectionStock, sectionById, sectionsFor, stockFor} from '../src/domain/sectionStock';
import {SectionPicker} from '../src/components/SectionPicker';
import pap from '../src/reference/thai-sections/pap-tis107-2026.json';
import sys from '../src/reference/thai-sections/sys-tis1227-2026.json';

describe('Thai section catalogue', () => {
  it('covers the requested stud and waler families', () => {
    expect(sectionsFor('stud').map(s => s.family).filter((f, i, a) => a.indexOf(f) === i).sort()).toEqual(['RHS', 'SHS', 'TIMBER']);
    expect(sectionsFor('waler').map(s => s.family).filter((f, i, a) => a.indexOf(f) === i).sort()).toEqual(['C', 'CHS', 'C_LIP', 'L', 'RHS', 'SHS']);
    expect(sectionById('TIMBER-38x75-ACTUAL')?.designation).toContain('1½″×3″');
    expect(new Set(SECTION_STOCK.map(s => s.id)).size).toBe(SECTION_STOCK.length);
    for (const s of SECTION_STOCK) expect(FAMILY_LABEL[s.family]).toBeTruthy();
  });
  it.each([
    // Values read from the published tables on 2026-10-16: Pacific Pipe catalogue 2026_2 (TIS 107-2566 ค.1 / ข.1 / ก.1, TIS 1228) and SYS Engineer Handbook Edit 6 (TIS 1227-2558).
    ['PAP-TIS107-RHS-100x50x3.2', 8.927, 112, 22.5, 7.01],
    ['PAP-TIS107-SHS-50x50x2.3', 4.252, 15.9, 6.34, 3.34],
    ['PAP-TIS107-CHS-48.6x2.3', 3.345, 8.99, 3.7, 2.63],
    ['SYS-TIS1227-C-100x50x5x7.5', 11.9, 188, 37.6, 9.36],
    ['SYS-TIS1227-L-50x50x5', 4.8, 11, 3.08, 3.77],
    ['PAP-2026-CLIP-100x50x20x2.3', 5.172, 80.7, 16.1, 4.06],
  ])('%s matches the manufacturer table', (id, A, Ix, Sx, kg) => {
    expect(sectionById(id)).toMatchObject({A_cm2: A, Ix_cm4: Ix, Sx_cm3: Sx, kg_per_m: kg});
  });
  it('keeps every extracted row consistent with its own geometry and weight', () => {
    expect(pap.sections.length).toBeGreaterThan(600);
    expect(sys.sections.length).toBeGreaterThan(60);
    for (const s of SECTION_STOCK.filter(s => s.kg_per_m !== null)) expect(Math.abs(s.kg_per_m! / (s.A_cm2 * 0.785) - 1)).toBeLessThan(0.03);
    expect(pap.source.url).toContain('pacificpipe.co.th');
    expect(sys.source.url).toContain('syssteel.com');
  });
  it('parses project stock ids safely', () => {
    expect(parseSectionStock(undefined)).toBeUndefined();
    expect(parseSectionStock([SECTION_STOCK[0].id, 'fake', 3])).toEqual([SECTION_STOCK[0].id]);
    expect(stockFor(undefined)).toBe(SECTION_STOCK);
    expect(stockFor([])).toEqual([]);
  });
});

describe('engine with catalogue sections', () => {
  it('checks a timber 1½″×3″ stud with the textbook allowable stresses', () => {
    const x = applyChanges(defaults, {studSectionId: 'TIMBER-38x75-ACTUAL', studTimberGrade: 'TIMBER-BOOK-MEDIUM'});
    expect(x).toMatchObject({rhsB: 38, rhsH: 75, rhsT: defaults.rhsT});
    const r = calculate(x), g = TIMBER_GRADES.find(t => t.id === 'TIMBER-BOOK-MEDIUM')!, b = r.checks.find(c => c.id === 'stud-b')!;
    expect(b.label).toContain('คร่าวไม้');
    expect(b.limit).toBe(g.Fb);
    expect(r.checks.find(c => c.id === 'stud-v')!.limit).toBe(g.Fv);
    expect(r.blockers.some(t => t.includes('คร่าวไม้'))).toBe(true);
    expect(buildFormworkLayout(r).stud).toMatchObject({material: 'TIMBER', label: sectionById('TIMBER-38x75-ACTUAL')!.designation});
    expect(calculate({...x, studTimberGrade: 'TIMBER-BOOK-VERY_SOFT'}).checks.find(c => c.id === 'stud-v')!.utilization).toBeNull();
  });
  it('uses published properties for angle, pipe and box walers', () => {
    for (const id of ['SYS-TIS1227-L-75x75x6', 'PAP-TIS107-CHS-60.5x2.3', 'PAP-TIS107-RHS-100x50x3.2', 'SYS-TIS1227-C-100x50x5x7.5']) {
      const x = applyChanges(defaults, {walerSectionId: id}), r = calculate(x), p = catalogueProperties(sectionById(id)!);
      expect(r.waler.section.I).toBeCloseTo(p.I, 6);
      expect(r.waler.section.S).toBeCloseTo(p.S, 6);
      expect(buildFormworkLayout(r).waler.label).toBe('2-' + sectionById(id)!.designation);
    }
    expect(calculate(applyChanges(defaults, {walerSectionId: 'SYS-TIS1227-L-75x75x6'})).blockers.some(b => b.includes('เหล็กฉาก'))).toBe(true);
    expect(() => calculate({...defaults, walerType: 'L'})).toThrow(/ต้องเลือกขนาดจากตาราง/);
  });
  it('keeps manual edits and old data valid', () => {
    const x = applyChanges(defaults, {studSectionId: 'PAP-TIS107-SHS-50x50x2.3'});
    expect(applyChanges(x, {rhsT: 3.2}).studSectionId).toBe('');
    expect(() => calculate({...x, rhsH: 60})).toThrow(/ขนาดคร่าวไม่ตรง/);
    const {studSectionId: _a, studTimberGrade: _b, ...legacy} = defaults;
    expect(calculate(legacy).input).toMatchObject({studSectionId: '', studTimberGrade: 'TIMBER-BOOK-SOFT'});
  });
  it('optimizer keeps timber studs timber and finds a passing layout', () => {
    const x: Input = applyChanges(defaults, {studSectionId: 'TIMBER-38x75-ACTUAL'});
    const o = optimizeLayout(x, 1, SECTION_STOCK);
    expect(o.length).toBeGreaterThan(0);
    for (const v of o) {expect(sectionById(v.input.studSectionId)?.family).toBe('TIMBER'); expect(v.passes).toBe(true);}
  });
});

describe('SectionPicker', () => {
  it('changes stud and waler sections through two-step dropdowns', async () => {
    (globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true;
    const host = document.createElement('div'); document.body.append(host);
    const root = createRoot(host), changes: Partial<Input>[] = [];
    const select = (label: string, value: string) => {
      const el = host.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`)!;
      el.value = value; el.dispatchEvent(new Event('change', {bubbles: true}));
    };
    try {
      await act(async () => root.render(<SectionPicker input={defaults} canEdit onChange={c => changes.push(c)}/>));
      await act(async () => select('ชนิดคร่าว', 'TIMBER'));
      expect(sectionById(changes[0].studSectionId!)?.family).toBe('TIMBER');
      await act(async () => select('ชนิดคานคู่', 'L'));
      expect(sectionById(changes[1].walerSectionId!)?.family).toBe('L');
      const x = applyChanges(defaults, {studSectionId: 'TIMBER-38x75-ACTUAL', walerSectionId: 'PAP-TIS107-CHS-60.5x2.3'});
      await act(async () => root.render(<SectionPicker input={x} canEdit onChange={c => changes.push(c)}/>));
      expect(host.querySelector<HTMLSelectElement>('select[aria-label="ขนาดคร่าว"]')!.value).toBe('TIMBER-38x75-ACTUAL');
      expect(host.querySelector('select[aria-label="ชั้นคุณภาพไม้"]')).not.toBeNull();
      expect(host.querySelector('a[href*="pacificpipe.co.th"]')?.textContent).toContain('TIS 107');
      await act(async () => select('ขนาดคานคู่', 'PAP-TIS107-CHS-76.3x3.2'));
      expect(changes.at(-1)).toEqual({walerSectionId: 'PAP-TIS107-CHS-76.3x3.2'});
      await act(async () => root.render(<SectionPicker input={x} canEdit={false} onChange={c => changes.push(c)}/>));
      expect(host.querySelector<HTMLSelectElement>('select[aria-label="ชนิดคร่าว"]')!.disabled).toBe(true);
    } finally {await act(async () => root.unmount()); host.remove();}
  });
});
