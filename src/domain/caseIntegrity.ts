import type {ElementType} from './workflowV07/common.js';

export type CaseIdentityIssueCode =
  | 'MISSING_ELEMENT_TYPE'
  | 'NAME_PREFIX_TYPE_MISMATCH'
  | 'STORED_DRAFT_TYPE_MISMATCH'
  | 'MISSING_PRACTICAL_INPUT'
  | 'DUPLICATE_CASE_ID'
  | 'DUPLICATE_CASE_NAME';

export interface CaseIdentityIssue {
  code: CaseIdentityIssueCode;
  message: string;
}

export interface CaseIdentityLike {
  id: string;
  name: string;
  workflowElementType?: ElementType;
  input?: {kind?: unknown};
  workflowV07?: {model?: {elementType?: unknown}};
  beam?: unknown;
  slab?: unknown;
  wall?: unknown;
}

export interface CaseIdentityAudit {
  byCase: Record<string, CaseIdentityIssue[]>;
  duplicateIds: string[];
  duplicateNames: string[];
}

const TYPES: readonly ElementType[] = ['FOOTING', 'COLUMN', 'WALL', 'BEAM', 'SLAB'];
const isElementType = (value: unknown): value is ElementType => typeof value === 'string' && TYPES.includes(value as ElementType);
const PREFIX_TYPES: Record<string, ElementType> = {F: 'FOOTING', C: 'COLUMN', W: 'WALL', B: 'BEAM', S: 'SLAB'};

export function suggestedElementTypeFromName(name: string): ElementType | undefined {
  const match = /^\s*([FCWBS])\s*\d+/i.exec(name);
  return match ? PREFIX_TYPES[match[1].toUpperCase()] : undefined;
}

/**
 * Finds data-integrity conflicts without changing the authored case. Practical beam/slab/wall
 * cases intentionally retain a legacy FOOTING input for compatibility, so input.kind is only
 * used as a fallback and is never treated as authoritative when workflowElementType is present.
 */
export function inspectCaseIdentity(value: CaseIdentityLike): CaseIdentityIssue[] {
  const issues: CaseIdentityIssue[] = [];
  const selected = value.workflowElementType ?? (isElementType(value.input?.kind) ? value.input.kind : undefined);
  if (!selected) issues.push({code: 'MISSING_ELEMENT_TYPE', message: 'ไม่พบประเภทองค์อาคารของ Design Case'});

  const suggested = suggestedElementTypeFromName(value.name);
  if (selected && suggested && suggested !== selected) {
    issues.push({code: 'NAME_PREFIX_TYPE_MISMATCH', message: `ชื่อ ${value.name} สื่อว่าเป็น ${suggested} แต่ Design Case เป็น ${selected} · ต้องยืนยันประเภทก่อนคำนวณ`});
  }

  const stored = value.workflowV07?.model?.elementType;
  if (selected && isElementType(stored) && stored !== selected) {
    issues.push({code: 'STORED_DRAFT_TYPE_MISMATCH', message: `ร่าง v0.7 เป็น ${stored} แต่ Design Case เป็น ${selected}`});
  }

  if (selected === 'BEAM' && value.beam === undefined) issues.push({code: 'MISSING_PRACTICAL_INPUT', message: 'ยังไม่มีข้อมูลคำนวณแบบหล่อคานที่บันทึกกับ Design Case'});
  if (selected === 'SLAB' && value.slab === undefined) issues.push({code: 'MISSING_PRACTICAL_INPUT', message: 'ยังไม่มีข้อมูลคำนวณแบบหล่อพื้นที่บันทึกกับ Design Case'});
  if (selected === 'WALL' && value.wall === undefined) issues.push({code: 'MISSING_PRACTICAL_INPUT', message: 'ยังไม่มีข้อมูลคำนวณแบบหล่อผนังที่บันทึกกับ Design Case'});
  return issues;
}

export function auditCaseIdentities(cases: readonly CaseIdentityLike[]): CaseIdentityAudit {
  const byCase: Record<string, CaseIdentityIssue[]> = {};
  const idCounts = new Map<string, number>(), nameCounts = new Map<string, number>();
  for (const c of cases) {
    idCounts.set(c.id, (idCounts.get(c.id) ?? 0) + 1);
    const name = c.name.trim().toLocaleLowerCase();
    nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1);
    byCase[c.id] = [...(byCase[c.id] ?? []), ...inspectCaseIdentity(c)];
  }
  const duplicateIds = [...idCounts.entries()].filter(([, count]) => count > 1).map(([id]) => id);
  const duplicateNames = [...nameCounts.entries()].filter(([, count]) => count > 1).map(([name]) => name);
  for (const c of cases) {
    const issues = byCase[c.id] ?? [];
    if (duplicateIds.includes(c.id)) issues.push({code: 'DUPLICATE_CASE_ID', message: `พบ case id ซ้ำ: ${c.id}`});
    if (duplicateNames.includes(c.name.trim().toLocaleLowerCase())) issues.push({code: 'DUPLICATE_CASE_NAME', message: `พบชื่อ Design Case ซ้ำ: ${c.name}`});
    byCase[c.id] = issues;
  }
  return {byCase, duplicateIds, duplicateNames};
}
