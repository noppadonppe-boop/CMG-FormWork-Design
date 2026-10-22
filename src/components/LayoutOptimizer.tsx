import {useMemo, useState} from 'react';
import {CheckCircle2, Wand2} from 'lucide-react';
import {usesTies, type Input} from '../domain';
import {KIT_SHORT, adviseLayout, currentOption, optimizeLayout, type KitLock} from '../domain/optimize';
import {FAMILY_LABEL, SECTION_STOCK, stockFor} from '../domain/sectionStock';

const TARGETS = [1, 0.95, 0.9, 0.85];
const fmt = (v: number) => v.toFixed(2);
const STATUS: Record<string, string> = {PRELIMINARY_ONLY: 'เรขาคณิตทฤษฎี', REVIEW_REQUIRED: 'ต้องตรวจ'};
const FAMILIES = (['TIMBER', 'SHS', 'RHS', 'L', 'C_LIP', 'C', 'CHS'] as const).map(f => [f, FAMILY_LABEL[f]] as const);

export function AdviceList({input, target = 1, stockIds, lock}: {input: Input; target?: number; stockIds?: string[]; lock?: KitLock}) {
  const advice = useMemo(() => adviseLayout(input, target, stockFor(stockIds), lock), [input, target, stockIds, lock]);
  if (!advice.length) return <p className="source-status"><CheckCircle2 size={14}/> ไม่มีรายการคัดกรองที่เกินเกณฑ์ {target < 1 ? `(เป้า ${target})` : ''}</p>;
  return <ul className="advice-list">{advice.map(a => <li key={a.checkId}><b>{a.label}</b> <span className="pill red">{fmt(a.ratio)}</span><br/>{a.text}</li>)}</ul>;
}

