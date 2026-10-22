import {describe, expect, it} from 'vitest';
import {SLAB_SPACINGS, calculateSlab, slabAdvice, slabDefaults, slabFromCase, slabLoads, validateSlabInput} from '../src/domain/slab';

describe('slab formwork engine', () => {
  it('applies the ACI PRC-347-14(21) §4.2.1 vertical load minimums', () => {
    expect(slabLoads(slabDefaults).q).toBeCloseTo(24 * 0.15 + 0.5 + 2.4, 9);
    const thin = {...slabDefaults, t: 50, formDead: 0, liveLoad: 1};
    expect(slabLoads(thin).q).toBe(4.8);
    expect(slabLoads({...thin, motorized: true}).q).toBe(6.0);
  });

  it('traces the default bay by hand through every member', () => {
    const r = calculateSlab(slabDefaults), q = 6.5;
    expect(r.joists.length).toBe(21);
    expect(r.bearers.length).toBe(5);
    expect(r.shores.length).toBe(6);
    expect(r.shoreCount).toBe(30);
    const wj = q / 1000 * 300, wb = q / 1000 * 1000;
    expect(r.joistLine).toBeCloseTo(wj, 12);
    const jb = r.checks.find(k => k.id === 'joist-b')!;
    expect(jb.demand).toBeCloseTo(wj * 1000 ** 2 / 8 / r.joist.S, 9);
    const jd = r.checks.find(k => k.id === 'joist-d')!;
    expect(jd.demand).toBeCloseTo(5 * wj * 1000 ** 4 / (384 * r.joist.E * r.joist.I), 9);
    // Joists continuous over 4 bearer spans (interior reaction 8/7 wL), bearers over 5 shore spans (43/38 wL).
    expect(r.joistFactor).toBeCloseTo(8 / 7, 12);
    expect(r.shoreFactor).toBeCloseTo(43 / 38, 12);
    expect(r.bearerLine).toBeCloseTo(8 / 7 * wb, 12);
    expect(r.checks.find(k => k.id === 'bearer-b')!.demand).toBeCloseTo(8 / 7 * wb * 1200 ** 2 / 8 / r.bearer.S, 9);
    expect(r.shoreLoad).toBeCloseTo(43 / 38 * 8 / 7 * q * 1.0 * 1.2, 9);
    expect(r.checks.find(k => k.id === 'shore-p')!.status).toBe('INCOMPLETE');
    expect(r.volume).toBeCloseTo(6 * 4 * 0.15, 9);
  });

  it('reports the ACI §4.2.3.2 lateral load and never PASS', () => {
    const big = calculateSlab({...slabDefaults, lx: 20000, ly: 20000, t: 300, joistSpacing: 200, bearerSpacing: 1000, shoreSpacing: 1000});
    const DL = (24 * 0.3 + 0.5) * 400;
    expect(big.lateralX).toBeCloseTo(0.02 * DL / 20, 9);
    expect(calculateSlab(slabDefaults).lateralX).toBe(1.5);
    const r = calculateSlab({...slabDefaults, shoreSWL: 5});
    expect(r.checks.find(k => k.id === 'shore-p')!.status).toBe('FAIL');
    expect(r.checks.every(k => k.status === 'FAIL' || k.status === 'INCOMPLETE')).toBe(true);
  });

  it('validates input and seeds drafts from the case footprint', () => {
    expect(() => validateSlabInput({...slabDefaults, bearerSpacing: 5000})).toThrow(/ระยะสมาชิก/);
    expect(() => validateSlabInput({...slabDefaults, joistSectionId: 'PAP-TIS107-CHS-27.2x2.5'})).toThrow(/joistSectionId/);
    const seeded = slabFromCase(null, {width: 5000, length: 5000, height: 200});
    expect([seeded.lx, seeded.ly, seeded.t, seeded.confirmed]).toEqual([5000, 5000, 200, false]);
    expect(slabFromCase({nope: 1})).toEqual(slabDefaults);
  });

  it('advises the largest spacing that keeps each member group within limits', () => {
    const advice = slabAdvice(slabDefaults);
    expect(advice.map(a => a.key)).toEqual(['joistSpacing', 'bearerSpacing', 'shoreSpacing']);
    for (const [i, a] of advice.entries()) {
      expect(a.max).not.toBeNull();
      const failed = calculateSlab({...slabDefaults, [a.key]: a.max}).checks.filter(k => k.status === 'FAIL' && SLAB_SPACINGS[i].prefixes.some(p => k.id.startsWith(p)));
      expect(failed).toEqual([]);
      expect(calculateSlab({...slabDefaults, [a.key]: a.max! + 25}).checks.some(k => k.status === 'FAIL' && SLAB_SPACINGS[i].prefixes.some(p => k.id.startsWith(p))) || a.max! + 25 > 3000).toBe(true);
      // Shores have no SWL in the defaults, so spacing that loads them is reported as not limited by them.
      expect(a.unchecked.length > 0).toBe(a.key !== 'joistSpacing');
    }
  });
});
