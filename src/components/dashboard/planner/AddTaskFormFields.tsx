import React from 'react';
import { Clock, Calendar, FileText, Paperclip, Folder } from 'lucide-react';
import { cn } from '@/lib/shared/utils';
import TaskFileUpload from './TaskFileUpload';
import CompanyDistributionSelector from './CompanyDistributionSelector';
import TaskTemplatePicker from './TaskTemplatePicker';
import AITextCleanup from '@/components/ui/AITextCleanup';

interface CompanyInfo {
  company_id: string;
  company_name: string;
}

interface ProjectOption {
  project_id: string;
  project_name: string;
}

interface PlanDocument {
  id: string;
  title: string;
  source_filename: string;
}

interface AddTaskFormFieldsProps {
  // Values
  title: string;
  description: string;
  spentHours: number;
  taskDate: string | null;
  documentNumber: string;
  projectId: string | null;
  kbDocumentId: string | null;
  attachmentUrl: string;
  taskCompanyIds: string[];
  // Handlers
  onTitleChange: (v: string) => void;
  onDescriptionChange: (v: string) => void;
  onSpentHoursChange: (v: number) => void;
  onTaskDateChange: (v: string | null) => void;
  onDocumentNumberChange: (v: string) => void;
  onProjectIdChange: (v: string | null) => void;
  onKbDocumentIdChange: (v: string | null) => void;
  onAttachmentUrlChange: (v: string) => void;
  onCompanyToggle: (companyId: string) => void;
  onTemplateSelect: (content: string, title: string) => void;
  // Context
  procedureId?: string;
  procedureName?: string;
  planCompaniesInfo: CompanyInfo[];
  distributionLabel: string;
  companyShares: Map<string, number>;
  projectOptions: ProjectOption[];
  projectsLoading: boolean;
  planDocuments: PlanDocument[];
  editingTaskId?: string;
  // UI state
  loading: boolean;
  hoursWarning: string | null;
  weeklyHoursUsed: number;
}

