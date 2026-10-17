import {getApps, initializeApp} from 'firebase/app';
import {AI_MODEL_EFFORTS, AI_PROVIDERS, aiEffortOptions, aiEffortSettingOptions, defaultAiEffort, defaultAiEffortSetting, DEFAULT_AI_MODELS, isAiEffort, type AiEffortSetting, type AiProvider} from './aiModels';
export {AI_PROVIDERS, type AiProvider} from './aiModels';
import {AI_CLIENT_TIMEOUT_MS, isAiStage, type AiStage} from './aiProgress';
import {
  GoogleAuthProvider,
  browserLocalPersistence,
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getRedirectResult,
  getAuth,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import {
  addDoc,
  collection,
  connectFirestoreEmulator,
  doc,
  deleteDoc,
  getDoc,
  getDocs,
  getFirestore,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import {connectFunctionsEmulator, getFunctions, httpsCallable} from 'firebase/functions';
import {connectStorageEmulator, deleteObject, getDownloadURL, getStorage, ref, uploadBytesResumable, type UploadMetadata} from 'firebase/storage';
import {parseStoredWorkflowDraft, WORKFLOW_DRAFT_LIMIT, type StoredWorkflowDraft} from './domain/workflowV07/storage';
import {validateRegistryEntry, validateRegistryMethod, type Registry, type RegistryEntry, type RegistryMethod} from './domain/workflowV07/registry';
import {validateReviewRecord, type ReviewRecord} from './domain/workflowV07/review';

export const SHARED_COLLECTION = 'RC-FormWork-App';
export const SHARED_DOCUMENT = 'root';
export const MENU_CATEGORIES = ['overview', 'upload', 'geometry', 'criteria', 'layout', 'results', 'drawings', 'report'] as const;
export type MenuCategory = (typeof MENU_CATEGORIES)[number];

export const ROLE_OPTIONS = ['MasterAdmin', 'SuperAdmin', 'Admin', 'Engineer', 'Staff'] as const;
export type UserRole = (typeof ROLE_OPTIONS)[number];
export const DEPARTMENT_OPTIONS = ['Management', 'Engineering', 'Site', 'Document Control', 'Other'] as const;
export const PROJECT_PERMISSION_OPTIONS = ['view', 'edit', 'manage'] as const;
export type ProjectPermission = (typeof PROJECT_PERMISSION_OPTIONS)[number];
export type ProjectPermissionMap = Record<string, ProjectPermission[]>;

export interface UserProfile {
  uid: string;
  email: string;
  firstName: string;
  lastName: string;
  position: string;
  department?: string;
  role: UserRole[];
  status: 'pending' | 'approved' | 'rejected';
  assignedProjects: string[];
  projectPermissions?: ProjectPermissionMap;
  createdAt: unknown;
  photoURL?: string;
  isFirstUser: boolean;
}

export interface AppMetaConfig {firstUserRegistered: boolean; totalUsers: number; createdAt: unknown}
export type SharedProject = {id: string; name: string; code: string; cases: unknown[]; sectionStock?: unknown};

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};
const hasClientConfig = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);
export const configured = import.meta.env.VITE_FIREBASE_ENABLED !== 'false' && hasClientConfig;
export const usingEmulators = configured && import.meta.env.VITE_FIREBASE_USE_EMULATORS === 'true';

type Cloud = {auth: ReturnType<typeof getAuth>; db: ReturnType<typeof getFirestore>; functions: ReturnType<typeof getFunctions>; storage: ReturnType<typeof getStorage>};
export const cloud: Cloud | null = configured ? (() => {
  const app = getApps()[0] ?? initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const functions = getFunctions(app, 'asia-southeast1');
  const storage = getStorage(app);
  if (usingEmulators) {
    const port = (value: string | undefined, fallback: number) => {const n = Number(value); return Number.isInteger(n) && n > 0 && n < 65536 ? n : fallback;};
    const env = import.meta.env;
    connectAuthEmulator(auth, `http://127.0.0.1:${port(env.VITE_FIREBASE_EMULATOR_AUTH_PORT, 9099)}`, {disableWarnings: true});
    connectFirestoreEmulator(db, '127.0.0.1', port(env.VITE_FIREBASE_EMULATOR_FIRESTORE_PORT, 8080));
    connectFunctionsEmulator(functions, '127.0.0.1', port(env.VITE_FIREBASE_EMULATOR_FUNCTIONS_PORT, 5001));
    connectStorageEmulator(storage, '127.0.0.1', port(env.VITE_FIREBASE_EMULATOR_STORAGE_PORT, 9199));
  }
  return {auth, db, functions, storage};
})() : null;

const SESSION_EXPIRY_KEY = 'cmg-formwork-session-expiry';
const SESSION_DAYS = 30;
function requireCloud() {if (!cloud) throw Error('ยังไม่ได้ตั้งค่า Firebase ในไฟล์ .env'); return cloud;}
function emailKey(email: string) {return email.trim().toLowerCase();}
function profileDoc(email: string) {return doc(requireCloud().db, SHARED_COLLECTION, SHARED_DOCUMENT, 'users', emailKey(email));}
function legacyProfileDoc(user: User) {return doc(requireCloud().db, SHARED_COLLECTION, SHARED_DOCUMENT, 'users', user.uid);}
function rootDoc() {return doc(requireCloud().db, SHARED_COLLECTION, SHARED_DOCUMENT);}
function metaDoc() {return doc(requireCloud().db, SHARED_COLLECTION, SHARED_DOCUMENT, 'appMeta', 'config');}
function projectDoc(id: string) {return doc(requireCloud().db, SHARED_COLLECTION, SHARED_DOCUMENT, 'projects', id);}
function categoryDoc(category: MenuCategory, id: string) {return doc(requireCloud().db, SHARED_COLLECTION, SHARED_DOCUMENT, category, id);}
function aiSettingsDoc() {return doc(requireCloud().db, SHARED_COLLECTION, SHARED_DOCUMENT, 'settings', 'ai');}

