'use client';

import React, { useMemo } from 'react';
import { FolderOpen, FileText } from 'lucide-react';
import { cn } from '@/lib/shared/utils';
import { DetailSection } from '@/components/dashboard/shared';
import { HOUR_DISTRIBUTION_TYPES, type HourDistributionType } from '@/types/infrastructure';
import type { ProjectWithDepartments } from '@/types/projects';

interface PlanCompany {
  company_id: string;
  company_name: string;
}

interface KBDocItem {
  id: string;
  title: string;
  source_filename: string;
  status: string;
}

interface PlanCompanySectionProps {
  isEditing: boolean;
  allCompanies: PlanCompany[];
  editCompanyIds: string[];
  distributionType: HourDistributionType;
  companyShares: Map<string, number>;
  getInfraCount: (companyId: string) => number;
  activeProjects: ProjectWithDepartments[];
  editProjectIds: string[];
  onToggleCompany: (id: string) => void;
  onDistributionTypeChange: (type: HourDistributionType) => void;
  onToggleProject: (id: string) => void;
  kbDocuments?: KBDocItem[];
  editDocIds?: string[];
  onToggleDoc?: (id: string) => void;
}

export default function PlanCompanySection({
  isEditing,
  allCompanies,
  editCompanyIds,
  distributionType,
  companyShares,
  getInfraCount,
  activeProjects,
  editProjectIds,
  onToggleCompany,
  onDistributionTypeChange,
  onToggleProject,
  kbDocuments,
  editDocIds = [],
  onToggleDoc,
}: PlanCompanySectionProps) {
  const readyDocs = useMemo(() => (kbDocuments ?? []).filter(d => d.status === 'ready'), [kbDocuments]);

  const sortedDocs = useMemo(() => {
    return [...readyDocs].sort((a, b) => {
      const aSelected = editDocIds.includes(a.id) ? 0 : 1;
      const bSelected = editDocIds.includes(b.id) ? 0 : 1;
      if (aSelected !== bSelected) return aSelected - bSelected;
      return (a.title || a.source_filename).localeCompare(b.title || b.source_filename, 'uk');
    });
  }, [readyDocs, editDocIds]);
  if (isEditing) {
    return (
      <DetailSection title="Предприятия" colorScheme="indigo">
        <div className="mb-3">
          <label className="text-3xs font-bold text-indigo-400 uppercase tracking-wider mb-1.5 pl-1 block">
            Тип распределения
          </label>
          <div className="flex flex-wrap gap-1.5">
            {HOUR_DISTRIBUTION_TYPES.map(dt => (
              <button
                key={dt.type}
                type="button"
                onClick={() => onDistributionTypeChange(dt.type)}
                aria-label={dt.description}
                title={dt.description}
                className={cn(
                  'px-2.5 sm:px-3 py-1.5 rounded-lg text-xs border transition-colors',
                  distributionType === dt.type
                    ? 'bg-indigo-500 border-indigo-600 text-white shadow-sm'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-indigo-50 hover:border-indigo-300',
                )}
              >
                {dt.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-400 mt-1">
            {HOUR_DISTRIBUTION_TYPES.find(dt => dt.type === distributionType)?.description}
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
          {allCompanies.map(c => {
            const selected = editCompanyIds.includes(c.company_id);
            const share = companyShares.get(c.company_id);
            const count = distributionType !== 'even' ? getInfraCount(c.company_id) : 0;
            return (
              <button
                key={c.company_id}
                type="button"
                onClick={() => onToggleCompany(c.company_id)}
                aria-label={`Выбрать ${c.company_name}`}
                className={cn(
                  'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-colors',
                  selected
                    ? 'bg-indigo-100 border-indigo-300 text-indigo-800'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100',
                )}
              >
                {c.company_name}
                {count > 0 && <span className="text-indigo-500 font-medium">{count}</span>}
                {selected && share !== undefined && <span className="text-indigo-400">({share}%)</span>}
              </button>
            );
          })}
        </div>

        <div className="mt-3 pt-3 border-t border-indigo-100">
          <label className="text-3xs font-bold text-indigo-400 uppercase tracking-wider mb-1.5 pl-1 flex items-center gap-1">
            <FolderOpen className="w-3 h-3" aria-hidden="true" />
            Дозволені проекти
          </label>
          <p className="text-xs text-slate-400 mb-1.5">Порожньо = всі проекти дозволені</p>
          <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
            {activeProjects.map((p: ProjectWithDepartments) => (
              <button
                key={p.project_id}
                type="button"
                onClick={() => onToggleProject(p.project_id)}
                aria-label={`Проект ${p.project_name}`}
                className={cn(
                  'px-2 py-0.5 rounded-full text-xs border transition-colors',
                  editProjectIds.includes(p.project_id)
                    ? 'bg-emerald-100 border-emerald-300 text-emerald-800'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100',
                )}
              >
                {p.project_name}
              </button>
            ))}
          </div>
        </div>

        {sortedDocs.length > 0 && onToggleDoc && (
          <div className="mt-3 pt-3 border-t border-indigo-100">
            <label className="text-3xs font-bold text-blue-400 uppercase tracking-wider mb-1.5 pl-1 flex items-center gap-1">
              <FileText className="w-3 h-3" aria-hidden="true" />
              Документи ІБ
            </label>
            <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
              {sortedDocs.map(doc => (
                <button
                  key={doc.id}
                  type="button"
                  onClick={() => onToggleDoc(doc.id)}
                  aria-label={doc.title || doc.source_filename}
                  title={doc.title || doc.source_filename}
                  className={cn(
                    'px-2 py-0.5 rounded-full text-xs border transition-colors truncate max-w-[260px]',
                    editDocIds.includes(doc.id)
                      ? 'bg-blue-100 border-blue-300 text-blue-800'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100',
                  )}
                >
                  {doc.title || doc.source_filename}
                </button>
              ))}
            </div>
          </div>
        )}
      </DetailSection>
    );
  }

  return (
    <DetailSection title="Предприятия" colorScheme="indigo">
      <div className="glass-card p-3 rounded-2xl bg-white/30">
        {editCompanyIds.length > 0 ? (
          <>
            <div className="mb-2">
              <span className="text-2xs font-medium text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded-full">
                {HOUR_DISTRIBUTION_TYPES.find(d => d.type === distributionType)?.label || 'Поровну'}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {allCompanies
                .filter(c => editCompanyIds.includes(c.company_id))
                .map(c => {
                  const share = companyShares.get(c.company_id);
                  return (
                    <span
                      key={c.company_id}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs bg-white/50 border border-indigo-100 text-indigo-700 font-medium shadow-sm"
                    >
                      {c.company_name}
                      {share !== undefined && <span className="text-indigo-400 font-normal">({share}%)</span>}
                    </span>
                  );
                })}
            </div>
          </>
        ) : (
          <span className="text-xs text-slate-500 italic px-1">Не выбрано</span>
        )}
      </div>

      {sortedDocs.length > 0 && editDocIds.length > 0 && (
        <div className="mt-3">
          <label className="text-3xs font-bold text-blue-400 uppercase tracking-wider mb-1.5 pl-1 flex items-center gap-1">
            <FileText className="w-3 h-3" aria-hidden="true" />
            Документи ІБ
          </label>
          <div className="flex flex-wrap gap-1.5">
            {sortedDocs.filter(d => editDocIds.includes(d.id)).map(doc => (
              <span
                key={doc.id}
                title={doc.title || doc.source_filename}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs bg-white/50 border border-blue-100 text-blue-700 font-medium shadow-sm truncate max-w-[260px]"
              >
                {doc.title || doc.source_filename}
              </span>
            ))}
          </div>
        </div>
      )}
    </DetailSection>
  );
}
