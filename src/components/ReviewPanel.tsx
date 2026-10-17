import React, {useState} from 'react';
import {allowedReviewActions, applyReviewAction, reviewIsStale, REVIEW_STATE_LABEL, type ReviewAction, type ReviewActor, type ReviewContext, type ReviewRecord} from '../domain/workflowV07/review';

const ACTION_LABEL: Record<ReviewAction, string> = {SUBMIT: 'ส่งตรวจ', REVIEW: 'บันทึกผลตรวจ', APPROVE: 'อนุมัติภายใน', ISSUE: 'ออกเอกสารภายใน', RETURN: 'ส่งคืนเป็นร่าง', REVISE: 'เปิดรอบแก้ไขใหม่'};
const when = (ms: number) => new Date(ms).toLocaleString('th-TH');

/** State, bound hash, history and the actions this actor may take now. Every action is written
 * through the parent so Firestore Rules re-check the role and independence gates. */
export function ReviewPanel({record, actor, context, blockers, onChange}: {
  record: ReviewRecord; actor: ReviewActor; context: ReviewContext; blockers: string[]; onChange: (next: ReviewRecord) => Promise<void> | void;
}) {
  const [note, setNote] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const stale = reviewIsStale(record, context), actions = allowedReviewActions(record, actor, context);
  async function run(action: ReviewAction) {
    setBusy(true);
    try {await onChange(applyReviewAction(record, action, actor, context, note)); setNote(''); setError('');}
    catch (e) {setError((e as Error).message);}
    finally {setBusy(false);}
  }
  return <section className="card review-panel" aria-label="สถานะตรวจ อนุมัติ และออกเอกสาร">
    <h3>ตรวจ · อนุมัติ · ออกเอกสาร</h3>
    <p><b>{REVIEW_STATE_LABEL[record.state]}</b> ({record.state}) · ผู้ดำเนินการ {actor.name || actor.uid} [{actor.roles.join(', ') || 'ไม่มีบทบาท'}]</p>
    {record.state !== 'DRAFT' && <p className="muted">ผูกกับร่าง hash {record.contentHash.slice(0, 16)}… · engine {record.engineVersion} · ผู้ส่งตรวจ {record.history.find(h => h.action === 'SUBMIT' && h.uid === record.submittedBy)?.name ?? record.submittedBy}</p>}
    {stale && <div className="warning" role="alert"><p>ร่างปัจจุบัน (hash {context.contentHash.slice(0, 16)}… · engine {context.engineVersion}) ต่างจากร่างที่ส่งตรวจ สถานะนี้ไม่ใช้กับร่างปัจจุบัน ต้องส่งคืนเป็นร่างแล้วส่งตรวจใหม่</p></div>}
    {record.state === 'ISSUED_INTERNAL' && <div className="notice">ออกเอกสารภายในแล้ว · ยังเป็น DRAFT / NO_GO / NOT FOR CONSTRUCTION · การแก้ไขต้องเปิดรอบใหม่พร้อมเหตุผล</div>}
    <p className="muted">รายการที่ยังขาด/บล็อกในร่างปัจจุบัน: {blockers.length} รายการ · การส่งตรวจไม่ลบรายการเหล่านี้ และสถานะใดก็ไม่ใช่การอนุมัติก่อสร้าง</p>
    {error && <div className="warning" role="alert">{error}</div>}
    <label className="field"><span>หมายเหตุ (จำเป็นเมื่อส่งคืน/เปิดรอบใหม่)</span><input value={note} onChange={e => setNote(e.target.value)}/></label>
    <div className="header-actions">{actions.map(a => <button key={a.action} className={a.action === 'RETURN' || a.action === 'REVISE' ? 'btn secondary' : 'btn'} disabled={busy || !!a.reason} title={a.reason ?? ''} onClick={() => void run(a.action)}>{ACTION_LABEL[a.action]}</button>)}</div>
    <ul className="muted">{actions.filter(a => a.reason).map(a => <li key={a.action}>{ACTION_LABEL[a.action]}: {a.reason}</li>)}</ul>
    {!!record.history.length && <table aria-label="ประวัติการตรวจ"><thead><tr><th>เมื่อ</th><th>การกระทำ</th><th>จาก → ไป</th><th>โดย</th><th>hash / engine</th><th>หมายเหตุ</th></tr></thead><tbody>
      {record.history.map((h, i) => <tr key={i}><td>{when(h.atMs)}</td><td>{ACTION_LABEL[h.action]}</td><td>{h.from} → {h.to}</td><td>{h.name} [{h.roles.join(', ')}]</td><td>{h.contentHash.slice(0, 12)}… / {h.engineVersion}</td><td>{h.note}</td></tr>)}
    </tbody></table>}
  </section>;
}

/** Project-level queue for the Review & Issue menu. */
export function ReviewQueue({rows, onOpen}: {rows: {caseId: string; name: string; elementType: string; record: ReviewRecord | null; stale: boolean | null}[]; onOpen: (caseId: string) => void}) {
  return <section className="card" aria-label="คิวตรวจและออกเอกสาร">
    <h3>Review &amp; Issue</h3>
    <p>สถานะต่อ Design Case ของโครงการนี้ ISSUED_INTERNAL หมายถึงออกเพื่อตรวจภายในเท่านั้น ไม่ใช่เอกสารก่อสร้าง</p>
    <table><thead><tr><th>Design Case</th><th>องค์อาคาร</th><th>สถานะ</th><th>ตรงกับร่างปัจจุบัน</th><th>อัปเดต</th><th></th></tr></thead><tbody>
      {rows.map(r => <tr key={r.caseId}><td>{r.name}</td><td>{r.elementType}</td><td>{r.record ? `${REVIEW_STATE_LABEL[r.record.state]} (${r.record.state})` : 'ร่าง (ยังไม่มีบันทึก)'}</td>
        <td>{r.record && r.record.state !== 'DRAFT' ? (r.stale === null ? 'ไม่ทราบ' : r.stale ? 'ไม่ตรง · ต้องส่งคืน' : 'ตรง') : '—'}</td><td>{r.record ? when(r.record.updatedAtMs) : '—'}</td>
        <td><button className="text-btn" onClick={() => onOpen(r.caseId)}>เปิด</button></td></tr>)}
    </tbody></table>
  </section>;
}
