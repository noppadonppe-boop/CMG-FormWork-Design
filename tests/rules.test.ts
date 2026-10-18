import {afterAll, beforeAll, beforeEach, describe, expect, it} from 'vitest';
import {assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment} from '@firebase/rules-unit-testing';
import {readFileSync} from 'node:fs';
import {collection, deleteDoc, deleteField, doc, getDoc, getDocs, runTransaction, serverTimestamp, setDoc, Timestamp, updateDoc, writeBatch} from 'firebase/firestore';
import {deleteObject, getBytes, listAll, ref, updateMetadata, uploadBytes, type StorageReference} from 'firebase/storage';

let env: RulesTestEnvironment;
const root = 'RC-FormWork-App/root';
const metaPath = `${root}/appMeta/config`;
const aiSettingsPath = `${root}/settings/ai`;
const seedTime = Timestamp.fromMillis(1_700_000_000_000);
const seededUpload = `${root}/uploads/00000000-0000-4000-8000-000000000001`;
const newUpload = `${root}/uploads/00000000-0000-4000-8000-000000000002`;
const categories = ['overview', 'upload', 'geometry', 'criteria', 'layout', 'results', 'drawings', 'report'];
const adminIds = ['master', 'super', 'admin'];
const profilePath = (id: string) => `${root}/users/${id}@example.com`;
const projectPath = (id: string) => `${root}/projects/${id}`;
const context = (id: string, email = `${id}@example.com`) => env.authenticatedContext(id, {email});
const profile = (id: string, patch: Record<string, unknown> = {}) => ({
  uid: id, email: `${id}@example.com`, firstName: 'Test', lastName: 'User', position: '', department: 'Other',
  role: ['Staff'], status: 'approved', assignedProjects: ['p1'], createdAt: seedTime, isFirstUser: false, ...patch,
});
const project = (id: string) => ({id, projectId: id, name: `Project ${id}`, code: id, cases: [], updatedBy: 'admin', updatedAt: seedTime});
const aiSettings = (uid = 'master', patch: Record<string, unknown> = {}) => ({
  activeProvider: 'openai',
  providers: {
    openai: {model: 'gpt-4.1', apiKey: 'sk-test-key-12345678'},
    google: {model: 'gemini-2.5-flash'},
    anthropic: {model: 'claude-sonnet-4-5'},
  },
  updatedBy: uid,
  updatedAt: serverTimestamp(),
  ...patch,
});
const uploadMetadata = (projectId = 'p1', contentType = 'image/png') => ({contentType, customMetadata: {projectId, caseId: 'F01'}});
const newProfile = (first = false, patch: Record<string, unknown> = {}) => profile('new', {
  role: first ? ['MasterAdmin'] : ['Staff'], status: first ? 'approved' : 'pending', assignedProjects: [],
  createdAt: serverTimestamp(), isFirstUser: first, ...patch,
});

function emulatorAddress(name: string, defaultPort: number) {
  const address = process.env[name] ?? `127.0.0.1:${defaultPort}`;
  const match = /^(127\.0\.0\.1|localhost):(\d+)$/.exec(address);
  if (!match || Number(match[2]) < 1 || Number(match[2]) > 65535) throw new Error(`Refusing nonlocal or invalid ${name}`);
  return {host: match[1], port: Number(match[2])};
}

// Loopback hosts and a demo project keep all Rules SDK operations local.
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-cmg-formwork',
    firestore: {...emulatorAddress('FIRESTORE_EMULATOR_HOST', 8080), rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8')},
    storage: {...emulatorAddress('FIREBASE_STORAGE_EMULATOR_HOST', 9199), rules: readFileSync(new URL('../storage.rules', import.meta.url), 'utf8')},
  });
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async admin => {
    // clearStorage() only removes bucket-root items in the installed test SDK.
    // Recurse through prefixes so nested uploads cannot leak between tests.
    async function clearPrefix(prefix: StorageReference): Promise<void> {
      const contents = await listAll(prefix);
      await Promise.all(contents.items.map(item => deleteObject(item)));
      await Promise.all(contents.prefixes.map(child => clearPrefix(child)));
    }
    await clearPrefix(ref(admin.storage()));
    const db = admin.firestore();
    const batch = writeBatch(db);
    batch.set(doc(db, root), {app: 'RC-FormWork-App', schemaVersion: 2, updatedAt: seedTime});
    batch.set(doc(db, metaPath), {firstUserRegistered: true, totalUsers: 8, createdAt: seedTime});
    const profiles = [
      profile('staff'), profile('engineer', {role: ['Engineer']}),
      profile('master', {role: ['MasterAdmin'], assignedProjects: [], isFirstUser: true}),
      profile('super', {role: ['SuperAdmin'], assignedProjects: []}), profile('admin', {role: ['Admin'], assignedProjects: []}),
      // Approval must still be required when a pending/rejected profile has admin-looking privileges.
      profile('pending', {status: 'pending', role: ['MasterAdmin'], assignedProjects: ['p1', 'p2']}),
      profile('rejected', {status: 'rejected', role: ['Admin'], assignedProjects: ['p1', 'p2']}),
      profile('impostor', {uid: 'another-auth-uid', role: ['MasterAdmin'], assignedProjects: ['p1', 'p2']}),
    ];
    profiles.forEach(value => batch.set(doc(db, `${root}/users/${value.email}`), value));
    for (const id of ['p1', 'p2']) {
      batch.set(doc(db, projectPath(id)), project(id));
      for (const category of categories) batch.set(doc(db, `${root}/${category}/${id}__F01`), {projectId: id, caseId: 'F01', width: 3000});
    }
    batch.set(doc(db, `${root}/results/server-result`), {projectId: 'p1', caseId: 'F01', authority: 'SERVER_RECOMPUTED', hash: 'trusted-hash', constructionEligible: false, result: {ok: true}});
    await batch.commit();
    await uploadBytes(ref(admin.storage(), seededUpload), new Uint8Array([1, 2]), uploadMetadata());
  });
});

