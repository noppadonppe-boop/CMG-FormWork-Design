"""Verify this handoff only; never access the user's application or external network."""
from pathlib import Path
import json, hashlib, subprocess, re, copy, math, sys, platform
from jsonschema import Draft202012Validator
ROOT=Path(__file__).resolve().parents[1]
def load(p):
    return json.loads((ROOT/p).read_text(encoding='utf-8'), parse_constant=lambda v: (_ for _ in ()).throw(ValueError(v)))
def write(p,d): (ROOT/p).write_text(json.dumps(d,ensure_ascii=False,indent=2,allow_nan=False)+'\n',encoding='utf-8')
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
pairs=[('data/form_tie_machine_bridge.json','schemas/form_tie_bridge.schema.json'),('data/ringlock_component_rating_sidecar.json','schemas/ringlock_reference.schema.json'),('examples/tie_pending_product_evidence.json','schemas/tie_draft.schema.json')]
pairs += [(str(p.relative_to(ROOT)),'schemas/project_input_template.schema.json') for p in sorted((ROOT/'templates').glob('*.json'))]
validations=[]
for datafile,schemafile in pairs:
    s=load(schemafile);Draft202012Validator.check_schema(s);Draft202012Validator(s).validate(load(datafile));validations.append({'data':datafile,'schema':schemafile,'result':'VALID_UNAPPROVED_DATA'})
negative=[]
base=load('examples/tie_pending_product_evidence.json');v=Draft202012Validator(load('schemas/tie_draft.schema.json'))
for name,change in [('client_confirmation',lambda d:d.update(confirmed=True)),('release_go',lambda d:d.update(constructionRelease='GO')),('empty_checks',lambda d:d.update(checks=[])),('duplicate_slot',lambda d:d['checks'][-1].update(slot='INNER_UNIT')),('negative_capacity',lambda d:d['checks'][0].update(capacity_kN=-1)),('string_capacity',lambda d:d['checks'][0].update(capacity_kN='21')),('unapproved_topology',lambda d:d.update(template_id='CONTINUOUS_THROUGH_ROD')),('missing_hash',lambda d:d['context'].pop('designSnapshotHash'))]:
    d=copy.deepcopy(base);change(d);assert list(v.iter_errors(d)), name;negative.append({'mutation':name,'result':'REJECTED'})
for item in load('baseline/manifest.json')['files']:
    p=ROOT/item['path'];assert sha(p)==item['sha256'];assert p.stat().st_size==item['bytes']
# Check source references, count/IDs, all old reference identities retained.
lib=load('data/form_tie_machine_bridge.json');side=load('data/ringlock_component_rating_sidecar.json');sources={s['source_id'] for s in load('data/source_register.json')['sources']}
assert len(sources)==14
assert len(lib['records'])==lib['record_count']==11
assert len({r['record_id'] for r in lib['records']})==11
old=load('baseline/formtie_v0.6.2/data/inner_unit_reference_presets.json')
oldids={r['record_id'] for arr in old.values() if isinstance(arr,list) for r in arr if isinstance(r,dict) and 'record_id'in r}
assert oldids.issubset({r['record_id'] for r in lib['records']})
assert len(side['records'])==side['count']==17
assert len({r['rating_id'] for r in side['records']})==17
assert [sum(r['kind']==k for r in side['records']) for k in ['STANDARD','BRACE','JOINT']]==[6,7,4]
for r in lib['records']+side['records']:
    assert r['source_id'] in sources;assert r['automatic_design_use'] is False
# Independently assemble two Euler-Bernoulli elements and solve free rotations.
# 3 vertical displacements restrained; all 3 rotations free; EI=1 (arbitrary consistent unit).
def solve(a,b):
    a=[row[:]+[bv] for row,bv in zip(a,b)];n=len(b)
    for k in range(n):
        i=max(range(k,n),key=lambda i:abs(a[i][k]));a[k],a[i]=a[i],a[k]
        z=a[k][k];assert abs(z)>1e-14
        a[k]=[x/z for x in a[k]]
        for i in range(n):
            if i!=k:
                z=a[i][k];a[i]=[x-z*y for x,y in zip(a[i],a[k])]
    return [row[-1] for row in a]
