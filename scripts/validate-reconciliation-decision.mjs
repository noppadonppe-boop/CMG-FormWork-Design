import {readFile} from 'node:fs/promises';

const args = process.argv.slice(2);
const requireReady = args.includes('--ready');
const positional = args.filter(arg => arg !== '--ready');
const backupPath = positional[0] || 'F:/Downloads/CMG-002-project-backup.json';
const decisionPath = positional[1] || 'docs/CMG-002_RECONCILIATION_DECISION_TEMPLATE.json';
const backupRaw = JSON.parse(await readFile(backupPath, 'utf8'));
const project = backupRaw.project && typeof backupRaw.project === 'object' ? backupRaw.project : backupRaw;
const decision = JSON.parse(await readFile(decisionPath, 'utf8'));
if (decision.schemaVersion !== 'cmg-002-case-reconciliation-decision-1') throw Error('Invalid reconciliation decision schema');
if (String(decision.projectId) !== String(project.id)) throw Error(`Project mismatch: decision=${decision.projectId} backup=${project.id}`);
if (!Array.isArray(project.cases) || !Array.isArray(decision.decisions)) throw Error('Backup or decision cases are missing');
const cases = new Map(project.cases.map(item => [String(item.id), item]));
const seen = new Set();
const issues = [];
for (const row of decision.decisions) {
  const id = String(row.caseId);
  if (seen.has(id)) issues.push(`duplicate decision case id: ${id}`);
  seen.add(id);
  const current = cases.get(id);
  if (!current) {issues.push(`decision case id not found in backup: ${id}`); continue;}
  if (String(row.name) !== String(current.name)) issues.push(`name mismatch for ${id}`);
  if (row.decision !== null && !row.allowed?.includes(row.decision)) issues.push(`decision is not allowed for ${id}: ${row.decision}`);
}
for (const id of cases.keys()) if (!seen.has(id)) issues.push(`backup case has no decision row: ${id}`);
if (requireReady) {
  if (!decision.owner || typeof decision.owner !== 'string') issues.push('owner is required in --ready mode');
  if (decision.decisions.some(row => !row.decision)) issues.push('all case decisions are required in --ready mode');
  if (!decision.apply?.approvedBy || !decision.apply?.approvedAt || !decision.apply?.reason) issues.push('approvedBy, approvedAt and reason are required in --ready mode');
  if (!decision.apply?.newBackupBeforeWrite) issues.push('newBackupBeforeWrite is required in --ready mode');
}
if (issues.length) {
  console.error(JSON.stringify({status: 'FAIL', issues}, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({status: requireReady ? 'READY_FOR_OWNER_REVIEW' : 'VALID_TEMPLATE', projectId: project.id, caseCount: cases.size, decisionCount: decision.decisions.length, safeToAutoApply: false}, null, 2));
}
