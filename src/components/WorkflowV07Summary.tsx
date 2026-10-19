import type {WorkflowModel} from '../domain/workflowV07/model';
import {level, memberName, spacing} from '../drawing/workflowInstallation';

const f = (n: number | null | undefined, d = 0) => n == null || !Number.isFinite(n) ? 'ไม่ระบุ' : n.toLocaleString('en-US', {maximumFractionDigits: d});
const TOPOLOGY: Record<string, string> = {THROUGH_TIE: 'Tie ทะลุ', SEGMENTED_TIE: 'Tie แบบแยกชิ้น (Inner/Outer)', COLUMN_YOKE: 'วงรัดเสาภายนอก', GROUND_BRACED: 'ค้ำยันลงพื้น (ด้านเดียว)'};
const ELEMENT: Record<string, string> = {FOOTING: 'ฐานราก', COLUMN: 'เสา', WALL: 'ผนัง', BEAM: 'คาน', SLAB: 'พื้น'};

export interface DimensionCompare {label: string; page: number | null; draft: number | null}
/** Model extents in plan (X, Y) and height, the values the page dimensions are compared with. */
export function draftExtents(m: WorkflowModel) {
  const xs = m.vertices.map(v => v.x), ys = m.vertices.map(v => v.y);
  return {x: Math.max(...xs) - Math.min(...xs), y: Math.max(...ys) - Math.min(...ys), h: m.heightMm};
}

