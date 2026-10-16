import {mkdir,readFile,readdir,rename,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {calculate,defaults,type Input} from '../src/domain/index.js';
import {optimizerBrief} from '../src/domain/optimize.js';
import {SECTION_STOCK} from '../src/domain/sectionStock.js';
import {NOTICE,applyChanges,buildScene,toDxf,toGltf,toObj} from '../src/domain/scene.js';
export {ENUMS,FIELD_DOC,NOTICE,applyChanges,buildScene,toDxf,toGltf,toObj} from '../src/domain/scene.js';

export interface Revision{rev:number;at:string;note:string;input:Input}
export interface FormworkModel{schema:'cmg-formwork-mcp/1';id:string;name:string;projectName:string;projectCode:string;source:string;
  createdAt:string;updatedAt:string;revisions:Revision[]}
export const current=(m:FormworkModel)=>m.revisions[m.revisions.length-1].input;

export class ModelStore{
  constructor(readonly dir:string){}
  private file(id:string){if(!/^[a-z0-9-]{1,80}$/.test(id))throw Error('Invalid model id: '+id);return path.join(this.dir,id+'.json');}
  async get(id:string):Promise<FormworkModel>{
    try{return JSON.parse(await readFile(this.file(id),'utf8'));}
    catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')throw Error('Model not found: '+id);throw e;}
  }
  async save(m:FormworkModel){
    await mkdir(this.dir,{recursive:true});
    const f=this.file(m.id),tmp=f+'.'+randomUUID().slice(0,8)+'.tmp';
    await writeFile(tmp,JSON.stringify(m,null,2),'utf8');await rename(tmp,f);return m;
  }
  async list(){
    const names=await readdir(this.dir).catch(()=>[] as string[]),out=[];
    for(const n of names.filter(n=>n.endsWith('.json'))){
      const m=await this.get(n.slice(0,-5)).catch(()=>null);if(!m)continue;
      const x=current(m);
      out.push({id:m.id,name:m.name,project:m.projectName,revision:m.revisions.length,kind:x.kind,shape:x.shape,
        size_mm:`${x.width} x ${x.length} x H${x.height}`,confirmed:x.confirmed,updatedAt:m.updatedAt});
    }
    return out.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
  }
  async create(o:{name:string;projectName?:string;projectCode?:string;source?:string;input?:Partial<Input>}){
    const at=new Date().toISOString(),slug=o.name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,40);
    const input=applyChanges({...defaults,confirmed:false},{confirmed:false,...o.input});
    return this.save({schema:'cmg-formwork-mcp/1',id:(slug?slug+'-':'')+randomUUID().slice(0,8),name:o.name,projectName:o.projectName??'MCP project',
      projectCode:o.projectCode??'',source:o.source??'',createdAt:at,updatedAt:at,revisions:[{rev:1,at,note:'created',input}]});
  }
  async update(id:string,changes:Partial<Input>,note:string){
    const m=await this.get(id),at=new Date().toISOString();
    m.revisions.push({rev:m.revisions[m.revisions.length-1].rev+1,at,note,input:applyChanges(current(m),changes)});
    if(m.revisions.length>200)m.revisions.splice(0,m.revisions.length-200);
    m.updatedAt=at;return this.save(m);
  }
  async undo(id:string){
    const m=await this.get(id);if(m.revisions.length<2)throw Error('No earlier revision to restore');
    m.revisions.pop();m.updatedAt=new Date().toISOString();return this.save(m);
  }
}

const round=(v:number|null,d=3)=>v===null?null:Math.round(v*10**d)/10**d;
export function summarize(m:FormworkModel,detail=false){
  const r=calculate(current(m)),scene=buildScene(r);
  return {notice:NOTICE,id:m.id,name:m.name,project:m.projectName,source:m.source,revision:m.revisions[m.revisions.length-1].rev,
    lastChange:m.revisions[m.revisions.length-1].note,status:r.status,input:r.input,
    geometry:{area_m2:round(r.area),perimeter_m:round(r.perimeter),concreteVolume_m3:round(r.volume),formArea_m2:round(r.formArea),pressure_kPa:round(r.pressure),
      faces:r.faces.map(f=>({id:f.id,length_mm:round(f.length,1),force_kN:round(f.force)}))},
    quantities:scene.quantities,
    checks:r.checks.map(c=>({id:c.id,label:c.label,demand:round(c.demand),limit:round(c.limit),unit:c.unit,utilization:round(c.utilization),status:c.status,
      ...(detail?{formula:c.formula,substitution:c.substitution,note:c.note,source:c.source}:{})})),
    tie:r.tie&&{force_kN:round(r.tie.force),face:r.tie.faceId,length_mm:r.tie.length,requiredGrossDiameter_mm:round(r.tie.requiredGrossDiameter,1),bodyCandidate_mm:r.tie.bodyCandidate},
    blockers:r.blockers,warnings:scene.warnings};
}
export function alternatives(m:FormworkModel,target=1,sections=true){
  return optimizerBrief(current(m),sections?SECTION_STOCK:[],target,5);
}

/** schemaVersion 3 project file accepted by the web app's "import project" (parseProjectBackup). */
export function toAppBackup(models:FormworkModel[],name:string,code:string){
  return {schemaVersion:3,app:'CMG Formwork cloud trial',project:{id:randomUUID(),name,code,cases:models.map(m=>({id:randomUUID(),name:m.name,input:current(m)}))}};
}

export async function exportModel(store:ModelStore,id:string,format:'obj'|'gltf'|'dxf'|'json',outDir?:string){
  const m=await store.get(id),r=calculate(current(m)),dir=outDir??path.join(store.dir,'exports'),base=`${m.id}-r${m.revisions[m.revisions.length-1].rev}`;
  await mkdir(dir,{recursive:true});
  const files:string[]=[],write=async(ext:string,text:string)=>{const f=path.join(dir,`${base}.${ext}`);await writeFile(f,text,'utf8');files.push(f);};
  const {solids,warnings}=buildScene(r);
  if(format==='json')await write('json',JSON.stringify({notice:NOTICE,model:m,result:r},null,2));
  else if(format==='obj'){const o=toObj(solids,base);await write('obj',o.obj);await write('mtl',o.mtl);}
  else if(format==='gltf')await write('gltf',toGltf(solids,m.name));
  else await write('dxf',toDxf(solids));
  return {files,warnings,solids:solids.length};
}
