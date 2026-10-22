import type {ReactNode} from 'react';
import type {SlabResult} from '../domain/slab';
import {C, Member, diffs, mapper, rect, type Mapper} from './beamViews';
import {ChainDim, Dim, Leader, Line, LW, SectionMark, Txt, ViewTitle, fitScale, mm, poly, type Box} from './primitives';

/** Vertical stack (mm above the floor); shores taller than 700 mm are drawn broken. */
function stack(r: SlabResult) {
  const x = r.input, shoreTop = r.shoreLength, cut = Math.max(0, shoreTop - 700), st = shoreTop - cut;
  return {cut, shoreTop: st, bearerTop: st + r.bearer.section.H, joistTop: st + r.bearer.section.H + r.joist.section.H, soffit: x.soffitHeight - cut, top: x.soffitHeight - cut + x.t};
}

/** `overlay` draws extra marks in plan coordinates (mm), e.g. governing members in the short report. */
export function SlabPlanView({r, box, n = '1', titled = true, overlay}: {r: SlabResult; box: Box; n?: string; titled?: boolean; overlay?: (P: Mapper) => ReactNode}) {
  const x = r.input, ext: [number, number, number, number] = [-500, x.lx + 500, -800, x.ly + 800], bB = r.bearer.section.B;
  const S = fitScale(ext[1] - ext[0], ext[3] - ext[2], box.w - 40, box.h - 34), P = mapper(box, ext, S);
  const yA = (r.bearers[0] + r.bearers[1]) / 2, xB = (r.shores[0] + r.shores[1]) / 2;
  return <g>
    <polygon points={poly(rect(P, 0, 0, x.lx, x.ly))} fill="#f8f5ee" stroke="#111" strokeWidth={LW.thick}/>
    {r.joists.map((z, i) => <Line key={i} a={P(z, 0)} b={P(z, x.ly)} w={LW.thin} color={C.stud}/>)}
    {r.bearers.map((y, i) => <polygon key={i} points={poly(rect(P, 0, y - bB / 2, x.lx, y + bB / 2))} fill="#fbeaea" stroke={C.waler} strokeWidth={LW.med}/>)}
    {r.bearers.flatMap(y => r.shores.map(z => <g key={z + ':' + y}><circle cx={P(z, y)[0]} cy={P(z, y)[1]} r={1.2} fill={C.shore}/><circle cx={P(z, y)[0]} cy={P(z, y)[1]} r={2} fill="none" stroke={C.shore} strokeWidth={LW.thin}/></g>))}
    {overlay?.(P)}
    <ChainDim pts={r.shores.map(z => P(z, 0))} values={diffs(r.shores)} o={[0, 8]} total={mm(x.lx)}/>
    <Dim a={P(0, 0)} b={P(x.lx, 0)} o={[0, 15]} text={mm(x.lx)}/>
    <ChainDim pts={r.joists.map(z => P(z, x.ly))} values={diffs(r.joists)} o={[0, -8]} total={mm(x.lx)}/>
    <ChainDim pts={r.bearers.map(y => P(0, y))} values={diffs(r.bearers)} o={[-8, 0]} total={mm(x.ly)}/>
    <Dim a={P(0, 0)} b={P(0, x.ly)} o={[-15, 0]} text={mm(x.ly)}/>
    <SectionMark a={P(-350, yA)} b={P(x.lx + 350, yA)} id="A" view={[0, -1]}/>
    <SectionMark a={P(xB, x.ly + 700)} b={P(xB, -700)} id="B" view={[1, 0]}/>
    {[
      {from: P(r.joists[1], x.ly * 0.9), text: `คร่าว ${r.joist.name} @ ${mm(x.lx / (r.joists.length - 1))}`},
      {from: P(x.lx * 0.55, r.bearers[r.bearers.length - 2]), text: `คานรับ ${x.bearerCount > 1 ? '2×' : ''}${r.bearer.name} @ ${mm(x.ly / (r.bearers.length - 1))}`},
      {from: P(r.shores[r.shores.length - 2], r.bearers[1]), text: `ค้ำยัน ${r.shoreCount} ต้น · ${r.shoreLoad.toFixed(1)} kN/ต้น`},
    ].map((l, i) => <Leader key={i} from={l.from} to={[P(x.lx + 500, 0)[0] - 2, P(0, x.ly)[1] + 6 + i * 8]} text={l.text} s={2.1}/>)}
    {titled && <ViewTitle x={box.x + 4} y={box.y + box.h - 4} n={n} title="แปลนแบบหล่อพื้นและค้ำยัน (SLAB FORMWORK PLAN)" scale={S} sub={`${mm(x.lx)} × ${mm(x.ly)} mm`}/>}
  </g>;
}

