import React, {useCallback, useEffect, useRef, useState} from 'react';
import {canonical} from '../domain/workflowV07/common';
import type {Topology} from '../domain/workflowV07/geometry';
import type {AppliedSideLayout, SideFaceLayout, SideLayoutDefinition, SideTieDefinition} from '../domain/workflowV07/sideLayout';
import type {IndependentWalerPair} from '../domain/workflowV07/walerPair';
import {PairedWalerEditor} from './PairedWalerEditor';
import {ElasticBindingEditor, type BindingSelections} from './ElasticBinding';
import type {ElasticMemberBinding} from '../domain/workflowV07/elasticBinding';
import type {PlywoodProductBinding} from '../domain/workflowV07/plywood';
import {PlywoodBindingEditor} from './PlywoodBinding';
import {SidePressureEditor} from './SidePressureEditor';
import type {SidePressureDefinition} from '../domain/workflowV07/sidePressure';
import {tieGeometryContext, type TieDossier} from '../domain/workflowV07/tieDossier';
import {TieDossierEditor} from './TieDossier';
import type {BeamMemberEvidence} from '../domain/workflowV07/beamResistance';
import {beamMemberEvidenceReference} from '../domain/workflowV07/beamResistance';
import {BeamMemberEvidenceEditor} from './BeamMemberEvidenceEditor';
import {sidePlywoodEvidenceReference} from '../domain/workflowV07/sideLayout';
import {sideLocalMemberReference, type SideLocalEvidence} from '../domain/workflowV07/sideLocalChecks';
import {SideLocalEvidenceEditor} from './SideLocalEvidenceEditor';

type FaceForm = {
  faceId: string; evidenceRef: string; studs: string;
  walers: {id: string; z: string; supports: string; supportIds: string[]; pair: IndependentWalerPair | null}[];
  studE: string; studI: string; studEvidence: string; railE: string; railI: string; railEvidence: string;
  studResistanceEvidence: BeamMemberEvidence[]; railResistanceEvidence: BeamMemberEvidence[];
  studBinding: ElasticMemberBinding | null; railBinding: ElasticMemberBinding | null;
  plywoodBinding: PlywoodProductBinding | null;
  thickness: string; plywoodE: string; grain: string; joints: string; sheetJoints: string; plywoodEvidence: string; share: string; shareEvidence: string;
  pressure: SidePressureDefinition | null;
  plywoodResistanceEvidence: BeamMemberEvidence[]; localEvidence: SideLocalEvidence[];
};
type TieForm = {uiKey: string; id: string; a: string; b: string; diameter: string; assembly: SideTieDefinition['assembly']; dossier: TieDossier | null};
type Form = {stage: string; loadCase: string; evidence: string; head: string; base: string; rebar: string; faces: FaceForm[]; ties: TieForm[]};
const text = (v: number | null | undefined) => v == null ? '' : String(v);
function faceForm(faceId: string, f?: SideFaceLayout): FaceForm {
  return {faceId, evidenceRef: f?.evidenceRef ?? '', studs: f?.studPositionsMm.join(', ') ?? '',
    walers: f?.walers.map(w => ({id: w.id, z: text(w.zMm), supports: w.supports.map(s => s.xMm).join(', '), supportIds: w.supports.map(s => s.id), pair: w.pair ?? null})) ?? [{id: 'W1', z: '', supports: '', supportIds: [], pair: null}, {id: 'W2', z: '', supports: '', supportIds: [], pair: null}],
    studE: text(f?.stud.E_MPa), studI: text(f?.stud.I_mm4), studEvidence: f?.stud.evidenceRef ?? '', railE: text(f?.rail.E_MPa), railI: text(f?.rail.I_mm4), railEvidence: f?.rail.evidenceRef ?? '',
    studResistanceEvidence: f?.stud.resistanceEvidence ?? [], railResistanceEvidence: f?.rail.resistanceEvidence ?? [],
    studBinding: f?.stud.binding ?? null, railBinding: f?.rail.binding ?? null,
    plywoodBinding: f?.plywood.binding ?? null, pressure: f?.pressure ?? null,
    thickness: text(f?.plywood.thicknessMm), plywoodE: text(f?.plywood.effectiveE_MPa), grain: f?.plywood.grainAxis ?? '', joints: f?.plywood.jointsAtEveryStud == null ? '' : String(f.plywood.jointsAtEveryStud), sheetJoints: (f?.plywood.sheetJointsMm ?? []).join(', '),
    plywoodEvidence: f?.plywood.evidenceRef ?? '', share: text(f?.heavierRailShare), shareEvidence: f?.sharingEvidence ?? '',
    plywoodResistanceEvidence: f?.plywood.resistanceEvidence ?? [], localEvidence: f?.localEvidence ?? []};
}
const studOf = (face: FaceForm) => ({E_MPa: previewNumber(face.studE), I_mm4: previewNumber(face.studI), evidenceRef: face.studEvidence, ...(face.studBinding ? {binding: face.studBinding} : {})});
const railOf = (face: FaceForm) => ({E_MPa: previewNumber(face.railE), I_mm4: previewNumber(face.railI), evidenceRef: face.railEvidence, ...(face.railBinding ? {binding: face.railBinding} : {})});
const plywoodOf = (face: FaceForm) => ({thicknessMm: previewNumber(face.thickness), effectiveE_MPa: previewNumber(face.plywoodE), grainAxis: (face.grain || null) as 'ALONG_FACE' | 'VERTICAL' | null,
  jointsAtEveryStud: face.joints === '' ? null : face.joints === 'true', ...(face.joints === 'false' ? {sheetJointsMm: list(face.sheetJoints)} : {}), evidenceRef: face.plywoodEvidence, ...(face.plywoodBinding ? {binding: face.plywoodBinding} : {})});
