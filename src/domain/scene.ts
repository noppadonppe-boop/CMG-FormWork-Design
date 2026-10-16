import {defaults,validateInput,type Input,type Result} from './index.js';
import {equalPositions} from './mechanics.js';
import {WALER_TYPE,sectionById} from './sectionStock.js';
import {walerExtensions} from './formworkLayout.js';

export const NOTICE='PRELIMINARY SCREENING MODEL - NOT FOR CONSTRUCTION (โมเดลคัดกรองเบื้องต้น ไม่ใช่แบบก่อสร้าง)';
export const ENUMS={kind:['FOOTING','COLUMN'],shape:['RECTANGLE','L'],walerType:['RHS','C','L','CHS'],pressureMethod:['HYDROSTATIC','ACI347'],plywoodGrade:['PLYFORM_I','PLYFORM_II','STRUCT_I','CUSTOM'],plywoodSpans:['AUTO','SINGLE','TWO','THREE'],plywoodFaceGrain:['ACROSS','PARALLEL'],tieGrade:['SD40','SR24','CUSTOM'],
  columnModel:['DEMAND_ONLY','PINNED_RING'],cornerRule:['UNKNOWN','LINEAR']} as const;
export const MODEL_FIELDS=Object.keys(defaults) as (keyof Input)[];
export const FIELD_DOC:Record<keyof Input,string>={
  kind:'FOOTING = ฐานราก, COLUMN = เสา',shape:'Plan shape: RECTANGLE or L',
  width:'Overall plan size along X (mm)',length:'Overall plan size along Y (mm)',
  armX:'L shape only: width of the arm along X, must be < width (mm)',armY:'L shape only: width of the arm along Y, must be < length (mm)',
  height:'Concrete pour height (mm)',gamma:'Fresh concrete unit weight (kN/m³), typically 24',
  confirmed:'Geometry confirmed by the user against the drawing. Only set true when the user explicitly confirms; geometry edits reset it to false',
  plywood:'Plywood (ไม้อัด) thickness (mm)',studSpacing:'Max stud (คร่าว) spacing along each face (mm)',
  walerSpacing:'Max waler (คานคู่) level spacing over the height (mm)',tieSpacing:'Max tie spacing along each face (mm)',
  tieDiameter:'Tie rod gross diameter (mm)',rhsB:'Stud RHS width (mm)',rhsH:'Stud RHS depth, perpendicular to the face (mm)',rhsT:'Stud RHS wall thickness (mm)',
  plywoodGrade:'Plywood grade: PLYFORM_I | PLYFORM_II | STRUCT_I (APA V345 values derived from thickness) or CUSTOM (use plywoodE/plywoodFb)',plywoodSpans:'Plywood continuity: AUTO (sheet width / stud spacing, APA rule), SINGLE, TWO or THREE spans',plywoodFaceGrain:'Face grain relative to studs: ACROSS (sheets laid horizontally, strong) or PARALLEL (sheets vertical)',plywoodE:'Plywood E on the gross section (MPa), used only when plywoodGrade = CUSTOM',plywoodFb:'Plywood allowable bending stress on the gross section (MPa), used only when plywoodGrade = CUSTOM',steelFy:'Steel yield Fy (MPa)',
  deflectionRatio:'Deflection limit L/n, value n',steelE:'Steel modulus E (MPa)',steelOmegaB:'Bending safety factor Ωb',steelOmegaShear:'Shear safety factor Ωv',
  walerType:'Waler section: RHS or C (unlipped)',walerB:'Waler flange width (mm)',walerH:'Waler bending depth (mm)',walerT:'Waler thickness (mm)',
  pairShare:'Share of the paired-waler force on the heavier member, 0.5 to 1.0',tieGrade:'Tie grade SD40 / SR24 (fixed Fy/Fu) or CUSTOM',
  tieFy:'Tie Fy (MPa)',tieFu:'Tie Fu (MPa)',tieOmegaYield:'Tie Ω yield',tieOmegaRupture:'Tie Ω rupture',
  tieNetArea:'Tie effective net/thread area Ae (mm²), 0 = unknown',tieAssemblySWL:'Certified tie assembly SWL (kN), 0 = unknown',
  columnModel:'Column yoke model: DEMAND_ONLY or PINNED_RING',yokeOmegaT:'Yoke tension Ω',cornerCapacityX:'Column corner joint capacity X (kN), 0 = unknown',
  cornerCapacityY:'Column corner joint capacity Y (kN), 0 = unknown',cornerRule:'Corner interaction rule: UNKNOWN or LINEAR',cornerReference:'Reference text for the corner joint data (max 300 chars)',
  walerSectionId:"Waler section id from the Thai steel table (box SHS/RHS, angle L, hot-rolled channel C, lipped channel C-LIP, round pipe CHS), e.g. 'PAP-TIS107-RHS-100x50x3.2', 'SYS-TIS1227-L-75x75x6'; '' = use walerType/B/H/t. Setting it fills walerType/B/H/t automatically",
  studSectionId:"Stud section id: timber (e.g. 'TIMBER-38x75-ACTUAL' = 1.5x3 in) or steel box SHS/RHS from TIS 107 (e.g. 'PAP-TIS107-SHS-50x50x2.3'); '' = steel RHS from rhsB/H/t. Setting it fills rhsB/H(/t)",
  pressureMethod:"Lateral concrete pressure: HYDROSTATIC (rho g h, default) or ACI347 (ACI PRC-347-14(21) SI eq. 4.2.2.1b, needs pourRate/concreteTemp/slump/vibrationDepth/chemistryCc)",
  pourRate:"Rate of placement R, m/h (ACI)",concreteTemp:"Concrete temperature at placement T, deg C (ACI, 5-45)",slump:"Slump after all admixtures, mm (>175 mm or SCC -> hydrostatic)",
  vibrationDepth:"Internal vibration depth, m (>1.2 m -> hydrostatic)",chemistryCc:"ACI chemistry coefficient Cc: 1.0 (type I/II/III, no retarder), 1.2, 1.4 or 1.5 (slag/fly ash and/or retarders)",
  studTimberGrade:"Timber class for timber studs: TIMBER-BOOK-VERY_SOFT | TIMBER-BOOK-SOFT | TIMBER-BOOK-MEDIUM | TIMBER-BOOK-HARD | TIMBER-BOOK-VERY_HARD (textbook table 3.4 allowable values)"};
