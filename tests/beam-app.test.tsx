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
    // The demo has no beam/slab/wall case: the element buttons offer to create one (they never retype the open footing).
    window.confirm = () => true;
    window.prompt = (_m?: string, value?: string) => value ?? null;
    document.body.innerHTML = '<div id="root"></div>';
    await act(async () => {await import('../src/main'); await wait();});
    const caseSelect = () => document.querySelector('.case-selector select') as HTMLSelectElement;
    const footingId = caseSelect().value, footingName = caseSelect().selectedOptions[0].textContent;
    await act(async () => {button('คาน', document.querySelector('.element-menu')!).click(); await wait();});
    expect(caseSelect().value).not.toBe(footingId);
    expect(caseSelect().selectedOptions[0].textContent).toMatch(/^B\d+/);
    expect([...caseSelect().options].find(o => o.value === footingId)?.textContent).toBe(footingName);
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
    // Slab: same menus, slab screens.
    await act(async () => {button('พื้น', document.querySelector('.element-menu')!).click(); await wait();});
    await act(async () => {button('รูปทรงและมิติ', document.querySelector('nav')!).click(); await wait();});
    // A new slab case starts from the slab defaults.
    expect((document.querySelector('input[aria-label="ความหนาพื้น"]') as HTMLInputElement).value).toBe('150');
    await act(async () => {button('รายการคำนวณ', document.querySelector('nav')!).click(); await wait();});
    expect(document.body.textContent).toContain('ไม้อัดท้องพื้น');
    await act(async () => {button('แปลนและรูปตัด', document.querySelector('nav')!).click(); await wait();});
    expect(document.body.textContent).toContain('SF-02');
    await act(async () => {button('รายงาน PDF', document.querySelector('nav')!).click(); await wait();});
    expect(document.body.textContent).toContain('รายการคำนวณออกแบบแบบหล่อพื้น');
    // Wall: same menus, wall screens.
    await act(async () => {button('ผนัง', document.querySelector('.element-menu')!).click(); await wait();});
    await act(async () => {button('จัดวางเบื้องต้น', document.querySelector('nav')!).click(); await wait();});
    expect(document.querySelector('input[aria-label="ระยะ Tie สูงสุด"]')).toBeTruthy();
    await act(async () => {button('รายการคำนวณ', document.querySelector('nav')!).click(); await wait();});
    expect(document.body.textContent).toContain('ค้ำยันเอียง');
    await act(async () => {button('แปลนและรูปตัด', document.querySelector('nav')!).click(); await wait();});
    expect(document.body.textContent).toContain('WF-02');
    await act(async () => {button('รายงาน PDF', document.querySelector('nav')!).click(); await wait();});
    expect(document.body.textContent).toContain('รายการคำนวณออกแบบแบบหล่อผนัง');
    // Short report option: same menu, governing members only; the choice stays when switching element.
    await act(async () => {button('แบบย่อ', document.querySelector('.report-tools')!).click(); await wait();});
    expect(document.body.textContent).toContain('รายการคำนวณแบบหล่อผนัง (แบบย่อ)');
    expect(document.body.textContent).toContain('การเลือกองค์อาคารควบคุม');
    await act(async () => {button('English', document.querySelector('.report-tools')!).click(); await wait();});
    expect(document.body.textContent).toContain('Wall formwork calculation (short)');
    // Only user data (project / case / signer names in the header and signature blocks) may stay Thai.
    const body = document.querySelector('.short-report')!.cloneNode(true) as HTMLElement;
    body.querySelectorAll('.sr-head, .sr-sign').forEach(e => e.remove());
    expect(body.textContent).not.toMatch(/[฀-๿]/);
    await act(async () => {button('ไทย', document.querySelector('.report-tools')!).click(); await wait();});
    await act(async () => {button('พื้น', document.querySelector('.element-menu')!).click(); await wait();});
    await act(async () => {button('รายงาน PDF', document.querySelector('nav')!).click(); await wait();});
    expect(document.body.textContent).toContain('รายการคำนวณแบบหล่อพื้น (แบบย่อ)');
    await act(async () => {button('ฉบับเต็ม', document.querySelector('.report-tools')!).click(); await wait();});
    expect(document.body.textContent).toContain('รายการคำนวณออกแบบแบบหล่อพื้น');
  }, 20000); // walks every menu of three systems (~5 s here)
});
