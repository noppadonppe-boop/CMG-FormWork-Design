import {describe, expect, it} from 'vitest';
import {webcrypto} from 'node:crypto';
import {defaults} from '../src/domain/index';
import {calculateSlab, slabDefaults} from '../src/domain/slab';
import {calculateWall, wallDefaults} from '../src/domain/wall';
import {applyKitToCase, caseKitStatus, kitDefaults, kitImpact, kitShoreLength, nextRevision, reviseKit, shoreSwlAt, validateKit} from '../src/domain/projectKit';
import {sideSpanChart, slabSpanChart} from '../src/domain/spanChart';
import {projectExample} from '../src/domain/mockProject';

if (!globalThis.crypto) Object.assign(globalThis, {crypto: webcrypto});
const table = [{length: 2000, swl: 30}, {length: 2500, swl: 25}, {length: 3000, swl: 20}];

describe('shore SWL table by working length', () => {
  it('takes the first tabulated length not shorter than the shore; beyond the table is unknown', () => {
    expect(shoreSwlAt(table, 1800)).toBe(30);
    expect(shoreSwlAt(table, 2001)).toBe(25);
    expect(shoreSwlAt(table, 3000)).toBe(20);
    expect(shoreSwlAt(table, 3200)).toBe(0);
    expect(() => validateKit({...kitDefaults, shoreTable: [{length: 2500, swl: 20}, {length: 2000, swl: 30}]})).toThrow();
  });

  it('a slab on the kit gets the SWL at its own shore length, and a new soffit height takes it off the kit', () => {
    const kit = {...kitDefaults, shoreTable: table}, z = {input: {...defaults}, workflowElementType: 'SLAB' as const, slab: {...slabDefaults, soffitHeight: 2700}};
    const {value} = applyKitToCase(z, kit), L = kitShoreLength(kit, 2700);
    expect(value.slab!.shoreSWL).toBe(shoreSwlAt(table, L));
    expect(value.slab!.shoreReference).toContain(`${Math.round(L)} mm`);
    expect(calculateSlab(value.slab).shoreLength).toBeCloseTo(L, 9);
    expect(caseKitStatus(value, kit).state).toBe('ON');
    const higher = {...value, slab: {...value.slab!, soffitHeight: 3100}};
    expect(caseKitStatus(higher, kit)).toMatchObject({state: 'OFF', diff: ['ค้ำยัน']});
  });

  it('kits saved before the table and history still load', () => {
    const {shoreTable, history, ...old} = kitDefaults; void [shoreTable, history];
    expect(validateKit(old)).toEqual(kitDefaults);
  });
});

describe('kit revisions and impact', () => {
  it('logs every save and bumps an unchanged revision when the content changed', () => {
    const first = reviseKit(undefined, kitDefaults, '1/1/2569');
    expect(first.history).toEqual([{revision: 'K1', date: '1/1/2569', note: 'สร้างชุดมาตรฐาน'}]);
    const second = reviseKit(first, {...first, plywood: 18}, '2/1/2569');
    expect(second.revision).toBe('K2');
    expect(second.history.at(-1)).toEqual({revision: 'K2', date: '2/1/2569', note: 'แก้ ไม้อัด'});
    expect(reviseKit(second, second, '3/1/2569')).toBe(second);
    expect(reviseKit(second, {...second, revision: 'K3-site', tieSWL: 30}, '4/1/2569').revision).toBe('K3-site');
    expect(nextRevision('R')).toBe('R-2');
  });

  it('shows FAIL counts before and after applying a changed kit, leaving exceptions alone', () => {
    const cases = projectExample().cases.map((z, i) => i === 0 ? {...z, kitException: 'ฐานรากพิเศษ'} : z);
    const thin = {...kitDefaults, plywood: 12}, rows = kitImpact(cases, thin);
    expect(rows).toHaveLength(cases.length);
    expect(rows[0]).toMatchObject({exception: true});
    expect(rows[0].after).toBe(rows[0].before);
    expect(rows.slice(1).some(r => r.after !== null && r.before !== null && r.after > r.before)).toBe(true);
  });
});

describe('span charts agree with the engines', () => {
  it('wall: chart spacings at the wall pressure leave plywood, stud, waler and tie within limits', () => {
    const kit = {...kitDefaults, walerSectionId: wallDefaults.walerSectionId, tieSWL: 40};
    const [row] = sideSpanChart(kit, [wallDefaults.gamma * wallDefaults.height / 1000]);
    expect(row.stud).not.toBeNull(); expect(row.waler).not.toBeNull(); expect(row.tie).not.toBeNull();
    const wall = applyKitToCase({input: {...defaults}, workflowElementType: 'WALL', wall: {...wallDefaults, studSpacing: row.stud!, walerSpacing: row.waler!, tieSpacing: row.tie!}}, kit).value.wall!;
    const r = calculateWall(wall);
    expect(r.checks.filter(c => /^(ply|stud|waler|tie)-/.test(c.id) && c.status === 'FAIL')).toEqual([]);
    for (const v of [row.stud, row.waler, row.tie]) expect(v! % kit.spacingStep).toBe(0);
  });

  it('slab: chart spacings for the slab thickness leave plywood, joist, bearer and shore within limits', () => {
    const kit = {...kitDefaults, shoreSWL: 20};
    const [row] = slabSpanChart(kit, [slabDefaults.t]);
    const slab = applyKitToCase({input: {...defaults}, workflowElementType: 'SLAB', slab: {...slabDefaults, joistSpacing: row.joist!, bearerSpacing: row.bearer!, shoreSpacing: row.shore!}}, kit).value.slab!;
    const r = calculateSlab(slab);
    expect(r.checks.filter(c => c.status === 'FAIL')).toEqual([]);
    expect(row.shoreLimited).toBe(true);
  });
});
