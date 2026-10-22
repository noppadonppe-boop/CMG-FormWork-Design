import React, {useMemo, useRef, useState} from 'react';
import {ArrowLeft, Eye, EyeOff, Maximize2, RotateCcw, RotateCw, ZoomIn, ZoomOut} from 'lucide-react';
import type {Check, Input, Result} from '../domain/index';
import {beamAdvice, calculateBeam, type BeamInput, type BeamResult} from '../domain/beam';
import {calculateSlab, slabAdvice, type SlabInput, type SlabResult} from '../domain/slab';
import {calculateWall, wallAdvice, type WallInput, type WallResult} from '../domain/wall';
import {beamModel3D, legacyModel3D, slabModel3D, wallModel3D, GROUP_CHECKS, GROUP_COLOR, GROUP_LABEL, type Element3D, type FormworkModel3D, type PartGroup} from '../domain/model3d';
import {editFields, editableGroups, isGeometryEdit, type EditField} from '../domain/model3dEdit';
import {MemberPicker, fmt} from './FormParts';
import {SectionPicker} from './SectionPicker';
import {ThreeViewport, type ViewName, type ViewportApi} from './ThreeViewport';

export type Model3DTarget =
  | {element: 'FOOTING' | 'COLUMN'; input: Input; result: Result | null; error: string | null; onChange: (changes: Partial<Input>) => void}
  | {element: 'BEAM'; input: BeamInput; result: BeamResult | null; error: string | null; onChange: (x: BeamInput) => void}
  | {element: 'SLAB'; input: SlabInput; result: SlabResult | null; error: string | null; onChange: (x: SlabInput) => void}
  | {element: 'WALL'; input: WallInput; result: WallResult | null; error: string | null; onChange: (x: WallInput) => void};

/** Guards the WebGL view against degenerate layouts (e.g. a spacing typed as 1 mm). */
const MAX_PARTS = 6000;
const ELEMENT_LABEL: Record<Element3D, string> = {FOOTING: 'ฐานราก', COLUMN: 'เสา', BEAM: 'คาน', SLAB: 'พื้น', WALL: 'ผนัง'};
const VIEWS: [ViewName, string][] = [['iso', 'ไอโซ'], ['front', 'ด้านหน้า'], ['side', 'ด้านข้าง'], ['top', 'แปลน']];

function buildModel(t: Model3DTarget): FormworkModel3D | null {
  if (!t.result) return null;
  return t.element === 'BEAM' ? beamModel3D(t.result) : t.element === 'SLAB' ? slabModel3D(t.result) : t.element === 'WALL' ? wallModel3D(t.result) : legacyModel3D(t.result);
}

/** Number field that commits on Enter/blur, so intermediate keystrokes never rebuild the model with a tiny spacing. */
function CommitNumber({label, unit, help, value, disabled, onCommit}: {label: string; unit?: string; help?: string; value: number; disabled: boolean; onCommit: (v: number) => void}) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {if (draft === null) return; const v = Number(draft); setDraft(null); if (Number.isFinite(v) && v !== value) onCommit(v);};
  return <label className="field"><span>{label}{unit && <small>{unit}</small>}</span>
    <input type="number" step="any" min="0" aria-label={label} disabled={disabled} value={draft ?? String(value)} onChange={e => setDraft(e.target.value)}
      onBlur={commit} onKeyDown={e => {if (e.key === 'Enter') commit(); if (e.key === 'Escape') setDraft(null);}}/>
    {help && <small className="help">{help}</small>}</label>;
}

