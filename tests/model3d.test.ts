import {describe, expect, it} from 'vitest';
import {calculate, defaults} from '../src/domain/index';
import {beamDefaults, calculateBeam} from '../src/domain/beam';
import {calculateSlab, slabDefaults} from '../src/domain/slab';
import {calculateWall, wallDefaults} from '../src/domain/wall';
import {beamModel3D, legacyModel3D, slabModel3D, wallModel3D, GROUP_CHECKS, type FormworkModel3D, type PartGroup} from '../src/domain/model3d';
import {editFields} from '../src/domain/model3dEdit';

const count = (m: FormworkModel3D, g: PartGroup, prefix = g) => m.parts.filter(p => p.group === g && p.id.startsWith(prefix)).length;
function sane(m: FormworkModel3D) {
  expect(m.parts.length).toBeGreaterThan(5);
  for (const p of m.parts) {
    expect(p.vertices.every(v => v.every(Number.isFinite)), p.id).toBe(true);
    expect(p.triangles.every(t => t.every(i => i >= 0 && i < p.vertices.length)), p.id).toBe(true);
  }
  expect(new Set(m.parts.map(p => p.id)).size).toBe(m.parts.length);
}

describe('3D editor sweep over the Project Example', () => {
  it('every editable field and section of every case keeps the model buildable', async () => {
    const {webcrypto} = await import('node:crypto');
    if (!globalThis.crypto) Object.assign(globalThis, {crypto: webcrypto});
    const {projectExample} = await import('../src/domain/mockProject');
    const {applyChanges} = await import('../src/domain/scene');
    const {stockFor, sectionById} = await import('../src/domain/sectionStock');
    const {editableGroups} = await import('../src/domain/model3dEdit');
    const rejected: string[] = [];
    for (const c of projectExample().cases) {
      const element = c.workflowElementType as Parameters<typeof editFields>[0];
      for (const g of editableGroups(element)) for (const f of editFields(element, g)) {
        const label = `${c.name.slice(18, 22)} ${g} ${'key' in f ? f.key : f.kind}`;
        const variants: Record<string, unknown>[] = [];
        if (f.kind === 'number') {const cur = Number((element === 'BEAM' ? c.beam : element === 'SLAB' ? c.slab : element === 'WALL' ? c.wall : c.input as unknown as Record<string, number>)![f.key as never]); variants.push({[f.key]: cur > 0 ? Math.round(cur * 0.9 * 100) / 100 : 1});}
        if (f.kind === 'select') variants.push({[f.key]: f.options[f.options.length - 1][0]});
        if (f.kind === 'section') {const cur = sectionById(String((element === 'BEAM' ? c.beam : element === 'SLAB' ? c.slab : c.wall)![f.key as never])); const alt = stockFor(undefined).find(s => s.roles.includes(f.role) && s.family === cur?.family && s.id !== cur?.id); if (alt) variants.push({[f.key]: alt.id});}
        if (f.kind === 'legacySection') {const alt = stockFor(undefined).find(s => s.roles.includes('stud') && s.family === 'SHS' && s.id !== c.input.studSectionId); variants.push({studSectionId: alt!.id});}
        for (const v of variants) {
          const build = () => element === 'BEAM' ? beamModel3D(calculateBeam({...c.beam!, ...v})) : element === 'SLAB' ? slabModel3D(calculateSlab({...c.slab!, ...v}))
            : element === 'WALL' ? wallModel3D(calculateWall({...c.wall!, ...v})) : legacyModel3D(calculate(applyChanges(c.input, v)));
          if (f.kind === 'number' && /^(armX|armY)$/.test(f.key) && c.input.shape !== 'L') continue;
          // A value the engine rejects is refused by the editor (with its message); an accepted value must always build a model.
          const calc = () => element === 'BEAM' ? calculateBeam({...c.beam!, ...v}) : element === 'SLAB' ? calculateSlab({...c.slab!, ...v}) : element === 'WALL' ? calculateWall({...c.wall!, ...v}) : calculate(applyChanges(c.input, v));
          let accepted = true; try {calc();} catch {accepted = false; rejected.push(label);}
          if (accepted) expect(() => build(), label + ' ' + JSON.stringify(v)).not.toThrow();
        }
      }
    }
    // Section and count choices from the pickers are always valid; only free dimensions can be rejected.
    expect(rejected.filter(l => /Section|Count|tieRows|legacySection/.test(l))).toEqual([]);
  });
});

