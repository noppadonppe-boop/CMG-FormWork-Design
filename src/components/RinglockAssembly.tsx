import React, {useEffect, useState} from 'react';
import {canonical, clone} from '../domain/workflowV07/common';
import {emptyInstalledJack, emptyRinglockAssembly, type AppliedRinglockAssembly, type InstalledJack, type LegAssembly, type RinglockAssemblyDefinition} from '../domain/workflowV07/ringlockAssembly';
import type {WorkflowModel, previewWorkflow} from '../domain/workflowV07/model';
import {HeadBearingFields, HeadBearingResults} from './HeadBearing';

const show = (v: number | null | undefined) => v == null ? 'UNKNOWN' : v.toLocaleString('en-US', {maximumFractionDigits: 5});
const number = (s: string) => s.trim() && Number.isFinite(Number(s)) ? Number(s) : null;
function definitionOf(a: AppliedRinglockAssembly | null | undefined): RinglockAssemblyDefinition {if (!a) return emptyRinglockAssembly(); const {revisionId: _rev, inputDefinition: _input, ...d} = a; return clone(d);}
export function RinglockAssemblyEditor({assembly, captureEnabled, onCapture, onApply, onPendingChange, onDraftChange}: {
  assembly: AppliedRinglockAssembly | null; captureEnabled: boolean; onCapture: () => RinglockAssemblyDefinition; onApply: (d: RinglockAssemblyDefinition) => void;
  onPendingChange: (pending: boolean) => void; onDraftChange: (d: RinglockAssemblyDefinition) => void;
}) {
  const [form, setForm] = useState(() => definitionOf(assembly)), [error, setError] = useState(''), identity = canonical(definitionOf(assembly));
  useEffect(() => {setForm(definitionOf(assembly)); setError(''); onPendingChange(false);}, [identity, onPendingChange]);
  useEffect(() => () => onPendingChange(false), [onPendingChange]);
  function change(next: RinglockAssemblyDefinition) {setForm(next); setError(''); onPendingChange(canonical(next) !== identity); onDraftChange(next);}
  function leg(i: number, patch: Partial<LegAssembly>) {change({...form, legs: form.legs.map((l, n) => n === i ? {...l, ...patch} : l)});}
  const numeric = (label: string, value: number | null, update: (v: number | null) => void) => <label className="field"><span>{label}</span><input type="number" step="any" value={value ?? ''} onChange={e => update(number(e.target.value))}/></label>;
  const text = (label: string, value: string, update: (v: string) => void) => <label className="field"><span>{label}</span><input value={value} onChange={e => update(e.target.value)}/></label>;
  function jack(j: InstalledJack, label: string, update: (v: InstalledJack) => void) {
    return <fieldset><legend>{label}</legend><div className="form-grid">{text('รหัส/เอกสารสินค้าจริง', j.productRef, productRef => update({...j, productRef}))}
      {([['nominalLengthMm', 'ความยาวแค็ตตาล็อก · mm (ไม่ใช่ระยะยืด)'], ['installedHeightMm', 'ความสูงติดตั้งระหว่าง Datum · mm'], ['extensionMm', 'ระยะยืดที่วัด · mm'], ['engagementMm', 'ระยะสวมที่วัด · mm'], ['maxExtensionMm', 'ระยะยืดสูงสุดตามเอกสาร · mm'], ['minEngagementMm', 'ระยะสวมต่ำสุดตามเอกสาร · mm']] as const).map(([key, label]) => <React.Fragment key={key}>{numeric(label, j[key], v => update({...j, [key]: v}))}</React.Fragment>)}
      {text('หลักฐาน Datum ติดตั้ง Jack ที่ไม่ซ้อนกัน', j.geometryEvidenceRef, geometryEvidenceRef => update({...j, geometryEvidenceRef}))}
      {text('หลักฐานผลิตภัณฑ์และข้อจำกัด Jack', j.limitEvidenceRef, limitEvidenceRef => update({...j, limitEvidenceRef}))}</div></fieldset>;
  }
  return <fieldset className="ringlock-assembly-editor"><legend>ความสูงติดตั้ง Ringlock รายขา</legend>
    <p>เริ่มจากหัว/ฐานที่วิเคราะห์แล้ว วัดความสูงติดตั้งตาม Datum ที่ไม่ซ้อนกัน ความยาว Standard และ Jack ในแค็ตตาล็อกยังไม่ใช่ระยะติดตั้งหรือข้อจำกัดการยืด</p>
    <button className="btn secondary" disabled={!captureEnabled || form.legs.length > 0} onClick={() => {try {change(onCapture());} catch (e) {setError((e as Error).message);}}}>เริ่มบันทึกขาจากหัวและฐานปัจจุบัน</button>
    <div className="form-grid">{text('Stage การประกอบ Ringlock', form.stageId, stageId => change({...form, stageId}))}{text('Load case การประกอบ Ringlock', form.loadCaseId, loadCaseId => change({...form, loadCaseId}))}{text('หลักฐานรูปแบบการประกอบ', form.evidenceRef, evidenceRef => change({...form, evidenceRef}))}
      <label className="field"><span>นิยามระนาบหัวในแบบวิเคราะห์</span><select value={form.headDatum ?? ''} onChange={e => change({...form, headDatum: e.target.value === 'U_HEAD_BEARING_SURFACE' ? 'U_HEAD_BEARING_SURFACE' : null, headDatumEvidenceRef: ''})}><option value="">ยังไม่ยืนยัน Datum</option><option value="U_HEAD_BEARING_SURFACE">ระนาบรับคานบน U-head ตามหลักฐาน</option></select></label>
      {text('หลักฐานจับคู่ระนาบวิเคราะห์กับผิวรับหัว', form.headDatumEvidenceRef, headDatumEvidenceRef => change({...form, headDatumEvidenceRef}))}</div>
    {form.legs.map((l, i) => <details className="assembly-leg-editor" key={l.legId} aria-label={`การประกอบขา ${l.legId}`}><summary>{l.legId} / {l.headNodeId} · ฐาน {show(l.groundElevationMm)} → หัว {show(l.headBearingElevationMm)} mm</summary>
      <p>X/Y {show(l.xMm)} / {show(l.yMm)} mm · เปลี่ยนฐานรายหัวที่แบบท้องก่อนบันทึกขาชุดใหม่</p>
      <div className="form-grid">{numeric('ระดับท้องแบบจริง · mm', l.soffitElevationMm, soffitElevationMm => leg(i, {soffitElevationMm}))}{numeric('Tolerance ที่ระบุสำหรับ Datum · mm', l.toleranceMm, toleranceMm => leg(i, {toleranceMm}))}
        {numeric('ความหนา Sole board ที่ติดตั้ง · mm (ไม่มีต้องระบุ 0)', l.soleBoard.thicknessMm, thicknessMm => leg(i, {soleBoard: {...l.soleBoard, thicknessMm}}))}{text('หลักฐาน Sole board/พื้นผิวรองรับ', l.soleBoard.evidenceRef, evidenceRef => leg(i, {soleBoard: {...l.soleBoard, evidenceRef}}))}
        {([['bearerDepthMm', 'ความสูงคานรับในแนวดิ่ง · mm'], ['joistDepthMm', 'ความสูงคร่าวในแนวดิ่ง · mm'], ['plywoodThicknessMm', 'ความหนาไม้อัดในชุดติดตั้ง · mm']] as const).map(([key, label]) => <React.Fragment key={key}>{numeric(label, l.upperStack[key], v => leg(i, {upperStack: {...l.upperStack, [key]: v}}))}</React.Fragment>)}
        {text('หลักฐาน Datum คานรับ/คร่าว/ไม้อัด', l.upperStack.evidenceRef, evidenceRef => leg(i, {upperStack: {...l.upperStack, evidenceRef}}))}</div>
      {jack(l.baseJack, 'Base Jack · Sole board บน → ปลายล่าง Standard', baseJack => leg(i, {baseJack}))}
      <h4>Standard เรียงจากล่างขึ้นบน ({l.standards.length})</h4>
      {l.standards.map((s, n) => {const update = (patch: Partial<typeof s>) => leg(i, {standards: l.standards.map((old, j) => j === n ? {...old, ...patch} : old)}); return <fieldset className="assembly-standard-editor" key={n}><legend>Standard {n + 1}</legend><div className="form-grid">
        {text('รหัสชิ้น Standard', s.id, id => update({id}))}{text('อ้างอิงสินค้า Standard', s.productRef, productRef => update({productRef}))}{numeric('ขนาด Label Standard · mm', s.nominalLengthMm, nominalLengthMm => update({nominalLengthMm}))}{numeric('ความสูงติดตั้งระหว่างปลาย Standard · mm', s.installedRiseMm, installedRiseMm => update({installedRiseMm}))}{text('หลักฐานปลาย Datum ของ Standard', s.datumEvidenceRef, datumEvidenceRef => update({datumEvidenceRef}))}</div>
        <button className="btn secondary" onClick={() => leg(i, {standards: l.standards.filter((_, j) => j !== n)})}>ลบ Standard {n + 1}</button></fieldset>;})}
      <button className="btn secondary" disabled={l.standards.length >= 20} onClick={() => {let n = 1; while (l.standards.some(s => s.id === `S${n}`)) n++; leg(i, {standards: [...l.standards, {id: `S${n}`, productRef: '', nominalLengthMm: null, installedRiseMm: null, datumEvidenceRef: ''}]});}}>เพิ่ม Standard ที่ติดตั้งจริง</button>
      <h4>Spigot / รอยต่อ ({l.spigots.length})</h4><p>ช่วง Gap ระหว่างปลายท่อบวกครั้งเดียว ระยะสวมอยู่ภายในท่อ จึงไม่บวกความยาว Spigot ทั้งชิ้นซ้ำในความสูง การลบ/เปลี่ยน Standard จะไม่ย้ายหลักฐานรอยต่อให้เอง</p>
      {l.spigots.map((s, n) => {const update = (patch: Partial<typeof s>) => leg(i, {spigots: l.spigots.map((old, j) => j === n ? {...old, ...patch} : old)}); return <fieldset className="assembly-spigot-editor" key={n}><legend>Spigot {n + 1}</legend><div className="form-grid">
        {text('รหัสรอยต่อ Spigot', s.id, id => update({id}))}{text('อ้างอิงสินค้า Spigot', s.productRef, productRef => update({productRef}))}
        {(['lowerStandardId', 'upperStandardId'] as const).map(key => <label className="field" key={key}><span>{key === 'lowerStandardId' ? 'Standard ล่างของรอยต่อ' : 'Standard บนของรอยต่อ'}</span><select value={s[key]} onChange={e => update({[key]: e.target.value, evidenceRef: ''})}><option value="">ยังไม่เลือก</option>{l.standards.map(p => <option key={p.id}>{p.id}</option>)}</select></label>)}
        {([['gapMm', 'ช่องว่างระหว่างปลายท่อ · mm (0 ต้องระบุ)'], ['overallLengthMm', 'ความยาวจริงรวม Spigot · mm'], ['lowerInsertionMm', 'ระยะสวมท่อล่าง · mm'], ['upperInsertionMm', 'ระยะสวมท่อบน · mm']] as const).map(([key, label]) => <React.Fragment key={key}>{numeric(label, s[key], v => update({[key]: v}))}</React.Fragment>)}
        {text('หลักฐาน Datum/ระยะสวม Spigot', s.evidenceRef, evidenceRef => update({evidenceRef}))}</div><button className="btn secondary" onClick={() => leg(i, {spigots: l.spigots.filter((_, j) => j !== n)})}>ลบ Spigot {n + 1}</button></fieldset>;})}
      <button className="btn secondary" disabled={l.spigots.length >= 19} onClick={() => {let n = 1; while (l.spigots.some(s => s.id === `P${n}`)) n++; leg(i, {spigots: [...l.spigots, {id: `P${n}`, lowerStandardId: '', upperStandardId: '', productRef: '', gapMm: null, overallLengthMm: null, lowerInsertionMm: null, upperInsertionMm: null, evidenceRef: ''}]});}}>เพิ่ม Spigot/รอยต่อจริง</button>
      {jack(l.headJack, 'Head Jack · ปลายบน Standard → ผิวรับคาน', headJack => leg(i, {headJack}))}
      <HeadBearingFields value={l.headBearing ?? null} onChange={headBearing => leg(i, {headBearing})}/>
    </details>)}
    {error && <p role="alert">{error}</p>}
    <button className="btn secondary" onClick={() => {try {onApply(form); setError(''); onPendingChange(false);} catch (e) {setError((e as Error).message);}}}>เก็บการประกอบและตรวจ Datum ร่าง</button>
    <button className="btn secondary" onClick={() => {change(definitionOf(assembly)); onPendingChange(false);}}>คืนค่าการประกอบที่เก็บไว้</button>
    <button className="btn secondary" onClick={() => change(emptyRinglockAssembly())}>เริ่มบันทึกการประกอบใหม่</button>
  </fieldset>;
}
export function RinglockAssemblyResults({model, preview}: {model: WorkflowModel; preview: ReturnType<typeof previewWorkflow>}) {
  const a = preview.assembly; if (!a || !model.ringlockAssembly) return null;
  return <section className="ringlock-assembly-results" aria-label="ผล Datum การประกอบ Ringlock รายขา"><h3>Datum การประกอบรายขา · {a.status} / NO_GO</h3>
    <p>Revision {model.ringlockAssembly.revisionId} · Stage {model.ringlockAssembly.stageId || 'UNKNOWN'} · Case {model.ringlockAssembly.loadCaseId || 'UNKNOWN'} · {a.current ? 'ข้อมูลฉบับปัจจุบัน' : 'STALE'}</p>
    <p>ข้อมูลระดับพร้อมเตรียมพิกัดเฟรม: {a.frameGeometryReady ? 'ครบตามขอบเขต Datum เท่านั้น' : 'ยังไม่ครบ/ต้องแก้ความขัดแย้ง'} · ไม่กำหนดความแข็งจุดต่อหรือกำลังจากเรขาคณิต</p>
    <ul>{a.blockers.map(s => <li key={s}>{s}</li>)}</ul>{!!a.unknownLegIds.length && <p>ขาที่ไม่ตรงข้อมูลปัจจุบัน: {a.unknownLegIds.join(', ')}</p>}
    {a.rows.map(row => {const l = model.ringlockAssembly!.legs.find(l => l.legId === row.legId), demand = preview.ringlock?.legDemands.find(d => d.legId === row.legId);
      return <details className="assembly-leg-result" key={row.legId}><summary>{row.legId} · {row.status} · ผลต่างระดับ {show(row.height?.residualMm)} mm</summary>
        <p>หัว {row.headNodeId} · แรงรายหัว {show(demand?.forceKN)} kN · ผลต่างระดับหัว {show(row.headResidualMm)} mm</p>
        {l && <><p>ฐาน/หัว/ท้องแบบ {show(l.groundElevationMm)} / {show(l.headBearingElevationMm)} / {show(l.soffitElevationMm)} mm · Tolerance {show(l.toleranceMm)} mm</p>
          <p>ชั้นติดตั้ง: Sole board {show(l.soleBoard.thicknessMm)} + Base {show(l.baseJack.installedHeightMm)} + Standard {l.standards.map(s => show(s.installedRiseMm)).join(' + ') || 'UNKNOWN'} + Gap {l.spigots.map(s => show(s.gapMm)).join(' + ') || 'ไม่มีรอยต่อที่บันทึก'} + Head {show(l.headJack.installedHeightMm)} + คานรับ {show(l.upperStack.bearerDepthMm)} + คร่าว {show(l.upperStack.joistDepthMm)} + ไม้อัด {show(l.upperStack.plywoodThicknessMm)} mm</p>
          <p>Base: Label {show(l.baseJack.nominalLengthMm)} / ยืด {show(l.baseJack.extensionMm)} / สวม {show(l.baseJack.engagementMm)} mm · Head: Label {show(l.headJack.nominalLengthMm)} / ยืด {show(l.headJack.extensionMm)} / สวม {show(l.headJack.engagementMm)} mm</p></>}
        {l && <details><summary>ค่าติดตั้ง ข้อจำกัดที่บันทึก และหลักฐานของขานี้</summary><pre>{JSON.stringify(l, null, 2)}</pre><p>ค่าที่บันทึกและข้อความหลักฐานยังไม่ใช่การรับรองผลิตภัณฑ์/Configuration</p></details>}
        <ul>{row.issues.map(s => <li key={s}>{s}</li>)}</ul>
        {row.spigotChecks.map(s => <p key={s.id}>{s.id} · ผลต่างความยาว Spigot − ระยะสวม − Gap = {show(s.residualMm)} mm · {s.status}</p>)}
        {!!row.nodes.length && <><svg viewBox="0 0 450 350" role="img" aria-label={`ระดับการประกอบ ${row.legId}`}>
          {(() => {const bottom = Math.min(...row.nodes.map(n => n.pointMm[2])), top = Math.max(...row.nodes.map(n => n.pointMm[2])), y = (z: number) => 310 - (z - bottom) * 270 / Math.max(1, top - bottom); return <>
            {row.segments.map(e => {const n = row.nodes.find(n => n.id === e.nodeI)!, m = row.nodes.find(n => n.id === e.nodeJ)!; return e.kind === 'JOINT_SPRING' ? <circle key={e.id} cx="85" cy={y(n.pointMm[2])} r="5" fill="white" stroke="#b17a28"/> : <line key={e.id} x1="85" x2="85" y1={y(n.pointMm[2])} y2={y(m.pointMm[2])} stroke={e.role === 'STANDARD' ? '#173e62' : '#b17a28'} strokeWidth="4"/>;})}
            {row.nodes.map((n, i) => <g key={n.id} data-datum-z-mm={n.pointMm[2]}><circle cx="85" cy={y(n.pointMm[2])} r="2"/><text x={100 + i % 2 * 140} y={y(n.pointMm[2]) + 3} fontSize="9">{n.role} Z {show(n.pointMm[2])} mm</text></g>)}
          </>;})()}<text x="15" y="340" fontSize="10">GEOMETRY ONLY · mm · NTS · NO_GO</text>
        </svg><table><thead><tr><th>ชิ้นส่วน/บทบาท</th><th>จุด I → J</th><th>แบบจำลองที่ยังต้องระบุสมบัติ</th></tr></thead><tbody>{row.segments.map(e => <tr key={e.id}><td>{e.id} / {e.role}</td><td>{e.nodeI} → {e.nodeJ}</td><td>{e.kind} · {e.productRef || 'UNKNOWN'}</td></tr>)}</tbody></table></>}
      </details>;
    })}
    <HeadBearingResults model={model} preview={preview}/>
    <p>ยังต้องตรวจ centroid/จุดสัมผัสของชั้นบน สภาพปลาย การค้ำยึด ระยะยืด/สวมตามผู้ผลิต กำลัง Jack/Spigot/ฐาน และผลอันดับสอง แรงรายหัวไม่ใช่กำลังรองรับระบบ</p>
  </section>;
}
