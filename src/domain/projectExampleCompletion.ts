import type {WorkflowModel} from './workflowV07/model.js';
import {pairFaces} from './workflowV07/geometry.js';
import {bindTieDossier, emptyTieDossier, tieGeometryContext, type TieThreadInterface} from './workflowV07/tieDossier.js';
import {emptyBeamMemberEvidence, beamMemberEvidenceReference, type BeamMemberEvidence} from './workflowV07/beamResistance.js';
import {sidePlywoodEvidenceReference} from './workflowV07/sideLayout.js';
import {emptySideLocalEvidence, SIDE_LOCAL_CHECK_KINDS, sideLocalMemberReference} from './workflowV07/sideLocalChecks.js';
import {emptyResistanceEvidence, RESISTANCE_QUANTITIES} from './workflowV07/resistanceEvidence.js';
import {emptySlsLimitEvidence, SLS_QUANTITIES} from './workflowV07/frameSls.js';
import {sectionById} from './sectionStock.js';
import type {Input} from './index.js';
import type {BeamInput} from './beam.js';
import type {SlabInput} from './slab.js';
import type {WallInput} from './wall.js';
import {emptySecondOrderDefinition} from './workflowV07/frameSecondOrder.js';
import type {TitleBlock} from './titleBlock.js';

/** Owner-requested, fully populated TRAINING data. Assumed capacities are deliberately
 * identified as assumptions in every record, never attributed to a real manufacturer.
 * Review flags and engineering release gates are not changed by this fixture. */
export const EXAMPLE_DATA_VERSION = 'PROJECT-EXAMPLE-INPUTS-3';
export const EXAMPLE_BASIS = 'EX-DB-01 (MOCK)';
export const EXAMPLE_REVIEW = 'EX-REVIEW (UNSIGNED)';
export const EXAMPLE_SHORE_KN = 30;
export const EXAMPLE_TIE_KN = 30;
export const EXAMPLE_BRACE_KN = 20;
export const EXAMPLE_ANCHOR_KN = 20;
const props = (id: string) => {const s=sectionById(id);if(!s)throw Error(`Missing example section ${id}`);return s;};
const stud=()=>props('PAP-TIS107-SHS-50x50x2.3');
const rail=()=>props('PAP-TIS107-RHS-100x50x3.2');
const source = {methodId:'EXAMPLE-ALLOWABLE-01',sourceRef:EXAMPLE_BASIS,sourceRevision:EXAMPLE_DATA_VERSION,
  evidenceRef:EXAMPLE_BASIS,reviewRef:EXAMPLE_REVIEW,status:'REFERENCE_ONLY' as const};

export function completeExamplePractical<T extends {input:Input;beam?:BeamInput;slab?:SlabInput;wall?:WallInput;titleBlock?:TitleBlock}>(c:T):T {
  const ref=(old:string,fresh:string)=>!old||old.includes('MOCK-UP only')||old.includes('ยังไม่ระบุ')?fresh:old;
  const input={...c.input,tieNetArea:c.input.tieNetArea||157,tieAssemblySWL:c.input.tieAssemblySWL||EXAMPLE_TIE_KN,
    cornerCapacityX:c.input.cornerCapacityX||30,cornerCapacityY:c.input.cornerCapacityY||30,
    cornerRule:c.input.cornerRule==='UNKNOWN'?'LINEAR' as const:c.input.cornerRule,
    cornerReference:ref(c.input.cornerReference,`${EXAMPLE_BASIS}; assumed corner Cx=Cy=30kN; form_tie_machine_bridge anatomy only`)};
  const old=c.titleBlock;
  const titleBlock:TitleBlock={rev:old?.rev||'EX3',date:old?.date||'19/10/2569',designedBy:old?.designedBy||'EXAMPLE DESIGNER (สมมติ)',drawnBy:old?.drawnBy||'EXAMPLE DRAFTER (สมมติ)',
    checkedBy:old?.checkedBy||'EXAMPLE CHECKER (ยังไม่ลงนาม)',approvedBy:old?.approvedBy||'EXAMPLE APPROVER (ยังไม่ลงนาม)',
    revisions:old?.revisions.length?old.revisions:[{rev:'EX3',date:'19/10/2569',description:'ตัวอย่างกรอกข้อมูลครบ EX-DB-01 (MOCK)'}]};
  return {...c,input,titleBlock,
    ...(c.beam?{beam:{...c.beam,shoreSWL:c.beam.shoreSWL||EXAMPLE_SHORE_KN,tieSWL:c.beam.tieSWL||EXAMPLE_TIE_KN,shoreReference:ref(c.beam.shoreReference,`${EXAMPLE_BASIS}; assumed custom shore30kN; not vendor rating`),
      restraintReference:ref(c.beam.restraintReference,`${EXAMPLE_BASIS}; kicker/top restraint/bracing capacities not designed (0 = INCOMPLETE)`)}}:{}),
    ...(c.slab?{slab:{...c.slab,shoreSWL:c.slab.shoreSWL||EXAMPLE_SHORE_KN,shoreReference:ref(c.slab.shoreReference,`${EXAMPLE_BASIS}; assumed custom shore30kN; not vendor rating`)}}:{}),
    ...(c.wall?{wall:{...c.wall,tieSWL:c.wall.tieSWL||EXAMPLE_TIE_KN,braceSWL:c.wall.braceSWL||EXAMPLE_BRACE_KN,anchorSWL:c.wall.anchorSWL||EXAMPLE_ANCHOR_KN,
      braceReference:ref(c.wall.braceReference,`${EXAMPLE_BASIS}; assumed brace20kN and anchor20kN`)}}:{})};
}

