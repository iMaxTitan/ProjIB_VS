import { fetchWithTimeout } from '@/lib/utils/fetch-with-timeout';

export type AIProvider = 'openai' | 'anthropic';
export type AIMessageRole = 'system' | 'user' | 'assistant';

export interface AIMessage {
  role: AIMessageRole;
  content: string;
}

export interface GenerateAITextOptions {
  messages: AIMessage[];
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
  openAIModel?: string;
  anthropicModel?: string;
}

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_TOKENS = 1_000;

function getProvider(): AIProvider {
  return process.env.AI_PROVIDER === 'anthropic' ? 'anthropic' : 'openai';
}

function getProviderKey(provider: AIProvider): string | undefined {
  if (provider === 'anthropic') {
    return process.env.ANTHROPIC_API_KEY;
  }
  return process.env.OPENAI_API_KEY;
}

export function hasConfiguredAIProvider(): boolean {
  const provider = getProvider();
  return Boolean(getProviderKey(provider));
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const payload = await response.json();
    if (payload?.error?.message && typeof payload.error.message === 'string') {
      return payload.error.message;
    }
  } catch {
    // Игнорируем ошибки парсинга и вернем общий текст ниже.
  }

  return `AI provider error (${response.status})`;
}

async function callOpenAI(options: GenerateAITextOptions): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY не настроен');
  }

  const messages: AIMessage[] = options.systemPrompt
    ? [{ role: 'system', content: options.systemPrompt }, ...options.messages]
    : options.messages;

  const response = await fetchWithTimeout(
    'https://api.openai.com/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: options.openAIModel ?? 'gpt-4o-mini',
        messages,
        max_tokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
        temperature: options.temperature ?? 0.7,
      }),
    },
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  );

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  const data = await response.json();
  return data?.choices?.[0]?.message?.content ?? '';
}

async function callAnthropic(options: GenerateAITextOptions): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY не настроен');
  }

  const messages = options.messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
    }));

  const systemPrompt =
    options.systemPrompt ?? options.messages.find((m) => m.role === 'system')?.content;

  const response = await fetchWithTimeout(
    'https://api.anthropic.com/v1/messages',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: options.anthropicModel ?? 'claude-3-haiku-20240307',
        max_tokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
        system: systemPrompt,
        messages,
      }),
    },
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  );

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  const data = await response.json();
  return data?.content?.[0]?.text ?? '';
}

export async function generateAIText(options: GenerateAITextOptions): Promise<string> {
  const provider = getProvider();
  if (provider === 'anthropic') {
    return callAnthropic(options);
  }
  return callOpenAI(options);
}