function firebaseMessage(error: unknown) {
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
  if (code.includes('auth/invalid-credential') || code.includes('auth/user-not-found') || code.includes('auth/wrong-password')) return 'อีเมลหรือรหัสผ่านไม่ถูกต้อง';
  if (code.includes('auth/popup-blocked')) return 'เบราว์เซอร์บล็อกหน้าต่าง Google กรุณาอนุญาต Pop-up สำหรับเว็บไซต์นี้แล้วลองใหม่';
  if (code.includes('auth/popup-closed-by-user')) return 'ปิดหน้าต่าง Google ก่อนเข้าสู่ระบบ';
  if (code.includes('auth/unauthorized-domain')) return 'โดเมนนี้ยังไม่ได้รับอนุญาตใน Firebase Authentication';
  if (code.includes('auth/email-already-in-use')) return 'อีเมลนี้ถูกใช้งานแล้ว';
  if (code.includes('auth/weak-password')) return 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร';
  if (code.includes('auth/invalid-email')) return 'รูปแบบอีเมลไม่ถูกต้อง';
  if (error instanceof Error) return error.message;
  return 'เชื่อมต่อ Firebase ไม่สำเร็จ';
}

function setSessionExpiry(user: User) {
  localStorage.setItem(SESSION_EXPIRY_KEY, String(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000));
  if (user.email) localStorage.setItem(`${SESSION_EXPIRY_KEY}:email`, emailKey(user.email));
}

export function profileForUser(user: User) {return profileDoc(user.email ?? user.uid);}
export function onFirebaseAuthStateChanged(callback: (user: User | null) => void) {if (!cloud) {callback(null); return () => {};}; return onAuthStateChanged(cloud.auth, callback);}
export function onUserProfileChanged(user: User, callback: (profile: UserProfile | null) => void, onError?: (error: Error) => void): Unsubscribe {
  return onSnapshot(profileForUser(user), snap => callback(snap.exists() ? ({...snap.data(), email: snap.data().email ?? user.email ?? ''} as UserProfile) : null), error => {onError?.(error);});
}
export async function fetchUserProfile(user: User | null) {
  if (!user || !cloud) return null;
  try {const snap = await getDoc(profileForUser(user)); return snap.exists() ? ({...snap.data(), email: snap.data().email ?? user.email ?? ''} as UserProfile) : null;} catch {return null;}
}

function defaultProfile(user: User, first: boolean) {
  const names = user.displayName?.split(' ') ?? [];
  return {
    uid: user.uid, email: emailKey(user.email ?? user.uid), firstName: names[0] ?? '', lastName: names.slice(1).join(' '), position: '', department: 'Other',
    role: first ? ['MasterAdmin'] as UserRole[] : ['Staff'] as UserRole[], status: first ? 'approved' as const : 'pending' as const,
    assignedProjects: [], createdAt: serverTimestamp(), ...(user.photoURL ? {photoURL: user.photoURL} : {}), isFirstUser: first,
  };
}

/** Profile creation and first-user election are one Firestore transaction. */
export async function ensureUserProfile(user: User, registration: Partial<Pick<UserProfile, 'firstName' | 'lastName' | 'position'>> = {}) {
  let result: UserProfile | null = null;
  await runTransaction(requireCloud().db, async transaction => {
    const canonicalRef = profileForUser(user);
    const profileSnapshot = await transaction.get(canonicalRef);
    if (profileSnapshot.exists()) {
      const existing = profileSnapshot.data();
      if (user.photoURL && !existing.photoURL) transaction.update(canonicalRef, {photoURL: user.photoURL});
      result = {...existing, email: existing.email ?? user.email ?? ''} as UserProfile;
      return;
    }
    const legacyRef = legacyProfileDoc(user);
    const legacySnapshot = canonicalRef.path === legacyRef.path ? profileSnapshot : await transaction.get(legacyRef);
    // Migrate profiles created by the previous UID-keyed schema without
    // changing role, approval status, or assigned projects.
    if (legacySnapshot.exists() && legacySnapshot.data().uid === user.uid) {
      const legacy = legacySnapshot.data();
      const migrated = {...legacy, uid: user.uid, email: emailKey(user.email ?? user.uid), ...(user.photoURL ? {photoURL: user.photoURL} : {})} as UserProfile;
      transaction.set(canonicalRef, migrated, {merge: false});
      result = migrated;
      return;
    }
    const metaSnapshot = await transaction.get(metaDoc());
    const meta = (metaSnapshot.data() ?? {}) as Partial<AppMetaConfig>;
    const first = meta.firstUserRegistered !== true && Number(meta.totalUsers ?? 0) === 0;
    const profile = {...defaultProfile(user, first), ...registration};
    transaction.set(profileForUser(user), profile);
    transaction.set(metaDoc(), {firstUserRegistered: true, totalUsers: Number(meta.totalUsers ?? 0) + 1, createdAt: meta.createdAt ?? serverTimestamp()}, {merge: true});
    result = profile as UserProfile;
  });
  return result;
}

function persistAuthUser(user: User) {
  // This must stay immediately after sign-in and before profile/activity awaits.
  setSessionExpiry(user);
  return ensureUserProfile(user).then(profile => {void logActivity('LOGIN', user, {provider: user.providerData[0]?.providerId ?? 'password'}); return profile;});
}
export async function loginWithEmail(email: string, password: string) {
  try {const {auth} = requireCloud(); await setPersistence(auth, browserLocalPersistence); const result = await signInWithEmailAndPassword(auth, emailKey(email), password); return await persistAuthUser(result.user);} catch (error) {throw Error(firebaseMessage(error));}
}
export async function loginWithGoogle() {
  const {auth} = requireCloud();
  const provider = new GoogleAuthProvider();
  try {
    await setPersistence(auth, browserLocalPersistence);
    const result = await signInWithPopup(auth, provider);
    return await persistAuthUser(result.user);
  } catch (error) {
    throw Error(firebaseMessage(error));
  }
}

