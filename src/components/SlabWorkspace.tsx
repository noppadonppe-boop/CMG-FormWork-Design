import {useMemo} from 'react';
import {AlertTriangle, ChevronRight} from 'lucide-react';
import {slabAdvice, type SlabInput, type SlabResult} from '../domain/slab';
import {numberChecks, slabCheckGroups} from '../domain/reportOutline';
import {Defs} from '../drawing/primitives';
import {SlabPlanView} from '../drawing/slabViews';
import {AdviceTable, ChecksTable, MaterialFields, MemberPicker, Num as NumG, PlywoodFields, VerticalLoadFields, fmt as f, type FormCtx} from './FormParts';

export type SlabTab = 'overview' | 'geometry' | 'criteria' | 'layout' | 'results';
const GEOMETRY: (keyof SlabInput)[] = ['lx', 'ly', 't', 'soffitHeight'];
const Num = (props: FormCtx<SlabInput> & {k: keyof SlabInput & string; label: string; unit?: string; help?: string}) => <NumG<SlabInput> {...props}/>;
function Figure({r}: {r: SlabResult}) {
  return <svg viewBox="0 0 190 130" className="beam-figure" role="img" aria-label="แปลนแบบหล่อพื้น"><Defs/><rect width="190" height="130" fill="#fff"/><SlabPlanView r={r} box={{x: 0, y: 0, w: 190, h: 130}} titled={false}/></svg>;
}

