import type {ReactElement} from 'react';
import type {FormworkLayout, LayoutFace} from '../domain/formworkLayout';
import type {Scene} from '../domain/scene';
import {projectSolids} from './iso';
import {ChainDim, Dim, Leader, Line, LW, SectionMark, Txt, ViewTitle, fitScale, mm, poly, type Box, type V} from './primitives';

const C = {stud: '#1d4e89', waler: '#9b1c1c', tie: '#1e7b34', ply: '#9a6a2c'};
type Mapper = (x: number, y: number) => V;
/** Maps model mm into a box at 1:S, centred on the model extent; Y (or Z) up. */
function mapper(box: Box, ext: [number, number, number, number], S: number, titleSpace = 12): Mapper {
  const [x0, x1, y0, y1] = ext, cx = box.x + box.w / 2, cy = box.y + (box.h - titleSpace) / 2;
  return (x, y) => [cx + (x - (x0 + x1) / 2) / S, cy - (y - (y0 + y1) / 2) / S];
}
const rect = (P: Mapper, x0: number, y0: number, x1: number, y1: number): V[] => [P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1)];
const diffs = (v: number[]) => v.slice(1).map((p, i) => p - v[i]);
const at = (f: LayoutFace, s: number, n: number) => ({x: f.a.x + f.dir.x * s + f.normal.x * n, y: f.a.y + f.dir.y * s + f.normal.y * n});
function Rhs({P, x0, y0, x1, y1, t, color, cut = true}: {P: Mapper; x0: number; y0: number; x1: number; y1: number; t: number; color: string; cut?: boolean}) {
  return <g>
    <polygon points={poly(rect(P, x0, y0, x1, y1))} fill={cut ? color : 'none'} stroke={color} strokeWidth={LW.med}/>
    {cut && x1 - x0 > 2 * t && y1 - y0 > 2 * t && <polygon points={poly(rect(P, x0 + t, y0 + t, x1 - t, y1 - t))} fill="#fff" stroke="none"/>}
  </g>;
}

/** Stud in cross-section: steel box or solid timber. */
function StudMember({L, P, x0, x1, y0, y1}: {L: FormworkLayout; P: Mapper; x0: number; x1: number; y0: number; y1: number}) {
  return L.stud.material === 'TIMBER' ? <polygon points={poly(rect(P, x0, y0, x1, y1))} fill="url(#h-timber)" stroke="#8a5a24" strokeWidth={LW.thin}/>
    : <Rhs P={P} x0={x0} y0={y0} x1={x1} y1={y1} t={L.stud.t} color={C.stud}/>;
}
/** One member of the twin waler in cross-section: RHS box, or a channel whose web faces the tie gap (back-to-back pair). */
function WalerMember({L, P, x0, x1, y0, y1, webAt}: {L: FormworkLayout; P: Mapper; x0: number; x1: number; y0: number; y1: number; webAt: 'y0' | 'y1'}) {
  const w = L.waler;
  if (w.shape === 'RHS') return <Rhs P={P} x0={x0} y0={y0} x1={x1} y1={y1} t={w.t} color={C.waler}/>;
  if (w.shape === 'CHS') {
    const c = P((x0 + x1) / 2, (y0 + y1) / 2), R = Math.abs(P(x1, 0)[0] - P(x0, 0)[0]) / 2, r = R * (1 - 2 * w.t / w.H);
    return <path d={`M${c[0] - R} ${c[1]}a${R} ${R} 0 1 0 ${2 * R} 0a${R} ${R} 0 1 0 ${-2 * R} 0M${c[0] - r} ${c[1]}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`} fill={C.waler} fillRule="evenodd" stroke={C.waler} strokeWidth={LW.thin}/>;
  }
  if (w.shape === 'L') {
    // Horizontal leg at the tie gap, vertical leg against the studs (x0 side).
    const t = w.t, Yl = (v: number) => {const H = y1 - y0, d = v === 1 ? H : v; return webAt === 'y0' ? y0 + d : y1 - d;};
    return <polygon points={poly(([[x0, 0], [x1, 0], [x1, t], [x0 + t, t], [x0 + t, 1], [x0, 1]] as [number, number][]).map(([x, y]) => P(x, Yl(y))))} fill={C.waler} stroke={C.waler} strokeWidth={LW.thin}/>;
  }
  const tw = w.tw, tf = w.tf, lip = Math.min(w.lip, (x1 - x0) / 2 - tf), t = w.t;
  // Local profile with the web on the y0 side; mirrored when the web faces y1.
  const pts: [number, number][] = [[x0, 0], [x1, 0], [x1, 1], ...(lip > 0 ? [[x1 - lip, 1], [x1 - lip, -t], [x1 - tf, -t]] as [number, number][] : [[x1 - tf, 1]] as [number, number][]),
    [x1 - tf, tw], [x0 + tf, tw], ...(lip > 0 ? [[x0 + tf, -t], [x0 + lip, -t], [x0 + lip, 1]] as [number, number][] : [[x0 + tf, 1]] as [number, number][]), [x0, 1]];
  // y code: 0 = web side, 1 = tip side, -t = offset from tip (lip thickness), positive values = offset from web side.
  const Y = (v: number) => {const H = y1 - y0, fromWeb = v === 1 ? H : v < 0 ? H + v : v; return webAt === 'y0' ? y0 + fromWeb : y1 - fromWeb;};
  return <polygon points={poly(pts.map(([x, y]) => P(x, Y(y))))} fill={C.waler} stroke={C.waler} strokeWidth={LW.thin}/>;
}

