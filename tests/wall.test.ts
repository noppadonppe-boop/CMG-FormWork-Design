import {describe, expect, it} from 'vitest';
import {WALL_SPACINGS, calculateWall, proppedOverhang, validateWallInput, wallAdvice, wallDefaults, wallFromCase} from '../src/domain/wall';

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

  it('propped member with overhang matches closed-form results', () => {
    const w = 5, L = 3000, a = 2000, E = 200000, I = 2e6, r = proppedOverhang(w, L, a, E, I), c = L - a;
    expect(r.Ra).toBeCloseTo(w * L * L / (2 * a), 9);
    expect(r.R0).toBeCloseTo(w * L - w * L * L / (2 * a), 9);
    expect(r.Mmax).toBeCloseTo(Math.max(r.R0 ** 2 / (2 * w), w * c * c / 2), 6);
    // Without overhang it is a simple span: 5wL⁴/384EI.
    expect(proppedOverhang(w, L, L, E, I).span).toBeCloseTo(5 * w * L ** 4 / (384 * E * I), 3);
    // Free end of the overhang under full UDL (AISC Manual beam case 24, span l = a, overhang c): Δ = w c (4c²l − l³ + 3c³) / (24EI).
    expect(r.tip).toBeCloseTo(Math.abs(w * c * (4 * c * c * a - a ** 3 + 3 * c ** 3) / (24 * E * I)), 3);
  });

  it('single-sided walls carry the full pressure through strongbacks, braces and base anchors', () => {
    const x = {...wallDefaults, system: 'SINGLE_SIDED' as const, height: 3000, braceHeight: 2000, braceSpacing: 1500, braceAngle: 60};
    const r = calculateWall(x), p = 72, sb = 1500, w = p / 1000 * sb;
    expect(r.ties).toEqual([]);
    expect(r.checks.some(k => k.id.startsWith('tie-'))).toBe(false);
    expect(r.strongbackBrace).toBeCloseTo(w * 3000 ** 2 / (2 * 2000) / 1000, 9);
    expect(r.strongbackBase).toBeCloseTo(w * 3000 / 1000 - w * 3000 ** 2 / (2 * 2000) / 1000, 9);
    const lateral = Math.max(1.5 * 3, 0.72 * 9 / 2) * 1.5 / (2 * Math.cos(Math.PI / 3));
    expect(r.braceForce).toBeCloseTo(r.strongbackBrace! / Math.cos(Math.PI / 3) + lateral, 9);
    expect(r.anchorUplift).toBeCloseTo(r.braceForce * Math.sin(Math.PI / 3), 9);
    expect(r.checks.find(k => k.id === 'waler-b')!.substitution).toContain('ระยะ strongback 1500');
    expect(r.checks.find(k => k.id === 'anchor')!.status).toBe('INCOMPLETE');
    expect(r.formArea).toBeCloseTo(6 * 3, 9);
    expect(r.quantities.some(q => q.item.startsWith('Strongback'))).toBe(true);
    expect(wallAdvice(x).map(a => a.key)).toEqual(['studSpacing', 'walerSpacing', 'braceSpacing']);
  });

  it('keeps walls saved before the single-sided option two-sided and unchanged', () => {
    const {system: _s, strongbackSectionId: _b, strongbackCount: _c, anchorSWL: _a, ...old} = wallDefaults;
    expect(validateWallInput(old).system).toBe('TWO_SIDED');
    expect(calculateWall(old).checks).toEqual(calculateWall(wallDefaults).checks);
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
