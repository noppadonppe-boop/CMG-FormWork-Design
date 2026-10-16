import {Layers} from 'lucide-react';
import type {Input} from '../domain';
import {FAMILY_LABEL, SECTION_SOURCES, TIMBER_GRADES, catalogueProperties, sectionById, sectionsFor, type StockFamily, type StockRole, type StockSection} from '../domain/sectionStock';
import {sectionProperties} from '../domain/mechanics';

const STUD_FAMILIES: StockFamily[] = ['TIMBER', 'SHS', 'RHS'];
const WALER_FAMILIES: StockFamily[] = ['RHS', 'SHS', 'L', 'C_LIP', 'C', 'CHS'];
const fmt = (v: number, d = 1) => v.toLocaleString('en-US', {maximumFractionDigits: d, minimumFractionDigits: d});

/** Section closest to the current stiffness inside a family: lightest with I ≥ current, else the stiffest available. */
function closest(role: StockRole, family: StockFamily, I: number) {
  const list = sectionsFor(role, family).map(s => ({s, p: catalogueProperties(s)})).sort((a, b) => a.p.area - b.p.area);
  return (list.find(v => v.p.I >= I) ?? list.sort((a, b) => b.p.I - a.p.I)[0])?.s;
}
function Props({s, pair}: {s: StockSection | undefined; pair?: boolean}) {
  if (!s) return <p className="muted">หน้าตัดกำหนดเอง (คำนวณจาก B × H × t มุมคม) · เลือกจากตารางเหล็กเพื่อใช้ค่าที่ผู้ผลิตเผยแพร่</p>;
  const src = SECTION_SOURCES.find(x => x.source_id === s.source);
  return <p className="section-props">
    A = {fmt(s.A_cm2, 2)} cm² · I<sub>x</sub> = {fmt(s.Ix_cm4, 2)} cm⁴ · S<sub>x</sub> = {fmt(s.Sx_cm3, 2)} cm³{s.family === 'L' ? ' (ต่ำสุด)' : ''}
    {s.kg_per_m !== null && <> · {fmt(s.kg_per_m, 2)} kg/m{pair ? ` (คู่ ${fmt(2 * s.kg_per_m, 2)} kg/m)` : ''}</>}
    <br/><small>ที่มา: {src ? <a href={src.url} target="_blank" rel="noreferrer">{src.title}</a> : s.source}{s.ref ? ` · ${s.ref}` : ''} · {s.status === 'REVIEW_REQUIRED' ? 'ค่าจากแคตตาล็อก ต้องตรวจใบรับรองวัสดุ' : s.status}</small>
  </p>;
}

