import {SCREEN_LEGEND, legacyCheckGroups, numberChecks, summaryRows} from '../domain/reportOutline';
import {PLYWOOD_GRADE_LABEL} from '../domain/plywoodGrades';
import {useEffect, useMemo, useRef, useState, type ReactElement} from 'react';
import {Download, Printer} from 'lucide-react';
import {usesTies, type Result} from '../domain';
import {buildFormworkLayout, type FormworkLayout} from '../domain/formworkLayout';
import {buildScene, type Scene} from '../domain/scene';
import {svgToDxf} from '../drawing/svgDxf';
import {ReportLangContext, translate, type ReportLang, type StudTerm} from '../i18n/reportLang';
import {DRAW_AREA, LW, Sheet, Table, Txt, type TitleInfo} from '../drawing/primitives';
import {today, type DesignRevisionBinding, type TitleBlock} from '../domain/titleBlock';
import {CornerDetail, ElevationView, IsoView, Legend, MemberSections, NoteBlock, PlanView, SectionView, TieDetail} from '../drawing/views';

type Ctx = {L: FormworkLayout; r: Result; scene: Scene; tb: TitleBlock};
export function RevisionTable({x, y, tb, w = 102}: {x: number; y: number; tb: TitleBlock; w?: number}) {
  return <Table x={x} y={y} title="ประวัติการแก้ไข (REVISIONS)" rh={4.6} s={1.8} cols={[{t: 'Rev', w: 10, a: 'middle'}, {t: 'วันที่', w: 20, a: 'middle'}, {t: 'รายละเอียด', w: w - 30}]}
    rows={(tb.revisions.length ? tb.revisions : [{rev: tb.rev, date: tb.date, description: '—'}]).slice(-6).map(e => [e.rev, e.date, e.description])}/>;
}
const n2 = (v: number | null, d = 2) => v === null ? '—' : v.toLocaleString('en-US', {maximumFractionDigits: d, minimumFractionDigits: d});

export function generalNotes(L: FormworkLayout, r: Result) {
  return [
    'หน่วยเป็นมิลลิเมตร เว้นแต่ระบุเป็นอื่น ห้ามวัดขนาดจากแบบ ให้ใช้ตัวเลขที่ระบุ',
    `แบบชุดนี้สร้างจากผลคัดกรองเบื้องต้น (${r.engineVersion}) สถานะ ${r.status}${L.confirmed ? '' : ' และยังไม่ยืนยันมิติจากแบบต้นฉบับ'} ห้ามใช้ก่อสร้างจนกว่าวิศวกรตรวจและอนุมัติ`,
    r.pressureModel.method === 'ACI347' ? `แรงดันคอนกรีตสดตาม ACI PRC-347-14(21) สมการ ${r.pressureModel.equation}: pmax = ${n2(L.pressure, 1)} kPa (R ${r.input.pourRate} m/h, T ${r.input.concreteTemp} °C, ยุบตัว ${r.input.slump} mm) ห้ามเทเร็วกว่านี้ ไม่รวมแรงกระแทกหรือการปั๊มจากด้านล่าง`
      : `แรงดันคอนกรีตสดแบบของเหลว p = ρgh = ${n2(L.pressure, 1)} kPa สมมติเทจากด้านบน ไม่รวมแรงกระแทกหรือการปั๊มจากด้านล่าง`,
    `คุณสมบัติวัสดุเป็นค่าอ้างอิงเบื้องต้น (ไม้อัด: ${r.plywood.grade === 'CUSTOM' ? 'ค่าผู้ใช้กำหนด' : 'APA V345'} · เหล็ก Fy ${r.input.steelFy} MPa) ต้องยืนยันด้วยใบรับรองวัสดุจริงก่อนใช้งาน`,
    'ระยะคร่าว คานคู่ และ Tie แบ่งเท่ากันไม่เกินค่าที่กำหนด ตำแหน่งจริงต้องหลบเหล็กเสริมและงานระบบ',
    ...(usesTies(r.input) ? ['ความยาว Tie rod ในตารางยังไม่รวมเกลียว นอต และแผ่นรอง ต้องใช้ชุดที่มี SWL รับรองจากผู้ผลิต'] : ['ชุดรัดเสาต้องใช้อุปกรณ์มุมที่มีกำลังรับรองจากผู้ผลิต และขันแน่นตามระดับคานคู่ที่กำหนด']),
    'ค้ำยัน การยึดฐาน และเสถียรภาพโดยรวมยังไม่ได้ออกแบบในแบบชุดนี้',
    'ตรวจแนว ดิ่ง ระดับ และความแน่นของแบบหล่อทุกครั้งก่อนเทคอนกรีต',
    ...L.warnings,
  ];
}

