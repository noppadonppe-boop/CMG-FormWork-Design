import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {afterEach,beforeEach,describe,expect,it} from 'vitest';
import {calculate,defaults} from '../src/domain/index.js';
import {parseProjectBackup} from '../src/domain/projectBackup.js';
import {ModelStore,applyChanges,buildScene,current,exportModel,summarize,toAppBackup,toDxf} from '../mcp/formwork-model.js';

let dir:string,store:ModelStore;
beforeEach(async()=>{dir=await mkdtemp(path.join(tmpdir(),'fw-mcp-'));store=new ModelStore(dir);});
afterEach(async()=>rm(dir,{recursive:true,force:true}));

describe('formwork MCP model store',()=>{
  it('creates, edits with revisions, resets confirmation on geometry change and undoes',async()=>{
    const m=await store.create({name:'F1',input:{width:2000,length:2500,height:800,confirmed:true,studSpacing:300,walerSpacing:400,tieSpacing:500}});
    expect(current(m).confirmed).toBe(true);
    const u=await store.update(m.id,{height:1200},'raise pour');
    expect(u.revisions).toHaveLength(2);
    expect(current(u)).toMatchObject({height:1200,confirmed:false});
    expect((await store.undo(m.id)).revisions).toHaveLength(1);
    expect((await store.list()).map(x=>x.id)).toEqual([m.id]);
  });
  it('rejects invalid edits without saving',async()=>{
    const m=await store.create({name:'C1',input:{kind:'COLUMN',width:400,length:600,height:3000,studSpacing:200,tieSpacing:300}});
    await expect(store.update(m.id,{rhsT:40},'bad')).rejects.toThrow();
    await expect(store.update(m.id,{unknown:1} as never,'bad')).rejects.toThrow();
    expect((await store.get(m.id)).revisions).toHaveLength(1);
  });
  it('fills grade strengths and L-arm defaults',()=>{
    expect(applyChanges(defaults,{tieGrade:'SR24'})).toMatchObject({tieFy:235,tieFu:385});
    expect(applyChanges({...defaults,shape:'RECTANGLE'},{shape:'L'})).toMatchObject({armX:1500,armY:2000});
  });
});

describe('formwork MCP scene and exports',()=>{
  it('builds members consistent with the screening layout',()=>{
    const r=calculate(defaults),s=buildScene(r);
    const studs=r.faces.reduce((n,f)=>n+Math.ceil(f.length/defaults.studSpacing-1e-9)+1,0);
    expect(s.quantities.studs.count).toBe(studs);
    expect(s.quantities.walers.members).toBe(r.faces.length*r.waler.levels.length*2);
    expect(s.quantities.ties.count).toBeGreaterThan(0);
    expect(s.solids.every(x=>x.triangles.every(t=>t.every(i=>i<x.vertices.length)))).toBe(true);
    expect(toDxf(s.solids)).toMatch(/3DFACE[\s\S]*EOF\n$/);
  });
  it('writes obj/mtl/dxf/json and app backup that the web app accepts',async()=>{
    const m=await store.create({name:'F2',input:{shape:'L',width:3000,length:3000,armX:1200,armY:1200,height:900,studSpacing:300,walerSpacing:450,tieSpacing:600}});
    const obj=await exportModel(store,m.id,'obj');
    expect(obj.files.map(f=>path.extname(f))).toEqual(['.obj','.mtl']);
    expect(await readFile(obj.files[0],'utf8')).toMatch(/^# PRELIMINARY[\s\S]*\nf \d+ \d+ \d+/);
    expect((await exportModel(store,m.id,'dxf')).files).toHaveLength(1);
    expect(summarize(m).warnings.join()).toMatch(/Re-entrant/);
    const p=parseProjectBackup(JSON.stringify(toAppBackup([m],'Demo','D-1')));
    expect(p.cases[0]).toMatchObject({name:'F2',input:{...current(m),confirmed:false}});
  });
});
