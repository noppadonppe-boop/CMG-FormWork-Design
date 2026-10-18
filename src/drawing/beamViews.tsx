import type {BeamResult, MemberMaterial} from '../domain/beam';
import {ChainDim, Dim, Leader, Line, LW, SectionMark, Txt, ViewTitle, fitScale, mm, poly, type Box, type V} from './primitives';

const C = {stud: '#1d4e89', waler: '#9b1c1c', tie: '#1e7b34', ply: '#9a6a2c', shore: '#5b3f8c'};
type Mapper = (x: number, y: number) => V;
function mapper(box: Box, ext: [number, number, number, number], S: number, titleSpace = 14): Mapper {
  const [x0, x1, y0, y1] = ext, cx = box.x + box.w / 2, cy = box.y + (box.h - titleSpace) / 2;
  return (x, y) => [cx + (x - (x0 + x1) / 2) / S, cy - (y - (y0 + y1) / 2) / S];
}
const rect = (P: Mapper, x0: number, y0: number, x1: number, y1: number): V[] => [P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1)];
const diffs = (v: number[]) => v.slice(1).map((p, i) => p - v[i]);
/** Member in cross-section: hatched timber, hollow box (SHS/RHS) or solid outline for open/round shapes. */
function Member({P, x0, y0, x1, y1, m, color}: {P: Mapper; x0: number; y0: number; x1: number; y1: number; m: MemberMaterial; color: string}) {
  if (m.timber) return <polygon points={poly(rect(P, x0, y0, x1, y1))} fill="url(#h-timber)" stroke="#8a5a24" strokeWidth={LW.thin}/>;
  const t = m.section.t, box = m.section.family === 'SHS' || m.section.family === 'RHS';
  return <g><polygon points={poly(rect(P, x0, y0, x1, y1))} fill={color} stroke={color} strokeWidth={LW.thin}/>
    {box && x1 - x0 > 2 * t && y1 - y0 > 2 * t && <polygon points={poly(rect(P, x0 + t, y0 + t, x1 - t, y1 - t))} fill="#fff"/>}</g>;
}
/** Vertical stack measured up from the floor (mm). */
export function beamStack(r: BeamResult) {
  const x = r.input, shoreTop = r.shoreLength, bearerTop = shoreTop + r.bearer.section.H, joistTop = bearerTop + r.joist.section.H;
  return {shoreTop, bearerTop, joistTop, soffit: x.soffitHeight, top: x.soffitHeight + x.h};
}