/** Stud and twin-waler section selection from the Thai steel / timber tables. Changes go through applyChanges (geometry kept in sync). */
export function SectionPicker({input: x, canEdit, onChange}: {input: Input; canEdit: boolean; onChange: (changes: Partial<Input>) => void}) {
  const stud = x.studSectionId ? sectionById(x.studSectionId) : undefined, waler = x.walerSectionId ? sectionById(x.walerSectionId) : undefined;
  const studFamily = stud?.family ?? '', walerFamily = waler?.family ?? '';
  const studI = stud ? catalogueProperties(stud).I : sectionProperties('RHS', x.rhsB, x.rhsH, x.rhsT).I;
  const walerI = waler ? catalogueProperties(waler).I : sectionProperties(x.walerType === 'C' ? 'C' : 'RHS', x.walerB, x.walerH, x.walerT).I;
  const grade = TIMBER_GRADES.find(g => g.id === x.studTimberGrade);
  const pickFamily = (role: StockRole, family: string, I: number) => {
    if (!family) return;
    const s = closest(role, family as StockFamily, I);
    if (s) onChange(role === 'stud' ? {studSectionId: s.id} : {walerSectionId: s.id});
  };
  const sizes = (role: StockRole, family: string, current: string) => <select aria-label={role === 'stud' ? 'ขนาดคร่าว' : 'ขนาดคานคู่'} value={current} disabled={!canEdit || !family}
    onChange={e => onChange(role === 'stud' ? {studSectionId: e.target.value} : {walerSectionId: e.target.value})}>
    {!family && <option value="">—</option>}
    {family && sectionsFor(role, family as StockFamily).map(s => <option key={s.id} value={s.id}>{s.designation}{s.kg_per_m !== null ? ` · ${s.kg_per_m} kg/m` : ''}</option>)}
  </select>;
  return <section className="card section-picker">
    <div className="card-title"><h3><Layers size={18}/> เลือกหน้าตัดคร่าวและคานคู่</h3></div>
    <p className="muted">เลือกจากตารางเหล็กมาตรฐานไทย (มอก. 107 / 1227 / 1228) และไม้ขนาดตลาด แล้วระบบคำนวณใหม่ทันที · ค่าหน้าตัดเป็น gross จากผู้ผลิต ไม่ใช่ effective section</p>
    <div className="grid two">
      <div>
        <h4>คร่าว (Stud)</h4>
        <div className="form-grid">
          <label className="field"><span>ชนิด</span><select aria-label="ชนิดคร่าว" value={studFamily} disabled={!canEdit} onChange={e => pickFamily('stud', e.target.value, studI)}>
            {!studFamily && <option value="">เหล็กกล่อง RHS กำหนดขนาดเอง</option>}
            {STUD_FAMILIES.map(f => <option key={f} value={f}>{FAMILY_LABEL[f]}</option>)}</select></label>
          <label className="field"><span>ขนาด</span>{sizes('stud', studFamily, x.studSectionId)}</label>
          {studFamily === 'TIMBER' && <label className="field"><span>ชั้นคุณภาพไม้</span><select aria-label="ชั้นคุณภาพไม้" value={x.studTimberGrade} disabled={!canEdit} onChange={e => onChange({studTimberGrade: e.target.value})}>
            {TIMBER_GRADES.map(g => <option key={g.id} value={g.id}>{g.label} · Fb {g.raw_ksc.Fb_base_MPa} ksc · E {g.raw_ksc.E_ref_MPa?.toLocaleString('en-US')} ksc</option>)}</select></label>}
        </div>
        <Props s={stud}/>
        {studFamily === 'TIMBER' && grade && <p className="notice">ค่าไม้จาก {grade.source} · ต้องยืนยันชนิดไม้ ขนาดจริงหลังไส และความชื้นหน้างาน</p>}
      </div>
      <div>
        <h4>คานคู่ (Twin waler) · 2 ตัวต่อระดับ</h4>
        <div className="form-grid">
          <label className="field"><span>ชนิด</span><select aria-label="ชนิดคานคู่" value={walerFamily} disabled={!canEdit} onChange={e => pickFamily('waler', e.target.value, walerI)}>
            {!walerFamily && <option value="">{x.walerType === 'C' ? 'เหล็ก C ไม่มีปีกริม กำหนดขนาดเอง' : 'เหล็กกล่อง RHS กำหนดขนาดเอง'}</option>}
            {WALER_FAMILIES.map(f => <option key={f} value={f}>{FAMILY_LABEL[f]}</option>)}</select></label>
          <label className="field"><span>ขนาด</span>{sizes('waler', walerFamily, x.walerSectionId)}</label>
        </div>
        <Props s={waler} pair/>
        {walerFamily === 'L' && <p className="notice">เหล็กฉากไม่สมมาตร: ใช้ S ต่ำสุดรอบแกนเรขาคณิต ยังไม่ตรวจการดัดรอบแกนหลักและการบิด</p>}
        {walerFamily === 'CHS' && <p className="notice">ท่อกลม: ต้องออกแบบจุดรับ Tie / แผ่นรองบนผิวโค้งเพิ่มเติม</p>}
      </div>
    </div>
  </section>;
}
