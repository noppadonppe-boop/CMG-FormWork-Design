import {useMemo, type ReactElement} from 'react';
import {ACI_BRACING_REFERENCE, wallAdvice, type WallResult} from '../domain/wall';
import {ACI_REFERENCE} from '../domain/pressure';
import {PLYWOOD_GRADE_LABEL} from '../domain/plywoodGrades';
import type {TitleBlock} from '../domain/titleBlock';
import {Table, Txt} from '../drawing/primitives';
import {NoteBlock} from '../drawing/views';
import {WallElevationView, WallPlanView, WallSectionView} from '../drawing/wallViews';
import {A3Set, RevisionTable} from './DrawingSet';
import {BeamDiagram, CheckCard, Fig, PressureDiagram, RatioBar} from './CalcReport';
import {ReportCover} from './BeamDocs';

const n = (v: number | null, d = 2) => v === null ? '—' : v.toLocaleString('en-US', {minimumFractionDigits: d, maximumFractionDigits: d});
const sp = (L: number, list: number[]) => L / (list.length - 1);

export function wallNotes(r: WallResult) {
  const x = r.input, pm = r.pressureModel;
  return [
    'หน่วยเป็นมิลลิเมตร เว้นแต่ระบุเป็นอื่น ห้ามวัดขนาดจากแบบ ให้ใช้ตัวเลขที่ระบุ',
    `แบบชุดนี้สร้างจากผลคัดกรองเบื้องต้น (${r.engineVersion}) สถานะ ${r.status}${x.confirmed ? '' : ' และยังไม่ยืนยันมิติจากแบบต้นฉบับ'} ห้ามใช้ก่อสร้างจนกว่าวิศวกรตรวจและอนุมัติ`,
    pm.method === 'ACI347' ? `แรงดันคอนกรีตสดตาม ACI PRC-347-14(21) สมการ ${pm.equation}: pmax = ${n(pm.pmax, 1)} kPa (เทไม่เร็วกว่า ${x.pourRate} m/h, T ${x.concreteTemp} °C)` : `แรงดันคอนกรีตสดแบบของเหลว ρgh = ${n(pm.pmax, 1)} kPa เทจากด้านบน`,
    r.strongback ? `แบบด้านเดียว: strongback ${r.strongback.name} ที่ทุกสถานีค้ำยัน · พุกฐานรับแรงยก ${n(r.anchorUplift)} kN/สถานี ${x.anchorSWL > 0 ? `(SWL ${x.anchorSWL} kN)` : '· ต้องใช้พุกที่มี SWL รับรอง'}`
      : `Tie รับ ${n(r.tieForce)} kN/ตัว ${x.tieSWL > 0 ? `(SWL ${x.tieSWL} kN)` : '· ต้องใช้ชุด Tie ที่มี SWL รับรองจากผู้ผลิต'}`,
    `ค้ำยันเอียงรับ ${n(r.braceForce)} kN/ตัว (${r.braceGoverning}) ${x.braceSWL > 0 ? `SWL ${x.braceSWL} kN ${x.braceReference}` : '· ต้องเลือกรุ่นที่มี SWL รับรอง'}`,
    'ต้องมีชุดยึดมุม/ปลายผนัง และ Tie มุมตามรายละเอียดผู้ผลิต รอยต่อแผ่นและคานคู่ต้องอยู่เหนือจุดรองรับ',
    'ตรวจแนว ดิ่ง และความแน่นของแบบหล่อทุกครั้งก่อนเท ห้ามเทเร็วกว่าอัตราที่ใช้ออกแบบ',
  ];
}

