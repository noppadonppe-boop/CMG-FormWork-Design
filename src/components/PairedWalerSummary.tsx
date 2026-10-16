import React from 'react';
import type {IndependentWalerPair} from '../domain/workflowV07/walerPair';
import {ElasticBindingSummary} from './ElasticBinding';
const show = (v: number | null) => v === null ? 'UNKNOWN' : v.toLocaleString('en-US', {maximumFractionDigits: 5});
export function PairedWalerSummary({id, pair}: {id: string; pair: IndependentWalerPair}) {
  return <details aria-label={`ข้อมูลคานรัดคู่ที่นำไปใช้ ${id}`}><summary>{id} · 2 รางแยก · Noncomposite / NO_GO</summary>
    <p>ช่องใส {show(pair.clearGapMm)} mm · ทิศแยกราง {pair.separationAxis ?? 'UNKNOWN'} · หลักฐาน {pair.geometryEvidenceRef || 'UNKNOWN'}</p>
    <p>ส่วนแบ่งราง 1 {show(pair.rail1Share)} / ราง 2 {show(pair.rail1Share === null ? null : 1 - pair.rail1Share)} · สมมติฐาน: {pair.sharingEvidenceRef || 'UNKNOWN'}</p>
    {pair.rails.map(r => r.binding && <ElasticBindingSummary key={r.id} binding={r.binding} role="WALER" label={`${id}:${r.id}`}/>)}
    <table><thead><tr><th>ราง / หน้าตัด</th><th>E · MPa</th><th>I แกนที่ใช้ · mm⁴</th><th>การวาง · องศา</th><th>หลักฐานหน้าตัด / วัสดุ / แกน</th><th>ความต่อเนื่อง / รอยต่อ x · mm</th></tr></thead><tbody>{pair.rails.map(r => <tr key={r.id}><td>{r.id} / {r.binding ? 'ตามข้อมูลผูก' : r.family ?? 'UNKNOWN'}</td><td>{r.binding ? 'ใช้จากการผูก' : show(r.E_MPa)}</td><td>{r.binding ? 'ใช้จากการผูก' : show(r.bendingI_mm4)}</td><td>{r.binding ? 'ใช้จากการผูก' : show(r.orientationDeg)}</td><td>{r.binding ? 'ดูแหล่งคุณสมบัติสมาชิกด้านบน' : `${r.sectionRef || 'UNKNOWN'} / ${r.materialRef || 'UNKNOWN'} / ${r.axisEvidenceRef || 'UNKNOWN'}`}</td><td>{r.continuity ?? 'UNKNOWN'} / {r.spliceStationsMm.length ? r.spliceStationsMm.map(show).join(', ') : 'ไม่มีตำแหน่งที่ระบุ'} · {r.spliceEvidenceRef || 'UNKNOWN'}</td></tr>)}</tbody></table>
    {!!pair.supportFittings.length && <table><thead><tr><th>จุด / หลักฐานแผ่น</th><th>กว้างข้ามราง / หนา · mm</th><th>รูใส / ช่องเผื่อต่อข้าง · mm</th><th>หลักฐานสัมผัส</th></tr></thead><tbody>{pair.supportFittings.map(f => <tr key={f.supportId}><td>{f.supportId} / {f.plateRef || 'UNKNOWN'}</td><td>{show(f.plateWidthAcrossRailsMm)} / {show(f.plateThicknessMm)}</td><td>{show(f.clearHoleDiameterMm)} / {show(f.requiredRadialClearanceMm)}</td><td>{f.contactEvidenceRef || 'UNKNOWN'}</td></tr>)}</tbody></table>}
    <p>แนวแรงและจุดรองรับคู่รางยังเป็นแบบจำลองอุดมคติ ต้องตรวจระยะเยื้อง ศูนย์สัมผัส แผ่นประกับ การบิด รอยต่อ และกำลังเพิ่มเติมก่อนใช้ติดตั้ง</p>
  </details>;
}
