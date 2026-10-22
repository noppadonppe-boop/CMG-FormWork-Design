import {describe, expect, it} from 'vitest';
import {webcrypto} from 'node:crypto';
import {defaults} from '../src/domain/index';
import {calculateWall, wallDefaults} from '../src/domain/wall';
import {projectExample} from '../src/domain/mockProject';
import {parseProjectBackup} from '../src/domain/projectBackup';
import {barsFor, caseOrderLines, orderCsv, parseOrder, projectOrder, setsFor} from '../src/domain/projectBom';

if (!globalThis.crypto) Object.assign(globalThis, {crypto: webcrypto});

describe('project order list', () => {
  it('formwork sets = ceil(count / reuse); invalid stored orders are ignored', () => {
    expect(setsFor({count: 20, reuse: 5})).toBe(4);
    expect(setsFor({count: 7, reuse: 3})).toBe(3);
    expect(parseOrder({count: 0, reuse: 1})).toBeUndefined();
    expect(parseOrder({count: 2.5, reuse: 1})).toBeUndefined();
    expect(parseOrder({count: 4, reuse: 2})).toEqual({count: 4, reuse: 2});
  });

  it('packs cut lengths into stock bars, splicing pieces longer than a bar', () => {
    expect(barsFor(2900, 5, 6000)).toBe(3);
    expect(barsFor(1300, 21, 6000)).toBe(6); // 4 pieces per 6 m bar
    expect(barsFor(8000, 2, 6000)).toBe(4);
  });

  it('wall take-off: studs and walers by section with cut lengths, plywood by sheet, ties as hardware', () => {
    const r = calculateWall(wallDefaults), lines = caseOrderLines({name: 'W', input: {...defaults}, workflowElementType: 'WALL', wall: wallDefaults});
    const stud = lines.find(l => l.key === `mem|${r.stud.name}`)!;
    expect(stud).toMatchObject({qty: 2 * r.studs.length, length: wallDefaults.height});
    expect(lines.find(l => l.category === 'PLYWOOD')!.qty).toBe(r.quantities.find(q => q.unit === 'แผ่น')!.qty);
    expect(lines.some(l => l.category === 'HARDWARE' && l.label.startsWith('Tie'))).toBe(true);
  });

  it('adds up every Project Example case times its sets and exports a spreadsheet', () => {
    const cases = projectExample().cases, once = projectOrder(cases), twice = projectOrder(cases.map(z => ({...z, order: {count: 4, reuse: 2}})));
    expect(once.errors).toEqual([]);
    expect(once.rows.length).toBeGreaterThan(5);
    for (const row of once.rows) {
      const doubled = twice.rows.find(r => r.key === row.key)!;
      expect(doubled.qty).toBe(row.qty * 2);
      if (row.cuts) expect(row.totalLength).toBeCloseTo(row.cuts.reduce((n, c) => n + c.length * c.qty, 0) / 1000, 9);
    }
    expect(new Set(once.rows.filter(r => r.category === 'PLYWOOD').map(r => r.key)).size).toBe(once.rows.filter(r => r.category === 'PLYWOOD').length);
    const csv = orderCsv(once.rows, 6000);
    expect(csv.startsWith('﻿"หมวด"')).toBe(true);
    expect(csv.split('\r\n')).toHaveLength(once.rows.length + 1);
  });

  it('reports a case it cannot calculate instead of guessing', () => {
    const out = projectOrder([{name: 'bad', input: {...defaults, studSpacing: -1}}]);
    expect(out.rows).toEqual([]);
    expect(out.errors[0]).toContain('bad');
  });

  it('keeps the case counts through a project backup', () => {
    const p = projectExample(), cases = p.cases.map((z, i) => i === 0 ? {...z, order: {count: 6, reuse: 3}} : z);
    expect(parseProjectBackup(JSON.stringify({schemaVersion: 3, project: {...p, cases}})).cases[0].order).toEqual({count: 6, reuse: 3});
  });
});
