import {useState} from 'react';
import type {Result} from '../domain';
import {pointBeamAt,type WalerBay} from '../domain/mechanics';
const f=(n:number,d=2)=>n.toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d});
function BayDiagram({r,bay}:{r:Result;bay:WalerBay}){
  const w=r.waler,loads=bay.loads.map(p=>({...p,force:p.force*w.share}));
  const stations=[...new Set([0,bay.length,bay.deflectionAt,...Array.from({length:61},(_,i)=>i*bay.length/60),...loads.flatMap(p=>[Math.max(0,p.x-1e-6),p.x])])].sort((a,b)=>a-b);
  const values=stations.map(x=>({x,...pointBeamAt(bay.length,loads,r.input.steelE,w.section.I,x)}));
  const plot=(key:'moment'|'shear'|'deflection',baseline:number,maximum:number)=>values.map(v=>`${70+v.x/bay.length*470},${baseline-v[key]/(maximum||1)*35}`).join(' ');
  const maximum=Math.max(...values.map(v=>Math.abs(v.shear)),1e-12);
  return <svg viewBox="0 0 610 360" className="beam-diagram" role="img" aria-label="คานรองรับสองปลาย แรงจุดจากคร่าว และกราฟโมเมนต์ แรงเฉือน การโก่ง">
    <text x="25" y="22" fontSize="12" fill="#173e62">{bay.faceId} · BAY {bay.index} · L = {f(bay.length)} mm · α = {w.share}</text>
    <line x1="70" y1="80" x2="540" y2="80" stroke="#173e62" strokeWidth="5"/>
    <path d="M70 83l-9 16h18z M540 83l-9 16h18z" fill="#7791a5"/>
    {loads.map((p,i)=>{const x=70+p.x/bay.length*470;return <g key={i}><path d={`M${x} 38v35m-4 -7l4 7 4 -7`} stroke="#bd7836" fill="none"/><text x={x} y="34" fontSize="9" textAnchor="middle" fill="#965d28">{f(p.force/1000)} kN</text></g>;})}
    <text x="70" y="115" fontSize="10" fill="#173e62">RA {f(bay.left/1000)} kN</text><text x="540" y="115" fontSize="10" textAnchor="end" fill="#173e62">RB {f(bay.right/1000)} kN</text>
    {[['moment',180,'M',bay.moment,'N·mm'],['shear',255,'V',maximum,'N'],['deflection',330,'δ',bay.deflection,'mm']].map(([key,y,label,max,unit])=><g key={String(key)}><line x1="70" x2="540" y1={Number(y)} y2={Number(y)} stroke="#d9e2eb"/><polyline points={plot(key as 'moment'|'shear'|'deflection',Number(y),Number(max))} fill="none" stroke={key==='moment'?'#173e62':key==='shear'?'#b58039':'#3b8a89'} strokeWidth="2"/><text x="18" y={Number(y)-22} fontSize="12" fill="#173e62">{label}</text><text x="552" y={Number(y)-20} fontSize="9" fill="#63798d">{f(Number(max),1)}</text><text x="552" y={Number(y)-6} fontSize="9" fill="#63798d">{unit}</text></g>)}
  </svg>;
}
export function WalerDetails({r,report=false}:{r:Result;report?:boolean}){
  const [selected,setSelected]=useState(r.waler.bending.faceId);
  const face=r.waler.faces.find(v=>v.faceId===selected)??r.waler.faces[0],w=r.waler;
  const bay=face.bays.reduce((a,b)=>a.moment>=b.moment?a:b),tie=r.tie;
  return <section className={report?'waler-report':'card waler-details'}>
    <h3>เส้นทางแรงของคานคู่ / Tie rod</h3>
    <p className="muted">แรงดันเต็มความสูง pmax → คร่าว → แรงจุดเข้าสู่คานคู่ → จุด Tie ภายใน / จุดรองรับมุม แยกกัน โมเดลคานเป็นช่วงอิสระรองรับสองปลาย</p>
    <div className="load-chain"><span>ไม้อัด (Plywood)</span><span>คร่าว (Stud)</span><span>คานคู่ (Twin waler)</span><span>{r.input.kind==='COLUMN'?(r.input.columnTies?'Tie rod + มุมชุดรัดเสา':'มุมชุดรัดเสา (Yoke corner)'):'Tie rod'}</span></div>
    <div className="form-grid"><div><b>การแบ่งแรงคานคู่</b><p>ตัวที่รับมาก α = {w.share} ({f(w.share*100,0)}%)<br/>ตัวอีกด้าน 1 − α = {f(1-w.share,2)}<br/>ไม่ใช้การรวม I ของคานสองตัวเป็นหน้าตัดเดียว</p></div><div><b>หน้าตัดคานหนึ่งตัว · มุมคมสมมติ</b><p>{r.input.walerType} {r.input.walerB} × {r.input.walerH} × {r.input.walerT} mm<br/>I = {f(w.section.I,0)} mm⁴ · S = {f(w.section.S,0)} mm³<br/>Av = {f(w.section.shearArea)} mm²</p></div></div>
    {!report&&<div className="face-buttons" aria-label="เลือกด้านคาน">{w.faces.map(q=><button key={q.faceId} className={face.faceId===q.faceId?'btn':'btn secondary'} onClick={()=>setSelected(q.faceId)}>{q.faceId}</button>)}</div>}
    <BayDiagram r={r} bay={report?w.bending:bay}/>
    <p>ตำแหน่งแรงคร่าวภายในช่วง: {(report?w.bending:bay).loads.map(q=>`${f(q.x)} mm / ${f(q.force/1000)} kN ต่อคานทั้งคู่`).join('; ')||'ไม่มีแรงจุดภายในช่วง แรงเข้าจุดรองรับโดยตรง'}</p>
    <div className="table-scroll"><table><thead><tr><th>ด้าน</th><th>ระยะคร่าวจริง</th><th>ระยะรองรับจริง</th><th>ΣP (kN)</th><th>ΣR (kN)</th><th>R มุมสูงสุด</th><th>R Tie สูงสุด</th></tr></thead><tbody>{w.faces.map(q=><tr key={q.faceId}><td>{q.faceId}</td><td>{f(q.studSpacing)} mm</td><td>{f(q.supportSpacing)} mm</td><td>{f(q.totalLoad/1000)}</td><td>{f(q.reactionSum/1000)}</td><td>{f(Math.max(...q.supports.filter(s=>s.role==='CORNER').map(s=>s.force))/1000)} kN</td><td>{f(Math.max(0,...q.supports.filter(s=>s.role==='TIE').map(s=>s.force))/1000)} kN</td></tr>)}</tbody></table></div>
    {!report&&<details><summary>ตำแหน่งและแรงรองรับด้าน {face.faceId}</summary><div className="table-scroll"><table><thead><tr><th>ตำแหน่งจากต้นด้าน</th><th>ชนิด</th><th>แรงคานทั้งคู่</th></tr></thead><tbody>{face.supports.map(s=><tr key={s.position}><td>{f(s.position)} mm</td><td>{s.role==='TIE'?'TIE (对拉螺杆)':'CORNER (角部支承)'}</td><td>{f(s.force/1000)} kN</td></tr>)}</tbody></table></div></details>}
    <details open={report}><summary>ระดับคาน / แถบรับแรง</summary><p>z วัดลงจากผิวบน แรงวิเคราะห์ใช้ pmax คงที่ทุกแถบ เป็นซองแรงคัดกรอง ไม่ใช่ผลรวมแรงดันสามเหลี่ยมจริง ระดับ 0 และ H เป็นตำแหน่งรองรับเชิงอุดมคติ ต้องกำหนดระยะเยื้องขอบจริงก่อนติดตั้ง</p><div className="table-scroll"><table><thead><tr><th>z (mm)</th><th>hv (mm)</th><th>w = pmax hv (N/mm)</th></tr></thead><tbody>{w.levels.map(z=><tr key={z.depth}><td>{f(z.depth)}</td><td>{f(z.tributary)}</td><td>{f(z.lineLoad,3)}</td></tr>)}</tbody></table></div></details>
    {tie?<div className="tie-summary"><h4>Tie rod · {r.input.tieGrade} · Ø{r.input.tieDiameter} mm</h4><p>T = <b>{f(tie.force)} kN</b> จาก {tie.faceId} · ระยะระหว่างผิวคอนกรีต {f(tie.length,0)} mm<br/>Ø ขั้นต่ำเฉพาะการครากตัวเหล็ก = {f(tie.requiredGrossDiameter)} mm · ขนาดตัวอย่าง Ø{tie.bodyCandidate??'เกินช่วง 40'} mm<br/>Ae ที่ต้องการสำหรับ rupture screen = {f(tie.requiredEffectiveArea)} mm²<br/>กำลังคัดกรองรวมจากค่าที่ป้อน = <b>{tie.capacity===null?'ยังไม่ทราบ Ae / SWL':f(tie.capacity)+' kN'}</b></p><p className="muted">ขนาดตัวอย่างตรวจเฉพาะตัวเหล็ก ไม่ใช่การเลือกชุด Tie rod ที่ใช้งานได้ การยืดคัดกรองใช้ Ag และระยะผิวคอนกรีต ไม่รวมส่วนเกลียว/ความยาวนอกแบบ Ae และ SWL ต้องตรวจหลักฐาน และยังต้องตรวจจุดต่อทั้งหมด</p></div>:<div className="notice">{r.input.kind==='COLUMN'?'เสาตรวจแรงคานด้านระหว่างจุดรองรับมุม ไม่ใช้สูตร Tie ทะลุฐานรากแทนชุดรัดเสา':r.input.shape==='L'?'รูปตัว L ตรวจคานด้านระหว่างจุดรองรับมุมเท่านั้น ยังไม่จับคู่ Tie ข้ามรูปทรง':'ไม่มีจุด Tie ภายในด้านตามระยะที่เลือก ต้องออกแบบจุดรองรับมุม'}</div>}
  </section>;
}