afterAll(async () => {if (env) await env.cleanup();});

async function registration(options: {first?: boolean; profilePatch?: Record<string, unknown>; metaPatch?: Record<string, unknown>; target?: string; omitMeta?: boolean} = {}) {
  const db = context('new', 'New@Example.com').firestore();
  const batch = writeBatch(db);
  batch.set(doc(db, options.target ?? profilePath('new')), newProfile(options.first, options.profilePatch));
  if (!options.omitMeta) batch.set(doc(db, metaPath), {firstUserRegistered: true, totalUsers: options.first ? 1 : 9, createdAt: seedTime, ...options.metaPatch});
  return batch.commit();
}

describe('Approval and identity gates', () => {
  it.each(['unauthenticated', 'anonymous', 'unprofiled', 'pending', 'rejected', 'impostor'])('%s cannot access shared data or Storage', async id => {
    const actor = id === 'unauthenticated' ? env.unauthenticatedContext() : id === 'anonymous' ? env.authenticatedContext('anonymous') : context(id);
    const db = actor.firestore();
    await assertFails(getDoc(doc(db, root)));
    await assertFails(setDoc(doc(db, root), {app: 'RC-FormWork-App', schemaVersion: 2, updatedAt: serverTimestamp()}));
    await assertFails(getDoc(doc(db, projectPath('p1'))));
    await assertFails(updateDoc(doc(db, projectPath('p1')), {name: 'Unauthorized'}));
    await assertFails(getDocs(collection(db, `${root}/projects`)));
    await assertFails(getDoc(doc(db, `${root}/geometry/p1__F01`)));
    await assertFails(setDoc(doc(db, `${root}/geometry/new`), {projectId: 'p1'}));
    await assertFails(getBytes(ref(actor.storage(), seededUpload)));
    await assertFails(uploadBytes(ref(actor.storage(), newUpload), new Uint8Array([1]), uploadMetadata()));
  });

  it('matches the lowercase email profile to the same auth UID', async () => {
    await assertSucceeds(getDoc(doc(context('staff', 'Staff@Example.com').firestore(), projectPath('p1'))));
    await assertSucceeds(getBytes(ref(context('staff', 'Staff@Example.com').storage(), seededUpload)));
    await assertFails(getDoc(doc(context('someone-else', 'staff@example.com').firestore(), projectPath('p1'))));
    await assertFails(getBytes(ref(context('someone-else', 'staff@example.com').storage(), seededUpload)));
  });

  it('admits Google sessions without an email claim through their lowercased-UID profile only', async () => {
    // Production case: Google accounts whose Auth record has no email. The client keys their profile by the lowercased UID.
    const uid = 'GoogleUid0123ABCdef', key = uid.toLowerCase();
    await env.withSecurityRulesDisabled(async admin => {await setDoc(doc(admin.firestore(), `${root}/users/${key}`), profile(uid, {email: key, role: ['MasterAdmin'], assignedProjects: []}));});
    const google = (id: string, provider = 'google.com') => env.authenticatedContext(id, {firebase: {sign_in_provider: provider}});
    await assertSucceeds(getDoc(doc(google(uid).firestore(), `${root}/users/${key}`)));
    await assertSucceeds(getDoc(doc(google(uid).firestore(), projectPath('p1'))));
    await assertSucceeds(getDocs(collection(google(uid).firestore(), `${root}/projects`)));
    await assertSucceeds(getBytes(ref(google(uid).storage(), seededUpload)));
    await assertSucceeds(setDoc(doc(google(uid).firestore(), `${root}/activityLogs/login-1`), {uid, email: key, action: 'LOGIN', createdAt: serverTimestamp(), details: {}}));
    // Another UID differing only in case, an anonymous session with the same UID, and an email session for another account are refused.
    await assertFails(getDoc(doc(google(key).firestore(), projectPath('p1'))));
    await assertFails(getDoc(doc(google(uid, 'anonymous').firestore(), projectPath('p1'))));
    await assertFails(getBytes(ref(google(uid, 'anonymous').storage(), seededUpload)));
    await assertFails(getDoc(doc(env.authenticatedContext(uid, {email: 'other@example.com'}).firestore(), projectPath('p1'))));
  });

  it('denies paths outside the application and nested documents', async () => {
    const db = context('master').firestore();
    for (const path of ['other/root', `${root}/unknown/doc`, `${root}/projects/p1/private/secret`]) {
      await assertFails(getDoc(doc(db, path)));
      await assertFails(setDoc(doc(db, path), {projectId: 'p1'}));
    }
  });
});

