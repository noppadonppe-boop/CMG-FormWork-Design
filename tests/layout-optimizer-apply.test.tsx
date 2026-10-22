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
const button = (text: string, root: ParentNode = document) => [...root.querySelectorAll('button')].find(b => b.textContent?.trim().startsWith(text)) as HTMLButtonElement;

it('explains why "ใช้ทางเลือกนี้" is blocked, confirms the dimensions in place, then applies an alternative to the case', async () => {
  vi.stubGlobal('crypto', webcrypto); vi.stubGlobal('TextEncoder', TextEncoder);
  vi.stubEnv('VITE_FIREBASE_ENABLED', 'false'); vi.stubEnv('VITE_WORKFLOW_V07_ENABLED', 'true');
  const project = projectExample(); project.cases = project.cases.filter(c => c.name.includes(' F01 '));
  expect(project.cases[0].input.confirmed).toBe(false); // the example ships unconfirmed on purpose
  localStorage.clear(); localStorage.setItem('cmg-formwork-demo-v1', JSON.stringify([project]));
  document.body.innerHTML = '<div id="root"></div>';
  await act(async () => {await import('../src/main');});
  await act(async () => {button('จัดวางเบื้องต้น', document.querySelector('nav')!).click();});
  const optimizer = () => document.querySelector('.optimizer')!;
  const applyButtons = () => [...optimizer().querySelectorAll('button')].filter(b => b.textContent === 'ใช้ทางเลือกนี้');
  // Blocked: the reason and the current dimensions are shown above the alternatives, and on each disabled button.
  expect(applyButtons().length).toBeGreaterThan(0);
  expect(applyButtons().every(b => b.disabled)).toBe(true);
  expect(optimizer().querySelector('.optimizer-blocked')?.textContent).toContain('ยังไม่ได้ยืนยันรูปทรงและมิติ');
  expect(optimizer().querySelector('.optimizer-blocked')?.textContent).toContain('2,000 × 2,000 mm');
  expect(applyButtons()[0].title).toContain('ยังไม่ได้ยืนยัน');
  // Confirm in place → the buttons work.
  await act(async () => {button('ตรวจแล้ว ยืนยันมิติ', optimizer()).click();});
  expect(optimizer().querySelector('.optimizer-blocked')).toBeNull();
  expect(applyButtons().every(b => !b.disabled)).toBe(true);
  // Applying an alternative writes its values to the case (the manual fields show them) and the row becomes the current value.
  const row = applyButtons()[0].closest('tr')!, plywood = row.children[1].textContent!.replace(' mm', ''), studAt = row.children[2].querySelector('small')!.textContent!.replace('@ ', '');
  await act(async () => {applyButtons()[0].click();});
  const field = [...document.querySelectorAll('input')].find(i => i.type === 'number' && i.closest('label')?.querySelector('span')?.firstChild?.textContent === 'ไม้อัด') as HTMLInputElement;
  expect(field.value).toBe(plywood);
  expect(document.querySelector('.toast')?.textContent).toContain('ปรับอัตโนมัติ');
  const studField = [...document.querySelectorAll('input')].find(i => i.closest('label')?.querySelector('span')?.firstChild?.textContent === 'ระยะคร่าวสูงสุดที่ขอ') as HTMLInputElement;
  expect(studField.value).toBe(studAt);
  // The user's own choice is always the last row, recalculated like the alternatives.
  const mine = () => optimizer().querySelector('tr.optimizer-mine')!;
  expect(mine().textContent).toContain('ค่าที่เลือกอยู่');
  expect(mine().children[1].textContent).toBe(`${plywood} mm`);
  expect(mine().children[2].textContent).toContain(`@ ${studAt}`);
  expect(mine().children[5].textContent).toMatch(/^\d+\.\d{2}/);
  expect(mine().textContent).toContain('ใช้อยู่');
  // A manual edit updates that row (ratio included).
  const before = mine().children[5].textContent;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => {setter.call(studField, '600'); studField.dispatchEvent(new Event('input', {bubbles: true}));});
  expect(mine().children[2].textContent).toContain('@ 600');
  expect(mine().children[5].textContent).not.toBe(before);
}, 60000);
