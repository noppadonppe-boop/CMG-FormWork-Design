import React, {createContext, useContext, useEffect, useRef, useState} from 'react';
import {
  DEPARTMENT_OPTIONS,
  completeGoogleRedirect,
  cloud,
  configured,
  displayName,
  ensureUserProfile,
  fetchUserProfile,
  loginWithEmail,
  loginWithGoogle,
  logout,
  onFirebaseAuthStateChanged,
  onUserProfileChanged,
  registerWithEmail,
  updateOwnProfile,
  type UserProfile,
} from './firebase';
import type {User} from 'firebase/auth';

type AuthContextValue = {
  firebaseUser: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  authError: string;
  retryProfile: () => void;
  refreshProfile: () => Promise<UserProfile | null>;
};

const AuthContext = createContext<AuthContextValue | null>(null);
export const ACCOUNT_LOAD_TIMEOUT_MS = 15000;
const MISSING_PROFILE = 'เข้าสู่ระบบสำเร็จ แต่ไม่พบโปรไฟล์ผู้ใช้ กรุณาลองใหม่หรือติดต่อผู้ดูแลระบบ';

export function AuthProvider({children}: React.PropsWithChildren) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const session = useRef(0);

  useEffect(() => {
    if (!configured) {setLoading(false); return;}
    let active = true;
    let stopProfile: (() => void) | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const clearTimer = () => clearTimeout(timer);
    const isCurrent = (version: number) => active && session.current === version;
    const fail = (version: number, message: string) => {
      if (!isCurrent(version)) return;
      clearTimer();
      setUserProfile(null);
      setAuthError(message);
      setLoading(false);
    };
    const startTimer = (version: number) => {
      clearTimer();
      timer = setTimeout(() => fail(version, 'โหลดข้อมูลบัญชีนานเกิน 15 วินาที กรุณาตรวจสอบการเชื่อมต่อแล้วลองใหม่'), ACCOUNT_LOAD_TIMEOUT_MS);
    };
    setLoading(true);
    setAuthError('');
    startTimer(++session.current);
    const stopAuth = onFirebaseAuthStateChanged(user => {
      if (!active) return;
      const version = ++session.current;
      stopProfile?.();
      stopProfile = null;
      clearTimer();
      if (user?.isAnonymous) {
        // Clear legacy Anonymous Auth sessions from the previous cloud-trial build.
        void logout().catch(error => fail(version, (error as Error).message));
        setFirebaseUser(null);
        setUserProfile(null);
        setLoading(false);
        return;
      }
      setFirebaseUser(user);
      setUserProfile(null);
      setAuthError('');
      if (!user) {setLoading(false); return;}
      setLoading(true);
      startTimer(version);
      let ensuring = true;
      let listenerHasResult = false;
      const accept = (profile: UserProfile | null) => {
        if (!isCurrent(version)) return;
        if (!profile) {fail(version, MISSING_PROFILE); return;}
        if (!['approved', 'pending', 'rejected'].includes(profile.status) || !Array.isArray(profile.role)) {
          fail(version, 'ข้อมูลสิทธิ์บัญชีไม่สมบูรณ์ กรุณาติดต่อผู้ดูแลระบบ');
          return;
        }
        clearTimer();
        setAuthError('');
        setUserProfile(profile);
        setLoading(false);
      };
      void ensureUserProfile(user)
        .then(profile => {
          ensuring = false;
          if (!listenerHasResult) accept(profile);
        })
        .catch(error => {
          ensuring = false;
          if (!listenerHasResult) fail(version, (error as Error).message);
        });
      stopProfile = onUserProfileChanged(
        user,
        profile => {
          // A new account may not have a document until ensureUserProfile ends.
          if (!profile && ensuring && !listenerHasResult) return;
          listenerHasResult = true;
          accept(profile);
        },
        () => {
          listenerHasResult = true;
          fail(version, 'เข้าสู่ระบบสำเร็จ แต่โหลดโปรไฟล์ไม่สำเร็จ กรุณาลองใหม่ หากยังไม่สำเร็จให้ติดต่อผู้ดูแลระบบเพื่อตรวจสอบสิทธิ์บัญชี');
        },
      );
    });
    // The auth listener above owns profile state, including redirect sign-ins.
    const redirectSession = session.current;
    void completeGoogleRedirect()
      .catch(error => {
        if (isCurrent(redirectSession) && !cloud?.auth.currentUser) fail(redirectSession, (error as Error).message);
      });
    return () => {active = false; ++session.current; clearTimer(); stopProfile?.(); stopAuth();};
  }, [attempt]);

  const retryProfile = () => {
    ++session.current;
    setLoading(true);
    setAuthError('');
    setAttempt(value => value + 1);
  };

  const refreshProfile = async () => {
    // Always read the current Firebase user. The closure can still contain the
    // pre-login null value when a popup resolves and React is re-rendering.
    const version = session.current;
    const profile = await fetchUserProfile(cloud?.auth.currentUser ?? firebaseUser);
    if (session.current === version) setUserProfile(profile);
    return profile;
  };
  const value = {firebaseUser, userProfile, loading, authError, retryProfile, refreshProfile};
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw Error('useAuth ต้องอยู่ภายใน AuthProvider');
  return context;
}

