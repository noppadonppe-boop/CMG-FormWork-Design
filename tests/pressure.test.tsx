import {renderToStaticMarkup} from 'react-dom/server';
import {describe, expect, it} from 'vitest';
import {calculate, defaults} from '../src/domain';
import {lateralPressure, unitWeightCoefficient, type PressureInput} from '../src/domain/pressure';
import {CalcReport} from '../src/components/CalcReport';
import {DesignBook} from '../src/components/DesignBook';
import {defaultTitleBlock} from '../src/domain/titleBlock';

const base: PressureInput = {pressureMethod: 'ACI347', gamma: 24, height: 3000, width: 3000, length: 4000, pourRate: 1.5, concreteTemp: 30, slump: 100, vibrationDepth: 1, chemistryCc: 1.2};

describe('ACI PRC-347-14(21) lateral pressure (SI, §4.2.2.1b)', () => {
  it('Cw follows Table 4.2.2.1a(c)', () => {
    expect(unitWeightCoefficient(1800)).toBeCloseTo(0.888, 3);
    expect(unitWeightCoefficient(1500)).toBeCloseTo(0.8233, 4);
    expect(unitWeightCoefficient(1300)).toBe(0.8);
    expect(unitWeightCoefficient(2300)).toBe(1);
    expect(unitWeightCoefficient(2552)).toBeCloseTo(1.1, 6);
  });
  it('wall ≤ 4.2 m, R < 2.1 m/h → eq. (b), hand calculation', () => {
    const m = lateralPressure(base), rho = 24 / 0.00981, Cw = rho / 2320;
    expect(m.equation).toBe('4.2.2.1b(b)');
    expect(m.element).toBe('WALL');
    const eq = 1.2 * Cw * (7.2 + 785 * 1.5 / 47.8);
    expect(m.equationValue).toBeCloseTo(eq, 9);
    expect(m.pmax).toBeCloseTo(40.28, 2);
    expect(m.hydrostatic).toBeCloseTo(72, 9);
    expect(m.hcap).toBeCloseTo(m.pmax / (rho * 0.00981) * 1000, 6);
    const hc = m.hcap / 1000;
    expect(m.forcePerM).toBeCloseTo(24 * hc ** 2 / 2 + m.pmax * (3 - hc), 9);
  });
  it('tall wall or fast pour → eq. (c); very fast or SCC → hydrostatic', () => {
    const c = lateralPressure({...base, gamma: 23.5, height: 6000, pourRate: 1, concreteTemp: 20, chemistryCc: 1});
    expect(c.equation).toBe('4.2.2.1b(c)');
    expect(c.Cw).toBe(1);
    expect(c.pmax).toBeCloseTo(7.2 + 1156 / 37.8 + 244 / 37.8, 9);
    expect(lateralPressure({...base, pourRate: 3}).equation).toBe('4.2.2.1b(c)');
    for (const v of [{pourRate: 5}, {slump: 200}, {vibrationDepth: 1.5}]) {
      const m = lateralPressure({...base, ...v});
      expect(m.equation).toBe('4.2.2.1b(a)');
      expect(m.pmax).toBeCloseTo(m.hydrostatic, 9);
    }
  });
  it('column (no plan side > 2 m) uses eq. (b) at any rate, capped by ρgh and floored at 30Cw', () => {
    const col = {...base, width: 600, length: 800, height: 8000};
    const fast = lateralPressure({...col, pourRate: 10, concreteTemp: 25, chemistryCc: 1});
    expect(fast.element).toBe('COLUMN');
    expect(fast.equation).toBe('4.2.2.1b(b)');
    expect(fast.pmax).toBeCloseTo(fast.hydrostatic, 9);
    const slow = lateralPressure({...col, pourRate: 0.2, concreteTemp: 40, chemistryCc: 1});
    expect(slow.pmax).toBeCloseTo(30 * slow.Cw, 9);
  });
  it('hydrostatic method is the full fluid head', () => {
    const m = lateralPressure({...base, pressureMethod: 'HYDROSTATIC'});
    expect(m.pmax).toBeCloseTo(72, 9);
    expect(m.forcePerM).toBeCloseTo(24 * 9 / 2, 9);
  });
});

describe('engine and report use the selected pressure model', () => {
  it('keeps hydrostatic results by default and for old data', () => {
    const r = calculate(defaults);
    expect(r.pressure).toBeCloseTo(24 * 2.5, 9);
    expect(r.faces[0].force).toBeCloseTo(24 * 2.5 ** 2 / 2 * 3, 9);
    const {pressureMethod: _a, pourRate: _b, concreteTemp: _c, slump: _d, vibrationDepth: _e, chemistryCc: _f, ...legacy} = defaults;
    expect(calculate(legacy).pressure).toBeCloseTo(r.pressure, 12);
  });
  it('ACI pressure drives every member check and the face forces', () => {
    const x = {...defaults, pressureMethod: 'ACI347' as const}, r = calculate(x), h = calculate(defaults);
    expect(r.pressure).toBeLessThan(h.pressure);
    expect(r.pressure).toBe(r.pressureModel.pmax);
    expect(r.faces[0].force).toBeCloseTo(r.pressureModel.forcePerM * 3, 9);
    expect(r.checks.find(c => c.id === 'ply-b')!.demand!).toBeLessThan(h.checks.find(c => c.id === 'ply-b')!.demand!);
    expect(() => calculate({...x, chemistryCc: 1.3})).toThrow(/Cc/);
    const html = renderToStaticMarkup(<CalcReport r={r} project="P" code="C" caseName="F01" caseId="F01" titleBlock={defaultTitleBlock()}/>);
    expect(html).toContain('ACI PRC-347-14(21)');
    expect(html).toContain('4.2.2.1b(b)');
    expect(html).toContain('hcap');
    expect(html).not.toMatch(/NaN|Infinity/);
  });
  it('Design Book shows the book tables and a live worked example', () => {
    const html = renderToStaticMarkup(<DesignBook input={{...defaults, pourRate: 1.5}}/>);
    for (const t of ['ตารางที่ 3.4', '78,900', '189,000', 'ตารางที่ 3.6 ข', '3.60', 'ตารางที่ 3.8', '105,000', 'ตารางที่ 3.9', '9,360', 'ACI PRC-347-14(21)', 'CEB', '2,400kR + 500', 'CCPmax'])
      expect(html).toContain(t);
    expect(html).not.toMatch(/NaN|Infinity/);
  });
});
