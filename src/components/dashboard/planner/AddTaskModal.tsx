import React, { useState, useEffect, useRef, useMemo } from 'react';
import { MonthlyPlan, getMonthName } from '@/types/planning';
import { Modal } from '@/components/ui/Modal';
import { useProjectsForTask } from '@/hooks/useProjects';
import { useCompanies } from '@/hooks/useCompanies';
import { FileText, Check, X } from 'lucide-react';
import { getErrorMessage } from '@/lib/shared/utils/error-message';
import logger from '@/lib/shared/logger';
import type { HourDistributionType } from '@/types/infrastructure';
import { HOUR_DISTRIBUTION_TYPES } from '@/types/infrastructure';
import { useWeeklyHoursCheck, useTaskCompanyIds, useSaveTask } from '@/hooks/useAddTaskData';
import AddTaskFormFields from './AddTaskFormFields';

interface CompanyInfra {
  servers_count: number;
  workstations_count: number;
}

interface AddTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  monthlyPlanId: string;
  userId: string;
  userDepartmentId?: string;
  task?: {
    daily_task_id?: string;
    description?: string;
    title?: string | null;
    source?: string;
    spent_hours?: number;
    task_date?: string;
    attachment_url?: string | null;
    document_number?: string | null;
    project_id?: string | null;
    distribution_type?: string;
    kb_document_id?: string | null;
  } | null;
  monthlyPlan?: MonthlyPlan;
  planCompanyIds?: string[];
  planDistributionType?: HourDistributionType;
  planProjectIds?: string[];
  companyInfraMap?: Map<string, CompanyInfra>;
  creatorRole?: string;
  planDocuments?: { id: string; title: string; source_filename: string }[];
}

const EMPTY_STRING_ARRAY: string[] = [];

