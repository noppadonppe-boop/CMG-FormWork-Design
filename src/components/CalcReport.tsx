import {useMemo, type ReactNode} from 'react';
import {usesTies, type Check, type Result} from '../domain';
import {buildFormworkLayout} from '../domain/formworkLayout';
import {buildScene} from '../domain/scene';
import {adviseLayout} from '../domain/optimize';
import type {DesignRevisionBinding, TitleBlock} from '../domain/titleBlock';
import {Defs, LW, Txt} from '../drawing/primitives';
import {CornerDetail, IsoView, PlanView, SectionView, TieDetail} from '../drawing/views';
import {WalerDetails} from './WalerDetails';
import {ColumnYokeDetails} from './ColumnYokeDetails';
import {generalNotes} from './DrawingSet';
import {ACI_REFERENCE, type PressureModel} from '../domain/pressure';
import {PLYWOOD_GRADE_LABEL} from '../domain/plywoodGrades';

const n = (v: number | null, d = 2) => v === null ? '—' : v.toLocaleString('en-US', {minimumFractionDigits: d, maximumFractionDigits: d});
export function Fig({w, h, no, caption, children}: {w: number; h: number; no?: number; caption: string; children: ReactNode}) {
  return <figure className="rp-fig"><svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={caption}><Defs/>{children}</svg><figcaption>{no ? `รูปที่ ${no} · ` : ''}{caption}</figcaption></figure>;
}
export function RatioBar({ratio}: {ratio: number | null}) {
  if (ratio === null) return <span className="rp-ratio unknown">ไม่มีเกณฑ์ (ยังไม่ทราบกำลัง)</span>;
  const w = Math.min(ratio, 1.5) / 1.5 * 100, color = ratio > 1 ? '#c0392b' : ratio > 0.9 ? '#d68910' : '#2f7655';
  return <svg className="rp-ratio" viewBox="0 0 104 8" aria-label={`อัตราส่วน ${n(ratio, 3)}`}>
    <rect x={2} y={1} width={100} height={6} fill="#eef2f5" stroke="#9aa8b5" strokeWidth={0.3}/>
    <rect x={2} y={1} width={w} height={6} fill={color}/>
    <line x1={2 + 100 / 1.5} y1={0} x2={2 + 100 / 1.5} y2={8} stroke="#111" strokeWidth={0.5}/>
  </svg>;
}
/** Lateral pressure envelope (Fig. 4.2.2 of ACI 347R-14): hydrostatic to hcap, then constant pmax; dashed = full hydrostatic. */
export function PressureDiagram({m}: {m: PressureModel}) {
  const x0 = 30, y0 = 12, h = 80, w = 70, k = w / m.hydrostatic, wp = m.pmax * k, yc = y0 + h * Math.min(1, m.hcap / m.H);
  return <g>
    <rect x={x0 - 8} y={y0} width={8} height={h} fill="url(#h-concrete)" stroke="#111" strokeWidth={LW.med}/>
    <polygon points={`${x0},${y0} ${x0 + wp},${yc} ${x0 + wp},${y0 + h} ${x0},${y0 + h}`} fill="#dbe6f4" stroke="#1d4e89" strokeWidth={LW.med}/>
    {m.pmax < m.hydrostatic - 1e-6 && <polyline points={`${x0 + wp},${yc} ${x0 + w},${y0 + h}`} fill="none" stroke="#7a8a99" strokeWidth={LW.thin} strokeDasharray="1.5 1"/>}
    <polyline points={`${x0 + wp},${y0} ${x0 + wp},${y0 + h}`} fill="none" stroke="#c0392b" strokeWidth={LW.med} strokeDasharray="2 1"/>
    {[0.25, 0.5, 0.75, 1].map(f => {const y = y0 + h * f, px = Math.min(wp, w * f); return <line key={f} x1={x0 + px} y1={y} x2={x0 + 1} y2={y} stroke="#1d4e89" strokeWidth={LW.thin} markerEnd="url(#arr)"/>;})}
    <defs><marker id="arr" markerWidth="4" markerHeight="4" refX="3.5" refY="2" orient="auto"><path d="M0 0L4 2L0 4z" fill="#1d4e89"/></marker></defs>
    <Txt x={x0 + w + 2} y={y0 + h + 1} s={2.8}>ρgh = {n(m.hydrostatic, 1)} kPa</Txt>
    <Txt x={x0 + wp + 2} y={y0 + 3} s={2.6} fill="#c0392b">pmax = {n(m.pmax, 1)} kPa (ใช้ตรวจสมาชิก)</Txt>
    {m.pmax < m.hydrostatic - 1e-6 && <Txt x={x0 + wp + 2} y={yc + 1} s={2.4} fill="#1d4e89">hcap = {n(m.hcap, 0)} mm</Txt>}
    <Txt x={x0 + 3} y={y0 + h * 0.4} s={2.4} fill="#1d4e89">p = ρ g z</Txt>
    <Txt x={x0 - 12} y={y0 + h / 2} s={2.8} a="middle" rot={-90}>H = {m.H.toLocaleString('en-US')} mm · ρ = {n(m.rho, 0)} kg/m³</Txt>
  </g>;
}
export function BeamDiagram({L, w, title, unit = 'N/mm'}: {L: number; w: number; title: string; unit?: string}) {
  const x0 = 15, x1 = 135, y = 26, M = w * L * L / 8, V = w * L / 2;
  return <g>
    <Txt x={75} y={6} s={3} a="middle" b>{title}</Txt>
    {Array.from({length: 11}, (_, i) => x0 + (x1 - x0) * i / 10).map(x => <line key={x} x1={x} y1={y - 12} x2={x} y2={y - 1.5} stroke="#1d4e89" strokeWidth={LW.thin} markerEnd="url(#arrb)"/>)}
    <defs><marker id="arrb" markerWidth="4" markerHeight="4" refX="3.5" refY="2" orient="auto"><path d="M0 0L4 2L0 4z" fill="#1d4e89"/></marker></defs>
    <line x1={x0} y1={y - 12} x2={x1} y2={y - 12} stroke="#1d4e89" strokeWidth={LW.thin}/>
    <Txt x={75} y={y - 13.5} s={2.6} a="middle" fill="#1d4e89">w = {n(w, 3)} {unit}</Txt>
    <line x1={x0} y1={y} x2={x1} y2={y} stroke="#111" strokeWidth={1}/>
    {[x0, x1].map(x => <polygon key={x} points={`${x},${y + 0.5} ${x - 3},${y + 5} ${x + 3},${y + 5}`} fill="none" stroke="#111" strokeWidth={LW.med}/>)}
    <Txt x={75} y={y + 9} s={2.6} a="middle">L = {n(L, 0)} mm (ช่วงเดี่ยวรองรับสองปลาย)</Txt>
    <path d={`M${x0} ${y + 14} Q75 ${y + 34} ${x1} ${y + 14}`} fill="#fbeaea" stroke="#9b1c1c" strokeWidth={LW.med}/>
    <line x1={x0} y1={y + 14} x2={x1} y2={y + 14} stroke="#111" strokeWidth={LW.thin}/>
    <Txt x={75} y={y + 27} s={2.6} a="middle" fill="#9b1c1c">Mmax = wL²/8 = {n(M / 1e6, 3)} kN·m</Txt>
    <Txt x={x1} y={y + 36} s={2.4} a="end" fill="#444">V = wL/2 = {n(V / 1000, 3)} kN</Txt>
  </g>;
}
export function CheckCard({c, no}: {c: Check; no: string}) {
  return <section className="rp-check">
    <h4><span>{no}</span> {c.label} <em className={'pill ' + (c.status === 'FAIL' ? 'red' : 'amber')}>{c.status}</em></h4>
    <ol className="rp-steps">
      <li><b>สูตร</b><div className="equation">{c.formula}</div></li>
      <li><b>แทนค่า</b><p>{c.substitution}</p></li>
      <li><b>ผลลัพธ์</b><p>ค่าที่เกิดขึ้น <strong>{n(c.demand, 3)} {c.unit}</strong> {c.limit === null ? '· ยังไม่มีค่าเกณฑ์/กำลังรับรอง' : <>เทียบเกณฑ์คัดกรอง <strong>{n(c.limit, 3)} {c.unit}</strong> → อัตราส่วน <strong>{n(c.utilization, 3)}</strong></>}</p><RatioBar ratio={c.utilization}/></li>
    </ol>
    <p className="rp-note">หมายเหตุ: {c.note}</p><small>{c.source}</small>
  </section>;
}

