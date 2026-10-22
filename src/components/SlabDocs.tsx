import {useMemo, type ReactElement} from 'react';
import {slabAdvice, type SlabResult} from '../domain/slab';
import {PLYWOOD_GRADE_LABEL} from '../domain/plywoodGrades';
import {REPORT_SECTIONS, SCREEN_LEGEND, numberChecks, slabCheckGroups, summaryRows} from '../domain/reportOutline';
import type {DesignRevisionBinding, TitleBlock} from '../domain/titleBlock';
import {Table, Txt} from '../drawing/primitives';
import {NoteBlock} from '../drawing/views';
import {SlabPlanView, SlabSectionView} from '../drawing/slabViews';
import {A3Set, RevisionTable} from './DrawingSet';
import {BeamDiagram, CheckSections, Fig, ReportReferences, SummaryTable} from './CalcReport';
import {ReportCover} from './BeamDocs';

const n = (v: number | null, d = 2) => v === null ? '—' : v.toLocaleString('en-US', {minimumFractionDigits: d, maximumFractionDigits: d});
const sp = (L: number, list: number[]) => L / (list.length - 1);

export function slabNotes(r: SlabResult) {
  const x = r.input;
  return [
    'หน่วยเป็นมิลลิเมตร เว้นแต่ระบุเป็นอื่น ห้ามวัดขนาดจากแบบ ให้ใช้ตัวเลขที่ระบุ',
    `แบบชุดนี้สร้างจากผลคัดกรองเบื้องต้น (${r.engineVersion}) สถานะ ${r.status}${x.confirmed ? '' : ' และยังไม่ยืนยันมิติจากแบบต้นฉบับ'} ห้ามใช้ก่อสร้างจนกว่าวิศวกรตรวจและอนุมัติ`,
    `น้ำหนักออกแบบ q = ${n(r.loads.q)} kPa (คอนกรีต ${n(r.loads.concrete)} + แบบหล่อ ${n(x.formDead)} + น้ำหนักจร ${n(r.loads.liveUsed)} kPa ตาม ACI §4.2.1)`,
    `ค้ำยันภายในรับ ${n(r.shoreLoad)} kN/ต้น (คานต่อเนื่อง kj ${n(r.joistFactor, 3)} · kb ${n(r.shoreFactor, 3)}) ${x.shoreSWL > 0 ? `(SWL ${x.shoreSWL} kN ${x.shoreReference})` : '· ต้องเลือกรุ่นที่มี SWL รับรองที่ความยาว ' + n(r.shoreLength, 0) + ' mm'}`,
    `ค้ำยันทแยง/ledger ต้องรับแรงด้านข้าง ${n(r.lateralX)} kN/m (แนว X) และ ${n(r.lateralY)} kN/m (แนว Y) ตาม ACI §4.2.3.2 ยังไม่ได้ออกแบบในแบบชุดนี้`,
    'หัวค้ำ (U-head) ต้องจับคานรับให้อยู่กึ่งกลาง รอยต่อคานรับและคร่าวต้องอยู่เหนือจุดรองรับ ฐานค้ำต้องมีแผ่นรองบนพื้นที่รับน้ำหนักได้',
    'ตรวจแนว ระดับ และความแน่นของแบบหล่อทุกครั้งก่อนเทคอนกรีต ห้ามถอดค้ำก่อนคอนกรีตได้กำลังตามที่วิศวกรกำหนด',
  ];
}

