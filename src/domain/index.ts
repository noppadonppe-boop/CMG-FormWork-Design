import {analyzeWaler,equalPositions,sectionProperties,type WalerAnalysis} from './mechanics.js';
import {tieRoutes,type TieRoute} from './tieRoutes.js';
import {CC_VALUES,lateralPressure,type PressureMethod,type PressureModel} from './pressure.js';
import {FACE_GRAINS,PLYWOOD_GRADES,PLYWOOD_SPANS,plywoodDesign,type FaceGrain,type PlywoodDesign,type PlywoodGrade,type PlywoodProperties,type PlywoodSpans} from './plywoodGrades.js';
import {WALER_TYPE,catalogueProperties,isTimber,sectionById,timberGrade} from './sectionStock.js';
import {analyzeColumnYoke,columnDefaults,type ColumnAnalysis,type ColumnModel,type CornerRule} from './columnYoke.js';
export {columnDefaults} from './columnYoke.js';
export {pointBeam,sectionProperties} from './mechanics.js';
export type Point={x:number;y:number};
export type Kind='FOOTING'|'COLUMN';
export type Shape='RECTANGLE'|'L';
export type Status='PASS'|'FAIL'|'INCOMPLETE';
export interface Input {
  kind:Kind;shape:Shape;width:number;length:number;armX:number;armY:number;height:number;
  gamma:number;confirmed:boolean;plywood:number;studSpacing:number;walerSpacing:number;
  tieSpacing:number;tieDiameter:number;rhsB:number;rhsH:number;rhsT:number;
  plywoodE:number;plywoodFb:number;steelFy:number;deflectionRatio:number;
  steelE:number;steelOmegaB:number;steelOmegaShear:number;
  walerType:'RHS'|'C'|'L'|'CHS';walerB:number;walerH:number;walerT:number;pairShare:number;
  /** Catalogue channel id (sectionStock). '' = section computed from walerType/B/H/t. When set, published gross A/Ix/Zx are used. */
  walerSectionId:string;
  /** Catalogue stud id (timber / SHS / RHS). '' = steel RHS computed from rhsB/H/t. */
  studSectionId:string;
  /** Timber class for timber studs (TIMBER_GRADES id, textbook allowable values). */
  studTimberGrade:string;
  /** Lateral pressure model: HYDROSTATIC (ρgh) or ACI347 = ACI PRC-347-14(21) §4.2.2.1b. */
  pressureMethod:PressureMethod;
  /** ACI inputs: rate of placement R (m/h), concrete temperature T (°C), slump (mm), internal vibration depth (m), chemistry coefficient Cc. */
  pourRate:number;concreteTemp:number;slump:number;vibrationDepth:number;chemistryCc:number;
  /** Plywood grade: APA Plyform presets (values derived from thickness, V345 Tables 12–13) or CUSTOM (plywoodE / plywoodFb as entered). */
  plywoodGrade:PlywoodGrade;
  /** Plywood continuity (AUTO = sheet width / stud spacing with the APA rule) and face-grain direction relative to the studs. */
  plywoodSpans:PlywoodSpans;plywoodFaceGrain:FaceGrain;
  tieGrade:'SD40'|'SR24'|'CUSTOM';tieFy:number;tieFu:number;
  tieOmegaYield:number;tieOmegaRupture:number;tieNetArea:number;tieAssemblySWL:number;
  columnModel:ColumnModel;yokeOmegaT:number;cornerCapacityX:number;cornerCapacityY:number;cornerRule:CornerRule;cornerReference:string;
}
const APA_SOURCE='APA Concrete Forming Design/Construction Guide V345 (2012) Table 12–13 · ต้องยืนยันว่าแผ่นที่ใช้มีคุณสมบัติเทียบเท่า';
export interface Check {id:string;label:string;demand:number|null;limit:number|null;unit:string;
  utilization:number|null;status:Status;formula:string;substitution:string;source:string;note:string}
export interface Face {id:string;a:Point;b:Point;length:number;normal:Point;force:number}
export interface Result {
  engineVersion:string;input:Input;points:Point[];faces:Face[];area:number;perimeter:number;
  volume:number;formArea:number;pressure:number;forceScalar:number;checks:Check[];
  status:Status;blockers:string[];tieLength:number|null;tieElongation:number|null;
  waler:WalerAnalysis;tie:TieAnalysis|null;column:ColumnAnalysis|null;
  /** Straight through-tie routes (footings only; empty for columns). */
  tieRoutes:TieRoute[];
  /** Lateral pressure model used for every member check (pmax = pressure). */
  pressureModel:PressureModel;
  /** Plywood values actually used (equivalent gross-section E / Fb, rolling shear when known). */
  plywood:PlywoodProperties;
  /** Plywood span model actually used (number of spans, clear spans, allowable pressure at this spacing). */
  plywoodDesign:PlywoodDesign;
}
export interface TieAnalysis { force:number;faceId:string;length:number;routeId:string;endForces:[number,number];grossArea:number;yieldCapacity:number;
  ruptureCapacity:number|null;assemblyCapacity:number|null;capacity:number|null;
  requiredGrossDiameter:number;requiredEffectiveArea:number;bodyCandidate:number|null }
