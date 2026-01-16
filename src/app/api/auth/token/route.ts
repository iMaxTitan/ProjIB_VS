import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    let body: { code?: string; token?: string } = {};
    try {
      body = await request.json();
    } catch (e) {
      // Body is empty or invalid JSON
    }
    // Поддержка двух вариантов: либо приходит { code }, либо { token }
    const code = body.code;
    const accessTokenFromClient = body.token;

    if (!code && !accessTokenFromClient) {
      return NextResponse.json(
        { message: 'Code or token is required' },
        { status: 400 }
      );
    }

    let cookieValue = '';
    let debugInfo = {};
    if (code) {
      // Оригинальная логика обмена code на токен
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

      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to exchange code for token: ${response.statusText}`);
      }

      const data = await response.json();
      cookieValue = data.access_token;
      debugInfo = { ...data };
    } else if (accessTokenFromClient) {
      // Если токен уже есть на клиенте (MSAL flow)
      cookieValue = accessTokenFromClient;
      debugInfo = { note: 'token from client', tokenLength: accessTokenFromClient.length };
    }

    const cookieStr = `auth_token=${cookieValue}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${60 * 60 * 24 * 7}`;

    const res = NextResponse.json({
      message: 'Token set',
      debug: debugInfo,
      setCookie: cookieStr,
      origin: request.headers.get('origin'),
      headers: Object.fromEntries(request.headers.entries())
    }, {
      status: 200,
      headers: {
        'Set-Cookie': cookieStr,
        'Content-Type': 'application/json'
      }
    });
    return res;
  } catch (error) {
    return NextResponse.json(
      { 
        message: 'Internal server error',
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
} 