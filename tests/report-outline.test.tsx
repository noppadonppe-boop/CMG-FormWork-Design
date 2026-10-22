import {beforeAll, describe, expect, it} from 'vitest';
import {webcrypto} from 'node:crypto';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {calculate, defaults, type Check} from '../src/domain/index';
import {calculateSlab, slabDefaults} from '../src/domain/slab';
import {beamDefaults, calculateBeam} from '../src/domain/beam';
import {calculateWall, wallDefaults} from '../src/domain/wall';
import {REPORT_SECTIONS, beamCheckGroups, legacyCheckGroups, numberChecks, screenState, slabCheckGroups, wallCheckGroups} from '../src/domain/reportOutline';
import {defaultTitleBlock} from '../src/domain/titleBlock';
import {CalcReport} from '../src/components/CalcReport';
import {DrawingSet} from '../src/components/DrawingSet';
import {BeamDrawingSet, BeamReport} from '../src/components/BeamDocs';
import {SlabDrawingSet, SlabReport} from '../src/components/SlabDocs';
import {WallDrawingSet, WallReport} from '../src/components/WallDocs';
import {ChecksTable} from '../src/components/FormParts';
import {QA_CASES} from './qa-cases';

beforeAll(() => {if (!globalThis.crypto) Object.assign(globalThis, {crypto: webcrypto});});
const tb = defaultTitleBlock(), common = {project: 'P', code: 'C', caseName: 'X', caseId: 'X', titleBlock: tb};
const a3 = {project: 'P', code: 'C', caseName: 'X', titleBlock: tb, canEdit: false, onTitleBlockChange: () => {}};

/** Result, groups, A4 report and A3 set of one QA case. */
function qa(kind: string, input: Record<string, unknown>) {
  if (kind === 'slab') {const r = calculateSlab({...slabDefaults, ...input}); return {r, groups: slabCheckGroups(), a4: <SlabReport r={r} {...common}/>, sheets: <SlabDrawingSet r={r} {...a3}/>};}
  if (kind === 'beam') {const r = calculateBeam({...beamDefaults, ...input}); return {r, groups: beamCheckGroups(), a4: <BeamReport r={r} {...common}/>, sheets: <BeamDrawingSet r={r} {...a3}/>};}
  if (kind === 'wall') {const r = calculateWall({...wallDefaults, ...input}); return {r, groups: wallCheckGroups(!!r.strongback), a4: <WallReport r={r} {...common}/>, sheets: <WallDrawingSet r={r} {...a3}/>};}
  const r = calculate({...defaults, ...input});
  return {r, groups: legacyCheckGroups(r.input.kind, !!r.input.columnTies), a4: <CalcReport r={r} {...common}/>, sheets: <DrawingSet result={r} {...a3}/>};
}

describe('shared report outline and check numbering', () => {
  it('numbers every check of every system without a fallback group', () => {
    for (const [kind, input] of QA_CASES) {
      const {r, groups} = qa(kind, input), numbered = numberChecks(groups, r.checks);
      expect(numbered.ordered, `${kind} ${JSON.stringify(input)}`).toHaveLength(r.checks.length);
      expect(numbered.groups.some(g => g.title === 'รายการตรวจอื่น'), `${kind} ${JSON.stringify(input)}`).toBe(false);
      expect(new Set(numbered.ordered.map(i => i.no)).size).toBe(r.checks.length);
    }
  });

  it('puts unclaimed checks in an extra section-4 group so nothing loses its number', () => {
    const c = (id: string): Check => ({id, label: id, demand: 1, limit: 2, unit: 'kN', utilization: 0.5, status: 'INCOMPLETE', formula: '', substitution: '', source: '', note: ''});
    const out = numberChecks([{no: '4.1', title: 'A', prefixes: ['a']}, {no: '5.1', title: 'B', prefixes: ['b']}], [c('a1'), c('zz'), c('b1')]);
    expect(out.ordered.map(i => i.no)).toEqual(['4.1.1', '4.2.1', '5.1.1']);
    expect(out.byId.zz).toBe('4.2.1');
  });

  it('uses the same nine sections and the same check numbers in the A4 report, the UI table and the A3 summary', () => {
    for (const [kind, input] of QA_CASES) {
      const {r, groups, a4, sheets} = qa(kind, input), label = `${kind} ${JSON.stringify(input)}`;
      const report = renderToStaticMarkup(a4), table = renderToStaticMarkup(<ChecksTable items={numberChecks(groups, r.checks).ordered}/>), a3sheets = renderToStaticMarkup(sheets);
      REPORT_SECTIONS.forEach((s, i) => expect(report, label).toContain(`${i + 1}. ${s}`));
      expect(report.match(/class="rp-check"/g)?.length, label).toBe(r.checks.length);
      for (const {no, check} of numberChecks(groups, r.checks).ordered) {
        expect(report, `${label} ${no}`).toContain(`<span>${no}</span> ${check.label}`);
        expect(table, `${label} ${no}`).toContain(`<td class="check-no">${no}</td>`);
        expect(a3sheets, `${label} ${no}`).toContain(`${no} ${check.label}`);
      }
      expect(report).not.toMatch(/NaN|undefined/);
    }
  });

  it('labels a check within its limit apart from a check without a capacity, and never as PASS', () => {
    const r = calculateBeam(beamDefaults), html = renderToStaticMarkup(<ChecksTable checks={r.checks}/>);
    expect(screenState(r.checks.find(k => k.id === 'shore-p')!)).toBe('NO_LIMIT');
    expect(screenState(r.checks.find(k => k.id === 'sof-ply-b')!)).toBe('WITHIN');
    expect(html).toContain('INCOMPLETE · ไม่เกินเกณฑ์');
    expect(html).toContain('INCOMPLETE · ขาดค่ากำลัง');
    expect(html).not.toContain('PASS');
  });

  it('prints the plywood properties the engine used on FW-04 and keeps every blocker reachable', () => {
    const r = calculate({...defaults, kind: 'COLUMN', width: 600, length: 600, height: 3000});
    const html = renderToStaticMarkup(<DrawingSet result={r} {...a3}/>);
    expect(r.plywood.grade).not.toBe('CUSTOM');
    expect(html).toContain(`${r.plywood.E.toLocaleString('en-US', {maximumFractionDigits: 0})} / `);
    expect(html).not.toContain(`/ ${r.input.plywoodE} / ${r.input.plywoodFb} MPa`);
    if (r.blockers.length > 9) expect(html).toContain(`และอีก ${r.blockers.length - 8} รายการ`);
  });
});