describe('Project scope and client saves', () => {
  it.each(['staff', 'engineer'])('approved %s can update assigned projects but cannot list or access others', async id => {
    // Even assignment to a not-yet-created project does not grant creation rights.
    await env.withSecurityRulesDisabled(async admin => {await updateDoc(doc(admin.firestore(), profilePath(id)), {assignedProjects: ['p1', 'p3']});});
    const db = context(id).firestore();
    await assertSucceeds(getDoc(doc(db, projectPath('p1'))));
    await assertSucceeds(setDoc(doc(db, projectPath('p1')), {...project('p1'), name: 'Saved draft', updatedBy: id, updatedAt: serverTimestamp()}, {merge: true}));
    await assertFails(getDoc(doc(db, projectPath('p2'))));
    await assertFails(updateDoc(doc(db, projectPath('p2')), {name: 'Outside assignment'}));
    await assertFails(getDocs(collection(db, `${root}/projects`)));
    await assertFails(setDoc(doc(db, projectPath('p3')), project('p3')));
    await assertFails(deleteDoc(doc(db, projectPath('p1'))));
  });

  it.each(adminIds)('approved %s can list, create, update and delete projects', async id => {
    const db = context(id).firestore();
    await assertSucceeds(getDocs(collection(db, `${root}/projects`)));
    await assertSucceeds(getDoc(doc(db, projectPath('p2'))));
    await assertSucceeds(setDoc(doc(db, projectPath('p3')), project('p3')));
    await assertSucceeds(updateDoc(doc(db, projectPath('p2')), {name: 'Admin update'}));
    await assertSucceeds(deleteDoc(doc(db, projectPath('p3'))));
  });

  it('enforces explicit view versus edit project permissions while preserving the legacy assignment fallback', async () => {
    await assertSucceeds(updateDoc(doc(context('admin').firestore(), profilePath('staff')), {assignedProjects: [], projectPermissions: {p1: ['view']}}));
    const staffDb = context('staff').firestore();
    await assertSucceeds(getDoc(doc(staffDb, projectPath('p1'))));
    await assertFails(updateDoc(doc(staffDb, projectPath('p1')), {name: 'View only'}));
    await assertFails(uploadBytes(ref(context('staff').storage(), newUpload), new Uint8Array([1]), uploadMetadata('p1')));

    await assertSucceeds(updateDoc(doc(context('admin').firestore(), profilePath('staff')), {assignedProjects: ['p1'], projectPermissions: {p1: ['view', 'edit']}}));
    await assertSucceeds(updateDoc(doc(staffDb, projectPath('p1')), {name: 'Editable again'}));
  });

  it('scopes Workflow v0.7 drafts to project edit/view permissions and rejects authority or oversized fields', async () => {
    const draft = (projectId: string, caseId: string, uid: string, patch: Record<string, unknown> = {}) => ({projectId, caseId, schemaVersion: 'workflow-draft-1', engineVersion: '0.7.0-test',
      savedAtMs: 1700000000000, sourceInputHash: '{}', modelJson: '{"schemaVersion":"0.7.0"}', updatedBy: uid, updatedAt: serverTimestamp(), ...patch});
    const path = (projectId: string, caseId: string) => `${root}/projects/${projectId}/workflow/${caseId}`;
    const staffDb = context('staff').firestore(), engineerDb = context('engineer').firestore();
    await assertSucceeds(setDoc(doc(staffDb, path('p1', 'c1')), draft('p1', 'c1', 'staff')));
    await assertSucceeds(getDoc(doc(staffDb, path('p1', 'c1'))));
    await assertSucceeds(getDocs(collection(staffDb, `${root}/projects/p1/workflow`)));
    await assertFails(setDoc(doc(staffDb, path('p2', 'c1')), draft('p2', 'c1', 'staff')));
    await assertFails(getDocs(collection(staffDb, `${root}/projects/p2/workflow`)));
    for (const patch of [{projectId: 'p2'}, {caseId: 'other'}, {updatedBy: 'admin'}, {updatedAt: seedTime}, {constructionEligible: true}, {schemaVersion: 'workflow-draft-9'}, {modelJson: 42}]) {
      await assertFails(setDoc(doc(staffDb, path('p1', 'c1')), draft('p1', 'c1', 'staff', patch)));
    }
    await assertFails(setDoc(doc(staffDb, path('p1', 'c1')), draft('p1', 'c1', 'staff', {modelJson: 'x'.repeat(900001)})));
    // View-only permission reads but cannot write or delete.
    await assertSucceeds(updateDoc(doc(context('admin').firestore(), profilePath('engineer')), {assignedProjects: [], projectPermissions: {p1: ['view']}}));
    await assertSucceeds(getDoc(doc(engineerDb, path('p1', 'c1'))));
    await assertFails(setDoc(doc(engineerDb, path('p1', 'c2')), draft('p1', 'c2', 'engineer')));
    await assertFails(deleteDoc(doc(engineerDb, path('p1', 'c1'))));
    await assertSucceeds(deleteDoc(doc(staffDb, path('p1', 'c1'))));
  });

  it('lets approved engineers and admins write registry items while staff only read; forged identity, status and ids are rejected', async () => {
    const item = (type: string, id: string, uid: string, patch: Record<string, unknown> = {}) => ({type, id, status: 'DRAFT', itemJson: '{}', updatedBy: uid, updatedAt: serverTimestamp(), ...patch});
    const path = (type: string, id: string) => `${root}/registry/${type}__${id}`;
    const engineerDb = context('engineer').firestore(), staffDb = context('staff').firestore(), adminDb = context('admin').firestore();
    await assertSucceeds(setDoc(doc(engineerDb, path('entry', 'RHS-1')), item('entry', 'RHS-1', 'engineer')));
    await assertSucceeds(setDoc(doc(engineerDb, path('method', 'M-1')), item('method', 'M-1', 'engineer', {status: 'REVIEWED'})));
    await assertSucceeds(getDocs(collection(staffDb, `${root}/registry`)));
    await assertFails(setDoc(doc(staffDb, path('entry', 'RHS-2')), item('entry', 'RHS-2', 'staff')));
    for (const patch of [{updatedBy: 'admin'}, {updatedAt: seedTime}, {status: 'APPROVED'}, {type: 'other'}, {constructionEligible: true}, {itemJson: 5}]) {
      await assertFails(setDoc(doc(engineerDb, path('entry', 'RHS-1')), item('entry', 'RHS-1', 'engineer', patch)));
    }
    await assertFails(setDoc(doc(engineerDb, path('entry', 'RHS-1')), item('entry', 'DIFFERENT', 'engineer')));
    await assertFails(deleteDoc(doc(engineerDb, path('entry', 'RHS-1'))));
    await assertSucceeds(deleteDoc(doc(adminDb, path('entry', 'RHS-1'))));
  });

  it('enforces review transitions server-side: roles, reviewer independence, bound hash and MasterAdmin-only issue', async () => {
    const path = `${root}/projects/p1/review/c1`;
    const rec = (state: string, uid: string, patch: Record<string, unknown> = {}) => ({projectId: 'p1', caseId: 'c1', state, contentHash: state === 'DRAFT' ? '' : 'h1', engineVersion: state === 'DRAFT' ? '' : 'e1',
      submittedBy: state === 'DRAFT' ? '' : 'engineer', recordJson: '{}', updatedBy: uid, updatedAt: serverTimestamp(), ...patch});
    const engineerDb = context('engineer').firestore(), adminDb = context('admin').firestore(), masterDb = context('master').firestore(), staffDb = context('staff').firestore();
    await env.withSecurityRulesDisabled(async a => {await updateDoc(doc(a.firestore(), profilePath('engineer')), {assignedProjects: ['p1']});});
    await assertFails(setDoc(doc(staffDb, path), rec('SUBMITTED', 'staff', {submittedBy: 'staff'})));
    await assertFails(setDoc(doc(engineerDb, path), rec('SUBMITTED', 'engineer', {submittedBy: 'admin'}))); // submitter must be the writer
    await assertFails(setDoc(doc(engineerDb, path), rec('REVIEWED', 'engineer'))); // cannot skip SUBMITTED
    await assertSucceeds(setDoc(doc(engineerDb, path), rec('SUBMITTED', 'engineer')));
    await assertFails(setDoc(doc(engineerDb, path), rec('REVIEWED', 'engineer'))); // engineer is not a reviewer
    await assertFails(setDoc(doc(adminDb, path), rec('REVIEWED', 'admin', {contentHash: 'h2'}))); // hash cannot change inside a cycle
    await assertFails(setDoc(doc(adminDb, path), rec('REVIEWED', 'admin', {submittedBy: 'admin'}))); // cannot rewrite the submitter
    await assertSucceeds(setDoc(doc(adminDb, path), rec('REVIEWED', 'admin')));
    await assertFails(setDoc(doc(adminDb, path), rec('ISSUED_INTERNAL', 'admin'))); // cannot skip approval
    await assertSucceeds(setDoc(doc(adminDb, path), rec('APPROVED_INTERNAL', 'admin')));
    await assertFails(setDoc(doc(adminDb, path), rec('ISSUED_INTERNAL', 'admin'))); // issue is MasterAdmin only
    await assertSucceeds(setDoc(doc(masterDb, path), rec('ISSUED_INTERNAL', 'master')));
    await assertFails(setDoc(doc(staffDb, path), rec('DRAFT', 'staff')));
    await assertSucceeds(setDoc(doc(engineerDb, path), rec('DRAFT', 'engineer'))); // explicit revise/return
    await assertFails(setDoc(doc(engineerDb, path), rec('DRAFT', 'engineer', {constructionEligible: true})));
    // A submitter who is also an admin still cannot review their own submission.
    await assertSucceeds(setDoc(doc(adminDb, path), rec('SUBMITTED', 'admin', {submittedBy: 'admin'})));
    await assertFails(setDoc(doc(adminDb, path), rec('REVIEWED', 'admin', {submittedBy: 'admin'})));
    await assertSucceeds(setDoc(doc(masterDb, path), rec('REVIEWED', 'master', {submittedBy: 'admin'})));
  });

  it('requires project identity to match its path on creation and update', async () => {
    const db = context('admin').firestore();
    for (const patch of [{id: 'different'}, {projectId: 'different'}, {id: deleteField()}, {projectId: deleteField()}]) await assertFails(updateDoc(doc(db, projectPath('p1')), patch));
    await assertFails(setDoc(doc(db, projectPath('p3')), project('p1')));
    await assertFails(setDoc(doc(db, projectPath('p3')), {id: 'p3', name: 'Missing projectId'}));
  });

  it('permits the exact client root save and rejects deletion or extra root fields', async () => {
    const db = context('staff').firestore();
    await assertSucceeds(setDoc(doc(db, root), {app: 'RC-FormWork-App', schemaVersion: 2, updatedAt: serverTimestamp()}, {merge: true}));
    await assertSucceeds(getDoc(doc(db, root)));
    await assertFails(setDoc(doc(db, root), {app: 'RC-FormWork-App', schemaVersion: 2, updatedAt: serverTimestamp(), unrestricted: true}));
    await assertFails(updateDoc(doc(db, root), {app: 'Other'}));
    await assertFails(updateDoc(doc(db, root), {schemaVersion: 99}));
    await assertFails(updateDoc(doc(db, root), {updatedAt: seedTime}));
    await assertFails(deleteDoc(doc(context('master').firestore(), root)));
  });

  it.each(categories)('scopes %s snapshots on read, create, update and reparenting', async category => {
    const db = context('staff').firestore();
    const existing = doc(db, `${root}/${category}/p1__F01`);
    await assertSucceeds(getDoc(existing));
    await assertSucceeds(updateDoc(existing, {width: 3200}));
    await assertSucceeds(setDoc(doc(db, `${root}/${category}/p1__F02`), {projectId: 'p1', caseId: 'F02', width: 2800}));
    await assertFails(getDoc(doc(db, `${root}/${category}/p2__F01`)));
    await assertFails(getDocs(collection(db, `${root}/${category}`)));
    await assertFails(setDoc(doc(db, `${root}/${category}/unauthorized`), {projectId: 'p2'}));
    await assertFails(setDoc(doc(db, `${root}/${category}/unscoped`), {width: 1000}));
    await assertFails(updateDoc(existing, {projectId: 'p2'}));
    await assertFails(updateDoc(doc(context('admin').firestore(), existing.path), {projectId: 'p2'}));
    if (category === 'upload') {
      await assertSucceeds(deleteDoc(existing));
      const adminUpload = doc(context('admin').firestore(), `${root}/upload/p1__admin-delete`);
      await assertSucceeds(setDoc(adminUpload, {projectId: 'p1', caseId: 'F01', width: 3000}));
      await assertSucceeds(deleteDoc(adminUpload));
    } else {
      await assertFails(deleteDoc(existing));
      await assertFails(deleteDoc(doc(context('admin').firestore(), existing.path)));
    }
  });

  it.each(['staff', 'admin'])('%s cannot forge or alter server-authoritative calculation records', async id => {
    const db = context(id).firestore();
    for (const category of ['results', 'geometry']) {
      for (const marker of [{authority: 'SERVER_RECOMPUTED'}, {hash: 'forged'}, {constructionEligible: true}]) await assertFails(setDoc(doc(db, `${root}/${category}/forged`), {projectId: 'p1', ...marker}));
    }
    const trusted = doc(db, `${root}/results/server-result`);
    await assertSucceeds(getDoc(trusted));
    await assertFails(updateDoc(trusted, {result: {ok: false}}));
    await assertFails(updateDoc(trusted, {authority: deleteField(), hash: deleteField(), constructionEligible: deleteField()}));
    await assertFails(setDoc(trusted, {projectId: 'p1', result: {ok: false}}));
    await assertFails(deleteDoc(trusted));
  });
});