function beamLimits(ref:string,span:number,kind:'STUD'|'RAIL'|'PLYWOOD'):BeamMemberEvidence[]{
  const s=kind==='STUD'?stud():rail();
  // Classroom elastic section checks: Fy=245 MPa / 1.67, gross Z; web shear
  // area = 2t(H-2t). Plywood Fb=8 MPa, rolling shear=0.6 MPa are explicit
  // example service-condition assumptions, not the UPM characteristic table.
  const bending=kind==='PLYWOOD'?8*1000*18**2/6:245/1.67*s.Ix_cm4*10000/(s.H/2);
  const shear=kind==='PLYWOOD'?0.6*1000*18/1.5:0.6*245/1.67*2*s.t*(s.H-2*s.t);
  return (['FLEXURE','SHEAR','DEFLECTION'] as const).map(quantity=>({...emptyBeamMemberEvidence(quantity,ref),...source,
    actionBasis:'SERVICE',limitBasis:quantity==='DEFLECTION'?'SLS_LIMIT':'ALLOWABLE',
    limit:quantity==='FLEXURE'?bending:quantity==='SHEAR'?shear:Math.min(span/360,3),maximumUnsupportedSpanMm:span,
    scopeEvidenceRef:`${EXAMPLE_BASIS}; ${kind}; L <= ${span} mm; gross elastic, deflection min(L/360,3 mm)`,
    methodId:kind==='PLYWOOD'?'EX-PLY-Fb8-Fv0.6':'EX-STEEL-Fy245-Omega1.67'}));
}

