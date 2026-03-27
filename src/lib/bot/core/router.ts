/**
 * Shared AI orchestration router for all bot platforms (Telegram, Teams, WhatsApp, …).
 *
 * Platform adapters pass user context + tools + API key — this module runs the
 * tool-calling loop, manages conversation memory, and returns a unified result.
 */

import logger from '@/lib/shared/logger';
import { generateAITextWithUsage, type AIMessage, type AIToolDef, type AIProvider } from '@/lib/shared/ai/client';
import {
  isDocumentResult,
  isFormattedResult,
  type BotSource,
  type BotTool,
  type DocumentResult,
  type ToolContext,
  type ToolScope,
  type UserRole,
} from './types';
import { buildBotSystemPrompt } from './system-prompt';
import type { SupabaseClient } from '@/lib/shared/postgrest-client';

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_TOOL_ROUNDS = 5;
const AI_TIMEOUT_MS = 45_000;
const AI_MAX_TOKENS = 2_000;
const MEMORY_TTL_MS = 30 * 60 * 1000; // 30 min
const HISTORY_MAX_PAIRS = 5;
const HISTORY_REPLY_MAX_CHARS = 400;

// ─── Conversation memory (single process, in-memory) ─────────────────────────

interface MemoryEntry { role: 'user' | 'assistant'; content: string; ts: number }
const conversationMemory = new Map<string, MemoryEntry[]>();

function getHistory(conversationId: string): AIMessage[] {
  const mem = conversationMemory.get(conversationId) ?? [];
  const now = Date.now();
  const fresh = mem.filter(m => now - m.ts < MEMORY_TTL_MS);
  if (fresh.length !== mem.length) conversationMemory.set(conversationId, fresh);
  return fresh.slice(-(HISTORY_MAX_PAIRS * 2)).map(m => ({ role: m.role, content: m.content }));
}

function saveToHistory(conversationId: string, userMsg: string, botReply: string): void {
  const now = Date.now();
  const existing = (conversationMemory.get(conversationId) ?? []).filter(m => now - m.ts < MEMORY_TTL_MS);
  const replyForHistory = botReply.length > HISTORY_REPLY_MAX_CHARS
    ? botReply.slice(0, HISTORY_REPLY_MAX_CHARS) + '…'
    : botReply;
  conversationMemory.set(conversationId, [
    ...existing.slice(-(HISTORY_MAX_PAIRS * 2 - 2)),
    { role: 'user', content: userMsg, ts: now },
    { role: 'assistant', content: replyForHistory, ts: now },
  ]);
}

// ─── Public interface ─────────────────────────────────────────────────────────

export interface BotRouterInput {
  /** DB user UUID */
  userId: string;
  role: UserRole;
  departmentId: string | null;
  fullName: string;
  message: string;
  /** Used as memory key. Use chatId for group chats, userId for private. */
  conversationId: string;
  db: SupabaseClient;
  /** Already filtered/enabled tools for this user */
  tools: BotTool[];
  /** Per-tool scope. If omitted, all tools get scope 'all'. */
  toolScopes?: Map<string, ToolScope>;
  botIdentity?: string;
  /** Personal API key. When omitted, falls back to server-side env key. */
  apiKey?: string;
  /** AI provider. When omitted, uses AI_PROVIDER env var (default: openai). */
  provider?: AIProvider;
  /** Defaults to claude-3-haiku-20240307 (Anthropic) or gpt-4o-mini (OpenAI) */
  model?: string;
  /** Platform source for analytics logging */
  source?: BotSource;
}

export interface BotRouterResult {
  text: string;
  document?: DocumentResult;
  parseMode?: 'HTML' | 'Markdown';
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  toolsUsed: string[];
  aiProvider: AIProvider;
  aiModel: string;
}

// ─── Core router ─────────────────────────────────────────────────────────────

