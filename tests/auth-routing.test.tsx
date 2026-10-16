// @vitest-environment jsdom
import React, {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import type {User} from 'firebase/auth';
import type {UserProfile} from '../src/firebase';
import {ACCOUNT_LOAD_TIMEOUT_MS, AuthProvider, useAuth} from '../src/auth';
import {AppRouter} from '../src/AppRouter';

const firebase = vi.hoisted(() => ({
  cloud: {auth: {currentUser: null as User | null}},
  onAuth: vi.fn(),
  onProfile: vi.fn(),
  ensureProfile: vi.fn(),
  redirect: vi.fn(),
  logout: vi.fn(),
}));

vi.mock('../src/firebase', () => ({
  configured: true,
  cloud: firebase.cloud,
  DEPARTMENT_OPTIONS: ['Other'],
  displayName: (profile: UserProfile) => `${profile.firstName} ${profile.lastName}`,
  onFirebaseAuthStateChanged: firebase.onAuth,
  onUserProfileChanged: firebase.onProfile,
  ensureUserProfile: firebase.ensureProfile,
  completeGoogleRedirect: firebase.redirect,
  logout: firebase.logout,
  fetchUserProfile: vi.fn(),
  loginWithEmail: vi.fn(),
  loginWithGoogle: vi.fn(),
  registerWithEmail: vi.fn(),
  updateOwnProfile: vi.fn(),
}));

type AuthSubscription = {next: (user: User | null) => void; stop: ReturnType<typeof vi.fn>};
type ProfileSubscription = {
  user: User;
  next: (profile: UserProfile | null) => void;
  error: (error: Error) => void;
  stop: ReturnType<typeof vi.fn>;
};
let authSubscriptions: AuthSubscription[];
let profileSubscriptions: ProfileSubscription[];
let host: HTMLDivElement;
let root: Root;
const account = {uid: 'staff-a', email: 'staff-a@example.com', isAnonymous: false} as User;
const otherAccount = {uid: 'staff-b', email: 'staff-b@example.com', isAnonymous: false} as User;

function profile(status: UserProfile['status'] = 'approved', user = account): UserProfile {
  return {
    uid: user.uid, email: user.email!, firstName: 'Test', lastName: 'Staff', position: 'Engineer',
    role: ['Staff'], status, assignedProjects: [], createdAt: null, isFirstUser: false,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((done, fail) => {resolve = done; reject = fail;});
  return {promise, resolve, reject};
}

function Workspace() {
  const {userProfile} = useAuth();
  return <main data-testid="workspace">Workspace for {userProfile?.email}</main>;
}

async function mount(path = '/login', strict = false) {
  window.history.replaceState({}, '', path);
  const app = <AuthProvider><AppRouter><Workspace/></AppRouter></AuthProvider>;
  await act(async () => root.render(strict ? <React.StrictMode>{app}</React.StrictMode> : app));
}

async function emitAuth(user: User | null) {
  await act(async () => {
    firebase.cloud.auth.currentUser = user;
    authSubscriptions.at(-1)!.next(user);
  });
}

async function emitProfile(value: UserProfile | null) {
  await act(async () => profileSubscriptions.at(-1)!.next(value));
}

function workspace() {return host.querySelector('[data-testid="workspace"]');}
function alert() {return host.querySelector('[role="alert"]');}

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  authSubscriptions = [];
  profileSubscriptions = [];
  firebase.cloud.auth.currentUser = null;
  firebase.redirect.mockResolvedValue(null);
  firebase.logout.mockResolvedValue(undefined);
  firebase.ensureProfile.mockImplementation(() => new Promise(() => {}));
  firebase.onAuth.mockImplementation((next: AuthSubscription['next']) => {
    const stop = vi.fn();
    authSubscriptions.push({next, stop});
    return stop;
  });
  firebase.onProfile.mockImplementation((user: User, next: ProfileSubscription['next'], error: ProfileSubscription['error']) => {
    const stop = vi.fn();
    profileSubscriptions.push({user, next, error, stop});
    return stop;
  });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('account loading and route integration', () => {
  it('opens the dashboard when an approved account is restored on /login', async () => {
    firebase.ensureProfile.mockResolvedValue(profile());
    await mount();
    await emitAuth(account);

    expect(window.location.pathname).toBe('/dashboard');
    expect(workspace()?.textContent).toContain(account.email);
    expect(host.querySelector('.auth-loading')).toBeNull();
  });

  it('opens pending approval when a pending account is restored on /login', async () => {
    firebase.ensureProfile.mockResolvedValue(profile('pending'));
    await mount();
    await emitAuth(account);

    expect(window.location.pathname).toBe('/pending');
    expect(host.querySelector('h1')?.textContent).toBe('รอการอนุมัติ');
    expect(workspace()).toBeNull();
  });

  it('keeps a rejected account on /login with an actionable rejection message', async () => {
    firebase.ensureProfile.mockResolvedValue(profile('rejected'));
    await mount();
    await emitAuth(account);

    expect(window.location.pathname).toBe('/login');
    expect(alert()?.textContent).toContain('บัญชีนี้ถูกปฏิเสธการเข้าใช้งาน');
    expect(host.querySelector('input[type="email"]')).not.toBeNull();
    expect(workspace()).toBeNull();
  });

  it('ends an unresponsive auth startup after 15 seconds and retries successfully', async () => {
    await mount();
    await act(async () => vi.advanceTimersByTime(ACCOUNT_LOAD_TIMEOUT_MS - 1));
    expect(alert()).toBeNull();
    expect(host.querySelector('.auth-loading')).not.toBeNull();

    await act(async () => vi.advanceTimersByTime(1));
    expect(alert()?.textContent).toContain('15 วินาที');
    const retry = Array.from(host.querySelectorAll('button')).find(button => button.textContent === 'ลองใหม่');
    expect(retry).toBeDefined();
    await act(async () => retry!.click());
    expect(authSubscriptions[0].stop).toHaveBeenCalledOnce();
    expect(authSubscriptions).toHaveLength(2);
    expect(alert()).toBeNull();

    firebase.ensureProfile.mockResolvedValue(profile());
    await emitAuth(account);
    expect(window.location.pathname).toBe('/dashboard');
    expect(workspace()?.textContent).toContain(account.email);
  });

  it('also times out when auth succeeds but both profile requests remain unresolved', async () => {
    await mount('/dashboard');
    await emitAuth(account);
    await act(async () => vi.advanceTimersByTime(ACCOUNT_LOAD_TIMEOUT_MS));

    expect(alert()?.textContent).toContain('15 วินาที');
    expect(host.querySelector('.auth-loading')).toBeNull();
    expect(workspace()).toBeNull();
  });

  it('shows a subscription failure on a protected route without allowing a later bootstrap result to hide it', async () => {
    const bootstrap = deferred<UserProfile>();
    firebase.ensureProfile.mockReturnValue(bootstrap.promise);
    await mount('/dashboard');
    await emitAuth(account);
    await act(async () => profileSubscriptions[0].error(new Error('permission-denied')));

    expect(alert()?.textContent).toContain('โหลดโปรไฟล์ไม่สำเร็จ');
    expect(host.querySelector('.auth-loading')).toBeNull();
    expect(workspace()).toBeNull();
    await act(async () => bootstrap.resolve(profile()));
    expect(alert()?.textContent).toContain('โหลดโปรไฟล์ไม่สำเร็จ');
    expect(workspace()).toBeNull();
  });

  it('ignores an old account bootstrap and subscription after switching accounts', async () => {
    const oldBootstrap = deferred<UserProfile>();
    firebase.ensureProfile.mockReturnValueOnce(oldBootstrap.promise);
    await mount('/dashboard');
    await emitAuth(account);
    await emitAuth(otherAccount);
    expect(profileSubscriptions[0].stop).toHaveBeenCalledOnce();

    await act(async () => {
      oldBootstrap.resolve(profile());
      profileSubscriptions[0].next(profile());
    });
    expect(workspace()).toBeNull();
    expect(host.querySelector('.auth-loading')).not.toBeNull();

    await emitProfile(profile('pending', otherAccount));
    expect(window.location.pathname).toBe('/pending');
    expect(host.textContent).toContain(otherAccount.email);
    expect(host.textContent).not.toContain(account.email);
    expect(workspace()).toBeNull();
  });

  it('cannot restore a logged-out account from its outstanding bootstrap or subscription', async () => {
    const oldBootstrap = deferred<UserProfile>();
    firebase.ensureProfile.mockReturnValue(oldBootstrap.promise);
    await mount('/dashboard');
    await emitAuth(account);
    await emitAuth(null);
    await act(async () => {
      oldBootstrap.resolve(profile());
      profileSubscriptions[0].next(profile());
    });

    expect(window.location.pathname).toBe('/login');
    expect(profileSubscriptions[0].stop).toHaveBeenCalledOnce();
    expect(host.querySelector('input[type="email"]')).not.toBeNull();
    expect(workspace()).toBeNull();
    expect(alert()).toBeNull();
  });

  it('allows profile creation to finish after the initial snapshot has no document', async () => {
    const bootstrap = deferred<UserProfile>();
    firebase.ensureProfile.mockReturnValue(bootstrap.promise);
    await mount();
    await emitAuth(account);
    await emitProfile(null);

    expect(alert()).toBeNull();
    expect(host.querySelector('.auth-loading')).not.toBeNull();
    await act(async () => bootstrap.resolve(profile()));
    expect(window.location.pathname).toBe('/dashboard');
    expect(workspace()?.textContent).toContain(account.email);
  });

  it('opens the dashboard when the pending account receives approval', async () => {
    firebase.ensureProfile.mockResolvedValue(profile('pending'));
    await mount('/pending');
    await emitAuth(account);
    expect(host.querySelector('h1')?.textContent).toBe('รอการอนุมัติ');

    await emitProfile(profile());
    expect(window.location.pathname).toBe('/dashboard');
    expect(workspace()?.textContent).toContain(account.email);
  });

  it.each([
    ['missing status', {status: undefined}],
    ['unsupported status', {status: 'disabled'}],
    ['missing roles', {role: undefined}],
  ])('reports malformed account rights (%s) instead of leaving a spinner', async (_label, invalidFields) => {
    firebase.ensureProfile.mockResolvedValue({...profile(), ...invalidFields});
    await mount();
    await emitAuth(account);

    expect(alert()?.textContent).toContain('ข้อมูลสิทธิ์บัญชีไม่สมบูรณ์');
    expect(host.querySelector('.auth-loading')).toBeNull();
    expect(workspace()).toBeNull();
  });

  it('ignores a delayed redirect failure after a newer auth state has logged out', async () => {
    const redirect = deferred<null>();
    firebase.redirect.mockReturnValue(redirect.promise);
    firebase.ensureProfile.mockResolvedValue(profile());
    await mount();
    await emitAuth(account);
    await emitAuth(null);
    await act(async () => redirect.reject(new Error('stale redirect failure')));

    expect(window.location.pathname).toBe('/login');
    expect(host.querySelector('input[type="email"]')).not.toBeNull();
    expect(alert()).toBeNull();
    expect(workspace()).toBeNull();
  });

  it('cleans up the StrictMode startup and ignores its old callback and redirect failure', async () => {
    const obsoleteRedirect = deferred<null>();
    firebase.redirect.mockReturnValueOnce(obsoleteRedirect.promise);
    firebase.ensureProfile.mockResolvedValue(profile());
    await mount('/login', true);
    expect(authSubscriptions).toHaveLength(2);
    expect(authSubscriptions[0].stop).toHaveBeenCalledOnce();
    await emitAuth(account);
    await act(async () => {
      authSubscriptions[0].next(otherAccount);
      obsoleteRedirect.reject(new Error('obsolete StrictMode startup'));
      vi.advanceTimersByTime(ACCOUNT_LOAD_TIMEOUT_MS);
    });

    expect(window.location.pathname).toBe('/dashboard');
    expect(workspace()?.textContent).toContain(account.email);
    expect(firebase.ensureProfile).toHaveBeenCalledTimes(1);
    expect(alert()).toBeNull();
    expect(host.querySelector('.auth-loading')).toBeNull();
  });
});
