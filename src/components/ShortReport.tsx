import {Fragment, useMemo, type ReactNode} from 'react';
import type {Result} from '../domain';
import {buildFormworkLayout} from '../domain/formworkLayout';
import {adviseLayout} from '../domain/optimize';
import {slabAdvice, type SlabResult} from '../domain/slab';
import {beamAdvice, type BeamResult} from '../domain/beam';
import {wallAdvice, type WallResult} from '../domain/wall';
import {beamShortModel, checkKind, legacyShortModel, slabShortModel, verdict, VERDICT_LABEL, wallShortModel, type EqRow, type ShortMember, type ShortModel} from '../domain/shortReport';
import type {DesignRevisionBinding, TitleBlock} from '../domain/titleBlock';
import {Defs, Txt} from '../drawing/primitives';
import {PlanView, SectionView} from '../drawing/views';
import {SlabPlanView, SlabSectionView} from '../drawing/slabViews';
import {BeamElevationView, BeamSectionView, type Mapper} from '../drawing/beamViews';
import {WallElevationView, WallSectionView} from '../drawing/wallViews';
import {BeamDiagram, Fig, PressureDiagram} from './CalcReport';

const n = (v: number | null, d = 2) => v === null ? '—' : v.toLocaleString('en-US', {minimumFractionDigits: d, maximumFractionDigits: d});
const ratio = (v: number | null) => v === null ? '—' : n(v, 3);
const sp = (L: number, list: number[]) => L / (list.length - 1);
const mid = (list: number[]) => Math.max(0, Math.min(list.length - 2, Math.floor((list.length - 1) / 2)));
/** Governing-location colours, one per location number. */
export const TAG_COLOR: Record<string, string> = {1: '#d9822b', 2: '#2f9e64', 3: '#d64545', 4: '#7b52b8', 5: '#1f7fb8', 6: '#8a6d1f'};

/** Bare drawing (sheet mm) for a figure whose caption the report writes itself. */
const Svg = ({w, h, children}: {w: number; h: number; children: ReactNode}) => <svg className="sr-svg" viewBox={`0 0 ${w} ${h}`} role="img"><Defs/>{children}</svg>;

function Verdict({m}: {m: ShortMember}) {
  const v = verdict(m.governing);
  return <span className={'sr-st ' + v.toLowerCase()}>{VERDICT_LABEL[v]}</span>;
}
function Eq({rows}: {rows: EqRow[]}) {
  const labels = rows.some(r => r.label);
  return <table className="sr-eq"><tbody>{rows.map((r, i) => <tr key={i}>{labels && <td className="sr-eq-l">{r.label}</td>}<td className="sr-eq-o">{r.op ?? '='}</td>
    <td className="sr-eq-r">{r.strong ? <b>{r.expr}</b> : r.expr}</td><td className="sr-eq-ref">{r.ref}</td></tr>)}</tbody></table>;
}
/** Translucent tributary/critical zone with its plan tag, in view coordinates from a mapper. */
function Mark({P, x0, y0, x1, y1, tag}: {P: Mapper; x0: number; y0: number; x1: number; y1: number; tag: string}) {
  const [ax, ay] = P(x0, y0), [bx, by] = P(x1, y1), c = TAG_COLOR[tag] ?? '#555';
  const x = Math.min(ax, bx), y = Math.min(ay, by), w = Math.max(0.8, Math.abs(bx - ax)), h = Math.max(0.8, Math.abs(by - ay));
  return <g className="sr-mark"><rect x={x} y={y} width={w} height={h} fill={c} fillOpacity={0.3} stroke={c} strokeWidth={0.35} strokeDasharray="1.2 0.6"/>
    <circle cx={x + w} cy={y} r={2.4} fill="#fff" stroke={c} strokeWidth={0.4}/><Txt x={x + w} y={y + 0.9} s={2.6} a="middle" b fill={c}>{tag}</Txt></g>;
}

