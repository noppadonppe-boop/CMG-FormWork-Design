import React from 'react';
import jointText from '../reference/workflow-v07/ringlock-joint-system-reference-2026-10-15.json?raw';
import contractText from '../reference/workflow-v07/ringlock-analysis-contract-2026-10-15.json?raw';

const joint = JSON.parse(jointText) as {
  schema_version: string; checked_on: string;
  scope: {manufacturer: string; approval: string};
  sources: {id: string; url: string; sha256: string}[];
  ledger_joint: {basis: string; single_action_limits: Record<string,number|string>};
  brace_reference_rows: {rows: {bay_mm:number; lift_mm:number; NcRd_N:number; NtRd_N:number}[]};
};
const contract = JSON.parse(contractText) as {checks: {id:string; required_inputs:string[]; method:string}[]};
const titles: Record<string,string> = {LOAD_PATH:'เส้นทางถ่ายแรงถึง U-head', GLOBAL_STABILITY:'เสถียรภาพรวมและผลอันดับสอง', STANDARD_N_M_V:'เสาตั้งรับแรงอัด ดัด และเฉือน', LEDGER_MEMBER:'สมาชิก Ledger', BRACE_T_C:'ทแยงรับแรงดึงและอัด', LEDGER_ROSETTE:'จุดต่อ Ledger–Rosette', ROSETTE_WELD:'วงแหวนและรอยเชื่อม', SPIGOT:'รอยต่อเสา Spigot', JACK_HEAD_BASE:'U-head และ Base jack', SUPPORT_CONTACT:'ฐานรองรับและการสัมผัส', SLS:'การเคลื่อนตัวและการทรุด', STAGE_RELEASE:'ขั้นตอนตั้ง เท รื้อ และค้ำกลับ'};
const limits: Record<string,string> = {My_positive_Nmm:'My บวก (N·mm)',My_negative_magnitude_Nmm:'ขนาด My ลบ (N·mm)',Vz_magnitude_N:'Vz (N)',Mz_magnitude_Nmm:'Mz (N·mm)',Vy_magnitude_N:'Vy (N)',N_magnitude_N:'N (N)',O_ledger_torsion_magnitude_Nmm:'แรงบิด O-ledger (N·mm)',U_ledger_torsion:'แรงบิด U-ledger'};
export function RinglockSystemReferences() {
  return <details className="ringlock-system-references"><summary>ข้อมูลจุดต่ออ้างอิงและรายการตรวจระบบค้ำยัน</summary>
    <p>ข้อมูล {joint.checked_on} · ตัวอย่าง {joint.scope.manufacturer} / {joint.scope.approval} ใช้เตรียมโครงสร้างข้อมูลเท่านั้น ยังไม่จับคู่กับผู้จำหน่ายไทย</p>
    <details><summary>ตัวอย่างกำลังจุดต่อเฉพาะผลิตภัณฑ์ AT-PAC</summary>
      <p>ฐานกำลัง {joint.ledger_joint.basis} · ต้องตรวจแรงร่วม เครื่องหมายแกน และเงื่อนไขจากเอกสารฉบับเต็ม ตารางนี้ยังไม่ถูกใช้เป็นกำลัง Allowable หรือกำลังระบบของสินค้าที่เลือก</p>
      <table><thead><tr><th>ขีดจำกัดรายแรง</th><th>ค่าอ้างอิง</th></tr></thead><tbody>{Object.entries(joint.ledger_joint.single_action_limits).map(([k,v]) => <tr key={k}><td>{limits[k] ?? k}</td><td>{typeof v === 'number' ? v.toLocaleString('en-US') : 'ไม่อนุญาตให้ถ่ายแรงบิด'}</td></tr>)}</tbody></table>
      <p>ตัวอย่างทแยงในเอกสารใช้ bay 1090 / 1570 มม. ไม่ปรับเทียบเป็น 1200 / 1500 มม. โดยอัตโนมัติ</p>
      <ul>{joint.sources.map(s => <li key={s.id}><a href={s.url} target="_blank" rel="noreferrer">เอกสาร {s.id}</a> · SHA-256 <code>{s.sha256}</code></li>)}</ul>
    </details>
    <details><summary>รายการที่ต้องครอบคลุมในการวิเคราะห์ ({contract.checks.length})</summary>
      <p>แต่ละรายการต้องผูกกับชิ้นส่วน กรณีโหลด ขั้นตอนก่อสร้าง และฉบับข้อมูลจริง การมีรายการนี้ยังไม่หมายถึงตรวจครบแล้ว</p>
      <ul>{contract.checks.map(c => <li key={c.id}>{titles[c.id] ?? c.id}<details><summary>ข้อมูลและแนวทางตรวจ</summary><p>{c.required_inputs.join(' · ')}</p><p>{c.method}</p></details></li>)}</ul>
    </details>
  </details>;
}
