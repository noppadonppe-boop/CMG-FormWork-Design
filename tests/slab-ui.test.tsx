// @vitest-environment jsdom
import {act, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe, expect, it} from 'vitest';
import {calculateSlab, slabDefaults, type SlabInput} from '../src/domain/slab';
import {parseProjectBackup} from '../src/domain/projectBackup';
import {defaults} from '../src/domain';
import {defaultTitleBlock} from '../src/domain/titleBlock';
import {SlabPanel, type SlabTab} from '../src/components/SlabWorkspace';
import {SlabDrawingSet, SlabReport} from '../src/components/SlabDocs';

(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true;
const tb = defaultTitleBlock('ทดสอบ');

describe('slab workspace, drawings and report', () => {
  it('renders every slab tab', () => {
    const r = calculateSlab(slabDefaults);
    for (const tab of ['overview', 'geometry', 'criteria', 'layout', 'results'] as SlabTab[])
      expect(renderToStaticMarkup(<SlabPanel tab={tab} x={r.input} r={r} error={null} canEdit onChange={() => {}} onTab={() => {}}/>).length).toBeGreaterThan(500);
    const results = renderToStaticMarkup(<SlabPanel tab="results" x={r.input} r={r} error={null} canEdit onChange={() => {}} onTab={() => {}}/>);
    expect(results).toContain('ค้ำยัน: แรงอัดต่อต้น');
    expect(results).not.toContain('PASS');
  });

  it('draws three A3 sheets and a report from the same result', () => {
    const r = calculateSlab(slabDefaults);
    const sheets = renderToStaticMarkup(<SlabDrawingSet r={r} project="P" code="C-1" caseName="S01" titleBlock={tb} canEdit onTitleBlockChange={() => {}}/>);
    expect(sheets.match(/class="a3-sheet"/g)?.length).toBe(3);
    for (const code of ['SF-01', 'SF-02', 'SF-03', 'รูปตัด A-A', 'รูปตัด B-B']) expect(sheets).toContain(code);
    const report = renderToStaticMarkup(<SlabReport r={r} project="P" code="C-1" caseName="S01" caseId="s01" titleBlock={tb}/>);
    expect(report).toContain('รายการคำนวณออกแบบแบบหล่อพื้น');
    expect(report.match(/class="rp-check"/g)?.length).toBe(r.checks.length);
  });

  it('prints one revision and review hash on both slab outputs', () => {
    const r = calculateSlab(slabDefaults), binding = {designRevision: 'R-S01-2', contentHash: 'fedcba9876543210fedcba9876543210', reviewState: 'REVIEWED'};
    const sheets = renderToStaticMarkup(<SlabDrawingSet r={r} project="P" code="C-1" caseName="S01" titleBlock={tb} canEdit onTitleBlockChange={() => {}} revisionBinding={binding}/>);
    const report = renderToStaticMarkup(<SlabReport r={r} project="P" code="C-1" caseName="S01" caseId="s01" titleBlock={tb} revisionBinding={binding}/>);
    for (const html of [sheets, report]) {expect(html).toContain('R-S01-2'); expect(html).toContain('REVIEWED'); expect(html).toContain('fedcba9876543210');}
  });

  it('applies spacing advice and keeps confirmation for non-geometry edits', async () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    let latest: SlabInput = {...slabDefaults, confirmed: true};
    function Harness() {
      const [x, setX] = useState(latest);
      return <SlabPanel tab="layout" x={x} r={calculateSlab(x)} error={null} canEdit onChange={v => {latest = v; setX(v);}} onTab={() => {}}/>;
    }
    const root = createRoot(host);
    await act(async () => root.render(<Harness/>));
    const apply = [...host.querySelectorAll('button')].find(b => b.textContent?.startsWith('ใช้ '))!;
    await act(async () => apply.click());
    expect(latest.joistSpacing).not.toBe(300);
    expect(latest.confirmed).toBe(true);
    act(() => root.unmount());
  });

  it('survives backup import', () => {
    const text = JSON.stringify({schemaVersion: 3, project: {name: 'P', code: 'C', cases: [{name: 'S01', input: defaults, workflowElementType: 'SLAB', slab: {...slabDefaults, t: 200, confirmed: true}}]}});
    const project = parseProjectBackup(text, () => 'id');
    expect(project.cases[0].slab?.t).toBe(200);
    expect(project.cases[0].slab?.confirmed).toBe(false);
  });
});