/** Read-only view of every stored v0.7 draft field relevant to the page, so geometry/layout pages show all existing data of the case. */
export function WorkflowV07Summary({model: m, mode, compare = [], onOpen}: {model: WorkflowModel; mode: 'geometry' | 'layout'; compare?: DimensionCompare[]; onOpen?: () => void}) {
  const e = draftExtents(m), side = m.sideLayout, soffit = m.soffitLayout, legs = m.ringlockAssembly?.legs ?? [], leg = legs[0];
  const mismatched = compare.filter(c => c.page != null && c.draft != null && Math.abs(c.page - c.draft) > 0.5);
  const rows: [string, string][] = mode === 'geometry' ? [
    ['องค์อาคาร / ระบบ', `${ELEMENT[m.elementType] ?? m.elementType} · ${m.sideTopology ? TOPOLOGY[m.sideTopology] ?? m.sideTopology : 'แบบท้อง + ค้ำยัน'}`],
    ['ขนาดในแปลน X × Y', `${f(e.x)} × ${f(e.y)} mm · ${m.vertices.length} จุดมุม`],
    ['พิกัดจุดมุม (X, Y)', m.vertices.map(v => `(${f(v.x)}, ${f(v.y)})`).join(' ')],
    ['ความสูง / ความลึก / ความหนาคอนกรีต', `${f(m.heightMm)} mm`],
    ...(m.slabThicknessMm != null ? [['ความหนาพื้น', `${f(m.slabThicknessMm)} mm`] as [string, string]] : []),
    ...(m.beamWidthMm != null ? [['ความกว้างคาน', `${f(m.beamWidthMm)} mm`] as [string, string]] : []),
    ...(side ? [['ระดับฐานแบบข้าง / ความสูงเท', `${level(side.baseElevationMm ?? 0)} m · เท ${f(side.pourHeadMm)} mm`] as [string, string]] : []),
    ...(leg ? [['ระดับพื้นรองรับ / หัวค้ำยัน / ท้องคอนกรีต', `${level(leg.groundElevationMm)} / ${level(leg.headBearingElevationMm)} / ${leg.soffitElevationMm == null ? 'ไม่ระบุ' : level(leg.soffitElevationMm)} m`] as [string, string]] : []),
    ['หน่วยน้ำหนักคอนกรีต', `${f(m.gammaKNm3, 2)} kN/m³`],
    ['น้ำหนักเพิ่ม / น้ำหนักจรระหว่างก่อสร้าง', soffit || m.additionalDeadKPa != null || m.constructionLiveKPa != null
      ? `${f(m.additionalDeadKPa, 2)} / ${f(m.constructionLiveKPa, 2)} kPa` : 'ไม่ใช้กับระบบนี้ (แบบข้างรับแรงดันด้านข้างเท่านั้น)'],
    ['แหล่งข้อมูล / เกณฑ์ออกแบบ', `${m.sourceRef ?? 'ไม่ระบุ'} · ${m.designBasisRef ?? 'ไม่ระบุ'}`],
    ['ตรวจข้อมูลโดยผู้ใช้', m.humanInputReviewed ? 'ยืนยันแล้ว' : 'ยังไม่ยืนยัน'],
  ] : [
    ...(side?.faces ?? []).flatMap(face => [
      [`${face.faceId} · ไม้อัด / คร่าว`, `${f(face.plywood.thicknessMm)} mm · ${memberName(face.stud)} · ${face.studPositionsMm.length} ตัว ${spacing(face.studPositionsMm)}`] as [string, string],
      [`${face.faceId} · คานรัด`, `${memberName(face.rail)} · ${face.walers.length} ระดับ: ${face.walers.map(w => `${w.id} ${level((side!.baseElevationMm ?? 0) + w.zMm)}`).join(', ')}`] as [string, string],
    ]),
    ...(side ? [['Tie', side.ties.length ? `${side.ties.length} ชุด · Ø${f(side.ties[0].diameterMm)} mm` : 'ไม่มี Tie (ระบบนี้ไม่ใช้ Tie ทะลุ)'] as [string, string]] : []),
    ...(soffit ? [
      ['ไม้อัดท้อง', soffit.plywood ? `${f(soffit.plywood.thicknessMm)} mm · แนวเสี้ยน ${soffit.plywood.grainAxis}` : 'ไม่ระบุ'] as [string, string],
      ['คร่าวท้อง', `${memberName(soffit.joist)} · ${soffit.joistXMm.length} ตัว ${spacing(soffit.joistXMm)} (แนว X)`] as [string, string],
      ['คานรับท้อง', `${memberName(soffit.bearer)} · ${soffit.bearers.length} แนว ${spacing(soffit.bearers.map(b => b.yMm))} (แนว Y)`] as [string, string],
    ] : []),
    ...(m.ringlock ? [['ระบบค้ำยัน', `${m.ringlock.manufacturer ?? 'ไม่ระบุ'} ${m.ringlock.systemId ?? ''} · ${m.ringlock.legs.length} ต้น · ช่วง ${f(m.ringlock.bayXMm)} × ${f(m.ringlock.bayYMm)} mm`] as [string, string]] : []),
    ...(leg ? [['หัว / ฐานแม่แรง (ต้นแรก)', `ยืด ${f(leg.headJack.extensionMm)} / ${f(leg.baseJack.extensionMm)} mm · ฝัง ${f(leg.headJack.engagementMm)} / ${f(leg.baseJack.engagementMm)} mm`] as [string, string]] : []),
    ...(m.frameLayout ? [['เฟรม 3D (ค้ำ/ขา)', `${m.frameLayout.nodes.length} จุด · ${m.frameLayout.elements.length} ชิ้น`] as [string, string]] : []),
  ];
  if (mode === 'layout' && !rows.length) rows.push(['การจัดวาง', 'ร่าง v0.7 นี้ยังไม่มีข้อมูลการจัดวาง']);
  return <section className="card v07-summary" aria-label="ข้อมูลจากร่าง Workflow v0.7">
    <div className="card-title"><h3>ข้อมูลจากร่าง Workflow v0.7 · Rev {m.revisionId}</h3>{onOpen && <button className="btn secondary" onClick={onOpen}>แก้ในโหมดละเอียด</button>}</div>
    <p className="muted">ร่างนี้ใช้กับรายการคำนวณ แบบติดตั้งละเอียด และรายงาน v0.7 แสดงแบบอ่านอย่างเดียว ค่าที่แก้ในหน้านี้ใช้กับการคำนวณภาคปฏิบัติและแบบก่อสร้างชุดที่ 1</p>
    {compare.length > 0 && <table><thead><tr><th>มิติ</th><th>หน้านี้</th><th>ร่าง v0.7</th><th>สถานะ</th></tr></thead><tbody>{compare.map(c => {
      const both = c.page != null && c.draft != null, ok = both && Math.abs(c.page! - c.draft!) <= 0.5;
      const status = c.page == null && c.draft == null ? 'ไม่มีทั้งสองฝั่ง' : !both ? 'มีข้อมูลฝั่งเดียว' : ok ? 'ตรงกัน' : 'ไม่ตรงกัน';
      return <tr key={c.label}><td>{c.label}</td><td>{f(c.page)}</td><td>{f(c.draft)}</td><td className={ok || !both ? 'pass' : 'warn'}>{status}</td></tr>;
    })}</tbody></table>}
    {mismatched.length > 0 && <div className="warning">มิติไม่ตรงกับร่าง v0.7: {mismatched.map(c => c.label).join(', ')} · ตรวจให้ตรงกันก่อนส่งงาน (ระบบไม่แก้ให้อัตโนมัติ)</div>}
    <table><tbody>{rows.map(([k, v]) => <tr key={k}><th>{k}</th><td>{v}</td></tr>)}</tbody></table>
  </section>;
}
