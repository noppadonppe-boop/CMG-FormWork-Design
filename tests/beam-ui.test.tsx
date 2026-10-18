// @vitest-environment jsdom
import React, {act, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe, expect, it} from 'vitest';
import {beamDefaults, beamFromCase, calculateBeam, type BeamInput} from '../src/domain/beam';
import {parseProjectBackup} from '../src/domain/projectBackup';
import {defaults} from '../src/domain';
import {defaultTitleBlock} from '../src/domain/titleBlock';
import {BeamPanel, type BeamTab} from '../src/components/BeamWorkspace';
import {BeamDrawingSet, BeamReport} from '../src/components/BeamDocs';

(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true;
const tb = defaultTitleBlock('ทดสอบ');

describe('beam workspace, drawings and report', () => {
  it('renders every beam tab without errors', () => {
    const r = calculateBeam({...beamDefaults, tieRows: 1});
    for (const tab of ['overview', 'geometry', 'criteria', 'layout', 'results'] as BeamTab[]) {
      const html = renderToStaticMarkup(<BeamPanel tab={tab} x={r.input} r={r} error={null} canEdit onChange={() => {}} onTab={() => {}}/>);
      expect(html.length).toBeGreaterThan(500);
    }
    const results = renderToStaticMarkup(<BeamPanel tab="results" x={r.input} r={r} error={null} canEdit onChange={() => {}} onTab={() => {}}/>);
    expect(results).toContain('ค้ำยัน: แรงอัดต่อต้น');
    expect(results).toContain('Tie ทะลุคาน');
    expect(results).not.toContain('PASS');
  });

  it('draws three A3 sheets and a classic report from the same result', () => {
    const r = calculateBeam({...beamDefaults, tieRows: 1, h: 900});
    const sheets = renderToStaticMarkup(<BeamDrawingSet r={r} project="P" code="C-1" caseName="B01" titleBlock={tb} canEdit onTitleBlockChange={() => {}}/>);
    expect(sheets.match(/class="a3-sheet"/g)?.length).toBe(3);
    for (const code of ['BF-01', 'BF-02', 'BF-03']) expect(sheets).toContain(code);
    expect(sheets).toContain('แบบหล่อคาน');
    const report = renderToStaticMarkup(<BeamReport r={r} project="P" code="C-1" caseName="B01" caseId="b01" titleBlock={tb}/>);
    expect(report).toContain('รายการคำนวณออกแบบแบบหล่อคาน');
    expect(report).toContain('§4.2.1');
    expect(report.match(/class="rp-check"/g)?.length).toBe(r.checks.length);
    expect(report).toContain(r.quantities[0].item);
  });

  it('prints the same Design Revision and review hash on the A3 set and A4 report', () => {
    const r = calculateBeam({...beamDefaults, tieRows: 1});
    const binding = {designRevision: 'R-B01-7', contentHash: '0123456789abcdef0123456789abcdef', reviewState: 'SUBMITTED'};
    const sheets = renderToStaticMarkup(<BeamDrawingSet r={r} project="P" code="C-1" caseName="B01" titleBlock={tb} canEdit onTitleBlockChange={() => {}} revisionBinding={binding}/>);
    const report = renderToStaticMarkup(<BeamReport r={r} project="P" code="C-1" caseName="B01" caseId="b01" titleBlock={tb} revisionBinding={binding}/>);
    expect(sheets).toContain('R-B01-7'); expect(sheets).toContain('SUBMITTED'); expect(sheets).toContain('0123456789abcdef');
    expect(report).toContain('R-B01-7'); expect(report).toContain('SUBMITTED'); expect(report).toContain('0123456789abcdef');
  });

  it('applies spacing advice and section changes through the editor', async () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    let latest: BeamInput = {...beamDefaults, confirmed: true};
    function Harness() {
      const [x, setX] = useState(latest);
      const r = calculateBeam(x);
      return <BeamPanel tab="layout" x={x} r={r} error={null} canEdit onChange={v => {latest = v; setX(v);}} onTab={() => {}}/>;
    }
    const root = createRoot(host);
    await act(async () => root.render(<Harness/>));
    const apply = [...host.querySelectorAll('button')].find(b => b.textContent?.startsWith('ใช้ '))!;
    await act(async () => apply.click());
    expect(latest.joistSpacing).toBe(450);
    expect(latest.confirmed).toBe(true);
    const size = host.querySelector('select[aria-label="ขนาดคานรับท้อง"]') as HTMLSelectElement;
    await act(async () => {size.value = 'PAP-TIS107-RHS-100x50x4.5'; size.dispatchEvent(new Event('change', {bubbles: true}));});
    expect(latest.bearerSectionId).toBe('PAP-TIS107-RHS-100x50x4.5');
    const b = host.querySelector('input[aria-label="ระยะค้ำยันตามยาวสูงสุด"]') as HTMLInputElement;
    expect(b).toBeTruthy();
    act(() => root.unmount());
  });

  it('seeds beam drafts from a case footprint and survives backup import', () => {
    const seeded = beamFromCase(null, {width: 8000, length: 400, height: 800});
    expect([seeded.b, seeded.h, seeded.length, seeded.shoreWidth, seeded.confirmed]).toEqual([400, 800, 8000, 1000, false]);
    expect(beamFromCase({broken: true}, {width: 4000, length: 9999, height: 2500})).toEqual(beamDefaults);
    const text = JSON.stringify({schemaVersion: 3, project: {name: 'P', code: 'C', cases: [{name: 'B01', input: defaults, workflowElementType: 'BEAM', beam: {...beamDefaults, b: 350, confirmed: true}}]}});
    const project = parseProjectBackup(text, () => 'id');
    expect(project.cases[0].beam?.b).toBe(350);
    expect(project.cases[0].beam?.confirmed).toBe(false);
    expect(() => parseProjectBackup(text.replace('"b":350', '"b":-1'), () => 'id')).toThrow();
  });
});
