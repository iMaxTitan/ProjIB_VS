import React, { useState, useEffect } from 'react';
import { ListChecks } from 'lucide-react';
import { cn } from '@/lib/shared/utils';
import logger from '@/lib/shared/logger';

interface Template {
  id: string;
  title: string;
  content: string;
}

interface TaskTemplatePickerProps {
  procedureId?: string;
  onSelect: (content: string, title: string) => void;
}

/**
 * Shows procedure task templates as clickable chips.
 * When user clicks a template, its content fills the description textarea.
 * Hidden when no templates exist for the procedure.
 */
const TaskTemplatePicker: React.FC<TaskTemplatePickerProps> = ({ procedureId, onSelect }) => {
  const [templates, setTemplates] = useState<Template[]>([]);

  useEffect(() => {
    if (!procedureId) {
      setTemplates([]);
      return;
    }

    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetch(
          `/api/cabinet/task-templates?procedure_id=${procedureId}`,
          { credentials: 'include' },
        );
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && Array.isArray(data) && data.length > 0) {
          setTemplates(data);
        }
      } catch (err) {
        logger.warn('[TaskTemplatePicker] Failed to load templates:', err);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [procedureId]);

  if (templates.length === 0) return null;

  return (
    <div className="mt-2">
      <p className="text-3xs font-bold text-violet-500 uppercase tracking-wider mb-1.5 pl-1 flex items-center gap-1">
        <ListChecks className="w-3 h-3" aria-hidden="true" />
        Шаблони
      </p>
      <div className="flex flex-col gap-1.5">
        {templates.map((t) => (
          <button
            key={t.id}
            type="button"
            title={t.content}
            onClick={() => onSelect(t.content, t.title)}
            aria-label={`Використати шаблон: ${t.title}`}
            className={cn(
              'w-full flex items-center gap-1.5 px-2.5 py-1 text-xs text-left',
              'bg-violet-50 text-violet-800 border border-violet-200',
              'rounded-lg hover:bg-violet-100 hover:border-violet-300',
              'transition-colors duration-150',
              'focus:outline-none focus:ring-2 focus:ring-violet-400 focus:ring-offset-1',
            )}
          >
            <ListChecks className="w-3 h-3 flex-shrink-0 text-violet-400" aria-hidden="true" />
            <span className="truncate font-medium">{t.title}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default TaskTemplatePicker;
