// @vitest-environment jsdom
import {act} from 'react';
import {webcrypto} from 'node:crypto';
import {TextEncoder} from 'node:util';
import {it,expect,vi} from 'vitest';
import {projectExample} from '../src/domain/mockProject';

vi.mock('../src/auth',()=>{
  const profile={uid:'example-user',email:'example@example.com',firstName:'ทดสอบ',lastName:'',position:'Engineer',role:['MasterAdmin'],status:'approved',assignedProjects:[],photoURL:''};
  return {AuthProvider:({children}:{children:unknown})=>children,ProfileMenu:()=>null,navigate:()=>{},usePathname:()=>'/dashboard',useAuth:()=>({firebaseUser:{uid:profile.uid},userProfile:profile,loading:false,authError:null})};
});
vi.mock('../src/AppRouter',()=>({AppRouter:({children}:{children:unknown})=>children}));
const button=(text:string)=>[...document.querySelectorAll('button')].find(b=>b.textContent?.trim().startsWith(text))!;
async function until(check:()=>boolean){for(let i=0;i<100;i++){if(check())return;await act(async()=>{await new Promise(r=>setTimeout(r,100));});}expect(check()).toBe(true);}

it('opens example footing plans through the app and compiles footing plus slab in one drawing book',async()=>{
  vi.stubGlobal('crypto',webcrypto);vi.stubGlobal('TextEncoder',TextEncoder);
  (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  vi.stubEnv('VITE_FIREBASE_ENABLED','false');vi.stubEnv('VITE_WORKFLOW_V07_ENABLED','true');
  const project=projectExample();project.cases=project.cases.filter(c=>c.name.includes('F02')||c.name.includes('S02'));
  localStorage.clear();localStorage.setItem('cmg-formwork-demo-v1',JSON.stringify([project]));
  document.body.innerHTML='<div id="root"></div>';
  await act(async()=>{await import('../src/main');});
  await act(async()=>{button('แปลนและรูปตัด').click();});
  await until(()=>!!document.querySelector('[data-view="installation-plan"]'));
  expect(document.querySelector('[aria-label="ชุดแบบ Project Example"]')).toBeTruthy();
  expect(document.querySelectorAll('[data-view="installation-plan"]')).toHaveLength(1);
  expect(document.querySelectorAll('[data-view="section-X"],[data-view="section-Y"]')).toHaveLength(2);
  expect(document.body.textContent).toContain('EX-F02-M1');
  // The same FW-01..04 construction set as every other project comes first, then the installation book.
  const roots=[...document.querySelectorAll('.a3-print-root')];
  const fw=roots.findIndex(r=>!!r.querySelector('#sheet-FW-01')),book=roots.findIndex(r=>r.classList.contains('project-example-drawings'));
  expect(fw).toBeGreaterThanOrEqual(0);expect(book).toBeGreaterThan(fw);
  for(const code of ['FW-01','FW-02','FW-03','FW-04'])expect(document.getElementById(`sheet-${code}`)).toBeTruthy();
  expect(document.getElementById('sheet-FW-01')!.textContent).not.toContain('Project Example · F02');
  await act(async()=>{button('รวมแบบทั้ง 2').click();});
  await until(()=>document.querySelectorAll('[data-view="installation-plan"]').length===2);
  expect(document.body.textContent).toContain('EX-S02-02');
  expect(document.body.textContent).toContain('NOT FOR CONSTRUCTION');
  expect(button('ดาวน์โหลดชุดแบบ HTML').disabled).toBe(false);
  // Printing one set marks only that set; the print CSS hides the other set on the page.
  const printSpy=vi.spyOn(window,'print').mockImplementation(()=>{});
  const fwRoot=document.getElementById('sheet-FW-01')!.closest('.a3-print-root')!;
  await act(async()=>{(fwRoot.querySelector('.a3-controls button') as HTMLButtonElement).click();});
  expect(printSpy).toHaveBeenCalled();expect(fwRoot.classList.contains('print-target')).toBe(true);
  expect(document.querySelectorAll('.print-target')).toHaveLength(1);
},40000);
