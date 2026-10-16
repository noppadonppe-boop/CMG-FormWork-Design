import React from 'react';
import {emptyHeadBearing, type HeadBearingDefinition} from '../domain/workflowV07/headBearing';
import type {WorkflowModel, previewWorkflow} from '../domain/workflowV07/model';

const show = (n: number | null | undefined) => n == null ? 'UNKNOWN' : n.toLocaleString('en-US', {maximumSignificantDigits: 8});
const vector = (v: (number | null)[] | undefined | null) => v ? v.map(show).join(', ') : 'UNKNOWN';
const number = (s: string) => s.trim() && Number.isFinite(Number(s)) ? Number(s) : null;
export function HeadBearingFields({value, onChange}: {value: HeadBearingDefinition | null; onChange: (d: HeadBearingDefinition | null) => void}) {
  if (!value) return <div className="head-bearing-editor"><p>ช่องหัว ระยะนั่ง และการประคองคานยังไม่ระบุ ไม่ใช้ขนาดหรือกำลังจากชื่ออุปกรณ์แทน</p><button className="btn secondary" onClick={() => onChange(emptyHeadBearing())}>เพิ่มข้อมูลผิวรับคานบน U-head</button></div>;
  const d = value;
  const change = (patch: Partial<HeadBearingDefinition>) => onChange({...d, ...patch});
  function numeric(key: keyof HeadBearingDefinition, label: string) {return <label className="field"><span>{label}</span><input type="number" step="any" value={d[key] as number | null ?? ''} onChange={e => change({[key]: number(e.target.value)})}/></label>;}
  function text(key: keyof HeadBearingDefinition, label: string) {return <label className="field"><span>{label}</span><input value={d[key] as string} onChange={e => change({[key]: e.target.value})}/></label>;}
  function coordinates(key: 'seatCenterMm' | 'seatLocalX' | 'contactCenterMm', label: string) {return <div className="form-grid">{d[key].map((v, i) => <label className="field" key={i}><span>{label} {['X', 'Y', 'Z'][i]}{key === 'seatLocalX' ? ' · ไม่มีหน่วย' : ' · mm'}</span><input type="number" step="any" value={v ?? ''} onChange={e => change({[key]: d[key].map((old, j) => i === j ? number(e.target.value) : old)})}/></label>)}</div>;}
  return <fieldset className="head-bearing-editor"><legend>ช่องหัวและผิวรับคานบน U-head</legend>
    <p>ข้อมูลวัดจริงเท่านั้น รองรับคานเดี่ยวผิวแบนที่ขนานช่องหัว ส่วนหลายรางหรือท่อกลมต้องมีแบบจำลองเฉพาะ กฎความดันนี้ไม่ตรวจความแข็งแผ่น กำลังเฉพาะที่ เกลียว หรือการค้ำประคอง</p>
    <div className="form-grid">{text('productRef', 'รหัสสินค้าหัวที่ตรงกับ Head Jack')}{text('geometryEvidenceRef', 'หลักฐานขนาดช่องหัว/แผ่นและตำแหน่งจริง')}
      <label className="field"><span>รูปแบบคานที่วางบนหัว</span><select value={d.layout ?? ''} onChange={e => change({layout: (e.target.value || null) as typeof d.layout})}><option value="">ยังไม่ทราบ</option><option value="SINGLE_FLAT_BEARER">คานเดี่ยวผิวสัมผัสแบน</option><option value="MULTIPLE_BEARERS_OR_RAILS">หลายคาน/หลายราง · รอแบบจำลองเฉพาะ</option></select></label>
    </div>{coordinates('seatCenterMm', 'ศูนย์แผ่นหัว Global')}{coordinates('seatLocalX', 'แกนช่องหัวตามแนวคาน Global')}
    <p>แกน Y ท้องถิ่นได้จากการหมุนแกน X ที่ระบุ 90° ในระนาบ XY ต้องระบุทิศแกนช่องหัว ไม่ใช้แกน Global เป็นค่าตั้งต้น</p>
    <div className="form-grid">{numeric('plateLengthMm', 'ความยาวแผ่นตามแกนช่องหัว · mm')}{numeric('plateWidthMm', 'ความกว้างแผ่นขวางช่องหัว · mm')}{numeric('plateThicknessMm', 'ความหนาแผ่นหัวจริง · mm')}
      {numeric('cavityOffsetYMm', 'ศูนย์ช่องหัวเยื้องจากศูนย์แผ่นตามแกน Y · mm')}{numeric('insideClearWidthMm', 'ช่องกว้างใสต่ำสุดตลอดช่วงตัวคาน · mm')}{numeric('minimumSideClearanceMm', 'ระยะเผื่อข้างที่ระบุแต่ละด้าน · mm')}
      {numeric('bearerWidthMm', 'ความกว้างภายนอกคานขวางช่องหัว · mm')}{numeric('bearerDepthMm', 'ความสูงคานจริงที่นั่งบนหัว · mm')}{text('bearerGeometryEvidenceRef', 'หลักฐานขนาด/ผิวคานและตำแหน่งปลายจริง')}
      {numeric('bearerCenterOffsetYMm', 'กลางความกว้างคานเยื้องจากแนววิเคราะห์ตามแกน Y หัว · mm (ตรงกันใส่ 0)')}
    </div>{coordinates('contactCenterMm', 'ศูนย์พื้นที่สัมผัสจริง Global')}
    <div className="form-grid">{numeric('contactLengthMm', 'ระยะนั่งจริงตามแนวคาน · mm')}{numeric('contactWidthMm', 'ความกว้างผิวแบนสัมผัสจริง · mm')}
      <label className="field"><span>การประคองคานสองข้าง</span><select value={d.sideBlocking ?? ''} onChange={e => change({sideBlocking: (e.target.value || null) as typeof d.sideBlocking})}><option value="">ยังไม่ทราบ</option><option value="BOTH_SIDES">มีทั้งสองข้างตามหลักฐาน</option><option value="NONE">ไม่มี · ยังต้องตรวจการยึดรั้ง</option></select></label>
      {text('sideBlockingEvidenceRef', 'หลักฐานชิ้นส่วนประคองและการยึดจริง')}
      <label className="field"><span>กฎความดันบนพื้นที่สัมผัสหัว</span><select value={d.pressureModel ?? ''} onChange={e => change({pressureModel: e.target.value === 'RIGID_HORIZONTAL_RECTANGLE_AFFINE_COMPRESSION_ONLY' ? 'RIGID_HORIZONTAL_RECTANGLE_AFFINE_COMPRESSION_ONLY' : null})}><option value="">ยังไม่เลือก</option><option value="RIGID_HORIZONTAL_RECTANGLE_AFFINE_COMPRESSION_ONLY">สมมติผิวแข็งเกร็งแนวราบ · รับอัดเท่านั้น</option></select></label>
      {text('pressureModelEvidenceRef', 'หลักฐานขอบเขตสมมติฐานผิวสัมผัสหัว')}
    </div><p>พื้นที่นั่งต้องอยู่บนแผ่นและเนื้อคานจริง รวมถึงปลายคาน ข้อมูลว่างคือ UNKNOWN ไม่มีเกณฑ์กำลังหรือระยะเผื่อสำเร็จรูปให้เอง น้ำหนักคานใช้จากแบบท้อง ไม่บวกซ้ำที่ผิวนี้</p>
    <button className="btn secondary" onClick={() => onChange(null)}>ล้างข้อมูลผิวรับหัวนี้</button>
  </fieldset>;
}
export function HeadBearingResults({model, preview}: {model: WorkflowModel; preview: ReturnType<typeof previewWorkflow>}) {
  const results = preview.headBearings; if (!results) return null;
  return <section aria-label="ผลช่องหัวและแรงสัมผัส U-head จากฉบับร่าง"><h3>คานรับ → ช่องหัว U-head · {results.status} / NO_GO</h3>
    <p>Revision {model.revisionId} · {results.stageId} / {results.loadCaseId} · แรงจากคานรับเท่านั้น ยังไม่ใช่แรงรวมทั้งหมดของ Head Jack หรือผลตรวจกำลัง</p>
    <p>F และ M มีเครื่องหมายในแกน Global X/Y/Z หน่วย N และ N·mm ย้ายจุดด้วย (r ต้นทาง − r ปลายทาง) × F เพียงครั้งเดียว ไม่หารแรงรวมด้วยจำนวนหัว</p>
    {results.rows.map(r => {const d = r.definition, q = r.contact?.result; return <details className="head-bearing-result" key={r.legId}><summary>{r.legId} / {r.headNodeId} · {r.status} · {r.geometryReady ? 'ขนาดสัมผัสเข้าเงื่อนไขเรขาคณิตเท่านั้น' : 'ข้อมูลขาดหรือขนาดขัดแย้ง'}</summary>
      <p>ต้นทาง {r.sourceLink ? `${r.sourceLink.upstreamAnalysisId}/${r.sourceLink.supportId} · station ${show(r.sourceLink.stationMm)} mm · Revision ${r.sourceLink.upstreamRevision} · ${r.sourceLink.stageId}/${r.sourceLink.loadCaseId}` : 'UNKNOWN'}</p>
      <p>แรงคานที่ [{vector(r.source?.pointMm)}] mm: F [{vector(r.source?.forceN)}] N · M [{vector(r.source?.momentNmm)}] N·mm</p>
      <p>ส่วนแรงคานที่ระนาบแกนหัว [{vector(r.shaftDemand?.pointMm)}]: M [{vector(r.shaftDemand?.momentNmm)}] N·mm · ที่ศูนย์พื้นที่สัมผัส [{vector(r.contactDemand?.pointMm)}]: M [{vector(r.contactDemand?.momentNmm)}] N·mm</p>
      {d && <><p>หัว {d.productRef || 'UNKNOWN'} · {d.geometryEvidenceRef || 'UNKNOWN'} · คาน {d.layout ?? 'UNKNOWN'} · {d.bearerGeometryEvidenceRef || 'UNKNOWN'}</p>
        <p>ศูนย์แผ่น [{vector(d.seatCenterMm)}] · แกน X [{vector(d.seatLocalX)}] · แผ่น {show(d.plateLengthMm)} × {show(d.plateWidthMm)} × {show(d.plateThicknessMm)} mm · ช่องใส {show(d.insideClearWidthMm)} mm / เยื้อง Y {show(d.cavityOffsetYMm)} mm</p>
        <p>คานจริง {show(d.bearerWidthMm)} × {show(d.bearerDepthMm)} mm · กลางความกว้างเยื้องจากแนววิเคราะห์ Y หัว {show(d.bearerCenterOffsetYMm)} mm · พื้นที่นั่ง {show(d.contactLengthMm)} × {show(d.contactWidthMm)} mm ณ [{vector(d.contactCenterMm)}] · การประคอง {d.sideBlocking ?? 'UNKNOWN'} / {d.sideBlockingEvidenceRef || 'UNKNOWN'}</p>
        <p>กฎสัมผัส {d.pressureModel ?? 'UNKNOWN'} · {d.pressureModelEvidenceRef || 'UNKNOWN'}</p></>}
      {r.geometry && <p>ช่องเหลือซ้าย/ขวา {show(r.geometry.leftClearanceMm)} / {show(r.geometry.rightClearanceMm)} mm · ต้องการแต่ละข้าง {show(r.geometry.requiredSideClearanceMm)} mm · ระยะถึงขอบแผ่น [{vector(r.geometry.plateMarginsMm)}] mm · ระยะถึงปลาย/ขอบคาน [{vector(r.geometry.bearerMarginsMm)}] mm</p>}
      {q ? <><p>{q.contact} · q สูงสุด {show(q.pressureMaxMPa * 1000)} kPa · พื้นที่รับอัด {show(q.contactAreaMm2)} mm² / {show(q.areaFraction * 100)}% · e ตามแกนช่องหัว [{show(q.eccentricityMm?.x)}, {show(q.eccentricityMm?.y)}] mm</p>
        <p>Residual สัมผัส N {show(q.equilibrium.forceResidualN)} · Mx/My {show(q.equilibrium.loadMxResidualNmm)} / {show(q.equilibrium.loadMyResidualNmm)} N·mm</p></> : <p>ความดันสัมผัสหัว UNKNOWN · {r.contact?.reason ?? 'ข้อมูล/ขอบเขตทางถ่ายแรงหรือกฎสัมผัสยังไม่ครบ'}</p>}
      <ul>{r.issues.map((s, i) => <li key={i}>{s}</li>)}</ul>
    </details>;})}
    <ul>{results.blockers.map(s => <li key={s}>{s}</li>)}</ul>
  </section>;
}
