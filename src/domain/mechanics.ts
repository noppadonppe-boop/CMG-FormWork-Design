/** N, mm, MPa. Elastic simply-supported members; no continuity or connection model. */
export interface PointLoad { x:number; force:number }
export interface BeamResult {
  left:number; right:number; moment:number; momentAt:number;
  shear:number; deflection:number; deflectionAt:number;
}
export function pointBeamAt(L:number,loads:PointLoad[],E:number,I:number,x:number){
  if(!Number.isFinite(x)||x<0||x>L)throw Error('Invalid beam station');
  const left=loads.reduce((s,p)=>s+p.force*(L-p.x)/L,0);
  const C=(left*L**3-loads.reduce((s,p)=>s+p.force*(L-p.x)**3,0))/(6*L);
  return {moment:left*x-loads.reduce((s,p)=>s+p.force*Math.max(0,x-p.x),0),
    shear:left-loads.reduce((s,p)=>s+(p.x<=x?p.force:0),0),
    deflection:(C*x-left*x**3/6+loads.reduce((s,p)=>s+p.force*Math.max(0,x-p.x)**3/6,0))/(E*I)};
}
export function pointBeam(L:number,loads:PointLoad[],E:number,I:number):BeamResult {
  if([L,E,I].some(v=>!Number.isFinite(v)||v<=0)||loads.length>1000||
    loads.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.force)||p.x<0||p.x>L||p.force<0))throw Error('Invalid point-load beam');
  const left=loads.reduce((s,p)=>s+p.force*(L-p.x)/L,0);
  const right=loads.reduce((s,p)=>s+p.force*p.x/L,0);
  const bracket=(x:number,a:number)=>Math.max(0,x-a);
  const C=(left*L**3-loads.reduce((s,p)=>s+p.force*(L-p.x)**3,0))/(6*L);
  const momentAt=(x:number)=>left*x-loads.reduce((s,p)=>s+p.force*bracket(x,p.x),0);
  const deflectionAt=(x:number)=>(C*x-left*x**3/6+loads.reduce((s,p)=>s+p.force*bracket(x,p.x)**3/6,0))/(E*I);
  const slope=(x:number)=>C-left*x*x/2+loads.reduce((s,p)=>s+p.force*bracket(x,p.x)**2/2,0);
  const knots=[0,L,...loads.map(p=>p.x)];let moment=0,momentLocation=0;
  for(const x of knots){const m=momentAt(x);if(m>moment){moment=m;momentLocation=x;}}
  // Positive loads give M >= 0, hence the downward displacement slope is monotone.
  let lo=0,hi=L;
  for(let n=0;n<60;n++){const mid=(lo+hi)/2;if(slope(mid)>0)lo=mid;else hi=mid;}
  const location=(lo+hi)/2;
  return {left,right,moment:Math.max(0,moment),momentAt:momentLocation,
    shear:Math.max(Math.abs(left-loads.filter(p=>p.x===0).reduce((s,p)=>s+p.force,0)),Math.abs(right-loads.filter(p=>p.x===L).reduce((s,p)=>s+p.force,0))),
    deflection:Math.max(0,deflectionAt(location)),deflectionAt:location};
}
export interface SectionProperties { area:number; I:number; S:number; shearArea:number }
export function sectionProperties(type:'RHS'|'C',B:number,H:number,t:number):SectionProperties {
  if([B,H,t].some(v=>!Number.isFinite(v)||v<=0)||2*t>=Math.min(B,H))throw Error('Invalid nominal steel section');
  // Sharp corners, uniform thickness; unlipped C. H is the bending depth.
  const I=type==='RHS'?(B*H**3-(B-2*t)*(H-2*t)**3)/12:
    t*H**3/12+2*((B-t)*t**3/12+(B-t)*t*((H-t)/2)**2);
  const area=type==='RHS'?B*H-(B-2*t)*(H-2*t):t*H+2*(B-t)*t;
  return {area,I,S:2*I/H,shearArea:(type==='RHS'?2:1)*t*(H-2*t)};
}
export function equalPositions(length:number,maximum:number):number[] {
  if(!Number.isFinite(length)||!Number.isFinite(maximum)||length<=0||maximum<=0)throw Error('Invalid grid');
  const bays=Math.ceil(length/maximum);if(bays>200)throw Error('จำนวนช่วงเกิน 200 กรุณาตรวจหน่วยหรือระยะสมาชิก');
  return Array.from({length:bays+1},(_,i)=>i*length/bays);
}
export interface WalerBay extends BeamResult {
  faceId:string; index:number; start:number; length:number; loads:PointLoad[];
}
export interface WalerSupport { position:number; force:number; role:'TIE'|'CORNER' }
export interface WalerFace {
  faceId:string; length:number; studSpacing:number; supportSpacing:number;
  totalLoad:number; reactionSum:number; supports:WalerSupport[]; bays:WalerBay[];
}
export interface WalerAnalysis {
  model:'PINNED_INDEPENDENT_BAYS'; lineLoad:number; verticalSpan:number;
  governingLevel:number; tributaryHeight:number; levels:{depth:number;tributary:number;lineLoad:number}[];
  section:SectionProperties; share:number; faces:WalerFace[];
  bending:WalerBay; shear:WalerBay; deflection:WalerBay;
  stress:number; shearStress:number; deflectionRatio:number;
  maxTieForce:number; tieFaceId:string|null; maxCornerForce:number;
}
export function analyzeWaler(o:{height:number;pressure:number;studSpacing:number;walerSpacing:number;tieSpacing:number;
  type:'RHS'|'C'|'L'|'CHS';B:number;H:number;t:number;E:number;share:number;throughTies:boolean;faces:{id:string;length:number}[];supports?:Record<string,number[]>;section?:SectionProperties}):WalerAnalysis {
  if(!Number.isFinite(o.pressure)||o.pressure<0||!Number.isFinite(o.share)||o.share<.5||o.share>1||!Number.isFinite(o.E)||o.E<=0||!o.faces.length)throw Error('Invalid waler model');
  const zs=equalPositions(o.height,o.walerSpacing);
  const levels=zs.map((depth,i)=>{
    const tributary=((i>0?depth-zs[i-1]:0)+(i<zs.length-1?zs[i+1]-depth:0))/2;
    return {depth,tributary,lineLoad:o.pressure/1000*tributary};
  });
  const governing=levels.reduce((a,b)=>a.lineLoad>=b.lineLoad?a:b),section=o.section??sectionProperties(o.type==='C'?'C':'RHS',o.B,o.H,o.t);
  const faces=o.faces.map(face=>{
    const studs=equalPositions(face.length,o.studSpacing);
    // Explicit tie stations (e.g. routed ties of an L footing) replace the equal grid for that face.
    const custom=o.supports?.[face.id]?.filter(p=>p>1e-6&&p<face.length-1e-6).sort((a,b)=>a-b).filter((p,i,a)=>i===0||p-a[i-1]>1e-6);
    const supports=custom?[0,...custom,face.length]:o.throughTies?equalPositions(face.length,o.tieSpacing):[0,face.length];
    const reactions=supports.map(()=>0),loadsByBay:PointLoad[][]=Array.from({length:supports.length-1},()=>[]);
    for(let i=0;i<studs.length;i++){
      const a=studs[i],trib=((i>0?a-studs[i-1]:0)+(i<studs.length-1?studs[i+1]-a:0))/2;
      const force=governing.lineLoad*trib;
      const node=supports.findIndex(z=>Math.abs(z-a)<1e-7);
      if(node>=0){reactions[node]+=force;continue;}
      const bay=supports.findIndex((z,j)=>j<supports.length-1&&a>z&&a<supports[j+1]);
      if(bay<0)throw Error('Stud outside waler bay');
      loadsByBay[bay].push({x:a-supports[bay],force});
    }
    const bays=loadsByBay.map((loads,i)=>{
      const length=supports[i+1]-supports[i],full=pointBeam(length,loads,o.E,section.I);
      reactions[i]+=full.left;reactions[i+1]+=full.right;
      const member=pointBeam(length,loads.map(p=>({...p,force:p.force*o.share})),o.E,section.I);
      return {...member,faceId:face.id,index:i+1,start:supports[i],length,loads};
    });
    return {faceId:face.id,length:face.length,studSpacing:face.length/(studs.length-1),supportSpacing:face.length/(supports.length-1),
      totalLoad:governing.lineLoad*face.length,reactionSum:reactions.reduce((s,r)=>s+r,0),
      supports:supports.map((position,i)=>({position,force:reactions[i],role:(i===0||i===supports.length-1?'CORNER':'TIE') as 'CORNER'|'TIE'})),bays};
  });
  const bays=faces.flatMap(f=>f.bays),bending=bays.reduce((a,b)=>a.moment>=b.moment?a:b),shear=bays.reduce((a,b)=>a.shear>=b.shear?a:b);
  const deflection=bays.reduce((a,b)=>a.deflection/a.length>=b.deflection/b.length?a:b);
  let maxTieForce=0,tieFaceId:string|null=null,maxCornerForce=0;
  for(const face of faces)for(const s of face.supports){
    if(s.role==='TIE'&&s.force>maxTieForce){maxTieForce=s.force;tieFaceId=face.faceId;}
    if(s.role==='CORNER')maxCornerForce=Math.max(maxCornerForce,s.force);
  }
  return {model:'PINNED_INDEPENDENT_BAYS',lineLoad:governing.lineLoad,verticalSpan:o.height/(zs.length-1),governingLevel:governing.depth,
    tributaryHeight:governing.tributary,levels,section,share:o.share,faces,bending,shear,deflection,
    stress:bending.moment/section.S,shearStress:shear.shear/section.shearArea,deflectionRatio:deflection.deflection/deflection.length,
    maxTieForce,tieFaceId,maxCornerForce};
}

/** Largest interior support reaction of a continuous beam with `spans` equal spans under uniform load, as a multiple of wL
 * (three-moment equation: M(i-1) + 4 M(i) + M(i+1) = -wL²/2, M = 0 at the ends). 2 spans → 1.25, 3 → 1.10, 4 → 1.143; 1 span → 1. */
export function continuousSupportFactor(spans: number): number {
  const n = Math.round(spans) - 1;
  if (n < 1) return 1;
  // Thomas algorithm for the tridiagonal system (w = L = 1).
  const c = new Array<number>(n).fill(0), d = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    const m = 4 - (i > 0 ? c[i - 1] : 0);
    c[i] = 1 / m; d[i] = (-0.5 - (i > 0 ? d[i - 1] : 0)) / m;
  }
  const M = new Array<number>(n + 2).fill(0);
  for (let i = n - 1; i >= 0; i--) M[i + 1] = d[i] - c[i] * M[i + 2];
  let best = 0;
  for (let i = 1; i <= n; i++) best = Math.max(best, 1 + M[i - 1] - 2 * M[i] + M[i + 1]);
  return best;
}
