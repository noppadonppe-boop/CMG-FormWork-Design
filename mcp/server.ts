#!/usr/bin/env node
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import * as z from 'zod';
import {defaults,type Input} from '../src/domain/index.js';
import {ENUMS,FIELD_DOC,ModelStore,NOTICE,alternatives,current,exportModel,summarize,toAppBackup} from './formwork-model.js';

// stdout carries the MCP protocol; route stray library logging to stderr.
console.log=console.error;
const store=new ModelStore(process.env.FORMWORK_MODELS_DIR||fileURLToPath(new URL('../../../artifacts/formwork-models',import.meta.url)));
const server=new McpServer({name:'cmg-formwork',version:'0.1.0'},{instructions:
  'CMG Formwork modelling tools (ไม้แบบฐานราก/เสา). Units: mm, kN/m³, MPa, kN. Workflow: read the drawing, create one model per footing/column, '+
  'show the summary, edit parameters through conversation, export OBJ/DXF for 3D review or app_project for the web app. '+
  'Never invent unknown dimensions; ask the user. Only set confirmed=true when the user explicitly confirms. '+NOTICE});

const changes=z.object(Object.fromEntries((Object.keys(defaults) as (keyof Input)[]).map(k=>{
  const v=defaults[k],e=(ENUMS as Record<string,readonly [string,...string[]]>)[k];
  return [k,(e?z.enum(e):typeof v==='number'?z.number():typeof v==='boolean'?z.boolean():z.string()).optional().describe(FIELD_DOC[k])];
}))).strict();
const reply=(v:unknown)=>({content:[{type:'text' as const,text:typeof v==='string'?v:JSON.stringify(v,null,2)}]});
const run=<A,>(fn:(a:A)=>Promise<unknown>)=>async(a:A)=>{
  try{return reply(await fn(a));}catch(e){return {...reply('Error: '+(e instanceof Error?e.message:String(e))),isError:true};}
};

server.registerTool('formwork_schema',{title:'Formwork input schema',description:'List every model parameter with unit, meaning and default value.'},
  run(async()=>({notice:NOTICE,fields:Object.fromEntries(Object.entries(FIELD_DOC).map(([k,d])=>[k,{description:d,default:defaults[k as keyof Input]}]))})));

server.registerTool('formwork_create_model',{title:'Create formwork model',
  description:'Create a footing/column formwork model from drawing dimensions. Unspecified parameters use app defaults (DEMO values) - tell the user which ones were assumed. Returns the calculated summary.',
  inputSchema:{name:z.string().min(1).max(200).describe('Element name, e.g. "F1" or "C2 (ชั้น 1)"'),project_name:z.string().max(200).optional(),
    project_code:z.string().max(60).optional(),source:z.string().max(500).optional().describe('Drawing file / sheet / revision the dimensions came from'),input:changes.optional()}},
  run(async a=>summarize(await store.create({name:a.name,projectName:a.project_name,projectCode:a.project_code,source:a.source,input:a.input as Partial<Input>}))));

server.registerTool('formwork_list_models',{title:'List formwork models',description:'List saved models (newest first).'},run(async()=>store.list()));

server.registerTool('formwork_get_model',{title:'Get model summary',
  description:'Return geometry, quantities, screening checks, blockers and revision history of a model. detail=true adds formulas and substitutions.',
  inputSchema:{id:z.string(),detail:z.boolean().optional(),history:z.boolean().optional()}},
  run(async a=>{const m=await store.get(a.id);
    return {...summarize(m,a.detail),...(a.history?{history:m.revisions.map(r=>({rev:r.rev,at:r.at,note:r.note}))}:{})};}));

server.registerTool('formwork_update_model',{title:'Edit model parameters',
  description:'Apply parameter edits requested in conversation (e.g. "เพิ่มความสูงเป็น 1200", "ระยะคร่าว 250"). Creates a new revision and returns the recalculated summary. Geometry edits reset confirmed=false.',
  inputSchema:{id:z.string(),changes,note:z.string().min(1).max(300).describe('Short description of the requested change')}},
  run(async a=>summarize(await store.update(a.id,a.changes as Partial<Input>,a.note))));