const AddTaskModal: React.FC<AddTaskModalProps> = ({
  isOpen, onClose, onSuccess, monthlyPlanId, userId, userDepartmentId,
  task, monthlyPlan,
  planCompanyIds = EMPTY_STRING_ARRAY,
  planDistributionType = 'even',
  planProjectIds = EMPTY_STRING_ARRAY,
  companyInfraMap, creatorRole,
  planDocuments = [],
}) => {
  const [description, setDescription] = useState('');
  const [title, setTitle] = useState('');
  const [source, setSource] = useState<string>('manual');
  const [spentHours, setSpentHours] = useState(0);
  const [taskDate, setTaskDate] = useState<string | null>(null);
  const [attachmentUrl, setAttachmentUrl] = useState('');
  const [documentNumber, setDocumentNumber] = useState('');
  const [projectId, setProjectId] = useState<string | null>(null);
  const [kbDocumentId, setKbDocumentId] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // DB hooks
  const { companies: allCompanies } = useCompanies();
  const { options: allProjectOptions, loading: projectsLoading } = useProjectsForTask(userDepartmentId);
  const { taskCompanyIds, setTaskCompanyIds, toggleCompany } = useTaskCompanyIds(isOpen, task?.daily_task_id, planCompanyIds);
  const { saveTask, loading, error, setError } = useSaveTask();

  const editingTaskHours = task?.daily_task_id && task?.task_date ? Number(task.spent_hours) || 0 : 0;
  const { weeklyHoursUsed, hoursWarning } = useWeeklyHoursCheck(userId, taskDate, spentHours, editingTaskHours);

  // Project filter
  const projectOptions = useMemo(() => {
    if (planProjectIds.length === 0) return allProjectOptions;
    return allProjectOptions.filter(p => planProjectIds.includes(p.project_id));
  }, [allProjectOptions, planProjectIds]);

  // Company names for chips
  const planCompaniesInfo = useMemo(() => {
    return planCompanyIds
      .map(id => allCompanies.find(c => c.company_id === id))
      .filter(Boolean) as { company_id: string; company_name: string }[];
  }, [planCompanyIds, allCompanies]);

  // Distribution label
  const distributionLabel = useMemo(() => {
    return HOUR_DISTRIBUTION_TYPES.find(d => d.type === planDistributionType)?.label || 'Поровну';
  }, [planDistributionType]);

  // Company share percentages
  const companyShares = useMemo(() => {
    const shares = new Map<string, number>();
    if (taskCompanyIds.length === 0) return shares;
    if (planDistributionType === 'even') {
      const pct = Math.round(100 / taskCompanyIds.length);
      for (const id of taskCompanyIds) shares.set(id, pct);
      return shares;
    }
    if (!companyInfraMap) return shares;
    const field = planDistributionType === 'by_servers' ? 'servers_count' : 'workstations_count';
    const values = taskCompanyIds.map(id => ({ id, val: companyInfraMap.get(id)?.[field] || 0 }));
    const total = values.reduce((s, v) => s + v.val, 0);
    if (total === 0) return shares;
    for (const v of values) shares.set(v.id, Math.round((v.val / total) * 100));
    return shares;
  }, [taskCompanyIds, planDistributionType, companyInfraMap]);

  // Fill form on open
  useEffect(() => {
    if (isOpen && task) {
      setDescription(task.description || '');
      setTitle(task.title || '');
      setSource(task.source || 'manual');
      setSpentHours(Number(task.spent_hours) || 0);
      if (task.task_date) {
        const d = new Date(task.task_date);
        setTaskDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
      } else {
        setTaskDate(null);
      }
      setAttachmentUrl(task.attachment_url || '');
      setDocumentNumber(task.document_number || '');
      setProjectId(task.project_id || null);
      setKbDocumentId(task.kb_document_id || null);
    } else if (isOpen && !task) {
      setDescription('');
      setTitle('');
      setSource((creatorRole === 'chief' || creatorRole === 'head') ? creatorRole : 'manual');
      setSpentHours(0);
      const now = new Date();
      setTaskDate(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`);
      setAttachmentUrl('');
      setDocumentNumber('');
      setProjectId(null);
      setKbDocumentId(null);
      setTaskCompanyIds([...planCompanyIds]);
    }
    if (isOpen) setError(null);
  }, [isOpen, task, planCompanyIds, creatorRole, setError, setTaskCompanyIds]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const currentTaskHours = task?.daily_task_id && task?.task_date ? Number(task.spent_hours) || 0 : 0;
    const totalHours = weeklyHoursUsed - currentTaskHours + spentHours;
    if (totalHours > 40) {
      setError(`Превышен недельный лимит: ${totalHours.toFixed(1)} из 40 часов`);
      return;
    }

    const finalDescription = description.trim();

    try {
      await saveTask({
        dailyTaskId: task?.daily_task_id,
        monthlyPlanId, userId, description: finalDescription,
        title, source, spentHours, taskDate, attachmentUrl,
        documentNumber, projectId, kbDocumentId,
        planDistributionType, taskCompanyIds,
      });

      // RAG fire-and-forget
      if (!task?.daily_task_id && finalDescription.length >= 10 && monthlyPlan?.procedure_id) {
        fetch('/api/ai/embeddings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            content: finalDescription, category: 'task_description',
            procedure_id: monthlyPlan.procedure_id, source: 'auto',
          }),
        }).catch(err => logger.error('[RAG] ERROR:', err));
      }

      onSuccess();
    } catch (err: unknown) {
      setError(getErrorMessage(err) || `Ошибка при ${task ? 'редактировании' : 'добавлении'} задачі`);
    }
  };

  const procedureName = monthlyPlan?.procedure_name;
  const monthYear = monthlyPlan ? `${getMonthName(monthlyPlan.month, 'ru')} ${monthlyPlan.year}` : '';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={task ? 'Редактировать задачу' : 'Новая задача'}
      headerVariant="gradient-indigo"
      showCloseButton={false}
      headerActions={
        <>
          <button type="button" onClick={onClose}
            className="p-2 rounded-xl bg-white/20 hover:bg-white/30 text-white transition-colors backdrop-blur-sm disabled:opacity-50"
            aria-label="Отмена" disabled={loading}>
            <X className="w-5 h-5" />
          </button>
          <button type="button" onClick={() => formRef.current?.requestSubmit()}
            className="p-2 rounded-xl bg-white/20 hover:bg-white/30 text-white transition-colors backdrop-blur-sm disabled:opacity-50"
            aria-label="Сохранить" disabled={loading || !!hoursWarning}>
            <Check className="w-5 h-5" />
          </button>
        </>
      }
    >
      <div className="space-y-5">
        {procedureName && (
          <div className="flex items-center gap-3 px-3 py-2 bg-indigo-50/50 rounded-xl border border-indigo-100/50">
            <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-white flex items-center justify-center shadow-sm border border-indigo-100">
              <FileText className="w-4 h-4 text-indigo-500" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-3xs font-bold text-indigo-400 uppercase tracking-wider mb-0.5">{monthYear}</p>
              <p className="text-xs font-medium text-slate-700 truncate">{procedureName}</p>
            </div>
          </div>
        )}

        <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
          <AddTaskFormFields
            title={title} description={description} spentHours={spentHours}
            taskDate={taskDate} documentNumber={documentNumber} projectId={projectId}
            kbDocumentId={kbDocumentId} attachmentUrl={attachmentUrl}
            taskCompanyIds={taskCompanyIds}
            onTitleChange={setTitle} onDescriptionChange={setDescription}
            onSpentHoursChange={setSpentHours} onTaskDateChange={setTaskDate}
            onDocumentNumberChange={setDocumentNumber} onProjectIdChange={setProjectId}
            onKbDocumentIdChange={setKbDocumentId} onAttachmentUrlChange={setAttachmentUrl}
            onCompanyToggle={toggleCompany}
            onTemplateSelect={(content, tmplTitle) => { setDescription(content); setTitle(tmplTitle); setSource('template'); }}
            procedureId={monthlyPlan?.procedure_id ?? undefined}
            procedureName={monthlyPlan?.procedure_name ?? undefined}
            planCompaniesInfo={planCompaniesInfo}
            distributionLabel={distributionLabel}
            companyShares={companyShares}
            projectOptions={projectOptions}
            projectsLoading={projectsLoading}
            planDocuments={planDocuments}
            editingTaskId={task?.daily_task_id}
            loading={loading}
            hoursWarning={hoursWarning}
            weeklyHoursUsed={weeklyHoursUsed}
          />

          {error && (
            <div className="p-3 bg-red-50 border border-red-100 rounded-xl">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}
        </form>
      </div>
    </Modal>
  );
};

export default AddTaskModal;
