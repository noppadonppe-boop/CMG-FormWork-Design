import type {ReactNode} from 'react';

/** A3 landscape sheet in millimetres. All drawing primitives work in sheet mm. */
export const SHEET = {w: 420, h: 297, left: 20, top: 10, right: 410, bottom: 287, titleTop: 250};
export const DRAW_AREA = {x: 23, y: 24, w: 384, h: 222};
export const LW = {thick: 0.5, med: 0.35, thin: 0.18, hair: 0.1};
export const FONT = "'Noto Sans Thai','Tahoma','Arial',sans-serif";
export const SCALES = [1, 2, 5, 10, 15, 20, 25, 30, 40, 50, 60, 75, 100, 125, 150, 200, 250, 300, 400, 500];
export type V = [number, number];
export type Box = {x: number; y: number; w: number; h: number};

/** Smallest standard scale (1:S) such that the model extent fits the available sheet space. */
export const fitScale = (modelW: number, modelH: number, w: number, h: number) =>
  SCALES.find(s => modelW / s <= w && modelH / s <= h) ?? SCALES[SCALES.length - 1];
export const mm = (v: number) => Math.round(v).toLocaleString('en-US');

export function Txt({x, y, s = 2.5, a = 'start', b = false, rot = 0, fill = '#111', children}: {x: number; y: number; s?: number; a?: 'start' | 'middle' | 'end'; b?: boolean; rot?: number; fill?: string; children: ReactNode}) {
  return <text x={x} y={y} fontSize={s} textAnchor={a} fontWeight={b ? 700 : 400} fill={fill} fontFamily={FONT} transform={rot ? `rotate(${rot} ${x} ${y})` : undefined}>{children}</text>;
}
export function Defs() {
  return <defs>
    <pattern id="h-concrete" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="4" fill="#f1f3f5"/><circle cx="1" cy="1" r=".22" fill="#8a96a3"/><path d="M2.6 2.2l.5.9h-1z" fill="none" stroke="#8a96a3" strokeWidth=".1"/></pattern>
    <pattern id="h-plywood" width="1.2" height="1.2" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="1.2" height="1.2" fill="#f6e3c3"/><path d="M0 0v1.2" stroke="#b07a35" strokeWidth=".12"/></pattern>
    <pattern id="h-timber" width="2.4" height="2.4" patternUnits="userSpaceOnUse"><rect width="2.4" height="2.4" fill="#e9cf9f"/><path d="M0 .6q1.2 .5 2.4 0M0 1.8q1.2 .5 2.4 0" fill="none" stroke="#8a5a24" strokeWidth=".12"/></pattern>
    <pattern id="h-ground" width="2" height="2" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0v2" stroke="#666" strokeWidth=".12"/></pattern>
  </defs>;
}
export const poly = (pts: V[]) => pts.map(p => p[0].toFixed(2) + ',' + p[1].toFixed(2)).join(' ');
export function Line({a, b, w = LW.thin, dash, color = '#111'}: {a: V; b: V; w?: number; dash?: string; color?: string}) {
  return <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={color} strokeWidth={w} strokeDasharray={dash}/>;
}

