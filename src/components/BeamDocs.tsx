import {useMemo, type ReactElement} from 'react';
import {ACI_LOADS_REFERENCE, beamAdvice, patchBeam, type BeamResult} from '../domain/beam';
import {ACI_REFERENCE} from '../domain/pressure';
import {PLYWOOD_GRADE_LABEL} from '../domain/plywoodGrades';
import type {DesignRevisionBinding, TitleBlock} from '../domain/titleBlock';
import {LW, Table, Txt} from '../drawing/primitives';
import {NoteBlock} from '../drawing/views';
import {BeamElevationView, BeamPlanView, BeamSectionView} from '../drawing/beamViews';
import {A3Set, RevisionTable} from './DrawingSet';
import {BeamDiagram, CheckSections, Fig, PressureDiagram, ReportReferences, SummaryTable} from './CalcReport';
import {REPORT_SECTIONS, SCREEN_LEGEND, beamCheckGroups, numberChecks, summaryRows} from '../domain/reportOutline';

const n = (v: number | null, d = 2) => v === null ? '—' : v.toLocaleString('en-US', {minimumFractionDigits: d, maximumFractionDigits: d});
const sp = (r: BeamResult, list: number[]) => r.input.length / (list.length - 1);

/** Transverse joist between the bearer lines: beam strip (and slab strips) as patch loads, exact reactions and Mmax. */
function JoistPatchDiagram({r}: {r: BeamResult}) {
  const x = r.input, L = x.shoreWidth, sj = sp(r, r.joists), w = (q: number) => q / 1000 * sj;
  const patches = [{a: r.beamStart, c: r.beamStart + x.b, w: w(r.loads.beam), label: 'คาน'},
    ...(x.slabLeft > 0 ? [{a: r.beamStart - x.slabLeft, c: r.beamStart, w: w(r.loads.slab), label: 'พื้น'}] : []),
    ...(x.slabRight > 0 ? [{a: r.beamStart + x.b, c: r.beamStart + x.b + x.slabRight, w: w(r.loads.slab), label: 'พื้น'}] : [])];
  const jb = patchBeam(L, patches, r.joist.E, r.joist.I), x0 = 15, x1 = 135, y = 30, X = (v: number) => x0 + (x1 - x0) * v / L, top = Math.max(...patches.map(p => p.w));
  return <g>
    <Txt x={75} y={6} s={3} a="middle" b>{`คร่าวท้อง ${r.joist.name} · แรงแผ่เป็นช่วง`}</Txt>
    {patches.map((p, i) => {const h = 12 * p.w / top; return <g key={i}>
      <rect x={X(p.a)} y={y - 1.5 - h} width={X(p.c) - X(p.a)} height={h} fill={p.label === 'คาน' ? '#dbe8f5' : '#eef3f8'} stroke="#1d4e89" strokeWidth={LW.thin}/>
      <Txt x={(X(p.a) + X(p.c)) / 2} y={y - 3 - h} s={2.3} a="middle" fill="#1d4e89">{`${p.label} ${n(p.w, 3)} N/mm`}</Txt></g>;})}
    <line x1={x0} y1={y} x2={x1} y2={y} stroke="#111" strokeWidth={1}/>
    {[x0, x1].map(v => <polygon key={v} points={`${v},${y + 0.5} ${v - 3},${y + 5} ${v + 3},${y + 5}`} fill="none" stroke="#111" strokeWidth={LW.med}/>)}
    <Txt x={x0} y={y + 9} s={2.4} a="middle">RA {n(jb.RA / 1000, 3)} kN</Txt><Txt x={x1} y={y + 9} s={2.4} a="middle">RB {n(jb.RB / 1000, 3)} kN</Txt>
    <Txt x={75} y={y + 9} s={2.6} a="middle">{`L = ${n(L, 0)} mm (ระหว่างแนวคานรับ)`}</Txt>
    <Txt x={75} y={y + 17} s={2.6} a="middle" fill="#9b1c1c">{`Mmax = ${n(jb.Mmax / 1e6, 3)} kN·m ที่ x = ${n(jb.xM, 0)} mm · δmax = ${n(jb.dmax, 2)} mm`}</Txt>
  </g>;
}

