/**
 * Pure offline reference helpers. No network, file writes or construction approval.
 * Arithmetic screens are NOT structural design checks; trust/review stays in the app backend.
 * All engineering inputs are strict finite numbers; unknowns are never coerced to zero.
 */
const GATE = Object.freeze({confirmed: false, constructionRelease: 'NO_GO'});
const CONTEXT_KEYS = Object.freeze(['projectId', 'revisionId', 'designSnapshotHash', 'activeStageId', 'capturedStageId', 'loadCaseId']);
export const TIE_SLOTS = Object.freeze(['INNER_UNIT', 'THREAD_END_LEFT', 'THREAD_END_RIGHT', 'OUTER_LEFT', 'OUTER_RIGHT', 'END_CONNECTION_LEFT', 'END_CONNECTION_RIGHT', 'NUT_LEFT', 'NUT_RIGHT', 'PLATE_LEFT', 'PLATE_RIGHT', 'WALER_LOCAL_LEFT', 'WALER_LOCAL_RIGHT']);
const TEMPLATE_IDS = Object.freeze(['SEGMENTED_INNER_B', 'SEGMENTED_INNER_C', 'SEGMENTED_INNER_BC', 'SEGMENTED_INNER_D']);
const ALIASES = Object.freeze({BEARING_PLATE_LEFT: 'PLATE_LEFT', BEARING_PLATE_RIGHT: 'PLATE_RIGHT'});
const BASIS = Object.freeze({WORKING: 'ALLOWABLE', FACTORED_DESIGN: 'DESIGN_RESISTANCE'});
const clone = (x) => structuredClone(x);
const text = (x) => typeof x === 'string' && x.trim().length > 0;
function object(x, name) { if (!x || typeof x !== 'object' || Array.isArray(x)) throw new TypeError(`${name}: object required`); return x; }
function number(x, name, mode = 'finite') {
  if (typeof x !== 'number' || !Number.isFinite(x)) throw new TypeError(`${name}: finite number required`);
  if ((mode === 'positive' && x <= 0) || (mode === 'nonnegative' && x < 0)) throw new RangeError(`${name}: ${mode} required`);
  return x;
}
function finiteResult(values) { for (const [k,v] of Object.entries(values)) if (typeof v === 'number') number(v, `result.${k}`); return values; }
function result(values) { return {...finiteResult(values), ...GATE}; }
function contextIssues(c) {
  if (!c || typeof c !== 'object' || Array.isArray(c)) return ['CONTEXT_REQUIRED'];
  const issues = CONTEXT_KEYS.filter(k => !text(c[k])).map(k => `CONTEXT_MISSING:${k}`);
  if (text(c.designSnapshotHash) && !/^[a-f0-9]{64}$/i.test(c.designSnapshotHash)) issues.push('CONTEXT_HASH_FORMAT');
  if (text(c.activeStageId) && text(c.capturedStageId) && c.activeStageId !== c.capturedStageId) issues.push('CAPTURED_STAGE_NOT_ACTIVE');
  return issues;
}
export function tieStress(N_kN, A_t_mm2) {
  number(N_kN, 'N_kN', 'nonnegative'); number(A_t_mm2, 'A_t_mm2', 'positive');
  return result({stress_MPa: 1000*N_kN/A_t_mm2, scope: 'AXIAL_STRESS_INDICATOR_NOT_CAPACITY'});
}
export function rodExtension(N_kN, segments) {
  number(N_kN, 'N_kN', 'nonnegative');
  if (!Array.isArray(segments) || segments.length === 0) throw new TypeError('segments: nonempty array required');
  const terms_mm = segments.map((s,i) => {
    object(s, `segments[${i}]`);
    for (const k of ['L_mm','E_MPa','A_stiff_mm2']) number(s[k], `${i}.${k}`, 'positive');
    return number(1000*N_kN*s.L_mm/(s.E_MPa*s.A_stiff_mm2), 'extension');
  });
  return result({rodExtension_mm: terms_mm.reduce((a,b)=>a+b,0), terms_mm, connectionSlip_mm: null, scope:'ELASTIC_ROD_TERMS_ONLY'});
}
export function twoSpanUdl(w_kN_m, L_m) {
  number(w_kN_m,'w_kN_m','nonnegative'); number(L_m,'L_m','positive');
  return result({endReaction_kN:3*w_kN_m*L_m/8, middleReaction_kN:5*w_kN_m*L_m/4,
    middleSupportMoment_kNm:-w_kN_m*L_m**2/8, totalLoad_kN:2*w_kN_m*L_m,
    scope:'TWO_EQUAL_SPANS_CONSTANT_EI_SAME_UDL_BOTH_SPANS_NO_SETTLEMENT_OR_OVERHANG'});
}
export function pairedRailForces(N_kN, supportSeparation_mm, eccentricity_mm) {
  number(N_kN,'N_kN','nonnegative'); number(supportSeparation_mm,'supportSeparation_mm','positive'); number(eccentricity_mm,'eccentricity_mm');
  const left_kN=N_kN*(0.5-eccentricity_mm/supportSeparation_mm), right_kN=N_kN*(0.5+eccentricity_mm/supportSeparation_mm);
  return result({left_kN,right_kN,tieAxial_kN:N_kN,
    status:Math.abs(eccentricity_mm)>=supportSeparation_mm/2 ? 'BLOCKED_CONTACT_MODEL_REQUIRED':'ARITHMETIC_ONLY',
    scope:'RIGID_BRIDGE_PLATE_TWO_SUPPORT_LINES_NOT_PLATE_OR_RAIL_CAPACITY'});
}
export function rectangularContact(input) {
  object(input,'contact');
  const {N_kN,Mx_kNm,My_kNm,Bx_mm,Ly_mm}=input;
  number(N_kN,'N_kN'); number(Mx_kNm,'Mx_kNm'); number(My_kNm,'My_kNm'); number(Bx_mm,'Bx_mm','positive'); number(Ly_mm,'Ly_mm','positive');
  if (N_kN<=0) return result({status:'BLOCKED_NO_COMPRESSIVE_CONTACT', pressureCorners_kPa:null, scope:'COMPRESSION_ONLY_CONTACT'});
  const B=Bx_mm/1000, L=Ly_mm/1000, A=B*L, Ix=B*L**3/12, Iy=L*B**3/12;
  number(A,'A','positive');number(Ix,'Ix','positive');number(Iy,'Iy','positive');
  // Mx increases pressure at +y, My at +x, after conversion to the contact-pressure convention.
  // External signed transfer moments must be transformed explicitly to this convention first.
  const pressureCorners_kPa=[];
  for (const x of [-B/2,B/2]) for (const y of [-L/2,L/2]) pressureCorners_kPa.push({x_m:x,y_m:y,q_kPa:number(N_kN/A+Mx_kNm*y/Ix+My_kNm*x/Iy,'q')});
  const qmin_kPa=Math.min(...pressureCorners_kPa.map(p=>p.q_kPa)),qmax_kPa=Math.max(...pressureCorners_kPa.map(p=>p.q_kPa));
  return result({pressureCorners_kPa,qmin_kPa,qmax_kPa,area_m2:A,
    status:qmin_kPa<=0?'BLOCKED_PARTIAL_OR_ZERO_EDGE_CONTACT':'FULL_CONTACT_ARITHMETIC_ONLY',
    soilResistance_kPa:null,settlement_mm:null,
    scope:'RIGID_RECTANGULAR_FULL_CONTACT_TRIAL_NO_HOLES_NO_TENSION; NEGATIVE_TRIAL_PRESSURES_NOT_CLIPPED'});
}
export function punchingAverageStress(V_kN,b0_mm,d_mm) {
  number(V_kN,'V_kN','nonnegative');number(b0_mm,'b0_mm','positive');number(d_mm,'d_mm','positive');
  return result({averageDemand_MPa:1000*V_kN/(b0_mm*d_mm),resistance_MPa:null,
    scope:'AVERAGE_DEMAND_ONLY; VALIDATED_PERIMETER_REQUIRED; NO_MOMENT_TRANSFER_OR_RESISTANCE_MODEL'});
}
export function serviceabilityScreen(input) {
  object(input,'serviceability');
  const {span_mm,deflection_mm,relative_denominator=null,absolute_limit_mm=null,policy_ref,load_definition_ref}=input;
  number(span_mm,'span_mm','positive');number(deflection_mm,'deflection_mm','nonnegative');
  if (!text(policy_ref)||!text(load_definition_ref)) return result({status:'BLOCKED_POLICY_OR_LOAD_DEFINITION',limit_mm:null});
  const limits=[];
  if (relative_denominator!==null) {number(relative_denominator,'relative_denominator','positive');limits.push(span_mm/relative_denominator);}
  if (absolute_limit_mm!==null) {number(absolute_limit_mm,'absolute_limit_mm','positive');limits.push(absolute_limit_mm);}
  if (!limits.length) return result({status:'BLOCKED_MISSING_CRITERION',limit_mm:null});
  const limit_mm=Math.min(...limits);
  return result({limit_mm,utilization:deflection_mm/limit_mm,
    status:deflection_mm<=limit_mm?'NUMERIC_WITHIN_STATED_CRITERION':'NUMERIC_EXCEEDS_STATED_CRITERION',
    engineering_policy_verified:false,scope:'NUMERIC_COMPARISON_NOT_POLICY_ACCEPTANCE'});
}
export function checkStageContext(captured,current) {
  const issues=[...contextIssues(captured).map(x=>'CAPTURED:'+x),...contextIssues(current).map(x=>'CURRENT:'+x)];
  if (!issues.length) for (const k of CONTEXT_KEYS) if(captured[k]!==current[k]) issues.push('CONTEXT_MISMATCH:'+k);
  return result({status:issues.length?'BLOCKED_STALE_OR_INCOMPLETE':'CONTEXT_MATCH_ONLY',issues,acceptanceVerified:false});
}
export function checkSignedTransfer(action,reaction,{forceTolerance_kN=1e-8,momentTolerance_kNm=1e-8}={}) {
  object(action,'action');object(reaction,'reaction');number(forceTolerance_kN,'forceTolerance_kN','nonnegative');number(momentTolerance_kNm,'momentTolerance_kNm','nonnegative');
  const issues=[...checkStageContext(action.context,reaction.context).issues];
  for (const k of ['interfaceId','datumId','coordinateFrameId']) if (!text(action[k])||action[k]!==reaction[k]) issues.push('TRANSFER_DATUM_MISMATCH:'+k);
  for (const k of ['force_kN','moment_kNm']) for (const o of [action,reaction]) {
    if (!Array.isArray(o[k])||o[k].length!==3) throw new TypeError(`${k}: exactly three signed components required`);
    o[k].forEach((v,i)=>number(v,`${k}[${i}]`));
  }
  const forceResidual_kN=action.force_kN.map((v,i)=>v+reaction.force_kN[i]);
  const momentResidual_kNm=action.moment_kNm.map((v,i)=>v+reaction.moment_kNm[i]);
  if (forceResidual_kN.some(v=>Math.abs(v)>forceTolerance_kN)) issues.push('SIGNED_FORCE_IMBALANCE');
  if (momentResidual_kNm.some(v=>Math.abs(v)>momentTolerance_kNm)) issues.push('SIGNED_MOMENT_IMBALANCE');
  return result({status:issues.length?'BLOCKED_TRANSFER':'SIGNED_TRANSFER_BALANCED_ONLY',issues,forceResidual_kN,momentResidual_kNm,
    scope:'ACTION_REACTION_AT_IDENTICAL_POINT_FRAME_CONTEXT; NOT_SUPPORT_CAPACITY'});
}
export function canonicalTieSlot(slot) {
  const s=Object.hasOwn(ALIASES,slot)?ALIASES[slot]:slot;
  if (!TIE_SLOTS.includes(s)) throw new RangeError('Unsupported tie check slot: '+slot);
  return s;
}
export function createTieDraft(library,context,template_id) {
  object(library,'library');
  if (!TEMPLATE_IDS.includes(template_id)||!library.templates?.some(t=>t.template_id===template_id)) throw new RangeError('UNSUPPORTED_TEMPLATE');
  return {...GATE,schema_version:'closure-v1',kind:'TIE_ASSEMBLY_DRAFT',origin:'USER_DRAFT',context:clone(context),template_id,
    demand:{axial_kN:null,basis:null,reaction_ref:null,symmetry_and_alignment_evidence_ref:null},
    checks:TIE_SLOTS.map(slot=>({slot,product_id:null,reference_record_id:null,capacity_kN:null,capacity_basis:null,
      capacity_scope:'EQUIVALENT_AXIAL_TIE_LIMIT',evidence_ref:null,actual_engagement_mm:null,required_engagement_mm:null})),
    actual_assembly_compatibility_evidence_ref:null};
}
export function screenTieAssembly(library,draft) {
  object(library,'library');object(draft,'draft');
  const issues=[...contextIssues(draft.context)];
  if (draft.confirmed!==false||draft.constructionRelease!=='NO_GO') issues.push('CLIENT_APPROVAL_CLAIM_REJECTED');
  if (!TEMPLATE_IDS.includes(draft.template_id)) issues.push('UNSUPPORTED_TEMPLATE');
  if (!Array.isArray(draft.checks)||draft.checks.length!==TIE_SLOTS.length) issues.push('MISSING_OR_EXTRA_CHECK_SLOTS');
  const slots=new Set(), capacities=[];
  const demand=draft.demand??{}, wanted=Object.hasOwn(BASIS,demand.basis)?BASIS[demand.basis]:null;
  if (!wanted) issues.push('DEMAND_BASIS_REQUIRED');
  if (typeof demand.axial_kN!=='number'||!Number.isFinite(demand.axial_kN)||demand.axial_kN<0) issues.push('DEMAND_FINITE_NONNEGATIVE_REQUIRED');
  if (!text(demand.reaction_ref)) issues.push('ACTUAL_REACTION_REFERENCE_REQUIRED');
  if (!text(demand.symmetry_and_alignment_evidence_ref)) issues.push('SYMMETRY_ALIGNMENT_EVIDENCE_REQUIRED');
  if (!text(draft.actual_assembly_compatibility_evidence_ref)) issues.push('ASSEMBLY_COMPATIBILITY_EVIDENCE_REQUIRED');
  for (const check of Array.isArray(draft.checks)?draft.checks:[]) {
    if (!check||typeof check!=='object') {issues.push('INVALID_CHECK');continue;}
    let s;try{s=canonicalTieSlot(check.slot);}catch{issues.push('UNKNOWN_CHECK_SLOT');continue;}
    if(slots.has(s)) issues.push('DUPLICATE_CHECK:'+s);slots.add(s);
    if (!text(check.product_id)||!text(check.evidence_ref)) issues.push('PRODUCT_OR_EVIDENCE_MISSING:'+s);
    if (typeof check.capacity_kN!=='number'||!Number.isFinite(check.capacity_kN)||check.capacity_kN<=0) issues.push('CAPACITY_MISSING_OR_INVALID:'+s);
    else capacities.push(check.capacity_kN);
    if (!wanted||check.capacity_basis!==wanted) issues.push('CAPACITY_BASIS_MISMATCH:'+s);
    if (check.capacity_scope!=='EQUIVALENT_AXIAL_TIE_LIMIT') issues.push('NOT_NORMALIZED_TO_TIE_FORCE:'+s);
    if (check.reference_record_id!==null && check.reference_record_id!==undefined) {
      const r=library.records?.find(r=>r.record_id===check.reference_record_id);
      if (!r) issues.push('UNKNOWN_REFERENCE:'+s);
      else if (s!=='INNER_UNIT') issues.push('SEPARATOR_REFERENCE_CANNOT_RATE_OTHER_PART:'+s);
      if (r?.source_status==='LEGACY_REFERENCE_ONLY') issues.push('LEGACY_NOT_APPROVED_PRODUCT:'+s);
    }
    if(s.startsWith('THREAD_END_')) {
      if(typeof check.actual_engagement_mm!=='number'||!Number.isFinite(check.actual_engagement_mm)||check.actual_engagement_mm<=0||typeof check.required_engagement_mm!=='number'||!Number.isFinite(check.required_engagement_mm)||check.required_engagement_mm<=0) issues.push('ENGAGEMENT_UNKNOWN:'+s);
      else if(check.actual_engagement_mm<check.required_engagement_mm) issues.push('ENGAGEMENT_INSUFFICIENT:'+s);
    }
  }
  for (const s of TIE_SLOTS) if(!slots.has(s)) issues.push('CHECK_MISSING:'+s);
  if(issues.length) return result({status:'BLOCKED_DATA',issues,assemblyCapacity_kN:null,utilization:null,engineeringEvidenceVerified:false});
  const assemblyCapacity_kN=Math.min(...capacities),utilization=demand.axial_kN/assemblyCapacity_kN;
  return result({status:utilization<=1?'NUMERIC_WITHIN_SUPPLIED_LIMITS':'NUMERIC_EXCEEDS_SUPPLIED_LIMITS',issues:[],assemblyCapacity_kN,utilization,
    engineeringEvidenceVerified:false,scope:'INPUT_COMPLETENESS_AND_ARITHMETIC_ONLY; EVIDENCE_STRINGS_ARE_NOT_TRUSTED_VERIFICATION'});
}
export function lookupRinglockReference(sidecar,{system_ref,kind,selector}) {
  object(sidecar,'sidecar');object(selector,'selector');
  const matching=(sidecar.records??[]).filter(r=>r.system_ref===system_ref&&r.kind===kind&&
    Object.keys(r.selector).length===Object.keys(selector).length&&Object.keys(r.selector).every(k=>Object.hasOwn(selector,k)&&r.selector[k]===selector[k]));
  if(matching.length!==1) return result({status:'BLOCKED_NO_UNIQUE_EXACT_REFERENCE',record:null});
  return result({status:'REFERENCE_ONLY_NOT_CONFIGURATION_RATING',record:clone(matching[0]),engineeringEvidenceVerified:false});
}