export function SlabPanel({tab, x, r, error, canEdit, stockIds, onChange, onTab, spacingStep}: {spacingStep?: number; tab: SlabTab; x: SlabInput; r: SlabResult | null; error: string | null; canEdit: boolean; stockIds?: string[];
  onChange: (next: SlabInput) => void; onTab: (tab: string) => void}) {
  const edit = (changes: Partial<SlabInput>) => onChange({...x, ...changes, ...(Object.keys(changes).some(k => GEOMETRY.includes(k as keyof SlabInput)) ? {confirmed: false} : {})});
  const p = {x, edit, canEdit};
  const advice = useMemo(() => {try {return r ? slabAdvice(x, spacingStep ?? 25) : [];} catch {return [];}}, [x, r, spacingStep]);
  const err = error && <div className="warning"><AlertTriangle size={17}/>{error}</div>;
  if (tab === 'overview') return <>
    <div className="metrics"><div><small>CONCRETE (SLAB)</small><strong>{f(r?.volume ?? null, 3)}<em>m³</em></strong></div><div><small>DESIGN LOAD q</small><strong>{f(r?.loads.q ?? null)}<em>kPa</em></strong></div>
      <div><small>SHORE LOAD</small><strong>{f(r?.shoreLoad ?? null)}<em>kN</em></strong></div><div><small>ENGINEERING STATUS</small><strong className="amber">{r?.status ?? 'INVALID'}</strong><span>ต้องตรวจส่วนที่ยังขาด</span></div></div>
    {err}
    <div className="grid two"><section className="card"><div className="card-title"><h3>แปลนแบบหล่อพื้นและค้ำยัน</h3><button className="text-btn" onClick={() => onTab('geometry')}>แก้ไขมิติ →</button></div>{r && <Figure r={r}/>}</section>
      <section className="card"><h3>ขั้นตอนของแบบพื้น</h3><div className="steps">{[
        ['01', 'มิติพื้น', x.confirmed ? 'ยืนยันแล้ว' : 'กรอกขนาดช่วงพื้น ความหนา ความสูง และยืนยัน', 'geometry'],
        ['02', 'Design Criteria', 'น้ำหนักบรรทุก ACI §4.2.1 และไม้อัด APA', 'criteria'],
        ['03', 'จัดวางและหน้าตัด', 'คร่าว คานรับ ค้ำยัน', 'layout'],
        ['04', 'รายการคำนวณ', r ? `${r.checks.filter(k => k.status === 'FAIL').length} รายการเกินเกณฑ์` : 'ยังคำนวณไม่ได้', 'results'],
        ['05', 'แบบ A3 และรายงาน', 'SF-01 ถึง SF-03 และรายการคำนวณ A4', 'drawings'],
      ].map(([no, a, b, t]) => <div key={no} onClick={() => onTab(t)} style={{cursor: 'pointer'}}><span>{no}</span><section><b>{a}</b><p>{b}</p></section></div>)}</div>
        <div className="warning"><AlertTriangle size={18}/><p>ผลคัดกรองเบื้องต้น ไม่ใช่การอนุมัติก่อสร้าง · ต้องกรอก SWL ค้ำยันจากผู้ผลิตและออกแบบค้ำยันทแยง</p></div></section></div>
  </>;
  if (tab === 'geometry') return <div className="grid two"><section className="card"><h3>มิติพื้น (หนึ่งช่วง)</h3><p className="muted">ทุกมิติเป็น mm · แนว X = แนวคานรับ, แนว Y = แนวคร่าว · แก้มิติแล้วต้องยืนยันใหม่</p>
    <div className="form-grid"><Num {...p} k="lx" label="ความยาวช่วงพื้น X"/><Num {...p} k="ly" label="ความกว้างช่วงพื้น Y"/><Num {...p} k="t" label="ความหนาพื้น"/><Num {...p} k="soffitHeight" label="ความสูงจากพื้นล่างถึงท้องพื้น"/></div>
    {err}
    <label className="confirm"><input type="checkbox" checked={x.confirmed} disabled={!!error || !canEdit} onChange={e => edit({confirmed: e.target.checked})}/>ตรวจมิติ หน่วย และตำแหน่งพื้นจากแบบต้นฉบับแล้ว</label>
    <button className="btn" onClick={() => onTab('criteria')}>ไป Design Criteria <ChevronRight size={16}/></button></section>
    <section className="card">{r ? <Figure r={r}/> : <p>ตรวจมิติให้ถูกต้องก่อนแสดงแปลน</p>}</section></div>;
  if (tab === 'criteria') return <><div className="notice"><AlertTriangle size={17}/>ค่าเริ่มต้นเป็นค่าอ้างอิงเบื้องต้นจากมาตรฐานและแคตตาล็อก (แก้ไขได้ทุกช่อง) ต้องยืนยันกับผลิตภัณฑ์ ใบรับรองวัสดุ และวิธีเทจริง</div>
    <div className="grid two"><section className="card"><h3>น้ำหนักบรรทุกแนวดิ่ง (ACI PRC-347-14(21) §4.2.1)</h3>
      <VerticalLoadFields<SlabInput> {...p}/>
      {r && <ul className="muted">{r.loads.steps.map(s => <li key={s}>{s}</li>)}</ul>}</section>
      <section className="card"><h3>ไม้อัดท้องพื้น</h3>
        <PlywoodFields<SlabInput> {...p}/>
        {r && <p className="muted">{r.plywood.spanReason} · รับได้ {f(r.plywood.allowablePressure, 1)} kPa (ต้องการ {f(r.loads.q, 1)} kPa)</p>}
        <h3>เหล็กและไม้</h3>
        <MaterialFields<SlabInput> {...p}/></section></div></>;
  if (tab === 'layout') return <>
    {err}
    <section className="card"><h3>แบบท้องพื้น: ไม้อัด → คร่าว (แนว Y) → คานรับ (แนว X) → ค้ำยัน</h3>
      <div className="grid two"><MemberPicker<SlabInput> {...p} k="joistSectionId" role="stud" title="คร่าว (Joist)" stockIds={stockIds}/><MemberPicker<SlabInput> {...p} k="bearerSectionId" role="waler" title="คานรับ (Bearer)" stockIds={stockIds} pair={x.bearerCount > 1}/></div>
      <div className="form-grid four"><Num {...p} k="joistSpacing" label="ระยะคร่าวสูงสุด" help="ช่วงของไม้อัด"/><Num {...p} k="bearerSpacing" label="ระยะคานรับสูงสุด" help="ช่วงของคร่าว"/>
        <Num {...p} k="shoreSpacing" label="ระยะค้ำยันตามแนวคานรับสูงสุด" help="ช่วงของคานรับ"/>
        <label className="field"><span>คานรับต่อแนว</span><select aria-label="จำนวนคานรับต่อแนว" disabled={!canEdit} value={x.bearerCount} onChange={e => edit({bearerCount: Number(e.target.value) as 1 | 2})}><option value={1}>1 ตัว</option><option value={2}>2 ตัว (คู่)</option></select></label>
        <Num {...p} k="shoreSWL" label="SWL ค้ำยันที่ความยาวใช้งาน" unit="kN" help="จากผู้ผลิต · 0 = ยังไม่ทราบ"/>
        <label className="field"><span>รุ่น/เอกสารค้ำยัน</span><input aria-label="รุ่นค้ำยัน" maxLength={300} disabled={!canEdit} value={x.shoreReference} onChange={e => edit({shoreReference: e.target.value})}/></label></div>
      {r && <p className="muted">ค้ำยัน {r.shoreCount} ต้น · ต้นภายในรับ {f(r.shoreLoad)} kN · ความยาวใช้งาน ≈ {f(r.shoreLength, 0)} mm · แรงด้านข้าง {f(r.lateralX)} / {f(r.lateralY)} kN/m (X / Y)</p>}</section>
    <AdviceTable<SlabInput> advice={advice} edit={edit} canEdit={canEdit} kitStep={spacingStep}/>
    <button className="btn" onClick={() => onTab('results')}>ดูรายการคำนวณ <ChevronRight size={16}/></button></>;
  return <>{err}{r && <>
    <div className="metrics"><div><small>DESIGN LOAD q</small><strong>{f(r.loads.q)}<em>kPa</em></strong></div><div><small>SHORES</small><strong>{r.shoreCount}<em>ต้น</em></strong></div>
      <div><small>SHORE LOAD</small><strong>{f(r.shoreLoad)}<em>kN</em></strong></div><div><small>SYSTEM STATUS</small><strong className="amber">{r.status}</strong></div></div>
    <section className="card"><h3>ตรวจเบื้องต้น / ตรวจวิธีที่ยังขาด</h3><ChecksTable items={numberChecks(slabCheckGroups(), r.checks).ordered}/><h3>ก่อนออกเอกสารใช้งานจริง</h3><ul className="blockers">{r.blockers.map(b => <li key={b}>{b}</li>)}</ul></section></>}</>;
}
