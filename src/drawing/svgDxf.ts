/**
 * Rendered A3 sheet SVG -> ASCII DXF (AutoCAD R12, paper millimetres 1:1, Y up).
 * Works on the live DOM (browser or jsdom), so every sheet that the app draws exports the same geometry
 * that is printed: strokes become LINE/POLYLINE/CIRCLE, small solid fills SOLID, text TEXT (Thai as \U+XXXX).
 * Pattern hatches are not exported; their outlines are.
 */
type M = [number, number, number, number, number, number];
type P = [number, number];
const ID: M = [1, 0, 0, 1, 0, 0];
const mul = (m: M, n: M): M => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
const app = (m: M, [x, y]: P): P => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const nums = (s: string) => (s.match(/-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) ?? []).map(Number);

export function parseTransform(t: string | null): M {
  let m = ID;
  for (const [, fn, args] of (t ?? '').matchAll(/(\w+)\s*\(([^)]*)\)/g)) {
    const a = nums(args);
    if (fn === 'translate') m = mul(m, [1, 0, 0, 1, a[0] ?? 0, a[1] ?? 0]);
    else if (fn === 'scale') m = mul(m, [a[0] ?? 1, 0, 0, a[1] ?? a[0] ?? 1, 0, 0]);
    else if (fn === 'matrix' && a.length === 6) m = mul(m, a as M);
    else if (fn === 'rotate') {
      const r = (a[0] ?? 0) * Math.PI / 180, c = Math.cos(r), s = Math.sin(r), cx = a[1] ?? 0, cy = a[2] ?? 0;
      m = mul(mul(mul(m, [1, 0, 0, 1, cx, cy]), [c, s, -s, c, 0, 0]), [1, 0, 0, 1, -cx, -cy]);
    }
  }
  return m;
}

