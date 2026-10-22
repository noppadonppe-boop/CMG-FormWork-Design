import {describe, expect, it} from 'vitest';
import {beamDefaults, calculateBeam, continuousSupportFactor, validateBeamInput} from '../src/domain/beam';

describe('beam side-form restraints, ties and shore continuity', () => {
  it('uses the textbook interior reactions of continuous equal spans', () => {
    expect(continuousSupportFactor(1)).toBe(1);
    expect(continuousSupportFactor(2)).toBeCloseTo(1.25, 12);
    expect(continuousSupportFactor(3)).toBeCloseTo(1.1, 12);
    expect(continuousSupportFactor(4)).toBeCloseTo(8 / 7, 12);
    expect(continuousSupportFactor(5)).toBeCloseTo(43 / 38, 12);
  });

  it('reads stored beams saved before the restraint fields', () => {
    const {tieFy, tieOmega, kickerCapacity, topRestraintCapacity, lateralCapacity, restraintReference, ...old} = beamDefaults;
    void [tieFy, tieOmega, kickerCapacity, topRestraintCapacity, lateralCapacity, restraintReference];
    expect(validateBeamInput(old)).toEqual(beamDefaults);
  });

  it('carries the top half of the side form into a top restraint and checks user capacities', () => {
    const open = calculateBeam(beamDefaults), p = 24 * 0.6, half = p * 480 / 2 / 1000;
    for (const id of ['kicker', 'top', 'lateral']) expect(open.checks.find(k => k.id === id)!.limit).toBeNull();
    expect(open.checks.find(k => k.id === 'top')!.demand).toBeCloseTo(half, 9);
    expect(open.blockers.some(b => b.includes('จุดยึดบน'))).toBe(true);
    const designed = calculateBeam({...beamDefaults, kickerCapacity: 5, topRestraintCapacity: 1, lateralCapacity: 3, restraintReference: 'calc RC-01'});
    expect(designed.checks.find(k => k.id === 'kicker')!.limit).toBe(5);
    expect(designed.checks.find(k => k.id === 'top')!.status).toBe('FAIL');
    expect(designed.checks.find(k => k.id === 'lateral')!.source).toContain('calc RC-01');
    expect(designed.blockers.some(b => b.includes('จุดยึดบน'))).toBe(false);
  });

  it('screens the tie rod body like the wall module', () => {
    const r = calculateBeam({...beamDefaults, h: 1200, slabT: 150, tieRows: 1, tieSpacing: 600});
    const body = r.checks.find(k => k.id === 'tie-body')!;
    expect(body.limit).toBeCloseTo(390 * Math.PI * 12 ** 2 / 4 / 1.67 / 1000, 9);
    expect(body.demand).toBeCloseTo(r.tieForce!, 9);
  });

  it('fails a top tie row that sits above the inner side form of an edge beam', () => {
    const ok = calculateBeam({...beamDefaults, slabSides: 1, tieRows: 2});
    expect(ok.checks.find(k => k.id === 'tie-level')!.status).toBe('INCOMPLETE');
    const high = calculateBeam({...beamDefaults, slabSides: 1, slabT: 250, tieRows: 2});
    const level = high.checks.find(k => k.id === 'tie-level')!;
    expect(level.demand).toBeCloseTo(400, 9);
    expect(level.limit).toBeCloseTo(350 - 50 / 2, 9);
    expect(level.status).toBe('FAIL');
    expect(calculateBeam({...beamDefaults, tieRows: 2}).checks.some(k => k.id === 'tie-level')).toBe(false);
  });
});