describe('Atomic registration and first-user initialization', () => {
  it('supports the first-user transaction, including missing own profile and legacy reads', async () => {
    await env.clearFirestore();
    const db = context('new', 'New@Example.com').firestore();
    await assertSucceeds(runTransaction(db, async transaction => {
      expect((await transaction.get(doc(db, profilePath('new')))).exists()).toBe(false);
      expect((await transaction.get(doc(db, `${root}/users/new`))).exists()).toBe(false);
      expect((await transaction.get(doc(db, metaPath))).exists()).toBe(false);
      transaction.set(doc(db, profilePath('new')), newProfile(true));
      transaction.set(doc(db, metaPath), {firstUserRegistered: true, totalUsers: 1, createdAt: serverTimestamp()});
    }));
    expect((await getDoc(doc(db, profilePath('new')))).data()).toMatchObject({role: ['MasterAdmin'], status: 'approved', isFirstUser: true, assignedProjects: []});
    await assertSucceeds(setDoc(doc(db, root), {app: 'RC-FormWork-App', schemaVersion: 2, updatedAt: serverTimestamp()}, {merge: true}));
    await assertSucceeds(setDoc(doc(db, projectPath('p1')), project('p1')));
  });

  it('supports explicit pristine metadata without rewriting its creation time', async () => {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async admin => {await setDoc(doc(admin.firestore(), metaPath), {firstUserRegistered: false, totalUsers: 0, createdAt: seedTime});});
    await assertSucceeds(registration({first: true}));
  });

  it('rejects malformed first-user privileges, timestamps and metadata on an empty application', async () => {
    await env.clearFirestore();
    for (const patch of [{assignedProjects: ['p1']}, {role: ['MasterAdmin', 'Admin']}, {status: 'pending'}, {isFirstUser: false}, {createdAt: seedTime}, {extraPrivilege: true}]) {
      await assertFails(registration({first: true, profilePatch: patch, metaPatch: {createdAt: serverTimestamp()}}));
    }
    await assertFails(registration({first: true, metaPatch: {createdAt: serverTimestamp(), totalUsers: 2}}));
    await assertFails(registration({first: true, metaPatch: {createdAt: serverTimestamp(), unrestricted: true}}));
    await assertFails(registration({first: true})); // Missing metadata requires a fresh server creation timestamp.
  });

  it('registers later users atomically as pending Staff with no projects', async () => {
    await assertSucceeds(registration());
    const db = context('new').firestore();
    expect((await getDoc(doc(db, profilePath('new')))).data()).toMatchObject({role: ['Staff'], status: 'pending', assignedProjects: [], isFirstUser: false});
    expect((await getDoc(doc(db, metaPath))).data()?.totalUsers).toBe(9);
    await assertFails(getDoc(doc(db, projectPath('p1'))));
  });

  it.each([
    ['self-approval', {status: 'approved'}], ['administrator role', {role: ['Admin']}], ['extra role', {role: ['Staff', 'MasterAdmin']}],
    ['preassigned project', {assignedProjects: ['p1']}], ['forged UID', {uid: 'someone-else'}], ['noncanonical email', {email: 'New@Example.com'}],
    ['forged email', {email: 'victim@example.com'}], ['client timestamp', {createdAt: seedTime}], ['unknown field', {privileged: true}],
  ] as const)('rejects later registration with %s', async (_name, patch) => {await assertFails(registration({profilePatch: patch}));});

  it('requires the canonical profile path and the paired counter write', async () => {
    await assertFails(registration({target: `${root}/users/New@Example.com`}));
    await assertFails(registration({target: `${root}/users/victim@example.com`}));
    await assertFails(registration({target: `${root}/users/new`}));
    await assertFails(registration({omitMeta: true}));
    await env.clearFirestore();
    await assertFails(registration({first: true, omitMeta: true}));
    await assertFails(setDoc(doc(context('new').firestore(), metaPath), {firstUserRegistered: true, totalUsers: 1, createdAt: serverTimestamp()}));
  });

  it('does not elect another first administrator when the counter is one', async () => {
    await env.withSecurityRulesDisabled(async admin => {await updateDoc(doc(admin.firestore(), metaPath), {totalUsers: 1});});
    await assertFails(registration({first: true}));
    await assertFails(registration({first: true, omitMeta: true}));
    await assertFails(registration({first: true, metaPatch: {totalUsers: 2}}));
  });

  it('allows only one first-user claimant to commit', async () => {
    await env.clearFirestore();
    const claim = (id: string) => {
      const db = context(id).firestore();
      const batch = writeBatch(db);
      batch.set(doc(db, profilePath(id)), {...newProfile(true), uid: id, email: `${id}@example.com`});
      batch.set(doc(db, metaPath), {firstUserRegistered: true, totalUsers: 1, createdAt: serverTimestamp()});
      return batch.commit();
    };
    const claims = await Promise.allSettled([claim('first-a'), claim('first-b')]);
    expect(claims.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(claims.filter(result => result.status === 'rejected')).toHaveLength(1);
  });

  it('rejects counter-only increments, repeats, decrements, resets and arbitrary admin changes', async () => {
    const db = context('new').firestore();
    await assertFails(updateDoc(doc(db, metaPath), {totalUsers: 9}));
    for (const patch of [{totalUsers: 8}, {totalUsers: 7}, {totalUsers: 0, firstUserRegistered: false}, {totalUsers: 99}, {createdAt: serverTimestamp()}, {extra: true}]) await assertFails(updateDoc(doc(context('admin').firestore(), metaPath), patch));
    await assertFails(deleteDoc(doc(context('master').firestore(), metaPath)));
    await assertSucceeds(registration());
    await assertFails(updateDoc(doc(db, metaPath), {totalUsers: 10}));
    await assertFails(registration({metaPatch: {totalUsers: 10}}));
  });

  it.each([{firstUserRegistered: true, totalUsers: 0}, {firstUserRegistered: false, totalUsers: 1}])('does not bootstrap from inconsistent metadata %j', async value => {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async admin => {await setDoc(doc(admin.firestore(), metaPath), {...value, createdAt: seedTime});});
    await assertFails(registration({first: true}));
  });
});

