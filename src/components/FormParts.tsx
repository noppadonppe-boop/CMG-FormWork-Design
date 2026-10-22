import React from 'react';
import type {Check} from '../domain';
import {SCREEN_LABEL, screenState, type NumberedCheck} from '../domain/reportOutline';
import {KIT_SHORT} from '../domain/optimize';
import {CC_VALUES, type PressureMethod} from '../domain/pressure';
import {GRAIN_LABEL, PLYWOOD_GRADE_LABEL, PLYWOOD_GRADES, PLYWOOD_SPANS, SPAN_LABEL} from '../domain/plywoodGrades';
import type {MaterialSettings, PlywoodSettings} from '../domain/members';
import {FAMILY_LABEL, TIMBER_GRADES, catalogueProperties, sectionById, stockFor, type StockFamily, type StockRole} from '../domain/sectionStock';
import {Props, STUD_FAMILIES, WALER_FAMILIES} from './SectionPicker';

export const fmt = (v: number | null, d = 2) => v === null ? '—' : v.toLocaleString('en-US', {minimumFractionDigits: d, maximumFractionDigits: d});
type Edit<T> = (changes: Partial<T>) => void;
/** `hide`: keys owned by the project kit, not shown in simple mode. */
export interface FormCtx<T> {x: T; edit: Edit<T>; canEdit: boolean; hide?: ReadonlySet<string>}

