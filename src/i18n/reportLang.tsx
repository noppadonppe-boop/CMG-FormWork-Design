/** Report language (Thai / English) for the short calculation report and the figures it reuses. The engines and the
 * report model stay in Thai; English is produced by phrase replacement (`REPORT_EN`), longest phrase first. */
import {createContext, useContext, type ReactNode} from 'react';
import {REPORT_EN} from './reportEn';

export type ReportLang = 'th' | 'en';
/** "คร่าว" is a joist under a soffit (slab) and a stud on a side form (wall, column, footing). */
export type StudTerm = 'Joist' | 'Stud' | 'Stud/joist';
export interface ReportLangValue {lang: ReportLang; stud?: StudTerm}
export const ReportLangContext = createContext<ReportLangValue>({lang: 'th'});
export const THAI = /[฀-๿]/;

type Entry = readonly [string, string];
const ENTRIES: Entry[] = [...REPORT_EN].sort((a, b) => b[0].length - a[0].length);
const cache = new Map<string, string>();

/** English version of a Thai report string (unknown Thai phrases are left as they are). */
export function toEnglish(text: string, stud: StudTerm = 'Stud/joist'): string {
  if (!THAI.test(text)) return text;
  const key = stud + '\u0000' + text, hit = cache.get(key);
  if (hit !== undefined) return hit;
  let s = text;
  for (const [th, entry] of ENTRIES) {
    const en = th === 'คร่าว' ? stud : entry.replace('studs/joists', stud === 'Joist' ? 'joists' : stud === 'Stud' ? 'studs' : 'studs/joists');
    // Thai has no spaces between words: add one where the English would otherwise touch a Latin word or number.
    for (let i = s.indexOf(th); i >= 0; i = s.indexOf(th, i + 1)) {
      const before = /[A-Za-z0-9)]$/.test(s.slice(0, i)) && /^[A-Za-z(]/.test(en) ? ' ' : '';
      const after = /^[A-Za-z0-9(]/.test(s.slice(i + th.length)) && /[A-Za-z0-9)]$/.test(en) ? ' ' : '';
      s = s.slice(0, i) + before + en + after + s.slice(i + th.length);
    }
    if (!THAI.test(s)) break;
  }
  s = s.replace(/ {2,}/g, ' ');
  cache.set(key, s);
  return s;
}
export const translate = (v: ReportLangValue, text: string) => v.lang === 'en' ? toEnglish(text, v.stud) : text;
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
  return toEnglish(parts.join(''), v.stud);
}
/** Deep copy with every string translated (report models, engine checks). */
export function translateDeep<T>(value: T, v: ReportLangValue): T {
  if (v.lang === 'th') return value;
  const walk = (x: unknown): unknown => typeof x === 'string' ? toEnglish(x, v.stud) : Array.isArray(x) ? x.map(walk)
    : x && typeof x === 'object' ? Object.fromEntries(Object.entries(x).map(([k, y]) => [k, walk(y)])) : x;
  return walk(value) as T;
}
