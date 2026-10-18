import React, {useMemo} from 'react';
import {AlertTriangle, ChevronRight} from 'lucide-react';
import {beamAdvice, type BeamInput, type BeamResult} from '../domain/beam';
import {CC_VALUES} from '../domain/pressure';
import {GRAIN_LABEL, PLYWOOD_GRADE_LABEL, PLYWOOD_GRADES, PLYWOOD_SPANS, SPAN_LABEL} from '../domain/plywoodGrades';
import {FAMILY_LABEL, TIMBER_GRADES, catalogueProperties, sectionById, stockFor, type StockFamily, type StockRole} from '../domain/sectionStock';
import {Defs} from '../drawing/primitives';
import {BeamSectionView} from '../drawing/beamViews';
import {Props, STUD_FAMILIES, WALER_FAMILIES} from './SectionPicker';

export type BeamTab = 'overview' | 'geometry' | 'criteria' | 'layout' | 'results';
const f = (v: number | null, d = 2) => v === null ? '—' : v.toLocaleString('en-US', {minimumFractionDigits: d, maximumFractionDigits: d});
const GEOMETRY: (keyof BeamInput)[] = ['b', 'h', 'slabT', 'length', 'soffitHeight', 'slabSides', 'slabLeft', 'slabRight'];
type Edit = (changes: Partial<BeamInput>) => void;

function Num({x, k, label, unit = 'mm', help, edit, canEdit}: {x: BeamInput; k: keyof BeamInput; label: string; unit?: string; help?: string; edit: Edit; canEdit: boolean}) {
  return <label className="field"><span>{label}<small>{unit}</small></span>
    <input type="number" min="0" step="any" aria-label={label} disabled={!canEdit} value={String(x[k])} onChange={e => edit({[k]: Number(e.target.value)} as Partial<BeamInput>)}/>
    {help && <small className="help">{help}</small>}</label>;
}
/** Two-step section choice (family → size) for one beam member, limited to the project stock. */
function MemberPicker({x, k, role, title, edit, canEdit, stockIds, pair}: {x: BeamInput; k: 'joistSectionId' | 'bearerSectionId' | 'studSectionId' | 'walerSectionId'; role: StockRole; title: string;
  edit: Edit; canEdit: boolean; stockIds?: string[]; pair?: boolean}) {
  const s = sectionById(x[k]), families = role === 'stud' ? STUD_FAMILIES : WALER_FAMILIES, stock = stockFor(stockIds).filter(v => v.roles.includes(role));
  const pick = (family: StockFamily) => {
    const I = s ? catalogueProperties(s).I : 0, list = stock.filter(v => v.family === family).sort((a, b) => a.A_cm2 - b.A_cm2);
    const next = list.find(v => catalogueProperties(v).I >= I) ?? list[list.length - 1];
    if (next) edit({[k]: next.id} as Partial<BeamInput>);
  };
  return <div>
    <h4>{title}</h4>
    <div className="form-grid">
      <label className="field"><span>ชนิด</span><select aria-label={'ชนิด' + title} value={s?.family ?? ''} disabled={!canEdit} onChange={e => pick(e.target.value as StockFamily)}>
        {families.filter(fm => stock.some(v => v.family === fm)).map(fm => <option key={fm} value={fm}>{FAMILY_LABEL[fm]}</option>)}</select></label>
      <label className="field"><span>ขนาด</span><select aria-label={'ขนาด' + title} value={x[k]} disabled={!canEdit} onChange={e => edit({[k]: e.target.value} as Partial<BeamInput>)}>
        {stock.filter(v => v.family === s?.family).map(v => <option key={v.id} value={v.id}>{v.designation}{v.kg_per_m !== null ? ` · ${v.kg_per_m} kg/m` : ''}</option>)}</select></label>
    </div>
    <Props s={s} pair={pair}/>
  </div>;
}
function Checks({r}: {r: BeamResult}) {
  return <table><thead><tr><th>รายการ</th><th>แรง / ผล</th><th>เกณฑ์คัดกรอง</th><th>Ratio</th><th>สถานะ</th></tr></thead><tbody>
    {r.checks.map(k => <React.Fragment key={k.id}><tr><td><b>{k.label}</b></td><td>{f(k.demand, 3)} {k.unit}</td><td>{k.limit === null ? 'ยังไม่ทราบ' : `${f(k.limit, 3)} ${k.unit}`}</td><td>{f(k.utilization, 3)}</td>
      <td><span className={'pill ' + (k.status === 'FAIL' ? 'red' : 'amber')}>{k.status}</span></td></tr>
      <tr className="explain"><td colSpan={5}><details><summary>สูตร · ที่มา · ข้อจำกัด</summary><div className="equation">{k.formula}</div><p>{k.substitution}</p><p>{k.note}</p><small>{k.source}</small></details></td></tr></React.Fragment>)}
  </tbody></table>;
}
function Figure({r}: {r: BeamResult}) {
  return <svg viewBox="0 0 190 130" className="beam-figure" role="img" aria-label="รูปตัดแบบหล่อคาน"><Defs/><rect width="190" height="130" fill="#fff"/><BeamSectionView r={r} box={{x: 0, y: 0, w: 190, h: 130}} titled={false}/></svg>;
}