function Divider({x1, y1, x2, y2}: {x1: number; y1: number; x2: number; y2: number}) {
  return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#111" strokeWidth={LW.hair} strokeDasharray="4 1.5"/>;
}
const SHEETS: {code: string; title: string; draw: (c: Ctx) => ReactElement}[] = [
  {code: 'FW-01', title: 'แปลนแบบหล่อ', draw: ({L, r, tb}) => <>
    <PlanView L={L} box={{x: DRAW_AREA.x, y: DRAW_AREA.y, w: 274, h: DRAW_AREA.h}}/>
    <Divider x1={300} y1={24} x2={300} y2={246}/>
    <Legend x={304} y={26}/>
    <NoteBlock x={304} y={70} w={102} title="หมายเหตุทั่วไป (GENERAL NOTES)" items={generalNotes(L, r)} s={2}/>
    <RevisionTable x={304} y={205} tb={tb}/>
  </>},
  {code: 'FW-02', title: 'รูปตัดและรูปด้าน', draw: ({L}) => <>
    <SectionView L={L} box={{x: DRAW_AREA.x, y: DRAW_AREA.y, w: 168, h: DRAW_AREA.h}}/>
    <Divider x1={194} y1={24} x2={194} y2={246}/>
    <ElevationView L={L} box={{x: 196, y: DRAW_AREA.y, w: 211, h: DRAW_AREA.h}}/>
  </>},
  {code: 'FW-03', title: 'รายละเอียดขยายและภาพ 3 มิติ', draw: ({L, scene}) => <>
    <TieDetail L={L} box={{x: 23, y: 24, w: 190, h: 110}}/>
    <CornerDetail L={L} box={{x: 217, y: 24, w: 190, h: 110}}/>
    <Divider x1={215} y1={24} x2={215} y2={246}/><Divider x1={23} y1={135} x2={407} y2={135}/>
    <MemberSections L={L} box={{x: 23, y: 136, w: 190, h: 110}}/>
    <IsoView scene={scene} box={{x: 217, y: 136, w: 190, h: 110}}/>
  </>},
  {code: 'FW-04', title: 'ตารางวัสดุและข้อมูลออกแบบ', draw: ({L, r}) => {
    const x = r.input;
    return <>
      <Table x={23} y={24} title="ตารางวัสดุ (BILL OF MATERIALS)" rh={6} s={2.2}
        cols={[{t: 'ลำดับ', w: 11, a: 'middle'}, {t: 'รายการ', w: 56}, {t: 'ขนาด / สเปก', w: 62}, {t: 'หน่วย', w: 14, a: 'middle'}, {t: 'จำนวน', w: 17, a: 'end'},
          {t: 'ยาวตัด (mm)', w: 22, a: 'end'}, {t: 'รวม', w: 44, a: 'end'}, {t: 'หมายเหตุ', w: 158}]}
        rows={L.bom.map((b, i) => [String(i + 1), b.item, b.spec, b.unit, b.qty === null ? '—' : b.qty.toLocaleString('en-US'), b.cutLength === null ? '—' : b.cutLength.toLocaleString('en-US'), b.total, b.remark])}/>
      <Table x={23} y={100} title="ข้อมูลออกแบบ (DESIGN DATA)" rh={5.4} s={2.1} cols={[{t: 'รายการ', w: 52}, {t: 'ค่า', w: 66}]} rows={[
        ['องค์อาคาร / รูปทรง', `${x.kind === 'COLUMN' ? 'เสา' : 'ฐานราก'} / ${x.shape === 'L' ? 'รูป L' : 'สี่เหลี่ยม'}${x.kind === 'COLUMN' ? (x.columnTies ? ' · Tie ทะลุเสา + วงรัดมุม' : ' · วงรัดภายนอก ไม่ใช้ Tie') : ''}`],
        ['ขนาด กว้าง × ยาว × สูง', `${x.width} × ${x.length} × ${x.height} mm`],
        ['น้ำหนักคอนกรีต γ', `${x.gamma} kN/m³`], ['แรงดันสูงสุด pmax', `${n2(r.pressure, 1)} kPa`],
        ['ไม้อัด t / E / Fb (ที่ใช้คำนวณ)', `${x.plywood} mm / ${n2(r.plywood.E, 0)} / ${n2(r.plywood.Fb)} MPa · ${PLYWOOD_GRADE_LABEL[r.plywood.grade]}`], ['เหล็ก Fy / E', `${x.steelFy} / ${x.steelE} MPa`],
        ['Ωb / Ωv / เกณฑ์โก่ง', `${x.steelOmegaB} / ${x.steelOmegaShear} / L/${x.deflectionRatio}`],
        ['ระยะคร่าว / คานคู่ / Tie (สูงสุด)', `${x.studSpacing} / ${x.walerSpacing} / ${x.tieSpacing} mm`],
        ['ยืนยันมิติจากต้นฉบับ', x.confirmed ? 'ยืนยันแล้ว' : 'ยังไม่ยืนยัน'], ['สถานะระบบ', `${r.status} · ${r.engineVersion}`],
      ]}/>
      <Table x={146} y={100} title="สรุปผลตรวจคัดกรอง (CHECK SUMMARY)" rh={5.4} s={2} cols={[{t: 'รายการ', w: 82}, {t: 'ผล', w: 30, a: 'end'}, {t: 'เกณฑ์', w: 30, a: 'end'}, {t: 'Ratio', w: 16, a: 'end'}, {t: 'สถานะ', w: 24, a: 'middle'}]}
        rows={summaryRows(numberChecks(legacyCheckGroups(x.kind, !!x.columnTies), r.checks).ordered, v => n2(v))}/>
      <NoteBlock x={334} y={100} w={73} title="รายการที่ยังขาด" items={r.blockers.length > 9 ? [...r.blockers.slice(0, 8), `และอีก ${r.blockers.length - 8} รายการ ดูรายการคำนวณ A4 ข้อ 8`] : r.blockers} s={1.8}/>
      <Txt x={146} y={100 + 6 + (r.checks.length + 1) * 5.4 + 5} s={2} fill="#444">{SCREEN_LEGEND}</Txt>
    </>;
  }},
];

