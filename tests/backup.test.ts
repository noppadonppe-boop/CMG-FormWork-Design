import {describe,it,expect} from 'vitest';
import {parseProjectBackup} from '../src/domain/projectBackup';
import {defaults,extensionDefaults} from '../src/domain';
const fixture={schemaVersion:1,project:{id:'old-project',name:'Sample',code:'P01',cases:[{id:'old-case',name:'F1',input:{...defaults,confirmed:true}}]}};
describe('project backup/import boundaries',()=>{
 it('restores inputs with fresh IDs and requires new confirmation',()=>{
   let i=0;const p=parseProjectBackup(JSON.stringify(fixture),()=>String(++i));
   expect(p.id).toBe('1');expect(p.cases[0].id).toBe('2');expect(p.cases[0].input.confirmed).toBe(false);expect(p.cases[0].input.width).toBe(3000);
 });
 it('rejects unknown schemas and empty cases',()=>{
   expect(()=>parseProjectBackup(JSON.stringify({...fixture,schemaVersion:99}))).toThrow();
   expect(()=>parseProjectBackup(JSON.stringify({...fixture,project:{...fixture.project,cases:[]}}))).toThrow();
 });
 it('does not accept invalid dimensions or forged authority fields',()=>{
   const bad=structuredClone(fixture);bad.project.cases[0].input.height=-1;
   expect(()=>parseProjectBackup(JSON.stringify(bad))).toThrow();
   const forged=JSON.parse(JSON.stringify(fixture));forged.project.cases[0].input.approved=true;
   expect(()=>parseProjectBackup(JSON.stringify(forged))).toThrow();
 });
 it('rejects malformed/oversized payload and missing case name',()=>{
   expect(()=>parseProjectBackup('{')).toThrow();expect(()=>parseProjectBackup('x'.repeat(2097153))).toThrow();
   const bad=JSON.parse(JSON.stringify(fixture));delete bad.project.cases[0].name;
   expect(()=>parseProjectBackup(JSON.stringify(bad))).toThrow();
 });
 it('accepts v2 parameters and v1 legacy backups without changing old dimensions',()=>{
   const modern=parseProjectBackup(JSON.stringify({...fixture,schemaVersion:2}));expect(modern.cases[0].input.pairShare).toBe(1);
   const old=JSON.parse(JSON.stringify(fixture));for(const k of Object.keys(extensionDefaults))delete old.project.cases[0].input[k];
   const restored=parseProjectBackup(JSON.stringify(old));expect(restored.cases[0].input.width).toBe(3000);expect(restored.cases[0].input.walerType).toBe('RHS');expect(restored.cases[0].input.confirmed).toBe(false);
   expect(()=>parseProjectBackup(JSON.stringify({...old,schemaVersion:2}))).toThrow();
 });
});