const GEOMETRY:(keyof Input)[]=['kind','shape','width','length','armX','armY','height'];
const GRADES={SD40:{tieFy:390,tieFu:560},SR24:{tieFy:235,tieFu:385}};

/** Applies edits on top of a valid input. Geometry edits drop user confirmation unless it is set explicitly. */
export function applyChanges(base:Input,changes:Partial<Input>):Input{
  const next:Input={...base,...changes};
  // A catalogue waler fixes the geometry; a manual section edit leaves the catalogue.
  if(changes.walerSectionId){const s=sectionById(changes.walerSectionId);if(s)Object.assign(next,{walerType:WALER_TYPE[s.family as keyof typeof WALER_TYPE]??next.walerType,walerB:s.B,walerH:s.H,walerT:s.t});}
  else if(changes.walerSectionId===undefined&&(['walerType','walerB','walerH','walerT'] as const).some(k=>k in changes&&changes[k]!==base[k]))next.walerSectionId='';
  if(changes.studSectionId){const s=sectionById(changes.studSectionId);if(s)Object.assign(next,{rhsB:s.B,rhsH:s.H,...(s.family==='TIMBER'?{}:{rhsT:s.t})});}
  else if(changes.studSectionId===undefined&&(['rhsB','rhsH','rhsT'] as const).some(k=>k in changes&&changes[k]!==base[k]))next.studSectionId='';
  if(changes.tieGrade&&changes.tieGrade!=='CUSTOM'&&changes.tieFy===undefined&&changes.tieFu===undefined)Object.assign(next,GRADES[changes.tieGrade]);
  if(changes.confirmed===undefined&&GEOMETRY.some(k=>k in changes&&changes[k]!==base[k]))next.confirmed=false;
  if(next.shape==='L'&&base.shape!=='L'&&changes.armX===undefined&&changes.armY===undefined){next.armX=Math.round(next.width/2);next.armY=Math.round(next.length/2);}
  return validateInput(next);
}
export type ModelChange={field:keyof Input;value:Input[keyof Input]};
/** Type-checks an untrusted change list (e.g. from an AI reply). Range checks happen in applyChanges/validateInput. */
export function parseModelChanges(raw:unknown):ModelChange[]{
  if(raw===undefined||raw===null)return [];
  if(!Array.isArray(raw)||raw.length>MODEL_FIELDS.length)throw Error('รายการแก้ไขโมเดลไม่ถูกต้อง');
  const seen=new Set<string>();
  return raw.map(item=>{
    const {field,value}=(item??{}) as {field?:unknown;value?:unknown};
    if(typeof field!=='string'||!MODEL_FIELDS.includes(field as keyof Input)||seen.has(field))throw Error('ช่องข้อมูลที่ AI เสนอแก้ไม่รองรับ: '+String(field));
    seen.add(field);
    const k=field as keyof Input,e=(ENUMS as Record<string,readonly string[]>)[k];
    const ok=e?e.includes(value as string):typeof value===typeof defaults[k]&&(typeof value!=='number'||Number.isFinite(value))&&(typeof value!=='string'||value.length<=300);
    if(!ok)throw Error('ค่าที่ AI เสนอสำหรับ '+field+' ไม่ถูกต้อง');
    return {field:k,value:value as Input[keyof Input]};
  });
}
export const changesToInput=(changes:ModelChange[])=>Object.fromEntries(changes.map(c=>[c.field,c.value])) as Partial<Input>;

