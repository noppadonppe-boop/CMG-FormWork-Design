import {beforeAll, describe, expect, it} from 'vitest';
import {webcrypto} from 'node:crypto';
import {calculate, defaults, usesTies, validateInput} from '../src/domain/index';
import {buildFormworkLayout} from '../src/domain/formworkLayout';
import {legacyModel3D} from '../src/domain/model3d';
import {editFields} from '../src/domain/model3dEdit';
import {optimizeLayout} from '../src/domain/optimize';
import {projectExample} from '../src/domain/mockProject';
import {projectExampleWorkflowDraft} from '../src/domain/projectExampleWorkflow';

beforeAll(() => {if (!globalThis.crypto) Object.assign(globalThis, {crypto: webcrypto});});
const column = {...defaults, kind: 'COLUMN' as const, width: 1000, length: 800, height: 3500, tieSpacing: 400};

describe('column: optional through ties', () => {
  it('default (and data saved before the option) = external yoke, no ties, results unchanged', () => {
    const {columnTies: _drop, ...old} = column;
    expect(validateInput(old).columnTies).toBe(false);
    const r = calculate(old);
    expect(usesTies(r.input)).toBe(false);
    expect(r.tieRoutes).toHaveLength(0);
    expect(r.checks.some(c => c.id.startsWith('tie'))).toBe(false);
    expect(r.checks.some(c => c.id.startsWith('column-'))).toBe(true);
    expect(calculate({...old, columnTies: false}).checks).toEqual(r.checks);
  });
  it('with ties: tie routes, tie checks, shorter waler spans and the yoke corners still checked', () => {
    const yoke = calculate({...column, columnTies: false}), tied = calculate({...column, columnTies: true});
    expect(tied.tieRoutes.length).toBeGreaterThan(0);
    for (const id of ['tie', 'tie-net', 'tie-assembly']) expect(tied.checks.some(c => c.id === id), id).toBe(true);
    expect(tied.checks.some(c => c.id.startsWith('column-'))).toBe(true);
    const ratio = (r: typeof yoke) => r.checks.find(c => c.id === 'waler-b')!.utilization!;
    expect(ratio(tied)).toBeLessThan(ratio(yoke));
    expect(tied.blockers.some(b => b.includes('เสาใช้ Tie ทะลุเสา'))).toBe(true);
    // Layout/BOM, 3D model and optimizer follow the routes.
    const L = buildFormworkLayout(tied);
    expect(L.tie).not.toBeNull();
    expect(L.bom.some(b => b.item.startsWith('Tie rod'))).toBe(true);
    expect(legacyModel3D(tied).parts.some(p => p.group === 'tie')).toBe(true);
    expect(legacyModel3D(yoke).parts.some(p => p.group === 'tie')).toBe(false);
    expect(optimizeLayout(tied.input).every(o => o.input.columnTies)).toBe(true);
  });
  it('the A3 drawing set of a column with ties shows the tie rods', async () => {
    const React = await import('react'), {renderToStaticMarkup} = await import('react-dom/server'), {DrawingSet} = await import('../src/components/DrawingSet');
    const {defaultTitleBlock} = await import('../src/domain/titleBlock');
    const html = (columnTies: boolean) => renderToStaticMarkup(React.createElement(DrawingSet, {result: calculate({...column, columnTies}), project: 'P', code: 'C',
      caseName: 'C01', titleBlock: defaultTitleBlock(''), canEdit: false, onTitleBlockChange: () => {}}));
    expect(html(true)).toContain('Tie rod ทะลุ');
    expect(html(false)).not.toContain('Tie rod ทะลุ');
    expect(html(true)).not.toMatch(/NaN|Infinity/);
  });
  it('the 3D model offers the choice for columns only', () => {
    expect(editFields('COLUMN', 'waler').some(f => 'key' in f && f.key === 'columnTies')).toBe(true);
    expect(editFields('FOOTING', 'waler').some(f => 'key' in f && f.key === 'columnTies')).toBe(false);
  });
  it('the Project Example column draft switches to through ties with the page tie Ø', () => {
    const c = projectExample().cases.find(k => k.name.includes(' C01 '))!;
    expect(c.workflowV07!.model.sideTopology).toBe('COLUMN_YOKE');
    const d = projectExampleWorkflowDraft({...c.input, columnTies: true, tieDiameter: 20}, 'COLUMN', c.id, c);
    expect(['THROUGH_TIE', 'SEGMENTED_TIE']).toContain(d.model.sideTopology); // the example completes ties as inner/outer (segmented) sets
    expect(d.model.sideLayout!.ties.length).toBeGreaterThan(0);
    expect(d.model.sideLayout!.ties.every(t => t.diameterMm === 20)).toBe(true);
  });
});
