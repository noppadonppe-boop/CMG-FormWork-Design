import {describe,it,expect} from 'vitest';
import {defaults,calculate,geometry,polygon,beamUniform,positions,segmentInside,validateInput,propose} from '../src/domain';
describe('independent mechanics and geometry fixtures',()=>{
 it('F1 hydrostatic pressure and two face lengths',()=>{
   const r=calculate(defaults);expect(r.pressure).toBe(60);expect(r.volume).toBe(30);
   expect(r.faces.map(f=>f.force)).toEqual([225,300,225,300]);expect(r.formArea).toBe(35);
 });
 it('C1 column pressure and resultants',()=>{
   const r=calculate({...defaults,kind:'COLUMN',width:1000,length:1000,height:8000});
   expect(r.pressure).toBe(192);expect(r.faces.every(f=>f.force===768)).toBe(true);
 });
 it('L polygon independently established area/perimeter/volume',()=>{
   const r=calculate({...defaults,shape:'L',width:4000,length:3000,armX:2000,armY:2000});
   expect(r.area).toBe(10);expect(r.perimeter).toBe(14);expect(r.volume).toBe(25);
   expect(r.faces).toHaveLength(6);expect(r.forceScalar).toBe(1050);
 });
 it('polygon global face force equilibrium is not scalar cancellation',()=>{
   const r=calculate({...defaults,shape:'L',width:4000,length:3000,armX:2000,armY:2000});
   expect(r.faces.reduce((s,f)=>s+f.force*f.normal.x,0)).toBeCloseTo(0,9);
   expect(r.faces.reduce((s,f)=>s+f.force*f.normal.y,0)).toBeCloseTo(0,9);
   expect(r.faces.every(f=>f.force>0)).toBe(true);
 });
 it('B1 simple beam analytical fixture',()=>{
   const b=beamUniform(10,1000,200000,1000000);
   expect(b.moment).toBe(1250000);expect(b.reaction).toBe(5000);expect(b.deflection).toBeCloseTo(.6510416667,8);
 });
 it('T1 reaction units with actual 500mm vertical grid',()=>{
   const r=calculate({...defaults,walerSpacing:600,tieSpacing:600});
   expect(r.checks.find(c=>c.id==='tie')!.demand).toBeCloseTo(18,9);
 });
 it('pressure and beam scaling follow mechanics',()=>{
   const a=calculate(defaults),b=calculate({...defaults,gamma:30});
   expect(b.pressure/a.pressure).toBeCloseTo(1.25);
   expect(beamUniform(1,2000,200000,1e6).deflection/beamUniform(1,1000,200000,1e6).deflection).toBe(16);
 });
 it('rejects self intersection',()=>expect(()=>geometry([{x:0,y:0},{x:2,y:2},{x:0,y:2},{x:2,y:0}])).toThrow());
 it('rejects degenerate edges and nonfinite data',()=>{
   expect(()=>geometry([{x:0,y:0},{x:0,y:0},{x:1,y:1}])).toThrow();
   expect(()=>validateInput({...defaults,width:NaN})).toThrow();
   expect(()=>validateInput({...defaults,steelFy:Infinity})).toThrow();
 });
 it('rejects zero/negative/missing/out of scope and unknown fields',()=>{
   expect(()=>validateInput({...defaults,height:0})).toThrow();
   expect(()=>validateInput({...defaults,rhsT:40})).toThrow();
   expect(()=>validateInput({...defaults,shape:'ROUND'})).toThrow();
   expect(()=>validateInput({...defaults,approved:true})).toThrow();
   expect(()=>validateInput({...defaults,width:undefined})).toThrow();
 });
 it('L arms must fit footprint',()=>expect(()=>calculate({...defaults,shape:'L',armX:4000})).toThrow());
 it('actual spacing covers remainder bay exactly',()=>{
   const v=positions(1000,300);expect(v).toEqual([0,250,500,750,1000]);expect(v.at(-1)).toBe(1000);
   expect(()=>positions(1000,0)).toThrow();expect(()=>positions(10000,.001)).toThrow();
 });
 it('rejects tie crossing reentrant void, accepts valid interior',()=>{
   const ps=polygon({...defaults,shape:'L',width:4000,length:3000,armX:2000,armY:2000});
   expect(segmentInside({x:0,y:2500},{x:4000,y:2500},ps)).toBe(false);
   expect(segmentInside({x:0,y:2500},{x:2000,y:2500},ps)).toBe(true);
   expect(segmentInside({x:0,y:1000},{x:4000,y:1000},ps)).toBe(true);
 });
 it('whole system can never PASS from screening alone',()=>{
   const r=calculate({...defaults,confirmed:true,plywood:40,studSpacing:100,tieDiameter:25});
   expect(r.status).not.toBe('PASS');expect(r.blockers.length).toBeGreaterThan(3);
   expect(r.checks.some(c=>c.status==='INCOMPLETE')).toBe(true);
 });
 it('failed screening retains FAIL and complete blocker list',()=>{
   const r=calculate({...defaults,plywood:5,tieDiameter:6});expect(r.status).toBe('FAIL');
   expect(r.blockers.some(b=>b.includes('ค้ำยัน'))).toBe(true);
 });
 it('column cannot accidentally use footing through-tie calculation',()=>{
   const r=calculate({...defaults,kind:'COLUMN'});
   expect(r.checks.find(c=>c.id==='tie')).toBeUndefined();expect(r.tieLength).toBeNull();
 });
 it('proposals keep confirmation and maintain preliminary status',()=>{
   const v=propose({...defaults,confirmed:true});expect(v).toHaveLength(2);
   for(const p of v)expect(calculate(p).status).not.toBe('PASS');
 });
 it('not mutate source inputs on calculation',()=>{
   const v=Object.freeze({...defaults});calculate(v);expect(v).toEqual(defaults);
 });
 it('canonical input ordering survives Firestore reordered map fields',()=>{
   const sorted=Object.fromEntries(Object.entries(defaults).sort(([a],[b])=>a.localeCompare(b)));
   expect(JSON.stringify(validateInput(sorted))).toBe(JSON.stringify(validateInput(defaults)));
 });
});
