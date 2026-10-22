// @vitest-environment jsdom
import {act} from 'react';
import {webcrypto} from 'node:crypto';
import {TextEncoder} from 'node:util';
import {it, expect, vi} from 'vitest';
import {defaults} from '../src/domain/index';

vi.mock('../src/auth', () => {
  const profile = {uid: 'u1', email: 'u1@example.com', firstName: 'ทดสอบ', lastName: '', position: 'Engineer', role: ['MasterAdmin'], status: 'approved', assignedProjects: [], photoURL: ''};
  return {AuthProvider: ({children}: {children: unknown}) => children, ProfileMenu: () => null, navigate: () => {}, usePathname: () => '/dashboard',
    useAuth: () => ({firebaseUser: {uid: profile.uid}, userProfile: profile, loading: false, authError: null})};
});
vi.mock('../src/AppRouter', () => ({AppRouter: ({children}: {children: unknown}) => children}));
const settle = () => act(async () => {await new Promise(r => setTimeout(r, 120));});
const element = (label: string) => [...document.querySelectorAll('.element-workflow-nav button')].find(b => b.textContent?.trim().startsWith(label)) as HTMLButtonElement;
const options = () => [...(document.querySelector('.case-selector select') as HTMLSelectElement).options].map(o => o.textContent);

it('lists only the Design Cases of the selected element and flags a name that points to another element', async () => {
  vi.stubGlobal('crypto', webcrypto); vi.stubGlobal('TextEncoder', TextEncoder); vi.stubGlobal('confirm', () => true);
  (globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubEnv('VITE_FIREBASE_ENABLED', 'false');
  const column = {...defaults, kind: 'COLUMN' as const, width: 600, length: 600, height: 3000, armX: 300, armY: 300};
  const project = {id: 'P1', name: 'กรองประเภท', code: 'T-1', cases: [
    {id: 'F01', name: 'F01 · ฐานราก', input: {...defaults}, workflowElementType: 'FOOTING'},
    {id: 'C01', name: 'C01 · เสา', input: column, workflowElementType: 'COLUMN'},
    {id: 'B02', name: 'B02test · คาน', input: column, workflowElementType: 'COLUMN'}]};
  localStorage.clear(); localStorage.setItem('cmg-formwork-demo-v1', JSON.stringify([project]));
  document.body.innerHTML = '<div id="root"></div>';
  await act(async () => {await import('../src/main');}); await settle();

  expect(options()).toEqual(['F01 · ฐานราก']);
  expect(element('เสา').textContent).toContain('2');
  await act(async () => {element('เสา').click();}); await settle();
  expect(options()).toEqual(['C01 · เสา', 'B02test · คาน ⚠ ชื่อเป็นคาน']);

  // Fix the stored type from the name: the case moves to the beam list.
  await act(async () => {const s = document.querySelector('.case-selector select') as HTMLSelectElement; s.value = 'B02'; s.dispatchEvent(new Event('change', {bubbles: true}));}); await settle();
  const fix = [...document.querySelectorAll('button')].find(b => b.textContent?.includes('ใช้ประเภทจากชื่อ'))!;
  await act(async () => {fix.click();}); await settle();
  expect(options()).toEqual(['B02test · คาน']);
  expect(element('คาน').className).toContain('selected');
  await act(async () => {element('เสา').click();}); await settle();
  expect(options()).toEqual(['C01 · เสา']);
}, 60000);
