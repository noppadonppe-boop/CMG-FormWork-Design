import type {Input} from './index.js';
import type {BeamInput} from './beam.js';
import type {SlabInput} from './slab.js';
import type {WallInput} from './wall.js';
import {sectionById} from './sectionStock.js';
import {references} from '../workflowV07References.js';
import {selectReference} from './workflowV07/catalogues.js';
import {canonical, type ElementType} from './workflowV07/common.js';
import {fromLegacy, regenerateDraftLayouts, type WorkflowModel} from './workflowV07/model.js';
import {createStoredWorkflowDraft, type StoredWorkflowDraft} from './workflowV07/storage.js';
import {buildSoffitCandidate, type MemberStiffness} from './workflowV07/soffit.js';
import {pairFaces} from './workflowV07/geometry.js';
import {stampSideLayout, type SideLayoutDefinition} from './workflowV07/sideLayout.js';
import {frameGeometryFromAssembly, frameGeometryFromSide, emptyFrameElement, stampFrameLayout, type FrameLayoutDefinition} from './workflowV07/frameWorkflow.js';
import {emptyBearingInterface, stampSupportLayout} from './workflowV07/supportLayout.js';
import {captureRinglockAssembly, stampRinglockAssembly} from './workflowV07/ringlockAssembly.js';
import {nominalTubeProperties, selectRinglockResearch} from './workflowV07/ringlockResearch.js';
import {selectRinglockPlan} from './workflowV07/ringlockPlan.js';
import {emptyHeadBearing} from './workflowV07/headBearing.js';
import {CASE_ACTIONS} from './workflowV07/caseFactors.js';
import {stampLoadCases} from './workflowV07/loadCases.js';

/** A teaching dataset, not a product certificate. Geometry/arrangements are explicitly
 * synthetic; E, I and mass below come from the checked-in source tables. */
