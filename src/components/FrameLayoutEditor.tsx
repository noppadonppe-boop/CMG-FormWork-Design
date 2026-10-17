import React, {useEffect, useState} from 'react';
import {canonical, clone} from '../domain/workflowV07/common';
import {emptyFrameElement, emptyFrameLayout, FRAME_ROLES, unknownFrameBoundary, type AppliedFrameLayout, type FrameBoundaryDraft, type FrameElementDraft, type FrameLayoutDefinition, type NullableVector} from '../domain/workflowV07/frameWorkflow';
import {emptySecondOrderDefinition} from '../domain/workflowV07/frameSecondOrder';
import {FrameTubeBindingEditor} from './FrameTubeBinding';
import type {RinglockResearchSnapshot} from '../domain/workflowV07/ringlockResearch';
import {SideFrameMappingEditor} from './SideFrameMappingEditor';
import type {SideEndpoint} from '../domain/workflowV07/sideLayout';
import {emptyResistanceEvidence, RESISTANCE_QUANTITIES, type ResistanceActionBasis, type ResistanceBasis, type ResistanceEvidence, type ResistanceEvidenceStatus, type ResistanceQuantity} from '../domain/workflowV07/resistanceEvidence';
import {emptySlsLimitEvidence, SLS_QUANTITIES, type SlsEvidenceStatus, type SlsLimitEvidence, type SlsQuantity} from '../domain/workflowV07/frameSls';
import {entriesForCheck, resistanceEvidenceFromRegistry} from '../domain/workflowV07/registry';
import {useRegistry} from './RegistryContext';