export function beamNotes(r: BeamResult) {
  const x = r.input, pm = r.pressureModel;
  return [
    'หน่วยเป็นมิลลิเมตร เว้นแต่ระบุเป็นอื่น ห้ามวัดขนาดจากแบบ ให้ใช้ตัวเลขที่ระบุ',
    `แบบชุดนี้สร้างจากผลคัดกรองเบื้องต้น (${r.engineVersion}) สถานะ ${r.status}${x.confirmed ? '' : ' และยังไม่ยืนยันมิติจากแบบต้นฉบับ'} ห้ามใช้ก่อสร้างจนกว่าวิศวกรตรวจและอนุมัติ`,
    `น้ำหนักท้องคาน q = ${n(r.loads.beam)} kPa (คอนกรีต ${n(r.loads.concrete)} + แบบหล่อ ${n(x.formDead)} + น้ำหนักจร ${n(r.loads.liveUsed)} kPa ตาม ACI §4.2.1)`,
    pm.method === 'ACI347' ? `แรงดันด้านข้างตาม ACI PRC-347-14(21) สมการ ${pm.equation}: pmax = ${n(pm.pmax, 1)} kPa (เทไม่เร็วกว่า ${x.pourRate} m/h)` : `แรงดันด้านข้างแบบของเหลว ρgh = ${n(pm.pmax, 1)} kPa`,
    `ค้ำยันรับ ${n(r.shoreLoad)} kN/ต้น (คานรับต่อเนื่อง k = ${n(r.shoreFactor, 3)}) ${x.shoreSWL > 0 ? `(SWL ${x.shoreSWL} kN ${x.shoreReference})` : '· ต้องเลือกรุ่นที่มี SWL รับรองที่ความยาว ' + n(r.shoreLength, 0) + ' mm'}`,
    `ค้ำยันทแยง/ledger ต้องรับแรงด้านข้าง ${n(r.lateralPerM)} kN/m ตามยาวคาน (ACI §4.2.3.2) ${x.lateralCapacity > 0 ? `· ออกแบบรับ ${n(x.lateralCapacity)} kN/m ${x.restraintReference}` : 'ยังไม่ได้ออกแบบในแบบชุดนี้'}`,
    `แบบข้าง: ไม้กันตีนและจุดยึดบนรับ ${n(r.kickerForcePerM)} kN/m ต่อด้าน${x.kickerCapacity > 0 && x.topRestraintCapacity > 0 ? ` (ออกแบบ ${n(x.kickerCapacity)} / ${n(x.topRestraintCapacity)} kN/m)` : ' · ต้องออกแบบจุดยึด'}`,
    'หัวค้ำ (U-head) ต้องจับคานรับให้อยู่กึ่งกลาง ห้ามรับแรงเยื้องศูนย์ ฐานค้ำต้องมีแผ่นรองบนพื้นที่รับน้ำหนักได้',
    'ตรวจแนว ระดับ และความแน่นของแบบหล่อทุกครั้งก่อนเทคอนกรีต ห้ามถอดค้ำก่อนคอนกรีตได้กำลังตามที่วิศวกรกำหนด',
  ];
}