export const PROJECT_EXAMPLE_REVISION = 'PROJECT-EXAMPLE-INPUTS-2';
export const EXAMPLE_GEOMETRY = 'PROJECT-EXAMPLE / SYNTHETIC geometry · docs/PROJECT_EXAMPLE.md';
export const EXAMPLE_PENDING = 'ยังไม่มีหลักฐานสินค้าจริง/หน้างาน — ต้องระบุก่อนตรวจรับ';
const stageId = 'EX-POUR-01', loadCaseId = 'EX-SERVICE-01';
const scope = {stageId, loadCaseId};
const sectionSource = 'PAP-TIS107-2026 · src/domain/sectionStock.ts · Ix(cm4) × 10000; kg/m × 9.80665/1000';
const plywoodSource = 'UPM007CPR 2026-01-01 · PLY-UPM007-18 · Eb0_mean · gross 18 mm · reference only';
const basis = 'ACI PRC-347-14(21) §4.2.1 · SERVICE · SYNTHETIC teaching case, no wind/placement study';
const grid = (length: number, spacing: number) => {const n = Math.ceil(length / spacing); return Array.from({length: n + 1}, (_, i) => i * length / n);};
const row = (id: string) => {
  const r = references.materials.find(r => r.material_id === id);
  if (!r) throw Error(`Missing example reference ${id}`);
  return r;
};
const property = (r: Record<string, unknown>, key: string) => {
  const v = (r.properties as Record<string, unknown>)[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw Error(`Missing example property ${key}`);
  return v;
};
const steel = () => row('STEEL-STKR400');
function member(id: string): MemberStiffness {
  const s = sectionById(id); if (!s || s.kg_per_m === null) throw Error(`Missing example section ${id}`);
  return {E_MPa: property(steel(), 'E_MPa'), I_mm4: s.Ix_cm4 * 10000,
    selfWeightKNPerM: s.kg_per_m * 9.80665 / 1000, evidenceRef: `${id} · ${sectionSource}`};
}
const studId = 'PAP-TIS107-SHS-50x50x2.3', bearerId = 'PAP-TIS107-RHS-100x50x3.2';
export interface ExampleContext {beam?: BeamInput; slab?: SlabInput; wall?: WallInput}

function side(model: WorkflowModel): SideLayoutDefinition {
  const topology = pairFaces(model.vertices, model.heightMm);
  const tied = model.sideTopology === 'THROUGH_TIE';
  const definition: SideLayoutDefinition = {schemaVersion: '1', ...scope, evidenceRef: EXAMPLE_GEOMETRY,
    pourHeadMm: model.heightMm, baseElevationMm: model.soffitLayout ? model.soffitLayout.headNodeElevationMm! + 168 : 0,
    rebarClearanceEvidence: null, faces: [], ties: []};
  const plywood = row('PLY-UPM007-18');
  for (const face of topology.faces) {
    const vertical = face.a.x === face.b.x;
    const positions = tied ? topology.pairs.filter(p => p.faceAId === face.id || p.faceBId === face.id).flatMap(p =>
      [0.25, 0.75].map(f => ({pair: p.id, coordinate: p.startMm + (p.endMm - p.startMm) * f, fraction: f}))) : [];
    const supports = tied ? positions.map(p => ({id: `${p.pair}-${p.fraction}`, xMm: Math.abs(p.coordinate - (vertical ? face.a.y : face.a.x))})).sort((a,b) => a.xMm-b.xMm)
      : [{id: 'S1', xMm: face.lengthMm / 4}, {id: 'S2', xMm: 3 * face.lengthMm / 4}];
    const {selfWeightKNPerM: _j, ...stud} = member(studId), {selfWeightKNPerM: _r, ...rail} = member(bearerId);
    definition.faces.push({faceId: face.id, evidenceRef: EXAMPLE_GEOMETRY, studPositionsMm: grid(face.lengthMm, 300),
      walers: [0.15, 0.85].map((f,i) => ({id: `W${i+1}`, zMm: model.heightMm * f + (vertical && tied ? 20 : 0), supports})),
      stud, rail, plywood: {thicknessMm: 18, effectiveE_MPa: property(plywood, 'Eb0_mean_MPa'), grainAxis: 'ALONG_FACE', jointsAtEveryStud: true, evidenceRef: plywoodSource},
      heavierRailShare: 0.5, sharingEvidence: `${EXAMPLE_GEOMETRY} · assumed equal twin-rail sharing, contact unverified`});
  }
  if (tied) for (const p of topology.pairs) for (const walerId of ['W1','W2']) for (const fraction of [0.25,0.75]) {
    const supportId = `${p.id}-${fraction}`;
    definition.ties.push({id: `${p.id}-${walerId}-${fraction}`, a:{faceId:p.faceAId,walerId,supportId}, b:{faceId:p.faceBId,walerId,supportId},diameterMm:16,assembly:null});
  }
  return definition;
}

function soffit(model: WorkflowModel, context: ExampleContext): WorkflowModel {
  const x = Math.max(...model.vertices.map(p=>p.x)), y = Math.max(...model.vertices.map(p=>p.y));
  const b = context.beam;
  const left = b?.slabLeft ?? 0, right = b?.slabRight ?? 0;
  const start = -left, end = y + right;
  const height = (b?.soffitHeight ?? context.slab?.soffitHeight ?? 3000) - 168;
  const heads = grid(x, 2000), bearerYs = grid(end-start, 2000).map(v=>v+start);
  const ply = row('PLY-UPM007-18');
  model.soffitLayout = {schemaVersion:'1',...scope,ownershipId:`${model.id}-DECK`,evidenceRef:EXAMPLE_GEOMETRY,
    joistXMm:grid(x,300),joistStartYMm:start,joistEndYMm:end,bearerStartXMm:-75,bearerEndXMm:x+75,
    bearers:bearerYs.map((yMm,i)=>({id:`B${i+1}`,yMm,headsXMm:heads})),headNodeElevationMm:height,baseElevationMm:0,
    concreteStripStartYMm:start,deadStripStartYMm:start,liveStripStartYMm:start,joist:member(studId),bearer:member(bearerId),
    plywood:{schemaVersion:'1',thicknessMm:18,effectiveE_MPa:property(ply,'Eb0_mean_MPa'),grainAxis:'X',jointsAtEveryJoist:true,evidenceRef:plywoodSource,
      startYMm:start,endYMm:end,selfWeightKPa:property(ply,'density_mean_kg_m3')*0.018*9.80665/1000,selfWeightOwnership:'SEPARATE_ACTION',selfWeightEvidenceRef:`${plywoodSource} · density × thickness × g`}};
  model.ringlock = {...selectRinglockPlan(null),manufacturer:'CUSTOM — example geometry, supplier not selected',systemId:'EX-CUSTOM',configurationId:'EX-CUSTOM-GEOMETRY',ratingId:null,
    bayXMm:heads[1]-heads[0],bayYMm:bearerYs[1]-bearerYs[0],totalHeightMm:height,liftHeightsMm:[height-300],
    headExtensionMm:150,baseExtensionMm:150,headEngagementMm:100,baseEngagementMm:100,
    braceXRef:EXAMPLE_PENDING,braceYRef:EXAMPLE_PENDING,planRestraintRef:EXAMPLE_PENDING,topRestraintRef:EXAMPLE_PENDING,
    baseRestraintRef:EXAMPLE_PENDING,jointStiffnessRef:EXAMPLE_PENDING,groundOrSlabEvidence:EXAMPLE_PENDING};
  model.ringlockResearch = selectRinglockResearch(references.ringlockResearch,references.ringlockResearchSha256,
    {groupId:'TCB-FOOT-BASED-REFERENCE',role:'STANDARD',sectionId:'CHS-48.3x3.2',materialGrade:'Q235B',useElasticReference:true,
      hypothesisRef:'Nominal tube reference only. CUSTOM example grid and standard lengths are synthetic, not TCB stock or a compatible certified configuration.'});
  const candidate = buildSoffitCandidate(model,model.soffitLayout);
  return {...model,members:candidate.members,actions:candidate.actions,requiredChecks:candidate.requiredChecks,ringlock:candidate.ringlock};
}

function assembly(model: WorkflowModel) {
  const a = captureRinglockAssembly(model);
  a.evidenceRef=EXAMPLE_GEOMETRY;a.headDatum='U_HEAD_BEARING_SURFACE';a.headDatumEvidenceRef=EXAMPLE_GEOMETRY;
  for (const l of a.legs) {
    l.toleranceMm=1;l.soffitElevationMm=l.headBearingElevationMm+168;l.soleBoard={thicknessMm:0,evidenceRef:`${EXAMPLE_GEOMETRY} · direct support, no sole board`};
    l.upperStack={bearerDepthMm:100,joistDepthMm:50,plywoodThicknessMm:18,evidenceRef:sectionSource};
    for (const j of [l.baseJack,l.headJack]) Object.assign(j,{productRef:'CUSTOM-EXAMPLE-JACK',nominalLengthMm:250,installedHeightMm:150,extensionMm:150,engagementMm:100,
      geometryEvidenceRef:EXAMPLE_GEOMETRY,limitEvidenceRef:EXAMPLE_PENDING});
    l.standards=[{id:'STD1',productRef:'CUSTOM-EXAMPLE-TUBE',nominalLengthMm:l.headBearingElevationMm-300,installedRiseMm:l.headBearingElevationMm-300,datumEvidenceRef:EXAMPLE_GEOMETRY}];
    l.headBearing={...emptyHeadBearing(),productRef:'CUSTOM-EXAMPLE-JACK',geometryEvidenceRef:EXAMPLE_GEOMETRY,layout:'SINGLE_FLAT_BEARER',
      seatCenterMm:[l.xMm,l.yMm,l.headBearingElevationMm],seatLocalX:[1,0],plateLengthMm:150,plateWidthMm:150,plateThicknessMm:6,
      cavityOffsetYMm:0,insideClearWidthMm:100,minimumSideClearanceMm:5,bearerWidthMm:50,bearerDepthMm:100,bearerCenterOffsetYMm:0,bearerGeometryEvidenceRef:sectionSource,
      contactCenterMm:[l.xMm,l.yMm,l.headBearingElevationMm],contactLengthMm:150,contactWidthMm:50,sideBlocking:'NONE',sideBlockingEvidenceRef:`${EXAMPLE_GEOMETRY} · no lateral blocking credited`,
      pressureModel:'RIGID_HORIZONTAL_RECTANGLE_AFFINE_COMPRESSION_ONLY',pressureModelEvidenceRef:`${EXAMPLE_GEOMETRY} · conditional rigid contact; plate strength unverified`};
  }
  return stampRinglockAssembly(model,a);
}

/** Equivalent tube segments for the vertical load-path tutorial. Deliberately no
 * fictional ledger/joint stiffness, fixity certificate or Ringlock system rating. */
function frame(model: WorkflowModel): FrameLayoutDefinition {
  const f:FrameLayoutDefinition={...frameGeometryFromAssembly(model),actionBasis:'SERVICE',acknowledgeLinearScope:true,
    assumptionEvidenceRef:`${EXAMPLE_GEOMETRY} · equivalent gross-tube segments, rigid continuity and fixed bases are tutorial assumptions; jack shaft/net thread, bracing and joints require actual data`,excludeSoffitReason:''};
  const research=model.ringlockResearch!, tube=nominalTubeProperties(Number(research.section!.D_mm),Number(research.section!.t_mm));
  f.nodes=f.nodes.map(n=>({...n,boundary:Array.from({length:6},()=>({kind:n.role==='BASE'?'FIXED':'FREE'})),evidenceRef:EXAMPLE_GEOMETRY}));
  f.elements=f.elements.map(e=>({...e,E_MPa:Number(research.elastic!.E_MPa),G_MPa:Number(research.elastic!.G_MPa),
      A_mm2:tube.A_mm2,Iy_mm4:tube.I_mm4,Iz_mm4:tube.I_mm4,J_mm4:tube.J_mm4,localX:[0,0,1],localY:[1,0,0],
      evidenceRef:'TCB CHS-48.3x3.2 nominal tube + SCI elastic reference; SYNTHETIC equivalent segments including jack surrogate, not product properties or resistance'}));
  f.headMappings=f.headMappings.map(h=>({...h,offsetEvidenceRef:EXAMPLE_GEOMETRY}));
  return f;
}

function sideFrame(model: WorkflowModel): FrameLayoutDefinition {
  const f=frameGeometryFromSide(model), topology=pairFaces(model.vertices,model.heightMm), material=steel();
  // Gross SHS geometry from PAP; closed thin-wall torsion is an explicit elastic
  // idealization, not a local-strength or joint-capacity check.
  const s=sectionById(studId)!, area=s.A_cm2*100, inertia=s.Ix_cm4*10000;
  const median=s.B-s.t, torsion=median**3*s.t;
  f.actionBasis='SERVICE';f.acknowledgeLinearScope=true;
  f.assumptionEvidenceRef=`${EXAMPLE_GEOMETRY} · SHS external frame, rigid joints; J = (B-t)^3 t, thin-wall closed tube. Connection strength unverified`;
  f.excludeSoffitReason='N/A — side-only concrete formwork';
  f.sideTransfers!.mode='DOWNSTREAM_SIDE_SUPPORTS_ONLY';f.sideTransfers!.separationEvidenceRef='Independent side support forces; downstream frame excludes plywood, studs and walers';
  f.sideTransfers!.mappings=f.sideTransfers!.mappings.map(m=>({...m,connectionEvidenceRef:EXAMPLE_GEOMETRY,offsetEvidenceRef:EXAMPLE_GEOMETRY}));
  f.nodes=f.nodes.map(n=>({...n,boundary:Array.from({length:6},()=>({kind:'FREE'})),evidenceRef:EXAMPLE_GEOMETRY}));
  const addMember=(nodeI:string,nodeJ:string)=>{
    const a=f.nodes.find(n=>n.id===nodeI)!.pointMm as number[],b=f.nodes.find(n=>n.id===nodeJ)!.pointMm as number[];
    const d=b.map((v,i)=>v-a[i]),L=Math.hypot(...d);
    f.elements.push({...emptyFrameElement(`EX-FRAME-${f.elements.length+1}`),nodeI,nodeJ,role:'OTHER',kind:'BEAM_COLUMN',
      E_MPa:property(material,'E_MPa'),G_MPa:property(material,'G_MPa'),A_mm2:area,Iy_mm4:inertia,Iz_mm4:inertia,J_mm4:torsion,
      localX:d.map(v=>v/L) as [number,number,number],localY:Math.abs(d[2]/L)>.99?[1,0,0]:[0,0,1],evidenceRef:`${studId} · ${sectionSource} · J closed thin-wall approximation`});
  };
  if(model.sideTopology==='COLUMN_YOKE'){
    // Separate closed external rings at each waler level. One reference point per
    // ring removes rigid-body motion only; it is not an actual foundation anchor.
    for(const w of model.sideLayout!.faces[0].walers){
      for(let i=0;i<topology.vertices.length;i++)f.nodes.push({id:`${w.id}-CORNER-${i}`,role:'OTHER',pointMm:[topology.vertices[i].x,topology.vertices[i].y,w.zMm],
        boundary:Array.from({length:6},()=>({kind:i===0?'FIXED':'FREE'})),evidenceRef:`${EXAMPLE_GEOMETRY} · yoke free-body reference constraint, no ground anchorage`});
      topology.faces.forEach((face,i)=>{
        const mappings=f.sideTransfers!.mappings.filter(m=>m.faceId===face.id&&m.walerId===w.id);
        const ids=[`${w.id}-CORNER-${i}`,...mappings.map(m=>m.frameNodeId),`${w.id}-CORNER-${(i+1)%topology.vertices.length}`];
        for(let j=1;j<ids.length;j++)addMember(ids[j-1],ids[j]);
      });
    }
  }else{
    for(const n of [...f.nodes]){
      const map=f.sideTransfers!.mappings.find(m=>m.frameNodeId===n.id)!,normal=topology.faces.find(face=>face.id===map.faceId)!.normal;
      const baseId=n.id+'-BASE',z=n.pointMm[2]!;
      f.nodes.push({id:baseId,role:'BASE',pointMm:[n.pointMm[0]!+normal.x*z,n.pointMm[1]!+normal.y*z,0],
        boundary:Array.from({length:6},()=>({kind:'FIXED'})),evidenceRef:`${EXAMPLE_GEOMETRY} · 45 degree brace, ideal fixed base; anchor evidence pending`});
      addMember(baseId,n.id);
    }
  }
  return f;
}

export function projectExampleWorkflowDraft(input:Input,elementType:ElementType,caseId:string,context:ExampleContext={}):StoredWorkflowDraft {
  const base=fromLegacy(input,caseId), vertical=elementType==='BEAM'||elementType==='SLAB';
  const s=references.sections.find(r=>r.section_id==='PAP-2026-CLIP-100x50x20x3.2')!;
  let m:WorkflowModel={...base,revisionId:PROJECT_EXAMPLE_REVISION,elementType,humanInputReviewed:false,sourceRef:EXAMPLE_GEOMETRY,designBasisRef:basis,
    sideTopology:elementType==='SLAB'?null:elementType==='COLUMN'?'COLUMN_YOKE':context.wall?.system==='SINGLE_SIDED'?'GROUND_BRACED':'THROUGH_TIE',
    slabThicknessMm:elementType==='SLAB'?input.height:elementType==='BEAM'?(context.beam?.slabT??0):null,
    beamWidthMm:elementType==='BEAM'?input.length:null,
    concreteStripMm:elementType==='BEAM'?input.length+(context.beam?.slabLeft??0)+(context.beam?.slabRight??0):null,
    deadStripMm:null,liveStripMm:null,additionalDeadKPa:vertical?(context.beam?.formDead??context.slab?.formDead??0.5):null,
    constructionLiveKPa:vertical?(context.beam?.liveLoad??context.slab?.liveLoad??2.4):null,
    selections:{section:selectReference(s,'PAP-2026'),material:selectReference(row('STEEL-SSCS400'),'materials@0.5.0'),ringlock:null},
    checkCatalogue:{version:'0.7',specifications:references.checks.map(r=>({id:String(r.check_id),group:String(r.group),description:String(r.description),appliesTo:String(r.applicable_to)}))}};
  if(elementType==='BEAM')m.deadStripMm=m.liveStripMm=m.concreteStripMm;
  if(vertical)m=soffit(m,context);
  if(elementType!=='SLAB')m.sideLayout=stampSideLayout(m,side(m));
  if(vertical){m.ringlockAssembly=assembly(m);m.frameLayout=stampFrameLayout(m,frame(m));}
  else if(m.sideTopology==='COLUMN_YOKE'||m.sideTopology==='GROUND_BRACED')m.frameLayout=stampFrameLayout(m,sideFrame(m));
  if(m.frameLayout?.nodes.some(n=>n.role==='BASE')){
    m.supportLayout=stampSupportLayout(m,{schemaVersion:'1',...scope,evidenceRef:EXAMPLE_GEOMETRY,bases:m.frameLayout.nodes.filter(n=>n.role==='BASE').map((n,i)=>({
      id:`SUP${i+1}`,frameNodeId:n.id,datum:'FRAME_BASE_IS_JACK_FOOTPLATE_CONTACT',datumEvidenceRef:EXAMPLE_GEOMETRY,path:'DIRECT',soleBoardThicknessMm:0,
      supportKind:'EXISTING_SLAB',supportEvidenceRef:EXAMPLE_PENDING,interfaces:[{...emptyBearingInterface(`CONTACT${i+1}`),role:'JACK_TO_SUPPORT',centerMm:n.pointMm,localX:[1,0],localY:[0,1],lengthXMm:150,widthYMm:150,
        geometryEvidenceRef:EXAMPLE_GEOMETRY,model:'RIGID_HORIZONTAL_RECTANGLE_AFFINE_COMPRESSION_ONLY',modelEvidenceRef:EXAMPLE_GEOMETRY,limitEvidenceRef:EXAMPLE_PENDING,soilSpringEvidenceRef:'N/A — existing slab example; no soil spring model',
        weight:{mode:'ADD_SELF_WEIGHT',ownershipId:`${n.id}-CONTACT`,rawForceN:0,pointMm:n.pointMm,evidenceRef:'SYNTHETIC zero-thickness contact interface; no separate plate weight modeled'}}]}))});
  }
  m.loadCases=stampLoadCases(m,{schemaVersion:'1',cases:[{id:'EX-SERVICE',stageId,loadCaseId:'EX-SERVICE-CHECK',basis:'SERVICE',basisEvidenceRef:basis,
    sharedLayoutEvidenceRef:`${EXAMPLE_GEOMETRY} · same active pour layout and loads; explicit-factor walkthrough`,
    factors:Object.fromEntries(CASE_ACTIONS.map(k=>[k,['WIND','PLACEMENT','OTHER','IMPOSED_MOVEMENT'].includes(k)?0:1])) as NonNullable<WorkflowModel['analysisCase']>['factors']}]});
  return createStoredWorkflowDraft(m,input,Date.parse('2026-10-19T12:00:00+07:00'));
}

/** Replace only the known untouched, layout-free v1 seed. Authored drafts are never
 * replaced merely because their project happens to have the same display name. */
export function isOldExampleSeed(d:StoredWorkflowDraft):boolean {
  const m=d.model;
  return m.revisionId==='PROJECT-EXAMPLE-v0.7'&&m.sourceRef?.startsWith('PROJECT-EXAMPLE · PAP-TIS107')===true&&
    !m.humanInputReviewed&&!m.soffitLayout&&!m.sideLayout&&!m.frameLayout&&!m.supportLayout&&!m.members.length&&!m.actions.length;
}
export function upgradeProjectExampleCase<T extends {id:string;name:string;input:Input;workflowElementType?:ElementType;workflowV07?:StoredWorkflowDraft}&ExampleContext>(c:T):T {
  if(!/^Project Example · (F0[12]|C0[12]|W0[12]|B0[12]|S0[12]) · /.test(c.name))return c;
  const previous=c.workflowV07?.model;
  if(previous&&(previous.soffitLayout||previous.sideLayout||previous.frameLayout||previous.supportLayout||previous.ringlockAssembly))return c;
  const workflowV07=projectExampleWorkflowDraft(c.input,c.workflowElementType??c.input.kind,c.id,c);
  if(c.workflowV07&&!isOldExampleSeed(c.workflowV07)){
    const old=c.workflowV07.model,fresh=workflowV07.model;
    // Do not graft geometry from a different footprint, stage or authored system.
    if(old.elementType!==fresh.elementType||canonical(old.vertices)!==canonical(fresh.vertices)||old.heightMm!==fresh.heightMm)return c;
    const layouts=['soffitLayout','sideLayout','ringlockAssembly','frameLayout','supportLayout','loadCases'] as const;
    const missing=layouts.filter(k=>fresh[k]&&!old[k]);
    if(!missing.length)return c;
    const authored=layouts.some(k=>k!=='loadCases'&&old[k]);
    // Partly authored layouts may have different support IDs. Preserve those;
    // completing their downstream graph requires the explicit editor workflow.
    if(authored)return c;
    const merged={...fresh,...old,revisionId:globalThis.crypto.randomUUID(),humanInputReviewed:false,
      representatives:[],coverage:[],coverageReview:null};
    // Preserve entered scalar inputs, including explicit zero. Only empty slots
    // receive tutorial values; computed members/actions are rebuilt afterwards.
    for(const k of ['sourceRef','designBasisRef','sideTopology','gammaKNm3','slabThicknessMm','beamWidthMm','concreteStripMm','deadStripMm','liveStripMm','additionalDeadKPa','constructionLiveKPa','checkCatalogue','ringlock','ringlockResearch'] as const)
      if(old[k]==null||old[k]==='')Object.assign(merged,{[k]:fresh[k]});
    merged.selections={section:old.selections.section??fresh.selections.section,material:old.selections.material??fresh.selections.material,ringlock:old.selections.ringlock??fresh.selections.ringlock};
    for(const k of missing)Object.assign(merged,{[k]:fresh[k]});
    let updated=regenerateDraftLayouts(merged,{}, {allowIncomplete:true});
    if(updated.loadCases)updated={...updated,loadCases:stampLoadCases(updated,updated.loadCases)};
    return {...c,workflowV07:createStoredWorkflowDraft(updated,c.input),review:undefined};
  }
  return canonical(c.workflowV07??null)===canonical(workflowV07)?c:{...c,workflowV07};
}