/** Part 2: search plywood / spacing / tie Ø and (optionally) stocked stud/waler sections that keep every screening ratio within the target. */
export function LayoutOptimizer({input, canApply, onApply, stockIds, canEditStock = false, onStockChange, readOnly = false, onConfirm, onOpenGeometry, kitStep}: {input: Input; canApply: boolean; onApply: (next: Input, note: string) => void;
  /** Project kit: keep plywood, sections and tie Ø; change spacings only, in multiples of the kit step. */
  kitStep?: number;
  stockIds?: string[]; canEditStock?: boolean; onStockChange?: (ids: string[] | undefined) => void;
  /** Why apply is blocked: read-only project, or dimensions not yet confirmed (confirm here after checking them, or open the geometry page). */
  readOnly?: boolean; onConfirm?: () => void; onOpenGeometry?: () => void}) {
  const blocked = readOnly ? 'โครงการนี้เป็นสิทธิ์ดูอย่างเดียว จึงใช้ทางเลือกไม่ได้' : !input.confirmed ? 'ยังไม่ได้ยืนยันรูปทรงและมิติของ Design Case นี้ ปุ่ม “ใช้ทางเลือกนี้” จึงยังกดไม่ได้' : null;
  const dims = `${usesTies(input) ? 'ฐานราก' : 'เสา'} ${input.shape === 'L' ? 'รูปตัว L ' : ''}${input.width.toLocaleString('en-US')} × ${input.length.toLocaleString('en-US')} mm · ${usesTies(input) ? 'ลึก' : 'สูง'} ${input.height.toLocaleString('en-US')} mm${input.shape === 'L' ? ` · แขน ${input.armX} / ${input.armY}` : ''}`;
  const [target, setTarget] = useState(1), [useSections, setUseSections] = useState(true);
  const lock = useMemo<KitLock | undefined>(() => kitStep ? {step: kitStep} : undefined, [kitStep]);
  const stock = useMemo(() => useSections ? stockFor(stockIds) : [], [useSections, stockIds]);
  const options = useMemo(() => optimizeLayout(input, target, stock, lock), [input, target, stock, lock]);
  // The user's own choice (manual fields, section picker or 3D model) is always listed with the same recalculated figures.
  const mine = useMemo(() => {try {return currentOption(input);} catch (e) {return (e as Error).message;}}, [input]);
  const selected = new Set(stockIds ?? SECTION_STOCK.map(s => s.id));
  const toggle = (id: string) => {const next = new Set(selected); if (next.has(id)) next.delete(id); else next.add(id); onStockChange?.(SECTION_STOCK.filter(s => next.has(s.id)).map(s => s.id));};
  return <section className="card optimizer">
    <div className="card-title"><h3><Wand2 size={18}/> ระบบแนะนำปรับแก้จนไม่เกินเกณฑ์</h3>
      <label className="field inline"><span>เป้าอัตราส่วนสูงสุด</span><select value={target} onChange={e => setTarget(Number(e.target.value))}>{TARGETS.map(t => <option key={t} value={t}>{t.toFixed(2)}</option>)}</select></label></div>
    <p className="muted">ปรับความหนาไม้อัด ระยะคร่าว ระยะคานคู่ ระยะ Tie ขนาด Tie และ (ถ้าเลือก) เพิ่มขนาดหน้าตัดคร่าว/คานคู่จากคลังของบริษัท แล้วคำนวณซ้ำทุกตัวเลือกด้วย engine เดียวกัน · เรียงตามน้ำหนักเหล็กโดยประมาณ · “ผ่าน” = ไม่มีรายการเกินเกณฑ์คัดกรอง แต่สถานะยังเป็น INCOMPLETE จนกว่าจะมีข้อมูลวัสดุ/อุปกรณ์รับรอง</p>
    {lock ? <div className="notice">ใช้ชุดมาตรฐานโครงการ: ไม้อัด หน้าตัดคร่าว/คานคู่ และขนาด Tie คงตามชุด ปรับเฉพาะระยะ เป็นทวีคูณของ {lock.step} mm</div>
      : <label className="confirm"><input type="checkbox" checked={useSections} onChange={e => setUseSections(e.target.checked)}/>อนุญาตให้เพิ่มขนาดหน้าตัดคร่าว/คานคู่ จากคลังหน้าตัด ({stockFor(stockIds).length} รายการ)</label>}
    {!lock && <details className="stock-picker"><summary>คลังหน้าตัดที่บริษัทมีใช้ (ไม้ / เหล็กกล่อง / ฉาก / ตัวซี / รางน้ำ / ท่อ ตามตารางเหล็กไทย) · บันทึกกับโครงการ</summary>
      <p className="muted">ติ๊กเฉพาะหน้าตัดที่มีในคลังจริง ระบบจะใช้เฉพาะหน้าตัดที่แข็งแรงเท่าหรือมากกว่าหน้าตัดเดิม · คร่าวเปลี่ยนในวัสดุเดิม (ไม้ ↔ ไม้, เหล็กกล่อง ↔ เหล็กกล่อง) · คานคู่ใช้ได้ทุกชนิด · ค่าหน้าตัดเป็น gross จากผู้ผลิต ยังต้องยืนยันใบรับรองวัสดุและตรวจการโก่งเดาะเฉพาะที่</p>
      {FAMILIES.map(([fam, title]) => <details key={fam}><summary className="stock-family">{title} ({SECTION_STOCK.filter(s => s.family === fam).length})</summary><div className="stock-grid">{SECTION_STOCK.filter(s => s.family === fam).map(s => <label key={s.id} title={s.url ?? s.source}><input type="checkbox" checked={selected.has(s.id)} disabled={!canEditStock} onChange={() => toggle(s.id)}/>{s.designation}<small>{s.kg_per_m ? `${s.kg_per_m} kg/m` : STATUS[s.status] ?? s.status}</small></label>)}</div></details>)}
      {canEditStock && <div className="source-actions"><button className="btn secondary" onClick={() => onStockChange?.(undefined)}>เลือกทั้งหมด</button><button className="btn secondary" onClick={() => onStockChange?.([])}>ล้างทั้งหมด</button></div>}
    </details>}
    <h4>รายการที่เกินเกณฑ์ตอนนี้และวิธีแก้</h4>
    <AdviceList input={input} target={target} stockIds={useSections ? stockIds : []} lock={lock}/>
    <h4>ทางเลือกที่คำนวณซ้ำแล้ว</h4>
    <p className="muted optimizer-howto">วิธีใช้: แต่ละแถวคือชุดไม้อัด คร่าว คานคู่ และ Tie ที่คำนวณซ้ำครบทุกรายการแล้ว · Ratio สูงสุด ≤ เป้า (สีเขียว) = ไม่มีรายการเกินเกณฑ์ · กด “ใช้ทางเลือกนี้” เพื่อแทนค่าในหน้านี้ จากนั้นรายการคำนวณ แบบ รายงาน และโมเดล 3D จะอัปเดตตาม (ย้อนกลับได้จากประวัติการแก้ไข) · แถว “ค่าปัจจุบัน” คือค่าที่ใช้อยู่</p>
    {blocked && <div className="warning optimizer-blocked" role="alert"><b>{blocked}</b>
      {!readOnly && <><br/>มิติปัจจุบัน: {dims} · ตรวจกับแบบต้นฉบับแล้วกดยืนยัน
        <div className="source-actions">{onConfirm && <button className="btn" onClick={onConfirm}>ตรวจแล้ว ยืนยันมิติ</button>}{onOpenGeometry && <button className="btn secondary" onClick={onOpenGeometry}>ไปหน้ารูปทรงและมิติ</button>}</div></>}</div>}
    {!options.length && <div className="warning">{lock ? KIT_SHORT : 'ไม่พบทางเลือก · ลองอนุญาตให้เปลี่ยนหน้าตัด เพิ่มหน้าตัดในคลัง หรือลดเป้าอัตราส่วน'}</div>}
    {<div className="table-scroll"><table aria-label="ทางเลือกการจัดวาง">
        <thead><tr><th>ทางเลือก</th><th>ไม้อัด</th><th>คร่าว</th><th>คานคู่</th><th>Tie @ / Ø</th><th>Ratio สูงสุด</th><th>เหล็ก (kg) · ชิ้น</th><th/></tr></thead>
        <tbody>{options.map(o => <tr key={o.label}>
          <td><b>{o.label}</b><small className="help">ควบคุม: {o.governing}</small></td>
          <td>{o.input.plywood} mm</td>
          <td>{o.studSection}<small className="help">@ {o.input.studSpacing}</small></td>
          <td>{o.walerSection}<small className="help">@ {o.input.walerSpacing}</small></td>
          <td>{usesTies(input) ? `${o.input.tieSpacing} / Ø${o.input.tieDiameter}` : '—'}</td>
          <td><span className={'pill ' + (o.passes ? 'approved' : 'red')}>{fmt(o.maxRatio)}</span></td>
          <td>{o.steelKg.toLocaleString('en-US')}<small className="help">คร่าว {o.quantities.studs} · คานคู่ {o.quantities.walers} · Tie {o.quantities.ties} · ไม้อัด {o.quantities.plywoodSheets} แผ่น</small></td>
          <td><button className="btn" disabled={!canApply || !Object.keys(o.changes).length} title={blocked ?? undefined} onClick={() => onApply(o.input, 'ปรับอัตโนมัติ · ' + o.label.replace('แนะนำ · เหล็กเบาที่สุด · ', '') + ` · ${o.studSection} / ${o.walerSection}`)}>{Object.keys(o.changes).length ? 'ใช้ทางเลือกนี้' : 'ค่าปัจจุบัน'}</button></td>
        </tr>)}
        {typeof mine === 'string' ? <tr className="optimizer-mine"><td colSpan={8}><b>ค่าที่เลือกอยู่ (โมเดล 3D / แก้ไขด้วยตนเอง)</b> · คำนวณไม่ได้: {mine}</td></tr>
          : <tr className="optimizer-mine" aria-label="ค่าที่เลือกอยู่">
          <td><b>ค่าที่เลือกอยู่</b><small className="help">จากโมเดล 3D / แก้ไขขนาด·ระยะด้วยตนเอง · ควบคุม: {mine.governing}</small></td>
          <td>{mine.input.plywood} mm</td>
          <td>{mine.studSection}<small className="help">@ {mine.input.studSpacing}</small></td>
          <td>{mine.walerSection}<small className="help">@ {mine.input.walerSpacing}</small></td>
          <td>{usesTies(input) ? `${mine.input.tieSpacing} / Ø${mine.input.tieDiameter}` : '—'}</td>
          <td><span className={'pill ' + (mine.passes && mine.maxRatio <= target ? 'approved' : 'red')}>{fmt(mine.maxRatio)}</span>{mine.maxRatio > target && <small className="help">เกินเป้า {target.toFixed(2)} · เลือกแถวด้านบนหรือแก้ค่า</small>}</td>
          <td>{mine.steelKg.toLocaleString('en-US')}<small className="help">คร่าว {mine.quantities.studs} · คานคู่ {mine.quantities.walers} · Tie {mine.quantities.ties} · ไม้อัด {mine.quantities.plywoodSheets} แผ่น</small></td>
          <td><span className="pill optimizer-current">ใช้อยู่</span></td>
        </tr>}</tbody>
      </table></div>}
  </section>;
}
