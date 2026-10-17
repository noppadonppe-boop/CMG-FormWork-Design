import React from 'react';
import type {WorkflowModel, previewWorkflow} from '../domain/workflowV07/model';
import {PairedWalerSummary} from './PairedWalerSummary';
import {ElasticBindingSummary} from './ElasticBinding';
import {PlywoodBindingSummary} from './PlywoodBinding';
import {TieDossierResults} from './TieDossier';
import {beamStationLabel} from './beamTrace';
import {sideLocalKindNames} from './SideLocalEvidenceEditor';

type Preview = ReturnType<typeof previewWorkflow>;
const show = (n: number | null | undefined) => n == null ? 'UNKNOWN' : n.toLocaleString('en-US', {maximumFractionDigits: 4});
export function SideResults({model, preview}: {model: WorkflowModel; preview: Preview}) {
  if (!model.sideLayout) return null;
  const side = preview.side;
  const pairInputs = (Array.isArray(model.sideLayout.faces) ? model.sideLayout.faces : []).flatMap(f => (Array.isArray(f.walers) ? f.walers : []).filter(w => !!w.pair).map(w => <PairedWalerSummary key={`${f.faceId}/${w.id}`} id={`${f.faceId}/${w.id}`} pair={w.pair!}/>));
  const memberBindings = (Array.isArray(model.sideLayout.faces) ? model.sideLayout.faces : []).flatMap(f => [f.stud?.binding && <ElasticBindingSummary key={`${f.faceId}/STUD`} binding={f.stud.binding} role="STUD" label={`${f.faceId}:STUD`}/>, f.rail?.binding && <ElasticBindingSummary key={`${f.faceId}/SHARED_RAIL`} binding={f.rail.binding} role="WALER" label={`${f.faceId}:SHARED_RAIL`}/>]);
  const plywoodBindings = (Array.isArray(model.sideLayout.faces) ? model.sideLayout.faces : []).map(f => f.plywood?.binding && <PlywoodBindingSummary key={f.faceId} binding={f.plywood.binding} thicknessMm={f.plywood.thicknessMm} grainRelativeDeg={f.plywood.grainAxis === null ? null : f.plywood.grainAxis === 'ALONG_FACE' ? 0 : 90} label={`${f.faceId}:PLYWOOD`}/>);
  if (!side) return <section aria-label="ข้อมูลแบบข้างที่ยังวิเคราะห์ไม่ได้"><p role="status">BLOCKED · ข้อมูลแบบข้างไม่ครบ เปลี่ยน หรือผลล้าสมัย ต้องตรวจแบบข้างและวิเคราะห์ร่างใหม่</p>{memberBindings}{plywoodBindings}{pairInputs}</section>;
  const vertices = preview.topology.vertices, x0 = Math.min(...vertices.map(p => p.x)), y0 = Math.min(...vertices.map(p => p.y));
  const span = Math.max(...vertices.map(p => p.x)) - x0, depth = Math.max(...vertices.map(p => p.y)) - y0, scale = 380 / Math.max(span, depth);
  const x = (v: number) => 60 + (v - x0) * scale, y = (v: number) => 50 + (v - y0) * scale;
  return <section aria-label="ผลแบบข้างจากผิวและจุดรองรับจริง"><h3>แบบข้าง · {model.analysisCase?.basis === 'FACTORED' ? 'แรงคูณสัมประสิทธิ์' : 'แรงบริการ'} / DRAFT / NO_GO</h3>
    <p>Revision {side.revisionId} · Stage {model.sideLayout.stageId} · Load case {model.sideLayout.loadCaseId} · ฐาน Z {show(model.sideLayout.baseElevationMm)} mm</p>
    {pairInputs}
    {memberBindings}
    {plywoodBindings}
    <svg viewBox="0 0 540 480" role="img" aria-label="แปลนฉายแนวไทร์จากจุดรองรับจริง">
      <polygon points={vertices.map(p => `${x(p.x)},${y(p.y)}`).join(' ')} fill="#f1f5f9" stroke="#64748b"/>
      {side.routes.map(t => <g key={t.id}><title>{`${t.id} · z ${t.zMm} mm เหนือฐานคอนกรีต`}</title><line x1={x(t.a.x)} y1={y(t.a.y)} x2={x(t.b.x)} y2={y(t.b.y)} stroke="#b17a28" strokeWidth="2"/><text x={x((t.a.x + t.b.x) / 2)} y={y((t.a.y + t.b.y) / 2)} fontSize="9">{t.id} / z {show(t.zMm)}</text></g>)}
      <text x="15" y="455" fontSize="10">แปลนฉายหลายระดับ · XY mm · NTS · ยังไม่ใช่แบบติดตั้ง</text>
    </svg>
    {side.faces.map(f => {
      const L = f.face.lengthMm, H = model.heightMm, s = 380 / Math.max(L, H), u = (v: number) => 50 + v * s, z = (v: number) => 430 - v * s;
      const nodes = side.nodes.filter(n => n.faceId === f.face.id);
      return <details key={f.face.id}><summary>{f.face.id} · แรงรวม {show(f.result.expectedForceN / 1000)} kN · แรงดันฐาน {f.result.pressureDeck && f.result.pressureBaseKPa === null ? 'แปรตามตำแหน่ง X' : `${show(f.result.pressureBaseKPa)} kPa`} · แรงดันสูงสุด {show(f.result.maximumPressureKPa)} kPa</summary>
        <svg viewBox="0 0 540 480" role="img" aria-label={`รูปด้านสมาชิกจริง ${f.face.id}`}>
          <rect x={u(0)} y={z(H)} width={L * s} height={H * s} fill="#f1f5f9" stroke="#64748b"/>
          {f.result.pressureDeck?.patches.map(p => <rect key={p.id} x={u(p.x0Mm)} y={z(p.z1Mm)} width={(p.x1Mm - p.x0Mm) * s} height={(p.z1Mm - p.z0Mm) * s} fill="#b17a28" fillOpacity=".17" stroke="#b17a28" strokeDasharray="3 3"><title>{`${p.id} · พื้นที่แรงดัน ${p.kind} · โปรไฟล์ ${show(p.p0KPa)}→${show(p.p1KPa)} kPa`}</title></rect>)}
          {f.input.studPositionsMm.map(v => <line key={v} x1={u(v)} y1={z(0)} x2={u(v)} y2={z(H)} stroke="#94a3b8" strokeWidth="2"/>)}
          {f.result.walers.map(w => <g key={w.zMm}><line x1={u(0)} y1={z(w.zMm) - 2} x2={u(L)} y2={z(w.zMm) - 2} stroke="#173e62" strokeWidth="2"/><line x1={u(0)} y1={z(w.zMm) + 2} x2={u(L)} y2={z(w.zMm) + 2} stroke="#173e62" strokeWidth="2"/></g>)}
          {nodes.map(n => <g key={n.id}><circle cx={u(n.localXMm)} cy={z(n.localZMm)} r="4" fill="#b17a28"/><text x={u(n.localXMm) + 5} y={z(n.localZMm) - 5} fontSize="8">{n.walerId}/{n.supportId}</text></g>)}
          <text x="15" y="465" fontSize="10">{f.face.id} · x จาก A→B / z เหนือฐานคอนกรีต · mm · DRAFT / NO_GO</text>
        </svg>
        {f.result.pressureDeck && <section aria-label={`แรงดันตามตำแหน่งผิว ${f.face.id}`}><h4>แรงดันเฉพาะผิวและผลแรงแต่ละแหล่ง</h4>
          <p>หลักฐาน: {f.input.pressure?.evidenceRef} · ช่วงผิวเว้นออก: {f.input.pressure?.omittedAreasEvidenceRef} · กรอบในรูปแสดงพื้นที่รับแรงดัน โปรไฟล์อยู่ในตาราง</p>
          <table><thead><tr><th>แหล่ง / หมวด / เจ้าของ</th><th>X เริ่ม–จบ / Z เริ่ม–จบ · mm</th><th>หัวจริง · mm</th><th>p ที่ใช้ต้น–ปลาย Z · kPa</th><th>แรงรวม · kN / ศูนย์แรง X,Z · mm</th><th>ที่มา / ฐานแปลง</th></tr></thead><tbody>{f.result.pressureDeck.patches.map(p => {const r = f.result.pressureDeck!.sourceResultants.find(r => r.sourceId === p.id)!, raw = f.input.pressure!.sources.find(s => s.id === p.id)!; return <tr key={p.id}><td>{p.id} / {p.kind} / {p.ownershipId}</td><td>{show(p.x0Mm)}–{show(p.x1Mm)} / {show(p.z0Mm)}–{show(p.z1Mm)}</td><td>{p.kind === 'HYDROSTATIC' ? show(raw.headMm) : 'ไม่ใช้'}</td><td>{show(p.p0KPa)}–{show(p.p1KPa)}</td><td>{show(r.forceN / 1000)} / {r.forceN === 0 ? 'ไม่กำหนดศูนย์แรงเมื่อแรงเป็นศูนย์' : `${show(r.centroidXMm)}, ${show(r.centroidZMm)}`}</td><td>{p.evidenceRef} / {p.mappingBasisRef || 'Hydrostatic ตาม γ และหัวที่ระบุ'}</td></tr>;})}</tbody></table>
          <p>แถบไม้อัดช่วงเดียวตรวจปลายระดับ Z ทั้งสองของแต่ละโซนแรงดันเชิงเส้น แล้วส่งแรงปฏิกิริยาแปรผันตาม Z เข้าคร่าวจริง ไม่เติมแรงดันจาก DL/LL แนวดิ่ง</p>
          <p>เศษสมดุลแผ่น→คร่าว F {show(f.result.pressureDeck.residuals.forceN)} N · ΣF·X / ΣF·Z {show(f.result.pressureDeck.residuals.xLeverNmm)} / {show(f.result.pressureDeck.residuals.zLeverNmm)} N·mm</p>
          <details><summary>แรงส่งต่อแถบไม้อัด→คร่าว ({f.result.pressureDeck.transfers.length})</summary><table><thead><tr><th>แถบต้นทาง / Revision</th><th>คร่าวจริง / X · mm</th><th>Z เริ่ม–จบ · mm</th><th>โหลดเส้นต้น–ปลาย · N/mm</th></tr></thead><tbody>{f.result.pressureDeck.transfers.map((t, i) => <tr key={i}><td>{t.sourceAnalysisIds.join(' / ')} / {t.upstreamRevision}</td><td>{t.targetStudId} / {show(t.xMm)}</td><td>{show(t.startZMm)}–{show(t.endZMm)}</td><td>{show(t.startNPerMm)}–{show(t.endNPerMm)}</td></tr>)}</tbody></table></details>
        </section>}
        <p>เศษสมดุล F {show(f.result.residuals.forceN)} N · ΣF·x {show(f.result.residuals.faceLeverNmm)} / ΣF·z {show(f.result.residuals.heightLeverNmm)} N·mm</p>
        <p>E/I คร่าวที่วิเคราะห์ {show(f.elasticInputs.stud.E_MPa)} MPa / {show(f.elasticInputs.stud.I_mm4)} mm⁴</p>
        <p>เส้นคู่ในรูปใช้สัญลักษณ์แทนแนวแรงคานรัด ยังไม่แสดงระยะช่องรางและผิวสัมผัสติดตั้งจริง</p>
        <table><thead><tr><th>ระดับ z · mm / รางจริง</th><th>E ที่วิเคราะห์ · MPa</th><th>I ที่วิเคราะห์ · mm⁴</th><th>ส่วนแบ่งแรงที่ระบุ</th></tr></thead><tbody>{f.result.walers.flatMap(w => w.railDefinitions.map((r, i) => <tr key={`${w.zMm}/${i}`}><td>{show(w.zMm)} / {r.id}</td><td>{show(r.E_MPa)}</td><td>{show(r.I_mm4)}</td><td>{show(r.share)}</td></tr>))}</tbody></table>
        <table><thead><tr><th>จุดรองรับ</th><th>X/Y/Z จริง · mm</th><th>แรงออกจากผิว · kN</th></tr></thead><tbody>{nodes.map(n => <tr key={n.id}><td>{n.walerId}/{n.supportId}</td><td>{show(n.point.xMm)} / {show(n.point.yMm)} / {show(n.point.zMm)}</td><td>{show(n.forceN / 1000)}</td></tr>)}</tbody></table>
        <p>{f.result.pressureDeck ? 'ไม้อัด: แถบกว้าง 1 m ตาม Z ที่ขอบโซน ส่งแรงเข้าคร่าวตามขอบ Patch X/Z จริง' : 'ไม้อัด: แถบออกแบบแนวดิ่งกว้าง 1 m ที่แรงดันสูงสุด ใช้แสดงซองแรง ไม่ส่งโหลดซ้ำเข้าคร่าว'}</p>
        <table><thead><tr><th>แถบไม้อัด / x · mm</th><th>โซน Z / ระดับตรวจ Z · mm</th><th>แหล่งแรงดัน</th><th>Mmax · N·mm/m @ station</th><th>Vmax · N/m @ station</th><th>δmax · mm @ station</th><th>หน่วยแรงดัดที่ต้องรับ · MPa</th><th>ขีดจำกัดต่อแถบ 1 m · evidence screen</th></tr></thead><tbody>{f.panels.map(p => <tr key={p.id}><td>{p.id} / {show(p.startMm)}–{show(p.endMm)}</td><td>{show(p.lowerZMm)}–{show(p.upperZMm)} / {show(p.evaluationZMm)}</td><td>{p.sourceActionIds.join(', ') || 'ไม่มีแรงดันที่ระบุในโซนนี้'}</td><td>{show(p.analysis.maxMomentNmm)} @ {beamStationLabel(p.analysis.criticalStations.moment)}</td><td>{show(p.analysis.maxShearN)} @ {beamStationLabel(p.analysis.criticalStations.shear)}</td><td>{show(p.analysis.maxDeflectionMm)} @ {beamStationLabel(p.analysis.criticalStations.deflection)}</td><td>{show(p.stressDemandMPa)}</td>
          <td>{p.resistanceScreen.status} · {p.resistanceScreen.checks.map(c => `${c.quantity} ${c.status}${c.utilization === null ? '' : ` u=${show(c.utilization)}`}`).join(' / ')}<details><summary>ข้อมูลที่ขาด</summary><ul>{p.resistanceScreen.blockers.map(b => <li key={b}>{b}</li>)}</ul></details></td></tr>)}</tbody></table>
        <section aria-label={`ตรวจเฉพาะที่ ${f.face.id}`}><h4>ตรวจเฉพาะที่ · แรงกด / แผ่นรอง / จุดต่อ / การโก่งเดาะ / รอยต่อมุม · {f.local.status} / NO_GO</h4>
          <table><thead><tr><th>ชนิด</th><th>จุดวิกฤต</th><th>ค่าที่ต้องรับ</th><th>limit</th><th>ช่วงไม่ค้ำยัน · mm</th><th>สถานะ</th></tr></thead><tbody>{f.local.governing.map(c => <tr key={c.kind}><td>{sideLocalKindNames[c.kind]}</td><td>{c.id}</td><td>{show(c.demand)} {c.unit}</td><td>{show(c.limit)} {c.unit}</td><td>{c.lengthMm === null ? '—' : show(c.lengthMm)}</td><td>{c.status}{c.utilization === null ? '' : ` · u=${show(c.utilization)}`}</td></tr>)}</tbody></table>
          <details><summary>ทุกจุดที่ตรวจ ({f.local.checks.length}) และข้อมูลที่ขาด</summary><ul>{f.local.blockers.map(b => <li key={b}>{b}</li>)}</ul>
            <table><thead><tr><th>ชนิด / จุด</th><th>ค่าที่ต้องรับ</th><th>สถานะ</th></tr></thead><tbody>{f.local.checks.map(c => <tr key={`${c.kind}:${c.id}`}><td>{c.kind} / {c.id}</td><td>{show(c.demand)} {c.unit}</td><td>{c.status}</td></tr>)}</tbody></table></details>
          <p>มุมปิดวิเคราะห์ปลายรางเป็นอิสระ จึงแสดงเฉพาะการเปิดรอยต่อที่ปลาย ยังไม่ถ่ายแรงผ่านอุปกรณ์มุม และเสถียรภาพระบบยังต้องใช้แรงด้านข้างกับเฟรมค้ำ</p></section>
        <table><thead><tr><th>สมาชิกจริง</th><th>Mmax · N·mm @ station</th><th>Vmax · N @ station</th><th>δmax · mm @ station</th><th>ขีดจำกัดที่ระบุ · evidence screen</th></tr></thead><tbody>{[...f.result.studs.map(stud => stud.analysis), ...f.result.walers.flatMap(w => w.rails)].map(a => <tr key={a.id}><td>{a.id}</td><td>{show(a.maxMomentNmm)} @ {beamStationLabel(a.criticalStations.moment)}</td><td>{show(a.maxShearN)} @ {beamStationLabel(a.criticalStations.shear)}</td><td>{show(a.maxDeflectionMm)} @ {beamStationLabel(a.criticalStations.deflection)}</td>
          <td>{a.resistanceScreen.status} · {a.resistanceScreen.checks.map(c => `${c.quantity} ${c.status}${c.utilization === null ? '' : ` u=${show(c.utilization)}`}`).join(' / ')}<details><summary>ข้อมูลที่ขาด</summary><ul>{a.resistanceScreen.blockers.map(b => <li key={b}>{b}</li>)}</ul></details></td></tr>)}</tbody></table>
        <p>ขีดจำกัดคร่าว/คานรัดใช้เฉพาะค่าที่ผู้ใช้ระบุพร้อมหลักฐานและ review; SCREENED ไม่ครอบคลุม bearing, buckling, จุดต่อ, มุม หรือเสถียรภาพ และยังเป็น NO_GO</p>
      </details>;
    })}
    {!!side.ties.length && <table><thead><tr><th>ไทร์</th><th>ปลาย A / B · kN</th><th>แรงไทร์เต็มเส้น · kN</th><th>ช่องผ่านราง/รูแผ่น</th><th>Assembly</th></tr></thead><tbody>{side.ties.map(t => <tr key={t.id}><td>{t.id} · {t.a.faceId}/{t.b.faceId} · z {show(t.route.zMm)} mm</td><td>{show(t.endForcesN[0] / 1000)} / {show(t.endForcesN[1] / 1000)}</td><td>{show(t.demandKN)}</td><td>{t.fits.map((fit, i) => <p key={i}>{i === 0 ? 'A' : 'B'}: {fit?.status ?? 'UNKNOWN'} · ช่องเหลือ {show(fit?.availableGapMm)} / {show(fit?.availableHoleMm)} mm {fit?.issues.join(', ')}</p>)}</td><td>{t.dossier?.status ?? t.assembly?.status ?? 'BLOCKED · รอชุดผลิตภัณฑ์'}</td></tr>)}</tbody></table>}
    {side.ties.filter(t => t.dossier).map(t => <TieDossierResults key={t.id} id={t.id} result={t.dossier!}/>)}
    <p>การวิเคราะห์ครอบคลุมผิวที่ระบุเท่านั้น ผิวที่ขาด ไทร์ที่ชนกัน จุดรองรับที่ไม่ผูกระบบ และแรงปลายที่ไม่สมดุลยังคงเป็น BLOCKED</p>
  </section>;
}
