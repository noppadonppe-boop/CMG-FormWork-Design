import React from 'react';
import type {WorkflowModel, previewWorkflow} from '../domain/workflowV07/model';

const show = (n: number | null | undefined) => n == null ? 'UNKNOWN' : n.toLocaleString('en-US', {maximumSignificantDigits: 8});
const vector = (v: (number | null)[] | null | undefined) => v ? v.map(show).join(', ') : 'UNKNOWN';
export function SupportResults({model, preview}: {model: WorkflowModel; preview: ReturnType<typeof previewWorkflow>}) {
  const result = preview.supports; if (!result) return null;
  return <section aria-label="แรงฐานและผิวสัมผัสรองรับจากฉบับร่าง"><h3>แรงรายฐาน → ผิวสัมผัส → พื้นรองรับ</h3>
    <p>{result.status} / NO_GO · Revision {model.revisionId} · {result.stageId} / {result.loadCaseId}</p>
    <p>แรงมีเครื่องหมายในแกน Global X,Y,Z: F หน่วย N และ M หน่วย N·mm พิกัดหน่วย mm เปลี่ยนจุดอ้างอิงด้วย M₂ = M₁ + (r₁ − r₂) × F</p>
    <p>ความดันเป็นผลตามสมมติฐานผิวแข็งเกร็งแนวราบและ p = max(0,a+bx+cy) เท่านั้น ต้องตรวจความแข็งแผ่น/ไม้ กำลังดิน การทรุดตัว และพื้นตามอายุจริง แรงเสียดทาน แรงบิด และแรงยกยังไม่ตรวจ การทรุดตัวไม่ย้อนกลับเข้าเฟรม</p>
    <p>ขอบเขตแรงครบทุกจุดยึดเฟรม: {result.completeTerminalWrenchCoverage ? 'ถ่ายแรงครบตามข้อมูลที่ระบุ · ยังไม่ผ่านกำลัง' : 'ยังมีทางถ่ายแรงหรือข้อมูลขาด'}</p>
    {!!result.unmappedRestraints.length && <table><caption>จุดยึดเฟรมที่ยังไม่มีทางรองรับครบ (รวมแรงศูนย์)</caption><thead><tr><th>จุด</th><th>พิกัด</th><th>F</th><th>M</th></tr></thead><tbody>{result.unmappedRestraints.map(n => <tr key={n.frameNodeId}><td>{n.frameNodeId}</td><td>{vector(n.pointMm)}</td><td>{vector(n.frameToSupportForceN)}</td><td>{vector(n.frameToSupportMomentNmm)}</td></tr>)}</tbody></table>}
    {result.rows.map(b => <details key={b.id}><summary>{b.id} ← {b.frameNodeId} · {b.definition.path ?? 'UNKNOWN'} · {b.definition.supportKind ?? 'UNKNOWN'} · {b.status}</summary>
      <p>แรงเฟรมลงฐาน ณ [{vector(b.sourceFrameToSupport?.pointMm)}]: F [{vector(b.sourceFrameToSupport?.forceN)}] · M [{vector(b.sourceFrameToSupport?.momentNmm)}]</p>
      <p>Datum: {b.definition.datum ?? 'UNKNOWN'} · {b.definition.datumEvidenceRef || 'UNKNOWN'} · รองรับ: {b.definition.supportEvidenceRef || 'UNKNOWN'} · ความหนา Sole board {show(b.definition.soleBoardThicknessMm)} mm</p>
      {b.contacts.map(c => {const q = c.contact?.result, d = c.definition; return <article key={c.id} aria-label={`ผลผิวสัมผัส ${b.id}/${c.id}`}><h4>{c.id} · {c.role} · {c.status}</h4>
        <p>ศูนย์ [{vector(d.centerMm)}] · พื้นที่จริง {show(d.lengthXMm)} × {show(d.widthYMm)} mm · แกน X [{vector(d.localX)}], Y [{vector(d.localY)}] · {d.geometryEvidenceRef || 'UNKNOWN'}</p>
        <p>แรง ณ ผิว: F [{vector(c.wrench?.forceN)}] · M [{vector(c.wrench?.momentNmm)}] · {c.completeWrench ? 'แรงครบตามขอบเขตที่ระบุ' : 'แรงรวมยังไม่ครบ ห้ามใช้เป็นแรงออกแบบ'}</p>
        <p>Self-weight: {d.weight.mode ?? 'UNKNOWN'} · {d.weight.ownershipId || 'UNKNOWN'} · ดิบ {show(d.weight.rawForceN)} N · เพิ่มหลัง coefficient {show(c.selfWeightAddedN)} N ณ [{vector(c.selfWeightPointMm)}] · {d.weight.evidenceRef || 'UNKNOWN'}</p>
        <p>กฎสัมผัส: {d.model ?? 'UNKNOWN'} · {d.modelEvidenceRef || 'UNKNOWN'}</p>
        {q ? <><p>{q.contact} · q สูงสุด {show(q.pressureMaxMPa * 1000)} kPa ({show(q.pressureMaxMPa)} MPa) · q ต่ำสุด {show(q.pressureMinMPa * 1000)} kPa · พื้นที่รับอัด {show(q.contactAreaMm2)} mm² ({show(q.areaFraction * 100)}%)</p>
          <p>e ในแกนสัมผัส: [{show(q.eccentricityMm?.x)}, {show(q.eccentricityMm?.y)}] mm · a,b,c [{vector(q.coefficientsMPa)}] หน่วย MPa, MPa/mm, MPa/mm</p>
          <svg viewBox="-110 -110 220 240" width="220" role="img" aria-label={`พื้นที่รับอัดตามสมมติฐาน ${b.id}/${c.id}`}><rect x="-100" y="-100" width="200" height="200" fill="#eef3f7" stroke="#173e62"/>
            <polygon points={q.compressedPolygon.map(p => `${p.xMm / d.lengthXMm! * 200},${-p.yMm / d.widthYMm! * 200}`).join(' ')} fill="#b17a28" opacity="0.6"/>
            <text x="-100" y="120" fontSize="10">Local X → / Y ↑ · DRAFT / NO_GO · NTS</text></svg>
          <p>Residual สัมผัส: N {show(q.equilibrium.forceResidualN)} · Mx {show(q.equilibrium.loadMxResidualNmm)} · My {show(q.equilibrium.loadMyResidualNmm)}</p></> : <p>ความดันสัมผัส UNKNOWN · {c.contact?.reason ?? 'ข้อมูลแรง/ขนาด/สมมติฐานยังไม่ครบ'}</p>}
        <p>ขีดจำกัดที่ระบุ {d.declaredPressureLimitMPa === null ? 'UNKNOWN' : show(d.declaredPressureLimitMPa * 1000)} kPa · {d.resistanceBasis ?? 'UNKNOWN'} · {d.limitEvidenceRef || 'UNKNOWN'} · {c.declaredLimitExceeded ? 'FAIL ตามขีดจำกัดและฐานค่าที่ระบุ' : 'ยังไม่อนุมัติกำลัง'}</p>
        <p>ความต้องการ H/N {show(c.requiredFrictionRatio)} · Mz {show(c.wrench?.momentNmm[2])} N·mm · ยังไม่มีวิธีต้านการเลื่อน/บิด/ยกที่ตรวจครบ</p>
        <p>k ดิน {show(d.soilSpringNPerMm3)} N/mm³ · {d.soilSpringEvidenceRef || 'UNKNOWN'}</p>
        {c.settlement ? <p>การเคลื่อนตัวตามกฎสปริงดินที่ระบุ: ศูนย์ {show(c.settlement.centerMm)} mm · ความลาด X/Y {show(c.settlement.slopeX)} / {show(c.settlement.slopeY)} mm/mm · ลงมากสุด {show(c.settlement.maximumDownwardMm)} mm · ช่องยกมากสุด {show(c.settlement.maximumUpwardGapMm)} mm · ยังไม่มีเกณฑ์ยอมรับ/ผลย้อนกลับเข้าเฟรม</p> : <p>การทรุดตัว UNKNOWN · ไม่แทนค่าด้วยศูนย์</p>}
        <ul>{c.issues.map((s, i) => <li key={i}>{s}</li>)}</ul>
      </article>;})}
      <p>แรงปลายทาง: F [{vector(b.terminalWrench?.forceN)}] · M [{vector(b.terminalWrench?.momentNmm)}] ณ [{vector(b.terminalWrench?.pointMm)}]</p>
      <p>Residual ถ่ายแรงรายฐาน: F [{vector(b.equilibrium?.forceResidualN)}] · M [{vector(b.equilibrium?.momentResidualNmm)}]</p>
      <ul>{b.issues.map((s, i) => <li key={i}>{s}</li>)}</ul>
    </details>)}
    <ul>{result.blockers.map(s => <li key={s}>{s}</li>)}</ul>
  </section>;
}
