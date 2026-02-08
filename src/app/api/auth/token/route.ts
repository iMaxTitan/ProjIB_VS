import { NextRequest, NextResponse } from 'next/server';
import { fetchWithTimeout } from '@/lib/utils/fetch-with-timeout';

function isHttpsRequest(request: NextRequest): boolean {
  const forwardedProto = request.headers.get('x-forwarded-proto');
  if (forwardedProto) return forwardedProto.includes('https');
  return request.nextUrl.protocol === 'https:';
}

function isLikelyJwt(token: string): boolean {
  const parts = token.split('.');
  return parts.length === 3 && parts.every(Boolean);
}

export async function POST(request: NextRequest) {
  try {
    let body: { code?: string; token?: string } = {};
    try {
      body = await request.json();
    } catch {
      // empty body
    }

    const code = body.code;
    const accessTokenFromClient = body.token;

    if (!code && !accessTokenFromClient) {
      return NextResponse.json({ message: 'Code or token is required' }, { status: 400 });
    }

    let cookieValue = '';

    if (code) {
      const clientId = process.env.NEXT_PUBLIC_AZURE_AD_CLIENT_ID;
      const tenantId = process.env.NEXT_PUBLIC_AZURE_AD_TENANT_ID;
      const redirectUri = process.env.NEXT_PUBLIC_BASE_URL + '/auth/callback';
      const clientSecret = process.env.AZURE_AD_CLIENT_SECRET;

      if (!clientId || !tenantId || !redirectUri || !clientSecret) {
        throw new Error('Missing required environment variables');
      }

      const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
      const params = new URLSearchParams({
        client_id: clientId,
        scope: 'openid profile email',
        code,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        client_secret: clientSecret,
      });

      const response = await fetchWithTimeout(
        tokenUrl,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: params.toString(),
        },
        15000
      );

      if (!response.ok) {
        throw new Error(`Failed to exchange code for token: ${response.statusText}`);
      }

      const data = await response.json();
      cookieValue = data.access_token;
    } else if (accessTokenFromClient) {
      cookieValue = accessTokenFromClient;
    }

    if (!cookieValue || !isLikelyJwt(cookieValue)) {
      return NextResponse.json({ message: 'Invalid token format' }, { status: 400 });
    }

    const res = NextResponse.json({ message: 'Token set' }, { status: 200 });
    res.cookies.set({
      name: 'auth_token',
      value: cookieValue,
      httpOnly: true,
      secure: isHttpsRequest(request),
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    });

    return res;
  } catch (error: unknown) {
    return NextResponse.json(
      {
        message: 'Internal server error',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
