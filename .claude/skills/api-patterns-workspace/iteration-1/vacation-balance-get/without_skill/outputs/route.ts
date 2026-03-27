import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(req: NextRequest) {
  try {
    // Basic auth check - get user from session/cookie
    const userId = req.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Create Supabase client
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Get current year
    const currentYear = new Date().getFullYear();

    // Query planned_absences for the user
    const { data: absences, error } = await supabase
      .from('planned_absences')
      .select('*')
      .eq('user_id', userId)
      .gte('start_date', `${currentYear}-01-01`)
      .lte('start_date', `${currentYear}-12-31`);

    if (error) {
      console.error('Failed to fetch absences:', error);
      return NextResponse.json(
        { error: 'Failed to fetch vacation balance' },
        { status: 500 }
      );
    }

    // Calculate used days
    const usedDays = (absences || []).reduce((total, absence) => {
      const start = new Date(absence.start_date);
      const end = new Date(absence.end_date);
      const diffTime = Math.abs(end.getTime() - start.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
      return total + diffDays;
    }, 0);

    // Standard vacation allowance (24 calendar days is common)
    const totalAllowance = 24;
    const remainingDays = totalAllowance - usedDays;

    return NextResponse.json({
      year: currentYear,
      totalAllowance,
      usedDays,
      remainingDays,
      absences: absences || [],
    });
  } catch (err) {
    console.error('Vacation balance error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
