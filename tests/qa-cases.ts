/** Inputs covering the short-report branches (both languages): systems, member materials, pressure methods, tie options. */
export const QA_CASES: [kind: 'slab' | 'beam' | 'wall' | 'legacy', input: Record<string, unknown>][] = [
  ['slab', {lx: 7200, ly: 7200, t: 160, soffitHeight: 2800}],
  ['slab', {bearerCount: 2, motorized: true, shoreSWL: 20, shoreReference: 'Shore 3.0 m', plywoodGrade: 'CUSTOM', joistSectionId: 'TIMBER-50x100-ACTUAL'}],
  ['slab', {t: 400, joistSpacing: 600, bearerSpacing: 2000}],
  ['beam', {tieRows: 1}],
  ['beam', {tieRows: 2, tieSWL: 30, shoreSWL: 15, slabT: 150, slabLeft: 0, slabRight: 400, shoreWidth: 1200, slabSides: 1, pressureMethod: 'ACI347'}],
  ['beam', {}],
  ['wall', {}],
  ['wall', {pressureMethod: 'ACI347', tieSWL: 50, braceSWL: 20}],
  ['wall', {system: 'SINGLE_SIDED'}],
  ['wall', {system: 'SINGLE_SIDED', anchorSWL: 40, braceSWL: 30, height: 4000, braceHeight: 2500}],
  ['legacy', {}],
  ['legacy', {pressureMethod: 'ACI347', shape: 'L'}],
  ['legacy', {kind: 'COLUMN', width: 600, length: 600, height: 3000}],
  ['legacy', {kind: 'COLUMN', width: 1000, length: 800, height: 3500, columnTies: true, tieSpacing: 400, pressureMethod: 'ACI347'}],
  ['legacy', {studSectionId: 'TIMBER-50x100-ACTUAL'}],
];