function completeSide(m:WorkflowModel){
  const d=m.sideLayout;if(!d)return;
  if(d.ties.length&&m.sideTopology==='THROUGH_TIE')m.sideTopology='SEGMENTED_TIE';
  d.rebarClearanceEvidence ||= `${EXAMPLE_BASIS}; assumed tie corridor clear 25 mm from reinforcement; rods on drawn coordinates`;
  for(const f of d.faces){
    const length=pairFaces(m.vertices,m.heightMm).faces.find(p=>p.id===f.faceId)!.lengthMm;
    f.stud.resistanceEvidence ||= beamLimits(beamMemberEvidenceReference('SIDE_STUD',f.stud),m.heightMm,'STUD');
    f.rail.resistanceEvidence ||= beamLimits(beamMemberEvidenceReference('SIDE_SHARED_RAIL',f.rail),length,'RAIL');
    const span=Math.max(...f.studPositionsMm.slice(1).map((x,i)=>x-f.studPositionsMm[i]));
    f.plywood.resistanceEvidence ||= beamLimits(sidePlywoodEvidenceReference(f.plywood),span,'PLYWOOD');
    f.localEvidence ||= SIDE_LOCAL_CHECK_KINDS.map(kind=>({...emptySideLocalEvidence(kind,sideLocalMemberReference(f)),...source,
      actionBasis:'SERVICE',limitBasis:kind==='CORNER_OPENING'?'SLS_LIMIT':'ALLOWABLE',
      limit:kind==='CORNER_OPENING'?2:kind==='STUD_BUCKLING'?beamLimits('',m.heightMm,'STUD')[0].limit!:kind==='RAIL_BUCKLING'?beamLimits('',length,'RAIL')[0].limit!:30000,
      maximumUnbracedLengthMm:Math.max(length,m.heightMm),scopeEvidenceRef:`${EXAMPLE_BASIS}; ${f.faceId}; local force 30 kN / opening 2 mm; classroom limits`}));
  }
  const topology=pairFaces(m.vertices,m.heightMm);
  for(const t of d.ties){
    if(t.dossier||t.assembly)continue;
    const c=tieGeometryContext(topology,d,t), a=emptyTieDossier();
    a.compatibilityEvidenceRef=EXAMPLE_BASIS;a.geometryEvidenceRef=EXAMPLE_BASIS;
    a.rodScope='DECLARED_NONOVERLAPPING_BODY_GAUGES';a.threadScope='DECLARED_LOADED_THREAD_INTERFACES';
    a.legacySourceDefinition='N/A — purpose-built mock assembly';
    for(const component of a.components){
      const role=component.role,rod=['INNER','OUTER_LEFT','OUTER_RIGHT'].includes(role),inner=role==='INNER';
      // Distinct properties are supplied for the illustrative rod, plate and
      // connector. Non-rod area/length entries describe their idealized solid.
      const plate=role.startsWith('PLATE'),local=role.startsWith('WALER_LOCAL');
      const length=inner?c.chordMm:rod?250:plate?10:local?100:40;
      component.reference={productId:`EX-M16-${role}`,manufacturer:'MOCK workshop',model:`EX-${role}`,lotRef:'EX-LOT-001',
        threadMark:plate||local?'N/A — unthreaded':'M16x2 RH',materialRef:rod?'EX steel Fy390 MPa':'EX steel Fy245 MPa',
        sourceVersion:EXAMPLE_DATA_VERSION,sourceRef:EXAMPLE_BASIS,capacityBasis:'ALLOWABLE',capacityScopeRef:'MOCK declared 30 kN component limit; not manufacturer SWL',
        lengthDatumRef:`EX body length ${length} mm; order includes thread allowance`,
        properties:{capacityKN:EXAMPLE_TIE_KN,tensileEffectiveAreaMm2:rod?157:plate?22500:400,stiffnessAreaMm2:rod?Math.PI*16**2/4:plate?22500:400,
          E_MPa:200000,steelLengthMm:length,orderLengthMm:length+(rod?80:0),outerExposedLengthMm:rod&&!inner?150:0,coneRecessMm:inner?15:0}};
    }
    a.rodGauges=[{id:'INNER',role:'INNER',startMm:0,endMm:c.chordMm,evidenceRef:EXAMPLE_BASIS},
      {id:'LEFT',role:'OUTER_LEFT',startMm:-250,endMm:0,evidenceRef:EXAMPLE_BASIS},
      {id:'RIGHT',role:'OUTER_RIGHT',startMm:c.chordMm,endMm:c.chordMm+250,evidenceRef:EXAMPLE_BASIS}];
    const thread={standard:'ISO metric profile — mock mating pair',designation:'M16x2',nominalDiameterMm:16,leadSystem:'MM_PITCH' as const,lead:2,hand:'RIGHT' as const,fitClass:'EX matched pair'};
    a.threads=(['LEFT','RIGHT'] as const).flatMap(side=>[
      {id:`${side}-INNER`,side,maleRole:'INNER',femaleRole:`END_${side}`},
      {id:`${side}-OUTER`,side,maleRole:`OUTER_${side}`,femaleRole:`END_${side}`},
      {id:`${side}-NUT`,side,maleRole:`OUTER_${side}`,femaleRole:`NUT_${side}`},
    ].map(j=>({...j,male:{...thread},female:{...thread},actualEngagementMm:40,requiredEngagementMm:32,
      measurementEvidenceRef:EXAMPLE_BASIS,requirementEvidenceRef:'MOCK assumption 2d = 32 mm; not a thread stripping calculation',compatibilityEvidenceRef:EXAMPLE_BASIS} as TieThreadInterface)));
    t.dossier=bindTieDossier(a,c);
  }
}

