import React, {useState} from 'react';
import publicCaptureText from '../reference/workflow-v07/public-reference-capture-2026-10-18.json?raw';
import {closureReferences} from '../closurePackReferences';
import {CATALOG_KIND_LABEL, CATALOG_KINDS, LIMIT_CHECKS, emptyEntry, emptyLimit, emptyMethod, limitUnit, markDraft, markReviewed, validateRegistryEntry, validateRegistryMethod,
  closureReferenceRegistryEntries, publicReferenceRegistryEntries, type CatalogKind, type LimitCheck, type Registry, type RegistryEntry, type RegistryLimit, type RegistryMethod} from '../domain/workflowV07/registry';

const number = (v: string) => v.trim() && Number.isFinite(Number(v)) ? Number(v) : null;
const when = (ms: number | null) => ms === null ? '—' : new Date(ms).toLocaleString('th-TH');
type Item = {type: 'method'; value: RegistryMethod} | {type: 'entry'; value: RegistryEntry};

/** Reviewed method/catalog registry. The reviewer identity comes from the signed-in profile (or
 * the Owner-designated offline default); the software never marks anything REVIEWED by itself. */
export function RegistryPanel({registry, reviewerName, canReview, canDelete, onSave, onDelete, onSeed, onSeedPublic, onSeedClosure}: {
  registry: Registry; reviewerName: string; canReview: boolean; canDelete: boolean;
  onSave: (item: Item) => Promise<void> | void; onDelete: (type: 'method' | 'entry', id: string) => Promise<void> | void; onSeed?: () => Promise<void> | void;
  onSeedPublic?: (entries: RegistryEntry[]) => Promise<void> | void; onSeedClosure?: (entries: RegistryEntry[]) => Promise<void> | void;
}) {
  const [editing, setEditing] = useState<Item | null>(null), [error, setError] = useState(''), [kindFilter, setKindFilter] = useState<CatalogKind | ''>('');
  async function save(item: Item) {
    try {
      if (item.type === 'method') validateRegistryMethod(item.value); else validateRegistryEntry(item.value);
      await onSave(item); setEditing(null); setError('');
    } catch (e) {setError((e as Error).message);}
  }
  const review = (item: Item) => save(item.type === 'method' ? {type: 'method', value: markReviewed(item.value, reviewerName)} : {type: 'entry', value: markReviewed(item.value, reviewerName)});
  const unreview = (item: Item) => save(item.type === 'method' ? {type: 'method', value: markDraft(item.value)} : {type: 'entry', value: markDraft(item.value)});
  const entries = registry.entries.filter(e => !kindFilter || e.kind === kindFilter);
  return <section className="card registry-panel" aria-label="คลังวิธีคำนวณและผลิตภัณฑ์ที่รีวิวแล้ว">
    <h3>คลังวิธีคำนวณและผลิตภัณฑ์ (Material &amp; Section Library)</h3>
    <p>ขีดจำกัดทุกค่ามาจากผู้ตรวจกรอกพร้อมแหล่งอ้างอิง revision และขอบเขต ระบบไม่คำนวณกำลังจากคุณสมบัติหน้าตัด รายการ DRAFT เลือกใช้ได้แต่ผลเป็น REFERENCE_ONLY/INCOMPLETE; รายการ REVIEWED ให้ผล SCREENED เท่านั้น ไม่ใช่การอนุมัติ</p>
    <p className="muted">ผู้ตรวจปัจจุบัน: {reviewerName || 'ยังไม่ระบุ (เข้าสู่ระบบหรือกำหนดโปรไฟล์)'} {canReview ? '' : '· บัญชีนี้ไม่มีสิทธิ์รีวิว/แก้ไขคลัง'}</p>
    {error && <div className="warning" role="alert">{error}</div>}
    {!registry.methods.length && !registry.entries.length && onSeed && canReview && <button className="btn secondary" onClick={() => void onSeed()}>สร้างรายการเริ่มต้น (DRAFT จากแหล่งเผยแพร่ ไม่มีขีดจำกัด)</button>}
    {onSeedPublic && canReview && <div className="notice"><p>มีชุด Ringlock/Form Tie capture ล่าสุดจากแหล่งสาธารณะสำหรับเตรียมทะเบียน ผู้ใช้ต้องตรวจรุ่นจริงและกรอกขีดจำกัดเอง</p><button className="btn secondary" onClick={() => {try {void onSeedPublic(publicReferenceRegistryEntries(JSON.parse(publicCaptureText), Date.now()));} catch (e) {setError((e as Error).message);}}}>นำเข้า Ringlock / Form Tie ล่าสุดเป็น DRAFT</button></div>}
    {onSeedClosure && canReview && <div className="notice"><p>มี Closure Pack Form Tie 11 รายการและ Ringlock 17 รายการเป็น reference-only; ตัวเลขจะเก็บเป็นคุณสมบัติอ้างอิงและไม่สร้างขีดจำกัด</p><button className="btn secondary" onClick={() => {try {void onSeedClosure(closureReferenceRegistryEntries(closureReferences.formTie, closureReferences.ringlockSidecar, Date.now()));} catch (e) {setError((e as Error).message);}}}>นำเข้า Closure Pack Form Tie / Ringlock เป็น DRAFT</button></div>}

    <h4>วิธีคำนวณ ({registry.methods.length})</h4>
    <table aria-label="วิธีคำนวณ"><thead><tr><th>ID</th><th>ชื่อ</th><th>แหล่ง / revision</th><th>ฐาน</th><th>สถานะ · ผู้ตรวจ</th><th></th></tr></thead><tbody>
      {registry.methods.map(m => <tr key={m.id}><td>{m.id}</td><td>{m.name}</td><td>{m.sourceRef} / {m.sourceRevision}</td><td>{m.limitBasis}</td><td>{m.review.status}{m.review.reviewedBy ? ` · ${m.review.reviewedBy} · ${when(m.review.reviewedAtMs)}` : ''}</td>
        <td>{canReview && <><button className="text-btn" onClick={() => setEditing({type: 'method', value: m})}>แก้ไข</button>{m.review.status === 'REVIEWED' ? <button className="text-btn" onClick={() => void unreview({type: 'method', value: m})}>ถอนรีวิว</button> : <button className="text-btn" disabled={!reviewerName} onClick={() => void review({type: 'method', value: m})}>รีวิวโดย {reviewerName || '?'}</button>}</>}{canDelete && <button className="text-btn" onClick={() => void onDelete('method', m.id)}>ลบ</button>}</td></tr>)}
    </tbody></table>
    {canReview && <button className="btn secondary" onClick={() => setEditing({type: 'method', value: emptyMethod(`M-${Date.now().toString(36).toUpperCase()}`)})}>เพิ่มวิธีคำนวณ</button>}

    <h4>ผลิตภัณฑ์/วัสดุ ({entries.length}/{registry.entries.length})</h4>
    <label className="field"><span>กรองชนิด</span><select value={kindFilter} onChange={e => setKindFilter(e.target.value as CatalogKind | '')}><option value="">ทั้งหมด</option>{CATALOG_KINDS.map(k => <option key={k} value={k}>{CATALOG_KIND_LABEL[k]}</option>)}</select></label>
    <table aria-label="ผลิตภัณฑ์และวัสดุ"><thead><tr><th>ID</th><th>ชนิด</th><th>ชื่อ / ผลิตภัณฑ์</th><th>ขีดจำกัดที่กรอก</th><th>แหล่ง / revision</th><th>สถานะ · ผู้ตรวจ</th><th></th></tr></thead><tbody>
      {entries.map(e => <tr key={e.id}><td>{e.id}</td><td>{CATALOG_KIND_LABEL[e.kind]}</td><td>{e.name}<br/><small>{e.productRef}</small></td>
        <td>{e.limits.length ? e.limits.map(l => `${l.check} ${l.value ?? 'UNKNOWN'} ${l.unit}`).join(' · ') : 'ยังไม่มีขีดจำกัด'}</td><td>{e.sourceRef} / {e.sourceRevision}</td>
        <td>{e.review.status}{e.review.reviewedBy ? ` · ${e.review.reviewedBy} · ${when(e.review.reviewedAtMs)}` : ''}</td>
        <td>{canReview && <><button className="text-btn" onClick={() => setEditing({type: 'entry', value: e})}>แก้ไข</button>{e.review.status === 'REVIEWED' ? <button className="text-btn" onClick={() => void unreview({type: 'entry', value: e})}>ถอนรีวิว</button> : <button className="text-btn" disabled={!reviewerName} onClick={() => void review({type: 'entry', value: e})}>รีวิวโดย {reviewerName || '?'}</button>}</>}{canDelete && <button className="text-btn" onClick={() => void onDelete('entry', e.id)}>ลบ</button>}</td></tr>)}
    </tbody></table>
    {canReview && <button className="btn secondary" onClick={() => setEditing({type: 'entry', value: emptyEntry(`E-${Date.now().toString(36).toUpperCase()}`, kindFilter || 'OTHER')})}>เพิ่มผลิตภัณฑ์/วัสดุ</button>}

    {editing?.type === 'method' && <MethodForm value={editing.value} onCancel={() => setEditing(null)} onSave={v => void save({type: 'method', value: v})}/>}
    {editing?.type === 'entry' && <EntryForm value={editing.value} methods={registry.methods} onCancel={() => setEditing(null)} onSave={v => void save({type: 'entry', value: v})}/>}
  </section>;
}

