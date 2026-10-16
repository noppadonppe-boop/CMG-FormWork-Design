// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,expect,it,vi} from 'vitest';
import {RinglockSupplierFields} from '../src/components/RinglockSuppliers';
import WorkflowV07Panel from '../src/components/WorkflowV07Panel';
import {createSupplierCatalogue,resolveSupplierCatalogue,type SupplierCatalogueState} from '../src/domain/workflowV07/ringlockSuppliers';
import {defaults} from '../src/domain';
import data from '../src/reference/workflow-v07/thai-ringlock-suppliers-2026-10-15.json';

afterEach(()=>vi.restoreAllMocks());
function controls(host:HTMLElement){
 const label=(text:string)=>Array.from(host.querySelectorAll('label')).find(l=>l.textContent?.startsWith(text))!;
 return {
  label,
  button:(text:string)=>Array.from(host.querySelectorAll('button')).find(b=>b.textContent===text)!,
  choose:async(text:string,value:string)=>act(async()=>{const e=label(text).querySelector('select')!;e.value=value;e.dispatchEvent(new Event('change',{bubbles:true}));}),
  enter:async(text:string,value:string)=>act(async()=>{const e=label(text).querySelector('input')!;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(e,value);e.dispatchEvent(new Event('input',{bubbles:true}));}),
 };
}
it('selects supplier and family without assigning a grade strength; edits preserve original and stay unverified',async()=>{
 (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
 const host=document.createElement('div'),root=createRoot(host);let current:SupplierCatalogueState|null=null;
 const render=()=>root.render(<RinglockSupplierFields value={current} onChange={v=>{current=v;render();}}/>);
 const ui=controls(host);
 try{
  await act(async()=>render());expect(ui.label('ผู้จำหน่าย Ringlock').querySelectorAll('option')).toHaveLength(5);
  await ui.choose('ผู้จำหน่าย Ringlock','TH-SUCOOT');await ui.choose('ตระกูล Ringlock','SUCOOT-48');await ui.choose('ชิ้นส่วนของตระกูล','SU48-ST');
  expect(host.textContent).toContain('48.6');expect(host.textContent).toContain('STK 500');
  expect(resolveSupplierCatalogue(current!).components.find(c=>c.id==='SU48-ST')!.Fy_MPa).toBeNull();
  await act(async()=>ui.button('แก้ไขหน้าตัดและวัสดุที่เลือก').click());
  await ui.enter('Fy (MPa)','355');expect(ui.button('บันทึกข้อมูลรอตรวจในฉบับร่าง').disabled).toBe(true);
  await ui.enter('เหตุผลการเพิ่ม','SYNTHETIC test');await ui.enter('หลักฐานการเพิ่ม','SYNTHETIC certificate');
  await act(async()=>ui.button('บันทึกข้อมูลรอตรวจในฉบับร่าง').click());
  expect(current!.edits).toHaveLength(1);expect(current!.original.components.find(c=>c.id==='SU48-ST')!.Fy_MPa).toBeNull();
  expect(resolveSupplierCatalogue(current!).components.find(c=>c.id==='SU48-ST')!.Fy_MPa).toBe(355);expect(current!.confirmed).toBe(false);
  await ui.choose('ผู้จำหน่าย Ringlock','TH-TCB');expect(current!.selection.familyId).toBeNull();expect(current!.selection.componentId).toBeNull();
 }finally{await act(async()=>root.unmount());}
});
it('adds a user supplier and blocks invalid section edits without saving them',async()=>{
 (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
 const host=document.createElement('div'),root=createRoot(host);let current:SupplierCatalogueState=createSupplierCatalogue(data);
 const render=()=>root.render(<RinglockSupplierFields value={current} onChange={v=>{current=v;render();}}/>),ui=controls(host);
 try{
  await act(async()=>render());await act(async()=>ui.button('เพิ่มผู้จำหน่าย').click());
  await ui.enter('ชื่อผู้จำหน่าย','ผู้จำหน่ายทดสอบ');await ui.enter('เหตุผลการเพิ่ม','SYNTHETIC');await ui.enter('หลักฐานการเพิ่ม','SYNTHETIC source');
  await act(async()=>ui.button('บันทึกข้อมูลรอตรวจในฉบับร่าง').click());
  expect(resolveSupplierCatalogue(current).suppliers).toHaveLength(5);expect(host.textContent).toContain('ผู้จำหน่ายทดสอบ');
  await ui.choose('ผู้จำหน่าย Ringlock','TH-SUCOOT');await ui.choose('ตระกูล Ringlock','SUCOOT-48');await ui.choose('ชิ้นส่วนของตระกูล','SU48-ST');
  await act(async()=>ui.button('แก้ไขหน้าตัดและวัสดุที่เลือก').click());await ui.enter('ความหนาท่อ','30');await ui.enter('เหตุผลการเพิ่ม','test');await ui.enter('หลักฐานการเพิ่ม','source');
  await act(async()=>ui.button('บันทึกข้อมูลรอตรวจในฉบับร่าง').click());expect(host.querySelector('[role="alert"]')!.textContent).toContain('ความหนาท่อ');expect(current.edits).toHaveLength(1);
  await act(async()=>ui.button('ยกเลิกการแก้ไขผู้จำหน่าย').click());expect(resolveSupplierCatalogue(current).components.find(c=>c.id==='SU48-ST')!.t_mm).toBe(2.5);
 }finally{await act(async()=>root.unmount());}
});
it('stores supplier choices in the workflow report and makes a frozen report stale after changing supplier',async()=>{
 (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
 const host=document.createElement('div'),root=createRoot(host),ui=controls(host);
 try{
  await act(async()=>root.render(<WorkflowV07Panel input={defaults} caseId="SUPPLIERS"/>));
  await ui.choose('ประเภทองค์อาคาร','SLAB');await ui.choose('ผู้จำหน่าย Ringlock','TH-SUCOOT');await ui.choose('ตระกูล Ringlock','SUCOOT-60');await ui.choose('ชิ้นส่วนของตระกูล','SU60-ST');
  expect(host.textContent).toContain('60.2');expect(host.textContent).toContain('THAI_SUPPLIER_CONNECTION_AND_SYSTEM_EVIDENCE_REQUIRED');
  await act(async()=>ui.button('สร้างรายการคำนวณและรูปคู่ด้านร่าง').click());
  await vi.waitFor(()=>expect(ui.button('ดาวน์โหลดร่าง JSON').disabled).toBe(false));
  expect(host.querySelector('.workflow-v07-documents')!.textContent).toContain('RING System 60 mm');
  await ui.choose('ผู้จำหน่าย Ringlock','TH-TCB');expect(ui.button('ดาวน์โหลดร่าง JSON').disabled).toBe(true);
  expect(host.textContent).toContain('ตัวอย่างกำลังจุดต่อเฉพาะผลิตภัณฑ์ AT-PAC');
 }finally{await act(async()=>root.unmount());}
});