describe('Profile lifecycle and administrator management', () => {
  it.each(['staff', 'pending', 'rejected'])('%s can read and edit personal details but cannot grant privileges', async id => {
    const db = context(id).firestore();
    const own = doc(db, profilePath(id));
    await assertSucceeds(getDoc(own));
    await assertSucceeds(updateDoc(own, {firstName: 'Updated', lastName: 'Name', position: 'Designer', department: 'Engineering', photoURL: 'https://example.com/avatar.png'}));
    for (const patch of [{role: ['SuperAdmin']}, {status: id === 'staff' ? 'rejected' : 'approved'}, {assignedProjects: ['p3']}, {uid: 'other'}, {email: 'other@example.com'}, {isFirstUser: true}, {createdAt: serverTimestamp()}]) await assertFails(updateDoc(own, patch));
    await assertFails(getDoc(doc(db, profilePath('engineer'))));
    await assertFails(getDocs(collection(db, `${root}/users`)));
    await assertFails(deleteDoc(own));
  });

  it.each(adminIds)('%s can manage users but cannot rewrite identity or registration history', async id => {
    const db = context(id).firestore();
    const target = doc(db, profilePath('staff'));
    await assertSucceeds(getDocs(collection(db, `${root}/users`)));
    await assertSucceeds(updateDoc(target, {firstName: 'Managed', lastName: 'User', position: 'Engineer', department: 'Engineering', role: ['Engineer', 'Staff'], status: 'approved', assignedProjects: ['p1', 'p2']}));
    for (const patch of [{uid: 'other'}, {email: 'other@example.com'}, {isFirstUser: true}, {createdAt: serverTimestamp()}, {photoURL: 'https://example.com/admin-set.png'}, {role: ['Unknown']}, {status: 'active'}]) await assertFails(updateDoc(target, patch));
    await assertFails(deleteDoc(target));
  });

  it('migrates the own UID-keyed legacy profile preserving optional and unknown fields', async () => {
    const legacy: Record<string, unknown> = profile('legacy', {email: 'legacy', role: ['Engineer'], legacyNote: 'preserved'});
    delete legacy.department;
    await env.withSecurityRulesDisabled(async admin => {await setDoc(doc(admin.firestore(), `${root}/users/legacy`), legacy);});
    const db = context('legacy', 'Legacy@Example.com').firestore();
    await assertSucceeds(runTransaction(db, async transaction => {
      await transaction.get(doc(db, profilePath('legacy')));
      const old = await transaction.get(doc(db, `${root}/users/legacy`));
      transaction.set(doc(db, profilePath('legacy')), {...old.data(), email: 'legacy@example.com', photoURL: 'https://example.com/new-photo.png'});
    }));
    expect((await getDoc(doc(db, profilePath('legacy')))).data()).toMatchObject({uid: 'legacy', role: ['Engineer'], assignedProjects: ['p1'], legacyNote: 'preserved', createdAt: seedTime});
    expect((await getDoc(doc(db, metaPath))).data()?.totalUsers).toBe(8);
    await assertSucceeds(getDoc(doc(db, projectPath('p1'))));
    const ownProfile = doc(db, profilePath('legacy'));
    const managedProfile = doc(context('admin').firestore(), profilePath('legacy'));
    await assertSucceeds(updateDoc(ownProfile, {firstName: 'Updated legacy name', photoURL: 'https://example.com/updated-photo.png'}));
    await assertSucceeds(updateDoc(managedProfile, {status: 'rejected', role: ['Staff'], assignedProjects: ['p2']}));
    expect((await getDoc(ownProfile)).data()).toMatchObject({
      uid: 'legacy', email: 'legacy@example.com', firstName: 'Updated legacy name', photoURL: 'https://example.com/updated-photo.png',
      status: 'rejected', role: ['Staff'], assignedProjects: ['p2'], legacyNote: 'preserved', createdAt: seedTime,
    });
    for (const target of [ownProfile, managedProfile]) {
      for (const patch of [{legacyNote: 'changed'}, {legacyNote: deleteField()}, {uid: 'other'}, {email: 'other@example.com'}, {createdAt: serverTimestamp()}]) {
        await assertFails(updateDoc(target, patch));
      }
    }
  });

  it('rejects migration escalation, another legacy identity, alternate targets and counter increments', async () => {
    const legacy = profile('legacy', {email: 'legacy', role: ['Staff'], status: 'pending', assignedProjects: []});
    await env.withSecurityRulesDisabled(async admin => {
      await setDoc(doc(admin.firestore(), `${root}/users/legacy`), legacy);
      await setDoc(doc(admin.firestore(), `${root}/users/stolen`), {...legacy, uid: 'victim'});
    });
    const db = context('legacy').firestore();
    const migrated = {...legacy, email: 'legacy@example.com'};
    for (const patch of [{role: ['Admin']}, {status: 'approved'}, {assignedProjects: ['p1']}, {createdAt: serverTimestamp()}, {firstName: 'Changed'}, {isFirstUser: true}, {extra: 'injected'}]) await assertFails(setDoc(doc(db, profilePath('legacy')), {...migrated, ...patch}));
    await assertFails(setDoc(doc(db, profilePath('someone-else')), migrated));
    await assertFails(getDoc(doc(db, `${root}/users/staff`)));
    await assertFails(setDoc(doc(context('stolen').firestore(), profilePath('stolen')), {...migrated, uid: 'stolen', email: 'stolen@example.com'}));
    const batch = writeBatch(db);
    batch.set(doc(db, profilePath('legacy')), migrated);
    batch.update(doc(db, metaPath), {totalUsers: 9});
    await assertFails(batch.commit());
  });
});