/** Completes a Google redirect after the browser returns from the provider. */
let redirectResultPromise: Promise<UserProfile | null> | null = null;
export async function completeGoogleRedirect() {
  if (!cloud) return null;
  if (!redirectResultPromise) {
    redirectResultPromise = (async () => {
      try {
        await setPersistence(cloud.auth, browserLocalPersistence);
        const result = await getRedirectResult(cloud.auth);
        return result ? await persistAuthUser(result.user) : null;
      } catch (error) {
        redirectResultPromise = null;
        throw Error(firebaseMessage(error));
      }
    })();
  }
  return redirectResultPromise;
}
export async function registerWithEmail(email: string, password: string, firstName: string, lastName: string, position: string) {
  try {
    const {auth} = requireCloud(); await setPersistence(auth, browserLocalPersistence); const result = await createUserWithEmailAndPassword(auth, emailKey(email), password);
    setSessionExpiry(result.user);
    const profile = await ensureUserProfile(result.user, {firstName: firstName.trim(), lastName: lastName.trim(), position: position.trim()}) as UserProfile | null;
    void logActivity('REGISTER', result.user, {isFirstUser: profile?.isFirstUser ?? false}); return profile;
  } catch (error) {throw Error(firebaseMessage(error));}
}
export async function logout() {if (cloud) {void logActivity('LOGOUT', cloud.auth.currentUser); await signOut(cloud.auth);} localStorage.removeItem(SESSION_EXPIRY_KEY); localStorage.removeItem(`${SESSION_EXPIRY_KEY}:email`);}
export async function updateOwnProfile(user: User, patch: Pick<UserProfile, 'firstName' | 'lastName' | 'position'> & {department?: string}) {
  const firstName = patch.firstName.trim(), lastName = patch.lastName.trim(), position = patch.position.trim();
  await updateDoc(profileForUser(user), {firstName, lastName, position, department: patch.department?.trim() ?? 'Other'});
  const display = `${firstName} ${lastName}`.trim(); if (user.displayName !== display) await updateProfile(user, {displayName: display});
  void logActivity('PROFILE_UPDATE', user);
}

function roleList(profile: UserProfile | null | undefined) {return Array.isArray(profile?.role) ? profile.role : profile?.role ? [profile.role as UserRole] : [];}
export function hasRole(profile: UserProfile | null | undefined, role: UserRole) {return roleList(profile).includes(role);}
export function hasAnyRole(profile: UserProfile | null | undefined, roles: UserRole[]) {return roles.some(role => hasRole(profile, role));}
export function isAdminProfile(profile: UserProfile | null | undefined) {return hasAnyRole(profile, ['MasterAdmin', 'SuperAdmin', 'Admin']);}
export function isMasterAdminProfile(profile: UserProfile | null | undefined) {return hasRole(profile, 'MasterAdmin');}
export function projectPermissionPreset(permission: ProjectPermission): ProjectPermission[] {
  if (permission === 'view') return ['view'];
  if (permission === 'edit') return ['view', 'edit'];
  return ['view', 'edit', 'manage'];
}
export function projectPermissionsFor(profile: UserProfile | null | undefined, projectId: string): ProjectPermission[] {
  if (isMasterAdminProfile(profile) || isAdminProfile(profile)) return [...PROJECT_PERMISSION_OPTIONS];
  const explicit = profile?.projectPermissions?.[projectId];
  if (Array.isArray(explicit) && explicit.length > 0) return explicit.filter(permission => PROJECT_PERMISSION_OPTIONS.includes(permission));
  // Existing accounts predate projectPermissions. Their assignment continues
  // to mean read/write access until an administrator assigns an explicit level.
  return profile?.assignedProjects?.includes(projectId) ? ['view', 'edit'] : [];
}
export function canProject(profile: UserProfile | null | undefined, projectId: string, permission: ProjectPermission = 'view') {
  const rights = projectPermissionsFor(profile, projectId);
  return rights.includes('manage') || rights.includes(permission);
}
function assignedProjectIds(profile: UserProfile | null | undefined) {
  const explicit = Object.entries(profile?.projectPermissions ?? {}).filter(([, rights]) => Array.isArray(rights) && rights.length > 0).map(([id]) => id);
  return [...new Set([...(profile?.assignedProjects ?? []), ...explicit])];
}
export function displayName(profile: UserProfile | null | undefined) {return profile ? `${profile.firstName} ${profile.lastName}`.trim() || profile.email : 'ผู้ใช้งาน';}

export function logActivity(action: 'REGISTER' | 'LOGIN' | 'LOGOUT' | 'PROFILE_UPDATE' | 'USER_APPROVE' | 'USER_REJECT' | 'USER_UPDATE' | 'PROJECT_DELETE', user: User | null, extra: Record<string, unknown> = {}) {
  if (!user || !cloud) return Promise.resolve();
  return addDoc(collection(cloud.db, SHARED_COLLECTION, SHARED_DOCUMENT, 'activityLogs'), {action, uid: user.uid, email: user.email ?? '', ...extra, createdAt: serverTimestamp()}).catch(() => {});
}

/** Workflow v0.7 drafts live in their own subcollection (one document per case) so the project
 * document stays small; they are stripped from the case list before it is written. */
