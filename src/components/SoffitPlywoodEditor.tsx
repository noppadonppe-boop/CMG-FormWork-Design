import React from 'react';
import type {SelectionSnapshot} from '../domain/workflowV07/catalogues';
import {emptySoffitPlywood, type SoffitPlywoodDefinition} from '../domain/workflowV07/plywood';
import {PlywoodBindingEditor} from './PlywoodBinding';
export function SoffitPlywoodEditor({definition, materialSelection, onChange}: {definition: SoffitPlywoodDefinition | null; materialSelection?: SelectionSnapshot | null; onChange: (next: SoffitPlywoodDefinition | null) => void}) {
  if (!definition) return <section className="elastic-binding"><button className="btn secondary" onClick={() => onChange(emptySoffitPlywood())}>เพิ่มแบบจำลองไม้อัดท้องและน้ำหนัก</button><p>ยังไม่มีผลแถบไม้อัดหรือข้อมูลน้ำหนักไม้อัดที่ใช้ได้</p></section>;
  const p = definition;
  return <fieldset aria-label="กำหนดไม้อัดแบบท้อง"><legend>ไม้อัดแบบท้อง · แถบพาด X ระหว่างคร่าวจริง</legend>
    <p>ขอบแผ่น X อยู่ที่คร่าวแรก/สุดท้าย ระบุช่วง Y จากมุมต่ำสุดของคอนกรีต ต้องครอบคลุมพื้นที่โหลดที่ส่งผ่านแผ่น แผ่นต่อเนื่อง/สองทาง/ยื่นยังต้องมีแบบจำลองเพิ่มเติม</p>
    <div className="form-grid">{([['thicknessMm', 'ไม้อัดท้องหนาจริง · mm'], ['effectiveE_MPa', 'E ไม้อัดท้องที่กรอกเอง · MPa'], ['startYMm', 'ขอบไม้อัดท้องเริ่ม Y · mm'], ['endYMm', 'ขอบไม้อัดท้องสิ้นสุด Y · mm'], ['selfWeightKPa', 'น้ำหนักไม้อัดท้อง · kPa (ศูนย์ต้องระบุ)']] as const).map(([key, label]) => <label className="field" key={key}><span>{label}</span><input disabled={key === 'effectiveE_MPa' && !!p.binding} type="number" step="any" value={p[key] ?? ''} onChange={e => onChange({...p, [key]: e.target.value === '' ? null : Number(e.target.value)})}/></label>)}
      <label className="field"><span>แนวเสี้ยนไม้อัดท้อง</span><select value={p.grainAxis ?? ''} onChange={e => onChange({...p, grainAxis: (e.target.value || null) as SoffitPlywoodDefinition['grainAxis']})}><option value="">ยังไม่ระบุ</option><option value="X">ตาม X · ขนานช่วงพาด</option><option value="Y">ตาม Y · ขวางช่วงพาด</option></select></label>
      <label className="field"><span>รอยต่อไม้อัดท้องบนคร่าวทุกแนว</span><select value={p.jointsAtEveryJoist === null ? '' : String(p.jointsAtEveryJoist)} onChange={e => onChange({...p, jointsAtEveryJoist: e.target.value === '' ? null : e.target.value === 'true'})}><option value="">ยังไม่ระบุ</option><option value="true">แถบช่วงเดียว มีรอยต่อบนคร่าวทุกแนว</option><option value="false">ต่อเนื่อง/รูปแบบอื่น · ยังไม่รองรับ</option></select></label>
      <label className="field"><span>การครอบครองน้ำหนักไม้อัด</span><select value={p.selfWeightOwnership ?? ''} onChange={e => onChange({...p, selfWeightOwnership: (e.target.value || null) as SoffitPlywoodDefinition['selfWeightOwnership']})}><option value="">ยังไม่ระบุ</option><option value="SEPARATE_ACTION">เพิ่มเป็นโหลดไม้อัดแยกจาก Additional DL</option><option value="IN_ADDITIONAL_DL">รวมอยู่ใน Additional DL ที่ระบุแล้ว</option></select></label>
      <label className="field"><span>หลักฐานแผ่น/ขอบเขต/รอยต่อไม้อัดท้อง</span><input value={p.evidenceRef} onChange={e => onChange({...p, evidenceRef: e.target.value})}/></label>
      <label className="field"><span>หลักฐานน้ำหนักและการครอบครองไม้อัด</span><input value={p.selfWeightEvidenceRef} onChange={e => onChange({...p, selfWeightEvidenceRef: e.target.value})}/></label>
    </div>
    <PlywoodBindingEditor binding={p.binding ?? null} thicknessMm={p.thicknessMm} grainRelativeDeg={p.grainAxis === null ? null : p.grainAxis === 'X' ? 0 : 90} label="SOFFIT:PLYWOOD" materialSelection={materialSelection} onChange={binding => onChange({...p, binding, effectiveE_MPa: null})}/>
    <p>น้ำหนักไม่ถูกคำนวณจากความหนา/ความหนาแน่นให้เอง ค่าไม่ครบเก็บได้เฉพาะร่าง BLOCKED ไม่มีผลแรงพร้อมใช้</p>
    <button className="btn secondary" onClick={() => onChange(null)}>ยกเลิกแบบจำลองไม้อัดร่าง</button>
  </fieldset>;
}
