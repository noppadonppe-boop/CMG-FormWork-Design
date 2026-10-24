// @vitest-environment jsdom
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe, expect, it} from 'vitest';
import {calculate, defaults} from '../src/domain';
import {defaultTitleBlock} from '../src/domain/titleBlock';
import {DrawingSet} from '../src/components/DrawingSet';
import {dxfText, flattenPath, parseTransform, svgToDxf} from '../src/drawing/svgDxf';

/** Group-code pairs -> entities; throws on a malformed file. */
function parseDxf(text: string) {
  const lines = text.split('\r\n'); expect(lines.pop()).toBe('');
  expect(lines.length % 2).toBe(0);
  const pairs: [number, string][] = [];
  for (let i = 0; i < lines.length; i += 2) {const c = Number(lines[i].trim()); expect(Number.isInteger(c)).toBe(true); pairs.push([c, lines[i + 1]]);}
  expect(pairs[pairs.length - 1]).toEqual([0, 'EOF']);
  const sections = pairs.filter(([c], i) => c === 2 && pairs[i - 1]?.[1] === 'SECTION').map(p => p[1]);
  const start = pairs.findIndex(([c, v], i) => c === 2 && v === 'ENTITIES' && pairs[i - 1][1] === 'SECTION');
  const ents: {type: string; g: Map<number, string[]>}[] = [];
  for (const [c, v] of pairs.slice(start + 1)) {
    if (c === 0) {if (v === 'ENDSEC') break; ents.push({type: v, g: new Map()});}
    else {const e = ents[ents.length - 1]; e.g.set(c, [...(e.g.get(c) ?? []), v]);}
  }
  const layers = pairs.filter(([c], i) => c === 2 && pairs[i - 1]?.[1] === 'LAYER').map(p => p[1]);
  const ltypes = pairs.filter(([c], i) => c === 2 && pairs[i - 1]?.[1] === 'LTYPE').map(p => p[1]);
  return {sections, ents, layers, ltypes};
}

describe('SVG sheet to DXF', () => {
  it('parses transforms and path data', () => {
    const m = parseTransform('translate(10 5) scale(2)');
    expect(m).toEqual([2, 0, 0, 2, 10, 5]);
    const r = parseTransform('rotate(90 10 10)');
    expect(r[4] + r[0] * 20 + r[2] * 10).toBeCloseTo(10); // (20,10) -> (10,20)
    expect(r[5] + r[1] * 20 + r[3] * 10).toBeCloseTo(20);
    const [tri] = flattenPath('M2 3l-2 3.2h4z');
    expect(tri.closed).toBe(true);
    expect(tri.pts).toEqual([[2, 3], [0, 6.2], [4, 6.2]]);
    const [circle] = flattenPath('M0 0a5 5 0 1 0 10 0a5 5 0 1 0 -10 0');
    expect(circle.pts.every(([x, y]) => Math.abs(Math.hypot(x - 5, y) - 5) < 1e-9)).toBe(true);
    expect(dxfText('แปลน A')).toBe('\\U+0E41\\U+0E1B\\U+0E25\\U+0E19 A');
  });

  it('exports the FW-01 plan sheet with geometry, layers, dashes and Thai text inside the A3 frame', () => {
    const host = document.createElement('div');
    host.innerHTML = renderToStaticMarkup(<DrawingSet result={calculate(defaults)} project="P" code="C1" caseName="F1" titleBlock={defaultTitleBlock()} onTitleBlockChange={() => {}}/>);
    const svg = host.querySelector<SVGSVGElement>('.a3-sheet')!;
    const dxf = svgToDxf(svg, {title: 'FW-01'}), {sections, ents, layers, ltypes} = parseDxf(dxf);
    expect(sections).toEqual(['HEADER', 'TABLES', 'ENTITIES']);
    const count = (t: string) => ents.filter(e => e.type === t).length;
    expect(count('LINE')).toBeGreaterThan(50);
    expect(count('POLYLINE')).toBe(count('SEQEND'));
    expect(count('CIRCLE')).toBeGreaterThan(0);
    expect(count('TEXT')).toBeGreaterThan(30);
    expect(layers).toEqual(expect.arrayContaining(['CMG-LINE', 'CMG-TEXT', 'CMG-WALER', 'CMG-STUD', 'CMG-TIE', 'CMG-PLYWOOD']));
    // Every entity layer and linetype is declared in the tables.
    expect(ents.filter(e => e.g.has(8)).every(e => layers.includes(e.g.get(8)![0]))).toBe(true);
    expect(ents.filter(e => e.g.has(6)).every(e => ltypes.includes(e.g.get(6)![0]))).toBe(true);
    expect(ents.some(e => e.g.get(8)?.[0] === 'CMG-TIE' && e.g.has(6))).toBe(true);
    // Coordinates stay on the 420 × 297 sheet with Y up: the title block (sheet y 250..287) sits near the bottom.
    const xs = ents.flatMap(e => [...(e.g.get(10) ?? []), ...(e.g.get(11) ?? [])].map(Number)), ys = ents.flatMap(e => [...(e.g.get(20) ?? []), ...(e.g.get(21) ?? [])].map(Number));
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0); expect(Math.max(...xs)).toBeLessThanOrEqual(420);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(0); expect(Math.max(...ys)).toBeLessThanOrEqual(297);
    const title = ents.find(e => e.type === 'TEXT' && e.g.get(1)?.[0] === dxfText('แปลนแบบหล่อ'))!;
    expect(Number(title.g.get(20)![0])).toBeLessThan(47);
    expect(ents.filter(e => e.type === 'TEXT').every(e => /^[\x20-\x7e]*$/.test(e.g.get(1)![0]))).toBe(true);
    // Dimension values are kept as text: the footing width appears.
    expect(ents.some(e => e.type === 'TEXT' && e.g.get(1)?.[0] === defaults.width.toLocaleString('en-US'))).toBe(true);
    // Pattern-only backgrounds and the white sheet are not exported as solids.
    expect(ents.filter(e => e.type === 'SOLID').every(e => e.g.get(8)?.[0] !== 'CMG-FFFFFF')).toBe(true);
  });
});
