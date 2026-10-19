import {validateBeamInput,type BeamInput} from './beam.js';
import {validateSlabInput,type SlabInput} from './slab.js';
import {validateWallInput,type WallInput} from './wall.js';
import {upgradeInput,validateInput,type Input} from './index.js';
import type {ElementType} from './workflowV07/common.js';
import {createStoredWorkflowDraft,parseStoredWorkflowDraft,type StoredWorkflowDraft} from './workflowV07/storage.js';
import {regenerateDraftLayouts} from './workflowV07/model.js';
import {stampLoadCases} from './workflowV07/loadCases.js';
import {canonical} from './workflowV07/common.js';
import {parseTitleBlock,type TitleBlock} from './titleBlock.js';
import {exampleEvidenceWorksheets} from './projectExampleEvidence.js';
export interface BackupProject{id:string;name:string;code:string;cases:{id:string;name:string;input:Input;workflowElementType?:ElementType;workflowV07?:StoredWorkflowDraft;beam?:BeamInput;slab?:SlabInput;wall?:WallInput;titleBlock?:TitleBlock}[]}
const ELEMENTS:readonly string[]=['FOOTING','COLUMN','WALL','BEAM','SLAB'];
export function parseProjectBackup(text:string,makeId:()=>string=()=>crypto.randomUUID()):BackupProject{
  // A populated ten-case walkthrough includes per-case v0.7 drafts (up to 900 kB
  // each). The old 2 MiB project cap rejected the app's own example export.
  if(text.length>10*1024*1024)throw Error('ไฟล์โครงการใหญ่เกินขอบเขต');
  const raw=JSON.parse(text);
  if(![1,2,3].includes(raw?.schemaVersion)||!raw.project||typeof raw.project.name!=='string'||raw.project.name.length<1||raw.project.name.length>200||typeof raw.project.code!=='string'||raw.project.code.length>60||!Array.isArray(raw.project.cases)||raw.project.cases.length<1||raw.project.cases.length>100)throw Error('รูปแบบไฟล์โครงการไม่ถูกต้อง');
  const projectId=makeId();
  return {id:projectId,name:raw.project.name,code:raw.project.code,cases:raw.project.cases.map((item:unknown)=>{
    if(!item||typeof item!=='object'||!('name' in item)||typeof item.name!=='string'||item.name.length<1||item.name.length>200||!('input' in item))throw Error('รายการแบบไม่ถูกต้อง');
    const element='workflowElementType' in item?item.workflowElementType:undefined;
    if(element!==undefined&&!ELEMENTS.includes(String(element)))throw Error('ประเภทองค์อาคารในไฟล์โครงการไม่ถูกต้อง');
    const beam='beam' in item&&item.beam!=null?{...validateBeamInput(item.beam),confirmed:false}:undefined;
    const slab='slab' in item&&item.slab!=null?{...validateSlabInput(item.slab),confirmed:false}:undefined;
    const wall='wall' in item&&item.wall!=null?{...validateWallInput(item.wall),confirmed:false}:undefined;
    const titleBlock='titleBlock' in item?parseTitleBlock(item.titleBlock):null;
    const id=makeId(),input={...(raw.schemaVersion===3?validateInput(item.input):upgradeInput(item.input,raw.schemaVersion)),confirmed:false};
    let workflowV07='workflowV07' in item&&item.workflowV07!=null?parseStoredWorkflowDraft(item.workflowV07):undefined;
    if(workflowV07){
      let model=regenerateDraftLayouts({...workflowV07.model,id,revisionId:crypto.randomUUID(),humanInputReviewed:false,representatives:[],coverage:[],coverageReview:null},{},{allowIncomplete:true});
      if(model.sourceRef?.startsWith('PROJECT-EXAMPLE')){
        // Retain the declared MOCK rating only for an unchanged configuration;
        // import creates a fresh identity, never an engineering approval.
        if(workflowV07.model.ringlockRating?.status==='MOCK_REFERENCE_ONLY'&&canonical(model.ringlock)===canonical(workflowV07.model.ringlock))model.ringlockRating=workflowV07.model.ringlockRating;
        model.closureInputs=exampleEvidenceWorksheets(model,projectId);
      }
      if(model.loadCases)model={...model,loadCases:stampLoadCases(model,model.loadCases)};
      workflowV07=createStoredWorkflowDraft(model,input);
    }
    return {id,name:item.name,input,...(element!==undefined?{workflowElementType:element as ElementType}:{}),...(workflowV07?{workflowV07}:{}),...(beam?{beam}:{}),...(slab?{slab}:{}),...(wall?{wall}:{}),...(titleBlock?{titleBlock}:{})};
  })};
}