function workflowDraftDoc(projectId: string, caseId: string) {return doc(projectDoc(projectId), 'workflow', caseId);}
const stripWorkflowDrafts = (cases: unknown[]) => cases.map(c => {
  if (!c || typeof c !== 'object' || !('workflowV07' in c)) return c;
  const {workflowV07: _draft, ...rest} = c as Record<string, unknown>; return rest;
});
export async function saveWorkflowDraft(projectId: string, caseId: string, draft: StoredWorkflowDraft) {
  const user = requireCloud().auth.currentUser; if (!user) throw Error('กรุณาเข้าสู่ระบบก่อนบันทึกร่าง v0.7');
  const modelJson = JSON.stringify(draft.model);
  if (modelJson.length > WORKFLOW_DRAFT_LIMIT) throw Error('ร่าง v0.7 ใหญ่เกินขอบเขตการบันทึก');
  await setDoc(workflowDraftDoc(projectId, caseId), {projectId, caseId, schemaVersion: draft.schemaVersion, engineVersion: draft.engineVersion, savedAtMs: draft.savedAtMs,
    sourceInputHash: draft.sourceInputHash, modelJson, updatedBy: user.uid, updatedAt: serverTimestamp()}, {merge: false});
}
export async function deleteWorkflowDraft(projectId: string, caseId: string) {await deleteDoc(workflowDraftDoc(projectId, caseId));}
export async function loadWorkflowDrafts(projectId: string): Promise<Record<string, StoredWorkflowDraft>> {
  const snap = await getDocs(collection(projectDoc(projectId), 'workflow')), drafts: Record<string, StoredWorkflowDraft> = {};
  for (const item of snap.docs) {
    const data = item.data() as Record<string, unknown>;
    try {
      if (typeof data.modelJson !== 'string') continue;
      drafts[typeof data.caseId === 'string' ? data.caseId : item.id] = parseStoredWorkflowDraft({schemaVersion: data.schemaVersion, engineVersion: data.engineVersion, savedAtMs: data.savedAtMs, sourceInputHash: data.sourceInputHash, model: JSON.parse(data.modelJson)});
    } catch { /* an unreadable draft is reported as missing rather than guessed */ }
  }
  return drafts;
}
/** Review/approve/issue record per case; Rules enforce the role and independence gates. */
function reviewDoc(projectId: string, caseId: string) {return doc(projectDoc(projectId), 'review', caseId);}
export async function saveReviewRecord(recordValue: ReviewRecord) {
  const user = requireCloud().auth.currentUser; if (!user) throw Error('กรุณาเข้าสู่ระบบก่อนเปลี่ยนสถานะเอกสาร');
  validateReviewRecord(recordValue);
  await setDoc(reviewDoc(recordValue.projectId, recordValue.caseId), {projectId: recordValue.projectId, caseId: recordValue.caseId, state: recordValue.state, contentHash: recordValue.contentHash,
    engineVersion: recordValue.engineVersion, submittedBy: recordValue.submittedBy, recordJson: JSON.stringify(recordValue), updatedBy: user.uid, updatedAt: serverTimestamp()}, {merge: false});
}
export async function loadReviewRecords(projectId: string): Promise<Record<string, ReviewRecord>> {
  const snap = await getDocs(collection(projectDoc(projectId), 'review')), out: Record<string, ReviewRecord> = {};
  for (const item of snap.docs) {
    const data = item.data() as Record<string, unknown>;
    try {if (typeof data.recordJson === 'string') {const value = JSON.parse(data.recordJson); validateReviewRecord(value); out[value.caseId] = value;}} catch { /* unreadable record is omitted */ }
  }
  return out;
}
/** Shared reviewed registry (methods and catalog entries), one document per item. */
const registryCollection = () => collection(requireCloud().db, SHARED_COLLECTION, SHARED_DOCUMENT, 'registry');
export async function saveRegistryItem(item: {type: 'method'; value: RegistryMethod} | {type: 'entry'; value: RegistryEntry}) {
  const user = requireCloud().auth.currentUser; if (!user) throw Error('กรุณาเข้าสู่ระบบก่อนบันทึกคลังข้อมูล');
  if (item.type === 'method') validateRegistryMethod(item.value); else validateRegistryEntry(item.value);
  await setDoc(doc(registryCollection(), `${item.type}__${item.value.id}`), {type: item.type, id: item.value.id, status: item.value.review.status, itemJson: JSON.stringify(item.value), updatedBy: user.uid, updatedAt: serverTimestamp()}, {merge: false});
}
export async function deleteRegistryItem(type: 'method' | 'entry', id: string) {await deleteDoc(doc(registryCollection(), `${type}__${id}`));}
export async function loadRegistry(): Promise<Registry> {
  const snap = await getDocs(registryCollection()), registry: Registry = {methods: [], entries: []};
  for (const item of snap.docs) {
    const data = item.data() as Record<string, unknown>;
    try {
      if (typeof data.itemJson !== 'string') continue;
      const value = JSON.parse(data.itemJson);
      if (data.type === 'method') {validateRegistryMethod(value); registry.methods.push(value);} else if (data.type === 'entry') {validateRegistryEntry(value); registry.entries.push(value);}
    } catch { /* an unreadable item is omitted, never repaired */ }
  }
  return registry;
}
export async function saveProject(project: SharedProject, category: MenuCategory = 'overview', caseId?: string) {
  const user = requireCloud().auth.currentUser; if (!user) throw Error('กรุณาเข้าสู่ระบบก่อนบันทึกข้อมูล');
  await setDoc(rootDoc(), {app: SHARED_COLLECTION, schemaVersion: 2, updatedAt: serverTimestamp()}, {merge: true});
  project = {...project, cases: stripWorkflowDrafts(project.cases)};
  const common = {...project, projectId: project.id, updatedBy: user.uid, updatedAt: serverTimestamp()}; const categoryId = caseId ? `${project.id}__${caseId}` : project.id;
  await Promise.all([setDoc(projectDoc(project.id), common, {merge: true}), setDoc(categoryDoc(category, categoryId), {...common, caseId: caseId ?? null, snapshot: project}, {merge: true})]);
}
export async function loadProjects(profile?: UserProfile | null): Promise<SharedProject[]> {
  const {db, auth} = requireCloud(); if (!auth.currentUser) throw Error('กรุณาเข้าสู่ระบบก่อนโหลดโครงการ');
  const refs = isAdminProfile(profile) ? (await getDocs(collection(db, SHARED_COLLECTION, SHARED_DOCUMENT, 'projects'))).docs : await Promise.all(assignedProjectIds(profile).map(id => getDoc(projectDoc(id))));
  const projects = refs.flatMap(item => {if (!item.exists()) return []; const data = item.data() as Record<string, unknown>; return [{id: typeof data.id === 'string' ? data.id : item.id, name: typeof data.name === 'string' ? data.name : 'โครงการไม่มีชื่อ', code: typeof data.code === 'string' ? data.code : item.id, cases: Array.isArray(data.cases) ? data.cases : [], ...(Array.isArray(data.sectionStock) ? {sectionStock: data.sectionStock} : {})}];});
  // Attach each case's v0.7 draft; a failed draft read leaves that case without a draft.
  return Promise.all(projects.map(async p => {
    const [drafts, reviews] = await Promise.all([loadWorkflowDrafts(p.id).catch(() => ({} as Record<string, StoredWorkflowDraft>)), loadReviewRecords(p.id).catch(() => ({} as Record<string, ReviewRecord>))]);
    return {...p, cases: p.cases.map(c => c && typeof c === 'object' && 'id' in c && typeof c.id === 'string'
      ? {...c, ...(drafts[c.id] ? {workflowV07: drafts[c.id]} : {}), ...(reviews[c.id] ? {review: reviews[c.id]} : {})} : c)};
  }));
}
export async function listUsers() {const snap = await getDocs(collection(requireCloud().db, SHARED_COLLECTION, SHARED_DOCUMENT, 'users')); return snap.docs.map(item => ({...item.data(), email: item.data().email ?? item.id} as UserProfile));}
export function subscribeUsers(callback: (users: UserProfile[]) => void, onError?: (error: Error) => void) {return onSnapshot(collection(requireCloud().db, SHARED_COLLECTION, SHARED_DOCUMENT, 'users'), snap => callback(snap.docs.map(item => ({...item.data(), email: item.data().email ?? item.id} as UserProfile))), error => onError?.(error));}
export async function listAllProjects(): Promise<SharedProject[]> {const snap = await getDocs(collection(requireCloud().db, SHARED_COLLECTION, SHARED_DOCUMENT, 'projects')); return snap.docs.flatMap(item => {const data = item.data() as Record<string, unknown>; return [{id: typeof data.id === 'string' ? data.id : item.id, name: typeof data.name === 'string' ? data.name : 'โครงการไม่มีชื่อ', code: typeof data.code === 'string' ? data.code : item.id, cases: Array.isArray(data.cases) ? data.cases : [], ...(Array.isArray(data.sectionStock) ? {sectionStock: data.sectionStock} : {})}];});}
export async function updateManagedUser(email: string, patch: Partial<Pick<UserProfile, 'firstName' | 'lastName' | 'position' | 'department' | 'role' | 'status' | 'assignedProjects' | 'projectPermissions'>>) {await updateDoc(profileDoc(email), patch); const user = requireCloud().auth.currentUser; void logActivity(patch.status === 'approved' ? 'USER_APPROVE' : patch.status === 'rejected' ? 'USER_REJECT' : 'USER_UPDATE', user, {targetEmail: email});}
export async function deleteProject(projectId: string) {
  if (!requireCloud().auth.currentUser) throw Error('กรุณาเข้าสู่ระบบก่อนลบโครงการ');
  await httpsCallable(requireCloud().functions, 'deleteProject')({projectId});
  void logActivity('PROJECT_DELETE', requireCloud().auth.currentUser, {projectId});
}

