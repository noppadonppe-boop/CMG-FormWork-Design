import {describe,it,expect} from 'vitest';
import {pointBeam,pointBeamAt,sectionProperties,analyzeWaler,equalPositions} from '../src/domain/mechanics';
import {calculate,defaults,extensionDefaults,upgradeInput,validateInput} from '../src/domain';
describe('analytical point-load beam benchmarks',()=>{
 it('center load: reactions, moment, maximum deflection',()=>{
   const b=pointBeam(1000,[{x:500,force:10000}],200000,1e6);
   expect(b.left).toBe(5000);expect(b.right).toBe(5000);expect(b.moment).toBe(2500000);
   expect(b.deflection).toBeCloseTo(1.041666666666667,12);expect(b.deflectionAt).toBeCloseTo(500,8);
 });
 it('quarter-span load uses the true off-center maximum',()=>{
   const b=pointBeam(1000,[{x:250,force:12000}],200000,1e6);
   expect(b.left).toBe(9000);expect(b.right).toBe(3000);expect(b.moment).toBe(2250000);
   expect(b.deflectionAt).toBeCloseTo(1000-Math.sqrt((1000**2-250**2)/3),8);
   expect(b.deflection).toBeCloseTo(12000*250*(1000**2-250**2)**1.5/(9*Math.sqrt(3)*1000*200000*1e6),10);
 });
 it('two equal symmetric loads: moment plateau and superposition',()=>{
   const b=pointBeam(1200,[{x:300,force:5000},{x:900,force:5000}],200000,1e6);
   expect(b.left).toBe(5000);expect(b.right).toBe(5000);expect(b.moment).toBe(1500000);
   expect(b.deflection).toBeCloseTo(1.2375,12);expect(b.deflectionAt).toBeCloseTo(600,9);
 });
 it('loads placed directly over supports produce no member bending',()=>{
   const b=pointBeam(1000,[{x:0,force:7000},{x:1000,force:3000}],200000,1e6);
   expect(b.left).toBe(7000);expect(b.right).toBe(3000);expect(b.shear).toBe(0);expect(b.moment).toBe(0);expect(b.deflection).toBe(0);
 });
 it('diagram stations agree with hand moments, shear jump, and boundary conditions',()=>{
   const args=[1000,[{x:500,force:10000}],200000,1e6] as const;
   const values=(x:number)=>pointBeamAt(args[0],[...args[1]],args[2],args[3],x);
   expect(values(0).deflection).toBe(0);expect(values(1000).deflection).toBeCloseTo(0,12);
   expect(values(250).moment).toBe(1250000);expect(values(500).moment).toBe(2500000);
   expect(values(499).shear).toBe(5000);expect(values(500).shear).toBe(-5000);
   expect(values(500).deflection).toBeCloseTo(1.041666666666667,12);
 });
 it('rejects bad geometry, rigidity, and point-load positions',()=>{
   for(const b of [()=>pointBeam(0,[],200000,1e6),()=>pointBeam(1,[],0,1),()=>pointBeam(1,[{x:2,force:1}],1,1),()=>pointBeam(1,[{x:0,force:-1}],1,1),()=>pointBeam(1,[{x:NaN,force:1}],1,1)])expect(b).toThrow();
 });
});
describe('nominal section and waler load path',()=>{
 it('RHS square and unlipped C independently decomposed geometric fixtures',()=>{
   const rhs=sectionProperties('RHS',100,100,5);
   expect(rhs.area).toBe(1900);expect(rhs.I).toBeCloseTo(2865833.333333333,7);expect(rhs.S).toBeCloseTo(57316.6666666667,7);expect(rhs.shearArea).toBe(900);
   const c=sectionProperties('C',50,100,5);
   expect(c.area).toBe(950);expect(c.I).toBeCloseTo(1432916.6666666667,7);expect(c.shearArea).toBe(450);
 });
 it('default full-pmax row: direct support loads counted once',()=>{
   const r=calculate(defaults),w=r.waler,f=w.faces[0];
   expect(w.verticalSpan).toBe(500);expect(w.lineLoad).toBe(30);expect(w.levels).toHaveLength(6);
   expect(f.totalLoad).toBe(90000);expect(f.reactionSum).toBe(90000);
   expect(f.supports.map(s=>s.force)).toEqual([9000,18000,18000,18000,18000,9000]);
   expect(f.bays[0].loads).toEqual([{x:300,force:9000}]);expect(f.bays[0].moment).toBe(1350000);
   expect(w.maxTieForce).toBe(18000);expect(w.maxCornerForce).toBe(9000);
 });
 it('all face reactions balance irregular grids and vertical tributaries cover height',()=>{
   const w=calculate({...defaults,width:3100,length:4250,studSpacing:275,tieSpacing:610,walerSpacing:540}).waler;
   for(const face of w.faces){expect(face.reactionSum).toBeCloseTo(face.totalLoad,7);expect(face.supports[0].role).toBe('CORNER');expect(face.supports.at(-1)!.role).toBe('CORNER');}
   expect(w.levels.reduce((s,z)=>s+z.tributary,0)).toBeCloseTo(2500,8);
   expect(w.levels.reduce((s,z)=>s+z.lineLoad,0)).toBeCloseTo(150,8);
 });
 it('50/50 sharing halves member actions while tie and corner reactions stay unchanged',()=>{
   const full=calculate(defaults),half=calculate({...defaults,pairShare:.5});
   expect(half.waler.stress).toBeCloseTo(full.waler.stress/2,12);
   expect(half.waler.shearStress).toBeCloseTo(full.waler.shearStress/2,12);
   expect(half.waler.deflection.deflection).toBeCloseTo(full.waler.deflection.deflection/2,12);
   expect(half.tie!.force).toBe(full.tie!.force);expect(half.waler.maxCornerForce).toBe(full.waler.maxCornerForce);
 });
 it('unaligned stud/tie grids retain exact force and moment equilibrium',()=>{
   const w=analyzeWaler({height:1000,pressure:50,studSpacing:333,walerSpacing:500,tieSpacing:600,type:'RHS',B:50,H:100,t:3,E:200000,share:1,throughTies:true,faces:[{id:'G1',length:1000}]});
   const face=w.faces[0];expect(face.totalLoad).toBe(25000);expect(face.reactionSum).toBeCloseTo(25000,8);
   expect(face.supports.reduce((s,z)=>s+z.position*z.force,0)).toBeCloseTo(12500000,5);
 });
 it('columns do not substitute fictitious through-ties',()=>{
  const r=calculate({...defaults,kind:'COLUMN' as const,width:1000,length:1000,height:8000});
  expect(r.tie).toBeNull();expect(r.tieLength).toBeNull();expect(r.checks.some(k=>k.id==='tie')).toBe(false);expect(r.tieRoutes).toEqual([]);
  expect(r.waler.faces.every(f=>f.supports.length===2&&f.supports.every(s=>s.role==='CORNER'))).toBe(true);
 });
 it('L footing ties are straight routes between real opposite faces, never across the re-entrant void',()=>{
  const v={...defaults,shape:'L' as const,width:4000,length:3000,armX:2000,armY:1500},r=calculate(v);
  const inside=(p:{x:number;y:number})=>p.x>=0&&p.x<=v.width&&p.y>=0&&p.y<=v.length&&!(p.x>v.armX+1e-6&&p.y>v.armY+1e-6);
  expect(r.tieRoutes.length).toBeGreaterThan(0);
  for(const t of r.tieRoutes){
   expect(t.faceA).not.toBe(t.faceB);
   for(const k of [0.01,0.5,0.99])expect(inside({x:t.a.x+(t.b.x-t.a.x)*k,y:t.a.y+(t.b.y-t.a.y)*k})).toBe(true);
   expect(t.length).toBeCloseTo(Math.hypot(t.b.x-t.a.x,t.b.y-t.a.y),9);
  }
  const ys=r.tieRoutes.filter(t=>t.axis==='Y');
  expect(ys.filter(t=>t.coord<v.armX).every(t=>t.length===v.length)).toBe(true);
  expect(ys.filter(t=>t.coord>v.armX).every(t=>t.length===v.armY)).toBe(true);
  for(const f of r.waler.faces)expect(f.reactionSum).toBeCloseTo(f.totalLoad,6);
  expect(r.tie!.force).toBe(Math.max(...r.tie!.endForces));
  expect(r.blockers.some(b=>b.includes('สองปลาย Tie ไม่เท่ากัน'))).toBe(true);
 });
 it('rectangle tie routing reproduces the equal face grid',()=>{
  const r=calculate(defaults);
  for(const f of r.waler.faces)expect(f.supports.map(s=>s.position)).toEqual(equalPositions(f.length,defaults.tieSpacing).map(p=>expect.closeTo(p,6)));
 });
 it('a face without interior ties sends all load to the corners',()=>{
   const r=calculate({...defaults,tieSpacing:4000});expect(r.tie).toBeNull();expect(r.waler.maxTieForce).toBe(0);
   expect(r.blockers.some(s=>s.includes('ไม่มีจุด Tie'))).toBe(true);
 });
});
describe('tie capacity, schema, and incomplete-design gates',()=>{
 it('tie is one-wall reaction, not doubled opposite-wall force; correct axis length',()=>{
   const r=calculate(defaults),t=r.tie!;
   expect(t.force).toBe(18);expect(t.length).toBe(4000);expect(t.grossArea).toBeCloseTo(201.06192982974676,10);
   expect(t.yieldCapacity).toBeCloseTo(390*Math.PI*16**2/(4*1.67*1000),10);
   expect(t.requiredGrossDiameter).toBeCloseTo(Math.sqrt(4*18000*1.67/(Math.PI*390)),10);
   expect(t.requiredEffectiveArea).toBeCloseTo(64.28571428571429,10);expect(t.bodyCandidate).toBe(12);
   expect(t.capacity).toBeNull();expect(r.tieElongation).toBeCloseTo(18000*4000/(200000*Math.PI*16**2/4),10);
 });
 it('missing effective area and SWL cannot silently pass',()=>{
   const r=calculate(defaults);
   for(const id of ['tie-net','tie-assembly']){const k=r.checks.find(c=>c.id===id)!;expect(k.limit).toBeNull();expect(k.utilization).toBeNull();expect(k.status).toBe('INCOMPLETE');}
 });
 it('assembly and net rupture limit govern independently from gross steel',()=>{
   const r=calculate({...defaults,tieNetArea:50,tieAssemblySWL:30});
   expect(r.tie!.ruptureCapacity).toBe(14);expect(r.tie!.capacity).toBe(14);expect(r.checks.find(c=>c.id==='tie-net')!.status).toBe('FAIL');
   const s=calculate({...defaults,tieNetArea:160,tieAssemblySWL:10});expect(s.tie!.capacity).toBe(10);expect(s.checks.find(c=>c.id==='tie-assembly')!.status).toBe('FAIL');
 });
 it('full numeric screens cannot approve an unsupported design',()=>{
   const r=calculate({...defaults,confirmed:true,plywood:40,studSpacing:200,tieSpacing:200,walerSpacing:200,rhsH:150,walerH:150,tieDiameter:25,tieNetArea:300,tieAssemblySWL:100});
   expect(r.status).toBe('INCOMPLETE');expect(r.checks.every(c=>c.status==='INCOMPLETE')).toBe(true);expect(r.blockers.length).toBeGreaterThan(4);
 });
 it('invalid sharing, capacity factors, Ae, and mismatched steel grades reject',()=>{
   for(const patch of [{pairShare:.49},{pairShare:1.01},{steelOmegaB:.9},{tieNetArea:300},{tieNetArea:-1},{tieAssemblySWL:NaN},{tieFy:400},{tieGrade:'SR24'},{tieFy:800,tieFu:700,tieGrade:'CUSTOM'},{studSpacing:1}])expect(()=>validateInput({...defaults,...patch})).toThrow();
   expect(validateInput({...defaults,tieGrade:'CUSTOM',tieFy:400,tieFu:600}).tieFy).toBe(400);
 });
 it('legacy input gets conservative defaults and resets confirmation',()=>{
   const old:Record<string,unknown>={...defaults,confirmed:true};for(const k of Object.keys(extensionDefaults))delete old[k];
   expect(upgradeInput(old)).toEqual({...defaults,confirmed:false});expect(upgradeInput({...defaults,confirmed:true}).confirmed).toBe(true);
   expect(()=>upgradeInput({...old,approved:true})).toThrow();expect(()=>upgradeInput({...old,pairShare:.5})).toThrow();
 });
 it('C member stays blocked for local and torsional checks',()=>{
   const r=calculate({...defaults,walerType:'C'});expect(r.blockers.some(s=>s.includes('shear center'))).toBe(true);expect(r.status).not.toBe('PASS');
 });
});