export function PlanView({L, box, n = '1', titled = true}: {L: FormworkLayout; box: Box; n?: string; titled?: boolean}) {
  const e = L.offsets.outer + L.offsets.extension, W = L.width, Lg = L.length;
  const S = fitScale(W + 2 * e, Lg + 2 * e, box.w - 48, box.h - 50), P = mapper(box, [-e, W + e, -e, Lg + e], S, 14), es = e / S;
  const F1 = L.faces[0], F2 = L.faces[1], coords = (axis: 'X' | 'Y') => [...new Set(L.ties.filter(t => t.axis === axis).map(t => Math.round(t.position * 1000) / 1000))].sort((a, b) => a - b);
  const tieF1 = coords('Y'), tieF2 = coords('X');
  const ycut = L.shape === 'L' ? L.armY * 0.42 : Lg * 0.42, cut = [P(-e, ycut)[0] - es - 24, P(0, ycut)[1]] as V;
  const seen = new Set<string>();
  return <g>
    <polygon points={poly(L.points.map(p => P(p.x, p.y)))} fill="url(#h-concrete)" stroke="#111" strokeWidth={LW.thick}/>
    {L.faces.map(f => <g key={f.id}>
      <polygon points={poly([at(f, 0, 0), at(f, f.length, 0), at(f, f.length, L.plywood.t), at(f, 0, L.plywood.t)].map(p => P(p.x, p.y)))} fill="url(#h-plywood)" stroke={C.ply} strokeWidth={LW.thin}/>
      <polygon points={poly([at(f, -f.extStart, L.offsets.waler), at(f, f.length + f.extEnd, L.offsets.waler), at(f, f.length + f.extEnd, L.offsets.outer), at(f, -f.extStart, L.offsets.outer)].map(p => P(p.x, p.y)))}
        fill="#fbeaea" stroke={C.waler} strokeWidth={LW.med}/>
      {f.studs.map((s, i) => <polygon key={i} points={poly([at(f, s - L.stud.B / 2, L.offsets.stud), at(f, s + L.stud.B / 2, L.offsets.stud), at(f, s + L.stud.B / 2, L.offsets.waler), at(f, s - L.stud.B / 2, L.offsets.waler)].map(p => P(p.x, p.y)))}
        fill="#dbe6f4" stroke={C.stud} strokeWidth={LW.med}/>)}
      {(() => {const m = at(f, f.length * 0.18, 0), q = P(m.x, m.y), d = 4; return <Txt x={q[0] - f.normal.x * d} y={q[1] + f.normal.y * d + 1} s={2.8} a="middle" b fill="#173e62">{f.id}</Txt>;})()}
    </g>)}
    {L.ties.filter(t => {const k = t.axis + Math.round(t.position); if (seen.has(k)) return false; seen.add(k); return true;}).map(t => {
      const a = P(t.a.x, t.a.y), b = P(t.b.x, t.b.y), pl = 1.1;
      return <g key={t.id}><Line a={a} b={b} w={LW.med} dash="3 1" color={C.tie}/>
        {[a, b].map((p, i) => <rect key={i} x={p[0] - pl} y={p[1] - pl} width={2 * pl} height={2 * pl} fill={C.tie}/>)}</g>;
    })}
    <ChainDim pts={F1.studs.map(s => P(F1.a.x + s, 0))} values={diffs(F1.studs)} o={[0, es + 6]}/>
    <Dim a={P(0, 0)} b={P(W, 0)} o={[0, es + 13]} text={mm(W)}/>
    <ChainDim pts={F2.studs.map(s => P(W, F2.a.y + s))} values={diffs(F2.studs)} o={[es + 6, 0]}/>
    <Dim a={P(0, 0)} b={P(0, Lg)} o={[-(es + 13), 0]} text={mm(Lg)}/>
    {tieF1.length > 0 && <ChainDim pts={[0, ...tieF1, W].map(x => P(x, Lg))} values={diffs([0, ...tieF1, W])} o={[0, -(es + 6)]}/>}
    {tieF2.length > 0 && <ChainDim pts={[0, ...tieF2, Lg].map(y => P(0, y))} values={diffs([0, ...tieF2, Lg])} o={[-(es + 6), 0]}/>}
    {L.shape === 'L' && <><Dim a={P(0, Lg)} b={P(L.armX, Lg)} o={[0, -(es + 13)]} text={mm(L.armX)}/><Dim a={P(W, 0)} b={P(W, L.armY)} o={[es + 13, 0]} text={mm(L.armY)}/></>}
    <SectionMark a={cut} b={[P(W + e, ycut)[0] + es + 24, cut[1]]} id="A" view={[0, -1]}/>
    {(() => {const p = P(W * 0.22, 0); const y = p[1] + es + 20; return <g><path d={`M${p[0]} ${y - 6}l-2 3.2h4z`} fill="#111"/><circle cx={p[0]} cy={y} r={2.8} fill="#fff" stroke="#111" strokeWidth={LW.med}/><Txt x={p[0]} y={y + 1} s={2.6} a="middle" b>E1</Txt></g>;})()}
    {titled && <ViewTitle x={box.x + 4} y={box.y + box.h - 4} n={n} title="แปลนแบบหล่อ (FORMWORK PLAN)" scale={S} sub="แสดงคร่าว คานคู่ และ Tie ระดับเดียว"/>}
  </g>;
}