server.registerTool('formwork_undo',{title:'Undo last edit',description:'Remove the latest revision and return to the previous one.',inputSchema:{id:z.string()}},
  run(async a=>summarize(await store.undo(a.id))));

server.registerTool('formwork_alternatives',{title:'Compare layout alternatives',
  description:'Part 2 optimizer: per-check advice plus recalculated layouts (plywood thickness, stud/waler/tie spacing, tie Ø and, unless sections=false, stud/waler section upgrades from the user RHS/SHS library) with no screening ratio above target, lightest steel first. Recommend one option and apply exactly its changes with formwork_update_model.',inputSchema:{id:z.string(),target:z.number().min(0.5).max(1).optional().describe('Maximum utilization ratio, default 1.0'),sections:z.boolean().optional().describe('Allow section upgrades from the library, default true')}},
  run(async a=>({notice:NOTICE,...alternatives(await store.get(a.id),a.target,a.sections??true)})));

server.registerTool('formwork_export',{title:'Export 3D / data file',
  description:'Export the current revision: gltf (single coloured file, metres, Y-up, Windows 3D Viewer/Blender/web), obj (+mtl), dxf (3DFACE, mm, Z-up for AutoCAD/BricsCAD) or json (model + full calculation).',
  inputSchema:{id:z.string(),format:z.enum(['gltf','obj','dxf','json']),output_dir:z.string().optional().describe('Absolute folder; default <models dir>/exports')}},
  run(async a=>({notice:NOTICE,...await exportModel(store,a.id,a.format,a.output_dir)})));

server.registerTool('formwork_export_app_project',{title:'Export project file for the web app',
  description:'Bundle models into a schemaVersion 3 project JSON that the CMG Formwork web app can import. Imported cases arrive unconfirmed.',
  inputSchema:{ids:z.array(z.string()).min(1).max(100),project_name:z.string().min(1).max(200),project_code:z.string().max(60).default(''),output_dir:z.string().optional()}},
  run(async a=>{
    const models=await Promise.all(a.ids.map(id=>store.get(id))),dir=a.output_dir??path.join(store.dir,'exports');
    await mkdir(dir,{recursive:true});
    const file=path.join(dir,`${a.project_name.replace(/[^\w\u0E00-\u0E7F-]+/g,'_')}-project.json`);
    await writeFile(file,JSON.stringify(toAppBackup(models,a.project_name,a.project_code),null,2),'utf8');
    return {file,cases:models.map(m=>({id:m.id,name:m.name,kind:current(m).kind}))};
  }));