export async function trustedCalculation(projectId: string, caseId: string, input: unknown) {if (!requireCloud().auth.currentUser) throw Error('กรุณาเข้าสู่ระบบก่อนคำนวณ'); return (await httpsCallable(requireCloud().functions, 'calculateFormwork')({projectId, caseId, input})).data;}
export type UploadSourceOptions = {signal?: AbortSignal; onProgress?: (progress: number) => void};
const UPLOAD_TIMEOUT_MS = 60_000;
const METADATA_TIMEOUT_MS = 20_000;

function uploadCanceled() {return new DOMException('ยกเลิกการอัปโหลดแล้ว', 'AbortError');}
function errorCode(error: unknown) {return typeof error === 'object' && error && 'code' in error ? String(error.code) : '';}
function uploadMessage(error: unknown) {
  const code = errorCode(error);
  if (code === 'storage/canceled' || (error instanceof Error && error.name === 'AbortError')) return uploadCanceled();
  if (code === 'storage/unauthenticated' || code === 'unauthenticated') return Error('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่แล้วอัปโหลดอีกครั้ง');
  if (code === 'storage/unauthorized' || code === 'permission-denied') return Error('ไม่มีสิทธิ์บันทึกไฟล์ในโครงการนี้ กรุณาตรวจสอบสิทธิ์โครงการและ Firebase Storage Rules');
  if (['storage/no-default-bucket', 'storage/bucket-not-found', 'storage/project-not-found'].includes(code)) return Error('ยังไม่พบพื้นที่เก็บไฟล์ กรุณาตั้งค่า Firebase Storage และตรวจสอบชื่อ bucket ของโครงการ');
  if (code === 'storage/quota-exceeded') return Error('พื้นที่เก็บไฟล์ถึงขีดจำกัด กรุณาให้ผู้ดูแลตรวจสอบโควตา Firebase Storage ของโครงการ');
  if (code === 'storage/retry-limit-exceeded' || code === 'storage/unknown' || code === 'unavailable' || code === 'deadline-exceeded') return Error('เชื่อมต่อพื้นที่เก็บไฟล์ไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตและการเปิดใช้งาน Firebase Storage ของโครงการ แล้วลองอัปโหลดอีกครั้ง');
  return error instanceof Error ? error : Error('อัปโหลดไฟล์ไม่สำเร็จ กรุณาลองอีกครั้ง');
}

function uploadFile(storage: NonNullable<typeof cloud>['storage'], path: string, file: File, metadata: UploadMetadata, options: UploadSourceOptions) {
  if (options.signal?.aborted) return Promise.reject(uploadCanceled());
  const task = uploadBytesResumable(ref(storage, path), file, metadata);
  return new Promise<void>((resolve, reject) => {
    let finished = false;
    let unsubscribe = () => {};
    const finish = (error?: unknown) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', abort);
      unsubscribe();
      if (error) reject(error); else resolve();
    };
    const abort = () => {finish(uploadCanceled()); task.cancel();};
    const timer = setTimeout(() => {
      finish(Error('อัปโหลดนานเกิน 60 วินาที กรุณาตรวจสอบอินเทอร์เน็ตและการเปิดใช้งาน Firebase Storage แล้วลองอีกครั้ง'));
      task.cancel();
    }, UPLOAD_TIMEOUT_MS);
    options.signal?.addEventListener('abort', abort, {once: true});
    unsubscribe = task.on('state_changed', snapshot => {
      if (!finished) options.onProgress?.(snapshot.totalBytes > 0 ? snapshot.bytesTransferred / snapshot.totalBytes * 100 : 0);
    }, finish, () => finish());
    if (options.signal?.aborted) abort();
  });
}

// Firestore may keep an offline write queued. Stop waiting in the UI and ignore
// late completion; unlike the Storage transfer, Firestore writes cannot be canceled.
function waitForUploadMetadata(write: Promise<void>, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    let finished = false;
    const finish = (error?: unknown) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      if (error) reject(error); else resolve();
    };
    const abort = () => finish(uploadCanceled());
    const timer = setTimeout(() => finish(Error('บันทึกข้อมูลไฟล์ไม่สำเร็จภายในเวลาที่กำหนด กรุณาตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง')), METADATA_TIMEOUT_MS);
    signal?.addEventListener('abort', abort, {once: true});
    write.then(() => finish(), finish);
    if (signal?.aborted) abort();
  });
}