export function Model3DWorkspace({target, caseName, canEdit, stockIds, dirty = false, onBack}: {target: Model3DTarget; caseName: string; canEdit: boolean; stockIds?: string[]; dirty?: boolean; onBack: () => void}) {
  const model = useMemo(() => {try {return buildModel(target);} catch {return null;}}, [target.result]);
  const [rejected, setRejected] = useState('');
  const [selected, setSelected] = useState<PartGroup | null>(null), [picked, setPicked] = useState<string | null>(null), [hidden, setHidden] = useState<PartGroup[]>([]);
  const api = useRef<ViewportApi>(null);
  const tooMany = !!model && model.parts.length > MAX_PARTS;
  const groups = useMemo(() => {
    const m = new Map<PartGroup, number>(); for (const p of model?.parts ?? []) m.set(p.group, (m.get(p.group) ?? 0) + 1);
    // Without a model (invalid input) the editable groups are still listed so the value can be corrected here.
    return model ? [...m.entries()] : editableGroups(target.element).map(g => [g, 0] as [PartGroup, number]);
  }, [model, target.element]);
  const x = target.input as unknown as Record<string, unknown>;
  const write = (changes: Record<string, unknown>, group: PartGroup) => {
    if (!canEdit) return;
    const geometry = isGeometryEdit(group);
    if (target.element === 'FOOTING' || target.element === 'COLUMN') target.onChange(changes as Partial<Input>);
    else {
      // Reject a value the engine cannot calculate (e.g. bearer lines narrower than beam + slab strips) instead of breaking the model.
      const next = {...target.input, ...changes, ...(geometry ? {confirmed: false} : {})};
      try {(target.element === 'BEAM' ? calculateBeam : target.element === 'SLAB' ? calculateSlab : calculateWall)(next);}
      catch (e) {setRejected((e as Error).message); return;}
      (target.onChange as (v: unknown) => void)(next);
    }
    setRejected('');
  };
  const checks: Check[] = selected ? (target.result?.checks ?? []).filter(k => GROUP_CHECKS[selected].some(p => k.id.startsWith(p))) : [];
  const fields = selected ? editFields(target.element, selected).filter(f => !(target.element === 'FOOTING' || target.element === 'COLUMN') || !('key' in f) || !['armX', 'armY'].includes(f.key) || (target.input as Input).shape === 'L') : [];
  const spacingKeys = fields.flatMap(f => f.kind === 'number' && /Spacing$/.test(f.key) ? [f.key] : []);
  const advice = useMemo(() => {
    if (!spacingKeys.length || !target.result) return [];
    try {
      const all = target.element === 'BEAM' ? beamAdvice(target.input) : target.element === 'SLAB' ? slabAdvice(target.input) : target.element === 'WALL' ? wallAdvice(target.input) : [];
      return all.filter(a => spacingKeys.includes(a.key));
    } catch {return [];}
  }, [target.input, spacingKeys.join()]);
  const pickedPart = model?.parts.find(p => p.id === picked);
  const select = (g: PartGroup | null, id: string | null = null) => {setSelected(g); setPicked(id); setRejected('');};

  function renderField(f: EditField, group: PartGroup) {
    if (f.kind === 'legacySection') return <SectionPicker key="legacy-section" input={target.input as Input} canEdit={canEdit} onChange={ch => write(ch, group)}/>;
    if (f.kind === 'section') return <MemberPicker key={f.key} x={x} k={f.key} role={f.role} title={f.label} canEdit={canEdit} stockIds={stockIds} edit={ch => write(ch, group)}/>;
    if (f.kind === 'select') return <label key={f.key} className="field"><span>{f.label}</span><select aria-label={f.label} disabled={!canEdit} value={String(x[f.key])}
      onChange={e => write({[f.key]: f.options[e.target.selectedIndex][0]}, group)}>{f.options.map(([v, l]) => <option key={String(v)} value={String(v)}>{l}</option>)}</select></label>;
    return <CommitNumber key={f.key} label={f.label} unit={f.unit} help={f.help} value={Number(x[f.key])} disabled={!canEdit} onCommit={v => write({[f.key]: v}, group)}/>;
  }

  return <section className="model3d-workspace" aria-label="โมเดล 3D แบบหล่อ">
    <div className="model3d-head">
      <button className="btn secondary" onClick={onBack}><ArrowLeft size={15}/>กลับรูปทรงและมิติ</button>
      <div><h2>โมเดล 3D แบบหล่อ{ELEMENT_LABEL[target.element]}</h2><p className="muted">{caseName} · คลิกชิ้นส่วนเพื่อแก้หน้าตัด ระยะ และขนาด · ลากเพื่อหมุน คลิกขวาลากเพื่อเลื่อน ล้อเมาส์เพื่อซูม</p></div>
      {dirty && <span className="pill amber model3d-dirty">มีการแก้ไขที่ยังไม่บันทึก</span>}
      {target.result && <span className={'pill ' + (target.result.status === 'FAIL' ? 'red' : 'amber')}>{target.result.status}</span>}
      <button className="btn model3d-close" onClick={onBack}>ปิดโมเดล</button>
    </div>
    <div className="model3d-toolbar" role="toolbar" aria-label="มุมมอง 3D">
      {VIEWS.map(([v, l]) => <button key={v} className="btn secondary" onClick={() => api.current?.setView(v)}>{l}</button>)}
      <span className="model3d-sep"/>
      {(['x', 'y', 'z'] as const).map(a => <span key={a} className="model3d-axis"><b className={'axis-' + a}>{a.toUpperCase()}</b>
        <button className="btn secondary icon" title={`หมุนรอบแกน ${a.toUpperCase()} −15°`} aria-label={`หมุนรอบแกน ${a.toUpperCase()} ลบ`} onClick={() => api.current?.rotate(a, -15)}><RotateCcw size={14}/></button>
        <button className="btn secondary icon" title={`หมุนรอบแกน ${a.toUpperCase()} +15°`} aria-label={`หมุนรอบแกน ${a.toUpperCase()} บวก`} onClick={() => api.current?.rotate(a, 15)}><RotateCw size={14}/></button></span>)}
      <span className="model3d-sep"/>
      <button className="btn secondary icon" aria-label="ซูมเข้า" onClick={() => api.current?.zoom(0.8)}><ZoomIn size={15}/></button>
      <button className="btn secondary icon" aria-label="ซูมออก" onClick={() => api.current?.zoom(1.25)}><ZoomOut size={15}/></button>
      <button className="btn secondary icon" aria-label="พอดีจอ" onClick={() => api.current?.fit()}><Maximize2 size={15}/></button>
    </div>
    <div className="model3d-body">
      <div className="model3d-stage">
        {target.error ? <div className="warning"><b>สร้างโมเดลไม่ได้: {target.error}</b><br/>แก้ค่าที่ผิดจากรายการชิ้นส่วนด้านขวา หรือกด ปิดโมเดล แล้วเลือก ไม่บันทึก (คืนค่าเดิม)</div> : !model ? <div className="warning">ยังสร้างโมเดลไม่ได้ ตรวจมิติและระยะก่อน</div>
          : tooMany ? <div className="warning">ชิ้นส่วนมากเกินไป ({model.parts.length.toLocaleString('en-US')} ชิ้น) ตรวจระยะที่กรอก เช่น ระยะคร่าวเล็กผิดปกติ</div>
          : <ThreeViewport ref={api} model={model} selected={selected} hidden={hidden} onPick={(g, id) => select(g, id)}/>}
        <p className="muted model3d-note">โมเดลคัดกรองเบื้องต้น (NTS สำหรับจุดต่อ) ไม่ใช่แบบก่อสร้าง · {model?.notes.join(' · ')}</p>
      </div>
      <div className="model3d-panel">
        <h3>ชิ้นส่วนแบบหล่อ</h3>
        <ul className="model3d-groups">{groups.map(([g, n]) => <li key={g} className={selected === g ? 'active' : ''}>
          <button className="model3d-group" onClick={() => select(selected === g ? null : g)} aria-pressed={selected === g}><i style={{background: GROUP_COLOR[g]}}/>{GROUP_LABEL[g]}<small>{model ? n + ' ชิ้น' : ''}</small></button>
          <button className="btn secondary icon" aria-label={(hidden.includes(g) ? 'แสดง ' : 'ซ่อน ') + GROUP_LABEL[g]} onClick={() => setHidden(h => h.includes(g) ? h.filter(v => v !== g) : [...h, g])}>{hidden.includes(g) ? <EyeOff size={14}/> : <Eye size={14}/>}</button>
        </li>)}</ul>
        {!selected ? <p className="muted">คลิกชิ้นส่วนในโมเดล หรือเลือกจากรายการ เพื่อแก้ไขข้อมูล</p> : <div className="model3d-editor" aria-label={'แก้ไข ' + GROUP_LABEL[selected]}>
          <h3><i style={{background: GROUP_COLOR[selected]}}/>{GROUP_LABEL[selected]}</h3>
          {pickedPart && <p className="muted">ชิ้นที่เลือก: {pickedPart.label}</p>}
          {rejected && <div className="warning" role="alert">ไม่ได้ใช้ค่าที่แก้: {rejected}</div>}
          {!canEdit && <p className="notice">สิทธิ์ดูอย่างเดียว · แก้ไขไม่ได้</p>}
          {isGeometryEdit(selected) && <p className="notice">แก้มิติคอนกรีตแล้วต้องยืนยันมิติใหม่ในหน้ารูปทรงและมิติ</p>}
          {fields.length ? fields.map(f => renderField(f, selected)) : <p className="muted">ชิ้นส่วนนี้แสดงประกอบ ไม่มีค่าที่แก้จากโมเดลได้</p>}
          {advice.length > 0 && <table><thead><tr><th>ระยะ</th><th>ปัจจุบัน</th><th>สูงสุดที่ผ่าน</th><th/></tr></thead><tbody>{advice.map(a => <tr key={a.key}><td>{a.label}</td><td>{a.current}</td>
            <td className={a.max === null || a.max < a.current ? 'warn' : 'pass'}>{a.max ?? 'ไม่มี'}</td>
            <td>{a.max !== null && a.max !== a.current && <button className="btn secondary" disabled={!canEdit} onClick={() => write({[a.key]: a.max}, selected)}>ใช้ {a.max}</button>}</td></tr>)}</tbody></table>}
          {checks.length > 0 && <table className="model3d-checks"><thead><tr><th>ผลตรวจ</th><th>Ratio</th><th>สถานะ</th></tr></thead><tbody>{checks.map(k =>
            <tr key={k.id}><td>{k.label}</td><td>{fmt(k.utilization, 2)}</td><td><span className={'pill ' + (k.status === 'FAIL' ? 'red' : 'amber')}>{k.status}</span></td></tr>)}</tbody></table>}
        </div>}
      </div>
    </div>
  </section>;
}
export default Model3DWorkspace;