type V3=[number,number,number];
export type Layer='CONCRETE'|'PLYWOOD'|'STUD'|'WALER'|'TIE';
export const LAYERS:Layer[]=['CONCRETE','PLYWOOD','STUD','WALER','TIE'];
export interface Solid{id:string;layer:Layer;vertices:V3[];triangles:[number,number,number][]}
const add=(a:V3,b:V3):V3=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]],mul=(a:V3,s:number):V3=>[a[0]*s,a[1]*s,a[2]*s];
const cross=(a:V3,b:V3):V3=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
function box(id:string,layer:Layer,o:V3,u:V3,v:V3,w:V3):Solid{
  if(cross(u,v).reduce((s,c,i)=>s+c*w[i],0)<0)[u,v]=[v,u];
  const base=[o,add(o,u),add(add(o,u),v),add(o,v)],vertices=[...base,...base.map(p=>add(p,w))];
  const triangles:[number,number,number][]=[[0,2,1],[0,3,2],[4,5,6],[4,6,7]];
  for(let a=0;a<4;a++){const b=(a+1)%4;triangles.push([a,b,b+4],[a,b+4,a+4]);}
  return {id,layer,vertices,triangles};
}
function prism(id:string,layer:Layer,pts:{x:number;y:number}[],h:number):Solid{
  const n=pts.length,vertices:V3[]=[...pts.map(p=>[p.x,p.y,0] as V3),...pts.map(p=>[p.x,p.y,h] as V3)],triangles:[number,number,number][]=[];
  for(let i=1;i<n-1;i++)triangles.push([0,i+1,i],[n,n+i,n+i+1]);
  for(let a=0;a<n;a++){const b=(a+1)%n;triangles.push([a,b,b+n],[a,b+n,a+n]);}
  return {id,layer,vertices,triangles};
}
const round=(v:number,d=3)=>Math.round(v*10**d)/10**d;