export function BeamDrawingSet({r, project, code, caseName, titleBlock, canEdit, onTitleBlockChange, revisionBinding}: {r: BeamResult; project: string; code: string; caseName: string;
  titleBlock: TitleBlock; canEdit: boolean; onTitleBlockChange: (tb: TitleBlock) => void; revisionBinding?: DesignRevisionBinding}) {
  const x = r.input;
  const sheets = [
    {code: 'BF-01', title: 'รูปตัดแบบหล่อคาน', body: <>
      <BeamSectionView r={r} box={{x: 23, y: 24, w: 270, h: 222}}/>
      <line x1={298} y1={24} x2={298} y2={246} stroke="#111" strokeWidth={0.1} strokeDasharray="4 1.5"/>
      <NoteBlock x={302} y={26} w={104} title="หมายเหตุทั่วไป (GENERAL NOTES)" items={beamNotes(r)} s={2}/>
      <RevisionTable x={302} y={205} tb={titleBlock} w={104}/>
    </>},
    {code: 'BF-02', title: 'รูปด้านและแปลนค้ำยัน', body: <>
      <BeamElevationView r={r} box={{x: 23, y: 24, w: 384, h: 112}}/>
      <line x1={23} y1={136} x2={407} y2={136} stroke="#111" strokeWidth={0.1} strokeDasharray="4 1.5"/>
      <BeamPlanView r={r} box={{x: 23, y: 137, w: 384, h: 109}}/>
    </>},
    {code: 'BF-03', title: 'ตารางวัสดุและข้อมูลออกแบบ', body: <>
      <Table x={23} y={24} title="ตารางวัสดุ (BILL OF MATERIALS)" rh={6} s={2.2}
        cols={[{t: 'ลำดับ', w: 11, a: 'middle'}, {t: 'รายการ', w: 60}, {t: 'ขนาด / สเปก', w: 70}, {t: 'จำนวน', w: 18, a: 'end'}, {t: 'หน่วย', w: 14, a: 'middle'}, {t: 'หมายเหตุ', w: 211}]}
        rows={r.quantities.map((q, i) => [String(i + 1), q.item, q.spec, String(q.qty), q.unit, q.note])}/>
      <Table x={23} y={100} title="ข้อมูลออกแบบ (DESIGN DATA)" rh={5.4} s={2.1} cols={[{t: 'รายการ', w: 50}, {t: 'ค่า', w: 70}]} rows={[
        ['คาน b × h / พื้น', `${x.b} × ${x.h} mm / ${x.slabT} mm (${x.slabSides} ด้าน)`], ['ความยาว / สูงใต้ท้องคาน', `${x.length} / ${x.soffitHeight} mm`],
        ['น้ำหนักท้องคาน q', `${n(r.loads.beam)} kPa`], ['แรงดันข้าง pmax', `${n(r.pressureModel.pmax, 1)} kPa`],
        ['ไม้อัด', `${x.plywood} mm · ${PLYWOOD_GRADE_LABEL[x.plywoodGrade]}`], ['คร่าวท้อง / ระยะ', `${r.joist.name} @ ${n(sp(r, r.joists), 0)}`],
        ['คานรับ / ค้ำยัน', `${x.bearerCount > 1 ? '2×' : ''}${r.bearer.name} @ ${n(sp(r, r.shores), 0)}`], ['คร่าวข้าง / ระยะ', `${r.stud.name} @ ${n(sp(r, r.studs), 0)}`],
        ['Tie', x.tieRows ? `${x.tieRows} แถว Ø${x.tieDiameter} @ ${n(sp(r, r.ties), 0)}` : 'ไม่มี'], ['สถานะระบบ', `${r.status} · ${r.engineVersion}`],
      ]}/>
      <Table x={146} y={100} title="สรุปผลตรวจคัดกรอง (CHECK SUMMARY)" rh={5} s={1.9} cols={[{t: 'รายการ', w: 78}, {t: 'ผล', w: 28, a: 'end'}, {t: 'เกณฑ์', w: 28, a: 'end'}, {t: 'Ratio', w: 15, a: 'end'}, {t: 'สถานะ', w: 22, a: 'middle'}]}
        rows={summaryRows(numberChecks(beamCheckGroups(), r.checks).ordered, n)}/>
      <NoteBlock x={322} y={100} w={85} title="รายการที่ยังขาด" items={r.blockers} s={1.8}/>
      <Txt x={23} y={244} s={2} fill="#444">{SCREEN_LEGEND}</Txt>
    </>},
  ];
  return <A3Set sheets={sheets} project={project} code={code} caseName={caseName} elementLabel="แบบหล่อคาน" confirmed={x.confirmed} titleBlock={titleBlock} canEdit={canEdit} onTitleBlockChange={onTitleBlockChange} revisionBinding={revisionBinding}/>;
}

