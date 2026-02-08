import React, { useState, useEffect, useCallback } from 'react';
import { UserInfo } from '@/types/azure';
import { QuarterlyReportCard } from '@/components/dashboard/reports/QuarterlyReportCard';
import { getQuarterlyReports } from '@/lib/services/report-service';
import {
  getAvailableCompanyReports,
  getAvailableEmployeeReports,
  getAvailablePeriods,
  formatPeriod,
  formatHours,
  MonthlyReportListItem,
} from '@/lib/services/monthly-report.service';
import { Building2, Users, CalendarDays, FileText, Download, Clock, CheckCircle } from 'lucide-react';
import logger from '@/lib/logger';

interface ReportsContentProps {
  user: UserInfo;
}

type TabType = 'companies' | 'employees' | 'quarterly';
type QuarterlyReportItem = {
  quarterly_id: string;
  quarter: number;
  department_name: string;
  goal: string;
  expected_result: string;
  status: string;
  process_name: string;
  completion_percentage: number;
};

export default function ReportsContent({ user }: ReportsContentProps) {
  const [activeTab, setActiveTab] = useState<TabType>('companies');

  // Quarterly reports state
  const [quarterlyReports, setQuarterlyReports] = useState<QuarterlyReportItem[]>([]);
  const [quarterlyLoading, setQuarterlyLoading] = useState(false);

  // Monthly reports state
  const [companyReports, setCompanyReports] = useState<MonthlyReportListItem[]>([]);
  const [employeeReports, setEmployeeReports] = useState<MonthlyReportListItem[]>([]);
  const [periods, setPeriods] = useState<{ year: number; month: number }[]>([]);
  const [monthlyLoading, setMonthlyLoading] = useState(false);

  // Filters
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1);

  const [error, setError] = useState<string | null>(null);
  const monthNamesRu = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

  // Load available periods on mount
  useEffect(() => {
    getAvailablePeriods()
      .then(setPeriods)
      .catch((error) => logger.error(error));
  }, []);

  // Load company reports
  const loadCompanyReports = useCallback(async () => {
    setMonthlyLoading(true);
    setError(null);
    try {
      const data = await getAvailableCompanyReports(selectedYear, selectedMonth);
      setCompanyReports(data);
    } catch (err: unknown) {
      setError('Ошибка загрузки отчетов по предприятиям');
      logger.error(err);
    } finally {
      setMonthlyLoading(false);
    }
  }, [selectedYear, selectedMonth]);

  // Load employee reports
  const loadEmployeeReports = useCallback(async () => {
    setMonthlyLoading(true);
    setError(null);
    try {
      const data = await getAvailableEmployeeReports(selectedYear, selectedMonth);
      setEmployeeReports(data);
    } catch (err: unknown) {
      setError('Ошибка загрузки отчетов по сотрудникам');
      logger.error(err);
    } finally {
      setMonthlyLoading(false);
    }
  }, [selectedYear, selectedMonth]);

  // Load quarterly reports
  const loadQuarterlyReports = useCallback(async () => {
    setQuarterlyLoading(true);
    setError(null);
    try {
      const data = await getQuarterlyReports();
      setQuarterlyReports(data || []);
    } catch (err: unknown) {
      setError('Ошибка загрузки квартальных отчетов');
      logger.error(err);
    } finally {
      setQuarterlyLoading(false);
    }
  }, []);

  // Load data based on active tab
  useEffect(() => {
    if (activeTab === 'companies') {
      loadCompanyReports();
    } else if (activeTab === 'employees') {
      loadEmployeeReports();
    } else if (activeTab === 'quarterly') {
      loadQuarterlyReports();
    }
  }, [activeTab, loadCompanyReports, loadEmployeeReports, loadQuarterlyReports]);

  // Generate years array for filter (last 3 years)
  const years = Array.from({ length: 3 }, (_, i) => new Date().getFullYear() - i);
  const months = monthNamesRu.map((name, i) => ({ value: i + 1, label: name }));

  const [generating, setGenerating] = useState<string | null>(null);

  const handleGenerateReport = async (type: 'company' | 'employee', id: string, name: string, format: 'pdf' | 'docx' = 'pdf') => {
    setGenerating(`${type}-${id}`);
    try {
      const response = await fetch('/api/reports/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type,
          id,
          year: selectedYear,
          month: selectedMonth,
          format,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        const errorMsg = errorData.details
          ? `${errorData.error}: ${errorData.details}`
          : errorData.error || 'Ошибка генерации отчета';
        throw new Error(errorMsg);
      }

      // Получаем PDF как blob
      const blob = await response.blob();

      // Создаем ссылку для скачивания
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;

      // Получаем имя файла из заголовка Content-Disposition
      const contentDisposition = response.headers.get('Content-Disposition');
      let fileName = `report_${name}_${selectedMonth}_${selectedYear}.pdf`;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?([^"]+)"?/);
        if (match) {
          fileName = decodeURIComponent(match[1]);
        }
      }

      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

    } catch (err: unknown) {
      logger.error('Ошибка генерации отчета:', err);
      alert(err instanceof Error ? err.message : 'Ошибка генерации отчета');
    } finally {
      setGenerating(null);
    }
  };

  const renderFilters = () => (
    <div className="flex items-center gap-4 mb-6">
      <div className="flex items-center gap-2">
        <label className="text-sm text-gray-600">Год:</label>
        <select
          value={selectedYear}
          onChange={(e) => setSelectedYear(Number(e.target.value))}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
          {years.map((year) => (
            <option key={year} value={year}>{year}</option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-2">
        <label className="text-sm text-gray-600">Месяц:</label>
        <select
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(Number(e.target.value))}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
          {months.map((month) => (
            <option key={month.value} value={month.value}>{month.label}</option>
          ))}
        </select>
      </div>
    </div>
  );

  const renderCompanyReports = () => (
    <div>
      {renderFilters()}

      {monthlyLoading ? (
        <div className="text-center py-10 text-gray-500">Загрузка...</div>
      ) : companyReports.length === 0 ? (
        <div className="text-center py-10 bg-gray-50 rounded-lg">
          <Building2 className="w-12 h-12 mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500">Нет данных для отчетов за {formatPeriod(selectedYear, selectedMonth)}</p>
          <p className="text-sm text-gray-400 mt-1">Попробуйте выбрать другой период</p>
        </div>
      ) : (
        <div className="space-y-3">
          {companyReports.map((report) => (
            <div
              key={`${report.company_id}-${report.period_year}-${report.period_month}`}
              className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                    <Building2 className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-800">{report.company_name}</h3>
                    <div className="flex items-center gap-4 text-sm text-gray-500 mt-1">
                      <span className="flex items-center gap-1">
                        <FileText className="w-4 h-4" />
                        {report.tasks_count} задач
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        {formatHours(report.total_hours)}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleGenerateReport('company', report.company_id!, report.company_name!, 'pdf')}
                    disabled={generating === `company-${report.company_id}`}
                    className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-wait transition-colors flex items-center gap-2"
                  >
                    {generating === `company-${report.company_id}` ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Генерация...
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4" />
                        PDF
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderEmployeeReports = () => (
    <div>
      {renderFilters()}

      {monthlyLoading ? (
        <div className="text-center py-10 text-gray-500">Загрузка...</div>
      ) : employeeReports.length === 0 ? (
        <div className="text-center py-10 bg-gray-50 rounded-lg">
          <Users className="w-12 h-12 mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500">Нет данных для отчетов за {formatPeriod(selectedYear, selectedMonth)}</p>
          <p className="text-sm text-gray-400 mt-1">Попробуйте выбрать другой период</p>
        </div>
      ) : (
        <div className="space-y-3">
          {employeeReports.map((report) => (
            <div
              key={`${report.user_id}-${report.period_year}-${report.period_month}`}
              className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                    <Users className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-800">{report.full_name}</h3>
                    <div className="flex items-center gap-4 text-sm text-gray-500 mt-1">
                      {report.department_name && (
                        <span>{report.department_name}</span>
                      )}
                      <span className="flex items-center gap-1">
                        <FileText className="w-4 h-4" />
                        {report.tasks_count} задач
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        {formatHours(report.total_hours)}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleGenerateReport('employee', report.user_id!, report.full_name!, 'pdf')}
                    disabled={generating === `employee-${report.user_id}`}
                    className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:bg-green-400 disabled:cursor-wait transition-colors flex items-center gap-2"
                  >
                    {generating === `employee-${report.user_id}` ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Генерация...
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4" />
                        PDF
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderQuarterlyReports = () => (
    <div>
      {quarterlyLoading ? (
        <div className="text-center py-10 text-gray-500">Загрузка...</div>
      ) : quarterlyReports.length === 0 ? (
        <div className="text-center py-10 bg-gray-50 rounded-lg">
          <CalendarDays className="w-12 h-12 mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500">Нет квартальных отчетов</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {quarterlyReports.map((report) => (
            <QuarterlyReportCard key={report.quarterly_id} report={report} />
          ))}
        </div>
      )}
    </div>
  );

  // Summary stats
  const summaryStats = {
    companies: companyReports.length,
    employees: employeeReports.length,
    totalHours: [...companyReports, ...employeeReports].reduce((sum, r) => sum + (r.total_hours || 0), 0),
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">Отчеты</h1>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl shadow-lg p-6">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold text-gray-800">По предприятиям</h2>
            <Building2 className="w-8 h-8 text-blue-500" />
          </div>
          <div className="mt-2 text-3xl font-bold text-blue-600">{summaryStats.companies}</div>
          <div className="mt-1 text-sm text-gray-500">Доступно за {formatPeriod(selectedYear, selectedMonth)}</div>
        </div>

        <div className="bg-white rounded-xl shadow-lg p-6">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold text-gray-800">По сотрудникам</h2>
            <Users className="w-8 h-8 text-green-500" />
          </div>
          <div className="mt-2 text-3xl font-bold text-green-600">{summaryStats.employees}</div>
          <div className="mt-1 text-sm text-gray-500">Доступно за {formatPeriod(selectedYear, selectedMonth)}</div>
        </div>

        <div className="bg-white rounded-xl shadow-lg p-6">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold text-gray-800">Квартальные</h2>
            <CalendarDays className="w-8 h-8 text-purple-500" />
          </div>
          <div className="mt-2 text-3xl font-bold text-purple-600">{quarterlyReports.length}</div>
          <div className="mt-1 text-sm text-gray-500">Общее количество</div>
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          {error}
        </div>
      )}

      {/* Tabs and content */}
      <div className="bg-white rounded-xl shadow-lg overflow-hidden">
        <div className="flex border-b border-gray-200">
          <button
            className={`flex-1 py-4 px-6 text-center font-medium flex items-center justify-center gap-2 ${
              activeTab === 'companies'
                ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
            onClick={() => setActiveTab('companies')}
          >
            <Building2 className="w-5 h-5" />
            По предприятиям
          </button>
          <button
            className={`flex-1 py-4 px-6 text-center font-medium flex items-center justify-center gap-2 ${
              activeTab === 'employees'
                ? 'text-green-600 border-b-2 border-green-600 bg-green-50'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
            onClick={() => setActiveTab('employees')}
          >
            <Users className="w-5 h-5" />
            По сотрудникам
          </button>
          <button
            className={`flex-1 py-4 px-6 text-center font-medium flex items-center justify-center gap-2 ${
              activeTab === 'quarterly'
                ? 'text-purple-600 border-b-2 border-purple-600 bg-purple-50'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
            onClick={() => setActiveTab('quarterly')}
          >
            <CalendarDays className="w-5 h-5" />
            Квартальные
          </button>
        </div>

        <div className="p-6">
          {activeTab === 'companies' && renderCompanyReports()}
          {activeTab === 'employees' && renderEmployeeReports()}
          {activeTab === 'quarterly' && renderQuarterlyReports()}
        </div>
      </div>
    </div>
  );
}



