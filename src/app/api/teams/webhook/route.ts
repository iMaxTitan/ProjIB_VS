/**
 * POST /api/teams/webhook
 * Microsoft Teams bot webhook via Bot Framework CloudAdapter.
 * Handles auth validation, message routing (direct → AI), and replies.
 */

import { NextRequest, NextResponse } from 'next/server';
import { CloudAdapter, ConfigurationBotFrameworkAuthentication, TurnContext } from 'botbuilder';
import { getServerDb } from '@/lib/shared/db-server';
import logger from '@/lib/shared/logger';
import { config } from '@/lib/shared/config';
import { resolveOrCreateUser, getGraphUserInfo } from '@/lib/bot/teams/auth';
import { tryDirectTeamsCommand } from '@/lib/bot/teams/direct-router';
import { botRegistry } from '@/lib/bot/core/registry';
import { loadPermissions, getEnabledToolsForRole } from '@/lib/bot/core/permissions';
import { processTeamsMessage } from '@/lib/bot/teams/ai-router';
import { sendMessage, sendHtml, sendDocument } from '@/lib/bot/teams/bot';
import { searchAndAnswer } from '@/lib/kb/search';

// ─── Adapter (lazy singleton) ─────────────────────────────────────────────────

let _adapter: CloudAdapter | null = null;

