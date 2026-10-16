import type {Input} from '../domain';
/** A labelled section arrangement only: connection, gap, plate and nut sizes are not designed. */
export function AssemblyDetail({x}:{x:Input}){
  if(x.kind==='COLUMN')return <svg viewBox="0 0 650 390" className="assembly-detail" role="img" aria-label="แนวชุดรัดเสาและจุดต่อมุม แบบร่าง">
    <text x="24" y="28" fontSize="13" fill="#173e62">COLUMN YOKE · SCHEMATIC / NTS</text>
    <rect x="220" y="90" width="190" height="190" fill="#eef3f5" stroke="#b9854c" strokeWidth="6"/>
    {[110,155,200,245].map(d=><g key={d}><rect x="208" y={d} width="8" height="8" fill="#3c6688"/><rect x="414" y={d} width="8" height="8" fill="#3c6688"/><rect x={d+115} y="77" width="8" height="8" fill="#3c6688"/><rect x={d+115} y="286" width="8" height="8" fill="#3c6688"/></g>)}
    <g fill="none" stroke="#173e62" strokeWidth="4"><path d="M190 62H440M190 70H440M190 300H440M190 308H440M194 54V316M202 54V316M428 54V316M436 54V316"/></g>
    {[[198,66],[432,66],[198,304],[432,304]].map(([cx,cy],i)=><circle key={i} cx={cx} cy={cy} r="10" fill="#fff3df" stroke="#b98337" strokeDasharray="3 2"/>)}
    <g fill="#173e62" fontSize="11"><text x="26" y="98">Column yoke (柱箍)</text><text x="26" y="118">2 × {x.walerType} {x.walerB}×{x.walerH}×{x.walerT}</text><text x="462" y="178">Plywood (胶合板)</text><text x="462" y="198">t = {x.plywood} mm</text><text x="26" y="245">RHS stud (方管竖楞)</text><text x="26" y="265">{x.rhsB}×{x.rhsH}×{x.rhsT} mm</text><text x="454" y="58">Corner connection</text><text x="454" y="77">(角部连接)</text></g>
    <g fill="none" stroke="#7c92a5"><path d="M130 124L190 105M455 182H413M120 240L208 204M454 82L435 67"/></g>
    <text x="315" y="175" textAnchor="middle" fontSize="12" fill="#60768c">CONCRETE</text><text x="315" y="196" textAnchor="middle" fontSize="11" fill="#60768c">{x.width} × {x.length} mm</text>
    <text x="24" y="357" fontSize="10" fill="#8c6530">ชุดรัดและจุดต่อมุมยังไม่ออกแบบ ภาพนี้แสดงแนวองค์ประกอบ ไม่ใช่แบบติดตั้งที่รับรอง</text><text x="24" y="375" fontSize="10" fill="#8c6530">ต้องตรวจแรงตามมุม การยึดรัด จุดต่อ และเสถียรภาพก่อนกำหนดรายละเอียดผลิต</text>
  </svg>;
  const s=Math.min(1.1,300/(x.plywood+x.rhsH+x.walerH+60),160/(2*x.walerB+40));
  const plyX=190,plyW=x.plywood*s,studX=plyX+plyW,studW=x.rhsH*s,walerX=studX+studW;
  const wW=x.walerH*s,wH=x.walerB*s,gap=35,mid=172,plateX=walerX+wW+12;
  const wall=(y:number)=>x.walerType==='RHS'?<><rect x={walerX} y={y} width={wW} height={wH} fill="#c7d6e2" stroke="#173e62"/><rect x={walerX+x.walerT*s} y={y+x.walerT*s} width={(x.walerH-2*x.walerT)*s} height={(x.walerB-2*x.walerT)*s} fill="white" stroke="#173e62"/></>:<path d={`M${walerX} ${y+wH}V${y}H${walerX+wW}V${y+wH}`} fill="none" stroke="#173e62" strokeWidth={Math.max(1,x.walerT*s)}/>;
  return <svg viewBox="0 0 650 390" className="assembly-detail" role="img" aria-label="รายละเอียดผิวไม้อัด คร่าวเหล็กกล่อง คานคู่ Tie rod นอต และแผ่นรอง แบบร่าง">
    <text x="24" y="28" fontSize="13" fill="#173e62">ASSEMBLY SECTION · SCHEMATIC / NTS</text>
    <rect x="125" y="95" width={plyX-125} height="155" fill="#eef2f4"/>
    <rect x={plyX} y="82" width={plyW} height="180" fill="#b9854c" stroke="#8b642d"/>
    <rect x={studX} y="90" width={studW} height="165" fill="#dce7ef" stroke="#5c7a92"/>
    {wall(mid-gap/2-wH)}{wall(mid+gap/2)}
    <rect x={plateX} y={mid-gap/2-wH-5} width="6" height={2*wH+gap+10} fill="#d2d6db" stroke="#8f99a4" strokeDasharray="3 2"/>
    <line x1="80" y1={mid} x2={plateX+55} y2={mid} stroke="#3488aa" strokeWidth="4"/>
    <rect x={plateX+7} y={mid-9} width="14" height="18" fill="#ced7df" stroke="#6e8597" strokeDasharray="3 2"/>
    <path d={`M${plyX+plyW/2} 78V54H78M${studX+studW/2} 262V286H78M${walerX+wW/2} ${mid-gap/2-wH-5}V58H565M${plateX+3} ${mid+gap/2+wH+7}V293H565M${plateX+20} ${mid+14}L575 242M108 ${mid+4}V218H30`} fill="none" stroke="#7c92a5"/>
    <g fill="#173e62" fontSize="11"><text x="24" y="47">Plywood (胶合板)</text><text x="24" y="66">t = {x.plywood} mm</text><text x="24" y="309">RHS stud (方管竖楞)</text><text x="24" y="327">{x.rhsB} × {x.rhsH} × {x.rhsT} mm</text><text x="480" y="48">Twin waler (双背楞)</text><text x="480" y="68">2 × {x.walerType} {x.walerB}×{x.walerH}×{x.walerT}</text><text x="470" y="310">Bearing plate (垫板)</text><text x="520" y="260">Nut (螺母)</text><text x="24" y="239">Tie rod (对拉螺杆)</text></g>
    <text x="24" y="357" fontSize="10" fill="#8c6530">แสดงแนวองค์ประกอบเท่านั้น ระยะช่องว่าง แผ่นรอง นอต และจุดต่อยังไม่กำหนดสำหรับผลิต</text>
    <text x="24" y="375" fontSize="10" fill="#8c6530">{x.shape==='L'?'รูป L: แสดงชนิดชิ้นส่วนเท่านั้น ยังไม่จับคู่ Tie หรือออกแบบมุมเว้า':'ต้องตรวจพิกัดจริง ระยะเยื้องขอบ และจุดต่อก่อนจัดทำแบบติดตั้ง'}</text>
  </svg>;
}
