import React from 'react';
import {emptyWalerPair, type IndependentWalerPair, type IndependentWalerRail, type WalerSupportFitting} from '../domain/workflowV07/walerPair';
import {canonical} from '../domain/workflowV07/common';
import {beamMemberEvidenceReference} from '../domain/workflowV07/beamResistance';
import {ElasticBindingEditor, type BindingSelections} from './ElasticBinding';
import {BeamMemberEvidenceEditor} from './BeamMemberEvidenceEditor';

const number = (value: string) => value === '' ? null : Number(value);
export function PairedWalerEditor({pair, supportIds, onChange, selections}: {pair: IndependentWalerPair | null; supportIds: string[]; onChange: (next: IndependentWalerPair | null) => void; selections?: BindingSelections}) {
  if (!pair) return <section className="paired-waler-editor"><button className="btn secondary" onClick={() => onChange(emptyWalerPair())}>กำหนดรางแยกรายชิ้นสำหรับระดับนี้</button>
    <p>ขณะนี้ใช้ค่ารางร่วมจากผิว ยังไม่มีข้อมูลหน้าตัด วัสดุ แกน และรอยต่อแยกรายราง</p></section>;
  const updateRail = (i: number, patch: Partial<IndependentWalerRail>) => {
    const changedDefinition = Object.keys(patch).some(key => key !== 'resistanceEvidence');
    onChange({...pair, rails: pair.rails.map((r, j) => i === j ? {...r, ...patch, ...(changedDefinition ? {resistanceEvidence: []} : {})} : r) as IndependentWalerPair['rails']});
  };
  const updateFitting = (i: number, patch: Partial<WalerSupportFitting>) => onChange({...pair, supportFittings: pair.supportFittings.map((f, j) => i === j ? {...f, ...patch} : f)});
  return <section className="paired-waler-editor" aria-label="รางสองชิ้นแยกกันในคานรัดระดับนี้"><h4>ราง 2 ชิ้น · Independent / Noncomposite</h4>
    <p>ระบุ I ของแกนดัดที่ใช้จริงหลังวางหน้าตัด ค่าในนี้แทนค่ารางร่วมเฉพาะระดับนี้ การแบ่งแรงเป็นสมมติฐานที่ต้องมีหลักฐาน ยังไม่มีแบบจำลองแผ่นประกับ/สัมผัสที่ยืนยัน</p>
    {pair.rails.map((r, i) => <fieldset key={i} aria-label={`ข้อมูลรางชิ้นที่ ${i + 1}`}><legend>รางชิ้นที่ {i + 1}</legend><div className="form-grid">
      <label className="field"><span>รหัสรางจริง</span><input value={r.id} onChange={e => updateRail(i, {id: e.target.value})}/></label>
      <label className="field"><span>ตระกูลหน้าตัดราง</span><select disabled={!!r.binding} value={r.family ?? ''} onChange={e => updateRail(i, {...emptyWalerPair().rails[i], id: r.id, family: (e.target.value || null) as IndependentWalerRail['family']})}><option value="">ยังไม่ทราบ</option>{['SHS', 'RHS', 'CHS', 'C', 'C_LIP'].map(f => <option key={f}>{f}</option>)}</select></label>
      <label className="field"><span>การวางหน้าตัดราง · องศา</span><select disabled={!!r.binding} value={r.orientationDeg ?? ''} onChange={e => updateRail(i, {orientationDeg: e.target.value === '' ? null : Number(e.target.value) as 0 | 90, bendingI_mm4: null, axisEvidenceRef: ''})}><option value="">ยังไม่ทราบ</option><option value="0">0 ตามแกนอ้างอิง</option><option value="90">90 จากแกนอ้างอิง</option></select></label>
      {([['E_MPa', 'E รางชิ้นนี้ · MPa'], ['bendingI_mm4', 'I แกนดัดรางชิ้นนี้ · mm⁴']] as const).map(([key, label]) => <label className="field" key={key}><span>{label}</span><input disabled={!!r.binding} type="number" step="any" value={r[key] ?? ''} onChange={e => updateRail(i, {[key]: number(e.target.value)})}/></label>)}
      {([['sectionRef', 'หลักฐานหน้าตัดรางจริง'], ['materialRef', 'หลักฐานวัสดุและ E ราง'], ['axisEvidenceRef', 'หลักฐานแกนดัดและ I ที่ใช้']] as const).map(([key, label]) => <label className="field" key={key}><span>{label}</span><input value={r[key]} onChange={e => updateRail(i, {[key]: e.target.value})}/></label>)}
      <label className="field"><span>ความต่อเนื่องของราง</span><select value={r.continuity ?? ''} onChange={e => updateRail(i, {continuity: (e.target.value || null) as IndependentWalerRail['continuity']})}><option value="">ยังไม่ทราบ</option><option value="CONTINUOUS">ชิ้นเดียวต่อเนื่องตลอดผิว</option><option value="SPLICED">มีรอยต่อ · รอแบบจำลองความแข็งรอยต่อ</option></select></label>
      <label className="field"><span>หลักฐานความต่อเนื่อง/รอยต่อของราง</span><input value={r.spliceEvidenceRef} onChange={e => updateRail(i, {spliceEvidenceRef: e.target.value})}/></label>
    </div><ElasticBindingEditor binding={r.binding ?? null} role="WALER" label={`RAIL:${r.id}`} selections={selections} onChange={binding => {
      const source = (b: IndependentWalerRail['binding']) => canonical(b ? {section: b.section, material: b.material, mode: b.sectionMode} : null);
      updateRail(i, {binding, E_MPa: null, bendingI_mm4: null, family: null, orientationDeg: null, sectionRef: '', materialRef: '', axisEvidenceRef: '',
        ...(source(binding) !== source(r.binding) ? {continuity: null, spliceStationsMm: [], spliceEvidenceRef: ''} : {})});
    }}/>{r.spliceStationsMm.map((x, j) => <div className="form-grid" key={j}><label className="field"><span>ตำแหน่งรอยต่อจาก A · mm</span><input type="number" step="any" value={x ?? ''} onChange={e => updateRail(i, {spliceStationsMm: r.spliceStationsMm.map((old, k) => k === j ? number(e.target.value) : old)})}/></label><button className="btn secondary" onClick={() => updateRail(i, {spliceStationsMm: r.spliceStationsMm.filter((_, k) => k !== j)})}>ลบรอยต่อ {j + 1}</button></div>)}
      <button className="btn secondary" disabled={r.spliceStationsMm.length >= 40} onClick={() => updateRail(i, {continuity: 'SPLICED', spliceStationsMm: [...r.spliceStationsMm, null]})}>เพิ่มตำแหน่งรอยต่อราง</button>
      <BeamMemberEvidenceEditor value={r.resistanceEvidence ?? []} memberEvidenceRef={beamMemberEvidenceReference('WALER_RAIL', {id: r.id, family: r.family, E_MPa: r.E_MPa, bendingI_mm4: r.bendingI_mm4,
        orientationDeg: r.orientationDeg, sectionRef: r.sectionRef, materialRef: r.materialRef, axisEvidenceRef: r.axisEvidenceRef, binding: r.binding ?? null})}
        onChange={resistanceEvidence => updateRail(i, {resistanceEvidence})}/>
    </fieldset>)}
    <div className="form-grid">
      <label className="field"><span>ส่วนแบ่งแรงรางชิ้นที่ 1 · 0 ถึง 1</span><input type="number" min="0" max="1" step="any" value={pair.rail1Share ?? ''} onChange={e => onChange({...pair, rail1Share: number(e.target.value)})}/></label>
      <label className="field"><span>หลักฐาน/สมมติฐานแบ่งแรงของรางคู่นี้</span><input value={pair.sharingEvidenceRef} onChange={e => onChange({...pair, sharingEvidenceRef: e.target.value})}/></label>
      <label className="field"><span>ช่องว่างใสระหว่างราง · mm</span><input type="number" min="0" step="any" value={pair.clearGapMm ?? ''} onChange={e => onChange({...pair, clearGapMm: number(e.target.value)})}/></label>
      <label className="field"><span>ทิศแยกรางตามผิว</span><select value={pair.separationAxis ?? ''} onChange={e => onChange({...pair, separationAxis: (e.target.value || null) as IndependentWalerPair['separationAxis']})}><option value="">ยังไม่ทราบ</option><option value="FACE_VERTICAL">บน–ล่างตาม Z ผิว</option><option value="FACE_NORMAL">ซ้อนตามแนว Normal · รอแบบจำลอง</option></select></label>
      <label className="field"><span>หลักฐานตำแหน่งช่องรางและทิศ</span><input value={pair.geometryEvidenceRef} onChange={e => onChange({...pair, geometryEvidenceRef: e.target.value})}/></label>
    </div>
    <p>พิกัด z และจุดรองรับยังเป็นแนวแรงอุดมคติของคู่ราง ระยะเยื้องแนวไทร์ ศูนย์สัมผัส ความลึกหน้าตัดและโมเมนต์ระหว่างรางต้องมีแบบจำลองเพิ่มเติมก่อนใช้ติดตั้ง</p>
    {pair.supportFittings.map((f, i) => <fieldset key={f.supportId} aria-label={`ข้อมูลแผ่นรองรับ ${f.supportId}`}><legend>แผ่น/ช่องผ่านที่จุด {f.supportId}{!supportIds.includes(f.supportId) ? ' · ไม่พบจุดนี้แล้ว ต้องตรวจใหม่' : ''}</legend><div className="form-grid">
      {([['plateRef', 'หลักฐานผลิตภัณฑ์/ขนาดแผ่น'], ['contactEvidenceRef', 'หลักฐานผิวสัมผัส/ตัวกันกลิ้ง']] as const).map(([key, label]) => <label className="field" key={key}><span>{label}</span><input value={f[key]} onChange={e => updateFitting(i, {[key]: e.target.value})}/></label>)}
      {([['plateWidthAcrossRailsMm', 'ความกว้างแผ่นข้ามราง · mm'], ['plateThicknessMm', 'ความหนาแผ่น · mm'], ['clearHoleDiameterMm', 'เส้นผ่านศูนย์กลางรูใส · mm'], ['requiredRadialClearanceMm', 'ช่องเผื่อติดตั้งต่อข้างที่กำหนด · mm']] as const).map(([key, label]) => <label className="field" key={key}><span>{label}</span><input type="number" step="any" value={f[key] ?? ''} onChange={e => updateFitting(i, {[key]: number(e.target.value)})}/></label>)}
    </div><button className="btn secondary" onClick={() => onChange({...pair, supportFittings: pair.supportFittings.filter((_, j) => i !== j)})}>ลบข้อมูลแผ่น {f.supportId}</button></fieldset>)}
    <button className="btn secondary" disabled={!supportIds.some(id => !pair.supportFittings.some(f => f.supportId === id))} onClick={() => onChange({...pair, supportFittings: [...pair.supportFittings, ...supportIds.filter(id => !pair.supportFittings.some(f => f.supportId === id)).map(supportId => ({supportId, plateRef: '', plateWidthAcrossRailsMm: null, plateThicknessMm: null, clearHoleDiameterMm: null, requiredRadialClearanceMm: null, contactEvidenceRef: ''}))]})}>เพิ่มข้อมูลแผ่นของจุดรองรับที่ยังขาด</button>
    <p>เว้นว่างคือ UNKNOWN ช่องเผื่อ 0 ใช้เมื่อระบุเองเท่านั้น การตรวจขนาดช่องไม่ใช่การตรวจกำลังแผ่นหรือความเข้ากันได้ของชุดไทร์ ข้อมูลรางแยกที่ยังไม่ครบหรือมีรอยต่อที่ยังคำนวณไม่ได้เก็บเป็นร่าง BLOCKED ได้ โดยไม่มีผลแรงที่ใช้ได้</p>
    <button className="btn secondary" onClick={() => onChange(null)}>ยกเลิกรางแยกและกลับใช้ค่ารางร่วมของผิว</button>
  </section>;
}
