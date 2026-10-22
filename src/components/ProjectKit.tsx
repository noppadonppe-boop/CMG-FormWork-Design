import {useEffect, useState} from 'react';
import {AlertTriangle, CheckCircle2, Package} from 'lucide-react';
import {GRAIN_LABEL, PLYWOOD_GRADE_LABEL, PLYWOOD_GRADES} from '../domain/plywoodGrades';
import {TIMBER_GRADES} from '../domain/sectionStock';
import {KIT_STEPS, kitDefaults, kitSummary, validateKit, type KitStatus, type ProjectKit} from '../domain/projectKit';
import {MemberPicker, Num} from './FormParts';

export interface KitCaseRow {id: string; name: string; type: string; status: KitStatus}
const PLYWOOD_THICKNESSES = [12, 15, 18, 20, 25];

/** Project page: one standard set of plywood, sections, hardware and criteria for every Design Case. */
export function ProjectKitPanel({kit, rows, canEdit, stockIds, onSave, onRemove, onSeed, onApplyAll, onOpen}: {kit?: ProjectKit; rows: KitCaseRow[]; canEdit: boolean; stockIds?: string[];
  onSave: (kit: ProjectKit) => void; onRemove: () => void; onSeed: () => ProjectKit; onApplyAll: () => void; onOpen: (caseId: string) => void}) {
  const [draft, setDraft] = useState<ProjectKit | null>(kit ?? null);
  useEffect(() => setDraft(kit ?? null), [kit]);
  if (!draft) return <section className="card kit-panel"><h3><Package size={18}/> ชุดมาตรฐานโครงการ</h3>
    <p>กำหนดไม้อัด 1 ความหนา คร่าว คานคู่ และคานรับมาตรฐาน พร้อม Tie ค้ำยัน และเกณฑ์ออกแบบ ครั้งเดียวต่อโครงการ ทุก Design Case จะใช้ชุดนี้ และปรับได้เฉพาะระยะ เพื่อให้สั่งของและทำงานหน้างานง่าย</p>
    {canEdit ? <div className="source-actions"><button className="btn" onClick={() => setDraft(onSeed())}>สร้างจาก Design Case ปัจจุบัน</button><button className="btn secondary" onClick={() => setDraft({...kitDefaults})}>เริ่มจากค่าเริ่มต้น</button></div>
      : <p className="muted">ยังไม่มีชุดมาตรฐาน · ผู้มีสิทธิ์แก้ไขโครงการเป็นผู้กำหนด</p>}</section>;
  let error: string | null = null;
  try {validateKit(draft);} catch (e) {error = (e as Error).message;}
  const dirty = JSON.stringify(draft) !== JSON.stringify(kit ?? null);
  const p = {x: draft, edit: (c: Partial<ProjectKit>) => setDraft({...draft, ...c}), canEdit};
  const text = (k: 'revision' | 'shoreReference' | 'braceReference', label: string, max: number) => <label className="field"><span>{label}</span>
    <input aria-label={label} maxLength={max} disabled={!canEdit} value={draft[k]} onChange={e => p.edit({[k]: e.target.value})}/></label>;
  const counts = {ON: rows.filter(r => r.status.state === 'ON').length, EXCEPTION: rows.filter(r => r.status.state === 'EXCEPTION').length, OFF: rows.filter(r => r.status.state === 'OFF').length};
  return <>
    <section className="card kit-panel"><div className="card-title"><h3><Package size={18}/> ชุดมาตรฐานโครงการ · Rev {kit?.revision ?? draft.revision}</h3>
      {canEdit && <div className="source-actions"><button className="btn" disabled={!!error || !dirty} onClick={() => onSave(validateKit(draft))}>บันทึกชุดมาตรฐาน</button>
        {kit && <button className="btn secondary" disabled={!dirty} onClick={() => setDraft(kit)}>ยกเลิกการแก้</button>}
        <button className="btn secondary" onClick={() => {if (window.confirm('ลบชุดมาตรฐานของโครงการนี้? ค่าใน Design Case จะไม่เปลี่ยน')) {setDraft(null); onRemove();}}}>ลบชุดมาตรฐาน</button></div>}</div>
      <p className="muted">ทุก Design Case ใช้ค่าตามชุดนี้ · ตัวค้นหาระยะปรับเฉพาะระยะเป็นทวีคูณของขั้นที่กำหนด · ค่า SWL ต้องมาจากผู้ผลิต (0 = ยังไม่ทราบ) · แก้ชุดแล้วควรเพิ่ม Rev และกด “ใช้ชุดกับทุก Design Case”</p>
      {error && <div className="warning"><AlertTriangle size={17}/>{error}</div>}
      <div className="form-grid four">{text('revision', 'Rev ชุดมาตรฐาน', 20)}
        <label className="field"><span>ขั้นระยะ</span><select aria-label="ขั้นระยะ" disabled={!canEdit} value={draft.spacingStep} onChange={e => p.edit({spacingStep: Number(e.target.value)})}>{KIT_STEPS.map(s => <option key={s} value={s}>{s} mm</option>)}</select></label></div>
      <h4>ไม้อัด</h4>
      <div className="form-grid four"><label className="field"><span>ความหนา<small>mm</small></span><select aria-label="ความหนาไม้อัดมาตรฐาน" disabled={!canEdit} value={draft.plywood} onChange={e => p.edit({plywood: Number(e.target.value)})}>
          {[...new Set([...PLYWOOD_THICKNESSES, draft.plywood])].sort((a, b) => a - b).map(t => <option key={t} value={t}>{t} mm</option>)}</select></label>
        <label className="field"><span>ชนิด</span><select aria-label="ชนิดไม้อัดมาตรฐาน" disabled={!canEdit} value={draft.plywoodGrade} onChange={e => p.edit({plywoodGrade: e.target.value as ProjectKit['plywoodGrade']})}>{PLYWOOD_GRADES.map(g => <option key={g} value={g}>{PLYWOOD_GRADE_LABEL[g]}</option>)}</select></label>
        <label className="field"><span>ทิศลายไม้ผิว</span><select aria-label="ทิศลายไม้มาตรฐาน" disabled={!canEdit} value={draft.plywoodFaceGrain} onChange={e => p.edit({plywoodFaceGrain: e.target.value as ProjectKit['plywoodFaceGrain']})}>{(['ACROSS', 'PARALLEL'] as const).map(g => <option key={g} value={g}>{GRAIN_LABEL[g]}</option>)}</select></label>
        {draft.plywoodGrade === 'CUSTOM' && <><Num<ProjectKit> {...p} k="plywoodE" label="E ไม้อัด" unit="MPa"/><Num<ProjectKit> {...p} k="plywoodFb" label="Fb ไม้อัด" unit="MPa"/></>}</div>
      <div className="grid two kit-members"><MemberPicker<ProjectKit> {...p} k="studSectionId" role="stud" title="คร่าว / คร่าวท้อง (Joist)" stockIds={stockIds}/>
        <MemberPicker<ProjectKit> {...p} k="walerSectionId" role="waler" title="คานคู่ (Twin waler)" stockIds={stockIds} pair/>
        <MemberPicker<ProjectKit> {...p} k="bearerSectionId" role="waler" title="คานรับ (Bearer)" stockIds={stockIds}/>
        <div><h4>ชั้นไม้ (ถ้าใช้ไม้)</h4><label className="field"><span>ชั้นคุณภาพไม้</span><select aria-label="ชั้นไม้มาตรฐาน" disabled={!canEdit} value={draft.timberGrade} onChange={e => p.edit({timberGrade: e.target.value})}>{TIMBER_GRADES.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}</select></label></div></div>
      <h4>Tie ค้ำยัน และอุปกรณ์ (ค่าผู้ผลิต)</h4>
      <div className="form-grid four"><Num<ProjectKit> {...p} k="tieDiameter" label="Tie Ø"/><Num<ProjectKit> {...p} k="tieFy" label="Fy Tie" unit="MPa" help="SD40 = 390"/><Num<ProjectKit> {...p} k="tieFu" label="Fu Tie" unit="MPa" help="SD40 = 560"/>
        <Num<ProjectKit> {...p} k="tieSWL" label="SWL ชุด Tie" unit="kN" help="0 = ยังไม่ทราบ"/><Num<ProjectKit> {...p} k="shoreSWL" label="SWL ค้ำยัน (ท้องคาน/พื้น)" unit="kN" help="ที่ความยาวใช้งาน"/>{text('shoreReference', 'รุ่น/เอกสารค้ำยัน', 300)}
        <Num<ProjectKit> {...p} k="braceSWL" label="SWL ค้ำยันเอียง (ผนัง/เสา)" unit="kN"/>{text('braceReference', 'รุ่น/เอกสารค้ำยันเอียง', 300)}</div>
      <h4>เกณฑ์ออกแบบ</h4>
      <div className="form-grid four"><Num<ProjectKit> {...p} k="gamma" label="น้ำหนักคอนกรีต" unit="kN/m³"/><Num<ProjectKit> {...p} k="liveLoad" label="น้ำหนักจร (ท้องคาน/พื้น)" unit="kPa" help="ACI §4.2.1 ไม่น้อยกว่า 2.4"/>
        <Num<ProjectKit> {...p} k="deflectionRatio" label="เกณฑ์การโก่ง L/n" unit="n"/><Num<ProjectKit> {...p} k="windPressure" label="แรงลมออกแบบ" unit="kPa" help="ไม่น้อยกว่า 0.72 (ACI §4.2.3.1)"/></div>
    </section>
    {kit && <section className="card kit-cases"><div className="card-title"><h3>Design Case ในโครงการ</h3>
      {canEdit && <button className="btn" disabled={dirty} title={dirty ? 'บันทึกชุดมาตรฐานก่อน' : ''} onClick={onApplyAll}>ใช้ชุดกับทุก Design Case ({counts.OFF} นอกชุด)</button>}</div>
      <p className="muted">ตรงชุด {counts.ON} · ข้อยกเว้นที่มีเหตุผล {counts.EXCEPTION} · นอกชุด {counts.OFF} · ข้อยกเว้นจะไม่ถูกแทนค่าจนกว่าจะล้างเหตุผลในหน้าของ Design Case นั้น</p>
      <table><thead><tr><th>Design Case</th><th>ประเภท</th><th>สถานะ</th><th/></tr></thead><tbody>
        {rows.map(r => <tr key={r.id}><td>{r.name}</td><td>{r.type}</td><td>{r.status.state === 'ON' ? <span className="pill ok">ตรงชุด</span>
          : r.status.state === 'NONE' ? '—' : <><span className={'pill ' + (r.status.state === 'OFF' ? 'amber' : 'ok')}>{r.status.state === 'OFF' ? 'นอกชุด' : 'ข้อยกเว้น'}</span> {r.status.diff.join(', ')}{r.status.reason ? ` · ${r.status.reason}` : ''}</>}</td>
          <td><button className="text-btn" onClick={() => onOpen(r.id)}>เปิด</button></td></tr>)}</tbody></table></section>}
  </>;
}