/** Section A-A (axis X: across the joists, along a bearer) or B-B (axis Y: across the bearers, along a joist). */
export function SlabSectionView({r, box, axis, n = axis === 'X' ? '2' : '3', titled = true}: {r: SlabResult; box: Box; axis: 'X' | 'Y'; n?: string; titled?: boolean}) {
  const x = r.input, s = stack(r), L = axis === 'X' ? x.lx : x.ly, ext: [number, number, number, number] = [-450, L + 450, -250, s.top + 250];
  const S = fitScale(ext[1] - ext[0], ext[3] - ext[2], box.w - 30, box.h - 34), P = mapper(box, ext, S);
  const supports = axis === 'X' ? r.shores : r.bearers, cuts = axis === 'X' ? r.joists : r.bearers;
  const cutMember = axis === 'X' ? r.joist : r.bearer, runMember = axis === 'X' ? r.bearer : r.joist;
  const [runY0, runY1] = axis === 'X' ? [s.shoreTop, s.bearerTop] : [s.bearerTop, s.joistTop], [cutY0, cutY1] = axis === 'X' ? [s.bearerTop, s.joistTop] : [s.shoreTop, s.bearerTop];
  return <g>
    <rect x={P(ext[0], 0)[0]} y={P(0, 0)[1]} width={(ext[1] - ext[0]) / S} height={2} fill="url(#h-ground)"/>
    <Line a={P(ext[0], 0)} b={P(ext[1], 0)} w={LW.thick}/>
    {supports.map((z, i) => <g key={i}><polygon points={poly(rect(P, z - 24, 0, z + 24, s.shoreTop))} fill="#ece6f5" stroke={C.shore} strokeWidth={LW.thin}/>
      <polygon points={poly(rect(P, z - 70, 0, z + 70, 8))} fill="#ddd" stroke="#333" strokeWidth={LW.hair}/></g>)}
    {s.cut > 0 && <><Line a={P(ext[0], s.shoreTop / 2)} b={P(ext[1], s.shoreTop / 2)} w={LW.thin} dash="6 1.5 1 1.5"/>
      <Txt x={P(L / 2, 0)[0]} y={P(0, s.shoreTop / 2)[1] - 1.5} s={2} a="middle" fill="#555">ค้ำยันแสดงแบบตัดย่อ · ความสูงจริงถึงท้องพื้น {mm(x.soffitHeight)} mm</Txt></>}
    <polygon points={poly(rect(P, 0, runY0, L, runY1))} fill={runMember.timber ? 'url(#h-timber)' : axis === 'X' ? '#fbeaea' : '#dbe6f4'} stroke={axis === 'X' ? C.waler : C.stud} strokeWidth={LW.med}/>
    {cuts.map((z, i) => <Member key={i} P={P} x0={Math.max(0, z - cutMember.section.B / 2)} y0={cutY0} x1={Math.min(L, z + cutMember.section.B / 2)} y1={cutY1} m={cutMember} color={axis === 'X' ? C.stud : C.waler}/>)}
    <polygon points={poly(rect(P, 0, s.joistTop, L, s.soffit))} fill="url(#h-plywood)" stroke={C.ply} strokeWidth={LW.thin}/>
    <polygon points={poly(rect(P, -450, s.soffit, L + 450, s.top))} fill="url(#h-concrete)" stroke="#111" strokeWidth={LW.thick}/>
    <ChainDim pts={supports.map(z => P(z, 0))} values={diffs(supports)} o={[0, 7]} total={mm(L)}/>
    {axis === 'X' && <ChainDim pts={cuts.map(z => P(z, s.top))} values={diffs(cuts)} o={[0, -6]} total={mm(L)}/>}
    <Dim a={P(L + 450, s.soffit)} b={P(L + 450, s.top)} o={[6, 0]} text={'t ' + mm(x.t)}/>
    <Dim a={P(-450, 0)} b={P(-450, s.soffit)} o={[-5, 0]} text={mm(x.soffitHeight)}/>
    {titled && <ViewTitle x={box.x + 4} y={box.y + box.h - 4} n={n} title={axis === 'X' ? 'รูปตัด A-A (ตามแนวคานรับ)' : 'รูปตัด B-B (ตามแนวคร่าว)'} scale={S}
      sub={axis === 'X' ? `ค้ำยัน @ ${mm(x.lx / (r.shores.length - 1))} · คร่าว @ ${mm(x.lx / (r.joists.length - 1))}` : `คานรับ @ ${mm(x.ly / (r.bearers.length - 1))}`}/>}
  </g>;
}