function MethodForm({value, onSave, onCancel}: {value: RegistryMethod; onSave: (v: RegistryMethod) => void; onCancel: () => void}) {
  const [m, setM] = useState<RegistryMethod>(value);
  // Editing content returns the item to DRAFT; the reviewer must review it again.
  const set = (patch: Partial<RegistryMethod>) => setM(markDraft({...m, ...patch}));
  return <fieldset className="registry-form"><legend>วิธีคำนวณ {m.id}</legend><div className="form-grid">
    <label className="field"><span>ID</span><input value={m.id} onChange={e => set({id: e.target.value})}/></label>
    <label className="field"><span>ชื่อ</span><input value={m.name} onChange={e => set({name: e.target.value})}/></label>
    <label className="field"><span>แหล่งอ้างอิง</span><input value={m.sourceRef} onChange={e => set({sourceRef: e.target.value})}/></label>
    <label className="field"><span>Revision ของแหล่ง</span><input value={m.sourceRevision} onChange={e => set({sourceRevision: e.target.value})}/></label>
    <label className="field"><span>ขอบเขตการใช้</span><input value={m.scope} onChange={e => set({scope: e.target.value})}/></label>
    <label className="field"><span>ฐานขีดจำกัด</span><select value={m.limitBasis} onChange={e => set({limitBasis: e.target.value as RegistryMethod['limitBasis']})}><option>ALLOWABLE</option><option>DESIGN</option><option>SLS_LIMIT</option></select></label>
  </div><button className="btn" onClick={() => onSave(m)}>บันทึก (เป็น DRAFT)</button> <button className="btn secondary" onClick={onCancel}>ยกเลิก</button></fieldset>;
}

