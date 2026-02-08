import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { getErrorMessage } from '@/lib/utils/error-message';
import { Process } from '@/types/planning';

interface UseProcessesOptions {
  userId?: string;
  all?: boolean;
}

export function useProcesses(options: UseProcessesOptions = {}) {
  const [processes, setProcesses] = useState<Process[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchProcesses() {
      setLoading(true);
      setError(null);

      try {
        const { data, error: queryError } = await supabase
          .from('processes')
          .select('process_id, process_name')
          .order('process_name', { ascending: true });

        if (queryError) throw queryError;
        setProcesses(data || []);
      } catch (err: unknown) {
        setError(getErrorMessage(err, 'Не удалось загрузить процессы'));
      } finally {
        setLoading(false);
      }
    }

    fetchProcesses();
  }, [options.userId, options.all]);

  return { processes, loading, error };
}
