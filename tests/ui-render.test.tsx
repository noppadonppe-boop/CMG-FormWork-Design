import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,it,expect} from 'vitest';
import {calculate,defaults} from '../src/domain';
import {WalerDetails} from '../src/components/WalerDetails';
import {AssemblyDetail} from '../src/components/AssemblyDetail';
import {ColumnYokeDetails,ColumnCriteria} from '../src/components/ColumnYokeDetails';
describe('waler result/report rendering integration (not browser QA)',()=>{
 it('renders rectangle, L and column results with only their applicable load paths',()=>{
   for(const input of [defaults,{...defaults,shape:'L' as const},{...defaults,kind:'COLUMN' as const,width:1000,length:1000,height:8000}]){
     const result=calculate(input),html=renderToStaticMarkup(React.createElement(WalerDetails,{r:result}));
     expect(html).toContain('<svg');expect(html).not.toMatch(/NaN|Infinity|undefined/);
     if(result.tie)expect(html).toContain(result.tie.force.toFixed(2));else expect(html).not.toContain('tie-summary');
     if(input===defaults)expect(result.tie!.force.toFixed(2)).toBe('18.00');
     expect(!!result.tie).toBe(input.kind!=='COLUMN');
   }
 });
 it('static report includes visible levels, diagram and unmet capacity text',()=>{
   const html=renderToStaticMarkup(React.createElement(WalerDetails,{r:calculate(defaults),report:true}));
   expect(html).toContain('<details open=""');expect(html).toContain('ยังไม่ทราบ Ae / SWL');expect(html).toContain('2,500.00');expect(html).toContain('ΣR');
 });
 it('footing connection detail and column yoke detail remain distinct',()=>{
   const footing=renderToStaticMarkup(React.createElement(AssemblyDetail,{x:defaults}));
   const column=renderToStaticMarkup(React.createElement(AssemblyDetail,{x:{...defaults,kind:'COLUMN',width:1000,length:1000,height:8000}}));
   expect(footing).toContain('Tie rod');expect(column).not.toContain('Tie rod');expect(column).toContain('Column yoke');
 });
 it('renders demand-only, ring and unsupported L column without invalid output or trusted-source HTML',()=>{
   for(const input of [{...defaults,kind:'COLUMN' as const,width:1000,length:1000,height:8000},{...defaults,kind:'COLUMN' as const,columnModel:'PINNED_RING' as const,cornerReference:'<script>alert(1)</script>'},{...defaults,kind:'COLUMN' as const,shape:'L' as const}]){
     const r=calculate(input),html=renderToStaticMarkup(React.createElement(ColumnYokeDetails,{r,report:true}));
     expect(html).not.toMatch(/NaN|Infinity|undefined|<script>/);if(r.column)expect(html).toContain('ชุดรัดเสา');
   }
   expect(renderToStaticMarkup(React.createElement(ColumnYokeDetails,{r:calculate(defaults)}))).toBe('');
 });
 it('criteria safely renders invalid draft fields so the user can correct them',()=>{
   const html=renderToStaticMarkup(React.createElement(ColumnCriteria,{x:{...defaults,cornerCapacityX:-1},onEdit:()=>{}}));
   expect(html).toContain('value="-1"');expect(html).toContain('UNKNOWN');
 });
});
