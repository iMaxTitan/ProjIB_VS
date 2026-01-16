import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { code } = req.body;
  if (!code) {
    return res.status(400).json({ message: 'Code is required' });
  }

  try {
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

    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ 
      message: 'Internal server error',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
} 