export function DrawingSet({result, project, code, caseName, titleBlock: info, canEdit = true, onTitleBlockChange, revisionBinding, kitNote}: {result: Result; project: string; code: string; caseName: string; kitNote?: string | null; titleBlock: TitleBlock; canEdit?: boolean; onTitleBlockChange: (tb: TitleBlock) => void; revisionBinding?: DesignRevisionBinding}) {
  const base = useMemo(() => {try {return {L: buildFormworkLayout(result), r: result, scene: buildScene(result)};} catch {return null;}}, [result]);
  if (!base) return <div className="warning">ข้อมูลไม่ครบหรือไม่ถูกต้อง จึงสร้างแบบไม่ได้ · ตรวจมิติและระยะก่อน</div>;
  const ctx: Ctx = {...base, tb: info};
  return <A3Set sheets={SHEETS.map(s => ({code: s.code, title: s.title, body: s.draw(ctx)}))} project={project} code={code} caseName={caseName}
    elementLabel={ctx.L.kind === 'COLUMN' ? 'แบบหล่อเสา' : 'แบบหล่อฐานราก'} stud="Stud" confirmed={ctx.L.confirmed} titleBlock={info} canEdit={canEdit} onTitleBlockChange={onTitleBlockChange} revisionBinding={revisionBinding} kitNote={kitNote}/>;
}

