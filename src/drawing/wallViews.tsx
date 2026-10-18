import type {WallResult} from '../domain/wall';
import {C, Member, diffs, mapper, rect} from './beamViews';
import {ChainDim, Dim, Leader, Line, LW, SectionMark, Txt, ViewTitle, fitScale, mm, poly, type Box} from './primitives';

const GAP = 20;
/** Offsets from the concrete face outwards (mm): plywood, studs, twin walers. */
const offsets = (r: WallResult) => {const t = r.input.plywood, s = t + r.stud.section.H, w = s + r.waler.section.H; return {ply: t, stud: s, waler: w, outer: w + (r.strongback?.section.H ?? 0)};};

export function WallElevationView({r, box, n = '1', titled = true}: {r: WallResult; box: Box; n?: string; titled?: boolean}) {
  const x = r.input, ext: [number, number, number, number] = [-500, x.length + 500, -500, x.height + 500], bS = r.stud.section.B, wB = r.waler.section.B;
  const S = fitScale(ext[1] - ext[0], ext[3] - ext[2], box.w - 40, box.h - 34), P = mapper(box, ext, S);
  return <g>
    <rect x={P(ext[0], 0)[0]} y={P(0, 0)[1]} width={(ext[1] - ext[0]) / S} height={2} fill="url(#h-ground)"/>
    <Line a={P(ext[0], 0)} b={P(ext[1], 0)} w={LW.thick}/>
    <polygon points={poly(rect(P, 0, 0, x.length, x.height))} fill="#f6e3c3" fillOpacity={0.35} stroke={C.ply} strokeWidth={LW.med}/>
    {r.studs.map((z, i) => <polygon key={i} points={poly(rect(P, Math.max(0, z - bS / 2), 0, Math.min(x.length, z + bS / 2), x.height))} fill="#dbe6f4" stroke={C.stud} strokeWidth={LW.hair}/>)}
    {r.levels.map((z, i) => [z + GAP / 2, z - GAP / 2 - wB].map((y0, j) => <polygon key={i + ':' + j} points={poly(rect(P, -150, Math.max(-40, y0), x.length + 150, Math.min(x.height + 40, y0 + wB)))} fill="#fbeaea" stroke={C.waler} strokeWidth={LW.thin}/>))}
    {r.levels.flatMap(z => r.ties.map(t => <circle key={z + ':' + t} cx={P(t, z)[0]} cy={P(t, z)[1]} r={0.9} fill={C.tie}/>))}
    {r.strongback && r.braces.map((z, i) => <polygon key={'sb' + i} points={poly(rect(P, z - r.strongback!.section.B, -30, z + r.strongback!.section.B, x.height + 30))} fill={C.waler} fillOpacity={0.55} stroke={C.waler} strokeWidth={LW.thin}/>)}
    {r.braces.map((z, i) => <path key={i} d={`M${P(z, 0)[0] - 2} ${P(z, 0)[1] + 3.5}h4l-2 -3.5z`} fill={C.shore}/>)}
    <ChainDim pts={r.studs.map(z => P(z, x.height))} values={diffs(r.studs)} o={[0, -7]} total={mm(x.length)}/>
    <ChainDim pts={r.levels.map(z => P(x.length, z))} values={diffs(r.levels)} o={[9, 0]} total={mm(x.height)}/>
    {r.ties.length > 0 ? <ChainDim pts={r.ties.map(z => P(z, 0))} values={diffs(r.ties)} o={[0, 9]} total={mm(x.length)}/> : <ChainDim pts={r.braces.map(z => P(z, 0))} values={diffs(r.braces)} o={[0, 9]} total={mm(x.length)}/>}
    <Dim a={P(0, 0)} b={P(x.length, 0)} o={[0, 16]} text={'ยาว ' + mm(x.length)}/>
    <Dim a={P(0, 0)} b={P(0, x.height)} o={[-8, 0]} text={'สูงเท ' + mm(x.height)}/>
    {(() => {const xs = r.ties.length > 1 ? (r.ties[0] + r.ties[1]) / 2 : (r.studs[0] + r.studs[1]) / 2; return <SectionMark a={P(xs, x.height + 380)} b={P(xs, -380)} id="A" view={[1, 0]}/>;})()}
    <Txt x={P(x.length / 2, 0)[0]} y={P(0, 0)[1] + 22} s={2.1} a="middle" fill="#555">▲ = ตำแหน่งค้ำยันเอียง {r.braces.length} ตัว @ {mm(x.length / (r.braces.length - 1))} {r.strongback ? ' · แถบแดงแนวตั้ง = strongback' : ' · ● = Tie'}</Txt>
    {titled && <ViewTitle x={box.x + 4} y={box.y + box.h - 4} n={n} title="รูปด้านแบบหล่อผนัง (FORMWORK ELEVATION)" scale={S} sub={r.strongback ? "แบบด้านเดียว · คร่าว คานคู่ strongback" : "คร่าวแนวตั้ง คานคู่แนวนอน Tie"}/>}
  </g>;
}