interface Props {model: ShortModel; project: string; code: string; caseName: string; caseId: string; titleBlock: TitleBlock; revisionBinding?: DesignRevisionBinding;
  section: ReactNode; sectionCaption: string; plan: ReactNode; planCaption: string}

/** A4 short calculation (textbook layout): design criteria → loads → governing members → derivation of each governing check → summary. */
export function ShortReport({model: M, project, code, caseName, caseId, titleBlock: tb, revisionBinding, section, sectionCaption, plan, planCaption}: Props) {
  const docNo = `CAL-${code || 'CMG'}-${caseId.replace(/[^\w]/g, '').slice(0, 6).toUpperCase()}-S`;
  const detailed = M.members.filter(m => m.governing), tagged = M.members.filter(m => m.tag);
  let fig = 2;
  const head = <div className="sr-head"><div><b>CMG FORMWORK</b><span>รายการคำนวณแบบย่อ</span></div>
    <div><span>โครงการ: <b>{project}</b>{code ? ` (${code})` : ''}</span><span>องค์อาคาร: <b>{caseName}</b></span></div>
    <div><span>เอกสาร: <b>{docNo}</b> Rev {tb.rev}</span><span>วันที่ {tb.date}</span></div></div>;
  return <article className="short-report">
    <section className="sr-page">
      {head}
      <div className="sr-title"><h1>{M.title}</h1><p>{M.subtitle} · {M.chain}</p></div>
      <table className="sr-info"><tbody>
        {[0, 2].map(i => <tr key={i}>{M.info.slice(i, i + 2).map(([k, v]) => <Fragment key={k}><th>{k}</th><td>{v}</td></Fragment>)}</tr>)}
        <tr><th>วิธีออกแบบ</th><td>หน่วยแรงที่ยอมให้ (ASD) · คัดกรอง</td><th>สถานะ</th><td><span className={'sr-st ' + (M.status === 'FAIL' ? 'fail' : 'incomplete')}>{M.status}</span></td></tr>
        {revisionBinding && <tr><th>Design Revision</th><td>{revisionBinding.designRevision}</td><th>Review</th><td>{revisionBinding.reviewState}</td></tr>}
      </tbody></table>
      <h2>1. เกณฑ์การออกแบบ (Design Criteria)</h2>
      <h3>1.1 มาตรฐานและเอกสารอ้างอิง</h3>
      <ol className="sr-refs">{M.standards.map(s => <li key={s}>{s}</li>)}</ol>
      <div className="sr-cols">
        <div><h3>1.2 น้ำหนักและเกณฑ์</h3>
          <table className="sr-tb"><thead><tr><th>รายการ</th><th>ค่า</th><th>ที่มา</th></tr></thead>
            <tbody>{M.criteria.map(([a, b, c]) => <tr key={a}><td>{a}</td><td>{b}</td><td>{c}</td></tr>)}</tbody></table></div>
        <div><h3>1.3 วัสดุและค่าที่ยอมให้</h3>
          <table className="sr-tb"><thead><tr><th>องค์อาคาร</th><th>E (MPa)</th><th>Fb (MPa)</th><th>Fv (MPa)</th></tr></thead>
            <tbody>{M.materials.map(r => <tr key={r[0]}>{r.map((c, i) => <td key={i}>{c}</td>)}</tr>)}</tbody></table>
          <p className="sr-note">{M.materialNote}</p></div>
      </div>
      <figure className="sr-fig"><figcaption>รูปที่ 1 {sectionCaption}</figcaption>{section}</figure>
    </section>

    <section className="sr-page">
      <h2>2. {M.loadTitle}</h2>
      <div className={M.pressure ? 'sr-loads' : ''}><Eq rows={M.loadRows}/>
        {M.pressure && <Fig w={175} h={100} caption={`รูปที่ ${fig++} แรงดันคอนกรีตสด (ใช้ pmax คงที่ตรวจสมาชิก)`}><PressureDiagram m={M.pressure}/></Fig>}</div>
      <h2>3. การเลือกองค์อาคารควบคุม (Governing Members)</h2>
      <p>ตรวจทุกองค์อาคารด้วยแรงดัด แรงเฉือน การโก่งตัว และแรงตามแนวแกน แล้วเลือก <b>รายการที่มีอัตราส่วน (ค่าที่เกิด / ค่าที่ยอมให้) สูงสุด</b> ของแต่ละองค์อาคารเป็นตัวควบคุม ตำแหน่งวิกฤตคือสมาชิกภายในที่รับพื้นที่รับแรงเต็ม (ตัวริมรับประมาณครึ่งหนึ่ง)</p>
      <table className="sr-tb sr-gov"><thead><tr><th>#</th><th>องค์อาคาร</th><th>ตำแหน่งวิกฤต</th><th>ที่มาของแรง</th><th>อัตราส่วน ค่าที่เกิด / ยอมให้</th><th>ควบคุมโดย</th></tr></thead>
        <tbody>{M.members.map(m => <tr key={m.name}>
          <td className="c">{m.tag ? <span className="sr-tag" style={{background: TAG_COLOR[m.tag]}}>{m.tag}</span> : '—'}</td>
          <td><b>{m.name}</b><br/><small>{m.use}</small></td><td>{m.where}</td><td>{m.from}</td>
          <td>{m.checks.map((c, i) => <span key={c.id} className={c === m.governing && c.utilization !== null ? 'sr-gv' : ''}>{i ? ' · ' : ''}{checkKind(c)} {c.utilization === null ? (c.demand === null ? '—' : `${n(c.demand)} ${c.unit}`) : ratio(c.utilization)}</span>)}</td>
          <td><b>{m.governing ? (m.governing.utilization === null ? checkKind(m.governing) + ' (ยังไม่มีค่ายอมให้)' : checkKind(m.governing)) : '—'}</b></td></tr>)}</tbody></table>
      <p className="sr-note">ตัวเข้ม = รายการควบคุมที่แสดงรายการคำนวณในข้อ 4 · รายการอื่นแสดงเฉพาะอัตราส่วน (รายการคำนวณฉบับเต็มมีทุกรายการ)</p>
      <figure className="sr-fig"><figcaption>รูปที่ {fig++} {planCaption}</figcaption>
        <div className="sr-plan">{plan}
          {tagged.length > 0 && <ul className="sr-legend">{tagged.map(m => <li key={m.tag}><span className="sr-tag" style={{background: TAG_COLOR[m.tag]}}>{m.tag}</span> {m.name}: {m.where} · {m.from}</li>)}</ul>}</div></figure>
    </section>

    <section className="sr-sec">
      <h2>4. รายการคำนวณองค์อาคารควบคุม</h2>
      {detailed.map((m, i) => {const g = m.governing!, others = m.checks.filter(c => c !== g), v = verdict(g); return <div key={m.name} className="sr-calc">
        <h3>4.{i + 1} {m.name}{m.tag ? ` (${m.tag})` : ''} — ควบคุมโดย{checkKind(g)}</h3>
        <div className={m.diagram ? 'sr-calc-body' : ''}>
          <div><p className="sr-giv">กำหนดให้ {m.given}</p>
            <Eq rows={m.rows}/>
            <div className={'sr-conclude ' + v.toLowerCase()}>{g.limit === null || g.demand === null
              ? <>{checkKind(g)} {g.demand === null ? '' : `= ${n(g.demand)} ${g.unit}`} · ต้องใช้ค่ารับรองจากผู้ผลิต (ค่าที่ยอมให้ ≥ ค่าที่เกิด) → <Verdict m={m}/></>
              : <>{checkKind(g)} = {n(g.demand, 3)} {g.unit} {g.demand > g.limit ? '>' : '≤'} {n(g.limit, 3)} {g.unit} · อัตราส่วน <b>{ratio(g.utilization)}</b> → <Verdict m={m}/></>}</div>
            {others.length > 0 && <p className="sr-also">รายการรอง: {others.map(c => `${checkKind(c)} ${c.utilization === null ? (c.demand === null ? '—' : `${n(c.demand)} ${c.unit}`) : ratio(c.utilization)}`).join(' · ')}{m.maxSpacing ? ` · ระยะสูงสุดที่ไม่เกินเกณฑ์ ${m.maxSpacing}` : ''}</p>}
            <p className="sr-src">ที่มา: {g.source}</p></div>
          {m.diagram && <Fig w={150} h={68} caption={`รูปที่ ${fig++} ${m.diagram.title} ช่วง ${n(m.diagram.L, 0)} mm`}><BeamDiagram L={m.diagram.L} w={m.diagram.w} title={m.diagram.title} unit={m.diagram.unit}/></Fig>}
        </div></div>;})}
    </section>

    <section className="sr-sec">
      <h2>5. สรุปผล</h2>
      <table className="sr-tb"><thead><tr><th>องค์อาคาร</th><th>ที่ใช้</th><th>ควบคุมโดย</th><th>อัตราส่วน</th><th>ระยะสูงสุดที่ไม่เกินเกณฑ์</th><th>ผล</th></tr></thead>
        <tbody>{M.members.map(m => <tr key={m.name}><td>{m.name}</td><td>{m.use}</td><td>{m.governing ? checkKind(m.governing) : '—'}</td><td className="c">{ratio(m.governing?.utilization ?? null)}</td>
          <td>{m.maxSpacing ?? '—'}</td><td><Verdict m={m}/></td></tr>)}</tbody></table>
      <p className="sr-note">* ยังไม่รวมรายการที่ไม่มีค่ากำลัง (SWL) · สถานะรวม <b>{M.status}</b>: ผลคัดกรองเท่านั้น ไม่ใช่การอนุมัติก่อสร้าง ต้องให้วิศวกรตรวจและลงนามก่อนใช้งาน · {M.engineVersion}</p>
      <h2>6. รายการที่ต้องดำเนินการก่อนใช้งาน</h2>
      <ol className="sr-refs">{M.blockers.map((b, i) => <li key={i}>{b}</li>)}</ol>
      <table className="sr-sign"><tbody><tr>
        {[['ผู้คำนวณ', tb.designedBy], ['ผู้ตรวจสอบ', tb.checkedBy], ['ผู้อนุมัติ (วิศวกร)', tb.approvedBy]].map(([k, v]) => <td key={k}>{k}<br/><br/>({v || '..............................'})<br/>วันที่ ........</td>)}
      </tr></tbody></table>
      <footer className="sr-foot">{docNo} · Rev {tb.rev} · CMG · DRAFT / NOT FOR CONSTRUCTION · รูปแบบตามหนังสือ Design Form Work</footer>
    </section>
  </article>;
}

