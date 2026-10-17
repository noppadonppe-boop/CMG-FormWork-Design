import React from 'react';
import {emptySideLocalEvidence, SIDE_LOCAL_CHECK_KINDS, type SideLocalCheckKind, type SideLocalEvidence} from '../domain/workflowV07/sideLocalChecks';

export const sideLocalKindNames: Record<SideLocalCheckKind, string> = {
  STUD_RAIL_BEARING: 'แรงกดเฉพาะที่ คร่าว↔ราง · N ต่อจุดสัมผัส',
  SUPPORT_PLATE_BEARING: 'แผ่นรอง/แรงกดรางที่จุดรองรับ · N ต่อราง',
  SUPPORT_CONNECTION: 'จุดต่อคานรัด→ไทร์/เฟรม · N ต่อจุดรองรับ',
  STUD_BUCKLING: 'การโก่งเดาะด้านข้างคร่าว · N·mm',
  RAIL_BUCKLING: 'การโก่งเดาะด้านข้างราง · N·mm',
  CORNER_OPENING: 'การเปิดรอยต่อมุม/ปลายราง · mm (SLS)',
  CORNER_CONNECTOR: 'แรงในอุปกรณ์มุม (ผลรวมเวกเตอร์) · N',
  RAIL_AXIAL: 'แรงตามแนวแกนคานรัดคู่ที่มุมส่งผ่าน · N',
  TIE_AXIAL: 'แรงดึงไทร์จากแบบจำลองร่วม · N',
};
const number = (value: string) => value.trim() && Number.isFinite(Number(value)) ? Number(value) : null;

export function SideLocalEvidenceEditor({value, memberEvidenceRef, faceId, onChange, kinds = SIDE_LOCAL_CHECK_KINDS, coupled = false}: {
  value: SideLocalEvidence[]; memberEvidenceRef: string; faceId: string; onChange: (next: SideLocalEvidence[]) => void;
  kinds?: readonly SideLocalCheckKind[]; coupled?: boolean;
}) {
  const update = (i: number, patch: Partial<SideLocalEvidence>) => onChange(value.map((row, j) => j === i ? {...row, ...patch} : row));
  return <details className="side-local-evidence-editor" aria-label={`หลักฐานตรวจเฉพาะที่ ${faceId}`}>
    <summary>หลักฐานตรวจเฉพาะที่ {faceId} ({value.length}/{kinds.length})</summary>
    {coupled
      ? <p>ค่าที่ใช้เทียบมาจากแบบจำลองร่วมไทร์–เฟรม–มุม และผูกกับข้อมูลความแข็งของไทร์/มุมปัจจุบัน หากแก้ค่าความแข็งต้องกรอกหลักฐานใหม่</p>
      : <><p>ค่าที่ใช้เทียบมาจากผลวิเคราะห์จริงของผิวนี้ทุกจุด limit หนึ่งแถวใช้กับทุกจุดของชนิดนั้นในผิวนี้ ต้องมาจากวิธีที่ระบุและผ่าน review ระบบไม่สร้างกำลังแรงกด การโก่งเดาะ แผ่นรอง หรือจุดต่อเอง</p>
        <p>ในผลระดับผิว ปลายรางยังวิเคราะห์เป็นปลายอิสระ การถ่ายแรงผ่านมุมอยู่ในแบบจำลองร่วมของเฟรม และเสถียรภาพระบบต้องใช้กรณีแรงด้านข้างกับเฟรมค้ำ</p></>}
    {value.map((row, i) => <fieldset key={i}><legend>รายการ {i + 1}</legend><div className="form-grid">
      <label className="field"><span>ชนิดการตรวจ</span><select value={row.kind ?? ''} onChange={e => onChange(value.map((old, j) => j === i ? emptySideLocalEvidence((e.target.value || null) as SideLocalCheckKind | null, memberEvidenceRef) : old))}>
        <option value="">ยังไม่ระบุ</option>{kinds.map(k => <option key={k} value={k}>{sideLocalKindNames[k]}</option>)}</select></label>
      <label className="field"><span>หน่วย / limit</span><span>{row.unit ?? 'UNKNOWN'} · </span><input type="number" min="0" step="any" value={row.limit ?? ''} onChange={e => update(i, {limit: number(e.target.value)})}/></label>
      <label className="field"><span>ฐานแรงที่วิเคราะห์</span><select value={row.actionBasis ?? ''} onChange={e => update(i, {actionBasis: (e.target.value || null) as SideLocalEvidence['actionBasis']})}><option value="">ยังไม่ระบุ</option><option value="SERVICE">SERVICE</option>{row.kind !== 'CORNER_OPENING' && <option value="FACTORED">FACTORED</option>}</select></label>
      <label className="field"><span>ฐาน limit</span><select value={row.limitBasis ?? ''} onChange={e => update(i, {limitBasis: (e.target.value || null) as SideLocalEvidence['limitBasis']})}><option value="">ยังไม่ระบุ</option>{row.kind === 'CORNER_OPENING' ? <option value="SLS_LIMIT">SLS_LIMIT</option> : <><option value="ALLOWABLE">ALLOWABLE</option><option value="DESIGN">DESIGN</option></>}</select></label>
      {(row.kind === 'STUD_BUCKLING' || row.kind === 'RAIL_BUCKLING' || row.kind === 'RAIL_AXIAL') && <label className="field"><span>ช่วงไม่ค้ำยันสูงสุดที่หลักฐานครอบคลุม · mm</span><input type="number" min="0" step="any" value={row.maximumUnbracedLengthMm ?? ''} onChange={e => update(i, {maximumUnbracedLengthMm: number(e.target.value)})}/></label>}
      {(['scopeEvidenceRef', 'methodId', 'sourceRef', 'sourceRevision', 'evidenceRef', 'reviewRef'] as const).map(k => <label className="field" key={k}><span>{{scopeEvidenceRef: 'หลักฐานขอบเขต/สภาพสัมผัส', methodId: 'Method ID', sourceRef: 'Source ref', sourceRevision: 'Source revision', evidenceRef: 'Evidence ref', reviewRef: 'Review ref'}[k]}</span><input value={row[k]} onChange={e => update(i, {[k]: e.target.value})}/></label>)}
      <label className="field"><span>สถานะหลักฐาน</span><select value={row.status} onChange={e => update(i, {status: e.target.value as SideLocalEvidence['status']})}><option value="REFERENCE_ONLY">REFERENCE_ONLY · ยังไม่ review</option><option value="ENGINEER_REVIEWED">ENGINEER_REVIEWED · ต้องมี Review ref</option></select></label>
    </div><button className="btn secondary" onClick={() => onChange(value.filter((_, j) => j !== i))}>ลบหลักฐานเฉพาะที่ {i + 1}</button></fieldset>)}
    <button className="btn secondary" disabled={value.length >= kinds.length} onClick={() => onChange([...value, emptySideLocalEvidence(null, memberEvidenceRef)])}>เพิ่มหลักฐานตรวจเฉพาะที่</button>
  </details>;
}
