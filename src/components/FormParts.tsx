import React from 'react';
import type {Check} from '../domain';
import {GRAIN_LABEL, PLYWOOD_GRADE_LABEL, PLYWOOD_GRADES, PLYWOOD_SPANS, SPAN_LABEL} from '../domain/plywoodGrades';
import type {MaterialSettings, PlywoodSettings} from '../domain/members';
import {FAMILY_LABEL, TIMBER_GRADES, catalogueProperties, sectionById, stockFor, type StockFamily, type StockRole} from '../domain/sectionStock';
import {Props, STUD_FAMILIES, WALER_FAMILIES} from './SectionPicker';

export const fmt = (v: number | null, d = 2) => v === null ? '—' : v.toLocaleString('en-US', {minimumFractionDigits: d, maximumFractionDigits: d});
type Edit<T> = (changes: Partial<T>) => void;
export interface FormCtx<T> {x: T; edit: Edit<T>; canEdit: boolean}

export function Num<T>({x, k, label, unit = 'mm', help, edit, canEdit}: FormCtx<T> & {k: keyof T & string; label: string; unit?: string; help?: string}) {
  return <label className="field"><span>{label}<small>{unit}</small></span>
    <input type="number" min="0" step="any" aria-label={label} disabled={!canEdit} value={String(x[k])} onChange={e => edit({[k]: Number(e.target.value)} as Partial<T>)}/>
    {help && <small className="help">{help}</small>}</label>;
}
/** Two-step section choice (family → size) for one member, limited to the project stock. */
export function MemberPicker<T>({x, k, role, title, edit, canEdit, stockIds, pair}: FormCtx<T> & {k: keyof T & string; role: StockRole; title: string; stockIds?: string[]; pair?: boolean}) {
  const id = String(x[k]), s = sectionById(id), families = role === 'stud' ? STUD_FAMILIES : WALER_FAMILIES, stock = stockFor(stockIds).filter(v => v.roles.includes(role));
  const pick = (family: StockFamily) => {
    const I = s ? catalogueProperties(s).I : 0, list = stock.filter(v => v.family === family).sort((a, b) => a.A_cm2 - b.A_cm2);
    const next = list.find(v => catalogueProperties(v).I >= I) ?? list[list.length - 1];
    if (next) edit({[k]: next.id} as Partial<T>);
  };
  return <div>
    <h4>{title}</h4>
    <div className="form-grid">
      <label className="field"><span>ชนิด</span><select aria-label={'ชนิด' + title} value={s?.family ?? ''} disabled={!canEdit} onChange={e => pick(e.target.value as StockFamily)}>
        {families.filter(fm => stock.some(v => v.family === fm)).map(fm => <option key={fm} value={fm}>{FAMILY_LABEL[fm]}</option>)}</select></label>
      <label className="field"><span>ขนาด</span><select aria-label={'ขนาด' + title} value={id} disabled={!canEdit} onChange={e => edit({[k]: e.target.value} as Partial<T>)}>
        {stock.filter(v => v.family === s?.family).map(v => <option key={v.id} value={v.id}>{v.designation}{v.kg_per_m !== null ? ` · ${v.kg_per_m} kg/m` : ''}</option>)}</select></label>
    </div>
    <Props s={s} pair={pair}/>
  </div>;
}
export function ChecksTable({checks}: {checks: Check[]}) {
  return <table><thead><tr><th>รายการ</th><th>แรง / ผล</th><th>เกณฑ์คัดกรอง</th><th>Ratio</th><th>สถานะ</th></tr></thead><tbody>
    {checks.map(k => <React.Fragment key={k.id}><tr><td><b>{k.label}</b></td><td>{fmt(k.demand, 3)} {k.unit}</td><td>{k.limit === null ? 'ยังไม่ทราบ' : `${fmt(k.limit, 3)} ${k.unit}`}</td><td>{fmt(k.utilization, 3)}</td>
      <td><span className={'pill ' + (k.status === 'FAIL' ? 'red' : 'amber')}>{k.status}</span></td></tr>
      <tr className="explain"><td colSpan={5}><details><summary>สูตร · ที่มา · ข้อจำกัด</summary><div className="equation">{k.formula}</div><p>{k.substitution}</p><p>{k.note}</p><small>{k.source}</small></details></td></tr></React.Fragment>)}
  </tbody></table>;
}
export interface SpacingAdvice {key: string; label: string; current: number; max: number | null; unchecked: string[]}
export function AdviceTable<T>({advice, edit, canEdit}: {advice: SpacingAdvice[]; edit: Edit<T>; canEdit: boolean}) {
  if (!advice.length) return null;
  return <section className="card"><h3>ระยะสูงสุดที่ไม่เกินเกณฑ์ (คำนวณซ้ำ ไม่เปลี่ยนหน้าตัด)</h3><table><thead><tr><th>รายการ</th><th>ใช้อยู่</th><th>สูงสุด</th><th>หมายเหตุ</th><th/></tr></thead><tbody>
    {advice.map(a => <tr key={a.key}><td>{a.label}</td><td>{a.current} mm</td><td>{a.max === null ? 'ไม่มีระยะที่ผ่าน' : a.max + ' mm'}</td><td className="muted">{a.max === null ? 'ต้องเปลี่ยนหน้าตัด' : a.unchecked.length ? 'ยังไม่รวม ' + a.unchecked.join(', ') : ''}</td>
      <td>{a.max !== null && a.max !== a.current && <button className="btn secondary" disabled={!canEdit} onClick={() => edit({[a.key]: a.max} as Partial<T>)}>ใช้ {a.max}</button>}</td></tr>)}</tbody></table></section>;
}
/** Vertical loads (ACI §4.2.1) shared by soffit systems. */
export function VerticalLoadFields<T extends {motorized: boolean}>(p: FormCtx<T>) {
  const n = (k: keyof T & string, label: string, unit: string, help?: string) => <Num<T> {...p} k={k} label={label} unit={unit} help={help}/>;
  return <><div className="form-grid">{n('gamma' as keyof T & string, 'น้ำหนักคอนกรีต + เหล็กเสริม', 'kN/m³')}{n('formDead' as keyof T & string, 'น้ำหนักแบบหล่อ', 'kPa', 'ค่าสมมติ ต้องยืนยันตามระบบแบบที่ใช้')}
    {n('liveLoad' as keyof T & string, 'น้ำหนักจรขณะก่อสร้าง', 'kPa', 'ACI: ไม่น้อยกว่า 2.4 kPa (3.6 kPa เมื่อใช้รถเข็นติดเครื่องยนต์)')}{n('deflectionRatio' as keyof T & string, 'เกณฑ์การโก่ง L/n', 'n', 'L/360 ผิวโชว์ · L/270 งานทั่วไป')}</div>
    <label className="confirm"><input type="checkbox" checked={p.x.motorized} disabled={!p.canEdit} onChange={e => p.edit({motorized: e.target.checked} as Partial<T>)}/>ใช้รถเข็นติดเครื่องยนต์ (ขั้นต่ำ LL 3.6 kPa, D+L 6.0 kPa)</label></>;
}
export function PlywoodFields<T extends PlywoodSettings>(p: FormCtx<T>) {
  const {x, edit, canEdit} = p;
  return <div className="form-grid"><Num<T> {...p} k={'plywood' as keyof T & string} label="ความหนาไม้อัด"/>
    <label className="field"><span>ชนิดไม้อัด</span><select aria-label="ชนิดไม้อัด" disabled={!canEdit} value={x.plywoodGrade} onChange={e => edit({plywoodGrade: e.target.value} as Partial<T>)}>{PLYWOOD_GRADES.map(g => <option key={g} value={g}>{PLYWOOD_GRADE_LABEL[g]}</option>)}</select></label>
    <label className="field"><span>จำนวนช่วงต่อเนื่อง</span><select aria-label="จำนวนช่วงไม้อัด" disabled={!canEdit} value={x.plywoodSpans} onChange={e => edit({plywoodSpans: e.target.value} as Partial<T>)}>{PLYWOOD_SPANS.map(s => <option key={s} value={s}>{SPAN_LABEL[s]}</option>)}</select></label>
    <label className="field"><span>ทิศลายไม้ผิว</span><select aria-label="ทิศลายไม้" disabled={!canEdit} value={x.plywoodFaceGrain} onChange={e => edit({plywoodFaceGrain: e.target.value} as Partial<T>)}>{(['ACROSS', 'PARALLEL'] as const).map(g => <option key={g} value={g}>{GRAIN_LABEL[g]}</option>)}</select></label>
    {x.plywoodGrade === 'CUSTOM' && <><Num<T> {...p} k={'plywoodE' as keyof T & string} label="E ไม้อัด (หน้าตัดเต็ม)" unit="MPa"/><Num<T> {...p} k={'plywoodFb' as keyof T & string} label="Fb ไม้อัด (หน้าตัดเต็ม)" unit="MPa"/></>}</div>;
}
export function MaterialFields<T extends MaterialSettings>(p: FormCtx<T>) {
  return <div className="form-grid"><Num<T> {...p} k={'steelFy' as keyof T & string} label="Fy เหล็ก" unit="MPa" help="STKR400 / SS400 = 245 MPa"/><Num<T> {...p} k={'steelE' as keyof T & string} label="E เหล็ก" unit="MPa"/>
    <Num<T> {...p} k={'steelOmegaB' as keyof T & string} label="Ωb (ดัด)" unit="—"/><Num<T> {...p} k={'steelOmegaShear' as keyof T & string} label="Ωv (เฉือน)" unit="—"/>
    <label className="field"><span>ชั้นคุณภาพไม้ (ถ้าใช้ไม้)</span><select aria-label="ชั้นไม้" disabled={!p.canEdit} value={p.x.timberGrade} onChange={e => p.edit({timberGrade: e.target.value} as Partial<T>)}>{TIMBER_GRADES.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}</select></label></div>;
}
