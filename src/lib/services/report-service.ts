import { supabase } from '../supabase';

export async function getQuarterlyReports() {
  const { data, error } = await supabase
    .from('v_quarterly_reports')
    .select('*');
  if (error) throw error;
  return data;
}
