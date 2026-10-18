// Smoke test: start the built MCP server over stdio and exercise the main tools.
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';

const dir=await mkdtemp(path.join(tmpdir(),'fw-mcp-smoke-'));
const client=new Client({name:'smoke',version:'1'});
await client.connect(new StdioClientTransport({command:process.execPath,args:['mcp/dist/mcp/server.js'],env:{...process.env,FORMWORK_MODELS_DIR:dir}}));
const call=async(name,args={})=>{const r=await client.callTool({name,arguments:args});if(r.isError)throw Error(name+': '+r.content[0].text);return r.content;};
try{
  console.log('tools:',(await client.listTools()).tools.map(t=>t.name).join(', '));
  console.log('prompts:',(await client.listPrompts()).prompts.map(p=>p.name).join(', '));
  const created=JSON.parse((await call('formwork_create_model',{name:'F1',input:{width:2000,length:2500,height:800,studSpacing:300,walerSpacing:400,tieSpacing:500}}))[0].text);
  const updated=JSON.parse((await call('formwork_update_model',{id:created.id,changes:{height:1200},note:'raise'}))[0].text);
  console.log('model',created.id,'rev',updated.revision,'status',updated.status,'pressure',updated.geometry.pressure_kPa);
  console.log(JSON.parse((await call('formwork_export',{id:created.id,format:'obj'}))[0].text).files);
  for(const [element,input] of [['BEAM',{b:300,h:600,length:6000}],['SLAB',{lx:6000,ly:4000,t:150}],['WALL',{length:6000,t:250,height:3000}]]){
    const d=JSON.parse((await call('formwork_element_check',{element}))[0].text);
    const r=JSON.parse((await call('formwork_element_check',{element,input,project_name:'smoke-'+element}))[0].text);
    if(!d.defaults||!['FAIL','INCOMPLETE'].includes(r.status)||!r.checks.length||!r.file)throw Error('element check '+element);
    console.log(element,r.status,r.checks.length,'checks',path.basename(r.file));
  }
  if(process.argv[2]){const c=await call('formwork_read_drawing',{path:path.resolve(process.argv[2]),pages:[1]});
    console.log(c[0].text.slice(0,400),'\nimages:',c.slice(1).map(i=>i.mimeType+' '+Math.round(i.data.length*3/4/1024)+' KB'));}
}finally{await client.close();await rm(dir,{recursive:true,force:true});}
