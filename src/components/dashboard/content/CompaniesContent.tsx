import React, { useState } from 'react';
import { UserInfo } from '@/types/azure';

interface CompaniesContentProps {
  user: UserInfo;
}

export default function CompaniesContent({ user }: CompaniesContentProps) {
  const [activeTab, setActiveTab] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">Предприятия</h1>
      
      {/* Статистика по предприятиям */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-xl shadow-lg p-6">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold text-gray-800">Всего</h2>
            <span className="text-2xl">🏭</span>
          </div>
          <div className="mt-2 text-3xl font-bold text-indigo-600">12</div>
          <div className="mt-1 text-sm text-gray-500">в 5 регионах</div>
        </div>
        
        <div className="bg-white rounded-xl shadow-lg p-6">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold text-gray-800">Активные</h2>
            <span className="text-2xl">🟢</span>
          </div>
          <div className="mt-2 text-3xl font-bold text-green-600">10</div>
          <div className="mt-1 text-sm text-gray-500">83.3% от общего числа</div>
        </div>
        
        <div className="bg-white rounded-xl shadow-lg p-6">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold text-gray-800">Сотрудников</h2>
            <span className="text-2xl">👥</span>
          </div>
          <div className="mt-2 text-3xl font-bold text-blue-600">1,248</div>
          <div className="mt-1 text-sm text-gray-500">+56 за последний месяц</div>
        </div>
        
        <div className="bg-white rounded-xl shadow-lg p-6">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold text-gray-800">Эффективность</h2>
            <span className="text-2xl">📈</span>
          </div>
          <div className="mt-2 text-3xl font-bold text-purple-600">87%</div>
          <div className="mt-1 text-sm text-gray-500">+3% к прошлому месяцу</div>
        </div>
      </div>
      
      {/* Список предприятий с табами и поиском */}
      <div className="bg-white rounded-xl shadow-lg overflow-hidden">
        <div className="flex border-b border-gray-200">
          <button 
            className={`flex-1 py-4 px-6 text-center font-medium ${activeTab === 'all' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
            onClick={() => setActiveTab('all')}
          >
            Все предприятия
          </button>
          <button 
            className={`flex-1 py-4 px-6 text-center font-medium ${activeTab === 'regions' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
            onClick={() => setActiveTab('regions')}
          >
            По регионам
          </button>
          <button 
            className={`flex-1 py-4 px-6 text-center font-medium ${activeTab === 'performance' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
            onClick={() => setActiveTab('performance')}
          >
            Эффективность
          </button>
        </div>
        
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <div className="relative flex-1 max-w-md">
              <input 
                type="text" 
                placeholder="Поиск предприятия..." 
                className="w-full border border-gray-300 rounded-md pl-10 pr-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <div className="absolute left-3 top-2.5 text-gray-400">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>
            
            <div className="flex space-x-2">
              <select className="border border-gray-300 rounded-md text-sm p-2">
                <option>Все регионы</option>
                <option>Москва</option>
                <option>Санкт-Петербург</option>
                <option>Новосибирск</option>
                <option>Екатеринбург</option>
                <option>Казань</option>
              </select>
              
              <button className="px-3 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors flex items-center">
                <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                Добавить
              </button>
            </div>
          </div>
          
          {activeTab === 'all' && (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Название
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Регион
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Руководитель
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Статус
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Сотрудники
                    </th>
                    <th scope="col" className="relative px-6 py-3">
                      <span className="sr-only">Действия</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {[
                    { name: 'ООО "Технопром"', region: 'Москва', director: 'Иванов А.С.', status: 'Активное', employees: 245 },
                    { name: 'АО "Северная верфь"', region: 'Санкт-Петербург', director: 'Петров И.В.', status: 'Активное', employees: 187 },
                    { name: 'ООО "Сибирские технологии"', region: 'Новосибирск', director: 'Сидоров Д.А.', status: 'Активное', employees: 156 },
                    { name: 'ЗАО "Уральский завод"', region: 'Екатеринбург', director: 'Козлов С.П.', status: 'Активное', employees: 203 },
                    { name: 'ООО "Волга-Пром"', region: 'Казань', director: 'Морозова Е.В.', status: 'Активное', employees: 134 },
                    { name: 'АО "Южный порт"', region: 'Ростов-на-Дону', director: 'Соколов А.И.', status: 'Активное', employees: 98 },
                    { name: 'ООО "Дальневосточная компания"', region: 'Владивосток', director: 'Кузнецов В.М.', status: 'Активное', employees: 76 },
                    { name: 'ЗАО "Старый завод"', region: 'Москва', director: 'Новиков П.Р.', status: 'Неактивное', employees: 0 },
                    { name: 'ООО "Техносервис"', region: 'Санкт-Петербург', director: 'Васильев К.Д.', status: 'Активное', employees: 112 },
                    { name: 'АО "Инновационные решения"', region: 'Москва', director: 'Федорова А.В.', status: 'Активное', employees: 87 },
                    { name: 'ООО "Промтехнологии"', region: 'Екатеринбург', director: 'Андреев С.С.', status: 'Неактивное', employees: 0 },
                    { name: 'ЗАО "Энергопром"', region: 'Казань', director: 'Григорьев Д.И.', status: 'Активное', employees: 92 }
                  ]
                    .filter(company => 
                      searchTerm === '' || 
                      company.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                      company.region.toLowerCase().includes(searchTerm.toLowerCase()) ||
                      company.director.toLowerCase().includes(searchTerm.toLowerCase())
                    )
                    .map((company, index) => (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{company.name}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{company.region}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{company.director}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          company.status === 'Активное' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {company.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {company.employees}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button className="text-indigo-600 hover:text-indigo-900 mr-3">Подробнее</button>
                        <button className="text-gray-600 hover:text-gray-900">Редактировать</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          
          {activeTab === 'regions' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {[
                { name: 'Москва', count: 3, active: 2, employees: 332 },
                { name: 'Санкт-Петербург', count: 2, active: 2, employees: 299 },
                { name: 'Новосибирск', count: 1, active: 1, employees: 156 },
                { name: 'Екатеринбург', count: 2, active: 1, employees: 203 },
                { name: 'Казань', count: 2, active: 2, employees: 226 },
                { name: 'Ростов-на-Дону', count: 1, active: 1, employees: 98 },
                { name: 'Владивосток', count: 1, active: 1, employees: 76 }
              ].map((region, index) => (
                <div key={index} className="bg-white border border-gray-200 rounded-lg p-5 hover:shadow-md transition-shadow">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="text-lg font-medium text-gray-800">{region.name}</h3>
                      <p className="text-gray-500 mt-1">Предприятий: {region.count}</p>
                    </div>
                    <div className="bg-blue-100 text-blue-800 text-sm font-medium px-2.5 py-0.5 rounded-full">
                      {region.employees} сотрудников
                    </div>
                  </div>
                  
                  <div className="mt-4">
                    <div className="flex justify-between text-sm mb-1">
                      <span>Активные предприятия</span>
                      <span>{region.active}/{region.count}</span>
                    </div>
                    <div className="bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-green-500 h-2 rounded-full"
                        style={{ width: `${(region.active / region.count) * 100}%` }}
                      ></div>
                    </div>
                  </div>
                  
                  <div className="mt-4 flex justify-end">
                    <button className="text-sm text-blue-600 hover:text-blue-800">
                      Подробнее
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          
          {activeTab === 'performance' && (
            <div className="space-y-6">
              <div className="bg-white border border-gray-200 rounded-lg p-5">
                <h3 className="text-lg font-medium text-gray-800 mb-4">Эффективность по регионам</h3>
                <div className="space-y-4">
                  {[
                    { name: 'Москва', performance: 89 },
                    { name: 'Санкт-Петербург', performance: 92 },
                    { name: 'Новосибирск', performance: 85 },
                    { name: 'Екатеринбург', performance: 88 },
                    { name: 'Казань', performance: 90 },
                    { name: 'Ростов-на-Дону', performance: 83 },
                    { name: 'Владивосток', performance: 81 }
                  ].map((region, index) => (
                    <div key={index} className="flex items-center">
                      <div className="w-32 text-sm text-gray-800">{region.name}</div>
                      <div className="flex-1">
                        <div className="bg-gray-200 rounded-full h-4">
                          <div 
                            className={`h-4 rounded-full ${
                              region.performance >= 90 ? 'bg-green-500' :
                              region.performance >= 85 ? 'bg-blue-500' :
                              'bg-yellow-500'
                            }`}
                            style={{ width: `${region.performance}%` }}
                          >
                            <div className="px-2 text-xs text-white font-medium h-full flex items-center">
                              {region.performance}%
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="bg-white border border-gray-200 rounded-lg p-5">
                <h3 className="text-lg font-medium text-gray-800 mb-4">Лучшие предприятия</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {[
                    { name: 'АО "Северная верфь"', region: 'Санкт-Петербург', performance: 94 },
                    { name: 'ООО "Технопром"', region: 'Москва', performance: 92 },
                    { name: 'ЗАО "Энергопром"', region: 'Казань', performance: 91 }
                  ].map((company, index) => (
                    <div key={index} className="border border-gray-200 rounded-lg p-4">
                      <h4 className="font-medium text-gray-900">{company.name}</h4>
                      <div className="text-xs text-gray-500 mt-1">{company.region}</div>
                      <div className="mt-3 flex items-center">
                        <div className="text-xs font-medium text-green-800 bg-green-100 px-2 py-0.5 rounded-full">
                          {company.performance}%
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