export function SectionView({L, box, n = '2', titled = true}: {L: FormworkLayout; box: Box; n?: string; titled?: boolean}) {
  const o = L.offsets, W = L.width, H = L.height, t = L.plywood.t;
  const S = fitScale(W + 2 * o.outer + 200, H + 300, box.w - 60, box.h - 44), P = mapper(box, [-o.outer - 100, W + o.outer + 100, -150, H + 150], S, 14), os = o.outer / S;
  const sides: [number, number][] = [[-1, 0], [1, W]];
  return <g>
    <rect x={P(-o.outer - 250, 0)[0]} y={P(0, 0)[1]} width={(W + 2 * o.outer + 500) / S} height={2} fill="url(#h-ground)"/>
    <Line a={P(-o.outer - 250, 0)} b={P(W + o.outer + 250, 0)} w={LW.thick}/>
    <polygon points={poly(rect(P, 0, 0, W, H))} fill="url(#h-concrete)" stroke="#111" strokeWidth={LW.thick}/>
    {sides.map(([d, x0]) => <g key={d}>
      <polygon points={poly(rect(P, x0 + d * t, 0, x0, H))} fill="url(#h-plywood)" stroke={C.ply} strokeWidth={LW.thin}/>
      <polygon points={poly(rect(P, x0 + d * o.stud, 0, x0 + d * o.waler, H))} fill="none" stroke={C.stud} strokeWidth={LW.thin}/>
      {L.levels.map((z, i) => <g key={i}>
        <WalerMember L={L} P={P} x0={Math.min(x0 + d * o.waler, x0 + d * o.outer)} x1={Math.max(x0 + d * o.waler, x0 + d * o.outer)} y0={z + L.waler.gap / 2} y1={z + L.waler.gap / 2 + L.waler.B} webAt="y0"/>
        <WalerMember L={L} P={P} x0={Math.min(x0 + d * o.waler, x0 + d * o.outer)} x1={Math.max(x0 + d * o.waler, x0 + d * o.outer)} y0={z - L.waler.gap / 2 - L.waler.B} y1={z - L.waler.gap / 2} webAt="y1"/>
      </g>)}
    </g>)}
    {L.tie && L.levels.map((z, i) => <g key={i}><Line a={P(-o.outer - 60, z)} b={P(W + o.outer + 60, z)} w={LW.med} color={C.tie}/>
      {[-o.outer - 6, W + o.outer + 6].map((x, j) => <rect key={j} x={P(x, z)[0] - 0.5} y={P(x, z)[1] - 1.6} width={1} height={3.2} fill="#333"/>)}</g>)}
    <Txt x={P(W / 2, H / 2)[0]} y={P(W / 2, H / 2)[1]} s={2.6} a="middle" fill="#555">คอนกรีต</Txt>
    <Dim a={P(0, 0)} b={P(0, H)} o={[-(os + 8), 0]} text={mm(H)}/>
    <ChainDim pts={[0, ...L.levels, H].map(z => P(W, z))} values={diffs([0, ...L.levels, H])} o={[os + 8, 0]}/>
    <Dim a={P(0, 0)} b={P(W, 0)} o={[0, 8]} text={mm(W)}/>
    <Dim a={P(-o.outer, 0)} b={P(W + o.outer, 0)} o={[0, 14]} text={mm(W + 2 * o.outer)}/>
    {[
      {from: P(W + t / 2, H * 0.62), text: `ไม้อัด หนา ${t}`},
      {from: P(W + (o.stud + o.waler) / 2, H * 0.45), text: `คร่าว ${L.stud.label}`},
      ...(L.levels.length > 1 ? [{from: P(W + (o.waler + o.outer) / 2, L.levels[L.levels.length - 2] + L.waler.gap / 2 + L.waler.B / 2), text: `คานคู่ ${L.waler.label}`}] : []),
      ...(L.tie && L.levels.length > 1 ? [{from: P(W * 0.8, L.levels[1]), text: `Tie rod ${L.tie.label}`}] : []),
    ].map((l, i) => <Leader key={i} from={l.from} to={[P(W + o.outer, 0)[0] + os * 0 + 22, P(0, H)[1] + 8 + i * 8]} text={l.text}/>)}
    {!L.tie && <Txt x={P(W / 2, H)[0]} y={P(0, H)[1] - 4} s={2.2} a="middle" fill={C.waler}>{L.kind === 'COLUMN' ? 'ชุดรัดเสาโดยคานคู่รอบ 4 ด้าน (ไม่มี Tie ทะลุ)' : 'ไม่มี Tie ทะลุในรูปทรงนี้'}</Txt>}
    {titled && <ViewTitle x={box.x + 4} y={box.y + box.h - 4} n={n} title="รูปตัด A-A (SECTION A-A)" scale={S}/>}
  </g>;
}