/** Visualization of the screened layout (NTS for details): plywood, studs, paired walers and footing through-ties. */
export function buildScene(r:Result){
  const x=r.input,H=x.height,up:V3=[0,0,1],solids:Solid[]=[prism('concrete','CONCRETE',r.points,H)],warnings:string[]=[];
  const dStud=x.plywood,dWaler=x.plywood+x.rhsH,ext=x.plywood+x.rhsH+x.walerH,gap=x.tieDiameter+6;
  let studLen=0,studCount=0,walerLen=0,walerCount=0,tieLen=0,tieCount=0;
  const levels=r.waler.levels.map(l=>Math.min(Math.max(H-l.depth,gap/2+x.walerB),H-gap/2-x.walerB));
  const exts=walerExtensions(r.points,ext,x.plywood+x.rhsH+x.walerH);
  for(const [fi,f] of r.faces.entries()){
    const {start:e0,end:e1}=exts[fi];
    const a:V3=[f.a.x,f.a.y,0],t:V3=[(f.b.x-f.a.x)/f.length,(f.b.y-f.a.y)/f.length,0],n:V3=[f.normal.x,f.normal.y,0];
    solids.push(box(`plywood_${f.id}`,'PLYWOOD',a,mul(t,f.length),mul(n,x.plywood),mul(up,H)));
    equalPositions(f.length,x.studSpacing).forEach((s,i)=>{
      const c=f.length<=x.rhsB?f.length/2:Math.min(Math.max(s,x.rhsB/2),f.length-x.rhsB/2);
      solids.push(box(`stud_${f.id}_${i+1}`,'STUD',add(add(a,mul(t,c-x.rhsB/2)),mul(n,dStud)),mul(t,x.rhsB),mul(n,x.rhsH),mul(up,H)));
      studLen+=H;studCount++;
    });
    levels.forEach((z,i)=>{for(const [k,z0] of [[1,z+gap/2],[2,z-gap/2-x.walerB]] as const){
      solids.push(box(`waler_${f.id}_L${i+1}_${k}`,'WALER',add(add(add(a,mul(t,-e0)),mul(n,dWaler)),mul(up,z0)),mul(t,f.length+e0+e1),mul(n,x.walerH),mul(up,x.walerB)));
      walerLen+=f.length+e0+e1;walerCount++;
    }});
  }
  if(r.tieRoutes.length){
    const over=ext+50,d=x.tieDiameter;
    for(const t of r.tieRoutes)levels.forEach((z,i)=>{
      const span=t.length+2*over,o:V3=t.axis==='Y'?[t.a.x-d/2,Math.min(t.a.y,t.b.y)-over,z-d/2]:[Math.min(t.a.x,t.b.x)-over,t.a.y-d/2,z-d/2];
      solids.push(box(`tie_${t.id}_L${i+1}`,'TIE',o,t.axis==='Y'?[d,0,0]:[0,d,0],t.axis==='Y'?[0,span,0]:[span,0,0],[0,0,d]));
      tieLen+=span;tieCount++;
    });
    if(r.tieRoutes.some(t=>t.axis==='X')&&r.tieRoutes.some(t=>t.axis==='Y'))
      warnings.push('Ties in X and Y directions are drawn at the same level and clash; a real level offset is not designed yet');
  }
  if(x.shape==='L')warnings.push('Re-entrant corner of the L shape: walers stop short of the corner; corner detail not designed');
  const quantities={concrete_m3:round(r.volume),plywood_m2:round(r.formArea),studs:{count:studCount,totalLength_m:round(studLen/1000,2),section:x.studSectionId?sectionById(x.studSectionId)?.designation??x.studSectionId:`RHS ${x.rhsB}x${x.rhsH}x${x.rhsT}`},
    walers:{members:walerCount,levels:levels.length,totalLength_m:round(walerLen/1000,2),section:`${x.walerSectionId?sectionById(x.walerSectionId)?.designation??x.walerSectionId:`${x.walerType} ${x.walerB}x${x.walerH}x${x.walerT}`} (paired)`},
    ties:{count:tieCount,totalLength_m:round(tieLen/1000,2),diameter_mm:x.tieDiameter}};
  return {solids,quantities,warnings};
}
export type Scene=ReturnType<typeof buildScene>;

export const LAYER_COLORS:Record<Layer,{rgb:V3;aci:number;alpha:number}>={CONCRETE:{rgb:[.7,.7,.7],aci:8,alpha:.35},PLYWOOD:{rgb:[.85,.65,.35],aci:30,alpha:1},
  STUD:{rgb:[.2,.4,.8],aci:5,alpha:1},WALER:{rgb:[.85,.2,.2],aci:1,alpha:1},TIE:{rgb:[.1,.6,.2],aci:3,alpha:1}};