/** Case-bar line: is this Design Case on the project kit? Off-kit cases either take the kit values or record a reason. */
export function KitBadge({status, canEdit, onApply, onReason, onOpenKit}: {status: KitStatus; canEdit: boolean; onApply: () => void; onReason: (reason: string) => void; onOpenKit: () => void}) {
  const [reason, setReason] = useState('');
  if (status.state === 'NONE') return null;
  if (status.state === 'ON') return <div className="kit-badge on"><CheckCircle2 size={15}/> ชุดมาตรฐาน {status.revision} · ตรงชุด <button className="text-btn" onClick={onOpenKit}>ดูชุดมาตรฐาน</button></div>;
  if (status.state === 'EXCEPTION') return <div className="kit-badge exception"><Package size={15}/> ข้อยกเว้นจากชุดมาตรฐาน {status.revision}: {status.diff.join(', ')} · เหตุผล: {status.reason}
    {canEdit && <button className="text-btn" onClick={() => onReason('')}>ล้างเหตุผล</button>}</div>;
  return <div className="warning kit-badge off" role="status"><AlertTriangle size={16}/><div><b>นอกชุดมาตรฐาน {status.revision}:</b> {status.diff.join(', ')}
    {canEdit && <div className="source-actions"><button className="btn" onClick={onApply}>ใช้ค่าชุดมาตรฐาน</button>
      <input aria-label="เหตุผลที่ใช้นอกชุดมาตรฐาน" placeholder="เหตุผลที่ต้องใช้นอกชุด" maxLength={300} value={reason} onChange={e => setReason(e.target.value)}/>
      <button className="btn secondary" disabled={!reason.trim()} onClick={() => {onReason(reason.trim()); setReason('');}}>บันทึกเป็นข้อยกเว้น</button></div>}</div></div>;
}

/** Simple mode: the kit supplies plywood, sections, hardware and criteria, so the page only asks for geometry and spacings. */
export function KitSummaryCard({kit, onOpenKit, onAdvanced}: {kit: ProjectKit; onOpenKit: () => void; onAdvanced: () => void}) {
  return <section className="card kit-summary"><h3><Package size={18}/> วัสดุตามชุดมาตรฐาน {kit.revision}</h3><p>{kitSummary(kit)}</p>
    <p className="muted">โหมดง่าย: ไม้อัด หน้าตัด อุปกรณ์ และเกณฑ์ออกแบบมาจากชุดมาตรฐาน หน้านี้กรอกเฉพาะระยะและค่าที่เป็นของแต่ละ Design Case</p>
    <div className="source-actions"><button className="btn secondary" onClick={onOpenKit}>เปิดชุดมาตรฐาน</button><button className="btn secondary" onClick={onAdvanced}>สลับเป็นโหมดละเอียด</button></div></section>;
}