type Common = Omit<Props, 'model' | 'section' | 'sectionCaption' | 'plan' | 'planCaption'>;
const tags = (M: ShortModel) => new Set(M.members.map(m => m.tag).filter(Boolean));

export function SlabShortReport({r, ...rest}: Common & {r: SlabResult}) {
  const model = useMemo(() => slabShortModel(r, slabAdvice(r.input)), [r]), x = r.input, has = tags(model);
  const sj = sp(x.lx, r.joists), sb = sp(x.ly, r.bearers), ss = sp(x.lx, r.shores);
  const ji = Math.max(1, Math.floor((r.joists.length - 1) / 4)), bi = r.bearers.length > 2 ? 1 : 0, bk = Math.max(0, r.bearers.length - 2), k = mid(r.shores), c = mid(r.bearers);
  const overlay = (P: Mapper) => <>
    {has.has('1') && <Mark P={P} tag="1" x0={r.joists[ji] - sj / 2} x1={r.joists[ji] + sj / 2} y0={r.bearers[bi]} y1={r.bearers[bi + 1]}/>}
    {has.has('2') && <Mark P={P} tag="2" x0={r.shores[Math.min(k + 1, r.shores.length - 2)]} x1={r.shores[Math.min(k + 2, r.shores.length - 1)]} y0={r.bearers[bk] - sb / 2} y1={r.bearers[bk] + sb / 2}/>}
    {has.has('3') && <Mark P={P} tag="3" x0={r.shores[k] - ss / 2} x1={r.shores[k] + ss / 2} y0={r.bearers[c] - sb / 2} y1={r.bearers[c] + sb / 2}/>}</>;
  return <ShortReport model={model} {...rest}
    section={<Svg w={180} h={64}><SlabSectionView r={r} axis="X" box={{x: 0, y: 0, w: 180, h: 64}} titled={false}/></Svg>} sectionCaption="รูปตัดแบบหล่อพื้นและการถ่ายแรง (อ้างอิงแบบ SF-02)"
    plan={<Svg w={150} h={120}><SlabPlanView r={r} box={{x: 0, y: 0, w: 150, h: 120}} titled={false} overlay={overlay}/></Svg>} planCaption="แปลนแบบหล่อพื้นและตำแหน่งวิกฤตขององค์อาคารควบคุม (อ้างอิงแบบ SF-01)"/>;
}

