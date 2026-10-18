import {useMemo} from 'react';
import {AlertTriangle, ChevronRight} from 'lucide-react';
import {wallAdvice, type WallInput, type WallResult} from '../domain/wall';
import {Defs} from '../drawing/primitives';
import {WallSectionView} from '../drawing/wallViews';
import {AdviceTable, ChecksTable, MaterialFields, MemberPicker, Num as NumG, PlywoodFields, PressureFields, fmt as f, type FormCtx} from './FormParts';

export type WallTab = 'overview' | 'geometry' | 'criteria' | 'layout' | 'results';
const GEOMETRY: (keyof WallInput)[] = ['length', 't', 'height', 'system'];
const Num = (props: FormCtx<WallInput> & {k: keyof WallInput & string; label: string; unit?: string; help?: string}) => <NumG<WallInput> {...props}/>;
function Figure({r}: {r: WallResult}) {
  return <svg viewBox="0 0 190 130" className="beam-figure" role="img" aria-label="รูปตัดแบบหล่อผนัง"><Defs/><rect width="190" height="130" fill="#fff"/><WallSectionView r={r} box={{x: 0, y: 0, w: 190, h: 130}} titled={false}/></svg>;
}

export function WallPanel({tab, x, r, error, canEdit, stockIds, onChange, onTab}: {tab: WallTab; x: WallInput; r: WallResult | null; error: string | null; canEdit: boolean; stockIds?: string[];
  onChange: (next: WallInput) => void; onTab: (tab: string) => void}) {
  const edit = (changes: Partial<WallInput>) => onChange({...x, ...changes, ...(Object.keys(changes).some(k => GEOMETRY.includes(k as keyof WallInput)) ? {confirmed: false} : {})});
  const p = {x, edit, canEdit}, single = x.system === 'SINGLE_SIDED';
  const advice = useMemo(() => {try {return r ? wallAdvice(x) : [];} catch {return [];}}, [x, r]);
  const err = error && <div className="warning"><AlertTriangle size={17}/>{error}</div>;
  if (tab === 'overview') return <>
    <div className="metrics"><div><small>CONCRETE (WALL)</small><strong>{f(r?.volume ?? null, 3)}<em>m³</em></strong></div><div><small>FORMWORK AREA</small><strong>{f(r?.formArea ?? null)}<em>m²</em></strong></div>
      <div><small>MAX. FRESH PRESSURE</small><strong>{f(r?.pressureModel.pmax ?? null, 1)}<em>kPa</em></strong></div><div><small>ENGINEERING STATUS</small><strong className="amber">{r?.status ?? 'INVALID'}</strong><span>ต้องตรวจส่วนที่ยังขาด</span></div></div>
    {err}
    <div className="grid two"><section className="card"><div className="card-title"><h3>รูปตัดแบบหล่อผนัง</h3><button className="text-btn" onClick={() => onTab('geometry')}>แก้ไขมิติ →</button></div>{r && <Figure r={r}/>}</section>
      <section className="card"><h3>ขั้นตอนของแบบผนัง</h3><div className="steps">{[
        ['01', 'มิติผนัง', x.confirmed ? 'ยืนยันแล้ว' : 'กรอกความยาว ความหนา ความสูงเท และยืนยัน', 'geometry'],
        ['02', 'Design Criteria', 'แรงดันคอนกรีต (ρgh / ACI) และไม้อัด APA', 'criteria'],
        ['03', 'จัดวางและหน้าตัด', 'คร่าว คานคู่ Tie ค้ำยันเอียง', 'layout'],
        ['04', 'รายการคำนวณ', r ? `${r.checks.filter(k => k.status === 'FAIL').length} รายการเกินเกณฑ์` : 'ยังคำนวณไม่ได้', 'results'],
        ['05', 'แบบ A3 และรายงาน', 'WF-01 ถึง WF-03 และรายการคำนวณ A4', 'drawings'],
      ].map(([no, a, b, t]) => <div key={no} onClick={() => onTab(t)} style={{cursor: 'pointer'}}><span>{no}</span><section><b>{a}</b><p>{b}</p></section></div>)}</div>
        <div className="warning"><AlertTriangle size={18}/><p>ผลคัดกรองเบื้องต้น ไม่ใช่การอนุมัติก่อสร้าง · ต้องกรอก SWL ชุด Tie และค้ำยันจากผู้ผลิต · {single ? 'แบบด้านเดียว: ตรวจพุกฐานและการโก่งเดาะค้ำยันเพิ่ม' : 'แบบสองด้านพร้อม Tie'}</p></div></section></div>
  </>;
  if (tab === 'geometry') return <div className="grid two"><section className="card"><h3>มิติผนัง</h3><p className="muted">ทุกมิติเป็น mm · แก้มิติหรือระบบแบบแล้วต้องยืนยันใหม่</p>
    <label className="field"><span>ระบบแบบหล่อ</span><select aria-label="ระบบแบบหล่อผนัง" disabled={!canEdit} value={x.system} onChange={e => edit({system: e.target.value as WallInput['system']})}>
      <option value="TWO_SIDED">สองด้าน + Tie ทะลุผนัง</option><option value="SINGLE_SIDED">ด้านเดียว (เทชนดิน/ผนังเดิม) + strongback + ค้ำยัน</option></select></label>
    <div className="form-grid"><Num {...p} k="length" label="ความยาวผนัง"/><Num {...p} k="t" label="ความหนาผนัง"/><Num {...p} k="height" label="ความสูงเทต่อครั้ง"/></div>
    {err}
    <label className="confirm"><input type="checkbox" checked={x.confirmed} disabled={!!error || !canEdit} onChange={e => edit({confirmed: e.target.checked})}/>ตรวจมิติ หน่วย และตำแหน่งผนังจากแบบต้นฉบับแล้ว</label>
    <button className="btn" onClick={() => onTab('criteria')}>ไป Design Criteria <ChevronRight size={16}/></button></section>
    <section className="card">{r ? <Figure r={r}/> : <p>ตรวจมิติให้ถูกต้องก่อนแสดงรูปตัด</p>}</section></div>;
  if (tab === 'criteria') return <><div className="notice"><AlertTriangle size={17}/>ค่าเริ่มต้นเป็นค่าอ้างอิงเบื้องต้นจากมาตรฐานและแคตตาล็อก (แก้ไขได้ทุกช่อง) ต้องยืนยันกับผลิตภัณฑ์ ใบรับรองวัสดุ และวิธีเทจริง</div>
    <div className="grid two"><section className="card"><h3>แรงดันคอนกรีตสด / การโก่ง</h3>
      <div className="form-grid"><Num {...p} k="gamma" label="น้ำหนักคอนกรีต" unit="kN/m³"/><Num {...p} k="deflectionRatio" label="เกณฑ์การโก่ง L/n" unit="n" help="L/360 ผิวโชว์ · L/270 งานทั่วไป"/></div>
      <PressureFields<WallInput> {...p} depthLabel="เต็มความสูงเท"/>
      {r && <p className="muted">pmax = {f(r.pressureModel.pmax, 1)} kPa · {r.pressureModel.reason}</p>}</section>
      <section className="card"><h3>ไม้อัด</h3>
        <PlywoodFields<WallInput> {...p}/>
        {r && <p className="muted">{r.plywood.spanReason} · รับได้ {f(r.plywood.allowablePressure, 1)} kPa (ต้องการ {f(r.pressureModel.pmax, 1)} kPa)</p>}
        <h3>เหล็กและไม้</h3>
        <MaterialFields<WallInput> {...p}/></section></div></>;
  if (tab === 'layout') return <>
    {err}
    <section className="card"><h3>{single ? 'แบบผนังด้านเดียว: ไม้อัด → คร่าวแนวตั้ง → คานคู่แนวนอน → strongback → ค้ำยันเอียง + พุกฐาน' : 'แบบผนัง: ไม้อัด → คร่าวแนวตั้ง → คานคู่แนวนอน → Tie ทะลุผนัง'}</h3>
      <div className="grid two"><MemberPicker<WallInput> {...p} k="studSectionId" role="stud" title="คร่าว (แนวตั้ง)" stockIds={stockIds}/><MemberPicker<WallInput> {...p} k="walerSectionId" role="waler" title="คานคู่ (2 ตัวต่อระดับ)" stockIds={stockIds} pair/></div>
      <div className="form-grid four"><Num {...p} k="studSpacing" label="ระยะคร่าวสูงสุด"/><Num {...p} k="walerSpacing" label="ระยะคานคู่สูงสุด (แนวตั้ง)"/>
        {!single && <><Num {...p} k="tieSpacing" label="ระยะ Tie สูงสุด"/>
        <Num {...p} k="tieDiameter" label="Tie Ø"/><Num {...p} k="tieFy" label="Fy เหล็ก Tie" unit="MPa" help="SD40 = 390 MPa (มอก. 24)"/><Num {...p} k="tieOmega" label="Ω ตัวเหล็ก Tie" unit="—"/>
        <Num {...p} k="tieSWL" label="SWL ชุด Tie" unit="kN" help="จากผู้ผลิต (SF ≥ 2.0 ตาม ACI Table 4.4) · 0 = ยังไม่ทราบ"/></>}</div>
      {single && <div className="grid two"><MemberPicker<WallInput> {...p} k="strongbackSectionId" role="waler" title="Strongback (แนวตั้ง ที่ทุกสถานีค้ำยัน)" stockIds={stockIds} pair={x.strongbackCount > 1}/>
        <div className="form-grid"><label className="field"><span>Strongback ต่อสถานี</span><select aria-label="จำนวน strongback" disabled={!canEdit} value={x.strongbackCount} onChange={e => edit({strongbackCount: Number(e.target.value) as 1 | 2})}><option value={1}>1 ตัว</option><option value={2}>2 ตัว (คู่)</option></select></label>
          <Num {...p} k="anchorSWL" label="SWL พุกฐานแบบต่อสถานี" unit="kN" help="จากผู้ผลิต · 0 = ยังไม่ทราบ"/></div></div>}
      {r && (single ? <p className="muted">strongback: แรงที่ค้ำยัน {f(r.strongbackBrace)} kN · ที่ฐาน {f(r.strongbackBase)} kN · พุกรับแรงยก {f(r.anchorUplift)} kN ต่อสถานี</p>
        : <p className="muted">แรง Tie {f(r.tieForce)} kN/ตัว · ตัวเหล็กรับได้ {f(r.tieBody)} kN · คร่าวช่วง {f(x.height / (r.levels.length - 1), 0)} mm · คานคู่ช่วง {f(x.length / (r.ties.length - 1), 0)} mm</p>)}</section>
    <section className="card"><h3>{single ? 'ค้ำยันเอียง (รับแรงดันคอนกรีต + ACI §4.2.3)' : 'ค้ำยันเอียง (ACI §4.2.3)'}</h3>
      <div className="form-grid four"><Num {...p} k="braceSpacing" label={single ? 'ระยะ strongback / ค้ำยัน' : 'ระยะค้ำยันตามยาวผนัง'}/><Num {...p} k="braceHeight" label="ความสูงจุดยึดค้ำยัน"/><Num {...p} k="braceAngle" label="มุมค้ำยันจากแนวนอน" unit="°" help="20–75°"/>
        <Num {...p} k="braceSWL" label="SWL ค้ำยัน" unit="kN" help="จากผู้ผลิต · 0 = ยังไม่ทราบ"/>
        <label className="field"><span>รุ่น/เอกสารค้ำยัน</span><input aria-label="รุ่นค้ำยันเอียง" maxLength={300} disabled={!canEdit} value={x.braceReference} onChange={e => edit({braceReference: e.target.value})}/></label></div>
      {r && <p className="muted">โมเมนต์พลิก {f(r.braceMoment, 3)} kN·m/m ({r.braceGoverning}) · แรงค้ำยัน {f(r.braceForce)} kN/ตัว</p>}</section>
    <AdviceTable<WallInput> advice={advice} edit={edit} canEdit={canEdit}/>
    <button className="btn" onClick={() => onTab('results')}>ดูรายการคำนวณ <ChevronRight size={16}/></button></>;
  return <>{err}{r && <>
    <div className="metrics"><div><small>PRESSURE</small><strong>{f(r.pressureModel.pmax, 1)}<em>kPa</em></strong></div>{single ? <div><small>ANCHOR UPLIFT</small><strong>{f(r.anchorUplift)}<em>kN</em></strong></div> : <div><small>TIE FORCE</small><strong>{f(r.tieForce)}<em>kN</em></strong></div>}
      <div><small>BRACE FORCE</small><strong>{f(r.braceForce)}<em>kN</em></strong></div><div><small>SYSTEM STATUS</small><strong className="amber">{r.status}</strong></div></div>
    <section className="card"><h3>ตรวจเบื้องต้น / ตรวจวิธีที่ยังขาด</h3><ChecksTable checks={r.checks}/><h3>ก่อนออกเอกสารใช้งานจริง</h3><ul className="blockers">{r.blockers.map(b => <li key={b}>{b}</li>)}</ul></section></>}</>;
}
