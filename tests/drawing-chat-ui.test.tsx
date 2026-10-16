// @vitest-environment jsdom
import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {expect, it, vi} from 'vitest';
import {DrawingChat} from '../src/components/DrawingChat';
vi.mock('../src/firebase', () => ({configured: true, aiDrawingChat: vi.fn()}));
it('opens a floating dialog, minimizes and reopens without discarding the composer, and supports Escape', async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<DrawingChat projectId="p1" path="drawing" sourceName="plan.pdf" disabled={false}/>));
    const launcher = host.querySelector<HTMLButtonElement>('.chat-launcher')!;
    const panel = host.querySelector<HTMLElement>('[role="dialog"]')!;
    const composer = host.querySelector('textarea');
    expect(panel.hidden).toBe(true);
    await act(async () => launcher.click());
    expect(panel.hidden).toBe(false);
    expect(document.activeElement).toBe(panel);
    expect(launcher.getAttribute('aria-expanded')).toBe('true');
    await act(async () => host.querySelector<HTMLButtonElement>('.chat-minimize')!.click());
    expect(panel.hidden).toBe(true);
    expect(document.activeElement).toBe(launcher);
    await act(async () => launcher.click());
    expect(panel.hidden).toBe(false);
    expect(host.querySelector('textarea')).toBe(composer);
    await act(async () => panel.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true})));
    expect(panel.hidden).toBe(true);
    expect(document.activeElement).toBe(launcher);
  } finally {await act(async () => root.unmount()); host.remove();}
});
it('shows AI model edits as a reviewable table and applies them only on click', async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const {aiDrawingChat} = await import('../src/firebase');
  const {defaults} = await import('../src/domain');
  vi.mocked(aiDrawingChat).mockResolvedValue({text: 'เสนอเพิ่มความลึก', attachments: [], changes: [{field: 'height', value: 1200}], provider: 'openai', model: 'm'});
  const onApply = vi.fn().mockReturnValueOnce('ค่าไม่ถูกต้อง').mockReturnValue(null);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<DrawingChat projectId="p1" path="drawing" sourceName="plan.pdf" disabled={false} model={{...defaults, height: 800}} onApplyChanges={onApply}/>));
    const textarea = host.querySelector('textarea')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(textarea, 'ลึก 1200');
      textarea.dispatchEvent(new Event('input', {bubbles: true}));
    });
    await act(async () => host.querySelector('form')!.dispatchEvent(new Event('submit', {bubbles: true, cancelable: true})));
    expect(vi.mocked(aiDrawingChat).mock.calls[0][3]).toMatchObject({height: 800});
    expect(host.querySelector('.chat-changes')?.textContent).toContain('1200');
    expect(onApply).not.toHaveBeenCalled();
    const apply = () => Array.from(host.querySelectorAll('button')).find(b => b.textContent === 'ใช้การแก้ไขนี้กับโมเดล')!;
    await act(async () => apply().click());
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('ค่าไม่ถูกต้อง');
    await act(async () => apply().click());
    expect(onApply).toHaveBeenLastCalledWith([{field: 'height', value: 1200}], 'ลึก 1200');
    expect(host.textContent).toContain('ใช้กับโมเดลแล้ว');
  } finally {await act(async () => root.unmount()); host.remove();}
});
it('quick prompts ask the AI to use the optimizer and send the project section stock', async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const {aiDrawingChat} = await import('../src/firebase');
  const {defaults} = await import('../src/domain');
  const {QUICK_PROMPTS} = await import('../src/components/DrawingChat');
  vi.mocked(aiDrawingChat).mockReset().mockResolvedValue({text: 'แนะนำทางเลือก 1', attachments: [], changes: [{field: 'plywood', value: 25}], provider: 'openai', model: 'm'});
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<DrawingChat projectId="p1" path="drawing" sourceName="plan.pdf" disabled={false} model={defaults} stockIds={['PAP-TIS107-RHS-100x50x3.2']} onApplyChanges={() => null}/>));
    await act(async () => Array.from(host.querySelectorAll<HTMLButtonElement>('.chat-quick button'))[0].click());
    const [, , messages, model, stock] = vi.mocked(aiDrawingChat).mock.calls[0];
    expect(messages.at(-1)?.text).toBe(QUICK_PROMPTS[0]);
    expect(model).toBe(defaults);
    expect(stock).toEqual(['PAP-TIS107-RHS-100x50x3.2']);
    expect(host.querySelector('.chat-changes')?.textContent).toContain('25');
  } finally {await act(async () => root.unmount()); host.remove();}
});
