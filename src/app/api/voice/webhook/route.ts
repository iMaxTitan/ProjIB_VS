/**
 * POST /api/voice/webhook
 * Post-call webhook від ElevenLabs Conversational AI.
 * Формат: { type: "post_call_transcription", data: { ... } }
 * Auth: elevenlabs-signature (HMAC) або x-webhook-secret (fallback).
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import logger from '@/lib/shared/logger';
import { config } from '@/lib/shared/config';
import { checkRateLimit } from '@/lib/shared/api/request-guards';
import { getServerDb } from '@/lib/shared/db-server';
import { logVoiceSession } from '@/lib/bot/voice/session-logger';

const RATE_LIMIT = 100;
const RATE_WINDOW_MS = 60_000;

/**
 * Verify ElevenLabs HMAC signature (elevenlabs-signature header).
 * Format: "t=<timestamp>,v0=<hmac>"
 */
function verifyHmacSignature(payload: string, signatureHeader: string, secret: string): boolean {
  try {
    const parts = signatureHeader.split(',');
    const timestamp = parts.find(p => p.startsWith('t='))?.slice(2);
    const signature = parts.find(p => p.startsWith('v0='))?.slice(3);
    if (!timestamp || !signature) return false;

    const signedPayload = `${timestamp}.${payload}`;
    const expected = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

/** Simple secret header fallback (x-webhook-secret or Authorization). */
function verifySimpleSecret(req: NextRequest): boolean {
  const secret = req.headers.get('x-webhook-secret')
    ?? req.headers.get('authorization')?.replace('Bearer ', '');
  return !!config.elevenlabs.webhookSecret && secret === config.elevenlabs.webhookSecret;
}

export async function POST(req: NextRequest) {
  logger.info('[voice/webhook] incoming request');
  const rl = checkRateLimit('voice_webhook_global', RATE_LIMIT, RATE_WINDOW_MS);
  if (!rl.allowed) {
    return NextResponse.json({ ok: true });
  }

  // Read raw body for HMAC verification
  const rawBody = await req.text();

  // Auth: HMAC signature preferred (signingSecret), simple secret as fallback (webhookSecret)
  const elSignature = req.headers.get('elevenlabs-signature');
  const hmacSecret = config.elevenlabs.signingSecret || config.elevenlabs.webhookSecret;
  const isHmacValid = elSignature && hmacSecret
    ? verifyHmacSignature(rawBody, elSignature, hmacSecret)
    : false;

  if (!isHmacValid && !verifySimpleSecret(req)) {
    logger.error('[voice/webhook] auth failed — hmac:', !!elSignature, 'simple:', !!req.headers.get('x-webhook-secret'));
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  logger.info('[voice/webhook] auth OK, processing...');

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const eventType = body.type as string | undefined;
  logger.info('[voice/webhook] event:', eventType ?? 'unknown');

  if (eventType === 'post_call_transcription') {
    const data = body.data as Record<string, unknown> | undefined;
    if (!data) {
      logger.warn('[voice/webhook] missing data in post_call_transcription');
      return NextResponse.json({ ok: true });
    }

    const conversationId = (data.conversation_id ?? data.id) as string | undefined;
    const metadata = data.metadata as Record<string, unknown> | undefined;
    const duration = (metadata?.call_duration_secs ?? data.duration ?? 0) as number;
    const transcript = (data.transcript ?? []) as unknown[];

    if (conversationId) {
      const db = getServerDb();
      // ElevenLabs may send non-UUID values like "unknown" — validate before insert
      const rawUserId = ((metadata?.user_id ?? data.user_id) as string) || null;
      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const userId = rawUserId && UUID_RE.test(rawUserId) ? rawUserId : null;
      await logVoiceSession(db, {
        userId,
        conversationId,
        durationSeconds: Math.round(duration),
        transcript,
        source: 'web',
      });
    }
  }

  return NextResponse.json({ ok: true });
}
