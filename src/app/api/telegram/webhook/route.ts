/**
 * POST /api/telegram/webhook
 * Telegram Bot webhook endpoint.
 * Verifies secret header, processes messages async.
 */

import { NextRequest, NextResponse } from 'next/server';
import logger from '@/lib/shared/logger';
import { config } from '@/lib/shared/config';
import { getServerDb } from '@/lib/shared/db-server';
import { checkRateLimit } from '@/lib/shared/api/request-guards';
import { resolveUserBasic, verifyCode } from '@/lib/bot/telegram/auth';
import { tryDirectCommand, getPrefixTools } from '@/lib/bot/telegram/direct-router';
import { processMessage } from '@/lib/bot/telegram/ai-router';
import { sendMessage, sendMessageWithKeyboard, sendMessageWithInlineKeyboard, answerCallbackQuery, sendChatAction, sendDocument, downloadTelegramFile, type ReplyKeyboard, type InlineKeyboard } from '@/lib/bot/telegram/bot';
import { transcribeAudio } from '@/lib/bot/audio/transcriber';
import { botRegistry } from '@/lib/bot/core/registry';
import { loadPermissions, getEnabledToolsForRole } from '@/lib/bot/core/permissions';
import { isDocumentResult, isFormattedResult } from '@/lib/bot/core/types';
import type { ToolContext } from '@/lib/bot/core/types';
import type { TelegramUpdate, TelegramCallbackQuery } from '@/lib/bot/telegram/types';
import type { AIRouterResult } from '@/lib/bot/telegram/ai-router';
import { isInWizard, handleTaskWizardCallback, handleWizardTextInput } from '@/lib/bot/telegram/task-wizard';
import { tryCreateDraftTask } from '@/lib/bot/telegram/draft-task';

const RATE_LIMIT_PER_CHAT = 10;
const RATE_LIMIT_GLOBAL = 100;
const RATE_WINDOW_MS = 60_000;

const VERIFY_RATE_LIMIT = 3;

function buildKeyboard(): ReplyKeyboard {
  return [['ℹ️ Довідка']];
}

async function buildInlineMenu(role: string): Promise<InlineKeyboard> {
  const directTools = botRegistry.getAll().filter(t => t.directCommand);
  // Note: for simplicity show all direct tools — permissions are re-checked on execute
  const keyboard: InlineKeyboard = [];
  for (let i = 0; i < directTools.length; i += 2) {
    keyboard.push(
      directTools.slice(i, i + 2).map(t => ({
        text: t.directCommand!.buttonLabel,
        callback_data: `direct:${t.name}`,
      }))
    );
  }
  // Suppress unused param warning — role reserved for future per-role filtering
  void role;
  // Task wizard entry point
  keyboard.push([{ text: '➕ Завдання', callback_data: 'task:start' }]);
  // Voice chat (WebApp) — only if enabled
  if (config.app.voiceBotEnabled) {
    const voiceUrl = `${config.azure.baseUrl}/voice-chat`;
    keyboard.push([{ text: '🎤 Голосовий чат', web_app: { url: voiceUrl } }]);
  }
  return keyboard;
}

function buildWelcomeText(): string {
  const prefixTools = getPrefixTools();
  const prefixSection = prefixTools.length > 0
    ? `\n\n🔍 <b>Команда без AI:</b>\n` + prefixTools
        .map(t => {
          const { command, hint } = t.prefixCommand!;
          return `${command} &lt;запит&gt; — ${t.label}\n    <i>Напр.: ${command} ${hint}</i>`;
        })
        .join('\n')
    : '';

  return `Привіт! Я бот <b>CS Platform</b> 🤖

📌 Натисни <b>ℹ️ Довідка</b> — побачиш усі доступні команди.${prefixSection}

🤖 <b>Вільний запит (AI):</b>
📚 Питання про регламенти ІБ, HR, IT
📊 Детальні звіти та квартальні підсумки

Натисни кнопку або напиши, наприклад:
<i>«мій KPI за лютий»</i> або <i>«звіт по підприємству»</i>`;
}

// ─── Token cost footer ────────────────────────────────────────────────────────

/** Cost per 1M tokens: [input, output] */
const MODEL_RATES: Record<string, [number, number]> = {
  'gpt-4o-mini':              [0.15,   0.60],
  'gpt-4o':                   [2.50,  10.00],
  'gpt-4-turbo':              [10.00,  30.00],
  'gpt-3.5-turbo':            [0.50,   1.50],
  'claude-3-haiku-20240307':      [0.25,   1.25],
  'claude-haiku-4-5-20251001':   [1.00,   5.00],
  'claude-3-5-haiku':            [0.80,   4.00],
  'claude-3-5-haiku-20241022':   [0.80,   4.00],
  'claude-3-5-sonnet':        [3.00,  15.00],
  'claude-3-5-sonnet-20241022':[3.00, 15.00],
  'claude-3-opus-20240229':   [15.00,  75.00],
};

