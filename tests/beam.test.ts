import {describe, expect, it} from 'vitest';
import {beamAdvice, beamDefaults, beamLoads, calculateBeam, continuousSupportFactor, patchBeam, validateBeamInput} from '../src/domain/beam';

describe('beam formwork engine', () => {
  it('patch beam reproduces closed-form simply supported results', () => {
    const L = 900, E = 200000, I = 1e6, w = 5;
    const full = patchBeam(L, [{a: 0, c: L, w}], E, I);
    expect(full.Mmax).toBeCloseTo(w * L * L / 8, 6);
    expect(full.dmax).toBeCloseTo(5 * w * L ** 4 / (384 * E * I), 9);
    const c = 300, mid = patchBeam(L, [{a: (L - c) / 2, c: (L + c) / 2, w}], E, I);
    expect(mid.RA).toBeCloseTo(w * c / 2, 9);
    expect(mid.Mmax).toBeCloseTo(w * c * (2 * L - c) / 8, 6);
    expect(mid.dmax).toBeCloseTo(w * c * (8 * L ** 3 - 4 * L * c * c + c ** 3) / (384 * E * I), 9);
    const off = patchBeam(L, [{a: 0, c: 300, w}], E, I);
    expect(off.RA).toBeCloseTo(w * 300 * (L - 150) / L, 9);
    expect(off.RA + off.RB).toBeCloseTo(w * 300, 9);
  });

  it('applies the ACI PRC-347-14(21) §4.2.1 vertical load minimums', () => {
    expect(beamLoads(beamDefaults).beam).toBeCloseTo(24 * 0.6 + 0.5 + 2.4, 9);
    const thin = {...beamDefaults, h: 50, slabSides: 0 as const, slabT: 0, formDead: 0, liveLoad: 1};
    expect(beamLoads(thin).liveUsed).toBe(2.4);
    expect(beamLoads(thin).beam).toBe(4.8);
    expect(beamLoads({...thin, motorized: true}).beam).toBe(6.0);
    expect(beamLoads({...thin, motorized: true}).liveUsed).toBe(3.6);
  });

  it('traces the default beam load path by hand', () => {
    const r = calculateBeam(beamDefaults), q = 17.3, sj = 300, w = q / 1000 * sj;
    expect(r.joists.length).toBe(21);
    expect(r.joistReaction).toBeCloseTo(w * 300 / 2, 9);
    expect(r.bearerLine).toBeCloseTo(w * 300 / 2 / sj, 9);
    // 6000 / 1200 = 5 equal bearer spans: interior shore reaction 43/38 wL (three-moment equation).
    expect(r.shoreFactor).toBeCloseTo(43 / 38, 9);
    expect(r.shoreLoad).toBeCloseTo(43 / 38 * w * 300 / 2 / sj * 1200 / 1000, 9);
    expect(r.pressureModel.pmax).toBeCloseTo(24 * 0.6, 9);
    expect(r.sideHeights).toEqual([480, 480]);
    expect(r.studSpan).toBe(480);
    expect(r.checks.find(k => k.id === 'shore-p')!.status).toBe('INCOMPLETE');
    expect(r.checks.find(k => k.id === 'shore-p')!.limit).toBeNull();
    expect(r.checks.find(k => k.id === 'lateral')!.demand).toBe(1.5);
    expect(r.checks.map(k => k.id)).toEqual(['sof-ply-b', 'sof-ply-v', 'sof-ply-d', 'joist-b', 'joist-v', 'joist-d', 'bearer-b', 'bearer-v', 'bearer-d', 'shore-p', 'lateral',
      'side-ply-b', 'side-ply-v', 'side-ply-d', 'stud-b', 'stud-v', 'stud-d', 'kicker', 'top'].filter(id => r.checks.some(k => k.id === id)));
    expect(['FAIL', 'INCOMPLETE']).toContain(r.status);
    expect(r.blockers.some(b => b.includes('SWL ค้ำยัน'))).toBe(true);
  });

  it('checks shores and ties against manufacturer SWL and never reports PASS', () => {
    const r = calculateBeam({...beamDefaults, h: 1200, slabT: 150, tieRows: 1, tieSWL: 20, shoreSWL: 1});
    expect(r.checks.find(k => k.id === 'shore-p')!.status).toBe('FAIL');
    const tie = r.checks.find(k => k.id === 'tie-t')!, p = 24 * 1.2, span = (1200 - 150) / 2;
    expect(tie.demand).toBeCloseTo(p / 1000 * span * 600 / 1000, 9);
    expect(r.tieLevels).toEqual([span]);
    expect(r.checks.every(k => k.status !== ('PASS' as never))).toBe(true);
  });

  it('edge beams use the full depth on the outer side and flag rotation', () => {
    const r = calculateBeam({...beamDefaults, slabSides: 1});
    expect(r.sideHeights).toEqual([600, 480]);
    expect(r.blockers.some(b => b.includes('§4.1.4c'))).toBe(true);
  });

  it('rejects invalid geometry and unknown sections', () => {
    expect(() => validateBeamInput({...beamDefaults, slabLeft: 400})).toThrow(/แนวคานรับ/);
    expect(() => validateBeamInput({...beamDefaults, slabSides: 0})).toThrow(/ความหนาพื้นต้องเป็น 0/);
    expect(() => validateBeamInput({...beamDefaults, joistSectionId: 'NOPE'})).toThrow(/joistSectionId/);
    expect(() => validateBeamInput({...beamDefaults, bearerSectionId: 'TIMBER-38x75-ACTUAL'})).toThrow(/bearerSectionId/);
    expect(() => validateBeamInput({...beamDefaults, extra: 1})).toThrow();
  });

  it('advises the largest spacing without failures for each member group', () => {
    const advice = beamAdvice(beamDefaults);
    expect(advice.map(a => a.key)).toEqual(['joistSpacing', 'shoreSpacing', 'studSpacing']);
    for (const a of advice) if (a.max !== null) {
      const r = calculateBeam({...beamDefaults, [a.key]: a.max});
      expect(r.checks.filter(k => k.status === 'FAIL').length === 0 || !['sof-', 'joist-', 'bearer-', 'side-', 'stud-'].some(p => r.checks.some(k => k.id.startsWith(p) && k.status === 'FAIL'))).toBe(true);
    }
  });
});