export const phase2Defaults={steelE:200000,steelOmegaB:1.67,steelOmegaShear:1.67,
  walerType:'RHS' as const,walerB:50,walerH:100,walerT:3.2,pairShare:1,
  tieGrade:'SD40' as const,tieFy:390,tieFu:560,tieOmegaYield:1.67,tieOmegaRupture:2,
  tieNetArea:0,tieAssemblySWL:0};
export const extensionDefaults={...phase2Defaults,...columnDefaults};
/** Pressure inputs added later; HYDROSTATIC keeps every earlier result unchanged. Defaults are typical Thai site values, to be confirmed per pour. */
export const pressureDefaults={pressureMethod:'HYDROSTATIC' as PressureMethod,pourRate:2,concreteTemp:30,slump:100,vibrationDepth:1,chemistryCc:1.2};
/** New cases use APA Plyform Class I; inputs saved before the grade existed keep their own plywoodE / plywoodFb (CUSTOM). */
export const plywoodDefaults={plywoodGrade:'PLYFORM_I' as PlywoodGrade,plywoodSpans:'AUTO' as PlywoodSpans,plywoodFaceGrain:'ACROSS' as FaceGrain};
export const defaults:Input={kind:'FOOTING',shape:'RECTANGLE',width:3000,length:4000,armX:1500,armY:2000,height:2500,
  gamma:24,confirmed:false,plywood:20,studSpacing:300,walerSpacing:600,tieSpacing:600,tieDiameter:16,
  rhsB:50,rhsH:100,rhsT:3.2,plywoodE:4800,plywoodFb:5.3,steelFy:245,deflectionRatio:360,...extensionDefaults,walerSectionId:'',studSectionId:'',studTimberGrade:'TIMBER-BOOK-SOFT',...pressureDefaults,...plywoodDefaults};