describe('Append-only activity logs', () => {
  it.each(['staff', 'pending', 'rejected'])('%s can log own login but cannot read or change logs', async id => {
    const db = context(id).firestore();
    const log = doc(db, `${root}/activityLogs/login`);
    await assertSucceeds(setDoc(log, {uid: id, email: `${id}@example.com`, action: 'LOGIN', provider: 'password', createdAt: serverTimestamp()}));
    await assertFails(getDoc(log));
    await assertFails(updateDoc(log, {action: 'LOGOUT'}));
    await assertFails(deleteDoc(log));
    await assertSucceeds(getDoc(doc(context('admin').firestore(), log.path)));
    await assertFails(updateDoc(doc(context('admin').firestore(), log.path), {action: 'LOGOUT'}));
    await assertFails(deleteDoc(doc(context('admin').firestore(), log.path)));
  });

  it('rejects spoofed identity, unknown activity and client timestamps', async () => {
    const db = context('staff').firestore();
    for (const patch of [{uid: 'admin'}, {email: 'admin@example.com'}, {action: 'MAKE_ADMIN'}, {action: 'USER_APPROVE'}, {createdAt: seedTime}]) await assertFails(setDoc(doc(db, `${root}/activityLogs/forged`), {uid: 'staff', email: 'staff@example.com', action: 'LOGIN', createdAt: serverTimestamp(), ...patch}));
  });
});

