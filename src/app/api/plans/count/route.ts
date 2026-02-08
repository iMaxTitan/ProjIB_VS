import { getPlansCounts } from '@/lib/plans';
import { NextRequest, NextResponse } from 'next/server';
import logger from '@/lib/logger';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('userId');
  logger.log('[plans/count] userId:', userId);

  if (!userId) {
    return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
  }

  try {
    const data = await getPlansCounts(userId);
    logger.log('[plans/count] Plans count result:', data);

    if (data && typeof data === 'object' && 'annual' in data && 'quarterly' in data) {
      return NextResponse.json(data);
    }

    logger.error('[plans/count] Unexpected RPC return type:', data);
    return NextResponse.json({ error: 'Unexpected RPC return type', details: data }, { status: 500 });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const details =
      typeof error === 'object' && error !== null && 'details' in error
        ? (error as { details?: unknown }).details
        : null;

    logger.error('[plans/count] Error:', error);
    return NextResponse.json({ error: errorMessage, details }, { status: 500 });
  }
}

