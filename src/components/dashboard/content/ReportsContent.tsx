import React, { useState, useEffect } from 'react';
import { UserInfo } from '@/types/azure';
import { QuarterlyReportCard } from '@/components/dashboard/reports/QuarterlyReportCard';
import { getQuarterlyReports } from '@/lib/services/report-service';

interface ReportsContentProps {
  user: UserInfo;
}

export default function ReportsContent({ user }: ReportsContentProps) {
  const [activeTab, setActiveTab] = useState('my');
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    getQuarterlyReports()
      .then((data) => {
        setReports(data || []);
        setLoading(false);
      })
      .catch((err) => {
        setError('Ошибка загрузки отчётов');
        setLoading(false);
      });
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">Отчеты</h1>
      
      {/* Сводка по отчетам */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl shadow-lg p-6">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold text-gray-800">Мои отчеты</h2>
            <span className="text-2xl">📊</span>
          </div>
          <div className="mt-2 text-3xl font-bold text-indigo-600">{reports.length}</div>
          <div className="mt-1 text-sm text-gray-500">За последний квартал</div>
        </div>
        
        <div className="bg-white rounded-xl shadow-lg p-6">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold text-gray-800">Ожидают проверки</h2>
            <span className="text-2xl">⏳</span>
          </div>
          <div className="mt-2 text-3xl font-bold text-amber-600">{reports.filter(r => r.status === 'pending' || r.status === 'draft').length}</div>
          <div className="mt-1 text-sm text-gray-500">Требуют внимания</div>
        </div>
        
        <div className="bg-white rounded-xl shadow-lg p-6">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold text-gray-800">Утверждено</h2>
            <span className="text-2xl">✅</span>
          </div>
          <div className="mt-2 text-3xl font-bold text-green-600">{reports.filter(r => r.status === 'approved').length}</div>
          <div className="mt-1 text-sm text-gray-500">В текущем периоде</div>
        </div>
      </div>
      
      {/* Список отчетов с табами */}
      <div className="bg-white rounded-xl shadow-lg overflow-hidden">
        <div className="flex border-b border-gray-200">
          <button 
            className={`flex-1 py-4 px-6 text-center font-medium ${activeTab === 'my' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
            onClick={() => setActiveTab('my')}
          >
            Мои отчеты
          </button>
          <button 
            className={`flex-1 py-4 px-6 text-center font-medium ${activeTab === 'department' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
            onClick={() => setActiveTab('department')}
          >
            Отчеты отдела
          </button>
          <button 
            className={`flex-1 py-4 px-6 text-center font-medium ${activeTab === 'templates' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
            onClick={() => setActiveTab('templates')}
          >
            Шаблоны
          </button>
        </div>
        
        <div className="p-6">
          {activeTab === 'my' && (
            <div>
              {loading && <div>Загрузка...</div>}
              {error && <div className="text-red-500">{error}</div>}
              {!loading && !error && (
  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
    {reports.length === 0 && (
      <div className="col-span-full text-center text-gray-500 py-10 bg-gray-50 rounded-lg">
        Нет отчетов за выбранный период
      </div>
    )}
    {reports.map((report) => (
      <QuarterlyReportCard key={report.quarterly_id} report={report} />
    ))}
  </div>
)}
            </div>
          )}
          
          {activeTab === 'department' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium text-gray-800">Отчеты отдела</h3>
                <select className="border border-gray-300 rounded-md text-sm p-2">
                  <option>Все отделы</option>
                  <option>Отдел разработки</option>
                  <option>Отдел маркетинга</option>
                  <option>Финансовый отдел</option>
                </select>
              </div>
              
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 text-center">
                <p className="text-gray-500">Выберите отдел для просмотра отчетов</p>
              </div>
            </div>
          )}
          
          {activeTab === 'templates' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[
                { title: 'Ежемесячный отчет', description: 'Стандартный шаблон для ежемесячной отчетности', icon: '📊' },
                { title: 'Квартальный отчет', description: 'Расширенный шаблон для квартальной отчетности', icon: '📈' },
                { title: 'Проектный отчет', description: 'Шаблон для отчетов по проектам', icon: '📋' },
                { title: 'Финансовый отчет', description: 'Шаблон для финансовой отчетности', icon: '💰' },
                { title: 'Аналитический отчет', description: 'Шаблон для аналитических отчетов', icon: '📉' },
                { title: 'Отчет по персоналу', description: 'Шаблон для HR-отчетов', icon: '👥' }
              ].map((template, index) => (
                <div key={index} className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-center mb-3">
                    <span className="text-2xl mr-3">{template.icon}</span>
                    <h3 className="text-lg font-medium text-gray-800">{template.title}</h3>
                  </div>
                  <p className="text-sm text-gray-600 mb-4">{template.description}</p>
                  <div className="flex justify-end">
                    <button className="px-3 py-1 bg-blue-500 text-white text-sm rounded hover:bg-blue-600 transition-colors">
                      Использовать
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
