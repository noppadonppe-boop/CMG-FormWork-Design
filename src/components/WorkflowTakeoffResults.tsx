import {buildWorkflowFormworkLayout, type WorkflowTakeoffItem} from '../domain/formworkLayout';
import type {previewWorkflow, WorkflowModel} from '../domain/workflowV07/model';

type Preview = ReturnType<typeof previewWorkflow>;

const labels: Record<WorkflowTakeoffItem, string> = {
  SIDE_FORM_AREA: 'พื้นที่ผิวแบบข้าง',
  SIDE_STUDS: 'คร่าวตั้ง',
  SIDE_WALER_RAILS: 'รางคานรัด',
  TIE_ROUTES: 'แนวไทร์',
  SOFFIT_PLYWOOD_AREA: 'พื้นที่ไม้อัดแบบท้อง',
  JOISTS: 'คร่าวแบบท้อง',
  BEARERS: 'แนวคานรับ',
  U_HEADS: 'จุด U-head',
  FRAME_MEMBERS: 'สมาชิกเฟรม',
};
const show = (value: number | null) => value === null ? 'UNKNOWN' : value.toLocaleString('en-US', {maximumFractionDigits: 4});

export function WorkflowTakeoffResults({model, preview}: {model: WorkflowModel; preview: Preview}) {
  const takeoff = buildWorkflowFormworkLayout(model, preview);
  return <section aria-label="รายการปริมาณแบบหล่อจากพิกัดจริง">
    <h3>รายการปริมาณแบบหล่อ · {takeoff.elementType} · DRAFT / NO_GO</h3>
    <p>นับจากพิกัดและ layout ที่ผู้ใช้ระบุเท่านั้น · ไม่ใช่รายการสั่งซื้อหรือการรับรองกำลัง · ปล่อยก่อสร้าง: {takeoff.constructionRelease}</p>
    {takeoff.bom.length ? <div className="table-scroll"><table aria-label="ปริมาณแบบหล่อร่าง">
      <thead><tr><th>รายการ</th><th>ผิว</th><th>จำนวน / พื้นที่</th><th>ช่วงวิเคราะห์</th><th>Stage / Case</th><th>หลักฐาน</th><th>หมายเหตุ</th></tr></thead>
      <tbody>{takeoff.bom.map(row => <tr key={row.id}>
        <td>{labels[row.item]}</td><td>{row.faceId ?? '—'}</td>
        <td>{show(row.quantity)} {row.unit === 'm2' ? 'm²' : 'ชิ้น'}</td>
        <td>{row.modeledSpanMm === null ? '—' : `${show(row.modeledSpanMm)} mm`}</td>
        <td>{row.stageId ?? 'UNKNOWN'} / {row.loadCaseId ?? 'UNKNOWN'}</td>
        <td>{row.evidenceRef ?? 'UNKNOWN'}</td><td>{row.note}</td>
      </tr>)}</tbody>
    </table></div> : <p>ยังไม่มี layout ปัจจุบันที่ใช้จัดปริมาณได้</p>}
    <ul>{takeoff.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>
  </section>;
}
