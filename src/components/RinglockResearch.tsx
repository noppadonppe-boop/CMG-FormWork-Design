import React from 'react';
import {RinglockSupplierFields, RinglockSupplierSummary} from './RinglockSuppliers';
import {RinglockSystemReferences} from './RinglockSystemReferences';
import {emptyRinglockResearchChoice, referenceSectionIds, type RinglockResearchChoice, type RinglockResearchData, type RinglockResearchSnapshot, type RinglockRole, type screenRinglockResearch} from '../domain/workflowV07/ringlockResearch';

type Summary = ReturnType<typeof screenRinglockResearch>;
const show = (value: unknown) => typeof value === 'number' ? value.toLocaleString('en-US', {maximumFractionDigits: 4}) : 'UNKNOWN';
export function RinglockResearchFields({data, snapshot, onChange, onPendingChange}: {data: RinglockResearchData; snapshot: RinglockResearchSnapshot | null; onChange: (choice: RinglockResearchChoice) => void; onPendingChange?: (pending: boolean) => void}) {
  const choice = snapshot?.choice ?? emptyRinglockResearchChoice(), group = data.product_reference_groups.find(g => g.id === choice.groupId) ?? null;
  const sections = data.sections.filter(s => referenceSectionIds(group, choice.role).includes(String(s.id)));
  return <fieldset className="ringlock-plan"><legend>ข้อมูล Ringlock อัปเดต · อ้างอิง/สมมติฐาน</legend>
    <p>ข้อมูลค้นคว้า {data.checked_on} · {data.sections.length} หน้าตัด / {data.material_grade_references.length} เกรดอ้างอิง · ยังไม่ยืนยันสินค้าจริงและชุดกำลัง</p>
    <RinglockSupplierFields value={choice.supplierCatalogue ?? null} onChange={supplierCatalogue => onChange({...choice, supplierCatalogue})} onPendingChange={onPendingChange}/>
    <RinglockSystemReferences/>
    <label className="field"><span>กลุ่มสินค้าอ้างอิง Ringlock</span><select value={choice.groupId ?? ''} onChange={e => onChange({...emptyRinglockResearchChoice(), groupId: e.target.value || null, ...(choice.supplierCatalogue ? {supplierCatalogue:choice.supplierCatalogue} : {})})}>
      <option value="">ยังไม่เลือก</option>{data.product_reference_groups.map(g => <option key={String(g.id)} value={String(g.id)}>{String(g.id)} · {String(g.module_family ?? 'ต้องยืนยันโมดูล')}</option>)}
    </select></label>
    <label className="field"><span>หน้าที่ชิ้นส่วน Ringlock</span><select value={choice.role ?? ''} onChange={e => onChange({...choice, role: (e.target.value || null) as RinglockRole | null, sectionId: null})}>
      <option value="">ยังไม่เลือก</option><option value="STANDARD">เสาตั้ง Standard</option><option value="LEDGER">คานแนวนอน Ledger</option><option value="DIAGONAL_BRACE">ค้ำเฉียง Diagonal brace</option>
    </select></label>
    <label className="field"><span>หน้าตัดท่อตามกลุ่มสินค้าและหน้าที่</span><select value={choice.sectionId ?? ''} onChange={e => onChange({...choice, sectionId: e.target.value || null})}>
      <option value="">ยังไม่เลือก/ยังไม่มีหลักฐาน</option>{sections.map(s => <option key={String(s.id)} value={String(s.id)}>{String(s.id)} · Nominal gross</option>)}
    </select></label>
    {choice.groupId && choice.role && !sections.length && <p role="status">กลุ่มนี้ยังไม่ระบุหน้าตัดสำหรับหน้าที่ที่เลือก ต้องใช้หลักฐานของผู้จำหน่าย ห้ามยืมหน้าตัดจากอีกกลุ่มมาแทน</p>}
    <label className="field"><span>เกรดวัสดุอ้างอิงสำหรับสมมติฐาน (ยังไม่จับคู่สินค้าจริง)</span><select value={choice.materialGrade ?? ''} onChange={e => onChange({...choice, materialGrade: e.target.value || null})}>
      <option value="">ยังไม่เลือก</option>{data.material_grade_references.map(m => <option key={String(m.grade)} value={String(m.grade)}>{String(m.grade)} · เหล็กวัตถุดิบอ้างอิง ≤ {String(m.thickness_max_mm)} mm</option>)}
    </select></label>
    <label className="confirm"><input type="checkbox" checked={choice.useElasticReference} onChange={e => onChange({...choice, useElasticReference: e.target.checked})}/>เลือกชุด Elastic อ้างอิง Eurocode สำหรับร่าง (E = {show(data.elastic_reference_set.E_MPa)} MPa · ยังต้องเลือก Design Basis)</label>
    <label className="field"><span>เหตุผล/หลักฐานของสมมติฐาน Ringlock</span><input value={choice.hypothesisRef} onChange={e => onChange({...choice, hypothesisRef: e.target.value})}/></label>
    <p>Fy/Fu เป็นสมบัติวัสดุ การเลือกหน้านี้ยังไม่คำนวณกำลังเสา ค้ำเฉียง หรือจุดต่อ และไม่ใช้แทนกำลังตาม Configuration</p>
  </fieldset>;
}
export function RinglockResearchSummary({snapshot, summary}: {snapshot: RinglockResearchSnapshot | null; summary: Summary | null}) {
  if (!snapshot || !summary) return null;
  const {group, section, material, elastic} = snapshot;
  return <section aria-label="ข้อมูล Ringlock อ้างอิงที่เลือกไว้ในฉบับร่าง"><h3>Ringlock · Reference only / NO_GO</h3>
    {snapshot.choice.supplierCatalogue && summary.supplierReference && <RinglockSupplierSummary state={snapshot.choice.supplierCatalogue} summary={summary.supplierReference}/>}
    <p>{snapshot.sourceVersion} · {String(group?.id ?? 'ยังไม่เลือกกลุ่ม')} · {snapshot.choice.role ?? 'ยังไม่เลือกหน้าที่'}</p>
    <p>ชุดข้อมูล SHA-256 <code>{snapshot.sourceSha256}</code></p>
    <table><thead><tr><th>คุณสมบัติอ้างอิง</th><th>ค่าและหน่วย</th></tr></thead><tbody>
      <tr><td>หน้าตัดท่อ Nominal gross</td><td>{String(section?.id ?? 'UNKNOWN')}</td></tr>
      <tr><td>OD / ความหนา</td><td>{show(summary.gross?.D_mm)} / {show(summary.gross?.t_mm)} mm</td></tr>
      <tr><td>A / I (ทั้งสองแกน)</td><td>{show(summary.gross?.A_mm2)} mm² / {show(summary.gross?.I_mm4)} mm⁴</td></tr>
      <tr><td>W elastic / r</td><td>{show(summary.gross?.Wel_mm3)} mm³ / {show(summary.gross?.r_mm)} mm</td></tr>
      <tr><td>สมมติฐานเกรดวัตถุดิบ</td><td>{String(material?.grade ?? 'UNKNOWN')} · Fy min {show(material?.Fy_min_MPa)} MPa / Fu min {show(material?.Fu_min_MPa)} MPa</td></tr>
      <tr><td>ชุด Elastic ที่เลือก</td><td>E {show(elastic?.E_MPa)} / G {show(elastic?.G_MPa)} MPa</td></tr>
    </tbody></table>
    <p>เหตุผล/หลักฐานสมมติฐาน: {snapshot.choice.hypothesisRef || 'ยังไม่ระบุ'}</p>
    {summary.planMatches && <p>โมดูลตามป้าย Ledger ของกลุ่มอ้างอิง: X {summary.planMatches.x ? 'ตรงป้าย' : 'ไม่ตรง/ไม่มีข้อมูล'} · Y {summary.planMatches.y ? 'ตรงป้าย' : 'ไม่ตรง/ไม่มีข้อมูล'} · ยังไม่ใช่การยืนยัน Brace/จุดต่อ/สินค้าจริง</p>}
    <p>หน้าตัดท่อตรงยังไม่หักรู ปลายบี้ ความคลาดเคลื่อนหรือการกัดกร่อน ค่ากำลังจุดต่อของผู้ผลิตอื่นยังไม่ถูกนำมาใช้กับชุดนี้</p>
    <details><summary>แหล่งอ้างอิงที่เก็บกับร่าง ({snapshot.sources.length})</summary><ul>{snapshot.sources.map(s => <li key={String(s.id)}><a href={String(s.url)} target="_blank" rel="noreferrer">{String(s.title)}</a> · {String(s.location ?? s.verified_scope ?? '')}</li>)}</ul></details>
  </section>;
}
