import React, {useEffect, useState} from 'react';
import supplierText from '../reference/workflow-v07/thai-ringlock-suppliers-2026-10-15.json?raw';
import {createSupplierCatalogue, editSupplierRecord, resolveSupplierCatalogue, screenSupplierCatalogue, selectSupplierRecord, supplierFields,
  type SupplierCatalogueState, type SupplierCollection, type SupplierRow} from '../domain/workflowV07/ringlockSuppliers';
import './ringlock-suppliers.css';

const baseline = createSupplierCatalogue(JSON.parse(supplierText));
const display = (v: unknown) => v === null || v === undefined || v === '' ? 'รอข้อมูล' : Array.isArray(v) ? v.join(', ') : String(v);
const roleLabels: Record<string,string> = {STANDARD:'เสาตั้ง', LEDGER:'Ledger', BRACE:'ทแยง', BASE_JACK:'Base jack', U_HEAD:'U-head', JACK_HEAD_BASE:'Jack / U-head'};
const labels: Record<string,string> = {
  name:'ชื่อผู้จำหน่าย', phone:'โทรศัพท์', line:'LINE', province:'จังหวัด', note_th:'หมายเหตุ', label:'ชื่อตระกูลสินค้า', module_system:'ระบบโมดูล',
  published_ledger_labels_mm:'รายการขนาด Ledger (มม. คั่นด้วยจุลภาค)', standard_lengths_mm:'รายการความยาวเสา (มม. คั่นด้วยจุลภาค)', rosette_pitch_mm:'ระยะวงแหวน (มม.)',
  role:'ชนิดชิ้นส่วน', D_mm:'OD (มม.)', t_mm:'ความหนาท่อ (มม.)', published_grade_label:'ชื่อเกรดวัสดุ', Fy_MPa:'Fy (MPa)', Fu_MPa:'Fu (MPa)', E_MPa:'E (MPa)', material_standard_edition:'มาตรฐานวัสดุและฉบับ',
  kind:'รายการตรวจ', value:'ค่ากำลังหรือความแข็ง', unit:'หน่วย', resistance_basis:'ฐานกำลัง', load_basis:'ฐานโหลด / กรณีโหลด', bay_x_mm:'แปลน X (มม.)', bay_y_mm:'แปลน Y (มม.)', lift_mm:'ระยะ lift (มม.)', total_height_mm:'ความสูงรวม (มม.)', head_extension_mm:'ระยะยืด U-head (มม.)', base_extension_mm:'ระยะยืด Base jack (มม.)', bracing_pattern_ref:'รูปแบบทแยง', top_restraint_ref:'เงื่อนไขยึดด้านบน', base_restraint_ref:'เงื่อนไขฐานรองรับ', document_ref:'เอกสารกำลัง', document_revision:'ฉบับเอกสาร', source_page:'หน้าเอกสาร',
};
const options: Record<string,string[]> = {
  role:Object.keys(roleLabels), module_system:['METRIC','FOOT_BASED','CUSTOM'],
  kind:['LEDGER_ROSETTE','BRACE_CONNECTION','SPIGOT','U_HEAD','BASE_JACK','SYSTEM_CONFIGURATION'],
  unit:['N','kN','Nmm','kNm','N/mm','Nmm/rad'], resistance_basis:['ALLOWABLE','DESIGN_Rd','CHARACTERISTIC_Rk','ULTIMATE_TEST','STIFFNESS'],
};
const numeric = new Set(['rosette_pitch_mm','D_mm','t_mm','Fy_MPa','Fu_MPa','E_MPa','value','bay_x_mm','bay_y_mm','lift_mm','total_height_mm','head_extension_mm','base_extension_mm']);
const listFields = new Set(['published_ledger_labels_mm','standard_lengths_mm']);
type Editing = {collection: SupplierCollection; row: SupplierRow | null; id: string};
function SupplierEditor({editing, state, onSave, onCancel}: {editing: Editing; state: SupplierCatalogueState; onSave: (v: SupplierCatalogueState) => void; onCancel: () => void}) {
  const fields = supplierFields[editing.collection];
  const [values,setValues] = useState<Record<string,string>>(() => Object.fromEntries(fields.map(k => [k, editing.row?.[k] === null || editing.row?.[k] === undefined ? '' : Array.isArray(editing.row[k]) ? (editing.row[k] as unknown[]).join(', ') : String(editing.row[k])])));
  const [reason,setReason] = useState(''), [documentRef,setDocumentRef] = useState(''), [error,setError] = useState('');
  function save() {
    try {
      const changes: Record<string,unknown> = {};
      for (const field of fields) {
        const text = values[field].trim();
        if (listFields.has(field)) {
          if (text && text.split(',').some(t => !t.trim())) throw Error('รายการขนาดมีช่องว่างระหว่างจุลภาค');
          changes[field] = text ? text.split(',').map(t => Number(t.trim())) : [];
        } else changes[field] = text === '' ? null : numeric.has(field) ? Number(text) : text;
      }
      if (!editing.row && editing.collection === 'families') changes.supplier_id = state.selection.supplierId;
      if (!editing.row && (editing.collection === 'components' || editing.collection === 'capacity_records')) changes.family_id = state.selection.familyId;
      let next = editSupplierRecord(state, editing.collection, editing.id, changes, reason, documentRef);
      const selected = editing.collection === 'suppliers' ? 'supplierId' : editing.collection === 'families' ? 'familyId' : editing.collection === 'components' ? 'componentId' : 'capacityId';
      next = selectSupplierRecord(next, selected, editing.id);
      onSave(next);
    } catch (e) {setError((e as Error).message);}
  }
  return <div className="ringlock-supplier-editor" aria-label="แก้ไขข้อมูลผู้จำหน่าย Ringlock">
    <h4>{editing.row ? 'แก้ไขข้อมูล' : 'เพิ่มรายการ'} · {editing.id}</h4>
    <p>ช่องตัวเลขเว้นว่างหมายถึงยังไม่ทราบ ค่าที่บันทึกจะเป็นข้อมูลรอตรวจ และเก็บต้นฉบับไว้แยกกัน รายงานใช้เฉพาะค่าที่บันทึกแล้ว</p>
    <div className="form-grid">{fields.map(field => <label className="field" key={field}><span>{labels[field]}</span>{options[field]
      ? <select value={values[field]} onChange={e => setValues({...values,[field]:e.target.value})}><option value="">รอข้อมูล</option>{options[field].map(o => <option key={o} value={o}>{roleLabels[o] ?? o}</option>)}</select>
      : <input type={numeric.has(field) ? 'number' : 'text'} step={numeric.has(field) ? 'any' : undefined} value={values[field]} onChange={e => setValues({...values,[field]:e.target.value})}/>}</label>)}</div>
    <label className="field"><span>เหตุผลการเพิ่มหรือแก้ไข</span><input value={reason} onChange={e => setReason(e.target.value)} maxLength={300}/></label>
    <label className="field"><span>หลักฐานการเพิ่มหรือแก้ไข (เอกสาร / ฉบับ / หน้า)</span><input value={documentRef} onChange={e => setDocumentRef(e.target.value)} maxLength={300}/></label>
    {error && <p role="alert">{error}</p>}
    <button type="button" className="btn" disabled={!reason.trim() || !documentRef.trim()} onClick={save}>บันทึกข้อมูลรอตรวจในฉบับร่าง</button>
    <button type="button" className="btn secondary" onClick={onCancel}>ยกเลิกการแก้ไขผู้จำหน่าย</button>
  </div>;
}
export function RinglockSupplierFields({value,onChange,onPendingChange}: {value: SupplierCatalogueState | null; onChange: (v: SupplierCatalogueState) => void; onPendingChange?: (pending: boolean) => void}) {
  const state = value ?? baseline, data = resolveSupplierCatalogue(state), selected = screenSupplierCatalogue(state,null);
  const [editing,setEditing] = useState<Editing | null>(null);
  useEffect(() => () => onPendingChange?.(false), [onPendingChange]);
  const {supplierId,familyId,componentId,capacityId} = state.selection;
  const source = (id: unknown) => data.sources.find(s => s.id === id);
  function edit(collection: SupplierCollection, row: SupplierRow | null) {if (editing) return; setEditing({collection,row,id:row?.id ?? `CUSTOM-${globalThis.crypto.randomUUID()}`}); onPendingChange?.(true);}
  function choose(key: keyof SupplierCatalogueState['selection'], id: string) {if (editing) return; onChange(selectSupplierRecord(state,key,id || null));}
  function close() {setEditing(null); onPendingChange?.(false);}
  return <section className="ringlock-suppliers" aria-label="ผู้จำหน่าย Ringlock ในไทย">
    <h3>ผู้จำหน่าย Ringlock ในไทย</h3>
    <p>ข้อมูลเว็บ 15 ต.ค. 2569 · {data.suppliers.length} ผู้จำหน่าย / {data.families.length} ตระกูล · แก้ไขและเพิ่มข้อมูลในฉบับร่างได้</p>
    <label className="field"><span>ผู้จำหน่าย Ringlock</span><select disabled={!!editing} value={supplierId ?? ''} onChange={e => choose('supplierId',e.target.value)}><option value="">ยังไม่เลือกผู้จำหน่าย</option>{data.suppliers.map(s => <option value={s.id} key={s.id}>{String(s.name)}</option>)}</select></label>
    <div className="supplier-actions"><button type="button" className="btn secondary" disabled={!!editing} onClick={() => edit('suppliers',null)}>เพิ่มผู้จำหน่าย</button>{selected.supplier && <button type="button" className="btn secondary" disabled={!!editing} onClick={() => edit('suppliers',selected.supplier)}>แก้ไขผู้จำหน่ายที่เลือก</button>}</div>
    {selected.supplier && <>
      <p>โทร {display(selected.supplier.phone)} · LINE {display(selected.supplier.line)}</p>
      {source(selected.supplier.source_id) && <a href={String(source(selected.supplier.source_id)!.url)} target="_blank" rel="noreferrer">เว็บไซต์ผู้จำหน่าย</a>}
      <label className="field"><span>ตระกูล Ringlock ของผู้จำหน่าย</span><select disabled={!!editing} value={familyId ?? ''} onChange={e => choose('familyId',e.target.value)}><option value="">ยังไม่เลือกตระกูล</option>{data.families.filter(f => f.supplier_id === supplierId).map(f => <option key={f.id} value={f.id}>{String(f.label)} · {String(f.module_system)}</option>)}</select></label>
      <div className="supplier-actions"><button type="button" className="btn secondary" disabled={!!editing} onClick={() => edit('families',null)}>เพิ่มตระกูลสินค้า</button>{selected.family && <button type="button" className="btn secondary" disabled={!!editing} onClick={() => edit('families',selected.family)}>แก้ไขตระกูลที่เลือก</button>}</div>
    </>}
    {selected.family && <>
      <p>ขนาด Ledger ตามรายการ: {display(selected.family.published_ledger_labels_mm)} มม. · ต้องยืนยันระยะศูนย์เสาและคู่ขนาดทแยงกับอุปกรณ์จริง</p>
      {source(selected.family.source_id) && <a href={String(source(selected.family.source_id)!.url)} target="_blank" rel="noreferrer">แหล่งข้อมูลตระกูลสินค้า</a>}
      <label className="field"><span>ชิ้นส่วนของตระกูล Ringlock</span><select disabled={!!editing} value={componentId ?? ''} onChange={e => choose('componentId',e.target.value)}><option value="">ยังไม่เลือกชิ้นส่วน</option>{data.components.filter(c => c.family_id === familyId).map(c => <option key={c.id} value={c.id}>{roleLabels[String(c.role)] ?? String(c.role)} · {c.id}</option>)}</select></label>
      <div className="supplier-actions"><button type="button" className="btn secondary" disabled={!!editing} onClick={() => edit('components',null)}>เพิ่มชิ้นส่วน</button>{selected.component && <button type="button" className="btn secondary" disabled={!!editing} onClick={() => edit('components',selected.component)}>แก้ไขหน้าตัดและวัสดุที่เลือก</button>}</div>
      {selected.component && <SupplierComponentTable component={selected.component}/>}
      <details><summary>กำลังจุดต่อและกำลังระบบ · ช่องเติมข้อมูลรอตรวจ</summary>
        <p>แยก Allowable, Rd, Rk และ Ultimate test ค่าที่กรอกยังไม่ถูกนำไปใช้เป็นกำลังรับรองใน Bracing check</p>
        <label className="field"><span>รายการกำลังของตระกูล Ringlock</span><select disabled={!!editing} value={capacityId ?? ''} onChange={e => choose('capacityId',e.target.value)}><option value="">ยังไม่เลือกรายการกำลัง</option>{data.capacity_records.filter(c => c.family_id === familyId).map(c => <option key={c.id} value={c.id}>{String(c.kind)} · {c.id}</option>)}</select></label>
        <div className="supplier-actions"><button type="button" className="btn secondary" disabled={!!editing} onClick={() => edit('capacity_records',null)}>เพิ่มรายการกำลัง</button>{selected.capacity && <button type="button" className="btn secondary" disabled={!!editing} onClick={() => edit('capacity_records',selected.capacity)}>แก้ไขรายการกำลังที่เลือก</button>}</div>
        {selected.capacity && <SupplierCapacityTable capacity={selected.capacity}/>}
      </details>
    </>}
    {editing && <SupplierEditor key={`${editing.collection}-${editing.id}`} editing={editing} state={state} onCancel={close} onSave={next => {onChange(next);close();}}/>}
    <SupplierEditHistory state={state}/>
    <p>ข้อมูลที่เลือกเก็บกับฉบับร่างของโครงการ ชื่อเกรด เช่น STK500 ยังไม่ถูกแปลงเป็นค่า Fy และข้อมูลของผู้ผลิตอื่นยังไม่ถูกใช้แทนกำลังของตระกูลนี้</p>
  </section>;
}
function SupplierComponentTable({component:c}: {component: SupplierRow}) {
  return <><table><thead><tr><th>คุณสมบัติชิ้นส่วน</th><th>ค่าที่บันทึก</th></tr></thead><tbody>{['D_mm','t_mm','published_grade_label','Fy_MPa','Fu_MPa','E_MPa','material_standard_edition'].map(k => <tr key={k}><td>{labels[k]}</td><td>{display(c[k])}</td></tr>)}</tbody></table>{c.note_th ? <p>{String(c.note_th)}</p> : null}</>;
}
function SupplierCapacityTable({capacity:c}: {capacity: SupplierRow}) {
  return <table><thead><tr><th>ข้อมูลกำลังและเงื่อนไขตั้ง</th><th>ค่าที่บันทึก · รอตรวจ</th></tr></thead><tbody>{supplierFields.capacity_records.map(k => <tr key={k}><td>{labels[k]}</td><td>{display(c[k])}</td></tr>)}</tbody></table>;
}
function SupplierEditHistory({state}: {state: SupplierCatalogueState}) {
  if (!state.edits.length) return null;
  return <details><summary>ประวัติเพิ่มและแก้ไขข้อมูลผู้จำหน่าย ({state.edits.length})</summary><ol>{state.edits.map(e => <li key={e.id}>{e.recordId} · {e.reason} · {e.documentRef} · {e.editedAt}<details><summary>ข้อมูลก่อนและหลังแก้ไข</summary><pre>{JSON.stringify({before:e.before,after:e.after},null,2)}</pre></details></li>)}</ol></details>;
}
export function RinglockSupplierSummary({state,summary}: {state: SupplierCatalogueState; summary: ReturnType<typeof screenSupplierCatalogue>}) {
  return <section aria-label="ข้อมูลผู้จำหน่าย Ringlock ที่เก็บกับฉบับร่าง"><h4>ผู้จำหน่ายที่เลือก · ข้อมูลรอตรวจ</h4>
    <p>{display(summary.supplier?.name)} · {display(summary.family?.label)} · {state.sourceVersion}</p>
    <p>โมดูลตามรายการ {display(summary.family?.published_ledger_labels_mm)} มม.</p>
    {summary.planMatches && <p>X {summary.planMatches.x ? 'ตรงขนาดในรายการ' : 'ไม่ตรง / รอข้อมูล'} · Y {summary.planMatches.y ? 'ตรงขนาดในรายการ' : 'ไม่ตรง / รอข้อมูล'}</p>}
    {summary.component && <SupplierComponentTable component={summary.component}/>}
    {summary.capacity && <p>ข้อมูลกำลังที่เลือก: {display(summary.capacity.kind)} · {display(summary.capacity.value)} {summary.capacity.unit ? String(summary.capacity.unit) : ''} · {display(summary.capacity.resistance_basis)} · เอกสาร {display(summary.capacity.document_ref)} · ยังไม่ใช้เป็นกำลังคำนวณ</p>}
    {summary.capacity && <SupplierCapacityTable capacity={summary.capacity}/>}
    <p>กำลังจุดต่อและกำลังระบบยังรอตรวจเอกสารตามรูปแบบตั้ง ไม่เปลี่ยนสถานะเป็นผ่านจากการเลือกผู้จำหน่ายหรือกรอกค่ากำลัง</p>
    <SupplierEditHistory state={state}/>
  </section>;
}