describe('MasterAdmin-only AI settings', () => {
  it('allows MasterAdmin to create, read, update and delete provider settings', async () => {
    const db = context('master').firestore();
    const reference = doc(db, aiSettingsPath);
    await assertSucceeds(setDoc(reference, aiSettings()));
    expect((await getDoc(reference)).data()).toMatchObject({activeProvider: 'openai', updatedBy: 'master'});
    await assertSucceeds(setDoc(reference, aiSettings('master', {activeProvider: 'google'})));
    expect((await getDoc(reference)).data()?.activeProvider).toBe('google');
    await assertSucceeds(deleteDoc(reference));
    expect((await getDoc(reference)).exists()).toBe(false);
  });

  it.each(['super', 'admin', 'staff', 'engineer'])('%s cannot read or change AI settings', async id => {
    await env.withSecurityRulesDisabled(async admin => {await setDoc(doc(admin.firestore(), aiSettingsPath), aiSettings());});
    const reference = doc(context(id).firestore(), aiSettingsPath);
    await assertFails(getDoc(reference));
    await assertFails(setDoc(reference, aiSettings(id)));
    await assertFails(deleteDoc(reference));
  });

  it('rejects malformed settings even for MasterAdmin', async () => {
    const reference = doc(context('master').firestore(), aiSettingsPath);
    await assertFails(setDoc(reference, aiSettings('master', {unknown: true})));
    await assertSucceeds(setDoc(reference, aiSettings('master', {prompt: 'อ่านเฉพาะ F01'})));
    await assertFails(setDoc(reference, aiSettings('master', {prompt: 'x'.repeat(10001)})));
    await assertFails(setDoc(reference, aiSettings('master', {prompt: 123})));
    await assertFails(setDoc(reference, aiSettings('master', {providers: {...aiSettings().providers, openai: {model: ''}}})));
  });
});

