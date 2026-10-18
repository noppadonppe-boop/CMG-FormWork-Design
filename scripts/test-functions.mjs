import assert from 'node:assert/strict';
import {defaults} from '../functions/lib/src/domain/index.js';
import {applyReviewAction, emptyReviewRecord} from '../functions/lib/src/domain/workflowV07/review.js';
function emulatorHost(name, fallback) {
 const raw = process.env[name] || fallback;
 const value = raw.includes('://') ? new URL(raw).host : raw;
 if (!/^(127\.0\.0\.1|localhost):\d+$/.test(value)) throw new Error(`Refusing nonlocal ${name}: ${value}`);
 return value;
}
const authHost = emulatorHost('FIREBASE_AUTH_EMULATOR_HOST', '127.0.0.1:9099');
const firestoreHost = emulatorHost('FIRESTORE_EMULATOR_HOST', '127.0.0.1:8080');
const functionsHost = emulatorHost('FUNCTIONS_EMULATOR_HOST', '127.0.0.1:5001');
const base=`http://${functionsHost}/demo-cmg-formwork/asia-southeast1/`;
async function signup(){
 const email=crypto.randomUUID()+'@validation.example';
 const r=await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key`,{method:'POST',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:'EmulatorTestOnly123!',returnSecureToken:true})});
 const d=await r.json();assert.equal(r.status,200);return {...d,email};
}
async function seedProfile(account, role='MasterAdmin', assignedProjects=[]){
 const path=`RC-FormWork-App/root/users/${account.email}`;
 const body={fields:{uid:{stringValue:account.localId},email:{stringValue:account.email},firstName:{stringValue:'Integration'},lastName:{stringValue:'Tester'},position:{stringValue:'Engineer'},department:{stringValue:'Test'},role:{arrayValue:{values:[{stringValue:role}]}},status:{stringValue:'approved'},assignedProjects:{arrayValue:{values:assignedProjects.map(value=>({stringValue:value}))}},projectPermissions:{mapValue:{fields:{}}},createdAt:{timestampValue:'2023-11-14T22:13:20.000Z'},photoURL:{stringValue:''},isFirstUser:{booleanValue:false}}};
 // The emulator-only `owner` token bypasses Firestore Rules so the fixture can
 // seed a managed profile before exercising the callable auth/RBAC path. This
 // header is never used against a production endpoint (the host is validated
 // as loopback above).
 const r=await fetch(`http://${firestoreHost}/v1/projects/demo-cmg-formwork/databases/(default)/documents/${path}`,{method:'PATCH',headers:{'Content-Type':'application/json',Authorization:'Bearer owner'},body:JSON.stringify(body)});
 assert.equal(r.status,200,await r.text());
}
async function call(name,data,token){
 const r=await fetch(base+name,{method:'POST',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify({data})});
 return {status:r.status,body:await r.json()};
}
let passed=0;
const forbidden=await call('bootstrapOrganization',{});assert.equal(forbidden.status,401);passed++;
const aiForbidden=await call('getAiSettings',{});assert.equal(aiForbidden.status,401);passed++;
const account=await signup(),token=account.idToken; await seedProfile(account);
assert.equal((await call('bootstrapOrganization',{},token)).status,200);passed++;
const aiInitial=await call('getAiSettings',{},token);
assert.equal(aiInitial.status,200);
assert.equal(aiInitial.body.result.providers.openai.hasKey,false);
passed++;
const aiSaved=await call('saveAiSettings',{activeProvider:'openai',prompt:'',providers:{openai:{model:'gpt-6.1-sol'},google:{model:'gemini-3.8-flash'},anthropic:{model:'claude-sonnet-5-5'}}},token);
assert.equal(aiSaved.status,200);
assert.equal(aiSaved.body.result.providers.openai.hasKey,false);
assert.equal(JSON.stringify(aiSaved.body).includes('apiKey'),false);
passed++;
const input={...defaults,confirmed:true};
const project={id:'integration-project',name:'Integration fixture',code:'TEST',cases:[{id:'F1',name:'Footing fixture',input}]};
assert.equal((await call('saveProject',project,token)).status,200);passed++;
const reviewDraft=emptyReviewRecord(project.id,'F1',0);
const reviewActor={uid:account.localId,name:'Integration Tester',roles:['MasterAdmin'],projectId:project.id};
const reviewSubmission=applyReviewAction(reviewDraft,'SUBMIT',reviewActor,{contentHash:'fixture-review-hash',engineVersion:'0.7.0-preview.32',draftPending:false},'',Date.now());
const reviewSaved=await call('saveReviewRecord',{record:reviewSubmission},token);
assert.equal(reviewSaved.status,200);assert.equal(reviewSaved.body.result.record.state,'SUBMITTED');passed++;
const forgedReview={...reviewSubmission,history:[]};
const reviewRejected=await call('saveReviewRecord',{record:forgedReview},token);
assert.equal(reviewRejected.status,400);passed++;
const data={projectId:project.id,caseId:'F1',input};
const a=await call('calculateFormwork',data,token);
assert.equal(a.status,200);assert.equal(a.body.result.constructionEligible,false);
assert.equal(a.body.result.result.pressure,60);assert.notEqual(a.body.result.result.status,'PASS');passed++;
const b=await call('calculateFormwork',data,token);assert.equal(b.body.result.hash,a.body.result.hash);passed++;
const stale=await call('calculateFormwork',{...data,input:{...input,gamma:25}},token);
assert.equal(stale.status,400);assert.equal(stale.body.error.status,'FAILED_PRECONDITION');passed++;
const other=await signup(); await seedProfile(other,'Staff'); await call('bootstrapOrganization',{},other.idToken);
const denied=await call('calculateFormwork',data,other.idToken);assert.equal(denied.status,403);passed++;
console.log(JSON.stringify({functionsIntegrationChecks:passed,status:'PASS',scope:'demo emulator only; no AI provider calls'}));
