import type {ReactNode} from 'react';
import {Lightbulb} from 'lucide-react';
import type {Input, Result} from '../domain';
import {APA_REFERENCE, FACE_GRAINS, GRAIN_LABEL, PLYWOOD_GRADES, PLYWOOD_GRADE_LABEL, PLYWOOD_SPANS, SPAN_LABEL, type PlywoodGrade} from '../domain/plywoodGrades';

/** Recommendation box shown under each group of Design Criteria inputs. */
export function Guide({title = 'คำแนะนำ', children}: {title?: string; children: ReactNode}) {
  return <div className="criteria-guide"><b><Lightbulb size={14}/> {title}</b><ul>{children}</ul></div>;
}

export function PressureGuide() {
  return <Guide>
    <li><b>น้ำหนักคอนกรีต γ:</b> คอนกรีตเสริมเหล็กทั่วไป 24 kN/m³ (ρ ≈ 2,450 kg/m³) · คอนกรีตไม่เสริมเหล็ก 23–23.5 · คอนกรีตเสริมเหล็กหนาแน่นมาก 25 · ใช้ค่าที่ได้จากผู้ผลิตคอนกรีตถ้ามี</li>
    <li><b>วิธีคำนวณแรงดัน:</b> ใช้ ρgh เมื่อยังไม่ทราบอัตราการเท/ส่วนผสม หรือเป็น SCC ค่ายุบตัว &gt; 175 mm · ใช้ ACI PRC-347-14(21) เมื่อควบคุมอัตราการเทได้ และต้องระบุอัตราการเทนั้นในแบบ</li>
    <li><b>ข้อมูลหน้างานทั่วไปในไทย:</b> อุณหภูมิคอนกรีต 28–32 °C · ค่ายุบตัว 75–125 mm · คอนกรีตผสมเสร็จมักมีสารหน่วง → Cc = 1.2 (มีเถ้าลอย ≥ 40% + สารหน่วง → 1.5) · อัตราการเท เสา 2–3 m/h, ผนัง 1–2 m/h</li>
    <li><b>เกณฑ์การโก่ง L/n:</b> APA V345 แนะนำ L/360 สำหรับผิวคอนกรีตโชว์/งานสถาปัตย์ และ L/270 สำหรับงานทั่วไป · ACI 117 กำหนดค่าคลาดเคลื่อนผิว Class A 3 mm, Class B 6 mm, Class C 13 mm ต่อ 1.5 m</li>
  </Guide>;
}

