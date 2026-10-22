import {describe, expect, it} from 'vitest';
import {calculate, defaults, validateInput} from '../src/domain/index';
import {beamDefaults, calculateBeam} from '../src/domain/beam';
import {calculateSlab, slabDefaults} from '../src/domain/slab';
import {calculateWall, validateWallInput, wallDefaults} from '../src/domain/wall';
import {sectionById} from '../src/domain/sectionStock';

const SOFT_FC90 = 16 * 0.0980665; // textbook Table 3.4, soft timber 16 ksc
const find = (checks: {id: string}[], id: string) => checks.find(c => c.id === id) as {id: string; demand: number | null; limit: number | null; status: string} | undefined;

describe('timber crushing at contact points', () => {
  it('slab: timber joist on a steel bearer, R = kj q sj sb over b_joist × b_bearer', () => {
    const r = calculateSlab({...slabDefaults, joistSectionId: 'TIMBER-38x100-ACTUAL'}), k = find(r.checks, 'bear-joist')!;
    const sj = r.input.lx / (r.joists.length - 1), sb = r.input.ly / (r.bearers.length - 1), bearerB = sectionById(r.input.bearerSectionId)!.B;
    expect(k.demand).toBeCloseTo(r.joistFactor * r.loads.q * sj * sb / 1e3 / (38 * bearerB * r.input.bearerCount), 9);
    expect(k.limit).toBeCloseTo(SOFT_FC90, 9);
  });
  it('steel on steel stays a blocker instead of an invented capacity', () => {
    const r = calculateSlab(slabDefaults);
    expect(find(r.checks, 'bear-joist')).toBeUndefined();
    expect(r.blockers.some(b => b.includes('web crippling'))).toBe(true);
  });
  it('wall and footing studs: interior stud reaction on the two waler members', () => {
    const w = calculateWall({...wallDefaults, studSectionId: 'TIMBER-38x100-ACTUAL'}), wk = find(w.checks, 'bear-stud')!;
    const sw = w.input.height / (w.levels.length - 1), walerB = sectionById(w.input.walerSectionId)!.B;
    expect(wk.demand).toBeCloseTo(w.studLine * sw / (38 * walerB * 2), 9);
    const f = calculate({...defaults, studSectionId: 'TIMBER-50x100-ACTUAL'}), fk = find(f.checks, 'bear-stud')!;
    expect(fk.demand).toBeCloseTo(f.pressure / 1000 * f.input.studSpacing * f.waler.verticalSpan / (50 * f.input.walerB * 2), 9);
    expect(fk.limit).toBeCloseTo(SOFT_FC90, 9);
  });
});

describe('tie rods: ACI Table 4.4 safety factor 2.0 on ultimate', () => {
  it('beam and wall check T ≤ Fu Ag / 2 with Fu = 560 MPa (TIS 24 SD40) by default', () => {
    const b = calculateBeam({...beamDefaults, h: 1200, slabT: 150, tieRows: 1}), bu = find(b.checks, 'tie-ult')!;
    expect(bu.limit).toBeCloseTo(560 * Math.PI * 12 ** 2 / 4 / 2 / 1000, 9);
    expect(bu.demand).toBeCloseTo(b.tieForce!, 9);
    const w = calculateWall(wallDefaults), wu = find(w.checks, 'tie-ult')!;
    expect(wu.limit).toBeCloseTo(560 * Math.PI * 16 ** 2 / 4 / 2 / 1000, 9);
    expect(calculateWall({...wallDefaults, system: 'SINGLE_SIDED'}).checks.some(c => c.id === 'tie-ult')).toBe(false);
  });
});

describe('design wind on wall and column forms', () => {
  it('wall braces use the entered wind, never less than the ACI 0.72 kPa minimum', () => {
    const base = calculateWall(wallDefaults), windy = calculateWall({...wallDefaults, windPressure: 1.2});
    const H = wallDefaults.height / 1000;
    expect(base.braceMoment).toBeCloseTo(Math.max(1.5 * H, 0.72 * H * H / 2), 12);
    expect(windy.braceMoment).toBeCloseTo(Math.max(1.5 * H, 1.2 * H * H / 2), 12);
    expect(() => validateWallInput({...wallDefaults, windPressure: 0.5})).toThrow('0.72');
    const {windPressure, tieFu, ...old} = wallDefaults; void [windPressure, tieFu];
    expect(validateWallInput(old)).toEqual(wallDefaults);
  });

  it('column push-pull braces: M = w B H²/2 on the form width, P = M / (hb n cos θ)', () => {
    const x = {...defaults, kind: 'COLUMN' as const, width: 600, length: 800, height: 3000, windPressure: 1, braceHeight: 2000, braceAngle: 60, bracesPerDirection: 2, braceSWL: 10};
    const r = calculate(x), depth = x.plywood + x.rhsH + x.walerH;
    for (const [axis, width] of [['x', 800], ['y', 600]] as const) {
      const M = 1 * (width + 2 * depth) / 1000 * 3 * 3 / 2, k = find(r.checks, 'brace-' + axis)!;
      expect(k.demand).toBeCloseTo(M / 2 / (2 * Math.cos(Math.PI / 3)), 9);
      expect(k.limit).toBe(10);
    }
    const open = calculate({...x, braceHeight: 0, braceSWL: 0});
    expect(find(open.checks, 'brace-x')!.demand).toBeNull();
    expect(open.blockers.some(b => b.includes('ระดับยึด'))).toBe(true);
    expect(calculate(defaults).checks.some(c => c.id.startsWith('brace-'))).toBe(false);
  });

  it('stored legacy inputs without the bracing fields read the defaults', () => {
    const {windPressure, braceHeight, braceAngle, bracesPerDirection, braceSWL, braceReference, ...old} = defaults;
    void [windPressure, braceHeight, braceAngle, bracesPerDirection, braceSWL, braceReference];
    expect(validateInput(old)).toEqual(defaults);
    expect(() => validateInput({...defaults, windPressure: 0.3})).toThrow('0.72');
    expect(() => validateInput({...defaults, kind: 'COLUMN', braceHeight: 99999})).toThrow();
  });
});

describe('footing corner joints', () => {
  it('checks the largest corner reaction along each axis against the entered capacity', () => {
    const r = calculate(defaults), normal = Object.fromEntries(r.faces.map(f => [f.id, f.normal]));
    const corner = (axis: 'x' | 'y') => Math.max(...r.waler.faces.filter(f => Math.abs(normal[f.faceId][axis]) > 0.5)
      .flatMap(f => f.supports.filter(s => s.role === 'CORNER').map(s => s.force))) / 1000;
    expect(find(r.checks, 'corner-x')!.demand).toBeCloseTo(corner('x'), 9);
    expect(find(r.checks, 'corner-y')!.limit).toBeNull();
    const rated = calculate({...defaults, cornerCapacityX: 1, cornerCapacityY: 100, cornerReference: 'Bracket CB-1'});
    expect(find(rated.checks, 'corner-x')!.status).toBe(corner('x') > 1 ? 'FAIL' : 'INCOMPLETE');
    expect(find(rated.checks, 'corner-y')!.limit).toBe(100);
    expect(calculate({...defaults, kind: 'COLUMN'}).checks.some(c => c.id.startsWith('corner-'))).toBe(false);
  });
});
