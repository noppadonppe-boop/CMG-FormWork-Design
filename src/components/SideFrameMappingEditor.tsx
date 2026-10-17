import React from 'react';
import {emptySideFrame, sideSupportKey, type SideFrameDefinition} from '../domain/workflowV07/sideFrameTransfer';
import type {SideEndpoint} from '../domain/workflowV07/sideLayout';
import type {FrameNodeDraft} from '../domain/workflowV07/frameWorkflow';
import {emptyCouplingCorner, emptyCouplingRailAxial, emptyCouplingTie, emptySideCoupling, sideCouplingReference, type SideCouplingCorner, type SideCouplingDefinition, type SideCouplingRailAxial, type SideCouplingTie} from '../domain/workflowV07/sideCoupled';
import {SIDE_COUPLED_LIMIT_KINDS} from '../domain/workflowV07/sideLocalChecks';
import {SideLocalEvidenceEditor} from './SideLocalEvidenceEditor';

const number = (v: string) => v.trim() && Number.isFinite(Number(v)) ? Number(v) : null;
function CouplingEditor({value, tieIds, walers, onChange}: {value: SideCouplingDefinition; tieIds: string[]; walers: {faceId: string; walerId: string}[]; onChange: (v: SideCouplingDefinition) => void}) {
  // Editing stiffness data clears the bound limits; no stiffness or capacity is filled in automatically.
  const change = (patch: Partial<SideCouplingDefinition>, stiffnessChanged = true) => onChange({...value, ...patch, ...(stiffnessChanged ? {limits: []} : {})});
  const updateTie = (i: number, p: Partial<SideCouplingTie>) => change({ties: value.ties.map((t, j) => j === i ? {...t, ...p} : t)});
  const updateCorner = (i: number, p: Partial<SideCouplingCorner>) => change({corners: value.corners.map((c, j) => j === i ? {...c, ...p} : c)});
  const axial = value.railAxial ?? [];
  const updateAxial = (i: number, p: Partial<SideCouplingRailAxial>) => change({railAxial: axial.map((r, j) => j === i ? {...r, ...p} : r)});
  const walerKey = (f: string, w: string) => `${f}/${w}`;
  return <fieldset className="side-coupling-editor" aria-label="แบบจำลองร่วมไทร์ เฟรม และอุปกรณ์มุม"><legend>แบบจำลองร่วม · คร่าว + คานรัด + ไทร์ + เฟรม + อุปกรณ์มุม</legend>
    <p>ทุกจุดรองรับ จุดที่คร่าวพาดบนคานรัด และปลายรางที่มุมเคลื่อนตัวร่วมกัน คร่าวรับแรงจากแผ่นและกระจายตามความแข็งจริงของคานรัดและจุดรองรับ รางคู่ใช้การเคลื่อนตัวเดียวกันที่จุดพาดคร่าวและที่ปลาย แรงจากไม้อัดลงคร่าวยังใช้ผลแบบรองรับแข็ง ค่าความแข็ง ระยะหย่อน แรงดึงล่วงหน้า และช่องว่างทั้งหมดต้องมีหลักฐานจากผู้ใช้</p>
    <label className="field"><span>หลักฐานทบทวนสมมติฐานแบบจำลองร่วม</span><input value={value.assumptionsEvidenceRef} onChange={e => change({assumptionsEvidenceRef: e.target.value}, false)}/></label>
    <h4>ความแข็งไทร์ ({value.ties.length}/{tieIds.length})</h4>
    {value.ties.map((t, i) => <div className="form-grid" key={i}>
      <label className="field"><span>ไทร์</span><select value={t.tieId} onChange={e => updateTie(i, {...emptyCouplingTie(e.target.value)})}><option value="">ยังไม่เลือก</option>{t.tieId && !tieIds.includes(t.tieId) && <option value={t.tieId}>{t.tieId} · ค้าง</option>}{tieIds.map(id => <option key={id}>{id}</option>)}</select></label>
      {([['E_MPa', 'E ไทร์ · MPa'], ['A_mm2', 'A ไทร์ที่ใช้คำนวณความแข็ง · mm²'], ['effectiveLengthMm', 'ความยาวยืดได้จริง · mm (≥ ระยะเส้นทาง)']] as const).map(([k, label]) =>
        <label className="field" key={k}><span>{label}</span><input type="number" min="0" step="any" value={t[k] ?? ''} onChange={e => updateTie(i, {[k]: number(e.target.value)})}/></label>)}
      <label className="field"><span>แรงดึงล่วงหน้า · N (ว่าง = ไม่มี)</span><input type="number" min="0" step="any" value={t.pretensionN ?? ''} onChange={e => updateTie(i, {pretensionN: number(e.target.value)})}/></label>
      <label className="field"><span>ระยะหย่อนก่อนรับแรง · mm (ว่าง = ไม่มี)</span><input type="number" min="0" step="any" value={t.slackMm ?? ''} onChange={e => updateTie(i, {slackMm: number(e.target.value)})}/></label>
      <label className="field"><span>หลักฐาน E/A/ความยาว/แรงดึงล่วงหน้า/ระยะหย่อน</span><input value={t.evidenceRef} onChange={e => updateTie(i, {evidenceRef: e.target.value})}/></label>
      <button className="btn secondary" onClick={() => change({ties: value.ties.filter((_, j) => j !== i)})}>ลบความแข็งไทร์ {t.tieId || i + 1}</button>
    </div>)}
    <button className="btn secondary" disabled={!tieIds.some(id => !value.ties.some(t => t.tieId === id))} onClick={() => change({ties: [...value.ties, ...tieIds.filter(id => !value.ties.some(t => t.tieId === id)).map(id => emptyCouplingTie(id))]})}>เพิ่มแถวไทร์ที่ยังขาด</button>
    <h4>อุปกรณ์มุม ({value.corners.length})</h4>
    <p>เชื่อมปลายรางสองผิวที่มุมเดียวกันและระดับเดียวกัน สปริงทำงานเท่ากันทุกทิศในแนวราบ ช่องว่าง (slip gap) คือระยะเคลื่อนสัมพัทธ์ที่ยังไม่รับแรง ยังไม่รวมแรงเสียดทานที่ลื่นหรือการหมุนของอุปกรณ์</p>
    {value.corners.map((c, i) => <div className="form-grid" key={i}>
      <label className="field"><span>รหัสมุม</span><input value={c.id} onChange={e => updateCorner(i, {id: e.target.value})}/></label>
      {(['A', 'B'] as const).map(side => <label className="field" key={side}><span>ผิว/คานรัด {side}</span><select value={c[`face${side}Id`] ? walerKey(c[`face${side}Id`], c[`waler${side}Id`]) : ''} onChange={e => {
        const [faceId = '', walerId = ''] = e.target.value.split('/'); updateCorner(i, {[`face${side}Id`]: faceId, [`waler${side}Id`]: walerId});
      }}><option value="">ยังไม่เลือก</option>{walers.map(w => <option key={walerKey(w.faceId, w.walerId)} value={walerKey(w.faceId, w.walerId)}>{w.faceId} / {w.walerId}</option>)}</select></label>)}
      <label className="field"><span>ความแข็งอุปกรณ์มุม · N/mm</span><input type="number" min="0" step="any" value={c.stiffnessNPerMm ?? ''} onChange={e => updateCorner(i, {stiffnessNPerMm: number(e.target.value)})}/></label>
      <label className="field"><span>ช่องว่างก่อนรับแรง · mm (ว่าง = ไม่มี)</span><input type="number" min="0" step="any" value={c.slipGapMm ?? ''} onChange={e => updateCorner(i, {slipGapMm: number(e.target.value)})}/></label>
      <label className="field"><span>หลักฐานความแข็ง/ช่องว่าง/ผลิตภัณฑ์มุม</span><input value={c.evidenceRef} onChange={e => updateCorner(i, {evidenceRef: e.target.value})}/></label>
      <button className="btn secondary" onClick={() => change({corners: value.corners.filter((_, j) => j !== i)})}>ลบมุม {c.id}</button>
    </div>)}
    <button className="btn secondary" disabled={value.corners.length >= 200} onClick={() => {let n = 1; while (value.corners.some(c => c.id === `C${n}`)) n++; change({corners: [...value.corners, emptyCouplingCorner(`C${n}`)]});}}>เพิ่มอุปกรณ์มุม</button>
    <h4>ความแข็งตามแนวแกนคานรัด ({axial.length})</h4>
    <p>ใช้เฉพาะคานรัดที่มีอุปกรณ์มุมทั้งสองปลาย E·A รวมของรางคู่ทั้งระดับ ความยาวคือความยาวผิว ถ้าไม่กรอกจะถือว่ารางไม่ยืดตามแกนและแสดงเป็น blocker</p>
    {axial.map((r, i) => <div className="form-grid" key={i}>
      <label className="field"><span>ผิว/คานรัด</span><select value={r.faceId ? walerKey(r.faceId, r.walerId) : ''} onChange={e => {const [faceId = '', walerId = ''] = e.target.value.split('/'); updateAxial(i, {faceId, walerId});}}>
        <option value="">ยังไม่เลือก</option>{walers.map(w => <option key={walerKey(w.faceId, w.walerId)} value={walerKey(w.faceId, w.walerId)}>{w.faceId} / {w.walerId}</option>)}</select></label>
      <label className="field"><span>E·A รวม · N</span><input type="number" min="0" step="any" value={r.EA_N ?? ''} onChange={e => updateAxial(i, {EA_N: number(e.target.value)})}/></label>
      <label className="field"><span>หลักฐาน E·A ราง</span><input value={r.evidenceRef} onChange={e => updateAxial(i, {evidenceRef: e.target.value})}/></label>
      <button className="btn secondary" onClick={() => change({railAxial: axial.filter((_, j) => j !== i)})}>ลบ E·A {r.faceId}/{r.walerId}</button>
    </div>)}
    <button className="btn secondary" disabled={axial.length >= 400} onClick={() => change({railAxial: [...axial, emptyCouplingRailAxial()]})}>เพิ่ม E·A คานรัด</button>
    <SideLocalEvidenceEditor faceId="แบบจำลองร่วม" coupled kinds={SIDE_COUPLED_LIMIT_KINDS} value={value.limits} memberEvidenceRef={sideCouplingReference(value)} onChange={limits => change({limits}, false)}/>
  </fieldset>;
}

