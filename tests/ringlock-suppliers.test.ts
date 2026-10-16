import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {expect,it} from 'vitest';
import {createSupplierCatalogue, editSupplierRecord, resolveSupplierCatalogue, screenSupplierCatalogue, selectSupplierRecord, SUPPLIER_SOURCE_SHA256} from '../src/domain/workflowV07/ringlockSuppliers';
import {emptyRinglockResearchChoice, selectRinglockResearch} from '../src/domain/workflowV07/ringlockResearch';
import {previewWorkflow, reviseDraft} from '../src/domain/workflowV07/model';
import {freezeDesign, documentView, importDraft} from '../src/domain/workflowV07/snapshot';
import {builtModel} from './fixtures/workflow-v07-soffit';
import {references} from '../src/workflowV07References';

const bytes=readFileSync('src/reference/workflow-v07/thai-ringlock-suppliers-2026-10-15.json');
const initial=()=>createSupplierCatalogue(JSON.parse(bytes.toString()));
const sucoot=()=>selectSupplierRecord(selectSupplierRecord(selectSupplierRecord(initial(),'supplierId','TH-SUCOOT'),'familyId','SUCOOT-48'),'componentId','SU48-ST');
it('loads the exact dated supplier dataset and keeps all unknown strengths and capacities null',()=>{
  expect(bytes).toEqual(readFileSync('artifacts/ringlock-system-reference-2026-10-15/thai-ringlock-suppliers.json'));
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(SUPPLIER_SOURCE_SHA256);
  const s=initial(),d=resolveSupplierCatalogue(s);
  expect(d.suppliers).toHaveLength(4);expect(d.families).toHaveLength(5);expect(d.components).toHaveLength(21);
  expect(d.components.every(c=>c.Fy_MPa===null&&c.Fu_MPa===null)).toBe(true);
  expect(d.capacity_records).toHaveLength(30);expect(d.capacity_records.every(c=>c.value===null&&c.verified===false)).toBe(true);
  expect(s.selection).toEqual({supplierId:null,familyId:null,componentId:null,capacityId:null});
});
it('preserves joint/analysis source files exactly as examples and rejects imported confirmation flags',()=>{
  for(const file of ['ringlock-joint-system-reference','ringlock-analysis-contract'])expect(readFileSync(`src/reference/workflow-v07/${file}-2026-10-15.json`)).toEqual(readFileSync(`artifacts/ringlock-system-reference-2026-10-15/${file}.json`));
  const s=initial();(s as {confirmed:boolean}).confirmed=true;expect(()=>resolveSupplierCatalogue(s)).toThrow(/state/);
});
it('keeps foot and metric dimensions exact and rejects cross-family selections',()=>{
  const s=sucoot();expect(screenSupplierCatalogue(s,{bayXMm:1200,bayYMm:1500}).planMatches).toEqual({x:true,y:true});
  expect(()=>selectSupplierRecord(s,'componentId','TCB-ST')).toThrow(/family/);
  const t=selectSupplierRecord(selectSupplierRecord(s,'supplierId','TH-TCB'),'familyId','TCB-FOOT');
  expect(t.selection.componentId).toBeNull();expect(screenSupplierCatalogue(t,{bayXMm:1200,bayYMm:1500}).planMatches).toEqual({x:false,y:false});
  expect(screenSupplierCatalogue(t,{bayXMm:1219,bayYMm:1829}).planMatches).toEqual({x:true,y:true});
});
it('retains originals and requires evidence; forged histories and authority edits are rejected',()=>{
  const s=sucoot();
  expect(()=>editSupplierRecord(s,'components','SU48-ST',{Fy_MPa:355},'', 'certificate')).toThrow();
  expect(()=>editSupplierRecord(s,'components','SU48-ST',{project_verified:true},'test','source')).toThrow(/not editable/);
  const n=editSupplierRecord(s,'components','SU48-ST',{Fy_MPa:355},'SYNTHETIC assumption','SYNTHETIC certificate');
  expect(n.original.components.find(c=>c.id==='SU48-ST')!.Fy_MPa).toBeNull();
  expect(resolveSupplierCatalogue(n).components.find(c=>c.id==='SU48-ST')!.Fy_MPa).toBe(355);
  expect(s.edits).toHaveLength(0);expect(n.edits).toHaveLength(1);expect(n.confirmed).toBe(false);
  n.edits[0].before!.Fy_MPa=500;expect(()=>resolveSupplierCatalogue(n)).toThrow(/history/);
});
it('rejects invalid sections and material values without treating missing values as zero',()=>{
  for(const changes of [{D_mm:0},{t_mm:30},{Fy_MPa:NaN},{Fy_MPa:355,Fu_MPa:300}])expect(()=>editSupplierRecord(sucoot(),'components','SU48-ST',changes,'test','source')).toThrow();
  const n=editSupplierRecord(sucoot(),'components','SU48-ST',{D_mm:null,t_mm:null},'unknown','source');
  expect(screenSupplierCatalogue(n,null).component!.D_mm).toBeNull();
});
it('adds supplier, family and components with parent links and an auditable record',()=>{
  let s=editSupplierRecord(initial(),'suppliers','CUSTOM-S',{name:'Test supplier',phone:null},'add','SYNTHETIC source');
  s=selectSupplierRecord(s,'supplierId','CUSTOM-S');
  s=editSupplierRecord(s,'families','CUSTOM-F',{supplier_id:'CUSTOM-S',label:'Test metric',module_system:'METRIC',published_ledger_labels_mm:[1200,1500],standard_lengths_mm:[2000]},'add','source');
  s=selectSupplierRecord(s,'familyId','CUSTOM-F');
  s=editSupplierRecord(s,'components','CUSTOM-C',{family_id:'CUSTOM-F',role:'STANDARD',D_mm:48.3,t_mm:3.2},'add','source');
  s=selectSupplierRecord(s,'componentId','CUSTOM-C');
  expect(screenSupplierCatalogue(s,null).component!.id).toBe('CUSTOM-C');expect(s.edits).toHaveLength(3);
  expect(()=>editSupplierRecord(s,'families','CUSTOM-F',{published_ledger_labels_mm:[1200,1200]},'bad','source')).toThrow(/Duplicate/);
});
it('capacity entry needs explicit units and basis and never becomes an app rating',()=>{
  let s=sucoot();const id='SUCOOT-48-SYSTEM_CONFIGURATION-PENDING';
  expect(()=>editSupplierRecord(s,'capacity_records',id,{value:10000},'test','source')).toThrow(/หน่วย/);
  expect(()=>editSupplierRecord(s,'capacity_records',id,{value:10000,unit:'N/mm',resistance_basis:'ALLOWABLE'},'test','source')).toThrow(/STIFFNESS/);
  s=editSupplierRecord(s,'capacity_records',id,{value:10000,unit:'N',resistance_basis:'ULTIMATE_TEST'},'test','SYNTHETIC report');
  s=selectSupplierRecord(s,'capacityId',id);
  const screen=screenSupplierCatalogue(s,null);expect(screen.capacity!.verified).toBe(false);
  expect(screen.blockers).toContain('THAI_SUPPLIER_CAPACITY_ENTRY_NOT_USED_AS_RATING');expect(screen.constructionRelease).toBe('NO_GO');
});
it('includes supplier changes in frozen reports and invalidates earlier results; draft import preserves evidence',async()=>{
  const make=(supplierCatalogue:ReturnType<typeof initial>)=>selectRinglockResearch(references.ringlockResearch,references.ringlockResearchSha256,{...emptyRinglockResearchChoice(),supplierCatalogue});
  const m={...builtModel(),ringlockResearch:make(sucoot())},f=await freezeDesign(m);
  const edited=editSupplierRecord(sucoot(),'components','SU48-ST',{Fy_MPa:355},'SYNTHETIC','source');
  const changed=reviseDraft(m,{ringlockResearch:make(edited)});
  expect((await documentView(f,changed)).freshness).toBe('STALE');
  expect(f.content.model.ringlockResearch!.choice.supplierCatalogue!.edits).toHaveLength(0);
  const imported=importDraft(JSON.parse(JSON.stringify(changed)));
  expect(imported.ringlockResearch!.choice.supplierCatalogue!.edits).toHaveLength(1);expect(imported.humanInputReviewed).toBe(false);
  expect(imported.ringlockRating).toBeNull();expect(previewWorkflow(imported).constructionEligible).toBe(false);
});