export function BeamSectionView({r, box, n = '1', titled = true}: {r: BeamResult; box: Box; n?: string; titled?: boolean}) {
  const x = r.input, t = x.plywood, b2 = x.b / 2, sw2 = x.shoreWidth / 2, sH = r.stud.section.H, wH = r.waler.section.H, wB = r.waler.section.B;
  // Shores are drawn broken (at most 700 mm shown) so the formwork reads at a useful scale; dimensions keep true values.
  const s0 = beamStack(r), cut = Math.max(0, s0.shoreTop - 700), s = {shoreTop: s0.shoreTop - cut, bearerTop: s0.bearerTop - cut, joistTop: s0.joistTop - cut, soffit: s0.soffit - cut, top: s0.top - cut};
  const slabExt = Math.max(500, sw2 - b2 + 300), ext: [number, number, number, number] = [-b2 - slabExt - 150, b2 + slabExt + 150, -250, s.top + 200];
  const labelW = Math.min(105, box.w * 0.42), dbox = {...box, w: box.w - labelW};
  const S = fitScale(ext[1] - ext[0], ext[3] - ext[2], dbox.w - 30, box.h - 30), P = mapper(dbox, ext, S), bB = r.bearer.section.B;
  const slabs = [x.slabSides === 2, x.slabSides >= 1];
  return <g>
    <rect x={P(ext[0], 0)[0]} y={P(0, 0)[1]} width={(ext[1] - ext[0]) / S} height={2} fill="url(#h-ground)"/>
    <Line a={P(ext[0], 0)} b={P(ext[1], 0)} w={LW.thick}/>
    {[-sw2, sw2].map(cx => <g key={cx}>
      <polygon points={poly(rect(P, cx - 75, 0, cx + 75, 8))} fill="#ddd" stroke="#333" strokeWidth={LW.thin}/>
      <polygon points={poly(rect(P, cx - 24, 8, cx + 24, s.shoreTop - 8))} fill="#ece6f5" stroke={C.shore} strokeWidth={LW.med}/>
      {cut > 0 && <polyline points={poly([P(cx - 60, s.shoreTop / 2 - 20), P(cx - 15, s.shoreTop / 2 - 20), P(cx, s.shoreTop / 2 + 15), P(cx + 5, s.shoreTop / 2 - 30), P(cx + 15, s.shoreTop / 2), P(cx + 60, s.shoreTop / 2)])} fill="none" stroke="#111" strokeWidth={LW.thin}/>}
      <polyline points={poly([P(cx - bB / 2 - 10, s.shoreTop + 25), P(cx - bB / 2 - 10, s.shoreTop - 8), P(cx + bB / 2 + 10, s.shoreTop - 8), P(cx + bB / 2 + 10, s.shoreTop + 25)])} fill="none" stroke={C.shore} strokeWidth={LW.med}/>
      <Member P={P} x0={cx - bB / 2} y0={s.shoreTop} x1={cx + bB / 2} y1={s.bearerTop} m={r.bearer} color={C.waler}/>
    </g>)}
    <polygon points={poly(rect(P, -sw2 - bB, s.bearerTop, sw2 + bB, s.joistTop))} fill={r.joist.timber ? 'url(#h-timber)' : '#dbe6f4'} stroke={C.stud} strokeWidth={LW.med}/>
    <polygon points={poly(rect(P, -b2 - t - sH, s.joistTop, b2 + t + sH, s.soffit))} fill="url(#h-plywood)" stroke={C.ply} strokeWidth={LW.thin}/>
    <polygon points={poly(rect(P, -b2, s.soffit, b2, s.top))} fill="url(#h-concrete)" stroke="#111" strokeWidth={LW.thick}/>
    {slabs.map((on, i) => on && <polygon key={i} points={poly(i ? rect(P, b2, s.top - x.slabT, b2 + slabExt, s.top) : rect(P, -b2 - slabExt, s.top - x.slabT, -b2, s.top))} fill="url(#h-concrete)" stroke="#111" strokeWidth={LW.thick}/>)}
    {slabs.map((on, i) => on && <Txt key={'t' + i} x={P(i ? b2 + slabExt * 0.6 : -b2 - slabExt * 0.6, 0)[0]} y={P(0, s.top - x.slabT)[1] + 4} s={2} a="middle" fill="#777">แบบพื้น (ออกแบบแยก)</Txt>)}
    {[-1, 1].map(d => {
      const h = r.sideHeights[d < 0 ? 0 : 1], face = d * b2, k0 = face + d * t, k1 = k0 + d * sH;
      return <g key={d}>
        <polygon points={poly(rect(P, Math.min(face, k0), s.soffit, Math.max(face, k0), s.soffit + h))} fill="url(#h-plywood)" stroke={C.ply} strokeWidth={LW.thin}/>
        <Member P={P} x0={Math.min(k0, k1)} y0={s.joistTop + t} x1={Math.max(k0, k1)} y1={s.soffit + h} m={r.stud} color={C.stud}/>
        <polygon points={poly(rect(P, Math.min(k1, k1 + d * 38), s.joistTop, Math.max(k1, k1 + d * 38), s.joistTop + 75))} fill="url(#h-timber)" stroke="#8a5a24" strokeWidth={LW.thin}/>
        {r.tieLevels.map((z, i) => [z + 10, z - 10 - wB].map((y0, j) => <Member key={i + ':' + j} P={P} x0={Math.min(k1, k1 + d * wH)} y0={s.soffit + y0} x1={Math.max(k1, k1 + d * wH)} y1={s.soffit + y0 + wB} m={r.waler} color={C.waler}/>))}
      </g>;
    })}
    {r.tieLevels.map((z, i) => <Line key={i} a={P(-b2 - t - sH - wH - 60, s.soffit + z)} b={P(b2 + t + sH + wH + 60, s.soffit + z)} w={LW.med} color={C.tie}/>)}
    <Dim a={P(-b2, s.top)} b={P(b2, s.top)} o={[0, -6]} text={mm(x.b)}/>
    <Dim a={P(-sw2, 0)} b={P(sw2, 0)} o={[0, 8]} text={mm(x.shoreWidth)}/>
    <Dim a={P(b2 + slabExt, s.soffit)} b={P(b2 + slabExt, s.top)} o={[7, 0]} text={mm(x.h)}/>
    {x.slabT > 0 && <Dim a={P(b2 + slabExt, s.top - x.slabT)} b={P(b2 + slabExt, s.top)} o={[14, 0]} text={mm(x.slabT)}/>}
    <Dim a={P(ext[0] + 100, 0)} b={P(ext[0] + 100, s.soffit)} o={[-4, 0]} text={mm(x.soffitHeight)}/>
    {r.tieLevels.length > 0 && <ChainDim pts={[0, ...r.tieLevels, r.sideHeights[0]].map(z => P(-b2 - t - sH - wH - 80, s.soffit + z))} values={diffs([0, ...r.tieLevels, r.sideHeights[0]])} o={[-5, 0]}/>}
    {[
      {from: P(b2 + t / 2, s.soffit + r.sideHeights[1] * 0.7), text: `ไม้อัด ${t} mm`},
      {from: P(b2 + t + sH / 2, s.soffit + r.sideHeights[1] * 0.45), text: `คร่าวข้าง ${r.stud.name} @ ${mm(x.length / (r.studs.length - 1))}`},
      {from: P(sw2 * 0.6, (s.bearerTop + s.joistTop) / 2), text: `คร่าวท้อง ${r.joist.name} @ ${mm(x.length / (r.joists.length - 1))}`},
      {from: P(sw2, (s.shoreTop + s.bearerTop) / 2), text: `คานรับ ${x.bearerCount > 1 ? '2×' : ''}${r.bearer.name}`},
      {from: P(sw2, s.shoreTop * 0.5), text: `ค้ำยัน @ ${mm(x.length / (r.shores.length - 1))} · ${r.shoreLoad.toFixed(1)} kN/ต้น`},
      ...(r.tieLevels.length ? [{from: P(0, s.soffit + r.tieLevels[0]), text: `Tie Ø${x.tieDiameter} @ ${mm(x.length / (r.ties.length - 1))} · คานคู่ ${r.waler.name}`}] : []),
    ].map((l, i) => <Leader key={i} from={l.from} to={[dbox.x + dbox.w + 2, P(0, s.top)[1] + 4 + i * 9]} text={l.text} s={2.1}/>)}
    {cut > 0 && <Txt x={P(-sw2, 0)[0] + 3} y={P(0, s.shoreTop / 2)[1] + 6} s={1.9} fill="#555">ค้ำยันแสดงแบบตัดย่อ</Txt>}
    {titled && <ViewTitle x={box.x + 4} y={box.y + box.h - 4} n={n} title="รูปตัด A-A คาน (BEAM SECTION)" scale={S} sub="ตั้งฉากแนวคาน"/>}
  </g>;
}