function EntryForm({value, methods, onSave, onCancel}: {value: RegistryEntry; methods: RegistryMethod[]; onSave: (v: RegistryEntry) => void; onCancel: () => void}) {
  const [e, setE] = useState<RegistryEntry>(value), [propKey, setPropKey] = useState(''), [propValue, setPropValue] = useState('');
  const set = (patch: Partial<RegistryEntry>) => setE(markDraft({...e, ...patch}));
  const setLimit = (i: number, patch: Partial<RegistryLimit>) => set({limits: e.limits.map((l, j) => j === i ? {...l, ...patch} : l)});
  const unusedChecks = LIMIT_CHECKS.filter(c => !e.limits.some(l => l.check === c));
  return <fieldset className="registry-form"><legend>ผลิตภัณฑ์/วัสดุ {e.id}</legend><div className="form-grid">
    <label className="field"><span>ID</span><input value={e.id} onChange={x => set({id: x.target.value})}/></label>
    <label className="field"><span>ชนิด</span><select value={e.kind} onChange={x => set({kind: x.target.value as CatalogKind})}>{CATALOG_KINDS.map(k => <option key={k} value={k}>{CATALOG_KIND_LABEL[k]}</option>)}</select></label>
    <label className="field"><span>ชื่อ</span><input value={e.name} onChange={x => set({name: x.target.value})}/></label>
    <label className="field"><span>ผลิตภัณฑ์/ผู้ผลิต/รุ่น</span><input value={e.productRef} onChange={x => set({productRef: x.target.value})}/></label>
    <label className="field"><span>แหล่งอ้างอิง (ใบรับรอง/ตาราง)</span><input value={e.sourceRef} onChange={x => set({sourceRef: x.target.value})}/></label>
    <label className="field"><span>Revision ของแหล่ง</span><input value={e.sourceRevision} onChange={x => set({sourceRevision: x.target.value})}/></label>
    <label className="field"><span>หลักฐาน (ไฟล์/เลขที่เอกสาร)</span><input value={e.evidenceRef} onChange={x => set({evidenceRef: x.target.value})}/></label>
    <label className="field"><span>ขอบเขต/เงื่อนไขใช้</span><input value={e.scopeEvidenceRef} onChange={x => set({scopeEvidenceRef: x.target.value})}/></label>
  </div>
  <h5>คุณสมบัติอ้างอิง (ไม่ใช้คำนวณขีดจำกัด)</h5>
  <ul>{Object.entries(e.properties).map(([k, v]) => <li key={k}>{k} = {v === null ? 'UNKNOWN' : String(v)} <button className="text-btn" onClick={() => {const {[k]: _d, ...rest} = e.properties; set({properties: rest});}}>ลบ</button></li>)}</ul>
  <div className="form-grid"><label className="field"><span>ชื่อคุณสมบัติ</span><input value={propKey} onChange={x => setPropKey(x.target.value)}/></label><label className="field"><span>ค่า (ว่าง = UNKNOWN)</span><input value={propValue} onChange={x => setPropValue(x.target.value)}/></label>
    <button className="btn secondary" disabled={!propKey.trim()} onClick={() => {set({properties: {...e.properties, [propKey.trim()]: propValue.trim() === '' ? null : (number(propValue) ?? propValue)}}); setPropKey(''); setPropValue('');}}>เพิ่มคุณสมบัติ</button></div>
  <h5>ขีดจำกัดที่ผู้ตรวจกรอก</h5>
  {e.limits.map((l, i) => <div className="form-grid" key={l.check}>
    <span><b>{l.check}</b> · {l.unit}</span>
    <label className="field"><span>ค่า (ว่าง = UNKNOWN)</span><input type="number" min="0" step="any" value={l.value ?? ''} onChange={x => setLimit(i, {value: number(x.target.value)})}/></label>
    <label className="field"><span>ฐานแรง</span><select value={l.actionBasis} onChange={x => setLimit(i, {actionBasis: x.target.value as RegistryLimit['actionBasis']})}><option>SERVICE</option><option>FACTORED</option></select></label>
    <label className="field"><span>ฐานขีดจำกัด</span><select value={l.limitBasis} onChange={x => setLimit(i, {limitBasis: x.target.value as RegistryLimit['limitBasis']})}><option>ALLOWABLE</option><option>DESIGN</option><option>SLS_LIMIT</option></select></label>
    <label className="field"><span>ช่วง/ความยาวไม่ค้ำยันสูงสุด · mm</span><input type="number" min="0" step="any" value={l.maximumSpanMm ?? ''} onChange={x => setLimit(i, {maximumSpanMm: number(x.target.value)})}/></label>
    <label className="field"><span>วิธีคำนวณ</span><select value={l.methodId} onChange={x => setLimit(i, {methodId: x.target.value})}><option value="">ยังไม่ระบุ</option>{methods.map(m => <option key={m.id} value={m.id}>{m.id} · {m.review.status}</option>)}</select></label>
    <label className="field"><span>หมายเหตุขอบเขต</span><input value={l.scopeNote} onChange={x => setLimit(i, {scopeNote: x.target.value})}/></label>
    <button className="btn secondary" onClick={() => set({limits: e.limits.filter((_, j) => j !== i)})}>ลบขีดจำกัด {l.check}</button>
  </div>)}
  {!!unusedChecks.length && <label className="field"><span>เพิ่มขีดจำกัดสำหรับการตรวจ</span><select value="" onChange={x => {if (x.target.value) set({limits: [...e.limits, emptyLimit(x.target.value as LimitCheck)]});}}><option value="">เลือก…</option>{unusedChecks.map(c => <option key={c} value={c}>{c} · {limitUnit(c)}</option>)}</select></label>}
  <button className="btn" onClick={() => onSave(e)}>บันทึก (เป็น DRAFT)</button> <button className="btn secondary" onClick={onCancel}>ยกเลิก</button></fieldset>;
}