export async function uploadSource(projectId: string, file: File, caseId?: string, originalFile?: File, options: UploadSourceOptions = {}) {
  const {auth, storage} = requireCloud();
  const user = auth.currentUser;
  if (!user) throw Error('กรุณาเข้าสู่ระบบก่อนอัปโหลด');
  if (options.signal?.aborted) throw uploadCanceled();
  if (!firebaseConfig.storageBucket) throw Error('ยังไม่ได้ตั้งค่า Firebase Storage bucket สำหรับอัปโหลดไฟล์');
  if (!['image/png', 'image/jpeg'].includes(file.type) || file.size <= 0 || file.size > 5 * 1024 * 1024) throw Error('ภาพสำหรับ AI ต้องเป็น PNG หรือ JPEG ขนาดไม่เกิน 5 MB กรุณาเลือกหน้า PDF หรือย่อขนาดภาพก่อน');
  const original = originalFile && originalFile !== file ? originalFile : null;
  if (original && (!['application/pdf', 'image/png', 'image/jpeg'].includes(original.type) || original.size <= 0 || original.size > 20 * 1024 * 1024)) throw Error('ไฟล์ต้นฉบับต้องเป็น PDF, PNG หรือ JPEG ขนาดไม่เกิน 20 MB');
  storage.maxUploadRetryTime = 15_000;
  storage.maxOperationRetryTime = 15_000;
  const id = crypto.randomUUID();
  const path = `${SHARED_COLLECTION}/${SHARED_DOCUMENT}/uploads/${id}`;
  const originalPath = original ? `${path}-original` : null;
  const totalBytes = file.size + (original?.size ?? 0);
  const metadata = {customMetadata: {projectId, caseId: caseId ?? ''}};
  options.onProgress?.(0);
  try {
    await uploadFile(storage, path, file, {...metadata, contentType: file.type}, {...options, onProgress: progress => options.onProgress?.(progress * file.size / totalBytes)});
    if (original && originalPath) await uploadFile(storage, originalPath, original, {...metadata, contentType: original.type}, {...options, onProgress: progress => options.onProgress?.((file.size + progress / 100 * original.size) / totalBytes * 100)});
    if (options.signal?.aborted) throw uploadCanceled();
    await waitForUploadMetadata(setDoc(categoryDoc('upload', id), {projectId, caseId: caseId ?? null, filename: file.name, originalFilename: originalFile?.name ?? file.name, path, originalPath, size: file.size, type: file.type, createdBy: user.uid, createdAt: serverTimestamp()}, {merge: false}), options.signal);
    options.onProgress?.(100);
    return {path, originalPath};
  } catch (error) {throw uploadMessage(error);}
}

export async function aiExtract(projectId: string, path: string, onProgress?: (stage: AiStage) => void) {
  if (!requireCloud().auth.currentUser) throw Error('กรุณาเข้าสู่ระบบก่อนวิเคราะห์แบบ');
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const callable = httpsCallable<{projectId: string; path: string}, unknown, {stage?: unknown}>(requireCloud().functions, 'extractGeometry', {timeout: AI_CLIENT_TIMEOUT_MS});
    if (!onProgress) return (await callable({projectId, path})).data;
    onProgress('connecting');
    timer = setTimeout(() => controller.abort(), AI_CLIENT_TIMEOUT_MS);
    const result = await callable.stream({projectId, path}, {signal: controller.signal});
    const [, output] = await Promise.all([
      (async () => {for await (const chunk of result.stream) if (isAiStage(chunk.stage)) onProgress(chunk.stage);})(),
      result.data,
    ]);
    return output;
  } catch (error) {
    if (controller.signal.aborted) throw Error('AI ใช้เวลาวิเคราะห์เกินกำหนด ไฟล์ที่อัปโหลดแล้วยังอยู่ กรุณาลองวิเคราะห์อีกครั้ง');
    const code = errorCode(error);
    const message = error instanceof Error ? error.message : '';
    if (message.includes('AI_PROVIDER_NOT_CONFIGURED')) throw Error('ยังไม่ได้เปิดใช้งาน AI เพราะยังไม่ได้ตั้งค่า API Key ของ AI กรุณาให้ MasterAdmin ไปที่ จัดการ User → Manage API เพื่อกรอก API Key และเลือกโมเดล');
    if (code === 'functions/not-found' && message.includes('Project not found')) throw Error('ยังไม่พบโครงการบนเซิร์ฟเวอร์ กรุณาบันทึกโครงการก่อนวิเคราะห์แบบ');
    if (code === 'functions/not-found') throw Error('ยังไม่พบบริการวิเคราะห์ AI กรุณาให้ผู้ดูแลติดตั้ง Cloud Function extractGeometry ใน region asia-southeast1');
    if (code === 'functions/unauthenticated') throw Error('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่แล้วลองวิเคราะห์อีกครั้ง');
    if (code === 'functions/permission-denied') {
      if (message.includes('Invalid source scope')) throw Error('พาธไฟล์ไม่ตรงกับรูปแบบที่บริการ AI รองรับ กรุณาเปิดไฟล์จากรายการไฟล์ของโครงการหรืออัปโหลดใหม่');
      if (message.includes('File does not belong to this project')) throw Error('โครงการในข้อมูลไฟล์ไม่ตรงกับโครงการที่กำลังวิเคราะห์ กรุณาเลือกไฟล์ของโครงการนี้');
      if (message.includes('User profile not found')) throw Error('ไม่พบโปรไฟล์ผู้ใช้บน Cloud กรุณาเข้าสู่ระบบใหม่และให้ผู้ดูแลตรวจบัญชี');
      if (message.includes('User profile does not match') || message.includes('Managed account required')) throw Error('ข้อมูลบัญชีไม่ตรงกับเซสชันที่เข้าสู่ระบบ กรุณาออกจากระบบแล้วเข้าสู่ระบบใหม่');
      if (message.includes('Project is not assigned')) throw Error('บัญชีต้องได้รับอนุมัติและมีสิทธิ์แก้ไขโครงการนี้ กรุณาให้ผู้ดูแลตรวจ Assign Project');
      throw Error('บริการ Cloud ปฏิเสธสิทธิ์วิเคราะห์ไฟล์ กรุณาตรวจโปรไฟล์ สิทธิ์โครงการ และเวอร์ชัน Cloud Function');
    }
    if (code === 'functions/deadline-exceeded') {
      const details = (error as {details?: {reason?: string; timeoutSeconds?: number}}).details;
      if (details?.reason === 'AI_PROVIDER_TIMEOUT') throw Error(`AI ตอบไม่ทันภายใน ${Math.round(Number(details.timeoutSeconds) / 60)} นาที ไฟล์และผลเดิมยังอยู่ ลองลดระดับการคิดใน Manage API หรือวิเคราะห์ใหม่`);
      throw Error('AI ใช้เวลาวิเคราะห์เกินกำหนด ไฟล์ที่อัปโหลดแล้วยังอยู่ กรุณาลองวิเคราะห์อีกครั้ง');
    }
    if (['functions/unavailable', 'functions/internal', 'functions/unknown'].includes(code)) throw Error('ติดต่อบริการ AI ไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่อและการเปิดใช้งาน Cloud Functions แล้วลองวิเคราะห์อีกครั้ง');
    throw error instanceof Error ? error : Error('วิเคราะห์แบบไม่สำเร็จ กรุณาลองอีกครั้ง');
  } finally {
    clearTimeout(timer);
  }
}

