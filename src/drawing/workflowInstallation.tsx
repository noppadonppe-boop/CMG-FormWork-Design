import React from 'react';
import type {WorkflowModel} from '../domain/workflowV07/model';
import type {documentView} from '../domain/workflowV07/snapshot';
import {pairFaces} from '../domain/workflowV07/geometry';
import {tieGeometryContext} from '../domain/workflowV07/tieDossier';
import {resolveMemberElastic, type ElasticMemberRole} from '../domain/workflowV07/elasticBinding';
import type {MemberStiffness} from '../domain/workflowV07/soffit';
import {ChainDim, Dim, Line, SectionMark, Table, Txt, fitScale, poly, type Box, type V} from './primitives';
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
function Stamp({view}:{view:InstallationView}){return <g data-drawing-revision={view.report.model.revisionId}>
  <Txt x={25} y={241} s={1.8}>REV {view.report.model.revisionId} · INPUT SHA-256 {view.inputHash}</Txt>
  <Txt x={25} y={246} s={1.65}>SNAPSHOT {view.snapshotHash} · MOCK-UP / NO_GO · ตัวอย่างรายละเอียดติดตั้งสำหรับตรวจแบบ</Txt>
</g>;}
function Title({title,sub}:{title:string;sub?:string}){return <><Txt x={25} y={31} s={3.6} b fill={navy}>{title}</Txt><Txt x={25} y={37} s={2.2}>{sub??'หน่วย mm · ใช้ตัวเลขกำกับ · รายละเอียดและพิกัดจาก Design Revision เดียวกัน'}</Txt></>;}
function Marker({p,id}:{p:V;id:string}){return <g><circle cx={p[0]} cy={p[1]} r={1.4} fill={navy}/><Txt x={p[0]+2} y={p[1]-2} s={1.8}>{id}</Txt></g>;}
function FacePlan({m,P}:{m:WorkflowModel;P:(p:V)=>V}){
  const topology=pairFaces(m.vertices,m.heightMm),d=m.sideLayout;
  if(!d)return null;
  return <g>{d.faces.map(l=>{const face=topology.faces.find(f=>f.id===l.faceId)!;const point=(s:number,offset=0):V=>[face.a.x+(face.b.x-face.a.x)*s/face.lengthMm+face.normal.x*offset,face.a.y+(face.b.y-face.a.y)*s/face.lengthMm+face.normal.y*offset];
    return <g key={l.faceId} data-face={l.faceId}>
      <Line a={P(point(0))} b={P(point(face.lengthMm))} w={1.2} color={amber}/>
      {[35,65].map(o=><Line key={o} a={P(point(0,o))} b={P(point(face.lengthMm,o))} w={.5} color={teal}/>)}
      {l.studPositionsMm.map((s,i)=><Line key={i} a={P(point(s))} b={P(point(s,90))} color={navy} w={.5}/>)}
      <Txt x={P(point(face.lengthMm/2,130))[0]} y={P(point(face.lengthMm/2,130))[1]} s={2.3} a="middle" b>{face.id}</Txt>
    </g>;})}
    {d.ties.filter(t=>t.a.walerId===d.faces.find(f=>f.faceId===t.a.faceId)?.walers[0]?.id).map((t,i)=>{
      const c=tieGeometryContext(topology,d,t);const endpoint=(e:typeof t.a):V=>{const face=topology.faces.find(f=>f.id===e.faceId)!,row=d.faces.find(f=>f.faceId===e.faceId)!.walers.find(w=>w.id===e.walerId)!,s=row.supports.find(s=>s.id===e.supportId)!;return [face.a.x+(face.b.x-face.a.x)*s.xMm/face.lengthMm,face.a.y+(face.b.y-face.a.y)*s.xMm/face.lengthMm];};
      return <g key={t.id} data-tie={t.id}><Line a={P(endpoint(t.a))} b={P(endpoint(t.b))} color={red} dash="3 1" w={.35}/><Txt x={P(endpoint(t.a))[0]+2} y={P(endpoint(t.a))[1]-2} s={1.5}>T{i+1} · {f(c.chordMm)}</Txt></g>;
    })}
  </g>;
}
function Plan({view}:{view:InstallationView}){
  const m=view.report.model,b=bounds(m),d=m.soffitLayout,cuts=drawingCuts(m),{P,scale}=drawingProjection(extent(m),{x:48,y:60,w:225,h:141});
  return <><Title title={`แปลนติดตั้งแบบหล่อ${label[m.elementType]}`} sub={`แปลน 1:${scale} · A–A มองตามแกน X / B–B มองตามแกน Y · เส้นประกอบแบบข้างขยายเพื่อให้อ่านได้`}/>
    <g data-view="installation-plan" data-scale-denominator={scale}><polygon points={poly(m.vertices.map(p=>P([p.x,p.y])))} fill="url(#h-concrete)" stroke={navy} strokeWidth={.5}/>
      {d&&<>{d.joistXMm.map((x,i)=><Line key={i} a={P([b.x0+x,b.y0+d.joistStartYMm!])} b={P([b.x0+x,b.y0+d.joistEndYMm!])} color={amber} w={.3}/>)}
        {d.bearers.map(r=><g key={r.id}><Line a={P([b.x0+d.bearerStartXMm!,b.y0+r.yMm])} b={P([b.x0+d.bearerEndXMm!,b.y0+r.yMm])} color={teal} w={.8}/><Txt x={P([b.x0+d.bearerEndXMm!,b.y0+r.yMm])[0]+2} y={P([b.x0+d.bearerEndXMm!,b.y0+r.yMm])[1]+4} s={2}>{r.id}</Txt></g>)}
        {m.ringlock?.legs.map((l,i)=><Marker key={l.id} p={P([l.xMm,l.yMm])} id={`H${i+1}`}/>)}</>}
      <FacePlan m={m} P={P}/>
      {m.frameLayout?.elements.filter(e=>!d).map(e=>{const a=m.frameLayout!.nodes.find(n=>n.id===e.nodeI)?.pointMm,c=m.frameLayout!.nodes.find(n=>n.id===e.nodeJ)?.pointMm;return a&&c&&a[0]!=null&&a[1]!=null&&c[0]!=null&&c[1]!=null?<Line key={e.id} a={P([a[0],a[1]])} b={P([c[0],c[1]])} color={teal} w={.4}/>:null;})}
      <Dim a={P([b.x0,b.y0])} b={P([b.x1,b.y0])} o={[0,17]} text={`${f(b.x1-b.x0)} X`} s={2.4}/>
      <Dim a={P([b.x0,b.y0])} b={P([b.x0,b.y1])} o={[-17,0]} text={`${f(b.y1-b.y0)} Y`} s={2.4}/>
      {d&&<><ChainDim pts={unique(m.ringlock?.legs.map(l=>l.xMm)??[]).map(x=>P([x,b.y0]))} values={unique(m.ringlock?.legs.map(l=>l.xMm)??[]).slice(1).map((x,i)=>x-unique(m.ringlock!.legs.map(l=>l.xMm))[i])} o={[0,9]} s={1.9}/>
        <ChainDim pts={d.bearers.map(r=>P([b.x0,b.y0+r.yMm]))} values={d.bearers.slice(1).map((r,i)=>r.yMm-d.bearers[i].yMm)} o={[-9,0]} s={1.9}/></>}
      <SectionMark a={P([b.x0-170,cuts.y])} b={P([b.x1+170,cuts.y])} id="A" view={[0,-1]}/>
      <SectionMark a={P([cuts.x,b.y0-170])} b={P([cuts.x,b.y1+170])} id="B" view={[1,0]}/>
    </g>
    <NoteBlock x={294} y={48} w={109} title="สัญลักษณ์ / ตำแหน่ง" s={2.25} items={[
      'สีเทา = คอนกรีต; สีเหลือง = ไม้อัด/คร่าว',
      'สีเขียว = คานรับ/คานรัด; จุด H = หัวค้ำยัน',
      'เส้นประสีแดง = ไทร์ที่ระดับคานรัดแรก; ดูระดับทุกแนวในรูปด้าน',
      `A–A: Y = ${f(cuts.y)}; B–B: X = ${f(cuts.x)}`,
      'จุดกำเนิดและแกนใช้ตามตารางพิกัด ห้ามวัดขนาดจากภาพ',
      m.sideTopology==='COLUMN_YOKE'?'วงรัดอยู่นอกผิวคอนกรีต ไม่มีไทร์ทะลุเสา':m.sideTopology==='GROUND_BRACED'?'ค้ำเฉียงแสดงเฉพาะเส้นที่บันทึกในเฟรม':'ดูรายละเอียดจุดต่อและชุดไทร์ในแผ่นรายละเอียด',
    ]}/>
    <Txt x={48} y={229} s={2.2}>พิกัดขอบ: X {f(b.x0)}…{f(b.x1)} · Y {f(b.y0)}…{f(b.y1)} · ระบบ {m.sideTopology??'SOFFIT / SHORING'}</Txt><Stamp view={view}/>
  </>;
}
function Section({view,axis,box}:{view:InstallationView;axis:'X'|'Y';box:Box}){
  const m=view.report.model,b=bounds(m),d=m.soffitLayout,l=m.ringlockAssembly?.legs[0],cuts=drawingCuts(m);
  const soffit=l?.soffitElevationMm??m.sideLayout?.baseElevationMm??0,top=soffit+m.heightMm,base=d?.baseElevationMm??0;
  const k=axis==='X'?0:1,ext=extent(m),lo=Math.min(...ext.map(p=>p[k])),hi=Math.max(...ext.map(p=>p[k]));
  const {P,scale}=drawingProjection([[lo,base],[hi,top]],box),station=axis==='X'?cuts.y:cuts.x;
  const intervals=cutIntervals(m,axis,station);
  return <g data-view={`section-${axis}`} data-scale-denominator={scale}>
    <Txt x={box.x} y={box.y-12} s={3} b>รูปตัด {axis==='X'?'A–A':'B–B'} · 1:{scale}</Txt>
    <Txt x={box.x} y={box.y-7} s={1.9}>ตัด {axis==='X'?'Y':'X'}={f(station)} · เฟรมสีเทาคือภาพฉายรวมทุกแนว</Txt>
    {intervals.map(([a,c],i)=>{const p=P([a,top]),q=P([c,soffit]);return <rect key={i} x={p[0]} y={p[1]} width={q[0]-p[0]} height={q[1]-p[1]} fill="url(#h-concrete)" stroke={navy} strokeWidth={.5}/>;})}
    {d&&<>{axis==='Y'&&m.elementType==='BEAM'&&m.slabThicknessMm!>0&&[[b.y0+d.concreteStripStartYMm!,b.y0],[b.y1,b.y0+d.concreteStripStartYMm!+m.concreteStripMm!]].filter(([a,c])=>c>a).map(([a,c],i)=>{const p=P([a,top]),q=P([c,top-m.slabThicknessMm!]);return <rect key={i} x={p[0]} y={p[1]} width={q[0]-p[0]} height={q[1]-p[1]} fill="url(#h-concrete)" stroke={navy} strokeWidth={.5}/>;})}
      <Line a={P([lo,soffit])} b={P([hi,soffit])} color={amber} w={.6}/>
      {axis==='X'?<>{d.joistXMm.map(x=><Line key={x} a={P([b.x0+x,soffit-(l?.upperStack.plywoodThicknessMm??0)])} b={P([b.x0+x,d.headNodeElevationMm!+(l?.upperStack.bearerDepthMm??0)])} color={amber} w={.8}/>)}
        <Line a={P([b.x0+d.bearerStartXMm!,d.headNodeElevationMm!])} b={P([b.x0+d.bearerEndXMm!,d.headNodeElevationMm!])} color={teal} w={.7}/>
        <Line a={P([b.x0+d.bearerStartXMm!,d.headNodeElevationMm!+(l?.upperStack.bearerDepthMm??0)])} b={P([b.x0+d.bearerEndXMm!,d.headNodeElevationMm!+(l?.upperStack.bearerDepthMm??0)])} color={teal} w={.4}/></>:<>
        <Line a={P([b.y0+d.joistStartYMm!,soffit-(l?.upperStack.plywoodThicknessMm??0)])} b={P([b.y0+d.joistEndYMm!,soffit-(l?.upperStack.plywoodThicknessMm??0)])} color={amber} w={.4}/>
        <Line a={P([b.y0+d.joistStartYMm!,d.headNodeElevationMm!+(l?.upperStack.bearerDepthMm??0)])} b={P([b.y0+d.joistEndYMm!,d.headNodeElevationMm!+(l?.upperStack.bearerDepthMm??0)])} color={amber} w={.4}/>
        {d.bearers.map(r=>{const width=l?.headBearing?.bearerWidthMm??0,p=P([b.y0+r.yMm-width/2,d.headNodeElevationMm!+(l?.upperStack.bearerDepthMm??0)]),q=P([b.y0+r.yMm+width/2,d.headNodeElevationMm!]);return <rect key={r.id} x={p[0]} y={p[1]} width={q[0]-p[0]} height={q[1]-p[1]} fill="none" stroke={teal} strokeWidth={.4}/>;})}</>}
    </>}
    {m.frameLayout?.elements.map(e=>{const a=m.frameLayout!.nodes.find(n=>n.id===e.nodeI)?.pointMm,c=m.frameLayout!.nodes.find(n=>n.id===e.nodeJ)?.pointMm;return a&&c&&a[k]!=null&&a[2]!=null&&c[k]!=null&&c[2]!=null?<Line key={e.id} a={P([a[k],a[2]])} b={P([c[k],c[2]])} color="#84929e" w={.45}/>:null;})}
    {unique(m.frameLayout?.nodes.filter(n=>n.role==='BASE'&&n.pointMm[k]!=null).map(n=>n.pointMm[k]!)??[]).map(x=>{const p=P([x,base]);return <path key={x} d={`M${p[0]-3},${p[1]+2}h6M${p[0]},${p[1]}v2`} fill="none" stroke={navy} strokeWidth={.6}/>;})}
    {m.sideLayout&&intervals.flatMap(([a,c],i)=>[a,c].map((x,j)=>{const sign=j===0?-1:1,p=P([x,soffit]),q=P([x,top]);
      const face=view.drawing.topology.faces.find(f=>{const u=axis==='X'?'x':'y',v=axis==='X'?'y':'x';return Math.abs(f.a[u]-x)<.01&&Math.abs(f.b[u]-x)<.01&&station>=Math.min(f.a[v],f.b[v])&&station<=Math.max(f.a[v],f.b[v]);});
      const walers=m.sideLayout!.faces.find(f=>f.faceId===face?.id)?.walers??[];
      return <g key={`${i}:${j}`} data-section-side-edge={x}>
      <Line a={p} b={q} color={amber} w={1}/>
      {walers.map(w=>{const z=m.sideLayout!.baseElevationMm!+w.zMm,r=P([x,z]);return <rect key={w.id} data-waler-z={z} x={r[0]+(sign<0?-3:1)} y={r[1]-1} width={2} height={2} fill={teal}/>;})}
    </g>;}))}
    <Dim a={P([lo,base])} b={P([lo,top])} o={[-10,0]} text={`${f(top-base)} รวม`} s={2.1}/>
    <Dim a={P([hi,soffit])} b={P([hi,top])} o={[9,0]} text={`${f(m.heightMm)} คอนกรีต`} s={2.1}/>
    <Dim a={P([lo,base])} b={P([hi,base])} o={[0,10]} text={`${f(hi-lo)} ผังรวม`} s={2.1}/>
    <Txt x={box.x} y={box.y+box.h+20} s={2}>ระดับท้องคอนกรีต {f(soffit)} · ผิวบน {f(top)} · ฐาน {f(base)}</Txt>
    <Txt x={box.x} y={box.y+box.h+25} s={1.8}>สมาชิกเป็นภาพฉาย; จุดคานรัดขยาย NTS; ไทร์ดูแปลน/รูปด้าน</Txt>
  </g>;
}
function Sections({view}:{view:InstallationView}){return <><Title title="รูปตัดตามยาวและตามขวาง"/><Section view={view} axis="X" box={{x:44,y:67,w:150,h:133}}/><Section view={view} axis="Y" box={{x:240,y:67,w:150,h:133}}/><Stamp view={view}/></>;}
function Elevation({view,index,box}:{view:InstallationView;index:number;box:Box}){
  const m=view.report.model,fl=m.sideLayout!.faces[index],face=view.drawing.topology.faces.find(f=>f.id===fl.faceId)!,z0=m.sideLayout!.baseElevationMm!;
  const {P,scale}=drawingProjection([[0,z0],[face.lengthMm,z0+m.heightMm]],box);
  return <g data-view={`elevation-${fl.faceId}`}><Txt x={box.x} y={box.y-10} s={3} b>{fl.faceId} · 1:{scale} · A→B ตามแปลน</Txt>
    <polygon points={poly([[0,z0],[face.lengthMm,z0],[face.lengthMm,z0+m.heightMm],[0,z0+m.heightMm]].map(p=>P(p as V)))} fill="url(#h-concrete)" stroke={navy} strokeWidth={.4}/>
    {fl.studPositionsMm.map((x,i)=><Line key={i} a={P([x,z0])} b={P([x,z0+m.heightMm])} color={amber} w={.45}/>)}
    {fl.walers.map(w=><g key={w.id} data-waler-z={z0+w.zMm}><Line a={P([0,z0+w.zMm])} b={P([face.lengthMm,z0+w.zMm])} color={teal} w={1}/><Txt x={P([face.lengthMm,z0+w.zMm])[0]+2} y={P([face.lengthMm,z0+w.zMm])[1]} s={1.9}>{w.id}</Txt>{w.supports.map(s=><Marker key={s.id} p={P([s.xMm,z0+w.zMm])} id=""/>)}</g>)}
    <ChainDim pts={fl.studPositionsMm.map(x=>P([x,z0]))} values={fl.studPositionsMm.slice(1).map((x,i)=>x-fl.studPositionsMm[i])} o={[0,8]} s={1.8}/>
    <Dim a={P([0,z0])} b={P([face.lengthMm,z0])} o={[0,15]} text={f(face.lengthMm)} s={2}/>
    <Dim a={P([0,z0])} b={P([0,z0+m.heightMm])} o={[-9,0]} text={f(m.heightMm)} s={2}/>
    <Txt x={box.x} y={box.y+box.h+24} s={2}>Z รวม {fl.walers.map(w=>`${w.id}=${f(z0+w.zMm)}`).join(' / ')} · Z ฐาน={f(z0)}</Txt>
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
