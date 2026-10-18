import {readFile} from 'node:fs/promises';

const inputPath = process.argv[2];
if (!inputPath) {
  console.error('Usage: node scripts/audit-project-backup.mjs <project-backup.json>');
  process.exitCode = 2;
} else {
  const raw = JSON.parse(await readFile(inputPath, 'utf8'));
  const project = raw.project && typeof raw.project === 'object' ? raw.project : raw;
  const cases = Array.isArray(project.cases) ? project.cases : [];
  const typeByPrefix = {F: 'FOOTING', C: 'COLUMN', W: 'WALL', B: 'BEAM', S: 'SLAB'};
  const count = values => new Map(values.map(value => [value, (values.filter(candidate => candidate === value).length)]));
  const idCounts = count(cases.map(item => String(item?.id ?? '')));
  const nameCounts = count(cases.map(item => String(item?.name ?? '').trim().toLocaleLowerCase()));
  const suggestedType = name => typeByPrefix[String(name).trim().slice(0, 1).toUpperCase()] ?? null;
  const findings = cases.map((item, index) => {
    const name = String(item?.name ?? '').trim();
    const storedType = typeof item?.workflowElementType === 'string' ? item.workflowElementType : null;
    const proposal = suggestedType(name);
    const issues = [];
    if (idCounts.get(String(item?.id ?? '')) > 1) issues.push('DUPLICATE_CASE_ID');
    if (nameCounts.get(name.toLocaleLowerCase()) > 1) issues.push('DUPLICATE_CASE_NAME');
    if (!storedType) issues.push('MISSING_ELEMENT_TYPE');
    if (proposal && storedType && proposal !== storedType) issues.push('NAME_PREFIX_TYPE_MISMATCH');
    if (storedType && !item?.workflowV07 && ['BEAM', 'SLAB', 'WALL'].includes(storedType) && !item?.[storedType.toLowerCase()]) issues.push('MISSING_PRACTICAL_INPUT');
    return {index, id: item?.id ?? null, name, storedType, suggestedType: proposal, issues};
  });
  const duplicateIds = [...idCounts.entries()].filter(([, n]) => n > 1 && n > 0).map(([id]) => id);
  const duplicateNames = [...nameCounts.entries()].filter(([, n]) => n > 1 && n > 0).map(([name]) => name);
  console.log(JSON.stringify({
    schemaVersion: 'case-backup-audit-1',
    input: inputPath,
    project: {id: project.id ?? null, name: project.name ?? null, code: project.code ?? null},
    caseCount: cases.length,
    duplicateIds,
    duplicateNames,
    findings,
    safeToAutoApply: false,
    reason: 'Name prefixes are review suggestions only; do not delete or rewrite a draft/review relation without Owner approval and a retained backup.',
  }, null, 2));
}
