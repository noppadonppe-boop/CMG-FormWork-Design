import React, {useEffect, useState} from 'react';
import {canonical, clone} from '../domain/workflowV07/common';
import {emptyStage, type AppliedStageStudy, type StageRecord, type StageStudyDefinition} from '../domain/workflowV07/stageStudy';
import type {previewWorkflow} from '../domain/workflowV07/model';
import {SoffitResults} from './SoffitResults';
import {SideResults} from './SideResults';
import {FrameResults} from './FrameResults';
import {SupportResults} from './SupportResults';
import {RinglockAssemblyResults} from './RinglockAssembly';
import {LoadCasesResults} from './LoadCases';

function definitionOf(book: AppliedStageStudy | null): StageStudyDefinition {return book ? {schemaVersion: '1', stages: clone(book.stages)} : {schemaVersion: '1', stages: []};}
export function StageStudyEditor({book, onCapture, onApply, onLoad, onCopy, onRemoveLayout, onPendingChange}: {
  book: AppliedStageStudy | null; onCapture: (r: StageRecord) => StageRecord; onApply: (d: StageStudyDefinition) => void;
  onLoad: (r: StageRecord) => void; onCopy: (stageId: string) => void; onRemoveLayout: (kind: 'SOFFIT' | 'SIDE') => void; onPendingChange: (p: boolean) => void;
}) {
  const [form, setForm] = useState(() => definitionOf(book)), [error, setError] = useState(''), [newStage, setNewStage] = useState('');
  const identity = canonical(definitionOf(book)), pending = canonical(form) !== identity;
  useEffect(() => {setForm(definitionOf(book)); setError(''); onPendingChange(false);}, [identity, onPendingChange]);
  useEffect(() => () => onPendingChange(false), [onPendingChange]);
  function change(d: StageStudyDefinition) {setForm(d); setError(''); onPendingChange(canonical(d) !== identity);}
  function action(f: () => void) {try {f(); setError('');} catch (e) {setError((e as Error).message);}}
  return <fieldset className="stage-study-editor"><legend>Layout แยกตาม Stage</legend>
    <p>เก็บข้อมูลที่นำไปใช้ในหน้าจอปัจจุบันเป็น Stage แล้วคืน Stage ที่เก็บไว้มาแก้ด้วยช่องเดิมได้ การคำนวณแต่ละ Stage เริ่มใหม่จากข้อมูลของตนเอง</p>
    <p>การตั้ง/ถอดค้ำ การถ่ายน้ำหนักระหว่างชั้น อายุคอนกรีต และประวัติ Reshoring ยังต้องมีแบบจำลองเพิ่มเติม ผลทุก Stage เป็น DRAFT / NO_GO</p>
    {form.stages.map((r, i) => {const update = (patch: Partial<StageRecord>) => change({...form, stages: form.stages.map((s, n) => n === i ? {...s, ...patch} : s)}); return <details key={i} aria-label={`ข้อมูล Stage ${r.id}`}><summary>{r.id} / {r.stageId || 'UNKNOWN'} / {r.label || 'ยังไม่มีชื่อ'}</summary>
      <div className="form-grid">{([['id', 'รหัสชุด Stage'], ['label', 'ชื่อขั้นตอน'], ['stageId', 'Stage ID ของ Layout ที่เก็บ'], ['evidenceRef', 'หลักฐานขอบเขตและรองรับของ Stage']] as const).map(([key, label]) => <label className="field" key={key}><span>{label}</span><input value={r[key]} onChange={e => update({[key]: e.target.value})}/></label>)}</div>
      <p>{r.inputs ? `เก็บข้อมูลจาก Revision ${r.capturedRevision} · ${r.capturedEngineVersion} · ${r.inputs.members.length} สมาชิกดิบที่ยังต้องสร้างใหม่` : 'ยังไม่ได้เก็บข้อมูล Layout ของ Stage นี้'}</p>
      <button className="btn secondary" onClick={() => action(() => update(onCapture(r)))}>เก็บข้อมูลหน้าจอปัจจุบันลง Stage {i + 1}</button>
      <button className="btn secondary" disabled={pending || !r.inputs} onClick={() => action(() => onLoad(r))}>คืน Stage {i + 1} มาแก้ในหน้าจอ</button>
      <button className="btn secondary" onClick={() => change({...form, stages: form.stages.filter((_, n) => n !== i)})}>ลบ Stage {i + 1} จากชุดร่าง</button>
    </details>;})}
    <button className="btn secondary" disabled={form.stages.length >= 6} onClick={() => {let n = 1; while (form.stages.some(s => s.id === `ST-${n}`)) n++; change({...form, stages: [...form.stages, emptyStage(`ST-${n}`)]});}}>เพิ่มข้อมูล Stage</button>
    <button className="btn secondary" onClick={() => action(() => {onApply(form); onPendingChange(false);})}>เก็บและคำนวณชุด Stage ร่าง</button>
    <button className="btn secondary" onClick={() => {change(definitionOf(book)); onPendingChange(false);}}>คืนค่าชุด Stage ที่เก็บไว้</button>
    <label className="field"><span>Stage ID ใหม่สำหรับสำเนาเสนอปรับ Layout</span><input value={newStage} onChange={e => setNewStage(e.target.value)}/></label>
    <button className="btn secondary" disabled={pending || !newStage.trim()} onClick={() => action(() => {onCopy(newStage); setNewStage('');})}>คัดลอกข้อมูลปัจจุบันไป Stage ใหม่</button>
    <p>ต้องเก็บค่าปัจจุบันก่อนคัดลอก สำเนาจะล้างกรณีโหลดเพิ่มเติมและการยอมรับวิธีเฟรม ต้องตรวจตำแหน่ง/แรง/ความแข็งใหม่ก่อนเก็บ Stage ใหม่</p>
    <button className="btn secondary" disabled={pending} onClick={() => action(() => onRemoveLayout('SOFFIT'))}>ถอด Layout แบบท้องจาก Stage หน้าจอ</button>
    <button className="btn secondary" disabled={pending} onClick={() => action(() => onRemoveLayout('SIDE'))}>ถอด Layout แบบข้างจาก Stage หน้าจอ</button>
    <p>ถอดแบบท้องจะล้างแรงถ่ายจากหัว การประกอบ และการเลือกแหล่งแรงเฟรม ต้องระบุแหล่งแรงจริงใหม่ ไม่ตีความโหลดที่ขาดเป็นศูนย์</p>
    {error && <p role="alert">{error}</p>}
  </fieldset>;
}
export function StageStudyResults({preview}: {preview: ReturnType<typeof previewWorkflow>}) {
  const book = preview.stageStudy, [selected, setSelected] = useState(''); if (!book) return null;
  const stage = book.stages.find(s => s.definition.id === selected) ?? book.stages[0];
  return <section className="stage-study-results" aria-label="ผลคำนวณ Layout แยก Stage"><h3>ผลราย Stage · {book.status} / NO_GO</h3>
    <p>{book.current ? 'ชุด Stage ตรงกับ Revision ปัจจุบัน' : 'STALE · ต้องคำนวณชุด Stage ใหม่'} · {book.activeCaptured ? 'ข้อมูลหน้าจอถูกเก็บใน Stage แล้ว' : 'ข้อมูลหน้าจอยังไม่ตรงกับ Stage ที่เก็บไว้ ต้องเก็บใหม่'}</p>
    <ul>{book.blockers.map(b => <li key={b}>{b}</li>)}</ul>
    <table><thead><tr><th>ชุด / Stage / ชื่อ</th><th>ที่มาของข้อมูล</th><th>สมาชิกที่ต้องตรวจรวมกรณีโหลด</th><th>สถานะ / ข้อมูลที่ขาด</th></tr></thead><tbody>{book.stages.map(s => <tr key={s.definition.id}><td>{s.definition.id} / {s.definition.stageId || 'UNKNOWN'} / {s.definition.label}</td><td>{s.definition.capturedRevision || 'UNKNOWN'} · {s.definition.evidenceRef || 'UNKNOWN'}</td><td>{s.requiredChecks.length} แถว</td><td>{s.status}<ul>{s.errors.map(e => <li key={e}>{e}</li>)}</ul></td></tr>)}</tbody></table>
    {!!book.stages.length && <label className="field"><span>ดูผลของ Stage</span><select value={stage?.definition.id ?? ''} onChange={e => setSelected(e.target.value)}>{book.stages.map(s => <option key={s.definition.id}>{s.definition.id}</option>)}</select></label>}
    {stage?.preview && stage.model && <><p>Stage {stage.definition.stageId} · Design Revision {stage.model.revisionId} · {stage.definition.evidenceRef}</p>
      <SoffitResults model={stage.model} preview={{...stage.preview, stageStudy: null}}/><SideResults model={stage.model} preview={{...stage.preview, stageStudy: null}}/>
      <FrameResults model={stage.model} preview={{...stage.preview, stageStudy: null}}/><RinglockAssemblyResults model={stage.model} preview={{...stage.preview, stageStudy: null}}/>
      <SupportResults model={stage.model} preview={{...stage.preview, stageStudy: null}}/>
      <LoadCasesResults preview={{...stage.preview, stageStudy: null}}/>
      <details><summary>ข้อมูลและขอบเขตที่ยังขาดของ Stage</summary><ul>{stage.preview.blockers.map(b => <li key={b}>{b}</li>)}</ul></details>
    </>}
    <p>Snapshot เก็บทุก Stage และทุกกรณี การเลือกดูไม่ตัดข้อมูลชุดอื่น ไม่รวมแรงของคนละ Stage เข้าด้วยกัน และยังไม่ใช่การยืนยันลำดับก่อสร้าง</p>
  </section>;
}
