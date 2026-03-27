import React, { useState, useEffect } from 'react';
import { Star } from 'lucide-react';
import logger from '@/lib/shared/logger';

interface TaskSuggestionsProps {
  procedureId?: string;
  onSelect: (text: string) => void;
}

interface EtalonExample {
  id: string;
  content: string;
}

/**
 * Показує еталонні приклади описів задач із RAG (vector DB).
 * Клікабельні чіпи — при натисканні заповнюється textarea.
 * Якщо еталонів немає — блок прихований.
 */
const TaskSuggestions: React.FC<TaskSuggestionsProps> = ({ procedureId, onSelect }) => {
  const [examples, setExamples] = useState<EtalonExample[]>([]);

  useEffect(() => {
    if (!procedureId) {
      setExamples([]);
      return;
    }

    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetch(
          `/api/ai/embeddings?procedure_id=${procedureId}&category=task_description&limit=5`,
          { credentials: 'include' }
        );
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && Array.isArray(data) && data.length > 0) {
          setExamples(data);
        }
      } catch (err) {
        logger.warn('[TaskSuggestions] Failed to load etalons:', err);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [procedureId]);

  if (examples.length === 0) return null;

  return (
    <div className="mt-2">
      <p className="text-3xs font-bold text-amber-500 uppercase tracking-wider mb-1.5 pl-1 flex items-center gap-1">
        <Star className="w-3 h-3" aria-hidden="true" />
        Еталони
      </p>
      <div className="flex flex-col gap-1.5">
        {examples.map((ex) => (
          <button
            key={ex.id}
            type="button"
            title={ex.content}
            onClick={() => onSelect(ex.content)}
            aria-label={`Використати еталон: ${ex.content.slice(0, 40)}...`}
            className="
              w-full flex items-center gap-1.5 px-2.5 py-1 text-xs text-left
              bg-amber-50 text-amber-800 border border-amber-200
              rounded-lg hover:bg-amber-100 hover:border-amber-300
              transition-colors duration-150
              focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-1
            "
          >
            <Star className="w-3 h-3 flex-shrink-0 text-amber-400" aria-hidden="true" />
            <span className="truncate">{ex.content}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default TaskSuggestions;