export function navigate(path: string, replace = false) {
  if (replace) window.history.replaceState({}, '', path);
  else window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function usePathname() {
  const [path, setPath] = useState(() => window.location.pathname || '/');
  useEffect(() => {const handler = () => setPath(window.location.pathname || '/'); window.addEventListener('popstate', handler); return () => window.removeEventListener('popstate', handler);}, []);
  return path;
}

export function LoadingScreen({label = 'กำลังตรวจสอบสถานะการเข้าสู่ระบบ…'}: {label?: string}) {
  return <div className="auth-loading"><div className="spinner"/><p>{label}</p></div>;
}

export function ProtectedRoute({children, requireApproved = true, requireRoles}: React.PropsWithChildren<{requireApproved?: boolean; requireRoles?: string[]}>) {
  const {firebaseUser, userProfile, loading, authError} = useAuth();
  const path = usePathname();
  useEffect(() => {
    if (loading || authError) return;
    if (!firebaseUser) navigate('/login', true);
    else if (!userProfile) return;
    else if (userProfile?.status === 'pending' && requireApproved) navigate('/pending', true);
    else if (userProfile?.status === 'rejected') navigate('/login', true);
    else if (requireRoles?.length && !requireRoles.some(role => userProfile?.role.includes(role as never))) navigate('/', true);
  }, [loading, firebaseUser, userProfile, authError, requireApproved, requireRoles, path]);
  if (loading) return <LoadingScreen/>;
  if (authError || (firebaseUser && !userProfile)) return <AccountLoadError/>;
  if (!firebaseUser || !userProfile) return <LoadingScreen/>;
  if (requireApproved && userProfile.status !== 'approved') return <LoadingScreen label="กำลังนำทางไปหน้ารออนุมัติ…"/>;
  if (requireRoles?.length && !requireRoles.some(role => userProfile.role.includes(role as never))) return <LoadingScreen/>;
  return <>{children}</>;
}

function AuthCard({children, title, subtitle}: React.PropsWithChildren<{title: string; subtitle: string}>) {
  return <main className="auth-page"><section className="auth-card"><div className="auth-brand"><span>CMG</span><div>FORMWORK<br/><small>DESIGN WORKSPACE</small></div></div><h1>{title}</h1><p className="auth-subtitle">{subtitle}</p>{children}</section></main>;
}

export function AccountLoadError() {
  const {firebaseUser, authError, retryProfile} = useAuth();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function signOut() {
    setBusy(true);
    try {await logout(); navigate('/login', true); retryProfile();}
    catch (e) {setError((e as Error).message);}
    finally {setBusy(false);}
  }
  return <AuthCard title="โหลดข้อมูลบัญชีไม่สำเร็จ" subtitle="ลองเชื่อมต่อใหม่เพื่อเข้าใช้งาน">
    <div className="auth-error" role="alert">{error || authError || MISSING_PROFILE}</div>
    <button className="btn auth-submit" onClick={retryProfile} disabled={busy}>ลองใหม่</button>
    {firebaseUser && <button className="btn secondary" onClick={() => void signOut()} disabled={busy}>ออกจากระบบ</button>}
  </AuthCard>;
}

export function LoginPage() {
  const {firebaseUser, userProfile, loading, authError} = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {if (authError) setError(authError);}, [authError]);
  useEffect(() => {
    if (loading || !firebaseUser || !userProfile) return;
    if (userProfile.status === 'approved') navigate('/dashboard', true);
    else if (userProfile.status === 'pending') navigate('/pending', true);
    else if (userProfile.status === 'rejected') setError('บัญชีนี้ถูกปฏิเสธการเข้าใช้งาน กรุณาติดต่อผู้ดูแลระบบ');
  }, [loading, firebaseUser, userProfile]);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {await loginWithEmail(email, password);} catch (e) {setError((e as Error).message);} finally {setBusy(false);}
  }
  async function google() {
    setBusy(true); setError('');
    try {await loginWithGoogle();} catch (e) {setError((e as Error).message);} finally {setBusy(false);}
  }
  // Keep the redirect effect mounted while hiding the form for a ready account.
  if (loading || (firebaseUser && userProfile && userProfile.status !== 'rejected')) return <LoadingScreen label="กำลังเปิดหน้าบัญชี…"/>;
  if (firebaseUser && !userProfile) return <AccountLoadError/>;
  return <AuthCard title="เข้าสู่ระบบ" subtitle="ใช้บัญชี Google หรืออีเมลขององค์กรเพื่อเข้าสู่ CMG Formwork">
    {error && <div className="auth-error" role="alert">{error}</div>}
    <form onSubmit={submit} className="auth-form"><label>อีเมล<input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email"/></label><label>รหัสผ่าน<input type="password" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="current-password"/></label><button className="btn auth-submit" disabled={busy}>{busy ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}</button></form>
    <div className="auth-divider"><span>หรือ</span></div><button className="btn google-btn" onClick={() => void google()} disabled={busy}>G <span>เข้าสู่ระบบด้วย Google</span></button>
    <p className="auth-foot">ยังไม่มีบัญชี? <button className="link-btn" onClick={() => navigate('/register')}>สมัครเข้าใช้งาน</button></p>
  </AuthCard>;
}

