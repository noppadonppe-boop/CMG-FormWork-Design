import React from 'react';
import type {WorkflowModel, previewWorkflow} from '../domain/workflowV07/model';
import {ElasticBindingSummary} from './ElasticBinding';
import {SoffitPlywoodResults} from './SoffitPlywoodResults';

type Preview = ReturnType<typeof previewWorkflow>;
const show = (n: number | null) => n === null ? 'UNKNOWN' : n.toLocaleString('en-US', {maximumFractionDigits: 4});
export function SoffitResults({model, preview}: {model: WorkflowModel; preview: Preview}) {
  const path = preview.loadPath, soffit = preview.soffit;
  if (!model.soffitLayout) return null;
  const coords = model.members.flatMap(m => [m.placement.origin, {...m.placement.origin,
    [m.placement.axis === 'X' ? 'xMm' : 'yMm']: (m.placement.axis === 'X' ? m.placement.origin.xMm : m.placement.origin.yMm) + m.beam.lengthMm}]);
  const x0 = Math.min(...model.vertices.map(p => p.x), ...coords.map(p => p.xMm)), y0 = Math.min(...model.vertices.map(p => p.y), ...coords.map(p => p.yMm));
  const dx = Math.max(...model.vertices.map(p => p.x), ...coords.map(p => p.xMm)) - x0, dy = Math.max(...model.vertices.map(p => p.y), ...coords.map(p => p.yMm)) - y0;
  const scale = 450 / Math.max(1, dx, dy), x = (v: number) => 40 + (v - x0) * scale, y = (v: number) => 40 + (v - y0) * scale;
  return <section aria-label="ตำแหน่งจริงและแรงราย U-head"><h3>แปลนวิเคราะห์แรงแบบท้อง · DRAFT / NO_GO</h3>
    <SoffitPlywoodResults model={model} preview={preview}/>
    {model.soffitLayout.joist.binding && <ElasticBindingSummary binding={model.soffitLayout.joist.binding} role="JOIST" label="SOFFIT:JOIST"/>}
    {model.soffitLayout.bearer.binding && <ElasticBindingSummary binding={model.soffitLayout.bearer.binding} role="BEARER" label="SOFFIT:BEARER"/>}
    {soffit && <p>E/I ที่วิเคราะห์ · คร่าว {show(soffit.elasticInputs.joist.E_MPa)} MPa / {show(soffit.elasticInputs.joist.I_mm4)} mm⁴ · คานรับ {show(soffit.elasticInputs.bearer.E_MPa)} MPa / {show(soffit.elasticInputs.bearer.I_mm4)} mm⁴</p>}
    {!path && <p role="status">BLOCKED · ตำแหน่งหรือโหลดต้องวิเคราะห์ใหม่ ยังไม่มีแรงรายจุดที่ใช้ได้</p>}
    <svg viewBox="0 0 560 560" role="img" aria-label="คร่าว คานรับ และ U-head ตามพิกัดวิเคราะห์จริง">
      <polygon points={model.vertices.map(p => `${x(p.x)},${y(p.y)}`).join(' ')} fill="#f1f5f9" stroke="#64748b"/>
      {soffit?.spatialLoading?.regions.map(r => <rect key={r.id} x={x(Math.min(...model.vertices.map(p => p.x)) + r.x0!)} y={y(Math.min(...model.vertices.map(p => p.y)) + r.y0!)} width={(r.x1! - r.x0!) * scale} height={(r.y1! - r.y0!) * scale} fill={r.kind === 'CONCRETE' ? '#d97706' : '#0f766e'} fillOpacity=".16" stroke="#d97706" strokeDasharray="4 3"><title>{`${r.id} · ${r.kind} · ${show(r.appliedQKPa)} kPa`}</title></rect>)}
      {model.members.map(m => {const p = m.placement.origin, endX = p.xMm + (m.placement.axis === 'X' ? m.beam.lengthMm : 0), endY = p.yMm + (m.placement.axis === 'Y' ? m.beam.lengthMm : 0);
        return <g key={m.beam.id}><line x1={x(p.xMm)} y1={y(p.yMm)} x2={x(endX)} y2={y(endY)} stroke={m.role === 'JOIST' ? '#94a3b8' : '#173e62'} strokeWidth={m.role === 'JOIST' ? 2 : 4}/><text x={x(p.xMm) + 4} y={y(p.yMm) - 8} fontSize="9">{m.beam.id}</text></g>;})}
      {model.ringlock?.legs.map(l => <g key={l.id}><circle cx={x(l.xMm)} cy={y(l.yMm)} r="5" fill="#b17a28"/><text x={x(l.xMm) + 7} y={y(l.yMm) + 14} fontSize="8">{l.headNodeId}</text></g>)}
      {soffit?.spatialLoading?.memberActions.map(a => <g key={a.definition.id}><circle cx={x(a.point.xMm)} cy={y(a.point.yMm)} r="6" fill="#b91c1c"/><text x={x(a.point.xMm) + 8} y={y(a.point.yMm) - 6} fontSize="8">{a.definition.id} · {a.definition.shape === 'POINT' ? 'จุดแรง' : 'ศูนย์กลางโหลดเส้น'}</text></g>)}
      <text x="15" y="525" fontSize="10">XY mm · วิเคราะห์คร่าว Y / คานรับ X · NTS</text><text x="15" y="545" fontSize="10">ระนาบวิเคราะห์ร่วม · รอตรวจระดับติดตั้ง/จุดสัมผัส/ค้ำยัน</text>
    </svg>
    {soffit && <><p>โหลดรวม {show(soffit.expectedForceN / 1000)} kN · แรงที่หัวรองรับรวม {show(soffit.terminalForceN === null ? null : soffit.terminalForceN / 1000)} kN</p>
      <p>เศษสมดุลแรง {show(soffit.forceResidualN)} N · เศษสมดุล ΣF·X / ΣF·Y {show(soffit.momentResidual?.xLeverNmm ?? null)} / {show(soffit.momentResidual?.yLeverNmm ?? null)} N·mm</p>
      <table><thead><tr><th>โหลดที่เป็นเจ้าของ</th><th>kN</th></tr></thead><tbody>
        <tr><td>คอนกรีต</td><td>{show(soffit.ownedForceN.concrete / 1000)}</td></tr><tr><td>DL เพิ่มเติม</td><td>{show(soffit.ownedForceN.additionalDead / 1000)}</td></tr>
        <tr><td>LL ก่อสร้าง</td><td>{show(soffit.ownedForceN.constructionLive / 1000)}</td></tr><tr><td>น้ำหนักโครงและไม้อัดที่เพิ่มแยก</td><td>{show(soffit.ownedForceN.componentSelfWeight / 1000)}</td></tr>
        <tr><td>Placement / Other ตามพิกัด (DL/LL/น้ำหนักตัวเองรวมตามหมวดข้างบน)</td><td>{show(soffit.additionalForceN / 1000)}</td></tr>
      </tbody></table></>}
    {soffit?.spatialLoading && <section aria-label="พื้นที่และโหลดเฉพาะของ Stage"><h4>แผนลงโหลดจริงของ Stage</h4><p>ที่มา: {soffit.spatialLoading.scopeEvidenceRef} · พื้นที่เว้นออก: {soffit.spatialLoading.omittedAreasEvidenceRef}</p>
      <table><thead><tr><th>พื้นที่ / หมวด / เจ้าของ</th><th>X0–X1 / Y0–Y1 · mm</th><th>ความลึกที่ลง · mm</th><th>q ที่ใช้ในกรณีนี้ · kPa</th><th>แรงรวม · kN</th><th>หลักฐาน</th></tr></thead><tbody>{soffit.spatialLoading.regions.map(r => <tr key={r.id}><td>{r.id} / {r.kind} / {r.ownershipId}</td><td>{show(r.x0)}–{show(r.x1)} / {show(r.y0)}–{show(r.y1)}</td><td>{r.kind === 'CONCRETE' ? show(r.placedDepthMm) : 'ไม่ใช้'}</td><td>{show(r.appliedQKPa)}</td><td>{show(r.forceN / 1000)}</td><td>{r.evidenceRef}</td></tr>)}</tbody></table>
      <table><thead><tr><th>โหลดลงสมาชิก / หมวด / เจ้าของ</th><th>สมาชิก / รูปแบบ / ช่วงตามแกน · mm</th><th>แรงรวม · kN / โหลดเส้น · N/mm</th><th>X / Y / Z ของแรงลัพธ์ · mm</th><th>หลักฐาน</th></tr></thead><tbody>{soffit.spatialLoading.memberActions.map(a => <tr key={a.definition.id}><td>{a.definition.id} / {a.definition.kind} / {a.definition.ownershipId}</td><td>{a.definition.targetMemberId} / {a.definition.shape} / {show(a.definition.startMm)}{a.definition.shape === 'LINE' ? `–${show(a.definition.endMm)}` : ''}</td><td>{show(a.appliedForceN / 1000)} / {a.definition.shape === 'LINE' ? show(a.appliedLineNPerMm) : 'ไม่ใช้'}</td><td>{show(a.point.xMm)} / {show(a.point.yMm)} / {show(a.point.zMm)}</td><td>{a.definition.evidenceRef}</td></tr>)}</tbody></table>
      <p>พื้นที่คอนกรีต/DL/LL แทนโหลดเต็มแถบ การระบุไม่ครบไม่ถูกเติมให้เอง โหลดจุด/เส้นในตารางรับโดยสมาชิกที่เลือกโดยตรง ต้องตรวจหน้าสัมผัสและกำลังเฉพาะที่แยก</p>
    </section>}
    {!!path?.reactions.length && <table><thead><tr><th>U-head / ต้นทาง</th><th>X / Y / Z (mm)</th><th>N (kN)</th><th>M (N·mm)</th></tr></thead><tbody>
      {path.reactions.map(r => <tr key={r.nodeId}><td>{r.nodeId} / {r.upstreamAnalysisId}</td><td>{show(r.point.xMm)} / {show(r.point.yMm)} / {show(r.point.zMm)}</td><td>{show(r.forceN / 1000)}</td><td>{show(r.momentNmm)}</td></tr>)}
    </tbody></table>}
    <p>แรงแต่ละหัวใช้ตำแหน่งจริงและความต่อเนื่องของสมาชิก ยังต้องตรวจ U-head → Ringlock → Jack Base → พื้นรองรับ</p>
  </section>;
}