export function ElevationView({L, box, n = '3', titled = true}: {L: FormworkLayout; box: Box; n?: string; titled?: boolean}) {
  const f = L.faces[0], e = L.offsets.extension, Lf = f.length, H = L.height, g = L.waler.gap;
  const S = fitScale(Lf + 2 * e, H, box.w - 44, box.h - 50), P = mapper(box, [-e, Lf + e, 0, H], S, 14);
  const joints = {u: Array.from({length: Math.max(0, Math.ceil(Lf / L.plywood.sheetW) - 1)}, (_, i) => (i + 1) * L.plywood.sheetW),
    z: Array.from({length: Math.max(0, Math.ceil(H / L.plywood.sheetH) - 1)}, (_, i) => (i + 1) * L.plywood.sheetH)};
  return <g>
    <Line a={P(-e - 200, 0)} b={P(Lf + e + 200, 0)} w={LW.thick}/>
    <polygon points={poly(rect(P, 0, 0, Lf, H))} fill="#fbf3e4" stroke={C.ply} strokeWidth={LW.thin}/>
    {joints.u.map(u => <Line key={'u' + u} a={P(u, 0)} b={P(u, H)} w={LW.hair} dash="2 1" color={C.ply}/>)}
    {joints.z.map(z => <Line key={'z' + z} a={P(0, z)} b={P(Lf, z)} w={LW.hair} dash="2 1" color={C.ply}/>)}
    {f.studs.map((s, i) => <polygon key={i} points={poly(rect(P, s - L.stud.B / 2, 0, s + L.stud.B / 2, H))} fill="#dbe6f4" stroke={C.stud} strokeWidth={LW.thin}/>)}
    {L.levels.map((z, i) => <g key={i}>{[[z + g / 2, z + g / 2 + L.waler.B], [z - g / 2 - L.waler.B, z - g / 2]].map(([a, b], j) =>
      <polygon key={j} points={poly(rect(P, -f.extStart, a, Lf + f.extEnd, b))} fill="#f3d0d0" stroke={C.waler} strokeWidth={LW.thin}/>)}</g>)}
    {f.ties.flatMap(u => L.levels.map((z, i) => {const p = P(u, z), r = Math.max(L.tie!.d / 2 / S, 0.7);
      return <g key={u + ':' + i}><rect x={p[0] - 1.4} y={p[1] - 1.4} width={2.8} height={2.8} fill="#fff" stroke="#333" strokeWidth={LW.thin}/><circle cx={p[0]} cy={p[1]} r={r} fill={C.tie}/></g>;}))}
    <ChainDim pts={f.studs.map(s => P(s, H))} values={diffs(f.studs)} o={[0, -6]}/>
    {f.ties.length > 0 && <ChainDim pts={[0, ...f.ties, Lf].map(u => P(u, 0))} values={diffs([0, ...f.ties, Lf])} o={[0, 7]}/>}
    <Dim a={P(0, 0)} b={P(Lf, 0)} o={[0, 13]} text={mm(Lf)}/>
    <ChainDim pts={[0, ...L.levels, H].map(z => P(-e, z))} values={diffs([0, ...L.levels, H])} o={[-6, 0]}/>
    <Dim a={P(Lf + e, 0)} b={P(Lf + e, H)} o={[7, 0]} text={mm(H)}/>
    {titled && <ViewTitle x={box.x + 4} y={box.y + box.h - 4} n={n} title={`รูปด้านแบบหล่อ ด้าน ${f.id} (ELEVATION E1)`} scale={S} sub={`เส้นประ = รอยต่อแผ่นไม้อัด ${L.plywood.sheetW}×${L.plywood.sheetH}`}/>}
  </g>;
}

