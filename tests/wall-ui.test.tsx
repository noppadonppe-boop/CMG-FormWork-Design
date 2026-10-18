// @vitest-environment jsdom
import {act, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe, expect, it} from 'vitest';
import {calculateWall, wallDefaults, type WallInput} from '../src/domain/wall';
import {parseProjectBackup} from '../src/domain/projectBackup';
import {defaults} from '../src/domain';
import {defaultTitleBlock} from '../src/domain/titleBlock';
import {WallPanel, type WallTab} from '../src/components/WallWorkspace';
import {WallDrawingSet, WallReport} from '../src/components/WallDocs';

(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true;
const tb = defaultTitleBlock('ทดสอบ');

describe('wall workspace, drawings and report', () => {
  it('renders every wall tab', () => {
    const r = calculateWall(wallDefaults);
    for (const tab of ['overview', 'geometry', 'criteria', 'layout', 'results'] as WallTab[])
      expect(renderToStaticMarkup(<WallPanel tab={tab} x={r.input} r={r} error={null} canEdit onChange={() => {}} onTab={() => {}}/>).length).toBeGreaterThan(500);
    const results = renderToStaticMarkup(<WallPanel tab="results" x={r.input} r={r} error={null} canEdit onChange={() => {}} onTab={() => {}}/>);
    for (const t of ['Tie: ตัวเหล็กเริ่มคราก', 'ค้ำยันเอียง']) expect(results).toContain(t);
    expect(results).not.toContain('PASS');
  });

  it('draws three A3 sheets and a report from the same result', () => {
    const r = calculateWall({...wallDefaults, pressureMethod: 'ACI347'});
    const sheets = renderToStaticMarkup(<WallDrawingSet r={r} project="P" code="C-1" caseName="W01" titleBlock={tb} canEdit onTitleBlockChange={() => {}}/>);
    expect(sheets.match(/class="a3-sheet"/g)?.length).toBe(3);
    for (const code of ['WF-01', 'WF-02', 'WF-03', 'รูปตัด A-A ผนัง']) expect(sheets).toContain(code);
    const report = renderToStaticMarkup(<WallReport r={r} project="P" code="C-1" caseName="W01" caseId="w01" titleBlock={tb}/>);
    expect(report).toContain('รายการคำนวณออกแบบแบบหล่อผนัง');
    expect(report).toContain('§4.2.3.3');
    expect(report.match(/class="rp-check"/g)?.length).toBe(r.checks.length);
  });

  it('switches the pressure method and applies advice from the editor', async () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    let latest: WallInput = {...wallDefaults, confirmed: true};
    function Harness({tab}: {tab: WallTab}) {
      const [x, setX] = useState(latest);
      return <WallPanel tab={tab} x={x} r={calculateWall(x)} error={null} canEdit onChange={v => {latest = v; setX(v);}} onTab={() => {}}/>;
    }
    const root = createRoot(host);
    await act(async () => root.render(<Harness tab="criteria"/>));
    const method = host.querySelector('select[aria-label="วิธีคำนวณแรงดัน"]') as HTMLSelectElement;
    await act(async () => {method.value = 'ACI347'; method.dispatchEvent(new Event('change', {bubbles: true}));});
    expect(latest.pressureMethod).toBe('ACI347');
    expect(host.querySelector('input[aria-label="อัตราการเท R"]')).toBeTruthy();
    await act(async () => root.render(<Harness tab="layout"/>));
    const apply = [...host.querySelectorAll('button')].find(b => b.textContent?.startsWith('ใช้ '));
    if (apply) {await act(async () => apply.click()); expect(latest.confirmed).toBe(true);}
    act(() => root.unmount());
  });

  it('renders single-sided walls with strongbacks and anchors instead of ties', () => {
    const r = calculateWall({...wallDefaults, system: 'SINGLE_SIDED', braceSpacing: 1500});
    const layout = renderToStaticMarkup(<WallPanel tab="layout" x={r.input} r={r} error={null} canEdit onChange={() => {}} onTab={() => {}}/>);
    expect(layout).toContain('ขนาดStrongback');
    expect(layout).not.toContain('ระยะ Tie สูงสุด');
    const sheets = renderToStaticMarkup(<WallDrawingSet r={r} project="P" code="C" caseName="W1" titleBlock={tb} canEdit onTitleBlockChange={() => {}}/>);
    expect(sheets).toContain('ดิน / ผนังเดิม');
    expect(sheets).toContain('แบบด้านเดียว');
    const report = renderToStaticMarkup(<WallReport r={r} project="P" code="C" caseName="W1" caseId="w1" titleBlock={tb}/>);
    expect(report).toContain('Strongback และพุกฐาน');
    expect(report).toContain('§4.1.4d');
    expect(report.match(/class="rp-check"/g)?.length).toBe(r.checks.length);
  });

  it('survives backup import', () => {
    const text = JSON.stringify({schemaVersion: 3, project: {name: 'P', code: 'C', cases: [{name: 'W01', input: defaults, workflowElementType: 'WALL', wall: {...wallDefaults, t: 300, confirmed: true}}]}});
    const project = parseProjectBackup(text, () => 'id');
    expect(project.cases[0].wall?.t).toBe(300);
    expect(project.cases[0].wall?.confirmed).toBe(false);
  });
});
