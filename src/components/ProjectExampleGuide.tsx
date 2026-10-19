import React from 'react';
import type {WorkflowModel} from '../domain/workflowV07/model';

/** Field counts are not engineering verdicts. Show the actual tutorial scope and
 * each category of unavailable evidence beside the populated editable forms. */
export function ProjectExampleGuide({model:m}:{model:WorkflowModel}){
  if(!m.sourceRef?.startsWith('PROJECT-EXAMPLE'))return null;
  const vertical=!!m.soffitLayout;
  return <details open className="notice" data-testid="project-example-guide"><summary><strong>Project Example · ข้อมูลกรอกตัวอย่างและที่มา</strong></summary>
    <p>มิติและผังเป็นข้อมูลสมมติสำหรับฝึกกรอก แก้ไขได้ทุกช่อง ค่า E / I / น้ำหนักสมาชิกมาจาก PAP-TIS107, วัสดุ STKR400 และไม้อัด UPM007CPR 18 mm ตามหลักฐานในช่องนั้น</p>
    <table><thead><tr><th>ขั้นตอน</th><th>ข้อมูลในร่างนี้</th></tr></thead><tbody>
      <tr><td>รูปทรง / โหลด</td><td>{m.vertices.length} จุดขอบ · สูง {m.heightMm} mm · คอนกรีต {m.gammaKNm3} kN/m³{vertical?` · DL ${m.additionalDeadKPa} / LL ${m.constructionLiveKPa} kPa`:''}</td></tr>
      <tr><td>แบบท้อง</td><td>{m.soffitLayout?`${m.soffitLayout.joistXMm.length} แนวคร่าว · ${m.soffitLayout.bearers.length} คานรับ · ${m.ringlock?.legs.length} U-head พร้อม E / I / น้ำหนัก / ไม้อัด`:'ไม่ใช้ในตัวอย่างแบบข้างนี้'}</td></tr>
      <tr><td>แบบข้าง</td><td>{m.sideLayout?`${m.sideLayout.faces.length} ผิว · ${m.sideLayout.faces.reduce((n,f)=>n+f.walers.length,0)} แนวคานรัด · ${m.sideLayout.ties.length} เส้นไทร์ · ${m.sideTopology}`:'ไม่ใช้ในตัวอย่างแบบท้องพื้นนี้'}</td></tr>
      <tr><td>เฟรม / ฐาน</td><td>{m.frameLayout?`${m.frameLayout.nodes.length} จุด · ${m.frameLayout.elements.length} สมาชิก · ${m.supportLayout?.bases.length??0} ฐาน`:'ไม่มีเฟรมค้ำแนวดิ่งในตัวอย่าง through-tie'}{m.sideTopology==='COLUMN_YOKE'?' · ยึดจุดอ้างอิงสำหรับวิเคราะห์วงรัด ไม่มีฐานลงดิน':''}</td></tr>
      <tr><td>Stage / Load case</td><td>{m.soffitLayout?.stageId??m.sideLayout?.stageId} / {m.soffitLayout?.loadCaseId??m.sideLayout?.loadCaseId} · SERVICE · มีชุดตัวคูณตัวอย่างในขั้นกรณีโหลด</td></tr>
    </tbody></table>
    <p><strong>ข้อมูล Mock-up:</strong> ใส่ค่าฝึกกรอกสำหรับกำลังสมาชิก ชุดไทร์ 30 kN ค้ำยัน 30 kN/ขา พุก 20 kN และพื้นรองรับ 3 MPa ตามส่วนที่ใช้ในแต่ละระบบแล้ว พร้อมที่มาในฟิลด์และแก้ไขได้</p>
    <p>EX-DB-01 (MOCK) คือ Design Basis สมมติของตัวอย่าง: เกณฑ์โก่ง min(L/360, 3 mm), พื้นเดิมหนา 200 mm, คอนกรีต 24 MPa อายุ 28 วัน ส่วน REFERENCE_ONLY คือสถานะข้อมูลอ้างอิง ตัวอย่างไม่ได้ลงลายเซ็นแทนผู้ตรวจ รายการ “รอตรวจ” เป็นผลตรวจและการอนุมัติ ไม่ใช่จำนวนช่องว่าง</p>
  </details>;
}
