import React from 'react';
import type {WorkflowModel} from '../domain/workflowV07/model';
import type {documentView} from '../domain/workflowV07/snapshot';
import {pairFaces} from '../domain/workflowV07/geometry';
import {tieGeometryContext} from '../domain/workflowV07/tieDossier';
import {resolveMemberElastic, type ElasticMemberRole} from '../domain/workflowV07/elasticBinding';
import type {MemberStiffness} from '../domain/workflowV07/soffit';
import {ChainDim, Dim, Line, SectionMark, Table, Txt, ViewTitle, fitScale, poly, type Box, type V} from './primitives';
import {NoteBlock} from './views';

type FullView=Awaited<ReturnType<typeof documentView>>;
/** Drawings retain only authored geometry after the full snapshot is verified. */
export type InstallationView={report:Pick<FullView['report'],'model'>;drawing:Pick<FullView['drawing'],'topology'>;inputHash:string;snapshotHash:string};
export type InstallationSheet={code:string;title:string;body:React.ReactElement};
const navy='#173e62',teal='#167c80',amber='#a76b19',red='#a53a3a';
const f=(n:number|null|undefined)=>n==null?'ไม่ระบุ':n.toLocaleString('en-US',{maximumFractionDigits:2});
const label={FOOTING:'ฐานราก',COLUMN:'เสา',WALL:'ผนัง',BEAM:'คาน',SLAB:'พื้น'};
const chunks=<T,>(xs:T[],n:number)=>Array.from({length:Math.ceil(xs.length/n)},(_,i)=>xs.slice(i*n,(i+1)*n));
const unique=(ns:number[])=>[...new Set(ns)].sort((a,b)=>a-b);
function bounds(m:WorkflowModel){const x=m.vertices.map(p=>p.x),y=m.vertices.map(p=>p.y);return {x0:Math.min(...x),x1:Math.max(...x),y0:Math.min(...y),y1:Math.max(...y)};}
/** fitScale returns a denominator: model coordinates are DIVIDED by it. */
export function drawingProjection(points:V[],box:Box){
  const x0=Math.min(...points.map(p=>p[0])),x1=Math.max(...points.map(p=>p[0]));
  const y0=Math.min(...points.map(p=>p[1])),y1=Math.max(...points.map(p=>p[1]));
  const scale=fitScale(x1-x0,y1-y0,box.w,box.h);
  const left=box.x+(box.w-(x1-x0)/scale)/2,top=box.y+(box.h-(y1-y0)/scale)/2;
  return {scale,P:([x,y]:V):V=>[left+(x-x0)/scale,top+(y1-y)/scale]};
}
function extent(m:WorkflowModel):V[]{
  const b=bounds(m),d=m.soffitLayout;
  return [...m.vertices.map(p=>[p.x,p.y] as V),...(m.frameLayout?.nodes??[]).flatMap(n=>n.pointMm[0]!=null&&n.pointMm[1]!=null?[[n.pointMm[0],n.pointMm[1]] as V]:[]),
    ...(d?[[b.x0+(d.bearerStartXMm??0),b.y0+(d.joistStartYMm??0)],[b.x0+(d.bearerEndXMm??0),b.y0+(d.joistEndYMm??0)]] as V[]:[])];
}
export function drawingCuts(m:WorkflowModel){
  const b=bounds(m),inside=(xs:number[],lo:number,hi:number)=>xs.find(v=>v>lo+.1&&v<hi-.1)??(lo+hi)/2;
  return {x:inside(m.ringlock?.legs.map(l=>l.xMm)??[],b.x0,b.x1),y:inside(m.soffitLayout?.bearers.map(r=>b.y0+r.yMm)??[],b.y0,b.y1)};
}
/** Exact line/polygon intersection, including the empty notch of an L footing. */
export function cutIntervals(m:WorkflowModel,axis:'X'|'Y',station:number):[number,number][]{
  const u=(p:{x:number;y:number})=>axis==='X'?p.x:p.y,v=(p:{x:number;y:number})=>axis==='X'?p.y:p.x;
  const hits=m.vertices.flatMap((a,i)=>{const b=m.vertices[(i+1)%m.vertices.length];return ((v(a)<=station&&v(b)>station)||(v(b)<=station&&v(a)>station))?[u(a)+(station-v(a))*(u(b)-u(a))/(v(b)-v(a))]:[];}).sort((a,b)=>a-b);
  return Array.from({length:Math.floor(hits.length/2)},(_,i)=>[hits[2*i],hits[2*i+1]]);
}
// ---- Drafting standard: ISO 128 line weights; member colours match the FW/BF/SF/WF construction sets (src/drawing/views.tsx) ----
const INK='#111',PEN={cut:.6,outline:.45,member:.35,thin:.18,hair:.13};
const MC={stud:'#1d4e89',waler:'#9b1c1c',tie:'#1e7b34',ply:'#9a6a2c',shore:'#5b3f8c'};
const FILL={stud:'#dbe6f4',waler:'#fbeaea',shore:'#ece6f5',timber:'#ecd9b5',tie:MC.tie};
const DASHDOT='6 1.2 1 1.2';
function Stamp({view}:{view:InstallationView}){return <g data-drawing-revision={view.report.model.revisionId}>
  <Txt x={25} y={241} s={1.8}>REV {view.report.model.revisionId} · INPUT SHA-256 {view.inputHash}</Txt>
  <Txt x={25} y={246} s={1.65}>SNAPSHOT {view.snapshotHash} · MOCK-UP / NO_GO · ตัวอย่างรายละเอียดติดตั้งสำหรับตรวจแบบ</Txt>
</g>;}
function Title({title,sub}:{title:string;sub?:string}){return <><Txt x={25} y={31} s={3.6} b fill={navy}>{title}</Txt><Txt x={25} y={37} s={2.2}>{sub??'หน่วย mm · ระดับเป็นเมตร · ใช้ตัวเลขกำกับ ห้ามวัดจากแบบ · รายละเอียดและพิกัดจาก Design Revision เดียวกัน'}</Txt></>;}
export function memberName(s:{evidenceRef:string;binding?:unknown}|undefined){
  if(!s)return 'ไม่ระบุ';const b=s.binding as {section?:{effective?:Record<string,unknown>}|null;nominalLabel?:string}|null|undefined;
  return String(b?.section?.effective?.section_id??(b?.nominalLabel||s.evidenceRef.split(' · ')[0]||'ไม่ระบุ'));
}
/** "n @ s" when the stations are equally spaced, otherwise the range of spacings. */
export function spacing(xs:number[]){const v=unique(xs);if(v.length<2)return '';const d=v.slice(1).map((x,i)=>x-v[i]),eq=d.every(s=>Math.abs(s-d[0])<.5);
  return eq?`${d.length} @ ${f(d[0])}`:`@ ${f(Math.min(...d))}–${f(Math.max(...d))}`;}