const SECTIONS = ['ขอบเขตและเกณฑ์การออกแบบ', 'รูปทรงและการจัดวางแบบหล่อ', 'แรงดันคอนกรีตสด', 'การตรวจสอบองค์อาคาร', 'สรุปผลการตรวจสอบและคำแนะนำ', 'ปริมาณวัสดุ', 'แบบประกอบ', 'ข้อจำกัดและรายการที่ยังขาด', 'เอกสารอ้างอิง'];

export function CalcReport({r, project, code, caseName, caseId, titleBlock: tb, revisionBinding}: {r: Result; project: string; code: string; caseName: string; caseId: string; titleBlock: TitleBlock; revisionBinding?: DesignRevisionBinding}) {
  const {L, scene} = useMemo(() => ({L: buildFormworkLayout(r), scene: buildScene(r)}), [r]);
  const advice = useMemo(() => adviseLayout(r.input), [r]);
  const pm = r.pressureModel, x = r.input, docNo = `CAL-${code || 'CMG'}-${caseId.replace(/[^\w]/g, '').slice(0, 6).toUpperCase()}`;
  const groups: [string, Check[], ReactNode][] = [
    ['ไม้อัด (Plywood)', r.checks.filter(c => c.id.startsWith('ply-')), <Fig key="f" no={4} w={150} h={68} caption={`แบบจำลองไม้อัดแถบกว้าง 1 m พาดระหว่างคร่าว @ ${x.studSpacing} mm (${r.plywoodDesign.spans === 1 ? 'ช่วงเดี่ยว' : `ต่อเนื่อง ${r.plywoodDesign.spans} ช่วง ตาม APA V345`}; แสดงหนึ่งช่วง) · แรงดันที่รับได้ ${n(r.plywoodDesign.allowablePressure, 1)} kPa`}><BeamDiagram L={x.studSpacing} w={r.pressure} title="ไม้อัดแถบ 1 m"/></Fig>],
    ['คร่าว (Stud)', r.checks.filter(c => c.id.startsWith('stud-')), <Fig key="f" no={5} w={150} h={68} caption={`แบบจำลองคร่าวพาดระหว่างคานคู่ ช่วงจริง ${n(r.waler.verticalSpan, 0)} mm`}><BeamDiagram L={r.waler.verticalSpan} w={r.pressure / 1000 * x.studSpacing} title={`คร่าว ${L.stud.label}`}/></Fig>],
    ['คานคู่ (Twin waler)', r.checks.filter(c => c.id.startsWith('waler-')), <WalerDetails key="w" r={r} report/>],
    [x.kind === 'COLUMN' ? (x.columnTies ? 'Tie rod + ชุดรัดเสา (Column yoke)' : 'ชุดรัดเสา (Column yoke)') : 'Tie rod', r.checks.filter(c => c.id.startsWith('tie') || c.id.startsWith('column-')), x.kind === 'COLUMN' ? <ColumnYokeDetails key="c" r={r} report/> : null],
  ];
  const fails = r.checks.filter(c => c.status === 'FAIL');
  return <article className="calc-report">
    <section className="rp-page rp-cover">
      <div className="rp-brand"><span className="brand-square">CMG</span><div><b>CMG ENGINEERING & CONSTRUCTION</b><small>FORMWORK DESIGN DEPARTMENT</small></div></div>
      <div className="rp-stamp">แบบร่างเบื้องต้น · ห้ามใช้ก่อสร้าง<br/><small>PRELIMINARY – NOT FOR CONSTRUCTION</small></div>
      <h1>รายการคำนวณออกแบบแบบหล่อคอนกรีต</h1><h2>FORMWORK DESIGN CALCULATION</h2>
      <table className="rp-meta"><tbody>
        <tr><th>โครงการ</th><td>{project}</td><th>รหัสโครงการ</th><td>{code}</td></tr>
        <tr><th>องค์อาคาร</th><td>{caseName} · {x.kind === 'COLUMN' ? 'แบบหล่อเสา' : 'แบบหล่อฐานราก'} ({x.shape === 'L' ? 'รูป L' : 'สี่เหลี่ยม'})</td><th>เลขที่เอกสาร</th><td>{docNo}</td></tr>
        <tr><th>ขนาด</th><td>{x.width} × {x.length} × {x.height} mm</td><th>Rev / วันที่</th><td>{tb.rev} / {tb.date}</td></tr>
        <tr><th>สถานะผลคัดกรอง</th><td>{r.status} · {fails.length ? `${fails.length} รายการเกินเกณฑ์` : 'ไม่มีรายการเกินเกณฑ์คัดกรอง'}</td><th>แบบประกอบ</th><td>FW-01 ถึง FW-04 (A3)</td></tr>
        {revisionBinding&&<tr><th>Design Revision</th><td>{revisionBinding.designRevision}</td><th>Review / hash</th><td>{revisionBinding.reviewState} · {revisionBinding.contentHash ? `${revisionBinding.contentHash.slice(0, 16)}…` : 'ยังไม่มี review hash'}</td></tr>}
      </tbody></table>
      <Fig w={190} h={112} caption="ภาพรวมแบบหล่อ 3 มิติ (ภาพประกอบ ไม่ใช่แบบติดตั้ง)"><IsoView scene={scene} box={{x: 0, y: 0, w: 190, h: 112}} titled={false}/></Fig>
      <table className="rp-sign"><thead><tr><th/><th>ชื่อ</th><th>ลายมือชื่อ</th><th>วันที่</th></tr></thead><tbody>
        {[['ออกแบบ / Designed', tb.designedBy], ['ตรวจสอบ / Checked', tb.checkedBy], ['อนุมัติ / Approved', tb.approvedBy]].map(([k, v]) => <tr key={k}><th>{k}</th><td>{v || ' '}</td><td/><td/></tr>)}
      </tbody></table>
      <table className="rp-rev"><thead><tr><th>Rev</th><th>วันที่</th><th>รายละเอียดการแก้ไข</th></tr></thead>
        <tbody>{(tb.revisions.length ? tb.revisions : [{rev: tb.rev, date: tb.date, description: '—'}]).map((e, i) => <tr key={i}><td>{e.rev}</td><td>{e.date}</td><td>{e.description}</td></tr>)}</tbody></table>
    </section>

    <section className="rp-page rp-toc"><h2>สารบัญ (CONTENTS)</h2><ol>{SECTIONS.map(s => <li key={s}>{s}</li>)}</ol>
      <p className="muted">หน่วยที่ใช้: ความยาว mm · แรง N/kN · หน่วยแรง MPa · แรงดัน kPa · น้ำหนักหน่วย kN/m³</p></section>

    <section className="rp-sec"><h2>1. {SECTIONS[0]}</h2>
      <p>รายการคำนวณนี้คัดกรองแบบหล่อด้านข้างของ{x.kind === 'COLUMN' ? 'เสา' : 'ฐานราก'}ด้วยวิธียืดหยุ่นเบื้องต้น (engine {r.engineVersion}) ใช้แรงดันคอนกรีตสด{pm.method === 'ACI347' ? ` ตาม ${ACI_REFERENCE} (สมการ ${pm.equation})` : 'แบบของเหลวเต็มความสูง'} เทจากด้านบน ไม้อัดและคร่าวเป็นคานช่วงเดี่ยว คานคู่รับแรงจุดจากคร่าวเป็นช่วงอิสระระหว่างจุดรองรับ ผลลัพธ์ใช้คัดกรองเท่านั้น ไม่ใช่การรับรองตามมาตรฐานครบทุกสภาวะขีดจำกัด</p>
      <table className="rp-tab"><thead><tr><th>รายการ</th><th>ค่า</th><th>สถานะข้อมูล</th></tr></thead><tbody>
        <tr><td>น้ำหนักคอนกรีตสด γ</td><td>{x.gamma} kN/m³ (ρ = {n(pm.rho, 0)} kg/m³)</td><td>สมมติฐานโครงการ</td></tr>
        <tr><td>วิธีคำนวณแรงดันด้านข้าง</td><td>{pm.method === 'ACI347' ? `ACI PRC-347-14(21) · R = ${x.pourRate} m/h · T = ${x.concreteTemp} °C · ยุบตัว ${x.slump} mm · จี้ลึก ${x.vibrationDepth} m · Cc = ${x.chemistryCc}` : 'แรงดันของเหลว ρgh เต็มความสูง'}</td><td>{pm.method === 'ACI347' ? 'ต้องยืนยันวิธีเทหน้างาน' : 'ปลอดภัยเสมอ'}</td></tr>
        <tr><td>ไม้อัด t / E,eq / Fb,eq{r.plywood.Fs !== null ? ' / Fs' : ''}</td><td>{x.plywood} mm / {n(r.plywood.E, 0)} MPa / {n(r.plywood.Fb)} MPa{r.plywood.Fs !== null ? ` / ${n(r.plywood.Fs, 3)} MPa` : ''} · {PLYWOOD_GRADE_LABEL[r.plywood.grade]}</td><td>{r.plywood.grade === 'CUSTOM' ? 'ผู้ใช้กำหนด ต้องมีใบรับรอง' : 'APA V345 ตาราง 12–13'}</td></tr>
        <tr><td>คร่าว</td><td>{L.stud.label}{L.stud.material === 'TIMBER' ? '' : ` · Fy ${x.steelFy} MPa · E ${x.steelE} MPa`}</td><td>{L.stud.material === 'TIMBER' ? 'ว.ส.ท. (หนังสือ ตาราง 3.4)' : 'มอก. / AISC 360 ต้องยืนยันใบรับรอง'}</td></tr>
        <tr><td>คานคู่</td><td>{L.waler.label} · α = {x.pairShare}</td><td>ค่าหน้าตัดจากแคตตาล็อก ต้องยืนยันใบรับรอง</td></tr>
        {usesTies(x) && <tr><td>Tie rod</td><td>Ø{x.tieDiameter} {x.tieGrade} · Fy {x.tieFy} / Fu {x.tieFu} MPa · Ae {x.tieNetArea || '—'} mm² · SWL {x.tieAssemblySWL || '—'} kN</td><td>{x.tieNetArea && x.tieAssemblySWL ? 'ผู้ใช้กำหนด' : 'ยังไม่ครบ'}</td></tr>}
        <tr><td>ตัวหารกำลัง Ωb / Ωv</td><td>{x.steelOmegaB} / {x.steelOmegaShear}</td><td>เกณฑ์คัดกรอง</td></tr>
        <tr><td>เกณฑ์การโก่ง</td><td>L/{x.deflectionRatio}</td><td>เกณฑ์โครงการ</td></tr>
      </tbody></table></section>

    <section className="rp-sec"><h2>2. {SECTIONS[1]}</h2>
      <div className="rp-two">
        <Fig no={1} w={150} h={132} caption="แปลนแบบหล่อ (อ้างอิงแบบ FW-01)"><PlanView L={L} box={{x: 0, y: 0, w: 150, h: 132}} titled={false}/></Fig>
        <Fig no={2} w={150} h={132} caption="รูปตัด A-A (อ้างอิงแบบ FW-02)"><SectionView L={L} box={{x: 0, y: 0, w: 150, h: 132}} titled={false}/></Fig>
      </div>
      <table className="rp-tab"><thead><tr><th>ด้าน</th><th>ความยาว (mm)</th><th>คร่าว (ตัว)</th><th>Tie ต่อระดับ</th><th>แรงดันรวมต่อด้าน (kN)</th></tr></thead>
        <tbody>{L.faces.map((f, i) => <tr key={f.id}><td>{f.id}</td><td>{n(f.length, 0)}</td><td>{f.studs.length}</td><td>{f.ties.length || '—'}</td><td>{n(r.faces[i].force)}</td></tr>)}</tbody></table>
      <p>ระยะคร่าวสูงสุด {x.studSpacing} mm · ระยะคานคู่สูงสุด {x.walerSpacing} mm ({L.levels.length} ระดับ, ช่วงพาดคร่าวจริง {n(r.waler.verticalSpan, 0)} mm){usesTies(x) ? ` · ระยะ Tie สูงสุด ${x.tieSpacing} mm` : ''} · ระยะเท่ากันไม่เกินค่าที่กำหนด</p></section>

    <section className="rp-sec"><h2>3. {SECTIONS[2]}</h2>
      <p>{pm.method === 'ACI347' ? <>ตาม {ACI_REFERENCE}: ตาราง 4.2.2.1b เลือกสมการจากค่ายุบตัว ความลึกการจี้ ชนิดองค์อาคาร (เสา = ไม่มีด้านใดเกิน 2 m) ความสูง และอัตราการเท แรงดันเพิ่มแบบของเหลวจนถึง CCPmax แล้วคงที่ (รูปที่ 4.2.2)</> : <>ใช้แรงดันแบบของเหลว p = ρgh ตลอดความสูงเท ซึ่ง ACI PRC-347-14(21) §4.2.2 กำหนดให้ใช้เมื่อไม่เข้าเงื่อนไขของสมการลดแรงดัน หรือยังไม่ทราบอัตราการเท อุณหภูมิ และส่วนผสม</>}</p>
      <div className="rp-check rp-derive"><ol className="rp-steps">{pm.steps.map((t, i) => <li key={i}><div className="equation">{t}</div></li>)}
        <li><div className="equation">แรงลัพธ์ต่อความยาวด้าน F = ½ρg·hcap² + pmax(H − hcap) = <b>{n(pm.forcePerM, 2)} kN/m</b></div></li></ol>
        <p className="rp-note">{pm.reason}</p></div>
      <Fig no={3} w={175} h={100} caption="การกระจายแรงดันคอนกรีตสดและค่าที่ใช้ตรวจสมาชิก"><PressureDiagram m={pm}/></Fig>
      <p>การตรวจไม้อัด คร่าว คานคู่ และ Tie ใช้ pmax = {n(pm.pmax, 2)} kPa คงที่ตลอดความสูง (ซองแรงคัดกรอง) · ไม่รวมแรงกระแทกจากการเท การปั๊มจากด้านล่าง หรือคอนกรีตที่มีสารหน่วงพิเศษ ซึ่งต้องพิจารณาเพิ่มตามวิธีเทจริง</p></section>

    <section className="rp-sec"><h2>4. {SECTIONS[3]}</h2>
      {groups.map(([title, checks, extra], gi) => <div key={title} className="rp-group">
        <h3>4.{gi + 1} {title}</h3>
        {extra}
        {checks.map((c, i) => <CheckCard key={c.id} c={c} no={`4.${gi + 1}.${i + 1}`}/>)}
      </div>)}</section>

    <section className="rp-sec"><h2>5. {SECTIONS[4]}</h2>
      <table className="rp-tab"><thead><tr><th>รายการ</th><th>ค่าที่เกิด</th><th>เกณฑ์</th><th>อัตราส่วน</th><th/><th>สถานะ</th></tr></thead>
        <tbody>{r.checks.map(c => <tr key={c.id}><td>{c.label}</td><td>{n(c.demand)} {c.unit}</td><td>{c.limit === null ? 'ยังไม่ทราบ' : `${n(c.limit)} ${c.unit}`}</td><td>{n(c.utilization, 3)}</td><td><RatioBar ratio={c.utilization}/></td><td>{c.status}</td></tr>)}</tbody></table>
      <p><b>สรุป:</b> {fails.length ? `มี ${fails.length} รายการเกินเกณฑ์คัดกรอง ต้องปรับแก้ก่อนใช้งาน` : 'ไม่มีรายการเกินเกณฑ์คัดกรอง'} · สถานะรวม {r.status} (ยังไม่ใช่การอนุมัติก่อสร้าง)</p>
      {advice.length > 0 && <><h3>คำแนะนำปรับแก้ (จากการคำนวณซ้ำ)</h3><ul>{advice.map(a => <li key={a.checkId}><b>{a.label}</b> ({n(a.ratio)}): {a.text}</li>)}</ul></>}</section>

    <section className="rp-sec"><h2>6. {SECTIONS[5]}</h2>
      <table className="rp-tab"><thead><tr><th>#</th><th>รายการ</th><th>ขนาด / สเปก</th><th>หน่วย</th><th>จำนวน</th><th>ยาวตัด (mm)</th><th>รวม</th><th>หมายเหตุ</th></tr></thead>
        <tbody>{L.bom.map((b, i) => <tr key={i}><td>{i + 1}</td><td>{b.item}</td><td>{b.spec}</td><td>{b.unit}</td><td>{b.qty ?? '—'}</td><td>{b.cutLength ?? '—'}</td><td>{b.total}</td><td>{b.remark}</td></tr>)}</tbody></table></section>

    <section className="rp-sec"><h2>7. {SECTIONS[6]}</h2>
      <table className="rp-tab"><thead><tr><th>เลขที่แบบ</th><th>ชื่อแบบ</th><th>ขนาด</th></tr></thead><tbody>
        {[['FW-01', 'แปลนแบบหล่อ'], ['FW-02', 'รูปตัดและรูปด้าน'], ['FW-03', 'รายละเอียดขยายและภาพ 3 มิติ'], ['FW-04', 'ตารางวัสดุและข้อมูลออกแบบ']].map(([a, b]) => <tr key={a}><td>{a}</td><td>{b}</td><td>A3</td></tr>)}</tbody></table>
      <div className="rp-two">
        <Fig no={6} w={150} h={96} caption={x.kind === 'COLUMN' && !x.columnTies ? 'รายละเอียดคานคู่ชุดรัด (FW-03)' : 'รายละเอียดชุด Tie rod (FW-03)'}><TieDetail L={L} box={{x: 0, y: 0, w: 150, h: 96}} titled={false}/></Fig>
        <Fig no={7} w={150} h={96} caption="รายละเอียดมุมแบบหล่อ (FW-03)"><CornerDetail L={L} box={{x: 0, y: 0, w: 150, h: 96}} titled={false}/></Fig>
      </div></section>

    <section className="rp-sec"><h2>8. {SECTIONS[7]}</h2><ol>{[...r.blockers, ...generalNotes(L, r).slice(5)].map((b, i) => <li key={i}>{b}</li>)}</ol></section>

    <section className="rp-sec"><h2>9. {SECTIONS[8]}</h2><ol>
      <li>ACI 347R-14, Guide to Formwork for Concrete — หลักการแรงดันคอนกรีตสด §4.2.2</li>
      <li>กลศาสตร์คาน Euler–Bernoulli: สมดุลแรง/โมเมนต์ และ EIδ″ = −M</li>
      <li><a href="https://www.tatasteelthailand.com/wp-content/uploads/2020/07/Seismic-Bar-SD40-Super-Ductile1561008786.pdf" target="_blank" rel="noreferrer">Tata Steel Thailand — TIS 24-2559 / TIS 20-2559</a> (ค่าตัวอย่าง SD40/SR24)</li>
      <li><a href="https://ej.aisc.org/index.php/engj/article/download/888/887/887" target="_blank" rel="noreferrer">AISC Engineering Journal (2006) — ASD Safety Factors</a> (แนวคิดตัวหารกำลัง)</li>
    </ol>
      <div className="signature"><span>ออกแบบ: {tb.designedBy || '__________________'}</span><span>ตรวจ: {tb.checkedBy || '__________________'}</span><span>อนุมัติ: {tb.approvedBy || '__________________'}</span></div>
      <footer>{docNo} · Rev {tb.rev} · CMG · DRAFT / NOT FOR CONSTRUCTION</footer></section>
  </article>;
}
