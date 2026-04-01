import React from 'react';
import { Building2 } from 'lucide-react';
import { cn } from '@/lib/shared/utils';

interface Company {
  company_id: string;
  company_name: string;
}

interface Props {
  companies: Company[];
  selectedIds: string[];
  onToggle: (companyId: string) => void;
  distributionLabel: string;
  companyShares: Map<string, number>;
  disabled?: boolean;
}

export default function CompanyDistributionSelector({
  companies,
  selectedIds,
  onToggle,
  distributionLabel,
  companyShares,
  disabled,
}: Props) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-3xs font-bold text-indigo-400 uppercase tracking-wider mb-1.5 pl-1">
        <Building2 className="w-3 h-3" aria-hidden="true" />
        Підприємства ({selectedIds.length}/{companies.length})
        <span className="ml-1 text-2xs font-medium text-slate-400 normal-case">
          {distributionLabel}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {companies.map(company => {
          const isSelected = selectedIds.includes(company.company_id);
          return (
            <button
              key={company.company_id}
              type="button"
              onClick={() => onToggle(company.company_id)}
              disabled={disabled}
              aria-label={`${isSelected ? 'Вимкнути' : 'Увімкнути'} ${company.company_name}`}
              className={cn(
                'px-2.5 py-1 text-xs rounded-lg border transition-colors',
                'focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1',
                isSelected
                  ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                  : 'bg-slate-50 border-slate-200 text-slate-400 line-through'
              )}
            >
              {company.company_name}
              {isSelected && companyShares.has(company.company_id) && (
                <span className="ml-1 text-indigo-400 font-normal">
                  {companyShares.get(company.company_id)}%
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
