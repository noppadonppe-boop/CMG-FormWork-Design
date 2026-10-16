import {renderToStaticMarkup} from 'react-dom/server';
import {describe, expect, it} from 'vitest';
import {calculate, defaults} from '../src/domain';
import {buildFormworkLayout} from '../src/domain/formworkLayout';
import {plywoodDesign, plywoodProperties, resolveSpans} from '../src/domain/plywoodGrades';
import {PlywoodCriteria, PressureGuide, SteelGuide} from '../src/components/CriteriaGuide';

const PSF = 1 / 20.8854; // kPa per psf
const example2 = (p = 10) => plywoodDesign({grade: 'PLYFORM_I', t: 19.05, faceGrain: 'ACROSS', spans: 'THREE', pressure: p, spacing: 16 * 25.4, studWidth: 1.5 * 25.4,
  deflectionRatio: 360, sheetAcross: 2440, custom: {E: 0, Fb: 0}});
const capacity = (d: ReturnType<typeof example2>, id: string) => {const k = d.checks.find(c => c.id === id)!; return 10 * k.limit / k.demand;};

describe('APA V345 continuous-span plywood design', () => {
  it('reproduces APA V345 Example 2 (3/4" Plyform Class I, 16" o.c., 3 spans, L/360)', () => {
    const d = example2();
    expect(d.l3).toBeCloseTo(14.75 * 25.4, 6);
    expect(capacity(d, 'ply-b') / PSF).toBeCloseTo(412, -0.5);   // APA: 412 psf
    expect(capacity(d, 'ply-v') / PSF).toBeCloseTo(714, -0.5);   // APA: 714 psf
    expect(capacity(d, 'ply-d') / PSF).toBeCloseTo(370, -0.5);   // APA: 370 psf
    expect(d.allowablePressure / PSF).toBeCloseTo(370, -0.5);
  });
  it('uses Table 12 perpendicular properties when face grain is parallel to the supports', () => {
    const across = plywoodProperties('PLYFORM_I', 19.05, {E: 0, Fb: 0}, 'ACROSS'), along = plywoodProperties('PLYFORM_I', 19.05, {E: 0, Fb: 0}, 'PARALLEL');
    expect(across.KS).toBeCloseTo(0.455 * 25.4 ** 3 / 304.8, 9);
    expect(along.KS).toBeCloseTo(0.306 * 25.4 ** 3 / 304.8, 9);
    expect(along.I).toBeCloseTo(0.092 * 25.4 ** 4 / 304.8, 9);
    expect(plywoodProperties('PLYFORM_I', 40, {E: 0, Fb: 0}).t_table).toBeCloseTo(1.125 * 25.4, 9);
  });
  it('AUTO spans follow the sheet width and the APA continuity rule', () => {
    expect(resolveSpans('AUTO', 'ACROSS', 300, 2440).n).toBe(3);
    expect(resolveSpans('AUTO', 'ACROSS', 900, 2440).n).toBe(2);
    expect(resolveSpans('AUTO', 'PARALLEL', 300, 1220).n).toBe(3);
    expect(resolveSpans('AUTO', 'PARALLEL', 450, 1220).n).toBe(2);
    expect(resolveSpans('AUTO', 'PARALLEL', 700, 1220).n).toBe(1);
    expect(resolveSpans('SINGLE', 'ACROSS', 300, 2440).n).toBe(1);
  });
});

describe('engine integration', () => {
  it('new cases use Plyform Class I, grain across, continuous spans; sheets drawn horizontally', () => {
    const r = calculate(defaults);
    expect(r.plywood.grade).toBe('PLYFORM_I');
    expect(r.plywoodDesign.spans).toBe(3);
    expect(r.checks.find(c => c.id === 'ply-b')!.limit).toBeCloseTo(1930 * 0.00689476, 9);
    expect(r.checks.find(c => c.id === 'ply-v')).toBeDefined();
    expect(buildFormworkLayout(r).plywood).toMatchObject({sheetW: 2440, sheetH: 1220});
    const single = calculate({...defaults, plywoodSpans: 'SINGLE'});
    expect(single.checks.find(c => c.id === 'ply-b')!.demand!).toBeCloseTo(r.checks.find(c => c.id === 'ply-b')!.demand! * 10 / 8, 9);
    expect(r.blockers.join(' ')).not.toContain('DEMO');
  });
  it('old inputs stay CUSTOM, single span, vertical sheets — the earlier gross-section formulas exactly', () => {
    const {plywoodGrade: _a, plywoodSpans: _b, plywoodFaceGrain: _c, ...legacy} = defaults;
    const old = {...legacy, plywoodE: 7000, plywoodFb: 8}, r = calculate(old), p = 60 / 1000, L = 300, t = 20;
    expect(r.plywood.grade).toBe('CUSTOM');
    expect(r.plywoodDesign.spans).toBe(1);
    expect(r.checks.find(c => c.id === 'ply-b')!.demand).toBeCloseTo(p * L ** 2 / 8 / (t * t / 6), 9);
    expect(r.checks.find(c => c.id === 'ply-d')!.demand).toBeCloseTo(5 * p * L ** 4 / (384 * 7000 * t ** 3 / 12), 9);
    expect(r.checks.some(c => c.id === 'ply-v')).toBe(false);
    expect(buildFormworkLayout(r).plywood).toMatchObject({sheetW: 1220, sheetH: 2440});
  });
  it('shows the recommendations, span model and capacity without DEMO labels', () => {
    const r = calculate(defaults);
    const html = renderToStaticMarkup(<><PressureGuide/><PlywoodCriteria x={defaults} r={r} canEdit onChange={() => undefined} field={() => null}/><SteelGuide/></>);
    for (const t of ['L/360', 'Cc = 1.2', 'APA Plyform Class I', 'ต่อเนื่อง 3 ช่วง', 'KS =', 'แรงดันที่รับได้', 'ลายไม้ขวางคร่าว', 'AISC 360', 'มอก. 107-2566']) expect(html).toContain(t);
    expect(html).not.toContain('DEMO');
  });
});
