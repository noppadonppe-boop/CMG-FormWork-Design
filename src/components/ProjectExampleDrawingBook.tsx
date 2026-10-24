import React,{useEffect,useMemo,useRef,useState} from 'react';
import type {StoredWorkflowDraft} from '../domain/workflowV07/storage';
import {canonical} from '../domain/workflowV07/common';
import {documentView,freezeDesign} from '../domain/workflowV07/snapshot';
import {defaultTitleBlock,type TitleBlock} from '../domain/titleBlock';
import {installationSheets,type InstallationView} from '../drawing/workflowInstallation';
import {A3Set} from './DrawingSet';

export interface ExampleDrawingCase {id:string;name:string;workflowV07?:StoredWorkflowDraft;titleBlock?:TitleBlock}
export function ProjectExampleDrawingBook({cases,caseId,project,code,canEdit,onTitleBlockChange}:{
  cases:ExampleDrawingCase[];caseId:string;project:string;code:string;canEdit:boolean;onTitleBlockChange:(value:TitleBlock)=>void;
}){
  const [all,setAll]=useState(false),[ready,setReady]=useState<{case:ExampleDrawingCase;view:InstallationView}[]>([]),[error,setError]=useState(''),[progress,setProgress]=useState(0);
  const root=useRef<HTMLDivElement>(null);
  const selected=useMemo(()=>cases.filter(c=>(all||c.id===caseId)&&c.workflowV07),[cases,caseId,all]);
  const identity=canonical(selected.map(c=>({id:c.id,name:c.name,model:c.workflowV07!.model})));
  useEffect(()=>{let cancelled=false;setReady([]);setError('');setProgress(0);void(async()=>{
    const next:typeof ready=[];
    for(const c of selected){const model=c.workflowV07!.model;const full=await documentView(await freezeDesign(model),model);if(cancelled)return;
      next.push({case:c,view:{report:{model:full.report.model},drawing:{topology:full.drawing.topology},inputHash:full.inputHash,snapshotHash:full.snapshotHash}});setProgress(next.length);}
    if(!cancelled)setReady(next);
  })().catch(e=>{if(!cancelled)setError((e as Error).message);});return()=>{cancelled=true;};},[identity]);
  const total=ready.reduce((sum,r)=>sum+installationSheets(r.view,sheetPrefix(r.case)).length,0);
  function download(){
    const pages=Array.from(root.current?.querySelectorAll<SVGSVGElement>('svg.a3-sheet')??[]).map(el=>new XMLSerializer().serializeToString(el));
    const html=`<!doctype html><html lang="th"><meta charset="utf-8"><title>Project Example · แบบติดตั้งตัวอย่าง</title><style>body{margin:0;background:#ddd;font-family:Tahoma,Arial,sans-serif}svg{display:block;width:420mm;height:297mm;background:white;margin:8mm auto}@page{size:A3 landscape;margin:0}@media print{body{background:white}svg{margin:0;break-after:page}svg:last-child{break-after:auto}}</style><body>${pages.join('\n')}</body></html>`;
    const url=URL.createObjectURL(new Blob([html],{type:'text/html;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=`${code}-installation-${all?'all':sheetPrefix(selected[0])}.html`;a.click();URL.revokeObjectURL(url);
  }
  return <div className="a3-print-root project-example-drawings" ref={root}>
    <section className="card a3-controls" aria-label="ชุดแบบ Project Example"><h2>Project Example · แบบแปลน รูปตัด และรายละเอียดติดตั้ง</h2>
      <p>เปิดรายตัวอย่างหรือรวมทั้งโครงการได้ แบบอ่านพิกัดและมิติจากข้อมูลที่บันทึกไว้ พร้อม Design Revision เดียวกับรายการคำนวณ</p>
      <div className="source-actions"><button className={`btn ${all?'secondary':''}`} onClick={()=>setAll(false)}>ตัวอย่างที่เลือก</button><button className={`btn ${all?'':'secondary'}`} onClick={()=>setAll(true)}>รวมแบบทั้ง {cases.length} ตัวอย่าง</button>
        <button className="btn secondary" disabled={!ready.length||!!error} onClick={download}>ดาวน์โหลดชุดแบบ HTML (A3)</button></div>
      <p role="status">{error?`สร้างแบบไม่สำเร็จ: ${error}`:ready.length?`พร้อมแสดง ${ready.length} ตัวอย่าง · ${total} แผ่น A3`:`กำลังจัดชุดแบบ ${progress}/${selected.length} ตัวอย่าง…`}</p>
      <p>ข้อมูลชุดนี้เป็น Mock-up สำหรับฝึกอ่านแบบและจัดเตรียมงาน ช่องตรวจ/อนุมัติยังไม่ลงนาม และข้อมูลที่เปลี่ยนในฟอร์มจะปรากฏเมื่อบันทึกแล้วเปิดแบบใหม่</p>
    </section>
    {ready.map(({case:c,view})=><A3Set key={c.id} sheets={installationSheets(view,sheetPrefix(c))} project={project} code={code}
      caseName={c.name.replace(/^Project Example · /,'').replace(/ · MOCK-UP$/,'')} elementLabel="รายละเอียดติดตั้งตัวอย่าง" languages={false}
      confirmed={false} titleBlock={cases.find(row=>row.id===c.id)?.titleBlock??defaultTitleBlock()}
      canEdit={canEdit&&c.id===caseId} onTitleBlockChange={onTitleBlockChange}
      revisionBinding={{designRevision:view.report.model.revisionId,contentHash:view.inputHash,reviewState:'MOCK-UP / NO_GO'}}/>)}
  </div>;
}
function sheetPrefix(c:ExampleDrawingCase){return `EX-${c.name.match(/ · ([FCWBS]0[12]) · /)?.[1]??c.id.slice(0,8)}`;}