function getAdapter(): CloudAdapter {
  if (_adapter) return _adapter;

  const auth = new ConfigurationBotFrameworkAuthentication({
    MicrosoftAppId: config.microsoft.appId,
    MicrosoftAppPassword: config.microsoft.appPassword,
    MicrosoftAppType: 'MultiTenant',
  });

  _adapter = new CloudAdapter(auth);

  _adapter.onTurnError = async (context: TurnContext, error: Error) => {
    logger.error('[Teams] onTurnError:', error);
    await context.sendActivity('Виникла внутрішня помилка. Спробуйте пізніше.').catch(() => null);
  };

  return _adapter;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Cost per 1M tokens: [input, output] — mirrors Telegram webhook */
const MODEL_RATES: Record<string, [number, number]> = {
  'gpt-4o-mini':               [0.15,   0.60],
  'gpt-4o':                    [2.50,  10.00],
  'claude-3-haiku-20240307':      [0.25,   1.25],
  'claude-haiku-4-5-20251001':   [1.00,   5.00],
  'claude-3-5-haiku-20241022':   [0.80,   4.00],
  'claude-3-5-sonnet-20241022':[3.00,  15.00],
};

function buildCostFooter(result: { totalTokens: number; promptTokens: number; completionTokens: number; aiModel: string }): string {
  if (result.totalTokens === 0) return '';
  const rates = MODEL_RATES[result.aiModel];
  const p = result.promptTokens;
  const c = result.completionTokens;
  let costStr = '';
  if (rates) {
    const cost = (p * rates[0] + c * rates[1]) / 1_000_000;
    costStr = ` · ~$${cost < 0.0001 ? cost.toExponential(1) : cost.toFixed(4)}`;
  }
  const modelShort = result.aiModel
    .replace('claude-haiku-4-5-20251001',   'haiku-4.5')
    .replace('claude-3-5-haiku-20241022',   'haiku-3.5')
    .replace('claude-3-5-sonnet-20241022',  'sonnet-3.5')
    .replace('claude-3-haiku-20240307',     'haiku-3');
  return `\n🤖 ${modelShort} · ↑${p} ↓${c}${costStr}`;
}

// ─── Webhook handler ──────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Only accept if Teams env is configured
  if (!config.microsoft.appId || !config.microsoft.appPassword) {
    return NextResponse.json({ error: 'Teams bot not configured' }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const headers = Object.fromEntries(req.headers.entries());
  const adapter = getAdapter();

  // Adapt Next.js Request/Response to Bot Framework WebRequest/WebResponse
  // CloudAdapter expects Express-like req with body as parsed object
  const webReq = {
    body,
    headers,
    method: 'POST',
    on: function (this: object) { return this; },
  };

  let responseStatus = 200;
  const webRes = {
    status(code: number) { responseStatus = code; return this; },
    send(_body: unknown) { return this; },
    end() { return this; },
    header(_name: string, _value?: unknown) { return this; },
  };

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await adapter.process(webReq as any, webRes as any, handleTurn);
  } catch (err) {
    logger.error('[Teams Webhook] adapter.process error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: responseStatus });
}

// ─── Turn handler ─────────────────────────────────────────────────────────────

/** Remove lone Unicode surrogates (U+D800–U+DFFF without a valid pair).
 *  Node.js v20+ throws on JSON.stringify with lone surrogates, which crashes AI API calls. */
function sanitizeUnicode(str: string): string {
  return str.replace(/[\uD800-\uDFFF]/g, '\uFFFD');
}

/** KB-only flow for AD-authenticated users not in CS Platform. */
async function handleAnonymousKBSearch(
  turnContext: TurnContext, aadOid: string, text: string, db: ReturnType<typeof getServerDb>, activityName?: string,
): Promise<void> {
  const graphInfo = await getGraphUserInfo(aadOid);
  const displayName = graphInfo?.displayName || activityName || 'Користувач';

  const lcText = text.toLowerCase().trim();
  const isHelpIntent = lcText === 'довідка' || lcText === 'допомога' || lcText === '/help' || lcText === 'help';

  if (lcText === '/start' || lcText === 'start' || isHelpIntent) {
    await sendMessage(turnContext, `Привіт, ${displayName}! Задавайте питання — я шукатиму відповіді в базі знань.`);
    return;
  }

  await turnContext.sendActivity({ type: 'typing' });

  try {
    const result = await searchAndAnswer(text, {
      userId: '',
      role: 'kb_user',
      source: 'teams',
      db,
      anonymousName: displayName !== 'Користувач' ? displayName : undefined,
    });
    await sendHtml(turnContext, result.text);
    logger.info(`[Teams Bot] Anonymous ${displayName}: KB "${text.substring(0, 50)}"`);
  } catch (err) {
    logger.error('[Teams Bot] KB search error for anonymous user:', err);
    await sendMessage(turnContext, 'Виникла помилка при пошуку. Спробуйте пізніше.');
  }
}

async function handleTurn(turnContext: TurnContext): Promise<void> {
  const activity = turnContext.activity;

  // Only handle message activities
  if (activity.type !== 'message') return;

  // Strip HTML tags (Teams sometimes wraps imBack text in <at> mentions or spans)
  // Sanitize lone surrogates — Node.js v20+ throws on JSON.stringify with them
  const rawText = sanitizeUnicode((activity.text || '').replace(/<[^>]+>/g, '').trim());
  const text = rawText;
  if (!text) return;

  const aadOid = activity.from?.aadObjectId;
  if (!aadOid) {
    await sendMessage(turnContext, 'Не вдалося визначити вашу особу. Переконайтесь, що ви увійшли в Teams через корпоративний акаунт.');
    return;
  }

  const conversationId = activity.conversation?.id || '';
  const serviceUrl = activity.serviceUrl || '';
  const memberId = activity.from?.id || '';

  const db = getServerDb();

  // Resolve user
  const resolvedUser = await resolveOrCreateUser(db, aadOid, conversationId, serviceUrl, memberId);

  // Anonymous user (AD-authenticated but not in CS Platform) → KB-only access
  if (!resolvedUser) {
    await handleAnonymousKBSearch(turnContext, aadOid, text, db, activity.from?.name);
    return;
  }

  const { profile } = resolvedUser;

  const lcText = text.toLowerCase().trim();
  // Normalize: strip leading emoji/punctuation for robust matching (Teams may send full label with emoji)
  const normText = text.replace(/^[^\p{L}\p{N}]+/u, '').trim().toLowerCase();

  // /start → full welcome card (intro + buttons)
  // "Довідка" → compact menu card (no intro, with AI description)
  // loadPermissions only here — not on every message (avoids double-call with tryDirectTeamsCommand)
  const isHelpIntent = lcText === 'довідка' || lcText === 'допомога' || normText === 'довідка' || normText === 'допомога' || lcText === '/help' || lcText === 'help';
  if (lcText === '/start' || lcText === 'start' || isHelpIntent) {
    const permissions = await loadPermissions(db);
    const enabledTools = getEnabledToolsForRole(permissions, profile.role, botRegistry.getAll());
    const directToolLabels = enabledTools
      .filter(e => e.tool.directCommand)
      .map(e => e.tool.directCommand!.buttonLabel);

    const cardContent = (lcText === '/start' || lcText === 'start')
      ? buildWelcomeCard(profile.full_name || 'Користувач', directToolLabels)
      : buildMenuCard(directToolLabels);

    await turnContext.sendActivity({
      type: 'message',
      attachments: [{ contentType: 'application/vnd.microsoft.card.adaptive', content: cardContent }],
    });
    return;
  }

  // Send typing indicator
  await turnContext.sendActivity({ type: 'typing' });

  // Try direct command first (no AI)
  const directResult = await tryDirectTeamsCommand(text, profile, db);
  if (directResult) {
    if (directResult.document) {
      await sendDocument(turnContext, directResult.document.buffer, directResult.document.filename, directResult.document.caption);
    } else if (directResult.isHtml) {
      await sendHtml(turnContext, directResult.text);
    } else {
      await sendMessage(turnContext, directResult.text);
    }
    logger.info(`[Teams Bot] User ${profile.full_name}: direct "${text.substring(0, 50)}"`);
    return;
  }

  // --- AI path (server key) ---
  try {
    const result = await processTeamsMessage(
      profile.user_id,
      profile.role,
      profile.department_id,
      profile.full_name || 'Невідомий',
      text,
      conversationId,
      db,
    );

    if (result.document) {
      await sendDocument(turnContext, result.document.buffer, result.document.filename, result.document.caption);
    } else {
      const footer = buildCostFooter(result);
      if (result.parseMode === 'HTML') {
        await sendHtml(turnContext, result.text + footer.replace('\n', '<br>'));
      } else {
        await sendMessage(turnContext, result.text + footer);
      }
    }

    if (result.totalTokens > 0) {
      logger.info(`[Teams Bot] User ${profile.full_name}: "${text.substring(0, 50)}" → ↑${result.promptTokens} ↓${result.completionTokens} [${result.aiModel}]`);
    } else {
      logger.info(`[Teams Bot] User ${profile.full_name}: "${text.substring(0, 50)}"`);
    }
  } catch (err) {
    logger.error('[Teams Bot] processTeamsMessage error:', err);
    const errMsg = err instanceof Error ? err.message : '';
    if (errMsg.includes('API key') || errMsg.includes('401') || errMsg.includes('invalid_api_key')) {
      await sendMessage(turnContext, 'Помилка AI сервісу. Зверніться до адміністратора.');
    } else {
      await sendMessage(turnContext, 'Виникла помилка при обробці запиту. Спробуйте пізніше.');
    }
  }
}


function makeImBack(title: string, value: string): object {
  return {
    type: 'Action.Submit',
    title,
    data: { msteams: { type: 'imBack', value } },
  };
}

function buildWelcomeCard(name: string, directToolLabels: string[]): object {
  return {
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    type: 'AdaptiveCard',
    version: '1.4',
    body: [
      {
        type: 'TextBlock',
        text: `Привіт, **${name}**! Я — **Jarvise**, корпоративний асистент АТБ 🤖`,
        wrap: true,
        size: 'Medium',
        weight: 'Bolder',
      },
      {
        type: 'TextBlock',
        text: '📌 Швидкі відповіді — натисни кнопку:',
        wrap: true,
        spacing: 'Medium',
        weight: 'Bolder',
      },
      {
        type: 'ActionSet',
        actions: directToolLabels.map(label =>
          makeImBack(label, label.replace(/^[^\p{L}\p{N}]+/u, '').trim().toLowerCase())
        ),
      },
      // Voice chat button (opens web page)
      ...(config.app.voiceBotEnabled ? [{
        type: 'ActionSet',
        actions: [{
          type: 'Action.OpenUrl',
          title: '🎤 Голосовий чат',
          url: `${config.azure.baseUrl}/voice-chat`,
        }],
      }] : []),
      {
        type: 'TextBlock',
        text: '🤖 Вільний запит (AI):',
        wrap: true,
        spacing: 'Medium',
        weight: 'Bolder',
      },
      {
        type: 'TextBlock',
        text: '📚 Питання про регламенти ІБ, HR, IT  \n📊 Детальні звіти та квартальні підсумки',
        wrap: true,
        spacing: 'Small',
      },
      {
        type: 'TextBlock',
        text: '💬 Наприклад: «мій KPI за лютий» або «звіт по підприємству»',
        wrap: true,
        spacing: 'Medium',
        isSubtle: true,
      },
    ],
  };
}

/** Menu card — shown when user clicks "Довідка" (no greeting, keeps AI description). */
function buildMenuCard(directToolLabels: string[]): object {
  return {
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    type: 'AdaptiveCard',
    version: '1.4',
    body: [
      {
        type: 'TextBlock',
        text: '📌 Швидкі відповіді — натисни кнопку:',
        wrap: true,
        weight: 'Bolder',
      },
      {
        type: 'ActionSet',
        actions: directToolLabels.map(label =>
          makeImBack(label, label.replace(/^[^\p{L}\p{N}]+/u, '').trim().toLowerCase())
        ),
      },
      {
        type: 'TextBlock',
        text: '🤖 Вільний запит (AI):',
        wrap: true,
        spacing: 'Medium',
        weight: 'Bolder',
      },
      {
        type: 'TextBlock',
        text: '📚 Питання про регламенти ІБ, HR, IT  \n📊 Детальні звіти та квартальні підсумки',
        wrap: true,
        spacing: 'Small',
      },
      {
        type: 'TextBlock',
        text: '💬 Наприклад: «мій KPI за лютий» або «звіт по підприємству»',
        wrap: true,
        spacing: 'Medium',
        isSubtle: true,
      },
    ],
  };
}
