/** Per-case document/title-block data shared by the A3 drawing set and the calculation report. Stored on the project case. */
export interface RevisionEntry {rev: string; date: string; description: string}
export interface TitleBlock {rev: string; date: string; designedBy: string; drawnBy: string; checkedBy: string; approvedBy: string; revisions: RevisionEntry[]}

const str = (v: unknown, max = 60) => typeof v === 'string' ? v.slice(0, max) : '';
export const today = () => new Date().toLocaleDateString('th-TH');
export function defaultTitleBlock(author = ''): TitleBlock {
  return {rev: 'A', date: today(), designedBy: author, drawnBy: author, checkedBy: '', approvedBy: '', revisions: [{rev: 'A', date: today(), description: 'ออกแบบครั้งแรก (ร่าง)'}]};
}
/** Accepts untrusted stored data; returns null when absent so callers can fall back to defaults. */
export function parseTitleBlock(raw: unknown): TitleBlock | null {
  if (!raw || typeof raw !== 'object') return null;
  const t = raw as Record<string, unknown>;
  return {rev: str(t.rev, 10) || 'A', date: str(t.date, 30), designedBy: str(t.designedBy), drawnBy: str(t.drawnBy), checkedBy: str(t.checkedBy), approvedBy: str(t.approvedBy),
    revisions: Array.isArray(t.revisions) ? t.revisions.slice(0, 12).flatMap(e => e && typeof e === 'object'
      ? [{rev: str((e as RevisionEntry).rev, 10), date: str((e as RevisionEntry).date, 30), description: str((e as RevisionEntry).description, 120)}] : []) : []};
}
