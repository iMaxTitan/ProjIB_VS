import React from 'react';
import { UserInfo } from '@/types/azure';

interface DepartmentContentProps {
  user: UserInfo;
}

export default function DepartmentContent({ user }: DepartmentContentProps) {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">Отдел</h1>
      
      {/* Информация об отделе */}
      <div className="bg-white rounded-xl shadow-lg p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-800">{user.department_name || 'Ваш отдел'}</h2>
            <p className="text-gray-500 mt-1">Руководитель: {user.displayName}</p>
          </div>
          <div className="mt-4 md:mt-0 flex space-x-3">
            <button className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors">
              Управление отделом
            </button>
            <button className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">
              Отчет по отделу
            </button>
          </div>
        </div>
      </div>
      
      {/* Статистика отдела */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-xl shadow-lg p-6">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold text-gray-800">Сотрудники</h2>
            <span className="text-2xl">👥</span>
          </div>
          <div className="mt-2 text-3xl font-bold text-indigo-600">12</div>
          <div className="mt-1 text-sm text-gray-500">2 новых в этом месяце</div>
        </div>
        
        <div className="bg-white rounded-xl shadow-lg p-6">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold text-gray-800">Проекты</h2>
            <span className="text-2xl">📋</span>
          </div>
          <div className="mt-2 text-3xl font-bold text-blue-600">5</div>
          <div className="mt-1 text-sm text-gray-500">3 активных, 2 завершенных</div>
        </div>
        
        <div className="bg-white rounded-xl shadow-lg p-6">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold text-gray-800">Задачи</h2>
            <span className="text-2xl">✅</span>
          </div>
          <div className="mt-2 text-3xl font-bold text-green-600">28</div>
          <div className="mt-1 text-sm text-gray-500">18 выполнено, 10 в работе</div>
        </div>
        
        <div className="bg-white rounded-xl shadow-lg p-6">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold text-gray-800">Эффективность</h2>
            <span className="text-2xl">📈</span>
          </div>
          <div className="mt-2 text-3xl font-bold text-purple-600">92%</div>
          <div className="mt-1 text-sm text-gray-500">+5% к прошлому месяцу</div>
        </div>
      </div>
      
      {/* Сотрудники отдела */}
      <div className="bg-white rounded-xl shadow-lg p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold text-gray-800">Сотрудники отдела</h2>
          <div className="flex space-x-2">
            <input 
              type="text" 
              placeholder="Поиск сотрудника..." 
              className="border border-gray-300 rounded-md px-3 py-2 text-sm"
            />
            <button className="px-3 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors">
              Добавить
            </button>
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Сотрудник
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Должность
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Статус
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Задачи
                </th>
                <th scope="col" className="relative px-6 py-3">
                  <span className="sr-only">Действия</span>
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {[
                { name: 'Анна Смирнова', position: 'Старший аналитик', status: 'Активный', tasks: { completed: 8, total: 10 }, avatar: 'AS' },
                { name: 'Иван Петров', position: 'Разработчик', status: 'Активный', tasks: { completed: 5, total: 8 }, avatar: 'ИП' },
                { name: 'Мария Иванова', position: 'Дизайнер', status: 'В отпуске', tasks: { completed: 12, total: 12 }, avatar: 'МИ' },
                { name: 'Алексей Сидоров', position: 'Менеджер проектов', status: 'Активный', tasks: { completed: 15, total: 20 }, avatar: 'АС' },
                { name: 'Екатерина Козлова', position: 'Младший аналитик', status: 'Активный', tasks: { completed: 7, total: 9 }, avatar: 'ЕК' }
              ].map((employee, index) => (
                <tr key={index} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-300 to-indigo-400 flex items-center justify-center text-white text-sm font-bold">
                        {employee.avatar}
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-gray-900">{employee.name}</div>
                        <div className="text-sm text-gray-500">employee{index+1}@example.com</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{employee.position}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      employee.status === 'Активный' ? 'bg-green-100 text-green-800' :
                      employee.status === 'В отпуске' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      {employee.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <div className="flex items-center">
                      <span className="mr-2">{employee.tasks.completed}/{employee.tasks.total}</span>
                      <div className="w-24 bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-blue-500 h-2 rounded-full" 
                          style={{ width: `${(employee.tasks.completed / employee.tasks.total) * 100}%` }}
                        ></div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button className="text-indigo-600 hover:text-indigo-900 mr-3">Профиль</button>
                    <button className="text-gray-600 hover:text-gray-900">Задачи</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      
      {/* Проекты отдела */}
      <div className="bg-white rounded-xl shadow-lg p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold text-gray-800">Проекты отдела</h2>
          <button className="px-3 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors">
            Новый проект
          </button>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { name: 'Оптимизация процессов', status: 'В работе', progress: 65, members: 4 },
            { name: 'Разработка новой платформы', status: 'В работе', progress: 30, members: 6 },
            { name: 'Аналитика продаж Q1', status: 'Завершен', progress: 100, members: 3 },
            { name: 'Обновление инфраструктуры', status: 'В работе', progress: 45, members: 5 },
            { name: 'Исследование рынка', status: 'Завершен', progress: 100, members: 2 }
          ].map((project, index) => (
            <div key={index} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start">
                <h3 className="font-medium text-gray-800">{project.name}</h3>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                  project.status === 'В работе' ? 'bg-blue-100 text-blue-800' :
                  'bg-green-100 text-green-800'
                }`}>
                  {project.status}
                </span>
              </div>
              
              <div className="mt-3">
                <div className="flex justify-between text-sm mb-1">
                  <span>Прогресс</span>
                  <span>{project.progress}%</span>
                </div>
                <div className="bg-gray-200 rounded-full h-2">
                  <div 
                    className={`h-2 rounded-full ${
                      project.status === 'Завершен' ? 'bg-green-500' : 'bg-blue-500'
                    }`}
                    style={{ width: `${project.progress}%` }}
                  ></div>
                </div>
              </div>
              
              <div className="mt-3 flex justify-between items-center">
                <div className="text-sm text-gray-500">
                  <span className="font-medium">{project.members}</span> участников
                </div>
                
                <button className="px-3 py-1 text-sm text-blue-600 hover:text-blue-800">
                  Подробнее
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