export function Num<T>({x, k, label, unit = 'mm', help, edit, canEdit, hide}: FormCtx<T> & {k: keyof T & string; label: string; unit?: string; help?: string}) {
  if (hide?.has(k)) return null;
  return <label className="field"><span>{label}<small>{unit}</small></span>
    <input type="number" min="0" step="any" aria-label={label} disabled={!canEdit} value={String(x[k])} onChange={e => edit({[k]: Number(e.target.value)} as Partial<T>)}/>
    {help && <small className="help">{help}</small>}</label>;
}
/** Two-step section choice (family → size) for one member, limited to the project stock. */
export function MemberPicker<T>({x, k, role, title, edit, canEdit, stockIds, pair, hide}: FormCtx<T> & {k: keyof T & string; role: StockRole; title: string; stockIds?: string[]; pair?: boolean}) {
  if (hide?.has(k)) return null;
  const id = String(x[k]), s = sectionById(id), families = role === 'stud' ? STUD_FAMILIES : WALER_FAMILIES, stock = stockFor(stockIds).filter(v => v.roles.includes(role));
  const materialInput = x as unknown as {timberGrade?: string; steelE?: number};
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
    <Props s={s} pair={pair} timberGradeId={materialInput.timberGrade} steelE={materialInput.steelE}/>
    {role === 'waler' && <p className="notice">WF และเหล็กฉากไม่เท่ายังเป็น BLOCKED: คลังที่ติดตั้งมีเฉพาะแถวที่ตรวจรับรองแล้ว และจะไม่เติมค่าหน้าตัดเอง</p>}
  </div>;
}
/** Status pill: FAIL, INCOMPLETE within the screening limit, or INCOMPLETE without a capacity. */
export function ScreenPill({c}: {c: Check}) {
  const state = screenState(c);
  return <span className={'pill ' + (state === 'FAIL' ? 'red' : state === 'WITHIN' ? 'ok' : 'amber')}>{SCREEN_LABEL[state]}</span>;
}
/** Checks with the report numbering (pass `items` from numberChecks) so the UI, A4 report and A3 summary agree. */
export function ChecksTable({checks, items}: {checks?: Check[]; items?: NumberedCheck[]}) {
  const rows = items ?? (checks ?? []).map(check => ({no: '', check}));
  return <table><thead><tr><th>ข้อ</th><th>รายการ</th><th>แรง / ผล</th><th>เกณฑ์คัดกรอง</th><th>Ratio</th><th>สถานะ</th></tr></thead><tbody>
    {rows.map(({no, check: k}) => <React.Fragment key={k.id}><tr><td className="check-no">{no}</td><td><b>{k.label}</b></td><td>{fmt(k.demand, 3)} {k.unit}</td><td>{k.limit === null ? 'ยังไม่ทราบ' : `${fmt(k.limit, 3)} ${k.unit}`}</td><td>{fmt(k.utilization, 3)}</td>
      <td><ScreenPill c={k}/></td></tr>
      <tr className="explain"><td colSpan={6}><details><summary>สูตร · ที่มา · ข้อจำกัด</summary><div className="equation">{k.formula}</div><p>{k.substitution}</p><p>{k.note}</p><small>{k.source}</small></details></td></tr></React.Fragment>)}
  </tbody></table>;
}
export interface SpacingAdvice {key: string; label: string; current: number; max: number | null; unchecked: string[]}
/** Spacing advice; with a project kit (`kitStep`) spacings are multiples of the step and a shortfall points to the kit, not to a bigger section. */
export function AdviceTable<T>({advice, edit, canEdit, kitStep}: {advice: SpacingAdvice[]; edit: Edit<T>; canEdit: boolean; kitStep?: number}) {
  if (!advice.length) return null;
  return <section className="card"><h3>ระยะสูงสุดที่ไม่เกินเกณฑ์ (คำนวณซ้ำ ไม่เปลี่ยนหน้าตัด)</h3>{kitStep && <p className="muted">ชุดมาตรฐานโครงการ: ปรับเฉพาะระยะ เป็นทวีคูณของ {kitStep} mm</p>}<table><thead><tr><th>รายการ</th><th>ใช้อยู่</th><th>สูงสุด</th><th>หมายเหตุ</th><th/></tr></thead><tbody>
    {advice.map(a => <tr key={a.key}><td>{a.label}</td><td>{a.current} mm</td><td>{a.max === null ? 'ไม่มีระยะที่ผ่าน' : a.max + ' mm'}</td><td className="muted">{a.max === null ? (kitStep ? KIT_SHORT : 'ต้องเปลี่ยนหน้าตัด') : [a.unchecked.length ? 'ยังไม่รวม ' + a.unchecked.join(', ') : '', kitStep && a.current % kitStep ? `ระยะที่ใช้ไม่ใช่ทวีคูณ ${kitStep} mm` : ''].filter(Boolean).join(' · ')}</td>
      <td>{a.max !== null && a.max !== a.current && <button className="btn secondary" disabled={!canEdit} onClick={() => edit({[a.key]: a.max} as Partial<T>)}>ใช้ {a.max}</button>}</td></tr>)}</tbody></table></section>;
}
/** Vertical loads (ACI §4.2.1) shared by soffit systems. */
export function VerticalLoadFields<T extends {motorized: boolean}>(p: FormCtx<T>) {
  const n = (k: keyof T & string, label: string, unit: string, help?: string) => <Num<T> {...p} k={k} label={label} unit={unit} help={help}/>;
  return <><div className="form-grid">{n('gamma' as keyof T & string, 'น้ำหนักคอนกรีต + เหล็กเสริม', 'kN/m³')}{n('formDead' as keyof T & string, 'น้ำหนักแบบหล่อ', 'kPa', 'ค่าสมมติ ต้องยืนยันตามระบบแบบที่ใช้')}
    {n('liveLoad' as keyof T & string, 'น้ำหนักจรขณะก่อสร้าง', 'kPa', 'ACI: ไม่น้อยกว่า 2.4 kPa (3.6 kPa เมื่อใช้รถเข็นติดเครื่องยนต์)')}{n('deflectionRatio' as keyof T & string, 'เกณฑ์การโก่ง L/n', 'n', 'L/360 ผิวโชว์ · L/270 งานทั่วไป')}</div>
    <label className="confirm"><input type="checkbox" checked={p.x.motorized} disabled={!p.canEdit} onChange={e => p.edit({motorized: e.target.checked} as Partial<T>)}/>ใช้รถเข็นติดเครื่องยนต์ (ขั้นต่ำ LL 3.6 kPa, D+L 6.0 kPa)</label></>;
}
/** Lateral pressure method and the ACI PRC-347-14(21) §4.2.2.1b inputs. */
export function PressureFields<T extends {pressureMethod: PressureMethod; chemistryCc: number}>(p: FormCtx<T> & {depthLabel: string}) {
  const {x, edit, canEdit} = p, n = (k: string, label: string, unit: string, help?: string) => <Num<T> {...p} k={k as keyof T & string} label={label} unit={unit} help={help}/>;
  return <><label className="field"><span>วิธีคำนวณ</span><select aria-label="วิธีคำนวณแรงดัน" disabled={!canEdit} value={x.pressureMethod} onChange={e => edit({pressureMethod: e.target.value} as Partial<T>)}>
    <option value="HYDROSTATIC">แรงดันของเหลว ρgh {p.depthLabel} (ปลอดภัยเสมอ)</option><option value="ACI347">ACI PRC-347-14(21) §4.2.2.1b (SI)</option></select></label>
    {x.pressureMethod === 'ACI347' && <div className="form-grid">{n('pourRate', 'อัตราการเท R', 'm/h', 'ความสูงที่เทขึ้นต่อชั่วโมง ต้องควบคุมหน้างาน')}{n('concreteTemp', 'อุณหภูมิคอนกรีต T', '°C')}
      {n('slump', 'ค่ายุบตัว', 'mm', '> 175 mm หรือ SCC ใช้แรงดันของเหลว')}{n('vibrationDepth', 'ความลึกเครื่องจี้', 'm')}
      <label className="field"><span>ค่า Cc (ชนิดปูน/สารผสม)</span><select aria-label="ค่า Cc" disabled={!canEdit} value={x.chemistryCc} onChange={e => edit({chemistryCc: Number(e.target.value)} as Partial<T>)}>{CC_VALUES.map(c => <option key={c} value={c}>{c}</option>)}</select></label></div>}</>;
}
export function PlywoodFields<T extends PlywoodSettings>(p: FormCtx<T>) {
  if (p.hide?.has('plywood')) return null;
  const {x, edit, canEdit} = p;
  return <div className="form-grid"><Num<T> {...p} k={'plywood' as keyof T & string} label="ความหนาไม้อัด"/>
    <label className="field"><span>ชนิดไม้อัด</span><select aria-label="ชนิดไม้อัด" disabled={!canEdit} value={x.plywoodGrade} onChange={e => edit({plywoodGrade: e.target.value} as Partial<T>)}>{PLYWOOD_GRADES.map(g => <option key={g} value={g}>{PLYWOOD_GRADE_LABEL[g]}</option>)}</select></label>
    <label className="field"><span>จำนวนช่วงต่อเนื่อง</span><select aria-label="จำนวนช่วงไม้อัด" disabled={!canEdit} value={x.plywoodSpans} onChange={e => edit({plywoodSpans: e.target.value} as Partial<T>)}>{PLYWOOD_SPANS.map(s => <option key={s} value={s}>{SPAN_LABEL[s]}</option>)}</select></label>
    <label className="field"><span>ทิศลายไม้ผิว</span><select aria-label="ทิศลายไม้" disabled={!canEdit} value={x.plywoodFaceGrain} onChange={e => edit({plywoodFaceGrain: e.target.value} as Partial<T>)}>{(['ACROSS', 'PARALLEL'] as const).map(g => <option key={g} value={g}>{GRAIN_LABEL[g]}</option>)}</select></label>
    {x.plywoodGrade === 'CUSTOM' && <><Num<T> {...p} k={'plywoodE' as keyof T & string} label="E ไม้อัด (หน้าตัดเต็ม)" unit="MPa"/><Num<T> {...p} k={'plywoodFb' as keyof T & string} label="Fb ไม้อัด (หน้าตัดเต็ม)" unit="MPa"/></>}</div>;
}
export function MaterialFields<T extends MaterialSettings>(p: FormCtx<T>) {
  if (p.hide?.has('timberGrade')) return null;
  const standardE = [200000, 210000];
  return <div className="form-grid"><Num<T> {...p} k={'steelFy' as keyof T & string} label="Fy เหล็ก" unit="MPa" help="STKR400 / SS400 = 245 MPa"/>
    <label className="field"><span>มาตรฐาน E เหล็ก</span><select aria-label="มาตรฐาน E เหล็ก" disabled={!p.canEdit} value={standardE.includes(p.x.steelE) ? String(p.x.steelE) : 'CUSTOM'} onChange={e => {if (e.target.value !== 'CUSTOM') p.edit({steelE: Number(e.target.value)} as Partial<T>);}}><option value="200000">200 GPa · reference model</option><option value="210000">210 GPa · SCI/Eurocode reference model</option><option value="CUSTOM">กำหนดเอง (กรอกด้านล่าง)</option></select></label>
    <Num<T> {...p} k={'steelE' as keyof T & string} label="E เหล็ก" unit="MPa" help="เลือกค่ามาตรฐานด้านบน หรือระบุค่าจากใบรับรองวัสดุ"/>
    <Num<T> {...p} k={'steelOmegaB' as keyof T & string} label="Ωb (ดัด)" unit="—"/><Num<T> {...p} k={'steelOmegaShear' as keyof T & string} label="Ωv (เฉือน)" unit="—"/>
    <label className="field"><span>ชั้นคุณภาพไม้ (ถ้าใช้ไม้)</span><select aria-label="ชั้นไม้" disabled={!p.canEdit} value={p.x.timberGrade} onChange={e => p.edit({timberGrade: e.target.value} as Partial<T>)}>{TIMBER_GRADES.map(g => <option key={g.id} value={g.id}>{g.label} · E {g.E.toLocaleString('en-US')} MPa</option>)}</select></label>
    <p className="muted">E เหล็ก 200/210 GPa เป็น reference model จากคลังวัสดุ v0.5; ต้องยืนยันเกรด/ใบรับรองจริงก่อนใช้งาน</p></div>;
}
