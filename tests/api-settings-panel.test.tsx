// @vitest-environment jsdom
import React, {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {AI_PROVIDERS, DEFAULT_AI_MODELS} from '../src/aiModels';
import {ApiSettingsPanel} from '../src/components/ApiSettingsPanel';
import type {AiSettingsPublic} from '../src/firebase';

const services = vi.hoisted(() => ({get: vi.fn(), save: vi.fn()}));
vi.mock('../src/firebase', async () => ({
  AI_PROVIDERS: (await import('../src/aiModels')).AI_PROVIDERS,
  getAiSettings: services.get, saveAiSettings: services.save,
}));
let host: HTMLDivElement;
let root: Root;
let settings: AiSettingsPublic;

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  settings = {
    activeProvider: 'openai', defaultModels: DEFAULT_AI_MODELS,
    providers: Object.fromEntries(AI_PROVIDERS.map(name => [name, {model: DEFAULT_AI_MODELS[name], effort: 'medium', hasKey: true, keyHint: '••••1234'}])) as AiSettingsPublic['providers'],
  };
  services.get.mockImplementation(async () => settings);
  services.save.mockImplementation(async patch => ({...settings, providers: Object.fromEntries(AI_PROVIDERS.map(name => [name, {...settings.providers[name], model: patch.providers[name].model, effort: patch.providers[name].effort ?? settings.providers[name].effort}]))}));
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
const select = (name: string) => host.querySelector<HTMLSelectElement>(`select[aria-label="โมเดล ${name}"]`)!;
async function choose(name: string, model: string) {
  await act(async () => {
    select(name).value = model;
    select(name).dispatchEvent(new Event('change', {bubbles: true}));
  });
}
async function save() {
  await act(async () => Array.from(host.querySelectorAll('button')).find(button => button.textContent === 'บันทึกการตั้งค่า API')!.click());
}

it('shows all 29 catalogue choices in grouped dropdowns and saves the selected model without replacing keys', async () => {
  await act(async () => root.render(<ApiSettingsPanel/>));
  expect(select('OpenAI').options).toHaveLength(11); // 10 models + custom
  expect(select('Google').options).toHaveLength(11);
  expect(select('Anthropic').options).toHaveLength(10);
  expect(select('Google').querySelector('optgroup[label="Preview"]')).not.toBeNull();
  await choose('OpenAI', 'gpt-5.6-terra');
  expect(host.querySelector<HTMLSelectElement>('select[aria-label="ระดับการคิด OpenAI"]')!.options).toHaveLength(6);
  await act(async () => {
    const effort = host.querySelector<HTMLSelectElement>('select[aria-label="ระดับการคิด OpenAI"]')!;
    effort.value = 'xhigh';
    effort.dispatchEvent(new Event('change', {bubbles: true}));
  });
  await save();
  expect(services.save.mock.calls[0][0].providers.openai).toEqual({model: 'gpt-5.6-terra', effort: 'xhigh'});
  expect(host.querySelector<HTMLInputElement>('input[type="password"]')!.value).toBe('');
});

it('loads a saved custom model, edits it and keeps it after saving', async () => {
  settings.providers.google.model = 'custom-vision-v1';
  settings.providers.google.effort = 'high';
  await act(async () => root.render(<ApiSettingsPanel/>));
  expect(select('Google').value).toBe('__custom__');
  const input = Array.from(host.querySelectorAll<HTMLInputElement>('input')).find(input => input.value === 'custom-vision-v1')!;
  expect(input).toBeDefined();
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'custom-vision-v2');
    input.dispatchEvent(new Event('input', {bubbles: true}));
  });
  await save();
  expect(services.save.mock.calls[0][0].providers.google).toEqual({model: 'custom-vision-v2', effort: 'high'});
  expect(select('Google').value).toBe('__custom__');
  expect(Array.from(host.querySelectorAll<HTMLInputElement>('input')).some(input => input.value === 'custom-vision-v2')).toBe(true);
});

it('loads and submits an additional prompt without including stored API keys', async () => {
  settings.prompt = 'อ่านเฉพาะฐานราก F01';
  await act(async () => root.render(<ApiSettingsPanel/>));
  const input = host.querySelector<HTMLTextAreaElement>('textarea')!;
  expect(input.value).toBe(settings.prompt);
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(input, 'อ่านฐานราก F02\nตอบ unknowns เป็นภาษาไทย');
    input.dispatchEvent(new Event('input', {bubbles: true}));
  });
  await save();
  expect(services.save.mock.calls[0][0].prompt).toBe('อ่านฐานราก F02\nตอบ unknowns เป็นภาษาไทย');
  expect(services.save.mock.calls[0][0].providers.openai).not.toHaveProperty('apiKey');
});