/** SVG path data -> flattened subpaths in local coordinates. */
export function flattenPath(d: string): {pts: P[]; closed: boolean}[] {
  const out: {pts: P[]; closed: boolean}[] = [];
  const toks = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) ?? [];
  let i = 0, cmd = '', cur: P = [0, 0], start: P = [0, 0], ctrl: P | null = null, sub: P[] | null = null;
  const n = () => Number(toks[i++]);
  const push = (p: P) => {if (!sub) {sub = [cur]; out.push({pts: sub, closed: false});} sub.push(p); cur = p;};
  const curve = (f: (t: number) => P, seg = 12) => {for (let k = 1; k <= seg; k++) push(f(k / seg));};
  while (i < toks.length) {
    if (/[a-zA-Z]/.test(toks[i])) cmd = toks[i++];
    const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase(), o: P = rel ? cur : [0, 0];
    if (C === 'Z') {
      if (sub) {(out[out.length - 1]).closed = true;} cur = start; sub = null; ctrl = null; continue;
    }
    if (C === 'M') {
      cur = [o[0] + n(), o[1] + n()]; start = cur; sub = null; ctrl = null; cmd = rel ? 'l' : 'L'; continue;
    }
    if (C === 'L') {const p: P = [o[0] + n(), o[1] + n()]; push(p); ctrl = null;}
    else if (C === 'H') {push([(rel ? cur[0] : 0) + n(), cur[1]]); ctrl = null;}
    else if (C === 'V') {push([cur[0], (rel ? cur[1] : 0) + n()]); ctrl = null;}
    else if (C === 'Q' || C === 'T') {
      const p0 = cur, q: P = C === 'Q' ? [o[0] + n(), o[1] + n()] : ctrl ? [2 * p0[0] - ctrl[0], 2 * p0[1] - ctrl[1]] : p0, p1: P = [o[0] + n(), o[1] + n()];
      curve(t => [(1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * q[0] + t * t * p1[0], (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * q[1] + t * t * p1[1]]); ctrl = q;
    } else if (C === 'C' || C === 'S') {
      const p0 = cur, c1: P = C === 'C' ? [o[0] + n(), o[1] + n()] : ctrl ? [2 * p0[0] - ctrl[0], 2 * p0[1] - ctrl[1]] : p0;
      const c2: P = [o[0] + n(), o[1] + n()], p1: P = [o[0] + n(), o[1] + n()];
      curve(t => {const u = 1 - t; return [u ** 3 * p0[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t ** 3 * p1[0], u ** 3 * p0[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t ** 3 * p1[1]];}); ctrl = c2;
    } else if (C === 'A') {
      let rx = Math.abs(n()), ry = Math.abs(n());
      const phi = n() * Math.PI / 180, large = n() !== 0, sweep = n() !== 0, p0 = cur, p1: P = [o[0] + n(), o[1] + n()];
      ctrl = null;
      if (!rx || !ry) {push(p1); continue;}
      const cp = Math.cos(phi), sp = Math.sin(phi), dx = (p0[0] - p1[0]) / 2, dy = (p0[1] - p1[1]) / 2;
      const x1 = cp * dx + sp * dy, y1 = -sp * dx + cp * dy, lam = x1 * x1 / (rx * rx) + y1 * y1 / (ry * ry);
      if (lam > 1) {rx *= Math.sqrt(lam); ry *= Math.sqrt(lam);}
      const num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1, den = rx * rx * y1 * y1 + ry * ry * x1 * x1;
      const k = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / den));
      const cxp = k * rx * y1 / ry, cyp = -k * ry * x1 / rx, cx = cp * cxp - sp * cyp + (p0[0] + p1[0]) / 2, cy = sp * cxp + cp * cyp + (p0[1] + p1[1]) / 2;
      const ang = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
      const t1 = ang(1, 0, (x1 - cxp) / rx, (y1 - cyp) / ry);
      let dt = ang((x1 - cxp) / rx, (y1 - cyp) / ry, (-x1 - cxp) / rx, (-y1 - cyp) / ry);
      if (!sweep && dt > 0) dt -= 2 * Math.PI; else if (sweep && dt < 0) dt += 2 * Math.PI;
      const seg = Math.max(4, Math.ceil(Math.abs(dt) / (Math.PI / 18)));
      curve(t => {const a = t1 + dt * t, ex = rx * Math.cos(a), ey = ry * Math.sin(a); return [cp * ex - sp * ey + cx, sp * ex + cp * ey + cy];}, seg);
      cur = p1;
    } else i++;
  }
  return out.filter(s => s.pts.length > 1);
}

const LAYER_BY_COLOR: Record<string, string> = {'#111111': 'CMG-LINE', '#000000': 'CMG-LINE', '#9b1c1c': 'CMG-WALER', '#1d4e89': 'CMG-STUD', '#1e7b34': 'CMG-TIE', '#9a6a2c': 'CMG-PLYWOOD', '#c0392b': 'CMG-STAMP'};
const ACI: [number, number, number, number][] = [[1, 255, 0, 0], [2, 255, 255, 0], [3, 0, 255, 0], [4, 0, 255, 255], [5, 0, 0, 255], [6, 255, 0, 255], [8, 128, 128, 128], [9, 192, 192, 192],
  [14, 165, 0, 0], [34, 165, 82, 0], [94, 0, 165, 0], [134, 0, 82, 165], [154, 0, 82, 165], [174, 0, 0, 165], [30, 255, 127, 0], [40, 255, 191, 0], [250, 51, 51, 51], [251, 80, 80, 80], [7, 0, 0, 0]];
function hex(c: string | null): string | null {
  if (!c || c === 'none' || c === 'transparent' || c.startsWith('url(')) return null;
  const s = c.trim().toLowerCase();
  if (/^#[0-9a-f]{3}$/.test(s)) return '#' + [...s.slice(1)].map(ch => ch + ch).join('');
  if (/^#[0-9a-f]{6}$/.test(s)) return s;
  const m = s.match(/rgba?\((\d+)[ ,]+(\d+)[ ,]+(\d+)/);
  if (m) return '#' + m.slice(1, 4).map(v => Number(v).toString(16).padStart(2, '0')).join('');
  return ({black: '#000000', white: '#ffffff', red: '#ff0000'} as Record<string, string>)[s] ?? '#111111';
}
const isWhite = (h: string) => parseInt(h.slice(1), 16) >= 0xf0f0f0 && [1, 3, 5].every(i => parseInt(h.slice(i, i + 2), 16) >= 0xf0);
function aci(h: string) {
  const r = parseInt(h.slice(1, 3), 16), g = parseInt(h.slice(3, 5), 16), b = parseInt(h.slice(5, 7), 16);
  if (Math.max(r, g, b) < 60) return 7;
  return ACI.reduce((best, c) => {const d = (c[1] - r) ** 2 + (c[2] - g) ** 2 + (c[3] - b) ** 2; return d < best[1] ? [c[0], d] : best;}, [7, Infinity])[0];
}
const layerOf = (h: string) => LAYER_BY_COLOR[h] ?? 'CMG-' + h.slice(1).toUpperCase();
/** DXF text: non-ASCII characters as \U+XXXX (AutoCAD unicode escape), control characters dropped. */
export const dxfText = (s: string) => [...s].map(ch => {const c = ch.codePointAt(0)!; return c < 32 ? '' : c > 126 ? '\\U+' + c.toString(16).toUpperCase().padStart(4, '0') : ch;}).join('').replace(/%%/g, '%');
const f = (v: number) => (Math.abs(v) < 5e-7 ? 0 : Math.round(v * 1000) / 1000).toString();

export function svgToDxf(svg: SVGSVGElement, {title = '', font = 'tahoma.ttf'}: {title?: string; font?: string} = {}): string {
  const vb = nums(svg.getAttribute('viewBox') ?? '0 0 420 297'), H = vb[3] ?? 297, X0 = vb[0] ?? 0, Y0 = vb[1] ?? 0;
  const out: (string | number)[] = [], layers = new Map<string, number>([['CMG-TEXT', 7], ['CMG-HATCH-AREA', 8]]), ltypes = new Map<string, number[]>();
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const W = ([x, y]: P): P => {const p: P = [x - X0, H - (y - Y0)]; minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); return p;};
  const ent = (type: string, layer: string, h: string, extra: (string | number)[], dash?: string) => {
    if (!layers.has(layer)) layers.set(layer, aci(h));
    out.push(0, type, 8, layer);
    if (dash) out.push(6, dash);
    if (aci(h) !== layers.get(layer)) out.push(62, aci(h));
    out.push(...extra);
  };
  const attr = (el: Element, name: string): string | null => {
    for (let e: Element | null = el; e && e !== svg.parentElement; e = e.parentElement) {const v = e.getAttribute(name); if (v !== null) return v;}
    return null;
  };
  const dashName = (el: Element, scale: number) => {
    const d = attr(el, 'stroke-dasharray'); if (!d || d === 'none') return undefined;
    const a = nums(d).map(v => v * scale).filter(v => v > 0); if (!a.length) return undefined;
    const pat = a.length % 2 ? [...a, ...a] : a, name = 'DASH_' + pat.map(v => f(v).replace('.', 'P')).join('_');
    ltypes.set(name, pat); return name;
  };
  const shape = (el: Element, m: M, rings: {pts: P[]; closed: boolean}[]) => {
    const stroke = hex(attr(el, 'stroke')), fillAttr = attr(el, 'fill'), fill = hex(fillAttr ?? '#000');
    const sc = Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;
    if (stroke) {
      const lay = layerOf(stroke), dash = dashName(el, sc);
      for (const r of rings) {
        const pts = r.pts.map(p => W(app(m, p)));
        if (pts.length === 2 && !r.closed) ent('LINE', lay, stroke, [10, f(pts[0][0]), 20, f(pts[0][1]), 30, 0, 11, f(pts[1][0]), 21, f(pts[1][1]), 31, 0], dash);
        else {
          ent('POLYLINE', lay, stroke, [66, 1, 10, 0, 20, 0, 30, 0, 70, r.closed ? 1 : 0], dash);
          for (const p of pts) out.push(0, 'VERTEX', 8, lay, 10, f(p[0]), 20, f(p[1]), 30, 0);
          out.push(0, 'SEQEND', 8, lay);
        }
      }
    } else if (fill && !isWhite(fill)) {
      const lay = layerOf(fill);
      for (const r of rings) {
        const pts = r.pts.map(p => W(app(m, p)));
        if (r.closed && pts.length >= 3 && pts.length <= 4) {
          const q = pts.length === 3 ? [pts[0], pts[1], pts[2], pts[2]] : [pts[0], pts[1], pts[3], pts[2]];
          ent('SOLID', lay, fill, q.flatMap((p, j) => [10 + j, f(p[0]), 20 + j, f(p[1]), 30 + j, 0]));
        } else {
          ent('POLYLINE', lay, fill, [66, 1, 10, 0, 20, 0, 30, 0, 70, r.closed ? 1 : 0]);
          for (const p of pts) out.push(0, 'VERTEX', 8, lay, 10, f(p[0]), 20, f(p[1]), 30, 0);
          out.push(0, 'SEQEND', 8, lay);
        }
      }
    } else if (fillAttr?.startsWith('url(')) {
      // Hatched area without its own outline: keep the boundary so the region stays visible in CAD.
      for (const r of rings) {
        const pts = r.pts.map(p => W(app(m, p)));
        ent('POLYLINE', 'CMG-HATCH-AREA', '#808080', [66, 1, 10, 0, 20, 0, 30, 0, 70, 1]);
        for (const p of pts) out.push(0, 'VERTEX', 8, 'CMG-HATCH-AREA', 10, f(p[0]), 20, f(p[1]), 30, 0);
        out.push(0, 'SEQEND', 8, 'CMG-HATCH-AREA');
      }
    }
  };
  const num = (el: Element, k: string) => Number(el.getAttribute(k) ?? 0) || 0;
  const visit = (el: Element, parent: M) => {
    const tag = el.tagName.toLowerCase();
    if (['defs', 'pattern', 'clippath', 'mask', 'marker', 'symbol', 'title', 'desc', 'style', 'script'].includes(tag)) return;
    if (el.getAttribute('display') === 'none' || el.getAttribute('visibility') === 'hidden') return;
    const m = mul(parent, parseTransform(el.getAttribute('transform')));
    if (tag === 'g' || tag === 'svg' || tag === 'a') {for (const c of Array.from(el.children)) visit(c, m); return;}
    if (tag === 'line') shape(el, m, [{pts: [[num(el, 'x1'), num(el, 'y1')], [num(el, 'x2'), num(el, 'y2')]], closed: false}]);
    else if (tag === 'rect') {
      const x = num(el, 'x'), y = num(el, 'y'), w = num(el, 'width'), h = num(el, 'height');
      if (w > 0 && h > 0) shape(el, m, [{pts: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], closed: true}]);
    } else if (tag === 'polyline' || tag === 'polygon') {
      const v = nums(el.getAttribute('points') ?? ''), pts: P[] = [];
      for (let k = 0; k + 1 < v.length; k += 2) pts.push([v[k], v[k + 1]]);
      if (pts.length > 1) shape(el, m, [{pts, closed: tag === 'polygon'}]);
    } else if (tag === 'path') shape(el, m, flattenPath(el.getAttribute('d') ?? ''));
    else if (tag === 'circle' || tag === 'ellipse') {
      const cx = num(el, 'cx'), cy = num(el, 'cy'), rx = tag === 'circle' ? num(el, 'r') : num(el, 'rx'), ry = tag === 'circle' ? rx : num(el, 'ry');
      if (rx <= 0 || ry <= 0) return;
      const uniform = Math.abs(rx - ry) < 1e-9 && Math.abs(m[0] - m[3]) < 1e-9 && Math.abs(m[1] + m[2]) < 1e-9;
      const stroke = hex(attr(el, 'stroke')), fill = hex(attr(el, 'fill') ?? '#000');
      if (uniform && stroke) {
        const c = W(app(m, [cx, cy])), r = rx * Math.hypot(m[0], m[1]);
        ent('CIRCLE', layerOf(stroke), stroke, [10, f(c[0]), 20, f(c[1]), 30, 0, 40, f(r)], dashName(el, Math.hypot(m[0], m[1])));
        void W(app(m, [cx - rx, cy - rx])); void W(app(m, [cx + rx, cy + rx]));
      } else if (stroke || (fill && !isWhite(fill))) {
        const seg = 36, pts: P[] = Array.from({length: seg}, (_, k) => [cx + rx * Math.cos(2 * Math.PI * k / seg), cy + ry * Math.sin(2 * Math.PI * k / seg)]);
        // Small filled dots (leader ends, tie plates) stay closed outlines so they are visible without hatching.
        shape(el, m, [{pts, closed: true}]);
      }
    } else if (tag === 'text') {
      const s = (el.textContent ?? '').replace(/\s+/g, ' ').trim(); if (!s) return;
      const x = num(el, 'x'), y = num(el, 'y'), size = Number(attr(el, 'font-size') ?? 2.5) || 2.5;
      const p = W(app(m, [x, y])), ang = Math.atan2(-m[1], m[0]) * 180 / Math.PI, k = Math.hypot(m[0], m[1]);
      const color = hex(attr(el, 'fill') ?? '#111') ?? '#111111', anchor = attr(el, 'text-anchor'), h72 = anchor === 'middle' ? 1 : anchor === 'end' ? 2 : 0;
      const base = [10, f(p[0]), 20, f(p[1]), 30, 0, 40, f(size * k * 0.72), 1, dxfText(s), ...(Math.abs(ang) > 1e-6 ? [50, f(ang)] : []), 7, 'CMG'];
      ent('TEXT', 'CMG-TEXT', color, h72 ? [...base, 72, h72, 11, f(p[0]), 21, f(p[1]), 31, 0] : base);
    }
  };
  for (const c of Array.from(svg.children)) visit(c, ID);
  if (!Number.isFinite(minX)) {minX = minY = 0; maxX = vb[2] ?? 420; maxY = H;}
  const lt = [...ltypes].map(([name, pat]) => [0, 'LTYPE', 2, name, 70, 0, 3, pat.map(v => f(v)).join(' '), 72, 65, 73, pat.length, 40, f(pat.reduce((a, b) => a + b, 0)), ...pat.flatMap((v, i) => [49, f(i % 2 ? -v : v)])]).flat();
  const ly = [...layers].flatMap(([name, c]) => [0, 'LAYER', 2, name, 70, 0, 62, c, 6, 'CONTINUOUS']);
  return [
    999, dxfText(`CMG Formwork A3 sheet${title ? ' ' + title : ''} · paper mm 1:1 · screening draft, NOT FOR CONSTRUCTION`),
    0, 'SECTION', 2, 'HEADER', 9, '$ACADVER', 1, 'AC1009', 9, '$DWGCODEPAGE', 3, 'ANSI_874', 9, '$INSUNITS', 70, 4,
    9, '$EXTMIN', 10, f(minX), 20, f(minY), 30, 0, 9, '$EXTMAX', 10, f(maxX), 20, f(maxY), 30, 0,
    9, '$LIMMIN', 10, 0, 20, 0, 9, '$LIMMAX', 10, f(vb[2] ?? 420), 20, f(H), 9, '$LTSCALE', 40, 1, 0, 'ENDSEC',
    0, 'SECTION', 2, 'TABLES',
    0, 'TABLE', 2, 'LTYPE', 70, ltypes.size + 1, 0, 'LTYPE', 2, 'CONTINUOUS', 70, 0, 3, 'Solid line', 72, 65, 73, 0, 40, 0, ...lt, 0, 'ENDTAB',
    0, 'TABLE', 2, 'LAYER', 70, layers.size + 1, 0, 'LAYER', 2, '0', 70, 0, 62, 7, 6, 'CONTINUOUS', ...ly, 0, 'ENDTAB',
    0, 'TABLE', 2, 'STYLE', 70, 1, 0, 'STYLE', 2, 'CMG', 70, 0, 40, 0, 41, 1, 50, 0, 71, 0, 42, 2.5, 3, font, 4, '', 0, 'ENDTAB',
    0, 'ENDSEC', 0, 'SECTION', 2, 'ENTITIES', ...out, 0, 'ENDSEC', 0, 'EOF',
  ].join('\r\n') + '\r\n';
}
