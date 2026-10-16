import {BookOpen} from 'lucide-react';
import type {Input} from '../domain';
import {ACI_REFERENCE, lateralPressure, unitWeightCoefficient} from '../domain/pressure';

/**
 * Design Book: theory, principles and the codes the calculation engine uses.
 * Tables 3.4 / 3.6 / 3.8 / 3.9 and chapter 2 are transcribed from the user's textbook "หนังสือ Design Form Work"
 * (Text Book/หนังสือ Design Form Work.pdf, scanned; printed page numbers given). Current-edition notes were checked on 2026-10-16.
 */
const BOOK = 'หนังสือ Design Form Work (Text Book/หนังสือ Design Form Work.pdf)';
const T34 = [['ไม้เนื้ออ่อนมาก', 78900, 60, 45, 12, null], ['ไม้เนื้ออ่อน', 94100, 80, 60, 16, 8], ['ไม้เนื้อปานกลาง', 112300, 100, 75, 22, 10],
  ['ไม้เนื้อแข็ง', 136300, 120, 90, 30, 12], ['ไม้เนื้อแข็งมาก', 189000, 150, 110, 40, 15]] as const;
const T36B = [[4, 0.6, 1.2], [6, 0.6, 1.5], [10, 0.9, 2.4], [15, 3.6, 6.0]] as const;
const T38 = [['แรงดัด (fb)', '1,022', '1,193', '1,141*'], ['แรงดึงในระนาบแผ่น (ft)', '57', '84', '84'], ['แรงอัดในระนาบแผ่น (fc)', '47', '77', '77'],
  ['แรงเฉือนตั้งฉากกับระนาบแผ่น (fv)', '11', '13', '11'], ['แรงเฉือนตามระนาบแผ่น (fs)', '3.4', '3.9', '3.9'], ['โมดูลัสแรงเฉือน (G)', '4,200', '5,250', '4,760'],
  ['แรงอัดตั้งฉากกับแผ่น (แรงบด) (Fc⊥)', '9.5', '14.7', '14.7'], ['โมดูลัสยืดหยุ่นในระนาบแผ่น (E)', '91,000', '105,000', '105,000']] as const;
const T39 = {spacing: [10, 20, 30, 40, 50, 60], rows: [[4, 9360, 4680, 3045, 1713, 1096, 761], [6, 9360, 4680, 3120, 2340, 1872, 1560], [10, 9360, 4680, 3120, 2340, 1872, 1560],
  [15, 9360, 4680, 3120, 2340, 1872, 1560], [20, 9360, 4680, 3120, 2340, 1872, 1560]]} as const;
const KSC = 0.0980665; // 1 ksc = 0.0980665 MPa
const fx = (v: number, d = 2) => v.toLocaleString('en-US', {minimumFractionDigits: d, maximumFractionDigits: d});

const STANDARDS: [string, string, string, string][] = [
  ['แรงดันคอนกรีตด้านข้าง', 'ACI 347 (ฉบับ 1978, หน่วย ปอนด์/ฟุต², °F) · CEB · CIRA', 'ACI PRC-347-14(21) Guide to Formwork for Concrete — ฉบับ 2014 ยืนยันใช้ต่อ (reapproved) ปี 2021 เป็นฉบับปัจจุบันของ ACI Committee 347; สมการ SI 4.2.2.1b พร้อม Cc, Cw', 'ใช้ใน engine (เลือก ACI347 ในเมนู Design Criteria)'],
  ['ไม้อัดแบบหล่อ', 'APA (American Plywood Association) สูตร 3.1–3.4, ตาราง 3.7–3.9', 'APA Concrete Forming Design/Construction Guide, Form V345 (ปรับปรุง พ.ค. 2012) — ฉบับปัจจุบันของ APA; ตารางแรงดันอ้าง ACI PRC-347-14(21)', 'ใช้ใน engine: Plyform Class I (ตาราง 12–13) หน้าตัดประสิทธิผล คานต่อเนื่อง 1/2/3 ช่วงตามกฎ APA ตรวจดัด แรงเฉือนกลิ้ง และการโก่ง (ดัด + เฉือน)'],
  ['ไม้โครงสร้าง (คร่าวไม้)', 'มาตรฐานสำหรับอาคารไม้ ว.ส.ท. (ตาราง 3.4)', 'มาตรฐานสำหรับอาคารไม้ ว.ส.ท. พ.ศ. 2539 เป็นฉบับที่ตำราอ้างถึง — ยังไม่พบฉบับใหม่กว่าที่ยืนยันได้ ต้องตรวจกับ วสท. ก่อนใช้', 'ใช้ใน engine (คร่าวไม้ Fb, Fv, E)'],
  ['กฎหมายการออกแบบโครงสร้าง', '—', 'กฎกระทรวงกำหนดการออกแบบโครงสร้างอาคาร พ.ศ. 2566 และประกาศกระทรวงมหาดไทย พ.ศ. 2567 (วิธีหน่วยแรงที่ยอมให้ / ตัวคูณน้ำหนักบรรทุก)', 'อ้างอิง ยังไม่ได้ผูกชุดตัวคูณน้ำหนักบรรทุก'],
];

