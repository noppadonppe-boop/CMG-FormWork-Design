import {describe,it,expect} from 'vitest';
import {calculate,defaults,columnDefaults,phase2Defaults,upgradeInput,validateInput} from '../src/domain';
import {analyzeColumnYoke} from '../src/domain/columnYoke';
import {parseProjectBackup} from '../src/domain/projectBackup';
const sample={...defaults,kind:'COLUMN' as const,width:1000,length:1000,height:1000,gamma:20,studSpacing:250,walerSpacing:500};
describe('rectangular column yoke equilibrium fixtures',()=>{
 it('square: normal corner demands and resultant independently established',()=>{
   const y=calculate(sample).column!;
   expect(y.corners.map(c=>[c.x,c.y])).toEqual([[-5000,-5000],[5000,-5000],[5000,5000],[-5000,5000]]);
   expect(y.maxX).toBe(5000);expect(y.maxY).toBe(5000);expect(y.maxResultant).toBeCloseTo(Math.sqrt(50e6),9);
   expect(y.members.every(m=>m.axialForce===null&&m.interaction===null)).toBe(true);
 });
 it('rectangle: corner components use perpendicular neighboring faces',()=>{
   const y=calculate({...sample,width:2000,columnModel:'PINNED_RING'}).column!;
   expect(y.maxX).toBe(5000);expect(y.maxY).toBe(10000);expect(y.maxResultant).toBeCloseTo(Math.sqrt(125e6),9);
   expect(y.members.map(m=>m.axialForce)).toEqual([5000,10000,5000,10000]);
   expect(y.governingMember).toBe('F1');
 });
 it('closed ring balances every corner and action/reaction between members',()=>{
   const y=calculate({...sample,width:2000,columnModel:'PINNED_RING'}).column!;
   for(const c of y.corners){expect(c.residualX).toBeCloseTo(0,10);expect(c.residualY).toBeCloseTo(0,10);expect(Math.hypot(c.interfaceX!,c.interfaceY!)).toBeCloseTo(c.resultant,9);}
   expect(y.corners[0].interfaceX).toBe(5000);expect(y.corners[0].interfaceY).toBe(-10000);
   expect(y.corners.reduce((s,c)=>s+c.x,0)).toBe(0);expect(y.corners.reduce((s,c)=>s+c.y,0)).toBe(0);
   expect(y.corners.reduce((s,c)=>s+c.point.x*c.y-c.point.y*c.x,0)).toBe(0);
 });
 it('elastic tension+bending screen retains true axial force rather than treating sides as truss members',()=>{
   const r=calculate({...sample,columnModel:'PINNED_RING'}),m=r.column!.members[0],s=r.waler.section;
   expect(m.axialStress).toBeCloseTo(5000/s.area,10);
   expect(m.bendingStress).toBeCloseTo(1250000/s.S,10);
   expect(m.interaction).toBeCloseTo((5000/s.area)/(245/1.67)+(1250000/s.S)/(245/1.67),10);
 });
 it('load sharing changes member interaction, never the whole-pair corner demand',()=>{
   const a=calculate({...sample,columnModel:'PINNED_RING'}).column!,b=calculate({...sample,columnModel:'PINNED_RING',pairShare:.5}).column!;
   expect(b.memberInteraction).toBeCloseTo(a.memberInteraction!/2,11);expect(b.maxResultant).toBe(a.maxResultant);
 });
 it('column forces do not depend on unused footing tie spacing and increase with pressure',()=>{
   const a=calculate({...sample,tieSpacing:300}).column!,b=calculate({...sample,tieSpacing:900}).column!;
   expect(a.corners).toEqual(b.corners);
   expect(calculate({...sample,height:2000}).column!.maxResultant).toBeCloseTo(a.maxResultant*2,9);
 });
 it('footings and L columns never silently acquire the rectangular ring method',()=>{
   expect(calculate(defaults).column).toBeNull();
   const r=calculate({...sample,shape:'L',armX:500,armY:500,columnModel:'PINNED_RING'});
   expect(r.column).toBeNull();expect(r.checks.some(c=>c.id==='column-yoke')).toBe(false);
   expect(r.blockers.some(b=>b.includes('เฉพาะรูปสี่เหลี่ยม'))).toBe(true);
 });
 it('rejects asymmetric axial end forces that cannot close the ring',()=>{
   const r=calculate(sample),w=structuredClone(r.waler);w.faces[0].supports[0].force+=100;
   expect(()=>analyzeColumnYoke(r.faces,w,{model:'PINNED_RING',Fy:245,omegaT:1.67,omegaB:1.67,capacityX:0,capacityY:0,rule:'UNKNOWN'})).toThrow('do not balance');
 });
 it('rejects broken or unsupported corner topology and nonfinite geometry',()=>{
   const r=calculate(sample),options={model:'PINNED_RING' as const,Fy:245,omegaT:1.67,omegaB:1.67,capacityX:0,capacityY:0,rule:'UNKNOWN' as const};
   const f=structuredClone(r.faces);f[0].normal.x=NaN;expect(()=>analyzeColumnYoke(f,r.waler,options)).toThrow();
   const w=structuredClone(r.waler);w.faces[0].supports[0].role='TIE';expect(()=>analyzeColumnYoke(r.faces,w,options)).toThrow();
   const g=structuredClone(r.faces);g[0].a.x+=1;expect(()=>analyzeColumnYoke(g,r.waler,options)).toThrow();
 });
});
describe('corner capacities and schema gates',()=>{
 it('unknown capacities and interaction remain INCOMPLETE',()=>{
   const r=calculate(sample);
   for(const id of ['column-x','column-y','column-joint','column-yoke']){const c=r.checks.find(c=>c.id===id)!;expect(c.status).toBe('INCOMPLETE');expect(c.utilization).toBeNull();}
 });
 it('component capacity failure is visible even without a combined interaction rule',()=>{
   const r=calculate({...sample,cornerCapacityX:4,cornerCapacityY:10});
   expect(r.checks.find(c=>c.id==='column-x')!.status).toBe('FAIL');expect(r.column!.cornerInteraction).toBeNull();
 });
 it('user-selected linear envelope fails under simultaneous two-axis demand',()=>{
   const r=calculate({...sample,cornerCapacityX:8,cornerCapacityY:8,cornerRule:'LINEAR'});
   expect(r.column!.cornerInteraction).toBe(1.25);expect(r.checks.find(c=>c.id==='column-joint')!.status).toBe('FAIL');
   const edge=calculate({...sample,cornerCapacityX:10,cornerCapacityY:10,cornerRule:'LINEAR'});
   expect(edge.column!.cornerInteraction).toBe(1);expect(edge.checks.find(c=>c.id==='column-joint')!.status).toBe('INCOMPLETE');
 });
 it('known numbers, source text, and ring selection never establish stability or construction approval',()=>{
   const r=calculate({...sample,confirmed:true,plywood:40,walerH:150,rhsH:150,columnModel:'PINNED_RING',cornerCapacityX:100,cornerCapacityY:100,cornerRule:'LINEAR',cornerReference:'Mock allowable envelope / unverified'});
   expect(r.status).toBe('INCOMPLETE');expect(r.blockers.some(b=>b.includes('สี่ pin'))).toBe(true);expect(r.blockers.some(b=>b.includes('เสถียรภาพ'))).toBe(true);
 });
 it('invalid corner inputs and reference types cannot enter the calculation',()=>{
   for(const patch of [{cornerCapacityX:-1},{cornerCapacityY:Infinity},{yokeOmegaT:.9},{columnModel:'AUTO_APPROVED'},{cornerRule:'INDEPENDENT'},{cornerReference:123},{cornerReference:'x'.repeat(301)}])expect(()=>validateInput({...sample,...patch})).toThrow();
 });
 it('v2 backup gains only phase3 defaults, preserving phase2 parameters and resetting confirmation',()=>{
   const old:Record<string,unknown>={...sample,pairShare:.7,confirmed:true};for(const key of Object.keys(columnDefaults))delete old[key];
   const p=parseProjectBackup(JSON.stringify({schemaVersion:2,project:{name:'Old',code:'P02',cases:[{name:'C1',input:old}]}}));
   expect(p.cases[0].input.pairShare).toBe(.7);expect(p.cases[0].input.columnModel).toBe('DEMAND_ONLY');expect(p.cases[0].input.cornerCapacityX).toBe(0);expect(p.cases[0].input.confirmed).toBe(false);
   expect(upgradeInput(old,2).height).toBe(1000);
 });
 it('partial v3, disguised v1-as-v2, and unknown fields reject',()=>{
   const old:Record<string,unknown>={...sample};for(const key of Object.keys(columnDefaults))delete old[key];
   expect(()=>upgradeInput({...old,cornerCapacityX:1},2)).toThrow();
   for(const key of Object.keys(phase2Defaults))delete old[key];expect(()=>upgradeInput(old,2)).toThrow();
   expect(()=>upgradeInput({...sample,constructionApproved:true})).toThrow();
 });
});
