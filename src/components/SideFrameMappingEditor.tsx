import React from 'react';
import {emptySideFrame, sideSupportKey, type SideFrameDefinition} from '../domain/workflowV07/sideFrameTransfer';
import type {SideEndpoint} from '../domain/workflowV07/sideLayout';
import type {FrameNodeDraft} from '../domain/workflowV07/frameWorkflow';

export function SideFrameMappingEditor({value, sources, nodes, onChange}: {
  value: SideFrameDefinition | null; sources: SideEndpoint[]; nodes: FrameNodeDraft[]; onChange: (value: SideFrameDefinition) => void;
}) {
  const d = value ?? emptySideFrame();
  return <fieldset className="side-frame-mappings"><legend>แรงจากจุดรองรับแบบข้างสู่เฟรม</legend>
    <p>ส่งแรงจากแบบข้างไปเฟรมทางเดียว ไม่รวมการเคลื่อนตัวของจุดรองรับย้อนกลับมาเปลี่ยนแรงในแบบข้าง เฟรมนี้ต้องไม่จำลองไม้อัด คร่าว หรือคานรัดที่วิเคราะห์ต้นทางซ้ำ ยังต้องตรวจมุมปิด จุดสัมผัส Clamp และ Anchor</p>
    <label className="field"><span>ขอบเขตเฟรมรับแรงแบบข้าง</span><select value={d.mode ?? ''} onChange={e => onChange({...d, mode: e.target.value === 'DOWNSTREAM_SIDE_SUPPORTS_ONLY' ? 'DOWNSTREAM_SIDE_SUPPORTS_ONLY' : null})}><option value="">ยังไม่ระบุ</option><option value="DOWNSTREAM_SIDE_SUPPORTS_ONLY">เฉพาะโครงสร้างถัดจากจุดรองรับคานรัด</option></select></label>
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
