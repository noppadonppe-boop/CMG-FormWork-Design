import {beforeAll, describe, expect, it} from 'vitest';
import {webcrypto} from 'node:crypto';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {calculate, defaults, type Check} from '../src/domain/index';
import {calculateSlab, slabAdvice, slabDefaults} from '../src/domain/slab';
import {beamDefaults, calculateBeam} from '../src/domain/beam';
import {calculateWall, wallDefaults} from '../src/domain/wall';
import {beamShortModel, governingCheck, legacyShortModel, rowsFromCheck, slabShortModel, verdict, wallShortModel} from '../src/domain/shortReport';
import {defaultTitleBlock} from '../src/domain/titleBlock';
import {BeamShortReport, LegacyShortReport, SlabShortReport, WallShortReport} from '../src/components/ShortReport';
import {toEnglish} from '../src/i18n/reportLang';
import {QA_CASES} from './qa-cases';

beforeAll(() => {if (!globalThis.crypto) Object.assign(globalThis, {crypto: webcrypto});});
const chk = (id: string, demand: number | null, limit: number | null): Check => ({id, label: 'X: ' + id, demand, limit, unit: 'MPa', utilization: demand !== null && limit !== null ? demand / limit : null,
  status: demand !== null && limit !== null && demand > limit ? 'FAIL' : 'INCOMPLETE', formula: 'f = a; g = b', substitution: 'a = 1; b = 2', source: 's', note: 'n'});
const slab = calculateSlab({...slabDefaults, lx: 7200, ly: 7200, t: 160, soffitHeight: 2800});

describe('short report: governing member selection', () => {
  it('picks the highest ratio; without any limit keeps the first check and never reports OK', () => {
    expect(governingCheck([chk('a-b', 1, 4), chk('a-d', 3, 4), chk('a-v', 1, 2)])!.id).toBe('a-d');
    const open = governingCheck([chk('p', 9.7, null)])!;
    expect(open.id).toBe('p');
    expect(verdict(open)).toBe('INCOMPLETE');
    expect(verdict(chk('f', 5, 4))).toBe('FAIL');
    expect(rowsFromCheck(chk('p', 9.7, null)).at(-1)!.expr).toContain('ยังไม่ระบุ');
  });

  it('slab sample (book example 6.1 size): plywood bending, joist deflection, bearer bending govern', () => {
    const M = slabShortModel(slab, slabAdvice(slab.input)), by = (tag: string) => M.members.find(m => m.name.startsWith(tag))!;
    expect(by('ไม้อัด').governing!.id).toBe('ply-b');
    expect(by('คร่าว').governing!.id).toBe('joist-d');
    expect(by('คานรับ').governing!.id).toBe('bearer-b');
    expect(by('ค้ำยัน').governing!.limit).toBeNull();
    // explicit textbook steps reproduce the engine values (otherwise the generic formula text is used)
    expect(by('คร่าว').rows.map(r => r.expr)).toContain('1.717 mm');
    expect(by('คานรับ').rows.map(r => r.expr)).toContain('1.456 kN·m');
    expect(by('คร่าว').maxSpacing).toBe('575 mm');
  });

  it('uniform steps fall back to the engine text when they would not reproduce the check', () => {
    const r = calculateSlab({...slabDefaults, bearerCount: 2});
    const bearer = slabShortModel(r).members.find(m => m.name.startsWith('คานรับ'))!;
    expect(bearer.rows.some(row => row.label === 'สูตร')).toBe(false);
    const g = bearer.governing!, last = bearer.rows.filter(row => row.strong).at(-1)!.expr;
    expect(parseFloat(last.replace(/,/g, ''))).toBeCloseTo(g.demand!, g.unit === 'mm' ? 3 : 2);
  });

  it('beam, wall (both systems) and footing/column list their member chains', () => {
    const beam = beamShortModel(calculateBeam({...beamDefaults, tieRows: 1}));
    expect(beam.members.map(m => m.tag).filter(Boolean)).toEqual(['1', '2', '3', '4', '5', '6']);
    const two = wallShortModel(calculateWall(wallDefaults)), one = wallShortModel(calculateWall({...wallDefaults, system: 'SINGLE_SIDED'}));
    expect(two.members.some(m => m.name.startsWith('Tie'))).toBe(true);
    expect(one.members.some(m => m.name.startsWith('Strongback'))).toBe(true);
    expect(one.members.some(m => m.name.startsWith('Tie'))).toBe(false);
    const footing = legacyShortModel(calculate(defaults)), column = legacyShortModel(calculate({...defaults, kind: 'COLUMN', width: 600, length: 600, height: 3000}));
    expect(footing.members.some(m => m.name.startsWith('Tie'))).toBe(true);
    expect(column.members.some(m => m.name.startsWith('ชุดรัดเสา'))).toBe(true);
    for (const M of [beam, two, one, footing, column]) for (const m of M.members) if (m.governing?.limit === null) expect(verdict(m.governing)).toBe('INCOMPLETE');
  });
});

