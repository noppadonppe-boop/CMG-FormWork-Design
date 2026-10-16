import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {AI_MODEL_OPTIONS, defaultAiEffort, DEFAULT_AI_MODELS, type AiProvider} from '../src/aiModels';

const fixture = vi.hoisted(() => ({settings: {} as Record<string, unknown>, save: vi.fn()}));
vi.mock('firebase-admin/app', () => ({initializeApp: vi.fn()}));
vi.mock('firebase-admin/firestore', () => ({
  FieldValue: {serverTimestamp: () => 'server-time'},
  getFirestore: () => ({doc: (path: string) => ({
    get: async () => ({exists: true, data: () => path.endsWith('/settings/ai') ? fixture.settings : {
      uid: 'engineer', email: 'engineer@example.com', role: ['Engineer'], status: 'approved', assignedProjects: ['p1'],
    }}),
    set: fixture.save,
  })}),
}));
vi.mock('firebase-admin/storage', () => ({getStorage: () => ({bucket: () => ({file: () => ({
  getMetadata: async () => [{contentType: 'image/png', size: 2, metadata: {projectId: 'p1'}}],
  download: async () => [Buffer.from([1, 2])],
})})})}));

import {extractGeometry} from '../functions/src/index';

const draft = {shape: 'RECTANGLE', width: 1000, length: 2000, height: null, armX: null, armY: null, unit: 'mm', evidence: [], unknowns: ['height']};
const request = {
  auth: {uid: 'engineer', token: {email: 'engineer@example.com'}},
  data: {projectId: 'p1', path: 'RC-FormWork-App/root/uploads/upload1'},
};
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fixture.save.mockReset();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

function respond(provider: AiProvider, legacy = false) {
  const text = JSON.stringify(draft);
  const body = provider === 'openai' ? {output: [{content: [{type: 'output_text', text}]}]} :
    provider === 'google' ? {candidates: [{content: {parts: [{text}]}}]} :
    {content: legacy ? [{type: 'tool_use', input: draft}] : [{type: 'thinking', thinking: 'internal'}, {type: 'text', text}]};
  fetchMock.mockResolvedValue(new Response(JSON.stringify(body), {status: 200}));
}

describe('Vision model migration request/response compatibility (mock providers)', () => {
  it.each(['openai', 'google', 'anthropic'] as const)('sends the saved additional prompt to %s alongside the image', async provider => {
    const prompt = 'อ่านฐานราก F01\nตอบ unknowns เป็นภาษาไทย';
    fixture.settings = {prompt, activeProvider: provider, providers: {[provider]: {apiKey: 'test-provider-key'}}};
    respond(provider);
    await extractGeometry.run(request as never);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const content = provider === 'openai' ? body.input[1].content : provider === 'google' ? body.contents[0].parts : body.messages[0].content;
    expect(content.some((part: {text?: string}) => part.text === prompt)).toBe(true);
    const system = provider === 'openai' ? body.input[0].content[0].text : provider === 'google' ? body.systemInstruction.parts[0].text : body.system;
    expect(system).toContain('infer dimensions from pixels');
    expect(system).toContain('natural Thai prose');
    expect(system).toContain('Only the selected page is supplied');
  });
  it.each(['openai', 'google', 'anthropic'] as const)('uses the shared %s default when no model is saved', async provider => {
    fixture.settings = {activeProvider: provider, providers: {[provider]: {apiKey: 'test-provider-key'}}};
    respond(provider);
    const output = await extractGeometry.run(request as never);
    expect(output.draft).toEqual(draft);
    expect(output.model).toBe(DEFAULT_AI_MODELS[provider]);
    expect(JSON.stringify(output)).not.toContain('test-provider-key');
    const [url, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body);
    if (provider === 'google') {
      expect(url).toContain(`/${DEFAULT_AI_MODELS.google}:generateContent`);
      expect(body.generationConfig).not.toHaveProperty('temperature');
      expect(body.generationConfig.thinkingConfig).toEqual({thinkingLevel: 'medium'});
    } else if (provider === 'anthropic') {
      expect(body.output_config.effort).toBe('high');
      expect(body.thinking).toEqual({type: 'adaptive'});
    } else {
      expect(body.model).toBe(DEFAULT_AI_MODELS[provider]);
      expect(body.reasoning).toEqual({effort: 'medium'});
    }
  });

  it.each(AI_MODEL_OPTIONS.anthropic)('%s requests structured JSON without forced tools and ignores thinking blocks', async model => {
    fixture.settings = {activeProvider: 'anthropic', providers: {anthropic: {apiKey: 'test-provider-key', model}}};
    respond('anthropic');
    const output = await extractGeometry.run(request as never);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.output_config.format).toMatchObject({type: 'json_schema', schema: {required: expect.arrayContaining(['shape', 'evidence', 'unknowns'])}});
    expect(body).not.toHaveProperty('tool_choice');
    expect(body).not.toHaveProperty('tools');
    if (model === 'claude-haiku-4-5-20251001') {
      expect(body.thinking).toEqual({type: 'enabled', budget_tokens: 6144});
      expect(body.output_config).not.toHaveProperty('effort');
    } else {
      expect(body.thinking).toEqual({type: 'adaptive'});
      expect(body.output_config.effort).toBe(defaultAiEffort('anthropic', model));
    }
    expect(output.draft).toEqual(draft);
  });

  it('sends the selected OpenAI xhigh effort and model-specific Gemini minimal level', async () => {
    fixture.settings = {activeProvider: 'openai', providers: {openai: {apiKey: 'test-provider-key', model: 'gpt-6.1-sol', effort: 'xhigh'}}};
    respond('openai');
    await extractGeometry.run(request as never);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).reasoning).toEqual({effort: 'xhigh'});

    fixture.settings = {activeProvider: 'google', providers: {google: {apiKey: 'test-provider-key', model: 'gemini-3.5-flash-lite', effort: 'minimal'}}};
    respond('google');
    await extractGeometry.run(request as never);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).generationConfig.thinkingConfig).toEqual({thinkingLevel: 'minimal'});
  });

  it('preserves a previously saved Claude model and its legacy tool response', async () => {
    fixture.settings = {activeProvider: 'anthropic', providers: {anthropic: {apiKey: 'test-provider-key', model: 'claude-sonnet-4-5'}}};
    respond('anthropic', true);
    const output = await extractGeometry.run(request as never);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.model).toBe('claude-sonnet-4-5');
    expect(body.tool_choice).toEqual({type: 'tool', name: 'report_geometry'});
    expect(output.draft).toEqual(draft);
  });

  it('rejects a truncated Claude JSON response before saving an analysis', async () => {
    fixture.settings = {activeProvider: 'anthropic', providers: {anthropic: {apiKey: 'test-provider-key'}}};
    fetchMock.mockResolvedValue(new Response(JSON.stringify({content: [{type: 'text', text: '{"shape":'}], stop_reason: 'max_tokens'})));
    await expect(extractGeometry.run(request as never)).rejects.toMatchObject({code: 'data-loss'});
    expect(fixture.save).not.toHaveBeenCalled();
  });
});