/** Older drafts gain explicit conservative defaults and lose confirmation; partial schemas reject. */
export function upgradeInput(v:unknown,minimumVersion:1|2=1):Input {
  if(!v||typeof v!=='object')throw Error('ข้อมูลไม่ถูกต้อง');
  const q=v as Record<string,unknown>,p2=Object.keys(phase2Defaults),p3=Object.keys(columnDefaults);
  const old1=p2.every(k=>!(k in q))&&p3.every(k=>!(k in q));
  const old2=p2.every(k=>k in q)&&p3.every(k=>!(k in q));
  return validateInput(old1&&minimumVersion===1?{...q,...extensionDefaults,confirmed:false}:old2?{...q,...columnDefaults,confirmed:false}:q);
}
export function validateInput(v:unknown):Input {
  if(!v||typeof v!=='object')throw Error('ข้อมูลไม่ถูกต้อง');
  // walerSectionId was added later: older inputs without it mean 'no catalogue section'.
  // Catalogue fields were added later: older inputs without them mean 'no catalogue section' and the conservative timber class.
  const r0=v as Record<string,unknown>,q:Record<string,unknown>={...r0,walerSectionId:r0.walerSectionId??'',studSectionId:r0.studSectionId??'',studTimberGrade:r0.studTimberGrade??'TIMBER-BOOK-SOFT',
    ...Object.fromEntries(Object.entries(pressureDefaults).map(([k,d])=>[k,r0[k]??d])),plywoodGrade:r0.plywoodGrade??'CUSTOM',plywoodSpans:r0.plywoodSpans??'SINGLE',plywoodFaceGrain:r0.plywoodFaceGrain??'PARALLEL'};
  const keys=Object.keys(defaults) as (keyof Input)[];
  if(Object.keys(q).some(k=>!keys.includes(k as keyof Input)))throw Error('มีช่องข้อมูลที่ไม่รองรับ');
  if(!['FOOTING','COLUMN'].includes(String(q.kind))||!['RECTANGLE','L'].includes(String(q.shape))||typeof q.confirmed!=='boolean')throw Error('ชนิดหรือสถานะรูปทรงไม่ถูกต้อง');
  if(!['RHS','C','L','CHS'].includes(String(q.walerType))||!['SD40','SR24','CUSTOM'].includes(String(q.tieGrade)))throw Error('ชนิดคานหรือเกรด Tie ไม่ถูกต้อง');
  if(!['DEMAND_ONLY','PINNED_RING'].includes(String(q.columnModel))||!['UNKNOWN','LINEAR'].includes(String(q.cornerRule))||typeof q.cornerReference!=='string'||q.cornerReference.length>300)throw Error('ข้อมูลโมเดลหรือแหล่งอ้างอิงชุดรัดไม่ถูกต้อง');
  for(const k of keys.filter(k=>!['kind','shape','confirmed','walerType','tieGrade','tieNetArea','tieAssemblySWL','columnModel','cornerRule','cornerReference','cornerCapacityX','cornerCapacityY','walerSectionId','studSectionId','studTimberGrade','pressureMethod','plywoodGrade','plywoodSpans','plywoodFaceGrain'].includes(k))) {
    if(typeof q[k]!=='number'||!Number.isFinite(q[k])||Number(q[k])<=0)throw Error('ค่าต้องเป็นจำนวนบวก: '+k);
  }
  for(const k of ['tieNetArea','tieAssemblySWL','cornerCapacityX','cornerCapacityY'])if(typeof q[k]!=='number'||!Number.isFinite(q[k])||Number(q[k])<0)throw Error('ค่าต้องไม่ติดลบ: '+k);
  const x=q as unknown as Input;
  if(x.width>30000||x.length>30000||x.height>30000||x.gamma>40||x.plywood>100||x.tieDiameter>100||x.rhsB>1000||x.rhsH>1000)throw Error('ขนาดอยู่นอกขอบเขตต้นแบบ');
  if(x.shape==='L'&&(x.armX>=x.width||x.armY>=x.length))throw Error('ความกว้างแขนรูป L ต้องน้อยกว่าขนาดรวม');
  if(x.rhsT*2>=Math.min(x.rhsB,x.rhsH))throw Error('ความหนาเหล็กกล่องไม่ถูกต้อง');
  if(x.studSpacing>Math.max(x.width,x.length)||x.walerSpacing>x.height||x.tieSpacing>Math.max(x.width,x.length))throw Error('ระยะสมาชิกมากกว่าขนาดรูปทรง');
  if(x.plywoodFb>100||x.plywoodE>50000||x.steelFy>1000||x.deflectionRatio>2000)throw Error('พารามิเตอร์อยู่นอกขอบเขต');
  if(x.steelE>300000||x.walerB>1000||x.walerH>1000||x.walerT*2>=Math.min(x.walerB,x.walerH))throw Error('พารามิเตอร์คานคู่ไม่ถูกต้อง');
  if(x.pairShare<.5||x.pairShare>1)throw Error('สัดส่วนแรงคานตัวที่รับมากต้องอยู่ระหว่าง 0.5 และ 1.0');
  if([x.steelOmegaB,x.steelOmegaShear,x.tieOmegaYield,x.tieOmegaRupture,x.yokeOmegaT].some(v=>v<1||v>10)||x.cornerCapacityX>10000||x.cornerCapacityY>10000)throw Error('ตัวหารกำลังหรือพิกัดจุดต่ออยู่นอกขอบเขต');
  if(x.tieFy>x.tieFu||x.tieFy>1000||x.tieFu>2000||x.tieAssemblySWL>10000||x.tieNetArea>Math.PI*x.tieDiameter**2/4)throw Error('กำลังหรือพื้นที่ Tie ไม่ถูกต้อง (Ae ต้องไม่เกิน Ag)');
  if(x.tieGrade==='SD40'&&(x.tieFy!==390||x.tieFu!==560)||x.tieGrade==='SR24'&&(x.tieFy!==235||x.tieFu!==385))throw Error('ค่าเกรดไม่ตรงค่าตัวอย่าง เลือก CUSTOM เพื่อใช้ค่าจากใบรับรอง');
  if(typeof x.walerSectionId!=='string'||x.walerSectionId.length>80)throw Error('รหัสหน้าตัดคานคู่ไม่ถูกต้อง');
  if(x.walerSectionId){
    const s=sectionById(x.walerSectionId);
    if(!s||!s.roles.includes('waler'))throw Error('ไม่พบหน้าตัดคานคู่ในแคตตาล็อก: '+x.walerSectionId);
    if(x.walerType!==WALER_TYPE[s.family as keyof typeof WALER_TYPE]||x.walerB!==s.B||x.walerH!==s.H||x.walerT!==s.t)throw Error('ขนาดคานคู่ไม่ตรงกับหน้าตัดแคตตาล็อก '+s.designation);
  }else if(x.walerType==='L'||x.walerType==='CHS')throw Error('เหล็กฉาก/เหล็กท่อ ต้องเลือกขนาดจากตารางเหล็ก');
  if(typeof x.studSectionId!=='string'||x.studSectionId.length>80||typeof x.studTimberGrade!=='string'||!timberGrade(x.studTimberGrade))throw Error('รหัสหน้าตัดหรือชั้นไม้คร่าวไม่ถูกต้อง');
  if(x.studSectionId){
    const s=sectionById(x.studSectionId);
    if(!s||!s.roles.includes('stud'))throw Error('ไม่พบหน้าตัดคร่าวในแคตตาล็อก: '+x.studSectionId);
    if(x.rhsB!==s.B||x.rhsH!==s.H||(!isTimber(s)&&x.rhsT!==s.t))throw Error('ขนาดคร่าวไม่ตรงกับหน้าตัดแคตตาล็อก '+s.designation);
  }
  if(!PLYWOOD_GRADES.includes(x.plywoodGrade)||!PLYWOOD_SPANS.includes(x.plywoodSpans)||!FACE_GRAINS.includes(x.plywoodFaceGrain))throw Error('ชนิด จำนวนช่วง หรือทิศลายไม้อัดไม่ถูกต้อง');
  if(!['HYDROSTATIC','ACI347'].includes(x.pressureMethod)||!CC_VALUES.includes(x.chemistryCc as typeof CC_VALUES[number]))throw Error('วิธีคำนวณแรงดันหรือค่า Cc ไม่ถูกต้อง');
  if(x.pourRate>20||x.concreteTemp<5||x.concreteTemp>45||x.slump>300||x.vibrationDepth>10)throw Error('อัตราการเท อุณหภูมิ ค่ายุบตัว หรือความลึกเครื่องจี้อยู่นอกขอบเขต');
  equalPositions(x.height,x.walerSpacing);equalPositions(Math.max(x.width,x.length),x.studSpacing);equalPositions(Math.max(x.width,x.length),x.tieSpacing);
  return Object.fromEntries(keys.map(k=>[k,x[k]])) as unknown as Input;
}
export function polygon(x:Input):Point[] {
  if(x.shape==='RECTANGLE')return [{x:0,y:0},{x:x.width,y:0},{x:x.width,y:x.length},{x:0,y:x.length}];
  return [{x:0,y:0},{x:x.width,y:0},{x:x.width,y:x.armY},{x:x.armX,y:x.armY},{x:x.armX,y:x.length},{x:0,y:x.length}];
}
export function geometry(points:Point[]) {
  if(points.length<3||points.length>64||points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)))throw Error('รูปหลายเหลี่ยมไม่ถูกต้อง');
  let area=0,perimeter=0;
  const orient=(a:Point,b:Point,c:Point)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
  const on=(a:Point,b:Point,p:Point)=>Math.abs(orient(a,b,p))<1e-8&&p.x>=Math.min(a.x,b.x)&&p.x<=Math.max(a.x,b.x)&&p.y>=Math.min(a.y,b.y)&&p.y<=Math.max(a.y,b.y);
  for(let i=0;i<points.length;i++){
    const a=points[i],b=points[(i+1)%points.length],len=Math.hypot(b.x-a.x,b.y-a.y);
    if(len<1e-6)throw Error('มีด้านซ้ำหรือความยาวเป็นศูนย์');
    area+=a.x*b.y-b.x*a.y;perimeter+=len;
    for(let j=i+1;j<points.length;j++){
      if(j===i+1||(i===0&&j===points.length-1))continue;
      const c=points[j],d=points[(j+1)%points.length];
      if((orient(a,b,c)*orient(a,b,d)<0&&orient(c,d,a)*orient(c,d,b)<0)||on(a,b,c)||on(a,b,d)||on(c,d,a)||on(c,d,b))throw Error('เส้นขอบตัดกัน');
    }
  }
  if(Math.abs(area)<1e-6)throw Error('พื้นที่เป็นศูนย์');
  return {area:Math.abs(area)/2,perimeter,winding:Math.sign(area)};
}
export function beamUniform(w:number,L:number,E:number,I:number){
  if([w,L,E,I].some(x=>!Number.isFinite(x)||x<0)||L===0||E===0||I===0)throw Error('Beam inputs invalid');
  return {moment:w*L*L/8,reaction:w*L/2,deflection:5*w*L**4/(384*E*I)};
}
export function inside(p:Point,ps:Point[]):boolean {
  let result=false;
  for(let i=0,j=ps.length-1;i<ps.length;j=i++){
    const a=ps[j],b=ps[i],cross=(b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x);
    if(Math.abs(cross)<1e-7&&p.x>=Math.min(a.x,b.x)-1e-7&&p.x<=Math.max(a.x,b.x)+1e-7&&p.y>=Math.min(a.y,b.y)-1e-7&&p.y<=Math.max(a.y,b.y)+1e-7)return true;
    if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)result=!result;
  }return result;
}
export function segmentInside(a:Point,b:Point,ps:Point[]):boolean {
  const cuts=[0,1],dx=b.x-a.x,dy=b.y-a.y;
  if(Math.hypot(dx,dy)<1e-7)return false;
  const cross=(x:number,y:number,u:number,v:number)=>x*v-y*u;
  for(let i=0;i<ps.length;i++){
    const p=ps[i],q=ps[(i+1)%ps.length],ex=q.x-p.x,ey=q.y-p.y,den=cross(dx,dy,ex,ey);
    if(Math.abs(den)>1e-9){
      const t=cross(p.x-a.x,p.y-a.y,ex,ey)/den,u=cross(p.x-a.x,p.y-a.y,dx,dy)/den;
      if(t>0&&t<1&&u>=0&&u<=1)cuts.push(t);
    }else if(Math.abs(cross(p.x-a.x,p.y-a.y,dx,dy))<1e-7){
      for(const z of [p,q]){const t=((z.x-a.x)*dx+(z.y-a.y)*dy)/(dx*dx+dy*dy);if(t>0&&t<1)cuts.push(t);}
    }
  }
  cuts.sort((x,y)=>x-y);
  if(!inside(a,ps)||!inside(b,ps))return false;
  for(let i=1;i<cuts.length;i++){const t=(cuts[i]+cuts[i-1])/2;if(!inside({x:a.x+t*dx,y:a.y+t*dy},ps))return false;}
  return true;
}
export function calculate(raw:unknown):Result {
  const x=validateInput(raw),points=polygon(x),g=geometry(points),pressureModel=lateralPressure(x),p=pressureModel.pmax,pressureMPa=p/1000;
  const faceForcePerM=pressureModel.forcePerM;
  const routing=x.kind==='FOOTING'?tieRoutes(points,x.tieSpacing):null;
  const catalogue=x.walerSectionId?sectionById(x.walerSectionId)!:null,catalogueSection=catalogue?catalogueProperties(catalogue):undefined;
  const faces=points.map((a,i)=>{
    const b=points[(i+1)%points.length],length=Math.hypot(b.x-a.x,b.y-a.y);
    return {id:'F'+(i+1),a,b,length,normal:{x:(b.y-a.y)/length*g.winding,y:-(b.x-a.x)/length*g.winding},force:faceForcePerM*length/1000};
  });
  const checks:Check[]=[];
  const add=(id:string,label:string,demand:number|null,limit:number|null,unit:string,formula:string,substitution:string,note:string,source='สูตรกลศาสตร์พื้นฐาน / SCREENING; ค่าวัสดุอ้างอิงเบื้องต้น ต้องยืนยันกับผลิตภัณฑ์จริง')=>{
    checks.push({id,label,demand,limit,unit,utilization:limit===null||demand===null?null:demand/limit,status:limit!==null&&demand!==null&&demand>limit?'FAIL':'INCOMPLETE',formula,substitution,source,note});
  };
  // Plywood: APA V345 continuous-span checks on the effective section (presets) or user values on the gross section (CUSTOM).
  const plyDesign=plywoodDesign({grade:x.plywoodGrade,t:x.plywood,faceGrain:x.plywoodFaceGrain,spans:x.plywoodSpans,pressure:p,spacing:x.studSpacing,studWidth:x.rhsB,
    deflectionRatio:x.deflectionRatio,sheetAcross:x.plywoodFaceGrain==='ACROSS'?2440:1220,custom:{E:x.plywoodE,Fb:x.plywoodFb}}),ply=plyDesign.props;
  const plySrc=ply.grade==='CUSTOM'?'ค่าไม้อัดที่ผู้ใช้กำหนด ต้องมีใบรับรองผู้ผลิต':APA_SOURCE;
  for(const k of plyDesign.checks)add(k.id,k.label,k.demand,k.limit,k.unit,k.formula,k.substitution,k.note,plySrc);
  const waler=analyzeWaler({height:x.height,pressure:p,studSpacing:x.studSpacing,walerSpacing:x.walerSpacing,tieSpacing:x.tieSpacing,
    type:x.walerType,B:x.walerB,H:x.walerH,t:x.walerT,E:x.steelE,share:x.pairShare,section:catalogueSection,throughTies:!!routing,supports:routing?.supportsByFace,faces});
  const studCat=x.studSectionId?sectionById(x.studSectionId)!:null,grade=timberGrade(x.studTimberGrade)!,timber=!!studCat&&isTimber(studCat);
  const steel=studCat?catalogueProperties(studCat):sectionProperties('RHS',x.rhsB,x.rhsH,x.rhsT),I=steel.I,steelS=steel.S;
  const studName=studCat?studCat.designation:'RHS '+x.rhsB+'×'+x.rhsH+'×'+x.rhsT,studE=timber?grade.E:x.steelE;
  const stud=beamUniform(pressureMPa*x.studSpacing,waler.verticalSpan,studE,I);
  const span='w = '+(pressureMPa*x.studSpacing).toFixed(3)+' N/mm; Lจริง = '+waler.verticalSpan.toFixed(3)+' mm; I = '+I.toFixed(0)+' mm⁴; '+studName;
  if(timber){
    const ts='หนังสือ Design Form Work ตาราง 3.4 (อ้าง ว.ส.ท.) · '+grade.label+' · ค่าอ้างอิงเดิม ยังไม่ปรับตามความชื้น/ระยะเวลารับแรง';
    add('stud-b','คร่าวไม้: หน่วยแรงดัด',stud.moment/steelS,grade.Fb,'MPa','M = wL²/8; fb = M/S ≤ Fb',span+'; Fb='+grade.Fb.toFixed(2)+' MPa ('+grade.raw_ksc.Fb_base_MPa+' ksc)','ต้องยืนยันชนิดไม้ ขนาดจริงหลังไส ความชื้น และตำหนิไม้',ts);
    add('stud-v','คร่าวไม้: หน่วยแรงเฉือน',1.5*stud.reaction/(studCat!.A_cm2*100),grade.Fv,'MPa','fv = 1.5 V / A ≤ Fv','V='+stud.reaction.toFixed(3)+' N; A='+(studCat!.A_cm2*100).toFixed(0)+' mm²'+(grade.Fv===null?'; ไม่มีค่า Fv ในตาราง':''),'หน้าตัดสี่เหลี่ยมตัน; ไม่ลดแรงเฉือนใกล้จุดรองรับ',ts);
    add('stud-d','คร่าวไม้: การโก่ง',stud.deflection,waler.verticalSpan/x.deflectionRatio,'mm','δ = 5wL⁴/(384EI)','Lจริง='+waler.verticalSpan.toFixed(3)+' mm; E='+grade.E.toFixed(0)+' MPa','ไม่รวมการคืบ (creep) ของไม้',ts);
  }else{
    add('stud-b','คร่าวเหล็ก: เริ่มครากเบื้องต้น',stud.moment/steelS,x.steelFy/x.steelOmegaB,'MPa','M = wL²/8; σ = M/S; yield screen = Fy/Ωb',span,studCat?'ค่า gross จากตารางเหล็ก ('+studCat.source+'); ไม่ตรวจ local/global buckling และจุดต่อ':'หน้าตัดมุมคมสมมติ; ไม่ตรวจ local/global buckling และจุดต่อ');
    add('stud-v','คร่าวเหล็ก: เฉือนเฉลี่ยก่อนคราก',stud.reaction/steel.shearArea,x.steelFy/(Math.sqrt(3)*x.steelOmegaShear),'MPa','τavg = V/Av; yield screen = Fy/(√3 Ωv)','V='+stud.reaction.toFixed(3)+' N; Av='+steel.shearArea.toFixed(3)+' mm²','Elastic average-shear screen; ไม่ใช่การตรวจ shear buckling หรือ combined stress');
    add('stud-d','คร่าวเหล็ก: การโก่ง',stud.deflection,waler.verticalSpan/x.deflectionRatio,'mm','δ = 5wL⁴/(384EI)','Lจริง='+waler.verticalSpan.toFixed(3)+' mm; E='+x.steelE+' MPa','Simple span + uniform maximum pressure screening เท่านั้น');
  }
  const wn='โมเดลแยกช่วงรองรับสองปลาย ไม่ใช่คานต่อเนื่อง; ไม่ตรวจ buckling, torsion, local bearing และจุดต่อ';
  add('waler-b','คานคู่: ดัดของตัวที่รับแรงมาก',waler.stress,x.steelFy/x.steelOmegaB,'MPa','Pj = pmax bj hv; RA = ΣPj(L−aj)/L; M(x) = RA x − ΣPj⟨x−aj⟩; σ = α Mmax/S',
    'α='+x.pairShare+'; S='+waler.section.S.toFixed(3)+' mm³; '+waler.bending.faceId+' ช่วง '+waler.bending.index+'; Mตัวที่รับมาก='+waler.bending.moment.toFixed(3)+' N·mm',wn);
  add('waler-v','คานคู่: เฉือนเฉลี่ยของตัวที่รับมาก',waler.shearStress,x.steelFy/(Math.sqrt(3)*x.steelOmegaShear),'MPa','τavg = α Vpair/Av; yield screen = Fy/(√3 Ωv)',
    'Vตัวที่รับมาก='+waler.shear.shear.toFixed(3)+' N; Av='+waler.section.shearArea.toFixed(3)+' mm²',wn);
  add('waler-d','คานคู่: การโก่งของช่วงควบคุม',waler.deflection.deflection,waler.deflection.length/x.deflectionRatio,'mm','EI δ(x) = α [Cx − RA x³/6 + ΣPj⟨x−aj⟩³/6]; C = [RA L³ − ΣPj(L−aj)³]/(6L); δmax at δ′ = 0',
    waler.deflection.faceId+' ช่วง '+waler.deflection.index+'; L='+waler.deflection.length.toFixed(3)+' mm; I='+waler.section.I.toFixed(3)+' mm⁴; α='+x.pairShare,wn);
  let tie:TieAnalysis|null=null;
  // Each routed tie carries the larger of its two end reactions (ends are not averaged).
  const endForce=(faceId:string,pos:number)=>waler.faces.find(f=>f.faceId===faceId)?.supports.find(s=>s.role==='TIE'&&Math.abs(s.position-pos)<1e-6)?.force??0;
  const tieDemands=(routing?.routes??[]).map(rt=>{const ends:[number,number]=[endForce(rt.faceA,rt.posA),endForce(rt.faceB,rt.posB)];return {rt,ends,force:Math.max(...ends)};});
  const governingTie=tieDemands.reduce<typeof tieDemands[number]|null>((g,d)=>!g||d.force>g.force?d:g,null);
  const unequalTies=tieDemands.some(d=>Math.abs(d.ends[0]-d.ends[1])>0.01*Math.max(d.force,1));
  if(governingTie&&governingTie.force>0){
    const T=governingTie.force/1000,Ag=Math.PI*x.tieDiameter**2/4,face=faces.find(f=>f.id===governingTie.rt.faceA)!;
    const length=governingTie.rt.length;
    const yieldCapacity=x.tieFy*Ag/x.tieOmegaYield/1000;
    const ruptureCapacity=x.tieNetArea>0?x.tieFu*x.tieNetArea/x.tieOmegaRupture/1000:null;
    const assemblyCapacity=x.tieAssemblySWL>0?x.tieAssemblySWL:null;
    const requiredGrossDiameter=Math.sqrt(4*T*1000*x.tieOmegaYield/(Math.PI*x.tieFy));
    tie={force:T,faceId:face.id,length,routeId:governingTie.rt.id,endForces:[governingTie.ends[0]/1000,governingTie.ends[1]/1000],grossArea:Ag,yieldCapacity,ruptureCapacity,assemblyCapacity,
      capacity:ruptureCapacity===null||assemblyCapacity===null?null:Math.min(yieldCapacity,ruptureCapacity,assemblyCapacity),
      requiredGrossDiameter,requiredEffectiveArea:T*1000*x.tieOmegaRupture/x.tieFu,bodyCandidate:[12,16,20,25,28,32,36,40].find(d=>d>=requiredGrossDiameter)??null};
    const source='Elastic tension-member screening: gross yielding / effective-net rupture; Ω เป็นเกณฑ์คัดกรองที่ต้องยืนยันวิธีใช้กับอุปกรณ์จริง';
    add('tie','Tie: ตัวเหล็กก่อนทำเกลียว',T,yieldCapacity,'kN','T = max(Rleft bay + Rright bay + Pที่จุดรองรับ); Py = Fy Ag/Ωy/1000',
      'T='+T.toFixed(3)+' kN จาก '+face.id+'; Fy='+x.tieFy+' MPa; Ag='+Ag.toFixed(3)+' mm²; Ωy='+x.tieOmegaYield,
      'แรงจากคานคู่ทั้งชุด ใช้แรงด้านเดียวของคู่ผนัง ไม่บวกซ้ำสองผนัง; ไม่ใช่กำลังชุดเกลียว',source);
    add('tie-net','Tie: หน้าตัดสุทธิ / เกลียว',T,ruptureCapacity,'kN','Pu = Fu Ae/Ωu/1000',
      'Fu='+x.tieFu+' MPa; Ae='+(x.tieNetArea>0?x.tieNetArea+' mm²':'ยังไม่กำหนด')+'; Ωu='+x.tieOmegaRupture,
      'Ae ต้องเป็นค่าประสิทธิผลที่ตรวจสอบแล้ว สูตรนี้ไม่ตรวจ thread stripping, weld และ fatigue',source);
    add('tie-assembly','Tie: ชุดอุปกรณ์ครบชุด',T,assemblyCapacity,'kN','T ≤ certified allowable working load (SWL)',
      'SWL='+(assemblyCapacity===null?'ยังไม่กำหนด':assemblyCapacity+' kN'),
      'ต้องเป็นกำลังใช้งานของ rod + nut + washer/plate ที่สภาพและความยาวตามผู้ผลิต ห้ามใช้ breaking load แทน');
  }
  const tieLength=tie?.length??null;
  const column=x.kind==='COLUMN'&&x.shape==='RECTANGLE'?analyzeColumnYoke(faces,waler,{model:x.columnModel,Fy:x.steelFy,omegaT:x.yokeOmegaT,omegaB:x.steelOmegaB,capacityX:x.cornerCapacityX,capacityY:x.cornerCapacityY,rule:x.cornerRule}):null;
  if(column){
    add('column-x','ชุดรัดเสา: แรงจุดต่อมุมแกน X',column.maxX/1000,x.cornerCapacityX||null,'kN','Qcorner = Rprevious nprevious + Rcurrent ncurrent; |Qx| ≤ Cx',
      '|Qx|max='+ (column.maxX/1000).toFixed(3)+' kN; Cx='+(x.cornerCapacityX||'ยังไม่ทราบ'),'แรงรวมคานทั้งคู่ที่มุม ไม่ใช่แรงสลักหนึ่งตัว; กำลังเป็นค่าป้อนที่ยังไม่ตรวจหลักฐาน');
    add('column-y','ชุดรัดเสา: แรงจุดต่อมุมแกน Y',column.maxY/1000,x.cornerCapacityY||null,'kN','|Qy| ≤ Cy',
      '|Qy|max='+(column.maxY/1000).toFixed(3)+' kN; Cy='+(x.cornerCapacityY||'ยังไม่ทราบ'),'ต้องตรวจพิกัดแนวแรงและการทำงานสองแกนของจุดต่อจริง');
    add('column-joint','ชุดรัดเสา: Interaction จุดต่อสองแกน',column.cornerInteraction,column.cornerInteraction===null?null:1,'ratio','ηjoint = |Qx|/Cx + |Qy|/Cy ≤ 1 (เฉพาะเมื่อเลือกเกณฑ์ LINEAR)',
      'เกณฑ์='+x.cornerRule+'; ข้ออ้างอิงผู้ใช้='+(x.cornerReference||'ยังไม่ระบุ'),'เกณฑ์ LINEAR เป็นสมมติฐานผู้ใช้ ไม่ใช่การรับรองจุดต่อ; ต้องตรวจสลัก รู แผ่นรอง รอยเชื่อมและระยะเยื้อง');
    add('column-yoke','ชุดรัดเสา: ดึงร่วมกับดัดของคาน',column.memberInteraction,column.memberInteraction===null?null:1,'ratio','Q + Ni ti − Nj tj = 0; ηmember = (αN/A)/(Fy/Ωt) + (αM/S)/(Fy/Ωb) ≤ 1',
      'โมเดล='+column.model+'; α='+x.pairShare+'; A='+waler.section.area.toFixed(3)+' mm²; Ωt='+x.yokeOmegaT+'; ด้านควบคุม='+(column.governingMember||'ยังไม่เลือกโมเดลวงปิด'),
      'Elastic first-order yield screen เท่านั้น; วงสี่ด้านแบบ pin มีโหมดกลไก ต้องตรวจ restraint/stability จริง ไม่ใช่โมเดลก่อสร้างที่รับรอง');
  }
  const blockers=[
    ...(!x.confirmed?['ยังไม่ได้ยืนยันรูปทรงและมิติ']:[]),
    'ค่าวัสดุเป็นค่าอ้างอิงเบื้องต้นจากมาตรฐาน/แคตตาล็อก ต้องยืนยันกับใบรับรองผลิตภัณฑ์จริงก่อนใช้งาน',
    'คานคู่ใช้โมเดลแยกช่วง Simple span; ต้องยืนยันรอยต่อ/การปลดโมเมนต์ ไม่รองรับการอ้างเป็นคานต่อเนื่อง',
    'ยังไม่ตรวจการแบ่งแรงคานคู่ จุดต่อมุม แรงกดเฉพาะที่ และ local/global buckling',
    'จุดรองรับปลายแต่ละด้านเป็น CORNER ไม่ใช่ Tie; ต้องออกแบบระบบมุมและระยะเยื้องจากขอบจริง',
    'ยังไม่กำหนดความยาวตัด Tie rod และระยะเยื้องระดับ Tie สองทิศทางเพื่อป้องกันชนกัน',
    'ยังไม่ตรวจค้ำยัน 34 มม. Anchor ฐานรอง และแรงลม',
    'ยังไม่ตรวจ thread stripping, นอต, แผ่นรอง และ rolling shear',
    ...(tie&&x.tieNetArea===0?['ยังไม่ได้กำหนด Ae ของหน้าตัดสุทธิ/เกลียว']:[]),
    ...(tie&&x.tieAssemblySWL===0?['ยังไม่ได้กำหนด certified SWL ของชุด Tie rod']:[]),
    ...(unequalTies?['แรงที่สองปลาย Tie ไม่เท่ากัน (ด้านตรงข้ามยาวไม่เท่ากัน) ใช้ค่ามากเป็นแรงออกแบบ ต้องตรวจสมดุลและการเลื่อนของคานคู่']:[]),
    ...(x.kind==='FOOTING'&&!tie?['ไม่มีจุด Tie ภายในด้านตามระยะที่เลือก แรงทั้งหมดไปจุดรองรับมุม']:[]),
    ...(timber?['คร่าวไม้ '+studName+' ใช้ค่าหน่วยแรงที่ยอมให้จากหนังสือเดิม ('+grade.label+') ต้องยืนยันชนิดไม้ ขนาดจริง และความชื้นก่อนใช้งาน']:[]),
    ...(x.walerType==='L'?['คานคู่เหล็กฉาก '+(catalogue?.designation??'')+': หน้าตัดไม่สมมาตร ใช้ S ต่ำสุดรอบแกนเรขาคณิต ยังไม่ตรวจการดัดรอบแกนหลัก การบิด และ LTB']:[]),
    ...(x.walerType==='CHS'?['คานคู่ท่อกลม '+(catalogue?.designation??'')+': ต้องออกแบบจุดรับ Tie/แผ่นรองบนผิวโค้งและการบดของผนังท่อ']:[]),
    ...(x.walerType==='C'?[catalogue?'คานคู่ '+catalogue.designation+' ใช้ค่า A/Ix/Zx gross จากแคตตาล็อก ('+catalogue.source+') ไม่ใช่ effective section: ต้องตรวจ local/distortional buckling, shear centre/torsion, LTB และการประกบหลังชนหลัง':'หน้าตัด C เป็นแบบไม่มีปีกริมสมมติ ต้องตรวจ lips, shear center, torsion และ lateral-torsional buckling']:[]),
    ...(x.kind==='COLUMN'?['ชุดรัดเสายังไม่ตรวจจุดต่อครบ เสถียรภาพในระนาบ/นอกระนาบ และผลแรงเยื้องศูนย์',
      ...(x.shape!=='RECTANGLE'?['การคำนวณมุมชุดรัดเสารองรับเฉพาะรูปสี่เหลี่ยมในรุ่นนี้']:[]),
      ...(x.columnModel==='DEMAND_ONLY'?['ยังไม่เลือกสมมติฐานการส่งแรงแกนของชุดรัดวงปิด']:['โมเดล PINNED_RING เป็นสมดุลแรงอันดับหนึ่งเท่านั้น วงสี่ pin ไม่ถือว่าเสถียรโดยอัตโนมัติ']),
      ...(!x.cornerCapacityX||!x.cornerCapacityY?['ยังไม่ทราบกำลังใช้งานจุดต่อมุมในแกน X/Y']:[]),
      ...(x.cornerRule==='UNKNOWN'?['ยังไม่กำหนดเกณฑ์ Interaction ของจุดต่อมุมสองแกน']:[]),
      ...(!x.cornerReference.trim()?['ยังไม่มีข้อความอ้างอิงข้อมูลชุดจุดต่อมุม']:[])
    ]:[]),
    ...(x.shape==='L'?[x.kind==='FOOTING'?'รูป L: Tie คำนวณเป็นเส้นตรงระหว่างด้านตรงข้ามแยกตามช่วง มุมเว้าและจุดต่อคานคู่ยังต้องออกแบบรายละเอียด':'มุมเว้าและระบบ Yoke ของรูป L ต้องมีวิธีคำนวณจุดต่อที่ตรวจสอบแล้ว']:[])
  ];
  return {engineVersion:'0.3.0-screening',input:x,points,faces,area:g.area/1e6,perimeter:g.perimeter/1000,
    volume:g.area/1e6*x.height/1000,formArea:g.perimeter*x.height/1e6,pressure:p,forceScalar:faces.reduce((s,f)=>s+f.force,0),
    checks,status:checks.some(c=>c.status==='FAIL')?'FAIL':'INCOMPLETE',blockers,tieLength,waler,tie,column,tieRoutes:routing?.routes??[],pressureModel,plywood:ply,plywoodDesign:plyDesign,
    tieElongation:tie===null?null:tie.force*1000*tie.length/(x.steelE*tie.grossArea)};
}
export function positions(length:number,requested:number):number[]{
  if(length<=0||requested<=0||!Number.isFinite(length)||!Number.isFinite(requested))throw Error('Invalid spacing');
  const bays=Math.ceil(length/requested);if(bays>1000)throw Error('สมาชิกมากเกินขอบเขต');
  return Array.from({length:bays+1},(_,i)=>i*length/bays);
}
export function propose(x:Input):Input[]{
  validateInput(x);
  return [{...x,plywood:20,studSpacing:Math.min(250,x.width,x.length),walerSpacing:Math.min(500,x.height),tieSpacing:Math.min(500,x.width,x.length)},
    {...x,plywood:25,studSpacing:Math.min(300,x.width,x.length),walerSpacing:Math.min(500,x.height),tieSpacing:Math.min(500,x.width,x.length)}];
}
