import React, {useEffect, useState} from 'react';
import {canonical, clone} from '../domain/workflowV07/common';
import {CASE_ACTIONS, SIGNED_CASE_ACTIONS, emptyAnalysisCase} from '../domain/workflowV07/caseFactors';
import type {AppliedLoadCases, LoadCasesDefinition} from '../domain/workflowV07/loadCases';
import type {WorkflowModel, previewWorkflow} from '../domain/workflowV07/model';
import {SoffitResults} from './SoffitResults';
import {SideResults} from './SideResults';
import {FrameResults} from './FrameResults';
import {SupportResults} from './SupportResults';
import {RinglockAssemblyResults} from './RinglockAssembly';

const names = {CONCRETE: 'คอนกรีตแนวดิ่ง', ADDITIONAL_DL: 'DL อื่น', CONSTRUCTION_LL: 'LL ก่อสร้าง', SELF_WEIGHT: 'น้ำหนักตัวเองที่แยก', HYDROSTATIC_SIDE: 'แรงดัน Hydrostatic ข้าง', WIND: 'แรงลมแบบเวกเตอร์', PLACEMENT: 'แรง Placement แบบเวกเตอร์', OTHER: 'แรงเพิ่มเติมอื่นแบบเวกเตอร์', IMPOSED_MOVEMENT: 'การเคลื่อน/หมุนจุดยึดที่กำหนด'};
const show = (n: number | null | undefined) => n == null ? 'UNKNOWN' : n.toLocaleString('en-US', {maximumFractionDigits: 5});
function definitionOf(book: AppliedLoadCases | null | undefined): LoadCasesDefinition {if (!book) return {schemaVersion: '1', cases: []}; const {revisionId: _revision, inputDefinition: _input, ...d} = book; return clone(d);}
export function LoadCasesEditor({book, stages, onApply, onPendingChange}: {book: AppliedLoadCases | null; stages: string[]; onApply: (d: LoadCasesDefinition) => void; onPendingChange: (pending: boolean) => void}) {
  const [form, setForm] = useState(() => definitionOf(book)), [error, setError] = useState(''), identity = canonical(definitionOf(book));
  useEffect(() => {setForm(definitionOf(book)); setError(''); onPendingChange(false);}, [identity, onPendingChange]);
  useEffect(() => () => onPendingChange(false), [onPendingChange]);
  function change(next: LoadCasesDefinition) {setForm(next); setError(''); onPendingChange(canonical(next) !== identity);}
  return <fieldset className="load-cases-editor"><legend>กรณีโหลดและชุดรวมแรงที่ระบุเอง</legend>
    <p>ใช้ Layout ของ Stage ที่จัดไว้แล้ว ({stages.join(', ') || 'ยังไม่มี Stage จริง'}) ต้องระบุหลักฐานว่ารองรับ/ความแข็ง/การประกอบใช้ร่วมกันได้ การตั้ง ถอดแบบ หรือเปลี่ยนค้ำยึดต้องมี Layout ของ Stage นั้นแยก</p>
    <p>ไม่มีสัมประสิทธิ์มาตรฐานให้โดยอัตโนมัติ ทุกช่องว่างคือ UNKNOWN ไม้อัดที่รวมใน DL ใช้ตัวคูณ DL และไม่บวกซ้ำ แรงดันข้างแยกจากโหลดแนวดิ่ง</p>
    {form.cases.map((c, i) => {const update = (patch: Partial<typeof c>) => change({...form, cases: form.cases.map((old, n) => n === i ? {...old, ...patch} : old)}); return <details className="load-case-editor" key={i} aria-label={`กรณีโหลด ${c.id}`}><summary>{c.id} / {c.stageId || 'UNKNOWN'} / {c.loadCaseId || 'UNKNOWN'} / {c.basis ?? 'UNKNOWN'}</summary>
      <div className="form-grid">{([['id', 'รหัสกรณีในชุด'], ['stageId', 'Stage ที่ใช้ Layout ร่วม'], ['loadCaseId', 'ชื่อ Load case ใหม่'], ['basisEvidenceRef', 'หลักฐานสัมประสิทธิ์และฐานแรง'], ['sharedLayoutEvidenceRef', 'หลักฐานขอบเขตการใช้ Layout ร่วม']] as const).map(([key, label]) => <label className="field" key={key}><span>{label}</span><input value={c[key]} onChange={e => update({[key]: e.target.value})}/></label>)}
        <label className="field"><span>ฐานแรงกรณีนี้</span><select value={c.basis ?? ''} onChange={e => update({basis: (e.target.value || null) as typeof c.basis})}><option value="">ยังไม่ระบุ</option><option value="SERVICE">SERVICE ตามฐานที่ระบุ</option><option value="FACTORED">FACTORED ตามฐานที่ระบุ · ต้องตรวจคู่กำลังใหม่</option></select></label>
        {CASE_ACTIONS.map(k => <label className="field" key={k}><span>ตัวคูณ {names[k]}</span><input type="number" step="any" min={SIGNED_CASE_ACTIONS.includes(k) ? undefined : 0} value={c.factors[k] ?? ''} onChange={e => update({factors: {...c.factors, [k]: e.target.value.trim() && Number.isFinite(Number(e.target.value)) ? Number(e.target.value) : null}})}/></label>)}</div>
      <p>ตัวคูณแรงเวกเตอร์เป็นลบได้เพื่อระบุกรณีกลับทิศอย่างชัดเจน แรง/โมเมนต์ต้นทางและระยะเยื้องยังต้องทราบ ไม่สร้างแรงลมหรือ Placement ที่ขาดให้เอง</p>
      <button className="btn secondary" onClick={() => change({...form, cases: form.cases.filter((_, n) => n !== i)})}>ลบกรณีโหลด {i + 1}</button>
    </details>;})}
    <button className="btn secondary" disabled={form.cases.length >= 8} onClick={() => {let n = 1; while (form.cases.some(c => c.id === `LC-${n}`)) n++; change({...form, cases: [...form.cases, emptyAnalysisCase(`LC-${n}`)]});}}>เพิ่มกรณีโหลด</button>
    {error && <p role="alert">{error}</p>}
    <button className="btn secondary" onClick={() => {try {onApply(form); onPendingChange(false); setError('');} catch (e) {setError((e as Error).message);}}}>เก็บและวิเคราะห์ชุดกรณีโหลดร่าง</button>
    <button className="btn secondary" onClick={() => {change(definitionOf(book)); onPendingChange(false);}}>คืนค่าชุดกรณีโหลดที่เก็บไว้</button>
  </fieldset>;
}
export function LoadCasesResults({preview}: {preview: ReturnType<typeof previewWorkflow>}) {
  const book = preview.loadCases, [selected, setSelected] = useState(''); if (!book) return null;
  const current = book.cases.find(c => c.definition.id === selected) ?? book.cases[0];
  return <section className="load-cases-results" aria-label="ผลกรณีโหลดแยกตามฐานแรง"><h3>กรณีโหลดเพิ่มเติม · {book.status} / NO_GO</h3>
    <p>{book.current ? 'ข้อมูลต้นทางตรงกับฉบับนี้' : 'STALE · ตรวจต้นทางและเก็บชุดกรณีใหม่'} · ผลคำนวณแต่ละกรณีอยู่ใน Design Revision เดียวกัน</p>
    <ul>{book.blockers.map(s => <li key={s}>{s}</li>)}</ul>
    <table><thead><tr><th>กรณี / Stage / ฐานแรง</th><th>คอนกรีต / DL / LL / น้ำหนักตัวเอง · kN</th><th>Placement / Other ตามพิกัด · kN</th><th>รวมรายหัว · kN</th><th>ผลรวมปฏิกิริยา Z ที่จุด BASE เฟรม · kN</th><th>สถานะ/ข้อมูลที่ยังขาด</th></tr></thead><tbody>{book.cases.map(c => {
      const owned = c.preview?.soffit?.ownedForceN, heads = c.preview?.soffit?.terminalForceN, baseIds = c.model?.frameLayout?.nodes.filter(n => n.role === 'BASE').map(n => n.id) ?? [];
      const bases = c.preview?.frame?.analysis?.nodes.filter(n => baseIds.includes(n.id)); const force = bases?.length ? bases.reduce((s, n) => s + n.reactionForceN[2], 0) : null;
      return <tr key={c.definition.id}><td>{c.definition.id} / {c.definition.loadCaseId || 'UNKNOWN'} / {c.definition.stageId || 'UNKNOWN'} / {c.definition.basis ?? 'UNKNOWN'}</td><td>{owned ? [owned.concrete, owned.additionalDead, owned.constructionLive, owned.componentSelfWeight].map(v => show(v / 1000)).join(' / ') : 'UNKNOWN'}</td><td>{show(c.preview?.soffit ? c.preview.soffit.additionalForceN / 1000 : null)}</td><td>{show(heads == null ? null : heads / 1000)}</td><td>{show(force === null ? null : force / 1000)}</td><td>{c.status}<ul>{c.errors.map(s => <li key={s}>{s}</li>)}</ul></td></tr>;
    })}</tbody></table>
    {!!book.cases.length && <label className="field"><span>ดูผลรายสมาชิกของกรณีโหลด</span><select value={current?.definition.id ?? ''} onChange={e => setSelected(e.target.value)}>{book.cases.map(c => <option key={c.definition.id}>{c.definition.id}</option>)}</select></label>}
    {current && <><p>หลักฐานฐานแรง: {current.definition.basisEvidenceRef || 'UNKNOWN'} · ขอบเขต Layout ร่วม: {current.definition.sharedLayoutEvidenceRef || 'UNKNOWN'}</p>
      <table><thead><tr><th>หมวดแรง</th><th>สัมประสิทธิ์ที่ระบุ</th></tr></thead><tbody>{CASE_ACTIONS.map(k => <tr key={k}><td>{names[k]}</td><td>{show(current.definition.factors[k])}</td></tr>)}</tbody></table>
      {current.model && current.preview && <><p>Γ และน้ำหนักต่อหน่วยในข้อมูลต้นทางยังเป็นค่ากายภาพเดิม ผลแรงด้านล่างใช้สัมประสิทธิ์กรณี {current.definition.loadCaseId} · {current.definition.basis} · Revision {current.model.revisionId}</p>
        <SoffitResults model={current.model} preview={{...current.preview, loadCases: null, stageStudy: null}}/><SideResults model={current.model} preview={{...current.preview, loadCases: null, stageStudy: null}}/>
        <FrameResults model={current.model} preview={{...current.preview, loadCases: null, stageStudy: null}}/><RinglockAssemblyResults model={current.model} preview={{...current.preview, loadCases: null, stageStudy: null}}/>
        <SupportResults model={current.model} preview={{...current.preview, loadCases: null, stageStudy: null}}/>
        <details><summary>รายการที่ยังต้องตรวจของกรณีนี้ ({current.preview.blockers.length})</summary><ul>{current.preview.blockers.map(s => <li key={s}>{s}</li>)}</ul></details></>}
    </>}
    <p>เก็บทุกกรณีในร่าง JSON ตารางเลือกกรณีไม่ตัดผลอื่นออก และยังไม่ใช่การยืนยันว่าชุดรวมแรงครบตามมาตรฐานหรือครอบคลุมทุก Stage</p>
  </section>;
}