/** Cover page, signatures and contents shared by the soffit-system reports. */
export function ReportCover({title, subtitle, project, code, element, docNo, size, status, fails, sheets, tb, sections, figure, revisionBinding}: {title: string; subtitle: string; project: string; code: string;
  element: string; docNo: string; size: string; status: string; fails: number; sheets: string; tb: TitleBlock; sections: readonly string[]; figure: ReactElement; revisionBinding?: DesignRevisionBinding}) {
  return <>
    <section className="rp-page rp-cover">
      <div className="rp-brand"><span className="brand-square">CMG</span><div><b>CMG ENGINEERING & CONSTRUCTION</b><small>FORMWORK DESIGN DEPARTMENT</small></div></div>
      <div className="rp-stamp">แบบร่างเบื้องต้น · ห้ามใช้ก่อสร้าง<br/><small>PRELIMINARY – NOT FOR CONSTRUCTION</small></div>
      <h1>{title}</h1><h2>{subtitle}</h2>
      <table className="rp-meta"><tbody>
        <tr><th>โครงการ</th><td>{project}</td><th>รหัสโครงการ</th><td>{code}</td></tr>
        <tr><th>องค์อาคาร</th><td>{element}</td><th>เลขที่เอกสาร</th><td>{docNo}</td></tr>
        <tr><th>ขนาด</th><td>{size}</td><th>Rev / วันที่</th><td>{tb.rev} / {tb.date}</td></tr>
        <tr><th>สถานะผลคัดกรอง</th><td>{status} · {fails ? `${fails} รายการเกินเกณฑ์` : 'ไม่มีรายการเกินเกณฑ์คัดกรอง'}</td><th>แบบประกอบ</th><td>{sheets}</td></tr>
        {revisionBinding&&<tr><th>Design Revision</th><td>{revisionBinding.designRevision}</td><th>Review / hash</th><td>{revisionBinding.reviewState} · {revisionBinding.contentHash ? `${revisionBinding.contentHash.slice(0, 16)}…` : 'ยังไม่มี review hash'}</td></tr>}
      </tbody></table>
      {figure}
      <table className="rp-sign"><thead><tr><th/><th>ชื่อ</th><th>ลายมือชื่อ</th><th>วันที่</th></tr></thead><tbody>
        {[['ออกแบบ / Designed', tb.designedBy], ['ตรวจสอบ / Checked', tb.checkedBy], ['อนุมัติ / Approved', tb.approvedBy]].map(([k, v]) => <tr key={k}><th>{k}</th><td>{v || ' '}</td><td/><td/></tr>)}
      </tbody></table>
    </section>
    <section className="rp-page rp-toc"><h2>สารบัญ (CONTENTS)</h2><ol>{sections.map(s => <li key={s}>{s}</li>)}</ol>
      <p className="muted">หน่วยที่ใช้: ความยาว mm · แรง N/kN · หน่วยแรง MPa · แรงดัน/น้ำหนักแผ่ kPa</p></section>
  </>;
}

const SECTIONS = REPORT_SECTIONS;