export function BeamPanel({tab, x, r, error, canEdit, stockIds, onChange, onTab}: {tab: BeamTab; x: BeamInput; r: BeamResult | null; error: string | null; canEdit: boolean; stockIds?: string[];
  onChange: (next: BeamInput) => void; onTab: (tab: string) => void}) {
  const edit: Edit = changes => onChange({...x, ...changes, ...(Object.keys(changes).some(k => GEOMETRY.includes(k as keyof BeamInput)) ? {confirmed: false} : {})});
  const p = {x, edit, canEdit};
  const advice = useMemo(() => {try {return r ? beamAdvice(x) : [];} catch {return [];}}, [x, r]);
  const err = error && <div className="warning"><AlertTriangle size={17}/>{error}</div>;
  if (tab === 'overview') return <>
    <div className="metrics"><div><small>CONCRETE (BEAM)</small><strong>{f(r?.volume ?? null, 3)}<em>m³</em></strong></div><div><small>SOFFIT LOAD q</small><strong>{f(r?.loads.beam ?? null)}<em>kPa</em></strong></div>
      <div><small>SIDE PRESSURE</small><strong>{f(r?.pressureModel.pmax ?? null, 1)}<em>kPa</em></strong></div><div><small>ENGINEERING STATUS</small><strong className="amber">{r?.status ?? 'INVALID'}</strong><span>ต้องตรวจส่วนที่ยังขาด</span></div></div>
    {err}
    <div className="grid two"><section className="card"><div className="card-title"><h3>รูปตัดแบบหล่อคาน</h3><button className="text-btn" onClick={() => onTab('geometry')}>แก้ไขมิติ →</button></div>{r && <Figure r={r}/>}</section>
      <section className="card"><h3>ขั้นตอนของแบบคาน</h3><div className="steps">{[
        ['01', 'มิติคาน', x.confirmed ? 'ยืนยันแล้ว' : 'กรอก b, h, พื้น, ความยาว และยืนยัน', 'geometry'],
        ['02', 'Design Criteria', 'น้ำหนักบรรทุก ACI §4.2.1 แรงดันด้านข้าง ไม้อัด APA', 'criteria'],
        ['03', 'จัดวางและหน้าตัด', 'คร่าวท้อง คานรับ ค้ำยัน คร่าวข้าง Tie', 'layout'],
        ['04', 'รายการคำนวณ', r ? `${r.checks.filter(k => k.status === 'FAIL').length} รายการเกินเกณฑ์` : 'ยังคำนวณไม่ได้', 'results'],
        ['05', 'แบบ A3 และรายงาน', 'BF-01 ถึง BF-03 และรายการคำนวณ A4', 'drawings'],
      ].map(([no, a, b, t]) => <div key={no} onClick={() => onTab(t)} style={{cursor: 'pointer'}}><span>{no}</span><section><b>{a}</b><p>{b}</p></section></div>)}</div>
        <div className="warning"><AlertTriangle size={18}/><p>ผลคัดกรองเบื้องต้น ไม่ใช่การอนุมัติก่อสร้าง · ต้องกรอก SWL ค้ำยัน/Tie จากผู้ผลิตและออกแบบค้ำยันทแยง</p></div></section></div>
  </>;
  if (tab === 'geometry') return <div className="grid two"><section className="card"><h3>มิติคาน</h3><p className="muted">ทุกมิติเป็น mm · แก้มิติแล้วต้องยืนยันใหม่</p>
    <div className="form-grid">
      <Num {...p} k="b" label="ความกว้างคาน b"/><Num {...p} k="h" label="ความลึกคาน h (รวมพื้น)" help="จากหลังพื้นถึงท้องคาน"/>
      <label className="field"><span>พื้นที่มาต่อกับคาน</span><select aria-label="พื้นที่มาต่อกับคาน" disabled={!canEdit} value={x.slabSides} onChange={e => {const v = Number(e.target.value) as 0 | 1 | 2; edit({slabSides: v, ...(v === 0 ? {slabT: 0, slabLeft: 0, slabRight: 0} : x.slabT === 0 ? {slabT: 120} : {}), ...(v === 1 ? {slabLeft: 0} : {})});}}>
        <option value={2}>สองด้าน (คานภายใน)</option><option value={1}>ด้านเดียว (คานขอบ)</option><option value={0}>ไม่มีพื้น (คานเดี่ยว)</option></select></label>
      {x.slabSides > 0 && <Num {...p} k="slabT" label="ความหนาพื้น"/>}
      <Num {...p} k="length" label="ความยาวคาน (ระหว่างหน้าเสา)"/><Num {...p} k="soffitHeight" label="ความสูงจากพื้นล่างถึงท้องคาน"/>
      {x.slabSides === 2 && <Num {...p} k="slabLeft" label="แถบพื้นที่ค้ำคานรับ ซ้าย" help="0 = แบบพื้นมีค้ำยันของตัวเอง"/>}{x.slabSides > 0 && <Num {...p} k="slabRight" label={x.slabSides === 1 ? "แถบพื้นที่ค้ำคานรับ (ด้านพื้น)" : "แถบพื้นที่ค้ำคานรับ ขวา"}/>}
    </div>
    {err}
    <label className="confirm"><input type="checkbox" checked={x.confirmed} disabled={!!error || !canEdit} onChange={e => edit({confirmed: e.target.checked})}/>ตรวจมิติ หน่วย และตำแหน่งคานจากแบบต้นฉบับแล้ว</label>
    <button className="btn" onClick={() => onTab('criteria')}>ไป Design Criteria <ChevronRight size={16}/></button></section>
    <section className="card">{r ? <Figure r={r}/> : <p>ตรวจมิติให้ถูกต้องก่อนแสดงรูปตัด</p>}</section></div>;
  if (tab === 'criteria') return <><div className="notice"><AlertTriangle size={17}/>ค่าเริ่มต้นเป็นค่าอ้างอิงเบื้องต้นจากมาตรฐานและแคตตาล็อก (แก้ไขได้ทุกช่อง) ต้องยืนยันกับผลิตภัณฑ์ ใบรับรองวัสดุ และวิธีเทจริง</div>
    <div className="grid two"><section className="card"><h3>น้ำหนักบรรทุกแนวดิ่ง (ACI PRC-347-14(21) §4.2.1)</h3>
      <div className="form-grid"><Num {...p} k="gamma" label="น้ำหนักคอนกรีต + เหล็กเสริม" unit="kN/m³"/><Num {...p} k="formDead" label="น้ำหนักแบบหล่อ" unit="kPa" help="ค่าสมมติ ต้องยืนยันตามระบบแบบที่ใช้"/>
        <Num {...p} k="liveLoad" label="น้ำหนักจรขณะก่อสร้าง" unit="kPa" help="ACI: ไม่น้อยกว่า 2.4 kPa (3.6 kPa เมื่อใช้รถเข็นติดเครื่องยนต์)"/><Num {...p} k="deflectionRatio" label="เกณฑ์การโก่ง L/n" unit="n" help="L/360 ผิวโชว์ · L/270 งานทั่วไป"/></div>
      <label className="confirm"><input type="checkbox" checked={x.motorized} disabled={!canEdit} onChange={e => edit({motorized: e.target.checked})}/>ใช้รถเข็นติดเครื่องยนต์ (ขั้นต่ำ LL 3.6 kPa, D+L 6.0 kPa)</label>
      {r && <ul className="muted">{r.loads.steps.map(s => <li key={s}>{s}</li>)}</ul>}
      <h3>แรงดันด้านข้างบนแบบข้างคาน</h3>
      <label className="field"><span>วิธีคำนวณ</span><select aria-label="วิธีคำนวณแรงดันคาน" disabled={!canEdit} value={x.pressureMethod} onChange={e => edit({pressureMethod: e.target.value as BeamInput['pressureMethod']})}>
        <option value="HYDROSTATIC">แรงดันของเหลว ρgh เต็มความลึก (ปลอดภัยเสมอ)</option><option value="ACI347">ACI PRC-347-14(21) §4.2.2.1b (SI)</option></select></label>
      {x.pressureMethod === 'ACI347' && <div className="form-grid"><Num {...p} k="pourRate" label="อัตราการเท R" unit="m/h"/><Num {...p} k="concreteTemp" label="อุณหภูมิคอนกรีต T" unit="°C"/>
        <Num {...p} k="slump" label="ค่ายุบตัว" unit="mm" help="> 175 mm หรือ SCC ใช้แรงดันของเหลว"/><Num {...p} k="vibrationDepth" label="ความลึกเครื่องจี้" unit="m"/>
        <label className="field"><span>ค่า Cc (ชนิดปูน/สารผสม)</span><select aria-label="Cc คาน" disabled={!canEdit} value={x.chemistryCc} onChange={e => edit({chemistryCc: Number(e.target.value)})}>{CC_VALUES.map(c => <option key={c} value={c}>{c}</option>)}</select></label></div>}
      {r && <p className="muted">pmax = {f(r.pressureModel.pmax, 1)} kPa · {r.pressureModel.reason}</p>}</section>
      <section className="card"><h3>ไม้อัด (ท้องคานและแบบข้าง)</h3>
        <div className="form-grid"><Num {...p} k="plywood" label="ความหนาไม้อัด"/>
          <label className="field"><span>ชนิดไม้อัด</span><select aria-label="ชนิดไม้อัดคาน" disabled={!canEdit} value={x.plywoodGrade} onChange={e => edit({plywoodGrade: e.target.value as BeamInput['plywoodGrade']})}>{PLYWOOD_GRADES.map(g => <option key={g} value={g}>{PLYWOOD_GRADE_LABEL[g]}</option>)}</select></label>
          <label className="field"><span>จำนวนช่วงต่อเนื่อง</span><select aria-label="จำนวนช่วงไม้อัดคาน" disabled={!canEdit} value={x.plywoodSpans} onChange={e => edit({plywoodSpans: e.target.value as BeamInput['plywoodSpans']})}>{PLYWOOD_SPANS.map(s => <option key={s} value={s}>{SPAN_LABEL[s]}</option>)}</select></label>
          <label className="field"><span>ทิศลายไม้ผิว</span><select aria-label="ทิศลายไม้คาน" disabled={!canEdit} value={x.plywoodFaceGrain} onChange={e => edit({plywoodFaceGrain: e.target.value as BeamInput['plywoodFaceGrain']})}>{(['ACROSS', 'PARALLEL'] as const).map(g => <option key={g} value={g}>{GRAIN_LABEL[g]}</option>)}</select></label>
          {x.plywoodGrade === 'CUSTOM' && <><Num {...p} k="plywoodE" label="E ไม้อัด (หน้าตัดเต็ม)" unit="MPa"/><Num {...p} k="plywoodFb" label="Fb ไม้อัด (หน้าตัดเต็ม)" unit="MPa"/></>}</div>
        {r && <p className="muted">ท้องคาน: {r.soffitPlywood.spanReason} · รับได้ {f(r.soffitPlywood.allowablePressure, 1)} kPa (ต้องการ {f(r.loads.beam, 1)}) · แบบข้าง: รับได้ {f(r.sidePlywood.allowablePressure, 1)} kPa (ต้องการ {f(r.pressureModel.pmax, 1)})</p>}
        <h3>เหล็กและไม้</h3>
        <div className="form-grid"><Num {...p} k="steelFy" label="Fy เหล็ก" unit="MPa" help="STKR400 / SS400 = 245 MPa"/><Num {...p} k="steelE" label="E เหล็ก" unit="MPa"/>
          <Num {...p} k="steelOmegaB" label="Ωb (ดัด)" unit="—"/><Num {...p} k="steelOmegaShear" label="Ωv (เฉือน)" unit="—"/>
          <label className="field"><span>ชั้นคุณภาพไม้ (ถ้าใช้ไม้)</span><select aria-label="ชั้นไม้คาน" disabled={!canEdit} value={x.timberGrade} onChange={e => edit({timberGrade: e.target.value})}>{TIMBER_GRADES.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}</select></label></div></section></div></>;
  if (tab === 'layout') return <>
    {err}
    <section className="card"><h3>แบบท้องคาน: ไม้อัด → คร่าวท้อง (ตามขวาง) → คานรับ (ตามยาว) → ค้ำยัน</h3>
      <div className="grid two"><MemberPicker {...p} k="joistSectionId" role="stud" title="คร่าวท้องคาน" stockIds={stockIds}/><MemberPicker {...p} k="bearerSectionId" role="waler" title="คานรับท้อง" stockIds={stockIds} pair={x.bearerCount > 1}/></div>
      <div className="form-grid four"><Num {...p} k="joistSpacing" label="ระยะคร่าวท้องสูงสุด"/><Num {...p} k="shoreSpacing" label="ระยะค้ำยันตามยาวสูงสุด"/><Num {...p} k="shoreWidth" label="ระยะค้ำยันตามขวาง" help="ระยะระหว่างแนวคานรับสองแนว"/>
        <label className="field"><span>คานรับต่อแนว</span><select aria-label="จำนวนคานรับต่อแนว" disabled={!canEdit} value={x.bearerCount} onChange={e => edit({bearerCount: Number(e.target.value) as 1 | 2})}><option value={1}>1 ตัว</option><option value={2}>2 ตัว (คู่)</option></select></label>
        <Num {...p} k="shoreSWL" label="SWL ค้ำยันที่ความยาวใช้งาน" unit="kN" help="จากผู้ผลิต · 0 = ยังไม่ทราบ"/>
        <label className="field"><span>รุ่น/เอกสารค้ำยัน</span><input aria-label="รุ่นค้ำยัน" maxLength={300} disabled={!canEdit} value={x.shoreReference} onChange={e => edit({shoreReference: e.target.value})}/></label></div>
      {r && <p className="muted">ค้ำยันรับ {f(r.shoreLoad)} kN/ต้น · ความยาวใช้งาน ≈ {f(r.shoreLength, 0)} mm · แรงด้านข้างที่ต้องค้ำ {f(r.lateralPerM)} kN/m</p>}</section>
    <section className="card"><h3>แบบข้างคาน: ไม้อัด → คร่าวแนวตั้ง → (คานคู่ + Tie) / ไม้กันตีน</h3>
      <div className="grid two"><MemberPicker {...p} k="studSectionId" role="stud" title="คร่าวแบบข้าง" stockIds={stockIds}/>{x.tieRows > 0 && <MemberPicker {...p} k="walerSectionId" role="waler" title="คานคู่แบบข้าง (2 ตัวต่อแถว)" stockIds={stockIds} pair/>}</div>
      <div className="form-grid four"><Num {...p} k="studSpacing" label="ระยะคร่าวข้างสูงสุด"/>
        <label className="field"><span>แถว Tie ทะลุคาน</span><select aria-label="แถว Tie" disabled={!canEdit} value={x.tieRows} onChange={e => edit({tieRows: Number(e.target.value)})}>{[0, 1, 2, 3].map(v => <option key={v} value={v}>{v === 0 ? 'ไม่มี (คานตื้น)' : v + ' แถว'}</option>)}</select></label>
        {x.tieRows > 0 && <><Num {...p} k="tieSpacing" label="ระยะ Tie ตามยาวสูงสุด"/><Num {...p} k="tieDiameter" label="Tie Ø"/><Num {...p} k="tieSWL" label="SWL ชุด Tie" unit="kN" help="จากผู้ผลิต (SF ≥ 2.0 ตาม ACI Table 4.4)"/></>}</div>
      {r && <p className="muted">ช่วงคร่าวข้าง {f(r.studSpan, 0)} mm · แรงที่ไม้กันตีน {f(r.kickerForcePerM)} kN/m{r.tieForce !== null ? ` · แรง Tie ${f(r.tieForce)} kN/ตัว` : ''}</p>}</section>
    {advice.length > 0 && <section className="card"><h3>ระยะสูงสุดที่ไม่เกินเกณฑ์ (คำนวณซ้ำ ไม่เปลี่ยนหน้าตัด)</h3><table><thead><tr><th>รายการ</th><th>ใช้อยู่</th><th>สูงสุด</th><th>หมายเหตุ</th><th/></tr></thead><tbody>
      {advice.map(a => <tr key={a.key}><td>{a.label}</td><td>{a.current} mm</td><td>{a.max === null ? 'ไม่มีระยะที่ผ่าน' : a.max + ' mm'}</td><td className="muted">{a.max === null ? 'ต้องเปลี่ยนหน้าตัด' : a.unchecked.length ? 'ยังไม่รวม ' + a.unchecked.join(', ') : ''}</td>
        <td>{a.max !== null && a.max !== a.current && <button className="btn secondary" disabled={!canEdit} onClick={() => edit({[a.key]: a.max} as Partial<BeamInput>)}>ใช้ {a.max}</button>}</td></tr>)}</tbody></table></section>}
    <button className="btn" onClick={() => onTab('results')}>ดูรายการคำนวณ <ChevronRight size={16}/></button></>;
  return <>{err}{r && <>
    <div className="metrics"><div><small>SOFFIT q</small><strong>{f(r.loads.beam)}<em>kPa</em></strong></div><div><small>SIDE pmax</small><strong>{f(r.pressureModel.pmax, 1)}<em>kPa</em></strong></div>
      <div><small>SHORE LOAD</small><strong>{f(r.shoreLoad)}<em>kN</em></strong></div><div><small>SYSTEM STATUS</small><strong className="amber">{r.status}</strong></div></div>
    <section className="card"><h3>ตรวจเบื้องต้น / ตรวจวิธีที่ยังขาด</h3><Checks r={r}/><h3>ก่อนออกเอกสารใช้งานจริง</h3><ul className="blockers">{r.blockers.map(b => <li key={b}>{b}</li>)}</ul></section></>}</>;
}
