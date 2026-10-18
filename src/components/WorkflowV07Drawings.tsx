import React from 'react';
import type {TitleBlock} from '../domain/titleBlock';
import type {WorkflowModel} from '../domain/workflowV07/model';
import type {documentView} from '../domain/workflowV07/snapshot';
import {A3Set} from './DrawingSet';
import {Dim, Line, LW, Table, Txt, fitScale, poly, type V} from '../drawing/primitives';
import {NoteBlock} from '../drawing/views';

type View = Awaited<ReturnType<typeof documentView>>;
type Point = {x: number; y: number};
const fmt = (v: number | null | undefined) => v == null ? 'UNKNOWN' : v.toLocaleString('en-US', {maximumFractionDigits: 1});
const floor = (v: number) => Math.floor(v);

function HashStamp({view}: {view: View}) {
  return <g>
    <Txt x={23} y={244} s={1.65}>DESIGN REVISION {view.report.model.revisionId} · INPUT SHA-256 {view.inputHash}</Txt>
    <Txt x={23} y={247} s={1.65}>SNAPSHOT SHA-256 {view.snapshotHash} · DRAFT / NO_GO · NOT FOR CONSTRUCTION</Txt>
  </g>;
}

function GeometrySheet({view}: {view: View}) {
  const {model} = view.report, topology = view.drawing.topology;
  const xs = topology.vertices.map(p => p.x), ys = topology.vertices.map(p => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const scale = fitScale(maxX - minX, maxY - minY, 188, 158), P = (p: Point): V => [42 + (p.x - minX) * scale, 203 - (p.y - minY) * scale];
  const pairs = topology.pairs.map(pair => {
    const mid = (pair.startMm + pair.endMm) / 2;
    const a = pair.normalAxis === 'X' ? {x: pair.normalAMm, y: mid} : {x: mid, y: pair.normalAMm};
    const b = pair.normalAxis === 'X' ? {x: pair.normalBMm, y: mid} : {x: mid, y: pair.normalBMm};
    return <g key={pair.id}><Line a={P(a)} b={P(b)} dash="4 2" color="#b17a28"/><Txt x={(P(a)[0] + P(b)[0]) / 2} y={(P(a)[1] + P(b)[1]) / 2 - 2} s={1.8} a="middle">{pair.id}</Txt></g>;
  });
  const faces = topology.faces.map(face => {
    const a = P(face.a), b = P(face.b);
    return <Txt key={face.id} x={(a[0] + b[0]) / 2} y={(a[1] + b[1]) / 2 - 2} s={1.8} a="middle" b>{face.id}</Txt>;
  });
  const first = P({x: minX, y: minY}), right = P({x: maxX, y: minY}), top = P({x: minX, y: maxY});
  return <>
    <Txt x={25} y={31} s={3} b>GEOMETRY / OPPOSING FACE MAP · GEOMETRY ONLY</Txt>
    <Txt x={25} y={37} s={2}>Pair regions describe concrete corridors only. They do not define installed tie locations or a mirrored formwork system.</Txt>
    <polygon points={poly(topology.vertices.map(P))} fill="#eef3f7" stroke="#173e62" strokeWidth={0.7}/>
    {faces}{pairs}
    <Dim a={first} b={right} o={[0, 10]} text={`${fmt(maxX - minX)} mm overall X`} s={1.8}/>
    <Dim a={first} b={top} o={[-10, 0]} text={`${fmt(maxY - minY)} mm overall Y`} s={1.8}/>
    <Txt x={40} y={219} s={1.8}>Scale 1:{scale} · coordinates in mm · plan is model geometry only</Txt>
    <Table x={245} y={31} title="PHYSICAL FACES" rh={5.2} s={1.7} cols={[{t: 'Face', w: 24}, {t: 'Length mm', w: 35, a: 'end'}, {t: 'Normal X/Y', w: 34, a: 'middle'}]}
      rows={topology.faces.map(face => [face.id, fmt(face.lengthMm), `${face.normal.x.toFixed(0)} / ${face.normal.y.toFixed(0)}`])}/>
    <Table x={245} y={Math.min(119, 44 + topology.faces.length * 5.2)} title="OPPOSING PAIR REGIONS" rh={5.2} s={1.65}
      cols={[{t: 'Pair', w: 22}, {t: 'Faces', w: 30}, {t: 'Chord mm', w: 31, a: 'end'}, {t: 'Span mm', w: 31, a: 'end'}]}
      rows={topology.pairs.map(pair => [pair.id, `${pair.faceAId}/${pair.faceBId}`, fmt(pair.chordMm), fmt(pair.endMm - pair.startMm)])}/>
    <NoteBlock x={245} y={205} w={162} title="DESIGN STATUS" s={1.7} items={[
      `Design Revision ${model.revisionId}`,
      `Height ${fmt(model.heightMm)} mm · ${topology.faces.length} physical faces · ${topology.pairs.length} pair regions`,
      `Area ${topology.areaM2.toFixed(3)} m² · side area ${topology.sideAreaM2.toFixed(3)} m²`,
      'DRAFT / NO_GO · Verify the source drawing and all actual support/component positions before use.',
    ]}/>
    <HashStamp view={view}/>
  </>;
}

function SideFaceSheet({view, faceIndex}: {view: View; faceIndex: number}) {
  const model = view.report.model, topology = view.drawing.topology, applied = model.sideLayout;
  const face = topology.faces[faceIndex], layout = applied?.faces.find(row => row.faceId === face?.id);
  if (!face) return null;
  const width = 300, height = 140, scale = fitScale(face.lengthMm, model.heightMm, width, height), x0 = 58, y0 = 205;
  const px = (x: number) => x0 + x * scale, py = (z: number) => y0 - z * scale;
  return <>
    <Txt x={25} y={31} s={3} b>{face.id} SIDE LAYOUT · {layout ? 'AUTHORED POSITIONS' : 'NO AUTHORED LAYOUT'}</Txt>
    <Txt x={25} y={37} s={2}>Elevation schematic · stated coordinates in mm · component capacities and end connections remain unverified</Txt>
    <line x1={x0} y1={y0} x2={px(face.lengthMm)} y2={y0} stroke="#173e62" strokeWidth={1}/>
    <line x1={x0} y1={py(model.heightMm)} x2={px(face.lengthMm)} y2={py(model.heightMm)} stroke="#173e62" strokeWidth={1}/>
    <line x1={x0} y1={y0} x2={x0} y2={py(model.heightMm)} stroke="#173e62" strokeWidth={1}/>
    <line x1={px(face.lengthMm)} y1={y0} x2={px(face.lengthMm)} y2={py(model.heightMm)} stroke="#173e62" strokeWidth={1}/>
    {layout?.studPositionsMm.map((x, i) => <g key={`stud-${i}`}><line x1={px(x)} y1={y0} x2={px(x)} y2={py(model.heightMm)} stroke="#bc8030" strokeWidth={0.45}/><circle cx={px(x)} cy={y0} r={1.1} fill="#bc8030"/></g>)}
    {layout?.walers.map(w => <g key={w.id}><line x1={x0} y1={py(w.zMm)} x2={px(face.lengthMm)} y2={py(w.zMm)} stroke="#267a76" strokeWidth={0.8}/>
      {w.supports.map(s => <circle key={s.id} cx={px(s.xMm)} cy={py(w.zMm)} r={1.25} fill="#173e62"/>)}
      <Txt x={px(face.lengthMm) + 3} y={py(w.zMm) + 1} s={1.7}>{w.id} · z={fmt(w.zMm)}</Txt></g>)}
    {layout?.studPositionsMm.length ? <Dim a={[x0, y0]} b={[px(face.lengthMm), y0]} o={[0, 9]} text={`${fmt(face.lengthMm)} mm`} s={1.8}/> : null}
    {!layout && <NoteBlock x={80} y={95} w={220} title="BLOCKED · SIDE LAYOUT REQUIRED" items={['No actual stud, waler, tie or clamp position is authored for this physical face.', 'No installation coordinates have been generated from the pair map.']}/>}
    {layout && <>
      <Table x={25} y={211} title="AUTHORED MEMBER POSITIONS" rh={5.2} s={1.7} cols={[{t: 'Face', w: 22}, {t: 'Stud stations', w: 90}, {t: 'Waler levels z mm', w: 105}, {t: 'Supports', w: 70}]}
        rows={[[face.id, layout.studPositionsMm.map(fmt).join(', ') || 'UNKNOWN', layout.walers.map(w => `${w.id}:${fmt(w.zMm)}`).join(', ') || 'UNKNOWN', layout.walers.map(w => w.supports.length).join('/') || 'UNKNOWN']]}/>
      <Txt x={25} y={240} s={1.65}>Tie endpoints authored for this face: {applied?.ties.filter(t => t.a.faceId === face.id || t.b.faceId === face.id).length ?? 0} · plotted support dots show authored waler support stations, not approved connection hardware.</Txt>
    </>}
    <HashStamp view={view}/>
  </>;
}

function SoffitSheet({view}: {view: View}) {
  const model = view.report.model, layout = model.soffitLayout, topology = view.drawing.topology;
  if (!layout) return <>
    <Txt x={25} y={31} s={3} b>SOFFIT / SHORING LAYOUT · BLOCKED</Txt>
    <NoteBlock x={50} y={70} w={300} title="NO AUTHORED SOFFIT LAYOUT" items={[
      'Joist, bearer, U-head, Ringlock and base coordinates are not available in this Design Revision.',
      'No support grid or installation spacing is generated from nominal Ringlock presets.',
      'Enter actual positions and evidence in Workflow v0.7 before producing this arrangement sheet.',
    ]}/>
    <HashStamp view={view}/>
  </>;
  const xs = topology.vertices.map(p => p.x), ys = topology.vertices.map(p => p.y), minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const scale = fitScale(maxX - minX, maxY - minY, 290, 150), x0 = 50, y0 = 202;
  const px = (x: number) => x0 + (x - minX) * scale, py = (y: number) => y0 - (y - minY) * scale;
  const outline = topology.vertices.map(p => [px(p.x), py(p.y)] as V);
  return <>
    <Txt x={25} y={31} s={3} b>SOFFIT / SHORING PLAN · AUTHORED GEOMETRY</Txt>
    <Txt x={25} y={37} s={2}>Joists, bearers and head stations are shown only where authored in this revision.</Txt>
    <polygon points={poly(outline)} fill="#f7f9fb" stroke="#173e62" strokeWidth={0.8}/>
    {layout.joistXMm.map((x, i) => <line key={`j-${i}`} x1={px(minX + x)} y1={py(minY + (layout.joistStartYMm ?? 0))} x2={px(minX + x)} y2={py(minY + (layout.joistEndYMm ?? 0))} stroke="#bc8030" strokeWidth={0.45}/>)}
    {layout.bearers.map(row => <g key={row.id}><line x1={px(minX + (layout.bearerStartXMm ?? 0))} y1={py(minY + row.yMm)} x2={px(minX + (layout.bearerEndXMm ?? 0))} y2={py(minY + row.yMm)} stroke="#267a76" strokeWidth={0.8}/>
      {row.headsXMm.map((x, i) => <circle key={i} cx={px(minX + x)} cy={py(minY + row.yMm)} r={1.5} fill="#173e62"/>)}
      <Txt x={px(minX + (layout.bearerEndXMm ?? 0)) + 3} y={py(minY + row.yMm) + 1} s={1.7}>{row.id}</Txt></g>)}
    <Txt x={50} y={220} s={1.8}>Orange: joist axes · teal: bearer axes · blue dots: authored U-head stations · Scale 1:{scale}</Txt>
    <Table x={300} y={45} title="LAYOUT DATA" rh={6} s={1.8} cols={[{t: 'Item', w: 45}, {t: 'Authored value', w: 55}]}
      rows={[["Joist X mm", layout.joistXMm.map(fmt).join(', ')], ['Bearer Y mm', layout.bearers.map(b => fmt(b.yMm)).join(', ')],
        ['Heads per bearer', layout.bearers.map(b => `${b.id}:${b.headsXMm.length}`).join(', ')], ['Head elevation mm', fmt(layout.headNodeElevationMm)], ['Base elevation mm', fmt(layout.baseElevationMm)], ['Stage / case', `${layout.stageId} / ${layout.loadCaseId}`]]}/>
    <NoteBlock x={300} y={105} w={107} title="LIMITS" s={1.7} items={[
      'Geometry and reactions do not prove product capacities, connection adequacy, stability, bearing or construction readiness.',
      'NTS for installation. Verify all datums against source drawings and actual components.',
    ]}/>
    <HashStamp view={view}/>
  </>;
}

function FrameSheet({view}: {view: View}) {
  const model = view.report.model, frame = model.frameLayout;
  if (!frame) return <>
    <Txt x={25} y={31} s={3} b>FRAME / BRACING / BASE SUPPORT · BLOCKED</Txt>
    <NoteBlock x={50} y={70} w={300} title="NO AUTHORED FRAME OR SUPPORT MODEL" items={[
      'Actual Ringlock standards, ledgers, braces, joints, U-heads, Jack Bases and base contacts are not fully mapped in this revision.',
      'No frame geometry or support condition is inferred from the Ringlock plan preset.',
      'Complete frame and support editors with product and substrate evidence before detailed issue.',
    ]}/>
    <HashStamp view={view}/>
  </>;
  const byId = new Map(frame.nodes.map(n => [n.id, n]));
  const points = frame.nodes.map(n => n.pointMm).filter((p): p is [number, number, number] => p.every(v => v !== null));
  const xValues = points.map(p => p[0]), zValues = points.map(p => p[2]);
  const minX = Math.min(...xValues, 0), maxX = Math.max(...xValues, 1), minZ = Math.min(...zValues, 0), maxZ = Math.max(...zValues, 1);
  const scale = fitScale(maxX - minX, maxZ - minZ, 250, 135), x0 = 60, y0 = 202;
  const px = (x: number) => x0 + (x - minX) * scale, py = (z: number) => y0 - (z - minZ) * scale;
  return <>
    <Txt x={25} y={31} s={3} b>FRAME ELEVATION · AUTHORED NODES AND MEMBERS</Txt>
    <Txt x={25} y={37} s={2}>Only explicitly entered frame elements are drawn. Missing elements, boundary conditions and connections remain BLOCKED.</Txt>
    {frame.elements.map(e => {const a = byId.get(e.nodeI)?.pointMm, b = byId.get(e.nodeJ)?.pointMm; if (!a || !b || a[0] === null || a[2] === null || b[0] === null || b[2] === null) return null;
      return <g key={e.id}><line x1={px(a[0])} y1={py(a[2])} x2={px(b[0])} y2={py(b[2])} stroke={e.role === 'BRACE' ? '#b17a28' : '#173e62'} strokeWidth={e.role === 'BRACE' ? 0.7 : 1}/>
        <Txt x={(px(a[0]) + px(b[0])) / 2} y={(py(a[2]) + py(b[2])) / 2 - 2} s={1.6} a="middle">{e.id}</Txt></g>;
    })}
    {frame.nodes.map(n => {const p = n.pointMm; if (p[0] === null || p[2] === null) return null; return <g key={n.id}><circle cx={px(p[0])} cy={py(p[2])} r={1.8} fill={n.role === 'BASE' ? '#8c3f3f' : '#173e62'}/><Txt x={px(p[0]) + 2} y={py(p[2]) - 2} s={1.6}>{n.id}</Txt></g>;})}
    <Table x={290} y={45} title="FRAME INVENTORY" rh={5.8} s={1.8} cols={[{t: 'Role', w: 34}, {t: 'Nodes', w: 22, a: 'end'}, {t: 'Members', w: 28, a: 'end'}]}
      rows={['BASE', 'HEAD', 'ROSETTE', 'SIDE_SUPPORT', 'OTHER'].map(role => [role, String(frame.nodes.filter(n => n.role === role).length), String(frame.elements.filter(e => e.role === role).length)])}/>
    <NoteBlock x={290} y={95} w={117} title="FRAME STATUS" s={1.7} items={[
      `${frame.nodes.length} nodes · ${frame.elements.length} elements`,
      `Stage / case ${frame.stageId || 'UNKNOWN'} / ${frame.loadCaseId || 'UNKNOWN'}`,
      `Model status ${view.report.preview.frame?.status ?? 'BLOCKED'}`,
      'NTS. Not a stability or installation approval drawing.',
    ]}/>
    <HashStamp view={view}/>
  </>;
}

function SupportSheet({view, page}: {view: View; page: number}) {
  const model = view.report.model, supports = model.supportLayout?.bases ?? [];
  if (!model.supportLayout || supports.length === 0) return <>
    <Txt x={25} y={31} s={3} b>BASE / SUPPORT CONTACT · BLOCKED</Txt>
    <NoteBlock x={50} y={70} w={300} title="NO AUTHORED BASE TO SUPPORT PATH" items={[
      'Soil, existing slab or young-slab bearing data are not available for this design revision.',
      'Jack Base plate, sole board, contact geometry, settlement and uplift remain unverified.',
      'Do not use this sheet as a foundation or slab bearing design.',
    ]}/>
    <HashStamp view={view}/>
  </>;
  const chunk = supports.slice(page * 16, page * 16 + 16);
  return <>
    <Txt x={25} y={31} s={3} b>BASE TO SUPPORT CONTACT · PAGE {page + 1} / {Math.ceil(supports.length / 16)}</Txt>
    <Txt x={25} y={37} s={2}>Authored support records and reference limits · no missing property is inferred</Txt>
    <Table x={25} y={45} title="BASE / CONTACT INVENTORY" rh={8} s={1.65} cols={[
      {t: 'Base / frame node', w: 42}, {t: 'Support / path', w: 36}, {t: 'Datum', w: 42}, {t: 'Interface / dimensions mm', w: 70},
      {t: 'Limit MPa / basis', w: 42}, {t: 'Soil spring N/mm³', w: 42}, {t: 'Evidence refs', w: 65},
    ]} rows={chunk.map(base => [
      `${base.id} / ${base.frameNodeId || 'UNKNOWN'}`, `${base.supportKind || 'UNKNOWN'} / ${base.path || 'UNKNOWN'}`,
      `${base.datum || 'UNKNOWN'} · ${base.datumEvidenceRef || 'NO REF'}`,
      base.interfaces.map(c => `${c.id} ${fmt(c.lengthXMm)}×${fmt(c.widthYMm)}`).join('; ') || 'NO INTERFACE',
      base.interfaces.map(c => `${fmt(c.declaredPressureLimitMPa)} / ${c.resistanceBasis || 'UNKNOWN'}`).join('; ') || 'UNKNOWN',
      base.interfaces.map(c => fmt(c.soilSpringNPerMm3)).join('; ') || 'UNKNOWN',
      [base.supportEvidenceRef, ...base.interfaces.map(c => c.limitEvidenceRef || c.soilSpringEvidenceRef)].filter(Boolean).join('; ') || 'NO REF',
    ])}/>
    <NoteBlock x={25} y={205} w={382} title="SCREENING BOUNDARY" s={1.7} items={[
      `Showing records ${page * 16 + 1}–${page * 16 + chunk.length} of ${supports.length} authored base supports.`,
      'The listed limits are user-entered evidence references, not independently verified product or geotechnical ratings.',
      'Settlement, contact uplift, lateral restraint and global soil/slab capacity need project-specific review.',
    ]}/>
    <HashStamp view={view}/>
  </>;
}

export function WorkflowV07Drawings({view, project, code, caseName, titleBlock, canEdit, onTitleBlockChange, reviewState}: {
  view: View; project: string; code: string; caseName: string; titleBlock: TitleBlock; canEdit: boolean; onTitleBlockChange: (value: TitleBlock) => void; reviewState: string;
}) {
  const model: WorkflowModel = view.report.model;
  const element = model.elementType === 'BEAM' ? 'คาน' : model.elementType === 'SLAB' ? 'พื้น' : model.elementType === 'WALL' ? 'ผนัง' : model.elementType === 'COLUMN' ? 'เสา' : 'ฐานราก';
  const sheets: {code: string; title: string; body: React.ReactElement}[] = [
    {code: 'V7-01', title: 'แปลนรูปทรงและคู่ช่วงผิว', body: <GeometrySheet view={view}/>},
    ...view.drawing.topology.faces.map((_, faceIndex) => ({code: `V7-${String(2 + faceIndex).padStart(2, '0')}`, title: `รูปด้าน ${view.drawing.topology.faces[faceIndex].id}`,
      body: <SideFaceSheet view={view} faceIndex={faceIndex}/> })),
    {code: `V7-${String(2 + view.drawing.topology.faces.length).padStart(2, '0')}`, title: 'แปลนท้องแบบและค้ำยัน', body: <SoffitSheet view={view}/>},
    {code: `V7-${String(3 + view.drawing.topology.faces.length).padStart(2, '0')}`, title: 'เฟรมและจุดต่อ', body: <FrameSheet view={view}/>},
    ...(model.supportLayout?.bases.length ? Array.from({length: Math.ceil(model.supportLayout.bases.length / 16)}, (_, page) => ({
      code: `V7-${String(4 + view.drawing.topology.faces.length + page).padStart(2, '0')}`,
      title: `ฐานและพื้นรองรับ ${page + 1}`, body: <SupportSheet view={view} page={page}/>})) : [{
      code: `V7-${String(4 + view.drawing.topology.faces.length).padStart(2, '0')}`, title: 'ฐานและพื้นรองรับ', body: <SupportSheet view={view} page={0}/> }]),
  ];
  return <A3Set sheets={sheets} project={project} code={code} caseName={caseName} elementLabel={`แบบจัดวางร่าง ${element} v0.7`}
    confirmed={model.humanInputReviewed} titleBlock={titleBlock} canEdit={canEdit} onTitleBlockChange={onTitleBlockChange}
    revisionBinding={{designRevision: model.revisionId, contentHash: view.inputHash, reviewState}}/>;
}
