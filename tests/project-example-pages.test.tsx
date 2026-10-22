// @vitest-environment jsdom
import {act} from 'react';
import {webcrypto} from 'node:crypto';
import {TextEncoder} from 'node:util';
import {it,expect,vi} from 'vitest';
import {projectExample} from '../src/domain/mockProject';
import {upgradeProjectExampleCase} from '../src/domain/projectExampleWorkflow';
import {suggestedElementTypeFromName} from '../src/domain/caseIntegrity';

vi.mock('../src/auth',()=>{
  const profile={uid:'example-user',email:'example@example.com',firstName:'ทดสอบ',lastName:'',position:'Engineer',role:['MasterAdmin'],status:'approved',assignedProjects:[],photoURL:''};
  return {AuthProvider:({children}:{children:unknown})=>children,ProfileMenu:()=>null,navigate:()=>{},usePathname:()=>'/dashboard',useAuth:()=>({firebaseUser:{uid:profile.uid},userProfile:profile,loading:false,authError:null})};
});
vi.mock('../src/AppRouter',()=>({AppRouter:({children}:{children:unknown})=>children}));
const button=(text:string,root:ParentNode=document)=>[...root.querySelectorAll('button')].find(b=>b.textContent?.trim().startsWith(text))!;
const settle=()=>act(async()=>{await new Promise(r=>setTimeout(r,150));});
/** Everything rendered below the case bar (the page body), and its input fields. */
function page(){
  const out:{text:string;fields:(HTMLInputElement|HTMLSelectElement)[]}={text:'',fields:[]};
  for(let n=document.querySelector('.case-bar')!.nextElementSibling;n;n=n.nextElementSibling){
    if((n as HTMLElement).hidden)continue;out.text+=n.textContent;out.fields.push(...n.querySelectorAll<HTMLInputElement|HTMLSelectElement>('input,select'));
  }
  return out;
}

it('restores Project Example element types from their canonical names',async()=>{
  vi.stubGlobal('crypto',webcrypto);vi.stubGlobal('TextEncoder',TextEncoder);
  expect(suggestedElementTypeFromName('Project Example · S01 · พื้น 6.0 × 4.0 ม.')).toBe('SLAB');
  const slab=projectExample().cases.find(c=>c.name.includes(' S01 '))!;
  const retyped=upgradeProjectExampleCase({...slab,workflowElementType:'FOOTING' as const});
  expect(retyped.workflowElementType).toBe('SLAB');
  expect(retyped.workflowV07?.model.elementType).toBe('SLAB');
});

it('fills the geometry and layout pages of every Project Example case, including cases with a v0.7 draft',async()=>{
  vi.stubGlobal('crypto',webcrypto);vi.stubGlobal('TextEncoder',TextEncoder);
  (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  vi.stubEnv('VITE_FIREBASE_ENABLED','false');vi.stubEnv('VITE_WORKFLOW_V07_ENABLED','true');
  const project=projectExample();
  localStorage.clear();localStorage.setItem('cmg-formwork-demo-v1',JSON.stringify([project]));
  document.body.innerHTML='<div id="root"></div>';
  await act(async()=>{await import('../src/main');});
  const select=()=>document.querySelector('.case-selector select') as HTMLSelectElement;
  expect(document.querySelector('.sidebar-bottom small')?.textContent).toBe('v1.1 · Engineering screening');
  expect(document.querySelector('.app-footer')?.textContent).toContain('v1.1 · Engineering screening');
  // Main work in design order, then the reference group.
  const menu=[...document.querySelectorAll('aside nav button, aside nav .nav-group-label')].map(e=>e.textContent?.trim());
  expect(menu).toEqual(['งานหลัก (ทำตามลำดับ)','ภาพรวม','รับแบบและ AI','รูปทรงและมิติ','Design Criteria','จัดวางเบื้องต้น','รายการคำนวณ','แปลนและรูปตัด','รายงาน PDF','Review & Issue',
    'ข้อมูลประกอบ','จุดต่อและค้ำยัน','คลังวัสดุ/วิธีคำนวณ','Design Book','Audit & Settings']);
  for(const c of project.cases){
    await act(async()=>{const s=select();s.value=c.id;s.dispatchEvent(new Event('change',{bubbles:true}));});await settle();
    for(const tab of ['รูปทรงและมิติ','จัดวางเบื้องต้น']){
      await act(async()=>{button(tab).click();});await settle();
      const {text,fields}=page(),label=`${c.name} · ${tab}`;
      // Editable inputs are present and populated (no blank or zero values in the example data).
      expect(fields.length,label).toBeGreaterThanOrEqual(5);
      for(const field of fields)if(field.type!=='checkbox')expect(field.value,`${label} · ${field.closest('label')?.textContent}`).not.toBe('');
      // The stored v0.7 draft is shown, and on the geometry page every compared dimension matches.
      const summary=document.querySelector('.v07-summary');
      expect(summary,label).toBeTruthy();
      if(tab==='รูปทรงและมิติ'){
        expect(summary!.textContent).toContain('ตรงกัน');expect(summary!.textContent).not.toContain('ไม่ตรงกัน');
        // Layout summary from the entered dimensions, with spacing rows and a link to the layout page.
        const preview=document.querySelector('.layout-preview')!;
        expect(preview,label).toBeTruthy();
        expect(preview.querySelectorAll('tbody tr').length,label).toBeGreaterThanOrEqual(3);
        expect(preview.textContent).toContain('ไม่ใช่การอนุมัติก่อสร้าง');
      }
      expect(text).not.toMatch(/NaN|undefined/);
    }
  }
  // Element buttons open a case of that type instead of retyping the open case.
  const beam=project.cases.find(c=>c.name.includes(' B01 '))!,footing=project.cases.find(c=>c.name.includes(' F01 '))!;
  await act(async()=>{const s=select();s.value=footing.id;s.dispatchEvent(new Event('change',{bubbles:true}));});await settle();
  await act(async()=>{button('คาน',document.querySelector('.element-menu')!).click();});await settle();
  expect(select().value).not.toBe(footing.id);
  expect(project.cases.filter(c=>c.workflowElementType==='BEAM').map(c=>c.id)).toContain(select().value);
  await act(async()=>{const s=select();s.value=footing.id;s.dispatchEvent(new Event('change',{bubbles:true}));});await settle();
  await act(async()=>{button('รูปทรงและมิติ').click();});await settle();
  expect(page().text).toContain('มิติภายในคอนกรีต');
  void beam;
},120000);
