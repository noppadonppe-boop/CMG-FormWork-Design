import type {BeamMemberEvidence, BeamMemberQuantity, BeamMemberActionBasis, BeamMemberLimitBasis} from '../domain/workflowV07/beamResistance';
import {emptyBeamMemberEvidence} from '../domain/workflowV07/beamResistance';

const labels: Record<BeamMemberQuantity, string> = {FLEXURE: 'ดัด · N·mm', SHEAR: 'เฉือน · N', DEFLECTION: 'โก่งตัว · mm'};
const number = (value: string) => value.trim() && Number.isFinite(Number(value)) ? Number(value) : null;

export function BeamMemberEvidenceEditor({value, memberEvidenceRef, onChange}: {
  value: BeamMemberEvidence[]; memberEvidenceRef: string; onChange: (next: BeamMemberEvidence[]) => void;
}) {
  const update = (index: number, patch: Partial<BeamMemberEvidence>) =>
    onChange(value.map((row, i) => i === index ? {...row, ...patch} : row));
  return <details className="beam-member-evidence-editor">
    <summary>หลักฐานขีดจำกัดดัด/เฉือน/โก่งตัว ({value.length})</summary>
    <p>กรอกเฉพาะ allowable/design limit ที่ตรวจแหล่งอ้างอิงและเงื่อนไขสมาชิกแล้ว ค่าคุณลักษณะหรือผลทดสอบยังเทียบตรงไม่ได้; แม้จะแสดง SCREENED ก็ยังเป็น NO_GO</p>
    <p>หลักฐานสมาชิกปัจจุบัน: {memberEvidenceRef || 'UNKNOWN'} · หากหลักฐานหน้าตัด/แกนเปลี่ยน ให้บันทึกขีดจำกัดใหม่</p>
    {value.map((row, index) => {
      const quantity = row.quantity;
      return <fieldset className="beam-member-evidence-row" key={index}><legend>รายการตรวจ {index + 1}</legend>
        <div className="form-grid">
          <label className="field"><span>ปริมาณ</span><select value={quantity ?? ''} onChange={e => {
            const next = e.target.value as BeamMemberQuantity | '';
            onChange(value.map((old, i) => i === index ? emptyBeamMemberEvidence(next || null, memberEvidenceRef) : old));
          }}><option value="">ยังไม่ระบุ</option>{Object.entries(labels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
          <label className="field"><span>หน่วย / limit</span><span>{row.unit ?? 'UNKNOWN'} · </span><input type="number" min="0" step="any" value={row.limit ?? ''} onChange={e => update(index, {limit: number(e.target.value)})}/></label>
          <label className="field"><span>ฐานแรงที่วิเคราะห์</span><select value={row.actionBasis ?? ''} onChange={e => update(index, {actionBasis: (e.target.value || null) as BeamMemberActionBasis})}>
            <option value="">ยังไม่ระบุ</option><option value="SERVICE">SERVICE</option>{quantity !== 'DEFLECTION' && <option value="FACTORED">FACTORED</option>}
          </select></label>
          <label className="field"><span>ฐานขีดจำกัด</span><select value={row.limitBasis ?? ''} onChange={e => update(index, {limitBasis: (e.target.value || null) as BeamMemberLimitBasis})}>
            <option value="">ยังไม่ระบุ</option>{quantity === 'DEFLECTION' ? <option value="SLS_LIMIT">SLS_LIMIT</option> : <><option value="ALLOWABLE">ALLOWABLE</option><option value="DESIGN">DESIGN</option></>}
          </select></label>
          <label className="field"><span>ช่วงไม่ค้ำยันสูงสุดที่หลักฐานครอบคลุม · mm</span><input type="number" min="0" step="any" value={row.maximumUnsupportedSpanMm ?? ''} onChange={e => update(index, {maximumUnsupportedSpanMm: number(e.target.value)})}/></label>
          <label className="field"><span>หลักฐานขอบเขตช่วง/สภาพค้ำยัน</span><input value={row.scopeEvidenceRef} onChange={e => update(index, {scopeEvidenceRef: e.target.value})}/></label>
          <label className="field"><span>Method ID</span><input value={row.methodId} onChange={e => update(index, {methodId: e.target.value})}/></label>
          <label className="field"><span>Source ref / revision</span><input value={row.sourceRef} onChange={e => update(index, {sourceRef: e.target.value})}/></label>
          <label className="field"><span>Source revision</span><input value={row.sourceRevision} onChange={e => update(index, {sourceRevision: e.target.value})}/></label>
          <label className="field"><span>Evidence ref</span><input value={row.evidenceRef} onChange={e => update(index, {evidenceRef: e.target.value})}/></label>
          <label className="field"><span>Review ref</span><input value={row.reviewRef} onChange={e => update(index, {reviewRef: e.target.value})}/></label>
          <label className="field"><span>สถานะหลักฐาน</span><select value={row.status} onChange={e => update(index, {status: e.target.value as BeamMemberEvidence['status']})}>
            <option value="REFERENCE_ONLY">REFERENCE_ONLY · ยังไม่ review</option><option value="ENGINEER_REVIEWED">ENGINEER_REVIEWED · ต้องมี Review ref</option>
          </select></label>
        </div>
        {quantity === 'DEFLECTION' && <p>จำกัดการเปรียบเทียบเป็น SERVICE/SLS; จะไม่ใช้ผล FACTORED แทน deflection serviceability</p>}
        <button className="btn secondary" onClick={() => onChange(value.filter((_, i) => i !== index))}>ลบหลักฐาน {index + 1}</button>
      </fieldset>;
    })}
    <button className="btn secondary" disabled={value.length >= 3} onClick={() => onChange([...value, emptyBeamMemberEvidence(null, memberEvidenceRef)])}>เพิ่มหลักฐานขีดจำกัด</button>
  </details>;
}