/** Grid lines closer than 9 mm on paper would overlap their bubbles: keep the first and the next one far enough away. */
const thin=(xs:number[],scale:number)=>xs.filter((x,i)=>i===0||xs.slice(0,i).every(p=>Math.abs(x-p)/scale>=9));
export const level=(z:number)=>(z>=0?'+':'−')+(Math.abs(z)/1000).toFixed(3);
function GridAxis({a,b,label,at='a'}:{a:V;b:V;label:string;at?:'a'|'b'}){
  const p=at==='a'?a:b,q=at==='a'?b:a,len=Math.hypot(q[0]-p[0],q[1]-p[1])||1,u:V=[(p[0]-q[0])/len,(p[1]-q[1])/len],c:V=[p[0]+u[0]*3.4,p[1]+u[1]*3.4];
  return <g data-grid={label}><Line a={a} b={b} w={PEN.thin} dash={DASHDOT} color={INK}/>
    <circle cx={c[0]} cy={c[1]} r={3.4} fill="#fff" stroke={INK} strokeWidth={PEN.member}/><Txt x={c[0]} y={c[1]+1} s={label.length>1?2.4:3} a="middle" b>{label}</Txt></g>;
}
/** Level mark: open triangle on the reference line, value in metres above, description below. */
function LevelMark({x,y,value,note,right=false}:{x:number;y:number;value:number;note:string;right?:boolean}){
  const d=right?1:-1,end=x+d*22;
  return <g data-level={value}><Line a={[x,y]} b={[end,y]} w={PEN.thin} color={INK}/>
    <path d={`M${x+d*4} ${y}l-1.6 -2.6h3.2z`} fill="#fff" stroke={INK} strokeWidth={PEN.thin}/>
    <Txt x={x+d*7} y={y-1.2} s={2.1} a={right?'start':'end'} b>{level(value)}</Txt><Txt x={x+d*7} y={y+2.8} s={1.7} a={right?'start':'end'} fill="#333">{note}</Txt></g>;
}
/** Level marks; levels closer than 7 mm on paper share one stacked label so texts never overlap. */
function LevelMarks({x,items}:{x:number;items:{y:number;value:number;note:string}[]}){
  const sorted=[...items].sort((p,q)=>p.y-q.y),groups:typeof sorted[]=[];
  for(const it of sorted){const g0=groups[groups.length-1];if(g0&&it.y-g0[g0.length-1].y<7)g0.push(it);else groups.push([it]);}
  return <g>{groups.map((g0,gi)=>g0.length===1?<LevelMark key={gi} x={x} y={g0[0].y} value={g0[0].value} note={g0[0].note}/>:<g key={gi} data-level-group>
    {g0.map(it=><g key={it.value} data-level={it.value}><Line a={[x,it.y]} b={[x-22,it.y]} w={PEN.thin} color={INK}/><path d={`M${x-4} ${it.y}l-1.6 -2.6h3.2z`} fill="#fff" stroke={INK} strokeWidth={PEN.thin}/></g>)}
    {g0.map((it,i)=><Txt key={'t'+it.value} x={x-7} y={g0[0].y-2-(g0.length-1-i)*3.3} s={1.9} a="end"><tspan fontWeight={700}>{level(it.value)}</tspan> {it.note}</Txt>)}</g>)}</g>;
}
function ScaleBar({x,y,scale}:{x:number;y:number;scale:number}){
  const nice=[50,100,200,250,500,1000,2000,2500,5000],seg=nice.find(n=>n/scale>=8)??10000,w=seg/scale;
  return <g data-scale-bar={scale}>{[0,1,2,3].map(i=><rect key={i} x={x+i*w} y={y} width={w} height={1.6} fill={i%2?'#fff':INK} stroke={INK} strokeWidth={PEN.thin}/>)}
    {[0,1,2,3,4].map(i=><Txt key={i} x={x+i*w} y={y+4.6} s={1.7} a="middle">{f(i*seg/1000)}</Txt>)}<Txt x={x+4*w+3} y={y+1.6} s={1.8}>m · 1:{scale}</Txt></g>;
}
function NorthArrow({x,y}:{x:number;y:number}){return <g data-north><circle cx={x} cy={y} r={5} fill="none" stroke={INK} strokeWidth={PEN.thin}/>
  <path d={`M${x} ${y-6}l2.4 9.5l-2.4 -2l-2.4 2z`} fill={INK}/><Txt x={x} y={y-7.5} s={2.4} a="middle" b>N</Txt></g>;}
/** Tag in a circle (shore, tie, waler references). */
function Tag({p,text,r=1.9}:{p:V;text:string;r?:number}){return <g><circle cx={p[0]} cy={p[1]} r={r} fill="#fff" stroke={INK} strokeWidth={PEN.thin}/><Txt x={p[0]} y={p[1]+.7} s={r*.95} a="middle">{text}</Txt></g>;}
function ShoreSymbol({p}:{p:V}){return <g><rect x={p[0]-1.6} y={p[1]-1.6} width={3.2} height={3.2} fill={FILL.shore} stroke={MC.shore} strokeWidth={PEN.member}/>
  <path d={`M${p[0]-1.6} ${p[1]-1.6}l3.2 3.2M${p[0]+1.6} ${p[1]-1.6}l-3.2 3.2`} stroke={MC.shore} strokeWidth={PEN.thin}/></g>;}
type Callout={from:V;text:string;sub?:string;lines?:string[]};
const calloutHeight=(c:Callout)=>5.2+(c.sub?3.1:0)+(c.lines?.length??0)*3.1;
/** Leader notes in a column; a stack of layers (plywood / joist / bearer) is one note with several lines. */
function Callouts({items,x,y}:{items:Callout[];x:number;y:number}){
  let ty=y;
  return <g data-callouts>{[...items].sort((p,q)=>p.from[1]-q.from[1]).map((c,i)=>{const row=ty;ty+=calloutHeight(c);return <g key={i}><circle cx={c.from[0]} cy={c.from[1]} r={.5} fill={INK}/>
    <polyline points={poly([c.from,[x-3,row],[x,row]])} fill="none" stroke={INK} strokeWidth={PEN.hair}/>
    <Txt x={x+.8} y={row+.8} s={2.1}>{c.text}</Txt>{c.sub&&<Txt x={x+.8} y={row+3.9} s={1.7} fill="#333">{c.sub}</Txt>}
    {c.lines?.map((l,j)=><Txt key={j} x={x+.8} y={row+.8+(c.sub?3.1:0)+(j+1)*3.1} s={1.9}>{l}</Txt>)}</g>;})}</g>;
}
function LegendRow({y,x,kind,text}:{y:number;x:number;kind:'concrete'|'plywood'|'joist'|'bearer'|'shore'|'tie'|'grid'|'stud'|'waler';text:string}){
  const s=<g>{kind==='concrete'?<rect x={x} y={y-2} width={9} height={4} fill="url(#h-concrete)" stroke={INK} strokeWidth={PEN.cut}/>:
    kind==='plywood'?<rect x={x} y={y-2} width={9} height={4} fill="url(#h-plywood)" stroke={MC.ply} strokeWidth={PEN.thin}/>:
    kind==='joist'||kind==='stud'?<rect x={x} y={y-2} width={9} height={4} fill={FILL.stud} stroke={MC.stud} strokeWidth={PEN.member}/>:
    kind==='bearer'||kind==='waler'?<rect x={x} y={y-2} width={9} height={4} fill={FILL.waler} stroke={MC.waler} strokeWidth={PEN.member}/>:
    kind==='shore'?<ShoreSymbol p={[x+4.5,y]}/>:kind==='tie'?<><Line a={[x,y]} b={[x+9,y]} w={PEN.member} dash="3 1" color={MC.tie}/><rect x={x+7.9} y={y-1.1} width={2.2} height={2.2} fill={MC.tie}/></>:
    <Line a={[x,y]} b={[x+9,y]} w={PEN.thin} dash={DASHDOT} color={INK}/>}</g>;
  return <g>{s}<Txt x={x+12} y={y+.9} s={2.1}>{text}</Txt></g>;
}
/** Tie / support point: plate with the rod centre, as in the FW elevation. */
function Marker({p,id}:{p:V;id:string}){return <g><rect x={p[0]-1.2} y={p[1]-1.2} width={2.4} height={2.4} fill="#fff" stroke={MC.tie} strokeWidth={PEN.member}/><circle cx={p[0]} cy={p[1]} r={.55} fill={MC.tie}/>{id&&<Txt x={p[0]+2} y={p[1]-2} s={1.8}>{id}</Txt>}</g>;}