export function DesignBook({input}: {input: Input}) {
  const hyd = lateralPressure({...input, pressureMethod: 'HYDROSTATIC'}), aci = lateralPressure({...input, pressureMethod: 'ACI347'});
  return <article className="design-book">
    <section className="card"><div className="card-title"><h3><BookOpen size={18}/> Design Book · ทฤษฎี หลักการ และมาตรฐานที่ใช้</h3></div>
      <p className="muted">สรุปจาก {BOOK} พร้อมหมายเหตุฉบับล่าสุดของมาตรฐานที่ตรวจเมื่อ ต.ค. 2569 · ค่าในตารางคัดลอกจากหนังสือ (สแกน) ตามเลขหน้าพิมพ์ ต้องตรวจทานกับต้นฉบับก่อนใช้งานจริง</p>
      <nav className="book-toc">{['1. มาตรฐานและฉบับที่ใช้', '2. หลักการคำนวณแรงดันคอนกรีต', '3. ตารางที่ 3.4 ค่าหน่วยแรงที่ยอมให้ (ว.ส.ท.)', '4. ไม้อัด: ตาราง 3.6 และสูตร APA', '5. ตารางที่ 3.8 ค่าที่ยอมให้สำหรับไม้อัด', '6. ตารางที่ 3.9 ความดันที่ยอมให้'].map((t, i) => <a key={t} href={`#book-${i + 1}`}>{t}</a>)}</nav>
    </section>

    <section className="card" id="book-1"><h3>1. มาตรฐานและฉบับที่ใช้</h3>
      <div className="table-scroll"><table><thead><tr><th>หัวข้อ</th><th>ในหนังสือ</th><th>ฉบับล่าสุด / สถานะ</th><th>ใน engine</th></tr></thead>
        <tbody>{STANDARDS.map(r => <tr key={r[0]}>{r.map((c, i) => <td key={i}>{i === 0 ? <b>{c}</b> : c}</td>)}</tr>)}</tbody></table></div>
    </section>

    <section className="card" id="book-2"><h3>2. หลักการคำนวณแรงดันคอนกรีตต่อแบบหล่อ</h3>
      <p>คอนกรีตสดดันแบบหล่อทางด้านข้างเหมือนของเหลวจนกว่าจะเริ่มก่อตัว ปัจจัยหลักคือ อัตราการเท อุณหภูมิคอนกรีต ความข้นเหลว (ค่ายุบตัว) การจี้เขย่า น้ำหนักหน่วย ชนิดปูนและสารผสมเพิ่ม และขนาดหน้าตัดของแบบ (หนังสือ บทที่ 2 หน้า 36–49)</p>
      <h4>2.1 วิธีในหนังสือ (ประวัติ)</h4>
      <ul className="book-list">
        <li><b>ACI-347 (ฉบับเดิม)</b> หน่วยปอนด์/ฟุต² และ °F: ผนัง R ≤ 7 ฟุต/ชม. P = 150 + 9,000R/T (2.7); R &gt; 7 ฟุต/ชม. P = 150 + 43,400/T + 2,800R/T (2.8); เสา P = 150 + 9,000R/T (2.9) ไม่เกิน 3,000 ปอนด์/ฟุต² หรือ 150h; slipform P = 100 + 6,000R/T (2.10); อุโมงค์ P = 150 + 9,000R/T ≥ 1,000 ปอนด์/ฟุต² (2.11)</li>
        <li><b>CEB</b> เลือกค่าต่ำสุดของ 3 กรณี: ของเหลว P = γH (2.12); การก่อตัว Ps = 2,400kR + 500 กก./ม.² (2.13, k จากตาราง 2.2 ตามค่ายุบตัวและอุณหภูมิ); ด้านแคบ Pa = 300R + 10,000d + 1,500 (2.14)</li>
        <li><b>CIRA</b> ตารางแรงดันตามความสูงและอัตราการเท (ตาราง 2.3–2.5)</li>
      </ul>
      <p className="notice">สมการ ACI ในหนังสือเป็นฉบับเก่า ไม่มีตัวคูณ Cc / Cw และใช้ขีดจำกัดต่างจากฉบับปัจจุบัน engine จึงใช้ ACI PRC-347-14(21) แทน</p>
      <h4>2.2 วิธีที่ engine ใช้ — {ACI_REFERENCE}</h4>
      <div className="table-scroll"><table><thead><tr><th>เงื่อนไข (ตาราง 4.2.2.1b)</th><th>สมการ</th></tr></thead><tbody>
        <tr><td>ค่ายุบตัว &gt; 175 mm (รวม SCC) หรือจี้ลึก &gt; 1.2 m หรือผนังเท &gt; 4.5 m/h</td><td>(a) CCP = ρgh</td></tr>
        <tr><td>เสา (ไม่มีด้านใดในแปลนเกิน 2 m) ทุกอัตราการเท · ผนังสูง ≤ 4.2 m เท &lt; 2.1 m/h</td><td>(b) CCPmax = Cc Cw [7.2 + 785R/(T+17.8)]</td></tr>
        <tr><td>ผนังสูง &gt; 4.2 m เท &lt; 2.1 m/h · ผนังเท 2.1–4.5 m/h</td><td>(c) CCPmax = Cc Cw [7.2 + 1156/(T+17.8) + 244R/(T+17.8)]</td></tr>
      </tbody></table></div>
      <p>CCPmax ไม่น้อยกว่า 30Cw kPa และไม่เกิน ρgh · R = อัตราการเท (m/h) · T = อุณหภูมิคอนกรีต (°C) · แรงดันเพิ่มเป็นเส้นตรง ρgz จนถึงความลึก hcap = CCPmax/(ρg) แล้วคงที่</p>
      <div className="grid two">
        <div><b>Cw (ตาราง 4.2.2.1a(c))</b><ul className="book-list"><li>ρ &lt; 2,240 kg/m³: Cw = 0.5[1 + ρ/2,320] ≥ 0.80</li><li>2,240 ≤ ρ ≤ 2,400: Cw = 1.0</li><li>ρ &gt; 2,400: Cw = ρ/2,320 (γ = 24 kN/m³ → ρ ≈ 2,447 → Cw = {fx(unitWeightCoefficient(24 / 0.00981), 3)})</li></ul></div>
        <div><b>Cc (ตาราง 4.2.2.1a(b))</b><ul className="book-list"><li>ปูน I/II/III ไม่มีสแลก/เถ้าลอย ไม่มีสารหน่วง: 1.0 (มีสารหน่วง 1.2)</li><li>สแลก &lt; 70% หรือเถ้าลอย &lt; 40%: 1.2 (มีสารหน่วง 1.4)</li><li>สแลก ≥ 70% หรือเถ้าลอย ≥ 40%: 1.4 (มีสารหน่วง 1.5)</li></ul></div>
      </div>
      <h4>2.3 ตัวอย่างจากแบบที่เปิดอยู่</h4>
      <p className="muted">H = {input.height} mm · แปลน {input.width} × {input.length} mm · R = {input.pourRate} m/h · T = {input.concreteTemp} °C · ยุบตัว {input.slump} mm · Cc = {input.chemistryCc} · วิธีที่ใช้ตอนนี้: <b>{input.pressureMethod === 'ACI347' ? 'ACI347' : 'แรงดันของเหลว'}</b></p>
      <ol className="rp-steps">{aci.steps.map((t, i) => <li key={i}><div className="equation">{t}</div></li>)}</ol>
      <p>ผล: ACI = <b>{fx(aci.pmax, 1)} kPa</b> เทียบกับแรงดันของเหลว ρgh = {fx(hyd.pmax, 1)} kPa ({fx(100 * aci.pmax / hyd.pmax, 0)}%) · แรงลัพธ์ต่อเมตร {fx(aci.forcePerM, 1)} kN/m เทียบ {fx(hyd.forcePerM, 1)} kN/m</p>
    </section>

    <section className="card" id="book-3"><h3>3. ตารางที่ 3.4 ค่าหน่วยแรงที่ยอมให้ตามมาตรฐานอาคารไม้ (ว.ส.ท.)</h3>
      <div className="table-scroll"><table><thead><tr><th>ประเภทไม้</th><th>โมดูลัสยืดหยุ่น (กก./ซม.²)</th><th>แรงดัด (กก./ซม.²)</th><th>แรงอัด ∥</th><th>แรงอัด ⊥</th><th>แรงเฉือน</th><th>Fb (MPa)</th></tr></thead>
        <tbody>{T34.map(([k, E, fb, c1, c2, v]) => <tr key={k}><td>{k}</td><td>{E.toLocaleString('en-US')}</td><td>{fb}</td><td>{c1}</td><td>{c2}</td><td>{v ?? '—'}</td><td>{fx(fb * KSC)}</td></tr>)}</tbody></table></div>
      <p>การใช้งานระยะสั้นเพิ่มค่าหน่วยแรงได้: แบกรับน้ำหนัก 2 เดือน +15% · 7 วัน +25% · แรงลมหรือแผ่นดินไหว +33% · แรงกระแทก +100% (ไม่เพิ่มค่าโมดูลัสยืดหยุ่น) — หนังสือ หน้า 57</p>
      <p className="muted">engine ใช้ตารางนี้กับคร่าวไม้ (fb = M/S ≤ Fb, fv = 1.5V/A ≤ Fv, การโก่งด้วย E) โดยยังไม่ใช้ตัวเพิ่มค่าระยะสั้น (ปลอดภัยไว้ก่อน) · ไม้เนื้ออ่อนมากไม่มีค่าแรงเฉือนในตาราง</p>
    </section>

    <section className="card" id="book-4"><h3>4. ไม้อัด: ตารางที่ 3.6 และสูตรของ APA</h3>
      <div className="grid two">
        <div><h4>ตารางที่ 3.6 ก. ขนาดไม้อัดในท้องตลาด</h4><p>4 × 8 ฟุต (1.22 × 2.44 m) · หนา 3.2, 4, 6, 10, 15, 20 mm (หน้า 59)</p></div>
        <div><h4>ตารางที่ 3.6 ข. พิกัดการงอแผ่นไม้อัด</h4>
          <table><thead><tr><th>ความหนา (mm)</th><th>รัศมีดัดต่ำสุด ตั้งฉากเสี้ยน (m)</th><th>ตามแนวเสี้ยน (m)</th></tr></thead>
            <tbody>{T36B.map(([t, a, b]) => <tr key={t}><td>{t}</td><td>{fx(a)}</td><td>{fx(b)}</td></tr>)}</tbody></table><p className="muted">หน้า 60 · ใช้ตรวจแบบหล่อผิวโค้ง</p></div>
      </div>
      <h4>ความดันที่ยอมให้บนแผ่นไม้อัด (APA, หน้า 60–61)</h4>
      <ul className="book-list">
        <li>จากหน่วยแรงดัด: W<sub>b</sub> = K<sub>b</sub> f<sub>b</sub> S<sub>e</sub> / l<sub>b</sub>² (3.1) · K<sub>b</sub> = 8 (2 ช่วง), 10 (3 ช่วงขึ้นไป)</li>
        <li>จากการแอ่นตัวด้วยการดัด: W<sub>d</sub> = K<sub>d</sub> E I D<sub>b</sub> / l<sub>d</sub>⁴ (3.2) · K<sub>d</sub> = 185 (2 ช่วง), 145 (3 ช่วงขึ้นไป)</li>
        <li>จากหน่วยแรงเฉือน: W<sub>s</sub> = K<sub>s</sub> f<sub>s</sub> (Ib/Q) / l<sub>s</sub> (3.3) · Ib/Q = 3/2 สำหรับหน้าตัดสี่เหลี่ยม · K<sub>s</sub> = 1.60 (2 ช่วง), 1.67 (3 ช่วงขึ้นไป)</li>
        <li>จากการแอ่นตัวด้วยแรงเฉือน: W<sub>s</sub> = K<sub>sd</sub> D<sub>s</sub> E<sub>e</sub> I / (C t² l<sub>s</sub>²) (3.4)</li>
      </ul>
      <p className="muted">engine ใช้วิธีเดียวกันตาม APA V345 หน้า 22–23: Kb = 8 / 10, Ks = 1.60 / 1.67, Kd = 185 / 145 (2 / 3 ช่วง) บนหน้าตัดประสิทธิผล (ตาราง 12) และรวมการโก่งจากแรงเฉือน · จำนวนช่วงเลือกอัตโนมัติตามขนาดแผ่นและระยะคร่าว หรือกำหนดเองในเมนู Design Criteria</p>
    </section>

    <section className="card" id="book-5"><h3>5. ตารางที่ 3.8 ค่าที่ยอมให้สำหรับไม้อัด พิจารณาใช้เพื่อการออกแบบ (กก./ซม.²)</h3>
      <div className="table-scroll"><table><thead><tr><th>หน่วยแรง</th><th>ไม้อัดภายนอก · ชื้น</th><th>ไม้อัดภายนอก · แห้ง</th><th>ไม้อัดภายใน (แห้ง)</th></tr></thead>
        <tbody>{T38.map(r => <tr key={r[0]}>{r.map((c, i) => <td key={i}>{c}</td>)}</tr>)}</tbody></table></div>
      <p className="warning">ค่าแรงดัด fb ที่พิมพ์ (1,022–1,193 กก./ซม.²) สูงกว่าแรงดัดที่ยอมให้ของไม้เนื้อแข็งมากในตาราง 3.4 (150 กก./ซม.²) เกือบ 10 เท่า อาจเป็นการพิมพ์คลาดเคลื่อนหรือนิยามต่างกัน ต้องตรวจต้นฉบับก่อนใช้ · * หลักสุดท้ายในสแกนไม่ชัด · engine ยังไม่ใช้ตารางนี้</p>
    </section>

    <section className="card" id="book-6"><h3>6. ตารางที่ 3.9 ค่าความดันของคอนกรีตที่ยอมให้เมื่อเคร่าขนานกับแนวเสี้ยน (กก./ม.²)</h3>
      <div className="table-scroll"><table><thead><tr><th>ความหนาไม้อัด (mm)</th>{T39.spacing.map(s => <th key={s}>เคร่า @ {s} ซม.</th>)}</tr></thead>
        <tbody>{T39.rows.map(([t, ...v]) => <tr key={t}><td>{t}</td>{v.map((q, i) => <td key={i}>{q.toLocaleString('en-US')}</td>)}</tr>)}</tbody></table></div>
      <p className="muted">หน้า 63 · ใช้เทียบกับแรงดันคอนกรีตในหัวข้อ 2 (1 kPa ≈ 102 กก./ม.²)</p>
    </section>
  </article>;
}
