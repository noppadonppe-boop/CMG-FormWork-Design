export function AiReadingReport({draft}: {draft: Record<string, unknown>}) {
  const items = Array.isArray(draft.items) ? draft.items.filter((v): v is string => typeof v === 'string') : [];
  const unknowns = Array.isArray(draft.unknowns) ? draft.unknowns.filter((v): v is string => typeof v === 'string') : [];
  const unit = ({mm: 'มิลลิเมตร', cm: 'เซนติเมตร', m: 'เมตร'} as Record<string, string>)[String(draft.unit)];
  const dimensions = Object.entries({width: 'กว้าง', length: 'ยาว', height: 'สูง / ลึก', armX: 'แขน X', armY: 'แขน Y'})
    .filter(([key]) => typeof draft[key] === 'number')
    .map(([key, label]) => `${label} ${draft[key]} ${unit ?? '(ยังไม่ทราบหน่วย)'}`);
  return <section aria-label="สรุปผลการอ่านแบบเป็นภาษาไทย">
    {typeof draft.report === 'string' && draft.report.trim()
      ? <p style={{whiteSpace: 'pre-wrap'}}>{draft.report}</p>
      : <><p>{dimensions.length ? `อ่านมิติได้ ${dimensions.join(' · ')}` : 'ยังอ่านมิติจากภาพนี้ไม่ได้'}</p>
        <p>ผลเดิมยังไม่มีข้อมูลชื่อรายการและจำนวน ต้องวิเคราะห์ด้วย AI อีกครั้งเพื่ออ่านรายละเอียดเพิ่มเติม</p></>}
    {items.length > 0 && <><h4>รายการที่พบในหน้าที่เลือก</h4><ul>{items.map((item, index) => <li key={index}>{item}</li>)}</ul></>}
    {unknowns.length > 0 && <><h4>ข้อมูลที่ยังไม่ชัดเจน / รอตรวจสอบ</h4><ul>{unknowns.map((item, index) => <li key={index}>{item}</li>)}</ul></>}
    <p className="muted">ผลนี้ครอบคลุมเฉพาะภาพหน้าที่เลือก ยังไม่ใช่ยอดรวมทั้งเอกสาร</p>
  </section>;
}
