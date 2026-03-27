import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { reportId, text } = body;

    if (!reportId || !text) {
      return NextResponse.json(
        { error: 'reportId and text are required' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('report_comments')
      .insert({
        report_id: reportId,
        text,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error('Failed to insert comment:', error);
      return NextResponse.json(
        { error: 'Failed to save comment' },
        { status: 500 }
      );
    }

    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    console.error('Unexpected error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
