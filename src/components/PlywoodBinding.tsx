import React from 'react';
import {clone} from '../domain/workflowV07/common';
import type {SelectionSnapshot} from '../domain/workflowV07/catalogues';
import {emptyPlywoodBinding, resolvePlywoodElastic, type PlywoodProductBinding} from '../domain/workflowV07/plywood';
const show = (v: number | null) => v === null ? 'UNKNOWN' : v.toLocaleString('en-US', {maximumFractionDigits: 5});
type Context = {binding: PlywoodProductBinding; thicknessMm: number | null; grainRelativeDeg: 0 | 90 | null; label: string};
export function PlywoodBindingSummary({binding, thicknessMm, grainRelativeDeg, label}: Context) {
  let result: ReturnType<typeof resolvePlywoodElastic> | null = null, error = '';
  try {result = resolvePlywoodElastic({binding, thicknessMm, grainRelativeDeg, effectiveE_MPa: null, evidenceRef: ''});} catch (e) {error = (e as Error).message;}
  return <details aria-label={`ผลิตภัณฑ์ไม้อัดที่ผูก ${label}`}><summary>{label} · PLYWOOD / FULL PANEL GROSS / NO_GO</summary>
    <p>{String(binding.material?.effective.material_id ?? 'UNKNOWN')} · หนาจริง {show(thicknessMm)} mm · เสี้ยนทำมุมกับช่วงพาด {show(grainRelativeDeg)}°</p>
    <p>แกนขนานเสี้ยนที่ระบุ {binding.parallelToGrainKey ?? 'UNKNOWN'} · หลักฐาน {binding.axisMappingEvidenceRef || 'UNKNOWN'}</p>
    <p>จับคู่สินค้า {binding.productMatchEvidenceRef || 'UNKNOWN'} · สภาพใช้งาน {binding.serviceConditionRef || 'UNKNOWN'}</p>
    {result ? <p>E ที่ใช้ {show(result.E_MPa)} MPa จาก {result.selectedKey} · I แถบ 1 m {show(result.I_mm4)} mm⁴ · ยังไม่ตรวจกำลัง/rolling shear/จุดต่อ</p> : <p>BLOCKED · {error}</p>}
    {binding.material && <details><summary>{binding.material.mode} · Source {binding.material.provenance.sourceVersion}</summary><p>{binding.material.provenance.reason} · {binding.material.provenance.evidenceRef}</p><pre>{JSON.stringify({original: binding.material.reference, effective: binding.material.effective}, null, 2)}</pre></details>}
  </details>;
}
export function PlywoodBindingEditor({binding, thicknessMm, grainRelativeDeg, label, materialSelection, onChange}: Omit<Context, 'binding'> & {binding: PlywoodProductBinding | null; materialSelection?: SelectionSnapshot | null; onChange: (next: PlywoodProductBinding | null) => void}) {
  if (!binding) return <section className="elastic-binding"><button className="btn secondary" onClick={() => onChange(emptyPlywoodBinding())}>ผูกผลิตภัณฑ์ไม้อัดกับแถบนี้</button></section>;
  const b = binding;
  return <section className="elastic-binding" aria-label={`กำหนดผลิตภัณฑ์ไม้อัด ${label}`}><h4>ผลิตภัณฑ์ไม้อัด · {label}</h4>
    <p>ใช้ค่า Eb ของผลิตภัณฑ์กับหน้าตัดเต็ม 1 m ระบุแกนจากหลักฐานจริง ไม่ลด E และ I ซ้ำ ความหนาต้องตรงข้อมูลผลิตภัณฑ์</p>
    <button className="btn secondary" disabled={materialSelection?.effective.category !== 'PLYWOOD'} onClick={() => onChange({...emptyPlywoodBinding(), material: clone(materialSelection!)})}>คัดลอกวัสดุไม้อัดที่กดใช้แล้วเข้าผูก</button>
    <label className="field"><span>ค่า Eb ที่ขนานเสี้ยนตามหลักฐาน</span><select value={b.parallelToGrainKey ?? ''} onChange={e => onChange({...b, parallelToGrainKey: (e.target.value || null) as PlywoodProductBinding['parallelToGrainKey'], axisMappingEvidenceRef: ''})}><option value="">ยังไม่ระบุ</option><option value="Eb0_mean_MPa">Eb0_mean_MPa</option><option value="Eb90_mean_MPa">Eb90_mean_MPa</option></select></label>
    <div className="form-grid">{([['axisMappingEvidenceRef', 'หลักฐานแปลแกน Eb กับเสี้ยนผลิตภัณฑ์'], ['productMatchEvidenceRef', 'หลักฐานสินค้า/DoP/ความหนาไม้อัด'], ['serviceConditionRef', 'สภาพเปียก/ระยะเวลาใช้และฐาน E ไม้อัด']] as const).map(([key, text]) => <label className="field" key={key}><span>{text}</span><input value={b[key]} onChange={e => onChange({...b, [key]: e.target.value})}/></label>)}</div>
    <PlywoodBindingSummary binding={b} thicknessMm={thicknessMm} grainRelativeDeg={grainRelativeDeg} label={label}/>
    <button className="btn secondary" onClick={() => onChange(null)}>ยกเลิกการผูกไม้อัดและกรอก E ใหม่เอง</button>
  </section>;
}
