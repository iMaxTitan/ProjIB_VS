import { fetchWithTimeout } from '@/lib/shared/utils/fetch-with-timeout';
import { config } from '@/lib/shared/config';

export type AIProvider = 'openai' | 'anthropic';
export type AIMessageRole = 'system' | 'user' | 'assistant' | 'tool';

export interface AIMessage {
  role: AIMessageRole;
  content: string;
  tool_call_id?: string;
  /** For assistant messages that include tool calls (multi-turn tool calling) */
  toolCalls?: AIToolCall[];
}

export interface AIUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface AIToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface AIToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface AIResult {
  text: string;
  usage?: AIUsage;
  toolCalls?: AIToolCall[];
  stopReason?: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop';
}

export interface GenerateAITextOptions {
  messages: AIMessage[];
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
  openAIModel?: string;
  anthropicModel?: string;
  tools?: AIToolDef[];
  providerOverride?: AIProvider;
  apiKeyOverride?: string;
}

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_TOKENS = 1_000;

function getProvider(override?: AIProvider): AIProvider {
  if (override) return override;
  return config.app.aiProvider === 'anthropic' ? 'anthropic' : 'openai';
}

function getProviderKey(provider: AIProvider, override?: string): string | undefined {
  if (override) return override;
  if (provider === 'anthropic') {
    return config.anthropic.apiKey || undefined;
  }
  return config.openai.apiKey || undefined;
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
    // Ignore parse errors
  }

  return `AI provider error (${response.status})`;
}

async function callOpenAI(options: GenerateAITextOptions, apiKey: string): Promise<AIResult> {
  const messages: Array<Record<string, unknown>> = [];

  if (options.systemPrompt) {
    messages.push({ role: 'system', content: options.systemPrompt });
  }

  for (const m of options.messages) {
    if (m.role === 'tool') {
      messages.push({ role: 'tool', content: m.content, tool_call_id: m.tool_call_id });
    } else if (m.role === 'assistant' && m.toolCalls?.length) {
      // Assistant message with tool_calls — OpenAI requires tool_calls array
      messages.push({
        role: 'assistant',
        content: m.content || null,
        tool_calls: m.toolCalls.map(tc => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
        })),
      });
    } else {
      messages.push({ role: m.role, content: m.content });
    }
  }

  // Reasoning models (o1/o3/o4/gpt-5*) don't support custom temperature
  const modelId = options.openAIModel ?? 'gpt-4o-mini';
  const isReasoningModel = /^(o\d|gpt-5)/.test(modelId);
  const body: Record<string, unknown> = {
    model: modelId,
    messages,
    max_completion_tokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
    ...(!isReasoningModel && { temperature: options.temperature ?? 0.7 }),
  };

  if (options.tools?.length) {
    body.tools = options.tools.map(t => ({
      type: 'function',
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }));
  }

  const response = await fetchWithTimeout(
    'https://api.openai.com/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    },
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  );

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  const data = await response.json();
  const message = data?.choices?.[0]?.message;
  const text = message?.content ?? '';
  const finishReason = data?.choices?.[0]?.finish_reason;

  const rawUsage = data?.usage;
  const usage: AIUsage | undefined = rawUsage
    ? {
        prompt_tokens: rawUsage.prompt_tokens ?? 0,
        completion_tokens: rawUsage.completion_tokens ?? 0,
        total_tokens: rawUsage.total_tokens ?? 0,
      }
    : undefined;

  let toolCalls: AIToolCall[] | undefined;
  if (message?.tool_calls?.length) {
    toolCalls = message.tool_calls.map((tc: { id: string; function: { name: string; arguments: string } }) => ({
      id: tc.id,
      name: tc.function.name,
      arguments: JSON.parse(tc.function.arguments || '{}'),
    }));
  }

  let stopReason: AIResult['stopReason'];
  if (finishReason === 'tool_calls') stopReason = 'tool_use';
  else if (finishReason === 'stop') stopReason = 'end_turn';
  else if (finishReason === 'length') stopReason = 'max_tokens';
  else stopReason = 'stop';

  return { text, usage, toolCalls, stopReason };
}

async function callAnthropic(options: GenerateAITextOptions, apiKey: string): Promise<AIResult> {
  const messages: Array<Record<string, unknown>> = [];

  for (const m of options.messages) {
    if (m.role === 'system') continue;
    if (m.role === 'tool') {
      messages.push({
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: m.tool_call_id, content: m.content }],
      });
    } else if (m.role === 'assistant' && m.toolCalls?.length) {
      // Assistant message with tool_use blocks — Anthropic requires content array
      const content: Array<Record<string, unknown>> = [];
      if (m.content) content.push({ type: 'text', text: m.content });
      for (const tc of m.toolCalls) {
        content.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.arguments });
      }
      messages.push({ role: 'assistant', content });
    } else {
      messages.push({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      });
    }
  }

  const systemPrompt =
    options.systemPrompt ?? options.messages.find((m) => m.role === 'system')?.content;

  const body: Record<string, unknown> = {
    model: options.anthropicModel ?? 'claude-3-haiku-20240307',
    max_tokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
    system: systemPrompt,
    messages,
  };

  if (options.tools?.length) {
    body.tools = options.tools.map(t => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters,
    }));
  }

  const response = await fetchWithTimeout(
    'https://api.anthropic.com/v1/messages',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    },
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  );

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  const data = await response.json();

  let text = '';
  const toolCalls: AIToolCall[] = [];

  for (const block of (data?.content || [])) {
    if (block.type === 'text') {
      text += block.text;
    } else if (block.type === 'tool_use') {
      toolCalls.push({
        id: block.id,
        name: block.name,
        arguments: block.input ?? {},
      });
    }
  }

  const rawUsage = data?.usage;
  const usage: AIUsage | undefined = rawUsage
    ? {
        prompt_tokens: rawUsage.input_tokens ?? 0,
        completion_tokens: rawUsage.output_tokens ?? 0,
        total_tokens: (rawUsage.input_tokens ?? 0) + (rawUsage.output_tokens ?? 0),
      }
    : undefined;

  let stopReason: AIResult['stopReason'];
  if (data?.stop_reason === 'tool_use') stopReason = 'tool_use';
  else if (data?.stop_reason === 'end_turn') stopReason = 'end_turn';
  else if (data?.stop_reason === 'max_tokens') stopReason = 'max_tokens';
  else stopReason = 'stop';

  return { text, usage, toolCalls: toolCalls.length > 0 ? toolCalls : undefined, stopReason };
}

/** Returns text + token usage + tool calls. Use for new code that needs usage tracking. */
export async function generateAITextWithUsage(
  options: GenerateAITextOptions
): Promise<AIResult> {
  const provider = getProvider(options.providerOverride);
  const apiKey = getProviderKey(provider, options.apiKeyOverride);
  if (!apiKey) {
    throw new Error(`API key not configured for provider: ${provider}`);
  }
  if (provider === 'anthropic') {
    return callAnthropic(options, apiKey);
  }
  return callOpenAI(options, apiKey);
}

/** Backward-compatible wrapper — returns only text string. */
export async function generateAIText(options: GenerateAITextOptions): Promise<string> {
  const result = await generateAITextWithUsage(options);
  return result.text;
}
