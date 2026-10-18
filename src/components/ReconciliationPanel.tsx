import React, {useMemo, useRef, useState} from 'react';
import {buildReconciliationDecisionTemplate, buildReconciliationRows, parseReconciliationDecisionTemplate, reconciliationReadyForOwner, type ReconciliationCaseInput, type ReconciliationCaseRow, type ReconciliationDecision} from '../domain/reconciliation';

const label: Record<ReconciliationDecision, string> = {
  KEEP: 'เก็บ Case เดิม',
  RENAME: 'เปลี่ยนชื่อให้ไม่ซ้ำ',
  MERGE_AFTER_DOCUMENT_REVIEW: 'รวมหลังตรวจเอกสาร',
  USE_NAME_SUGGESTED_TYPE: 'ใช้ประเภทตามรหัสชื่อ',
  USE_STORED_TYPE: 'ใช้ประเภทที่บันทึกไว้',
  CREATE_SEPARATE_CASE: 'แยกเป็น Case ใหม่',
};

export function ReconciliationPanel({projectId, projectCode, cases, canEdit}: {projectId: string; projectCode: string; cases: readonly ReconciliationCaseInput[]; canEdit: boolean}) {
  const [rows, setRows] = useState<ReconciliationCaseRow[]>(() => buildReconciliationRows(cases));
  const [sourceBackup, setSourceBackup] = useState('');
  const [owner, setOwner] = useState('');
  const [approvedBy, setApprovedBy] = useState('');
  const [approvedAt, setApprovedAt] = useState('');
  const [reason, setReason] = useState('');
  const [newBackupBeforeWrite, setNewBackupBeforeWrite] = useState(false);
  const [message, setMessage] = useState('');
  const templatePicker = useRef<HTMLInputElement>(null);
  const template = useMemo(() => buildReconciliationDecisionTemplate({projectId, projectCode, sourceBackup, owner: owner || null, rows, approvedBy: approvedBy || null, approvedAt: approvedAt ? new Date(approvedAt).toISOString() : null, reason: reason || null, newBackupBeforeWrite}), [projectId, projectCode, sourceBackup, owner, rows, approvedBy, approvedAt, reason, newBackupBeforeWrite]);
  function choose(id: string, decision: ReconciliationDecision) {
    setRows(previous => previous.map(row => row.id === id ? {...row, decision} : row));
  }
  function exportTemplate() {
    if (!reconciliationReadyForOwner(template)) {setMessage('ยัง export แบบพร้อมตรวจไม่ได้ · ต้องกรอก backup, Owner, การตัดสินใจทุก Case, ผู้อนุมัติ, เวลา, เหตุผล และยืนยัน backup ใหม่'); return;}
    const blob = new Blob([JSON.stringify(template, null, 2)], {type: 'application/json'}), url = URL.createObjectURL(blob), anchor = document.createElement('a');
    anchor.href = url; anchor.download = `${projectCode || 'project'}-reconciliation-decision.json`; anchor.click(); URL.revokeObjectURL(url);
    setMessage('ส่งออก decision template แล้ว · applyToProduction=false และยังไม่มีการเขียน Production');
  }
  async function importTemplate(file: File) {
    try {
      const parsed = parseReconciliationDecisionTemplate(JSON.parse(await file.text()), projectId, rows);
      setRows(parsed.rows); setSourceBackup(parsed.template.sourceBackup); setOwner(parsed.template.owner ?? ''); setApprovedBy(parsed.template.apply.approvedBy ?? '');
      setApprovedAt(parsed.template.apply.approvedAt ? parsed.template.apply.approvedAt.slice(0, 16) : ''); setReason(parsed.template.apply.reason ?? ''); setNewBackupBeforeWrite(parsed.template.apply.newBackupBeforeWrite);
      setMessage('นำเข้า decision template แล้ว · ตรวจ readiness ได้ แต่ยังไม่ apply Production');
    } catch (error) {setMessage(`นำเข้า decision template ไม่สำเร็จ: ${(error as Error).message}`);}
  }
  return <section className="card reconciliation-panel" aria-label="แบบตัดสินใจแก้ความสัมพันธ์ Design Case">
    <h3>Production Case Reconciliation</h3>
    <p>เลือกการตัดสินใจทีละ Case จากข้อมูลที่เห็นจริง แล้ว export เป็นเอกสารให้ Owner/ผู้ตรวจอนุมัติ ระบบไม่แก้ชื่อ ประเภท หรือลบร่าง Production จากหน้านี้</p>
    {!canEdit && <div className="warning">บัญชีนี้ดูได้อย่างเดียว ไม่สามารถจัดทำ decision template ได้</div>}
    <div className="form-grid">
      <label className="field"><span>ไฟล์ backup ต้นทาง</span><input value={sourceBackup} disabled={!canEdit} placeholder="เช่น F:/Downloads/CMG-002-project-backup.json" onChange={e => setSourceBackup(e.target.value)}/></label>
      <label className="field"><span>Owner ผู้ตัดสินใจ</span><input value={owner} disabled={!canEdit} onChange={e => setOwner(e.target.value)}/></label>
    </div>
    <table aria-label="รายการตัดสินใจ reconcile"><thead><tr><th>Case</th><th>ประเภทที่เก็บ</th><th>ประเภทจากรหัสชื่อ</th><th>การตัดสินใจ</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td>{row.name}<br/><small>{row.id}</small></td><td>{row.storedType}</td><td>{row.nameSuggestedType ?? '—'}</td><td><select disabled={!canEdit} value={row.decision ?? ''} aria-label={`การตัดสินใจ ${row.id}`} onChange={e => choose(row.id, e.target.value as ReconciliationDecision)}><option value="">เลือก…</option>{row.allowed.map(option => <option key={option} value={option}>{label[option]}</option>)}</select></td></tr>)}</tbody></table>
    <div className="form-grid">
      <label className="field"><span>ผู้อนุมัติการเขียนกลับ</span><input value={approvedBy} disabled={!canEdit} onChange={e => setApprovedBy(e.target.value)}/></label>
      <label className="field"><span>เวลาที่อนุมัติ</span><input type="datetime-local" value={approvedAt} disabled={!canEdit} onChange={e => setApprovedAt(e.target.value)}/></label>
      <label className="field"><span>เหตุผล/ขอบเขต</span><input value={reason} disabled={!canEdit} onChange={e => setReason(e.target.value)}/></label>
    </div>
    <label className="confirm"><input type="checkbox" checked={newBackupBeforeWrite} disabled={!canEdit} onChange={e => setNewBackupBeforeWrite(e.target.checked)}/>ยืนยันว่าจะสร้าง backup ใหม่ก่อนเขียน Production</label>
    {message && <p className="muted" role="status">{message}</p>}
    <input ref={templatePicker} type="file" accept=".json,application/json" hidden onChange={e => {const file = e.target.files?.[0]; if (file) void importTemplate(file); e.target.value = '';}}/>
    <button className="btn secondary" disabled={!canEdit} onClick={() => templatePicker.current?.click()}>นำเข้า decision template</button>
    <button className="btn secondary" disabled={!canEdit} onClick={exportTemplate}>Export decision template (ยังไม่ apply)</button>
    <p className="muted">สถานะเอกสาร: {reconciliationReadyForOwner(template) ? 'พร้อมส่งให้ผู้อนุมัติตรวจ' : 'ยังไม่ครบข้อมูล · safeToAutoApply=false'}</p>
  </section>;
}
