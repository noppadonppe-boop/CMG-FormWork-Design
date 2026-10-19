// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {webcrypto} from 'node:crypto';
import {TextEncoder} from 'node:util';
import {it,expect,vi} from 'vitest';
import {projectExample} from '../src/domain/mockProject';
import WorkflowV07Panel from '../src/components/WorkflowV07Panel';

it('shows populated required soffit fields, saves a real edit, and restores it on reopen',async()=>{
  vi.stubGlobal('crypto',webcrypto);vi.stubGlobal('TextEncoder',TextEncoder);
  (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  const c=projectExample().cases.find(c=>c.name.includes('S02'))!;
  const host=document.createElement('div');document.body.append(host);let root=createRoot(host);
  let stored=c.workflowV07!;
  const persist=vi.fn(async(d:typeof stored)=>{stored=d;});
  const render=()=>root.render(<WorkflowV07Panel input={c.input} caseId={c.id} initialElementType="SLAB" stored={stored} canPersist onPersist={persist}/>);
  try{
    await act(async()=>{render();});
    const chooseSoffit=()=>[...host.querySelectorAll<HTMLButtonElement>('.wizard-steps button')].find(b=>b.textContent?.includes('แบบท้อง'))!.click();
    await act(async()=>{chooseSoffit();});
    const fields=[...host.querySelectorAll<HTMLInputElement>('.soffit-editor input[aria-required="true"]')];
    expect(fields.length).toBeGreaterThan(10);expect(fields.filter(f=>!f.value.trim())).toHaveLength(0);
    expect(host.querySelector('[data-testid="project-example-guide"]')?.textContent).toContain('18 แนวคร่าว');
    for(const selector of ['.ringlock-assembly-editor','.frame-editor','.support-layout-editor','.closure-input-editor']){
      const inputs=[...host.querySelectorAll<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>(`${selector} input:not([type="file"]):not([type="checkbox"]),${selector} select,${selector} textarea`)];
      expect(inputs.length,selector).toBeGreaterThan(0);
      expect(inputs.filter(i=>!i.disabled&&!i.hasAttribute('data-action-only')&&!i.value.trim()).map(i=>i.closest('label')?.textContent),selector).toEqual([]);
    }
    const evidence=[...host.querySelectorAll('.soffit-editor label')].find(l=>l.textContent?.startsWith('หลักฐานตำแหน่งและโหลด'))!.querySelector('input')!;
    await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(evidence,'EXAMPLE edited source');evidence.dispatchEvent(new Event('input',{bubbles:true}));});
    expect(persist).not.toHaveBeenCalled();
    await act(async()=>{host.querySelector<HTMLButtonElement>('[aria-label="ตรวจตำแหน่งและวิเคราะห์แรงแบบท้อง · ใช้ค่าและบันทึก"]')!.click();});
    await act(async()=>{await new Promise(resolve=>setTimeout(resolve,800));});
    expect(persist).toHaveBeenCalled();expect(stored.model.soffitLayout?.evidenceRef).toBe('EXAMPLE edited source');
    await act(async()=>root.unmount());root=createRoot(host);
    await act(async()=>{render();});await act(async()=>{chooseSoffit();});
    expect([...host.querySelectorAll('.soffit-editor label')].find(l=>l.textContent?.startsWith('หลักฐานตำแหน่งและโหลด'))!.querySelector('input')!.value).toBe('EXAMPLE edited source');
  }finally{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();}
},30000);
