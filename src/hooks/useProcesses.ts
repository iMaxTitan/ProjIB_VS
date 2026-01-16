import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Process } from '@/types/planning';

export function useProcesses() {
  const [processes, setProcesses] = useState<Process[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchProcesses() {
      setLoading(true);
      const { data, error } = await supabase
        .from('processes')
        .select('process_id, process_name')
        .order('process_name', { ascending: true });
      if (error) {
        setError(error.message);
      } else {
        setProcesses(data || []);
      }
      setLoading(false);
    }
    fetchProcesses();
  }, []);

  return { processes, loading, error };
}
