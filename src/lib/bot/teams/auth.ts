/**
 * Teams bot authentication.
 * aad_oid → user_profiles (teams fields merged in)
 */

import type { PostgrestClient } from '@/lib/shared/postgrest-client';
import { fetchWithTimeout } from '@/lib/shared/utils/fetch-with-timeout';
import logger from '@/lib/shared/logger';
import { config } from '@/lib/shared/config';
import type { ResolvedTeamsUser, TeamsUser, TeamsUserProfile } from './types';

// Token cache for Graph API client credentials
let graphTokenCache: { token: string; expires: number } | null = null;

async function getGraphToken(): Promise<string | null> {
  if (graphTokenCache && Date.now() < graphTokenCache.expires) {
    return graphTokenCache.token;
  }

  const tenantId = config.azure.tenantId;
  const clientId = config.azure.clientId;
  const clientSecret = config.azure.clientSecret;

  if (!tenantId || !clientId || !clientSecret) {
    logger.error('[Teams Auth] Missing NEXT_PUBLIC_AZURE_AD_TENANT_ID/CLIENT_ID or AZURE_AD_CLIENT_SECRET env vars');
    return null;
  }

  try {
    const res = await fetchWithTimeout(
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: clientId,
          client_secret: clientSecret,
          scope: 'https://graph.microsoft.com/.default',
        }).toString(),
      },
      15_000,
    );

    const data = await res.json() as { access_token?: string; expires_in?: number; error?: string };
    if (!data.access_token) {
      logger.error('[Teams Auth] Graph token error:', data.error);
      return null;
    }

    graphTokenCache = {
      token: data.access_token,
      expires: Date.now() + ((data.expires_in ?? 3600) - 60) * 1000,
    };
    return graphTokenCache.token;
  } catch (err) {
    logger.error('[Teams Auth] getGraphToken error:', err);
    return null;
  }
}

export async function getGraphUserInfo(aadOid: string): Promise<{ email: string; displayName: string } | null> {
  const token = await getGraphToken();
  if (!token) return null;

  try {
    const res = await fetchWithTimeout(
      `https://graph.microsoft.com/v1.0/users/${aadOid}?$select=mail,userPrincipalName,displayName`,
      { headers: { Authorization: `Bearer ${token}` } },
      10_000,
    );

    if (!res.ok) return null;
    const data = await res.json() as { mail?: string; userPrincipalName?: string; displayName?: string };
    const email = data.mail || data.userPrincipalName || null;
    if (!email) return null;
    return { email, displayName: data.displayName || email };
  } catch (err) {
    logger.error('[Teams Auth] getGraphUserInfo error:', err);
    return null;
  }
}

/** Returns true if conversationId is a personal (1:1) chat, not a channel thread. */
function isPersonalConversation(conversationId: string): boolean {
  return conversationId.startsWith('a:') || conversationId.startsWith('29:');
}

/**
 * Resolve aadOid → user_profiles (teams fields).
 * On first encounter: calls Graph API to get email, then finds and updates user_profiles.
 * Updates conversation ID and service URL on every message.
 * Prioritises personal chat IDs (a:/29:) over channel IDs (19:) to enable proactive DMs.
 */
export async function resolveOrCreateUser(
  db: PostgrestClient,
  aadOid: string,
  conversationId: string,
  serviceUrl: string,
  memberId?: string,
): Promise<ResolvedTeamsUser | null> {
  // 1. Check if already linked in user_profiles
  const { data: existing } = await db
    .from('user_profiles')
    .select('user_id, full_name, role, department_id, status, teams_aad_oid, teams_conversation_id, teams_service_url, teams_is_active')
    .eq('teams_aad_oid', aadOid)
    .eq('teams_is_active', true)
    .single();

  let userId: string | null = null;

  if (existing) {
    // Update conversation context.
    // Prefer personal chat IDs (a:/29:) — don't overwrite with a channel ID (19:).
    const shouldUpdateConvId =
      isPersonalConversation(conversationId) ||
      !isPersonalConversation(existing.teams_conversation_id || '');

    await db
      .from('user_profiles')
      .update({
        ...(shouldUpdateConvId ? { teams_conversation_id: conversationId } : {}),
        teams_service_url: serviceUrl,
        ...(memberId ? { teams_member_id: memberId } : {}),
      })
      .eq('user_id', existing.user_id);

    userId = existing.user_id;
  } else {
    // First time: look up via Graph API email → user_profiles
    const graphInfo = await getGraphUserInfo(aadOid);
    let foundUserId: string | null = null;

    if (graphInfo) {
      const emailLower = graphInfo.email.toLowerCase();
      const emailVariants = [emailLower];
      const [local, domain] = emailLower.split('@');
      if (domain === 'atbmarket.com') emailVariants.push(`${local}@atb.ua`);
      if (domain === 'atb.ua') emailVariants.push(`${local}@atbmarket.com`);

      for (const variant of emailVariants) {
        const { data: profile } = await db
          .from('user_profiles')
          .select('user_id')
          .ilike('email', variant)
          .eq('status', 'active')
          .single();
        if (profile?.user_id) { foundUserId = profile.user_id; break; }
      }
    }

    if (!foundUserId) {
      logger.warn('[Teams Auth] User not found for aadOid:', aadOid);
      return null;
    }

    // Link Teams channel in user_profiles
    await db
      .from('user_profiles')
      .update({
        teams_aad_oid: aadOid,
        teams_conversation_id: conversationId,
        teams_service_url: serviceUrl,
        teams_is_active: true,
        teams_linked_at: new Date().toISOString(),
        ...(memberId ? { teams_member_id: memberId } : {}),
      })
      .eq('user_id', foundUserId);

    userId = foundUserId;
  }

  // Load fresh profile
  const { data: profile } = await db
    .from('user_profiles')
    .select('user_id, full_name, role, department_id, status')
    .eq('user_id', userId)
    .single();

  if (!profile || profile.status !== 'active' || !userId) return null;

  const teamsUser: TeamsUser = {
    user_id: userId,
    teams_aad_oid: aadOid,
    teams_conversation_id: conversationId,
    teams_service_url: serviceUrl,
    teams_is_active: true,
  };

  return {
    teamsUser,
    profile: profile as unknown as TeamsUserProfile,
  };
}