export async function runBotRouter(input: BotRouterInput): Promise<BotRouterResult> {
  const {
    userId, role, departmentId, fullName,
    message, conversationId, db, tools,
    toolScopes, botIdentity, apiKey, provider,
    model, source,
  } = input;

  // Default: OpenAI gpt-4o-mini (server key). Personal key/provider overrides.
  const effectiveProvider: AIProvider = provider ?? 'openai';
  const resolvedModel = model || (effectiveProvider === 'anthropic' ? 'claude-3-haiku-20240307' : 'gpt-4o-mini');
  const defaultModelOpts = effectiveProvider === 'anthropic'
    ? { anthropicModel: resolvedModel }
    : { openAIModel: resolvedModel };

  const systemPrompt = buildBotSystemPrompt({
    fullName: fullName || 'Невідомий',
    role,
    botIdentity,
  });

  const aiToolDefs: AIToolDef[] = tools.map(t => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }));

  const history = getHistory(conversationId);
  const messages: AIMessage[] = [...history, { role: 'user', content: message }];

  let totalTokens = 0;
  let promptTokens = 0;
  let completionTokens = 0;
  const toolsUsed: string[] = [];

  const meta = { aiProvider: effectiveProvider, aiModel: resolvedModel };

  // ─── Tool-calling loop ────────────────────────────────────────────────────

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const result = await generateAITextWithUsage({
      messages,
      systemPrompt,
      tools: aiToolDefs,
      maxTokens: AI_MAX_TOKENS,
      temperature: 0.3,
      timeoutMs: AI_TIMEOUT_MS,
      providerOverride: effectiveProvider,
      apiKeyOverride: apiKey,
      ...defaultModelOpts,
    });

    totalTokens += result.usage?.total_tokens || 0;
    promptTokens += result.usage?.prompt_tokens || 0;
    completionTokens += result.usage?.completion_tokens || 0;

    if (result.stopReason !== 'tool_use' || !result.toolCalls?.length) {
      const text = result.text || 'Не вдалося отримати відповідь.';
      saveToHistory(conversationId, message, text);
      return { text, totalTokens, promptTokens, completionTokens, toolsUsed, ...meta };
    }

    messages.push({ role: 'assistant', content: result.text || '', toolCalls: result.toolCalls });

    for (const tc of result.toolCalls) {
      const tool = tools.find(t => t.name === tc.name);
      const scope: ToolScope = toolScopes?.get(tc.name) ?? 'all';

      if (!tool) {
        messages.push({ role: 'tool', content: JSON.stringify({ error: 'Tool not available' }), tool_call_id: tc.id });
        continue;
      }

      toolsUsed.push(tc.name);

      const ctx: ToolContext = { db, userId, role, departmentId, fullName: fullName || 'Невідомий', scope, source };

      try {
        const toolResult = await tool.execute(tc.arguments, ctx);

        if (isDocumentResult(toolResult)) {
          const text = toolResult.caption || 'Документ сформовано.';
          saveToHistory(conversationId, message, text);
          return { text, totalTokens, promptTokens, completionTokens, toolsUsed, document: toolResult, ...meta };
        }

        if (isFormattedResult(toolResult)) {
          saveToHistory(conversationId, message, toolResult.text);
          return { text: toolResult.text, parseMode: toolResult.parseMode, totalTokens, promptTokens, completionTokens, toolsUsed, ...meta };
        }

        messages.push({ role: 'tool', content: JSON.stringify(toolResult), tool_call_id: tc.id });
      } catch (err) {
        logger.error(`[BotRouter] Tool ${tc.name} error:`, err);
        messages.push({ role: 'tool', content: JSON.stringify({ error: 'Помилка виконання інструменту' }), tool_call_id: tc.id });
      }
    }
  }

  const text = 'Перевищено ліміт обробки запиту. Спробуйте уточнити питання.';
  saveToHistory(conversationId, message, text);
  return { text, totalTokens, promptTokens, completionTokens, toolsUsed, ...meta };
}