export function RegisterPage() {
  const {firebaseUser, userProfile, loading} = useAuth();
  const [form, setForm] = useState({email: '', password: '', firstName: '', lastName: '', position: ''});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {if (!loading && firebaseUser && userProfile) navigate(userProfile.status === 'approved' ? '/dashboard' : '/pending', true);}, [loading, firebaseUser, userProfile]);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {await registerWithEmail(form.email, form.password, form.firstName, form.lastName, form.position);} catch (e) {setError((e as Error).message);} finally {setBusy(false);}
  }
  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) => setForm(current => ({...current, [key]: event.target.value}));
  return <AuthCard title="สมัครเข้าใช้งาน" subtitle="ผู้ใช้คนแรกจะถูกกำหนดเป็น MasterAdmin อัตโนมัติ บัญชีถัดไปต้องรอการอนุมัติ">
    {error && <div className="auth-error" role="alert">{error}</div>}
    <form onSubmit={submit} className="auth-form"><div className="auth-grid"><label>ชื่อ<input value={form.firstName} onChange={set('firstName')} required/></label><label>นามสกุล<input value={form.lastName} onChange={set('lastName')} required/></label></div><label>ตำแหน่ง<input value={form.position} onChange={set('position')} required/></label><label>อีเมล<input type="email" value={form.email} onChange={set('email')} required autoComplete="email"/></label><label>รหัสผ่าน<input type="password" minLength={6} value={form.password} onChange={set('password')} required autoComplete="new-password"/></label><button className="btn auth-submit" disabled={busy}>{busy ? 'กำลังสร้างบัญชี…' : 'สมัครเข้าใช้งาน'}</button></form>
    <p className="auth-foot">มีบัญชีแล้ว? <button className="link-btn" onClick={() => navigate('/login')}>เข้าสู่ระบบ</button></p>
  </AuthCard>;
}