describe('Storage upload scope and immutability', () => {
  it.each(['application/pdf', 'image/png', 'image/jpeg'])('accepts %s files for an approved assigned user', async contentType => {
    const storage = context('staff').storage();
    await assertSucceeds(uploadBytes(ref(storage, newUpload), new Uint8Array([1]), uploadMetadata('p1', contentType)));
    await assertSucceeds(uploadBytes(ref(storage, `${newUpload}-original`), new Uint8Array([1]), uploadMetadata('p1', 'application/pdf')));
    await assertSucceeds(getBytes(ref(context('engineer').storage(), newUpload)));
    await assertSucceeds(getBytes(ref(storage, seededUpload)));
  });

  it.each(adminIds)('%s can upload and read any project', async id => {
    const storage = context(id).storage();
    await assertSucceeds(uploadBytes(ref(storage, newUpload), new Uint8Array([1]), uploadMetadata('p2')));
    await assertSucceeds(getBytes(ref(storage, newUpload)));
    await assertFails(getBytes(ref(context('staff').storage(), newUpload)));
  });

  it('requires project metadata and denies unassigned uploads', async () => {
    const storage = context('staff').storage();
    await assertFails(uploadBytes(ref(storage, newUpload), new Uint8Array([1]), {contentType: 'image/png'}));
    await assertFails(uploadBytes(ref(storage, newUpload), new Uint8Array([1]), {contentType: 'image/png', customMetadata: {caseId: 'F01'}}));
    await assertFails(uploadBytes(ref(storage, newUpload), new Uint8Array([1]), uploadMetadata('')));
    await assertFails(uploadBytes(ref(storage, newUpload), new Uint8Array([1]), uploadMetadata('p2')));
  });

  it.each(['text/html', 'application/javascript', 'image/svg+xml', 'application/octet-stream'])('rejects unsupported %s uploads', async contentType => {
    await assertFails(uploadBytes(ref(context('admin').storage(), newUpload), new Uint8Array([1]), uploadMetadata('p1', contentType)));
  });

  it('enforces nonempty files and the inclusive 20 MiB limit', async () => {
    const storage = context('staff').storage();
    await assertFails(uploadBytes(ref(storage, newUpload), new Uint8Array(0), uploadMetadata()));
    await assertFails(uploadBytes(ref(storage, newUpload), new Uint8Array(20 * 1024 * 1024 + 1), uploadMetadata()));
    await assertSucceeds(uploadBytes(ref(storage, newUpload), new Uint8Array(20 * 1024 * 1024), uploadMetadata()));
  }, 45000);

  it.each(['staff', 'admin'])('%s cannot overwrite or change metadata and can delete an authorized upload', async id => {
    const file = ref(context(id).storage(), seededUpload);
    await assertFails(uploadBytes(file, new Uint8Array([3]), uploadMetadata()));
    await assertFails(updateMetadata(file, {customMetadata: {projectId: 'p2'}}));
    await assertFails(updateMetadata(file, {contentType: 'application/pdf'}));
    await assertSucceeds(deleteObject(file));
  });

  it('denies nested upload paths and paths outside the upload collection', async () => {
    const storage = context('admin').storage();
    for (const path of [`${newUpload}/nested.png`, `${root}/other/file.png`, 'uploads/file.png', `${root}/uploads`]) await assertFails(uploadBytes(ref(storage, path), new Uint8Array([1]), uploadMetadata()));
  });

  it.each(['assignment', 'approval'])('revoking %s immediately removes Firestore and Storage access', async revocation => {
    const actor = context('staff');
    await assertSucceeds(getDoc(doc(actor.firestore(), projectPath('p1'))));
    await assertSucceeds(getBytes(ref(actor.storage(), seededUpload)));
    await assertSucceeds(updateDoc(doc(context('admin').firestore(), profilePath('staff')), revocation === 'assignment' ? {assignedProjects: []} : {status: 'rejected'}));
    await assertFails(getDoc(doc(actor.firestore(), projectPath('p1'))));
    await assertFails(updateDoc(doc(actor.firestore(), `${root}/geometry/p1__F01`), {width: 5000}));
    await assertFails(getBytes(ref(actor.storage(), seededUpload)));
    await assertFails(uploadBytes(ref(actor.storage(), newUpload), new Uint8Array([1]), uploadMetadata()));
  });
});
