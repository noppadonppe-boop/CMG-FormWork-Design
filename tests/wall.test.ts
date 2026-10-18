import {describe, expect, it} from 'vitest';
import {WALL_SPACINGS, calculateWall, validateWallInput, wallAdvice, wallDefaults, wallFromCase} from '../src/domain/wall';

describe('wall formwork engine', () => {
  it('traces the default wall by hand: pressure → plywood → studs → twin walers → ties', () => {
    const r = calculateWall(wallDefaults), p = 24 * 3;
    expect(r.pressureModel.pmax).toBeCloseTo(p, 9);
    expect(r.studs.length).toBe(21);
    expect(r.levels).toEqual([0, 600, 1200, 1800, 2400, 3000]);
    expect(r.ties.length).toBe(11);
    const ws = p / 1000 * 300;
    expect(r.studLine).toBeCloseTo(ws, 12);
    expect(r.checks.find(k => k.id === 'stud-b')!.demand).toBeCloseTo(ws * 600 ** 2 / 8 / r.stud.S, 9);
    const ww = p / 1000 * 600;
    expect(r.walerLine).toBeCloseTo(ww, 12);
    expect(r.checks.find(k => k.id === 'waler-b')!.demand).toBeCloseTo(ww * 600 ** 2 / 8 / 2 / r.waler.S, 9);
    expect(r.tieForce).toBeCloseTo(p * 0.6 * 0.6, 9);
    expect(r.tieBody).toBeCloseTo(390 * Math.PI * 16 ** 2 / 4 / 1.67 / 1000, 9);
    expect(r.checks.find(k => k.id === 'tie-t')!.status).toBe('INCOMPLETE');
    expect(r.formArea).toBeCloseTo(2 * 6 * 3, 9);
  });

  it('uses ACI PRC-347-14(21) for walls when selected', () => {
    const r = calculateWall({...wallDefaults, pressureMethod: 'ACI347', pourRate: 1.5});
    expect(r.pressureModel.element).toBe('WALL');
    expect(r.pressureModel.pmax).toBeLessThan(72);
  });

  it('computes the ACI §4.2.3 brace force from the governing overturning moment', () => {
    const r = calculateWall(wallDefaults), H = 3, M = Math.max(1.5 * H, 0.72 * H * H / 2);
    expect(r.braceMoment).toBeCloseTo(M, 12);
    expect(r.braceGoverning).toBe('1.5 kN/m ที่ยอด');
    expect(r.braceForce).toBeCloseTo(M * 2 / (2 * Math.cos(Math.PI / 3)), 9);
    const tall = calculateWall({...wallDefaults, height: 6000, braceHeight: 4000, walerSpacing: 600});
    expect(tall.braceGoverning).toBe('ลม 0.72 kPa');
    expect(calculateWall({...wallDefaults, braceSWL: 1}).checks.find(k => k.id === 'brace-p')!.status).toBe('FAIL');
  });

  it('validates input and seeds drafts from the case footprint', () => {
    expect(() => validateWallInput({...wallDefaults, braceHeight: 4000})).toThrow(/ค้ำยัน/);
    expect(() => validateWallInput({...wallDefaults, walerSectionId: 'TIMBER-38x75-ACTUAL'})).toThrow(/walerSectionId/);
    const seeded = wallFromCase(null, {width: 8000, length: 300, height: 4000});
    expect([seeded.length, seeded.t, seeded.height, seeded.braceHeight, seeded.confirmed]).toEqual([8000, 300, 4000, 2000, false]);
    expect(wallFromCase({broken: true})).toEqual(wallDefaults);
  });

  it('advises the largest spacing without failures in the governed members', () => {
    const advice = wallAdvice(wallDefaults);
    expect(advice.map(a => a.key)).toEqual(['studSpacing', 'walerSpacing', 'tieSpacing']);
    for (const [i, a] of advice.entries()) if (a.max !== null) {
      const failed = calculateWall({...wallDefaults, [a.key]: a.max}).checks.filter(k => k.status === 'FAIL' && WALL_SPACINGS[i].prefixes.some(p => k.id.startsWith(p)));
      expect(failed).toEqual([]);
    }
  });
});