export function WallSectionView({r, box, n = '2', titled = true}: {r: WallResult; box: Box; n?: string; titled?: boolean}) {
  const x = r.input, o = offsets(r), t2 = x.t / 2, wB = r.waler.section.B, rad = x.braceAngle * Math.PI / 180, reach = x.braceHeight / Math.tan(rad), single = !!r.strongback;
  const left = -t2 - o.outer - reach - 300, ext: [number, number, number, number] = [left, t2 + o.waler + 900, -300, x.height + 300];
  const labelW = Math.min(95, box.w * 0.45), dbox = {...box, w: box.w - labelW};
  const S = fitScale(ext[1] - ext[0], ext[3] - ext[2], dbox.w - 30, box.h - 34), P = mapper(dbox, ext, S);
  const bx0 = -t2 - o.outer, base = bx0 - reach;
  return <g>
    <rect x={P(ext[0], 0)[0]} y={P(0, 0)[1]} width={(ext[1] - ext[0]) / S} height={2} fill="url(#h-ground)"/>
    <Line a={P(ext[0], 0)} b={P(ext[1], 0)} w={LW.thick}/>
    <polygon points={poly(rect(P, -t2, 0, t2, x.height))} fill="url(#h-concrete)" stroke="#111" strokeWidth={LW.thick}/>
    {single && <><polygon points={poly(rect(P, t2, -200, t2 + 600, x.height + 150))} fill="url(#h-ground)" stroke="#555" strokeWidth={LW.thin}/>
      <Txt x={P(t2 + 300, 0)[0]} y={P(0, x.height / 2)[1]} s={2.2} a="middle" rot={-90} fill="#555">ดิน / ผนังเดิม (ผิวเทชน)</Txt>
      <Member P={P} x0={-t2 - o.outer} y0={0} x1={-t2 - o.waler} y1={x.height} m={r.strongback!} color={C.waler}/></>}
    {(single ? [-1] : [-1, 1]).map(d => {
      const f = d * t2, a = f + d * o.ply, b = f + d * o.stud, c = f + d * o.waler;
      return <g key={d}>
        <polygon points={poly(rect(P, Math.min(f, a), 0, Math.max(f, a), x.height))} fill="url(#h-plywood)" stroke={C.ply} strokeWidth={LW.thin}/>
        <Member P={P} x0={Math.min(a, b)} y0={0} x1={Math.max(a, b)} y1={x.height} m={r.stud} color={C.stud}/>
        {r.levels.map((z, i) => [z + GAP / 2, z - GAP / 2 - wB].map((y0, j) => <Member key={i + ':' + j} P={P} x0={Math.min(b, c)} y0={Math.max(0, y0)} x1={Math.max(b, c)} y1={Math.min(x.height, y0 + wB)} m={r.waler} color={C.waler}/>))}
      </g>;
    })}
    {!single && r.levels.map((z, i) => <Line key={i} a={P(-t2 - o.waler - 60, z)} b={P(t2 + o.waler + 60, z)} w={LW.med} color={C.tie}/>)}
    <Line a={P(base, 0)} b={P(bx0, x.braceHeight)} w={0.7} color={C.shore}/>
    <polygon points={poly(rect(P, base - 120, 0, base + 120, 15))} fill="#ddd" stroke="#333" strokeWidth={LW.thin}/>
    <Txt x={P(base, 0)[0] + 9} y={P(0, 0)[1] - 2} s={2} fill={C.shore}>θ = {x.braceAngle}°</Txt>
    <Dim a={P(base - 250, 0)} b={P(base - 250, x.braceHeight)} o={[-3, 0]} text={'hb ' + mm(x.braceHeight)}/>
    <Dim a={P(-t2, x.height)} b={P(t2, x.height)} o={[0, -6]} text={mm(x.t)}/>
    <Dim a={P(t2 + (single ? 700 : o.waler + 300), 0)} b={P(t2 + (single ? 700 : o.waler + 300), x.height)} o={[6, 0]} text={mm(x.height)}/>
    <ChainDim pts={r.levels.map(z => P(single ? -t2 - o.outer - 80 : t2 + o.waler + 200, z))} values={diffs(r.levels)} o={[single ? -3 : 3, 0]}/>
    {[
      {from: P(-t2 - o.ply / 2, x.height * 0.8), text: `ไม้อัด ${x.plywood} mm`},
      {from: P(-t2 - (o.ply + o.stud) / 2, x.height * 0.62), text: `คร่าว ${r.stud.name} @ ${mm(x.length / (r.studs.length - 1))}`},
      {from: P(-t2 - (o.stud + o.waler) / 2, r.levels[r.levels.length - 2]), text: `คานคู่ 2×${r.waler.name} @ ${mm(x.height / (r.levels.length - 1))}`},
      single ? {from: P(-t2 - (o.waler + o.outer) / 2, x.height * 0.92), text: `Strongback ${x.strongbackCount > 1 ? '2×' : ''}${r.strongback!.name} @ ${mm(x.length / (r.braces.length - 1))}`}
        : {from: P(0, r.levels[1]), text: `Tie Ø${x.tieDiameter} @ ${mm(x.length / (r.ties.length - 1))} · ${r.tieForce.toFixed(1)} kN`},
      {from: P((base + bx0) / 2, x.braceHeight / 2), text: `ค้ำยันเอียง @ ${mm(x.length / (r.braces.length - 1))} · ${r.braceForce.toFixed(1)} kN`},
    ].map((l, i) => <Leader key={i} from={l.from} to={[dbox.x + dbox.w + 2, P(0, x.height)[1] + 4 + i * 9]} text={l.text} s={2.1}/>)}
    {titled && <ViewTitle x={box.x + 4} y={box.y + box.h - 4} n={n} title="รูปตัด A-A ผนัง (WALL SECTION)" scale={S} sub={single ? "แบบด้านเดียว" : "แบบสองด้าน"}/>}
  </g>;
}

