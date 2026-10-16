import React from 'react';
import type {WorkflowModel, previewWorkflow} from '../domain/workflowV07/model';
import {PlywoodBindingSummary} from './PlywoodBinding';
const show = (v: number | null) => v === null ? 'UNKNOWN' : v.toLocaleString('en-US', {maximumFractionDigits: 5});
export function SoffitPlywoodResults({model, preview}: {model: WorkflowModel; preview: ReturnType<typeof previewWorkflow>}) {
  const p = model.soffitLayout?.plywood; if (!p) return null;
  const deck = preview.soffit?.plywood;
  return <section aria-label="ผลไม้อัดท้องและการส่งแรงเข้าคร่าว"><h3>ไม้อัดท้อง · แถบช่วงเดียว / DRAFT / NO_GO</h3>
    <p>หนาจริง {show(p.thicknessMm)} mm · เสี้ยน {p.grainAxis ?? 'UNKNOWN'} · Y {show(p.startYMm)} ถึง {show(p.endYMm)} mm จากมุมต่ำสุดคอนกรีต</p>
    <p>น้ำหนักที่ระบุ {show(p.selfWeightKPa)} kPa · {p.selfWeightOwnership ?? 'UNKNOWN'} · หลักฐาน {p.selfWeightEvidenceRef || 'UNKNOWN'}</p>
    {p.binding && <PlywoodBindingSummary binding={p.binding} thicknessMm={p.thicknessMm} grainRelativeDeg={p.grainAxis === null ? null : p.grainAxis === 'X' ? 0 : 90} label="SOFFIT:PLYWOOD"/>}
    {!deck ? <p role="status">BLOCKED · ยังไม่มีผลแถบไม้อัดและแรงส่งต่อที่ใช้ได้</p> : <>
      <p>Revision {deck.revisionId} · Stage {deck.stageId} · Case {deck.loadCaseId} · E {show(deck.elastic.E_MPa)} MPa / I {show(deck.elastic.I_mm4)} mm⁴ ต่อแถบ 1 m</p>
      <p>แรงที่ถ่ายผ่านแผ่น {show(deck.expectedForceN / 1000)} kN · น้ำหนักไม้อัดที่ระบุ/เพิ่มจริง {show(deck.selfWeight.declaredForceN / 1000)} / {show(deck.selfWeight.additionalForceN / 1000)} kN · {deck.selfWeight.ownership}</p>
      <p>เศษสมดุล F {show(deck.residuals.forceN)} N · ΣF·X / ΣF·Y {show(deck.residuals.xLeverNmm)} / {show(deck.residuals.yLeverNmm)} N·mm</p>
      {(() => {
        const x0 = Math.min(...deck.strips.map(s => s.startXMm)), x1 = Math.max(...deck.strips.map(s => s.endXMm));
        const y0 = Math.min(...deck.strips.map(s => s.startYMm)), y1 = Math.max(...deck.strips.map(s => s.endYMm));
        const scale = 360 / Math.max(1, x1 - x0, y1 - y0), maxQ = Math.max(1, ...deck.strips.map(s => s.qKPa));
        return <svg viewBox="0 0 460 440" role="img" aria-label="โซนแถบไม้อัดตามขอบโหลดจริง">
          {deck.strips.map(s => <g key={s.id}><rect x={45 + (s.startXMm - x0) * scale} y={35 + (s.startYMm - y0) * scale} width={(s.endXMm - s.startXMm) * scale} height={(s.endYMm - s.startYMm) * scale} fill="#f1f5f9" stroke="#173e62" strokeWidth="1"/>{s.spatialPatches.map(a => <rect key={a.id} x={45 + (a.startXMm - x0) * scale} y={35 + (s.startYMm - y0) * scale} width={(a.endXMm - a.startXMm) * scale} height={(s.endYMm - s.startYMm) * scale} fill="#b17a28" fillOpacity={Math.min(.8, .15 + .65 * a.qKPa / maxQ)}><title>{`${a.id} · ${show(a.qKPa)} kPa`}</title></rect>)}</g>)}
          <text x="15" y="397" fontSize="11">เสี้ยน {p.grainAxis} · X/Y เป็นระยะจากมุมต่ำสุดคอนกรีต · mm</text>
          <text x="15" y="420" fontSize="11">ขอบแต่ละโซนเป็นขอบโหลดวิเคราะห์ · NTS / DRAFT / NO_GO</text>
        </svg>;
      })()}
      <p>วิเคราะห์แยกตามช่วงคร่าว X และขอบเขตโหลด Y โดยเก็บขอบ Patch ตาม X จริง แรงปฏิกิริยาแถบ 1 m ถูกแปลงเป็นโหลดเส้นเข้าคร่าวในช่วง Y จริง ค่า q ในตารางเป็นค่าเฉลี่ยเพื่อแสดงภาพเท่านั้น การวิเคราะห์ใช้ Patch ของแต่ละแหล่งโดยตรง</p>
      <table><thead><tr><th>แถบจริง / โซน</th><th>X เริ่ม/จบ · mm</th><th>Y เริ่ม/จบ · mm</th><th>q เฉลี่ยแสดงภาพ · kPa / Patch จริง</th><th>M · N·mm/m</th><th>V · N/m</th><th>δ · mm</th><th>หน่วยแรงดัดที่ต้องรับ · MPa</th></tr></thead><tbody>{deck.strips.map(s => <tr key={s.id}><td>{s.id}</td><td>{show(s.startXMm)} / {show(s.endXMm)}</td><td>{show(s.startYMm)} / {show(s.endYMm)}</td><td>{show(s.qKPa)} / {s.spatialPatches.map(a => `${a.id}: X ${show(a.startXMm)}–${show(a.endXMm)} mm / ${show(a.qKPa)} kPa`).join('; ') || 'ไม่มีโหลดที่ระบุในโซนนี้'}</td><td>{show(s.analysis.maxMomentNmm)}</td><td>{show(s.analysis.maxShearN)}</td><td>{show(s.analysis.maxDeflectionMm)}</td><td>{show(s.stressDemandMPa)}</td></tr>)}</tbody></table>
      <details><summary>แรงส่งต่อรายแถบ → คร่าว ({deck.transfers.length})</summary><table><thead><tr><th>แถบต้นทาง / Revision</th><th>คร่าวปลายทาง</th><th>X / Y เริ่ม–จบ · mm</th><th>โหลดเส้น · N/mm</th></tr></thead><tbody>{deck.transfers.map((t, i) => <tr key={i}><td>{t.sourceStripId} / {t.upstreamRevision}</td><td>{t.targetJoistId}</td><td>{show(t.xMm)} / {show(t.startYMm)}–{show(t.endYMm)}</td><td>{show(t.lineLoadNPerMm)}</td></tr>)}</tbody></table></details>
    </>}
    <p>ผลแถบนี้ยังไม่ตรวจกำลังผลิตภัณฑ์ rolling shear การยึดแผ่น รองรับขอบ หรือแผ่นสองทาง ไม่มีการใช้ค่า characteristic เป็น allowable โดยอัตโนมัติ</p>
  </section>;
}