const LANG_KEY = 'cmg-drawing-lang';
const DRAWING_LANGS: [ReportLang, string, string][] = [['th', 'ไทย', 'ภาษาไทย'], ['en', 'EN', 'English'], ['zh', '中文', '简体中文']];
function storedLang(): ReportLang {
  try {const v = localStorage.getItem(LANG_KEY); return v === 'en' || v === 'zh' ? v : 'th';} catch {return 'th';}
}
/** Drawing language for a sheet set (Thai / English / Chinese); the choice is remembered per viewer. */
export function DrawingLangSwitch({value, onChange}: {value: ReportLang; onChange: (v: ReportLang) => void}) {
  return <div className="report-variant drawing-lang" role="group" aria-label="ภาษาในแบบ / Drawing language / 图纸语言">
    {DRAWING_LANGS.map(([k, label, title]) => <button key={k} type="button" title={title} aria-pressed={value === k} onClick={() => onChange(k)}>{label}</button>)}
  </div>;
}

/** A3 sheet set with shared title block, revision log, SVG/DXF export, drawing language and A3 print controls.
 * `stud` names "คร่าว" in English/Chinese (Joist under soffits, Stud on side forms); user data (project, case, signers) stays as entered.
 * `languages={false}` keeps a set Thai-only (v0.7 books: their wording is not in `DRAWING_PHRASES`). */