/** Side forms in plan. Members are drawn at a fixed paper offset (NTS) so they stay legible at every scale; positions are true. */
function FacePlan({m,P,scale}:{m:WorkflowModel;P:(p:V)=>V;scale:number}){
  const topology=pairFaces(m.vertices,m.heightMm),d=m.sideLayout;
  if(!d)return null;
  const o=(mm:number)=>mm*scale;
  return <g data-face-plan>{d.faces.map(l=>{const face=topology.faces.find(f=>f.id===l.faceId)!;const point=(s:number,offset=0):V=>[face.a.x+(face.b.x-face.a.x)*s/face.lengthMm+face.normal.x*offset,face.a.y+(face.b.y-face.a.y)*s/face.lengthMm+face.normal.y*offset];
    const band=(s0:number,s1:number,a:number,b:number)=>poly([point(s0,o(a)),point(s1,o(a)),point(s1,o(b)),point(s0,o(b))].map(P));
    const mid=P(point(face.lengthMm/2,o(6)));
    return <g key={l.faceId} data-face={l.faceId}>
      <polygon points={band(0,face.lengthMm,0,.8)} fill="url(#h-plywood)" stroke={MC.ply} strokeWidth={PEN.thin}/>
      {l.studPositionsMm.map((s,i)=><Line key={i} a={P(point(s,o(.8)))} b={P(point(s,o(2.4)))} color={MC.stud} w={PEN.outline}/>)}
      <polygon points={band(-o(1.5),face.lengthMm+o(1.5),2.5,3.1)} fill={FILL.waler} stroke={MC.waler} strokeWidth={PEN.thin}/>
      <polygon points={band(-o(1.5),face.lengthMm+o(1.5),3.4,4.0)} fill={FILL.waler} stroke={MC.waler} strokeWidth={PEN.thin}/>
      <Txt x={mid[0]} y={mid[1]+.9} s={2.3} a="middle" b>{face.id}</Txt>
    </g>;})}
    {d.ties.filter(t=>t.a.walerId===d.faces.find(f=>f.faceId===t.a.faceId)?.walers[0]?.id).map((t,i)=>{
      const c=tieGeometryContext(topology,d,t);const endpoint=(e:typeof t.a):V=>{const face=topology.faces.find(f=>f.id===e.faceId)!,row=d.faces.find(f=>f.faceId===e.faceId)!.walers.find(w=>w.id===e.walerId)!,s=row.supports.find(s=>s.id===e.supportId)!;return [face.a.x+(face.b.x-face.a.x)*s.xMm/face.lengthMm,face.a.y+(face.b.y-face.a.y)*s.xMm/face.lengthMm];};
      const A=P(endpoint(t.a)),B=P(endpoint(t.b));
      return <g key={t.id} data-tie={t.id}><Line a={A} b={B} color={MC.tie} dash="3 1" w={PEN.member}/>{[A,B].map((q,k)=><rect key={k} x={q[0]-1.1} y={q[1]-1.1} width={2.2} height={2.2} fill={MC.tie}/>)}
        <Txt x={(A[0]+B[0])/2+1.2} y={(A[1]+B[1])/2-1.2} s={1.5}>T{i+1} · {f(c.chordMm)}</Txt></g>;
    })}
  </g>;
}

