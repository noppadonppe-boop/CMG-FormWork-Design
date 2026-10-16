import {afterAll, beforeAll, beforeEach, describe, expect, it, vi} from 'vitest';
import type {User} from 'firebase/auth';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  update: vi.fn(),
  runTransaction: vi.fn(),
  onSnapshot: vi.fn(),
}));

vi.mock('firebase/app', async importOriginal => ({
  ...await importOriginal<typeof import('firebase/app')>(),
  getApps: () => [],
  initializeApp: () => ({}),
}));
vi.mock('firebase/auth', async importOriginal => ({
  ...await importOriginal<typeof import('firebase/auth')>(),
  getAuth: () => ({}),
}));
vi.mock('firebase/firestore', async importOriginal => ({
  ...await importOriginal<typeof import('firebase/firestore')>(),
  getFirestore: () => ({}),
  doc: (_db: unknown, ...segments: string[]) => ({path: segments.join('/')}),
  runTransaction: mocks.runTransaction,
  onSnapshot: mocks.onSnapshot,
}));
vi.mock('firebase/functions', async importOriginal => ({
  ...await importOriginal<typeof import('firebase/functions')>(),
  getFunctions: () => ({}),
}));
vi.mock('firebase/storage', async importOriginal => ({
  ...await importOriginal<typeof import('firebase/storage')>(),
  getStorage: () => ({}),
}));

const root = 'RC-FormWork-App/root';
const user = {uid: 'staff-uid', email: 'staff@example.com', displayName: 'Staff User', photoURL: null} as User;
const canonicalPath = `${root}/users/${user.email}`;
const legacyPath = `${root}/users/${user.uid}`;
const metaPath = `${root}/appMeta/config`;
const existingProfile = {
  uid: user.uid, email: user.email, firstName: 'Staff', lastName: 'User', position: 'Engineer',
  role: ['Staff'], status: 'approved', assignedProjects: ['p1'], isFirstUser: false,
};
let firebase: typeof import('../src/firebase');

function snapshot(data?: Record<string, unknown>) {
  return {exists: () => data !== undefined, data: () => data};
}

beforeAll(async () => {
  vi.stubEnv('VITE_FIREBASE_ENABLED', 'true');
  vi.stubEnv('VITE_FIREBASE_USE_EMULATORS', 'false');
  vi.stubEnv('VITE_FIREBASE_API_KEY', 'test-api-key');
  vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'test-project');
  vi.stubEnv('VITE_FIREBASE_APP_ID', 'test-app');
  firebase = await import('../src/firebase');
});
afterAll(() => vi.unstubAllEnvs());
beforeEach(() => {
  vi.resetAllMocks();
  mocks.runTransaction.mockImplementation(async (_db, callback) => callback({get: mocks.get, set: mocks.set, update: mocks.update}));
});

describe('Firebase account profiles', () => {
  it('loads an existing canonical profile without reading denied legacy or metadata documents', async () => {
    mocks.get.mockImplementation(async ({path}) => {
      if (path === canonicalPath) return snapshot(existingProfile);
      throw new Error('permission-denied');
    });

    await expect(firebase.ensureUserProfile(user)).resolves.toEqual(existingProfile);
    expect(mocks.get).toHaveBeenCalledTimes(1);
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it('adds a Google photo to an existing profile without additional reads', async () => {
    mocks.get.mockResolvedValue(snapshot(existingProfile));
    const photoURL = 'https://example.com/avatar.png';

    await firebase.ensureUserProfile({...user, photoURL});

    expect(mocks.get).toHaveBeenCalledTimes(1);
    expect(mocks.update).toHaveBeenCalledWith({path: canonicalPath}, {photoURL});
  });

  it('preserves approval and assignments when migrating a legacy profile without metadata access', async () => {
    mocks.get.mockImplementation(async ({path}) => {
      if (path === canonicalPath) return snapshot();
      if (path === legacyPath) return snapshot({...existingProfile, email: user.uid});
      throw new Error('permission-denied');
    });

    await expect(firebase.ensureUserProfile(user)).resolves.toEqual(existingProfile);
    expect(mocks.set).toHaveBeenCalledWith({path: canonicalPath}, existingProfile, {merge: false});
    expect(mocks.get).toHaveBeenCalledTimes(2);
  });

  it('writes a serializable email profile without an undefined photo field', async () => {
    mocks.get.mockImplementation(async ({path}) => snapshot(path === metaPath ? {firstUserRegistered: true, totalUsers: 1} : undefined));
    const profile = await firebase.ensureUserProfile(user, {firstName: 'New', lastName: 'User', position: 'Engineer'});

    expect(profile).toMatchObject({firstName: 'New', role: ['Staff'], status: 'pending', isFirstUser: false});
    const profileWrite = mocks.set.mock.calls.find(([reference]) => reference.path === canonicalPath)?.[1];
    expect(profileWrite).toBeDefined();
    expect(profileWrite).not.toHaveProperty('photoURL');
    expect(Object.values(profileWrite)).not.toContain(undefined);
    expect(mocks.set).toHaveBeenCalledWith({path: metaPath}, expect.objectContaining({totalUsers: 2}), {merge: true});
  });

  it('delivers a subscription error without replacing it with a missing-profile result', () => {
    const callback = vi.fn();
    const onError = vi.fn();
    const unsubscribe = vi.fn();
    mocks.onSnapshot.mockReturnValue(unsubscribe);
    expect(firebase.onUserProfileChanged(user, callback, onError)).toBe(unsubscribe);
    const failure = new Error('permission-denied');

    mocks.onSnapshot.mock.calls[0][2](failure);

    expect(onError).toHaveBeenCalledWith(failure);
    expect(callback).not.toHaveBeenCalled();
  });

  it('still reports a missing profile when the subscription succeeds with no document', () => {
    const callback = vi.fn();
    const onError = vi.fn();
    firebase.onUserProfileChanged(user, callback, onError);

    mocks.onSnapshot.mock.calls[0][1](snapshot());

    expect(callback).toHaveBeenCalledWith(null);
    expect(onError).not.toHaveBeenCalled();
  });
});