export const AddTaskFormFields: React.FC<AddTaskFormFieldsProps> = ({
  title, description, spentHours, taskDate, documentNumber, projectId,
  kbDocumentId, attachmentUrl, taskCompanyIds,
  onTitleChange, onDescriptionChange, onSpentHoursChange, onTaskDateChange,
  onDocumentNumberChange, onProjectIdChange, onKbDocumentIdChange,
  onAttachmentUrlChange, onCompanyToggle, onTemplateSelect,
  procedureId, procedureName, planCompaniesInfo, distributionLabel,
  companyShares, projectOptions, projectsLoading, planDocuments,
  editingTaskId, loading, hoursWarning, weeklyHoursUsed,
}) => (
  <>
    {/* Title */}
    <div>
      <label className="text-3xs font-bold text-indigo-400 uppercase tracking-wider mb-1.5 pl-1 block">
        Назва задачі
      </label>
      <input
        type="text"
        className={cn(
          "w-full px-3 py-2 text-xs border border-slate-200 rounded-xl transition-colors",
          "placeholder:text-slate-400",
          "focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400",
          "disabled:bg-slate-50 disabled:text-slate-500"
        )}
        value={title}
        onChange={e => onTitleChange(e.target.value)}
        placeholder="Коротка назва (необов'язково)"
        maxLength={200}
        disabled={loading}
        aria-label="Назва задачі"
      />
    </div>

    {/* Description */}
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-3xs font-bold text-indigo-400 uppercase tracking-wider pl-1">
          Опис задачі <span className="text-red-500">*</span>
        </label>
        <AITextCleanup
          text={description}
          onResult={onDescriptionChange}
          category="task_description"
          procedureId={procedureId}
          procedureName={procedureName}
          projectNames={projectId ? [projectOptions.find(p => p.project_id === projectId)?.project_name].filter(Boolean) as string[] : undefined}
          disabled={loading}
          statusBefore
          persistDone
        />
      </div>
      <textarea
        className={cn(
          "w-full px-3 py-2.5 text-xs border rounded-xl resize-none transition-colors",
          "placeholder:text-slate-400",
          "focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400",
          "disabled:bg-slate-50 disabled:text-slate-500"
        )}
        value={description}
        onChange={e => onDescriptionChange(e.target.value)}
        rows={3}
        required
        disabled={loading}
        placeholder="Опишите выполненную работу..."
      />
      <TaskTemplatePicker
        procedureId={procedureId}
        onSelect={onTemplateSelect}
      />
    </div>

    {/* Companies */}
    {planCompaniesInfo.length > 0 && (
      <CompanyDistributionSelector
        companies={planCompaniesInfo}
        selectedIds={taskCompanyIds}
        onToggle={onCompanyToggle}
        distributionLabel={distributionLabel}
        companyShares={companyShares}
        disabled={loading}
      />
    )}

    {/* Hours, Date & Document */}
    <div className="flex flex-col sm:flex-row gap-2 sm:gap-2">
      <div className="flex gap-2">
        <div className="flex-shrink-0">
          <label className="flex items-center gap-1.5 text-3xs font-bold text-indigo-400 uppercase tracking-wider mb-1.5 pl-1">
            <Clock className="w-3 h-3" aria-hidden="true" />
            Часы
          </label>
          <input
            type="number"
            className={cn(
              "w-20 sm:w-16 px-2 py-2.5 sm:py-2 text-sm text-center border rounded-xl transition-colors",
              "focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400",
              hoursWarning ? 'border-amber-300 bg-amber-50' : 'border-slate-200'
            )}
            value={spentHours}
            onChange={e => onSpentHoursChange(Number(e.target.value))}
            onFocus={e => e.target.select()}
            min={0}
            max={40}
            step={0.5}
            disabled={loading}
            aria-label="Количество часов"
          />
          {hoursWarning ? (
            <div className="w-20 sm:w-16 mt-1 px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg text-2xs text-center" role="alert">
              {hoursWarning}
            </div>
          ) : taskDate && weeklyHoursUsed > 0 && (
            <div className="w-20 sm:w-16 mt-1 py-px bg-amber-50 text-amber-600 border border-amber-200 rounded-md text-3xs text-center whitespace-nowrap">
              {weeklyHoursUsed.toFixed(1)}/40ч
            </div>
          )}
        </div>

        <div className="flex-1 sm:w-32 sm:flex-shrink-0 sm:flex-grow-0">
          <label className="flex items-center gap-1.5 text-3xs font-bold text-indigo-400 uppercase tracking-wider mb-1.5 pl-1">
            <Calendar className="w-3 h-3" aria-hidden="true" />
            Дата
          </label>
          <input
            type="date"
            className={cn(
              "w-full px-2 py-2.5 sm:py-2 text-sm border border-slate-200 rounded-xl transition-colors",
              "focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
            )}
            value={taskDate || ''}
            onChange={e => onTaskDateChange(e.target.value || null)}
            disabled={loading}
            aria-label="Дата задачи"
          />
        </div>
      </div>

      <div className="flex-1">
        <label className="flex items-center gap-1.5 text-3xs font-bold text-indigo-400 uppercase tracking-wider mb-1.5 pl-1">
          <FileText className="w-3 h-3" aria-hidden="true" />
          № документа
        </label>
        <input
          type="text"
          className={cn(
            "w-full px-3 py-2.5 sm:py-2 text-sm border border-slate-200 rounded-xl transition-colors",
            "placeholder:text-slate-400",
            "focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
          )}
          value={documentNumber}
          onChange={e => onDocumentNumberChange(e.target.value)}
          placeholder="№ акта, заявки..."
          disabled={loading}
          aria-label="Номер документа"
        />
      </div>
    </div>

    {/* Project */}
    {projectOptions.length > 0 && (
      <div>
        <label className="flex items-center gap-1.5 text-3xs font-bold text-indigo-400 uppercase tracking-wider mb-1.5 pl-1">
          <Folder className="w-3 h-3" aria-hidden="true" />
          Проект
        </label>
        <select
          className={cn(
            "w-full px-3 py-2 text-xs border rounded-xl transition-colors appearance-none bg-white",
            "focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400",
            "disabled:bg-slate-50 disabled:text-slate-500",
            projectId ? "border-emerald-300 text-slate-700" : "border-slate-200 text-slate-500"
          )}
          value={projectId || ''}
          onChange={e => onProjectIdChange(e.target.value || null)}
          disabled={loading || projectsLoading}
          aria-label="Проект"
        >
          <option value="">— не обрано —</option>
          {projectOptions.map(p => (
            <option key={p.project_id} value={p.project_id}>{p.project_name}</option>
          ))}
        </select>
      </div>
    )}

    {/* KB Document */}
    {planDocuments.length > 0 && (
      <div>
        <label className="flex items-center gap-1.5 text-3xs font-bold text-blue-400 uppercase tracking-wider mb-1.5 pl-1">
          <FileText className="w-3 h-3" aria-hidden="true" />
          Документ ІБ
        </label>
        <select
          className={cn(
            "w-full px-3 py-2 text-xs border rounded-xl transition-colors appearance-none bg-white",
            "focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400",
            "disabled:bg-slate-50 disabled:text-slate-500",
            kbDocumentId ? "border-blue-300 text-slate-700" : "border-slate-200 text-slate-500"
          )}
          value={kbDocumentId || ''}
          onChange={e => onKbDocumentIdChange(e.target.value || null)}
          disabled={loading}
          aria-label="Документ ІБ"
        >
          <option value="">— не обрано —</option>
          {planDocuments.map(doc => (
            <option key={doc.id} value={doc.id}>{doc.title || doc.source_filename}</option>
          ))}
        </select>
      </div>
    )}

    {/* File upload */}
    <div>
      <label className="flex items-center gap-1.5 text-3xs font-bold text-indigo-400 uppercase tracking-wider mb-1.5 pl-1">
        <Paperclip className="w-4 h-4" />
        Вложения
      </label>
      <TaskFileUpload
        documentNumber={documentNumber}
        taskId={editingTaskId}
        completedAt={taskDate || undefined}
        onUploadComplete={onAttachmentUrlChange}
        onDocumentNumberExtracted={onDocumentNumberChange}
        currentUrl={attachmentUrl}
        disabled={loading}
      />
    </div>
  </>
);

export default AddTaskFormFields;