/** Aligned dimension between sheet points a and b; o is the offset vector (sheet mm) to the dimension line. */
export function Dim({a, b, o, text, s = 2.2}: {a: V; b: V; o: V; text: string; s?: number}) {
  const ol = Math.hypot(o[0], o[1]) || 1, on: V = [o[0] / ol, o[1] / ol];
  const A: V = [a[0] + o[0], a[1] + o[1]], B: V = [b[0] + o[0], b[1] + o[1]];
  const len = Math.hypot(B[0] - A[0], B[1] - A[1]); if (len < 0.05) return null;
  const u: V = [(B[0] - A[0]) / len, (B[1] - A[1]) / len];
  let ang = Math.atan2(u[1], u[0]) * 180 / Math.PI; if (ang > 90.1 || ang < -89.9) ang += 180;
  const tick = (p: V) => <line x1={p[0] - (u[0] - on[0]) * 0.8} y1={p[1] - (u[1] - on[1]) * 0.8} x2={p[0] + (u[0] - on[0]) * 0.8} y2={p[1] + (u[1] - on[1]) * 0.8} stroke="#111" strokeWidth={LW.med}/>;
  const rd: V = [Math.cos(ang * Math.PI / 180), Math.sin(ang * Math.PI / 180)], up: V = [rd[1], -rd[0]];
  const mid: V = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2], tp: V = [mid[0] + up[0] * 0.9, mid[1] + up[1] * 0.9];
  return <g>
    {[a, b].map((p, i) => <line key={i} x1={p[0] + on[0] * 0.8} y1={p[1] + on[1] * 0.8} x2={p[0] + o[0] + on[0] * 1.5} y2={p[1] + o[1] + on[1] * 1.5} stroke="#111" strokeWidth={LW.hair}/>)}
    <line x1={A[0] - u[0] * 1.2} y1={A[1] - u[1] * 1.2} x2={B[0] + u[0] * 1.2} y2={B[1] + u[1] * 1.2} stroke="#111" strokeWidth={LW.thin}/>
    {tick(A)}{tick(B)}
    {text && <Txt x={tp[0]} y={tp[1]} s={s} a="middle" rot={ang}>{text}</Txt>}
  </g>;
}
/** Chain of dimensions; when segments are too short for text, labels collapse into one "n @ s" note. */
export function ChainDim({pts, o, values, s = 2.2, total}: {pts: V[]; o: V; values: number[]; s?: number; total?: string}) {
  if (pts.length < 2) return null;
  const fits = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]) >= mm(values[i]).length * s * 0.62 + 1);
  const equal = values.every(v => Math.abs(v - values[0]) < 0.5), collapse = equal && fits.some(f => !f);
  return <g>
    {pts.slice(1).map((p, i) => <Dim key={i} a={pts[i]} b={p} o={o} text={!collapse && fits[i] ? mm(values[i]) : ''} s={s}/>)}
    {collapse && <Dim a={pts[0]} b={pts[pts.length - 1]} o={o} text={`${values.length} @ ${mm(values[0])}${total ? ' = ' + total : ''}`} s={s}/>}
  </g>;
}
export function Leader({from, to, text, s = 2.3, lines}: {from: V; to: V; text: string; s?: number; lines?: string[]}) {
  const right = to[0] >= from[0], end: V = [to[0] + (right ? 3 : -3), to[1]];
  return <g>
    <circle cx={from[0]} cy={from[1]} r={0.45} fill="#111"/>
    <polyline points={poly([from, to, end])} fill="none" stroke="#111" strokeWidth={LW.thin}/>
    <Txt x={end[0] + (right ? 0.8 : -0.8)} y={to[1] + s * 0.35} s={s} a={right ? 'start' : 'end'}>{text}</Txt>
    {lines?.map((l, i) => <Txt key={i} x={end[0] + (right ? 0.8 : -0.8)} y={to[1] + s * 0.35 + (i + 1) * s * 1.25} s={s * 0.85} a={right ? 'start' : 'end'} fill="#444">{l}</Txt>)}
  </g>;
}
export function SectionMark({a, b, id, view}: {a: V; b: V; id: string; view: V}) {
  const head = (p: V) => <g>
    <circle cx={p[0]} cy={p[1]} r={3.2} fill="#fff" stroke="#111" strokeWidth={LW.med}/>
    <Txt x={p[0]} y={p[1] + 1.2} s={3.2} a="middle" b>{id}</Txt>
    <path d={`M${p[0] + view[0] * 3.2 - view[1] * 2} ${p[1] + view[1] * 3.2 + view[0] * 2}L${p[0] + view[0] * 6.5} ${p[1] + view[1] * 6.5}L${p[0] + view[0] * 3.2 + view[1] * 2} ${p[1] + view[1] * 3.2 - view[0] * 2}Z`} fill="#111"/>
  </g>;
  return <g><Line a={a} b={b} w={LW.med} dash="8 1.5 1.5 1.5"/>{head(a)}{head(b)}</g>;
}
export function ViewTitle({x, y, n, title, sub, scale}: {x: number; y: number; n: string; title: string; sub?: string; scale?: number | null}) {
  return <g>
    <circle cx={x + 4.5} cy={y - 1.3} r={4.5} fill="none" stroke="#111" strokeWidth={LW.med}/>
    <Txt x={x + 4.5} y={y} s={3.6} a="middle" b>{n}</Txt>
    <Txt x={x + 11} y={y - 1.4} s={3.4} b>{title}</Txt>
    <line x1={x + 11} y1={y - 0.2} x2={x + 11 + Math.max(title.length * 2.1, 40)} y2={y - 0.2} stroke="#111" strokeWidth={LW.thick}/>
    <Txt x={x + 11} y={y + 3.2} s={2.3} fill="#333">{scale ? `มาตราส่วน 1:${scale}` : 'ไม่ใช้มาตราส่วน (NTS)'}{sub ? ' · ' + sub : ''}</Txt>
  </g>;
}
export type Col = {t: string; w: number; a?: 'start' | 'middle' | 'end'};
export function Table({x, y, cols, rows, rh = 6, s = 2.2, title}: {x: number; y: number; cols: Col[]; rows: string[][]; rh?: number; s?: number; title?: string}) {
  const W = cols.reduce((n, c) => n + c.w, 0), y0 = title ? y + 6 : y, H = (rows.length + 1) * rh;
  let cx = x;
  const xs = cols.map(c => {const v = cx; cx += c.w; return v;});
  const cell = (c: Col, i: number, txt: string, yy: number, bold = false) => {
    const max = Math.floor(c.w / (s * 0.5)), t = txt.length > max ? txt.slice(0, max - 1) + '…' : txt;
    const tx = c.a === 'end' ? xs[i] + c.w - 1.2 : c.a === 'middle' ? xs[i] + c.w / 2 : xs[i] + 1.2;
    return <Txt key={i} x={tx} y={yy + rh / 2 + s * 0.36} s={s} a={c.a ?? 'start'} b={bold}>{t}</Txt>;
  };
  return <g>
    {title && <Txt x={x} y={y + 3.6} s={3} b>{title}</Txt>}
    <rect x={x} y={y0} width={W} height={rh} fill="#e8edf2"/>
    <rect x={x} y={y0} width={W} height={H} fill="none" stroke="#111" strokeWidth={LW.med}/>
    {rows.map((_, i) => <line key={i} x1={x} y1={y0 + (i + 1) * rh} x2={x + W} y2={y0 + (i + 1) * rh} stroke="#111" strokeWidth={i === 0 ? LW.med : LW.hair}/>)}
    {xs.slice(1).map((v, i) => <line key={i} x1={v} y1={y0} x2={v} y2={y0 + H} stroke="#111" strokeWidth={LW.hair}/>)}
    {cols.map((c, i) => cell({...c, a: 'middle'}, i, c.t, y0, true))}
    {rows.map((r, j) => <g key={j}>{cols.map((c, i) => cell(c, i, r[i] ?? '', y0 + (j + 1) * rh))}</g>)}
  </g>;
}