/** Section through one waler level perpendicular to the face: tie assembly (footing) or yoke rail (column). */
export function TieDetail({L, box, n = 'A', titled = true}: {L: FormworkLayout; box: Box; n?: string; titled?: boolean}) {
  const o = L.offsets, t = L.plywood.t, g = L.waler.gap, B = L.waler.B, d = L.tie?.d ?? 16, zr = g / 2 + B + 110, n0 = -130, n1 = o.outer + 150;
  const S = fitScale(n1 - n0, 2 * zr, box.w - 70, box.h - 34), P = mapper(box, [n0, n1, -zr, zr], S, 14), right = P(n1, 0)[0] + 4;
  return <g>
    <polygon points={poly(rect(P, n0, -zr, 0, zr))} fill="url(#h-concrete)" stroke="none"/>
    <Line a={P(0, -zr)} b={P(0, zr)} w={LW.thick}/>
    <polyline points={poly([P(n0, -zr), P(n0, -zr * 0.2), P(n0 + 15, -zr * 0.1), P(n0 - 15, zr * 0.1), P(n0, zr * 0.2), P(n0, zr)])} fill="none" stroke="#111" strokeWidth={LW.thin}/>
    <polygon points={poly(rect(P, 0, -zr, t, zr))} fill="url(#h-plywood)" stroke={C.ply} strokeWidth={LW.thin}/>
    <polygon points={poly(rect(P, o.stud, -zr, o.waler, zr))} fill="none" stroke={C.stud} strokeWidth={LW.thin} strokeDasharray="2 1"/>
    <WalerMember L={L} P={P} x0={o.waler} x1={o.outer} y0={g / 2} y1={g / 2 + B} webAt="y0"/>
    <WalerMember L={L} P={P} x0={o.waler} x1={o.outer} y0={-g / 2 - B} y1={-g / 2} webAt="y1"/>
    {L.tie && <>
      <polygon points={poly(rect(P, n0 + 20, -d / 2, o.outer + 12 + d + 45, d / 2))} fill="#cfe8d5" stroke={C.tie} strokeWidth={LW.thin}/>
      <polygon points={poly(rect(P, o.outer, -55, o.outer + 12, 55))} fill="#666" stroke="#111" strokeWidth={LW.thin}/>
      <polygon points={poly(rect(P, o.outer + 12, -d * 0.95, o.outer + 12 + d, d * 0.95))} fill="#999" stroke="#111" strokeWidth={LW.thin}/>
    </>}
    <ChainDim pts={[0, t, o.waler, o.outer].map(x => P(x, zr))} values={[t, o.waler - t, o.outer - o.waler]} o={[0, -5]}/>
    <ChainDim pts={[-g / 2 - B, -g / 2, g / 2, g / 2 + B].map(z => P(o.outer, z))} values={[B, g, B]} o={[(n1 - o.outer) / S - 2, 0]}/>
    <Leader from={P(n0 / 2, zr * 0.75)} to={[P(n0, 0)[0] - 2, P(0, zr * 0.92)[1]]} text="คอนกรีต"/>
    {[
      {from: P(t / 2, zr * 0.8), text: `ไม้อัด หนา ${t} mm`},
      {from: P((o.waler + o.outer) / 2, g / 2 + B / 2), text: `คานคู่ ${L.waler.label}`},
      ...(L.tie ? [{from: P(o.outer + 12 + d / 2, d * 0.6), text: 'นอต', lines: ['ใช้ร่วมกับ SWL ชุด Tie']},
        {from: P(o.outer + 6, -40), text: 'แผ่นรอง', lines: ['รุ่น/ขนาดยังไม่กำหนด']}] : []),
      {from: P((o.stud + o.waler) / 2, -zr * 0.75), text: `คร่าว ${L.stud.label} (อยู่ถัดไป)`},
    ].map((l, i, all) => <Leader key={i} from={l.from} to={[right, P(0, zr)[1] + 4 + i * (2 * zr / S - 8) / Math.max(all.length - 1, 1)]} text={l.text} lines={l.lines}/>)}
    {L.tie ? <Leader from={P(-60, 0)} to={[P(n0, 0)[0] - 2, P(0, -zr * 0.5)[1]]} text={`Tie rod ${L.tie.label}`}/>
      : <Txt x={P(o.outer, 0)[0] + 3} y={P(0, 0)[1] + 1} s={2.2} fill={C.waler}>ช่องว่างระหว่างคานคู่ (ไม่มี Tie ทะลุ)</Txt>}
    {titled && <ViewTitle x={box.x + 4} y={box.y + box.h - 4} n={n} title={L.tie ? 'รายละเอียดชุด Tie rod (TIE DETAIL)' : 'รายละเอียดคานคู่ชุดรัด (YOKE SECTION)'} scale={S}/>}
  </g>;
}