export function BeamReport({r, project, code, caseName, caseId, titleBlock: tb, revisionBinding}: {r: BeamResult; project: string; code: string; caseName: string; caseId: string; titleBlock: TitleBlock; revisionBinding?: DesignRevisionBinding}) {
  const x = r.input, pm = r.pressureModel, advice = useMemo(() => beamAdvice(x), [x]), fails = r.checks.filter(c => c.status === 'FAIL');
  const docNo = `CAL-${code || 'CMG'}-${caseId.replace(/[^\w]/g, '').slice(0, 6).toUpperCase()}`, sj = sp(r, r.joists), ss = sp(r, r.shores), st = sp(r, r.studs);
  const numbered = numberChecks(beamCheckGroups(), r.checks);
  return <article className="calc-report">
    <ReportCover title="รายการคำนวณออกแบบแบบหล่อคาน" subtitle="BEAM FORMWORK DESIGN CALCULATION" project={project} code={code} element={`${caseName} · แบบหล่อคาน`} docNo={docNo}
      size={`b ${x.b} × h ${x.h} mm · ยาว ${x.length} mm`} status={r.status} fails={fails.length} sheets="BF-01 ถึง BF-03 (A3)" tb={tb} sections={SECTIONS} revisionBinding={revisionBinding}
      figure={<Fig w={190} h={120} caption="รูปตัดแบบหล่อคาน (อ้างอิงแบบ BF-01)"><BeamSectionView r={r} box={{x: 0, y: 0, w: 190, h: 120}} titled={false}/></Fig>}/>

    <section className="rp-sec"><h2>1. {SECTIONS[0]}</h2>
      <p>รายการคำนวณนี้คัดกรองแบบหล่อคานด้วยวิธียืดหยุ่นเบื้องต้น (engine {r.engineVersion}) เส้นทางแรงท้องคาน: น้ำหนักคอนกรีตและงาน → ไม้อัด → คร่าวท้องตามขวาง → คานรับตามยาว → ค้ำยัน และแบบข้าง: แรงดันคอนกรีตสด → ไม้อัด → คร่าวแนวตั้ง → {x.tieRows ? 'คานคู่และ Tie ทะลุคาน / ' : ''}ไม้กันตีนและจุดยึดบน คร่าว คานรับ และคร่าวข้างตรวจหน่วยแรงแบบคานช่วงเดี่ยว แต่แรงลงค้ำยันใช้ปฏิกิริยาคานรับต่อเนื่อง (สมการสามโมเมนต์) ไม้อัดใช้วิธีคานต่อเนื่องของ APA V345 ผลลัพธ์ใช้คัดกรองเท่านั้น</p>
      <table className="rp-tab"><thead><tr><th>รายการ</th><th>ค่า</th><th>สถานะข้อมูล</th></tr></thead><tbody>
        <tr><td>น้ำหนักคอนกรีต γ / แบบหล่อ / น้ำหนักจร</td><td>{x.gamma} kN/m³ / {x.formDead} kPa / {x.liveLoad} kPa{x.motorized ? ' (มีรถเข็นติดเครื่องยนต์)' : ''}</td><td>สมมติฐานโครงการ · ขั้นต่ำตาม ACI §4.2.1</td></tr>
        <tr><td>แรงดันด้านข้าง</td><td>{pm.method === 'ACI347' ? `ACI PRC-347-14(21) · R ${x.pourRate} m/h · T ${x.concreteTemp} °C · ยุบตัว ${x.slump} mm` : 'แรงดันของเหลว ρgh'}</td><td>{pm.method === 'ACI347' ? 'ต้องยืนยันวิธีเทหน้างาน' : 'ปลอดภัยเสมอ'}</td></tr>
        <tr><td>ไม้อัด</td><td>{x.plywood} mm · {PLYWOOD_GRADE_LABEL[x.plywoodGrade]}</td><td>{x.plywoodGrade === 'CUSTOM' ? 'ผู้ใช้กำหนด ต้องมีใบรับรอง' : 'APA V345 ตาราง 12–13'}</td></tr>
        <tr><td>คร่าวท้อง / คานรับ / คร่าวข้าง{x.tieRows ? ' / คานคู่' : ''}</td><td>{r.joist.name} / {x.bearerCount > 1 ? '2×' : ''}{r.bearer.name} / {r.stud.name}{x.tieRows ? ' / 2×' + r.waler.name : ''}</td><td>ตารางเหล็ก มอก. / ว.ส.ท. ต้องยืนยันใบรับรอง</td></tr>
        <tr><td>เหล็ก Fy / E / Ωb / Ωv</td><td>{x.steelFy} / {x.steelE} MPa / {x.steelOmegaB} / {x.steelOmegaShear}</td><td>AISC 360 ASD (คัดกรอง)</td></tr>
        <tr><td>ค้ำยัน SWL</td><td>{x.shoreSWL > 0 ? `${x.shoreSWL} kN · ${x.shoreReference || 'ไม่ระบุแหล่ง'}` : 'ยังไม่ระบุ'}</td><td>{x.shoreSWL > 0 ? 'ค่าผู้ผลิต' : 'ยังไม่ครบ'}</td></tr>
        {x.tieRows > 0 && <tr><td>Tie Ø / Fy / Ω / SWL</td><td>Ø{x.tieDiameter} mm / {x.tieFy} MPa / {x.tieOmega} / {x.tieSWL > 0 ? x.tieSWL + ' kN' : 'ยังไม่ระบุ'}</td><td>มอก. 24 · ค่าผู้ผลิต (ACI Table 4.4)</td></tr>}
        <tr><td>กำลังไม้กันตีน / จุดยึดบน / ค้ำยันทแยง</td><td>{[x.kickerCapacity, x.topRestraintCapacity, x.lateralCapacity].map(v => v > 0 ? n(v) : '—').join(' / ')} kN/m</td><td>{x.restraintReference || 'ยังไม่ออกแบบ (INCOMPLETE)'}</td></tr>
        <tr><td>เกณฑ์การโก่ง</td><td>L/{x.deflectionRatio}</td><td>เกณฑ์โครงการ</td></tr>
      </tbody></table></section>

    <section className="rp-sec"><h2>2. {SECTIONS[1]}</h2>
      <div className="rp-two">
        <Fig no={1} w={150} h={120} caption="รูปตัด A-A (BF-01)"><BeamSectionView r={r} box={{x: 0, y: 0, w: 150, h: 120}} titled={false}/></Fig>
        <Fig no={2} w={150} h={120} caption="แปลนค้ำยัน (BF-02)"><BeamPlanView r={r} box={{x: 0, y: 0, w: 150, h: 120}} titled={false}/></Fig>
      </div>
      <p>คร่าวท้อง {r.joists.length} ตัว @ {n(sj, 0)} mm · ค้ำยัน {r.shores.length} แนว × 2 ต้น @ {n(ss, 0)} mm ระยะตามขวาง {x.shoreWidth} mm · คร่าวข้าง {r.studs.length} ตัว/ด้าน @ {n(st, 0)} mm · ความสูงแบบข้าง {r.sideHeights[0]}/{r.sideHeights[1]} mm · ความยาวค้ำยันใช้งาน ≈ {n(r.shoreLength, 0)} mm (ระยะเท่ากันไม่เกินค่าที่กำหนด)</p></section>

    <section className="rp-sec"><h2>3. {SECTIONS[2]}</h2>
      <h3>3.1 น้ำหนักบรรทุกแนวดิ่ง (แบบท้องคาน)</h3>
      <div className="rp-check rp-derive"><ol className="rp-steps">{r.loads.steps.map((t, i) => <li key={i}><div className="equation">{t}</div></li>)}</ol>
        <p className="rp-note">อ้างอิง {ACI_LOADS_REFERENCE} · แรงด้านข้างสำหรับค้ำยัน H = max(1.5 kN/m, 2% DL) = {n(r.lateralPerM, 3)} kN/m (ตรวจในข้อ 5.1)</p></div>
      <h3>3.2 แรงดันคอนกรีตสดด้านข้าง (แบบข้างคาน)</h3>
      <p>{pm.method === 'ACI347' ? <>ตาม {ACI_REFERENCE} (คานจัดเป็น {pm.element === 'WALL' ? '"ผนัง" เพราะมีด้านในแปลนยาวเกิน 2 m' : '"เสา" เพราะไม่มีด้านในแปลนเกิน 2 m'})</> : <>ใช้แรงดันแบบของเหลว p = ρgh ตลอดความลึกคาน h = {x.h} mm</>}</p>
      <div className="rp-check rp-derive"><ol className="rp-steps">{pm.steps.map((t, i) => <li key={i}><div className="equation">{t}</div></li>)}</ol><p className="rp-note">{pm.reason}</p></div>
      <Fig no={3} w={175} h={100} caption="การกระจายแรงดันคอนกรีตสดบนแบบข้างคาน"><PressureDiagram m={pm}/></Fig></section>

    <section className="rp-sec"><h2>4. {SECTIONS[3]}</h2>
      <CheckSections groups={numbered.groups} section="4" figs={{
        '4.1': <Fig no={4} w={150} h={68} caption={`ไม้อัดแถบ 1 m พาดระหว่างคร่าวท้อง @ ${n(sj, 0)} mm (${r.soffitPlywood.spans === 1 ? 'ช่วงเดี่ยว' : `ต่อเนื่อง ${r.soffitPlywood.spans} ช่วง ตาม APA V345`}) · รับได้ ${n(r.soffitPlywood.allowablePressure, 1)} kPa`}><BeamDiagram L={sj} w={r.loads.beam} title="ไม้อัดท้องคาน แถบ 1 m"/></Fig>,
        '4.2': <Fig no={5} w={150} h={58} caption={`คร่าวท้องพาดระหว่างแนวคานรับ รับแถบคาน${x.slabLeft + x.slabRight > 0 ? 'และแถบพื้น' : ''}เป็นแรงแผ่เป็นช่วง @ ${n(sj, 0)} mm`}><JoistPatchDiagram r={r}/></Fig>,
        '4.3': <Fig no={6} w={150} h={68} caption={`คานรับพาดระหว่างค้ำยัน @ ${n(ss, 0)} mm รับแรงจากคร่าวท้องเฉลี่ยเป็นแรงแผ่`}><BeamDiagram L={ss} w={r.bearerLine} title={`คานรับ ${r.bearer.name}`}/></Fig>,
        '4.5': <Fig no={7} w={150} h={68} caption={`ไม้อัดแถบ 1 m พาดระหว่างคร่าวข้าง @ ${n(st, 0)} mm (${r.sidePlywood.spans === 1 ? 'ช่วงเดี่ยว' : `ต่อเนื่อง ${r.sidePlywood.spans} ช่วง ตาม APA V345`}) · รับได้ ${n(r.sidePlywood.allowablePressure, 1)} kPa`}><BeamDiagram L={st} w={pm.pmax} unit='kPa' title='ไม้อัดแบบข้าง แถบ 1 m'/></Fig>,
        '4.6': <Fig no={8} w={150} h={68} caption={`คร่าวข้างช่วง ${n(r.studSpan, 0)} mm · ปลายล่างไม้กันตีน ปลายบนจุดยึดบน${x.tieRows ? ' · จุดกลางคือแถว Tie' : ''}`}><BeamDiagram L={r.studSpan} w={pm.pmax / 1000 * st} title={`คร่าวข้าง ${r.stud.name}`}/></Fig>,
        ...(x.tieRows > 0 ? {'4.7': <Fig no={9} w={150} h={68} caption={`คานคู่พาดระหว่าง Tie @ ${n(sp(r, r.ties), 0)} mm รับแรงดัน × ช่วงคร่าว ${n(r.studSpan, 0)} mm`}><BeamDiagram L={sp(r, r.ties)} w={pm.pmax / 1000 * r.studSpan} title={`คานคู่ 2×${r.waler.name}`}/></Fig>} : {}),
      }}/></section>

    <section className="rp-sec"><h2>5. {SECTIONS[4]}</h2>
      <p>แรงด้านข้างของแบบท้องคานตาม ACI §4.2.3.2 ต้องส่งเข้าค้ำยันทแยง/ledger และแรงดันบนแบบข้างส่งเข้าไม้กันตีน (ล่าง) และจุดยึดบน กำลังของชิ้นส่วนเหล่านี้มาจากการออกแบบหรือเอกสารผู้ผลิตที่ผู้ใช้กรอก (0 = ยังไม่ออกแบบ → INCOMPLETE)</p>
      <CheckSections groups={numbered.groups} section="5"/></section>

    <section className="rp-sec"><h2>6. {SECTIONS[5]}</h2>
      <SummaryTable items={numbered.ordered}/>
      <p><b>สรุป:</b> {fails.length ? `มี ${fails.length} รายการเกินเกณฑ์คัดกรอง ต้องปรับแก้ก่อนใช้งาน` : 'ไม่มีรายการเกินเกณฑ์คัดกรอง'} · สถานะรวม {r.status} (ยังไม่ใช่การอนุมัติก่อสร้าง)</p>
      <h3>ระยะสูงสุดที่ไม่เกินเกณฑ์ (คำนวณซ้ำ ไม่เปลี่ยนหน้าตัด)</h3>
      <ul>{advice.map(a => <li key={a.key}>{a.label}: ใช้อยู่ {a.current} mm → สูงสุด {a.max === null ? 'ไม่มีระยะที่ผ่าน ต้องเปลี่ยนหน้าตัด' : a.max + ' mm'}{a.unchecked.length ? ` (ยังไม่รวม ${a.unchecked.join(', ')} เพราะไม่มีค่ากำลัง)` : ''}</li>)}</ul></section>

    <section className="rp-sec"><h2>7. {SECTIONS[6]}</h2>
      <table className="rp-tab"><thead><tr><th>#</th><th>รายการ</th><th>ขนาด / สเปก</th><th>จำนวน</th><th>หน่วย</th><th>หมายเหตุ</th></tr></thead>
        <tbody>{r.quantities.map((q, i) => <tr key={i}><td>{i + 1}</td><td>{q.item}</td><td>{q.spec}</td><td>{q.qty}</td><td>{q.unit}</td><td>{q.note}</td></tr>)}</tbody></table>
      <p>ปริมาตรคอนกรีตคาน (รวมส่วนพื้นเหนือคาน) {n(r.volume, 3)} m³</p></section>

    <section className="rp-sec"><h2>8. {SECTIONS[7]}</h2><ol>{[...r.blockers, ...beamNotes(r).slice(7)].map((b, i) => <li key={i}>{b}</li>)}</ol></section>

    <section className="rp-sec"><h2>9. {SECTIONS[8]}</h2><ReportReferences/>
      <div className="signature"><span>ออกแบบ: {tb.designedBy || '__________________'}</span><span>ตรวจ: {tb.checkedBy || '__________________'}</span><span>อนุมัติ: {tb.approvedBy || '__________________'}</span></div>
      <footer>{docNo} · Rev {tb.rev} · CMG · DRAFT / NOT FOR CONSTRUCTION</footer></section>
  </article>;
}
