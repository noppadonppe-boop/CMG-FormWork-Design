import React from 'react';
import jointText from '../reference/workflow-v07/ringlock-joint-system-reference-2026-10-15.json?raw';
import contractText from '../reference/workflow-v07/ringlock-analysis-contract-2026-10-15.json?raw';
import publicCaptureText from '../reference/workflow-v07/public-reference-capture-2026-10-18.json?raw';

const joint = JSON.parse(jointText) as {
  schema_version: string; checked_on: string;
  scope: {manufacturer: string; approval: string};
  sources: {id: string; url: string; sha256: string}[];
  ledger_joint: {basis: string; single_action_limits: Record<string,number|string>};
  brace_reference_rows: {rows: {bay_mm:number; lift_mm:number; NcRd_N:number; NtRd_N:number}[]};
};
const contract = JSON.parse(contractText) as {checks: {id:string; required_inputs:string[]; method:string}[]};
const publicCapture = JSON.parse(publicCaptureText) as {
  checked_on: string;
  sources: {id: string; title: string; url: string}[];
  form_tie_public_values: {product_label: string; publisher_value: number; publisher_value_unit: string; publisher_value_label: string; status: string}[];
  ringlock_public_values: {
    standard_axial_loads: {ledger_spacing_m: number; compression_kN: number; tension_kN: number}[];
    diagonal_bay_brace_2m_lift: {bay_length_m: number; tension_kN: number; compression_kN: number}[];
    stated_factors: {gamma_M: number; gamma_F: number};
    status: string;
  };
};
const titles: Record<string,string> = {LOAD_PATH:'เส้นทางถ่ายแรงถึง U-head', GLOBAL_STABILITY:'เสถียรภาพรวมและผลอันดับสอง', STANDARD_N_M_V:'เสาตั้งรับแรงอัด ดัด และเฉือน', LEDGER_MEMBER:'สมาชิก Ledger', BRACE_T_C:'ทแยงรับแรงดึงและอัด', LEDGER_ROSETTE:'จุดต่อ Ledger–Rosette', ROSETTE_WELD:'วงแหวนและรอยเชื่อม', SPIGOT:'รอยต่อเสา Spigot', JACK_HEAD_BASE:'U-head และ Base jack', SUPPORT_CONTACT:'ฐานรองรับและการสัมผัส', SLS:'การเคลื่อนตัวและการทรุด', STAGE_RELEASE:'ขั้นตอนตั้ง เท รื้อ และค้ำกลับ'};
const limits: Record<string,string> = {My_positive_Nmm:'My บวก (N·mm)',My_negative_magnitude_Nmm:'ขนาด My ลบ (N·mm)',Vz_magnitude_N:'Vz (N)',Mz_magnitude_Nmm:'Mz (N·mm)',Vy_magnitude_N:'Vy (N)',N_magnitude_N:'N (N)',O_ledger_torsion_magnitude_Nmm:'แรงบิด O-ledger (N·mm)',U_ledger_torsion:'แรงบิด U-ledger'};
export function RinglockSystemReferences() {
  return <details className="ringlock-system-references"><summary>ข้อมูลจุดต่ออ้างอิงและรายการตรวจระบบค้ำยัน</summary>
    <p>ข้อมูล {joint.checked_on} · ตัวอย่าง {joint.scope.manufacturer} / {joint.scope.approval} ใช้เตรียมโครงสร้างข้อมูลเท่านั้น ยังไม่จับคู่กับผู้จำหน่ายไทย</p>
    <details><summary>ข้อมูลสาธารณะที่เก็บล่าสุด · แก้/เพิ่มข้อมูลโครงการได้</summary>
      <p>ชุดข้อมูล {publicCapture.checked_on} เป็นข้อมูลอ้างอิงจากผู้ผลิต/ผู้จำหน่าย ใช้เติมทะเบียนสินค้าและหลักฐานเท่านั้น ไม่ถูกแปลงเป็นกำลังโครงการอัตโนมัติ · สถานะ {publicCapture.ringlock_public_values.status}</p>
      <h4>Ringlock Doka · ตารางที่ผู้ผลิตเผยแพร่</h4>
      <p>γM = {publicCapture.ringlock_public_values.stated_factors.gamma_M} · γF = {publicCapture.ringlock_public_values.stated_factors.gamma_F}</p>
      <table aria-label="Doka Ringlock public standard loads"><thead><tr><th>Ledger spacing · m</th><th>Compression · kN</th><th>Tension · kN</th></tr></thead><tbody>{publicCapture.ringlock_public_values.standard_axial_loads.map(row => <tr key={row.ledger_spacing_m}><td>{row.ledger_spacing_m}</td><td>{row.compression_kN}</td><td>{row.tension_kN}</td></tr>)}</tbody></table>
      <table aria-label="Doka Ringlock public brace loads"><thead><tr><th>Bay · m</th><th>Tension · kN</th><th>Compression · kN</th></tr></thead><tbody>{publicCapture.ringlock_public_values.diagonal_bay_brace_2m_lift.map(row => <tr key={row.bay_length_m}><td>{row.bay_length_m}</td><td>{row.tension_kN}</td><td>{row.compression_kN}</td></tr>)}</tbody></table>
      <h4>Form Tie / Inner Unit · Novocon</h4>
      <table aria-label="Novocon public form tie values"><thead><tr><th>สินค้า</th><th>ค่าที่เผยแพร่</th><th>สถานะ</th></tr></thead><tbody>{publicCapture.form_tie_public_values.map(row => <tr key={row.product_label}><td>{row.product_label}</td><td>{row.publisher_value} {row.publisher_value_unit} · {row.publisher_value_label}</td><td>{row.status}</td></tr>)}</tbody></table>
      <p>ข้อมูลนี้ยังไม่ใช่กำลังชุด Inner–Outer–End connection–Nut–Plate และยังต้องเลือกผู้ผลิต/รุ่น/ล็อตจริง ผู้ใช้แก้หรือเพิ่มข้อมูลได้ในทะเบียนผู้จำหน่าย Ringlock และทะเบียน Form Tie ของแต่ละแนวไทร์</p>
      <ul>{publicCapture.sources.map(source => <li key={source.id}><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a></li>)}</ul>
    </details>
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
