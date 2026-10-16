// Vision/text API models verified against the official catalogues on 2026-10-14.
// Keep the picker and both client/server defaults in one place.
// https://developers.openai.com/api/docs/models
// https://ai.google.dev/gemini-api/docs/models
// https://platform.claude.com/docs/en/models/overview
export const AI_PROVIDERS = ['openai', 'google', 'anthropic'] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];
export const AI_EFFORT_VALUES = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const;
export type AiEffort = (typeof AI_EFFORT_VALUES)[number];
export type AiEffortSetting = AiEffort | 'auto';
export const AI_MODELS_VERIFIED_ON = '14 ต.ค. 2569';
export const AI_MODEL_GROUPS: Record<AiProvider, readonly {label: string; models: readonly string[]}[]> = {
  openai: [
    {label: 'รุ่นปัจจุบัน', models: ['gpt-6.1-sol', 'gpt-6-astra', 'gpt-6-luna']},
    {label: 'รุ่นก่อนหน้า', models: ['gpt-6-sol', 'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna', 'gpt-5.5', 'gpt-5.4', 'gpt-5.4-mini']},
  ],
  google: [
    {label: 'รุ่นปัจจุบัน', models: ['gemini-3.8-flash', 'gemini-4-argon', 'gemini-3.5-flash-lite', 'gemini-3.6-flash', 'gemini-3.1-flash-lite']},
    {label: 'Preview', models: ['gemini-3.1-pro-preview', 'gemini-3-flash-preview']},
    {label: 'รุ่นก่อนหน้า · สำหรับบัญชีที่มีสิทธิ์ใช้งาน', models: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.5-flash-lite']},
  ],
  anthropic: [
    {label: 'รุ่นปัจจุบัน', models: ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-5-5', 'claude-fable-5-1']},
    {label: 'รุ่นก่อนหน้า', models: ['claude-sonnet-5', 'claude-opus-5', 'claude-fable-5', 'claude-opus-4-8', 'claude-haiku-4-5-20251001']},
  ],
};
export const AI_MODEL_OPTIONS: Record<AiProvider, readonly string[]> = {
  openai: AI_MODEL_GROUPS.openai.flatMap(group => group.models),
  google: AI_MODEL_GROUPS.google.flatMap(group => group.models),
  anthropic: AI_MODEL_GROUPS.anthropic.flatMap(group => group.models),
};
export const DEFAULT_AI_MODELS: Record<AiProvider, string> = {
  openai: 'gpt-6.1-sol',
  google: 'gemini-3.8-flash',
  anthropic: 'claude-sonnet-5-5',
};

const OPENAI_WITH_NONE = ['none', 'low', 'medium', 'high', 'xhigh', 'max'] as const satisfies readonly AiEffort[];
const OPENAI_WITHOUT_NONE = ['low', 'medium', 'high', 'xhigh', 'max'] as const satisfies readonly AiEffort[];
const OPENAI_WITHOUT_MAX = ['none', 'low', 'medium', 'high', 'xhigh'] as const satisfies readonly AiEffort[];
const GOOGLE_LEVELS = ['minimal', 'low', 'medium', 'high'] as const satisfies readonly AiEffort[];
const GOOGLE_STANDARD_LEVELS = ['low', 'medium', 'high'] as const satisfies readonly AiEffort[];
const CLAUDE_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const satisfies readonly AiEffort[];
const CLAUDE_MANUAL_EFFORTS = ['low', 'medium', 'high'] as const satisfies readonly AiEffort[];

/**
 * Supported effort values are intentionally model-specific. The same UI
 * picker is translated to the provider's native parameter by the callable.
 */
export const AI_MODEL_EFFORTS: Record<AiProvider, Record<string, readonly AiEffort[]>> = {
  openai: {
    'gpt-6.1-sol': OPENAI_WITHOUT_NONE,
    'gpt-6-astra': OPENAI_WITHOUT_NONE,
    'gpt-6-luna': OPENAI_WITH_NONE,
    'gpt-6-sol': OPENAI_WITH_NONE,
    'gpt-5.6-sol': OPENAI_WITH_NONE,
    'gpt-5.6-terra': OPENAI_WITH_NONE,
    'gpt-5.6-luna': OPENAI_WITH_NONE,
    'gpt-5.5': OPENAI_WITHOUT_MAX,
    'gpt-5.4': OPENAI_WITHOUT_MAX,
    'gpt-5.4-mini': OPENAI_WITHOUT_MAX,
  },
  google: {
    'gemini-3.8-flash': GOOGLE_STANDARD_LEVELS,
    'gemini-4-argon': GOOGLE_STANDARD_LEVELS,
    'gemini-3.5-flash-lite': GOOGLE_LEVELS,
    'gemini-3.6-flash': GOOGLE_LEVELS,
    'gemini-3.1-flash-lite': GOOGLE_LEVELS,
    'gemini-3.1-pro-preview': GOOGLE_STANDARD_LEVELS,
    'gemini-3-flash-preview': GOOGLE_LEVELS,
    'gemini-2.5-flash': GOOGLE_STANDARD_LEVELS,
    'gemini-2.5-pro': GOOGLE_STANDARD_LEVELS,
    'gemini-2.5-flash-lite': GOOGLE_STANDARD_LEVELS,
  },
  anthropic: {
    'claude-sonnet-5-5': CLAUDE_EFFORTS,
    'claude-opus-5-5': CLAUDE_EFFORTS,
    'claude-haiku-5-5': CLAUDE_EFFORTS,
    'claude-fable-5-1': CLAUDE_EFFORTS,
    'claude-sonnet-5': CLAUDE_EFFORTS,
    'claude-opus-5': CLAUDE_EFFORTS,
    'claude-fable-5': CLAUDE_EFFORTS,
    'claude-opus-4-8': CLAUDE_EFFORTS,
    'claude-haiku-4-5-20251001': CLAUDE_MANUAL_EFFORTS,
  },
};

export const AI_EFFORT_OPTIONS: Record<AiProvider, readonly AiEffort[]> = {
  openai: OPENAI_WITH_NONE,
  google: GOOGLE_LEVELS,
  anthropic: CLAUDE_EFFORTS,
};

export const AI_EFFORT_LABELS: Record<AiEffortSetting, string> = {
  auto: 'อัตโนมัติ · ไม่บังคับค่า',
  none: 'ปิดการคิด · none',
  minimal: 'เบามาก · minimal',
  low: 'เบา · low',
  medium: 'ปานกลาง · medium',
  high: 'สูง · high',
  xhigh: 'สูงมาก · xhigh',
  max: 'สูงสุด · max',
};

export function aiEffortOptions(provider: AiProvider, model: string): readonly AiEffort[] {
  return AI_MODEL_EFFORTS[provider][model] ?? AI_EFFORT_OPTIONS[provider];
}

export function aiEffortSettingOptions(provider: AiProvider, model: string): readonly AiEffortSetting[] {
  return AI_MODEL_EFFORTS[provider][model] ? aiEffortOptions(provider, model) : ['auto', ...AI_EFFORT_OPTIONS[provider]];
}

export function defaultAiEffort(provider: AiProvider, model: string): AiEffort {
  if (provider === 'openai' && ['gpt-5.4', 'gpt-5.4-mini'].includes(model)) return 'none';
  if (provider === 'google' && ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'].includes(model)) return 'minimal';
  if (provider === 'google' && ['gemini-3.1-pro-preview', 'gemini-3-flash-preview'].includes(model)) return 'high';
  if (provider === 'anthropic' && ['claude-opus-5-5', 'claude-haiku-5-5'].includes(model)) return 'medium';
  return provider === 'anthropic' ? 'high' : 'medium';
}

export function defaultAiEffortSetting(provider: AiProvider, model: string): AiEffortSetting {
  return AI_MODEL_EFFORTS[provider][model] ? defaultAiEffort(provider, model) : 'auto';
}

export function isAiEffort(value: unknown): value is AiEffort {
  return typeof value === 'string' && (AI_EFFORT_VALUES as readonly string[]).includes(value);
}