export function BeamShortReport({r, ...rest}: Common & {r: BeamResult}) {
  const model = useMemo(() => beamShortModel(r, beamAdvice(r.input)), [r]), x = r.input, has = tags(model);
  const sj = sp(x.length, r.joists), ss = sp(x.length, r.shores), st = sp(x.length, r.studs), k = mid(r.shores), ji = Math.max(1, Math.floor((r.joists.length - 1) / 4));
  const si = Math.min(r.studs.length - 2, Math.max(1, Math.floor((r.studs.length - 1) * 3 / 4))), ti = mid(r.ties), lv = r.tieLevels[0] ?? r.studSpan;
  const overlay = (P: Mapper, s: {shoreTop: number; bearerTop: number; soffit: number}) => <>
    {has.has('1') && <Mark P={P} tag="1" x0={r.joists[ji] - sj / 2} x1={r.joists[ji] + sj / 2} y0={s.bearerTop} y1={s.soffit}/>}
    {has.has('2') && <Mark P={P} tag="2" x0={r.shores[k]} x1={r.shores[k + 1]} y0={s.shoreTop} y1={s.bearerTop}/>}
    {has.has('3') && <Mark P={P} tag="3" x0={Math.max(0, r.shores[k + 1] - ss / 2)} x1={Math.min(x.length, r.shores[k + 1] + ss / 2)} y0={0} y1={s.shoreTop}/>}
    {has.has('4') && <Mark P={P} tag="4" x0={r.studs[si] - st / 2} x1={r.studs[si] + st / 2} y0={s.soffit} y1={s.soffit + r.studSpan}/>}
    {has.has('5') && r.ties.length > 1 && <Mark P={P} tag="5" x0={r.ties[ti]} x1={r.ties[ti + 1]} y0={s.soffit + lv - 40} y1={s.soffit + lv + 40}/>}</>;
  return <ShortReport model={model} {...rest}
    section={<Svg w={180} h={95}><BeamSectionView r={r} box={{x: 0, y: 0, w: 180, h: 95}} titled={false}/></Svg>} sectionCaption="รูปตัดแบบหล่อคานและการถ่ายแรง (อ้างอิงแบบ BF-01)"
    plan={<Svg w={150} h={100}><BeamElevationView r={r} box={{x: 0, y: 0, w: 150, h: 100}} titled={false} overlay={overlay}/></Svg>} planCaption="รูปด้านตามยาวคานและตำแหน่งวิกฤตขององค์อาคารควบคุม (อ้างอิงแบบ BF-02)"/>;
}