const IMAGES:Record<string,string>={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif'};
server.registerTool('formwork_read_drawing',{title:'Read drawing file',
  description:'Read a drawing the user provides. PDF: text per page plus dimension/label candidates, and page images (scanned pages automatically, or all requested pages with render=true; max 3 images). Image file: returns the picture for visual reading. Always confirm the extracted dimensions with the user.',
  inputSchema:{path:z.string().describe('Absolute path to .pdf/.png/.jpg/.webp'),pages:z.array(z.number().int().positive()).max(20).optional().describe('PDF pages, default first 5'),
    render:z.boolean().optional().describe('PDF: render pages to PNG for visual reading (default: only pages without a text layer)')}},
  async a=>{
    try{
      const file=path.resolve(a.path),ext=path.extname(file).toLowerCase(),buf=await readFile(file);
      if(IMAGES[ext]){
        if(buf.length>8*1024*1024)throw Error('Image larger than 8 MB');
        return {content:[{type:'text' as const,text:`Image ${path.basename(file)}. Read the element names and dimensions (mm), list them for the user to confirm before creating models.`},
          {type:'image' as const,data:buf.toString('base64'),mimeType:IMAGES[ext]}]};
      }
      if(ext!=='.pdf')throw Error('Supported: .pdf, '+Object.keys(IMAGES).join(', '));
      if(buf.length>60*1024*1024)throw Error('PDF larger than 60 MB');
      const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
      const assets=(d:string)=>path.join(path.dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json')),d).replace(/\\/g,'/')+'/';
      const doc=await pdfjs.getDocument({data:new Uint8Array(buf),disableFontFace:true,verbosity:0,wasmUrl:assets('wasm'),
        standardFontDataUrl:assets('standard_fonts'),cMapUrl:assets('cmaps'),iccUrl:assets('iccs')}).promise;
      const list=(a.pages?.length?a.pages:Array.from({length:Math.min(doc.numPages,5)},(_,i)=>i+1)).filter(p=>p<=doc.numPages);
      const pages=[],images:{type:'image';data:string;mimeType:string}[]=[],numbers=new Map<string,number>(),labels=new Map<string,number>();
      for(const p of list){
        const page=await doc.getPage(p),items=(await page.getTextContent()).items as {str?:string}[];
        const text=items.map(i=>i.str??'').filter(Boolean).join(' ').replace(/\s+/g,' ').trim();
        for(const n of text.match(/(?<![\d.,])\d{3,5}(?![\d.,])/g)??[])numbers.set(n,(numbers.get(n)??0)+1);
        for(const l of text.match(/\b(?:F|C|PC|GB|FB|P|B)\d{1,3}[A-Z]?\b/g)??[])labels.set(l,(labels.get(l)??0)+1);
        let rendered=false;
        if((a.render??!text)&&images.length<3){
          const base=page.getViewport({scale:1}),viewport=page.getViewport({scale:Math.min(4,2000/Math.max(base.width,base.height))});
          const factory=(doc as unknown as {canvasFactory:{create(w:number,h:number):{canvas:{toBuffer(m:string):Buffer};context:unknown}}}).canvasFactory;
          const {canvas,context}=factory.create(Math.ceil(viewport.width),Math.ceil(viewport.height));
          await page.render({canvasContext:context as never,canvas:canvas as never,viewport}).promise;
          images.push({type:'image',data:canvas.toBuffer('image/png').toString('base64'),mimeType:'image/png'});rendered=true;
        }
        pages.push({page:p,text:text.slice(0,20000)||'(no text layer - scanned page)',renderedImage:rendered});
      }
      const top=(m:Map<string,number>,n:number)=>[...m].sort((x,y)=>y[1]-x[1]).slice(0,n).map(([v,c])=>({value:v,count:c}));
      await doc.destroy();
      return {content:[...reply({file,numPages:doc.numPages,pages,dimensionCandidates_mm:top(numbers,40),labelCandidates:top(labels,40),
        hint:'Candidates are unverified text matches; rendered page images follow (max 3). Map values to elements, ask the user about anything missing, then call formwork_create_model.'}).content,...images]};
    }catch(e){return {...reply('Error: '+(e instanceof Error?e.message:String(e))),isError:true};}
  });

server.registerPrompt('formwork_from_drawing',{title:'Model formwork from a drawing',description:'Guided workflow: drawing -> models -> conversation edits -> 3D export',
  argsSchema:{file:z.string().optional().describe('Absolute path of the drawing (PDF/PNG/JPG)')}},
  ({file})=>({messages:[{role:'user',content:{type:'text',text:[
    `Create formwork (ไม้แบบ) models from ${file?`the drawing at ${file}`:'the drawing I will provide'} using the cmg-formwork MCP tools.`,
    '1. formwork_read_drawing, then list every footing/column with kind, shape, width, length, (L arms) and pour height in mm, citing where each value came from.',
    '2. Ask me for any missing or ambiguous value. Do not guess dimensions.',
    '3. formwork_create_model for each element (source = file/sheet), then show status, quantities, failing checks and blockers in a short table.',
    '4. Let me request changes in conversation and apply them with formwork_update_model; when checks fail or I ask to make it pass, call formwork_alternatives, recommend one option with reasons and apply exactly its changes after I agree.',
    '5. When I ask, export obj/dxf for 3D review and formwork_export_app_project for the web app.',
    'All results are preliminary screening, not construction approval. Reply in Thai.'].join('\n')}}]}));

await server.connect(new StdioServerTransport());
