import React from 'react';
import {clone} from '../domain/workflowV07/common';
import type {SelectionSnapshot} from '../domain/workflowV07/catalogues';
import {ELASTIC_KEYS, MEMBER_FAMILIES, emptyElasticBinding, resolveElasticBinding, type ElasticMemberBinding, type ElasticMemberRole} from '../domain/workflowV07/elasticBinding';

export type BindingSelections = {section: SelectionSnapshot | null; material: SelectionSnapshot | null};
const show = (v: number | null) => v === null ? 'UNKNOWN' : v.toLocaleString('en-US', {maximumFractionDigits: 5});
const numberValue = (v: unknown) => typeof v === 'number' && Number.isFinite(v) ? v : null;
const referenceText = (v: unknown) => typeof v === 'string' && v.trim() ? v : 'UNKNOWN';
/** Read-only preview of the currently selected reference. It deliberately shows BLOCKED when the source has no mass/weight row. */
export function ElasticReferencePreview({selections}: {selections?: BindingSelections}) {
  const section = selections?.section?.effective, material = selections?.material?.effective;
  if (!section && !material) return <p className="muted">ยังไม่ได้เลือกหน้าตัดและวัสดุจากรายการอ้างอิงด้านบน</p>;
  const ix = numberValue(section?.Ix_cm4), iy = numberValue(section?.Iy_cm4), kg = numberValue(section?.kg_per_m);
  const props = material?.properties && typeof material.properties === 'object' ? material.properties as Record<string, unknown> : null;
  const e = numberValue(props?.E_MPa) ?? numberValue(props?.E0_mean_MPa) ?? numberValue(props?.E_ref_MPa);
  return <div className="notice" aria-label="ค่ามาตรฐานหน้าตัดและวัสดุที่เลือก">
    <b>ค่ามาตรฐานจากรายการที่เลือก</b>
    {section && <p>หน้าตัด {referenceText(section.designation)} · {referenceText(section.family)} · I<sub>x</sub> {ix === null ? 'UNKNOWN' : `${(ix * 10000).toLocaleString('en-US')} mm⁴ (${ix.toLocaleString('en-US')} cm⁴)`} / I<sub>y</sub> {iy === null ? 'UNKNOWN' : `${(iy * 10000).toLocaleString('en-US')} mm⁴ (${iy.toLocaleString('en-US')} cm⁴)`} · DL {kg === null ? 'BLOCKED (ไม่มี kg/m ในแถวอ้างอิง)' : `${(kg * 9.80665 / 1000).toFixed(3)} kN/m`}</p>}
    {material && <p>วัสดุ {referenceText(material.material_id)} · E {e === null ? 'UNKNOWN' : `${e.toLocaleString('en-US')} MPa`} · source {referenceText(material.source_id)}</p>}
    <small>ค่าดังกล่าวเป็น reference snapshot; ต้องผูกแกนและหลักฐานวัสดุจริงก่อนการวิเคราะห์ และสถานะยังเป็น NO_GO</small>
  </div>;
}
export function ElasticBindingSummary({binding, role, label}: {binding: ElasticMemberBinding; role: ElasticMemberRole; label: string}) {
  let result: ReturnType<typeof resolveElasticBinding> | null = null, error = '';
  try {result = resolveElasticBinding(binding, role);} catch (e) {error = (e as Error).message;}
  return <details aria-label={`แหล่งคุณสมบัติสมาชิก ${label}`}><summary>{label} · ผูกข้อมูลหน้าตัด/วัสดุ · NO_GO</summary>
    <p>{binding.sectionMode} · หน้าตัด {String(binding.section?.effective.section_id ?? (binding.sectionMode === 'MEASURED_TIMBER_RECT' ? 'ไม้ขนาดวัดจริง' : 'UNKNOWN'))} · วัสดุ {String(binding.material?.effective.material_id ?? 'UNKNOWN')}</p>
    <p>แกน {show(binding.orientationDeg)}° · ค่า Elastic {binding.elasticPropertyKey ?? 'UNKNOWN'} · หลักฐานแกน {binding.axisEvidenceRef || 'UNKNOWN'}</p>
    {binding.sectionMode === 'MEASURED_TIMBER_RECT' && <p>ขนาดวัดจริง B/H {show(binding.actualWidthMm)} / {show(binding.actualDepthMm)} mm · ชื่อเรียก {binding.nominalLabel || 'ไม่ระบุ'} · หลักฐาน {binding.measurementEvidenceRef || 'UNKNOWN'}</p>}
    <p>จับคู่สินค้า/วัสดุ: {binding.materialMatchEvidenceRef || 'UNKNOWN'} · สภาพใช้งาน: {binding.serviceConditionRef || 'UNKNOWN'}</p>
    {result ? <p>E ที่ใช้ {show(result.E_MPa)} MPa · I ที่ใช้ {show(result.I_mm4)} mm⁴ · A {show(result.areaMm2)} mm² · ยังไม่ตรวจกำลัง/จุดต่อ</p> : <p>BLOCKED · {error}</p>}
    {(['section', 'material'] as const).map(key => {const s = binding[key]; return s && <details key={key}><summary>{key} · {s.mode} · Source {s.provenance.sourceVersion}</summary><p>{s.provenance.reason} · {s.provenance.evidenceRef}</p><pre>{JSON.stringify({original: s.reference, effective: s.effective}, null, 2)}</pre></details>;})}
  </details>;
}
export function ElasticBindingEditor({binding, role, label, selections, onChange}: {binding: ElasticMemberBinding | null; role: ElasticMemberRole; label: string; selections?: BindingSelections; onChange: (value: ElasticMemberBinding | null) => void}) {
  if (!binding) return <section className="elastic-binding"><ElasticReferencePreview selections={selections}/><button className="btn secondary" onClick={() => onChange(emptyElasticBinding())}>ผูกข้อมูลหน้าตัดและวัสดุกับสมาชิกนี้</button></section>;
  const b = binding, props = b.material?.effective.properties as Record<string, unknown> | undefined;
  const category = b.material?.effective.category;
  const keys = ELASTIC_KEYS.filter(k => props && Object.hasOwn(props, k) && (category === 'TIMBER' ? k !== 'E_MPa' : k === 'E_MPa'));
  return <section className="elastic-binding" aria-label={`กำหนดการผูก ${label}`}><h4>ผูกคุณสมบัติกับ {label}</h4>
    <p>คัดลอกข้อมูลที่กดใช้แล้วจากรายการอ้างอิงด้านบน สำเนาที่ผูกจะคงเดิมจนกดคัดลอกใหม่ ค่า E/I คำนวณจากข้อมูลนี้ น้ำหนักตัวเองยังต้องระบุและมีหลักฐานแยก</p><ElasticReferencePreview selections={selections}/>
    <label className="field"><span>แหล่งหน้าตัดของสมาชิก</span><select value={b.sectionMode} onChange={e => onChange({...emptyElasticBinding(), sectionMode: e.target.value as ElasticMemberBinding['sectionMode']})}><option value="CATALOGUE">หน้าตัด Catalog / Custom ที่ผ่านเงื่อนไข Candidate</option><option value="MEASURED_TIMBER_RECT" disabled={!(MEMBER_FAMILIES[role] as readonly string[]).includes('TIMBER_RECT')}>ไม้สี่เหลี่ยม · ใช้ขนาดวัดจริง</option></select></label>
    <button className="btn secondary" disabled={!selections?.material || (b.sectionMode === 'CATALOGUE' && !selections?.section)} onClick={() => onChange({...b,
      section: b.sectionMode === 'CATALOGUE' ? clone(selections!.section!) : null, material: clone(selections!.material!), elasticPropertyKey: null,
      orientationDeg: null, grainParallelToMember: null, materialMatchEvidenceRef: '', serviceConditionRef: '', axisEvidenceRef: ''})}>คัดลอกข้อมูลอ้างอิงที่ใช้แล้วเข้าผูกสมาชิก</button>
    {b.sectionMode === 'MEASURED_TIMBER_RECT' && <div className="form-grid">
      {([['actualWidthMm', 'กว้างไม้วัดจริง B · mm'], ['actualDepthMm', 'ลึกไม้วัดจริง H · mm']] as const).map(([key, text]) => <label className="field" key={key}><span>{text}</span><input type="number" step="any" value={b[key] ?? ''} onChange={e => onChange({...b, [key]: e.target.value === '' ? null : Number(e.target.value)})}/></label>)}
      <label className="field"><span>ชื่อเรียกขนาดไม้ · ไม่ใช้คำนวณ</span><input value={b.nominalLabel} onChange={e => onChange({...b, nominalLabel: e.target.value})}/></label>
      <label className="field"><span>หลักฐานการวัดขนาดไม้จริง</span><input value={b.measurementEvidenceRef} onChange={e => onChange({...b, measurementEvidenceRef: e.target.value})}/></label>
    </div>}
    <div className="form-grid"><label className="field"><span>แกนหน้าตัดที่ผูก · องศา</span><select value={b.orientationDeg ?? ''} onChange={e => onChange({...b, orientationDeg: e.target.value === '' ? null : Number(e.target.value) as 0 | 90, axisEvidenceRef: ''})}><option value="">ยังไม่ระบุ</option><option value="0">0 · Ix / ความลึก H</option><option value="90">90 · Iy / หมุนหน้าตัด</option></select></label>
      <label className="field"><span>คุณสมบัติ E ที่ใช้จากวัสดุ</span><select value={b.elasticPropertyKey ?? ''} onChange={e => onChange({...b, elasticPropertyKey: (e.target.value || null) as ElasticMemberBinding['elasticPropertyKey']})}><option value="">ยังไม่ระบุ</option>{keys.map(k => <option key={k} value={k}>{k} · {props![k] == null ? 'UNKNOWN' : String(props![k])} MPa</option>)}</select></label>
      {([['materialMatchEvidenceRef', 'หลักฐานจับคู่สินค้าจริงกับวัสดุ'], ['serviceConditionRef', 'สภาพใช้งาน/ความชื้นและฐานค่า E'], ['axisEvidenceRef', 'หลักฐานแกนดัดของสมาชิก']] as const).map(([key, text]) => <label className="field" key={key}><span>{text}</span><input value={b[key]} onChange={e => onChange({...b, [key]: e.target.value})}/></label>)}
    </div>
    {category === 'TIMBER' && <label className="field"><span>แนวเสี้ยนตามความยาวสมาชิก</span><select value={b.grainParallelToMember === null ? '' : String(b.grainParallelToMember)} onChange={e => onChange({...b, grainParallelToMember: e.target.value === '' ? null : e.target.value === 'true'})}><option value="">ยังไม่ระบุ</option><option value="true">ตามแนวสมาชิก · ใช้ E ตามเสี้ยน</option><option value="false">ไม่ตามแนว · ยังไม่รองรับแบบจำลอง</option></select></label>}
    <ElasticBindingSummary binding={b} role={role} label={label}/>
    <button className="btn secondary" onClick={() => onChange(null)}>ยกเลิกการผูกและกลับกรอก E/I ใหม่เอง</button>
  </section>;
}