export function SideFrameMappingEditor({value, sources, nodes, onChange, tieIds = [], walers = []}: {
  value: SideFrameDefinition | null; sources: SideEndpoint[]; nodes: FrameNodeDraft[]; onChange: (value: SideFrameDefinition) => void;
  tieIds?: string[]; walers?: {faceId: string; walerId: string}[];
}) {
  const d = value ?? emptySideFrame();
  return <fieldset className="side-frame-mappings"><legend>แรงจากจุดรองรับแบบข้างสู่เฟรม</legend>
    <p>ส่งแรงจากแบบข้างไปเฟรมทางเดียว ไม่รวมการเคลื่อนตัวของจุดรองรับย้อนกลับมาเปลี่ยนแรงในแบบข้าง เฟรมนี้ต้องไม่จำลองไม้อัด คร่าว หรือคานรัดที่วิเคราะห์ต้นทางซ้ำ ยังต้องตรวจมุมปิด จุดสัมผัส Clamp และ Anchor</p>
    <label className="field"><span>ขอบเขตเฟรมรับแรงแบบข้าง</span><select value={d.mode ?? ''} onChange={e => {
      const mode = (e.target.value || null) as SideFrameDefinition['mode'];
      const {coupling: _old, ...rest} = d;
      onChange(mode === 'COUPLED_TIE_FRAME_SUPPORTS' ? {...rest, mode, coupling: d.coupling ?? emptySideCoupling()} : {...rest, mode});
    }}><option value="">ยังไม่ระบุ</option><option value="DOWNSTREAM_SIDE_SUPPORTS_ONLY">เฉพาะโครงสร้างถัดจากจุดรองรับคานรัด · Yoke / Ground braced ไม่มีไทร์</option><option value="MIXED_TIED_AND_FRAME_SUPPORTS">ระบบผสม · จุดที่ผูกไทร์รับโดยไทร์ จุดที่ไม่ผูกไทร์ส่งเข้าเฟรมค้ำ</option><option value="COUPLED_TIE_FRAME_SUPPORTS">แบบจำลองร่วม · ไทร์ เฟรม และมุม เคลื่อนตัวเข้ากันได้</option></select></label>
    {d.mode === 'MIXED_TIED_AND_FRAME_SUPPORTS' && <p>ระบบผสมรับเฉพาะไทร์ที่แรงสองปลายเท่ากันและอยู่แนวเดียวกับไทร์ จุดที่ผูกไทร์ห้ามผูกเข้าเฟรมซ้ำ ยังไม่รวมการยืดของไทร์และการเคลื่อนตัวของเฟรมที่ต้องเข้ากันได้</p>}
    {d.mode === 'COUPLED_TIE_FRAME_SUPPORTS' && <><p>แบบจำลองร่วมต้องให้จุดเฟรมอยู่ที่พิกัดจุดรองรับจริง (ไม่มีระยะเยื้อง) และรับแรงเฉพาะแนวตั้งฉากผิว ถ้ามีแรงสุทธิที่ไม่มีอะไรรับ ระบบจะปฏิเสธแทนการเดาผล</p>
      <CouplingEditor value={d.coupling ?? emptySideCoupling()} tieIds={tieIds} walers={walers} onChange={coupling => onChange({...d, coupling})}/></>}
    <label className="field"><span>หลักฐานการแยกสมาชิกต้นทางออกจากเฟรม</span><input value={d.separationEvidenceRef} onChange={e => onChange({...d, separationEvidenceRef: e.target.value})}/></label>
    <p>ต้นทางที่วิเคราะห์ได้ {sources.length} จุด / การผูกที่กรอก {d.mappings.length} รายการ ต้องผูกทุกจุดจริง แม้แรงรวมบางทิศหักล้างกัน จุดออกแรงคนละพิกัดต้องใช้จุดเฟรมแยกกัน</p>
    {d.mappings.map((m, i) => {
      const key = sideSupportKey(m), stale = !sources.some(s => sideSupportKey(s) === key);
      const update = (patch: Partial<typeof m>) => onChange({...d, mappings: d.mappings.map((old, j) => j === i ? {...old, ...patch} : old)});
      return <details key={i} className="side-frame-mapping"><summary>{m.faceId || '?'} / {m.walerId || '?'} / {m.supportId || '?'} → {m.frameNodeId || '?'}</summary><div className="form-grid">
        <label className="field"><span>จุดรองรับคานรัดต้นทาง</span><select value={stale && !m.faceId && !m.walerId && !m.supportId ? '' : key} onChange={e => {
          const s = sources.find(s => sideSupportKey(s) === e.target.value);
          update({faceId: s?.faceId ?? '', walerId: s?.walerId ?? '', supportId: s?.supportId ?? '', connectionEvidenceRef: '', offsetEvidenceRef: null});
        }}><option value="">ยังไม่เลือก</option>{stale && m.faceId && <option value={key}>{m.faceId}/{m.walerId}/{m.supportId} · ต้นทางค้าง</option>}{sources.map(s => <option key={sideSupportKey(s)} value={sideSupportKey(s)}>{s.faceId}/{s.walerId}/{s.supportId}</option>)}</select></label>
        <label className="field"><span>จุด SIDE_SUPPORT รับแรงในเฟรม</span><select value={m.frameNodeId} onChange={e => update({frameNodeId: e.target.value, connectionEvidenceRef: '', offsetEvidenceRef: null})}><option value="">ยังไม่เลือก</option>{m.frameNodeId && !nodes.some(n => n.id === m.frameNodeId && n.role === 'SIDE_SUPPORT') && <option value={m.frameNodeId}>{m.frameNodeId} · จุดค้าง/หน้าที่ไม่ตรง</option>}{nodes.filter(n => n.role === 'SIDE_SUPPORT').map(n => <option key={n.id}>{n.id}</option>)}</select></label>
        <label className="field"><span>หลักฐานจุดต่อคานรัดกับเฟรมรับแรง</span><input value={m.connectionEvidenceRef} onChange={e => update({connectionEvidenceRef: e.target.value})}/></label>
        <label className="field"><span>หลักฐานระยะเยื้องจุดรองรับแบบข้าง</span><input value={m.offsetEvidenceRef ?? ''} onChange={e => update({offsetEvidenceRef: e.target.value || null})}/></label>
      </div><button className="btn secondary" onClick={() => onChange({...d, mappings: d.mappings.filter((_, j) => j !== i)})}>ลบการผูกแบบข้าง {i + 1}</button></details>;
    })}
    <button className="btn secondary" disabled={d.mappings.length >= 1000} onClick={() => onChange({...d, mappings: [...d.mappings, {faceId: '', walerId: '', supportId: '', frameNodeId: '', connectionEvidenceRef: '', offsetEvidenceRef: null}]})}>เพิ่มการผูกแบบข้างกับเฟรม</button>
  </fieldset>;
}