export type AiProviderPublic = {model: string; effort: AiEffortSetting; hasKey: boolean; keyHint: string};
export type AiSettingsPublic = {prompt?: string; activeProvider: AiProvider; providers: Record<AiProvider, AiProviderPublic>; defaultModels: Record<AiProvider, string>};
export type AiSettingsPatch = {prompt?: string; activeProvider: AiProvider; providers: Record<AiProvider, {model: string; effort?: AiEffortSetting; apiKey?: string; clearKey?: boolean}>};

type AiProviderStored = {model?: unknown; effort?: unknown; apiKey?: unknown};
type AiSettingsStored = {prompt?: unknown; activeProvider?: unknown; providers?: Partial<Record<AiProvider, AiProviderStored>>};

function isAiProvider(value: unknown): value is AiProvider {
  return typeof value === 'string' && (AI_PROVIDERS as readonly string[]).includes(value);
}

function publicAiSettings(settings: AiSettingsStored): AiSettingsPublic {
  const activeProvider = isAiProvider(settings.activeProvider) ? settings.activeProvider : 'openai';
  const providers = Object.fromEntries(AI_PROVIDERS.map(name => {
    const config = settings.providers?.[name] ?? {};
    const model = typeof config.model === 'string' && config.model.trim() ? config.model : DEFAULT_AI_MODELS[name];
    const knownModel = Object.prototype.hasOwnProperty.call(AI_MODEL_EFFORTS[name], model);
    const configuredEffort = knownModel
      ? isAiEffort(config.effort) && aiEffortOptions(name, model).includes(config.effort) ? config.effort : defaultAiEffort(name, model)
      : config.effort === 'auto' || (isAiEffort(config.effort) && aiEffortOptions(name, model).includes(config.effort)) ? config.effort : defaultAiEffortSetting(name, model);
    const apiKey = typeof config.apiKey === 'string' ? config.apiKey : '';
    return [name, {model, effort: configuredEffort, hasKey: Boolean(apiKey), keyHint: apiKey ? `••••${apiKey.slice(-4)}` : ''}];
  })) as Record<AiProvider, AiProviderPublic>;
  return {prompt: typeof settings.prompt === 'string' ? settings.prompt : '', activeProvider, providers, defaultModels: DEFAULT_AI_MODELS};
}

function aiSettingsError(error: unknown) {
  const code = errorCode(error);
  if (code === 'permission-denied') return Error('เฉพาะ MasterAdmin เท่านั้นที่จัดการ API Key ได้');
  if (code === 'unauthenticated') return Error('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่แล้วลองอีกครั้ง');
  return error instanceof Error ? error : Error('โหลดการตั้งค่า API ไม่สำเร็จ');
}

/**
 * Manage API is intentionally embedded in the client: settings are read and
 * written to Firestore directly. Rules allow this document only to MasterAdmin.
 * The raw key is reduced to a masked public shape before it reaches React.
 */
export async function getAiSettings() {
  try {
    const snapshot = await getDoc(aiSettingsDoc());
    return publicAiSettings((snapshot.data() ?? {}) as AiSettingsStored);
  } catch (error) {
    throw aiSettingsError(error);
  }
}

export async function saveAiSettings(patch: AiSettingsPatch) {
  try {
    if (!isAiProvider(patch.activeProvider)) throw Error('กรุณาเลือก AI provider ที่รองรับ');
    const reference = aiSettingsDoc();
    const current = (await getDoc(reference)).data() as AiSettingsStored | undefined;
    const prompt = patch.prompt ?? (typeof current?.prompt === 'string' ? current.prompt : '');
    if (typeof prompt !== 'string' || prompt.length > 10000) throw Error('Prompt ต้องเป็นข้อความไม่เกิน 10,000 ตัวอักษร');
    const providers = Object.fromEntries(AI_PROVIDERS.map(name => {
      const input = patch.providers?.[name] ?? {model: ''};
      const previous = current?.providers?.[name] ?? {};
      const model = input.model.trim() || DEFAULT_AI_MODELS[name];
      if (!/^[A-Za-z0-9._:/-]{1,100}$/.test(model)) throw Error(`ชื่อโมเดลของ ${name} ไม่ถูกต้อง`);
      const knownModel = Object.prototype.hasOwnProperty.call(AI_MODEL_EFFORTS[name], model);
      const availableEfforts = aiEffortSettingOptions(name, model);
      const validEffort = input.effort === 'auto' ? !knownModel : isAiEffort(input.effort) && availableEfforts.includes(input.effort);
      if (input.effort !== undefined && !validEffort) {
        throw Error(`ระดับการคิดของ ${name} ไม่รองรับกับโมเดล ${model}`);
      }
      const effort = input.effort ?? (previous.effort === 'auto' || (isAiEffort(previous.effort) && availableEfforts.includes(previous.effort)) ? previous.effort : defaultAiEffortSetting(name, model));
      let apiKey = typeof previous.apiKey === 'string' ? previous.apiKey : '';
      if (input.clearKey) apiKey = '';
      if (input.apiKey?.trim()) {
        const nextKey = input.apiKey.trim();
        if (nextKey.length < 8 || nextKey.length > 400 || /\s/.test(nextKey)) throw Error(`API Key ของ ${name} ไม่ถูกต้อง`);
        apiKey = nextKey;
      }
      return [name, {model, effort, ...(apiKey ? {apiKey} : {})}];
    })) as Record<AiProvider, {model: string; effort: AiEffortSetting; apiKey?: string}>;
    await setDoc(reference, {
      prompt,
      activeProvider: patch.activeProvider,
      providers,
      updatedBy: requireCloud().auth.currentUser?.uid ?? '',
      updatedAt: serverTimestamp(),
    });
    return publicAiSettings({prompt, activeProvider: patch.activeProvider, providers});
  } catch (error) {
    throw aiSettingsError(error);
  }
}