export function A3Set({sheets, project, code, caseName, elementLabel, confirmed, titleBlock: info, canEdit = true, onTitleBlockChange, revisionBinding, kitNote, stud, languages = true}: {sheets: {code: string; title: string; body: ReactElement}[]; kitNote?: string | null; stud?: StudTerm; languages?: boolean;
  project: string; code: string; caseName: string; elementLabel: string; confirmed: boolean; titleBlock: TitleBlock; canEdit?: boolean; onTitleBlockChange: (tb: TitleBlock) => void; revisionBinding?: DesignRevisionBinding}) {
  const SHEETS = sheets;
  const [note, setNote] = useState(''), [chosen, setLangState] = useState<ReportLang>(storedLang), lang = languages ? chosen : 'th';
  const tr = useMemo(() => ({lang, stud, drawing: true}), [lang, stud]);
  function setLang(v: ReportLang) {setLangState(v); try {localStorage.setItem(LANG_KEY, v);} catch { /* private mode: keep for this view only */ }}
  const svgs = useRef<(SVGSVGElement | null)[]>([]);
  useEffect(() => () => document.body.classList.remove('print-a3'), []);
  const title: TitleInfo = {company: 'CMG ENGINEERING & CONSTRUCTION', project, code, caseName, elementLabel,
    rev: info.rev, date: info.date, designedBy: info.designedBy, drawnBy: info.drawnBy, checkedBy: info.checkedBy, approvedBy: info.approvedBy, ...(kitNote ? {kitNote} : {})};
  const nextRev = (r: string) => /^[A-Y]$/.test(r) ? String.fromCharCode(r.charCodeAt(0) + 1) : /^\d+$/.test(r) ? String(Number(r) + 1) : r + '1';
  function addRevision() {
    const rev = info.revisions.length ? nextRev(info.rev) : info.rev;
    onTitleBlockChange({...info, rev, date: today(), revisions: [...info.revisions, {rev, date: today(), description: note.trim().slice(0, 120)}].slice(-12)});
    setNote('');
  }
  const root = useRef<HTMLDivElement>(null);
  function print() {
    // Several sets can share the page (Project Example: construction set + installation book); print only this one.
    document.body.classList.add('print-a3'); root.current?.classList.add('print-target');
    const done = () => {document.body.classList.remove('print-a3'); root.current?.classList.remove('print-target'); window.removeEventListener('afterprint', done);};
    window.addEventListener('afterprint', done);
    window.print();
  }
  function save(i: number, ext: 'svg' | 'dxf') {
    const el = svgs.current[i]; if (!el) return;
    const blob = ext === 'svg' ? new Blob([new XMLSerializer().serializeToString(el)], {type: 'image/svg+xml'})
      : new Blob([svgToDxf(el, {title: `${SHEETS[i].code} ${translate(tr, SHEETS[i].title)}`, font: lang === 'zh' ? 'msyh.ttc' : 'tahoma.ttf'})], {type: 'application/dxf'});
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = `${code || 'CMG'}-${caseName.replace(/[^\w\u0E00-\u0E7F-]+/g, '_')}-${SHEETS[i].code}${lang === 'th' ? '' : '-' + lang.toUpperCase()}.${ext}`; a.click(); URL.revokeObjectURL(url);
  }
  const field = (k: 'rev' | 'date' | 'designedBy' | 'drawnBy' | 'checkedBy' | 'approvedBy', label: string) => <label className="field"><span>{label}</span><input value={info[k]} maxLength={40} disabled={!canEdit} onChange={e => onTitleBlockChange({...info, [k]: e.target.value})}/></label>;
  return <div className="a3-print-root" ref={root}>
    <section className="card a3-controls">
      <div className="card-title"><h3>ชุดแบบก่อสร้างแบบหล่อ A3 ({SHEETS.length} แผ่น)</h3>
        <div className="source-actions"><button className="btn secondary" title="ไฟล์ CAD (DXF R12) ขนาดกระดาษ 1:1 หน่วย mm" onClick={() => save(0, 'dxf')}><Download size={16}/>{SHEETS[0]?.code} {SHEETS[0]?.title} (.dxf)</button>
          <button className="btn" onClick={print}><Printer size={16}/>พิมพ์ / บันทึก PDF (A3)</button></div></div>
      <p className="muted">แบบสร้างจากข้อมูลเดียวกับรายการคำนวณ แก้มิติหรือระยะแล้วแบบจะอัปเดตทันที · ตอนพิมพ์ให้เลือกขนาดกระดาษ A3 แนวนอน และปิดหัว/ท้ายกระดาษของเบราว์เซอร์</p>
      {revisionBinding&&<p className="muted revision-binding">Design Revision: {revisionBinding.designRevision} · Review: {revisionBinding.reviewState} · hash: {revisionBinding.contentHash ? `${revisionBinding.contentHash.slice(0, 16)}…` : 'ยังไม่มี review hash'}</p>}
      <div className="form-grid four">{field('rev', 'แก้ไขครั้งที่ (Rev)')}{field('date', 'วันที่')}{field('designedBy', 'ออกแบบ')}{field('drawnBy', 'เขียนแบบ')}{field('checkedBy', 'ตรวจ')}{field('approvedBy', 'อนุมัติ')}</div>
      <div className="source-actions"><label className="field revision-note"><span>บันทึกการแก้ไขครั้งใหม่ (Rev ถัดไป)</span><input value={note} maxLength={120} disabled={!canEdit} placeholder="เช่น ปรับระยะคร่าวเป็น 250 mm ตามผลคำนวณ" onChange={e => setNote(e.target.value)}/></label>
        <button className="btn secondary" disabled={!canEdit || !note.trim()} onClick={addRevision}>เพิ่ม Rev</button></div>
      <p className="muted">ข้อมูลกรอบชื่อแบบและประวัติการแก้ไขบันทึกไปกับแบบนี้ในโครงการ และใช้ร่วมกับรายการคำนวณ</p>
      <div className="a3-index">{SHEETS.map((s, i) => <a key={s.code} href={`#sheet-${s.code}`}>{s.code} · {s.title}</a>)}</div>
      {!confirmed && <div className="warning">ยังไม่ยืนยันมิติจากแบบต้นฉบับ · แบบชุดนี้เป็นร่างเพื่อตรวจทานเท่านั้น</div>}
    </section>
    {SHEETS.map((s, i) => <div className="a3-page" id={`sheet-${s.code}`} key={s.code}>
      <div className="a3-toolbar"><b>{s.code} · {translate(tr, s.title)}</b>{languages && <DrawingLangSwitch value={lang} onChange={setLang}/>}<span className="source-actions"><button className="btn secondary" onClick={() => save(i, 'dxf')}><Download size={14}/>DXF</button>
        <button className="btn secondary" onClick={() => save(i, 'svg')}><Download size={14}/>SVG</button></span></div>
      <ReportLangContext.Provider value={tr}><Sheet no={i + 1} total={SHEETS.length} code={s.code} title={s.title} info={title} lang={lang} svgRef={el => {svgs.current[i] = el;}}>{s.body}</Sheet></ReportLangContext.Provider>
    </div>)}
  </div>;
}
