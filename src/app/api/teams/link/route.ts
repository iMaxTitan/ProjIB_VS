/**
 * GET    /api/teams/link — Teams link status for current user
 * POST   /api/teams/link — Link Teams account (extracts OID from Azure AD token)
 * DELETE /api/teams/link — Unlink Teams account
 */

import { NextRequest, NextResponse } from 'next/server';
import { isRequestAuthorized, getDbUserId } from '@/lib/shared/api/request-guards';
import { getServerDb } from '@/lib/shared/db-server';

function extractOidFromJwt(token: string): string | null {
  try {
    const [, payload] = token.split('.');
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString()) as Record<string, unknown>;
    return typeof decoded.oid === 'string' ? decoded.oid : null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  if (!isRequestAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = getDbUserId(req);
  if (!userId) return NextResponse.json({ error: 'Missing user ID' }, { status: 401 });

  const db = getServerDb();
  const { data } = await db
    .from('user_profiles')
    .select('teams_is_active, teams_linked_at')
    .eq('user_id', userId)
    .single();

  return NextResponse.json({
    linked: data?.teams_is_active ?? false,
    linkedAt: data?.teams_linked_at ?? null,
  });
}

export async function POST(req: NextRequest) {
  if (!isRequestAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = getDbUserId(req);
  if (!userId) return NextResponse.json({ error: 'Missing user ID' }, { status: 401 });

  const authToken = req.cookies.get('auth_token')?.value;
  if (!authToken) return NextResponse.json({ error: 'No auth token' }, { status: 401 });

  const oid = extractOidFromJwt(authToken);
  if (!oid) return NextResponse.json({ error: 'Could not extract Azure AD OID from token' }, { status: 400 });

  const db = getServerDb();
  const { error } = await db
    .from('user_profiles')
    .update({
      teams_aad_oid: oid,
      teams_is_active: true,
      teams_linked_at: new Date().toISOString(),
    })
    .eq('user_id', userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  if (!isRequestAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = getDbUserId(req);
  if (!userId) return NextResponse.json({ error: 'Missing user ID' }, { status: 401 });

  const db = getServerDb();
  await db
    .from('user_profiles')
    .update({ teams_is_active: false })
    .eq('user_id', userId);

  return NextResponse.json({ ok: true });
}