export function SlabDrawingSet({r, project, code, caseName, titleBlock, canEdit, onTitleBlockChange, revisionBinding}: {r: SlabResult; project: string; code: string; caseName: string;
  titleBlock: TitleBlock; canEdit: boolean; onTitleBlockChange: (tb: TitleBlock) => void; revisionBinding?: DesignRevisionBinding}) {
  const x = r.input;
  const sheets = [
    {code: 'SF-01', title: 'แปลนแบบหล่อพื้นและค้ำยัน', body: <>
      <SlabPlanView r={r} box={{x: 23, y: 24, w: 274, h: 222}}/>
      <line x1={300} y1={24} x2={300} y2={246} stroke="#111" strokeWidth={0.1} strokeDasharray="4 1.5"/>
      <NoteBlock x={304} y={26} w={102} title="หมายเหตุทั่วไป (GENERAL NOTES)" items={slabNotes(r)} s={2}/>
      <RevisionTable x={304} y={205} tb={titleBlock}/>
    </>},
    {code: 'SF-02', title: 'รูปตัดแบบหล่อพื้น', body: <>
      <SlabSectionView r={r} axis="X" box={{x: 23, y: 24, w: 384, h: 112}}/>
      <line x1={23} y1={136} x2={407} y2={136} stroke="#111" strokeWidth={0.1} strokeDasharray="4 1.5"/>
      <SlabSectionView r={r} axis="Y" box={{x: 23, y: 137, w: 384, h: 109}}/>
    </>},
    {code: 'SF-03', title: 'ตารางวัสดุและข้อมูลออกแบบ', body: <>
      <Table x={23} y={24} title="ตารางวัสดุ (BILL OF MATERIALS)" rh={6} s={2.2}
        cols={[{t: 'ลำดับ', w: 11, a: 'middle'}, {t: 'รายการ', w: 60}, {t: 'ขนาด / สเปก', w: 70}, {t: 'จำนวน', w: 18, a: 'end'}, {t: 'หน่วย', w: 14, a: 'middle'}, {t: 'หมายเหตุ', w: 211}]}
        rows={r.quantities.map((q, i) => [String(i + 1), q.item, q.spec, String(q.qty), q.unit, q.note])}/>
      <Table x={23} y={70} title="ข้อมูลออกแบบ (DESIGN DATA)" rh={5.4} s={2.1} cols={[{t: 'รายการ', w: 50}, {t: 'ค่า', w: 70}]} rows={[
        ['พื้น lx × ly × t', `${x.lx} × ${x.ly} × ${x.t} mm`], ['สูงใต้ท้องพื้น', `${x.soffitHeight} mm`], ['น้ำหนักออกแบบ q', `${n(r.loads.q)} kPa`],
        ['ไม้อัด', `${x.plywood} mm · ${PLYWOOD_GRADE_LABEL[x.plywoodGrade]}`], ['คร่าว / ระยะ', `${r.joist.name} @ ${n(sp(x.lx, r.joists), 0)}`],
        ['คานรับ / ระยะ', `${x.bearerCount > 1 ? '2×' : ''}${r.bearer.name} @ ${n(sp(x.ly, r.bearers), 0)}`], ['ค้ำยัน / ระยะ', `${r.shoreCount} ต้น @ ${n(sp(x.lx, r.shores), 0)} mm`],
        ['ค้ำยัน SWL', x.shoreSWL > 0 ? `${x.shoreSWL} kN` : 'ยังไม่ระบุ'], ['สถานะระบบ', `${r.status} · ${r.engineVersion}`],
      ]}/>
      <Table x={146} y={70} title="สรุปผลตรวจคัดกรอง (CHECK SUMMARY)" rh={5.4} s={2} cols={[{t: 'รายการ', w: 78}, {t: 'ผล', w: 28, a: 'end'}, {t: 'เกณฑ์', w: 28, a: 'end'}, {t: 'Ratio', w: 15, a: 'end'}, {t: 'สถานะ', w: 22, a: 'middle'}]}
        rows={summaryRows(numberChecks(slabCheckGroups(), r.checks).ordered, n)}/>
      <NoteBlock x={322} y={70} w={85} title="รายการที่ยังขาด" items={r.blockers} s={1.8}/>
      <Txt x={23} y={244} s={2} fill="#444">{SCREEN_LEGEND}</Txt>
    </>},
  ];
  return <A3Set sheets={sheets} project={project} code={code} caseName={caseName} elementLabel="แบบหล่อพื้น" confirmed={x.confirmed} titleBlock={titleBlock} canEdit={canEdit} onTitleBlockChange={onTitleBlockChange} revisionBinding={revisionBinding}/>;
}

const SECTIONS = REPORT_SECTIONS;