export function WallShortReport({r, ...rest}: Common & {r: WallResult}) {
  const model = useMemo(() => wallShortModel(r, wallAdvice(r.input)), [r]), x = r.input, has = tags(model), single = !!r.strongback;
  const st = sp(x.length, r.studs), sw = sp(x.height, r.levels), spans = single ? r.braces : r.ties, k = mid(spans);
  const si = Math.max(1, Math.floor((r.studs.length - 1) / 4)), lv = r.levels.length > 2 ? 1 : 0, kb = mid(r.braces), kb2 = Math.min(kb + 1, r.braces.length - 1);
  const overlay = (P: Mapper) => <>
    {has.has('1') && <Mark P={P} tag="1" x0={r.studs[si] - st / 2} x1={r.studs[si] + st / 2} y0={r.levels[0]} y1={r.levels[1]}/>}
    {has.has('2') && <Mark P={P} tag="2" x0={spans[k]} x1={spans[k + 1]} y0={r.levels[lv] - 60} y1={r.levels[lv] + 60}/>}
    {has.has('3') && (single
      ? <Mark P={P} tag="3" x0={r.braces[k] - 120} x1={r.braces[k] + 120} y0={0} y1={x.height}/>
      : <Mark P={P} tag="3" x0={r.ties[Math.min(k + 1, r.ties.length - 1)] - sp(x.length, r.ties) / 2} x1={r.ties[Math.min(k + 1, r.ties.length - 1)] + sp(x.length, r.ties) / 2} y0={r.levels[lv] - sw / 2} y1={r.levels[lv] + sw / 2}/>)}
    {single && has.has('4') && <Mark P={P} tag="4" x0={r.braces[kb] - 150} x1={r.braces[kb] + 150} y0={-120} y1={120}/>}
    {has.has(single ? '5' : '4') && <Mark P={P} tag={single ? '5' : '4'} x0={r.braces[kb2] - 150} x1={r.braces[kb2] + 150} y0={0} y1={x.braceHeight}/>}</>;
  return <ShortReport model={model} {...rest}
    section={<Svg w={180} h={100}><WallSectionView r={r} box={{x: 0, y: 0, w: 180, h: 100}} titled={false}/></Svg>} sectionCaption="รูปตัดแบบหล่อผนังและการถ่ายแรง (อ้างอิงแบบ WF-01)"
    plan={<Svg w={150} h={110}><WallElevationView r={r} box={{x: 0, y: 0, w: 150, h: 110}} titled={false} overlay={overlay}/></Svg>} planCaption="รูปด้านแบบหล่อผนังและตำแหน่งวิกฤตขององค์อาคารควบคุม (อ้างอิงแบบ WF-01)"/>;
}