function completeFrame(m:WorkflowModel){
  const f=m.frameLayout;if(!f)return;
  f.excludeSoffitReason ||= 'N/A — soffit reactions included';
  for(const e of f.elements){
    if(e.resistance?.length)continue;
    const a=f.nodes.find(n=>n.id===e.nodeI)!,b=f.nodes.find(n=>n.id===e.nodeJ)!;
    const L=Math.hypot(...a.pointMm.map((v,i)=>v!-b.pointMm[i]!)),Fy=235,omega=1.67;
    const area=e.A_mm2!,I=Math.min(e.Iy_mm4!,e.Iz_mm4!),radius=Math.sqrt(2*I/area);
    const squash=Fy*area/omega,compression=Math.min(squash,Math.PI**2*e.E_MPa!*I/L**2/omega);
    e.resistance=RESISTANCE_QUANTITIES.map(quantity=>({...emptyResistanceEvidence(quantity),...source,
      actionBasis:'SERVICE',resistanceBasis:'ALLOWABLE',
      capacity:quantity==='AXIAL_COMPRESSION'?compression:quantity==='AXIAL_TENSION'?squash:quantity.startsWith('SHEAR')?squash*.3:
        quantity==='TORSION'?0.6*Fy*e.J_mm4!/radius/omega:Fy*(quantity==='MOMENT_Y'?e.Iy_mm4!:e.Iz_mm4!)/radius/omega,
      methodId:'EX-TUBE-01',sourceRevision:m.revisionId}));
  }
  for(const n of f.nodes)if(n.role==='BASE'&&!n.anchorResistance?.length)n.anchorResistance=(['AXIAL_TENSION','SHEAR_Y'] as const).map(quantity=>({
    ...emptyResistanceEvidence(quantity),...source,capacity:EXAMPLE_ANCHOR_KN*1000,actionBasis:'SERVICE',resistanceBasis:'ALLOWABLE',
    methodId:'EX-ANCHOR-20KN',sourceRevision:m.revisionId}));
  f.sls ||= f.nodes.flatMap(n=>SLS_QUANTITIES.map(quantity=>({...emptySlsLimitEvidence(n.id,quantity),...source,
    actionBasis:'SERVICE',limit:quantity.startsWith('ROTATION')?.005:quantity==='TRANSLATION_Z'?3:Math.max(m.heightMm/500,3),
    sourceRevision:m.revisionId,methodId:'EX-SLS-01'})));
  f.secondOrder ||= {...emptySecondOrderDefinition(),evidenceRef:'EX-PDELTA (MOCK): sway z/500, base restrained',
    imperfections:f.nodes.map(n=>({nodeId:n.id,offsetMm:[m.soffitLayout&&n.role!=='BASE'?n.pointMm[2]!/500:0,0,0],evidenceRef:EXAMPLE_BASIS}))};
  if(!f.additionalActions.length)f.additionalActions=f.nodes.map(n=>{
    const weight=f.elements.filter(e=>e.nodeI===n.id||e.nodeJ===n.id).reduce((sum,e)=>{
      const a=f.nodes.find(p=>p.id===e.nodeI)!,b=f.nodes.find(p=>p.id===e.nodeJ)!;
      return sum+e.A_mm2!*Math.hypot(...a.pointMm.map((v,i)=>v!-b.pointMm[i]!))*7.85e-6*9.80665/2;
    },0);
    return {id:`SW:${n.id}`,nodeId:n.id,kind:'SELF_WEIGHT',ownershipId:`EX-FRAME-SW:${n.id}`,evidenceRef:'EX gross steel volume x7850kg/m3 xg, half to each end',forceN:[0,0,-weight],momentNmm:[0,0,0],atNode:true,offsetMm:[0,0,0],offsetEvidenceRef:'N/A — applied at node'};
  });
}