const number = (value: string) => value.trim() === '' ? null : Number.isFinite(Number(value)) ? Number(value) : null;
const roleNames: Record<string, string> = {STANDARD: 'เสาตั้ง Standard', LEDGER: 'Ledger', BRACE: 'ค้ำเฉียง', HEAD_JACK: 'Head jack', BASE_JACK: 'Base jack', SPIGOT: 'Spigot', LEDGER_JOINT: 'จุดต่อ Ledger', BRACE_JOINT: 'จุดต่อค้ำเฉียง', OTHER: 'อื่น ๆ ตามแบบจำลอง'};
const resistanceNames: Record<string, string> = {AXIAL_COMPRESSION: 'แรงอัดแกน · N', AXIAL_TENSION: 'แรงดึงแกน · N', SHEAR_Y: 'แรงเฉือน local Y · N', SHEAR_Z: 'แรงเฉือน local Z · N', TORSION: 'แรงบิด · N·mm', MOMENT_Y: 'โมเมนต์ local Y · N·mm', MOMENT_Z: 'โมเมนต์ local Z · N·mm'};
const slsNames: Record<string, string> = {TRANSLATION_X: 'เลื่อน X · mm', TRANSLATION_Y: 'เลื่อน Y · mm', TRANSLATION_Z: 'เลื่อน Z · mm', ROTATION_X: 'หมุน X · rad', ROTATION_Y: 'หมุน Y · rad', ROTATION_Z: 'หมุน Z · rad'};
function definitionOf(layout: AppliedFrameLayout | null): FrameLayoutDefinition {
  if (!layout) return emptyFrameLayout(); const {revisionId: _revision, inputDefinition: _input, ...definition} = layout; return clone(definition);
}
export function FrameLayoutEditor({layout, headIds, captureEnabled, onCapture, onApply, onPendingChange, onDraftChange, referenceSnapshot = null, captureAssemblyEnabled = false, onCaptureAssembly, sideSources = [], captureSideEnabled = false, onCaptureSide, sideTieIds = [], sideWalers = []}: {
  layout: AppliedFrameLayout | null; headIds: string[]; captureEnabled: boolean; onCapture: () => FrameLayoutDefinition;
  onApply: (definition: FrameLayoutDefinition) => void; onPendingChange: (pending: boolean) => void; onDraftChange: (definition: FrameLayoutDefinition) => void;
  referenceSnapshot?: RinglockResearchSnapshot | null;
  captureAssemblyEnabled?: boolean; onCaptureAssembly?: () => FrameLayoutDefinition;
  sideSources?: SideEndpoint[]; captureSideEnabled?: boolean; onCaptureSide?: () => FrameLayoutDefinition;
  sideTieIds?: string[]; sideWalers?: {faceId: string; walerId: string}[];
}) {
  const [form, setForm] = useState(() => definitionOf(layout)), [error, setError] = useState('');
  const identity = canonical(definitionOf(layout));
  useEffect(() => {setForm(definitionOf(layout)); setError(''); onPendingChange(false);}, [identity, onPendingChange]);
  useEffect(() => () => onPendingChange(false), [onPendingChange]);
  function change(next: FrameLayoutDefinition) {setForm(next); setError(''); onPendingChange(canonical(next) !== canonical(definitionOf(layout))); onDraftChange(next);}
  function vector(values: NullableVector, labels: string[], update: (v: NullableVector) => void) {
    return <div className="form-grid frame-vector">{values.map((v, i) => <label className="field" key={i}><span>{labels[i]}</span><input type="number" step="any" value={v ?? ''} onChange={e => update(values.map((old, n) => n === i ? number(e.target.value) : old) as NullableVector)}/></label>)}</div>;
  }
  function updateNode(i: number, patch: Partial<FrameLayoutDefinition['nodes'][number]>) {change({...form, nodes: form.nodes.map((n, j) => j === i ? {...n, ...patch} : n)});}
  function updateElement(i: number, patch: Partial<FrameElementDraft>) {change({...form, elements: form.elements.map((e, j) => j === i ? {...e, ...patch} : e)});}
  function updateSls(i: number, patch: Partial<SlsLimitEvidence>) {change({...form, sls: (form.sls ?? []).map((r, j) => j === i ? {...r, ...patch} : r)});}
  function chooseNode(value: string, update: (id: string) => void) {return <select value={value} onChange={e => update(e.target.value)}><option value="">ยังไม่เลือกจุด</option>{form.nodes.map(n => <option key={n.id} value={n.id}>{n.id} · {n.role ?? 'ยังไม่ระบุหน้าที่'}</option>)}</select>;}
  function addId(prefix: string, ids: string[]) {let n = 1; while (ids.includes(`${prefix}${n}`)) n++; return `${prefix}${n}`;}
  return <fieldset className="frame-editor"><legend>เฟรม 3D · ร่างแรงอันดับหนึ่ง</legend>
    <p>ใช้กรอกสมมติฐานเพื่อดูแรงและการเคลื่อนตัว ยังไม่ตรวจ P–Delta/P–delta เสถียรภาพ กำลังสมาชิกหรือจุดต่อ ค่าที่ไม่ทราบให้เว้นว่าง</p>
    <div className="form-grid">{([['stageId', 'Stage เฟรม'], ['loadCaseId', 'Load case เฟรม'], ['assumptionEvidenceRef', 'หลักฐาน/สมมติฐานของเฟรม']] as const).map(([key, label]) => <label className="field" key={key}><span>{label}</span><input value={form[key]} onChange={e => change({...form, [key]: e.target.value})}/></label>)}</div>
    <label className="field"><span>ฐานแรงสำหรับเฟรม</span><select value={form.actionBasis ?? ''} onChange={e => change({...form, actionBasis: e.target.value === 'SERVICE' ? 'SERVICE' : null})}><option value="">ยังไม่ระบุ</option><option value="SERVICE">แรงบริการที่ระบุ · ยังไม่มีชุด Load Combinations</option></select></label>
    <label className="confirm"><input type="checkbox" checked={form.acknowledgeLinearScope} onChange={e => change({...form, acknowledgeLinearScope: e.target.checked})}/>รับทราบว่าผลเฟรมนี้เป็นแรงอันดับหนึ่ง และยังไม่ใช่ผลตรวจระบบผ่าน</label>
    <fieldset className="frame-second-order-editor"><legend>การวิเคราะห์อันดับสองแบบ P–Delta · ยังเป็น Screening</legend>
      <p>เปิดใช้ได้เมื่อมีหลักฐาน imperfection ของทุกจุดจริงและค่าควบคุมการวนซ้ำครบ ระบบไม่เติมความโก่งเป็นศูนย์ให้เอง ผลยังไม่ใช่กำลังสมาชิก จุดต่อ หรือการยอมรับระบบ Ringlock</p>
      {!form.secondOrder && <button className="btn secondary" onClick={() => change({...form, secondOrder: emptySecondOrderDefinition()})}>เปิดบันทึก P–Delta</button>}
      {form.secondOrder && <>
        <div className="form-grid">
          <label className="field"><span>หลักฐานวิธี P–Delta</span><input value={form.secondOrder.evidenceRef} onChange={e => change({...form, secondOrder: {...form.secondOrder!, evidenceRef: e.target.value}})}/></label>
          <label className="field"><span>จำนวนรอบสูงสุด</span><input type="number" min="1" max="50" step="1" value={form.secondOrder.maxIterations} onChange={e => change({...form, secondOrder: {...form.secondOrder!, maxIterations: number(e.target.value) ?? 0}})}/></label>
          <label className="field"><span>เกณฑ์เปลี่ยนการเคลื่อน · mm</span><input type="number" step="any" value={form.secondOrder.displacementToleranceMm} onChange={e => change({...form, secondOrder: {...form.secondOrder!, displacementToleranceMm: number(e.target.value) ?? 0}})}/></label>
          <label className="field"><span>เกณฑ์เปลี่ยนแรงแกน · N</span><input type="number" step="any" value={form.secondOrder.axialForceToleranceN} onChange={e => change({...form, secondOrder: {...form.secondOrder!, axialForceToleranceN: number(e.target.value) ?? 0}})}/></label>
        </div>
        <label className="confirm"><input type="checkbox" checked={form.secondOrder.includeTensionStiffening} onChange={e => change({...form, secondOrder: {...form.secondOrder!, includeTensionStiffening: e.target.checked}})}/>รวม geometric stiffness จากแรงดึงตามหลักฐานวิธีที่ระบุ</label>
        <h4>Imperfection รายจุด ({form.secondOrder.imperfections.length}/{form.nodes.length})</h4>
        {form.nodes.map(n => {
          const row = form.secondOrder!.imperfections.find(i => i.nodeId === n.id);
          if (!row) return <p key={n.id}><button className="btn secondary" onClick={() => change({...form, secondOrder: {...form.secondOrder!, imperfections: [...form.secondOrder!.imperfections, {nodeId: n.id, offsetMm: [null, null, null] as unknown as [number, number, number], evidenceRef: ''}]}})}>เพิ่ม imperfection ของ {n.id}</button></p>;
          return <div className="frame-imperfection-editor" key={n.id}><strong>{n.id}</strong>{vector(row.offsetMm as NullableVector, ['ΔX · mm', 'ΔY · mm', 'ΔZ · mm'], offsetMm => change({...form, secondOrder: {...form.secondOrder!, imperfections: form.secondOrder!.imperfections.map(i => i.nodeId === n.id ? {...i, offsetMm: offsetMm as unknown as [number, number, number]} : i)}}))}<label className="field"><span>หลักฐาน imperfection ของ {n.id}</span><input value={row.evidenceRef} onChange={e => change({...form, secondOrder: {...form.secondOrder!, imperfections: form.secondOrder!.imperfections.map(i => i.nodeId === n.id ? {...i, evidenceRef: e.target.value} : i)}})}/></label><button className="btn secondary" onClick={() => change({...form, secondOrder: {...form.secondOrder!, imperfections: form.secondOrder!.imperfections.filter(i => i.nodeId !== n.id)}})}>ลบ imperfection ของ {n.id}</button></div>;
        })}
        <button className="btn secondary" onClick={() => change({...form, secondOrder: null})}>ปิดบันทึก P–Delta</button>
      </>}
    </fieldset>
    <fieldset className="frame-sls-editor"><legend>SLS · ขีดจำกัดการเคลื่อนตัวที่ผู้ใช้ป้อน</legend>
      <p>ต้องมี limit จาก Design Basis/มาตรฐานและหลักฐานของ revision เดียวกัน ระบบไม่กำหนดค่า limit เอง ไม่แทน rotation ที่ไม่ทราบด้วยศูนย์ และผล SCREENED ยังไม่ใช่การอนุมัติก่อสร้าง</p>
      {(form.sls ?? []).map((r, ri) => <div className="form-grid frame-sls-row" key={`sls-${ri}`}>
        <label className="field"><span>จุดจริง</span><select value={r.nodeId} onChange={ev => updateSls(ri, {nodeId: ev.target.value})}><option value="">ยังไม่เลือก</option>{form.nodes.map(n => <option key={n.id} value={n.id}>{n.id}</option>)}</select></label>
        <label className="field"><span>ปริมาณ SLS</span><select value={r.quantity ?? ''} onChange={ev => {const quantity = (ev.target.value || null) as SlsQuantity | null; const nodeId = r.nodeId; change({...form, sls: (form.sls ?? []).map((old, j) => j === ri ? emptySlsLimitEvidence(nodeId, quantity) : old)});}}><option value="">ยังไม่ระบุ</option>{SLS_QUANTITIES.map(q => <option key={q} value={q}>{slsNames[q]}</option>)}</select></label>
        <label className="field"><span>หน่วย / Limit</span><span>{r.unit ?? 'UNKNOWN'} · </span><input type="number" min="0" step="any" value={r.limit ?? ''} onChange={ev => updateSls(ri, {limit: number(ev.target.value)})}/></label>
        <label className="field"><span>ฐานแรง</span><select value={r.actionBasis ?? ''} onChange={ev => updateSls(ri, {actionBasis: ev.target.value ? 'SERVICE' : null})}><option value="">ยังไม่ระบุ</option><option value="SERVICE">SERVICE</option></select></label>
        <label className="field"><span>Method ID</span><input value={r.methodId} onChange={ev => updateSls(ri, {methodId: ev.target.value})}/></label><label className="field"><span>Source ref</span><input value={r.sourceRef} onChange={ev => updateSls(ri, {sourceRef: ev.target.value})}/></label><label className="field"><span>Source revision</span><input value={r.sourceRevision} onChange={ev => updateSls(ri, {sourceRevision: ev.target.value})}/></label><label className="field"><span>Evidence ref</span><input value={r.evidenceRef} onChange={ev => updateSls(ri, {evidenceRef: ev.target.value})}/></label><label className="field"><span>Review ref</span><input value={r.reviewRef} onChange={ev => updateSls(ri, {reviewRef: ev.target.value})}/></label>
        <label className="field"><span>สถานะหลักฐาน</span><select value={r.status} onChange={ev => updateSls(ri, {status: ev.target.value as SlsEvidenceStatus})}><option value="REFERENCE_ONLY">REFERENCE_ONLY · ยังไม่ review</option><option value="ENGINEER_REVIEWED">ENGINEER_REVIEWED · ต้องมี Review ref</option></select></label>
        <button className="btn secondary" onClick={() => change({...form, sls: (form.sls ?? []).filter((_, j) => j !== ri)})}>ลบ SLS {ri + 1}</button>
      </div>)}
      <button className="btn secondary" onClick={() => change({...form, sls: [...(form.sls ?? []), emptySlsLimitEvidence('', null)]})}>เพิ่มแถว SLS limit</button>
    </fieldset>
    <label className="field"><span>แหล่งแรงของกรณีเฟรม</span><select value={form.loadSource ?? ''} onChange={e => {const source = e.target.value as FrameLayoutDefinition['loadSource']; change({...form, loadSource: source || null,
      ...(!['SOFFIT_REACTIONS', 'SOFFIT_AND_SIDE_REACTIONS'].includes(source ?? '') ? {headMappings: []} : {}),
      ...(!['SIDE_REACTIONS', 'SOFFIT_AND_SIDE_REACTIONS'].includes(source ?? '') ? {sideTransfers: null} : {})});}}><option value="">ยังไม่เลือก</option><option value="SOFFIT_REACTIONS">แรงราย U-head จากแบบท้องใน Stage/Case เดียวกัน</option><option value="SIDE_REACTIONS">แรงรายจุดจากแบบข้าง · Yoke / Ground braced / จุดที่ไม่ผูกไทร์ในระบบผสม</option><option value="SOFFIT_AND_SIDE_REACTIONS">แรงรายหัวแบบท้องและรายจุดแบบข้าง</option><option value="FRAME_ACTIONS_ONLY">กรณีเฟรมแยก เช่นขั้นตั้ง · ไม่รวมแรงแบบท้องหรือแบบข้าง</option></select></label>
    <p>เมื่อเปลี่ยนแหล่งแรง การผูกของแหล่งที่เอาออกจะถูกล้าง ต้องเลือกและให้หลักฐานใหม่เมื่อนำกลับมา</p>
    {form.loadSource === 'FRAME_ACTIONS_ONLY' && <label className="field"><span>เหตุผลของกรณีแยกที่ไม่รวมแรงแบบท้อง</span><input value={form.excludeSoffitReason} onChange={e => change({...form, excludeSoffitReason: e.target.value})}/></label>}
    <button className="btn secondary" disabled={!captureEnabled || form.nodes.length > 0 || form.elements.length > 0} onClick={() => {try {change(onCapture());} catch (e) {setError((e as Error).message);}}}>เริ่มจุดหัว/ฐานจากแบบท้องที่วิเคราะห์แล้ว</button>
    <p>นำเข้าเฉพาะพิกัดหัวและฐานที่มีอยู่ ไม่สร้างสมาชิก ไม่กำหนดจุดยึดหรือสมบัติวัสดุ ต้องแยกเสา Jack และ Spigot ตามรายละเอียดจริง</p>
    {onCaptureSide && <><button className="btn secondary" disabled={!captureSideEnabled || form.nodes.length > 0 || form.elements.length > 0} onClick={() => {try {change(onCaptureSide());} catch (e) {setError((e as Error).message);}}}>เริ่มพิกัดจุดรองรับจากแบบข้างที่วิเคราะห์แล้ว</button><p>ใช้กับเฟรมว่างเท่านั้น ไม่สร้าง Anchor หรือฐาน ไม่เติมสมาชิก จุดยึด สมบัติวัสดุ หรือหลักฐานจุดต่อ หากรับแรงแบบท้องร่วมด้วยต้องเพิ่มจุดและการผูกอีกแหล่งให้ครบ</p></>}
    {onCaptureAssembly && <><button className="btn secondary" disabled={!captureAssemblyEnabled || form.nodes.length > 0 || form.elements.length > 0} onClick={() => {try {change(onCaptureAssembly());} catch (e) {setError((e as Error).message);}}}>เตรียมพิกัดเฟรมจากการประกอบที่ตรวจ Datum แล้ว</button>
      <p>ใช้ได้กับเฟรมว่างเท่านั้น แยก Standard, Jack และ Spigot ตามพิกัดที่บันทึก รอยต่อ Gap 0 มีสองจุดซ้อนกันและสปริงที่ยังไม่ทราบความแข็ง ไม่สมมติจุดต่อแข็งหรือจุดยึดฐาน</p></>}
    <h4>จุดจริง ({form.nodes.length}/80)</h4>
    {form.nodes.map((n, i) => <details key={i} className="frame-node-editor" aria-label={`จุดเฟรม ${n.id}`}><summary>{n.id} · {n.role ?? 'ยังไม่ระบุหน้าที่'}</summary>
      <div className="form-grid"><label className="field"><span>รหัสจุดเฟรม</span><input value={n.id} onChange={e => updateNode(i, {id: e.target.value})}/></label><label className="field"><span>หน้าที่จุดเฟรม</span><select value={n.role ?? ''} onChange={e => updateNode(i, {role: (e.target.value || null) as typeof n.role})}><option value="">ยังไม่ระบุ</option>{['HEAD', 'SIDE_SUPPORT', 'BASE', 'ROSETTE', 'SPLICE', 'OTHER'].map(r => <option key={r}>{r}</option>)}</select></label></div>
      {vector(n.pointMm, ['X จริง · mm', 'Y จริง · mm', 'Z จริง · mm'], pointMm => updateNode(i, {pointMm}))}
      <div className="form-grid">{n.boundary.map((b, d) => <label className="field" key={d}><span>{['UX · mm', 'UY · mm', 'UZ · mm', 'RX · rad', 'RY · rad', 'RZ · rad'][d]}</span><select value={b.kind} onChange={e => {
        const kind = e.target.value as FrameBoundaryDraft['kind'], next: FrameBoundaryDraft = kind === 'PRESCRIBED' ? {kind, value: null} : {kind}; updateNode(i, {boundary: n.boundary.map((old, j) => j === d ? next : old)});
      }}><option value="UNKNOWN">ยังไม่ทราบ</option><option value="FREE">อิสระ</option><option value="FIXED">กำหนดอยู่กับที่ 0</option><option value="PRESCRIBED">กำหนดการเคลื่อน/หมุน</option></select>{b.kind === 'PRESCRIBED' && <input type="number" step="any" value={b.value ?? ''} onChange={e => updateNode(i, {boundary: n.boundary.map((old, j) => j === d ? {kind: 'PRESCRIBED', value: number(e.target.value)} : old)})}/>}</label>)}</div>
      <label className="field"><span>หลักฐานพิกัดและเงื่อนไขจุดเฟรม</span><input value={n.evidenceRef} onChange={e => updateNode(i, {evidenceRef: e.target.value})}/></label>
      {n.role === 'BASE' && <ResistanceList title="หลักฐานกำลัง Anchor ฐาน (แรงดึงขึ้น = AXIAL_TENSION, แรงนอนรวม = SHEAR_Y)" quantities={['AXIAL_TENSION', 'SHEAR_Y']} value={n.anchorResistance ?? []} onChange={anchorResistance => updateNode(i, {anchorResistance})}/>}
      <button className="btn secondary" onClick={() => change({...form, nodes: form.nodes.filter((_, j) => j !== i)})}>ลบจุดเฟรม {n.id}</button>
    </details>)}
    <button className="btn secondary" disabled={form.nodes.length >= 80} onClick={() => change({...form, nodes: [...form.nodes, {id: addId('N', form.nodes.map(n => n.id)), role: null, pointMm: [null, null, null], boundary: unknownFrameBoundary(), evidenceRef: ''}]})}>เพิ่มจุดเฟรม</button>
    <h4>สมาชิกและจุดต่อจริง ({form.elements.length}/240)</h4>
    {form.elements.map((e, i) => <details key={i} className="frame-member-editor" aria-label={`สมาชิกเฟรม ${e.id}`}><summary>{e.id} · {e.role ? roleNames[e.role] : 'ยังไม่ระบุชิ้นส่วน'}</summary><div className="form-grid">
      <label className="field"><span>รหัสสมาชิกเฟรม</span><input value={e.id} onChange={ev => updateElement(i, {id: ev.target.value})}/></label>
      <label className="field"><span>ชิ้นส่วนที่แทนจริง</span><select value={e.role ?? ''} onChange={ev => {const blank = emptyFrameElement(e.id); updateElement(i, {...blank, nodeI: e.nodeI, nodeJ: e.nodeJ, role: (ev.target.value || null) as typeof e.role, kind: e.kind});}}><option value="">ยังไม่ระบุ</option>{FRAME_ROLES.map(r => <option key={r} value={r}>{roleNames[r]}</option>)}</select></label>
      <label className="field"><span>ชนิดแบบจำลองสมาชิก</span><select value={e.kind ?? ''} onChange={ev => updateElement(i, {kind: (ev.target.value || null) as typeof e.kind, ...(['', 'JOINT_SPRING'].includes(ev.target.value) ? {binding: null, E_MPa: null, G_MPa: null, A_mm2: null, Iy_mm4: null, Iz_mm4: null, J_mm4: null, evidenceRef: ''} : {})})}><option value="">ยังไม่ระบุ</option><option value="BEAM_COLUMN">คาน–เสา 3D · แกน/ดัด/บิด</option><option value="AXIAL_BAR">สมาชิกแรงตามแกนเท่านั้น</option><option value="JOINT_SPRING">สปริงจุดต่อเชิงเส้น 6 แกน</option></select></label>
      <label className="field"><span>จุด I ของสมาชิก</span>{chooseNode(e.nodeI, nodeI => updateElement(i, {nodeI}))}</label><label className="field"><span>จุด J ของสมาชิก</span>{chooseNode(e.nodeJ, nodeJ => updateElement(i, {nodeJ}))}</label>
    </div><FrameTubeBindingEditor value={e.binding ?? null} role={e.role} kind={e.kind} referenceSnapshot={referenceSnapshot} onChange={(binding, sourceChanged) => updateElement(i, {binding, E_MPa: null, G_MPa: null, A_mm2: null, Iy_mm4: null, Iz_mm4: null, J_mm4: null, ...(sourceChanged ? {evidenceRef: ''} : {})})}/>
    {e.kind !== 'JOINT_SPRING' && <div className="form-grid">{(['E_MPa', 'G_MPa', 'A_mm2', 'Iy_mm4', 'Iz_mm4', 'J_mm4'] as const).filter(k => e.kind !== 'AXIAL_BAR' || ['E_MPa', 'A_mm2'].includes(k)).map(k => <label className="field" key={k}><span>{{E_MPa: 'E · MPa', G_MPa: 'G · MPa', A_mm2: 'A · mm²', Iy_mm4: 'Iy · mm⁴', Iz_mm4: 'Iz · mm⁴', J_mm4: 'J บิด · mm⁴'}[k]}</span><input type="number" step="any" value={e[k] ?? ''} disabled={!!e.binding} onChange={ev => updateElement(i, {[k]: number(ev.target.value)})}/></label>)}</div>}
      {e.kind === 'JOINT_SPRING' && <>{vector(e.localX, ['ทิศแกน local X: global X', 'ทิศแกน local X: global Y', 'ทิศแกน local X: global Z'], localX => updateElement(i, {localX}))}<div className="form-grid">{e.stiffness.map((v, d) => <label className="field" key={d}><span>{['kx · N/mm', 'ky · N/mm', 'kz · N/mm', 'krx · N·mm/rad', 'kry · N·mm/rad', 'krz · N·mm/rad'][d]}</span><input type="number" step="any" value={v ?? ''} onChange={ev => updateElement(i, {stiffness: e.stiffness.map((old, j) => j === d ? number(ev.target.value) : old)})}/></label>)}</div><p>จุดสปริงต้องซ้อนพิกัดกัน 0 คือประกาศปล่อยแกนนั้น ว่างคือยังไม่ทราบ ไม่สร้างค่าความแข็งจากกำลังรับแรง</p></>}
      {e.kind !== 'AXIAL_BAR' && vector(e.localY, ['ทิศอ้างอิง local Y: global X', 'ทิศอ้างอิง local Y: global Y', 'ทิศอ้างอิง local Y: global Z'], localY => updateElement(i, {localY}))}
      <label className="field"><span>หลักฐานสมาชิก/หน้าตัด/วัสดุ/แกน/จุดต่อ</span><input value={e.evidenceRef} onChange={ev => updateElement(i, {evidenceRef: ev.target.value})}/></label>
      {e.kind === 'AXIAL_BAR' && <>
        <label className="confirm"><input type="checkbox" checked={!!e.tensionOnly} onChange={ev => updateElement(i, {tensionOnly: ev.target.checked})}/>รับแรงดึงเท่านั้น (ค้ำยันเส้นเดี่ยว/สายดึง) · ตัดออกจากการวิเคราะห์เมื่อเกิดแรงอัดในกรณีนั้น</label>
        <ResistanceList title={`หลักฐานจุดยึดปลาย I (${e.nodeI || '?'})`} quantities={['AXIAL_TENSION', 'AXIAL_COMPRESSION']} value={e.endResistance?.I ?? []} onChange={I => updateElement(i, {endResistance: {I, J: e.endResistance?.J ?? null}})}/>
        <ResistanceList title={`หลักฐานจุดยึดปลาย J (${e.nodeJ || '?'})`} quantities={['AXIAL_TENSION', 'AXIAL_COMPRESSION']} value={e.endResistance?.J ?? []} onChange={J => updateElement(i, {endResistance: {I: e.endResistance?.I ?? null, J}})}/>
      </>}
      <details className="frame-resistance-editor"><summary>หลักฐานกำลังสมาชิก/จุดต่อ ({e.resistance?.length ?? 0})</summary>
        <p>กรอกเฉพาะค่ากำลังที่มีเอกสารอ้างอิงและผู้ตรวจระบุครบ ระบบไม่เติมค่าจาก Catalogue, characteristic หรือผลทดสอบเอง; ค่าว่างยังเป็น INCOMPLETE และผลที่คำนวณได้ยังเป็น NO_GO</p>
        {(e.resistance ?? []).map((r, ri) => {const updateResistance = (patch: Partial<ResistanceEvidence>) => updateElement(i, {resistance: (e.resistance ?? []).map((old, j) => j === ri ? {...old, ...patch} : old)}); return <div className="form-grid frame-resistance-row" key={`${e.id}-resistance-${ri}`}>
          <label className="field"><span>ปริมาณกำลัง</span><select value={r.quantity ?? ''} onChange={ev => {const quantity = (ev.target.value || null) as ResistanceQuantity | null; updateElement(i, {resistance: (e.resistance ?? []).map((old, j) => j === ri ? emptyResistanceEvidence(quantity) : old)});}}><option value="">ยังไม่ระบุ</option>{RESISTANCE_QUANTITIES.map(q => <option key={q} value={q}>{resistanceNames[q]}</option>)}</select></label>
          <label className="field"><span>หน่วย / Capacity</span><span>{r.unit ?? 'UNKNOWN'} · </span><input type="number" min="0" step="any" value={r.capacity ?? ''} onChange={ev => updateResistance({capacity: number(ev.target.value)})}/></label>
          <label className="field"><span>ฐานแรงของค่า</span><select value={r.actionBasis ?? ''} onChange={ev => updateResistance({actionBasis: (ev.target.value || null) as ResistanceActionBasis})}><option value="">ยังไม่ระบุ</option><option value="SERVICE">SERVICE</option><option value="FACTORED">FACTORED</option></select></label>
          <label className="field"><span>ฐานกำลัง</span><select value={r.resistanceBasis ?? ''} onChange={ev => updateResistance({resistanceBasis: (ev.target.value || null) as ResistanceBasis})}><option value="">ยังไม่ระบุ</option><option value="ALLOWABLE">ALLOWABLE</option><option value="DESIGN">DESIGN</option><option value="CHARACTERISTIC">CHARACTERISTIC · ยังเทียบไม่ได้</option><option value="ULTIMATE_TEST">ULTIMATE_TEST · ยังเทียบไม่ได้</option></select></label>
          <label className="field"><span>Method ID</span><input value={r.methodId} onChange={ev => updateResistance({methodId: ev.target.value})}/></label><label className="field"><span>Source ref</span><input value={r.sourceRef} onChange={ev => updateResistance({sourceRef: ev.target.value})}/></label><label className="field"><span>Source revision</span><input value={r.sourceRevision} onChange={ev => updateResistance({sourceRevision: ev.target.value})}/></label><label className="field"><span>Evidence ref</span><input value={r.evidenceRef} onChange={ev => updateResistance({evidenceRef: ev.target.value})}/></label><label className="field"><span>Review ref</span><input value={r.reviewRef} onChange={ev => updateResistance({reviewRef: ev.target.value})}/></label>
          <label className="field"><span>สถานะหลักฐาน</span><select value={r.status} onChange={ev => updateResistance({status: ev.target.value as ResistanceEvidenceStatus})}><option value="REFERENCE_ONLY">REFERENCE_ONLY · ยังไม่ review</option><option value="ENGINEER_REVIEWED">ENGINEER_REVIEWED · ต้องมี Review ref</option></select></label>
          <button className="btn secondary" onClick={() => change({...form, elements: form.elements.map((old, j) => j === i ? {...old, resistance: (old.resistance ?? []).filter((_, k) => k !== ri)} : old)})}>ลบหลักฐาน {ri + 1}</button>
        </div>;})}
        <button className="btn secondary" onClick={() => updateElement(i, {resistance: [...(e.resistance ?? []), emptyResistanceEvidence(null)]})}>เพิ่มแถวหลักฐานกำลัง</button>
      </details>
      <button className="btn secondary" onClick={() => change({...form, elements: form.elements.filter((_, j) => j !== i)})}>ลบสมาชิกเฟรม {e.id}</button>
    </details>)}
    <button className="btn secondary" disabled={form.elements.length >= 240} onClick={() => change({...form, elements: [...form.elements, emptyFrameElement(addId('M', form.elements.map(e => e.id)))]})}>เพิ่มสมาชิกหรือจุดต่อเฟรม</button>
    {['SIDE_REACTIONS', 'SOFFIT_AND_SIDE_REACTIONS'].includes(form.loadSource ?? '') && <SideFrameMappingEditor value={form.sideTransfers ?? null} sources={sideSources} nodes={form.nodes} tieIds={sideTieIds} walers={sideWalers} onChange={sideTransfers => change({...form, sideTransfers})}/>}
    {['SOFFIT_REACTIONS', 'SOFFIT_AND_SIDE_REACTIONS'].includes(form.loadSource ?? '') && <><h4>ผูกแรงรายหัวกับจุดเฟรม</h4>{form.headMappings.map((m, i) => <div className="form-grid frame-mapping" key={i}>
      <label className="field"><span>U-head ต้นทาง</span><select value={m.headNodeId} onChange={e => change({...form, headMappings: form.headMappings.map((old, j) => j === i ? {...old, headNodeId: e.target.value} : old)})}><option value="">ยังไม่เลือก</option>{headIds.map(id => <option key={id}>{id}</option>)}</select></label>
      <label className="field"><span>จุด HEAD ในเฟรม</span><select value={m.frameNodeId} onChange={e => change({...form, headMappings: form.headMappings.map((old, j) => j === i ? {...old, frameNodeId: e.target.value} : old)})}><option value="">ยังไม่เลือก</option>{form.nodes.filter(n => n.role === 'HEAD').map(n => <option key={n.id}>{n.id}</option>)}</select></label>
      <label className="field"><span>หลักฐานระยะเยื้อง/การถ่ายแรงหัว</span><input value={m.offsetEvidenceRef ?? ''} onChange={e => change({...form, headMappings: form.headMappings.map((old, j) => j === i ? {...old, offsetEvidenceRef: e.target.value || null} : old)})}/></label>
      <button className="btn secondary" onClick={() => change({...form, headMappings: form.headMappings.filter((_, j) => j !== i)})}>ลบการผูกหัว {i + 1}</button>
    </div>)}<button className="btn secondary" disabled={form.headMappings.length >= 80} onClick={() => change({...form, headMappings: [...form.headMappings, {headNodeId: '', frameNodeId: '', offsetEvidenceRef: null}]})}>เพิ่มการผูกหัวกับเฟรม</button></>}
    <h4>แรงจุดเพิ่มเติม · N และ N·mm</h4>
    {form.additionalActions.map((a, i) => {const update = (patch: Partial<typeof a>) => change({...form, additionalActions: form.additionalActions.map((old, j) => j === i ? {...old, ...patch} : old)}); return <details key={i} className="frame-action-editor"><summary>{a.id} · {a.kind ?? 'ยังไม่ระบุชนิดแรง'}</summary><div className="form-grid">
      <label className="field"><span>รหัสแรงเฟรม</span><input value={a.id} onChange={e => update({id: e.target.value})}/></label><label className="field"><span>จุดรับแรงเพิ่มเติม</span>{chooseNode(a.nodeId, nodeId => update({nodeId}))}</label>
      <label className="field"><span>ชนิดแรงเพิ่มเติม</span><select value={a.kind ?? ''} onChange={e => update({kind: (e.target.value || null) as typeof a.kind})}><option value="">ยังไม่ระบุ</option>{['SELF_WEIGHT', 'WIND', 'PLACEMENT', 'OTHER'].map(k => <option key={k}>{k}</option>)}</select></label>
      <label className="field"><span>Ownership ID ของแรงจุด</span><input value={a.ownershipId} onChange={e => update({ownershipId: e.target.value})}/></label><label className="field"><span>หลักฐานแรงเพิ่มเติม</span><input value={a.evidenceRef} onChange={e => update({evidenceRef: e.target.value})}/></label>
    </div>{vector(a.forceN, ['Fx · N', 'Fy · N', 'Fz · N (บวกขึ้น)'], forceN => update({forceN}))}{vector(a.momentNmm, ['Mx · N·mm', 'My · N·mm', 'Mz · N·mm'], momentNmm => update({momentNmm}))}
      <label className="field"><span>ตำแหน่งแรงเพิ่มเติม</span><select value={a.atNode === null ? '' : String(a.atNode)} onChange={e => update({atNode: e.target.value === '' ? null : e.target.value === 'true'})}><option value="">ยังไม่ทราบ</option><option value="true">ตรงจุดที่เลือก</option><option value="false">เยื้องจากจุดที่เลือก</option></select></label>
      {a.atNode === false && <>{vector(a.offsetMm, ['ระยะเยื้อง X · mm', 'ระยะเยื้อง Y · mm', 'ระยะเยื้อง Z · mm'], offsetMm => update({offsetMm}))}<label className="field"><span>หลักฐานจุดออกแรงเยื้อง</span><input value={a.offsetEvidenceRef} onChange={e => update({offsetEvidenceRef: e.target.value})}/></label></>}
      <button className="btn secondary" onClick={() => change({...form, additionalActions: form.additionalActions.filter((_, j) => j !== i)})}>ลบแรงเฟรม {a.id}</button>
    </details>;})}
    <button className="btn secondary" disabled={form.additionalActions.length >= 1000} onClick={() => change({...form, additionalActions: [...form.additionalActions, {id: addId('A', form.additionalActions.map(a => a.id)), nodeId: '', kind: null, ownershipId: '', evidenceRef: '', forceN: [null, null, null], momentNmm: [null, null, null], atNode: null, offsetMm: [null, null, null], offsetEvidenceRef: ''}]})}>เพิ่มแรงจุดเฟรม</button>
    <p>การเปลี่ยนรหัสจุดหรือลบสมาชิกจะไม่ย้ายการผูกแรงให้เอง ต้องตรวจจุด I/J และการผูกหัวใหม่ ค่ากำลังผู้จำหน่ายไม่ถูกนำมาเปรียบเทียบผ่านหน้านี้</p>
    {error && <p role="alert">{error}</p>}
    <button className="btn secondary" onClick={() => {try {onApply(form); setError(''); onPendingChange(false);} catch (e) {setError((e as Error).message);}}}>เก็บข้อมูลและวิเคราะห์เฟรมร่าง</button>
    <button className="btn secondary" onClick={() => {change(definitionOf(layout)); onPendingChange(false);}}>คืนค่าเฟรมที่นำไปใช้ล่าสุด</button>
    <button className="btn secondary" onClick={() => change(emptyFrameLayout())}>เริ่มกราฟเฟรมใหม่</button>
  </fieldset>;
}

