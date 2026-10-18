// @vitest-environment jsdom
import {act} from 'react';
import {describe, expect, it, vi} from 'vitest';

(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true;
// Signed-in, approved local user; storage stays offline (Firebase disabled below).
vi.mock('../src/auth', () => {
  const profile = {uid: 'u1', email: 'eng@example.com', firstName: 'ทดสอบ', lastName: '', position: 'Engineer', role: ['MasterAdmin'], status: 'approved', assignedProjects: [], photoURL: ''};
  return {AuthProvider: ({children}: {children: unknown}) => children, ProfileMenu: () => null, navigate: () => {}, usePathname: () => '/dashboard',
    useAuth: () => ({firebaseUser: {uid: 'u1'}, userProfile: profile, loading: false, authError: null})};
});
vi.mock('../src/AppRouter', () => ({AppRouter: ({children}: {children: unknown}) => children}));
const wait = () => new Promise(r => setTimeout(r, 0));
const button = (text: string, root: ParentNode = document) => [...root.querySelectorAll('button')].find(b => b.textContent?.trim().startsWith(text)) as HTMLButtonElement;

describe('beam workflow inside the app (offline)', () => {
  it('opens a beam case and walks geometry → criteria → layout → results → drawings → report', async () => {
    vi.stubEnv('VITE_FIREBASE_ENABLED', 'false');
    localStorage.clear();
    window.print = () => {};
    document.body.innerHTML = '<div id="root"></div>';
    await act(async () => {await import('../src/main'); await wait();});
    await act(async () => {button('คาน', document.querySelector('.element-menu')!).click(); await wait();});
    await act(async () => {button('รูปทรงและมิติ', document.querySelector('nav')!).click(); await wait();});
    const b = document.querySelector('input[aria-label="ความกว้างคาน b"]') as HTMLInputElement;
    expect(b).toBeTruthy();
    expect(b.value).toBe('300');
    await act(async () => {button('Design Criteria', document.querySelector('nav')!).click(); await wait();});
    expect(document.body.textContent).toContain('ACI PRC-347-14(21) §4.2.1');
    await act(async () => {button('จัดวางเบื้องต้น', document.querySelector('nav')!).click(); await wait();});
    expect(document.querySelector('select[aria-label="ขนาดคร่าวท้องคาน"]')).toBeTruthy();
    await act(async () => {button('รายการคำนวณ', document.querySelector('nav')!).click(); await wait();});
    expect(document.body.textContent).toContain('ค้ำยัน: แรงอัดต่อต้น');
    await act(async () => {button('แปลนและรูปตัด', document.querySelector('nav')!).click(); await wait();});
    expect(document.querySelectorAll('svg.a3-sheet').length).toBe(3);
    await act(async () => {button('รายงาน PDF', document.querySelector('nav')!).click(); await wait();});
    expect(document.body.textContent).toContain('รายการคำนวณออกแบบแบบหล่อคาน');
    expect(document.body.textContent).not.toContain('รายการคำนวณ legacy ไม่รองรับชนิดนี้');
    const saved = JSON.parse(localStorage.getItem('cmg-formwork-demo-v1') || '[]');
    expect(saved.length).toBeGreaterThan(0);
  });
});
