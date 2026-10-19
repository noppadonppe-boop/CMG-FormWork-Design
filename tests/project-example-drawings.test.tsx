// @vitest-environment jsdom
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {webcrypto} from 'node:crypto';
import {TextEncoder} from 'node:util';
import {beforeAll,afterAll,describe,it,expect,vi} from 'vitest';
import {projectExample} from '../src/domain/mockProject';
import {documentView,freezeDesign} from '../src/domain/workflowV07/snapshot';
import {installationSheets,drawingProjection,cutIntervals} from '../src/drawing/workflowInstallation';
import {Sheet} from '../src/drawing/primitives';
beforeAll(()=>{vi.stubGlobal('crypto',webcrypto);vi.stubGlobal('TextEncoder',TextEncoder);});
afterAll(()=>vi.unstubAllGlobals());
const project=projectExample();
it('fits actual millimetres on the paper using the scale denominator',()=>{
  const {P,scale}=drawingProjection([[0,0],[8000,5000]],{x:40,y:50,w:200,h:150});
  expect(scale).toBe(40);expect(P([8000,0])[0]-P([0,0])[0]).toBe(200);
  for(const p of [[0,0],[8000,5000]] as [number,number][]){expect(P(p)[0]).toBeGreaterThanOrEqual(40);expect(P(p)[0]).toBeLessThanOrEqual(240);expect(P(p)[1]).toBeGreaterThanOrEqual(50);expect(P(p)[1]).toBeLessThanOrEqual(200);}
});
it('cuts an L footprint without drawing concrete through its notch',()=>{
  const m={...project.cases[0].workflowV07!.model,vertices:[{x:0,y:0},{x:4000,y:0},{x:4000,y:1000},{x:1000,y:1000},{x:1000,y:3000},{x:0,y:3000}]};
  expect(cutIntervals(m,'X',2000)).toEqual([[0,1000]]);expect(cutIntervals(m,'X',500)).toEqual([[0,4000]]);
});
describe.each(project.cases)('$name',c=>{
  it('has indexed plans, two sections, details and every stored installation station with the same snapshot',async()=>{
    const model=c.workflowV07!.model,snapshot=await freezeDesign(model),view=await documentView(snapshot,model),prefix=c.name.match(/ · ([FCWBS]0[12]) · /)![1],sheets=installationSheets(view,prefix);
    // Full populated examples previously repeated the entire side definition in
    // every check until JSON.stringify exceeded V8's maximum string length.
    expect(JSON.stringify(snapshot).length).toBeLessThan(64_000_000);
    const html=sheets.map((s,i)=>renderToStaticMarkup(<Sheet no={i+1} total={sheets.length} code={s.code} title={s.title} info={{...c.titleBlock!,company:'CMG',project:'Project Example',code:'EX',caseName:prefix,elementLabel:'MOCK'}}>{s.body}</Sheet>)).join('');
    const doc=new DOMParser().parseFromString(html,'text/html');
    expect(doc.querySelectorAll('[data-view="installation-plan"]')).toHaveLength(1);
    expect(doc.querySelectorAll('[data-view="section-X"],[data-view="section-Y"]')).toHaveLength(2);
    expect(doc.querySelectorAll('[data-drawing-revision]')).toHaveLength(sheets.length);
    expect(new Set(sheets.map(s=>s.code)).size).toBe(sheets.length);
    expect(sheets.some(s=>s.code.endsWith('-M1'))).toBe(true);
    expect(html).toContain(view.inputHash);expect(html).toContain('NOT FOR CONSTRUCTION');expect(html).not.toMatch(/NaN|Infinity/);
    for(const leg of model.ringlockAssembly?.legs??[])expect(doc.body.textContent).toContain(leg.legId);
    for(const t of model.sideLayout?.ties??[])expect(doc.body.textContent).toContain(t.id);
    for(const face of model.sideLayout?.faces??[])expect(doc.querySelector(`[data-view="elevation-${face.faceId}"]`)).toBeTruthy();
    for(const row of doc.querySelectorAll('[data-waler-z]')){
      const z=Number(row.getAttribute('data-waler-z')),base=model.sideLayout!.baseElevationMm!;
      expect(z).toBeGreaterThanOrEqual(base);expect(z).toBeLessThanOrEqual(base+model.heightMm);
    }
    // All plan vertices must lie inside the drawing space, not hundreds of pages away.
    const plan=doc.querySelector('[data-view="installation-plan"]')!;
    for(const poly of plan.querySelectorAll('polygon'))for(const pair of poly.getAttribute('points')!.split(' ')){const [x,y]=pair.split(',').map(Number);expect(x).toBeGreaterThan(20);expect(x).toBeLessThan(290);expect(y).toBeGreaterThan(40);expect(y).toBeLessThan(225);}
    // Construction-drawing conventions: reference grids, north arrow, scale bar, member callouts and level marks.
    expect(plan.querySelectorAll('[data-grid]').length).toBeGreaterThanOrEqual(2);
    expect(plan.querySelector('[data-callouts]')?.textContent).toBeTruthy();
    expect(doc.querySelector('[data-north]')).toBeTruthy();
    expect(doc.querySelector('[data-scale-bar]')).toBeTruthy();
    for(const s of doc.querySelectorAll('[data-view^="section-"]')){
      const levels=[...s.querySelectorAll('[data-level]')].map(e=>Number(e.getAttribute('data-level')));
      expect(levels).toContain(model.heightMm+(model.ringlockAssembly?.legs[0]?.soffitElevationMm??model.sideLayout?.baseElevationMm??0));
    }
    // The concrete cut outline is the heaviest line and is drawn in black ink.
    const concrete=plan.querySelector('polygon[fill="url(#h-concrete)"]')!;
    expect(concrete.getAttribute('stroke')).toBe('#111');expect(Number(concrete.getAttribute('stroke-width'))).toBe(.6);
  },15000);
});
