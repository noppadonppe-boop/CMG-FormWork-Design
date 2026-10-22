import {useMemo, useState} from 'react';
import {Download, ShoppingCart} from 'lucide-react';
import {defaultOrder, orderCsv, projectOrder, setsFor, type CaseOrder, type OrderCase, type OrderCategory} from '../domain/projectBom';

const STOCK_LENGTHS = [3000, 4000, 6000];
const CATEGORY: Record<OrderCategory, string> = {PLYWOOD: 'ไม้อัด', MEMBER: 'คร่าว / คานคู่ / คานรับ (ชิ้นยาว)', HARDWARE: 'อุปกรณ์'};
const n = (v: number, d = 0) => v.toLocaleString('en-US', {minimumFractionDigits: d, maximumFractionDigits: d});

/** One order list for the whole project: every Design Case × its formwork sets (count ÷ reuse), members packed into stock bars. */
export function ProjectOrderPanel({cases, types, code, canEdit, onOrderChange}: {cases: (OrderCase & {id: string})[]; types: Record<string, string>; code: string; canEdit: boolean;
  onOrderChange: (caseId: string, order: CaseOrder) => void}) {
  const [stock, setStock] = useState(6000);
  const {rows, errors} = useMemo(() => projectOrder(cases, stock), [cases, stock]);
  const setOrder = (z: OrderCase & {id: string}, key: keyof CaseOrder, value: number) => {
    const v = Math.max(1, Math.min(1000, Math.round(value) || 1));
    onOrderChange(z.id, {...(z.order ?? defaultOrder), [key]: v});
  };
  function exportCsv() {
    const url = URL.createObjectURL(new Blob([orderCsv(rows, stock)], {type: 'text/csv;charset=utf-8'})), a = document.createElement('a');
    a.href = url; a.download = `${code || 'CMG'}-order-list.csv`; a.click(); URL.revokeObjectURL(url);
  }
  return <>
    <section className="card"><h3><ShoppingCart size={18}/> จำนวนชิ้นงานและการใช้แบบซ้ำ</h3>
      <p className="muted">ชุดแบบที่ต้องมี = จำนวนชิ้นงานที่เหมือนกัน ÷ จำนวนรอบที่ใช้แบบชุดเดียวซ้ำ (ปัดขึ้น) · ปริมาณของแต่ละ Design Case มาจากตารางวัสดุของรายการคำนวณนั้น</p>
      <table><thead><tr><th>Design Case</th><th>ประเภท</th><th>ชิ้นงานเหมือนกัน</th><th>ใช้แบบซ้ำ (รอบ)</th><th>ชุดแบบที่ต้องมี</th></tr></thead><tbody>
        {cases.map(z => {const o = z.order ?? defaultOrder; return <tr key={z.id}><td>{z.name}</td><td>{types[z.id]}</td>
          <td><input type="number" min="1" step="1" aria-label={`จำนวนชิ้นงาน ${z.name}`} disabled={!canEdit} value={o.count} onChange={e => setOrder(z, 'count', Number(e.target.value))}/></td>
          <td><input type="number" min="1" step="1" aria-label={`ใช้ซ้ำ ${z.name}`} disabled={!canEdit} value={o.reuse} onChange={e => setOrder(z, 'reuse', Number(e.target.value))}/></td>
          <td><b>{setsFor(o)}</b></td></tr>;})}</tbody></table></section>
    <section className="card order-list"><div className="card-title"><h3>รายการสั่งของรวมทั้งโครงการ</h3>
      <div className="source-actions"><label className="field inline"><span>ความยาวท่อนที่ซื้อ</span><select aria-label="ความยาวท่อนที่ซื้อ" value={stock} onChange={e => setStock(Number(e.target.value))}>{STOCK_LENGTHS.map(s => <option key={s} value={s}>{s / 1000} m</option>)}</select></label>
        <button className="btn" disabled={!rows.length} onClick={exportCsv}><Download size={16}/>ส่งออก Excel (CSV)</button></div></div>
      <p className="muted">คร่าว/คานจัดลงท่อนยาวมาตรฐานแบบไม่ต่อชิ้น (ชิ้นที่ยาวกว่าท่อนต้องต่อทาบ นับท่อนเต็ม) · ไม้อัดรวมเผื่อตัดตามแต่ละระบบ · ยังไม่รวมของสำรอง ความเสียหายระหว่างใช้ และอุปกรณ์ที่ระบบยังไม่ออกแบบ</p>
      {errors.length > 0 && <div className="warning"><b>คำนวณไม่ได้ (ไม่รวมในรายการ):</b> {errors.join(' · ')}</div>}
      {(['PLYWOOD', 'MEMBER', 'HARDWARE'] as const).map(cat => {const list = rows.filter(r => r.category === cat); return list.length ? <div key={cat}><h4>{CATEGORY[cat]}</h4>
        <table><thead><tr><th>รายการ</th><th>จำนวน</th><th>หน่วย</th>{cat === 'MEMBER' && <><th>ความยาวรวม</th><th>ท่อน {stock / 1000} m ที่ต้องสั่ง</th><th>ความยาวตัด (mm × จำนวน)</th></>}<th>ใช้ใน</th></tr></thead><tbody>
          {list.map(r => <tr key={r.key}><td><b>{r.label}</b></td><td>{n(r.qty)}</td><td>{r.unit}</td>
            {cat === 'MEMBER' && <><td>{n(r.totalLength ?? 0, 2)} m</td><td><b>{n(r.bars ?? 0)}</b></td><td className="muted">{r.cuts?.map(c => `${n(c.length)}×${c.qty}`).join(' · ')}</td></>}
            <td className="muted">{r.cases.join(', ')}</td></tr>)}</tbody></table></div> : null;})}
    </section>
  </>;
}
