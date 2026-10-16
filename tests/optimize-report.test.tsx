// @vitest-environment jsdom
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe, expect, it} from 'vitest';
import {calculate, defaults, type Input} from '../src/domain';
import {adviseLayout, optimizeLayout, optimizerBrief} from '../src/domain/optimize';
import {SECTION_STOCK, catalogueProperties, sectionById, sectionsFor} from '../src/domain/sectionStock';
import {sectionProperties} from '../src/domain/mechanics';
import {applyChanges} from '../src/domain/scene';
import {defaultTitleBlock, parseTitleBlock} from '../src/domain/titleBlock';
import {CalcReport} from '../src/components/CalcReport';
import {DrawingSet} from '../src/components/DrawingSet';

const column: Input = {...defaults, kind: 'COLUMN', width: 600, length: 800, height: 3500};
const tall: Input = {...defaults, width: 6000, length: 8000, height: 6000};

describe('Part 2 layout optimizer', () => {
  it.each([['default footing', defaults], ['column', column], ['tall footing', tall]] as const)('finds recalculated layouts with no screening FAIL for %s', (_, x) => {
    expect(calculate(x).checks.some(c => c.status === 'FAIL')).toBe(true);
    const options = optimizeLayout(x);
    expect(options.length).toBeGreaterThan(0);
    for (const o of options) {
      const r = calculate(o.input);
      expect(r.checks.every(c => c.utilization === null || c.utilization <= 1 + 1e-9)).toBe(true);
      expect(o.passes).toBe(true);
      expect(r.status).toBe('INCOMPLETE');
      expect({...o.input, plywood: x.plywood, studSpacing: x.studSpacing, walerSpacing: x.walerSpacing, tieSpacing: x.tieSpacing, tieDiameter: x.tieDiameter}).toEqual(x);
    }
    expect(options.map(o => o.pieces)).toEqual([...options.map(o => o.pieces)].sort((a, b) => a - b));
  });
  it('honours a stricter target ratio', () => {
    const o = optimizeLayout(defaults, 0.85);
    expect(o.length).toBeGreaterThan(0);
    expect(o.every(v => v.maxRatio <= 0.85 + 1e-9)).toBe(true);
  });
  it('gives actionable advice for each failing check and none when compliant', () => {
    const advice = adviseLayout(defaults);
    expect(advice.map(a => a.checkId)).toEqual(['ply-b', 'ply-v', 'ply-d']);
    expect(advice[0].text).toContain('ลดระยะคร่าวเป็น ≤ 225 mm');
    expect(adviseLayout(optimizeLayout(defaults)[0].input)).toEqual([]);
  });
  it('solves an L footing now that routed ties support its walers', () => {
    const L: Input = {...defaults, shape: 'L', width: 4000, length: 3000, armX: 2000, armY: 1500};
    const o = optimizeLayout(L);
    expect(o.length).toBeGreaterThan(0);
    expect(o[0].result.tieRoutes.length).toBeGreaterThan(0);
    expect(o.every(v => v.passes)).toBe(true);
  });
  it('upgrades sections only from the allowed stock when spacing alone cannot pass', () => {
    const tallColumn: Input = {...defaults, kind: 'COLUMN', width: 1000, length: 1000, height: 8000};
    expect(optimizeLayout(tallColumn)).toEqual([]);
    const withStock = optimizeLayout(tallColumn, 1, SECTION_STOCK);
    expect(withStock.length).toBeGreaterThan(0);
    const I = (x: Input) => x.walerSectionId ? catalogueProperties(sectionById(x.walerSectionId)!).I : sectionProperties(x.walerType === 'C' ? 'C' : 'RHS', x.walerB, x.walerH, x.walerT).I;
    for (const o of withStock) {
      expect(o.passes).toBe(true);
      expect(I(o.input)).toBeGreaterThanOrEqual(I(tallColumn));
      expect(sectionById(o.input.walerSectionId)?.roles).toContain('waler');
    }
    expect(withStock.map(o => o.steelKg)).toEqual([...withStock.map(o => o.steelKg)].sort((a, b) => a - b));
    const only = sectionsFor('waler', 'C');
    expect(optimizeLayout(tallColumn, 1, only).every(o => o.input.walerSectionId.startsWith('SYS-TIS1227-C-') && o.input.walerType === 'C')).toBe(true);
    expect(adviseLayout(tallColumn, 1, SECTION_STOCK).find(a => a.checkId === 'waler-b')?.text).toMatch(/เปลี่ยนคานคู่เป็น 2-/);
  });
  it('produces a compact brief for the AI chat with recalculated options', () => {
    const b = optimizerBrief(defaults, SECTION_STOCK);
    expect(b.advice.map(a => a.check)).toEqual(['ply-b', 'ply-v', 'ply-d']);
    expect(b.options.length).toBeGreaterThan(0);
    expect(b.options.length).toBeLessThanOrEqual(3);
    expect(adviseLayout(applyChanges(defaults, b.options[0].changes as Partial<Input>))).toEqual([]);
  });
});

describe('Part 3 title block and report', () => {
  it('sanitizes stored title-block data', () => {
    expect(parseTitleBlock(undefined)).toBeNull();
    expect(parseTitleBlock({rev: 'B', designedBy: 'x'.repeat(100), revisions: [{rev: 'A', date: '1', description: 'd'}, 5], extra: 1}))
      .toEqual({rev: 'B', date: '', designedBy: 'x'.repeat(60), drawnBy: '', checkedBy: '', approvedBy: '', revisions: [{rev: 'A', date: '1', description: 'd'}]});
  });
  it('uses the same title block on the A3 sheets and the report', () => {
    const tb = {...defaultTitleBlock('ผู้ออกแบบ'), rev: 'C', checkedBy: 'ผู้ตรวจ', revisions: [{rev: 'C', date: '1/1/2570', description: 'ปรับระยะคร่าว'}]};
    const r = calculate(defaults);
    const sheets = renderToStaticMarkup(<DrawingSet result={r} project="P" code="C1" caseName="F01" titleBlock={tb} onTitleBlockChange={() => undefined}/>);
    const report = renderToStaticMarkup(<CalcReport r={r} project="P" code="C1" caseName="F01" caseId="F01" titleBlock={tb}/>);
    for (const html of [sheets, report]) {expect(html).toContain('ผู้ตรวจ'); expect(html).toContain('ปรับระยะคร่าว');}
    expect(report).toContain('CAL-C1-F01');
  });
  it('renders a structured report with figures, step-by-step checks, BOM and advice', () => {
    const r = calculate(defaults), html = renderToStaticMarkup(<CalcReport r={r} project="P" code="C" caseName="F01" caseId="F01" titleBlock={defaultTitleBlock()}/>);
    for (const t of ['สารบัญ', '1. ขอบเขตและเกณฑ์การออกแบบ', '3. แรงดันคอนกรีตสด', '6. ปริมาณวัสดุ', '9. เอกสารอ้างอิง', 'คำแนะนำปรับแก้', 'ไม้อัดแบบหล่อ'])
      expect(html).toContain(t);
    expect(html.match(/class="rp-check"/g)).toHaveLength(r.checks.length);
    expect(html.match(/<figcaption>รูปที่ \d/g)!.length).toBeGreaterThanOrEqual(7);
    expect(html).not.toMatch(/NaN|Infinity/);
  });
});
