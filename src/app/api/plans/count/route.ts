import { getPlansCounts } from '@/lib/plans';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('userId');
  console.log('[plans/count] userId:', userId); // логируем userId
  if (!userId) {
    return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
  }

  try {
    const data = await getPlansCounts(userId);
    console.log('[plans/count] Plans count result:', data); // логируем результат вызова
    if (
      data &&
      typeof data === 'object' &&
      'annual' in data &&
      'quarterly' in data &&
      'weekly' in data
    ) {
      return NextResponse.json(data);
    } else {
      console.error('[plans/count] Unexpected RPC return type:', data);
      return NextResponse.json({ error: 'Unexpected RPC return type', details: data }, { status: 500 });
    }
  } catch (error: any) {
    console.error('[plans/count] Error:', error); // логируем ошибку
    return NextResponse.json({ error: error.message, details: error.details || null }, { status: 500 });
  }
}