export function PendingApprovalPage() {
  const {firebaseUser, userProfile, loading} = useAuth();
  useEffect(() => {
    if (!loading && userProfile?.status === 'approved') navigate('/dashboard', true);
  }, [loading, userProfile]);
  return <ProtectedRoute requireApproved={false}><AuthCard title="รอการอนุมัติ" subtitle="บัญชีของคุณถูกสร้างแล้วและกำลังรอผู้ดูแลตรวจสอบ">
    <div className="pending-icon">✓</div><p className="pending-copy">{userProfile ? `${displayName(userProfile)} · ${userProfile.email}` : firebaseUser?.email}</p><p className="muted">เมื่ออนุมัติแล้ว คุณจะเห็นเฉพาะโครงการที่ MasterAdmin มอบหมายให้</p><button className="btn secondary" onClick={() => void logout().then(() => navigate('/login', true))}>ออกจากระบบ</button>
  </AuthCard></ProtectedRoute>;
}

export function ProfileMenu() {
  const {firebaseUser, userProfile} = useAuth();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({firstName: userProfile?.firstName ?? '', lastName: userProfile?.lastName ?? '', position: userProfile?.position ?? '', department: userProfile?.department ?? 'Other'});
  useEffect(() => {if (userProfile) setForm({firstName: userProfile.firstName, lastName: userProfile.lastName, position: userProfile.position, department: userProfile.department ?? 'Other'});}, [userProfile]);
  if (!userProfile) return null;
  async function save() {if (!firebaseUser) return; setBusy(true); setError(''); try {await updateOwnProfile(firebaseUser, form); setEditing(false);} catch (e) {setError((e as Error).message);} finally {setBusy(false);}}
  return <div className="profile-menu-wrap"><button className="profile-trigger" onClick={() => setOpen(v => !v)} aria-label="เปิดเมนูโปรไฟล์">{userProfile.photoURL ? <img src={userProfile.photoURL} alt=""/> : <span>{userProfile.firstName?.[0] ?? userProfile.email[0]?.toUpperCase()}</span>}<b>{displayName(userProfile)}</b><small>⌄</small></button>{open && <div className="profile-popover"><div className="profile-popover-head">{userProfile.photoURL ? <img src={userProfile.photoURL} alt=""/> : <span>{userProfile.firstName?.[0] ?? 'U'}</span>}<div><strong>{displayName(userProfile)}</strong><small>{userProfile.email}</small></div></div><div className="role-chips">{userProfile.role.map(role => <span key={role}>{role}</span>)}</div>{error && <div className="auth-error">{error}</div>}{editing ? <div className="profile-edit"><label>ชื่อ<input value={form.firstName} onChange={e => setForm({...form, firstName: e.target.value})}/></label><label>นามสกุล<input value={form.lastName} onChange={e => setForm({...form, lastName: e.target.value})}/></label><label>ตำแหน่ง<input value={form.position} onChange={e => setForm({...form, position: e.target.value})}/></label><label>แผนก<select value={form.department} onChange={e => setForm({...form, department: e.target.value})}>{DEPARTMENT_OPTIONS.map(item => <option key={item}>{item}</option>)}</select></label><button className="btn" disabled={busy} onClick={() => void save()}>บันทึกโปรไฟล์</button></div> : <button className="profile-action" onClick={() => setEditing(true)}>แก้ไขข้อมูลของฉัน</button>}<button className="profile-action logout-action" onClick={() => void logout().then(() => navigate('/login', true))}>ออกจากระบบ</button></div>}</div>;
}
