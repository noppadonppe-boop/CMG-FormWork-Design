import React from 'react';
import type {WorkflowModel} from '../domain/workflowV07/model';

/** Field counts are not engineering verdicts. Show the actual tutorial scope and
 * each category of unavailable evidence beside the populated editable forms. */
export function ProjectExampleGuide({model:m}:{model:WorkflowModel}){
  if(!m.sourceRef?.startsWith('PROJECT-EXAMPLE'))return null;
  const vertical=!!m.soffitLayout,tied=!!m.sideLayout?.ties.length;
  return <details open className="notice" data-testid="project-example-guide"><summary><strong>Project Example · ข้อมูลกรอกตัวอย่างและที่มา</strong></summary>
    <p>มิติและผังเป็นข้อมูลสมมติสำหรับฝึกกรอก แก้ไขได้ทุกช่อง ค่า E / I / น้ำหนักสมาชิกมาจาก PAP-TIS107, วัสดุ STKR400 และไม้อัด UPM007CPR 18 mm ตามหลักฐานในช่องนั้น</p>
    <table><thead><tr><th>ขั้นตอน</th><th>ข้อมูลในร่างนี้</th></tr></thead><tbody>
      <tr><td>รูปทรง / โหลด</td><td>{m.vertices.length} จุดขอบ · สูง {m.heightMm} mm · คอนกรีต {m.gammaKNm3} kN/m³{vertical?` · DL ${m.additionalDeadKPa} / LL ${m.constructionLiveKPa} kPa`:''}</td></tr>
      <tr><td>แบบท้อง</td><td>{m.soffitLayout?`${m.soffitLayout.joistXMm.length} แนวคร่าว · ${m.soffitLayout.bearers.length} คานรับ · ${m.ringlock?.legs.length} U-head พร้อม E / I / น้ำหนัก / ไม้อัด`:'ไม่ใช้ในตัวอย่างแบบข้างนี้'}</td></tr>
      <tr><td>แบบข้าง</td><td>{m.sideLayout?`${m.sideLayout.faces.length} ผิว · ${m.sideLayout.faces.reduce((n,f)=>n+f.walers.length,0)} แนวคานรัด · ${m.sideLayout.ties.length} เส้นไทร์ · ${m.sideTopology}`:'ไม่ใช้ในตัวอย่างแบบท้องพื้นนี้'}</td></tr>
      <tr><td>เฟรม / ฐาน</td><td>{m.frameLayout?`${m.frameLayout.nodes.length} จุด · ${m.frameLayout.elements.length} สมาชิก · ${m.supportLayout?.bases.length??0} ฐาน`:'ไม่มีเฟรมค้ำแนวดิ่งในตัวอย่าง through-tie'}{m.sideTopology==='COLUMN_YOKE'?' · ยึดจุดอ้างอิงสำหรับวิเคราะห์วงรัด ไม่มีฐานลงดิน':''}</td></tr>
      <tr><td>Stage / Load case</td><td>{m.soffitLayout?.stageId??m.sideLayout?.stageId} / {m.soffitLayout?.loadCaseId??m.sideLayout?.loadCaseId} · SERVICE · มีชุดตัวคูณตัวอย่างในขั้นกรณีโหลด</td></tr>
    </tbody></table>
    <p>รายการ “รอตรวจ” รวมทั้งข้อจำกัดการวิเคราะห์และการอนุมัติ จึงไม่ใช่จำนวนช่องว่าง ข้อมูลต่อไปนี้ยังไม่มีหลักฐานจริงและยังเว้นค่ากำลังไว้:</p>
    <ul>
      {tied&&<li>กำลังชุด Form Tie และระยะหลบเหล็กเสริม — ระบุในแบบข้าง / ชุดไทร์</li>}
      {vertical&&<li>Rating ของ Ringlock ตาม configuration และช่วงยืด/ระยะฝังที่อนุญาตของ Jack — ระบุใน Shoring / การประกอบรายขา</li>}
      {m.frameLayout&&<li>กำลังสมาชิก/จุดต่อและเงื่อนไขยึดจริง — เฟรมตัวอย่างใช้สมมติฐานเชิงเส้นตามคำอธิบายในฟิลด์ ไม่ใช่ใบรับรองอุปกรณ์</li>}
      {m.supportLayout&&<li>กำลังรับแรงกด พื้นรองรับ และพุก — ระบุในฐานรองรับ (ยังไม่มี Design Basis หน้างาน)</li>}
      <li>หลักฐานกำลังไม้อัด/สมาชิกตามสภาพใช้งาน และการตรวจ–อนุมัติของผู้รับผิดชอบ</li>
    </ul>
  </details>;
}
