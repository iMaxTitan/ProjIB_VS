'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Check, X, Building2, Calendar, Server, Monitor, Hash, FileText, User, FileSignature, Banknote, CalendarDays } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { useCompanies } from '@/hooks/useCompanies';
import { cn } from '@/lib/utils';
import type { CompanyWithInfrastructure, InfrastructureParams } from '@/types/infrastructure';
import { MONTH_NAMES } from '@/types/infrastructure';

interface InfrastructureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (params: InfrastructureParams) => Promise<boolean>;
  userId: string;
  editData?: CompanyWithInfrastructure | null;
  preselectedCompanyId?: string | null;
}

export default function InfrastructureModal({
  isOpen,
  onClose,
  onSave,
  userId,
  editData,
  preselectedCompanyId
}: InfrastructureModalProps) {
  const { companies, loading: loadingCompanies } = useCompanies();
  const formRef = useRef<HTMLFormElement>(null);

  const [companyId, setCompanyId] = useState<string>('');
  const [periodYear, setPeriodYear] = useState<number>(new Date().getFullYear());
  const [periodMonth, setPeriodMonth] = useState<number>(new Date().getMonth() + 1);
  const [serversCount, setServersCount] = useState<number>(0);
  const [workstationsCount, setWorkstationsCount] = useState<number>(0);
  const [ratePerHour, setRatePerHour] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditMode = !!editData?.infrastructure_id;

  useEffect(() => {
    if (isOpen) {
      if (editData) {
        setCompanyId(editData.company_id);
        setPeriodYear(editData.period_year || new Date().getFullYear());
        setPeriodMonth(editData.period_month || new Date().getMonth() + 1);
        setServersCount(editData.servers_count || 0);
        setWorkstationsCount(editData.workstations_count || 0);
        setRatePerHour(editData.rate_per_hour != null ? String(editData.rate_per_hour) : '');
        setNotes(editData.notes || '');
      } else {
        setCompanyId(preselectedCompanyId || '');
        setPeriodYear(new Date().getFullYear());
        setPeriodMonth(new Date().getMonth() + 1);
        setServersCount(0);
        setWorkstationsCount(0);
        setRatePerHour('');
        setNotes('');
      }
      setError(null);
    }
  }, [isOpen, editData, preselectedCompanyId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!companyId) {
      setError('Выберите предприятие');
      return;
    }

    if (serversCount < 0 || workstationsCount < 0) {
      setError('Количество не может быть отрицательным');
      return;
    }

    setLoading(true);
    setError(null);

    // Реквизиты: при создании — из текущей company, при редактировании — из editData (снапшот)
    const selectedCompany = companies.find(c => c.company_id === companyId);
    const snapshotSource = isEditMode ? editData : selectedCompany;
    const parsedRate = ratePerHour ? parseFloat(ratePerHour) : null;

    const params: InfrastructureParams = {
      action: isEditMode ? 'update' : 'create',
      infrastructureId: editData?.infrastructure_id ?? undefined,
      companyId,
      periodYear,
      periodMonth,
      serversCount,
      workstationsCount,
      notes: notes.trim() || undefined,
      userId,
      companyFullName: snapshotSource?.company_full_name || null,
      director: snapshotSource?.director || null,
      contractNumber: snapshotSource?.contract_number || null,
      contractDate: snapshotSource?.contract_date || null,
      ratePerHour: parsedRate ?? snapshotSource?.rate_per_hour ?? null
    };

    const success = await onSave(params);
    setLoading(false);

    if (success) {
      onClose();
    } else {
      setError('Ошибка сохранения данных');
    }
  };

  const handleClose = () => {
    if (!loading) onClose();
  };

  const currentYear = new Date().getFullYear();
  const years = [currentYear, currentYear - 1, currentYear - 2];

  const total = serversCount + workstationsCount;

  const inputCn = cn(
    'w-full px-3 py-2.5 sm:py-2 text-sm border border-gray-200 rounded-xl transition-colors bg-white',
    'focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400',
    'disabled:bg-gray-50 disabled:text-gray-500'
  );

  const labelCn = 'flex items-center gap-1.5 text-3xs font-bold text-blue-400 uppercase tracking-wider mb-1.5 pl-1';

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={isEditMode ? 'Редактирование инфраструктуры' : 'Добавление инфраструктуры'}
      headerVariant="gradient-indigo"
      showCloseButton={false}
      maxWidth="max-w-lg"
      headerActions={
        <>
          <button
            type="button"
            onClick={handleClose}
            className="p-2 rounded-xl bg-white/20 hover:bg-white/30 text-white transition-colors backdrop-blur-sm disabled:opacity-50"
            aria-label="Отменить"
            disabled={loading}
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => formRef.current?.requestSubmit()}
            className="p-2 rounded-xl bg-white/20 hover:bg-white/30 text-white transition-colors backdrop-blur-sm disabled:opacity-50"
            aria-label="Сохранить"
            disabled={loading}
          >
            <Check className="w-5 h-5" aria-hidden="true" />
          </button>
        </>
      }
    >
      <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
        {/* Предприятие */}
        <div>
          <label className={labelCn}>
            <Building2 className="w-3 h-3" aria-hidden="true" />
            Предприятие <span className="text-red-500">*</span>
          </label>
          <select
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
            className={cn(inputCn, !companyId && 'text-gray-400')}
            disabled={loading || loadingCompanies || isEditMode}
            required
          >
            <option value="">Выберите предприятие</option>
            {companies.map((company) => (
              <option key={company.company_id} value={company.company_id}>
                {company.company_name}
              </option>
            ))}
          </select>
        </div>

        {/* Реквізити предприятия (read-only) */}
        {companyId && (() => {
          const company = isEditMode ? editData : companies.find(c => c.company_id === companyId);
          const hasDetails = company?.director || company?.contract_number || company?.contract_date || company?.rate_per_hour || company?.company_full_name;
          if (!hasDetails) return null;
          return (
            <div className="px-3 py-2.5 bg-slate-50/80 rounded-xl border border-slate-100/80 space-y-1.5">
              {company?.company_full_name && (
                <div className="flex items-center gap-1.5">
                  <Building2 className="w-3 h-3 text-slate-400 flex-shrink-0" aria-hidden="true" />
                  <span className="text-xs text-slate-500 truncate">{company.company_full_name}</span>
                </div>
              )}
              {company?.director && (
                <div className="flex items-center gap-1.5">
                  <User className="w-3 h-3 text-slate-400 flex-shrink-0" aria-hidden="true" />
                  <span className="text-xs text-slate-500 truncate">{company.director}</span>
                </div>
              )}
              {company?.contract_number && (
                <div className="flex items-center gap-1.5">
                  <FileSignature className="w-3 h-3 text-slate-400 flex-shrink-0" aria-hidden="true" />
                  <span className="text-xs text-slate-500 truncate">
                    Договір {company.contract_number}
                    {company.contract_date && ` від ${new Date(company.contract_date).toLocaleDateString('uk-UA')}`}
                  </span>
                </div>
              )}
              {company?.rate_per_hour != null && (
                <div className="flex items-center gap-1.5">
                  <Banknote className="w-3 h-3 text-slate-400 flex-shrink-0" aria-hidden="true" />
                  <span className="text-xs text-slate-500">{Number(company.rate_per_hour).toFixed(2)} ₴/год</span>
                </div>
              )}
            </div>
          );
        })()}

        {/* Период: Год и Месяц */}
        <div className="flex gap-2">
          <div className="flex-1">
            <label className={labelCn}>
              <Calendar className="w-3 h-3" aria-hidden="true" />
              Год <span className="text-red-500">*</span>
            </label>
            <select
              value={periodYear}
              onChange={(e) => setPeriodYear(Number(e.target.value))}
              className={inputCn}
              disabled={loading || isEditMode}
            >
              {years.map((year) => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <label className={labelCn}>
              <Calendar className="w-3 h-3" aria-hidden="true" />
              Месяц <span className="text-red-500">*</span>
            </label>
            <select
              value={periodMonth}
              onChange={(e) => setPeriodMonth(Number(e.target.value))}
              className={inputCn}
              disabled={loading || isEditMode}
            >
              {MONTH_NAMES.map((name, index) => (
                <option key={index + 1} value={index + 1}>{name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Серверы и Рабочие станции */}
        <div className="flex gap-2">
          <div className="flex-1">
            <label className={labelCn}>
              <Server className="w-3 h-3" aria-hidden="true" />
              Серверы <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              min="0"
              value={serversCount}
              onChange={(e) => setServersCount(Number(e.target.value) || 0)}
              onFocus={(e) => e.target.select()}
              className={inputCn}
              disabled={loading}
              required
            />
          </div>
          <div className="flex-1">
            <label className={labelCn}>
              <Monitor className="w-3 h-3" aria-hidden="true" />
              Рабочие станции <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              min="0"
              value={workstationsCount}
              onChange={(e) => setWorkstationsCount(Number(e.target.value) || 0)}
              onFocus={(e) => e.target.select()}
              className={inputCn}
              disabled={loading}
              required
            />
          </div>
        </div>

        {/* Итого */}
        <div className="flex items-center gap-3 px-3 py-2.5 bg-blue-50/50 rounded-xl border border-blue-100/50">
          <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-white flex items-center justify-center shadow-sm border border-blue-100">
            <Hash className="w-4 h-4 text-blue-500" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-3xs font-bold text-blue-400 uppercase tracking-wider">Всего</p>
            <p className="text-sm font-bold text-slate-800">{total.toLocaleString()} од.</p>
          </div>
        </div>

        {/* Нормогодина */}
        <div>
          <label className={labelCn}>
            <Banknote className="w-3 h-3" aria-hidden="true" />
            Нормогодина, ₴
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={ratePerHour}
            onChange={(e) => setRatePerHour(e.target.value)}
            onFocus={(e) => e.target.select()}
            placeholder={(() => {
              const src = isEditMode ? editData : companies.find(c => c.company_id === companyId);
              return src?.rate_per_hour != null ? `${Number(src.rate_per_hour).toFixed(2)} (з реквізитів)` : '0.00';
            })()}
            className={inputCn}
            disabled={loading}
          />
        </div>

        {/* Примечания */}
        <div>
          <label className={labelCn}>
            <FileText className="w-3 h-3" aria-hidden="true" />
            Примечания
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className={cn(inputCn, 'resize-none')}
            rows={2}
            placeholder="Дополнительная информация..."
            disabled={loading}
          />
        </div>

        {/* Error */}
        {error && (
          <div className="p-3 bg-red-50 border border-red-100 rounded-xl">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}
      </form>
    </Modal>
  );
}
