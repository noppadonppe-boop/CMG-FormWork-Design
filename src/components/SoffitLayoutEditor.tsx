import React, {useEffect, useState} from 'react';
import {canonical} from '../domain/workflowV07/common';
import type {MemberStiffness, SoffitLayout} from '../domain/workflowV07/soffit';
import type {ElasticMemberBinding} from '../domain/workflowV07/elasticBinding';
import {ElasticBindingEditor, type BindingSelections} from './ElasticBinding';
import type {SoffitPlywoodDefinition} from '../domain/workflowV07/plywood';
import {SoffitPlywoodEditor} from './SoffitPlywoodEditor';
import {SpatialLoadingEditor} from './SpatialLoading';
import type {SpatialLoading} from '../domain/workflowV07/spatialLoads';
import type {BeamMemberEvidence} from '../domain/workflowV07/beamResistance';
import {beamMemberEvidenceReference} from '../domain/workflowV07/beamResistance';
import {BeamMemberEvidenceEditor} from './BeamMemberEvidenceEditor';

type StiffnessForm = {E_MPa: string; I_mm4: string; selfWeightKNPerM: string; evidenceRef: string; binding: ElasticMemberBinding | null; resistanceEvidence: BeamMemberEvidence[]};
interface Form {
  stageId: string; loadCaseId: string; ownershipId: string; evidenceRef: string;
  joistXMm: string; joistStartYMm: string; joistEndYMm: string; bearerStartXMm: string; bearerEndXMm: string;
  headNodeElevationMm: string; baseElevationMm: string; concreteStripStartYMm: string; deadStripStartYMm: string; liveStripStartYMm: string;
  bearers: {id: string; yMm: string; headsXMm: string}[]; joist: StiffnessForm; bearer: StiffnessForm;
  plywood: SoffitPlywoodDefinition | null;
  loading: SpatialLoading | null;
  baseDatumsByHead: {headNodeId: string; localXMm: number; localYMm: number; elevationMm: string; evidenceRef: string}[] | null;
}
const string = (v: number | null | undefined) => v == null ? '' : String(v);
function formOf(layout: SoffitLayout | null): Form {
  const stiffness = (s?: MemberStiffness): StiffnessForm => ({E_MPa: string(s?.E_MPa), I_mm4: string(s?.I_mm4), selfWeightKNPerM: string(s?.selfWeightKNPerM), evidenceRef: s?.evidenceRef ?? '', binding: s?.binding ?? null,
    resistanceEvidence: s?.resistanceEvidence ?? []});
  return {stageId: layout?.stageId ?? '', loadCaseId: layout?.loadCaseId ?? '', ownershipId: layout?.ownershipId ?? '', evidenceRef: layout?.evidenceRef ?? '',
    joistXMm: layout?.joistXMm.join(', ') ?? '', joistStartYMm: string(layout?.joistStartYMm), joistEndYMm: string(layout?.joistEndYMm),
    bearerStartXMm: string(layout?.bearerStartXMm), bearerEndXMm: string(layout?.bearerEndXMm), headNodeElevationMm: string(layout?.headNodeElevationMm), baseElevationMm: string(layout?.baseElevationMm),
    concreteStripStartYMm: string(layout?.concreteStripStartYMm), deadStripStartYMm: string(layout?.deadStripStartYMm), liveStripStartYMm: string(layout?.liveStripStartYMm),
    bearers: layout?.bearers.map(b => ({id: b.id, yMm: String(b.yMm), headsXMm: b.headsXMm.join(', ')})) ?? [{id: 'B1', yMm: '', headsXMm: ''}, {id: 'B2', yMm: '', headsXMm: ''}],
    joist: stiffness(layout?.joist), bearer: stiffness(layout?.bearer), plywood: layout?.plywood ?? null, loading: layout?.loading ?? null,
    baseDatumsByHead: layout?.baseDatumsByHead?.map(r => ({...r, elevationMm: string(r.elevationMm)})) ?? null};
}
const number = (s: string) => {if (!s.trim()) return null; const v = Number(s); if (!Number.isFinite(v)) throw Error('กรุณาระบุตัวเลขที่มีค่าจำกัด'); return v;};
function list(s: string) {
  if (!s.trim()) return [];
  return s.split(',').map(v => {const n = number(v); if (n === null) throw Error('รายการพิกัดต้องไม่มีช่องว่างระหว่างจุลภาค'); return n;});
}
function layoutOf(form: Form): SoffitLayout {
  const stiffness = (s: StiffnessForm): MemberStiffness => ({E_MPa: number(s.E_MPa), I_mm4: number(s.I_mm4), selfWeightKNPerM: number(s.selfWeightKNPerM), evidenceRef: s.evidenceRef,
    ...(s.binding ? {binding: s.binding} : {}), ...(s.resistanceEvidence.length ? {resistanceEvidence: s.resistanceEvidence} : {})});
  return {schemaVersion: '1', stageId: form.stageId, loadCaseId: form.loadCaseId, ownershipId: form.ownershipId, evidenceRef: form.evidenceRef,
    joistXMm: list(form.joistXMm), joistStartYMm: number(form.joistStartYMm), joistEndYMm: number(form.joistEndYMm),
    bearerStartXMm: number(form.bearerStartXMm), bearerEndXMm: number(form.bearerEndXMm), headNodeElevationMm: number(form.headNodeElevationMm), baseElevationMm: number(form.baseElevationMm),
    concreteStripStartYMm: number(form.concreteStripStartYMm), deadStripStartYMm: number(form.deadStripStartYMm), liveStripStartYMm: number(form.liveStripStartYMm),
    bearers: form.bearers.map(b => {const y = number(b.yMm); if (y === null) throw Error(`${b.id}: ต้องระบุพิกัด Y`); return {id: b.id, yMm: y, headsXMm: list(b.headsXMm)};}),
    joist: stiffness(form.joist), bearer: stiffness(form.bearer), ...(form.plywood ? {plywood: form.plywood} : {}), ...(form.loading ? {loading: form.loading} : {}),
    ...(form.baseDatumsByHead !== null ? {baseDatumsByHead: form.baseDatumsByHead.map(r => ({...r, elevationMm: number(r.elevationMm)}))} : {})};
}
export function SoffitLayoutEditor({layout, beam, onApply, onPendingChange, onDraftChange, selections}: {
  layout: SoffitLayout | null; beam: boolean; onApply: (layout: SoffitLayout) => void; onPendingChange: (pending: boolean) => void;
  onDraftChange?: (layout: SoffitLayout | null) => void;
  selections?: BindingSelections;
}) {
  const [form, setForm] = useState(() => formOf(layout)), [error, setError] = useState('');
  const identity = canonical(layout);
  useEffect(() => {setForm(formOf(layout)); setError(''); onPendingChange(false);}, [identity, onPendingChange]);
  useEffect(() => () => onPendingChange(false), [onPendingChange]);
  function change(next: Form) {setForm(next); setError(''); onPendingChange(canonical(next) !== canonical(formOf(layout)));
    try {onDraftChange?.(layoutOf(next));} catch {onDraftChange?.(null);}}
  function field(key: Exclude<keyof Form, 'bearers' | 'joist' | 'bearer' | 'plywood' | 'baseDatumsByHead' | 'loading'>, label: string, numeric = true) {
    return <label className="field"><span>{label}</span><input type={numeric ? 'number' : 'text'} step={numeric ? 'any' : undefined} value={form[key]} onChange={e => change({...form, [key]: e.target.value})}/></label>;
  }
  return <fieldset className="soffit-editor"><legend>ตำแหน่งและการถ่ายแรงแบบท้อง · ร่าง</legend>
    <p>แบบสี่เหลี่ยม ทิศคาน/คานรับ X และคร่าว Y · พิกัด X,Y เป็นระยะจากมุมต่ำสุดของขอบคอนกรีต (mm) เรียงน้อยไปมาก คั่นด้วยจุลภาค คร่าวแรกและสุดท้ายต้องอยู่ที่ขอบ X ของคอนกรีต</p>
    <p>ใช้โมดูล Ringlock ที่เลือกเป็นข้อมูลอ้างอิง แล้วระบุหัวรองรับจริงทุกจุด ระดับ Z ด้านล่างคือระนาบวิเคราะห์ร่วม ยังต้องตรวจความสูงติดตั้งและจุดสัมผัสจริงแยก</p>
    <div className="form-grid">
      {field('stageId', 'ขั้นตอนเท/Stage', false)}{field('loadCaseId', 'กรณีโหลด/Load case', false)}{field('ownershipId', 'พื้นที่ที่รับผิดชอบโหลด', false)}{field('evidenceRef', 'หลักฐานตำแหน่งและโหลด', false)}
      {field('joistXMm', 'ตำแหน่งคร่าว X · mm (คั่นด้วยจุลภาค)', false)}{field('joistStartYMm', 'ปลายคร่าวเริ่ม Y · mm')}{field('joistEndYMm', 'ปลายคร่าวสิ้นสุด Y · mm')}
      {field('bearerStartXMm', 'ปลายคานรับเริ่ม X · mm')}{field('bearerEndXMm', 'ปลายคานรับสิ้นสุด X · mm')}
      {field('headNodeElevationMm', 'ระดับจุด U-head ในแบบวิเคราะห์ Z · mm')}{form.baseDatumsByHead === null && field('baseElevationMm', 'ระดับฐานร่วม Z · mm')}
      {beam && <>{field('concreteStripStartYMm', 'จุดเริ่มแถบ Bc ที่รับผิดชอบ Y · mm')}{field('deadStripStartYMm', 'จุดเริ่มแถบ DL Y · mm')}{field('liveStripStartYMm', 'จุดเริ่มแถบ LL Y · mm')}</>}
    </div>
    {form.bearers.map((b, i) => <div className="soffit-bearer" key={i}>
      <h4>แนวคานรับ {i + 1}</h4><div className="form-grid">
        {(['id', 'yMm', 'headsXMm'] as const).map(k => <label className="field" key={k}><span>{k === 'id' ? 'รหัสคานรับ' : k === 'yMm' ? 'ตำแหน่งแนวคานรับ Y · mm' : 'ตำแหน่ง U-head X ทุกจุด · mm (คั่นด้วยจุลภาค)'}</span><input type={k === 'yMm' ? 'number' : 'text'} value={b[k]} onChange={e => change({...form, bearers: form.bearers.map((row, n) => n === i ? {...row, [k]: e.target.value} : row)})}/></label>)}
      </div>{form.bearers.length > 2 && <button className="btn secondary" onClick={() => change({...form, bearers: form.bearers.filter((_, n) => n !== i)})}>ลบแนวคานรับ {i + 1}</button>}
    </div>)}
    <button className="btn secondary" disabled={form.bearers.length >= 12} onClick={() => {let n = 1; while (form.bearers.some(b => b.id === `B${n}`)) n++; change({...form, bearers: [...form.bearers, {id: `B${n}`, yMm: '', headsXMm: ''}]});}}>เพิ่มแนวคานรับ</button>
    <fieldset className="soffit-base-datums"><legend>ระดับฐานรายหัว</legend><p>เลือกกรอกครบทุกหัวแทนระดับฐานร่วม เมื่อรหัสหรือพิกัดหัวเปลี่ยน ต้องตรวจรายการใหม่ ค่าว่างจะไม่ย้อนใช้ฐานร่วม</p>
      <button className="btn secondary" onClick={() => {try {
        const rows = form.bearers.flatMap(b => {const y = number(b.yMm); if (y === null || !b.id.trim()) throw Error('ระบุรหัสและ Y ของคานรับก่อนจัดระดับฐาน'); return list(b.headsXMm).map((x, i) => {
          const headNodeId = `${b.id}:HEAD-${i + 1}`, old = form.baseDatumsByHead?.find(r => r.headNodeId === headNodeId && r.localXMm === x && r.localYMm === y);
          return old ?? {headNodeId, localXMm: x, localYMm: y, elevationMm: '', evidenceRef: ''};
        });}); if (!rows.length) throw Error('ยังไม่มีตำแหน่งหัวจริง'); change({...form, baseElevationMm: '', baseDatumsByHead: rows});
      } catch (e) {setError((e as Error).message);}}}>{form.baseDatumsByHead === null ? 'เริ่มกรอกระดับฐานรายหัว' : 'จัดรายการฐานตามหัวปัจจุบัน'}</button>
      {form.baseDatumsByHead !== null && <><div className="form-grid">{form.baseDatumsByHead.map((r, i) => <fieldset key={i}><legend>{r.headNodeId} · X {r.localXMm} / Y {r.localYMm} mm</legend>
        <label className="field"><span>ระดับฐาน {r.headNodeId} · mm</span><input type="number" step="any" value={r.elevationMm} onChange={e => change({...form, baseDatumsByHead: form.baseDatumsByHead!.map((old, n) => n === i ? {...old, elevationMm: e.target.value} : old)})}/></label>
        <label className="field"><span>หลักฐานระดับฐาน {r.headNodeId}</span><input value={r.evidenceRef} onChange={e => change({...form, baseDatumsByHead: form.baseDatumsByHead!.map((old, n) => n === i ? {...old, evidenceRef: e.target.value} : old)})}/></label>
      </fieldset>)}</div><button className="btn secondary" onClick={() => change({...form, baseDatumsByHead: null, baseElevationMm: ''})}>กลับไปกรอกฐานร่วมใหม่</button></>}
    </fieldset>
    {(['joist', 'bearer'] as const).map(role => <fieldset key={role} aria-label={`คุณสมบัติกลุ่ม ${role}`}><legend>{role === 'joist' ? 'คร่าว' : 'คานรับ'} · หน้าตัดและแกนที่ใช้จริง</legend><div className="form-grid">
      {(['E_MPa', 'I_mm4', 'selfWeightKNPerM', 'evidenceRef'] as const).map(k => <label className="field" key={k}><span>{k === 'E_MPa' ? 'E · MPa' : k === 'I_mm4' ? 'I แกนดัด · mm⁴' : k === 'selfWeightKNPerM' ? 'น้ำหนักตัวเอง · kN/m (ศูนย์ต้องระบุ)' : 'หลักฐานหน้าตัด/แกน/วัสดุ/น้ำหนัก'}</span><input disabled={!!form[role].binding && (k === 'E_MPa' || k === 'I_mm4')} type={k === 'evidenceRef' ? 'text' : 'number'} step={k === 'evidenceRef' ? undefined : 'any'} value={form[role][k]} onChange={e => change({...form, [role]: {...form[role], [k]: e.target.value,
        ...(['E_MPa', 'I_mm4', 'evidenceRef'].includes(k) ? {resistanceEvidence: []} : {})}})}/></label>)}
    </div><ElasticBindingEditor binding={form[role].binding} role={role === 'joist' ? 'JOIST' : 'BEARER'} label={`SOFFIT:${role}`} selections={selections} onChange={binding => {
      const source = (b: ElasticMemberBinding | null) => canonical(b ? {mode: b.sectionMode, section: b.section, material: b.material, width: b.actualWidthMm, depth: b.actualDepthMm} : null);
      const changedSource = source(binding) !== source(form[role].binding);
      change({...form, [role]: {...form[role], binding, E_MPa: '', I_mm4: '', resistanceEvidence: [], ...(changedSource ? {selfWeightKNPerM: '', evidenceRef: ''} : {})}});
    }}/>
      <BeamMemberEvidenceEditor value={form[role].resistanceEvidence} memberEvidenceRef={beamMemberEvidenceReference(role === 'joist' ? 'JOIST' : 'BEARER', {
        E_MPa: number(form[role].E_MPa), I_mm4: number(form[role].I_mm4), evidenceRef: form[role].evidenceRef, binding: form[role].binding})}
        onChange={resistanceEvidence => change({...form, [role]: {...form[role], resistanceEvidence}})}/>
    </fieldset>)}
    <SoffitPlywoodEditor definition={form.plywood} materialSelection={selections?.material} onChange={plywood => change({...form, plywood})}/>
    <SpatialLoadingEditor value={form.loading} onChange={loading => change({...form, loading})} memberIds={[...form.joistXMm.split(',').filter(s => s.trim()).map((_, i) => `JOIST-${i + 1}`), ...form.bearers.map(b => b.id)]}/>
    <p>การวิเคราะห์แรงยังไม่ตรวจกำลังไม้อัด รอยต่อ แรงลม และเสถียรภาพ Ringlock น้ำหนักอุปกรณ์อื่นต้องระบุในโหลดพร้อมหลักฐาน</p>
    {error && <p role="alert">{error}</p>}
    <button className="btn secondary" onClick={() => {try {onApply(layoutOf(form)); onPendingChange(false); setError('');} catch (e) {setError((e as Error).message);}}}>ตรวจตำแหน่งและวิเคราะห์แรงแบบท้อง</button>
    <button className="btn secondary" onClick={() => {change(formOf(layout)); onPendingChange(false);}}>คืนค่าแบบท้องที่นำไปใช้ล่าสุด</button>
  </fieldset>;
}