export function BeamElevationView({r, box, n = '2', titled = true}: {r: BeamResult; box: Box; n?: string; titled?: boolean}) {
  const x = r.input, s0 = beamStack(r), cut = Math.max(0, s0.shoreTop - 700), Lb = x.length;
  const s = {shoreTop: s0.shoreTop - cut, bearerTop: s0.bearerTop - cut, joistTop: s0.joistTop - cut, soffit: s0.soffit - cut, top: s0.top - cut};
  const ext: [number, number, number, number] = [-400, Lb + 400, -300, s.top + 250];
  const S = fitScale(ext[1] - ext[0], ext[3] - ext[2], box.w - 30, box.h - 40), P = mapper(box, ext, S);
  return <g>
    <rect x={P(ext[0], 0)[0]} y={P(0, 0)[1]} width={(ext[1] - ext[0]) / S} height={2} fill="url(#h-ground)"/>
    <Line a={P(ext[0], 0)} b={P(ext[1], 0)} w={LW.thick}/>
    {[-1, Lb + 1].map(cx => <polygon key={cx} points={poly(rect(P, cx < 0 ? -400 : Lb, 0, cx < 0 ? 0 : Lb + 400, s.top + 200))} fill="url(#h-concrete)" stroke="#111" strokeWidth={LW.med}/>)}
    {r.shores.map((z, i) => <polygon key={i} points={poly(rect(P, z - 24, 0, z + 24, s.shoreTop))} fill="#ece6f5" stroke={C.shore} strokeWidth={LW.thin}/>)}
    {cut > 0 && <><Line a={P(-400, s.shoreTop / 2)} b={P(Lb + 400, s.shoreTop / 2)} w={LW.thin} dash="6 1.5 1 1.5"/>
      <Txt x={P(Lb / 2, 0)[0]} y={P(0, s.shoreTop / 2)[1] - 1.5} s={2} a="middle" fill="#555">ค้ำยันแสดงแบบตัดย่อ · ความสูงจริงถึงท้องคาน {mm(x.soffitHeight)} mm</Txt></>}
    <polygon points={poly(rect(P, 0, s.shoreTop, Lb, s.bearerTop))} fill="#fbeaea" stroke={C.waler} strokeWidth={LW.med}/>
    {r.joists.map((z, i) => <polygon key={i} points={poly(rect(P, Math.max(0, z - r.joist.section.B / 2), s.bearerTop, Math.min(Lb, z + r.joist.section.B / 2), s.joistTop))} fill="#dbe6f4" stroke={C.stud} strokeWidth={LW.thin}/>)}
    <polygon points={poly(rect(P, 0, s.joistTop, Lb, s.soffit))} fill="url(#h-plywood)" stroke={C.ply} strokeWidth={LW.thin}/>
    <polygon points={poly(rect(P, 0, s.soffit, Lb, s.top))} fill="#f6f8fa" stroke="#111" strokeWidth={LW.thick}/>
    {r.studs.map((z, i) => <Line key={i} a={P(z, s.soffit)} b={P(z, s.soffit + r.sideHeights[1])} w={LW.med} color={C.stud}/>)}
    {r.tieLevels.map((lv, j) => <g key={j}><Line a={P(0, s.soffit + lv)} b={P(Lb, s.soffit + lv)} w={LW.thick} color={C.waler}/>
      {r.ties.map((z, i) => <circle key={i} cx={P(z, 0)[0]} cy={P(0, s.soffit + lv)[1]} r={0.9} fill={C.tie}/>)}</g>)}
    <Txt x={P(Lb / 2, 0)[0]} y={P(0, 0)[1] + 20} s={2.2} a="middle" fill="#555">ด้านข้างคาน (แสดงคร่าวแนวตั้ง{r.tieLevels.length ? ' คานคู่ และ Tie' : ''})</Txt>
    <ChainDim pts={r.shores.map(z => P(z, 0))} values={diffs(r.shores)} o={[0, 7]} total={mm(Lb)}/>
    <ChainDim pts={r.joists.map(z => P(z, s.top))} values={diffs(r.joists)} o={[0, -7]} total={mm(Lb)}/>
    <Dim a={P(0, 0)} b={P(Lb, 0)} o={[0, 14]} text={'ความยาวคาน ' + mm(Lb)}/>
    {titled && <ViewTitle x={box.x + 4} y={box.y + box.h - 4} n={n} title="รูปด้านตามยาวคาน (LONGITUDINAL ELEVATION)" scale={S} sub="ค้ำยัน คานรับ คร่าวท้อง"/>}
  </g>;
}

