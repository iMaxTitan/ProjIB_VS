/**
 * Unified notification sender — routes by user's notification_channel.
 * Supports Telegram and Teams (proactive). No direct DB queries here.
 */

import { sendMessage as sendTelegramMessage } from '@/lib/bot/telegram/bot';
import logger from '@/lib/shared/logger';
import { config } from '@/lib/shared/config';

export interface NotifProfile {
  full_name?: string | null;
  notification_channel: string | null;
  telegram_chat_id: number | null;
  telegram_is_active: boolean;
  teams_conversation_id: string | null;
  teams_service_url: string | null;
  teams_is_active: boolean;
  teams_member_id?: string | null;
}

/** Personal (1:1) Teams conversation IDs start with 'a:' or '29:'. Channel IDs start with '19:'. */
function isPersonalConversation(id: string): boolean {
  return id.startsWith('a:') || id.startsWith('29:');
}

/** Send proactive Teams message via Bot Connector REST API. */
async function sendTeamsProactive(
  conversationId: string,
  serviceUrl: string,
  htmlText: string,
  memberId?: string | null,
): Promise<void> {
  const appId = config.microsoft.appId;
  const appPassword = config.microsoft.appPassword;
  if (!appId || !appPassword) {
    logger.warn('[Notify] Teams proactive skipped — MICROSOFT_APP_ID/PASSWORD not set');
    return;
  }

  try {
    // botframework-connector is a dependency of botbuilder — safe to import
    const { ConnectorClient, MicrosoftAppCredentials } = await import('botframework-connector');
    const credentials = new MicrosoftAppCredentials(appId, appPassword);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = new ConnectorClient(credentials as any, { baseUri: serviceUrl });

    let targetConvId = conversationId;

    // If stored conversation is a channel (19:...) — create a personal 1:1 conversation first
    if (!isPersonalConversation(conversationId) && memberId) {
      try {
        const result = await client.conversations.createConversation({
          isGroup: false,
          bot: { id: appId, name: 'Jarvise' },
          members: [{ id: memberId, name: '' }],
          // Teams requires tenant context for proactive DMs
          channelData: { tenant: { id: config.azure.tenantId } },
        });
        targetConvId = result.id;
      } catch (err) {
        logger.warn('[Notify] Teams: could not create 1:1 conversation, falling back to channel:', err);
        // Fall back to channel — at least the message will be delivered somewhere
      }
    }

    await client.conversations.sendToConversation(targetConvId, {
      type: 'message',
      text: htmlText.replace(/\n/g, '<br>'),
      textFormat: 'xml',
    });
  } catch (err) {
    logger.error('[Notify] Teams proactive error:', err);
  }
}

/**
 * Send notification to a single user via their preferred channel(s).
 * @param profile   User notification fields from user_profiles
 * @param htmlText  HTML-formatted message (uses <b>, <i>, \n as line breaks)
 */
export async function sendNotification(profile: NotifProfile, htmlText: string): Promise<void> {
  const channel = profile.notification_channel ?? 'telegram';

  const promises: Promise<void>[] = [];

  // Telegram
  if ((channel === 'telegram' || channel === 'both') && profile.telegram_is_active && profile.telegram_chat_id) {
    promises.push(sendTelegramMessage(profile.telegram_chat_id, htmlText, 'HTML'));
  }

  // Teams
  if ((channel === 'teams' || channel === 'both') && profile.teams_is_active && profile.teams_conversation_id && profile.teams_service_url) {
    promises.push(sendTeamsProactive(
      profile.teams_conversation_id,
      profile.teams_service_url,
      htmlText,
      profile.teams_member_id,
    ));
  }

  if (promises.length) {
    await Promise.allSettled(promises);
  }
}

/**
 * Send notifications to a list of users with Teams deduplication.
 * - Channel messages (19:...) are sent ONCE per unique conversation, with recipient names prepended.
 * - Personal chats (a:/29:) and users with member_id get individual messages.
 * - Telegram is always individual.
 */
export async function sendNotificationsToAll(profiles: NotifProfile[], htmlText: string): Promise<void> {
  // Collect Teams channel jobs: convId → { serviceUrl, names[] }
  const channelMap = new Map<string, { serviceUrl: string; names: string[] }>();
  const teamsJobs: Array<{ convId: string; serviceUrl: string; memberId?: string | null; text: string }> = [];
  const telegramJobs: Array<{ chatId: number; text: string }> = [];

  for (const p of profiles) {
    const channel = p.notification_channel ?? 'telegram';

    // Telegram — always individual, personal message (no name prefix needed)
    if ((channel === 'telegram' || channel === 'both') && p.telegram_is_active && p.telegram_chat_id) {
      telegramJobs.push({ chatId: p.telegram_chat_id, text: htmlText });
    }

    // Teams
    if ((channel === 'teams' || channel === 'both') && p.teams_is_active && p.teams_conversation_id && p.teams_service_url) {
      const convId = p.teams_conversation_id;
      const isChannel = !isPersonalConversation(convId);
      const hasMemberId = Boolean(p.teams_member_id);

      if (isChannel && !hasMemberId) {
        // Deduplicate channel messages — collect names to show recipients
        const entry = channelMap.get(convId);
        const name = p.full_name || null;
        if (entry) {
          if (name) entry.names.push(name);
        } else {
          channelMap.set(convId, { serviceUrl: p.teams_service_url!, names: name ? [name] : [] });
        }
      } else {
        // Personal chat or has member_id (will create 1:1) — individual message
        teamsJobs.push({ convId, serviceUrl: p.teams_service_url!, memberId: p.teams_member_id, text: htmlText });
      }
    }
  }

  // Build channel jobs with names prepended
  for (const [convId, { serviceUrl, names }] of channelMap) {
    const prefix = names.length > 0
      ? `👤 <b>${names.join(', ')}</b>\n`
      : '';
    teamsJobs.push({ convId, serviceUrl, text: prefix + htmlText });
  }

  await Promise.allSettled([
    ...telegramJobs.map(j => sendTelegramMessage(j.chatId, j.text, 'HTML')),
    ...teamsJobs.map(j => sendTeamsProactive(j.convId, j.serviceUrl, j.text, j.memberId)),
  ]);
}