export function WallDrawingSet({r, project, code, caseName, titleBlock, canEdit, onTitleBlockChange}: {r: WallResult; project: string; code: string; caseName: string;
  titleBlock: TitleBlock; canEdit: boolean; onTitleBlockChange: (tb: TitleBlock) => void}) {
  const x = r.input;
  const sheets = [
    {code: 'WF-01', title: 'รูปด้านแบบหล่อผนัง', body: <>
      <WallElevationView r={r} box={{x: 23, y: 24, w: 274, h: 222}}/>
      <line x1={300} y1={24} x2={300} y2={246} stroke="#111" strokeWidth={0.1} strokeDasharray="4 1.5"/>
      <NoteBlock x={304} y={26} w={102} title="หมายเหตุทั่วไป (GENERAL NOTES)" items={wallNotes(r)} s={2}/>
      <RevisionTable x={304} y={205} tb={titleBlock}/>
    </>},
    {code: 'WF-02', title: 'รูปตัดและแปลนแบบหล่อผนัง', body: <>
      <WallSectionView r={r} box={{x: 23, y: 24, w: 230, h: 222}}/>
      <line x1={256} y1={24} x2={256} y2={246} stroke="#111" strokeWidth={0.1} strokeDasharray="4 1.5"/>
      <WallPlanView r={r} box={{x: 258, y: 24, w: 149, h: 110}}/>
    </>},
    {code: 'WF-03', title: 'ตารางวัสดุและข้อมูลออกแบบ', body: <>
      <Table x={23} y={24} title="ตารางวัสดุ (BILL OF MATERIALS)" rh={6} s={2.2}
        cols={[{t: 'ลำดับ', w: 11, a: 'middle'}, {t: 'รายการ', w: 60}, {t: 'ขนาด / สเปก', w: 70}, {t: 'จำนวน', w: 18, a: 'end'}, {t: 'หน่วย', w: 14, a: 'middle'}, {t: 'หมายเหตุ', w: 211}]}
        rows={r.quantities.map((q, i) => [String(i + 1), q.item, q.spec, String(q.qty), q.unit, q.note])}/>
      <Table x={23} y={76} title="ข้อมูลออกแบบ (DESIGN DATA)" rh={5.4} s={2.1} cols={[{t: 'รายการ', w: 50}, {t: 'ค่า', w: 70}]} rows={[
        ['ผนัง ยาว × หนา × สูงเท', `${x.length} × ${x.t} × ${x.height} mm`], ['แรงดันสูงสุด pmax', `${n(r.pressureModel.pmax, 1)} kPa`],
        ['ไม้อัด', `${x.plywood} mm · ${PLYWOOD_GRADE_LABEL[x.plywoodGrade]}`], ['คร่าว / ระยะ', `${r.stud.name} @ ${n(sp(x.length, r.studs), 0)}`],
        ['คานคู่ / ระยะ', `2×${r.waler.name} @ ${n(sp(x.height, r.levels), 0)}`], r.strongback ? ['Strongback / พุก', `${x.strongbackCount > 1 ? '2×' : ''}${r.strongback.name} · พุก SWL ${x.anchorSWL || '—'} kN`] : ['Tie / ระยะ', `Ø${x.tieDiameter} @ ${n(sp(x.length, r.ties), 0)} · SWL ${x.tieSWL || '—'} kN`],
        ['ค้ำยัน', `@ ${n(sp(x.length, r.braces), 0)} · hb ${x.braceHeight} · ${x.braceAngle}° · SWL ${x.braceSWL || '—'} kN`], ['สถานะระบบ', `${r.status} · ${r.engineVersion}`],
      ]}/>
      <Table x={146} y={76} title="สรุปผลตรวจคัดกรอง (CHECK SUMMARY)" rh={5.4} s={2} cols={[{t: 'รายการ', w: 78}, {t: 'ผล', w: 28, a: 'end'}, {t: 'เกณฑ์', w: 28, a: 'end'}, {t: 'Ratio', w: 15, a: 'end'}, {t: 'สถานะ', w: 22, a: 'middle'}]}
        rows={r.checks.map(c => [c.label, `${n(c.demand)} ${c.unit}`, c.limit === null ? 'ยังไม่ทราบ' : `${n(c.limit)} ${c.unit}`, n(c.utilization), c.status])}/>
      <NoteBlock x={322} y={76} w={85} title="รายการที่ยังขาด" items={r.blockers} s={1.8}/>
      <Txt x={23} y={244} s={2} fill="#444">INCOMPLETE = ไม่เกินเกณฑ์คัดกรองแต่ยังขาดการตรวจหรือข้อมูลรับรอง · FAIL = เกินเกณฑ์</Txt>
    </>},
  ];
  return <A3Set sheets={sheets} project={project} code={code} caseName={caseName} elementLabel="แบบหล่อผนัง" confirmed={x.confirmed} titleBlock={titleBlock} canEdit={canEdit} onTitleBlockChange={onTitleBlockChange}/>;
}

