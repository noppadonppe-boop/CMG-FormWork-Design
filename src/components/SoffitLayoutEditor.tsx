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
import type {Topology} from '../domain/workflowV07/geometry';

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
const safeList = (s: string) => {try {return list(s).filter(v => Number.isFinite(v));} catch {return [];}};
type GraphicKind = 'LOAD_PATH' | 'PLAN' | 'ELEVATION' | 'MEMBER';
function RequiredMark() {return <span className="required-mark" title="จำเป็นต่อการตรวจและคำนวณ" aria-label="จำเป็น"> *</span>;}
function FieldGraphicHelp({kind}: {kind: GraphicKind}) {
  const title = kind === 'LOAD_PATH' ? 'แผนภาพเส้นทางแรง' : kind === 'PLAN' ? 'แผนภาพพิกัดแปลน' : kind === 'ELEVATION' ? 'แผนภาพระดับและแรงปฏิกิริยา' : 'Free Body Diagram ของสมาชิก';
  return <details className="field-graphic-help" onClick={e => e.stopPropagation()}>
    <summary title={`เปิด${title}`} aria-label={`เปิด${title}`}>ⓘ</summary>
    <div className="field-graphic-popover">
      {kind === 'LOAD_PATH' && <svg viewBox="0 0 300 150" role="img" aria-label="แรงลงจากคอนกรีตผ่านไม้อัด คร่าว คานรับ และ Ringlock"><defs><marker id="fg-arrow-load" markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6" fill="#b42318"/></marker></defs><text x="150" y="14" textAnchor="middle">แรงลง q</text><line x1="150" y1="18" x2="150" y2="34" stroke="#b42318" markerEnd="url(#fg-arrow-load)"/><rect x="55" y="36" width="190" height="18" fill="#dbe6ef" stroke="#173e62"/><text x="150" y="49" textAnchor="middle">คอนกรีต / พื้น</text><rect x="55" y="58" width="190" height="8" fill="#d7a64a"/><text x="150" y="78" textAnchor="middle">ไม้อัด</text><line x1="72" y1="84" x2="228" y2="84" stroke="#b17a28" strokeWidth="4"/><text x="150" y="96" textAnchor="middle">คร่าว (Joist)</text><line x1="80" y1="108" x2="220" y2="108" stroke="#173e62" strokeWidth="5"/><text x="150" y="121" textAnchor="middle">คานรับ (Bearer)</text><circle cx="95" cy="136" r="5" fill="white" stroke="#b17a28" strokeWidth="2"/><circle cx="205" cy="136" r="5" fill="white" stroke="#b17a28" strokeWidth="2"/><text x="150" y="148" textAnchor="middle">U-head → Ringlock → Jack Base</text></svg>}
      {kind === 'PLAN' && <svg viewBox="0 0 300 150" role="img" aria-label="แปลนพิกัด X Y ของคร่าวและคานรับ"><defs><marker id="fg-arrow-x" markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6" fill="#173e62"/></marker></defs><rect x="48" y="28" width="190" height="90" fill="#eef3f7" stroke="#173e62" strokeWidth="2"/><line x1="48" y1="126" x2="238" y2="126" stroke="#173e62" markerEnd="url(#fg-arrow-x)"/><text x="245" y="130">X</text><line x1="32" y1="118" x2="32" y2="28" stroke="#173e62" markerEnd="url(#fg-arrow-x)"/><text x="26" y="22">Y</text><line x1="48" y1="40" x2="238" y2="40" stroke="#b17a28"/><line x1="48" y1="66" x2="238" y2="66" stroke="#b17a28"/><line x1="48" y1="92" x2="238" y2="92" stroke="#b17a28"/><line x1="75" y1="28" x2="75" y2="118" stroke="#b17a28" strokeDasharray="4 3"/><line x1="145" y1="28" x2="145" y2="118" stroke="#b17a28" strokeDasharray="4 3"/><circle cx="75" cy="40" r="4" fill="white" stroke="#b17a28" strokeWidth="2"/><circle cx="145" cy="40" r="4" fill="white" stroke="#b17a28" strokeWidth="2"/><text x="150" y="144" textAnchor="middle">X = คร่าว/หัว · Y = แนวคานรับ</text></svg>}
      {kind === 'ELEVATION' && <svg viewBox="0 0 300 150" role="img" aria-label="ระดับ Z และแรงปฏิกิริยาในแนวดิ่ง"><defs><marker id="fg-arrow-z" markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6" fill="#b42318"/></marker></defs><line x1="150" y1="18" x2="150" y2="42" stroke="#b42318" strokeWidth="2" markerEnd="url(#fg-arrow-z)"/><text x="164" y="28">q ลง</text><rect x="85" y="44" width="130" height="12" fill="#dbe6ef" stroke="#173e62"/><text x="230" y="54">หัวคอนกรีต</text><line x1="95" y1="66" x2="205" y2="66" stroke="#b17a28" strokeWidth="5"/><text x="230" y="70">คานรับ</text><line x1="150" y1="70" x2="150" y2="119" stroke="#173e62" strokeWidth="5"/><circle cx="150" cy="70" r="6" fill="white" stroke="#b17a28" strokeWidth="2"/><text x="164" y="94">U-head / Zหัว</text><line x1="110" y1="122" x2="190" y2="122" stroke="#173e62" strokeWidth="4"/><text x="200" y="126">ฐาน / Zฐาน</text><text x="20" y="145">ต้องมี Zหัว &gt; Zฐาน และหลักฐานระดับจริง</text></svg>}
      {kind === 'MEMBER' && <svg viewBox="0 0 300 150" role="img" aria-label="Free body diagram ของคานรับแรงแผ่และแรงปฏิกิริยา"><defs><marker id="fg-arrow-w" markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6" fill="#b42318"/></marker><marker id="fg-arrow-r" markerWidth="7" markerHeight="7" refX="5" refY="3" orient="180"><path d="M0,0 L6,3 L0,6" fill="#173e62"/></marker></defs><line x1="55" y1="67" x2="245" y2="67" stroke="#173e62" strokeWidth="6"/><path d="M70 75 L58 92 L82 92 Z" fill="#eef3f7" stroke="#173e62"/><path d="M230 75 L218 92 L242 92 Z" fill="#eef3f7" stroke="#173e62"/><line x1="75" y1="26" x2="75" y2="58" stroke="#b42318" markerEnd="url(#fg-arrow-w)"/><line x1="115" y1="26" x2="115" y2="58" stroke="#b42318" markerEnd="url(#fg-arrow-w)"/><line x1="155" y1="26" x2="155" y2="58" stroke="#b42318" markerEnd="url(#fg-arrow-w)"/><line x1="195" y1="26" x2="195" y2="58" stroke="#b42318" markerEnd="url(#fg-arrow-w)"/><line x1="70" y1="112" x2="70" y2="94" stroke="#173e62" markerEnd="url(#fg-arrow-r)"/><line x1="230" y1="112" x2="230" y2="94" stroke="#173e62" markerEnd="url(#fg-arrow-r)"/><text x="150" y="18" textAnchor="middle">w / แรงแผ่</text><text x="150" y="108" textAnchor="middle">R₁ · R₂ / แรงปฏิกิริยา</text><text x="150" y="140" textAnchor="middle">E · I · L = คุณสมบัติ/แกน/ช่วง</text></svg>}
      <p>{kind === 'LOAD_PATH' ? 'กรอกเพื่อระบุว่าแรงมาจากขั้นตอนใด ใครเป็นเจ้าของ และมีหลักฐานอะไร' : kind === 'PLAN' ? 'กรอกพิกัดจริงเป็น mm จากมุมต่ำสุดของขอบคอนกรีต เรียงจากน้อยไปมาก' : kind === 'ELEVATION' ? 'กรอกระดับ Z จาก Datum เดียวกัน ระดับหัวต้องสูงกว่าระดับฐาน' : 'กรอก E/I ตามแกนดัดจริง น้ำหนักตัวเอง และหลักฐานของสมาชิกที่กำลังตรวจ'}</p>
    </div>
  </details>;
}
function FieldLabel({children, required = false, help, graphic}: {children: React.ReactNode; required?: boolean; help?: string; graphic?: GraphicKind}) {
  return <span className="field-label-row"><span>{children}{required && <RequiredMark/>}{help && <small className="field-help">{help}</small>}</span>{graphic && <FieldGraphicHelp kind={graphic}/>}</span>;
}
function LiveSoffitPlan({topology, form}: {topology: Topology | null; form: Form}) {
  if (!topology) return null;
  const xs = topology.vertices.map(p => p.x), ys = topology.vertices.map(p => p.y);
  const minX = Math.min(...xs), minY = Math.min(...ys), width = Math.max(...xs) - minX, height = Math.max(...ys) - minY;
  if (!(width > 0 && height > 0)) return null;
  const left = 56, top = 34, drawW = 390, drawH = 220, scale = Math.min(drawW / width, drawH / height), w = width * scale, h = height * scale;
  const px = (x: number) => left + (x - minX) * scale, py = (y: number) => top + (y - minY) * scale;
  const joists = safeList(form.joistXMm), startY = number(form.joistStartYMm), endY = number(form.joistEndYMm);
  const bearers = form.bearers.map(b => ({...b, y: number(b.yMm), heads: safeList(b.headsXMm)})).filter(b => b.y !== null);
  return <figure className="soffit-live-plan" aria-label="แปลนแบบท้องจากค่าที่กำลังกรอก" data-testid="soffit-live-geometry">
    <svg viewBox="0 0 500 300" role="img">
      <rect x={left} y={top} width={w} height={h} fill="#eef3f7" stroke="#173e62" strokeWidth="2"/>
      {joists.map((x, i) => <line key={`j-${i}`} data-role="joist" x1={px(x)} x2={px(x)} y1={py(startY ?? minY)} y2={py(endY ?? (minY + height))} stroke="#b17a28" strokeWidth="1.5"/>) }
      {bearers.map((b, i) => <g key={`b-${i}`} data-role="bearer"><line x1={px(minX)} x2={px(minX + width)} y1={py(b.y!)} y2={py(b.y!)} stroke="#173e62" strokeWidth="2"/>{b.heads.map((x, n) => <circle key={n} data-role="u-head" cx={px(x)} cy={py(b.y!)} r="4" fill="white" stroke="#b17a28" strokeWidth="1.5"/>)}</g>)}
      <text x={left + w / 2} y="20" textAnchor="middle" fontSize="12">X = {Math.round(width).toLocaleString()} mm · คร่าว</text>
      <text transform={`translate(${left - 18},${top + h / 2}) rotate(-90)`} textAnchor="middle" fontSize="12">Y = {Math.round(height).toLocaleString()} mm</text>
      <text x="56" y="278" fontSize="11">เส้นทอง = คร่าว · เส้นน้ำเงิน = คานรับ · ○ = U-head</text>
    </svg>
    <figcaption>แปลนสดจากค่าที่กำลังกรอก · ยังไม่ใช่ผลคำนวณจนกด “ตรวจตำแหน่งและวิเคราะห์แรงแบบท้อง”</figcaption>
  </figure>;
}
function SoffitGraphicGuide({topology, form, beam}: {topology: Topology | null; form: Form; beam: boolean}) {
  const bounds = topology && topology.vertices.length ? (() => {
    const xs = topology.vertices.map(p => p.x), ys = topology.vertices.map(p => p.y);
    return {width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys)};
  })() : null;
  const joistCount = safeList(form.joistXMm).length, bearerCount = form.bearers.length;
  const headCount = form.bearers.reduce((n, b) => n + safeList(b.headsXMm).length, 0);
  const geometryText = bounds && bounds.width > 0 && bounds.height > 0 ? `${Math.round(bounds.width).toLocaleString()} × ${Math.round(bounds.height).toLocaleString()} mm` : 'ยังไม่มี Geometry ที่ยืนยัน';
  const zHead = form.headNodeElevationMm.trim() || 'ยังไม่กรอก';
  const zBase = form.baseElevationMm.trim() || (form.baseDatumsByHead ? 'ฐานรายหัว' : 'ยังไม่กรอก');
  return <details className="formwork-graphic-guide" open data-testid="soffit-graphic-guide">
    <summary>คู่มือกราฟิก · แปลน / รูปตัด / Free Body Diagram</summary>
    <p className="formwork-graphic-guide-intro">ดูภาพก่อนกรอกข้อมูล: เส้นทองคือสมาชิกที่รับแรงจากไม้อัด, เส้นน้ำเงินคือแนวคานรับและโครงค้ำ, วงกลมคือจุด U-head ที่ต้องกรอกให้ตรงกับหน้างาน ภาพนี้เป็นแบบอธิบายและจะเปลี่ยนตาม Geometry/ค่าที่กรอก ไม่ใช่แบบติดตั้งที่อนุมัติแล้ว</p>
    <div className="formwork-graphic-grid">
      <figure className="formwork-graphic-card">
        <svg viewBox="0 0 360 205" role="img" aria-label="แปลนแบบท้อง แสดงกรอบคอนกรีต แนวคร่าว แนวคานรับ และจุด U-head">
          <defs><marker id="guide-plan-arrow" markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6" fill="#173e62"/></marker></defs>
          <rect x="60" y="28" width="245" height="115" fill="#eef3f7" stroke="#173e62" strokeWidth="2"/>
          {[95, 145, 195, 245, 295].map(x => <line key={x} x1={x} x2={x} y1="28" y2="143" stroke="#b17a28" strokeWidth="2"/>) }
          {[63, 116].map(y => <line key={y} x1="60" x2="305" y1={y} y2={y} stroke="#173e62" strokeWidth="4"/>) }
          {[95, 145, 195, 245, 295].flatMap(x => [63, 116].map(y => <circle key={`${x}-${y}`} cx={x} cy={y} r="4" fill="white" stroke="#b17a28" strokeWidth="2"/>))}
          <line x1="60" y1="166" x2="305" y2="166" stroke="#173e62" markerEnd="url(#guide-plan-arrow)"/><text x="312" y="170">X</text>
          <line x1="43" y1="143" x2="43" y2="28" stroke="#173e62" markerEnd="url(#guide-plan-arrow)"/><text x="37" y="22">Y</text>
          <text x="182" y="18" textAnchor="middle">กรอบคอนกรีต / Geometry</text><text x="182" y="190" textAnchor="middle">ทอง = คร่าว · น้ำเงิน = คานรับ · ○ = U-head</text>
        </svg>
        <figcaption><b>แปลน:</b> กรอก `joist X` เพื่อกำหนดแนวทอง, `bearer Y` เพื่อกำหนดแนวน้ำเงิน และ `heads X` เพื่อระบุตำแหน่ง U-head จริง · Geometry ปัจจุบัน {geometryText} · คร่าว {joistCount || '—'} แนว / คานรับ {bearerCount} แนว / U-head {headCount || '—'} จุด</figcaption>
      </figure>
      <figure className="formwork-graphic-card">
        <svg viewBox="0 0 360 205" role="img" aria-label="รูปตัดแนวดิ่ง แสดงคอนกรีต ไม้อัด คร่าว คานรับ U-head Ringlock Jack Base และระดับ Z">
          <defs><marker id="guide-section-arrow" markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6" fill="#b42318"/></marker></defs>
          <line x1="180" y1="12" x2="180" y2="32" stroke="#b42318" strokeWidth="2" markerEnd="url(#guide-section-arrow)"/><text x="193" y="22">q ลง</text>
          <rect x="72" y="35" width="216" height="25" fill="#dbe6ef" stroke="#173e62"/><text x="180" y="51" textAnchor="middle">คอนกรีต / พื้น</text>
          <rect x="72" y="62" width="216" height="8" fill="#d7a64a"/><text x="300" y="69">ไม้อัด</text>
          <line x1="92" y1="82" x2="268" y2="82" stroke="#b17a28" strokeWidth="7"/><text x="300" y="86">คร่าว</text>
          <line x1="82" y1="101" x2="278" y2="101" stroke="#173e62" strokeWidth="7"/><text x="300" y="105">คานรับ</text>
          <circle cx="180" cy="105" r="7" fill="white" stroke="#b17a28" strokeWidth="2"/><text x="192" y="122">U-head</text>
          <line x1="180" y1="109" x2="180" y2="166" stroke="#173e62" strokeWidth="6"/><text x="192" y="145">Ringlock</text>
          <line x1="142" y1="171" x2="218" y2="171" stroke="#173e62" strokeWidth="6"/><text x="225" y="175">Jack Base / ฐาน</text>
          <line x1="44" y1="60" x2="44" y2="171" stroke="#b17a28" strokeDasharray="4 3"/><text x="20" y="95" transform="rotate(-90 20 95)">ระดับ Z เดียวกัน</text>
          <text x="180" y="198" textAnchor="middle">Zหัว = {zHead} · Zฐาน = {zBase}</text>
        </svg>
        <figcaption><b>รูปตัด:</b> กรอก `Z หัว` และ `Z ฐาน` จาก Datum เดียวกัน เพื่อให้ระบบคำนวณความสูงใช้งานและเส้นทางแรงลงฐานได้ ห้ามใช้ค่าระดับจากคนละ Datum</figcaption>
      </figure>
      <figure className="formwork-graphic-card">
        <svg viewBox="0 0 360 205" role="img" aria-label="Free body diagram ของคร่าวหรือคานรับ แสดงแรงแผ่ แรงปฏิกิริยา และช่วงคาน">
          <defs><marker id="guide-fbd-load" markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6" fill="#b42318"/></marker><marker id="guide-fbd-reaction" markerWidth="7" markerHeight="7" refX="5" refY="3" orient="180"><path d="M0,0 L6,3 L0,6" fill="#173e62"/></marker></defs>
          <line x1="60" y1="88" x2="300" y2="88" stroke="#173e62" strokeWidth="7"/>
          <path d="M78 96 L65 114 L91 114 Z" fill="#eef3f7" stroke="#173e62"/><path d="M282 96 L269 114 L295 114 Z" fill="#eef3f7" stroke="#173e62"/>
          {[90, 140, 190, 240, 290].map(x => <line key={x} x1={x} y1="38" x2={x} y2="78" stroke="#b42318" strokeWidth="2" markerEnd="url(#guide-fbd-load)"/>)}
          <line x1="78" y1="148" x2="78" y2="118" stroke="#173e62" strokeWidth="2" markerEnd="url(#guide-fbd-reaction)"/><line x1="282" y1="148" x2="282" y2="118" stroke="#173e62" strokeWidth="2" markerEnd="url(#guide-fbd-reaction)"/>
          <text x="180" y="26" textAnchor="middle">w = แรงแผ่จากพื้นที่รับผิดชอบ</text><text x="180" y="139" textAnchor="middle">R₁ / R₂ = แรงปฏิกิริยาที่หัวรองรับ</text>
          <line x1="78" y1="174" x2="282" y2="174" stroke="#173e62"/><text x="180" y="192" textAnchor="middle">L = ช่วงรองรับ · ตรวจ M, V, δ และ E/I</text>
        </svg>
        <figcaption><b>FBD:</b> ใช้ตรวจว่าแรงจากพื้นที่รับผิดชอบถูกส่งไปยังหัวรองรับครบหรือไม่ จึงต้องกรอกพิกัด, หน้าตัด, `E`, `I`, น้ำหนักตัวเอง และหลักฐานของสมาชิกตามแกนดัดจริง</figcaption>
      </figure>
    </div>
    <div className="formwork-graphic-legend"><b>สัญลักษณ์:</b><span><i className="legend-swatch legend-gold"/>คร่าว/Joist</span><span><i className="legend-swatch legend-blue"/>คานรับ/Bearer หรือโครงค้ำ</span><span><i className="legend-swatch legend-red"/>แรงลง/แรงออกแบบ</span><span><i className="legend-swatch legend-node"/>U-head / จุดรองรับ</span></div>
    <div className="formwork-graphic-steps"><b>ลำดับเตรียมและกรอกข้อมูล</b><ol><li>เปิดแบบต้นฉบับและยืนยันกรอบ Geometry ก่อน กำหนดมุมต่ำสุดเป็นจุดอ้างอิงเดียว</li><li>กำหนดแกนให้ตรงกัน: <b>X = แนวคานรับ/ตำแหน่งคร่าว</b> และ <b>Y = แนวคร่าว/ตำแหน่งคานรับ</b> ตามภาพแปลน</li><li>กรอกตำแหน่งคร่าวและปลายช่วง เพื่อให้ระบบรู้ Span ที่ต้องตรวจ ไม่ใช่เพียงจำนวนสมาชิก</li><li>เพิ่มแนวคานรับ แล้วกรอก Y และ X ของ U-head ทุกจุดที่ติดตั้งจริง</li><li>กรอกระดับ Z หัวและฐานจาก Datum เดียวกัน พร้อมหลักฐานระดับ; ถ้าฐานแต่ละหัวไม่เท่ากันให้ใช้ระดับฐานรายหัว</li><li>ผูกหน้าตัดหรือกรอก `E`, `I`, น้ำหนักตัวเอง และหลักฐานตามแกนดัดที่ใช้งานจริง</li>{beam && <li>สำหรับคาน ให้ระบุแถบคอนกรีต, น้ำหนักคงที่ และน้ำหนักจรที่แต่ละแนวรับผิดชอบ ไม่รวมพื้นที่จาก Load case อื่น</li>}<li>ตรวจภาพสดและรายการโหลด แล้วกด <b>ตรวจตำแหน่งและวิเคราะห์แรงแบบท้อง</b> เพื่อใช้ค่าและบันทึกร่าง</li></ol></div>
  </details>;
}
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
export function SoffitLayoutEditor({layout, beam, topology = null, onApply, onPendingChange, onDraftChange, selections}: {
  layout: SoffitLayout | null; beam: boolean; topology?: Topology | null; onApply: (layout: SoffitLayout) => void; onPendingChange: (pending: boolean) => void;
  onDraftChange?: (layout: SoffitLayout | null) => void;
  selections?: BindingSelections;
}) {
  const [form, setForm] = useState(() => formOf(layout)), [error, setError] = useState('');
  const identity = canonical(layout);
  useEffect(() => {setForm(formOf(layout)); setError(''); onPendingChange(false);}, [identity, onPendingChange]);
  useEffect(() => () => onPendingChange(false), [onPendingChange]);
  function change(next: Form) {setForm(next); setError(''); onPendingChange(canonical(next) !== canonical(formOf(layout)));
    try {onDraftChange?.(layoutOf(next));} catch {onDraftChange?.(null);}}
  const requiredFields = new Set<keyof Form>(['stageId', 'loadCaseId', 'ownershipId', 'evidenceRef', 'joistXMm', 'joistStartYMm', 'joistEndYMm', 'bearerStartXMm', 'bearerEndXMm', 'headNodeElevationMm', 'baseElevationMm']);
  function field(key: Exclude<keyof Form, 'bearers' | 'joist' | 'bearer' | 'plywood' | 'baseDatumsByHead' | 'loading'>, label: string, numeric = true, help?: string, graphic: GraphicKind = key === 'stageId' || key === 'loadCaseId' || key === 'ownershipId' || key === 'evidenceRef' ? 'LOAD_PATH' : key.includes('Elevation') ? 'ELEVATION' : key.includes('Mm') || key.includes('XMm') ? 'PLAN' : 'LOAD_PATH') {
    const required = requiredFields.has(key);
    return <label className="field"><FieldLabel required={required} help={help} graphic={graphic}>{label}</FieldLabel><input aria-required={required} type={numeric ? 'number' : 'text'} step={numeric ? 'any' : undefined} value={form[key]} onChange={e => change({...form, [key]: e.target.value})}/></label>;
  }
  return <fieldset className="soffit-editor"><legend>ตำแหน่งและการถ่ายแรงแบบท้อง · ร่าง</legend>
    <p>แบบสี่เหลี่ยม ทิศคาน/คานรับ X และคร่าว Y · พิกัด X,Y เป็นระยะจากมุมต่ำสุดของขอบคอนกรีต (mm) เรียงน้อยไปมาก คั่นด้วยจุลภาค คร่าวแรกและสุดท้ายต้องอยู่ที่ขอบ X ของคอนกรีต</p>
    <p>ใช้โมดูล Ringlock ที่เลือกเป็นข้อมูลอ้างอิง แล้วระบุหัวรองรับจริงทุกจุด ระดับ Z ด้านล่างคือระนาบวิเคราะห์ร่วม ยังต้องตรวจความสูงติดตั้งและจุดสัมผัสจริงแยก</p>
    <SoffitGraphicGuide topology={topology} form={form} beam={beam}/>
    <LiveSoffitPlan topology={topology} form={form}/>
    <div className="form-grid">
      {field('stageId', 'ขั้นตอนเท/Stage', false, 'เช่น POUR-01')}{field('loadCaseId', 'กรณีโหลด/Load case', false, 'เช่น SERVICE')}{field('ownershipId', 'พื้นที่ที่รับผิดชอบโหลด', false, 'รหัสเจ้าของแรง')}{field('evidenceRef', 'หลักฐานตำแหน่งและโหลด', false, 'แบบ/ภาพ/บันทึกตรวจ')}
      {field('joistXMm', 'ตำแหน่งคร่าว X · mm (คั่นด้วยจุลภาค)', false, 'อย่างน้อย 2 จุดและต้องมีขอบ X')}{field('joistStartYMm', 'ปลายคร่าวเริ่ม Y · mm')}{field('joistEndYMm', 'ปลายคร่าวสิ้นสุด Y · mm')}
      {field('bearerStartXMm', 'ปลายคานรับเริ่ม X · mm')}{field('bearerEndXMm', 'ปลายคานรับสิ้นสุด X · mm')}
      {field('headNodeElevationMm', 'ระดับจุด U-head ในแบบวิเคราะห์ Z · mm')}{form.baseDatumsByHead === null && field('baseElevationMm', 'ระดับฐานร่วม Z · mm')}
      {beam && <>{field('concreteStripStartYMm', 'จุดเริ่มแถบ Bc ที่รับผิดชอบ Y · mm')}{field('deadStripStartYMm', 'จุดเริ่มแถบ DL Y · mm')}{field('liveStripStartYMm', 'จุดเริ่มแถบ LL Y · mm')}</>}
    </div>
    {form.bearers.map((b, i) => <div className="soffit-bearer" key={i}>
      <h4>แนวคานรับ {i + 1}</h4><div className="form-grid">
        {(['id', 'yMm', 'headsXMm'] as const).map(k => <label className="field" key={k}><FieldLabel required graphic={k === 'id' ? 'MEMBER' : 'PLAN'} help={k === 'id' ? 'ชื่อไม่ซ้ำของแนวรับ' : k === 'yMm' ? 'ตำแหน่งแนวคานรับในแกน Y' : 'จุด U-head จริงบนแนวรับ'}>{k === 'id' ? 'รหัสคานรับ' : k === 'yMm' ? 'ตำแหน่งแนวคานรับ Y · mm' : 'ตำแหน่ง U-head X ทุกจุด · mm (คั่นด้วยจุลภาค)'}</FieldLabel><input aria-required="true" type={k === 'yMm' ? 'number' : 'text'} value={b[k]} onChange={e => change({...form, bearers: form.bearers.map((row, n) => n === i ? {...row, [k]: e.target.value} : row)})}/></label>)}
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
        <label className="field"><FieldLabel required graphic="ELEVATION">ระดับฐาน {r.headNodeId} · mm</FieldLabel><input aria-required="true" type="number" step="any" value={r.elevationMm} onChange={e => change({...form, baseDatumsByHead: form.baseDatumsByHead!.map((old, n) => n === i ? {...old, elevationMm: e.target.value} : old)})}/></label>
        <label className="field"><FieldLabel required graphic="ELEVATION">หลักฐานระดับฐาน {r.headNodeId}</FieldLabel><input aria-required="true" value={r.evidenceRef} onChange={e => change({...form, baseDatumsByHead: form.baseDatumsByHead!.map((old, n) => n === i ? {...old, evidenceRef: e.target.value} : old)})}/></label>
      </fieldset>)}</div><button className="btn secondary" onClick={() => change({...form, baseDatumsByHead: null, baseElevationMm: ''})}>กลับไปกรอกฐานร่วมใหม่</button></>}
    </fieldset>
    {(['joist', 'bearer'] as const).map(role => <fieldset key={role} aria-label={`คุณสมบัติกลุ่ม ${role}`}><legend>{role === 'joist' ? 'คร่าว' : 'คานรับ'} · หน้าตัดและแกนที่ใช้จริง</legend><div className="form-grid">
      {(['E_MPa', 'I_mm4', 'selfWeightKNPerM', 'evidenceRef'] as const).map(k => <label className="field" key={k}><FieldLabel graphic="MEMBER" required={!form[role].binding || !['E_MPa', 'I_mm4'].includes(k)} help={k === 'E_MPa' || k === 'I_mm4' ? 'ถ้าผูก Catalog แล้วระบบเติมจากหน้าตัดที่ผูก' : undefined}>{k === 'E_MPa' ? 'E · MPa' : k === 'I_mm4' ? 'I แกนดัด · mm⁴' : k === 'selfWeightKNPerM' ? 'น้ำหนักตัวเอง · kN/m (ศูนย์ต้องระบุ)' : 'หลักฐานหน้าตัด/แกน/วัสดุ/น้ำหนัก'}</FieldLabel><input aria-required={!form[role].binding || !['E_MPa', 'I_mm4'].includes(k)} disabled={!!form[role].binding && (k === 'E_MPa' || k === 'I_mm4')} type={k === 'evidenceRef' ? 'text' : 'number'} step={k === 'evidenceRef' ? undefined : 'any'} value={form[role][k]} onChange={e => change({...form, [role]: {...form[role], [k]: e.target.value,
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
    <p className="pending-save-note" role="status">ค่าที่กำลังกรอกและแปลนสดด้านบนยังเป็น <b>ข้อมูลค้าง · ยังไม่บันทึก</b> จนกว่าจะกดปุ่มตรวจและวิเคราะห์แรงแบบท้อง</p>
    <button className="btn secondary" aria-label="ตรวจตำแหน่งและวิเคราะห์แรงแบบท้อง · ใช้ค่าและบันทึก" onClick={() => {try {onApply(layoutOf(form)); onPendingChange(false); setError('');} catch (e) {setError((e as Error).message);}}}>ตรวจตำแหน่งและวิเคราะห์แรงแบบท้อง</button>
    <button className="btn secondary" onClick={() => {change(formOf(layout)); onPendingChange(false);}}>คืนค่าแบบท้องที่นำไปใช้ล่าสุด</button>
  </fieldset>;
}
