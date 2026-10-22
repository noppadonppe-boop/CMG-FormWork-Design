import type {Face,Point} from './index.js';
import type {WalerAnalysis} from './mechanics.js';
export type ColumnModel='DEMAND_ONLY'|'PINNED_RING';
export type CornerRule='UNKNOWN'|'LINEAR';
export const columnDefaults={columnModel:'DEMAND_ONLY' as ColumnModel,yokeOmegaT:1.67,
  cornerCapacityX:0,cornerCapacityY:0,cornerRule:'UNKNOWN' as CornerRule,cornerReference:''};
export interface CornerDemand {
  id:string;point:Point;faces:[string,string];x:number;y:number;resultant:number;interaction:number|null;
  currentAxial:number|null;previousAxial:number|null;residualX:number|null;residualY:number|null;
  interfaceX:number|null;interfaceY:number|null;
}
export interface YokeMember {
  faceId:string;axialForce:number|null;axialStress:number|null;bendingStress:number;interaction:number|null;
}
export interface ColumnAnalysis {
  model:ColumnModel;corners:CornerDemand[];members:YokeMember[];
  maxX:number;maxY:number;maxResultant:number;cornerInteraction:number|null;
  memberInteraction:number|null;governingCorner:string;governingMember:string|null;
}
/** First-order equilibrium demand only; a four-pin ring's in-plane stability is NOT established. */
export function analyzeColumnYoke(faces:Pick<Face,'id'|'a'|'b'|'normal'>[],waler:WalerAnalysis,
  options:{model:ColumnModel;Fy:number;omegaT:number;omegaB:number;capacityX:number;capacityY:number;rule:CornerRule}):ColumnAnalysis {
  if(faces.length!==4||waler.faces.length!==4||!['DEMAND_ONLY','PINNED_RING'].includes(options.model)||
    !['UNKNOWN','LINEAR'].includes(options.rule)||[options.Fy,options.omegaT,options.omegaB].some(v=>!Number.isFinite(v)||v<=0)||
    [options.capacityX,options.capacityY].some(v=>!Number.isFinite(v)||v<0))throw Error('Invalid rectangular column model');
  const tangent=faces.map(f=>{const L=Math.hypot(f.b.x-f.a.x,f.b.y-f.a.y);return {x:(f.b.x-f.a.x)/L,y:(f.b.y-f.a.y)/L};});
  const rows=faces.map((f,i)=>{
    const prev=faces[(i+3)%4],t=tangent[i],tp=tangent[(i+3)%4],wf=waler.faces.find(q=>q.faceId===f.id);
    if(!wf||[f.a.x,f.a.y,f.b.x,f.b.y,f.normal.x,f.normal.y].some(v=>!Number.isFinite(v))||wf.supports.length<2||wf.supports[0].role!=='CORNER'||wf.supports.at(-1)!.role!=='CORNER'||wf.supports.slice(1,-1).some(s=>s.role!=='TIE')||wf.supports.some(s=>!Number.isFinite(s.position))||
      Math.hypot(prev.b.x-f.a.x,prev.b.y-f.a.y)>1e-6||
      !Number.isFinite(t.x)||!Number.isFinite(t.y)||Math.abs(t.x*tp.x+t.y*tp.y)>1e-8||
      Math.abs(f.normal.x-t.y)>1e-8||Math.abs(f.normal.y+t.x)>1e-8||
      Math.abs(wf.supports[0].position)>1e-6||Math.abs(wf.supports.at(-1)!.position-Math.hypot(f.b.x-f.a.x,f.b.y-f.a.y))>1e-6||
      wf.supports.some(s=>!Number.isFinite(s.force)||s.force<0))throw Error('Column yoke requires a closed CCW rectangle with corner supports at both ends of each face (through-tie supports allowed in between)');
    return wf;
  });
  const corners=faces.map((f,i):CornerDemand=>{
    // Corners carry the end reactions only; optional through ties take the interior supports.
    const j=(i+3)%4,p=faces[j],current=rows[i].supports[0].force,previous=rows[j].supports.at(-1)!.force;
    const x=current*f.normal.x+previous*p.normal.x,y=current*f.normal.y+previous*p.normal.y;
    // Q + Ni ti - Nj tj = 0 for perpendicular pin-ended side members.
    const Ni=-(x*tangent[i].x+y*tangent[i].y),Nj=x*tangent[j].x+y*tangent[j].y;
    const ring=options.model==='PINNED_RING';
    const interaction=options.rule==='LINEAR'&&options.capacityX>0&&options.capacityY>0?
      Math.abs(x)/(options.capacityX*1000)+Math.abs(y)/(options.capacityY*1000):null;
    return {id:'K'+(i+1),point:{...f.a},faces:[p.id,f.id],x,y,resultant:Math.hypot(x,y),interaction,
      currentAxial:ring?Ni:null,previousAxial:ring?Nj:null,
      residualX:ring?x+Ni*tangent[i].x-Nj*tangent[j].x:null,
      residualY:ring?y+Ni*tangent[i].y-Nj*tangent[j].y:null,
      interfaceX:ring?current*f.normal.x+Ni*tangent[i].x:null,
      interfaceY:ring?current*f.normal.y+Ni*tangent[i].y:null};
  });
  const members=faces.map((f,i):YokeMember=>{
    const start=corners[i].currentAxial,end=corners[(i+1)%4].previousAxial;
    if(start!==null&&end!==null&&(start<0||end<0||Math.abs(start-end)>1e-7*Math.max(1,start,end)))throw Error('Ring axial forces do not balance at both ends; this load topology is unsupported');
    const axialForce=start,axialStress=start===null?null:waler.share*start/waler.section.area;
    const bendingStress=Math.max(...rows[i].bays.map(b=>b.moment/waler.section.S));
    return {faceId:f.id,axialForce,axialStress,bendingStress,
      interaction:axialStress===null?null:axialStress/(options.Fy/options.omegaT)+bendingStress/(options.Fy/options.omegaB)};
  });
  const governingCorner=corners.reduce((a,b)=>a.resultant>=b.resultant?a:b);
  const governing=options.model==='PINNED_RING'?members.reduce((a,b)=>a.interaction!>=b.interaction!?a:b):null;
  return {model:options.model,corners,members,maxX:Math.max(...corners.map(c=>Math.abs(c.x))),maxY:Math.max(...corners.map(c=>Math.abs(c.y))),
    maxResultant:governingCorner.resultant,governingCorner:governingCorner.id,
    cornerInteraction:corners.every(c=>c.interaction!==null)?Math.max(...corners.map(c=>c.interaction!)):null,
    memberInteraction:governing?.interaction??null,governingMember:governing?.faceId??null};
}