export function WallPlanView({r, box, n = '3', titled = true}: {r: WallResult; box: Box; n?: string; titled?: boolean}) {
  const x = r.input, o = offsets(r), t2 = x.t / 2, ext: [number, number, number, number] = [-400, x.length + 400, -t2 - o.waler - 400, t2 + o.waler + 400], bS = r.stud.section.B;
  const S = fitScale(ext[1] - ext[0], ext[3] - ext[2], box.w - 30, box.h - 30), P = mapper(box, ext, S);
  return <g>
    <polygon points={poly(rect(P, 0, -t2, x.length, t2))} fill="url(#h-concrete)" stroke="#111" strokeWidth={LW.thick}/>
    {r.strongback && <polygon points={poly(rect(P, -150, t2, x.length + 150, t2 + 400))} fill="url(#h-ground)" stroke="#555" strokeWidth={LW.hair}/>}
    {r.strongback && r.braces.map((z, i) => <polygon key={'sb' + i} points={poly(rect(P, z - r.strongback!.section.B, -t2 - o.outer, z + r.strongback!.section.B, -t2 - o.waler))} fill={C.waler} stroke={C.waler} strokeWidth={LW.hair}/>)}
    {(r.strongback ? [-1] : [-1, 1]).map(d => <g key={d}>
      <polygon points={poly(rect(P, 0, Math.min(d * t2, d * (t2 + o.ply)), x.length, Math.max(d * t2, d * (t2 + o.ply))))} fill="url(#h-plywood)" stroke={C.ply} strokeWidth={LW.hair}/>
      {r.studs.map((z, i) => <polygon key={i} points={poly(rect(P, Math.max(0, z - bS / 2), Math.min(d * (t2 + o.ply), d * (t2 + o.stud)), Math.min(x.length, z + bS / 2), Math.max(d * (t2 + o.ply), d * (t2 + o.stud))))} fill="#dbe6f4" stroke={C.stud} strokeWidth={LW.hair}/>)}
      <polygon points={poly(rect(P, -150, Math.min(d * (t2 + o.stud), d * (t2 + o.waler)), x.length + 150, Math.max(d * (t2 + o.stud), d * (t2 + o.waler))))} fill="#fbeaea" stroke={C.waler} strokeWidth={LW.thin}/>
    </g>)}
    {r.ties.map((z, i) => <Line key={i} a={P(z, -t2 - o.waler - 60)} b={P(z, t2 + o.waler + 60)} w={LW.med} color={C.tie}/>)}
    {(() => {const st = r.ties.length ? r.ties : r.braces; return <ChainDim pts={st.map(z => P(z, -t2 - o.outer))} values={diffs(st)} o={[0, 7]} total={mm(x.length)}/>;})()}
    <Dim a={P(x.length, -t2)} b={P(x.length, t2)} o={[10, 0]} text={mm(x.t)}/>
    {titled && <ViewTitle x={box.x + 4} y={box.y + box.h - 4} n={n} title="แปลนแบบหล่อผนังที่ระดับคานคู่ (PLAN AT WALER)" scale={S}/>}
  </g>;
}
