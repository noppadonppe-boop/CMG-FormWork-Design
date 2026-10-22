// @vitest-environment jsdom
import {act} from 'react';
import {webcrypto} from 'node:crypto';
import {TextEncoder} from 'node:util';
import {it, expect, vi} from 'vitest';
import {defaults} from '../src/domain/index';
import {wallDefaults} from '../src/domain/wall';
import {kitDefaults} from '../src/domain/projectKit';

vi.mock('../src/auth', () => {
  const profile = {uid: 'kit-user', email: 'kit@example.com', firstName: 'ทดสอบ', lastName: '', position: 'Engineer', role: ['MasterAdmin'], status: 'approved', assignedProjects: [], photoURL: ''};
  return {AuthProvider: ({children}: {children: unknown}) => children, ProfileMenu: () => null, navigate: () => {}, usePathname: () => '/dashboard',
    useAuth: () => ({firebaseUser: {uid: profile.uid}, userProfile: profile, loading: false, authError: null})};
});
vi.mock('../src/AppRouter', () => ({AppRouter: ({children}: {children: unknown}) => children}));
const button = (text: string, root: ParentNode = document) => [...root.querySelectorAll('button')].find(b => b.textContent?.trim().startsWith(text))!;
const settle = () => act(async () => {await new Promise(r => setTimeout(r, 120));});
const stored = () => JSON.parse(localStorage.getItem('cmg-formwork-demo-v1')!)[0];

it('keeps Design Cases on the project kit: off-kit badge, apply, exception and the kit page', async () => {
  vi.stubGlobal('crypto', webcrypto); vi.stubGlobal('TextEncoder', TextEncoder);
  (globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubEnv('VITE_FIREBASE_ENABLED', 'false');
  const kit = {...kitDefaults, walerSectionId: wallDefaults.walerSectionId};
  const project = {id: 'P1', name: 'โครงการชุดมาตรฐาน', code: 'K-1', kit,
    cases: [{id: 'W1', name: 'W01 · ผนัง', input: {...defaults}, workflowElementType: 'WALL', wall: {...wallDefaults, plywood: 25}},
      {id: 'W2', name: 'W02 · ผนัง', input: {...defaults}, workflowElementType: 'WALL', wall: {...wallDefaults, tieDiameter: 12}}]};
  localStorage.clear(); localStorage.setItem('cmg-formwork-demo-v1', JSON.stringify([project]));
  document.body.innerHTML = '<div id="root"></div>';
  await act(async () => {await import('../src/main');}); await settle();

  // The open case differs in plywood only.
  const badge = () => document.querySelector('.kit-badge')!;
  expect(badge().textContent).toContain('นอกชุดมาตรฐาน K1');
  expect(badge().textContent).toContain('ไม้อัด');
  await act(async () => {button('ใช้ค่าชุดมาตรฐาน').click();}); await settle();
  expect(badge().textContent).toContain('ตรงชุด');

  // The second case keeps its tie as a recorded exception.
  await act(async () => {const s = document.querySelector('.case-selector select') as HTMLSelectElement; s.value = 'W2'; s.dispatchEvent(new Event('change', {bubbles: true}));}); await settle();
  const reason = document.querySelector('input[aria-label="เหตุผลที่ใช้นอกชุดมาตรฐาน"]') as HTMLInputElement;
  await act(async () => {Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(reason, 'Tie ที่มีในไซต์'); reason.dispatchEvent(new Event('input', {bubbles: true}));});
  await act(async () => {button('บันทึกเป็นข้อยกเว้น').click();}); await settle();
  expect(badge().textContent).toContain('ข้อยกเว้น');

  // The kit page lists both cases; applying to all leaves the exception alone.
  await act(async () => {button('ชุดมาตรฐานโครงการ', document.querySelector('aside')!).click();}); await settle();
  const page = document.querySelector('.kit-cases')!;
  expect(page.textContent).toContain('ตรงชุด 1');
  expect(page.textContent).toContain('ข้อยกเว้นที่มีเหตุผล 1');
  await act(async () => {button('ใช้ชุดกับทุก Design Case').click();}); await settle();
  await act(async () => {button('บันทึก', document.querySelector('header')!).click();}); await settle();
  const saved = stored();
  expect(saved.kit.revision).toBe('K1');
  expect(saved.cases[0].wall.plywood).toBe(kit.plywood);
  expect(saved.cases[1].wall.tieDiameter).toBe(12);
  expect(saved.cases[1].kitException).toBe('Tie ที่มีในไซต์');
}, 60000);
