import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile} from 'node:fs/promises';

const execFileAsync = promisify(execFile);
const project = process.env.FIREBASE_PROJECT_ID || 'calculationeng';
const site = process.env.FIREBASE_HOSTING_SITE || 'rc-formwork';
const firebaseCommand = process.platform === 'win32' ? 'firebase.cmd' : 'firebase';

async function firebaseJson(args) {
  const commandArgs = ['--json', ...args];
  const command = process.platform === 'win32' ? (process.env.ComSpec || 'cmd.exe') : firebaseCommand;
  const invocation = process.platform === 'win32' ? ['/d', '/s', '/c', [firebaseCommand, ...commandArgs].join(' ')] : commandArgs;
  const {stdout} = await execFileAsync(command, invocation, {cwd: process.cwd(), maxBuffer: 8 * 1024 * 1024});
  return JSON.parse(stdout);
}

async function sha256(path) {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

async function sha256Text(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

async function auditDeployedRules() {
  try {
    // Reuse the authenticated Firebase CLI session without printing tokens.
    const auth = await import('firebase-tools/lib/auth.js');
    const requireAuth = await import('firebase-tools/lib/requireAuth.js');
    const rules = await import('firebase-tools/lib/gcp/rules.js');
    const account = auth.getGlobalDefaultAccount();
    if (!account) return {status: 'UNAVAILABLE_NO_CLI_ACCOUNT'};
    await requireAuth.requireAuth({...account, project});
    const releases = await rules.listAllReleases(project);
    const targets = {
      firestore: {name: `projects/${project}/releases/cloud.firestore`, file: 'firestore.rules'},
      storage: {name: `projects/${project}/releases/firebase.storage/${storageBucketName}`, file: 'storage.rules'},
    };
    const out = {};
    for (const [service, target] of Object.entries(targets)) {
      const release = releases.find(item => item.name === target.name);
      if (!release) {out[service] = {status: 'UNAVAILABLE_NO_RELEASE'}; continue;}
      const files = await rules.getRulesetContent(release.rulesetName);
      const file = files.find(item => item.name === target.file);
      const deployedSha256 = file?.content ? await sha256Text(file.content) : null;
      out[service] = {releaseName: release.name, rulesetName: release.rulesetName, updateTime: release.updateTime, deployedRulesSha256: deployedSha256, status: file ? 'FOUND' : 'UNAVAILABLE_NO_RULE_FILE'};
    }
    return out;
  } catch (error) {
    return {status: 'UNAVAILABLE', reason: error instanceof Error ? error.message : String(error)};
  }
}

const [hosting, functions, databases] = await Promise.all([
  firebaseJson(['hosting:channel:list', '--site', site, '--project', project]),
  firebaseJson(['functions:list', '--project', project]),
  firebaseJson(['firestore:databases:list', '--project', project]),
]);
const source = await readFile('functions/src/index.ts', 'utf8');
const sourceFunctions = [...source.matchAll(/export const (\w+)\s*=/g)].map(match => match[1]).sort();
const deployedFunctions = (functions.result ?? []).map(item => item.id).sort();
const extras = deployedFunctions.filter(name => !sourceFunctions.includes(name));
const missing = sourceFunctions.filter(name => !deployedFunctions.includes(name));
const live = hosting.result?.channels?.find(channel => channel.name.endsWith('/channels/live')) ?? null;
const deployedHashes = [...new Set((functions.result ?? []).map(item => item.hash).filter(Boolean))];
const storageBucket = (functions.result ?? []).map(item => item.environmentVariables?.FIREBASE_CONFIG).map(value => {
  try { return JSON.parse(value ?? '{}').storageBucket; } catch { return null; }
}).find(Boolean) ?? null;
const storageBucketName = storageBucket || `${project}.firebasestorage.app`;
const deployedRules = await auditDeployedRules();
const firestoreRulesSha256 = await sha256('firestore.rules');
const storageRulesSha256 = await sha256('storage.rules');

const report = {
  schemaVersion: 'firebase-release-audit-1',
  project,
  hosting: live ? {
    url: live.url,
    releaseName: live.release?.name ?? null,
    versionName: live.release?.version?.name ?? null,
    versionStatus: live.release?.version?.status ?? null,
    releaseTime: live.release?.releaseTime ?? null,
    fileCount: live.release?.version?.fileCount ?? null,
  } : null,
  functions: {
    sourceExports: sourceFunctions,
    deployed: deployedFunctions,
    sourceOnly: missing,
    deployedOnly: extras,
    deployedHashes,
    runtime: [...new Set((functions.result ?? []).map(item => item.runtime).filter(Boolean))],
    status: missing.length || extras.length ? 'MISMATCH' : 'MATCHED_NAMES',
  },
  firestore: {
    databases: (databases.result ?? []).map(item => item.name ?? item.databaseId ?? item),
    localRulesSha256: firestoreRulesSha256,
    deployed: deployedRules.firestore ?? null,
    rulesHashMatch: deployedRules.firestore?.deployedRulesSha256 === firestoreRulesSha256,
  },
  storage: {
    configuredBucketObservedFromFunctions: storageBucketName,
    localRulesSha256: storageRulesSha256,
    deployed: deployedRules.storage ?? null,
    rulesHashMatch: deployedRules.storage?.deployedRulesSha256 === storageRulesSha256,
  },
  status: live && !missing.length && !extras.length && deployedRules.firestore?.deployedRulesSha256 === firestoreRulesSha256 && deployedRules.storage?.deployedRulesSha256 === storageRulesSha256 ? 'PASS' : 'RELEASE_RECONCILIATION_REQUIRED',
  note: 'This audit is read-only. It does not deploy, change rules, or alter data. A source/deployed function mismatch requires a reviewed release before production use.',
};
console.log(JSON.stringify(report, null, 2));
if (report.status === 'RELEASE_RECONCILIATION_REQUIRED') process.exitCode = 1;
