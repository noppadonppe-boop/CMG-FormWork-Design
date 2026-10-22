import React,{useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {LayoutDashboard,FolderOpen,Layers,Upload,Settings2,FileText,CheckCircle2,AlertTriangle,Plus,Save,Download,ChevronRight,Building2,RotateCcw,LogIn,Users,Bell,BookOpen,Trash2,Link2,ShieldCheck,Box} from 'lucide-react';
import {calculate,usesTies,columnDefaults,defaults,extensionDefaults,polygon,positions,segmentInside,validateInput,type Input,type Result} from './domain';
import {parseProjectBackup} from './domain/projectBackup';
import {PROJECT_EXAMPLE_REFERENCES, projectExample} from './domain/mockProject';
import {upgradeProjectExampleCase,projectExampleWorkflowDraft,PROJECT_EXAMPLE_REVISION} from './domain/projectExampleWorkflow';
import {layoutCompare} from './domain/draftCompare';
import {WalerDetails} from './components/WalerDetails';
import {AssemblyDetail} from './components/AssemblyDetail';
import {ColumnCriteria,ColumnYokeDetails} from './components/ColumnYokeDetails';
import {MENU_CATEGORIES,configured,usingEmulators,loadProjects,saveProject,deleteProject,saveWorkflowDraft,saveReviewRecord,loadRegistry,saveRegistryItem,deleteRegistryItem,trustedCalculation,canProject,hasRole,type MenuCategory} from './firebase';
import {AdminPanel} from './components/AdminPanel';
import {SourceUpload,type ResumeDrawing} from './components/SourceUpload';
import {ModelWorkspace,type ModelRevision} from './components/ModelWorkspace';
import {DrawingSet} from './components/DrawingSet';
import {AdviceList,LayoutOptimizer} from './components/LayoutOptimizer';
import {CalcReport} from './components/CalcReport';
import {ChecksTable} from './components/FormParts';
import {LegacyRestraints} from './components/LegacyRestraints';
import {legacyCheckGroups, numberChecks} from './domain/reportOutline';
import {BeamShortReport,LegacyShortReport,ReportLangSwitch,ReportVariantSwitch,SlabShortReport,WallShortReport,type ReportVariant} from './components/ShortReport';
import type {ReportLang} from './i18n/reportLang';
import {parseSectionStock} from './domain/sectionStock';
import {SectionPicker} from './components/SectionPicker';
import {DesignBook} from './components/DesignBook';
import {PlywoodCriteria,PressureGuide,SteelGuide} from './components/CriteriaGuide';
import {defaultTitleBlock,parseTitleBlock,today,type TitleBlock} from './domain/titleBlock';
import {applyChanges,changesToInput,type ModelChange} from './domain/scene';
import type {PreparedSource} from './sourceFiles';
import {AuthProvider, ProfileMenu, navigate, useAuth, usePathname} from './auth';
import {AppRouter} from './AppRouter';
import {workflowV07Enabled} from './workflowV07Flag';
import type {ElementType} from './domain/workflowV07/common';
import {parseStoredWorkflowDraft,type StoredWorkflowDraft} from './domain/workflowV07/storage';
import {emptyRegistry,seedRegistry,validateRegistry,type Registry,type RegistryEntry,type RegistryMethod} from './domain/workflowV07/registry';
import {DEFAULT_REVIEWER,RegistryProvider} from './components/RegistryContext';
import {RegistryPanel} from './components/RegistryPanel';
import {validateReviewRecord,type ReviewActor,type ReviewRecord,type ReviewRole} from './domain/workflowV07/review';
import {ReviewQueue} from './components/ReviewPanel';
import {WORKFLOW_VERSION} from './domain/workflowV07/common';
import {ClipboardCheck} from 'lucide-react';
import type {AiCase} from './aiElements';
import {beamAdvice,beamDefaults,beamFromCase,calculateBeam,type BeamInput} from './domain/beam';
import {BeamPanel,type BeamTab} from './components/BeamWorkspace';
import {BeamDrawingSet,BeamReport} from './components/BeamDocs';
import {calculateSlab,slabAdvice,slabDefaults,slabFromCase,type SlabInput} from './domain/slab';
import {SlabPanel,type SlabTab} from './components/SlabWorkspace';
import {SlabDrawingSet,SlabReport} from './components/SlabDocs';
import {calculateWall,wallAdvice,wallDefaults,wallFromCase,type WallInput} from './domain/wall';
import {adviseLayout} from './domain/optimize';
import {LayoutPreview} from './components/LayoutPreview';
import {Model3DLeaveDialog} from './components/Model3DLeaveDialog';
import {APP_VERSION} from './version';
import {WallPanel,type WallTab} from './components/WallWorkspace';
import {WallDrawingSet,WallReport} from './components/WallDocs';
import {Library,Package,ShoppingCart} from 'lucide-react';
import {ProjectOrderPanel} from './components/ProjectOrder';
import {parseOrder,type CaseOrder} from './domain/projectBom';
import {ProjectKitPanel,KitBadge,KitSummaryCard} from './components/ProjectKit';
import {applyKitToCase,caseKitStatus,kitFieldKeys,reviseKit,kitFromCase,kitNote as kitNoteText,parseKit,caseKitInput,type ProjectKit} from './domain/projectKit';
import {auditCaseIdentities,suggestedElementTypeFromName} from './domain/caseIntegrity';
import {ReconciliationPanel} from './components/ReconciliationPanel';
import './style.css';

const WorkflowV07Panel=React.lazy(()=>import('./components/WorkflowV07Panel'));
const Model3DWorkspace=React.lazy(()=>import('./components/Model3DWorkspace').then(module=>({default:module.Model3DWorkspace})));
const WorkflowV07Summary=React.lazy(()=>import('./components/WorkflowV07Summary').then(module=>({default:module.WorkflowV07Summary})));
const WorkflowV07Output=React.lazy(()=>import('./components/WorkflowV07Output').then(module => ({default: module.WorkflowV07Output})));
const ProjectExampleDrawingBook=React.lazy(()=>import('./components/ProjectExampleDrawingBook').then(module=>({default:module.ProjectExampleDrawingBook})));
type Case={id:string;name:string;input:Input;workflowElementType?:ElementType;titleBlock?:TitleBlock;workflowV07?:StoredWorkflowDraft;review?:ReviewRecord;beam?:BeamInput;slab?:SlabInput;wall?:WallInput;
  /** Reason this case is allowed to differ from the project kit (empty/absent = must follow the kit). */
  kitException?:string;
  /** Identical elements this case stands for and formwork reuse, for the project order list (absent = 1 / 1). */
  order?:CaseOrder};
type Project={id:string;name:string;code:string;cases:Case[];sectionStock?:string[];kit?:ProjectKit};
const ELEMENT_TYPES: {id: ElementType; label: string}[] = [
 {id:'FOOTING',label:'ฐานราก'}, {id:'COLUMN',label:'เสา'}, {id:'WALL',label:'ผนัง'}, {id:'BEAM',label:'คาน'}, {id:'SLAB',label:'พื้น'},
];
const KEY='cmg-formwork-demo-v1';
let localExampleCaseNo=0;
const PROJECT_EXAMPLE_LOCAL_ID='project-example-local';
const caseType=(z:{workflowElementType?:ElementType;input:Input})=>z.workflowElementType??(z.input.kind as ElementType);
const PROJECT_EXAMPLE_LOCAL:Project={...projectExample('PROJECT-EXAMPLE-LOCAL',()=>`PROJECT-EXAMPLE-LOCAL-${++localExampleCaseNo}`),id:PROJECT_EXAMPLE_LOCAL_ID};
const initial:Project[]=[{id:'demo-industrial',name:'โครงการโรงงานอุตสาหกรรม',code:'CMG-2026-001',cases:[
 {id:'F01',name:'F01 · ฐานราก 3 × 4 เมตร',input:{...defaults}},
 {id:'F02',name:'F02 · ฐานรากรูปตัว L',input:{...defaults,shape:'L',width:4000,length:3000,armX:2000,armY:2000}},
 {id:'C01',name:'C01 · เสา 1 × 1 เมตร',input:{...defaults,kind:'COLUMN',width:1000,length:1000,height:8000,armX:500,armY:500}}
]}, PROJECT_EXAMPLE_LOCAL];
function hydrate(raw:unknown[]):Project[]{
 return raw.flatMap(value=>{
  if(!value||typeof value!=='object')return [];
  const p=value as Partial<Project>;
  if(typeof p.id!=='string'||typeof p.name!=='string'||typeof p.code!=='string'||!Array.isArray(p.cases))return [];
  const cases=p.cases.flatMap(value=>{
   if(!value||typeof value!=='object')return [];
   const c=value as Partial<Case>;
   if(typeof c.id!=='string'||typeof c.name!=='string')return [];
   try{
    const rawInput = c.input as Partial<Input>;
    const workflowElementType = ['FOOTING','COLUMN','WALL','BEAM','SLAB'].includes(String((c as Partial<Case>).workflowElementType)) ? String((c as Partial<Case>).workflowElementType) as ElementType : undefined;
    // An unreadable v0.7 draft is dropped (reported as missing), never repaired or guessed.
    let workflowV07:StoredWorkflowDraft|undefined;try{if(c.workflowV07!=null)workflowV07=parseStoredWorkflowDraft(c.workflowV07);}catch{workflowV07=undefined;}
    let review:ReviewRecord|undefined;try{if(c.review!=null){validateReviewRecord(c.review);review=c.review;}}catch{review=undefined;}
    return [{id:c.id,name:c.name,input:{...defaults,...(rawInput&&typeof rawInput==='object'&&!('plywoodGrade' in rawInput)?{plywoodGrade:'CUSTOM' as const}:{}),...(rawInput&&typeof rawInput==='object'&&!('plywoodSpans' in rawInput)?{plywoodSpans:'SINGLE' as const,plywoodFaceGrain:'PARALLEL' as const}:{}),...rawInput,...(!c.input||typeof c.input!=='object'||!('walerType' in c.input)?{...extensionDefaults,confirmed:false}:!('columnModel' in c.input)?{...columnDefaults,confirmed:false}:{})},...(workflowElementType?{workflowElementType}:{}),...(parseTitleBlock((c as Partial<Case>).titleBlock)?{titleBlock:parseTitleBlock((c as Partial<Case>).titleBlock)!}:{}),...(workflowV07?{workflowV07}:{}),...(review?{review}:{}),...(c.beam!=null?{beam:beamFromCase(c.beam)}:{}),...(c.slab!=null?{slab:slabFromCase(c.slab)}:{}),...(c.wall!=null?{wall:wallFromCase(c.wall)}:{}),...(parseOrder((c as Partial<Case>).order)?{order:parseOrder((c as Partial<Case>).order)!}:{}),...(typeof (c as Partial<Case>).kitException==='string'&&(c as Partial<Case>).kitException!.trim()?{kitException:(c as Partial<Case>).kitException!.slice(0,300)}:{})}];
   }
   catch{return []}
  });
  const stock=parseSectionStock((p as Partial<Project>).sectionStock),kit=parseKit((p as Partial<Project>).kit);
  return cases.length?[{id:p.id,name:p.name,code:p.code,cases,...(stock?{sectionStock:stock}:{}),...(kit?{kit}:{})}]:[];
 });
}
const REGISTRY_KEY='cmg-formwork-registry-v1';
// Offline registry: a stored list wins; missing/corrupt data seeds published-source DRAFT items.
function storedRegistry():Registry{if(configured)return emptyRegistry();try{const v=JSON.parse(localStorage.getItem(REGISTRY_KEY)||'null');if(v===null)return seedRegistry();validateRegistry(v);return v;}catch{return seedRegistry();}}
function withLocalProjectExample(projects:Project[]):Project[]{
 const found=projects.find(p=>p.name==='Project Example'||p.code==='PROJECT-EXAMPLE-001');
 if(!found)return [...projects,PROJECT_EXAMPLE_LOCAL];
 // Upgrade only recognized example cases, including the old empty v1 seed.
 // An authored revision is preserved, even if it still has missing data.
 return projects.map(p=>p.name!=='Project Example'&&!p.code.startsWith('PROJECT-EXAMPLE-')?p:{...p,cases:p.cases.map(c=>upgradeProjectExampleCase(c,p.id))});
}
// An explicitly stored empty list stays empty (all projects deleted); missing or corrupt data seeds the demo.
function stored():Project[]{if(configured)return [];try{const v=JSON.parse(localStorage.getItem(KEY)||'null');if(!Array.isArray(v))return initial;const result=hydrate(v);return result.length||!v.length?withLocalProjectExample(result):initial;}catch{return initial;}}
const f=(n:number|null,d=2)=>n===null?'—':n.toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d});
function Plan({input,result,large=false}:{input:Input;result:Result|null;large?:boolean}){
 let ps;try{validateInput(input);ps=polygon(input);}catch{return <p>ตรวจมิติและระยะให้ถูกต้องก่อนแสดงภาพ</p>;}
 const max=Math.max(input.width,input.length),scale=360/max,ox=110,oy=65;
 const P=(p:{x:number;y:number})=>({x:ox+p.x*scale,y:oy+p.y*scale});
 const edges=ps.map((a,i)=>({a,b:ps[(i+1)%ps.length],i}));
 const xTies=positions(input.length,input.tieSpacing).slice(1,-1).map(y=>({a:{x:0,y},b:{x:input.shape==='L'&&y>input.armY?input.armX:input.width,y}}));
 const yTies=positions(input.width,input.tieSpacing).slice(1,-1).map(x=>({a:{x,y:0},b:{x,y:input.shape==='L'&&x>input.armX?input.armY:input.length}}));
 const ties=[...xTies,...yTies].filter(t=>segmentInside(t.a,t.b,ps));
 return <svg viewBox="0 0 600 530" className={large?'plan large':'plan'} role="img" aria-label="แปลนรูปทรงคอนกรีตและแนวองค์ประกอบเบื้องต้น">
 <defs><pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="#e4e9ef" strokeWidth=".5"/></pattern><pattern id="concrete" width="13" height="13" patternUnits="userSpaceOnUse"><circle cx="3" cy="4" r=".7" fill="#bdc8d2"/></pattern></defs>
 <rect width="600" height="530" fill="url(#grid)"/>
 <polygon points={ps.map(p=>{const v=P(p);return v.x+','+v.y}).join(' ')} fill="#eaf1f3" stroke="#b68048" strokeWidth="7"/>
 <polygon points={ps.map(p=>{const v=P(p);return v.x+','+v.y}).join(' ')} fill="url(#concrete)" stroke="#577187" strokeWidth="1"/>
 {usesTies(input)&&input.shape==='RECTANGLE'&&ties.map((t,i)=>{const a=P(t.a),b=P(t.b);return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#2c88b2" strokeWidth="1.5" strokeDasharray="6 4"/>;})}
 {edges.map(({a,b,i})=>{const l=Math.hypot(b.x-a.x,b.y-a.y),pa=P(a),pb=P(b);return <g key={i}>
 {positions(l,input.studSpacing).map((d,j)=>{const v=P({x:a.x+(b.x-a.x)*d/l,y:a.y+(b.y-a.y)*d/l});return <rect key={j} x={v.x-3} y={v.y-3} width="6" height="6" fill="#183e60"/>;})}
 <text x={(pa.x+pb.x)/2} y={(pa.y+pb.y)/2-12} textAnchor="middle" fill="#183e60" fontSize="12">F{i+1} · {f(l,0)} mm</text></g>;})}
 <path d={'M'+ox+' '+(oy+input.length*scale+35)+'h'+input.width*scale} stroke="#183e60"/>
 <text x={ox+input.width*scale/2} y={oy+input.length*scale+58} textAnchor="middle" fontSize="14" fill="#183e60">{f(input.width/1000,2)} m</text>
 <text x="32" y="36" fill="#183e60" fontSize="14" fontWeight="700">PLAN · {input.shape==='L'?'L-SHAPED':'RECTANGULAR'}</text>
 <text x="32" y="490" fill="#60758a" fontSize="11">คร่าว ● / ผิวไม้อัดสีน้ำตาล / Tie สีน้ำเงินเฉพาะฐานรากสี่เหลี่ยม</text>
 <text x="32" y="511" fill="#a87631" fontSize="11">{input.shape==='L'?'รูป L: ยังไม่จัดเส้นทาง Tie ต้องออกแบบมุมเว้าและจุดต่อ':input.kind==='COLUMN'?'เสา: ต้องออกแบบชุดรัดและจุดต่อมุมให้ครบ':'แผนผังเบื้องต้น — ต้องตรวจจุดต่อและระดับ Tie ที่ตัดกัน'}</text>
 {result&&<text x="500" y="40" textAnchor="end" fontSize="11" fill="#60758a">พื้นที่ {f(result.area)} m²</text>}
 </svg>;
}
function Section({x}:{x:Input}){
 try{validateInput(x);}catch{return <p>ตรวจข้อมูลก่อนแสดงรูปด้าน</p>;}
 const scale=300/Math.max(x.height,x.width),H=x.height*scale,W=x.width*scale,left=240-W/2,right=240+W/2,levels=positions(x.height,x.walerSpacing),base=35+H;
 return <svg viewBox="0 0 480 420" className="section"><rect x={left} y="35" width={W} height={H} fill="#eef3f5" stroke="#bd9057" strokeWidth="5"/>
 {levels.map((z,i)=><g key={i}><line x1={left-15} y1={35+z*scale} x2={right+15} y2={35+z*scale} stroke="#183e60" strokeWidth="5"/><text x={right+28} y={40+z*scale} fontSize="10" fill="#5e7389">{f(z,0)}</text></g>)}
 <path d={'M'+left+' '+(35+H*.4)+'L65 '+(base+15)+'M'+right+' '+(35+H*.4)+'L430 '+(base+15)} stroke="#da8245" strokeWidth="5"/>
 <path d={'M50 '+(base+20)+'H440M'+(left-40)+' 35V'+base} stroke="#60758a" fill="none"/>
 <text x={left-55} y={35+H/2} fontSize="13" fill="#183e60" transform={'rotate(-90 '+(left-55)+' '+(35+H/2)+')'}>{f(x.height/1000)} m</text>
 <text x="240" y={base+40} textAnchor="middle" fontSize="12" fill="#183e60">{f(x.width/1000)} m</text>
 <text x="240" y="387" textAnchor="middle" fontSize="12" fill="#183e60">ELEVATION · แนวคาน/ชุดรัดเบื้องต้น (NTS)</text>
 <text x="240" y="409" textAnchor="middle" fontSize="10" fill="#9b6c28">ค้ำยันในภาพเป็นสัญลักษณ์ ยังไม่กำหนดชนิดและขนาดจริง</text></svg>;
}
function App(){
 const {firebaseUser,userProfile}=useAuth();
 const currentPath=usePathname();
 const [projects,setProjects]=useState<Project[]>(stored),[projectId,setProjectId]=useState(projects[0]?.id||''),[caseId,setCaseId]=useState(projects[0]?.cases[0]?.id||''),[tab,setTab]=useState(currentPath==='/admin'?'users':'overview');
 const [workflowElementType,setWorkflowElementType]=useState<ElementType>((projects[0]?.cases[0]?.workflowElementType??projects[0]?.cases[0]?.input.kind??'FOOTING') as ElementType);
 // Simple mode (per viewer): with a project kit, pages ask only for geometry and spacings; the kit supplies materials.
 const [uiMode,setUiModeState]=useState<'simple'|'advanced'>(()=>{try{return localStorage.getItem('cmg-ui-mode')==='advanced'?'advanced':'simple';}catch{return 'simple';}});
 const setUiMode=(m:'simple'|'advanced')=>{setUiModeState(m);try{localStorage.setItem('cmg-ui-mode',m);}catch{/* private mode */}};
 const [message,setMessage]=useState(''),[sourceName,setSourceName]=useState<string|null>(null),[source,setSource]=useState<Pick<PreparedSource,'name'|'url'>|null>(null),[busy,setBusy]=useState(false),[authOpen,setAuthOpen]=useState(false),[pendingUsers,setPendingUsers]=useState(0);
 const [history,setHistory]=useState<Record<string,(ModelRevision&{input:Input})[]>>({}),[drawing,setDrawing]=useState<{projectId:string;value:ResumeDrawing}|null>(null);
 const [registry,setRegistry]=useState<Registry>(storedRegistry),[showV07,setShowV07]=useState(false),[reportVariant,setReportVariant]=useState<ReportVariant>('full'),[reportLang,setReportLang]=useState<ReportLang>('th');
 // 3D model draft: the case as it was when the model opened, and the navigation waiting for the save/discard answer.
 const [model3dSnap,setModel3dSnap]=useState<{projectId:string;caseId:string;json:string;value:Case}|null>(null),[model3dLeave,setModel3dLeave]=useState<null|(()=>void)>(null);
 useEffect(()=>{if(!configured)localStorage.setItem(REGISTRY_KEY,JSON.stringify(registry));},[registry]);
 useEffect(()=>{
  if(!configured||!firebaseUser||!userProfile||userProfile.status!=='approved')return;
  let cancelled=false;
  loadRegistry().then(r=>{if(!cancelled)setRegistry(r);}).catch(e=>{if(!cancelled)setMessage('โหลดคลังข้อมูลไม่สำเร็จ: '+(e as Error).message);});
  return()=>{cancelled=true;};
 },[firebaseUser?.uid,userProfile?.status]);
 const reviewerName=userProfile?[userProfile.firstName,userProfile.lastName].filter(Boolean).join(' ')+(userProfile.position?' · '+userProfile.position:''):DEFAULT_REVIEWER;
 const canReviewRegistry=!configured||hasRole(userProfile,'MasterAdmin')||hasRole(userProfile,'SuperAdmin')||hasRole(userProfile,'Admin')||hasRole(userProfile,'Engineer');
 async function saveRegistry(item:{type:'method';value:RegistryMethod}|{type:'entry';value:RegistryEntry}){
   if(configured)await saveRegistryItem(item);
   setRegistry(r=>item.type==='method'?{...r,methods:[...r.methods.filter(m=>m.id!==item.value.id),item.value]}:{...r,entries:[...r.entries.filter(e=>e.id!==item.value.id),item.value]});
   setMessage(`บันทึก ${item.type==='method'?'วิธีคำนวณ':'รายการ'} ${item.value.id} · สถานะ ${item.value.review.status}`);
 }
 async function removeRegistryItem(type:'method'|'entry',id:string){
   if(!window.confirm(`ลบ ${id} ออกจากคลัง? หลักฐานที่อ้างถึงรายการนี้จะกลายเป็นหลักฐานค้าง`))return;
   if(configured)await deleteRegistryItem(type,id);
   setRegistry(r=>type==='method'?{...r,methods:r.methods.filter(m=>m.id!==id)}:{...r,entries:r.entries.filter(e=>e.id!==id)});
 }
 async function seedRegistryItems(){const seed=seedRegistry(Date.now());for(const m of seed.methods)await saveRegistry({type:'method',value:m});for(const e of seed.entries)await saveRegistry({type:'entry',value:e});}
 async function seedPublicReferenceItems(entries: RegistryEntry[]){const existing=new Set(registry.entries.map(e=>e.id));const fresh=entries.filter(e=>!existing.has(e.id));for(const e of fresh)await saveRegistry({type:'entry',value:e});setMessage(fresh.length?`นำเข้า Ringlock/Form Tie capture ${fresh.length} รายการเป็น DRAFT · ยังไม่ใช่กำลังโครงการ`:'รายการ Ringlock/Form Tie capture นี้มีอยู่แล้วในคลัง');}
 async function seedClosureReferenceItems(entries: RegistryEntry[]){const existing=new Set(registry.entries.map(e=>e.id));const fresh=entries.filter(e=>!existing.has(e.id));for(const e of fresh)await saveRegistry({type:'entry',value:e});setMessage(fresh.length?`นำเข้า Closure Pack Form Tie/Ringlock ${fresh.length} รายการเป็น DRAFT · ยังไม่ใช่กำลังโครงการ`:'รายการ Closure Pack นี้มีอยู่แล้วในคลัง');}
 const backupPicker=useRef<HTMLInputElement>(null);
 const autoSaveLock=useRef(false),lastAutoSaved=useRef('');
 const p=projects.find(p=>p.id===projectId)||projects[0]||initial[0],c=p.cases.find(c=>c.id===caseId)||p.cases[0],x=c.input,uid=firebaseUser?.uid||'',localExample=p.id===PROJECT_EXAMPLE_LOCAL_ID,canEditCurrentProject=(!localExample||!configured)&&(!configured||canProject(userProfile,p.id,'edit'));
 const caseAudit=useMemo(()=>auditCaseIdentities(p.cases),[p.cases]),currentIntegrityIssues=caseAudit.byCase[c.id]??[];
 const nameSuggestedType=suggestedElementTypeFromName(c.name),hasNamePrefixMismatch=currentIntegrityIssues.some(issue=>issue.code==='NAME_PREFIX_TYPE_MISMATCH');
 useEffect(()=>{setWorkflowElementType(c.workflowElementType??(c.input.kind as ElementType));},[c.id,c.workflowElementType,c.input.kind]);
 useEffect(()=>{setSourceName(null);setSource(null);setShowV07(false);},[p.id,c.id,uid]);
 const analysis=useMemo(()=>{try{return {r:calculate(x),error:null};}catch(e){return {r:null,error:(e as Error).message};}},[x]);
 // Beam cases keep their own input; a case without one is seeded (unconfirmed) from its footprint.
 const beamInput=useMemo(()=>c.beam??beamFromCase(null,{width:c.input.width,length:c.input.length,height:c.input.height}),[c.beam,c.input]);
 const beamAnalysis=useMemo(()=>{try{return {r:calculateBeam(beamInput),error:null};}catch(e){return {r:null,error:(e as Error).message};}},[beamInput]);
 const slabInput=useMemo(()=>c.slab??slabFromCase(null,{width:c.input.width,length:c.input.length,height:c.input.height}),[c.slab,c.input]);
 const slabAnalysis=useMemo(()=>{try{return {r:calculateSlab(slabInput),error:null};}catch(e){return {r:null,error:(e as Error).message};}},[slabInput]);
 const wallInput=useMemo(()=>c.wall??wallFromCase(null,{width:c.input.width,length:c.input.length,height:c.input.height}),[c.wall,c.input]);
 const wallAnalysis=useMemo(()=>{try{return {r:calculateWall(wallInput),error:null};}catch(e){return {r:null,error:(e as Error).message};}},[wallInput]);
 // Layout summary on the geometry page: same engines as the layout page, recalculated only while that page is open.
 const layoutPreview=useMemo(()=>{
   if(tab!=='geometry')return null;
   const t=workflowElementType,rows=(a:{label:string;current:number;max:number|null}[])=>a.map(({label,current,max})=>({label,current,max}));
   try{
     if(t==='BEAM')return {confirmed:beamInput.confirmed,status:beamAnalysis.r?.status??null,checks:beamAnalysis.r?.checks??[],error:beamAnalysis.error,rows:beamAnalysis.r?rows(beamAdvice(beamInput)):[],notes:[]};
     if(t==='SLAB')return {confirmed:slabInput.confirmed,status:slabAnalysis.r?.status??null,checks:slabAnalysis.r?.checks??[],error:slabAnalysis.error,rows:slabAnalysis.r?rows(slabAdvice(slabInput)):[],notes:[]};
     if(t==='WALL')return {confirmed:wallInput.confirmed,status:wallAnalysis.r?.status??null,checks:wallAnalysis.r?.checks??[],error:wallAnalysis.error,rows:wallAnalysis.r?rows(wallAdvice(wallInput)):[],notes:[]};
     return {confirmed:x.confirmed,status:analysis.r?.status??null,checks:analysis.r?.checks??[],error:analysis.error,
       rows:[{label:'ระยะคร่าว',current:x.studSpacing},{label:'ช่วงพาดคร่าว (ระยะคานคู่)',current:x.walerSpacing},...(usesTies(x)?[{label:'ระยะ Tie',current:x.tieSpacing}]:[])],
       notes:analysis.r?adviseLayout(x).slice(0,4).map(a=>a.text):[]};
   }catch(e){return {confirmed:false,status:null,checks:[],error:(e as Error).message,rows:[],notes:[]};}
 },[tab,workflowElementType,x,analysis,beamInput,beamAnalysis,slabInput,slabAnalysis,wallInput,wallAnalysis]);
 function setWall(v:WallInput){if(canEditCurrentProject)setProjects(ps=>ps.map(q=>q.id!==p.id?q:{...q,cases:q.cases.map(z=>z.id!==c.id?z:{...z,wall:v})}));}
 function setSlab(v:SlabInput){if(canEditCurrentProject)setProjects(ps=>ps.map(q=>q.id!==p.id?q:{...q,cases:q.cases.map(z=>z.id!==c.id?z:{...z,slab:v})}));}
 function setBeam(v:BeamInput){if(canEditCurrentProject)setProjects(ps=>ps.map(q=>q.id!==p.id?q:{...q,cases:q.cases.map(z=>z.id!==c.id?z:{...z,beam:v})}));}
 /** Project kit: save/remove, apply to one case or every case without an exception, record an exception reason. */
 function setKit(next:ProjectKit|undefined){if(!canEditCurrentProject)return;const kit=next&&reviseKit(p.kit,next,today());setProjects(ps=>ps.map(q=>{if(q.id!==p.id)return q;const {kit:_old,...rest}=q;void _old;return kit?{...rest,kit}:rest;}));setMessage(kit?'บันทึกชุดมาตรฐาน '+kit.revision+' แล้ว'+(p.kit&&kit.revision!==p.kit.revision?' (Rev เพิ่มจาก '+p.kit.revision+') · กด “ใช้ชุดกับทุก Design Case” เพื่อแทนค่า':''):'ลบชุดมาตรฐานแล้ว · ค่าใน Design Case ไม่เปลี่ยน');}
 function applyKitToCurrent(){if(!canEditCurrentProject||!p.kit)return;const {value,error}=applyKitToCase(c,p.kit);if(error){setMessage('ใช้ชุดมาตรฐานไม่ได้: '+error);return;}setProjects(ps=>ps.map(q=>q.id!==p.id?q:{...q,cases:q.cases.map(z=>z.id!==c.id?z:value)}));setMessage('ใช้ค่าชุดมาตรฐาน '+p.kit.revision+' กับ '+c.name+' แล้ว');}
 function applyKitToAll(){if(!canEditCurrentProject||!p.kit)return;const kit=p.kit,failed:string[]=[];let changed=0;
   const cases=p.cases.map(z=>{if(z.kitException?.trim()||caseKitStatus(z,kit).state==='ON')return z;const {value,error}=applyKitToCase(z,kit);if(error){failed.push(z.name+': '+error);return z;}changed++;return value;});
   setProjects(ps=>ps.map(q=>q.id!==p.id?q:{...q,cases}));setMessage('ใช้ชุดมาตรฐาน '+kit.revision+' กับ '+changed+' Design Case'+(failed.length?' · ใช้ไม่ได้: '+failed.join('; '):''));}
 function setCaseOrder(id:string,order:CaseOrder){if(canEditCurrentProject)setProjects(ps=>ps.map(q=>q.id!==p.id?q:{...q,cases:q.cases.map(z=>z.id!==id?z:{...z,order})}));}
 function setKitException(reason:string){if(!canEditCurrentProject)return;setProjects(ps=>ps.map(q=>q.id!==p.id?q:{...q,cases:q.cases.map(z=>{if(z.id!==c.id)return z;const {kitException:_r,...rest}=z;void _r;return reason?{...rest,kitException:reason}:rest;})}));}
 // While the 3D model is open its edits are a draft: nothing is persisted until the user saves or discards on leaving.
 useEffect(()=>{if(!configured&&tab!=='model3d')localStorage.setItem(KEY,JSON.stringify(projects));},[projects,tab]);
 useEffect(()=>{
  if(!configured||!firebaseUser||!userProfile||userProfile.status!=='approved'||!projects.length||!canEditCurrentProject||tab==='model3d')return;
  // v0.7 drafts are saved by their own path; they must not trigger a project rewrite.
  const snapshot=JSON.stringify({...p,cases:p.cases.map(({workflowV07:_d,...z})=>z)});
  if(!lastAutoSaved.current){lastAutoSaved.current=snapshot;return;}
  if(snapshot===lastAutoSaved.current)return;
  const timer=window.setTimeout(async()=>{
   if(autoSaveLock.current)return;
   autoSaveLock.current=true;
   try{const category=MENU_CATEGORIES.includes(tab as MenuCategory)?tab as MenuCategory:'overview';await saveProject(p,category,c.id);lastAutoSaved.current=snapshot;}
   catch{ /* the explicit Save action remains available when a network write is interrupted */ }
   finally{autoSaveLock.current=false;}
  },700);
  return()=>window.clearTimeout(timer);
 },[projects,p,tab,c.id,firebaseUser?.uid,userProfile?.status,canEditCurrentProject]);
 useEffect(()=>{
  if(!configured||!firebaseUser||!userProfile||userProfile.status!=='approved')return;
  let cancelled=false;
  setBusy(true);
  (async()=>{
   try{
    const loaded=hydrate(await loadProjects(userProfile));
    if(cancelled)return;
    const visible=withLocalProjectExample(loaded);
    setProjects(visible);
    if(loaded.length){setProjectId(loaded[0].id);setCaseId(loaded[0].cases[0].id);setMessage('เชื่อมต่อ Firebase แล้ว · แสดงเฉพาะโครงการที่คุณมีสิทธิ์เข้าถึง พร้อม Project Example แบบ local read-only');}
    else {setProjectId(PROJECT_EXAMPLE_LOCAL_ID);setCaseId(PROJECT_EXAMPLE_LOCAL.cases[0].id);setMessage(hasRole(userProfile,'MasterAdmin')?'ยังไม่มีโครงการใน Firebase · เปิด Project Example แบบ local แล้ว กด “สร้าง Project Example” เพื่อบันทึกเข้า Firebase':'ยังไม่มีโครงการที่ได้รับมอบหมายจาก MasterAdmin · เปิด Project Example แบบ local read-only ให้แล้ว');}
    // Persist upgraded template drafts through the ordinary per-case API, under
    // the signed-in user's project permission. Never rewrite the project document.
    let upgraded=0;
    for(const project of loaded){
      if(cancelled)return;
      if(!canProject(userProfile,project.id,'edit'))continue;
      const next=visible.find(p=>p.id===project.id)!;
      if(next.cases.some(c=>{const old=project.cases.find(o=>o.id===c.id)!;return c.input!==old.input||c.beam!==old.beam||c.slab!==old.slab||c.wall!==old.wall||c.workflowElementType!==old.workflowElementType;}))await saveProject(next);
      for(const old of project.cases){
        const updated=next.cases.find(c=>c.id===old.id)!;
        if(updated.workflowV07&&updated.workflowV07!==old.workflowV07){await saveWorkflowDraft(project.id,old.id,updated.workflowV07);upgraded++;}
      }
    }
    if(upgraded&&!cancelled)setMessage(`เติมและบันทึกร่าง Project Example ${upgraded} ตัวอย่างแล้ว · เก็บร่างที่คุณแก้เองไว้`);
   }catch(e){if(!cancelled)setMessage((e as Error).message);}
   finally{if(!cancelled)setBusy(false);}
  })();
  return()=>{cancelled=true;};
 },[firebaseUser?.uid,userProfile]);
 function edit(k:keyof Input,v:Input[keyof Input]){
   const geometry=['shape','width','length','height','armX','armY','kind'].includes(k),walerManual=['walerType','walerB','walerH','walerT'].includes(k),studManual=['rhsB','rhsH','rhsT'].includes(k);
    setProjects(ps=>ps.map(q=>q.id!==p.id?q:{...q,cases:q.cases.map(z=>z.id!==c.id?z:{...z,input:{...z.input,[k]:v,...(geometry?{confirmed:false}: {}),...(walerManual?{walerSectionId:''}:{}),...(studManual?{studSectionId:''}:{})},...(k==='kind'?{workflowElementType:v as ElementType}:{})})}));
    if(k==='kind')setWorkflowElementType(v as ElementType);
 }
 /** Footing/column edits from the 3D model: same rules as the section picker (catalogue ids fill B/H/t, manual sizes leave the
  * catalogue, geometry clears the confirmation). An edit that fails validation is rejected so the case never becomes unbuildable. */
 function editMany(changes:Partial<Input>){
   if(!canEditCurrentProject)return;
   let next:Input;
   try{next=applyChanges(x,changes);}catch(e){setMessage('แก้ไขไม่ได้: '+(e as Error).message);return;}
   setProjects(ps=>ps.map(q=>q.id!==p.id?q:{...q,cases:q.cases.map(z=>z.id!==c.id?z:{...z,input:next})}));
 }
 function applySection(changes:Partial<Input>){
   if(!canEditCurrentProject)return;
   try{setInput(applyChanges(x,changes));setMessage('เปลี่ยนหน้าตัดแล้ว · คำนวณรายการใหม่');}catch(e){setMessage((e as Error).message);}
 }
 function setInput(v:Input){setProjects(ps=>ps.map(q=>q.id!==p.id?q:{...q,cases:q.cases.map(z=>z.id!==c.id?z:{...z,input:v})}));}
 const reportDrawing=useCallback((value:ResumeDrawing|null)=>setDrawing(value?{projectId:p.id,value}:null),[p.id]);
 const reportBinding=c.workflowV07?undefined:{designRevision:`CASE-${c.id}`,contentHash:'',reviewState:'DRAFT'};
 function applyModelChanges(changes:ModelChange[],note:string):string|null{
   if(!canEditCurrentProject)return 'โครงการนี้เป็นสิทธิ์ดูอย่างเดียว';
   try{
     const next=applyChanges(x,changesToInput(changes));
     setHistory(h=>({...h,[c.id]:[...(h[c.id]??[]),{input:x,note,at:Date.now()}].slice(-50)}));
     setInput(next);setMessage('ปรับโมเดลตามที่คุยกับ AI แล้ว · '+note+(next.confirmed?'':' · ต้องยืนยันมิติใหม่'));return null;
   }catch(e){return (e as Error).message;}
 }
 function applyOptimized(next:Input,note:string){setHistory(h=>({...h,[c.id]:[...(h[c.id]??[]),{input:x,note,at:Date.now()}].slice(-50)}));setInput(next);setMessage(note+" · คำนวณซ้ำแล้ว ตรวจรายการคำนวณต่อ");}
 const titleBlock=c.titleBlock??defaultTitleBlock(userProfile?.firstName||"");
 function setTitleBlock(tb:TitleBlock){setProjects(ps=>ps.map(q=>q.id!==p.id?q:{...q,cases:q.cases.map(z=>z.id!==c.id?z:{...z,titleBlock:tb})}));}
 // v0.7 drafts: the case keeps the authored draft; Firebase stores it per case outside the project document.
 const persistWorkflowDraft=useCallback(async(projectIdForDraft:string,caseIdForDraft:string,draft:StoredWorkflowDraft)=>{
   if(!canEditCurrentProject)throw Error('โครงการนี้เป็นสิทธิ์ดูอย่างเดียว ไม่บันทึกร่าง v0.7');
   setProjects(ps=>ps.map(q=>q.id!==projectIdForDraft?q:{...q,cases:q.cases.map(z=>z.id!==caseIdForDraft?z:{...z,workflowV07:draft})}));
   if(configured)await saveWorkflowDraft(projectIdForDraft,caseIdForDraft,draft);
 },[canEditCurrentProject]);
 // Project Example drafts generated from the case inputs follow every input change (pages, 3D model) once the 3D draft is closed.
 // Drafts authored in the detailed v0.7 editor have another revision id and are never regenerated.
 const exampleSynced=useRef<Record<string,string>>({});
 const generatedExampleDraft=!!c?.workflowV07&&c.workflowV07.model.revisionId===PROJECT_EXAMPLE_REVISION&&!!c.workflowV07.model.sourceRef?.startsWith('PROJECT-EXAMPLE')&&/^Project Example · [FCWBS]0[12] · /.test(c.name);
 useEffect(()=>{
   if(!c||!generatedExampleDraft||tab==='model3d')return;
   const signature=JSON.stringify([caseType(c),c.input,c.beam,c.slab,c.wall]);
   if(exampleSynced.current[c.id]===signature)return;
   const timer=window.setTimeout(()=>{
     let draft:StoredWorkflowDraft;
     try{draft=projectExampleWorkflowDraft(c.input,caseType(c),c.id,{...c,projectId:p.id});}catch{return;}
     exampleSynced.current[c.id]=signature;
     if(JSON.stringify(draft.model)===JSON.stringify(c.workflowV07!.model))return;
     if(canEditCurrentProject)void persistWorkflowDraft(p.id,c.id,draft).catch(e=>setMessage((e as Error).message));
     else setProjects(ps=>ps.map(q=>q.id!==p.id?q:{...q,cases:q.cases.map(z=>z.id!==c.id?z:{...z,workflowV07:draft})}));
   },500);
   return()=>window.clearTimeout(timer);
 },[c,p.id,generatedExampleDraft,tab,canEditCurrentProject,persistWorkflowDraft]);
 // Review actor: signed-in identity and roles; offline drafting has one editor identity with full roles,
 // so the independence rule (reviewer ≠ submitter) still blocks a single person from completing the chain.
 const reviewActor:ReviewActor=useMemo(()=>({uid:uid||'offline-editor',name:reviewerName,roles:(userProfile?(Array.isArray(userProfile.role)?userProfile.role:[userProfile.role]) as ReviewRole[]:configured?[]:['Engineer','Admin','MasterAdmin']),projectId:p.id}),[uid,reviewerName,userProfile,p.id]);
 const persistReview=useCallback(async(next:ReviewRecord)=>{
   if(configured)await saveReviewRecord(next);
   setProjects(ps=>ps.map(q=>q.id!==next.projectId?q:{...q,cases:q.cases.map(z=>z.id!==next.caseId?z:{...z,review:next})}));
   setMessage(`สถานะเอกสาร ${next.caseId}: ${next.state}`);
 },[]);
 function undoModel(){const list=history[c.id];if(!list?.length)return;setInput(list[list.length-1].input);setHistory(h=>({...h,[c.id]:list.slice(0,-1)}));setMessage('ย้อนการแก้ล่าสุดแล้ว');}
 async function createCases(items:AiCase[]){
   if(!canEditCurrentProject||!items.length)return;
   const added:Case[]=items.map(({notes:_n,...i})=>({id:crypto.randomUUID(),...i})).map(z=>p.kit?applyKitToCase(z,p.kit).value:z),next:Project={...p,cases:[...p.cases,...added]};
   setProjects(ps=>ps.map(q=>q.id!==p.id?q:next));setCaseId(added[0].id);
   const done='สร้างโมเดลจากแบบ '+added.length+' รายการ · กำลังแสดง '+added[0].name;
   if(!configured){setMessage(done+' · โหมดออฟไลน์');return;}
   setBusy(true);
   try{await saveProject(next,'upload',added[0].id);setMessage(done+' · บันทึกไป Firebase แล้ว');}
   catch(e){setMessage(done+' แต่บันทึก Firebase ไม่สำเร็จ: '+(e as Error).message);}
   finally{setBusy(false);}
 }
 async function addProject(){
   const name=window.prompt('ชื่อโครงการใหม่');
   if(!name?.trim())return;
   const id=crypto.randomUUID(),z:Project={id,name:name.trim(),code:'CMG-'+String(projects.length+1).padStart(3,'0'),cases:[{id:crypto.randomUUID(),name:'F01 · ฐานราก',input:{...defaults}}]};
   setProjects(v=>[...v,z]);setProjectId(id);setCaseId(z.cases[0].id);
   if(!configured){setMessage('สร้างโครงการแล้ว · โหมดออฟไลน์');return;}
   setBusy(true);
   try{await saveProject(z,'overview',z.cases[0].id);setMessage('สร้างโครงการและบันทึกไป Firebase แล้ว · หมวด overview');}
   catch(e){setMessage('สร้างโครงการแล้ว แต่บันทึก Firebase ไม่สำเร็จ: '+(e as Error).message);}
   finally{setBusy(false);}
 }
 // Offline drafts have no roles; in Firebase only MasterAdmin may create or delete projects (server-enforced).
 const canManageProjects=!configured||hasRole(userProfile,'MasterAdmin');
 async function addMockProject(){
   if(!canManageProjects)return;
   const z:Project=projectExample('PROJECT-EXAMPLE-'+String(projects.filter(q=>q.id!==PROJECT_EXAMPLE_LOCAL_ID).length+1).padStart(3,'0'));
   setProjects(v=>[...v,z]);setProjectId(z.id);setCaseId(z.cases[0].id);setWorkflowElementType(z.cases[0].workflowElementType??'FOOTING');setTab('overview');
   const done='สร้าง Project Example แล้ว · ฐานราก เสา ผนัง คาน พื้น อย่างละ 2 แบบ พร้อมผังและแหล่งอ้างอิง · รายการหลักฐานที่ยังขาดแสดงในร่างแต่ละ Case';
   if(!configured){setMessage(done+' · โหมดออฟไลน์');return;}
   setBusy(true);
   try{await saveProject(z,'overview',z.cases[0].id);for(const exampleCase of z.cases)if(exampleCase.workflowV07)await saveWorkflowDraft(z.id,exampleCase.id,exampleCase.workflowV07);setMessage(done+' · บันทึกไป Firebase แล้ว รวม Draft v0.7 ของทั้ง 10 Case');}
   catch(e){setMessage(done+' แต่บันทึก Firebase ไม่สำเร็จ: '+(e as Error).message);}
   finally{setBusy(false);}
 }
 async function removeProject(){
   if(!canManageProjects||!projects.some(q=>q.id===p.id))return;
   if(localExample){setProjects(ps=>ps.filter(q=>q.id!==PROJECT_EXAMPLE_LOCAL_ID));setProjectId('');setCaseId('');setMessage('ซ่อน Project Example แบบ local แล้ว · ไม่ได้ลบข้อมูล Firebase');return;}
   if(!window.confirm(`ลบโครงการ "${p.name}" (${p.code}) พร้อม Design Case ทั้งหมด ${p.cases.length} รายการ${configured?' รวมข้อมูลและไฟล์ใน Firebase':''}?\nการลบย้อนกลับไม่ได้ ควรสำรองโครงการก่อน`))return;
   if(configured){
     setBusy(true);
     try{await deleteProject(p.id);}
     catch(e){setMessage('ลบโครงการไม่สำเร็จ: '+(e as Error).message);return;}
     finally{setBusy(false);}
   }
   const rest=projects.filter(q=>q.id!==p.id);
   lastAutoSaved.current='';
   setProjects(rest);setProjectId(rest[0]?.id||'');setCaseId(rest[0]?.cases[0]?.id||'');setSourceName(null);
   setHistory(h=>Object.fromEntries(Object.entries(h).filter(([id])=>!p.cases.some(z=>z.id===id))));
   if(drawing?.projectId===p.id)setDrawing(null);
   setMessage(`ลบโครงการ ${p.name} แล้ว`+(rest.length?'':' · ไม่มีโครงการเหลือ กดเพิ่มโครงการหรือสร้างโครงการตัวอย่าง'));
 }
 function exportProject(){
   const blob=new Blob([JSON.stringify({schemaVersion:3,app:'CMG Formwork cloud trial',project:p},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
   a.href=url;a.download=(p.code||'CMG')+'-project-backup.json';a.click();URL.revokeObjectURL(url);setMessage('ส่งออกโครงการแล้ว ไฟล์นี้ไม่รวม PDF/ภาพต้นฉบับ');
 }
 async function importProject(file:File){
   try{
     if(file.size>10*1024*1024)throw Error('ไฟล์โครงการเกิน 10 MB');
     const project:Project=parseProjectBackup(await file.text());
     setProjects(v=>[...v,project]);setProjectId(project.id);setCaseId(project.cases[0].id);setSourceName(null);setTab('geometry');
     if(configured){await saveProject(project,'geometry',project.cases[0].id);for(const c of project.cases)if(c.workflowV07)await saveWorkflowDraft(project.id,c.id,c.workflowV07);setMessage('นำเข้าโครงการและร่าง v0.7 บันทึกไป Firebase แล้ว · หมวด geometry');}
     else setMessage('นำเข้าโครงการแล้ว กรุณาตรวจยืนยันมิติใหม่ก่อนคำนวณ');
   }catch(e){setMessage((e as Error).message);}
 }
 async function addCase(kind: ElementType){
    const suggested = ELEMENT_TYPES.find(t=>t.id===kind)?.label ?? kind;
    const prefix = kind==='FOOTING'?'F':kind==='COLUMN'?'C':kind==='WALL'?'W':kind==='BEAM'?'B':'S';
    const name=window.prompt('ชื่อแบบ / หมายเลข',`${prefix}02 · ${suggested}`);
   if(!name)return;
    const id=crypto.randomUUID(),legacyKind: Input['kind'] = kind==='COLUMN'?'COLUMN':'FOOTING';
    const beam=kind==='BEAM'?{beam:{...beamDefaults}}:kind==='SLAB'?{slab:{...slabDefaults}}:kind==='WALL'?{wall:{...wallDefaults}}:{};
    const v:Input=legacyKind==='COLUMN'?{...defaults,kind:legacyKind,width:1000,length:1000,height:8000,armX:500,armY:500}:{...defaults,kind:legacyKind};
    const fresh:Case={id,name,input:v,workflowElementType:kind,...beam},next:Project={...p,cases:[...p.cases,p.kit?applyKitToCase(fresh,p.kit).value:fresh]};
    setProjects(ps=>ps.map(q=>q.id!==p.id?q:next));setCaseId(id);setWorkflowElementType(kind);setTab('overview');
   if(!configured){setMessage('เพิ่มแบบแล้ว · โหมดออฟไลน์');return;}
   setBusy(true);
    try{await saveProject(next,'overview',id);setMessage('เพิ่มแบบและบันทึกไป Firebase แล้ว · หมวด overview');}
   catch(e){setMessage('เพิ่มแบบแล้ว แต่บันทึก Firebase ไม่สำเร็จ: '+(e as Error).message);}
   finally{setBusy(false);}
 }
 function renameCase(){
   if(!canEditCurrentProject)return;
   const nextName=window.prompt('ชื่อแบบ / หมายเลข',c.name)?.trim();
   if(!nextName||nextName===c.name)return;
   if(p.cases.some(z=>z.id!==c.id&&z.name.trim().toLocaleLowerCase()===nextName.toLocaleLowerCase())){
     setMessage('ชื่อนี้มีอยู่แล้วในโครงการ · กรุณาใช้ชื่อหรือหมายเลขที่ไม่ซ้ำ');
     return;
   }
   setProjects(ps=>ps.map(q=>q.id!==p.id?q:{...q,cases:q.cases.map(z=>z.id===c.id?{...z,name:nextName}:z)}));
   setMessage(`เปลี่ยนชื่อ Design Case เป็น ${nextName} แล้ว · กดบันทึกเพื่อยืนยัน`);
 }
  // Element buttons navigate between cases; they never retype the open case (that silently replaced
  // e.g. a footing's pages with beam defaults). Retyping stays an explicit integrity action.
  function selectWorkflowElement(kind: ElementType){
    const label=ELEMENT_TYPES.find(t=>t.id===kind)?.label??kind;
    if(caseType(c)===kind){setTab(tab==='users'?'overview':tab);return;}
    const target=p.cases.find(z=>caseType(z)===kind);
    if(target){setCaseId(target.id);setWorkflowElementType(kind);setSourceName(null);setMessage(`เปิด Design Case ${target.name} (${label})`);return;}
    if(canEditCurrentProject&&window.confirm(`โครงการนี้ยังไม่มี Design Case ประเภท${label} · สร้างแบบใหม่หรือไม่?`))void addCase(kind);
    else setMessage(`ยังไม่มี Design Case ประเภท${label} · กด เพิ่มแบบ เพื่อสร้าง`);
  }
 function openElementType(kind: ElementType){
   const target=p.cases.find(z=>caseType(z)===kind);
   if(!target){setMessage(`ยังไม่มี Design Case ประเภท ${ELEMENT_TYPES.find(t=>t.id===kind)?.label??kind} · กด เพิ่มแบบ เพื่อสร้างร่าง`);return;}
   setCaseId(target.id);setWorkflowElementType(kind);setTab('overview');
 }
 function resolveCaseIdentity(mode:'case'|'draft'){
   const storedType=c.workflowV07?.model.elementType;
   if(!storedType||!['FOOTING','COLUMN','WALL','BEAM','SLAB'].includes(storedType))return;
   if(!window.confirm(mode==='draft'?'ใช้ประเภทของร่าง v0.7 กับ Design Case นี้หรือไม่? ควรสำรองโครงการก่อน':'ใช้ประเภทของ Design Case และลบร่าง v0.7 ที่เป็นคนละประเภทหรือไม่? Review ที่ผูกกับร่างนี้จะถูกล้าง'))return;
   const nextType=mode==='draft'?storedType:(c.workflowElementType??(c.input.kind as ElementType));
   const nextCase=mode==='draft'?{...c,workflowElementType:nextType,review:undefined}:{...c,workflowV07:undefined,review:undefined};
   setProjects(ps=>ps.map(q=>q.id!==p.id?q:{...q,cases:q.cases.map(z=>z.id===c.id?nextCase:z)}));
   setWorkflowElementType(nextType);setMessage(mode==='draft'?'ใช้ประเภทของร่าง v0.7 แล้ว · กรุณาตรวจมิติและบันทึก':'ลบร่าง v0.7 ที่ชนิดไม่ตรงแล้ว · กรุณาสร้างร่างใหม่และบันทึก');
 }
 function resolveNamePrefixType(){
   if(!canEditCurrentProject)return;
   const suggested=suggestedElementTypeFromName(c.name);
   if(!suggested||suggested===workflowElementType)return;
   if(!window.confirm(`ใช้ประเภท ${suggested} ตามรหัสชื่อ "${c.name}" หรือไม่? ร่าง v0.7 ที่ชนิดไม่ตรงจะยังคงอยู่และต้องตรวจต่อ`))return;
   setProjects(ps=>ps.map(q=>q.id!==p.id?q:{...q,cases:q.cases.map(z=>z.id===c.id?{...z,workflowElementType:suggested,review:undefined}:z)}));
   setWorkflowElementType(suggested);
   setMessage(`ใช้ประเภท ${suggested} ตามรหัสชื่อแล้ว · ตรวจร่าง v0.7 และกดบันทึก`);
 }
 function field(k:keyof Input,label:string,unit='mm',help=''){if(kitHide?.has(k))return null;return <label className="field"><span>{label}<small>{unit}</small></span><input type="number" min="0" step="any" disabled={['tieFy','tieFu'].includes(k)&&x.tieGrade!=='CUSTOM'} value={String(x[k])} onChange={e=>edit(k,Number(e.target.value))}/>{help&&<small className="help">{help}</small>}</label>;}
 function applyAI(aiDraft:Record<string,unknown>){
   const v={...x,confirmed:false},unit=String(aiDraft.unit),factor=unit==='m'?1000:unit==='cm'?10:unit==='mm'?1:null;
   if(!factor){setMessage('AI ยังระบุหน่วยไม่ได้ กรุณาใส่มิติด้วยตนเอง');return;}
   for(const key of ['width','length','height','armX','armY'] as const)if(typeof aiDraft[key]==='number')v[key]=Number(aiDraft[key])*factor;
   if(aiDraft.shape==='L'||aiDraft.shape==='RECTANGLE')v.shape=aiDraft.shape;
   setInput(v);setTab('geometry');setMessage('ใช้มิติที่อ่านได้เป็น Draft แล้ว ช่องที่ AI ไม่ทราบยังต้องตรวจ/เติมจากต้นฉบับก่อนยืนยัน');
 }
 // Main work in design order (dimensions → criteria → layout → results → documents → review), then reference menus.
 const mainNav=[['overview','ภาพรวม',LayoutDashboard],['upload','รับแบบและ AI',Upload],['geometry','รูปทรงและมิติ',Layers],['criteria','Design Criteria',Settings2],['layout','จัดวางเบื้องต้น',Building2],['results','รายการคำนวณ',CheckCircle2],['drawings','แปลนและรูปตัด',FolderOpen],['report','รายงาน PDF',FileText],['review','Review & Issue',ClipboardCheck]] as const;
 const referenceNav=[['kit','ชุดมาตรฐานโครงการ',Package],['order','รายการสั่งของรวม',ShoppingCart],['connections','จุดต่อและค้ำยัน',Link2],['library','คลังวัสดุ/วิธีคำนวณ',Library],['designbook','Design Book',BookOpen],['audit','Audit & Settings',ShieldCheck]] as const;
 const baseNav=[...mainNav,...referenceNav];
 const nav=baseNav;
 const setPending=useCallback((count:number)=>setPendingUsers(count),[]);
  const r=analysis.r;
   const v07Enabled=workflowV07Enabled(import.meta.env.VITE_WORKFLOW_V07_ENABLED,configured,usingEmulators,import.meta.env.VITE_WORKFLOW_V07_ALLOW_PRODUCTION);
   const v07OnProduction=v07Enabled&&configured&&!usingEmulators;
   const legacyElement=workflowElementType==='FOOTING'||workflowElementType==='COLUMN';
   const slabElement=workflowElementType==='SLAB',wallElement=workflowElementType==='WALL',practical=workflowElementType==='BEAM'||slabElement||wallElement;
   const beamElement=workflowElementType==='BEAM',beamTabs=['overview','geometry','criteria','layout','results','drawings','report'];
   const exampleDrawing=p.name==='Project Example'&&!!c.workflowV07?.model.sourceRef?.startsWith('PROJECT-EXAMPLE');
   const exampleCaseName=c.name.replace(/^Project Example · /,'').replace(/ · MOCK-UP$/,'');
   // The stored v0.7 draft is shown read-only on the geometry/layout pages and its extents compared with the page values.
   const draftModel=v07Enabled&&c.workflowV07?.model&&c.workflowV07.model.elementType===workflowElementType?c.workflowV07.model:null;
   const draftExt=draftModel?{x:Math.max(...draftModel.vertices.map(v=>v.x))-Math.min(...draftModel.vertices.map(v=>v.x)),y:Math.max(...draftModel.vertices.map(v=>v.y))-Math.min(...draftModel.vertices.map(v=>v.y)),h:draftModel.heightMm}:null;
   const draftCompare=!draftExt?[]:legacyElement?[{label:'ขนาดรวม X',page:x.width,draft:draftExt.x},{label:'ขนาดรวม Y',page:x.length,draft:draftExt.y},{label:x.kind==='FOOTING'?'ความลึก':'ความสูง',page:x.height,draft:draftExt.h}]
     :beamElement?[{label:'ความยาวคาน',page:beamInput.length,draft:draftExt.x},{label:'ความกว้าง b',page:beamInput.b,draft:draftExt.y},{label:'ความลึกรวม h',page:beamInput.h,draft:draftExt.h},{label:'ความหนาพื้น',page:beamInput.slabSides?beamInput.slabT:null,draft:draftModel!.slabThicknessMm}]
     :slabElement?[{label:'ช่วงพื้น X',page:slabInput.lx,draft:draftExt.x},{label:'ช่วงพื้น Y',page:slabInput.ly,draft:draftExt.y},{label:'ความหนาพื้น',page:slabInput.t,draft:draftExt.h}]
     :[{label:'ความยาวผนัง',page:wallInput.length,draft:draftExt.x},{label:'ความหนาผนัง',page:wallInput.t,draft:draftExt.y},{label:'ความสูงเท',page:wallInput.height,draft:draftExt.h}];
   const hasV07Output=v07Enabled&&(practical||exampleDrawing)&&!!c.workflowV07?.model&&c.workflowV07.model.elementType===workflowElementType;
   const caseKit=caseKitStatus(c,p.kit),kitNote=kitNoteText(caseKit),simpleKit=uiMode==='simple'&&!!p.kit;
   const kitHide=simpleKit?new Set(kitFieldKeys(workflowElementType)):undefined;
   const kitCard=simpleKit?<KitSummaryCard kit={p.kit!} onOpenKit={()=>setTab('kit')} onAdvanced={()=>setUiMode('advanced')}/>:undefined;
  const save=async()=>{try{if(configured){if(!canEditCurrentProject){setMessage('โครงการนี้เป็นสิทธิ์ดูอย่างเดียว ไม่สามารถบันทึกหรือแก้ไขข้อมูลได้');return false;}const category=MENU_CATEGORIES.includes(tab as MenuCategory)?tab as MenuCategory:'overview';await saveProject(p,category,c.id);lastAutoSaved.current=JSON.stringify(p);setMessage('บันทึกข้อมูลไป Firebase แล้ว · หมวด '+category);}else{localStorage.setItem(KEY,JSON.stringify(projects));setMessage('บันทึกร่างในเบราว์เซอร์แล้ว · ยังไม่ใช่ฐานข้อมูล Firebase');}return true;}catch(e){setMessage((e as Error).message);return false;}};
  const caseJson=(z:Case)=>JSON.stringify({...z,workflowV07:undefined,review:undefined});
  const model3dDirty=tab==='model3d'&&!!model3dSnap&&model3dSnap.caseId===c.id&&caseJson(c)!==model3dSnap.json;
  function openModel3d(target:Case=c){setModel3dSnap({projectId:p.id,caseId:target.id,json:caseJson(target),value:structuredClone(target)});setMessage('');setTab('model3d');}
  /** Runs a navigation away from the 3D model, first asking to save or discard when the model was edited. */
  function leaveModel3d(next:()=>void){if(tab!=='model3d'){next();return;}if(model3dDirty){setModel3dLeave(()=>next);return;}setModel3dSnap(null);next();}
  async function finishModel3d(mode:'save'|'discard'){
    const next=model3dLeave,snap=model3dSnap;if(!next)return;
    if(mode==='save'){if(!(await save())){setModel3dLeave(null);return;}}
    else if(snap){setProjects(ps=>ps.map(q=>q.id!==snap.projectId?q:{...q,cases:q.cases.map(z=>z.id===snap.caseId?snap.value:z)}));setMessage('ไม่บันทึกการแก้ไขจากโมเดล 3D · คืนค่าเดิมแล้ว');}
    setModel3dLeave(null);setModel3dSnap(null);next();
  }
  /** From the 3D model, the element buttons open that element's model directly. */
  function openElementFromModel3d(kind:ElementType){const target=p.cases.find(z=>caseType(z)===kind);if(!target){setMessage('ยังไม่มี Design Case ประเภท '+(ELEMENT_TYPES.find(e=>e.id===kind)?.label??kind));return;}setCaseId(target.id);setWorkflowElementType(kind);openModel3d(target);}
 return <div className="shell">
 <aside><div className="logo"><div>CMG</div><span>FORMWORK<br/><b>DESIGN WORKSPACE</b></span></div>{userProfile&&<div className="sidebar-profile-card">{userProfile.photoURL?<img src={userProfile.photoURL} alt=""/>:<span>{userProfile.firstName?.[0]??userProfile.email[0]?.toUpperCase()}</span>}<div><b>{userProfile.firstName||userProfile.email}</b><small>{userProfile.role.join(' · ')}</small></div></div>}<div className="project-label">PROJECT WORKSPACE</div><select className="project-select" value={p.id} onChange={e=>{const id=e.target.value;leaveModel3d(()=>{setProjectId(id);setCaseId(projects.find(p=>p.id===id)!.cases[0].id);setSourceName(null);setTab(v=>v==='model3d'?'geometry':v);});}}>{projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>{canManageProjects&&<><button className="new-project" onClick={()=>void addProject()}><Plus size={15}/> เพิ่มโครงการ</button><button className="new-project" disabled={busy} onClick={()=>void addMockProject()}><Layers size={15}/> สร้าง Project Example</button>{projects.length>0&&<button className="new-project danger" disabled={busy} onClick={()=>void removeProject()} title={`ลบ ${p.name}`}><Trash2 size={15}/> ลบโครงการนี้</button>}</>}
 <div className="element-workflow-nav" aria-label="เมนูองค์อาคารหลัก"><span className="project-label">ELEMENT WORKFLOW</span><div className="element-workflow-nav-grid">{ELEMENT_TYPES.map(type=><button key={type.id} className={workflowElementType===type.id?'selected':''} onClick={()=>tab==='model3d'?leaveModel3d(()=>openElementFromModel3d(type.id)):openElementType(type.id)}>{type.label}</button>)}</div></div>
 <nav>{nav.map(([key,label,Icon],i)=><React.Fragment key={key}>{i===0&&<span className='nav-group-label'>งานหลัก (ทำตามลำดับ)</span>}{i===mainNav.length&&<span className='nav-group-label'>ข้อมูลประกอบ</span>}<button className={tab===key?'active':''} onClick={()=>leaveModel3d(()=>{setTab(key);if(currentPath==='/admin')navigate('/dashboard')})}><Icon size={18}/>{label}</button></React.Fragment>)}</nav>
 {hasRole(userProfile,'MasterAdmin')&&<button className={`admin-sidebar-link ${tab==='users'?'active':''}`} onClick={()=>leaveModel3d(()=>{setTab('users');navigate('/admin')})}><Users size={16}/> จัดการ User {pendingUsers>0&&<span className="notification-badge"><Bell size={11}/>{pendingUsers}</span>}</button>}
 <div className="sidebar-bottom"><div><span className="status-dot"/><span>{configured&&!usingEmulators?'FIREBASE PRODUCTION':'PRIVATE CLOUD TRIAL'}</span></div><small>v{APP_VERSION} · Engineering screening</small><button onClick={()=>setAuthOpen(!authOpen)}><LogIn size={15}/>{uid?'บัญชี '+uid.slice(0,8):'สถานะระบบและข้อมูล'}</button></div></aside>
  <main><header><div><small>{p.code} <ChevronRight size={11}/> {ELEMENT_TYPES.find(type=>type.id===workflowElementType)?.label.toUpperCase()||'ELEMENT'} FORMWORK</small><h1>{tab==='users'?'จัดการผู้ใช้งาน':tab==='model3d'?'โมเดล 3D แบบหล่อ':nav.find(n=>n[0]===tab)?.[1]||'Workspace'}</h1></div><div className="header-actions">{p.kit&&<button className="btn secondary ui-mode" title="โหมดง่าย: วัสดุตามชุดมาตรฐาน กรอกเฉพาะมิติและระยะ" onClick={()=>setUiMode(uiMode==="simple"?"advanced":"simple")}>{uiMode==="simple"?"โหมดง่าย":"โหมดละเอียด"}</button>}<span className="mode-badge">DRAFT · NOT FOR CONSTRUCTION</span>{tab!=='users'&&<button className="btn secondary" disabled={!canEditCurrentProject} onClick={async()=>{if(await save()&&tab==='model3d')setModel3dSnap(s=>s&&{...s,json:caseJson(c),value:structuredClone(c)});}}><Save size={16}/>บันทึก</button>}<ProfileMenu/></div></header>
  {tab!=='model3d'&&<div className="notice cloud-trial">{configured&&!usingEmulators?(canEditCurrentProject?'เชื่อมต่อ Firebase production workspace แล้ว · ข้อมูลถูกกรองตาม Role และโครงการที่ได้รับมอบหมาย':'โครงการนี้เป็นสิทธิ์ดูอย่างเดียว · การบันทึกและอัปโหลดถูกปิดตามสิทธิ์โครงการ'):usingEmulators?'โหมดจำลอง Firebase ถูกเปิดใช้งานสำหรับการทดสอบเท่านั้น':'โหมดออฟไลน์ · ตั้งค่า Firebase ใน .env เพื่อใช้งานระบบบัญชี'}</div>}
 {message&&<div className="toast" role="status">{message}<button onClick={()=>setMessage('')}>×</button></div>}
  {authOpen&&<section className="card auth"><h3>Firebase Authentication</h3><p>{configured?'Persistent Session เปิดใช้งานด้วย browserLocalPersistence และข้อมูลอยู่ที่ RC-FormWork-App / root':'ยังไม่เปิดใช้งาน Firebase ข้อมูลจะอยู่เฉพาะเบราว์เซอร์นี้'}</p>{configured&&<p className="muted">ผู้ใช้ปัจจุบัน: {userProfile?.email||busy?'กำลังเชื่อมต่อ…':'ยังไม่ได้เชื่อมต่อ'} · {userProfile?.role.join(', ')}</p>}</section>}
  {tab==='users'&&<AdminPanel onPendingCount={setPending}/>} 
  {tab!=='users'&&(!projects.length?<section className="card empty-state"><Users size={42}/><h2>ยังไม่มีโครงการที่เข้าถึงได้</h2><p>{canManageProjects?(configured?'สร้างโครงการแรกจากเมนูด้านซ้าย แล้วกำหนดผู้ใช้งานและโครงการได้จากหน้าจัดการผู้ใช้งาน':'สร้างโครงการใหม่หรือโครงการตัวอย่างเพื่อเริ่มงาน'):'ติดต่อ MasterAdmin เพื่อขอสิทธิ์เข้าโครงการที่เกี่ยวข้อง'}</p>{canManageProjects&&<div className="header-actions"><button className="btn" onClick={()=>void addProject()}><Plus size={16}/>เพิ่มโครงการแรก</button><button className="btn secondary" onClick={()=>void addMockProject()}><Layers size={16}/>สร้างโครงการตัวอย่าง</button></div>}</section>:<>
  {tab!=='model3d'&&<><div className="backup-bar"><button className="btn secondary" onClick={exportProject}><Download size={14}/>สำรองโครงการ</button><button className="btn secondary" onClick={()=>backupPicker.current?.click()}><Upload size={14}/>นำเข้าโครงการ</button><input ref={backupPicker} type="file" accept=".json" hidden onChange={e=>{if(e.target.files?.[0])void importProject(e.target.files[0]);e.target.value='';}}/></div><div className="case-bar"><div><span className="project-label">DESIGN CASE</span><div className="case-selector"><select value={c.id} onChange={e=>{const next=p.cases.find(z=>z.id===e.target.value);setCaseId(e.target.value);setWorkflowElementType(next?.workflowElementType??(next?.input.kind as ElementType)??'FOOTING');setSourceName(null);}}>{p.cases.map(z=><option key={z.id} value={z.id}>{z.name}</option>)}</select><button className="btn secondary case-rename" disabled={!canEditCurrentProject} onClick={renameCase}>แก้ชื่อ</button></div></div>{tab==='geometry'&&<button className='btn model3d-open' onClick={()=>openModel3d()} title='เปิดโมเดล 3D แบบหล่อ คลิกชิ้นส่วนเพื่อแก้ไข'><Box size={16}/>โมเดล 3D</button>}<div className="element-menu" aria-label="เลือกประเภทองค์อาคาร"><span className="project-label">ELEMENT</span>{ELEMENT_TYPES.map(type=><button key={type.id} className={`btn secondary element-menu-button ${workflowElementType===type.id?'selected':''}`} onClick={()=>selectWorkflowElement(type.id)} title={`เปิดแบบ${type.label}`}>{type.label}</button>)}<button className="btn secondary element-menu-button" onClick={()=>void addCase(workflowElementType)} title="เพิ่ม Design Case ตามประเภทที่เลือก"><Plus size={13}/>เพิ่มแบบ</button></div></div></>}
  {tab!=='model3d'&&currentIntegrityIssues.length>0&&<div className="warning case-integrity-warning" role="alert"><strong>ตรวจพบข้อมูล Design Case ที่ต้องตรวจ ก่อนคำนวณหรือส่งตรวจ</strong><ul>{currentIntegrityIssues.map((issue,i)=><li key={`${issue.code}-${i}`}>{issue.message}</li>)}</ul>{((c.workflowV07?.model.elementType&&c.workflowV07.model.elementType!==workflowElementType)||hasNamePrefixMismatch)&&<div className="case-integrity-actions">{hasNamePrefixMismatch&&nameSuggestedType&&nameSuggestedType!==workflowElementType&&<button className="btn secondary" disabled={!canEditCurrentProject} onClick={resolveNamePrefixType}>ใช้ประเภทจากชื่อ ({nameSuggestedType})</button>}{c.workflowV07?.model.elementType&&c.workflowV07.model.elementType!==workflowElementType&&<><button className="btn secondary" disabled={!canEditCurrentProject} onClick={()=>resolveCaseIdentity('draft')}>ใช้ประเภทของร่าง v0.7</button><button className="btn secondary" disabled={!canEditCurrentProject} onClick={()=>resolveCaseIdentity('case')}>ลบร่างที่ชนิดไม่ตรง</button></>}</div>}</div>}
 {!['model3d','kit','order','users'].includes(tab)&&<KitBadge key={c.id} status={caseKit} canEdit={canEditCurrentProject} onApply={applyKitToCurrent} onReason={setKitException} onOpenKit={()=>setTab('kit')}/>}
 {tab==='model3d'&&<React.Suspense fallback={<p>กำลังโหลดโมเดล 3D…</p>}><Model3DWorkspace key={p.id+':'+c.id+':'+workflowElementType} caseName={c.name} canEdit={canEditCurrentProject} stockIds={p.sectionStock} dirty={model3dDirty} onBack={()=>leaveModel3d(()=>setTab('geometry'))}
   target={beamElement?{element:'BEAM',input:beamInput,result:beamAnalysis.r,error:beamAnalysis.error,onChange:setBeam}:slabElement?{element:'SLAB',input:slabInput,result:slabAnalysis.r,error:slabAnalysis.error,onChange:setSlab}
   :wallElement?{element:'WALL',input:wallInput,result:wallAnalysis.r,error:wallAnalysis.error,onChange:setWall}:{element:workflowElementType==='COLUMN'?'COLUMN':'FOOTING',input:x,result:r,error:analysis.error,onChange:editMany}}/></React.Suspense>}
 {model3dLeave&&<Model3DLeaveDialog busy={busy} canSave={canEditCurrentProject} onSave={()=>void finishModel3d('save')} onDiscard={()=>finishModel3d('discard')} onStay={()=>setModel3dLeave(null)}/>}
 <div hidden={tab!=='upload'}><SourceUpload key={uid+':'+p.id+':'+c.id} projectId={p.id} caseId={c.id} userId={uid} canEdit={canEditCurrentProject} saveProject={()=>{if(!canEditCurrentProject)return Promise.reject(Error('โครงการนี้เป็นสิทธิ์ดูอย่างเดียว'));return saveProject(p,'upload',c.id);}} onSourceChange={name=>{setSourceName(name);if(name)edit('confirmed',false);}} onPreviewChange={setSource} onApplyDraft={applyAI} onManual={()=>setTab('geometry')} model={analysis.r?x:undefined} onApplyChanges={applyModelChanges} onCreateCases={items=>void createCases(items)} resume={drawing?.projectId===p.id?drawing.value:null} onDrawingChange={reportDrawing} stockIds={p.sectionStock}/>
 {legacyElement&&<ModelWorkspace caseName={c.name} result={analysis.r} error={analysis.error} history={history[c.id]??[]} canEdit={canEditCurrentProject} onUndo={undoModel} onEditGeometry={()=>setTab('geometry')}/>}</div>
 {tab==='designbook'&&<DesignBook input={x}/>}
 {hasV07Output&&exampleDrawing&&tab==='drawings'&&<div className="notice">ชุดที่ 1: แบบก่อสร้างแบบหล่อ A3 (มาตรฐานเดียวกับทุกโครงการ) · ชุดที่ 2 ด้านล่าง: แบบติดตั้งละเอียด v0.7 (พิกัด ไทร์ ค้ำยัน)</div>}
 {hasV07Output&&exampleDrawing&&tab==='drawings'&&(legacyElement?(r?<DrawingSet kitNote={kitNote} result={r} project={p.name} code={p.code} caseName={exampleCaseName} titleBlock={titleBlock} canEdit={canEditCurrentProject} onTitleBlockChange={setTitleBlock} revisionBinding={reportBinding}/>:<div className="warning">{analysis.error}</div>)
   :beamElement?(beamAnalysis.r?<BeamDrawingSet kitNote={kitNote} r={beamAnalysis.r} project={p.name} code={p.code} caseName={exampleCaseName} titleBlock={titleBlock} canEdit={canEditCurrentProject} onTitleBlockChange={setTitleBlock} revisionBinding={reportBinding}/>:<div className="warning">{beamAnalysis.error}</div>)
   :slabElement?(slabAnalysis.r?<SlabDrawingSet kitNote={kitNote} r={slabAnalysis.r} project={p.name} code={p.code} caseName={exampleCaseName} titleBlock={titleBlock} canEdit={canEditCurrentProject} onTitleBlockChange={setTitleBlock} revisionBinding={reportBinding}/>:<div className="warning">{slabAnalysis.error}</div>)
   :wallElement&&(wallAnalysis.r?<WallDrawingSet kitNote={kitNote} r={wallAnalysis.r} project={p.name} code={p.code} caseName={exampleCaseName} titleBlock={titleBlock} canEdit={canEditCurrentProject} onTitleBlockChange={setTitleBlock} revisionBinding={reportBinding}/>:<div className="warning">{wallAnalysis.error}</div>))}
 {hasV07Output&&exampleDrawing&&tab==='drawings'&&<React.Suspense fallback={<p>กำลังโหลดชุดแบบ Project Example…</p>}><ProjectExampleDrawingBook cases={p.cases} caseId={c.id} project={p.name} code={p.code} canEdit={canEditCurrentProject} onTitleBlockChange={setTitleBlock}/></React.Suspense>}
 {hasV07Output&&!exampleDrawing&&tab==='drawings'&&<React.Suspense fallback={<p>กำลังโหลดผล Workflow v0.7…</p>}><WorkflowV07Output model={c.workflowV07!.model} review={c.review} mode={tab as 'results'|'drawings'|'report'} project={p.name} code={p.code} caseName={c.name} titleBlock={titleBlock} canEdit={canEditCurrentProject} onTitleBlockChange={setTitleBlock}/></React.Suspense>}
 {beamElement&&(['overview','geometry','criteria','layout'].includes(tab)||(tab==='results'))&&<BeamPanel spacingStep={p.kit?.spacingStep} hide={kitHide} kitCard={kitCard} tab={tab as BeamTab} x={beamInput} r={beamAnalysis.r} error={beamAnalysis.error} canEdit={canEditCurrentProject} stockIds={p.sectionStock} onChange={setBeam} onTab={setTab}/>}
 {!hasV07Output&&beamElement&&tab==='drawings'&&(beamAnalysis.r?<BeamDrawingSet kitNote={kitNote} r={beamAnalysis.r} project={p.name} code={p.code} caseName={c.name} titleBlock={titleBlock} canEdit={canEditCurrentProject} onTitleBlockChange={setTitleBlock} revisionBinding={reportBinding}/>:<div className="warning">{beamAnalysis.error}</div>)}
 {slabElement&&(['overview','geometry','criteria','layout'].includes(tab)||(tab==='results'))&&<SlabPanel spacingStep={p.kit?.spacingStep} hide={kitHide} kitCard={kitCard} tab={tab as SlabTab} x={slabInput} r={slabAnalysis.r} error={slabAnalysis.error} canEdit={canEditCurrentProject} stockIds={p.sectionStock} onChange={setSlab} onTab={setTab}/>}
 {!hasV07Output&&slabElement&&tab==='drawings'&&(slabAnalysis.r?<SlabDrawingSet kitNote={kitNote} r={slabAnalysis.r} project={p.name} code={p.code} caseName={c.name} titleBlock={titleBlock} canEdit={canEditCurrentProject} onTitleBlockChange={setTitleBlock} revisionBinding={reportBinding}/>:<div className="warning">{slabAnalysis.error}</div>)}
 {slabElement&&tab==='report'&&slabAnalysis.r&&<><div className="report-tools"><p>รายการคำนวณแบบหล่อพื้น A4 · ใช้รูปชุดเดียวกับแบบ A3</p><ReportVariantSwitch value={reportVariant} onChange={setReportVariant}/>{reportVariant==='short'&&<ReportLangSwitch value={reportLang} onChange={setReportLang}/>}<button className="btn" onClick={()=>window.print()}><Download size={17}/>พิมพ์ / บันทึก PDF (A4)</button></div>{reportVariant==='short'?<SlabShortReport kitNote={kitNote} lang={reportLang} r={slabAnalysis.r} project={p.name} code={p.code} caseName={c.name} caseId={c.id} titleBlock={titleBlock} revisionBinding={reportBinding}/>:<SlabReport kitNote={kitNote} r={slabAnalysis.r} project={p.name} code={p.code} caseName={c.name} caseId={c.id} titleBlock={titleBlock} revisionBinding={reportBinding}/>}</>}
 {wallElement&&(['overview','geometry','criteria','layout'].includes(tab)||(tab==='results'))&&<WallPanel spacingStep={p.kit?.spacingStep} hide={kitHide} kitCard={kitCard} tab={tab as WallTab} x={wallInput} r={wallAnalysis.r} error={wallAnalysis.error} canEdit={canEditCurrentProject} stockIds={p.sectionStock} onChange={setWall} onTab={setTab}/>}
 {!hasV07Output&&wallElement&&tab==='drawings'&&(wallAnalysis.r?<WallDrawingSet kitNote={kitNote} r={wallAnalysis.r} project={p.name} code={p.code} caseName={c.name} titleBlock={titleBlock} canEdit={canEditCurrentProject} onTitleBlockChange={setTitleBlock} revisionBinding={reportBinding}/>:<div className="warning">{wallAnalysis.error}</div>)}
 {wallElement&&tab==='report'&&wallAnalysis.r&&<><div className="report-tools"><p>รายการคำนวณแบบหล่อผนัง A4 · ใช้รูปชุดเดียวกับแบบ A3</p><ReportVariantSwitch value={reportVariant} onChange={setReportVariant}/>{reportVariant==='short'&&<ReportLangSwitch value={reportLang} onChange={setReportLang}/>}<button className="btn" onClick={()=>window.print()}><Download size={17}/>พิมพ์ / บันทึก PDF (A4)</button></div>{reportVariant==='short'?<WallShortReport kitNote={kitNote} lang={reportLang} r={wallAnalysis.r} project={p.name} code={p.code} caseName={c.name} caseId={c.id} titleBlock={titleBlock} revisionBinding={reportBinding}/>:<WallReport kitNote={kitNote} r={wallAnalysis.r} project={p.name} code={p.code} caseName={c.name} caseId={c.id} titleBlock={titleBlock} revisionBinding={reportBinding}/>}</>}
 {beamElement&&tab==='report'&&beamAnalysis.r&&<><div className="report-tools"><p>รายการคำนวณแบบหล่อคาน A4 · ใช้รูปชุดเดียวกับแบบ A3</p><ReportVariantSwitch value={reportVariant} onChange={setReportVariant}/>{reportVariant==='short'&&<ReportLangSwitch value={reportLang} onChange={setReportLang}/>}<button className="btn" onClick={()=>window.print()}><Download size={17}/>พิมพ์ / บันทึก PDF (A4)</button></div>{reportVariant==='short'?<BeamShortReport kitNote={kitNote} lang={reportLang} r={beamAnalysis.r} project={p.name} code={p.code} caseName={c.name} caseId={c.id} titleBlock={titleBlock} revisionBinding={reportBinding}/>:<BeamReport kitNote={kitNote} r={beamAnalysis.r} project={p.name} code={p.code} caseName={c.name} caseId={c.id} titleBlock={titleBlock} revisionBinding={reportBinding}/>}</>}
 {tab==='review'&&<ReviewQueue rows={p.cases.map(z=>({caseId:z.id,name:z.name,elementType:z.workflowElementType??z.input.kind,record:z.review??null,integrityIssues:caseAudit.byCase[z.id]??[],
   stale:z.review&&z.review.state!=='DRAFT'?(z.workflowV07?(z.review.engineVersion!==WORKFLOW_VERSION||z.review.engineVersion!==z.workflowV07.engineVersion?true:null):true):null}))}
   onOpen={id=>{setCaseId(id);const next=p.cases.find(z=>z.id===id);setWorkflowElementType(next?.workflowElementType??(next?.input.kind as ElementType)??'FOOTING');setTab('overview');}}/>}
 {tab==='kit'&&<ProjectKitPanel kit={p.kit} cases={p.cases} rows={p.cases.map(z=>({id:z.id,name:z.name,type:ELEMENT_TYPES.find(t=>t.id===caseType(z))?.label??caseType(z),status:caseKitStatus(z,p.kit)}))} canEdit={canEditCurrentProject} stockIds={p.sectionStock}
   onSave={setKit} onRemove={()=>setKit(undefined)} onSeed={()=>kitFromCase(caseType(c),caseKitInput(c))} onApplyAll={applyKitToAll} onOpen={id=>{const next=p.cases.find(z=>z.id===id);setCaseId(id);setWorkflowElementType(next?caseType(next):'FOOTING');setTab('overview');}}/>}
 {tab==='order'&&<ProjectOrderPanel cases={p.cases} types={Object.fromEntries(p.cases.map(z=>[z.id,ELEMENT_TYPES.find(t=>t.id===caseType(z))?.label??caseType(z)]))} code={p.code} canEdit={canEditCurrentProject} onOrderChange={setCaseOrder}/>}
 {tab==='library'&&<RegistryPanel registry={registry} reviewerName={reviewerName} canReview={canReviewRegistry} canDelete={!configured||hasRole(userProfile,'MasterAdmin')} onSave={saveRegistry} onDelete={removeRegistryItem} onSeed={seedRegistryItems} onSeedPublic={seedPublicReferenceItems} onSeedClosure={seedClosureReferenceItems}/>}
  {tab==='connections'&&<section className="card" aria-label="จุดต่อและค้ำยัน"><h2>จุดต่อและค้ำยัน / Connections &amp; Bracing</h2><p>หน้านี้รวมรายการตรวจที่ยังต้องมีหลักฐานจริงก่อนออกแบบ: Tie และแผ่นรอง/นัต/เกลียว, คานต่อ/จุดต่อ, U-head, Jack Base, Ringlock ledger/brace, ค้ำยัน, anchor และเสถียรภาพรวม</p><div className="notice">สถานะปัจจุบัน: BLOCKED / NO_GO · ระบบจะไม่สร้างกำลังหรือ SWL จากขนาดหน้าตัดหรือชื่อผู้ผลิต</div><ul className="blockers"><li>ตรวจสอบ product identity, รุ่น, batch และเอกสารกำลังของชุดประกอบให้ตรงกับ Design Revision</li><li>ผูกแรงปฏิกิริยาและจุดพิกัดจริงกับ connection/anchor ทุกจุด</li><li>ยืนยันฐานแรง (SERVICE หรือ FACTORED), allowable/design resistance และขอบเขตการใช้</li><li>ตรวจ buckling, joint stiffness, bearing, uplift, lateral restraint และ global stability</li></ul>{practical&&<button className="btn" onClick={()=>{setTab('overview');setShowV07(true);}}>เปิด Workflow v0.7 สำหรับกรอกหลักฐาน</button>}<p className="muted">ข้อมูลผลิตภัณฑ์และขีดจำกัดกรอกได้ที่เมนูคลังวัสดุ/วิธีคำนวณ แต่รายการ DRAFT ยังเป็น REFERENCE_ONLY และไม่ทำให้ผลเป็น PASS</p></section>}
 {tab==='audit'&&<><section className="card" aria-label="Audit และ Settings"><h2>Audit &amp; Settings</h2><p>ตรวจความสัมพันธ์ของ Design Case, Design Revision, Review และข้อมูลสำรองในโครงการปัจจุบัน</p><div className="metrics"><div><small>CASES</small><strong>{p.cases.length}</strong></div><div><small>ISSUES</small><strong>{p.cases.reduce((n,z)=>n+(caseAudit.byCase[z.id]?.length??0),0)}</strong></div><div><small>DUPLICATE NAMES</small><strong>{caseAudit.duplicateNames.length}</strong></div><div><small>V07 REVISION</small><strong>{c.workflowV07?.model.revisionId||`CASE-${c.id}`}</strong></div></div><table><thead><tr><th>Case</th><th>ประเภท</th><th>Revision</th><th>Review</th><th>Issues</th><th></th></tr></thead><tbody>{p.cases.map(z=>{const issues=caseAudit.byCase[z.id]??[];return <tr key={z.id}><td>{z.name}</td><td>{z.workflowElementType??z.input.kind}</td><td>{z.workflowV07?.model.revisionId||`CASE-${z.id}`}</td><td>{z.review?.state||'DRAFT'}{z.review?.contentHash?` · ${z.review.contentHash.slice(0,10)}`:''}</td><td>{issues.length?issues.map(issue=>issue.code).join(', '):'—'}</td><td><button className="text-btn" onClick={()=>{setCaseId(z.id);setWorkflowElementType(z.workflowElementType??(z.input.kind as ElementType));setTab('overview');}}>เปิด</button></td></tr>;})}</tbody></table>{(caseAudit.duplicateNames.length||caseAudit.duplicateIds.length)&&<div className="warning">พบชื่อซ้ำ {caseAudit.duplicateNames.length} รายการ / ID ซ้ำ {caseAudit.duplicateIds.length} รายการ · กรุณาสำรองโครงการและแก้ทีละ Case โดยผู้มีอำนาจ</div>}<p className="muted">การแก้ชื่อ/ประเภทและการลบร่างต้องกดยืนยันในหน้า Case; ระบบไม่แก้ Production อัตโนมัติจาก prefix หรือข้อมูลอ้างอิง</p></section><ReconciliationPanel projectId={p.id} projectCode={p.code} cases={p.cases.map(z=>({id:z.id,name:z.name,storedType:(z.workflowElementType??z.input.kind) as ElementType}))} canEdit={canEditCurrentProject}/></>}
 {tab==='overview'&&p.name==='Project Example'&&practical&&<section className="card"><h3>Project Example · แหล่งอ้างอิงของข้อมูลตัวอย่าง</h3><p className="muted">{localExample?'โครงการนี้เป็น local read-only เพราะยังไม่มีรายการเดียวกันใน Firebase · MasterAdmin กด “สร้าง Project Example” เพื่อบันทึกเป็นโครงการจริงได้':'ค่ามิติและพารามิเตอร์นี้จัดไว้เพื่อสาธิตการกรอกข้อมูลและการเปิดแบบเท่านั้น'} ทุก case ยังเป็น MOCK-UP / NO_GO</p><ul className="blockers">{Object.entries(PROJECT_EXAMPLE_REFERENCES).map(([key,value])=><li key={key}><b>{key}</b> · {value}</li>)}</ul><div className="warning"><AlertTriangle size={18}/><p>ชุดตัวอย่างกรอกค่ากำลังค้ำยันและ Form Tie 30 kN พุก 20 kN และข้อมูลรองรับครบตามระบบ โดยใช้ EX-DB-01 (MOCK) เป็นสมมติฐานฝึกกรอก ทุกค่าแก้ไขได้</p></div></section>}
 {tab==='overview'&&legacyElement&&<><section className="hero"><div><span className="eyebrow">FROM DRAWING TO CALCULATION</span><h2>จัดวางแบบหล่อ<br/>พร้อมหลักฐานที่ตรวจสอบได้</h2><p>รับแบบ · ยืนยันมิติ · เปรียบเทียบการจัดวาง · ตรวจสมาชิก · รายงานร่าง</p><button className="btn light" onClick={()=>setTab('upload')}><Upload size={17}/>เริ่มจาก PDF / ภาพสเก็ตช์</button></div><div className="hero-diagram"><Layers size={92} strokeWidth=".7"/><span>PLYWOOD + STEEL FRAME</span></div></section>{p.name==='Project Example'&&<section className="card"><h3>Project Example · แหล่งอ้างอิงของข้อมูลตัวอย่าง</h3><p className="muted">{localExample?'โครงการนี้เป็น local read-only เพราะยังไม่มีรายการเดียวกันใน Firebase · MasterAdmin กด “สร้าง Project Example” เพื่อบันทึกเป็นโครงการจริงได้':'ค่ามิติและพารามิเตอร์นี้จัดไว้เพื่อสาธิตการกรอกข้อมูลและการเปิดแบบเท่านั้น'} ทุก case ยังเป็น MOCK-UP / NO_GO</p><ul className="blockers">{Object.entries(PROJECT_EXAMPLE_REFERENCES).map(([key,value])=><li key={key}><b>{key}</b> · {value}</li>)}</ul><div className="warning"><AlertTriangle size={18}/><p>ชุดตัวอย่างกรอกค่ากำลังค้ำยันและ Form Tie 30 kN พุก 20 kN และข้อมูลรองรับครบตามระบบ โดยใช้ EX-DB-01 (MOCK) เป็นสมมติฐานฝึกกรอก ทุกค่าแก้ไขได้</p></div></section>}
 <div className="metrics"><div><small>CONCRETE VOLUME</small><strong>{f(r?.volume??null)}<em>m³</em></strong></div><div><small>SIDE FORMWORK AREA</small><strong>{f(r?.formArea??null)}<em>m²</em></strong></div><div><small>MAX. FRESH PRESSURE</small><strong>{f(r?.pressure??null,1)}<em>kPa</em></strong></div><div><small>ENGINEERING STATUS</small><strong className="amber">{r?.status||'INVALID'}</strong><span>ต้องตรวจส่วนที่ยังขาด</span></div></div>
 <div className="grid two"><section className="card"><div className="card-title"><h3>รูปทรงและแนวจัดวาง</h3><button className="text-btn" onClick={()=>setTab('geometry')}>แก้ไขมิติ →</button></div><Plan input={x} result={r}/></section><section className="card"><h3>ขั้นตอนของแบบนี้</h3><div className="steps">{[['01','รับแบบต้นฉบับ',sourceName||'เพิ่ม PDF/ภาพ หรือป้อนมิติด้วยตนเอง'],['02','ยืนยันรูปทรง',x.confirmed?'ยืนยันแล้ว':'ยังไม่ยืนยัน'],['03','จัดวางเบื้องต้น','เปรียบเทียบตัวเลือกจากระบบ'],['04','ตรวจรายการคำนวณ','คัดกรองสมาชิกและแสดงส่วนที่ยังขาด'],['05','รายงานและแบบติดตั้ง','ส่งออกรายงานร่างได้']].map(([n,a,b])=><div key={n}><span>{n}</span><section><b>{a}</b><p>{b}</p></section></div>)}</div><div className="warning"><AlertTriangle size={18}/><p>ต้นแบบนี้ยังไม่ครบสำหรับออกแบบก่อสร้างจริง ทุกค่าที่ใช้คัดกรองแสดงที่มาและข้อจำกัด</p></div></section></div></>}

 {tab==='geometry'&&legacyElement&&<div className="grid two"><section className="card"><h3>มิติภายในคอนกรีต</h3><p className="muted">ทุกมิติเป็น mm · เมื่อแก้รูปทรง ต้องยืนยันใหม่</p><label className="field"><span>ประเภท</span><select value={x.kind} onChange={e=>edit('kind',e.target.value as Input['kind'])}><option value="FOOTING">ฐานราก</option><option value="COLUMN">เสา</option></select></label><label className="field"><span>รูปทรง</span><select value={x.shape} onChange={e=>edit('shape',e.target.value as Input['shape'])}><option value="RECTANGLE">สี่เหลี่ยมผืนผ้า / จัตุรัส</option><option value="L">รูปตัว L</option></select></label>{x.kind==='COLUMN'&&<label className="field"><span>ระบบยึดแบบเสา</span><select aria-label="ระบบยึดแบบเสา" value={x.columnTies?'TIES':'YOKE'} disabled={!canEditCurrentProject} onChange={e=>edit('columnTies',e.target.value==='TIES')}><option value="YOKE">ไม่ใช้ Tie · วงรัดภายนอก (คานคู่รอบ 4 ด้าน)</option><option value="TIES">ใช้ Tie ทะลุเสา + วงรัดมุม</option></select><small className="help">{x.columnTies?'Tie ทะลุเสาตามระยะ Tie ช่วยลดช่วงคานคู่ ต้องเว้นช่องเหล็กเสริมและอุดรูหลังถอดแบบ':'เหมาะกับเสาขนาดเล็ก ไม่มีรูทะลุคอนกรีต แรงทั้งหมดไปที่มุมชุดรัด'}</small></label>}<div className="form-grid">{field('width','ขนาดรวม X')}{field('length','ขนาดรวม Y')}{field('height',x.kind==='FOOTING'?'ความลึกฐานราก':'ความสูงเสา')}{x.shape==='L'&&<>{field('armX','ความกว้างแขนแนวตั้ง')}{field('armY','ความกว้างแขนแนวนอน')}</>}</div>{analysis.error&&<div className="warning">{analysis.error}</div>}<label className="confirm"><input type="checkbox" checked={x.confirmed} disabled={!!analysis.error} onChange={e=>edit('confirmed',e.target.checked)}/>ตรวจรูปทรง หน่วย และมิติจากต้นฉบับแล้ว</label><button className="btn" onClick={()=>setTab('layout')} disabled={!x.confirmed||!!analysis.error}>ไปจัดวางเบื้องต้น <ChevronRight size={16}/></button></section><section className="card"><Plan input={x} result={r}/>{source&&<details><summary>เทียบแบบต้นฉบับ</summary><img className="source-image" src={source.url} alt={source.name}/></details>}<table><thead><tr><th>จุด</th><th>X (mm)</th><th>Y (mm)</th></tr></thead><tbody>{polygon(x).map((v,i)=><tr key={i}><td>V{i+1}</td><td>{v.x}</td><td>{v.y}</td></tr>)}</tbody></table></section></div>}
 {tab==='criteria'&&legacyElement&&<>{kitCard}<div className="notice"><AlertTriangle size={17}/>ค่าเริ่มต้นเป็นค่าอ้างอิงเบื้องต้นจากมาตรฐานและแคตตาล็อก (แก้ไขได้ทุกช่อง) ต้องยืนยันกับผลิตภัณฑ์ ใบรับรองวัสดุ และวิธีเทจริงก่อนออกแบบใช้งาน</div><LegacyRestraints x={x} canEdit={canEditCurrentProject} onChange={editMany}/><div className="grid two"><section className="card"><h3>แรงดันคอนกรีตสด / การโก่ง</h3><label className="field"><span>วิธีคำนวณแรงดันด้านข้าง</span><select aria-label="วิธีคำนวณแรงดัน" value={x.pressureMethod} onChange={e=>edit('pressureMethod',e.target.value as Input['pressureMethod'])}><option value="HYDROSTATIC">แรงดันของเหลว ρgh เต็มความสูง (ปลอดภัยเสมอ)</option><option value="ACI347">ACI PRC-347-14(21) §4.2.2.1b (SI)</option></select></label><div className="form-grid">{field('gamma','น้ำหนักคอนกรีต','kN/m³')}{field('deflectionRatio','เกณฑ์ L/n','n','เกณฑ์โครงการ ไม่ใช่ข้อกำหนดเดียวสำหรับทุกงาน')}</div>{x.pressureMethod==='ACI347'&&<><div className="form-grid">{field('pourRate','อัตราการเท R','m/h','ความสูงที่เทขึ้นต่อชั่วโมง ต้องควบคุมหน้างาน')}{field('concreteTemp','อุณหภูมิคอนกรีต T','°C')}{field('slump','ค่ายุบตัว (หลังเติมสารผสม)','mm','> 175 mm หรือ SCC ใช้แรงดันของเหลว')}{field('vibrationDepth','ความลึกเครื่องจี้','m','> 1.2 m ใช้แรงดันของเหลว')}</div><label className="field"><span>ค่าสัมประสิทธิ์เคมี Cc (ตาราง 4.2.2.1a(b))</span><select aria-label="Cc" value={x.chemistryCc} onChange={e=>edit('chemistryCc',Number(e.target.value))}><option value={1}>1.0 · ปูนประเภท I/II/III ไม่มีสารหน่วง</option><option value={1.2}>1.2 · ปูน I/II/III + สารหน่วง หรือมีสแลก &lt;70% / เถ้าลอย &lt;40%</option><option value={1.4}>1.4 · สแลก/เถ้าลอยต่ำกว่าเกณฑ์ + สารหน่วง หรือสแลก ≥70% / เถ้าลอย ≥40%</option><option value={1.5}>1.5 · สแลก ≥70% / เถ้าลอย ≥40% + สารหน่วง</option></select></label></>}{r&&<p className="muted">ผล: {r.pressureModel.equation==='HYDROSTATIC'?'ρgh':'สมการ '+r.pressureModel.equation} · {r.pressureModel.reason} · pmax = <b>{f(r.pressureModel.pmax,1)} kPa</b> (ρgh = {f(r.pressureModel.hydrostatic,1)} kPa)</p>}<PressureGuide/>{!simpleKit&&<PlywoodCriteria x={x} r={r} canEdit={canEditCurrentProject} field={field} onChange={ch=>setInput({...x,...ch})}/>}</section>{!simpleKit&&<section className="card"><h3>เหล็ก / อุปกรณ์</h3><div className="form-grid">{field('steelFy','Fy เหล็กคร่าวและคาน','MPa')}{field('steelE','E เหล็ก','MPa')}{field('steelOmegaB','ตัวหารกำลังดัด Ωb','')}{field('steelOmegaShear','ตัวหารเฉือน Ωv','')}</div><SteelGuide/><div className="warning"><p>ค้ำยัน “34 มม.” ยังไม่กำหนดว่าเป็นท่อ เหล็กตัน หรือป๊อป ต้องเติมความหนา ความยาว ปลายยึด และกำลังรับรอง</p></div><h4>Method capability</h4><ul><li>แรงดัน Hydrostatic: implemented / mathematical benchmark</li><li>Simple-span screening: implemented</li><li>คานคู่รับแรงจุด / ดัด / โก่ง / แรงปฏิกิริยา: implemented screening</li><li>ชุดรัดเสา: corner demand / conditional ring screening; จุดต่อและเสถียรภาพยังไม่ครบ</li><li>Steel buckling / Anchor / Global stability: incomplete</li></ul></section>}</div>{usesTies(x)&&!simpleKit&&<section className="card"><h3>Tie rod (对拉螺杆) · Design parameters</h3><label className="field"><span>เกรดตัวเหล็กตัวอย่าง</span><select value={x.tieGrade} onChange={e=>{const tieGrade=e.target.value as Input['tieGrade'];setInput({...x,tieGrade,...(tieGrade==='SD40'?{tieFy:390,tieFu:560}:tieGrade==='SR24'?{tieFy:235,tieFu:385}:{})});}}><option value="SD40">SD40 — เหล็กข้ออ้อย (ค่าตัวอย่าง)</option><option value="SR24">SR24 — เหล็กกลม (ค่าตัวอย่าง)</option><option value="CUSTOM">CUSTOM — กำหนดจากใบรับรอง</option></select></label><div className="form-grid four">{field('tieFy','Fy ตัวเหล็ก','MPa')}{field('tieFu','Fu ตัวเหล็ก','MPa')}{field('tieOmegaYield','ตัวหาร Yield Ωy','')}{field('tieOmegaRupture','ตัวหาร Rupture Ωu','')}{field('tieNetArea','Ae ประสิทธิผลของเกลียว','mm²','0 = ยังไม่ทราบ ห้ามใช้ Ag แทนโดยไม่มีหลักฐาน')}{field('tieAssemblySWL','SWL ชุด Tie rod','kN','0 = ยังไม่ทราบ; ต้องเป็น allowable working load ของชุดครบ')}</div><p className="muted">SD40 และ SR24 ใช้ค่าตัวอย่างจากเอกสารผู้ผลิตตาม TIS 24-2559 / 20-2559 ต้องตรวจใบรับรองจริง รวมข้อกำหนดการทำเกลียว นอต แผ่นรอง และวิธีใช้ Ω กับอุปกรณ์</p></section>}{x.kind==='COLUMN'&&<ColumnCriteria x={x} onEdit={edit}/>}</>}
 {tab==='layout'&&legacyElement&&<>{kitCard}<div className="notice">Part 2 · ระบบค้นหาการจัดวางด้วยการคำนวณซ้ำแบบ deterministic · PRELIMINARY_UNCHECKED</div>{!x.confirmed&&<div className="warning">ยืนยันรูปทรงก่อนเลือกข้อเสนอ</div>}<LayoutOptimizer kitStep={p.kit?.spacingStep} input={x} canApply={x.confirmed&&canEditCurrentProject} readOnly={!canEditCurrentProject} onConfirm={analysis.error?undefined:()=>edit('confirmed',true)} onOpenGeometry={()=>setTab('geometry')} onApply={applyOptimized} stockIds={p.sectionStock} canEditStock={canEditCurrentProject} onStockChange={ids=>setProjects(ps=>ps.map(q=>q.id!==p.id?q:{...q,sectionStock:ids}))}/>{!simpleKit&&<SectionPicker input={x} canEdit={canEditCurrentProject} onChange={applySection}/>}<section className="card"><h3>แก้ไขขนาด / ระยะด้วยตนเอง</h3><div className="form-grid four">{field('plywood','ไม้อัด')}{field('studSpacing','ระยะคร่าวสูงสุดที่ขอ')}{field('walerSpacing','ช่วงพาดคร่าวสูงสุดที่ขอ')}{usesTies(x)&&field('tieSpacing','ระยะ Tie สูงสุดที่ขอ')}{field('rhsB','RHS B')}{field('rhsH','RHS H')}{field('rhsT','RHS t')}{usesTies(x)&&field('tieDiameter','Tie ตัวเหล็ก Ø')}</div>{x.kind==='COLUMN'&&!x.columnTies&&<p className="muted">เสาแบบวงรัดภายนอกไม่ใช้ Tie · เปลี่ยนเป็น “ใช้ Tie ทะลุเสา” ได้ที่หน้ารูปทรงและมิติ</p>}<h3>คานคู่ Twin waler (双背楞)</h3>{!simpleKit&&<label className="field"><span>ชนิดคานแต่ละตัว</span><select value={x.walerType} onChange={e=>edit('walerType',e.target.value as Input['walerType'])}><option value="RHS">เหล็กกล่อง RHS</option><option value="C">เหล็ก C ไม่มีปีกริม (หน้าตัดสมมติ)</option>{(x.walerType==='L'||x.walerType==='CHS')&&<option value={x.walerType}>{x.walerType==='L'?'เหล็กฉาก (จากตาราง)':'เหล็กท่อ (จากตาราง)'}</option>}</select></label>}<div className="form-grid four">{field('walerB','คาน B')}{field('walerH','คาน H (แนวดัด)')}{field('walerT','คาน t')}{field('pairShare','α ของคานตัวที่รับมาก','','0.5 = แบ่งเท่ากัน; 1.0 = ตัวเดียวรับทั้งหมด')}</div><p className="muted">ค่าเริ่มต้น α = 1.0 จนกว่าจะตรวจการแบ่งแรงจริง คานสองตัวไม่ถือเป็นหน้าตัดประกอบโดยอัตโนมัติ ภาพแบ่งช่วงเท่ากันไม่เกินระยะที่ขอ คานเป็นช่วงอิสระรองรับสองปลาย แรงจุดจากคร่าวคำนวณด้วยระยะจริง</p>{analysis.error&&<div className="warning">{analysis.error}</div>}<button className="btn" onClick={()=>setTab('results')}>ตรวจรายการคำนวณ <ChevronRight size={16}/></button></section></>}
 {tab==='geometry'&&layoutPreview&&<LayoutPreview {...layoutPreview} onOpen={()=>setTab('layout')}/>}
 {draftModel&&(tab==='geometry'||tab==='layout')&&<React.Suspense fallback={null}><WorkflowV07Summary model={draftModel} mode={tab} compare={tab==='geometry'?draftCompare:[]} layoutRows={tab==='layout'?layoutCompare(workflowElementType,{input:x,beam:beamInput,slab:slabInput,wall:wallInput},draftModel):[]} sync={exampleDrawing?(generatedExampleDraft?'auto':'authored'):null} onOpen={()=>{setShowV07(true);setTab('overview');}}/></React.Suspense>}
  {tab==='results'&&legacyElement&&<>{analysis.error?<div className="warning">{analysis.error}</div>:r&&<>{!simpleKit&&<SectionPicker input={x} canEdit={canEditCurrentProject} onChange={applySection}/>}<div className="metrics"><div><small>PRESSURE</small><strong>{f(r.pressure,1)}<em>kPa</em></strong></div><div><small>CONCRETE</small><strong>{f(r.volume)}<em>m³</em></strong></div><div><small>TIE BODY EXTENSION</small><strong>{f(r.tieElongation)}<em>mm</em></strong></div><div><small>SYSTEM STATUS</small><strong className="amber">{r.status}</strong></div></div><WalerDetails r={r}/><ColumnYokeDetails r={r}/>{r.checks.some(k=>k.status==="FAIL")&&<section className="card"><h3>คำแนะนำปรับแก้ (รายการที่เกินเกณฑ์)</h3><AdviceList input={x} stockIds={p.sectionStock}/><button className="btn" onClick={()=>setTab("layout")}>เลือกทางเลือกที่คำนวณซ้ำแล้ว <ChevronRight size={16}/></button></section>}<section className="card"><h3>ตรวจเบื้องต้น / ตรวจวิธีที่ยังขาด</h3><ChecksTable items={numberChecks(legacyCheckGroups(x.kind,!!x.columnTies),r.checks).ordered}/><h3>ก่อนออกเอกสารใช้งานจริง</h3><ul className="blockers">{r.blockers.map(b=><li key={b}>{b}</li>)}</ul><button className="btn secondary" disabled={!uid||!x.confirmed||busy} onClick={async()=>{setBusy(true);try{await saveProject(p,'results',c.id);const v=await trustedCalculation(p.id,c.id,x);setMessage('คำนวณใหม่และบันทึก Snapshot ฝั่งเซิร์ฟเวอร์แล้ว: '+JSON.stringify(v).slice(0,140));}catch(e){setMessage((e as Error).message);}finally{setBusy(false);}}}>บันทึกผลคำนวณฝั่งเซิร์ฟเวอร์</button><button className="btn" onClick={()=>setTab('report')}>ดูรายงานร่าง</button></section></>}</>}
  {tab==='drawings'&&legacyElement&&!hasV07Output&&(r?<DrawingSet kitNote={kitNote} result={r} project={p.name} code={p.code} caseName={c.name} titleBlock={titleBlock} canEdit={canEditCurrentProject} onTitleBlockChange={setTitleBlock} revisionBinding={reportBinding}/>:<div className="warning">{analysis.error}</div>)}
 {tab==='drawings'&&legacyElement&&!hasV07Output&&<details className="card legacy-sketches"><summary>ภาพร่างเดิม (v0.3) และตารางระยะติดตั้ง</summary><div className="notice">ภาพร่างจากมิติจริง · แนวประกอบยังไม่ตรวจจุดต่อครบ · ห้ามใช้เป็นแบบติดตั้งที่อนุมัติ</div><div className="grid two"><section className="card"><Plan input={x} result={r} large/></section><section className="card"><Section x={x}/></section></div><section className="card"><h3>รายละเอียดองค์ประกอบแบบหล่อ</h3><AssemblyDetail x={x}/></section>{r&&<ColumnYokeDetails r={r}/>}<section className="card"><h3>ระยะติดตั้งตามด้าน</h3><table><thead><tr><th>ด้าน</th><th>ความยาว</th><th>จำนวนช่วงคร่าว</th><th>ระยะจริง</th><th>แรงดันรวม</th></tr></thead><tbody>{r?.faces.map(face=>{const ps=positions(face.length,x.studSpacing);return <tr key={face.id}><td>{face.id}</td><td>{f(face.length,0)} mm</td><td>{ps.length-1}</td><td>{f(face.length/(ps.length-1))} mm</td><td>{f(face.force)} kN</td></tr>;})}</tbody></table></section></details>}
  {tab==='report'&&legacyElement&&r&&<><div className="report-tools"><p>รายการคำนวณ A4 · ใช้รูปชุดเดียวกับแบบ A3 · กรอบชื่อ/Rev แก้ได้ที่เมนูแปลนและรูปตัด</p><ReportVariantSwitch value={reportVariant} onChange={setReportVariant}/>{reportVariant==='short'&&<ReportLangSwitch value={reportLang} onChange={setReportLang}/>}<button className="btn" onClick={()=>window.print()}><Download size={17}/>พิมพ์ / บันทึก PDF (A4)</button><button className="btn secondary" onClick={()=>{const b=new Blob([JSON.stringify({project:p.code,case:c.name,result:r},null,2)],{type:'application/json'}),u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download=c.id+'-screening.json';a.click();URL.revokeObjectURL(u);}}>Export JSON</button></div>{reportVariant==='short'?<LegacyShortReport kitNote={kitNote} lang={reportLang} r={r} project={p.name} code={p.code} caseName={c.name} caseId={c.id} titleBlock={titleBlock} revisionBinding={reportBinding}/>:<CalcReport kitNote={kitNote} r={r} project={p.name} code={p.code} caseName={c.name} caseId={c.id} titleBlock={titleBlock} revisionBinding={reportBinding}/>}</>}
  {/* The main calculation above always shows; the v0.7 snapshot follows as part 2 and prints on its own. */}
  {hasV07Output&&(tab==='results'||tab==='report')&&<div className="v07-part"><div className="notice v07-part-head">ส่วนที่ 2 · {tab==='report'?'รายงาน':'ผลตรวจ'}จาก Workflow v0.7 (ร่างติดตั้งละเอียด · DRAFT / NO_GO) · ส่วนที่ 1 ด้านบนคือรายการคำนวณหลักจากค่าในหน้ารูปทรง/เกณฑ์/จัดวาง</div><React.Suspense fallback={<p>กำลังโหลดผล Workflow v0.7…</p>}><WorkflowV07Output model={c.workflowV07!.model} review={c.review} mode={tab} project={p.name} code={p.code} caseName={c.name} titleBlock={titleBlock} canEdit={canEditCurrentProject} onTitleBlockChange={setTitleBlock}/></React.Suspense></div>}
  </>)}
  {tab==='overview'&&!legacyElement&&!practical&&!v07Enabled&&<section className="card workflow-menu-blocked"><h3>Workflow v0.7 · {ELEMENT_TYPES.find(type=>type.id===workflowElementType)?.label}</h3><p>เมนูนี้พร้อมใช้งานในโหมดร่าง แต่ Workflow v0.7 ถูกปิดไว้จนกว่าจะเปิด `VITE_WORKFLOW_V07_ENABLED=true` ในโหมดออฟไลน์หรือ emulator ตามข้อกำหนดของระบบ</p><p className="muted">ยังไม่มีการคำนวณกำลังสมาชิกจริงจากเมนูนี้ และสถานะยังเป็น NO_GO</p></section>}
  {tab!=='overview'&&tab!=='users'&&tab!=='connections'&&tab!=='audit'&&!legacyElement&&tab!=='upload'&&!(practical&&beamTabs.includes(tab))&&<section className="card workflow-menu-blocked"><h3>Workflow v0.7 · {ELEMENT_TYPES.find(type=>type.id===workflowElementType)?.label}</h3><p>เลือกเมนูภาพรวมเพื่อเปิดร่าง Workflow v0.7 ขององค์อาคารนี้ รายการคำนวณ legacy ไม่รองรับชนิดนี้</p></section>}
  {tab==='overview'&&v07OnProduction&&<div className="warning" role="alert"><AlertTriangle size={18}/><p>Workflow v0.7 เปิดบน Firebase production (VITE_WORKFLOW_V07_ALLOW_PRODUCTION=true) · ผลทั้งหมดเป็นร่าง DRAFT / NO_GO / NOT FOR CONSTRUCTION ห้ามใช้ก่อสร้าง</p></div>}
  {tab==='overview'&&v07Enabled&&practical&&!showV07&&<section className="card"><h3>โหมดละเอียด Workflow v0.7 (ขั้นสูง)</h3><p className="muted">แบบจำลองพิกัดจริง เฟรม 3D หลักฐานผลิตภัณฑ์ และขั้นตอนตรวจ/อนุมัติ · แยกจากการคำนวณข้างต้น</p><button className="btn secondary" onClick={()=>setShowV07(true)}>เปิดโหมดละเอียด</button></section>}
  {tab==='overview'&&v07Enabled&&(!practical||showV07)&&<RegistryProvider value={{registry,reviewerName}}><React.Suspense fallback={<p>กำลังโหลด Workflow v0.7…</p>}><WorkflowV07Panel key={p.id+':'+c.id+':'+workflowElementType} input={x} caseId={c.id} initialElementType={workflowElementType} stored={c.workflowV07??null} canPersist={canEditCurrentProject} onPersist={draft=>persistWorkflowDraft(p.id,c.id,draft)} review={c.review??null} reviewActor={reviewActor} onReviewChange={canEditCurrentProject?persistReview:undefined}/></React.Suspense></RegistryProvider>}
 <footer className="app-footer"><span>CMG ENGINEERING & CONSTRUCTION</span><span>v{APP_VERSION} · Engineering screening · แยกผลคัดกรองจากการอนุมัติ</span><button onClick={()=>{if(window.confirm('คืนค่าข้อมูลสาธิตในเบราว์เซอร์? ไม่ลบข้อมูล Firebase')){setProjects(initial);setProjectId(initial[0].id);setCaseId(initial[0].cases[0].id);}}}><RotateCcw size={12}/>Reset demo</button></footer>
 </main></div>;
}
class AppErrorBoundary extends React.Component<React.PropsWithChildren, {error:Error|null}>{
 state:{error:Error|null}={error:null};
 static getDerivedStateFromError(error:Error){return {error};}
 render(){
  if(this.state.error)return <main className="error-screen"><h1>เปิดหน้าจอแอปไม่สำเร็จ</h1><p>{this.state.error.message}</p><button className="btn" onClick={()=>window.location.reload()}>ลองใหม่</button></main>;
  return this.props.children;
 }
}
const rootElement=document.getElementById('root');
if(rootElement)createRoot(rootElement).render(<React.StrictMode><AppErrorBoundary><AuthProvider><AppRouter><App/></AppRouter></AuthProvider></AppErrorBoundary></React.StrictMode>);
