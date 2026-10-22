import type {Input} from '../domain';

/** Footing corner joints and column bracing inputs (Design Criteria page). Capacities come from the manufacturer; 0 = unknown → INCOMPLETE. */
export function LegacyRestraints({x, canEdit, onChange}: {x: Input; canEdit: boolean; onChange: (changes: Partial<Input>) => void}) {
  const num = (k: keyof Input, label: string, unit: string, help?: string) => <label className="field"><span>{label}<small>{unit}</small></span>
    <input type="number" min="0" step="any" aria-label={label} disabled={!canEdit} value={String(x[k])} onChange={e => onChange({[k]: Number(e.target.value)} as Partial<Input>)}/>
    {help && <small className="help">{help}</small>}</label>;
  if (x.kind === 'FOOTING') return <section className="card"><h3>จุดต่อมุมแบบฐานราก</h3>
    <p className="muted">ปลายคานคู่แต่ละด้านส่งแรงเข้าชุดยึดมุม (ข้อ 5.1) · กรอกกำลังใช้งานจากผู้ผลิตหรือผลทดสอบ · 0 = ยังไม่ทราบ</p>
    <div className="form-grid">{num('cornerCapacityX', 'กำลังจุดต่อมุมแกน X', 'kN')}{num('cornerCapacityY', 'กำลังจุดต่อมุมแกน Y', 'kN')}
      <label className="field"><span>เอกสารชุดยึดมุม</span><input aria-label="เอกสารชุดยึดมุม" maxLength={300} disabled={!canEdit} value={x.cornerReference} onChange={e => onChange({cornerReference: e.target.value})}/></label></div></section>;
  return <section className="card"><h3>ค้ำยันเสาและแรงลม (ACI §4.2.3.1)</h3>
    <p className="muted">ลมกระทำบนความกว้างแบบตลอดความสูง ฐานเป็นจุดหมุน ค้ำยันแบบดัน-ดึงต่อทิศ (ข้อ 5.1) · SWL จากผู้ผลิตที่ความยาวใช้งาน · 0 = ยังไม่ทราบ</p>
    <div className="form-grid">{num('windPressure', 'แรงลมออกแบบ', 'kPa', 'ตามพื้นที่ก่อสร้าง/มาตรฐานท้องถิ่น ไม่น้อยกว่า 0.72 kPa')}
      {num('braceHeight', 'ระดับยึดค้ำยันจากฐาน', 'mm', '0 = ยังไม่กำหนด')}{num('braceAngle', 'มุมค้ำยันจากแนวราบ', '°', '20–75°')}
      <label className="field"><span>จำนวนค้ำยันต่อทิศ</span><select aria-label="จำนวนค้ำยันต่อทิศ" disabled={!canEdit} value={x.bracesPerDirection} onChange={e => onChange({bracesPerDirection: Number(e.target.value)})}>{[1, 2, 3, 4].map(v => <option key={v} value={v}>{v} ตัว</option>)}</select></label>
      {num('braceSWL', 'SWL ค้ำยันต่อตัว', 'kN', 'จากผู้ผลิต · 0 = ยังไม่ทราบ')}
      <label className="field"><span>รุ่น/เอกสารค้ำยัน</span><input aria-label="รุ่นค้ำยันเสา" maxLength={300} disabled={!canEdit} value={x.braceReference} onChange={e => onChange({braceReference: e.target.value})}/></label></div></section>;
}