export interface TitleInfo {company: string; project: string; code: string; caseName: string; elementLabel: string;
  designedBy: string; drawnBy: string; checkedBy: string; approvedBy: string; rev: string; date: string}
/** A3 frame with CMG title strip and a permanent preliminary stamp while the engine reports no construction release. */
export function Sheet({no, total, code, title, info, children, svgRef}: {no: number; total: number; code: string; title: string; info: TitleInfo; children: ReactNode; svgRef?: (el: SVGSVGElement | null) => void}) {
  const S = SHEET, ty = S.titleTop, h = S.bottom - ty;
  const cells = [70, 112, 92, 66, 50];
  let cx = S.left;
  const xs = cells.map(w => {const v = cx; cx += w; return v;});
  const small = (x: number, y: number, label: string, value: string, vs = 2.6) => <g>
    <Txt x={x + 1.5} y={y + 3} s={1.8} fill="#555">{label}</Txt><Txt x={x + 1.5} y={y + 7.2} s={vs} b>{value}</Txt></g>;
  return <svg ref={svgRef} xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${S.w} ${S.h}`} width="420mm" height="297mm" className="a3-sheet" role="img" aria-label={`แผ่นที่ ${no} ${title}`}>
    <Defs/>
    <rect width={S.w} height={S.h} fill="#fff"/>
    <rect x={S.left} y={S.top} width={S.right - S.left} height={S.bottom - S.top} fill="none" stroke="#111" strokeWidth={0.7}/>
    <rect x={S.left + 1.5} y={S.top + 1.5} width={S.right - S.left - 3} height={S.bottom - S.top - 3} fill="none" stroke="#111" strokeWidth={LW.hair}/>
    <g>
      <rect x={312} y={13} width={95} height={9} fill="#fff" stroke="#c0392b" strokeWidth={0.5}/>
      <Txt x={359.5} y={17} s={2.6} a="middle" b fill="#c0392b">แบบร่างเบื้องต้น · ห้ามใช้ก่อสร้าง</Txt>
      <Txt x={359.5} y={20.6} s={2.1} a="middle" fill="#c0392b">PRELIMINARY – NOT FOR CONSTRUCTION</Txt>
    </g>
    {children}
    <line x1={S.left} y1={ty} x2={S.right} y2={ty} stroke="#111" strokeWidth={0.6}/>
    {xs.slice(1).map((x, i) => <line key={i} x1={x} y1={ty} x2={x} y2={S.bottom} stroke="#111" strokeWidth={LW.med}/>)}
    <g>
      <rect x={xs[0] + 3} y={ty + 4} width={13} height={13} fill="#173e62"/>
      <Txt x={xs[0] + 9.5} y={ty + 12.3} s={4} a="middle" b fill="#fff">CMG</Txt>
      <Txt x={xs[0] + 19} y={ty + 9} s={2.6} b>{info.company}</Txt>
      <Txt x={xs[0] + 19} y={ty + 13.5} s={1.9} fill="#444">FORMWORK DESIGN DEPARTMENT</Txt>
      <Txt x={xs[0] + 3} y={ty + 24} s={1.8} fill="#555">หมายเหตุ: ห้ามวัดขนาดจากแบบ ใช้ตัวเลขที่ระบุ</Txt>
      <Txt x={xs[0] + 3} y={ty + 28} s={1.8} fill="#555">หน่วยมิลลิเมตร เว้นแต่ระบุเป็นอื่น</Txt>
    </g>
    <g>{small(xs[1], ty, 'โครงการ / PROJECT', info.project, 2.8)}{small(xs[1], ty + 9, 'รหัสโครงการ / CODE', info.code)}
      {small(xs[1], ty + 18, 'องค์อาคาร / ELEMENT', `${info.caseName} · ${info.elementLabel}`)}<line x1={xs[1]} y1={ty + 9} x2={xs[2]} y2={ty + 9} stroke="#111" strokeWidth={LW.hair}/>
      <line x1={xs[1]} y1={ty + 18} x2={xs[2]} y2={ty + 18} stroke="#111" strokeWidth={LW.hair}/></g>
    <g><Txt x={xs[2] + 1.5} y={ty + 3} s={1.8} fill="#555">ชื่อแบบ / DRAWING TITLE</Txt>
      <Txt x={xs[2] + 1.5} y={ty + 11} s={3.4} b>{title}</Txt>
      <Txt x={xs[2] + 1.5} y={ty + 16} s={2.1} fill="#333">แบบหล่อคอนกรีต (FORMWORK)</Txt>
      <Txt x={xs[2] + 1.5} y={ty + 26} s={1.8} fill="#555">สถานะ: DRAFT / NO_GO · ต้องตรวจและอนุมัติโดยวิศวกรผู้มีใบอนุญาต</Txt></g>
    <g>{[['ออกแบบ / DESIGNED', info.designedBy], ['เขียนแบบ / DRAWN', info.drawnBy], ['ตรวจ / CHECKED', info.checkedBy], ['อนุมัติ / APPROVED', info.approvedBy]].map(([l, v], i) =>
      <g key={l}><Txt x={xs[3] + 1.5} y={ty + 5 + i * 7.8} s={1.8} fill="#555">{l}</Txt><Txt x={xs[3] + 28} y={ty + 5 + i * 7.8} s={2.3}>{v || '……………………'}</Txt>
        {i > 0 && <line x1={xs[3]} y1={ty + i * 7.8 + 0.6} x2={xs[4]} y2={ty + i * 7.8 + 0.6} stroke="#111" strokeWidth={LW.hair}/>}</g>)}</g>
    <g>{small(xs[4], ty, 'มาตราส่วน / SCALE', 'ตามระบุ')}{small(xs[4] + 25, ty, 'แก้ไข / REV', info.rev)}
      {small(xs[4], ty + 11, 'วันที่ / DATE', info.date)}
      <line x1={xs[4]} y1={ty + 11} x2={S.right} y2={ty + 11} stroke="#111" strokeWidth={LW.hair}/><line x1={xs[4] + 25} y1={ty} x2={xs[4] + 25} y2={ty + 11} stroke="#111" strokeWidth={LW.hair}/>
      <line x1={xs[4]} y1={ty + 22} x2={S.right} y2={ty + 22} stroke="#111" strokeWidth={LW.hair}/>
      <Txt x={xs[4] + 1.5} y={ty + 25} s={1.8} fill="#555">แผ่นที่ / SHEET</Txt>
      <Txt x={xs[4] + 1.5} y={ty + 33} s={4.6} b>{code}</Txt><Txt x={S.right - 2} y={ty + 33} s={2.6} a="end">{no} / {total}</Txt></g>
  </svg>;
}