describe('3D formwork model', () => {
  it('beam: one part per joist, shore, stud and tie station of the engine result', () => {
    const r = calculateBeam({...beamDefaults, tieRows: 2}), m = beamModel3D(r);
    sane(m);
    expect(count(m, 'joist')).toBe(r.joists.length);
    expect(count(m, 'shore', 'shore-') - count(m, 'shore', 'shore-base')).toBe(r.shores.length * 2);
    expect(count(m, 'stud')).toBe(r.studs.length * 2);
    expect(count(m, 'tie')).toBe(r.ties.length * r.tieLevels.length);
    expect(count(m, 'waler')).toBe(r.tieLevels.length * 4);
    // Concrete sits on the soffit; the soffit stack ends at the soffit level.
    expect(m.bounds.max[2]).toBe(beamDefaults.soffitHeight + beamDefaults.h);
    // Halving the joist spacing roughly doubles the joists.
    expect(count(beamModel3D(calculateBeam({...beamDefaults, joistSpacing: 150})), 'joist')).toBeGreaterThan(r.joists.length * 1.8);
  });
  it('slab: joists along Y, bearers along X, a shore at every bearer × shore station', () => {
    const r = calculateSlab(slabDefaults), m = slabModel3D(r);
    sane(m);
    expect(count(m, 'joist')).toBe(r.joists.length);
    expect(count(m, 'bearer')).toBe(r.bearers.length);
    expect(count(m, 'shore', 'shore-') - count(m, 'shore', 'shore-base')).toBe(r.bearers.length * r.shores.length);
    expect(Math.max(...m.parts.find(p => p.group === 'concrete')!.vertices.map(v => v[0]))).toBe(slabDefaults.lx);
    // Edge shores sit on the bay edge, so their 150 mm base plates reach 75 mm beyond it.
    expect(m.bounds.max[0]).toBe(slabDefaults.lx + 75);
  });
  it('wall: two faces with ties, or one face with strongbacks, braces and the retained side', () => {
    const two = calculateWall(wallDefaults), m2 = wallModel3D(two);
    sane(m2);
    expect(count(m2, 'stud')).toBe(two.studs.length * 2);
    expect(count(m2, 'tie')).toBe(two.ties.length * two.levels.length);
    expect(count(m2, 'brace')).toBe(two.braces.length);
    const one = calculateWall({...wallDefaults, system: 'SINGLE_SIDED'}), m1 = wallModel3D(one);
    sane(m1);
    expect(count(m1, 'tie')).toBe(0);
    expect(count(m1, 'strongback')).toBe(one.braces.length);
    expect(count(m1, 'soil')).toBe(1);
    expect(count(m1, 'stud')).toBe(one.studs.length);
  });
  it('footing and column reuse the screened layout scene', () => {
    const f = legacyModel3D(calculate(defaults)), c = legacyModel3D(calculate({...defaults, kind: 'COLUMN', width: 600, length: 600, height: 3000}));
    sane(f); sane(c);
    expect(count(f, 'tie')).toBeGreaterThan(0);
    expect(count(c, 'tie')).toBe(0);
    expect(count(f, 'stud') && count(f, 'waler')).toBeGreaterThan(0);
  });
  it('every editable group of every element has fields, and each formwork group maps to its checks', () => {
    const groups: [Parameters<typeof editFields>[0], PartGroup[]][] = [['FOOTING', ['concrete', 'plywood', 'stud', 'waler', 'tie']], ['COLUMN', ['concrete', 'plywood', 'stud', 'waler']],
      ['BEAM', ['concrete', 'plywood', 'joist', 'bearer', 'shore', 'stud', 'waler', 'tie']], ['SLAB', ['concrete', 'plywood', 'joist', 'bearer', 'shore']],
      ['WALL', ['concrete', 'plywood', 'stud', 'waler', 'tie', 'brace', 'strongback']]];
    for (const [element, list] of groups) for (const g of list) expect(editFields(element, g).length, `${element} ${g}`).toBeGreaterThan(0);
    const beam = calculateBeam({...beamDefaults, tieRows: 1});
    for (const g of ['plywood', 'joist', 'bearer', 'shore', 'stud', 'waler', 'tie'] as PartGroup[])
      expect(beam.checks.some(k => GROUP_CHECKS[g].some(p => k.id.startsWith(p))), g).toBe(true);
    // Field keys exist on the element inputs.
    for (const f of [...editFields('BEAM', 'joist'), ...editFields('BEAM', 'bearer'), ...editFields('BEAM', 'tie')]) if ('key' in f) expect(f.key in beamDefaults, f.key).toBe(true);
    for (const f of editFields('WALL', 'strongback')) if ('key' in f) expect(f.key in wallDefaults, f.key).toBe(true);
    for (const f of editFields('SLAB', 'shore')) if ('key' in f) expect(f.key in slabDefaults, f.key).toBe(true);
    for (const f of editFields('FOOTING', 'tie')) if ('key' in f) expect(f.key in defaults, f.key).toBe(true);
  });
});