/** OBJ in metres, Y-up (x, z, -y) for common 3D viewers. */
export function toObj(solids:Solid[],name:string){
  const lines=[`# ${NOTICE}`,`# ${name} - units: metres, Y-up`,`mtllib ${name}.mtl`];let offset=1;
  for(const s of solids){
    lines.push(`o ${s.id}`,`usemtl ${s.layer}`,...s.vertices.map(([x,y,z])=>`v ${(x/1000).toFixed(5)} ${(z/1000).toFixed(5)} ${(-y/1000).toFixed(5)}`),
      ...s.triangles.map(t=>`f ${t.map(i=>i+offset).join(' ')}`));
    offset+=s.vertices.length;
  }
  const mtl=Object.entries(LAYER_COLORS).flatMap(([k,c])=>[`newmtl ${k}`,`Kd ${c.rgb.join(' ')}`,`d ${c.alpha}`,'']);
  return {obj:lines.join('\n')+'\n',mtl:mtl.join('\n')};
}
/** ASCII DXF of 3DFACE entities in millimetres, Z-up, one layer per member type. */
export function toDxf(solids:Solid[]){
  const g=(...pairs:(string|number)[])=>pairs.join('\n');
  const layers=Object.entries(LAYER_COLORS).map(([k,c])=>g(0,'LAYER',2,k,70,0,62,c.aci));
  const faces=solids.flatMap(s=>s.triangles.map(t=>{const [p,q,r]=t.map(i=>s.vertices[i]);
    return g(0,'3DFACE',8,s.layer,...[p,q,r,r].flatMap((v,j)=>[10+j,v[0].toFixed(2),20+j,v[1].toFixed(2),30+j,v[2].toFixed(2)]));}));
  return g(999,NOTICE,0,'SECTION',2,'TABLES',0,'TABLE',2,'LAYER',70,layers.length,...layers,0,'ENDTAB',0,'ENDSEC',0,'SECTION',2,'ENTITIES',...faces,0,'ENDSEC',0,'EOF')+'\n';
}
/** Self-contained glTF 2.0 (one coloured mesh per layer, metres, Y-up); opens in Windows 3D Viewer, Blender and web viewers. */
export function toGltf(solids:Solid[],name:string){
  const layers=LAYERS.filter(l=>solids.some(s=>s.layer===l)),chunks:Uint8Array[]=[],bufferViews=[],accessors=[],primitives=[];let offset=0;
  for(const [i,layer] of layers.entries()){
    const pos:number[]=[],idx:number[]=[];
    for(const s of solids.filter(s=>s.layer===layer)){const b=pos.length/3;for(const [x,y,z] of s.vertices)pos.push(x/1000,z/1000,-y/1000);for(const t of s.triangles)idx.push(...t.map(v=>v+b));}
    const p=new Float32Array(pos),q=new Uint32Array(idx),min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
    p.forEach((v,j)=>{min[j%3]=Math.min(min[j%3],v);max[j%3]=Math.max(max[j%3],v);});
    for(const [arr,target] of [[p,34962],[q,34963]] as const){chunks.push(new Uint8Array(arr.buffer));bufferViews.push({buffer:0,byteOffset:offset,byteLength:arr.byteLength,target});offset+=arr.byteLength;}
    accessors.push({bufferView:2*i,componentType:5126,count:p.length/3,type:'VEC3',min,max},{bufferView:2*i+1,componentType:5125,count:q.length,type:'SCALAR'});
    primitives.push({name:layer,primitives:[{attributes:{POSITION:2*i},indices:2*i+1,material:i}]});
  }
  const bytes=new Uint8Array(offset);let o=0;for(const c of chunks){bytes.set(c,o);o+=c.length;}
  let bin='';for(let i=0;i<bytes.length;i+=0x8000)bin+=String.fromCharCode(...bytes.subarray(i,i+0x8000));
  return JSON.stringify({asset:{version:'2.0',generator:'CMG Formwork',copyright:NOTICE},scene:0,scenes:[{name,nodes:layers.map((_,i)=>i)}],
    nodes:layers.map((l,i)=>({name:l,mesh:i})),meshes:primitives,
    materials:layers.map(l=>({name:l,doubleSided:true,...(LAYER_COLORS[l].alpha<1?{alphaMode:'BLEND'}:{}),pbrMetallicRoughness:{baseColorFactor:[...LAYER_COLORS[l].rgb,LAYER_COLORS[l].alpha],metallicFactor:0,roughnessFactor:.9}})),
    accessors,bufferViews,buffers:[{byteLength:offset,uri:'data:application/octet-stream;base64,'+btoa(bin)}]});
}
