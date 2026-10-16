import {expect, it} from 'vitest';
import {analyzeBearingContact} from '../src/domain/workflowV07/bearingContact';

const input = {lengthXMm: 200, widthYMm: 400, compressionN: 10000, loadMxNmm: 0, loadMyNmm: 0};
it('balances a centred load over the complete actual rectangle without inventing a resistance or stiffness', () => {
  const r = analyzeBearingContact(input); expect(r.result?.contact).toBe('FULL_COMPRESSION'); expect(r.result?.pressureMaxMPa).toBeCloseTo(.125, 12);
  expect(r.result?.contactAreaMm2).toBe(80000); expect(r.result?.cornerPressureMPa).toEqual([.125, .125, .125, .125]);
  expect(r.status).toBe('BLOCKED'); expect(r.constructionRelease).toBe('NO_GO');
});
it('recovers the independent full-contact biaxial affine pressure formula', () => {
  const r = analyzeBearingContact({...input, loadMxNmm: -10000 * 20, loadMyNmm: 10000 * 10}).result!;
  expect(r.contactAreaMm2).toBeCloseTo(80000, 6); expect(r.pressureMaxMPa).toBeCloseTo(.125 * (1 + 6 * 10 / 200 + 6 * 20 / 400), 10);
  expect(r.eccentricityMm).toEqual({x: 10, y: 20}); expect(Math.abs(r.equilibrium.loadMxResidualNmm)).toBeLessThan(1e-6);
});
it.each([1, -1])('matches the independent uniaxial triangular contact solution without tensile soil pressure (sign=%s)', sign => {
  const r = analyzeBearingContact({...input, loadMyNmm: sign * 10000 * 200 / 3}).result!;
  expect(r.contact).toBe('PARTIAL_COMPRESSION'); expect(r.contactAreaMm2).toBeCloseTo(40000, 4); expect(r.pressureMaxMPa).toBeCloseTo(.5, 8);
  expect(r.compressedPolygon.every(p => p.pressureMPa >= 0)).toBe(true); expect(r.cornerPlaneMPa.some(p => p < 0)).toBe(true);
  expect(Math.abs(r.equilibrium.forceResidualN)).toBeLessThan(1e-5); expect(Math.abs(r.equilibrium.loadMyResidualNmm)).toBeLessThan(1e-3);
});
it('matches independent biaxial triangular area/centroid/peak-pressure integrals near a rectangle corner', () => {
  // q=k*(u+v-.2), k=6/.8^3. Compressed triangle has .8 legs, area .32,
  // pressure centroid (.3,.3), and peak/whole-footprint-mean = 6/.8^2.
  const r = analyzeBearingContact({...input, loadMxNmm: -10000 * 400 * .3, loadMyNmm: 10000 * 200 * .3}).result!;
  expect(r.contactAreaMm2).toBeCloseTo(25600, 4); expect(r.compressedPolygon).toHaveLength(3); expect(r.pressureMaxMPa).toBeCloseTo(1.171875, 8);
  expect(r.eccentricityMm!.x).toBe(60); expect(r.eccentricityMm!.y).toBe(120);
});
it('retains scaling, axis exchange and mirrored eccentricity rather than sampling and averaging corner forces', () => {
  const a = analyzeBearingContact({...input, loadMxNmm: -800000, loadMyNmm: 400000}).result!;
  const b = analyzeBearingContact({...input, compressionN: 20000, loadMxNmm: -1600000, loadMyNmm: 800000}).result!;
  const swapped = analyzeBearingContact({...input, lengthXMm: 400, widthYMm: 200, loadMxNmm: 400000, loadMyNmm: -800000}); expect(swapped.result, swapped.reason).not.toBeNull(); const c = swapped.result!;
  expect(b.pressureMaxMPa).toBeCloseTo(2 * a.pressureMaxMPa, 8); expect(b.areaFraction).toBeCloseTo(a.areaFraction, 9); expect(c.pressureMaxMPa).toBeCloseTo(a.pressureMaxMPa, 8);
});
it('distinguishes a known unloaded interface from impossible unanchored tension, pure moment and edge/outside resultants', () => {
  const empty = analyzeBearingContact({...input, compressionN: 0}); expect(empty.result?.contact).toBe('UNLOADED'); expect(empty.result?.pressureMaxMPa).toBe(0); expect(empty.result?.meanCompressedPressureMPa).toBeNull();
  for (const p of [{compressionN: -1}, {compressionN: 0, loadMxNmm: 1}, {loadMyNmm: 10000 * 100}, {loadMyNmm: 10000 * 101}]) {
    const r = analyzeBearingContact({...input, ...p}); expect(r.status).toBe('FAIL'); expect(r.result).toBeNull();
  }
});
it('does not replace unknown inputs with zero or return a clipped, fabricated near-edge solution', () => {
  expect(() => analyzeBearingContact({...input, compressionN: null as unknown as number})).toThrow(); expect(() => analyzeBearingContact({...input, lengthXMm: 0})).toThrow();
  const edge = analyzeBearingContact({...input, loadMyNmm: 10000 * 200 * (.5 - 1e-8)}); expect(edge.status).toBe('BLOCKED'); expect(edge.result).toBeNull(); expect(edge.reason).toContain('NUMERIC_SCOPE');
});
it('does not publish an underflowed zero pressure for a nonzero load outside the numeric range', () => {
  const r = analyzeBearingContact({...input, compressionN: 5e-324}); expect(r.result).toBeNull(); expect(r.status).toBe('BLOCKED'); expect(r.reason).toContain('numeric range');
});
