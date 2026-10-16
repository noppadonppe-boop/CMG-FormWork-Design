import assert from 'node:assert/strict';
import {defaults} from '../functions/lib/src/domain/index.js';
const base='http://127.0.0.1:5001/demo-cmg-formwork/asia-southeast1/';
async function signup(){
 const r=await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key',{method:'POST',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/json'},body:JSON.stringify({email:crypto.randomUUID()+'@validation.example',password:'EmulatorTestOnly123!',returnSecureToken:true})});
 const d=await r.json();assert.equal(r.status,200);return d;
}
async function call(name,data,token){
 const r=await fetch(base+name,{method:'POST',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify({data})});
 return {status:r.status,body:await r.json()};
}
let passed=0;
const forbidden=await call('bootstrapOrganization',{});assert.equal(forbidden.status,401);passed++;
const account=await signup(),token=account.idToken;
assert.equal((await call('bootstrapOrganization',{},token)).status,200);passed++;
const input={...defaults,confirmed:true};
const project={id:'integration-project',name:'Integration fixture',code:'TEST',cases:[{id:'F1',name:'Footing fixture',input}]};
assert.equal((await call('saveProject',project,token)).status,200);passed++;
const data={projectId:project.id,caseId:'F1',input};
const a=await call('calculateFormwork',data,token);
assert.equal(a.status,200);assert.equal(a.body.result.constructionEligible,false);
assert.equal(a.body.result.result.pressure,60);assert.notEqual(a.body.result.result.status,'PASS');passed++;
const b=await call('calculateFormwork',data,token);assert.equal(b.body.result.hash,a.body.result.hash);passed++;
const stale=await call('calculateFormwork',{...data,input:{...input,gamma:25}},token);
assert.equal(stale.status,400);assert.equal(stale.body.error.status,'FAILED_PRECONDITION');passed++;
const other=await signup();await call('bootstrapOrganization',{},other.idToken);
const denied=await call('calculateFormwork',data,other.idToken);assert.equal(denied.status,404);passed++;
console.log(JSON.stringify({functionsIntegrationChecks:passed,status:'PASS',scope:'demo emulator only; no AI provider calls'}));