const endpointValue = (p: SideTieDefinition['a']) => JSON.stringify([p.faceId, p.walerId, p.supportId]);
function formOf(layout: AppliedSideLayout | null): Form {
  return {stage: layout?.stageId ?? '', loadCase: layout?.loadCaseId ?? '', evidence: layout?.evidenceRef ?? '', head: text(layout?.pourHeadMm), base: text(layout?.baseElevationMm), rebar: layout?.rebarClearanceEvidence ?? '',
    faces: layout?.faces.map(f => faceForm(f.faceId, f)) ?? [], ties: layout?.ties.map((t, i) => ({uiKey: `SAVED:${i}:${t.id}`, id: t.id, a: endpointValue(t.a), b: endpointValue(t.b), diameter: text(t.diameterMm), assembly: t.assembly, dossier: t.dossier ?? null})) ?? []};
}
function number(s: string) {if (!s.trim()) return null; const n = Number(s); if (!Number.isFinite(n)) throw Error('ต้องระบุตัวเลขที่มีค่าจำกัด'); return n;}
function previewNumber(s: string) {try {return number(s);} catch {return null;}}
function list(s: string) {if (!s.trim()) return []; return s.split(',').map(v => {const n = number(v); if (n === null) throw Error('รายการพิกัดมีช่องว่างระหว่างจุลภาค'); return n;});}
function supportsOf(w: FaceForm['walers'][number]) {
  const xs = list(w.supports), used = new Set(w.supportIds.slice(0, xs.length));
  return xs.map((xMm, i) => {let id = w.supportIds[i]; if (!id) {let n = i + 1; while (used.has(`S${n}`)) n++; id = `S${n}`; used.add(id);} return {id, xMm};});
}
function definitionOf(f: Form): SideLayoutDefinition {
  const endpoint = (s: string) => {if (!s) throw Error('ต้องเลือกจุดรองรับทั้งสองปลายของไทร์'); const [faceId, walerId, supportId] = JSON.parse(s); return {faceId, walerId, supportId};};
  return {schemaVersion: '1', stageId: f.stage, loadCaseId: f.loadCase, evidenceRef: f.evidence, pourHeadMm: number(f.head), baseElevationMm: number(f.base), rebarClearanceEvidence: f.rebar || null,
    faces: f.faces.map(face => ({faceId: face.faceId, evidenceRef: face.evidenceRef, studPositionsMm: list(face.studs),
      walers: face.walers.map(w => {const z = number(w.z); if (z === null) throw Error(`${face.faceId}/${w.id}: ระบุระดับคานรัด`);
        return {id: w.id, zMm: z, supports: supportsOf(w), ...(w.pair ? {pair: w.pair} : {})};}),
      stud: {E_MPa: number(face.studE), I_mm4: number(face.studI), evidenceRef: face.studEvidence, ...(face.studBinding ? {binding: face.studBinding} : {}),
        ...(face.studResistanceEvidence.length ? {resistanceEvidence: face.studResistanceEvidence} : {})},
      rail: {E_MPa: number(face.railE), I_mm4: number(face.railI), evidenceRef: face.railEvidence, ...(face.railBinding ? {binding: face.railBinding} : {}),
        ...(face.railResistanceEvidence.length ? {resistanceEvidence: face.railResistanceEvidence} : {})},
      plywood: {thicknessMm: number(face.thickness), effectiveE_MPa: number(face.plywoodE), grainAxis: (face.grain || null) as 'ALONG_FACE' | 'VERTICAL' | null,
        jointsAtEveryStud: face.joints === '' ? null : face.joints === 'true', ...(face.joints === 'false' ? {sheetJointsMm: list(face.sheetJoints)} : {}), evidenceRef: face.plywoodEvidence, ...(face.plywoodBinding ? {binding: face.plywoodBinding} : {}),
        ...(face.plywoodResistanceEvidence.length ? {resistanceEvidence: face.plywoodResistanceEvidence} : {})},
      heavierRailShare: number(face.share), sharingEvidence: face.shareEvidence || null, ...(face.pressure ? {pressure: face.pressure} : {}),
      ...(face.localEvidence.length ? {localEvidence: face.localEvidence} : {})})),
    ties: f.ties.map(t => ({id: t.id, a: endpoint(t.a), b: endpoint(t.b), diameterMm: number(t.diameter), assembly: t.assembly, ...(t.dossier ? {dossier: t.dossier} : {})}))};
}
export function SideLayoutEditor({topology, layout, onApply, onPendingChange, onDraftChange, selections, segmentedTie = false, revisionId}: {topology: Topology; layout: AppliedSideLayout | null;
  onApply: (definition: SideLayoutDefinition) => void; onPendingChange: (pending: boolean) => void;
  onDraftChange?: (definition: SideLayoutDefinition | null) => void; selections?: BindingSelections; segmentedTie?: boolean; revisionId?: string}) {
  const [form, setForm] = useState(() => formOf(layout)), [error, setError] = useState(''), [newFace, setNewFace] = useState(''), [productEpoch, setProductEpoch] = useState(0);
  // Revision restamping from an explicit soffit analysis must not erase unsaved side field edits.
  const identity = canonical(formOf(layout));
  const formRef = useRef(form), identityRef = useRef(identity), draftCallback = useRef(onDraftChange), nestedPending = useRef(new Set<string>());
  formRef.current = form; identityRef.current = identity; draftCallback.current = onDraftChange;
  const productPending = useCallback((slot: string, pending: boolean) => {
    if (pending) nestedPending.current.add(slot); else nestedPending.current.delete(slot);
    onPendingChange(nestedPending.current.size > 0 || canonical(formRef.current) !== identityRef.current);
    try {draftCallback.current?.(nestedPending.current.size ? null : definitionOf(formRef.current));} catch {draftCallback.current?.(null);}
  }, [onPendingChange]);
  useEffect(() => {const restored = formOf(layout); formRef.current = restored; nestedPending.current.clear(); setForm(restored); setProductEpoch(n => n + 1); setError(''); onPendingChange(false);}, [identity, onPendingChange]);
  useEffect(() => () => onPendingChange(false), [onPendingChange]);
  function change(next: Form) {formRef.current = next; setForm(next); setError(''); onPendingChange(nestedPending.current.size > 0 || canonical(next) !== canonical(formOf(layout)));
    try {onDraftChange?.(nestedPending.current.size ? null : definitionOf(next));} catch {onDraftChange?.(null);}}
  function faceChange(i: number, patch: Partial<FaceForm>) {
    const clearStudEvidence = ['studE', 'studI', 'studEvidence', 'studBinding'].some(k => Object.hasOwn(patch, k));
    const clearRailEvidence = ['railE', 'railI', 'railEvidence', 'railBinding'].some(k => Object.hasOwn(patch, k));
    const clearPlywoodEvidence = ['thickness', 'plywoodE', 'grain', 'joints', 'sheetJoints', 'plywoodEvidence', 'plywoodBinding'].some(k => Object.hasOwn(patch, k));
    change({...form, faces: form.faces.map((f, n) => n === i ? {...f, ...patch,
      ...(clearStudEvidence ? {studResistanceEvidence: []} : {}), ...(clearRailEvidence ? {railResistanceEvidence: []} : {}),
      ...(clearPlywoodEvidence ? {plywoodResistanceEvidence: []} : {})} : f)});
  }
  const endpointOptions = form.faces.flatMap(f => f.walers.flatMap(w => {
    let points: ReturnType<typeof supportsOf> = []; try {points = supportsOf(w);} catch {return [];}
    return points.map(p => ({value: endpointValue({faceId: f.faceId, walerId: w.id, supportId: p.id}),
      label: `${f.faceId}/${w.id}/${p.id} · x ${p.xMm} / z ${w.z || '?'} mm`}));
  }));
  return <fieldset className="side-editor"><legend>แบบข้าง · ไม้อัด → คร่าว → คานรัดคู่ → จุดรองรับจริง</legend>
    <p>พิกัด x ตามผิวจากจุดเริ่ม A ไป B ส่วน z วัดขึ้นจากฐานคอนกรีต ใช้แรงดัน Hydrostatic ตามหัวเทที่ระบุ แยกจาก DL/LL แนวดิ่ง</p>
    <div className="form-grid">{([['stage', 'Stage แบบข้าง'], ['loadCase', 'Load case แบบข้าง'], ['evidence', 'หลักฐานแบบข้าง'], ['head', 'หัวคอนกรีตเหนือฐานแบบข้าง · mm'], ['base', 'ระดับฐานคอนกรีตแบบข้าง · mm'], ['rebar', 'หลักฐานตรวจช่องเหล็กเสริม/ไทร์']] as const).map(([key, label]) => <label className="field" key={key}><span>{label}</span><input type={key === 'head' || key === 'base' ? 'number' : 'text'} step="any" value={form[key]} onChange={e => change({...form, [key]: e.target.value})}/></label>)}</div>
    <label className="field"><span>ผิวจริงที่ต้องการจัดสมาชิก</span><select value={newFace} onChange={e => setNewFace(e.target.value)}><option value="">เลือกผิว</option>{topology.faces.filter(f => !form.faces.some(i => i.faceId === f.id)).map(f => <option key={f.id} value={f.id}>{f.id} · A ({f.a.x}, {f.a.y}) → B ({f.b.x}, {f.b.y}) · {f.lengthMm} mm</option>)}</select></label>
    <button className="btn secondary" disabled={!newFace} onClick={() => {change({...form, faces: [...form.faces, faceForm(newFace)]}); setNewFace('');}}>เพิ่มผิวจริงในแบบข้าง</button>
    {form.faces.map((f, i) => <fieldset className="side-face-editor" key={f.faceId} aria-label={`กำหนดแบบข้าง ${f.faceId}`}><legend>{f.faceId} · สมาชิกต่อเนื่องตามผิวจริง</legend>
      <div className="form-grid">{([['evidenceRef', 'หลักฐานผิว/สมาชิก'], ['studs', 'คร่าว x · mm (คั่นด้วยจุลภาค เริ่ม 0 ถึงปลายผิว)'], ['studE', 'E คร่าว · MPa'], ['studI', 'I คร่าวแกนดัด · mm⁴'], ['studEvidence', 'หลักฐานหน้าตัดและวัสดุคร่าว'],
        ['railE', 'E คานรัดหนึ่งราง · MPa'], ['railI', 'I คานรัดหนึ่งราง · mm⁴'], ['railEvidence', 'หลักฐานราง/แกน/วัสดุ'], ['share', 'สัดส่วนแรงรางที่รับมากกว่า · 0.5 ถึง 1'], ['shareEvidence', 'หลักฐาน/สมมติฐานแบ่งแรงราง'],
        ['thickness', 'ไม้อัดหนาจริง · mm'], ['plywoodE', 'E ไม้อัดตามทิศดัดและสภาพเปียก · MPa'], ['plywoodEvidence', 'หลักฐานผลิตภัณฑ์/เสี้ยน/สภาพไม้อัด']] as const).map(([key, label]) => <label className="field" key={key}><span>{label}</span><input disabled={(!!f.studBinding && ['studE', 'studI'].includes(key)) || (!!f.railBinding && ['railE', 'railI'].includes(key)) || (!!f.plywoodBinding && key === 'plywoodE')} type={['studE', 'studI', 'railE', 'railI', 'share', 'thickness', 'plywoodE'].includes(key) ? 'number' : 'text'} step="any" value={f[key]} onChange={e => faceChange(i, {[key]: e.target.value})}/></label>)}</div>
      <ElasticBindingEditor binding={f.studBinding} role="STUD" label={`${f.faceId}:STUD`} selections={selections} onChange={binding => faceChange(i, {studBinding: binding, studE: '', studI: '', studEvidence: ''})}/>
      <BeamMemberEvidenceEditor value={f.studResistanceEvidence} memberEvidenceRef={beamMemberEvidenceReference('SIDE_STUD', {
        E_MPa: previewNumber(f.studE), I_mm4: previewNumber(f.studI), evidenceRef: f.studEvidence, binding: f.studBinding ?? null})}
        onChange={resistanceEvidence => faceChange(i, {studResistanceEvidence: resistanceEvidence})}/>
      <ElasticBindingEditor binding={f.railBinding} role="WALER" label={`${f.faceId}:SHARED_RAIL`} selections={selections} onChange={binding => faceChange(i, {railBinding: binding, railE: '', railI: '', railEvidence: ''})}/>
      <BeamMemberEvidenceEditor value={f.railResistanceEvidence} memberEvidenceRef={beamMemberEvidenceReference('SIDE_SHARED_RAIL', {
        E_MPa: previewNumber(f.railE), I_mm4: previewNumber(f.railI), evidenceRef: f.railEvidence, binding: f.railBinding ?? null})}
        onChange={resistanceEvidence => faceChange(i, {railResistanceEvidence: resistanceEvidence})}/>
      <label className="field"><span>ทิศเสี้ยนหลักไม้อัด</span><select value={f.grain} onChange={e => faceChange(i, {grain: e.target.value})}><option value="">ยังไม่ทราบ</option><option value="ALONG_FACE">ตามผิว x</option><option value="VERTICAL">แนวดิ่ง z</option></select></label>
      <label className="field"><span>รอยต่อไม้อัดบนคร่าวทุกแนว / แบบจำลองแถบช่วงเดียว</span><select value={f.joints} onChange={e => faceChange(i, {joints: e.target.value})}><option value="">ยังไม่ยืนยัน</option><option value="true">ยืนยันรอยต่อและรองรับขอบทุกช่วง</option><option value="false">แผ่นต่อเนื่องบนหลายคร่าว · ระบุตำแหน่งรอยต่อแผ่น</option></select></label>
      {f.joints === 'false' && <label className="field"><span>ตำแหน่งรอยต่อแผ่นตามแนวผิว · mm (คั่นด้วยจุลภาค ต้องอยู่บนแนวคร่าว; ว่าง = แผ่นเดียวต่อเนื่องตลอด)</span><input value={f.sheetJoints} onChange={e => faceChange(i, {sheetJoints: e.target.value})}/></label>}
      <PlywoodBindingEditor binding={f.plywoodBinding} materialSelection={selections?.material} label={`${f.faceId}:PLYWOOD`} thicknessMm={previewNumber(f.thickness)} grainRelativeDeg={f.grain === '' ? null : f.grain === 'ALONG_FACE' ? 0 : 90} onChange={binding => faceChange(i, {plywoodBinding: binding, plywoodE: ''})}/>
      <p>ขีดจำกัดไม้อัดด้านล่างเป็นค่าต่อแถบกว้าง 1000 mm (N·mm/m, N/m, mm) รวม rolling shear ตามวิธีที่ผู้ตรวจระบุ ไม่อนุมานจาก E หรือชื่อเกรด</p>
      <BeamMemberEvidenceEditor value={f.plywoodResistanceEvidence} memberEvidenceRef={sidePlywoodEvidenceReference(plywoodOf(f))}
        onChange={resistanceEvidence => faceChange(i, {plywoodResistanceEvidence: resistanceEvidence})}/>
      <SideLocalEvidenceEditor faceId={f.faceId} value={f.localEvidence}
        memberEvidenceRef={sideLocalMemberReference({stud: studOf(f), rail: railOf(f), walers: f.walers.map(w => ({id: w.id, pair: w.pair}))})}
        onChange={localEvidence => faceChange(i, {localEvidence})}/>
      <SidePressureEditor value={f.pressure} onChange={pressure => faceChange(i, {pressure})}/>
      {f.walers.map((w, j) => <div className="form-grid side-waler-editor" key={j} aria-label={`กำหนดคานรัด ${f.faceId}/${w.id}`}>
        {([['id', 'รหัสคานรัด'], ['z', 'ระดับคานรัด z · mm'], ['supports', 'จุดรองรับคานรัด x · mm (คั่นด้วยจุลภาค)']] as const).map(([key, label]) => <label className="field" key={key}><span>{label}</span><input type={key === 'z' ? 'number' : 'text'} value={w[key]} onChange={e => faceChange(i, {walers: f.walers.map((row, n) => n === j ? {...row, [key]: e.target.value} : row)})}/></label>)}
        {f.walers.length > 2 && <button className="btn secondary" onClick={() => faceChange(i, {walers: f.walers.filter((_, n) => n !== j)})}>ลบคานรัด {w.id}</button>}
        <PairedWalerEditor pair={w.pair} selections={selections} supportIds={(() => {try {return supportsOf(w).map(s => s.id);} catch {return [];}})()} onChange={pair => faceChange(i, {walers: f.walers.map((row, n) => n === j ? {...row, pair} : row)})}/>
      </div>)}
      <button className="btn secondary" disabled={f.walers.length >= 12} onClick={() => {let n = 1; while (f.walers.some(w => w.id === `W${n}`)) n++; faceChange(i, {walers: [...f.walers, {id: `W${n}`, z: '', supports: '', supportIds: [], pair: null}]});}}>เพิ่มระดับคานรัด {f.faceId}</button>
      <button className="btn secondary" onClick={() => change({...form, faces: form.faces.filter((_, n) => n !== i)})}>ลบผิว {f.faceId} จากร่าง</button>
    </fieldset>)}
    <p>คานรัดแต่ละระดับวิเคราะห์สองรางแยกกันตามสัดส่วนที่ประกาศ ขอบเขตคู่ด้านไม่สร้างรอยต่อคานรัด จุดรองรับที่ยังไม่ผูกไทร์/Clamp/End-stop จะรายงานว่าขาด</p>
    {form.ties.map((t, i) => <fieldset key={t.uiKey}><legend>แนวไทร์ {i + 1}</legend><div className="form-grid">
      <label className="field"><span>รหัสไทร์</span><input value={t.id} onChange={e => change({...form, ties: form.ties.map((row, n) => n === i ? {...row, id: e.target.value} : row)})}/></label>
      {(['a', 'b'] as const).map(key => <label className="field" key={key}><span>จุดรองรับปลาย {key.toUpperCase()}</span><select value={t[key]} onChange={e => change({...form, ties: form.ties.map((row, n) => n === i ? {...row, [key]: e.target.value, assembly: null} : row)})}><option value="">เลือกจุดจริง</option>{endpointOptions.map((o, n) => <option key={n} value={o.value}>{o.label}</option>)}</select></label>)}
      <label className="field"><span>เส้นผ่านศูนย์กลางกรอบภายนอกไทร์/ปลอก · mm</span><input type="number" value={t.diameter} onChange={e => change({...form, ties: form.ties.map((row, n) => n === i ? {...row, diameter: e.target.value, assembly: null} : row)})}/></label>
    </div><p>{t.assembly ? 'มีข้อมูล Assembly ในร่าง · การเปลี่ยนแนวหรือขนาดจะยกเลิกข้อมูลชุดเดิม' : t.dossier ? 'เก็บทะเบียนสินค้าแยกแล้ว การย้ายแนว/ขนาดทำให้ต้องผูกพิกัดใหม่' : 'ยังไม่มีชุดผลิตภัณฑ์ครบ · วิเคราะห์แรงก่อน ตรวจความเข้ากันได้และกำลังภายหลัง'}</p>
      <TieDossierEditor key={`${t.uiKey}:${productEpoch}`} value={t.dossier} legacy={t.assembly} enabled={segmentedTie} tieId={t.id} slotPrefix={t.uiKey} revisionId={revisionId ?? layout?.revisionId ?? 'UNAPPLIED_DRAFT'} onPendingChange={productPending}
        onChange={dossier => change({...form, ties: form.ties.map((old, n) => n === i ? {...old, dossier, assembly: dossier ? null : old.assembly} : old)})}
        onBindContext={() => {if (nestedPending.current.size) throw Error('มีช่อง Custom ค้าง กรุณาใช้หรือยกเลิกก่อนผูกพิกัด'); const d = definitionOf(form); return tieGeometryContext(topology, d, d.ties[i]);}}
        templates={form.ties.filter((old, n) => n !== i && old.dossier).map(old => ({id: old.id, dossier: old.dossier!}))}
        onCopy={dossier => {if (nestedPending.current.size) throw Error('มีช่อง Custom ค้าง กรุณาใช้หรือยกเลิกก่อนคัดลอก'); change({...form, ties: form.ties.map((old, n) => n === i ? {...old, dossier, assembly: null} : old)});}}/>
      <button className="btn secondary" onClick={() => change({...form, ties: form.ties.filter((_, n) => n !== i)})}>ลบไทร์ {t.id}</button></fieldset>)}
    <button className="btn secondary" disabled={form.ties.length >= 1000} onClick={() => {let n = 1; while (form.ties.some(t => t.id === `T${n}`)) n++; change({...form, ties: [...form.ties, {uiKey: `NEW:${globalThis.crypto.randomUUID()}`, id: `T${n}`, a: '', b: '', diameter: '', assembly: null, dossier: null}]});}}>เพิ่มแนวไทร์จริง</button>
    <p>ผลนี้เป็นการวิเคราะห์แรงบริการ ไม่ใช่กำลังใช้งาน Column yoke/Clamp และ Ground brace ต้องมีแบบจำลองระบบของตนเอง</p>
    {error && <p role="alert">{error}</p>}
    <button className="btn secondary" onClick={() => {try {if (nestedPending.current.size) throw Error('มีช่อง Custom ของผลิตภัณฑ์ค้าง กรุณาใช้หรือยกเลิกก่อนวิเคราะห์'); onApply(definitionOf(form)); setError(''); onPendingChange(false);} catch (e) {setError((e as Error).message);}}}>ตรวจแบบข้างและวิเคราะห์ร่างใหม่</button>
    <button className="btn secondary" onClick={() => {nestedPending.current.clear(); setProductEpoch(n => n + 1); change(formOf(layout)); onPendingChange(false);}}>คืนค่าแบบข้างที่นำไปใช้ล่าสุด</button>
  </fieldset>;
}
