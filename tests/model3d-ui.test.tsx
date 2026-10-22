// @vitest-environment jsdom
import React, {act, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {webcrypto} from 'node:crypto';
import {TextEncoder} from 'node:util';
import {describe, expect, it, vi} from 'vitest';
import {calculate, defaults, type Input} from '../src/domain/index';
import {beamDefaults, calculateBeam, type BeamInput} from '../src/domain/beam';
import {calculateSlab, slabDefaults} from '../src/domain/slab';
import {projectExample} from '../src/domain/mockProject';
import type {FormworkModel3D, PartGroup} from '../src/domain/model3d';

// WebGL is not available in jsdom: the viewport renders one button per part so picking can be simulated.
vi.mock('../src/components/ThreeViewport', () => ({
  ThreeViewport: ({model, onPick}: {model: FormworkModel3D; onPick: (g: PartGroup | null, id: string | null) => void}) =>
    <div data-testid="viewport3d">{model.parts.map(p => <button key={p.id} data-part={p.id} onClick={() => onPick(p.group, p.id)}>{p.label}</button>)}</div>,
}));
vi.mock('../src/auth', () => {
  const profile = {uid: 'u1', email: 'eng@example.com', firstName: 'ทดสอบ', lastName: '', position: 'Engineer', role: ['MasterAdmin'], status: 'approved', assignedProjects: [], photoURL: ''};
  return {AuthProvider: ({children}: {children: unknown}) => children, ProfileMenu: () => null, navigate: () => {}, usePathname: () => '/dashboard',
    useAuth: () => ({firebaseUser: {uid: 'u1'}, userProfile: profile, loading: false, authError: null})};
});
vi.mock('../src/AppRouter', () => ({AppRouter: ({children}: {children: unknown}) => children}));
(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true;
const settle = () => act(async () => {await new Promise(r => setTimeout(r, 50));});
const button = (text: string, root: ParentNode = document) => [...root.querySelectorAll('button')].find(b => b.textContent?.trim().startsWith(text)) as HTMLButtonElement;
function typeCommit(label: string, value: string) {
  const el = document.querySelector(`input[aria-label="${label}"]`) as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  setter.call(el, value); el.dispatchEvent(new Event('input', {bubbles: true}));
  return el;
}

describe('3D model workspace', () => {
  it('picks a beam joist, commits a new spacing on Enter only, and rebuilds the model', async () => {
    const {Model3DWorkspace} = await import('../src/components/Model3DWorkspace');
    const changes: BeamInput[] = [];
    function Host() {
      const [x, setX] = useState<BeamInput>({...beamDefaults, confirmed: true});
      return <Model3DWorkspace caseName="B" canEdit onBack={() => {}} target={{element: 'BEAM', input: x, result: calculateBeam(x), error: null, onChange: v => {changes.push(v); setX(v);}}}/>;
    }
    document.body.innerHTML = '<div id="r"></div>';
    await act(async () => {createRoot(document.getElementById('r')!).render(<Host/>);});
    const joists = () => document.querySelectorAll('[data-part^="joist-"]').length;
    const before = joists();
    await act(async () => {(document.querySelector('[data-part="joist-2"]') as HTMLButtonElement).click();});
    expect(document.querySelector('.model3d-editor h3')?.textContent).toContain('คร่าวท้อง');
    expect(document.body.textContent).toContain('ชิ้นที่เลือก');
    // Typing intermediate values does not recalculate; Enter commits.
    const el = typeCommit('ระยะคร่าวท้อง', '1');
    await settle(); expect(changes).toHaveLength(0);
    typeCommit('ระยะคร่าวท้อง', '150');
    await act(async () => {el.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}));});
    expect(changes.at(-1)?.joistSpacing).toBe(150);
    expect(changes.at(-1)?.confirmed).toBe(true); // spacing is not a geometry change
    expect(joists()).toBeGreaterThan(before * 1.8);
    // The governing joist checks of the selected group are listed.
    expect(document.querySelector('.model3d-checks')?.textContent).toMatch(/คร่าว/);
    // Editing concrete dimensions clears the dimension confirmation.
    await act(async () => {button('คอนกรีต', document.querySelector('.model3d-groups')!).click();});
    const b = typeCommit('ความกว้างคาน b', '350');
    await act(async () => {b.dispatchEvent(new FocusEvent('blur', {bubbles: false})); b.dispatchEvent(new FocusEvent('focusout', {bubbles: true}));});
    expect(changes.at(-1)?.b).toBe(350);
    expect(changes.at(-1)?.confirmed).toBe(false);
    // A value the engine cannot calculate is refused with its reason; the model and the input stay as they were.
    await act(async () => {button('คานรับ', document.querySelector('.model3d-groups')!).click();});
    const n = changes.length, w = typeCommit('ระยะระหว่างแนวคานรับ', '100');
    await act(async () => {w.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}));});
    expect(changes).toHaveLength(n);
    expect(document.querySelector('.model3d-editor [role="alert"]')?.textContent).toContain('ไม่ได้ใช้ค่าที่แก้');
    expect(document.querySelectorAll('[data-part^="joist-"]').length).toBeGreaterThan(0);
    // Hiding a group from the list.
    await act(async () => {(document.querySelector('[aria-label="ซ่อน ค้ำยัน"]') as HTMLButtonElement).click();});
    expect(document.querySelector('[aria-label="แสดง ค้ำยัน"]')).toBeTruthy();
  });

  it('footing: tie edits go to the case input; read-only users cannot edit; degenerate layouts are guarded', async () => {
    const {Model3DWorkspace} = await import('../src/components/Model3DWorkspace');
    const got: Partial<Input>[] = [];
    const render = async (canEdit: boolean, input: Input) => {
      document.body.innerHTML = '<div id="r"></div>';
      await act(async () => {createRoot(document.getElementById('r')!).render(<Model3DWorkspace caseName="F" canEdit={canEdit} onBack={() => {}}
        target={{element: 'FOOTING', input, result: calculate(input), error: null, onChange: ch => got.push(ch)}}/>);});
    };
    await render(true, defaults);
    await act(async () => {button('Tie rod', document.querySelector('.model3d-groups')!).click();});
    const el = typeCommit('ระยะ Tie สูงสุด', '500');
    await act(async () => {el.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}));});
    expect(got.at(-1)).toEqual({tieSpacing: 500});
    await render(false, defaults);
    await act(async () => {button('Tie rod', document.querySelector('.model3d-groups')!).click();});
    expect((document.querySelector('input[aria-label="ระยะ Tie สูงสุด"]') as HTMLInputElement).disabled).toBe(true);
    expect(document.body.textContent).toContain('สิทธิ์ดูอย่างเดียว');
    // Engine errors are shown instead of the model.
    document.body.innerHTML = '<div id="r"></div>';
    await act(async () => {createRoot(document.getElementById('r')!).render(<Model3DWorkspace caseName="F" canEdit onBack={() => {}}
      target={{element: 'FOOTING', input: defaults, result: null, error: 'จำนวนช่วงเกิน 200', onChange: () => {}}}/>);});
    expect(document.body.textContent).toContain('จำนวนช่วงเกิน 200');
    // A valid but very dense layout (18,225 shores) is not sent to WebGL.
    const dense = {...slabDefaults, lx: 20000, ly: 20000, shoreSpacing: 150, bearerSpacing: 150};
    document.body.innerHTML = '<div id="r"></div>';
    await act(async () => {createRoot(document.getElementById('r')!).render(<Model3DWorkspace caseName="S" canEdit onBack={() => {}}
      target={{element: 'SLAB', input: dense, result: calculateSlab(dense), error: null, onChange: () => {}}}/>);});
    expect(document.body.textContent).toContain('ชิ้นส่วนมากเกินไป');
    expect(document.querySelector('[data-testid="viewport3d"]')).toBeNull();
  });

  it('keeps the model when a footing stud section is changed (catalogue id fills B/H/t) and rejects invalid edits', async () => {
    vi.stubGlobal('crypto', webcrypto); vi.stubGlobal('TextEncoder', TextEncoder);
    vi.stubEnv('VITE_FIREBASE_ENABLED', 'false'); vi.stubEnv('VITE_WORKFLOW_V07_ENABLED', 'true');
    vi.resetModules();
    const project = projectExample(); project.cases = project.cases.filter(c => c.name.includes(' F01 '));
    localStorage.clear(); localStorage.setItem('cmg-formwork-demo-v1', JSON.stringify([project]));
    document.body.innerHTML = '<div id="root"></div>';
    await act(async () => {await import('../src/main');});
    await act(async () => {button('รูปทรงและมิติ', document.querySelector('nav')!).click();});
    await act(async () => {(document.querySelector('button.model3d-open') as HTMLButtonElement).click();});
    for (let i = 0; i < 40 && !document.querySelector('[data-testid="viewport3d"]'); i++) await settle();
    await act(async () => {(document.querySelector('[data-part^="stud_"]') as HTMLButtonElement).click();});
    const size = document.querySelector('select[aria-label="ขนาดคร่าว"]') as HTMLSelectElement;
    const other = [...size.options].find(o => o.value !== size.value)!.value;
    await act(async () => {size.value = other; size.dispatchEvent(new Event('change', {bubbles: true}));});
    // Before the fix only the id changed, B/H/t stayed and the engine refused to build the model.
    expect(document.querySelector('[data-testid="viewport3d"]')).toBeTruthy();
    expect(document.querySelector('.model3d-stage .warning')).toBeNull();
    expect((document.querySelector('select[aria-label="ขนาดคร่าว"]') as HTMLSelectElement).value).toBe(other);
    // An invalid value is rejected with a message and the model stays.
    const el = typeCommit('ระยะคร่าวสูงสุด', '0');
    await act(async () => {el.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}));});
    expect(document.querySelector('.toast')?.textContent).toContain('แก้ไขไม่ได้');
    expect(document.querySelector('[data-testid="viewport3d"]')).toBeTruthy();
  }, 60000);

  it('a 3D edit that is saved shows on the layout page, including the Project Example v0.7 draft', async () => {
    vi.stubGlobal('crypto', webcrypto); vi.stubGlobal('TextEncoder', TextEncoder);
    vi.stubEnv('VITE_FIREBASE_ENABLED', 'false'); vi.stubEnv('VITE_WORKFLOW_V07_ENABLED', 'true');
    vi.resetModules();
    const project = projectExample(); project.cases = project.cases.filter(c => c.name.includes(' F01 '));
    localStorage.clear(); localStorage.setItem('cmg-formwork-demo-v1', JSON.stringify([project]));
    document.body.innerHTML = '<div id="root"></div>';
    await act(async () => {await import('../src/main');});
    await act(async () => {button('รูปทรงและมิติ', document.querySelector('nav')!).click();});
    await act(async () => {(document.querySelector('button.model3d-open') as HTMLButtonElement).click();});
    for (let i = 0; i < 40 && !document.querySelector('[data-testid="viewport3d"]'); i++) await settle();
    await act(async () => {(document.querySelector('[data-part^="plywood_"]') as HTMLButtonElement).click();});
    const el = typeCommit('ความหนาไม้อัด', '25');
    await act(async () => {el.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}));});
    await act(async () => {button('จัดวางเบื้องต้น', document.querySelector('nav')!).click();});
    await act(async () => {button('บันทึกการแก้ไข').click();});
    // The editable layout field shows the 3D value immediately…
    expect(([...document.querySelectorAll('input')].find(i => i.type === 'number' && i.closest('label')?.querySelector('span')?.firstChild?.textContent === 'ไม้อัด') as HTMLInputElement).value).toBe('25');
    // …and the generated v0.7 draft follows shortly after (debounced regeneration).
    const draftCell = () => [...document.querySelectorAll('.v07-layout-compare tr')].find(tr => tr.textContent?.includes('ความหนาไม้อัด'));
    for (let i = 0; i < 80 && !draftCell()?.textContent?.includes('2525'); i++) await settle();
    expect(draftCell()?.textContent).toContain('2525ตรงกัน');
    expect(document.body.textContent).toContain('ปรับตามค่าในหน้ารูปทรง/จัดวาง และโมเดล 3D อัตโนมัติ');
  }, 60000);

  it('lists the editable groups when the model cannot be built, so the value can be corrected', async () => {
    const {Model3DWorkspace} = await import('../src/components/Model3DWorkspace');
    document.body.innerHTML = '<div id="r"></div>';
    await act(async () => {createRoot(document.getElementById('r')!).render(<Model3DWorkspace caseName="F" canEdit onBack={() => {}}
      target={{element: 'FOOTING', input: defaults, result: null, error: 'ขนาดคร่าวไม่ตรงกับหน้าตัดจากตาราง', onChange: () => {}}}/>);});
    expect(document.body.textContent).toContain('สร้างโมเดลไม่ได้');
    await act(async () => {button('คร่าว', document.querySelector('.model3d-groups')!).click();});
    expect(document.querySelector('select[aria-label="ขนาดคร่าว"]')).toBeTruthy();
  });

  it('opens at the top of the page, keeps edits as a draft and asks to save or discard when leaving', async () => {
    vi.stubGlobal('crypto', webcrypto); vi.stubGlobal('TextEncoder', TextEncoder);
    vi.stubEnv('VITE_FIREBASE_ENABLED', 'false'); vi.stubEnv('VITE_WORKFLOW_V07_ENABLED', 'true');
    vi.resetModules();
    const project = projectExample(); project.cases = project.cases.filter(c => c.name.includes(' S01 ') || c.name.includes(' B01 '));
    project.cases.sort((a, b) => a.name.includes(' S01 ') ? -1 : b.name.includes(' S01 ') ? 1 : 0);
    const original = project.cases[0].slab!.bearerSpacing;
    localStorage.clear(); localStorage.setItem('cmg-formwork-demo-v1', JSON.stringify([project]));
    const stored = () => JSON.parse(localStorage.getItem('cmg-formwork-demo-v1')!)[0].cases.find((c: {name: string}) => c.name.includes(' S01 ')).slab.bearerSpacing;
    document.body.innerHTML = '<div id="root"></div>';
    await act(async () => {await import('../src/main');});
    const open = async () => {
      await act(async () => {button('รูปทรงและมิติ', document.querySelector('nav')!).click();});
      await act(async () => {(document.querySelector('button.model3d-open') as HTMLButtonElement).click();});
      for (let i = 0; i < 40 && !document.querySelector('[data-testid="viewport3d"]'); i++) await settle();
    };
    const editBearers = async (v: string) => {
      await act(async () => {(document.querySelector('[data-part^="bearer-"]') as HTMLButtonElement).click();});
      const el = typeCommit('ระยะคานรับ', v);
      await act(async () => {el.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}));});
    };
    const layoutValue = async () => {
      await act(async () => {button('จัดวางเบื้องต้น', document.querySelector('nav')!).click();});
      return ([...document.querySelectorAll('input')].find(i => i.getAttribute('aria-label')?.includes('ระยะคานรับ')) as HTMLInputElement).value;
    };
    expect(document.querySelector('button.model3d-open')).toBeNull();
    await open();
    // The 3D page sits directly under the page header: no case bar, connection notice, backup bar or case message.
    expect(document.querySelector('h1')?.textContent).toBe('โมเดล 3D แบบหล่อ');
    expect(document.querySelector('main > header')!.nextElementSibling?.classList.contains('model3d-workspace')).toBe(true);
    for (const sel of ['.case-bar', '.backup-bar', '.notice.cloud-trial', '.toast']) expect(document.querySelector(sel), sel).toBeNull();
    expect(document.querySelector('.model3d-workspace h2')?.textContent).toContain('พื้น');
    // Edits update the model immediately but are not persisted until the user decides.
    await editBearers('900');
    expect(document.body.textContent).toContain('มีการแก้ไขที่ยังไม่บันทึก');
    await settle(); expect(stored()).toBe(original);
    // Close → discard restores the values from when the model was opened.
    await act(async () => {button('ปิดโมเดล').click();});
    expect(document.querySelector('[role="alertdialog"]')?.textContent).toContain('บันทึกการแก้ไขจากโมเดล 3D หรือไม่');
    await act(async () => {button('ไม่บันทึก').click();});
    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
    expect(document.querySelector('h1')?.textContent).toBe('รูปทรงและมิติ');
    expect(await layoutValue()).toBe(String(original));
    // Leaving through the sidebar asks too; "keep editing" stays, "save" persists and continues.
    await open(); await editBearers('900');
    await act(async () => {button('จัดวางเบื้องต้น', document.querySelector('nav')!).click();});
    await act(async () => {button('แก้ไขต่อ').click();});
    expect(document.querySelector('h1')?.textContent).toBe('โมเดล 3D แบบหล่อ');
    await act(async () => {button('จัดวางเบื้องต้น', document.querySelector('nav')!).click();});
    await act(async () => {button('บันทึกการแก้ไข').click();});
    await settle();
    expect(document.querySelector('h1')?.textContent).toBe('จัดวางเบื้องต้น');
    expect(([...document.querySelectorAll('input')].find(i => i.getAttribute('aria-label')?.includes('ระยะคานรับ')) as HTMLInputElement).value).toBe('900');
    expect(stored()).toBe(900);
    // Inside the 3D page the element buttons open that element's model; without edits there is no prompt.
    await open();
    await act(async () => {button('คาน', document.querySelector('.element-workflow-nav')!).click();});
    for (let i = 0; i < 20 && !document.querySelector('.model3d-workspace h2')?.textContent?.includes('คาน'); i++) await settle();
    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
    expect(document.querySelector('.model3d-workspace h2')?.textContent).toContain('คาน');
    expect(document.querySelector('[data-part^="joist-"]')).toBeTruthy();
  }, 60000);
});