function Plan({view}:{view:InstallationView}){
  const m=view.report.model,b=bounds(m),d=m.soffitLayout,cuts=drawingCuts(m),leg=m.ringlockAssembly?.legs[0],head=leg?.headBearing,side=m.sideLayout;
  const {P,scale}=drawingProjection(extent(m),{x:62,y:64,w:192,h:128});
  // Side-form symbols and face labels sit up to 8 mm outside the concrete on paper; dimensions and grids start beyond them.
  const pad=side?8:0,E=extent(m).map(P),sx0=Math.min(...E.map(p=>p[0]))-pad,sx1=Math.max(...E.map(p=>p[0]))+pad,sy0=Math.min(...E.map(p=>p[1]))-pad,sy1=Math.max(...E.map(p=>p[1]))+pad;
  const gx=thin(unique(m.vertices.map(v=>v.x)),scale),gy=thin(unique(m.vertices.map(v=>v.y)),scale),legsX=unique(m.ringlock?.legs.map(l=>l.xMm)??[]);
  const bw=head?.bearerWidthMm??null;
  const callouts:Callout[]=[];
  if(d){
    const jx=b.x0+d.joistXMm[Math.min(1,d.joistXMm.length-1)],r0=d.bearers[0];
    callouts.push({from:P([b.x0+(b.x1-b.x0)*.62,b.y0+(b.y1-b.y0)*.55]),text:`คอนกรีต${label[m.elementType]} หนา/สูง ${f(m.heightMm)}`,sub:`ท้องคอนกรีต ${level(leg?.soffitElevationMm??0)}`});
    callouts.push({from:P([jx,b.y0+d.joistEndYMm!-(d.joistEndYMm!-d.joistStartYMm!)*.15]),text:`คร่าวท้อง ${memberName(m.soffitLayout!.joist)}`,sub:`${spacing(d.joistXMm)} (ตามแนว X)`});
    if(r0)callouts.push({from:P([b.x0+d.bearerStartXMm!+(d.bearerEndXMm!-d.bearerStartXMm!)*.8,b.y0+r0.yMm]),text:`คานรับ ${memberName(m.soffitLayout!.bearer)}${bw?` · กว้าง ${f(bw)}`:''}`,sub:`${spacing(d.bearers.map(r=>r.yMm))} (ตามแนว Y)`});
    const l0=m.ringlock?.legs[0];if(l0)callouts.push({from:P([l0.xMm,l0.yMm]),text:`ค้ำยัน ${m.ringlock!.manufacturer} ${m.ringlock!.systemId}`,sub:`${m.ringlock!.legs.length} ต้น · ${spacing(legsX)} (แนว X)`});
  }
  if(side){
    // Leaders point at the right-most face so they do not cross the drawing.
    const f0=side.faces[0],faces=pairFaces(m.vertices,m.heightMm).faces,rf=faces.reduce((p,q)=>(q.a.x+q.b.x)>(p.a.x+p.b.x)?q:p,faces[0]);
    const on=(tt:number,off:number):V=>P([rf.a.x+(rf.b.x-rf.a.x)*tt+rf.normal.x*off*scale,rf.a.y+(rf.b.y-rf.a.y)*tt+rf.normal.y*off*scale]);
    callouts.push({from:on(.3,.4),text:`ไม้อัด ${f(f0?.plywood.thicknessMm)} mm · คร่าว ${memberName(f0?.stud)}`,sub:`คร่าว ${spacing(f0?.studPositionsMm??[])} · ดูรูปด้าน`});
    callouts.push({from:on(.62,3.4),text:`คานรัด ${memberName(f0?.rail)} (คู่)`,sub:`${f0?.walers.length??0} ระดับ · ดูรูปตัดและรูปด้าน`});
    if(side.ties.length)callouts.push({from:on(.85,-2),text:`ไทร์ ${side.ties.length} ชุด · Ø${f(side.ties[0].diameterMm)}`,sub:'เส้นประ = ไทร์ระดับคานรัดแรก · ตารางไทร์ แผ่น T'});
  }
  return <><Title title={`แปลนติดตั้งแบบหล่อ${label[m.elementType]}`} sub={`แปลน 1:${scale} · แกนอ้างอิงตามจุดมุมคอนกรีต · ระดับเป็นเมตร · ห้ามวัดขนาดจากแบบ`}/>
    <g data-view="installation-plan" data-scale-denominator={scale}>
      {gx.map((x,i)=><GridAxis key={'gx'+i} a={[P([x,0])[0],sy0-15]} b={[P([x,0])[0],sy1+6]} label={String(i+1)}/>)}
      {gy.map((y,i)=><GridAxis key={'gy'+i} a={[sx1+16,P([0,y])[1]]} b={[sx0-6,P([0,y])[1]]} label={'Y'+(i+1)}/>)}
      <polygon points={poly(m.vertices.map(p=>P([p.x,p.y])))} fill="url(#h-concrete)" stroke={INK} strokeWidth={PEN.cut}/>
      {d&&<>{d.joistXMm.map((x,i)=><Line key={i} a={P([b.x0+x,b.y0+d.joistStartYMm!])} b={P([b.x0+x,b.y0+d.joistEndYMm!])} color={MC.stud} w={PEN.member}/>)}
        {d.bearers.map(r=>{const y=b.y0+r.yMm,x0=b.x0+d.bearerStartXMm!,x1=b.x0+d.bearerEndXMm!,h=bw?Math.max(bw/2,.35*scale):.35*scale;
          return <g key={r.id}><polygon points={poly([[x0,y-h],[x1,y-h],[x1,y+h],[x0,y+h]].map(p=>P(p as V)))} fill={FILL.waler} stroke={MC.waler} strokeWidth={PEN.member}/>
            <Txt x={P([x1,y])[0]+2} y={P([x1,y])[1]+.8} s={1.9}>{r.id}</Txt></g>;})}
        {m.ringlock?.legs.map((l,i)=><g key={l.id}><ShoreSymbol p={P([l.xMm,l.yMm])}/><Txt x={P([l.xMm,l.yMm])[0]+2.2} y={P([l.xMm,l.yMm])[1]-2} s={1.6}>H{i+1}</Txt></g>)}</>}
      <FacePlan m={m} P={P} scale={scale}/>
      {m.frameLayout?.elements.filter(()=>!d).map(e=>{const a=m.frameLayout!.nodes.find(n=>n.id===e.nodeI)?.pointMm,c=m.frameLayout!.nodes.find(n=>n.id===e.nodeJ)?.pointMm;return a&&c&&a[0]!=null&&a[1]!=null&&c[0]!=null&&c[1]!=null?<Line key={e.id} a={P([a[0],a[1]])} b={P([c[0],c[1]])} color={INK} w={PEN.member}/>:null;})}
      {m.frameLayout&&!d&&m.frameLayout.nodes.filter(nd=>nd.role==='BASE'&&nd.pointMm[0]!=null&&nd.pointMm[1]!=null).map(nd=><ShoreSymbol key={nd.id} p={P([nd.pointMm[0]!,nd.pointMm[1]!])}/>)}
      {gx.length>2&&<ChainDim pts={gx.map(x=>P([x,b.y0]))} values={gx.slice(1).map((x,i)=>x-gx[i])} o={[0,sy1-P([0,b.y0])[1]+7]} s={1.9}/>}
      <Dim a={P([b.x0,b.y0])} b={P([b.x1,b.y0])} o={[0,sy1-P([0,b.y0])[1]+(gx.length>2?14:8)]} text={f(b.x1-b.x0)} s={2.3}/>
      {gy.length>2&&<ChainDim pts={gy.map(y=>P([b.x0,y]))} values={gy.slice(1).map((y,i)=>y-gy[i])} o={[sx0-P([b.x0,0])[0]-7,0]} s={1.9}/>}
      <Dim a={P([b.x0,b.y0])} b={P([b.x0,b.y1])} o={[sx0-P([b.x0,0])[0]-(gy.length>2?14:8),0]} text={f(b.y1-b.y0)} s={2.3}/>
      {d&&legsX.length>1&&<ChainDim pts={legsX.map(x=>P([x,b.y0]))} values={legsX.slice(1).map((x,i)=>x-legsX[i])} o={[0,sy1-P([0,b.y0])[1]+(gx.length>2?21:15)]} s={1.9}/>}
      {d&&d.bearers.length>1&&<ChainDim pts={d.bearers.map(r=>P([b.x0,b.y0+r.yMm]))} values={d.bearers.slice(1).map((r,i)=>r.yMm-d.bearers[i].yMm)} o={[sx0-P([b.x0,0])[0]-(gy.length>2?21:15),0]} s={1.9}/>}
      {d&&d.joistXMm.length>1&&<ChainDim pts={d.joistXMm.map(x=>P([b.x0+x,b.y1]))} values={d.joistXMm.slice(1).map((x,i)=>x-d.joistXMm[i])} o={[0,sy0-P([0,b.y1])[1]-5]} s={1.8}/>}
      <SectionMark a={[sx0-30,P([0,cuts.y])[1]]} b={[sx1+28,P([0,cuts.y])[1]]} id="A" view={[0,-1]}/>
      <SectionMark a={[P([cuts.x,0])[0],sy1+28]} b={[P([cuts.x,0])[0],sy0-26]} id="B" view={[1,0]}/>
      <Callouts items={callouts} x={300} y={84}/>
    </g>
    <NorthArrow x={398} y={56}/><ScaleBar x={300} y={52} scale={scale}/>
    <Txt x={300} y={76} s={2.6} b>รายการสมาชิก (CALLOUTS)</Txt>
    <g><Txt x={300} y={146} s={2.6} b>สัญลักษณ์ (LEGEND)</Txt>
      {([['concrete','คอนกรีต (เส้นตัดหนา 0.6)'],['plywood','ไม้อัดแบบข้าง/ท้อง'],[d?'joist':'stud',d?'คร่าวท้อง':'คร่าว'],[d?'bearer':'waler',d?'คานรับท้อง (กว้างจริง)':'คานรัดคู่'],...(d||m.frameLayout?[['shore',d?'ค้ำยัน / ฐานค้ำ (H)':'ฐานค้ำเฉียง']]:[]),...(side?.ties.length?[['tie','ไทร์ทะลุ']]:[]),['grid','แกนอ้างอิง']] as [Parameters<typeof LegendRow>[0]['kind'],string][]).map(([k,t],i)=><LegendRow key={k} kind={k} text={t} x={300} y={152+i*6}/>)}
    </g>
    <NoteBlock x={300} y={196} w={103} title="หมายเหตุแปลน" s={1.9} items={[
      `A–A ตัดที่ Y = ${f(cuts.y)} · B–B ตัดที่ X = ${f(cuts.x)}`,
      side?'สมาชิกแบบข้างแสดงด้วยสัญลักษณ์ขยาย (NTS) ตำแหน่งตามจริง':'คร่าว/คานรับ/ค้ำยันอยู่ใต้ท้องคอนกรีต แสดงตำแหน่งจริง',
      m.sideTopology==='COLUMN_YOKE'?'วงรัดอยู่นอกผิวคอนกรีต ไม่มีไทร์ทะลุเสา':m.sideTopology==='GROUND_BRACED'?'ค้ำเฉียงแสดงตามเส้นที่บันทึกในเฟรม':'จุดต่อและชุดไทร์ดูแผ่นรายละเอียด',
    ]}/>
    <Txt x={62} y={229} s={2}>พิกัดขอบคอนกรีต X {f(b.x0)}…{f(b.x1)} · Y {f(b.y0)}…{f(b.y1)} · ระบบ {m.sideTopology??'SOFFIT / SHORING'}</Txt><Stamp view={view}/>
  </>;
}