export function LegacyShortReport({r, ...rest}: Common & {r: Result}) {
  const {model, L} = useMemo(() => ({model: legacyShortModel(r, adviseLayout(r.input)), L: buildFormworkLayout(r)}), [r]), column = r.input.kind === 'COLUMN';
  return <ShortReport model={model} {...rest}
    section={<Svg w={180} h={110}><SectionView L={L} box={{x: 0, y: 0, w: 180, h: 110}} titled={false}/></Svg>} sectionCaption={`รูปตัดแบบหล่อ${column ? 'เสา' : 'ฐานราก'}และการถ่ายแรง (อ้างอิงแบบ FW-02)`}
    plan={<Svg w={150} h={120}><PlanView L={L} box={{x: 0, y: 0, w: 150, h: 120}} titled={false}/></Svg>} planCaption={`แปลนแบบหล่อ${column ? 'เสา' : 'ฐานราก'} (อ้างอิงแบบ FW-01) · ตำแหน่งวิกฤตตามตารางข้อ 3`}/>;
}

export type ReportVariant = 'full' | 'short';
/** Full report or short report ("รายการคำนวณแบบย่อ") in the report menu of every system. */
export function ReportVariantSwitch({value, onChange}: {value: ReportVariant; onChange: (v: ReportVariant) => void}) {
  return <div className="report-variant" role="group" aria-label="รูปแบบรายการคำนวณ">
    {([['full', 'ฉบับเต็ม'], ['short', 'แบบย่อ']] as const).map(([k, t]) => <button key={k} type="button" aria-pressed={value === k} onClick={() => onChange(k)}>{t}</button>)}
  </div>;
}
