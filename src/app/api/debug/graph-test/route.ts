import { NextRequest, NextResponse } from 'next/server';
import { isRequestAuthorized } from '@/lib/shared/api/request-guards';
import { config } from '@/lib/shared/config';

async function getGraphToken(): Promise<{ token: string | null; error?: string }> {
  const tenantId = config.azure.tenantId;
  const clientId = config.azure.clientId;
  const clientSecret = config.azure.clientSecret;

  if (!tenantId || !clientId || !clientSecret) {
    return { token: null, error: 'Missing env vars' };
  }

  const res = await fetch(
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
  );

  const data = await res.json() as { access_token?: string; error?: string; error_description?: string };
  if (!data.access_token) {
    return { token: null, error: `${data.error}: ${data.error_description}` };
  }
  return { token: data.access_token };
}

async function graphGet(token: string, url: string) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.json();
  return { status: res.status, ok: res.ok, body };
}

export async function GET(req: NextRequest) {
  if (!isRequestAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 1. Get token
  const { token, error: tokenError } = await getGraphToken();
  if (!token) {
    return NextResponse.json({ step: 'token', error: tokenError }, { status: 500 });
  }

  const results: Record<string, unknown> = { tokenOk: true };

  // Approach: query meetings directly per employee AAD OID (from user_profiles.teams_aad_oid)
  // Much more targeted than callRecords (which returns ALL tenant calls)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Test with Іванов Максим (chief, logged in) — teams_aad_oid from user_profiles
  const testUserOid = 'f5500e16-c69b-4d74-8dc4-06fd7a917673';

  const now = new Date().toISOString();

  // 1. Calendar view — returns all events (including online meetings) by date range
  //    Requires Calendars.Read (Application) — test if available
  const calView = await graphGet(
    token,
    `https://graph.microsoft.com/v1.0/users/${testUserOid}/calendarView` +
    `?startDateTime=${thirtyDaysAgo}&endDateTime=${now}` +
    `&$select=id,subject,start,end,isOnlineMeeting,onlineMeeting` +
    `&$top=20`,
  );
  type CalEvent = { id: string; subject: string; start: { dateTime: string }; isOnlineMeeting?: boolean; onlineMeeting?: { joinUrl: string } };
  const allEvents = calView.ok ? (calView.body as { value?: CalEvent[] }).value ?? [] : [];
  const calEvents = allEvents.filter(e => e.isOnlineMeeting && e.onlineMeeting?.joinUrl);
  results.calendarView = { status: calView.status, totalEvents: allEvents.length, onlineMeetings: calEvents.length, sample: calEvents.slice(0, 5), error: calView.ok ? undefined : calView.body };

  // 2. For each calendar event — find onlineMeeting + check transcripts
  const transcriptResults: unknown[] = [];
  for (const evt of calEvents.slice(0, 5)) {
    const joinUrl = evt.onlineMeeting?.joinUrl;
    if (!joinUrl) continue;

    const mtg = await graphGet(token, `https://graph.microsoft.com/v1.0/users/${testUserOid}/onlineMeetings?$filter=joinWebUrl eq '${joinUrl}'`);
    const meetingId = mtg.ok ? (mtg.body as { value?: Array<{ id: string }> }).value?.[0]?.id : null;
    if (!meetingId) continue;

    const tr = await graphGet(token, `https://graph.microsoft.com/v1.0/users/${testUserOid}/onlineMeetings/${meetingId}/transcripts`);
    const transcripts = tr.ok ? ((tr.body as { value?: Array<{ id: string }> }).value ?? []) : [];
    const count = transcripts.length;

    // If transcripts exist — fetch the first one as VTT text
    let vttContent: string | null = null;
    if (count > 0) {
      const vttRes = await fetch(
        `https://graph.microsoft.com/v1.0/users/${testUserOid}/onlineMeetings/${meetingId}/transcripts/${transcripts[0].id}/content?$format=text/vtt`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (vttRes.ok) {
        const raw = await vttRes.text();
        vttContent = raw.slice(0, 3000); // first 3000 chars for debug
      } else {
        vttContent = `Error ${vttRes.status}: ${await vttRes.text().catch(() => '')}`;
      }
    }

    transcriptResults.push({ subject: evt.subject, start: evt.start.dateTime, meetingFound: !!meetingId, transcriptCount: count, vttPreview: vttContent });
  }
  results.transcriptScan = { checked: Math.min(calEvents.length, 5), results: transcriptResults };

  return NextResponse.json(results, { status: 200 });
}
