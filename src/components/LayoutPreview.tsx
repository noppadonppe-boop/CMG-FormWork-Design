import {ChevronRight} from 'lucide-react';
import type {Status} from '../domain/index';

/** max: undefined = not searched here (legacy footing/column use the optimizer on the layout page). */
export interface PreviewRow {label: string; current: number; max?: number | null}
interface Check {label: string; utilization: number | null; status: Status}
const STATUS: Record<Status, string> = {PASS: 'ผ่านเกณฑ์คัดกรอง', FAIL: 'มีรายการไม่ผ่าน', INCOMPLETE: 'ข้อมูลยังไม่ครบ'};

/**
 * Geometry-page preview of the layout that follows from the dimensions just entered. It recalculates with
 * the same deterministic engine as the layout page, changes nothing, and links to the layout page to apply values.
 */
export function LayoutPreview({confirmed, status, rows, checks, notes = [], error, onOpen}: {confirmed: boolean; status: Status | null; rows: PreviewRow[];
  checks: Check[]; notes?: string[]; error?: string | null; onOpen: () => void}) {
  const governing = checks.filter(c => c.utilization != null).sort((a, b) => b.utilization! - a.utilization!).slice(0, 3);
  return <section className="card layout-preview" aria-label="สรุปการจัดวางจากมิตินี้">
    <div className="card-title"><h3>สรุปการจัดวางจากมิตินี้</h3><button className="btn secondary" onClick={onOpen}>ไปจัดวางเบื้องต้น <ChevronRight size={15}/></button></div>
    {error ? <div className="warning">{error}</div> : <>
      <p className="muted">คำนวณซ้ำจากมิติและ Design Criteria ปัจจุบัน · ยังไม่เปลี่ยนค่าใด ๆ · แก้ระยะและหน้าตัดได้ในหน้าจัดวางเบื้องต้น{confirmed ? '' : ' · มิติยังไม่ยืนยัน ผลเป็นเพียงตัวอย่าง'}</p>
      {status && <p><b className={status === 'FAIL' ? 'warn' : 'pass'}>{STATUS[status]}</b> · ผลคัดกรองเบื้องต้น ไม่ใช่การอนุมัติก่อสร้าง</p>}
      {rows.length > 0 && <table><thead><tr><th>ระยะ</th><th>ปัจจุบัน</th><th>สูงสุดที่ผ่าน</th></tr></thead><tbody>{rows.map(r =>
        <tr key={r.label}><td>{r.label}</td><td>{r.current.toLocaleString('en-US')} mm</td>
          <td className={r.max === undefined ? 'muted' : r.max === null ? 'warn' : r.max < r.current ? 'warn' : 'pass'}>{r.max === undefined ? 'ค้นหาในหน้าจัดวางเบื้องต้น' : r.max === null ? 'ไม่มีระยะที่ผ่าน (ต้องเปลี่ยนหน้าตัด)' : `${r.max.toLocaleString('en-US')} mm${r.max < r.current ? ' · ต้องลดระยะ' : ''}`}</td></tr>)}</tbody></table>}
      {governing.length > 0 && <table><thead><tr><th>รายการที่ใกล้เกณฑ์ที่สุด</th><th>อัตราส่วน</th><th>สถานะ</th></tr></thead><tbody>{governing.map(c =>
        <tr key={c.label}><td>{c.label}</td><td>{c.utilization!.toFixed(2)}</td><td className={c.status === 'FAIL' ? 'warn' : c.status === 'PASS' ? 'pass' : ''}>{c.status}</td></tr>)}</tbody></table>}
      {notes.length > 0 && <ul className="layout-preview-notes">{notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
    </>}
  </section>;
}