def fe_reactions(w,L):
    K=[[0.]*6 for _ in range(6)];f=[0.]*6
    ke=[[12,6*L,-12,6*L],[6*L,4*L*L,-6*L,2*L*L],[-12,-6*L,12,-6*L],[6*L,2*L*L,-6*L,4*L*L]]
    fe=[w*L/2,w*L*L/12,w*L/2,-w*L*L/12]
    for idx in [[0,1,2,3],[2,3,4,5]]:
        for i in range(4):
            f[idx[i]]+=fe[i]
            for j in range(4):K[idx[i]][idx[j]]+=ke[i][j]/L**3
    free=[1,3,5];u=[0.]*6;rot=solve([[K[i][j] for j in free] for i in free],[f[i] for i in free])
    for i,x in zip(free,rot):u[i]=x
    # Return upward-support reactions as positive magnitudes, for this fixed benchmark only.
    return [-(sum(K[i][j]*u[j] for j in range(6))-f[i]) for i in [0,2,4]]
cases=[{'w':w,'L':L} for w in [0.,3.7,32.4] for L in [0.5,0.6,1.2,2.1]]
code="import {twoSpanUdl} from './src/closure-core.mjs';console.log(JSON.stringify("+json.dumps(cases)+".map(c=>twoSpanUdl(c.w,c.L))));"
node=subprocess.run(['node','--input-type=module','-e',code],cwd=ROOT,capture_output=True,text=True,check=True)
node_results=json.loads(node.stdout);comparisons=[]
for case,nr in zip(cases,node_results):
    fem=fe_reactions(case['w'],case['L']);js=[nr['endReaction_kN'],nr['middleReaction_kN'],nr['endReaction_kN']]
    assert all(math.isclose(a,b,rel_tol=1e-10,abs_tol=1e-10) for a,b in zip(fem,js))
    comparisons.append({'input':case,'matrix_reactions_kN':fem,'javascript_closed_form_kN':js,'result':'MATCH_ARITHMETIC_ONLY'})
write('qa/independent_arithmetic_comparison.json',{'method':'Two-element matrix-stiffness assembly; Python independent of JS closed form','comparisons':comparisons,'count':len(comparisons),'engineering_signoff':False})
node_test=subprocess.run(['node','--test','tests/closure-core.test.mjs'],cwd=ROOT,capture_output=True,text=True)
(ROOT/'qa/node-tests.tap').write_text(node_test.stdout+node_test.stderr)
assert node_test.returncode==0
counts={k:int(re.search(r'^# '+k+r' (\d+)',node_test.stdout,re.M).group(1)) for k in ['tests','pass','fail','skipped','todo']}
tsc=subprocess.run(['tsc','-p','tsconfig.reference.json'],cwd=ROOT,capture_output=True,text=True)
(ROOT/'qa/typecheck.txt').write_text(tsc.stdout+tsc.stderr+'\nexit_code='+str(tsc.returncode)+'\n')
assert tsc.returncode==0
report={'package':'RC-FormWork_Closure_Pack_preview26_v1','checked_on':'2026-10-15','status':'HANDOFF_DATA_AND_OFFLINE_HELPER_VERIFICATION_ONLY','node_tests':counts,'independent_matrix_comparisons':len(comparisons),'positive_schema_validations':validations,'negative_schema_mutations':negative,'baseline_files_hash_matched':6,'baseline_ids_retained':sorted(oldids),'data_counts':{'formtie_references':11,'tie_topology_templates':6,'tie_check_slots':13,'ringlock_component_references':17,'pending_project_templates':5,'helper_rule_entries':len(load('data/rule_pack_manifest.json')['rules'])},'typecheck':{'scope':'src/contracts.ts proposed handoff types, not application source','exit_code':tsc.returncode},'environment':{'python':platform.python_version(),'node':subprocess.check_output(['node','--version'],text=True).strip(),'tsc':subprocess.check_output(['tsc','--version'],text=True).strip()},'initial_test_observation':'Initial local pack run:76/77; one new test read limits.My_kNm instead of actual schema limits.value/unit. Fixed only this new test to assert value,unit and source conversion; manufacturer data unchanged. Initial TAP retained. Not the protected application test.','actual_application':{'read':False,'modified':False,'tests_rerun':False,'preview26_counts':'User-reported only','protected_test_modified':False,'full_suite_status':'NOT_RERUN; USER_REPORT_RED'},'engineering_acceptance':False,'confirmed':False,'constructionRelease':'NO_GO','not_performed':['Complete tie assembly or thread strength verification','Whole Ringlock configuration/head/base or joint interaction verification','Geotechnical/slab/punching design verification','Engineer-reviewed design-code rule release','Manual acceptance, app launch, Firebase/MCP live/deploy']}
write('qa/verification_report.json',report)
print(json.dumps({'node':counts,'independent_matrix':len(comparisons),'schema_positive':len(validations),'schema_negative':len(negative),'baseline_hash_files':6,'typecheck':'OK'},indent=2))