function Section({view,axis,box,n}:{view:InstallationView;axis:'X'|'Y';box:Box;n:string}){
  const m=view.report.model,b=bounds(m),d=m.soffitLayout,l=m.ringlockAssembly?.legs[0],cuts=drawingCuts(m),stack=l?.upperStack,head=l?.headBearing;
  const soffit=l?.soffitElevationMm??m.sideLayout?.baseElevationMm??0,top=soffit+m.heightMm,base=d?.baseElevationMm??m.sideLayout?.baseElevationMm??0;
  const k=axis==='X'?0:1,ext=extent(m),lo=Math.min(...ext.map(p=>p[k])),hi=Math.max(...ext.map(p=>p[k]));
  const inner={x:box.x+26,y:box.y+16,w:box.w-50,h:box.h-46};
  const {P,scale}=drawingProjection([[lo,base],[hi,top]],inner),station=axis==='X'?cuts.y:cuts.x;
  const intervals=cutIntervals(m,axis,station),R=(x0:number,z0:number,x1:number,z1:number)=>{const p=P([Math.min(x0,x1),Math.max(z0,z1)]),q=P([Math.max(x0,x1),Math.min(z0,z1)]);return {x:p[0],y:p[1],width:Math.max(q[0]-p[0],.25),height:Math.max(q[1]-p[1],.25)};};
  const ply=stack?.plywoodThicknessMm??0,jd=stack?.joistDepthMm??0,bd=stack?.bearerDepthMm??head?.bearerDepthMm??0,headZ=d?.headNodeElevationMm??null;
  const levels=unique([base,...(headZ!=null?[headZ]:[]),soffit,top]),sxL=P([lo,0])[0],sxR=P([hi,0])[0];
  const baseXs=unique(m.frameLayout?.nodes.filter(nd=>nd.role==='BASE'&&nd.pointMm[k]!=null).map(nd=>nd.pointMm[k]!)??[]);
  const leaders:Callout[]=[];
  if(intervals[0])leaders.push({from:P([(intervals[0][0]+intervals[0][1])/2,top-m.heightMm*.35]),text:`คอนกรีต ${f(m.heightMm)}`});
  if(d&&stack)leaders.push({from:P([lo+(hi-lo)*.82,headZ!+bd/2]),text:'ชั้นแบบท้อง (บนลงล่าง)',lines:[`ไม้อัด ${f(ply)} mm`,`คร่าว ${memberName(m.soffitLayout!.joist)} ลึก ${f(jd)} ${spacing(d.joistXMm)}`,`คานรับ ${memberName(m.soffitLayout!.bearer)}${head?` ${f(head.bearerWidthMm)}×${f(head.bearerDepthMm)}`:''} ${spacing(d.bearers.map(r=>r.yMm))}`]});
  if(m.sideLayout&&intervals.length){const xr=intervals[intervals.length-1][1],f0=m.sideLayout.faces[0],zw=f0?.walers[0]?m.sideLayout.baseElevationMm!+f0.walers[0].zMm:soffit+m.heightMm/2;
    leaders.push({from:[P([xr,0])[0]+4,P([0,zw])[1]],text:'ชั้นแบบข้าง (จากผิวคอนกรีต)',lines:[`ไม้อัด ${f(f0?.plywood.thicknessMm)} mm`,`คร่าว ${memberName(f0?.stud)} ${spacing(f0?.studPositionsMm??[])}`,`คานรัดคู่ ${memberName(f0?.rail)} · ${f0?.walers.length??0} ระดับ`]});}
  if(baseXs.length)leaders.push({from:P([baseXs[0],base+(soffit-base)*.4]),text:d?`ค้ำยัน ${m.ringlock?.systemId??''}`:'ค้ำเฉียง/เฟรม',sub:l?`หัวยืด ${f(l.headJack.extensionMm)} · ฐานยืด ${f(l.baseJack.extensionMm)}`:undefined});
  return <g data-view={`section-${axis}`} data-scale-denominator={scale}>
    <rect x={P([lo,0])[0]-12} y={P([0,base])[1]} width={sxR-sxL+24} height={2.2} fill="url(#h-ground)"/>
    <Line a={[sxL-12,P([0,base])[1]]} b={[sxR+12,P([0,base])[1]]} w={PEN.cut} color={INK}/>
    {intervals.map(([a,c],i)=><rect key={i} {...R(a,soffit,c,top)} fill="url(#h-concrete)" stroke={INK} strokeWidth={PEN.cut}/>)}
    {d&&<>{axis==='Y'&&m.elementType==='BEAM'&&m.slabThicknessMm!>0&&[[b.y0+d.concreteStripStartYMm!,b.y0],[b.y1,b.y0+d.concreteStripStartYMm!+m.concreteStripMm!]].filter(([a,c])=>c>a).map(([a,c],i)=><rect key={'s'+i} {...R(a,top-m.slabThicknessMm!,c,top)} fill="url(#h-concrete)" stroke={INK} strokeWidth={PEN.cut}/>)}
      {ply>0&&<rect {...R(axis==='X'?b.x0+d.bearerStartXMm!:b.y0+d.joistStartYMm!,soffit-ply,axis==='X'?b.x0+d.bearerEndXMm!:b.y0+d.joistEndYMm!,soffit)} fill="url(#h-plywood)" stroke={MC.ply} strokeWidth={PEN.thin}/>}
      {headZ!=null&&(axis==='X'?<>{d.joistXMm.map(x=>{const w=Math.min(jd||60,60);return <rect key={x} {...R(b.x0+x-w/2,headZ+bd,b.x0+x+w/2,headZ+bd+jd)} fill={FILL.stud} stroke={MC.stud} strokeWidth={PEN.member}/>;})}
        <rect {...R(b.x0+d.bearerStartXMm!,headZ,b.x0+d.bearerEndXMm!,headZ+bd)} fill={FILL.waler} stroke={MC.waler} strokeWidth={PEN.member}/></>:<>
        <rect {...R(b.y0+d.joistStartYMm!,headZ+bd,b.y0+d.joistEndYMm!,headZ+bd+jd)} fill={FILL.stud} stroke={MC.stud} strokeWidth={PEN.member}/>
        {d.bearers.map(r=>{const w=head?.bearerWidthMm??bd;return <rect key={r.id} {...R(b.y0+r.yMm-w/2,headZ,b.y0+r.yMm+w/2,headZ+bd)} fill={FILL.waler} stroke={MC.waler} strokeWidth={PEN.member}/>;})}</>)}
    </>}
    {m.frameLayout?.elements.map(e=>{const a=m.frameLayout!.nodes.find(nd=>nd.id===e.nodeI)?.pointMm,c=m.frameLayout!.nodes.find(nd=>nd.id===e.nodeJ)?.pointMm;
      const heavy=['STANDARD','HEAD_JACK','BASE_JACK'].includes(String(e.role));
      return a&&c&&a[k]!=null&&a[2]!=null&&c[k]!=null&&c[2]!=null?<Line key={e.id} a={P([a[k],a[2]])} b={P([c[k],c[2]])} color={heavy?MC.shore:'#6d5a92'} w={heavy?PEN.outline:PEN.thin}/>:null;})}
    {baseXs.map(x=>{const p=P([x,base]);return <path key={x} d={`M${p[0]-2.6},${p[1]}h5.2M${p[0]-1.6},${p[1]-.9}h3.2`} fill="none" stroke={INK} strokeWidth={PEN.outline}/>;})}
    {m.sideLayout&&intervals.flatMap(([a,c],i)=>[a,c].map((x,j)=>{const sign=j===0?-1:1,p=P([x,soffit]),q=P([x,top]);
      const face=view.drawing.topology.faces.find(fc=>{const u=axis==='X'?'x':'y',v=axis==='X'?'y':'x';return Math.abs(fc.a[u]-x)<.01&&Math.abs(fc.b[u]-x)<.01&&station>=Math.min(fc.a[v],fc.b[v])&&station<=Math.max(fc.a[v],fc.b[v]);});
      const walers=m.sideLayout!.faces.find(fc=>fc.faceId===face?.id)?.walers??[];
      return <g key={`${i}:${j}`} data-section-side-edge={x}>
        <rect x={Math.min(p[0],p[0]+sign*.8)} y={q[1]} width={.8} height={p[1]-q[1]} fill="url(#h-plywood)" stroke={MC.ply} strokeWidth={PEN.thin}/>
        <rect x={Math.min(p[0]+sign*.8,p[0]+sign*2.4)} y={q[1]} width={1.6} height={p[1]-q[1]} fill={FILL.stud} stroke={MC.stud} strokeWidth={PEN.member}/>
        {walers.map(w=>{const z=m.sideLayout!.baseElevationMm!+w.zMm,r=P([x,z]),x0=sign<0?r[0]-5.6:r[0]+2.4;
          return <g key={w.id} data-waler-z={z}><rect x={x0} y={r[1]-2.1} width={3.2} height={1.8} fill={FILL.waler} stroke={MC.waler} strokeWidth={PEN.thin}/><rect x={x0} y={r[1]+.3} width={3.2} height={1.8} fill={FILL.waler} stroke={MC.waler} strokeWidth={PEN.thin}/></g>;})}
      </g>;}))}
    {m.sideLayout&&m.sideTopology!=='COLUMN_YOKE'&&m.sideLayout.ties.length>0&&intervals.length>0&&unique((m.sideLayout.faces[0]?.walers??[]).map(w=>m.sideLayout!.baseElevationMm!+w.zMm)).map(z=>
      <Line key={'t'+z} a={[P([intervals[0][0],z])[0]-6,P([0,z])[1]]} b={[P([intervals[intervals.length-1][1],z])[0]+6,P([0,z])[1]]} w={PEN.member} color={MC.tie}/>)}
    <LevelMarks x={sxL-6} items={levels.map(z=>({y:P([0,z])[1],value:z,note:z===base?'ฐาน':z===top?'ผิวบนคอนกรีต':z===soffit?(d?'ท้องคอนกรีต':'ฐานแบบข้าง'):'หัวค้ำยัน'}))}/>
    {levels.length>2&&<ChainDim pts={levels.map(z=>P([hi,z]))} values={levels.slice(1).map((z,i)=>z-levels[i])} o={[7,0]} s={1.9}/>}
    <Dim a={P([hi,base])} b={P([hi,top])} o={[levels.length>2?14:7,0]} text={f(top-base)} s={2.1}/>
    {baseXs.length>2&&<ChainDim pts={baseXs.map(x=>P([x,base]))} values={baseXs.slice(1).map((x,i)=>x-baseXs[i])} o={[0,7]} s={1.9}/>}
    <Dim a={P([lo,base])} b={P([hi,base])} o={[0,baseXs.length>2?14:8]} text={f(hi-lo)} s={2.1}/>
    <Callouts items={leaders} x={box.x+box.w-54} y={box.y-2}/>
    <ViewTitle x={box.x} y={box.y+box.h+8} n={n} title={`รูปตัด ${axis==='X'?'A–A':'B–B'}`} scale={scale} sub={`ตัด ${axis==='X'?'Y':'X'} = ${f(station)}`}/>
  </g>;
}
function Sections({view}:{view:InstallationView}){return <><Title title="รูปตัดตามยาวและตามขวาง"/><Section view={view} axis="X" box={{x:26,y:52,w:182,h:162}} n="A"/><Section view={view} axis="Y" box={{x:216,y:52,w:182,h:162}} n="B"/><Stamp view={view}/></>;}
function Elevation({view,index,box}:{view:InstallationView;index:number;box:Box}){
  const m=view.report.model,fl=m.sideLayout!.faces[index],face=view.drawing.topology.faces.find(fc=>fc.id===fl.faceId)!,z0=m.sideLayout!.baseElevationMm!,H=m.heightMm;
  const inner={x:box.x+22,y:box.y+4,w:box.w-46,h:box.h-30};
  const {P,scale}=drawingProjection([[0,z0],[face.lengthMm,z0+H]],inner),zs=fl.walers.map(w=>z0+w.zMm),levels=unique([z0,...zs,z0+H]);
  const studBand=Math.max(.6,(face.lengthMm/scale)/Math.max(60,fl.studPositionsMm.length*4));
  return <g data-view={`elevation-${fl.faceId}`}>
    <rect x={P([0,0])[0]-8} y={P([0,z0])[1]} width={face.lengthMm/scale+16} height={2} fill="url(#h-ground)"/>
    <Line a={[P([0,0])[0]-8,P([0,z0])[1]]} b={[P([face.lengthMm,0])[0]+8,P([0,z0])[1]]} w={PEN.cut} color={INK}/>
    <polygon points={poly([[0,z0],[face.lengthMm,z0],[face.lengthMm,z0+H],[0,z0+H]].map(p=>P(p as V)))} fill="url(#h-plywood)" fillOpacity={.55} stroke={INK} strokeWidth={PEN.outline}/>
    {fl.studPositionsMm.map((x,i)=>{const p=P([x,z0+H]),q=P([x,z0]);return <rect key={i} x={p[0]-studBand/2} y={p[1]} width={studBand} height={q[1]-p[1]} fill={FILL.stud} stroke={MC.stud} strokeWidth={PEN.thin}/>;})}
    {fl.walers.map(w=>{const z=z0+w.zMm,p=P([0,z]),q=P([face.lengthMm,z]);return <g key={w.id} data-waler-z={z}>
      <rect x={p[0]-3} y={p[1]-1.7} width={q[0]-p[0]+6} height={1.3} fill={FILL.waler} stroke={MC.waler} strokeWidth={PEN.thin}/><rect x={p[0]-3} y={p[1]+.4} width={q[0]-p[0]+6} height={1.3} fill={FILL.waler} stroke={MC.waler} strokeWidth={PEN.thin}/>
      <Tag p={[p[0]-6.5,p[1]]} text={w.id} r={2.2}/>
      {w.supports.map(s=><Marker key={s.id} p={P([s.xMm,z])} id=""/>)}</g>;})}
    {fl.studPositionsMm.length>14?<Dim a={P([fl.studPositionsMm[0],z0])} b={P([fl.studPositionsMm[fl.studPositionsMm.length-1],z0])} o={[0,6]} text={`คร่าว ${spacing(fl.studPositionsMm)}`} s={1.9}/>
      :fl.studPositionsMm.length>2&&<ChainDim pts={fl.studPositionsMm.map(x=>P([x,z0]))} values={fl.studPositionsMm.slice(1).map((x,i)=>x-fl.studPositionsMm[i])} o={[0,6]} s={1.8}/>}
    <Dim a={P([0,z0])} b={P([face.lengthMm,z0])} o={[0,12]} text={f(face.lengthMm)} s={2}/>
    <ChainDim pts={levels.map(z=>P([face.lengthMm,z]))} values={levels.slice(1).map((z,i)=>z-levels[i])} o={[6,0]} s={1.8}/>
    <Dim a={P([face.lengthMm,z0])} b={P([face.lengthMm,z0+H])} o={[13,0]} text={f(H)} s={2}/>
    <LevelMark x={P([0,0])[0]-10} y={P([0,z0+H])[1]} value={z0+H} note="ผิวบนคอนกรีต"/><LevelMark x={P([0,0])[0]-10} y={P([0,z0])[1]} value={z0} note="ฐานแบบ"/>
    <Txt x={P([0,z0+H])[0]} y={P([0,z0+H])[1]-2} s={2} b>{face.a?'A':''}</Txt><Txt x={P([face.lengthMm,z0+H])[0]} y={P([face.lengthMm,z0+H])[1]-2} s={2} a="end" b>{face.b?'B':''}</Txt>
    <ViewTitle x={box.x} y={box.y+box.h+6} n={fl.faceId} title={`รูปด้าน ${fl.faceId} (A→B ตามแปลน)`} scale={scale} sub={`คร่าว ${memberName(fl.stud)} ${spacing(fl.studPositionsMm)} · คานรัด ${fl.walers.map(w=>`${w.id} ${level(z0+w.zMm)}`).join(' / ')}`}/>
  </g>;
}
function LoadPathSketch({groundBraced}:{groundBraced:boolean}){
  return groundBraced?<><Line a={[55,76]} b={[55,129]} color={amber} w={2}/><Line a={[55,82]} b={[165,129]} color={teal} w={1.5}/><Line a={[40,129]} b={[180,129]} w={.6}/><Txt x={105} y={143} s={2.3} a="middle">แบบข้าง → ค้ำเฉียง → ฐาน</Txt></>:<>
    {[['ไม้อัด',72],['คร่าว',88],['คานรับ',104],['หัวค้ำยัน',120]].map(([name,y],i)=><g key={name}><rect x={49+i*5} y={Number(y)} width={116-i*10} height={9} fill={i%2?'#e9f2f2':'#f6e3c3'} stroke={navy} strokeWidth={.3}/><Txt x={107} y={Number(y)+6} a="middle" s={2.5}>{name}</Txt>{i<3&&<path d={`M107 ${Number(y)+10}v4m-1.5-1.5l1.5 1.5 1.5-1.5`} fill="none" stroke={navy} strokeWidth={.5}/>}</g>)}
    <Txt x={107} y={143} s={2.3} a="middle">ถ่ายน้ำหนักลงตามลำดับ ↓</Txt>
  </>;
}
function Details({view}:{view:InstallationView}){
  const m=view.report.model,l=m.ringlockAssembly?.legs[0],t=m.sideLayout?.ties[0],a=t?.dossier,h=l?.headBearing;
  const inner=a?.components.find(c=>c.role==='INNER')?.reference;
  return <><Title title="รายละเอียดประกอบแบบหล่อ" sub="รายละเอียด NTS · ตัวเลขอ่านจากรายการของตัวอย่างนี้ · สัญลักษณ์จุดต่อไม่ใช่รายละเอียดผลิต"/>
    {a?<g data-detail="segmented-tie"><Txt x={28} y={52} s={3} b>D1 · ชุด Inner / Outer Tie</Txt>
      <rect x={72} y={72} width={87} height={43} fill="url(#h-concrete)"/>
      {[67,161].map(x=><g key={x}><rect x={x} y={68} width={3} height={51} fill="url(#h-plywood)"/><rect x={x<100?57:166} y={81} width={8} height={25} fill="none" stroke={teal}/><rect x={x<100?51:176} y={87} width={3} height={13} fill={navy}/></g>)}
      <Line a={[34,94]} b={[197,94]} color={red} w={1}/>
      <Txt x={115} y={90} s={2.3} a="middle">INNER · {a.threads[0]?.male.designation}</Txt><Txt x={43} y={123} s={2} a="middle">OUTER L</Txt><Txt x={186} y={123} s={2} a="middle">OUTER R</Txt>
      <Dim a={[72,113]} b={[159,113]} o={[0,18]} text={`Inner body ${f(inner?.properties.steelLengthMm)} mm`} s={2.1}/>
      <NoteBlock x={28} y={147} w={170} title="ข้อมูลชุดไทร์ที่แสดง" s={2.1} items={[
        `ตัวอย่างแนว ${t!.id}; ชิ้นส่วนครบ ${a.components.length} บทบาท`,
        `เกลียว ${a.threads[0]?.male.designation}; ฝังจริง ${f(a.threads[0]?.actualEngagementMm)} / ขั้นต่ำ ${f(a.threads[0]?.requiredEngagementMm)} mm`,
        `แรงชุดสมมติ ${f(inner?.properties.capacityKN)} kN; ${inner?.sourceRef}`,
        'ความยาวแยกรายแนวตามตาราง; แผ่น/นัต/หัวต่อเป็นสัญลักษณ์ อ่านรายการผลิตภัณฑ์ในฟอร์ม',
      ]}/></g>:<g data-detail="external-restraint"><Txt x={28} y={52} s={3} b>D1 · {m.sideTopology==='COLUMN_YOKE'?'วงรัดเสาภายนอก':'เส้นทางถ่ายแรงแบบหล่อ'}</Txt>
        {m.sideTopology==='COLUMN_YOKE'?<><rect x={76} y={70} width={65} height={50} fill="url(#h-concrete)"/><rect x={70} y={64} width={77} height={62} fill="none" stroke={teal} strokeWidth={2}/>{[[70,64],[147,64],[70,126],[147,126]].map(([x,y],i)=><circle key={i} cx={x} cy={y} r={3} fill={red}/>)}<Txt x={108} y={143} s={2.3} a="middle">ชุดมุม / วงรัด · ไม่มีไทร์ทะลุเสา</Txt></>:<LoadPathSketch groundBraced={m.sideTopology==='GROUND_BRACED'}/>}
        <NoteBlock x={28} y={158} w={170} title="จุดต่อและข้อมูลอ้างอิง" s={2.1} items={['ใช้ชนิดระบบที่แสดงในแปลน; รายละเอียดขนาดสมาชิกอยู่ในฟอร์มและตาราง','สัญลักษณ์มุม/ปลายค้ำแสดงตำแหน่งเชื่อมต่อ ไม่ระบุรอยเชื่อมหรือสลักที่ไม่มีข้อมูล','EX-DB-01 (MOCK) · ใช้เป็นแนวทางอ่านแบบและตรวจรายการประกอบ']}/></g>}
    {l&&h?<g data-detail="head-base"><Txt x={223} y={52} s={3} b>D2 · U-head / Jack / รองรับ</Txt>
      <rect x={258} y={65} width={95} height={6} fill="url(#h-plywood)"/><rect x={276} y={71} width={12} height={10} fill={amber}/><rect x={267} y={81} width={52} height={20} fill="none" stroke={teal} strokeWidth={.8}/>
      <path d="M261 83v21h64V83M293 104v37M286 141v36h14v-36M293 177v24M270 201h46" fill="none" stroke={navy} strokeWidth={1.2}/>
      <rect x={250} y={204} width={90} height={6} fill="url(#h-concrete)"/>
      <Txt x={330} y={69} s={2}>ไม้อัด {f(l.upperStack.plywoodThicknessMm)}</Txt>
      <Txt x={330} y={80} s={2}>คร่าวลึก {f(l.upperStack.joistDepthMm)}</Txt>
      <Txt x={330} y={93} s={2}>คาน {f(h.bearerWidthMm)}×{f(h.bearerDepthMm)}</Txt>
      <Txt x={330} y={105} s={2}>ช่อง U {f(h.insideClearWidthMm)}</Txt>
      <Txt x={320} y={121} s={2}>หัว: ยืด {f(l.headJack.extensionMm)}</Txt>
      <Txt x={320} y={127} s={2}>ฝัง {f(l.headJack.engagementMm)}</Txt>
      <Txt x={320} y={151} s={2}>เสา {l.standards.map(s=>f(s.installedRiseMm)).join('+')}</Txt>
      <Txt x={320} y={182} s={2}>ฐาน: ยืด {f(l.baseJack.extensionMm)}</Txt>
      <Txt x={320} y={188} s={2}>ฝัง {f(l.baseJack.engagementMm)}</Txt>
      <Txt x={223} y={222} s={2}>ที่นั่ง {f(h.plateLengthMm)}×{f(h.plateWidthMm)}×{f(h.plateThicknessMm)} · Blocking {h.sideBlocking}</Txt>
    </g>:<NoteBlock x={223} y={58} w={175} title="ลำดับเตรียมและตรวจแบบ" s={2.5} items={['กำหนดแนวอ้างอิง X/Y และระดับฐาน Z ตามแปลน','ติดไม้อัดและคร่าวตามตำแหน่งแต่ละผิว','ประกอบคานรัดทุกระดับและต่อชุดไทร์/วงรัดตามระบบ','ตรวจพิกัด จุดต่อ ช่องเหล็กเสริม และแนวดิ่งตามแบบ','เก็บรายการตรวจประกอบกับ Design Revision ก่อนขั้นเทคอนกรีต']}/>}
    <Stamp view={view}/></>;
}
function Schedule({view,rows,title}:{view:InstallationView;rows:string[][];title:string}){return <><Title title={title}/><Table x={25} y={45} cols={[{t:'รายการ / พิกัด',w:77},{t:'ค่าจาก Design Revision · mm เว้นแต่ระบุ',w:300}]} rows={rows} s={2.2} rh={7.5}/><Stamp view={view}/></>;}
function materialRows(m:WorkflowModel):string[][]{
  const rows:string[][]=[],seen=new Map<string,string[]>();
  const group=(name:string,value:string)=>{seen.set(value,[...(seen.get(value)??[]),name]);};
  const member=(name:string,s:Omit<MemberStiffness,'selfWeightKNPerM'>&{selfWeightKNPerM?:number|null},role:ElasticMemberRole)=>{
    const p=resolveMemberElastic(s,role),id=s.binding?.section?.effective.section_id??s.binding?.nominalLabel??s.evidenceRef.split(' · ')[0];
    group(name,`${id} · E ${f(p.E_MPa)} MPa · I ${f(p.I_mm4)} mm⁴${s.selfWeightKNPerM!=null?` · DL ${s.selfWeightKNPerM.toFixed(5)} kN/m`:''}`);
    group(`${name} อ้างอิง`,s.evidenceRef);
  };
  for(const face of m.sideLayout?.faces??[]){
    member(`${face.faceId} คร่าว`,face.stud,'STUD');member(`${face.faceId} คานรัด/ราง`,face.rail,'WALER');
    group(`${face.faceId} ไม้อัด`,`${f(face.plywood.thicknessMm)} mm · E ${f(face.plywood.effectiveE_MPa)} MPa · แนวเสี้ยน ${face.plywood.grainAxis} · ${face.plywood.evidenceRef}`);
  }
  if(m.soffitLayout){member('คร่าวท้อง',m.soffitLayout.joist,'JOIST');member('คานรับท้อง',m.soffitLayout.bearer,'BEARER');
    const p=m.soffitLayout.plywood;if(p)group('ไม้อัดท้อง',`${f(p.thicknessMm)} mm · E ${f(p.effectiveE_MPa)} MPa · แนวเสี้ยน ${p.grainAxis} · ${p.evidenceRef}`);
  }
  for(const [value,names] of seen)chunks(names,3).forEach(part=>rows.push([part.join(' / '),value]));
  if(m.ringlock)rows.push(['ระบบค้ำยัน',`${m.ringlock.manufacturer} / ${m.ringlock.systemId} / ${m.ringlock.configurationId}`]);
  rows.push(['หลักฐานโครงการ',m.designBasisRef??m.sourceRef??'ไม่ระบุ'],['สถานะข้อมูล','EX-DB-01 (MOCK) · ข้อมูลอุปกรณ์/กำลัง/ดินสมมติแสดงในฟอร์ม ไม่ใช่เอกสารรับรองหน้างาน']);
  return rows;
}
export function installationSheets(view:InstallationView,caseCode:string):InstallationSheet[]{
  const m=view.report.model,sheets:InstallationSheet[]=[];
  const add=(suffix:string,title:string,body:React.ReactElement)=>sheets.push({code:`${caseCode}-${suffix}`,title,body});
  add('01','แปลนติดตั้งแบบหล่อ',<Plan view={view}/>);
  add('02','รูปตัด A–A / B–B',<Sections view={view}/>);
  add('03','รายละเอียดประกอบ',<Details view={view}/>);
  const materials=materialRows(m);
  chunks(materials,23).forEach((part,i)=>add(`M${i+1}`,'วัสดุและแหล่งอ้างอิง',<Schedule view={view} title={`รายการหน้าตัด วัสดุ และแหล่งอ้างอิง ${i+1}/${Math.ceil(materials.length/23)}`} rows={part}/>));
  chunks(m.sideLayout?.faces??[],2).forEach((faces,page)=>add(`E${page+1}`,'รูปด้านแบบหล่อ',<><Title title="รูปด้านและระยะสมาชิกแต่ละผิว"/>{faces.map((_,i)=><Elevation key={i} view={view} index={page*2+i} box={{x:43+i*195,y:64,w:150,h:133}}/>)}<Stamp view={view}/></>));
  const rows:string[][]=[];
  for(const [i,l] of (m.ringlockAssembly?.legs??[]).entries())rows.push([`H${i+1} / ${l.legId}`,`X ${f(l.xMm)} / Y ${f(l.yMm)} / Zฐาน ${f(l.groundElevationMm)} / Zหัว ${f(l.headBearingElevationMm)} / Zท้อง ${f(l.soffitElevationMm)}`]);
  for(const face of m.sideLayout?.faces??[]){
    chunks(face.studPositionsMm,8).forEach((ss,i)=>rows.push([`${face.faceId} คร่าว ${i*8+1}…${i*8+ss.length}`,ss.map(f).join(' / ')]));
    for(const w of face.walers)rows.push([`${face.faceId} / ${w.id}`,`Z รวม ${f(m.sideLayout!.baseElevationMm!+w.zMm)} (สูงจากฐานผิว ${f(w.zMm)}) · X จุดรองรับ: ${w.supports.map(s=>f(s.xMm)).join(' / ')}`]);
  }
  if(m.soffitLayout){chunks(m.soffitLayout.joistXMm,8).forEach((xs,i)=>rows.push([`คร่าวท้อง X ชุด ${i+1}`,xs.map(f).join(' / ')]));for(const b of m.soffitLayout.bearers)rows.push([`คานรับ ${b.id}`,`Y ${f(b.yMm)} · X หัว: ${b.headsXMm.map(f).join(' / ')}`]);}
  chunks(rows,23).forEach((part,i)=>add(`P${i+1}`,'ตารางพิกัดติดตั้ง',<Schedule view={view} title={`ตารางพิกัดติดตั้ง ${i+1}/${Math.ceil(rows.length/23)}`} rows={part}/>));
  const ties=m.sideLayout?.ties??[];
  chunks(ties,23).forEach((part,i)=>add(`T${i+1}`,'ตารางชุดไทร์',<Schedule view={view} title={`ตารางไทร์ ${i+1}/${Math.ceil(ties.length/23)}`} rows={part.map(t=>{const c=tieGeometryContext(view.drawing.topology,m.sideLayout!,t);return [t.id,`${t.a.faceId}/${t.a.walerId}/${t.a.supportId} → ${t.b.faceId}/${t.b.walerId}/${t.b.supportId} · Ø${f(t.diameterMm)} · ช่วง ${f(c.chordMm)}`];})}/>));
  const index=sheets.map(s=>[s.code,s.title]);
  sheets.unshift({code:`${caseCode}-00`,title:'สารบัญและข้อมูลแบบ',body:<><Title title={`ชุดแบบติดตั้ง${label[m.elementType]} · Project Example`} sub="ชุดตัวอย่างแปลน รูปตัด รายละเอียดประกอบ และพิกัดติดตั้ง · A3 แนวนอน"/>
    <Table x={25} y={47} title="สารบัญแบบ" cols={[{t:'เลขที่แบบ',w:55},{t:'ชื่อแบบ',w:143}]} rows={index} rh={7} s={2.3}/>
    <NoteBlock x={238} y={48} w={163} title="ข้อมูลออกแบบในชุดนี้" s={2.4} items={[
      `ชนิดระบบ ${label[m.elementType]} / ${m.sideTopology??'SOFFIT + SHORING'}`,
      `คอนกรีตสูง/หนา ${f(m.heightMm)} mm · น้ำหนัก ${f(m.gammaKNm3)} kN/m³`,
      `DL ${f(m.additionalDeadKPa??0)} / LL ${f(m.constructionLiveKPa??0)} kPa; แรงดันตามข้อมูลผิวแต่ละด้าน`,
      `Stage ${m.soffitLayout?.stageId??m.sideLayout?.stageId} / ${m.soffitLayout?.loadCaseId??m.sideLayout?.loadCaseId}`,
      'หน้าตัด E/I/น้ำหนักและแหล่งอ้างอิงดูแผ่น M; กำลังและข้อมูลหน้างานตาม EX-DB-01 (MOCK)',
      'แบบนี้แสดงข้อมูลตัวอย่างที่บันทึกไว้ ไม่เพิ่ม ledger/brace/สลักหรือรอยเชื่อมที่ไม่มีในโมเดล',
      'ลำดับ: แปลน → รูปตัด → รายละเอียด → รูปด้าน → ตารางพิกัด; แก้ข้อมูลแล้วเปิดชุดแบบใหม่',
    ]}/><Txt x={25} y={230} s={2.3} b>MOCK-UP / NO_GO · ช่องตรวจและอนุมัติในกรอบชื่อยังไม่ใช่ลายเซ็นผู้ตรวจ</Txt><Stamp view={view}/></>});
  return sheets;
}
