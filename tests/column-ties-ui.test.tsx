// @vitest-environment jsdom
import {act} from 'react';
import {webcrypto} from 'node:crypto';
import {TextEncoder} from 'node:util';
import {expect, it, vi} from 'vitest';
import {projectExample} from '../src/domain/mockProject';

vi.mock('../src/auth', () => {
  const profile = {uid: 'u1', email: 'eng@example.com', firstName: 'ทดสอบ', lastName: '', position: 'Engineer', role: ['MasterAdmin'], status: 'approved', assignedProjects: [], photoURL: ''};
  return {AuthProvider: ({children}: {children: unknown}) => children, ProfileMenu: () => null, navigate: () => {}, usePathname: () => '/dashboard',
    useAuth: () => ({firebaseUser: {uid: 'u1'}, userProfile: profile, loading: false, authError: null})};
});
vi.mock('../src/AppRouter', () => ({AppRouter: ({children}: {children: unknown}) => children}));
(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true;
const nav = (text: string) => [...document.querySelectorAll('aside nav button')].find(b => b.textContent?.trim() === text) as HTMLButtonElement;

it('column: choose external yoke or through ties on the geometry page', async () => {
  vi.stubGlobal('crypto', webcrypto); vi.stubGlobal('TextEncoder', TextEncoder);
  vi.stubEnv('VITE_FIREBASE_ENABLED', 'false'); vi.stubEnv('VITE_WORKFLOW_V07_ENABLED', 'false');
  const project = projectExample(); project.cases = project.cases.filter(c => c.name.includes(' C01 ') || c.name.includes(' F01 '));
  project.cases.sort(a => a.name.includes(' C01 ') ? -1 : 1);
  localStorage.clear(); localStorage.setItem('cmg-formwork-demo-v1', JSON.stringify([project]));
  document.body.innerHTML = '<div id="root"></div>';
  await act(async () => {await import('../src/main');});
  await act(async () => {nav('รูปทรงและมิติ').click();});
  const picker = () => document.querySelector('select[aria-label="ระบบยึดแบบเสา"]') as HTMLSelectElement | null;
  expect(picker()?.value).toBe('YOKE');
  const label = (t: string) => [...document.querySelectorAll('label span')].some(s => s.firstChild?.textContent === t);
  await act(async () => {nav('จัดวางเบื้องต้น').click();});
  expect(label('ระยะ Tie สูงสุดที่ขอ')).toBe(false);
  expect(document.body.textContent).toContain('เสาแบบวงรัดภายนอกไม่ใช้ Tie');
  await act(async () => {nav('Design Criteria').click();});
  expect(document.body.textContent).not.toContain('Tie rod (对拉螺杆) · Design parameters');
  await act(async () => {nav('รูปทรงและมิติ').click();});
  await act(async () => {const s = picker()!; s.value = 'TIES'; s.dispatchEvent(new Event('change', {bubbles: true}));});
  expect(picker()!.value).toBe('TIES');
  expect(document.body.textContent).toContain('Tie ทะลุเสาตามระยะ Tie');
  await act(async () => {nav('Design Criteria').click();});
  expect(document.body.textContent).toContain('Tie rod (对拉螺杆) · Design parameters');
  await act(async () => {nav('รายการคำนวณ').click();});
  expect(document.body.textContent).toContain('Tie: ตัวเหล็กก่อนทำเกลียว');
  expect(document.body.textContent).toContain('ชุดรัดเสา');
  // Layout page: tie spacing / Ø become editable; the plan sketch shows the tie lines.
  await act(async () => {nav('จัดวางเบื้องต้น').click();});
  expect(label('ระยะ Tie สูงสุดที่ขอ')).toBe(true);
  expect(label('Tie ตัวเหล็ก Ø')).toBe(true);
  await act(async () => {nav('ภาพรวม').click();});
  expect(document.querySelectorAll('svg line[stroke-dasharray="6 4"]').length).toBeGreaterThan(0);
  // Drawings: tie rods in the BOM and the system in the design data; report heading.
  await act(async () => {nav('แปลนและรูปตัด').click();});
  expect(document.body.textContent).toContain('Tie rod ทะลุ');
  expect(document.body.textContent).toContain('Tie ทะลุเสา + วงรัดมุม');
  await act(async () => {nav('รายงาน PDF').click();});
  expect(document.body.textContent).toContain('Tie rod + ชุดรัดเสา (Column yoke)');
  // Saved with the case (offline storage) and restored on reload of the data.
  const saved = JSON.parse(localStorage.getItem('cmg-formwork-demo-v1')!)[0].cases.find((c: {name: string}) => c.name.includes(' C01 '));
  expect(saved.input.columnTies).toBe(true);
  // Footings always use ties: no column selector there.
  await act(async () => {const s = document.querySelector('.case-selector select') as HTMLSelectElement; s.value = project.cases[1].id; s.dispatchEvent(new Event('change', {bubbles: true}));});
  await act(async () => {nav('รูปทรงและมิติ').click();});
  expect(picker()).toBeNull();
}, 60000);