export function BeamPlanView({r, box, n = '3', titled = true}: {r: BeamResult; box: Box; n?: string; titled?: boolean}) {
  const x = r.input, Lb = x.length, sw2 = x.shoreWidth / 2, b2 = x.b / 2, ext: [number, number, number, number] = [-300, Lb + 300, -sw2 - 400, sw2 + 400];
  const S = fitScale(ext[1] - ext[0], ext[3] - ext[2], box.w - 30, box.h - 34), P = mapper(box, ext, S), bB = r.bearer.section.B;
  return <g>
    <polygon points={poly(rect(P, 0, -b2, Lb, b2))} fill="none" stroke="#111" strokeWidth={LW.med} strokeDasharray="4 1.5"/>
    {r.joists.map((z, i) => <Line key={i} a={P(z, -sw2 - bB)} b={P(z, sw2 + bB)} w={LW.thin} color={C.stud}/>)}
    {[-sw2, sw2].map(y => <polygon key={y} points={poly(rect(P, 0, y - bB / 2, Lb, y + bB / 2))} fill="#fbeaea" stroke={C.waler} strokeWidth={LW.med}/>)}
    {r.shores.flatMap(z => [-sw2, sw2].map(y => <g key={z + ':' + y}><circle cx={P(z, y)[0]} cy={P(z, y)[1]} r={1.3} fill={C.shore}/><circle cx={P(z, y)[0]} cy={P(z, y)[1]} r={2.2} fill="none" stroke={C.shore} strokeWidth={LW.thin}/></g>))}
    <ChainDim pts={r.shores.map(z => P(z, -sw2))} values={diffs(r.shores)} o={[0, 8]} total={mm(Lb)}/>
    <Dim a={P(0, -sw2)} b={P(0, sw2)} o={[-8, 0]} text={mm(x.shoreWidth)}/>
    <Dim a={P(Lb, -b2)} b={P(Lb, b2)} o={[8, 0]} text={'b ' + mm(x.b)}/>
    <Txt x={P(Lb / 2, 0)[0]} y={P(0, 0)[1] + 1} s={2.2} a="middle" fill="#555">แนวท้องคาน (เส้นประ) · คร่าวท้องตามขวาง {r.joists.length} ตัว</Txt>
    <SectionMark a={P(Lb * 0.35, sw2 + 300)} b={P(Lb * 0.35, -sw2 - 300)} id="A" view={[1, 0]}/>
    {titled && <ViewTitle x={box.x + 4} y={box.y + box.h - 4} n={n} title="แปลนค้ำยันใต้ท้องคาน (SHORING PLAN)" scale={S} sub={`ค้ำยัน ${2 * r.shores.length} ต้น`}/>}
  </g>;
}