function buildCostFooter(result: AIRouterResult): string {
  if (result.totalTokens === 0) return '';

  const model = result.aiModel || (result.aiProvider === 'anthropic' ? 'claude-3-haiku-20240307' : 'gpt-4o-mini');
  const rates = MODEL_RATES[model];

  const p = result.promptTokens;
  const c = result.completionTokens;

  let costStr = '';
  if (rates) {
    const cost = (p * rates[0] + c * rates[1]) / 1_000_000;
    costStr = ` · ~$${cost < 0.0001 ? cost.toExponential(1) : cost.toFixed(4)}`;
  }

  const modelShort = model
    .replace('claude-haiku-4-5-20251001',   'haiku-4.5')
    .replace('claude-3-5-haiku-20241022',   'haiku-3.5')
    .replace('claude-3-5-sonnet-20241022',  'sonnet-3.5')
    .replace('claude-3-haiku-20240307',     'haiku-3')
    .replace('claude-3-opus-20240229',      'opus-3');

  const line = `🤖 ${modelShort} · ↑${p} ↓${c}${costStr}`;

  return result.parseMode === 'HTML'
    ? `\n<i>${line}</i>`
    : `\n${line}`;
}

function verifyWebhookSecret(req: NextRequest): boolean {
  const secret = req.headers.get('x-telegram-bot-api-secret-token');
  return secret === config.telegram.webhookSecret;
}

