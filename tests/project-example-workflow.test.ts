import {describe,it,expect} from 'vitest';
import {createHash} from 'node:crypto';
import {projectExample} from '../src/domain/mockProject';
import {definitionHash} from '../src/domain/workflowV07/definitionHash';
import {canonical} from '../src/domain/workflowV07/common';
import {previewWorkflow} from '../src/domain/workflowV07/model';
import {parseStoredWorkflowDraft,WORKFLOW_DRAFT_LIMIT} from '../src/domain/workflowV07/storage';
import {PROJECT_EXAMPLE_REVISION,upgradeProjectExampleCase} from '../src/domain/projectExampleWorkflow';

it('matches standard SHA-256 including Unicode, padding boundaries, and large definitions',()=>{
  for(const value of ['',null,{b:2,a:'ภาษาไทย 😀'},...Array.from({length:130},(_,i)=>'a'.repeat(i)),{layout:'x'.repeat(100000)}])
    expect(definitionHash(value)).toBe('sha256:'+createHash('sha256').update(canonical(value),'utf8').digest('hex'));
  expect(definitionHash({a:1,b:2})).toBe(definitionHash({b:2,a:1}));
  expect(definitionHash({a:1})).not.toBe(definitionHash({a:2}));
});
const example=projectExample('PROJECT-EXAMPLE-001',(()=>{let n=0;return()=>`EX-${++n}`;})());
describe.each(example.cases)('$name',c=>{
  it('opens a populated, parseable draft with a consistent load path and no missing layout',()=>{
    const draft=parseStoredWorkflowDraft(JSON.parse(JSON.stringify(c.workflowV07))),m=draft.model;
    expect(JSON.stringify(draft).length).toBeLessThan(WORKFLOW_DRAFT_LIMIT);
    expect(m.revisionId).toBe(PROJECT_EXAMPLE_REVISION);
    const p=previewWorkflow(m);
    if(m.frameLayout)expect(p.frame?.analysis,p.frame?.blockers.filter(b=>b.startsWith('FRAME_INPUT')).join('\n')).toBeTruthy();
    expect(p.loadCases?.current).toBe(true);
    expect(p.loadCases?.cases.flatMap(c=>c.errors)).toEqual([]);
    if(m.elementType!=='SLAB'){
      expect(p.side,p.blockers.join('\n')).not.toBeNull();
      expect(p.side!.faces.length).toBe(p.topology.faces.length);
      expect(p.blockers.filter(b=>/UNSUPPORTED_TIE_PATH|TIE_COLLISION|STALE_SIDE_LAYOUT/.test(b))).toEqual([]);
    }
    if(m.soffitLayout){
      expect(p.loadPath,p.blockers.join('\n')).not.toBeNull();
      expect(p.blockers).not.toContain('ACTUAL_HEAD_SPACING_DIFFERS_FROM_SELECTED_RINGLOCK_PLAN');
      expect(p.frame?.analysis,p.frame?.blockers.join('\n')).toBeTruthy();
      expect(p.assembly?.rows.every(r=>r.geometryReady)).toBe(true);
      expect(p.headBearings?.rows.every(r=>r.geometryReady),p.headBearings?.rows.flatMap(r=>r.issues).slice(0,10).join('\n')).toBe(true);
      expect(m.supportLayout!.bases.length).toBe(m.ringlock!.legs.length);
      expect(p.supports?.rows.length).toBe(m.ringlock!.legs.length);
      expect(p.blockers.filter(b=>/STALE|MAPPING_STALE|GLOBAL_LOAD_BALANCE_FAILED|GLOBAL_MOMENT_BALANCE_FAILED/.test(b))).toEqual([]);
    }
    expect(m.humanInputReviewed).toBe(false);expect(m.ringlockRating).toBeNull();
    expect(p.constructionRelease).toBe('NO_GO');
  });
});
it('fills a missing example draft but preserves an authored draft and unrelated cases',()=>{
  const c=example.cases[0];
  expect(upgradeProjectExampleCase({...c,workflowV07:undefined}).workflowV07?.model.sideLayout?.faces.length).toBe(4);
  const edited={...c,workflowV07:{...c.workflowV07!,model:{...c.workflowV07!.model,revisionId:'USER-EDIT',sourceRef:'MY-DRAWING'}}};
  expect(upgradeProjectExampleCase(edited)).toBe(edited);
  const ordinary={...c,name:'My real footing',workflowV07:undefined};expect(upgradeProjectExampleCase(ordinary)).toBe(ordinary);
});

it('fills a saved basic-input draft without replacing entered loads or geometry',()=>{
  const c=example.cases.find(c=>c.workflowElementType==='SLAB')!;
  const original={...c,workflowV07:{...c.workflowV07!,model:{...c.workflowV07!.model,revisionId:'MY-BASIC-INPUTS',sourceRef:'My example dimensions',constructionLiveKPa:5,
    soffitLayout:null,sideLayout:null,frameLayout:null,supportLayout:null,ringlockAssembly:null,loadCases:null,members:[],actions:[],requiredChecks:[]}}};
  const updated=upgradeProjectExampleCase(original);
  expect(updated.workflowV07!.model.constructionLiveKPa).toBe(5);
  expect(updated.workflowV07!.model.sourceRef).toBe('My example dimensions');
  expect(updated.workflowV07!.model.soffitLayout?.joistXMm.length).toBeGreaterThan(2);
  expect(previewWorkflow(updated.workflowV07!.model).loadPath).not.toBeNull();
  expect(upgradeProjectExampleCase(updated)).toBe(updated);
});