export function CornerDetail({L, box, n = 'B', titled = true}: {L: FormworkLayout; box: Box; n?: string; titled?: boolean}) {
  const o = L.offsets, t = L.plywood.t, e = o.extension, R = Math.max(500, L.stud.B * 4), sp = L.faces[0].studs[1] ?? R;
  const S = fitScale(R + e + 120, R + e + 120, box.w - 70, box.h - 40), P = mapper(box, [-e - 60, R, -e - 60, R], S, 14);
  const jx = -(o.waler + o.outer) / 2, right = P(R, 0)[0] + 4;
  return <g>
    <polygon points={poly(rect(P, 0, 0, R, R))} fill="url(#h-concrete)" stroke="none"/>
    <polyline points={poly([P(R, 0), P(0, 0), P(0, R)])} fill="none" stroke="#111" strokeWidth={LW.thick}/>
    <polygon points={poly(rect(P, -t, -t, R, 0))} fill="url(#h-plywood)" stroke={C.ply} strokeWidth={LW.thin}/>
    <polygon points={poly(rect(P, -t, 0, 0, R))} fill="url(#h-plywood)" stroke={C.ply} strokeWidth={LW.thin}/>
    {[L.stud.B / 2, sp].filter(s => s + L.stud.B / 2 <= R).map((s, i) => <g key={i}>
      <StudMember L={L} P={P} x0={s - L.stud.B / 2} x1={s + L.stud.B / 2} y0={-o.waler} y1={-o.stud}/>
      <StudMember L={L} P={P} x0={-o.waler} x1={-o.stud} y0={s - L.stud.B / 2} y1={s + L.stud.B / 2}/></g>)}
    <polygon points={poly(rect(P, -e, -o.outer, R, -o.waler))} fill="#fbeaea" fillOpacity={0.85} stroke={C.waler} strokeWidth={LW.med}/>
    <polygon points={poly(rect(P, -o.outer, -e, -o.waler, R))} fill="#fbeaea" fillOpacity={0.85} stroke={C.waler} strokeWidth={LW.med} strokeDasharray="2 0.8"/>
    <circle cx={P(jx, jx)[0]} cy={P(jx, jx)[1]} r={2.2} fill="none" stroke="#111" strokeWidth={LW.med}/>
    <path d={`M${P(jx, jx)[0] - 2.8} ${P(jx, jx)[1]}h5.6M${P(jx, jx)[0]} ${P(jx, jx)[1] - 2.8}v5.6`} stroke="#111" strokeWidth={LW.thin}/>
    <ChainDim pts={[-o.outer, -o.waler, -o.stud, 0].map(x => P(x, R))} values={[o.outer - o.waler, o.waler - o.stud, t]} o={[0, -5]}/>
    <Dim a={P(-e, -o.outer)} b={P(0, -o.outer)} o={[0, 6]} text={mm(e)}/>
    <Leader from={P(jx, jx)} to={[P(-e, 0)[0] - 4, P(0, -e)[1] + 8]} text={L.kind === 'COLUMN' ? 'จุดต่อมุมชุดรัด' : 'จุดต่อมุมคานคู่'} lines={['ยังไม่ออกแบบ / กำลังยังไม่ทราบ']}/>
    <Leader from={P(R * 0.6, -(o.waler + o.outer) / 2)} to={[right, P(0, -o.outer)[1] + 6]} text={`คานคู่ด้าน F1 ${L.waler.label}`}/>
    <Leader from={P(-(o.waler + o.outer) / 2, R * 0.8)} to={[right, P(0, R * 0.95)[1]]} text="คานคู่ด้านตั้งฉาก (คนละระดับ)"/>
    <Leader from={P(R * 0.5, R * 0.5)} to={[right, P(0, R * 0.5)[1]]} text="คอนกรีต"/>
    {titled && <ViewTitle x={box.x + 4} y={box.y + box.h - 4} n={n} title="รายละเอียดมุมแบบหล่อ (CORNER PLAN)" scale={S} sub="คานคู่สองด้านต้องเยื้องระดับที่มุม"/>}
  </g>;
}