export type UploadRecord = {
  id: string; projectId: string; caseId: string | null; filename: string; originalFilename: string; path: string;
  size: number; type: string; createdAt: number;
  analysis?: {draft: Record<string, unknown>; provider: string; model: string; analyzedAt: number};
};
function millis(value: unknown) {return typeof value === 'object' && value && 'toMillis' in value && typeof value.toMillis === 'function' ? Number(value.toMillis()) : 0;}

/** Realtime list of the files already uploaded to a project (newest first). Sorted client-side to avoid a composite index. */
export function subscribeUploads(projectId: string, callback: (uploads: UploadRecord[]) => void, onError?: (error: Error) => void): Unsubscribe {
  const {db} = requireCloud();
  return onSnapshot(query(collection(db, SHARED_COLLECTION, SHARED_DOCUMENT, 'upload'), where('projectId', '==', projectId)), snap => {
    callback(snap.docs.flatMap(item => {
      const data = item.data();
      if (typeof data.filename !== 'string' || typeof data.path !== 'string') return [];
      const analysis = data.analysis as Record<string, unknown> | undefined;
      return [{
        id: item.id, projectId, caseId: typeof data.caseId === 'string' ? data.caseId : null, filename: data.filename,
        originalFilename: typeof data.originalFilename === 'string' ? data.originalFilename : data.filename,
        path: data.path, size: Number(data.size ?? 0), type: String(data.type ?? ''), createdAt: millis(data.createdAt),
        ...(analysis && typeof analysis.draft === 'object' && analysis.draft ? {analysis: {draft: analysis.draft as Record<string, unknown>, provider: String(analysis.provider ?? ''), model: String(analysis.model ?? ''), analyzedAt: millis(analysis.analyzedAt)}} : {}),
      }];
    }).sort((a, b) => b.createdAt - a.createdAt));
  }, error => onError?.(error));
}

export function uploadPreviewUrl(path: string) {return getDownloadURL(ref(requireCloud().storage, path));}
async function deleteStorageObjectIfPresent(storage: ReturnType<typeof getStorage>, path: string) {
  try { await deleteObject(ref(storage, path)); }
  catch (error) { if (errorCode(error) !== 'storage/object-not-found') throw error; }
}
export async function deleteUpload(projectId: string, uploadId: string) {
  const {auth, storage} = requireCloud();
  if (!auth.currentUser) throw Error('กรุณาเข้าสู่ระบบก่อนลบไฟล์');
  if (!/^[A-Za-z0-9_-]+$/.test(uploadId)) throw Error('รหัสไฟล์ไม่ถูกต้อง จึงยังลบไฟล์ไม่ได้');

  const recordRef = categoryDoc('upload', uploadId);
  try {
    const record = await getDoc(recordRef);
    if (!record.exists()) throw Error('ไม่พบข้อมูลไฟล์นี้ใน Firestore (อาจถูกลบไปแล้ว)');
    const data = record.data() as Record<string, unknown>;
    const path = `${SHARED_COLLECTION}/${SHARED_DOCUMENT}/uploads/${uploadId}`;
    const originalPath = data.originalPath == null || data.originalPath === '' ? null : `${path}-original`;
    if (data.projectId !== projectId || data.path !== path || (data.originalPath != null && data.originalPath !== '' && data.originalPath !== originalPath)) {
      throw Error('ข้อมูลไฟล์บน Firebase ไม่ตรงกับโครงการ จึงยังลบไฟล์ไม่ได้ กรุณารีเฟรชรายการไฟล์แล้วลองใหม่');
    }

    await deleteStorageObjectIfPresent(storage, path);
    if (originalPath) await deleteStorageObjectIfPresent(storage, originalPath);
    await deleteDoc(recordRef);
  } catch (error) {
    const code = errorCode(error);
    if (code === 'storage/unauthorized' || code === 'permission-denied' || code === 'firestore/permission-denied') throw Error('ไม่มีสิทธิ์ลบไฟล์ของโครงการนี้ บัญชีต้องได้รับอนุมัติและต้องถูก Assign โครงการ หรือเป็นผู้ดูแลระบบ');
    if (code === 'not-found' || code === 'firestore/not-found') throw Error('ไม่พบข้อมูลไฟล์นี้ใน Firestore (อาจถูกลบไปแล้ว)');
    if (error instanceof Error) throw error;
    throw Error('ลบไฟล์ไม่สำเร็จ กรุณาตรวจสอบ Firebase Rules แล้วลองอีกครั้ง');
  }
}

export async function aiDrawingChat(projectId: string, path: string, messages: import('./drawingChat').DrawingChatMessage[], model?: import('./domain').Input, stockIds?: string[]) {
  const result = await httpsCallable<unknown, import('./drawingChat').DrawingChatReply>(requireCloud().functions, 'drawingChat', {timeout: AI_CLIENT_TIMEOUT_MS})({projectId, path, messages: messages.map(m => ({role: m.role, text: m.text})), ...(model ? {model} : {}), ...(stockIds ? {stockIds} : {})});
  return result.data;
}
