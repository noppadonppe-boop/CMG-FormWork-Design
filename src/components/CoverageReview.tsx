import React, {useEffect, useState} from 'react';
import {canonical, clone} from '../domain/workflowV07/common';
import {emptyCoverageReview, requirementKey, requirementRef, type AppliedCoverageReview, type CoverageReviewDefinition, type CoverageReviewGroup, type EquivalenceMode} from '../domain/workflowV07/coverageReview';
import type {WorkflowModel, previewWorkflow} from '../domain/workflowV07/model';
type Preview = ReturnType<typeof previewWorkflow>;
const states: Record<string, string> = {UNASSIGNED: 'ยังไม่มีตัวแทน', STALE_PLAN: 'แผนตัวแทนเก่า', DUPLICATE_ASSIGNMENT: 'กำหนดซ้ำ', INCOMPLETE_GROUP: 'ข้อมูลกลุ่มไม่ครบ', NON_EQUIVALENT: 'ยังใช้แทนกันไม่ได้', REPRESENTATIVE_PENDING: 'มีตัวแทนรอตรวจขอบเขต/ผล', NA_PENDING: 'อ้าง N/A รอพิสูจน์'};
const modes: Record<EquivalenceMode, string> = {EXACT_APPLICABILITY: 'เทียบ Applicability ทุกช่องตรงกัน', LOCAL_1D_SAME: 'เทียบแรงคาน 1D ตามแกนเดิม', LOCAL_1D_REVERSED: 'เทียบแรงคาน 1D กลับแกนช่วง', NOT_APPLICABLE_CLAIM: 'เสนอว่าไม่เกี่ยวข้อง (N/A) พร้อมหลักฐาน'};
function definitionOf(p: AppliedCoverageReview | null | undefined): CoverageReviewDefinition {
  if (!p) return emptyCoverageReview(); const {revisionId: _revision, inputDefinition: _input, ...d} = p; return clone(d);
}
export function CoverageReviewResults({model, preview}: {model: WorkflowModel; preview: Preview}) {
  const [member, setMember] = useState(''), [check, setCheck] = useState(''), [state, setState] = useState(''), [page, setPage] = useState(0);
  const review = preview.coverageReview, rows = review.rows.filter(r => r.memberId.toLowerCase().includes(member.toLowerCase()) && r.checkId.includes(check) && (!state || r.state === state));
  const last = Math.max(0, Math.ceil(rows.length / 100) - 1), current = Math.min(page, last), visible = rows.slice(current * 100, current * 100 + 100);
  return <section className="coverage-review-results" aria-label="Coverage matrix รายสมาชิกและรายการตรวจ"><h3>Typical / Coverage matrix · BLOCKED / NO_GO</h3>
    <p>Revision {review.revisionId} · รายการจริง {review.total} · ตรวจยืนยันแล้ว {review.checkedCount} · N/A ยืนยันแล้ว {review.verifiedNotApplicableCount}</p>
    <p>ตารางแสดงทุก Member × Check × Load case × Revision ไม่เลือกตัวแทนจากช่วงยาวสุดหรือแรงรวม การจับคู่และการเทียบแรงคานยังไม่ใช่ผลตรวจกำลัง</p>
    <p>สถานะแผน: {review.sourceCurrent ? 'ตรงกับข้อมูลฉบับนี้ หรือยังไม่มีแผน' : 'STALE · ต้องตรวจกลุ่มกับข้อมูลใหม่'} · ข้อกำหนดที่ยังไม่ผูกสมาชิก {preview.specificationGaps.length}</p>
    <div className="form-grid"><label className="field"><span>กรองสมาชิกใน Matrix</span><input value={member} onChange={e => {setMember(e.target.value); setPage(0);}}/></label><label className="field"><span>กรอง Check ใน Matrix</span><input value={check} onChange={e => {setCheck(e.target.value); setPage(0);}}/></label>
      <label className="field"><span>กรองสถานะใน Matrix</span><select value={state} onChange={e => {setState(e.target.value); setPage(0);}}><option value="">ทุกสถานะ</option>{Object.entries(states).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label></div>
    <p>แสดง {rows.length ? current * 100 + 1 : 0}–{Math.min((current + 1) * 100, rows.length)} จาก {rows.length} รายการที่กรอง · ร่าง JSON เก็บ Matrix ครบทั้งหมด</p>
    <button className="btn secondary" disabled={current === 0} onClick={() => setPage(current - 1)}>Matrix หน้าก่อน</button><button className="btn secondary" disabled={current >= last} onClick={() => setPage(current + 1)}>Matrix หน้าถัดไป</button>
    <table><thead><tr><th>สมาชิก / Check</th><th>Load case / Revision</th><th>กลุ่ม / ตัวแทน</th><th>หลักฐาน / N/A</th><th>ผลเทียบขอบเขต</th><th>สถานะ</th></tr></thead><tbody>{visible.map((r, i) => <tr key={`${requirementKey(r)}:${i}`}><td>{r.memberId} / {r.checkId}<br/>{model.checkCatalogue?.specifications.find(s => s.id === r.checkId)?.description}</td><td>{r.loadCaseId} / {r.revision}</td><td>{r.groupId ?? 'UNKNOWN'} / {r.representative?.memberId ?? 'UNKNOWN'}</td><td>{r.evidenceRef ?? 'UNKNOWN'}{r.notApplicableReason && <p>N/A ที่เสนอ: {r.notApplicableReason}</p>}</td><td>Applicability: {r.exactApplicability === null ? 'UNKNOWN' : String(r.exactApplicability)}<br/>แรง 1D: {r.localDemandEquivalent === null ? 'ยังไม่เทียบ' : r.localDemandEquivalent ? 'อินพุตเทียบกันได้เฉพาะแรง 1D' : 'อินพุตต่างกัน'}<ul>{r.comparisonIssues.map(s => <li key={s}>{s}</li>)}</ul></td><td>{states[r.state]} · BLOCKED</td></tr>)}</tbody></table>
    {!review.total && <p>ยังไม่มีรายการตรวจของสมาชิกจริง จึงไม่ถือว่าครบ Coverage</p>}
    {!!review.diagnostics.length && <details><summary>ปัญหาแผนตัวแทน ({review.diagnostics.length})</summary><ul>{review.diagnostics.map((s, i) => <li key={i}>{s}</li>)}</ul></details>}
    {!!preview.specificationGaps.length && <p>ข้อกำหนดที่ยังไม่ผูกสมาชิกจริง: {preview.specificationGaps.join(', ')}</p>}
    <p>มุม รอยต่อ ขอบ ช่วงยื่น การค้ำยึด ความยาวไร้ค้ำและระยะยืดแจ็กยังต้องตรวจขอบเขตจริง การกลับแกน 1D ไม่พิสูจน์ Mirror ของระบบหรือแรงสองทิศ</p>
  </section>;
}
export function CoverageReviewEditor({model, preview, onApply, onPendingChange}: {
  model: WorkflowModel; preview: Preview; onApply: (definition: CoverageReviewDefinition) => void; onPendingChange: (pending: boolean) => void;
}) {
  const identity = canonical(definitionOf(model.coverageReview));
  const [form, setForm] = useState(() => definitionOf(model.coverageReview)), [activeId, setActiveId] = useState(''), [error, setError] = useState('');
  const [member, setMember] = useState(''), [check, setCheck] = useState(''), [loadCase, setLoadCase] = useState(''), [page, setPage] = useState(0);
  useEffect(() => {setForm(definitionOf(model.coverageReview)); setError(''); onPendingChange(false);}, [identity, onPendingChange]);
  useEffect(() => () => onPendingChange(false), [onPendingChange]);
  const active = form.groups.find(g => g.id === activeId), rows = preview.requiredChecks.filter(r => r.memberId.toLowerCase().includes(member.toLowerCase()) && r.checkId.includes(check) && r.loadCaseId.includes(loadCase));
  const current = Math.min(page, Math.max(0, Math.ceil(rows.length / 100) - 1));
  function change(next: CoverageReviewDefinition) {setForm(next); setError(''); onPendingChange(canonical(next) !== identity);}
  function update(patch: Partial<CoverageReviewGroup>) {if (active) change({...form, groups: form.groups.map(g => g.id === active.id ? {...g, ...patch} : g)});}
  return <fieldset className="coverage-review-editor"><legend>จัดกลุ่มตัวแทนราย Check / Load case</legend>
    <p>บันทึกแผนตัวแทนพร้อมหลักฐานเท่านั้น ผลวิศวกรรมและ N/A ยังรอตรวจยืนยัน ไม่มีปุ่มกำหนด PASS หรืออนุมัติ</p>
    <label className="field"><span>กลุ่มตัวแทนที่กำลังแก้</span><select value={activeId} onChange={e => setActiveId(e.target.value)}><option value="">เลือกกลุ่ม</option>{form.groups.map(g => <option key={g.id}>{g.id}</option>)}</select></label>
    <button className="btn secondary" disabled={form.groups.length >= 2000} onClick={() => {let n = 1; while (form.groups.some(g => g.id === `TYP-${n}`)) n++; const id = `TYP-${n}`;
      change({...form, groups: [...form.groups, {id, representative: null, targets: [], mode: null, evidenceRef: '', notApplicableReason: ''}]}); setActiveId(id);
    }}>เพิ่มกลุ่มตัวแทน</button>
    {active && <><label className="field"><span>วิธีเทียบกลุ่มตัวแทน</span><select value={active.mode ?? ''} onChange={e => update({mode: (e.target.value || null) as typeof active.mode, evidenceRef: '', notApplicableReason: '', ...(e.target.value === 'NOT_APPLICABLE_CLAIM' ? {representative: null} : {})})}><option value="">ยังไม่ระบุ</option>{Object.entries(modes).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <p>ตัวแทน: {active.representative ? `${active.representative.memberId} / ${active.representative.checkId} / ${active.representative.loadCaseId} / ${active.representative.revision}` : 'UNKNOWN'} · สมาชิก/รายการที่เลือก {active.targets.length}</p>
      <label className="field"><span>หลักฐานขอบเขตการใช้ตัวแทน</span><input value={active.evidenceRef} onChange={e => update({evidenceRef: e.target.value})}/></label>
      {active.mode === 'NOT_APPLICABLE_CLAIM' && <label className="field"><span>เหตุผลและเรขาคณิตที่เสนอ N/A</span><input value={active.notApplicableReason} onChange={e => update({notApplicableReason: e.target.value})}/></label>}
      <button className="btn secondary" onClick={() => {change({...form, groups: form.groups.filter(g => g.id !== active.id)}); setActiveId('');}}>ลบกลุ่มที่เลือก</button>
      <details><summary>รายการอ้างอิงที่เลือกทั้งหมด ({active.targets.length})</summary>{active.targets.map((r, i) => <p key={i}>{r.memberId} / {r.checkId} / {r.loadCaseId} / {r.revision} <button className="btn secondary" onClick={() => update({targets: active.targets.filter((_, n) => n !== i), evidenceRef: ''})}>นำรายการที่เลือก {i + 1} ออกจากกลุ่ม</button></p>)}</details>
    </>}
    <div className="form-grid">{([['สมาชิกเพื่อจัดกลุ่ม', member, setMember], ['Check เพื่อจัดกลุ่ม', check, setCheck], ['Load case เพื่อจัดกลุ่ม', loadCase, setLoadCase]] as const).map(([label, value, set]) => <label className="field" key={label}><span>{label}</span><input value={value} onChange={e => {set(e.target.value); setPage(0);}}/></label>)}</div>
    <p>เลือกจากรายการจริง: แสดง {rows.length ? current * 100 + 1 : 0}–{Math.min((current + 1) * 100, rows.length)} จาก {rows.length}</p>
    <button className="btn secondary" disabled={current === 0} onClick={() => setPage(current - 1)}>เลือกหน้าก่อน</button><button className="btn secondary" disabled={(current + 1) * 100 >= rows.length} onClick={() => setPage(current + 1)}>เลือกหน้าถัดไป</button>
    <table><thead><tr><th>รวมในกลุ่ม</th><th>ตัวแทน</th><th>สมาชิก / Check / Case / Revision</th></tr></thead><tbody>{rows.slice(current * 100, (current + 1) * 100).map((r, i) => {
      const key = requirementKey(r), chosen = active?.targets.some(t => requirementKey(t) === key) ?? false, other = form.groups.some(g => g.id !== active?.id && g.targets.some(t => requirementKey(t) === key));
      return <tr key={`${key}:${i}`}><td><input type="checkbox" aria-label={`รวม ${r.memberId} ${r.checkId} ${r.loadCaseId}`} checked={chosen} disabled={!active || other} onChange={e => {if (active) update({targets: e.target.checked ? [...active.targets, requirementRef(r)] : active.targets.filter(t => requirementKey(t) !== key), evidenceRef: ''});}}/></td><td><button className="btn secondary" disabled={!active || active.mode === 'NOT_APPLICABLE_CLAIM'} onClick={() => update({representative: requirementRef(r), evidenceRef: ''})}>ใช้ {r.memberId} {r.checkId} {r.loadCaseId} เป็นตัวแทน</button></td><td>{r.memberId} / {r.checkId} / {r.loadCaseId} / {r.revision}{other && ' · อยู่ในกลุ่มอื่นแล้ว'}</td></tr>;
    })}</tbody></table>
    {error && <p role="alert">{error}</p>}
    <button className="btn secondary" onClick={() => {try {onApply(form); onPendingChange(false); setError('');} catch (e) {setError((e as Error).message);}}}>เก็บแผนตัวแทนร่าง</button>
    <button className="btn secondary" onClick={() => {change(definitionOf(model.coverageReview)); onPendingChange(false);}}>คืนค่าแผนตัวแทนที่เก็บไว้</button>
    <button className="btn secondary" onClick={() => {change(emptyCoverageReview()); setActiveId('');}}>ล้างกลุ่มในร่างที่กำลังแก้</button>
  </fieldset>;
}
