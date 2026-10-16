// Extracts TIS 107-2566 tube tables (ก.1 round STK / ข.1 square STKR / ค.1 rectangular STKR) from the
// Pacific Pipe structural steel catalogue 2026_2 into src/reference/thai-sections/pap-tis107-2026.json.
// Usage: curl -L -o tmp/pap/cat.pdf "<catalogue url>" && node scripts/extract-pap-tis107.mjs tmp/pap/cat.pdf
// Every row is cross-checked against hand-computed gross geometry; rows that disagree are rejected and reported.
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';

const URL = 'https://www.pacificpipe.co.th/files/download/pap%20catalog%20for%20structural%20steel%202026_2.pdf';
const file = process.argv[2] ?? 'tmp/pap/cat.pdf';
const bytes = readFileSync(file);
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
const doc = await pdfjs.getDocument({data: new Uint8Array(bytes), verbosity: 0}).promise;
const num = s => /^\d+(\.\d+)?$/.test(s) ? Number(s) : null;
const out = [], rejected = [];

for (let page = 10; page <= 25; page++) {
  const items = (await (await doc.getPage(page)).getTextContent()).items.filter(i => i.str.trim())
    .map(i => ({x: i.transform[4], y: i.transform[5], s: i.str.trim()}));
  for (const [x0, x1] of [[0, 640], [640, 1300]]) {
    const half = items.filter(i => i.x >= x0 && i.x < x1);
    const head = half.filter(i => i.y > 700).map(i => i.s).join(' ');
    // Table ก.1 / ข.1 / ค.1 are the JIS-based TIS 107 tables (ASTM A500 / EN 10219 variants are .2 / .3).
    const jis = head.includes('JIS G3444') ? 'ก' : head.includes('JIS G3466') ? (/Table\s*ค/.test(head) ? 'ค' : 'ข') : null;
    const table = jis ? jis + '.1' : null;
    if (!table) continue;
    const shape = table === 'ก.1' ? 'CHS' : table === 'ข.1' ? 'SHS' : 'RHS', width = shape === 'RHS' ? 9 : 6;
    const byY = new Map();
    for (const i of half.filter(i => i.y < 620)) {const k = Math.round(i.y); byY.set(k, [...(byY.get(k) ?? []), i]);}
    const rows = [...byY].sort((a, b) => b[0] - a[0]).map(([y, its]) => ({y, its: its.sort((a, b) => a.x - b.x)}));
    // Data rows: exactly `width` numeric tokens to the right of the label column.
    // Column positions are relative to the half's "Norminal" header (the two halves are not offset by exactly 640).
    const origin = Math.min(...half.filter(i => /^Norminal/.test(i.s)).map(i => i.x));
    if (!Number.isFinite(origin)) continue;
    const labelX = origin + (shape === 'CHS' ? 125 : 50);
    const data = rows.map(r => ({y: r.y, v: r.its.filter(i => i.x > labelX).map(i => num(i.s))})).filter(r => r.v.length === width && r.v.every(v => v !== null));
    // Size labels may be split over several tokens/lines; collect every label-column token inside a group.
    const labelTokens = half.filter(i => i.y < 620 && i.x <= labelX && /^[\d.\s xX/"”]+$/.test(i.s));
    const labelFor = g => {
      const top = g[0].y + 8, bottom = g.at(-1).y - 8;
      const toks = labelTokens.filter(i => i.y <= top && i.y >= bottom).sort((a, b) => b.y - a.y || a.x - b.x);
      if (shape === 'CHS') {const od = toks.filter(i => i.x > origin + 80).map(i => num(i.s)).filter(v => v !== null); const nps = toks.filter(i => /["”]/.test(i.s)).map(i => i.s).join(' ');
        return od.length === 1 ? {od: od[0], nps} : null;}
      const text = toks.map(i => i.s).join(' '), nums = text.match(/\d+(?:\.\d+)?/g)?.map(Number) ?? [];
      if (shape === 'SHS') return nums.length >= 1 && nums.every(n => n === nums[0]) ? {H: nums[0], B: nums[0]} : null;
      return nums.length === 2 ? {H: nums[0], B: nums[1]} : null;
    };
    // Groups: thickness increases within a size; a drop starts the next size.
    const groups = [];
    for (const r of data) {const g = groups.at(-1); if (!g || r.v[0] <= g.at(-1).v[0]) groups.push([r]); else g.push(r);}
    for (const g of groups) {
      const L = labelFor(g);
      if (!L) {rejected.push({page, table, reason: 'size label not resolved', firstT: g[0].v[0], rows: g.length}); continue;}
      for (const r of g) {
        const t = r.v[0], kg = r.v[1], A = r.v[2];
        let rec;
        if (shape === 'CHS') {
          const D = L.od, Ac = Math.PI / 4 * (D ** 2 - (D - 2 * t) ** 2) / 100, Ic = Math.PI / 64 * (D ** 4 - (D - 2 * t) ** 4) / 1e4;
          rec = {family: 'CHS', designation: `CHS ${D}x${t}`, D_mm: D, nps: L.nps.replace(/\s+/g, ' '), t_mm: t, kg_per_m: kg, A_cm2: A, I_cm4: r.v[3], S_cm3: r.v[4], r_cm: r.v[5], check: {A: Ac, I: Ic}};
        } else if (shape === 'SHS') {
          const B = L.H, Ac = (B * B - (B - 2 * t) ** 2) / 100, Ic = (B ** 4 - (B - 2 * t) ** 4) / 12 / 1e4;
          rec = {family: 'SHS', designation: `SHS ${B}x${B}x${t}`, H_mm: B, B_mm: B, t_mm: t, kg_per_m: kg, A_cm2: A, Ix_cm4: r.v[3], Sx_cm3: r.v[4], rx_cm: r.v[5], check: {A: Ac, I: Ic}};
        } else {
          const {H, B} = L, Ac = (B * H - (B - 2 * t) * (H - 2 * t)) / 100, Ic = (B * H ** 3 - (B - 2 * t) * (H - 2 * t) ** 3) / 12 / 1e4;
          rec = {family: 'RHS', designation: `RHS ${H}x${B}x${t}`, H_mm: H, B_mm: B, t_mm: t, kg_per_m: kg, A_cm2: A, Ix_cm4: r.v[3], Iy_cm4: r.v[4], Sx_cm3: r.v[5], Sy_cm3: r.v[6], rx_cm: r.v[7], ry_cm: r.v[8], check: {A: Ac, I: Ic}};
        }
        const I = rec.I_cm4 ?? rec.Ix_cm4, okA = Math.abs(A / rec.check.A - 1) < 0.12, okI = Math.abs(I / rec.check.I - 1) < 0.15, okKg = Math.abs(kg / (A * 0.785) - 1) < 0.03;
        const {check, ...clean} = rec;
        if (okA && okI && okKg) out.push({...clean, table: `TIS 107-2566 Table ${table}`, pdf_page: page});
        else rejected.push({page, table, designation: rec.designation, A, Acalc: +rec.check.A.toFixed(3), I, Icalc: +rec.check.I.toFixed(3), kg});
      }
    }
  }
}
const uniq = [...new Map(out.map(r => [r.designation, r])).values()];
mkdirSync('src/reference/thai-sections', {recursive: true});
writeFileSync('src/reference/thai-sections/pap-tis107-2026.json', JSON.stringify({
  source: {source_id: 'PAP-TIS107-2026', title: 'Pacific Pipe Structural Steel catalogue 2026_2 — TIS 107-2566 Tables ก.1 / ข.1 / ค.1 (JIS G3444 / G3466)',
    publisher: 'Pacific Pipe Public Company Limited (Thailand)', url: URL, retrieved_on: new Date().toISOString().slice(0, 10),
    pdf_sha256: createHash('sha256').update(bytes).digest('hex'),
    note: 'Published gross section properties (A, I, S, r, kg/m). Corner radii per manufacturer. Grade STK400 / STKR400 Fy 245 MPa (catalogue p10). Not effective-section capacities.'},
  sections: uniq}, null, 1));
console.log(`extracted ${uniq.length} (${['CHS', 'SHS', 'RHS'].map(f => f + ' ' + uniq.filter(r => r.family === f).length).join(', ')}); rejected ${rejected.length}`);
if (rejected.length) console.log(JSON.stringify(rejected.slice(0, 15), null, 0));