export function MemberSections({L, box, n = 'C', titled = true}: {L: FormworkLayout; box: Box; n?: string; titled?: boolean}) {
  const items = [
    {key: 'ply', w: 200, h: L.plywood.t, title: 'ไม้อัด (Plywood)', spec: `หนา ${L.plywood.t} mm`},
    {key: 'stud', w: L.stud.B, h: L.stud.H, title: 'คร่าว (Stud)', spec: L.stud.label},
    {key: 'waler', w: L.waler.H, h: 2 * L.waler.B + L.waler.gap, title: 'คานคู่ (Twin waler)', spec: L.waler.label},
    ...(L.tie ? [{key: 'tie', w: L.tie.d, h: L.tie.d, title: 'Tie rod', spec: L.tie.label}] : []),
  ];
  const cell = (box.w - 8) / items.length, S = fitScale(Math.max(...items.map(i => i.w)), Math.max(...items.map(i => i.h)), cell - 22, box.h - 46);
  return <g>
    {items.map((it, i) => {
      const cx = box.x + 4 + cell * i + cell / 2, cy = box.y + (box.h - 14) / 2 - 3, P: Mapper = (x, y) => [cx + (x - it.w / 2) / S, cy - (y - it.h / 2) / S];
      return <g key={it.key}>
        {it.key === 'ply' && <polygon points={poly(rect(P, 0, 0, it.w, it.h))} fill="url(#h-plywood)" stroke={C.ply} strokeWidth={LW.med}/>}
        {it.key === 'stud' && <StudMember L={L} P={P} x0={0} y0={0} x1={it.w} y1={it.h}/>}
        {it.key === 'waler' && <><WalerMember L={L} P={P} x0={0} y0={0} x1={it.w} y1={L.waler.B} webAt="y1"/><WalerMember L={L} P={P} x0={0} y0={L.waler.B + L.waler.gap} x1={it.w} y1={it.h} webAt="y0"/>
          {L.tie && <circle cx={P(it.w / 2, it.h / 2)[0]} cy={P(it.w / 2, it.h / 2)[1]} r={L.tie.d / 2 / S} fill={C.tie}/>}</>}
        {it.key === 'tie' && <circle cx={P(it.w / 2, it.h / 2)[0]} cy={P(it.w / 2, it.h / 2)[1]} r={it.w / 2 / S} fill={C.tie}/>}
        <Dim a={P(0, 0)} b={P(it.w, 0)} o={[0, 4]} text={mm(it.w)}/>
        {it.key !== 'tie' && <Dim a={P(it.w, 0)} b={P(it.w, it.h)} o={[4, 0]} text={mm(it.h)}/>}
        <Txt x={cx} y={box.y + box.h - 22} s={2.6} a="middle" b>{it.title}</Txt>
        <Txt x={cx} y={box.y + box.h - 18.5} s={2.2} a="middle">{it.spec}</Txt>
      </g>;
    })}
    {titled && <ViewTitle x={box.x + 4} y={box.y + box.h - 4} n={n} title="หน้าตัดองค์อาคาร (MEMBER SECTIONS)" scale={S}/>}
  </g>;
}