describe('short report: A4 rendering for all five systems', () => {
  const common = {project: 'P', code: 'C', caseName: 'C01', caseId: 'case-1', titleBlock: defaultTitleBlock('')};
  const pages = [
    ['พื้น', React.createElement(SlabShortReport, {...common, r: slab})],
    ['คาน', React.createElement(BeamShortReport, {...common, r: calculateBeam({...beamDefaults, tieRows: 1})})],
    ['ผนัง', React.createElement(WallShortReport, {...common, r: calculateWall(wallDefaults)})],
    ['ผนังด้านเดียว', React.createElement(WallShortReport, {...common, r: calculateWall({...wallDefaults, system: 'SINGLE_SIDED'})})],
    ['ฐานราก', React.createElement(LegacyShortReport, {...common, r: calculate(defaults)})],
    ['เสา', React.createElement(LegacyShortReport, {...common, r: calculate({...defaults, kind: 'COLUMN', width: 600, length: 600, height: 3000})})],
  ] as const;
  it.each(pages)('%s: criteria, governing table, derivations, summary', (name, el) => {
    const html = renderToStaticMarkup(el);
    expect(html).toContain(`แบบหล่อ${name === 'ผนังด้านเดียว' ? 'ผนังด้านเดียว' : name}`);
    for (const t of ['Design Criteria', 'การเลือกองค์อาคารควบคุม', 'ควบคุมโดย', 'สรุปผล', 'DRAFT / NOT FOR CONSTRUCTION']) expect(html).toContain(t);
    expect(html).not.toMatch(/NaN|Infinity|undefined|>PASS</);
  });
});

describe('short report: Thai / English', () => {
  const base = {project: 'P', code: 'C', caseName: 'C01', caseId: 'case-1', titleBlock: {...defaultTitleBlock(''), date: '2026-10-22'}};
  const el = (kind: string, input: Record<string, unknown>, lang: 'th' | 'en') => {
    const c = {...base, lang};
    return kind === 'slab' ? React.createElement(SlabShortReport, {...c, r: calculateSlab({...slabDefaults, ...input})})
      : kind === 'beam' ? React.createElement(BeamShortReport, {...c, r: calculateBeam({...beamDefaults, ...input})})
      : kind === 'wall' ? React.createElement(WallShortReport, {...c, r: calculateWall({...wallDefaults, ...input})})
      : React.createElement(LegacyShortReport, {...c, r: calculate({...defaults, ...input})});
  };
  it.each(QA_CASES)('%s %j: English has no Thai left, Thai stays Thai, numbers are identical', (kind, input) => {
    const en = renderToStaticMarkup(el(kind, input, 'en')), th = renderToStaticMarkup(el(kind, input, 'th'));
    const thai = [...en.matchAll(/>([^<]*[฀-๿][^<]*)</g)].map(m => m[1]);
    expect(thai).toEqual([]);
    expect(en).toContain('Governing Members');
    expect(en).not.toMatch(/NaN|Infinity|undefined|>PASS</);
    expect(th).toContain('การเลือกองค์อาคารควบคุม');
    const nums = (s: string) => [...s.replace(/<[^>]+>/g, ' ').matchAll(/\d[\d,]*\.\d{3}/g)].map(m => m[0]).sort();
    expect(nums(en)).toEqual(nums(th));
  });
  it('translation keeps words apart and leaves non-Thai text alone', () => {
    expect(toEnglish('คร่าว SHS 50x50x2.3')).toBe('Stud/joist SHS 50x50x2.3');
    expect(toEnglish('ช่วง 1,200 mm')).toBe('span 1,200 mm');
    expect(toEnglish('fb = M / S')).toBe('fb = M / S');
  });
});