export async function POST(req: NextRequest) {
  // Verify webhook secret
  if (!verifyWebhookSecret(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Always return 200 immediately — Telegram retries on non-200
  const update: TelegramUpdate = await req.json();

  // Process async (don't block webhook response)
  if (update.callback_query) {
    handleCallbackQuery(update.callback_query).catch(err => {
      logger.error('[TG Webhook] Callback error:', err);
    });
  } else {
    handleUpdate(update).catch(err => {
      logger.error('[TG Webhook] Unhandled error:', err);
    });
  }

  return NextResponse.json({ ok: true });
}

async function handleCallbackQuery(cq: TelegramCallbackQuery): Promise<void> {
  const chatId = cq.message?.chat?.id ?? cq.from.id;
  const data = cq.data || '';

  // Acknowledge immediately (removes Telegram's loading spinner)
  await answerCallbackQuery(cq.id);

  // Task wizard callbacks
  if (data.startsWith('task:')) {
    const db = getServerDb();
    const basicUser = await resolveUserBasic(db, chatId);
    if (!basicUser) return;
    await handleTaskWizardCallback(chatId, data, basicUser.profile.user_id, db);
    return;
  }

  if (!data.startsWith('direct:')) return;
  const toolName = data.slice('direct:'.length);

  const db = getServerDb();
  const basicUser = await resolveUserBasic(db, chatId);
  if (!basicUser) return;

  const tool = botRegistry.getByName(toolName);
  if (!tool?.directCommand) return;

  // Check permissions
  const permissions = await loadPermissions(db);
  const enabledTools = getEnabledToolsForRole(permissions, basicUser.profile.role, botRegistry.getAll());
  const enabledTool = enabledTools.find(e => e.tool.name === toolName);
  if (!enabledTool) {
    await sendMessage(chatId, '⛔ Немає доступу до цієї команди.');
    return;
  }

  await sendChatAction(chatId);

  const ctx: ToolContext = {
    db,
    userId: basicUser.profile.user_id,
    role: basicUser.profile.role,
    departmentId: basicUser.profile.department_id,
    fullName: basicUser.profile.full_name || 'Невідомий',
    scope: enabledTool.scope,
    source: 'telegram',
  };

  try {
    const result = await tool.execute(tool.directCommand.args, ctx);

    if (isDocumentResult(result)) {
      await sendDocument(chatId, result.buffer, result.filename, result.caption);
    } else if (isFormattedResult(result)) {
      await sendMessage(chatId, result.text, result.parseMode);
    } else {
      await sendMessage(chatId, String(result));
    }
    logger.info(`[TG Bot] User ${basicUser.profile.full_name}: callback direct "${toolName}"`);
  } catch (err) {
    logger.error(`[TG Bot] Callback tool ${toolName} error:`, err);
    await sendMessage(chatId, 'Виникла помилка. Спробуйте пізніше.');
  }
}

async function handleUpdate(update: TelegramUpdate): Promise<void> {
  const message = update.message;
  if (!message?.chat) return;

  const chatId = message.chat.id;
  const username = message.from?.username || null;

  // ── Voice / audio → transcribe to text ──────────────────────────────────
  let text = message.text?.trim() ?? '';

  const audioSource = message.voice ?? message.audio;
  if (!text && audioSource) {
    try {
      await sendChatAction(chatId);
      const { buffer, filename } = await downloadTelegramFile(audioSource.file_id);
      text = await transcribeAudio(buffer, filename); // auto-detect language
      logger.info(`[TG Bot] Voice transcribed (${audioSource.file_id.slice(0, 8)}…): "${text.slice(0, 80)}"`);
    } catch (err) {
      logger.error('[TG Bot] Voice transcription error:', err);
      await sendMessage(chatId, 'Не вдалося розпізнати голосове повідомлення. Спробуйте написати текстом.');
      return;
    }
  }

  if (!text) return;

  const db = getServerDb();

  // Global rate limit
  const globalRl = checkRateLimit('tg_global', RATE_LIMIT_GLOBAL, RATE_WINDOW_MS);
  if (!globalRl.allowed) {
    await sendMessage(chatId, 'Занадто багато запитів. Спробуйте через хвилину.');
    return;
  }

  // Per-chat rate limit
  const chatRl = checkRateLimit(`tg_chat_${chatId}`, RATE_LIMIT_PER_CHAT, RATE_WINDOW_MS);
  if (!chatRl.allowed) {
    await sendMessage(chatId, 'Занадто багато запитів. Спробуйте через хвилину.');
    return;
  }

  // Resolve basic user (no API key required)
  const basicUser = await resolveUserBasic(db, chatId);

  if (!basicUser) {
    // Not linked — check if the message is a verification code
    if (/^[A-Z0-9]{8}$/i.test(text)) {
      const verifyRl = checkRateLimit(`tg_verify_${chatId}`, VERIFY_RATE_LIMIT, RATE_WINDOW_MS);
      if (!verifyRl.allowed) {
        await sendMessage(chatId, 'Занадто багато спроб верифікації. Зачекайте хвилину.');
        return;
      }

      const linkedUserId = await verifyCode(db, text, chatId, username);
      if (linkedUserId) {
        await sendMessage(chatId, "Акаунт успішно прив'язано! Тепер можна використовувати бота.");
      } else {
        await sendMessage(chatId, 'Невірний або прострочений код. Отримайте новий у веб-інтерфейсі.');
      }
      return;
    }

    await sendMessage(chatId, "Акаунт не прив'язано. Отримайте код привʼязки у веб-інтерфейсі та надішліть його сюди.");
    return;
  }

  // Handle /start and /help — show welcome + keyboard
  if (text === '/start' || text === '/help') {
    await sendMessageWithKeyboard(chatId, buildWelcomeText(), buildKeyboard(), 'HTML');
    return;
  }

  // Handle "ℹ️ Довідка" — show inline tool menu
  // Normalize both sides: strip variation selectors (FE0E/FE0F) + lowercase
  const normText = text.toLowerCase().trim().replace(/[\uFE0E\uFE0F]/g, '');
  const normDovIdka = 'ℹ️ Довідка'.toLowerCase().replace(/[\uFE0E\uFE0F]/g, '');
  if (normText === normDovIdka) {
    const menu = await buildInlineMenu(basicUser.profile.role);
    await sendMessageWithInlineKeyboard(chatId, buildWelcomeText(), menu, 'HTML');
    return;
  }

  // ── Wizard text input (before direct router + AI) ──────────────────────────
  if (isInWizard(chatId)) {
    const consumed = await handleWizardTextInput(chatId, text, basicUser.profile.user_id, db);
    if (consumed) return;
  }

  // Send typing indicator
  await sendChatAction(chatId);

  // --- Direct command path (no AI, no API key needed) ---
  const directResult = await tryDirectCommand(text, basicUser.profile, db);
  if (directResult) {
    if (directResult.document) {
      await sendDocument(chatId, directResult.document.buffer, directResult.document.filename, directResult.document.caption);
    } else {
      await sendMessage(chatId, directResult.text, directResult.parseMode);
    }
    logger.info(`[TG Bot] User ${basicUser.profile.full_name}: direct "${text.substring(0, 50)}"`);
    return;
  }

  // --- Draft task path ("описание Nч" pattern) ---
  const draftConsumed = await tryCreateDraftTask(chatId, text, basicUser.profile.user_id, db);
  if (draftConsumed) return;

  // --- AI path (server key) ---
  try {
    const result = await processMessage(basicUser, text);

    if (result.document) {
      await sendDocument(chatId, result.document.buffer, result.document.filename, result.document.caption);
    } else {
      const footer = buildCostFooter(result);
      await sendMessage(chatId, result.text + footer, result.parseMode);
    }

    if (result.totalTokens > 0) {
      logger.info(`[TG Bot] User ${basicUser.profile.full_name}: "${text.substring(0, 50)}" → ↑${result.promptTokens} ↓${result.completionTokens} tokens [${result.aiModel}], tools: [${result.toolsUsed.join(', ')}]`);
    }
  } catch (err) {
    logger.error('[TG Bot] processMessage error:', err);

    const errMsg = err instanceof Error ? err.message : 'Unknown error';
    if (errMsg.includes('API key') || errMsg.includes('401') || errMsg.includes('invalid_api_key')) {
      await sendMessage(chatId, 'Помилка AI сервісу. Зверніться до адміністратора.');
    } else {
      await sendMessage(chatId, 'Виникла помилка при обробці запиту. Спробуйте пізніше.');
    }
  }
}