/** Compact reviewer-evidence list for brace end fixings and base anchors; may be filled from the registry. */
function ResistanceList({title, quantities, value, onChange}: {title: string; quantities: ResistanceQuantity[]; value: ResistanceEvidence[]; onChange: (next: ResistanceEvidence[]) => void}) {
  const {registry} = useRegistry();
  const update = (ri: number, patch: Partial<ResistanceEvidence>) => onChange(value.map((old, j) => j === ri ? {...old, ...patch} : old));
  return <details className="frame-resistance-editor"><summary>{title} ({value.length})</summary>
    <p>ค่ากำลังจากเอกสารที่ผู้ตรวจระบุเท่านั้น ระบบไม่คำนวณกำลังจุดยึด/anchor จากรูปทรงหรือผลิตภัณฑ์ ช่องว่าง = INCOMPLETE</p>
    {value.map((r, ri) => <div className="form-grid frame-resistance-row" key={ri}>
      <label className="field"><span>ปริมาณกำลัง</span><select value={r.quantity ?? ''} onChange={ev => onChange(value.map((old, j) => j === ri ? emptyResistanceEvidence((ev.target.value || null) as ResistanceQuantity | null) : old))}><option value="">ยังไม่ระบุ</option>{quantities.map(q => <option key={q} value={q}>{resistanceNames[q]}</option>)}</select></label>
      {r.quantity && <label className="field"><span>เติมจากคลังที่รีวิวแล้ว</span><select value="" onChange={ev => {const entry = registry.entries.find(x => x.id === ev.target.value); if (entry) onChange(value.map((old, j) => j === ri ? resistanceEvidenceFromRegistry(registry, entry, r.quantity!) : old));}}>
        <option value="">เลือกรายการ…</option>{entriesForCheck(registry, r.quantity).map(({entry, reviewed}) => <option key={entry.id} value={entry.id}>{entry.name || entry.id} · {reviewed ? 'REVIEWED' : 'DRAFT → REFERENCE_ONLY'}</option>)}</select></label>}
      <label className="field"><span>หน่วย / Capacity</span><span>{r.unit ?? 'UNKNOWN'} · </span><input type="number" min="0" step="any" value={r.capacity ?? ''} onChange={ev => update(ri, {capacity: number(ev.target.value)})}/></label>
      <label className="field"><span>ฐานแรงของค่า</span><select value={r.actionBasis ?? ''} onChange={ev => update(ri, {actionBasis: (ev.target.value || null) as ResistanceActionBasis})}><option value="">ยังไม่ระบุ</option><option value="SERVICE">SERVICE</option><option value="FACTORED">FACTORED</option></select></label>
      <label className="field"><span>ฐานกำลัง</span><select value={r.resistanceBasis ?? ''} onChange={ev => update(ri, {resistanceBasis: (ev.target.value || null) as ResistanceBasis})}><option value="">ยังไม่ระบุ</option><option value="ALLOWABLE">ALLOWABLE</option><option value="DESIGN">DESIGN</option><option value="CHARACTERISTIC">CHARACTERISTIC · ยังเทียบไม่ได้</option><option value="ULTIMATE_TEST">ULTIMATE_TEST · ยังเทียบไม่ได้</option></select></label>
      {(['methodId', 'sourceRef', 'sourceRevision', 'evidenceRef', 'reviewRef'] as const).map(k => <label className="field" key={k}><span>{{methodId: 'Method ID', sourceRef: 'Source ref', sourceRevision: 'Source revision', evidenceRef: 'Evidence ref', reviewRef: 'Review ref'}[k]}</span><input value={r[k]} onChange={ev => update(ri, {[k]: ev.target.value})}/></label>)}
      <label className="field"><span>สถานะหลักฐาน</span><select value={r.status} onChange={ev => update(ri, {status: ev.target.value as ResistanceEvidenceStatus})}><option value="REFERENCE_ONLY">REFERENCE_ONLY · ยังไม่ review</option><option value="ENGINEER_REVIEWED">ENGINEER_REVIEWED · ต้องมี Review ref</option></select></label>
      <button className="btn secondary" onClick={() => onChange(value.filter((_, k) => k !== ri))}>ลบหลักฐาน {ri + 1}</button>
    </div>)}
    <button className="btn secondary" disabled={value.length >= 8} onClick={() => onChange([...value, emptyResistanceEvidence(null)])}>เพิ่มแถวหลักฐาน</button>
  </details>;
}
