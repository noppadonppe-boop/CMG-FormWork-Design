// Extracts TIS 1227-2558 hot-rolled channel and equal-angle tables from the SYS (Siam Yamato Steel) Engineer Handbook
// into src/reference/thai-sections/sys-tis1227-2026.json.
// Usage: curl -L -o tmp/sys/eng.pdf "<handbook url>" && node scripts/extract-sys-tis1227.mjs tmp/sys/eng.pdf
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';

const URL = 'https://www.syssteel.com/wp-content/uploads/2026/07/SYS-Catalog-Engineer-Edit6.pdf';
const file = process.argv[2] ?? 'tmp/sys/eng.pdf';
const bytes = readFileSync(file);
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
const doc = await pdfjs.getDocument({data: new Uint8Array(bytes), verbosity: 0}).promise;
const n = s => {const v = s.replace(/,/g, ''); return /^\d+(\.\d+)?$/.test(v) ? Number(v) : null;};
const size = s => s.match(/^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/);

async function rows(page) {
  const items = (await (await doc.getPage(page)).getTextContent()).items.filter(i => i.str.trim()).map(i => ({x: i.transform[4], y: Math.round(i.transform[5]), s: i.str.trim()}));
  const by = new Map(); for (const i of items.filter(i => i.y < 515 && i.y > 100)) by.set(i.y, [...(by.get(i.y) ?? []), i]);
  return [...by].sort((a, b) => b[0] - a[0]).map(([y, its]) => ({y, its: its.sort((a, b) => a.x - b.x)}));
}
const out = [], rejected = [];

// Channels: p31 geometry [size?, kg, A, d, tw, r1, bf, tf, r2, h0, k, T, Cy?, x?, e] + p32 properties [Ix, Sx, rx, Zx, Iy, Sy, ry, Zy, J?, Cw?, r0, size?].
{
  const geo = await rows(31), prop = await rows(32);
  let label = null;
  const g = geo.map(r => {const first = r.its[0]; if (size(first.s)) label = first.s; const v = r.its.filter(i => !size(i.s)).map(i => n(i.s)); return {label, v};}).filter(r => r.v.length >= 13 && r.v.every(v => v !== null));
  const p = prop.map(r => r.its.filter(i => !size(i.s)).map(i => n(i.s))).filter(v => v.length >= 11 && v.every(x => x !== null));
  if (g.length !== p.length) throw Error(`channel rows mismatch ${g.length} vs ${p.length}`);
  g.forEach((r, i) => {
    const [kg, A, d, tw, r1, bf, tf] = r.v, [Ix, Sx, rx, Zx, Iy, Sy, ry] = p[i];
    const Acalc = (d * tw + 2 * (bf - tw) * tf) / 100;
    const rec = {family: 'C', designation: `C ${d}x${bf}x${tw}x${tf}`, H_mm: d, B_mm: bf, tw_mm: tw, tf_mm: tf, r1_mm: r1, kg_per_m: kg, A_cm2: A,
      Ix_cm4: Ix, Sx_cm3: Sx, rx_cm: rx, Zx_plastic_cm3: Zx, Iy_cm4: Iy, Sy_cm3: Sy, ry_cm: ry, table: 'TIS 1227-2558 Channel', pdf_page: '31-32'};
    if (Math.abs(A / Acalc - 1) < 0.12 && Math.abs(Sx - Ix / (d / 20)) / Sx < 0.03 && Math.abs(kg / (A * 0.785) - 1) < 0.03) out.push(rec); else rejected.push(rec);
  });
}
// Equal angles: [HxB?, t, k, kg, A, r1, r2, Cx, Cy, Ix, Sx, rx] on p37 and p39.
for (const page of [37, 39]) {
  let label = null;
  for (const r of await rows(page)) {
    if (size(r.its[0].s)) label = size(r.its[0].s);
    const v = r.its.filter(i => !size(i.s)).map(i => n(i.s));
    if (v.length !== 11 || v.some(x => x === null) || !label) continue;
    const [t, , kg, A, r1, r2, Cx, Cy, Ix, Sx, rx] = v, H = Number(label[1]), B = Number(label[2]);
    if (H !== B || Cx !== Cy) {rejected.push({page, label: label[0], t, reason: 'not an equal angle'}); continue;}
    const Acalc = (t * (H + B - t)) / 100, rec = {family: 'L', designation: `L ${H}x${B}x${t}`, H_mm: H, B_mm: B, t_mm: t, r1_mm: r1, r2_mm: r2, kg_per_m: kg, A_cm2: A,
      Cy_cm: Cy, Ix_cm4: Ix, Sx_min_cm3: Sx, rx_cm: rx, table: 'TIS 1227-2558 Equal angle', pdf_page: page};
    // Published S is the minimum elastic modulus about the geometric axis: Ix / (H − Cy).
    if (Math.abs(A / Acalc - 1) < 0.1 && Math.abs(Sx - Ix / (H / 10 - Cy)) / Sx < 0.04 && Math.abs(kg / (A * 0.785) - 1) < 0.03) out.push(rec); else rejected.push(rec);
  }
}
mkdirSync('src/reference/thai-sections', {recursive: true});
writeFileSync('src/reference/thai-sections/sys-tis1227-2026.json', JSON.stringify({
  source: {source_id: 'SYS-TIS1227-2026', title: 'SYS Catalog Engineer Handbook Edit 6 — TIS 1227-2558 channel and equal-angle section properties',
    publisher: 'Siam Yamato Steel Co., Ltd. (Thailand)', url: URL, retrieved_on: new Date().toISOString().slice(0, 10),
    pdf_sha256: createHash('sha256').update(bytes).digest('hex'),
    note: 'Published gross properties. Angle S is the minimum elastic modulus about the geometric X-axis (unsymmetric section; principal axes not used). Grades per TIS 1227 (SS400 Fy 245 MPa for t ≤ 16 mm).'},
  sections: out}, null, 1));
console.log(`extracted ${out.length} (C ${out.filter(r => r.family === 'C').length}, L ${out.filter(r => r.family === 'L').length}); rejected ${rejected.length}`);
if (rejected.length) console.log(JSON.stringify(rejected.slice(0, 10)));