export function PlywoodCriteria({x, r, canEdit, onChange, field}: {x: Input; r: Result | null; canEdit: boolean; onChange: (c: Partial<Input>) => void;
  field: (k: keyof Input, label: string, unit?: string, help?: string) => ReactNode}) {
  const p = r?.plywood, d = r?.plywoodDesign;
  const pick = <K extends 'plywoodSpans' | 'plywoodFaceGrain'>(k: K, label: string, values: readonly Input[K][], labels: Record<string, string>) =>
    <label className="field"><span>{label}</span><select aria-label={label} value={x[k]} disabled={!canEdit} onChange={e => onChange({[k]: e.target.value} as Partial<Input>)}>
      {values.map(v => <option key={v} value={v}>{labels[v]}</option>)}</select></label>;
  return <>
    <h3>ไม้อัดแบบหล่อ</h3>
    <label className="field"><span>ชนิด / มาตรฐานไม้อัด</span><select aria-label="ชนิดไม้อัด" value={x.plywoodGrade} disabled={!canEdit}
      onChange={e => {const g = e.target.value as PlywoodGrade; onChange({plywoodGrade: g, ...(g === 'CUSTOM' && p ? {plywoodE: Math.round(p.eqE), plywoodFb: Math.round(p.eqFb * 100) / 100} : {})});}}>
      {PLYWOOD_GRADES.map(g => <option key={g} value={g}>{PLYWOOD_GRADE_LABEL[g]}</option>)}</select></label>
    <div className="form-grid">{pick('plywoodFaceGrain', 'ทิศลายไม้ผิวเทียบกับคร่าว', FACE_GRAINS, GRAIN_LABEL)}{pick('plywoodSpans', 'จำนวนช่วงต่อเนื่อง', PLYWOOD_SPANS, SPAN_LABEL)}</div>
    {x.plywoodGrade === 'CUSTOM' && <div className="form-grid">{field('plywoodE', 'E (หน้าตัดเต็มความหนา)', 'MPa')}{field('plywoodFb', 'Fb ที่ยอมให้ (หน้าตัดเต็ม)', 'MPa')}</div>}
    {p && d && <table className="criteria-values"><tbody>
      <tr><td>แบบจำลอง</td><td><b>{d.spans === 1 ? 'ช่วงเดี่ยว' : `ต่อเนื่อง ${d.spans} ช่วง`}</b> · l₁ = {d.l1} mm{x.plywoodGrade !== 'CUSTOM' ? ` · ช่วงว่าง l₂ = ${d.l2.toFixed(0)} mm` : ''}</td></tr>
      {x.plywoodGrade !== 'CUSTOM' && <>
        <tr><td>หน่วยแรงที่ยอมให้ (APA ตาราง 13)</td><td>Fb = <b>{p.Fb.toFixed(2)}</b> MPa · Fs = <b>{p.Fs?.toFixed(3)}</b> MPa · E = {p.E.toFixed(0)} / Ee = {p.Ee?.toFixed(0)} MPa</td></tr>
        <tr><td>หน้าตัดประสิทธิผล (ตาราง 12)</td><td>KS = {p.KS.toFixed(1)} mm³/mm · I = {p.I.toFixed(0)} mm⁴/mm · Ib/Q = {p.IbQ?.toFixed(2)} mm²/mm</td></tr>
        <tr><td>เทียบเท่าหน้าตัดเต็ม</td><td>Fb,eq = {p.eqFb.toFixed(2)} MPa · E,eq = {p.eqE.toFixed(0)} MPa</td></tr></>}
      <tr><td>แรงดันที่รับได้ที่ระยะคร่าวนี้</td><td><b>{d.allowablePressure.toFixed(1)} kPa</b> (แรงดันออกแบบ {r!.pressure.toFixed(1)} kPa)</td></tr>
    </tbody></table>}
    {d && <p className="muted">{d.spanReason}</p>}
    <Guide>
      <li><b>ค่าเริ่มต้น:</b> APA Plyform Class I ({APA_REFERENCE}) หน่วยแรงปรับสภาพเปียกและ Cs = 1.625 แล้ว ตรวจด้วยหน้าตัดประสิทธิผล (KS, I, Ib/Q) ตามความหนา</li>
      <li><b>ทิศลายไม้:</b> วางแผ่นแนวนอนให้ลายไม้ผิวขวางคร่าว รับแรงได้มากกว่าวางแนวตั้ง 2–3 เท่า แบบ A3 และ BOM วาดตามทิศที่เลือก</li>
      <li><b>จำนวนช่วง:</b> "อัตโนมัติ" นับช่วงที่อยู่ในแผ่นเดียว (แผ่นกว้าง 2,440 mm เมื่อวางแนวนอน, 1,220 mm เมื่อวางแนวตั้ง) และจำกัดตามกฎ APA (ลายขวาง ≤ 813 mm → 3 ช่วง) · ถ้ารอยต่อแผ่นไม่ตรงคร่าวหรือตัดแผ่นสั้น ให้เลือกช่วงเดี่ยว</li>
      <li><b>ไม้อัดในท้องตลาดไทย</b> (ไม้อัดยาง/ไม้อัดฟิล์มดำ) มักไม่มีค่าออกแบบรับรอง ให้ใช้ Plyform Class II หรือค่าต่ำกว่า จนกว่าจะได้ผลทดสอบ</li>
      <li><b>เลือก "กำหนดเอง"</b> เมื่อมีใบรับรองผู้ผลิต: ใส่ค่าที่ยอมให้ (allowable) บนหน้าตัดเต็มความหนา ไม่ใช่ค่ากำลังประลัย (MOR) · ถ้าผู้ผลิตให้ค่า characteristic (EN 13986) ต้องลดด้วย kmod/γM ก่อน</li>
    </Guide>
  </>;
}

export function SteelGuide() {
  return <Guide>
    <li><b>Fy = 245 MPa:</b> ท่อเหลี่ยม STKR400 / ท่อกลม STK400 (มอก. 107-2566), เหล็กรูปพรรณรีดร้อน SS400 หนา ≤ 16 mm (มอก. 1227-2558), ตัวซี SSCS400 (มอก. 1228) · เกรด 490 ใช้ Fy 325 MPa (STKR490) เมื่อมีใบรับรอง</li>
    <li><b>E = 200,000 MPa</b> ค่ามาตรฐานของเหล็กโครงสร้าง (AISC 360) · ห้ามปรับเพิ่มเพื่อให้การโก่งผ่าน</li>
    <li><b>Ωb = 1.67, Ωv = 1.67:</b> ตัวคูณความปลอดภัยวิธี ASD ของ AISC 360 หมวด F1 (ดัด) และ G1 (เฉือน) · ผลยังเป็นการคัดกรอง ไม่รวม local / lateral-torsional buckling</li>
    <li>คร่าวไม้ใช้ค่าจาก ว.ส.ท. (หนังสือ ตาราง 3.4) ตามชั้นไม้ที่เลือกในหน้ารายการคำนวณ</li>
  </Guide>;
}
