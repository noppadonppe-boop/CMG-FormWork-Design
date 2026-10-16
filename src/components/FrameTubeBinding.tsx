import React, {useState} from 'react';
import {captureFrameElasticReference, captureFrameResearchGeometry, captureFrameSupplierGeometry, emptyFrameTubeBinding, validateFrameTubeBinding, type FrameTubeBinding} from '../domain/workflowV07/frameBinding';
import type {RinglockResearchSnapshot} from '../domain/workflowV07/ringlockResearch';
import {resolveSupplierCatalogue} from '../domain/workflowV07/ringlockSuppliers';

export function FrameTubeBindingSummary({binding}: {binding: FrameTubeBinding}) {
  try {
    validateFrameTubeBinding(binding);
    const r = binding.researchSnapshot, s = binding.supplierSnapshot, elastic = binding.elasticSnapshot;
    const component = s ? resolveSupplierCatalogue(s).components.find(c => c.id === s.selection.componentId) : null;
    const original = s?.original.components.find(c => c.id === s.selection.componentId);
    const show = (v: unknown) => v === null || v === undefined ? 'UNKNOWN' : String(v);
    return <div className="frame-tube-binding-summary"><p>สำเนาหน้าตัดรายสมาชิก · {binding.geometrySource ?? 'ยังไม่เลือก'} · ท่อกลมช่วงตรง / Gross / NO_GO</p>
      {r && <p>กลุ่ม {show(r.group?.id)} · หน้าที่ {show(r.choice.role)} · หน้าตัด {show(r.section?.id)} · D/t {show(r.section?.D_mm)} / {show(r.section?.t_mm)} mm · {r.sourceVersion}</p>}
      {s && <><p>ผู้จำหน่าย {s.selection.supplierId} · ระบบ {s.selection.familyId} · ชิ้นส่วน {s.selection.componentId} · หน้าที่ {show(component?.role)}</p>
        <p>D/t ต้นฉบับ {show(original?.D_mm)} / {show(original?.t_mm)} mm → ค่าในสำเนา {show(component?.D_mm)} / {show(component?.t_mm)} mm · ประวัติแก้ {s.edits.length} รายการ</p>
        <p>E ที่ผู้จำหน่ายระบุ {show(component?.E_MPa)} MPa · เกรด {show(component?.published_grade_label)} · แยกจากสมมติฐาน Elastic ที่เลือก</p></>}
      <p>สมมติฐาน Elastic ที่บันทึก: {show(elastic?.reference.id)} · E {show(elastic?.reference.E_MPa)} MPa / G {show(elastic?.reference.G_MPa)} MPa</p>
      <p>ช่วงตรง: {binding.straightSegmentEvidenceRef || 'UNKNOWN'} · จับคู่สินค้าจริง: {binding.actualProductMatchEvidenceRef || 'UNKNOWN'} · ฐาน E/G: {binding.elasticBasisEvidenceRef || 'UNKNOWN'}</p>
      <p>SHA-256 หน้าตัด: {r?.sourceSha256 ?? s?.sourceSha256 ?? 'UNKNOWN'} · Elastic: {elastic?.sourceSha256 ?? 'UNKNOWN'}</p>
      <details><summary>ต้นฉบับและประวัติอ้างอิงที่เก็บกับสมาชิก</summary><pre>{JSON.stringify(binding, null, 2)}</pre></details>
    </div>;
  } catch (e) {return <p role="alert">สำเนาข้อมูลท่อไม่สมบูรณ์: {(e as Error).message}</p>;}
}
export function FrameTubeBindingEditor({value, role, kind, referenceSnapshot, onChange}: {
  value: FrameTubeBinding | null; role: string | null; kind: string | null; referenceSnapshot: RinglockResearchSnapshot | null;
  onChange: (binding: FrameTubeBinding | null, sourceChanged: boolean) => void;
}) {
  const [error, setError] = useState('');
  const allowed = ['STANDARD', 'LEDGER', 'BRACE'].includes(role ?? '') && (kind === 'BEAM_COLUMN' || (role === 'BRACE' && kind === 'AXIAL_BAR'));
  const perform = (action: () => void) => {try {action(); setError('');} catch (e) {setError((e as Error).message);}};
  return <fieldset className="frame-tube-binding-editor"><legend>ผูกหน้าตัด Ringlock กับสมาชิกรายชิ้น</legend>
    <p>ใช้ได้เฉพาะท่อกลมช่วงตรงของ Standard, Ledger และ Brace ต้องระบุขอบเขตชิ้นส่วนจริง จุดต่อ Jack และ Spigot ยังต้องมีแบบจำลองของตนเอง ข้อมูลนี้ไม่ให้กำลังรับน้ำหนักระบบ</p>
    {!value ? <button className="btn secondary" disabled={!allowed} onClick={() => onChange(emptyFrameTubeBinding(), true)}>เริ่มผูกข้อมูลท่อช่วงตรง</button> : <>
      <p>คัดลอกข้อมูลที่เลือกไว้เป็นสำเนาของสมาชิกนี้ การเปลี่ยนรายการอ้างอิงส่วนกลางจะไม่เปลี่ยนสำเนาเดิม ต้องคัดลอกใหม่เอง</p>
      <button className="btn secondary" disabled={!allowed || !referenceSnapshot?.section} onClick={() => perform(() => {
        if (!referenceSnapshot) throw Error('ยังไม่มีข้อมูลอ้างอิง');
        onChange({...value, geometrySource: 'RESEARCH_REFERENCE', researchSnapshot: captureFrameResearchGeometry(referenceSnapshot), supplierSnapshot: null, straightSegmentEvidenceRef: '', actualProductMatchEvidenceRef: ''}, true);
      })}>คัดลอกหน้าตัดจากชุด Ringlock อ้างอิงที่เลือก</button>
      <button className="btn secondary" disabled={!allowed || !referenceSnapshot?.choice.supplierCatalogue?.selection.componentId} onClick={() => perform(() => {
        const state = referenceSnapshot?.choice.supplierCatalogue; if (!state) throw Error('ยังไม่มีชิ้นส่วนผู้จำหน่ายที่เลือก');
        onChange({...value, geometrySource: 'SUPPLIER_COMPONENT', supplierSnapshot: captureFrameSupplierGeometry(state), researchSnapshot: null, straightSegmentEvidenceRef: '', actualProductMatchEvidenceRef: ''}, true);
      })}>คัดลอกชิ้นส่วนผู้จำหน่ายที่เลือก</button>
      <button className="btn secondary" disabled={!allowed || !referenceSnapshot?.elastic} onClick={() => perform(() => {
        if (!referenceSnapshot) throw Error('ยังไม่มีสมมติฐาน Elastic ที่เลือก');
        onChange({...value, elasticSnapshot: captureFrameElasticReference(referenceSnapshot), elasticBasisEvidenceRef: ''}, true);
      })}>คัดลอกสมมติฐาน E/G ที่เลือกแยกต่างหาก</button>
      <div className="form-grid">{([['straightSegmentEvidenceRef', 'ขอบเขตท่อตรงและหลักฐานช่วง I–J'], ['actualProductMatchEvidenceRef', 'หลักฐานจับคู่ชิ้นส่วนจริงกับรายการอ้างอิง'], ['elasticBasisEvidenceRef', 'หลักฐาน/สมมติฐานการใช้ E/G ในโครงการ']] as const).map(([key, label]) => <label className="field" key={key}><span>{label}</span><input value={value[key]} onChange={e => onChange({...value, [key]: e.target.value}, false)}/></label>)}</div>
      <FrameTubeBindingSummary binding={value}/>
      <button className="btn secondary" onClick={() => onChange(null, true)}>ยกเลิกการผูกท่อและเว้นสมบัติให้กรอกใหม่</button>
    </>}
    <p>ไม่สร้างน้ำหนักตัวเองจากค่า Gross โดยอัตโนมัติ ต้องตรวจ Ownership ของน้ำหนักและสมมติฐานใหม่เมื่อเปลี่ยนชิ้นส่วน</p>
    {error && <p role="alert">{error}</p>}
  </fieldset>;
}
