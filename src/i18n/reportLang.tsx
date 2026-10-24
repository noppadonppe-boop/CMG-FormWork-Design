/** Report language for the short calculation report (Thai / English) and the A3 drawing sets (Thai / English / Chinese).
 * The engines and the report model stay in Thai; other languages are produced by phrase replacement, longest phrase first:
 * drawing sets (`drawing: true`) use `DRAWING_PHRASES` before `REPORT_EN`; Chinese falls back to English where no Chinese phrase exists. */
import {createContext, useContext, type ReactNode} from 'react';
import {REPORT_EN} from './reportEn';
import {DRAWING_PHRASES} from './drawingPhrases';

export type ReportLang = 'th' | 'en' | 'zh';
/** "คร่าว" is a joist under a soffit (slab) and a stud on a side form (wall, column, footing). */
export type StudTerm = 'Joist' | 'Stud' | 'Stud/joist';
export interface ReportLangValue {lang: ReportLang; stud?: StudTerm; drawing?: boolean}
export const ReportLangContext = createContext<ReportLangValue>({lang: 'th'});
export const THAI = /[฀-๿]/;
const ZH_STUD: Record<StudTerm, string> = {Joist: '次楞', Stud: '竖楞', 'Stud/joist': '次楞'};

type Entry = readonly [string, string];
const byLength = (e: readonly Entry[]) => [...e].sort((a, b) => b[0].length - a[0].length);
const DRAW_TH = new Set(DRAWING_PHRASES.map(p => p[0]));
const EN: Entry[] = byLength(REPORT_EN);
// Drawing phrases first on equal length (stable sort), then the report phrases they do not redefine.
const DRAW_EN: Entry[] = byLength([...DRAWING_PHRASES.map(([th, en]) => [th, en] as const), ...REPORT_EN.filter(([th]) => !DRAW_TH.has(th))]);
const DRAW_ZH: Entry[] = byLength(DRAWING_PHRASES.map(([th, , zh]) => [th, zh] as const));
const cache = new Map<string, string>();

function replaceAll(text: string, entries: Entry[], term: (th: string, entry: string) => string): string {
  let s = text;
  for (const [th, entry] of entries) {
    if (!s.includes(th)) continue;
    const out = term(th, entry);
    // Thai has no spaces between words: add one where a Latin translation would otherwise touch a Latin word or number.
    for (let i = s.indexOf(th); i >= 0; i = s.indexOf(th, i + out.length)) {
      const before = /[A-Za-z0-9)]$/.test(s.slice(0, i)) && /^[A-Za-z(]/.test(out) ? ' ' : '';
      const after = /^[A-Za-z0-9(]/.test(s.slice(i + th.length)) && /[A-Za-z0-9)]$/.test(out) ? ' ' : '';
      s = s.slice(0, i) + before + out + after + s.slice(i + th.length);
    }
    if (!THAI.test(s)) break;
  }
  return s;
}
const enTerm = (stud: StudTerm) => {
  const plural = stud === 'Joist' ? 'joists' : stud === 'Stud' ? 'studs' : 'studs/joists';
  return (th: string, entry: string) => th === 'คร่าว' ? stud : entry.replace('studs/joists', plural).replace('{studs}', plural).replace('{stud}', stud);
};
const zhTerm = (stud: StudTerm) => (th: string, entry: string) => th === 'คร่าว' ? ZH_STUD[stud] : entry.replace('{stud}', ZH_STUD[stud]);

/** Report string in `lang` (unknown Thai phrases are left as they are); `drawing` adds the drawing-set phrases. */
export function toLang(text: string, lang: ReportLang, stud: StudTerm = 'Stud/joist', drawing = false): string {
  if (lang === 'th' || !THAI.test(text)) return text;
  const key = [lang, stud, drawing ? 'D' : '', text].join('|'), hit = cache.get(key);
  if (hit !== undefined) return hit;
  let s = lang === 'zh' && drawing ? replaceAll(text, DRAW_ZH, zhTerm(stud)) : text;
  if (THAI.test(s)) s = replaceAll(s, drawing ? DRAW_EN : EN, enTerm(stud));
  s = s.replace(/ {2,}/g, ' ');
  cache.set(key, s);
  return s;
}
/** English version of a Thai report string (unknown Thai phrases are left as they are). */
export const toEnglish = (text: string, stud: StudTerm = 'Stud/joist') => toLang(text, 'en', stud);
export const translate = (v: ReportLangValue, text: string) => toLang(text, v.lang, v.stud, v.drawing);
/** Translator for the current report language. */
export function useTr() {
  const v = useContext(ReportLangContext);
  return (text: string) => translate(v, text);
}
/** Plain text children (strings and numbers) joined and translated; anything else is returned unchanged. */
export function useTrChildren(children: ReactNode): ReactNode {
  const v = useContext(ReportLangContext);
  if (v.lang === 'th') return children;
  const parts = Array.isArray(children) ? children : [children];
  if (!parts.every(p => typeof p === 'string' || typeof p === 'number')) return children;
  return translate(v, parts.join(''));
}
/** Deep copy with every string translated (report models, engine checks). */
export function translateDeep<T>(value: T, v: ReportLangValue): T {
  if (v.lang === 'th') return value;
  const walk = (x: unknown): unknown => typeof x === 'string' ? translate(v, x) : Array.isArray(x) ? x.map(walk)
    : x && typeof x === 'object' ? Object.fromEntries(Object.entries(x).map(([k, y]) => [k, walk(y)])) : x;
  return walk(value) as T;
}
/** Display width in Latin-character units: CJK and full-width characters count double (wrapping and table truncation). */
export const textWidth = (s: string) => {let n = 0; for (const ch of s) n += /[⺀-鿿가-힯豈-﫿＀-｠]/.test(ch) ? 2 : 1; return n;};