const SECTIONS = ['ขอบเขตและเกณฑ์การออกแบบ', 'การจัดวางแบบหล่อ', 'แรงดันคอนกรีตสด', 'การตรวจสอบองค์อาคาร', 'ค้ำยันและเสถียรภาพ', 'สรุปผลและคำแนะนำ', 'ปริมาณวัสดุ', 'ข้อจำกัดและรายการที่ยังขาด', 'เอกสารอ้างอิง'];

export function WallReport({r, project, code, caseName, caseId, titleBlock: tb}: {r: WallResult; project: string; code: string; caseName: string; caseId: string; titleBlock: TitleBlock}) {
  const x = r.input, pm = r.pressureModel, advice = useMemo(() => wallAdvice(x), [x]), fails = r.checks.filter(c => c.status === 'FAIL');
  const docNo = `CAL-${code || 'CMG'}-${caseId.replace(/[^\w]/g, '').slice(0, 6).toUpperCase()}`, st = sp(x.length, r.studs), sw = sp(x.height, r.levels), stt = r.ties.length ? sp(x.length, r.ties) : 0, walerSpan = r.strongback ? sp(x.length, r.braces) : stt;
  const group = (no: string, title: string, prefixes: string[], fig?: ReactElement) => <div className="rp-group" key={no}><h3>{no} {title}</h3>{fig}
    {r.checks.filter(c => prefixes.some(p => c.id.startsWith(p))).map((c, i) => <CheckCard key={c.id} c={c} no={`${no}.${i + 1}`}/>)}</div>;
  return <article className="calc-report">
    <ReportCover title="รายการคำนวณออกแบบแบบหล่อผนัง" subtitle="WALL FORMWORK DESIGN CALCULATION" project={project} code={code} element={`${caseName} · แบบหล่อผนัง (${r.strongback ? 'ด้านเดียว' : 'สองด้าน'})`} docNo={docNo}
      size={`ยาว ${x.length} × หนา ${x.t} × สูงเท ${x.height} mm`} status={r.status} fails={fails.length} sheets="WF-01 ถึง WF-03 (A3)" tb={tb} sections={SECTIONS}
      figure={<Fig w={190} h={120} caption="รูปตัดแบบหล่อผนัง (อ้างอิงแบบ WF-02)"><WallSectionView r={r} box={{x: 0, y: 0, w: 190, h: 120}} titled={false}/></Fig>}/>
    <section className="rp-sec"><h2>1. {SECTIONS[0]}</h2>
      <p>รายการคำนวณนี้คัดกรองแบบหล่อผนัง{r.strongback ? 'ด้านเดียว (เทชนดิน/ผนังเดิม)' : 'สองด้าน'}ด้วยวิธียืดหยุ่นเบื้องต้น (engine {r.engineVersion}) เส้นทางแรง: แรงดันคอนกรีตสด → ไม้อัด (คานต่อเนื่องตาม APA V345) → คร่าวแนวตั้ง → คานคู่แนวนอน → {r.strongback ? 'strongback แนวตั้ง (ฐานเป็นจุดหมุน รองรับที่ค้ำยัน) → ค้ำยันเอียงและพุกฐาน รวมแรงด้านข้างตาม ACI §4.2.3' : 'Tie ทะลุผนัง และแรงด้านข้างตาม ACI §4.2.3 → ค้ำยันเอียง'} คร่าวและคานคู่เป็นคานช่วงเดี่ยวภายใต้แรงดันสูงสุดคงที่ ผลลัพธ์ใช้คัดกรองเท่านั้น</p>
      <table className="rp-tab"><thead><tr><th>รายการ</th><th>ค่า</th><th>สถานะข้อมูล</th></tr></thead><tbody>
        <tr><td>น้ำหนักคอนกรีต γ</td><td>{x.gamma} kN/m³ (ρ = {n(pm.rho, 0)} kg/m³)</td><td>สมมติฐานโครงการ</td></tr>
        <tr><td>แรงดันด้านข้าง</td><td>{pm.method === 'ACI347' ? `ACI PRC-347-14(21) · R ${x.pourRate} m/h · T ${x.concreteTemp} °C · ยุบตัว ${x.slump} mm · Cc ${x.chemistryCc}` : 'แรงดันของเหลว ρgh เต็มความสูง'}</td><td>{pm.method === 'ACI347' ? 'ต้องยืนยันวิธีเทหน้างาน' : 'ปลอดภัยเสมอ'}</td></tr>
        <tr><td>ไม้อัด</td><td>{x.plywood} mm · {PLYWOOD_GRADE_LABEL[x.plywoodGrade]}</td><td>{x.plywoodGrade === 'CUSTOM' ? 'ผู้ใช้กำหนด ต้องมีใบรับรอง' : 'APA V345 ตาราง 12–13'}</td></tr>
        <tr><td>คร่าว / คานคู่</td><td>{r.stud.name} / 2×{r.waler.name}</td><td>ตารางเหล็ก มอก. / ว.ส.ท. ต้องยืนยันใบรับรอง</td></tr>
        {r.strongback ? <tr><td>Strongback / พุกฐาน</td><td>{x.strongbackCount > 1 ? '2×' : ''}{r.strongback.name} · พุก SWL {x.anchorSWL > 0 ? x.anchorSWL + ' kN' : 'ยังไม่ระบุ'}</td><td>{x.anchorSWL > 0 ? 'ค่าผู้ผลิต' : 'ยังไม่ครบ'}</td></tr>
          : <tr><td>Tie</td><td>Ø{x.tieDiameter} · Fy {x.tieFy} MPa · Ω {x.tieOmega} · SWL {x.tieSWL > 0 ? x.tieSWL + ' kN' : 'ยังไม่ระบุ'}</td><td>{x.tieSWL > 0 ? 'ค่าผู้ผลิต' : 'ยังไม่ครบ'}</td></tr>}
        <tr><td>ค้ำยันเอียง</td><td>@ {n(sp(x.length, r.braces), 0)} mm · hb {x.braceHeight} mm · {x.braceAngle}° · SWL {x.braceSWL > 0 ? x.braceSWL + ' kN' : 'ยังไม่ระบุ'}</td><td>{x.braceSWL > 0 ? 'ค่าผู้ผลิต' : 'ยังไม่ครบ'}</td></tr>
        <tr><td>เหล็ก Fy / E / Ωb / Ωv · เกณฑ์โก่ง</td><td>{x.steelFy} / {x.steelE} MPa / {x.steelOmegaB} / {x.steelOmegaShear} · L/{x.deflectionRatio}</td><td>AISC 360 ASD (คัดกรอง)</td></tr>
      </tbody></table></section>
    <section className="rp-sec"><h2>2. {SECTIONS[1]}</h2>
      <div className="rp-two">
        <Fig no={1} w={150} h={110} caption="รูปด้านแบบหล่อผนัง (WF-01)"><WallElevationView r={r} box={{x: 0, y: 0, w: 150, h: 110}} titled={false}/></Fig>
        <Fig no={2} w={150} h={110} caption="แปลนที่ระดับคานคู่ (WF-02)"><WallPlanView r={r} box={{x: 0, y: 0, w: 150, h: 110}} titled={false}/></Fig>
      </div>
      <p>คร่าว {r.studs.length} ตัว/ด้าน @ {n(st, 0)} mm · คานคู่ {r.levels.length} ระดับ @ {n(sw, 0)} mm · {r.strongback ? `strongback ${r.braces.length} สถานี` : `Tie ${r.ties.length} ตัว/ระดับ @ ${n(stt, 0)} mm (รวม ${r.ties.length * r.levels.length} ชุด)`} · ค้ำยัน {r.braces.length} ตัว (ระยะเท่ากันไม่เกินค่าที่กำหนด)</p></section>
    <section className="rp-sec"><h2>3. {SECTIONS[2]}</h2>
      <p>{pm.method === 'ACI347' ? <>ตาม {ACI_REFERENCE}</> : <>ใช้แรงดันแบบของเหลว p = ρgh ตลอดความสูงเท</>}</p>
      <div className="rp-check rp-derive"><ol className="rp-steps">{pm.steps.map((t, i) => <li key={i}><div className="equation">{t}</div></li>)}
        <li><div className="equation">แรงลัพธ์ต่อเมตรของผนัง F = ½ρg·hcap² + pmax(H − hcap) = <b>{n(pm.forcePerM, 2)} kN/m</b></div></li></ol><p className="rp-note">{pm.reason}</p></div>
      <Fig no={3} w={175} h={100} caption="การกระจายแรงดันคอนกรีตสดและค่าที่ใช้ตรวจสมาชิก"><PressureDiagram m={pm}/></Fig></section>
    <section className="rp-sec"><h2>4. {SECTIONS[3]}</h2>
      {group('4.1', 'ไม้อัด', ['ply-'], <Fig no={4} w={150} h={68} caption={`ไม้อัดแถบ 1 m พาดระหว่างคร่าว @ ${n(st, 0)} mm (${r.plywood.spans === 1 ? 'ช่วงเดี่ยว' : `ต่อเนื่อง ${r.plywood.spans} ช่วง ตาม APA V345`}) · รับได้ ${n(r.plywood.allowablePressure, 1)} kPa`}><BeamDiagram L={st} w={pm.pmax} title="ไม้อัดแถบ 1 m"/></Fig>)}
      {group('4.2', 'คร่าว (แนวตั้ง)', ['stud-'], <Fig no={5} w={150} h={68} caption={`คร่าวพาดระหว่างคานคู่ @ ${n(sw, 0)} mm`}><BeamDiagram L={sw} w={r.studLine} title={`คร่าว ${r.stud.name}`}/></Fig>)}
      {group('4.3', 'คานคู่ (แนวนอน)', ['waler-'], <Fig no={6} w={150} h={68} caption={`คานคู่พาดระหว่าง${r.strongback ? ' strongback' : ' Tie'} @ ${n(walerSpan, 0)} mm (แบ่งแรงสองตัว)`}><BeamDiagram L={walerSpan} w={r.walerLine} title={`คานคู่ 2×${r.waler.name}`}/></Fig>)}
      {r.strongback ? group('4.4', 'Strongback และพุกฐาน', ['strongback', 'anchor']) : group('4.4', 'Tie ทะลุผนัง', ['tie-'])}</section>
    <section className="rp-sec"><h2>5. {SECTIONS[4]}</h2>
      <p>ตาม {ACI_BRACING_REFERENCE}: โมเมนต์พลิกต่อเมตร M = max(1.5 kN/m × H, 0.72 kPa × H²/2) = {n(r.braceMoment, 3)} kN·m/m ({r.braceGoverning}) ฐานแบบถือเป็นจุดหมุน</p>
      {group('5.1', 'ค้ำยันเอียง', ['brace-'])}</section>
    <section className="rp-sec"><h2>6. {SECTIONS[5]}</h2>
      <table className="rp-tab"><thead><tr><th>รายการ</th><th>ค่าที่เกิด</th><th>เกณฑ์</th><th>อัตราส่วน</th><th/><th>สถานะ</th></tr></thead>
        <tbody>{r.checks.map(c => <tr key={c.id}><td>{c.label}</td><td>{n(c.demand)} {c.unit}</td><td>{c.limit === null ? 'ยังไม่ทราบ' : `${n(c.limit)} ${c.unit}`}</td><td>{n(c.utilization, 3)}</td><td><RatioBar ratio={c.utilization}/></td><td>{c.status}</td></tr>)}</tbody></table>
      <p><b>สรุป:</b> {fails.length ? `มี ${fails.length} รายการเกินเกณฑ์คัดกรอง ต้องปรับแก้ก่อนใช้งาน` : 'ไม่มีรายการเกินเกณฑ์คัดกรอง'} · สถานะรวม {r.status} (ยังไม่ใช่การอนุมัติก่อสร้าง)</p>
      <h3>ระยะสูงสุดที่ไม่เกินเกณฑ์ (คำนวณซ้ำ ไม่เปลี่ยนหน้าตัด)</h3>
      <ul>{advice.map(a => <li key={a.key}>{a.label}: ใช้อยู่ {a.current} mm → สูงสุด {a.max === null ? 'ไม่มีระยะที่ผ่าน ต้องเปลี่ยนหน้าตัด' : a.max + ' mm'}{a.unchecked.length ? ` (ยังไม่รวม ${a.unchecked.join(', ')} เพราะไม่มีค่ากำลัง)` : ''}</li>)}</ul></section>
    <section className="rp-sec"><h2>7. {SECTIONS[6]}</h2>
      <table className="rp-tab"><thead><tr><th>#</th><th>รายการ</th><th>ขนาด / สเปก</th><th>จำนวน</th><th>หน่วย</th><th>หมายเหตุ</th></tr></thead>
        <tbody>{r.quantities.map((q, i) => <tr key={i}><td>{i + 1}</td><td>{q.item}</td><td>{q.spec}</td><td>{q.qty}</td><td>{q.unit}</td><td>{q.note}</td></tr>)}</tbody></table>
      <p>ปริมาตรคอนกรีตผนัง {n(r.volume, 3)} m³ · พื้นที่แบบหล่อ {n(r.formArea)} m²</p></section>
    <section className="rp-sec"><h2>8. {SECTIONS[7]}</h2><ol>{[...r.blockers, ...wallNotes(r).slice(5)].map((b, i) => <li key={i}>{b}</li>)}</ol></section>
    <section className="rp-sec"><h2>9. {SECTIONS[8]}</h2><ol>
      <li>ACI PRC-347-14(21) Guide to Formwork for Concrete — §4.2.2 แรงดันด้านข้าง, §4.2.3 แรงด้านข้างและลม, Table 4.4 ส่วนปลอดภัยอุปกรณ์</li>
      <li>APA Concrete Forming Design/Construction Guide V345 (2012) — ไม้อัดคานต่อเนื่อง ตาราง 12–13</li>
      <li>มอก. 107-2566 / มอก. 1227-2558 / มอก. 1228 — ตารางหน้าตัดเหล็ก · มอก. 24 — เหล็กข้ออ้อย (Tie)</li>
      <li>หนังสือ Design Form Work ตาราง 3.4 (อ้าง ว.ส.ท.) — หน่วยแรงที่ยอมให้ของไม้</li>
      <li>AISC 360 (ASD) — ตัวหารกำลัง Ωb, Ωv สำหรับการคัดกรองหน่วยแรง</li>
    </ol>
      <div className="signature"><span>ออกแบบ: {tb.designedBy || '__________________'}</span><span>ตรวจ: {tb.checkedBy || '__________________'}</span><span>อนุมัติ: {tb.approvedBy || '__________________'}</span></div>
      <footer>{docNo} · Rev {tb.rev} · CMG · DRAFT / NOT FOR CONSTRUCTION</footer></section>
  </article>;
}