export function IsoView({scene, box, n = 'D', titled = true}: {scene: Scene; box: Box; n?: string; titled?: boolean}) {
  const {faces, bounds: b} = projectSolids(scene.solids, -0.75, 0.55), h = box.h - 16;
  const k = Math.min((box.w - 8) / (b.maxX - b.minX), h / (b.maxY - b.minY));
  const tx = box.x + box.w / 2 - (b.minX + b.maxX) / 2 * k, ty = box.y + h / 2 + 2 - (b.minY + b.maxY) / 2 * k;
  return <g>
    <g transform={`translate(${tx} ${ty}) scale(${k})`}>
      {faces.map((f, i) => <path key={i} d={f.d} fill={f.fill} fillOpacity={f.opacity} stroke={f.fill} strokeOpacity={f.opacity} strokeWidth={0.12} vectorEffect="non-scaling-stroke"/>)}
    </g>
    {titled && <ViewTitle x={box.x + 4} y={box.y + box.h - 4} n={n} title="ภาพ 3 มิติ (3D VIEW)" scale={null} sub="ภาพประกอบ ไม่ใช่แบบติดตั้ง"/>}
  </g>;
}

export function wrap(text: string, max: number): string[] {
  const out: string[] = []; let line = '';
  for (const word of text.split(' ')) {
    if ((line + ' ' + word).trim().length > max && line) {out.push(line); line = word;} else line = (line + ' ' + word).trim();
    while (line.length > max) {out.push(line.slice(0, max)); line = line.slice(max);}
  }
  if (line) out.push(line);
  return out;
}
export function NoteBlock({x, y, w, title, items, s = 2.2}: {x: number; y: number; w: number; title: string; items: string[]; s?: number}) {
  const max = Math.floor(w / (s * 0.52)); let yy = y + 6;
  return <g>
    <Txt x={x} y={y + 2} s={3} b>{title}</Txt>
    <line x1={x} y1={y + 3.2} x2={x + w} y2={y + 3.2} stroke="#111" strokeWidth={LW.med}/>
    {items.map((it, i) => wrap(it, max - 4).map((ln, j) => {yy += s * 1.45; return <Txt key={i + ':' + j} x={x + (j ? 4 : 0)} y={yy} s={s}>{j ? ln : `${i + 1}. ${ln}`}</Txt>;}))}
  </g>;
}
export function Legend({x, y}: {x: number; y: number}) {
  const rows: [string, ReactElement][] = [
    ['คอนกรีต', <rect width={8} height={4} fill="url(#h-concrete)" stroke="#111" strokeWidth={LW.thin}/>],
    ['ไม้อัด', <rect width={8} height={4} fill="url(#h-plywood)" stroke={C.ply} strokeWidth={LW.thin}/>],
    ['คร่าว (Stud)', <rect width={8} height={4} fill="#dbe6f4" stroke={C.stud} strokeWidth={LW.med}/>],
    ['คานคู่ (Twin waler)', <rect width={8} height={4} fill="#fbeaea" stroke={C.waler} strokeWidth={LW.med}/>],
    ['Tie rod + แผ่นรอง', <g><line x1={0} y1={2} x2={8} y2={2} stroke={C.tie} strokeWidth={LW.med} strokeDasharray="3 1"/><rect x={6.9} y={0.9} width={2.2} height={2.2} fill={C.tie}/></g>],
  ];
  return <g>
    <Txt x={x} y={y + 2} s={3} b>สัญลักษณ์ (LEGEND)</Txt>
    <line x1={x} y1={y + 3.2} x2={x + 100} y2={y + 3.2} stroke="#111" strokeWidth={LW.med}/>
    {rows.map(([label, sym], i) => <g key={label}><g transform={`translate(${x} ${y + 6 + i * 6.5})`}>{sym}</g><Txt x={x + 12} y={y + 9.3 + i * 6.5} s={2.3}>{label}</Txt></g>)}
  </g>;
}