export function completeProjectExampleInputs(m:WorkflowModel):WorkflowModel{
  completeSide(m);
  const d=m.soffitLayout;
  if(d){
    if(d.evidenceRef==='PROJECT-EXAMPLE / SYNTHETIC geometry · docs/PROJECT_EXAMPLE.md')d.evidenceRef='SYNTHETIC EX-GEOMETRY-01';
    const joistSpan=Math.max(...d.bearers.slice(1).map((b,i)=>b.yMm-d.bearers[i].yMm));
    const bearerSpan=Math.max(...d.bearers.flatMap(b=>b.headsXMm.slice(1).map((x,i)=>x-b.headsXMm[i])));
    const ref=(role:string,v:typeof d.joist)=>beamMemberEvidenceReference(role,{E_MPa:v.E_MPa,I_mm4:v.I_mm4,evidenceRef:v.evidenceRef,binding:v.binding??null});
    d.joist.resistanceEvidence ||= beamLimits(ref('JOIST',d.joist),joistSpan,'STUD');
    d.bearer.resistanceEvidence ||= beamLimits(ref('BEARER',d.bearer),bearerSpan,'RAIL');
  }
  if(m.ringlock){
    const r=m.ringlock;r.ratingId ||= 'EX-CUSTOM-30KN';
    for(const key of ['braceXRef','braceYRef','planRestraintRef','topRestraintRef','baseRestraintRef','jointStiffnessRef','groundOrSlabEvidence'] as const)
      if(!r[key]||r[key]!.includes('ยังไม่มี'))r[key]=`${EXAMPLE_BASIS}; ${key}: EX ideal restraint / existing RC slab 200 mm, fc28=24 MPa, age28d`;
    m.ringlockRating ||= {schema_version:'0.7.0',rating_id:r.ratingId,system_id:r.systemId,manufacturer:r.manufacturer,configuration_id:r.configurationId,
      rating_type:'MOCK_ASSUMED_CONFIGURATION',design_code_id:'EXAMPLE-DESIGN-BASIS',code_edition:'EX-2026',demand_basis:'SERVICE',resistance_basis:'ALLOWABLE',
      dimensions:{bay_x_mm:r.bayXMm,bay_y_mm:r.bayYMm,total_height_mm:r.totalHeightMm,lift_heights_mm:r.liftHeightsMm,head_extension_mm:r.headExtensionMm,base_extension_mm:r.baseExtensionMm,top_unrestrained_mm:150,base_unrestrained_mm:150},
      restraint:{brace_layout_id:'EX-X-Y',brace_layout_x_id:r.braceXRef,brace_layout_y_id:r.braceYRef,horizontal_plan_restraint_id:r.planRestraintRef,
        top_restraint_id:r.topRestraintRef,base_restraint_id:r.baseRestraintRef,joint_stiffness_model_id:r.jointStiffnessRef,eccentricity_limits_mm:5,wind_limit_kPa:.5},
      resistance:{leg_kN:EXAMPLE_SHORE_KN,u_head_kN:EXAMPLE_SHORE_KN,base_jack_kN:EXAMPLE_SHORE_KN,diagonal_tension_kN:EXAMPLE_BRACE_KN,diagonal_compression_kN:EXAMPLE_BRACE_KN,node_interaction_rule_id:'EX-N/30+M/0.5<=1'},
      scope:{includes_self_weight:true,includes_assembly_imperfections:false,second_order_considered:false,allow_interpolation:false,allow_extrapolation:false},
      evidence_ref:EXAMPLE_BASIS,thai_compliance_mapping_ref:'EXAMPLE training basis; no legal conformity claim',status:'MOCK_REFERENCE_ONLY',construction_release:'NO_GO'};
  }
  if(m.ringlockAssembly)for(const l of m.ringlockAssembly.legs){
    for(const j of [l.baseJack,l.headJack]){j.maxExtensionMm??=150;j.minEngagementMm??=100;
      if(!j.limitEvidenceRef||j.limitEvidenceRef.includes('ยังไม่มี'))j.limitEvidenceRef=`${EXAMPLE_BASIS}; max extension ${j.maxExtensionMm} / min engagement ${j.minEngagementMm} mm`;}
    if(l.headBearing&&(!l.headBearing.sideBlockingEvidenceRef||l.headBearing.sideBlockingEvidenceRef.includes('no lateral blocking credited'))){
      l.headBearing.sideBlocking='BOTH_SIDES';l.headBearing.sideBlockingEvidenceRef=`${EXAMPLE_BASIS}; two mock steel packers, 25 mm each side of 50 mm bearer in 100 mm opening`;}
  }
  completeFrame(m);
  if(m.supportLayout)for(const b of m.supportLayout.bases){
    if(!b.supportEvidenceRef||b.supportEvidenceRef.includes('ยังไม่มี'))b.supportEvidenceRef=`${EXAMPLE_BASIS}; existing RC slab 200 mm; fc28=24 MPa; age=28d; DB12@150 each way each face; bay3m`;
    for(const c of b.interfaces){c.declaredPressureLimitMPa??=3;c.resistanceBasis??='ALLOWABLE';
      if(!c.limitEvidenceRef||c.limitEvidenceRef.includes('ยังไม่มี'))c.limitEvidenceRef=`${EXAMPLE_BASIS}; local bearing ${c.declaredPressureLimitMPa} MPa; settlement limit 3 mm`;
      // No subgrade spring is applicable to an existing-slab contact. The UI
      // displays N/A instead of an empty numeric control for that branch.
      c.soilSpringEvidenceRef='N/A — existing slab, no soil spring in this model';}
  }
  return m;
}
