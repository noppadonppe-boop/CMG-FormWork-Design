import React, {useEffect, useRef, useState} from 'react';
import {canonical} from '../domain/workflowV07/common';
import {createLayoutCandidateRequest, reviewLayoutCandidate, type CandidateRequest, type CandidateReview, type CandidateScope} from '../domain/workflowV07/layoutCandidate';
import type {WorkflowModel} from '../domain/workflowV07/model';

export function LayoutCandidateSummary({model}: {model: WorkflowModel}) {
  const a = model.layoutCandidate; if (!a) return null;
  return <section aria-label="ที่มาข้อเสนอ Layout ที่นำไปใช้"><h3>ที่มาข้อเสนอพิกัด · ร่าง / NO_GO</h3>
    <p>{a.proposal.binding.scope} · Stage {a.proposal.binding.stageId} · Case {a.proposal.binding.loadCaseId} · {a.appliedRevision === model.revisionId ? 'ตรงกับ Revision ที่นำข้อเสนอไปใช้' : 'ประวัติจาก Revision ก่อนหน้า ต้องตรวจข้อมูลปัจจุบัน'}</p>
    <p>แหล่งที่ผู้เสนอระบุ ยังไม่ยืนยัน: {a.proposal.sourceRef}</p><p>เหตุผลที่ผู้เสนอระบุ: {a.proposal.rationale}</p>
    <p>Revision ต้นทาง {a.proposal.binding.revisionId} · Revision ที่ใช้ข้อเสนอ {a.appliedRevision}</p>
    <details><summary>รหัสข้อมูลต้นทางและข้อเสนอพิกัดฉบับเต็ม</summary><p>Input hash {a.proposal.binding.inputHash}</p><p>Proposal hash {a.proposalHash}</p><pre style={{whiteSpace: 'pre-wrap', overflowWrap: 'anywhere'}}>{JSON.stringify(a.proposal, null, 2)}</pre></details>
    <p>การกดใช้เป็นการรับพิกัดเข้าร่าง ไม่ใช่การอนุมัติวิศวกรรม ข้อมูลวัสดุ โหลด กำลัง และจุดต่อยังต้องตรวจตามรายการจริง</p>
  </section>;
}
export function LayoutCandidateEditor({model, sourcePending, onPendingChange, onApply}: {
  model: WorkflowModel; sourcePending: boolean; onPendingChange: (pending: boolean) => void;
  onApply: (request: CandidateRequest, review: CandidateReview) => Promise<void>;
}) {
  const initial = model.sideLayout ?? model.soffitLayout ?? model.frameLayout;
  const [scope, setScope] = useState<CandidateScope>('SIDE'), [stage, setStage] = useState(initial?.stageId ?? ''), [loadCase, setLoadCase] = useState(initial?.loadCaseId ?? '');
  const [request, setRequest] = useState<CandidateRequest | null>(null), [requestIdentity, setRequestIdentity] = useState('');
  const [text, setText] = useState(''), [review, setReview] = useState<CandidateReview | null>(null), [checked, setChecked] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const generation = useRef(0), identity = canonical(model);
  const current = !!request && requestIdentity === identity && request.binding.scope === scope && request.binding.stageId === stage && request.binding.loadCaseId === loadCase;
  useEffect(() => {generation.current++; setReview(null); setChecked(false); setBusy(false);}, [identity]);
  useEffect(() => () => {generation.current++; onPendingChange(false);}, [onPendingChange]);
  function change() {generation.current++; setReview(null); setChecked(false); setError(''); setBusy(false); onPendingChange(true);}
  async function create() {
    if (sourcePending) return; const ticket = ++generation.current; setBusy(true); setError(''); setReview(null); setChecked(false); onPendingChange(true);
    try {const next = await createLayoutCandidateRequest(model, scope, stage, loadCase); if (ticket === generation.current) {setRequest(next); setRequestIdentity(identity); setText('');}}
    catch (e) {if (ticket === generation.current) setError((e as Error).message);} finally {if (ticket === generation.current) setBusy(false);}
  }
  async function inspect() {
    if (!request || !current || sourcePending) return; const ticket = ++generation.current; setBusy(true); setError(''); setReview(null); setChecked(false);
    try {if (text.length > 150000) throw Error('ข้อเสนอเกิน 150000 ตัวอักษร ไม่มีการตัดข้อมูลให้พอดี');
      const next = await reviewLayoutCandidate(model, request, JSON.parse(text)); if (ticket === generation.current) setReview(next);
    } catch (e) {if (ticket === generation.current) setError((e as Error).message);} finally {if (ticket === generation.current) setBusy(false);}
  }
  async function apply() {
    if (!request || !review || !current || !checked || sourcePending) return; const ticket = ++generation.current; setBusy(true); setError('');
    try {await onApply(request, review); if (ticket === generation.current) {setRequest(null); setText(''); setReview(null); setChecked(false); onPendingChange(false);}}
    catch (e) {if (ticket === generation.current) setError((e as Error).message);} finally {if (ticket === generation.current) setBusy(false);}
  }
  return <fieldset className="layout-candidate-editor"><legend>รับข้อเสนอ Layout จาก AI / ภายนอก · ออฟไลน์</legend>
    <p>สร้างข้อมูลพิกัดสำหรับส่งออกด้วยตนเอง แล้ววางข้อเสนอ JSON กลับมาตรวจ ไม่มีการส่งข้อมูลหรือเรียก AI จากหน้านี้ ข้อเสนอแก้ได้เฉพาะพิกัด วัสดุ นิยามโหลด กำลัง และรูปทรงคอนกรีตจะคงเดิม</p>
    <div className="form-grid"><label className="field"><span>ขอบเขตข้อเสนอพิกัด</span><select value={scope} disabled={busy} onChange={e => {change(); setScope(e.target.value as CandidateScope);}}><option value="SIDE">แบบข้าง</option>{['BEAM', 'SLAB'].includes(model.elementType) && <><option value="SOFFIT">แบบท้อง / Joist / Primary bearer / หัวรับ</option><option value="BOTH">แบบข้างและแบบท้องร่วมกัน</option></>}</select></label>
      <label className="field"><span>Stage ของข้อเสนอ</span><input value={stage} disabled={busy} onChange={e => {change(); setStage(e.target.value);}}/></label>
      <label className="field"><span>Load case ของข้อเสนอ</span><input value={loadCase} disabled={busy} onChange={e => {change(); setLoadCase(e.target.value);}}/></label></div>
    {sourcePending && <p role="status">มีข้อมูลต้นทางค้าง กรุณาเก็บหรือคืนค่าก่อนสร้าง ตรวจ หรือใช้ข้อเสนอ</p>}
    <button className="btn secondary" disabled={busy || sourcePending} onClick={() => void create()}>สร้างคำขอข้อเสนอพิกัดจากร่างปัจจุบัน</button>
    {request && <><p>คำขอ {request.binding.requestId} · Revision {request.binding.revisionId} · {current ? 'ข้อมูลต้นทางตรงกัน' : 'STALE · ต้องสร้างคำขอใหม่'}</p>
      <details><summary>คำขอและโครงสร้างคำตอบสำหรับส่งออกด้วยตนเอง</summary><textarea aria-label="คำขอข้อเสนอพิกัด JSON" readOnly rows={12} value={JSON.stringify(request, null, 2)} style={{width: '100%'}}/></details>
      <label className="field"><span>ข้อเสนอพิกัด JSON จาก AI / ภายนอก</span><textarea rows={10} disabled={busy} value={text} onChange={e => {change(); setText(e.target.value);}}/></label>
      <button className="btn secondary" disabled={busy || sourcePending || !current || !text.trim()} onClick={() => void inspect()}>ตรวจข้อเสนอและแสดงพิกัดที่จะเปลี่ยน</button></>}
    {review && <><p>พิกัดที่จะเปลี่ยน {review.changes.length} กลุ่ม · ยังไม่เปลี่ยนข้อมูลร่าง</p>
      <table aria-label="พิกัดก่อนและหลังข้อเสนอ"><thead><tr><th>ตำแหน่ง</th><th>ก่อน</th><th>หลัง</th></tr></thead><tbody>{review.changes.map(c => <tr key={c.path}><td>{c.path}</td><td><details><summary>ดูพิกัดก่อน</summary><pre style={{whiteSpace: 'pre-wrap'}}>{JSON.stringify(c.before, null, 2)}</pre></details></td><td><details><summary>ดูพิกัดหลัง</summary><pre style={{whiteSpace: 'pre-wrap'}}>{JSON.stringify(c.after, null, 2)}</pre></details></td></tr>)}</tbody></table>
      <p>เมื่อกดใช้: ผลและแผนตัวแทนต้องตรวจใหม่ ข้อมูลเฟรม การประกอบ Ringlock และชุดกรณีโหลดเดิมจะเก็บไว้เป็น STALE ต้องตรวจและนำไปใช้ใหม่ ไม่ย้ายจุดรับหรือฐานให้เอง</p>
      <p>ชิ้นส่วนที่เพิ่มจะไม่มีสมบัติวิศวกรรมที่เดาขึ้น การเลือกวัสดุ ไม้อัด จุดต่อ ฐาน และโหลดที่ยังขาดจะคงเป็น BLOCKED</p>
      <details><summary>ขอบเขตการตรวจข้อเสนอ</summary><ul>{review.notices.map(n => <li key={n}>{n}</li>)}</ul></details>
      <label className="confirm"><input type="checkbox" checked={checked} disabled={busy} onChange={e => setChecked(e.target.checked)}/>ตรวจพิกัดก่อน/หลังและรับทราบว่าต้องตรวจข้อมูลวิศวกรรมที่ได้รับผลใหม่</label>
      <button className="btn secondary" disabled={busy || sourcePending || !current || !checked} onClick={() => void apply()}>ใช้พิกัดที่ตรวจแล้วในร่างและวิเคราะห์ใหม่</button></>}
    {error && <p role="alert">{error}</p>}
    <button className="btn secondary" disabled={busy} onClick={() => {generation.current++; setRequest(null); setRequestIdentity(''); setText(''); setReview(null); setChecked(false); setError(''); setStage(initial?.stageId ?? ''); setLoadCase(initial?.loadCaseId ?? ''); setScope('SIDE'); onPendingChange(false);}}>ยกเลิกข้อเสนอพิกัดที่ยังไม่นำไปใช้</button>
  </fieldset>;
}
