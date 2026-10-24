// @vitest-environment jsdom
import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {renderToStaticMarkup} from 'react-dom/server';
import {afterEach, describe, expect, it} from 'vitest';
import {calculate, defaults} from '../src/domain';
import {calculateBeam, beamDefaults} from '../src/domain/beam';
import {calculateSlab, slabDefaults} from '../src/domain/slab';
import {calculateWall, wallDefaults} from '../src/domain/wall';
import {defaultTitleBlock} from '../src/domain/titleBlock';
import {DrawingSet} from '../src/components/DrawingSet';
import {BeamDrawingSet} from '../src/components/BeamDocs';
import {SlabDrawingSet} from '../src/components/SlabDocs';
import {WallDrawingSet} from '../src/components/WallDocs';
import {toEnglish, toLang} from '../src/i18n/reportLang';
import {wrap} from '../src/drawing/views';
import {QA_CASES} from './qa-cases';

const common = {project: 'P', code: 'C', caseName: 'C01', titleBlock: {...defaultTitleBlock(''), date: '2026-10-24'}, onTitleBlockChange: () => {}};
const set = (kind: string, input: Record<string, unknown>) => kind === 'slab' ? <SlabDrawingSet {...common} r={calculateSlab({...slabDefaults, ...input} as never)}/>
  : kind === 'beam' ? <BeamDrawingSet {...common} r={calculateBeam({...beamDefaults, ...input} as never)}/>
  : kind === 'wall' ? <WallDrawingSet {...common} r={calculateWall({...wallDefaults, ...input} as never)}/> : <DrawingSet {...common} result={calculate({...defaults, ...input} as never)}/>;
/** Text of every <text> on the A3 sheets of a rendered set. */
function sheetTexts(lang: string, kind: string, input: Record<string, unknown>) {
  localStorage.setItem('cmg-drawing-lang', lang);
  const html = renderToStaticMarkup(set(kind, input));
  return (html.match(/<svg[^>]*a3-sheet[\s\S]*?<\/svg>/g) ?? []).flatMap(svg => [...svg.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)].map(m => m[1].replace(/<[^>]+>/g, '')));
}
afterEach(() => localStorage.clear());

describe('A3 drawing language (Thai / English / Chinese)', () => {
  it.each(QA_CASES)('%s %j: English and Chinese sheets have no Thai left and keep every dimension', (kind, input) => {
    const th = sheetTexts('th', kind, input), en = sheetTexts('en', kind, input), zh = sheetTexts('zh', kind, input);
    expect(th.some(t => /[฀-๿]/.test(t))).toBe(true);
    expect(en.filter(t => /[฀-๿]/.test(t))).toEqual([]);
    expect(zh.filter(t => /[฀-๿]/.test(t))).toEqual([]);
    expect(zh.some(t => /[一-鿿]/.test(t))).toBe(true);
    // Dimension and chain-dimension values are single-number texts: identical in every language.
    const dims = (ts: string[]) => ts.filter(t => /^[\d,]+$/.test(t)).sort();
    expect(dims(en)).toEqual(dims(th));
    expect(dims(zh)).toEqual(dims(th));
  });

  it('uses the set term for คร่าว and leaves the short report wording alone', () => {
    expect(toLang('คร่าว SHS 50x50x2.3 @ 300', 'en', 'Joist', true)).toBe('Joist SHS 50x50x2.3 @ 300');
    expect(toLang('คร่าว SHS 50x50x2.3 @ 300', 'zh', 'Stud', true)).toBe('竖楞 SHS 50x50x2.3 @ 300');
    expect(toLang('แบบร่างเบื้องต้น · ห้ามใช้ก่อสร้าง', 'zh', 'Stud', true)).toBe('初步草图 · 不得用于施工');
    // No space is pushed between a Latin prefix and the number that follows it.
    expect(toLang('คุณสมบัติวัสดุเป็นค่าอ้างอิงเบื้องต้น (ไม้อัด: APA V345 · เหล็ก Fy 245 MPa)', 'en', 'Stud', true)).toContain('APA V345');
    // Outside drawing sets (short report) the drawing phrases are not used.
    expect(toEnglish('ห้ามใช้ก่อสร้าง')).toBe(toLang('ห้ามใช้ก่อสร้าง', 'en'));
    expect(toLang('ห้ามใช้ก่อสร้าง', 'th', 'Stud', true)).toBe('ห้ามใช้ก่อสร้าง');
  });

  it('wraps Chinese by display width (CJK counts double) and leaves Thai wrapping unchanged', () => {
    expect(wrap('一二三四五六七八', 8)).toEqual(['一二三四', '五六七八']);
    expect(wrap('ตรวจแนว ดิ่ง ระดับ', 12)).toEqual(['ตรวจแนว ดิ่ง', 'ระดับ']);
  });

  it('switches every sheet of the set from the sheet toolbar and remembers the choice', async () => {
    const host = document.createElement('div'); document.body.append(host);
    const root = createRoot(host);
    await act(async () => {root.render(set('legacy', {}));});
    const sheetTitle = () => host.querySelector('.a3-sheet')!.textContent!;
    expect(sheetTitle()).toContain('แปลนแบบหล่อ (FORMWORK PLAN)');
    const button = (label: string) => [...host.querySelectorAll<HTMLButtonElement>('.a3-toolbar .drawing-lang button')].find(b => b.textContent === label)!;
    expect(host.querySelectorAll('.a3-toolbar .drawing-lang')).toHaveLength(4);
    await act(async () => {button('EN').click();});
    expect(sheetTitle()).toContain('FORMWORK PLAN');
    expect(sheetTitle()).not.toMatch(/[฀-๿]/);
    expect(host.querySelector('.a3-toolbar b')!.textContent).toBe('FW-01 · Formwork plan');
    expect(localStorage.getItem('cmg-drawing-lang')).toBe('en');
    await act(async () => {button('中文').click();});
    expect(sheetTitle()).toContain('模板平面图');
    expect(host.querySelectorAll('.a3-sheet[lang="zh"]')).toHaveLength(4);
    await act(async () => {button('ไทย').click();});
    expect(sheetTitle()).toContain('แปลนแบบหล่อ (FORMWORK PLAN)');
    await act(async () => root.unmount()); host.remove();
  });
});
