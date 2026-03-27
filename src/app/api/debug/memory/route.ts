import { NextRequest, NextResponse } from 'next/server';
import { isRequestAuthorized } from '@/lib/shared/api/request-guards';
import { getStoreSize } from '@/lib/ops/presence/store';

export async function GET(req: NextRequest) {
  if (!isRequestAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const mem = process.memoryUsage();

  return NextResponse.json({
    heapUsed: `${Math.round(mem.heapUsed / 1024 / 1024)}MB`,
    heapTotal: `${Math.round(mem.heapTotal / 1024 / 1024)}MB`,
    rss: `${Math.round(mem.rss / 1024 / 1024)}MB`,
    external: `${Math.round(mem.external / 1024 / 1024)}MB`,
    presenceStoreSize: getStoreSize(),
    uptimeMin: Math.round(process.uptime() / 60),
  });
}