export function SlabReport({r, project, code, caseName, caseId, titleBlock: tb, revisionBinding}: {r: SlabResult; project: string; code: string; caseName: string; caseId: string; titleBlock: TitleBlock; revisionBinding?: DesignRevisionBinding}) {
  const x = r.input, advice = useMemo(() => slabAdvice(x), [x]), fails = r.checks.filter(c => c.status === 'FAIL');
  const docNo = `CAL-${code || 'CMG'}-${caseId.replace(/[^\w]/g, '').slice(0, 6).toUpperCase()}`, sj = sp(x.lx, r.joists), sb = sp(x.ly, r.bearers), ss = sp(x.lx, r.shores);
  const numbered = numberChecks(slabCheckGroups(), r.checks);
  return <article className="calc-report">
    <ReportCover title="รายการคำนวณออกแบบแบบหล่อพื้น" subtitle="SLAB FORMWORK DESIGN CALCULATION" project={project} code={code} element={`${caseName} · แบบหล่อพื้น`} docNo={docNo}
      size={`${x.lx} × ${x.ly} mm · หนา ${x.t} mm`} status={r.status} fails={fails.length} sheets="SF-01 ถึง SF-03 (A3)" tb={tb} sections={SECTIONS} revisionBinding={revisionBinding}
      figure={<Fig w={190} h={120} caption="แปลนแบบหล่อพื้นและค้ำยัน (อ้างอิงแบบ SF-01)"><SlabPlanView r={r} box={{x: 0, y: 0, w: 190, h: 120}} titled={false}/></Fig>}/>
    <section className="rp-sec"><h2>1. {SECTIONS[0]}</h2>
      <p>รายการคำนวณนี้คัดกรองแบบหล่อท้องพื้นหนึ่งช่วงด้วยวิธียืดหยุ่นเบื้องต้น (engine {r.engineVersion}) เส้นทางแรง: น้ำหนักคอนกรีตและงาน → ไม้อัด (คานต่อเนื่องตาม APA V345) → คร่าว → คานรับ → ค้ำยัน คร่าวและคานรับตรวจหน่วยแรงแบบคานช่วงเดี่ยว แต่แรงลงคานรับและค้ำยันใช้ปฏิกิริยาคานต่อเนื่อง (คร่าว kj = {n(r.joistFactor, 3)}, คานรับ kb = {n(r.shoreFactor, 3)} จากสมการสามโมเมนต์) ค้ำยันใช้ต้นภายในที่รับแรงมากสุด ผลลัพธ์ใช้คัดกรองเท่านั้น</p>
      <table className="rp-tab"><thead><tr><th>รายการ</th><th>ค่า</th><th>สถานะข้อมูล</th></tr></thead><tbody>
        <tr><td>น้ำหนักคอนกรีต γ / แบบหล่อ / น้ำหนักจร</td><td>{x.gamma} kN/m³ / {x.formDead} kPa / {x.liveLoad} kPa{x.motorized ? ' (มีรถเข็นติดเครื่องยนต์)' : ''}</td><td>สมมติฐานโครงการ · ขั้นต่ำตาม ACI §4.2.1</td></tr>
        <tr><td>ไม้อัด</td><td>{x.plywood} mm · {PLYWOOD_GRADE_LABEL[x.plywoodGrade]}</td><td>{x.plywoodGrade === 'CUSTOM' ? 'ผู้ใช้กำหนด ต้องมีใบรับรอง' : 'APA V345 ตาราง 12–13'}</td></tr>
        <tr><td>คร่าว / คานรับ</td><td>{r.joist.name} / {x.bearerCount > 1 ? '2×' : ''}{r.bearer.name}</td><td>ตารางเหล็ก มอก. / ว.ส.ท. ต้องยืนยันใบรับรอง</td></tr>
        <tr><td>เหล็ก Fy / E / Ωb / Ωv</td><td>{x.steelFy} / {x.steelE} MPa / {x.steelOmegaB} / {x.steelOmegaShear}</td><td>AISC 360 ASD (คัดกรอง)</td></tr>
        <tr><td>ค้ำยัน SWL</td><td>{x.shoreSWL > 0 ? `${x.shoreSWL} kN · ${x.shoreReference || 'ไม่ระบุแหล่ง'}` : 'ยังไม่ระบุ'}</td><td>{x.shoreSWL > 0 ? 'ค่าผู้ผลิต' : 'ยังไม่ครบ'}</td></tr>
        <tr><td>เกณฑ์การโก่ง</td><td>L/{x.deflectionRatio}</td><td>เกณฑ์โครงการ</td></tr>
      </tbody></table></section>
    <section className="rp-sec"><h2>2. {SECTIONS[1]}</h2>
      <div className="rp-two">
        <Fig no={1} w={150} h={110} caption="รูปตัด A-A (SF-02)"><SlabSectionView r={r} axis="X" box={{x: 0, y: 0, w: 150, h: 110}} titled={false}/></Fig>
        <Fig no={2} w={150} h={110} caption="รูปตัด B-B (SF-02)"><SlabSectionView r={r} axis="Y" box={{x: 0, y: 0, w: 150, h: 110}} titled={false}/></Fig>
      </div>
      <p>คร่าว {r.joists.length} ตัว @ {n(sj, 0)} mm (ตามแนว X) · คานรับ {r.bearers.length} แนว @ {n(sb, 0)} mm (ตามแนว Y) · ค้ำยัน {r.shores.length} × {r.bearers.length} = {r.shoreCount} ต้น @ {n(ss, 0)} mm · ความยาวค้ำยันใช้งาน ≈ {n(r.shoreLength, 0)} mm (ระยะเท่ากันไม่เกินค่าที่กำหนด)</p></section>
    <section className="rp-sec"><h2>3. {SECTIONS[2]}</h2>
      <div className="rp-check rp-derive"><ol className="rp-steps">{r.loads.steps.map((t, i) => <li key={i}><div className="equation">{t}</div></li>)}</ol>
        <p className="rp-note">อ้างอิง ACI PRC-347-14(21) §4.2.1 · แบบพื้นไม่มีแรงดันคอนกรีตสดด้านข้าง · แรงด้านข้าง §4.2.3.2 ตรวจในข้อ 5.1</p></div></section>
    <section className="rp-sec"><h2>4. {SECTIONS[3]}</h2>
      <CheckSections groups={numbered.groups} section="4" figs={{
        '4.1': <Fig no={3} w={150} h={68} caption={`ไม้อัดแถบ 1 m พาดระหว่างคร่าว @ ${n(sj, 0)} mm (${r.plywood.spans === 1 ? 'ช่วงเดี่ยว' : `ต่อเนื่อง ${r.plywood.spans} ช่วง ตาม APA V345`}) · รับได้ ${n(r.plywood.allowablePressure, 1)} kPa`}><BeamDiagram L={sj} w={r.loads.q} title="ไม้อัดแถบ 1 m"/></Fig>,
        '4.2': <Fig no={4} w={150} h={68} caption={`คร่าวพาดระหว่างคานรับ @ ${n(sb, 0)} mm`}><BeamDiagram L={sb} w={r.joistLine} title={`คร่าว ${r.joist.name}`}/></Fig>,
        '4.3': <Fig no={5} w={150} h={68} caption={`คานรับพาดระหว่างค้ำยัน @ ${n(ss, 0)} mm`}><BeamDiagram L={ss} w={r.bearerLine} title={`คานรับ ${r.bearer.name}`}/></Fig>,
      }}/></section>
    <section className="rp-sec"><h2>5. {SECTIONS[4]}</h2>
      <p>แรงด้านข้างตาม ACI §4.2.3.2 ต่อความยาวขอบ: แนว X {n(r.lateralX, 3)} kN/m · แนว Y {n(r.lateralY, 3)} kN/m ต้องส่งเข้าค้ำยันทแยง/ledger ของนั่งร้าน ยังไม่มีค่ากำลังในระบบนี้</p>
      <CheckSections groups={numbered.groups} section="5"/></section>
    <section className="rp-sec"><h2>6. {SECTIONS[5]}</h2>
      <SummaryTable items={numbered.ordered}/>
      <p><b>สรุป:</b> {fails.length ? `มี ${fails.length} รายการเกินเกณฑ์คัดกรอง ต้องปรับแก้ก่อนใช้งาน` : 'ไม่มีรายการเกินเกณฑ์คัดกรอง'} · สถานะรวม {r.status} (ยังไม่ใช่การอนุมัติก่อสร้าง)</p>
      <h3>ระยะสูงสุดที่ไม่เกินเกณฑ์ (คำนวณซ้ำ ไม่เปลี่ยนหน้าตัด)</h3>
      <ul>{advice.map(a => <li key={a.key}>{a.label}: ใช้อยู่ {a.current} mm → สูงสุด {a.max === null ? 'ไม่มีระยะที่ผ่าน ต้องเปลี่ยนหน้าตัด' : a.max + ' mm'}{a.unchecked.length ? ` (ยังไม่รวม ${a.unchecked.join(', ')} เพราะไม่มีค่ากำลัง)` : ''}</li>)}</ul></section>
    <section className="rp-sec"><h2>7. {SECTIONS[6]}</h2>
      <table className="rp-tab"><thead><tr><th>#</th><th>รายการ</th><th>ขนาด / สเปก</th><th>จำนวน</th><th>หน่วย</th><th>หมายเหตุ</th></tr></thead>
        <tbody>{r.quantities.map((q, i) => <tr key={i}><td>{i + 1}</td><td>{q.item}</td><td>{q.spec}</td><td>{q.qty}</td><td>{q.unit}</td><td>{q.note}</td></tr>)}</tbody></table>
      <p>ปริมาตรคอนกรีตพื้น {n(r.volume, 3)} m³</p></section>
    <section className="rp-sec"><h2>8. {SECTIONS[7]}</h2><ol>{[...r.blockers, ...slabNotes(r).slice(5)].map((b, i) => <li key={i}>{b}</li>)}</ol></section>
    <section className="rp-sec"><h2>9. {SECTIONS[8]}</h2><ReportReferences extra={[<li key="reshore">ACI PRC-347-14(21) §4.5 — การค้ำซ้ำ (reshoring) ยังไม่คำนวณในระบบนี้</li>]}/>
      <div className="signature"><span>ออกแบบ: {tb.designedBy || '__________________'}</span><span>ตรวจ: {tb.checkedBy || '__________________'}</span><span>อนุมัติ: {tb.approvedBy || '__________________'}</span></div>
      <footer>{docNo} · Rev {tb.rev} · CMG · DRAFT / NOT FOR CONSTRUCTION</footer></section>
  </article>;
}
