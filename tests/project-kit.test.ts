import {describe, expect, it} from 'vitest';
import {webcrypto} from 'node:crypto';
import {calculate, defaults} from '../src/domain/index';
import {beamAdvice, beamDefaults} from '../src/domain/beam';
import {slabAdvice, slabDefaults} from '../src/domain/slab';
import {wallAdvice, wallDefaults} from '../src/domain/wall';
import {adviseLayout, optimizeLayout} from '../src/domain/optimize';
import {projectExample} from '../src/domain/mockProject';
import {parseProjectBackup} from '../src/domain/projectBackup';
import {applyKitToCase, caseKitInput, caseKitStatus, kitDefaults, kitDiff, kitFromCase, kitNote, kitStatus, parseKit, validateKit} from '../src/domain/projectKit';

if (!globalThis.crypto) Object.assign(globalThis, {crypto: webcrypto});

describe('project kit', () => {
  it('validates the kit and rejects values outside the rules', () => {
    expect(validateKit(kitDefaults)).toEqual(kitDefaults);
    expect(() => validateKit({...kitDefaults, windPressure: 0.5})).toThrow('0.72');
    expect(() => validateKit({...kitDefaults, spacingStep: 30})).toThrow();
    expect(() => validateKit({...kitDefaults, studSectionId: 'NOPE'})).toThrow();
    expect(() => validateKit({...kitDefaults, extra: 1})).toThrow();
    expect(parseKit({...kitDefaults, revision: ''})).toBeUndefined();
    expect(parseKit(undefined)).toBeUndefined();
  });

  it('applies to every Project Example case and leaves each one on the kit', () => {
    const kit = {...kitDefaults, plywood: 18, tieSWL: 25, shoreSWL: 20, braceSWL: 15};
    for (const z of projectExample().cases) {
      const {value, error} = applyKitToCase(z, kit);
      expect(error, z.name).toBeNull();
      expect(caseKitStatus(value, kit), z.name).toEqual({state: 'ON', revision: 'K1'});
      expect(caseKitInput(value).plywood).toBe(18);
    }
  });

  it('reports which groups differ, and a recorded reason turns off-kit into an exception', () => {
    const z = {input: {...defaults}, workflowElementType: 'WALL' as const, wall: {...wallDefaults, plywood: 25, tieDiameter: 12}};
    const kit = {...kitDefaults, walerSectionId: wallDefaults.walerSectionId};
    expect(kitDiff('WALL', caseKitInput(z), kit)).toEqual(['ไม้อัด', 'Tie']);
    const off = caseKitStatus(z, kit), exception = caseKitStatus({...z, kitException: 'ผนังกันดินสูง'}, kit);
    expect(off.state).toBe('OFF');
    expect(exception.state).toBe('EXCEPTION');
    expect(kitNote(exception)).toContain('ผนังกันดินสูง');
    expect(kitStatus('WALL', caseKitInput(z), undefined)).toEqual({state: 'NONE'});
    // Applying clears the exception and brings the case back on the kit.
    const applied = applyKitToCase({...z, kitException: 'x'}, kit).value;
    expect(applied.kitException).toBeUndefined();
    expect(caseKitStatus(applied, kit).state).toBe('ON');
  });

  it('seeds a kit from the case in use so that case is on the kit', () => {
    for (const z of projectExample().cases) {
      const kit = kitFromCase(z.workflowElementType ?? z.input.kind, caseKitInput(z));
      expect(validateKit(kit)).toEqual(kit);
      const {value} = applyKitToCase(z, kit);
      expect(caseKitStatus(value, kit).state, z.name).toBe('ON');
    }
  });

  it('footing/column apply carries the catalogue dimensions the legacy engine checks', () => {
    const kit = {...kitDefaults, studSectionId: 'TIMBER-50x100-ACTUAL', walerSectionId: 'PAP-TIS107-RHS-100x50x3.2', tieFy: 235, tieFu: 385};
    const {value, error} = applyKitToCase({input: {...defaults}}, kit);
    expect(error).toBeNull();
    expect(value.input).toMatchObject({studSectionId: 'TIMBER-50x100-ACTUAL', rhsB: 50, rhsH: 100, walerType: 'RHS', walerB: 50, walerH: 100, walerT: 3.2, tieGrade: 'SR24'});
    expect(() => calculate(value.input)).not.toThrow();
  });

  it('keeps the kit and the exception reasons through a project backup', () => {
    const p = projectExample(), kit = {...kitDefaults, revision: 'K2'};
    const cases = p.cases.map((z, i) => i === 0 ? {...z, kitException: 'ฐานรากลึกพิเศษ'} : z);
    const back = parseProjectBackup(JSON.stringify({schemaVersion: 3, project: {...p, cases, kit}}));
    expect(back.kit).toEqual(kit);
    expect(back.cases[0].kitException).toBe('ฐานรากลึกพิเศษ');
  });
});

describe('spacing-only design with the kit', () => {
  it('the footing/column optimizer keeps plywood, sections and tie Ø and uses step multiples', () => {
    const base = {...defaults, studSpacing: 400, walerSpacing: 900};
    const options = optimizeLayout(base, 1, [], {step: 50});
    expect(options.length).toBeGreaterThan(0);
    for (const o of options) {
      expect(o.input.plywood).toBe(base.plywood);
      expect(o.input.tieDiameter).toBe(base.tieDiameter);
      for (const k of ['studSectionId', 'walerSectionId', 'rhsB', 'rhsH', 'walerB', 'walerH'] as const) expect(o.input[k]).toBe(base[k]);
      for (const k of ['studSpacing', 'walerSpacing', 'tieSpacing'] as const) expect(o.input[k] % 50).toBe(0);
    }
    for (const a of adviseLayout(base, 1, [], {step: 50})) {
      expect(a.text).not.toMatch(/ใช้ไม้อัด ≥|เปลี่ยนคร่าวเป็น|เปลี่ยนคานคู่เป็น|เพิ่มขนาด Tie/);
    }
  });

  it('beam, slab and wall spacing advice comes in multiples of the kit step', () => {
    for (const [advice, step] of [[beamAdvice(beamDefaults, 50), 50], [slabAdvice(slabDefaults, 50), 50], [wallAdvice(wallDefaults, 100), 100]] as const)
      for (const a of advice) if (a.max !== null) expect(a.max % step, a.key).toBe(0);
    expect(beamAdvice(beamDefaults)).toEqual(beamAdvice(beamDefaults, 25));
  });
});
