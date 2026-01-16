import React from 'react';
import { UserInfo } from '@/types/azure';

interface DefaultContentProps {
  user: UserInfo;
}

export default function DefaultContent({ user }: DefaultContentProps) {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">Добро пожаловать, {user.displayName}!</h1>
      
      <div className="bg-white rounded-xl shadow-lg p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between">
          <div className="mb-4 md:mb-0">
            <h2 className="text-xl font-semibold text-gray-800">Информация о пользователе</h2>
            <p className="text-gray-500 mt-1">Основные данные вашего профиля</p>
          </div>
          <div className="flex space-x-3">
            <button className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors">
              Редактировать профиль
            </button>
          </div>
        </div>
        
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="flex flex-col space-y-4">
            <div className="flex items-center">
              <div className="w-32 text-sm font-medium text-gray-500">Имя:</div>
              <div className="text-sm text-gray-800">{user.displayName}</div>
            </div>
            <div className="flex items-center">
              <div className="w-32 text-sm font-medium text-gray-500">Email:</div>
              <div className="text-sm text-gray-800">{user.email}</div>
            </div>
            <div className="flex items-center">
              <div className="w-32 text-sm font-medium text-gray-500">Должность:</div>
              <div className="text-sm text-gray-800">{user.jobTitle || 'Не указана'}</div>
            </div>
            <div className="flex items-center">
              <div className="w-32 text-sm font-medium text-gray-500">Телефон:</div>
              <div className="text-sm text-gray-800">{user.mobilePhone || 'Не указан'}</div>
            </div>
          </div>
          
          <div className="flex flex-col space-y-4">
            <div className="flex items-center">
              <div className="w-32 text-sm font-medium text-gray-500">Роль:</div>
              <div className="text-sm text-gray-800">{user.role_disp || user.role}</div>
            </div>
            <div className="flex items-center">
              <div className="w-32 text-sm font-medium text-gray-500">Отдел:</div>
              <div className="text-sm text-gray-800">{user.department_name || 'Не указан'}</div>
            </div>
            <div className="flex items-center">
              <div className="w-32 text-sm font-medium text-gray-500">Статус:</div>
              <div className="text-sm text-white bg-green-500 px-2 py-0.5 rounded-full">Активен</div>
            </div>
            <div className="flex items-center">
              <div className="w-32 text-sm font-medium text-gray-500">Последний вход:</div>
              <div className="text-sm text-gray-800">Сегодня, {new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</div>
            </div>
          </div>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl shadow-lg p-6">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold text-gray-800">Задачи</h2>
            <span className="text-2xl">✅</span>
          </div>
          <div className="mt-2 text-3xl font-bold text-blue-600">8</div>
          <div className="mt-1 text-sm text-gray-500">активных задач</div>
          <div className="mt-4">
            <a href="/dashboard/tasks" className="text-blue-600 hover:text-blue-800 text-sm font-medium">
              Перейти к задачам →
            </a>
          </div>
        </div>
        
        <div className="bg-white rounded-xl shadow-lg p-6">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold text-gray-800">Отчеты</h2>
            <span className="text-2xl">📊</span>
          </div>
          <div className="mt-2 text-3xl font-bold text-green-600">12</div>
          <div className="mt-1 text-sm text-gray-500">за последний месяц</div>
          <div className="mt-4">
            <a href="/dashboard/reports" className="text-blue-600 hover:text-blue-800 text-sm font-medium">
              Перейти к отчетам →
            </a>
          </div>
        </div>
        
        <div className="bg-white rounded-xl shadow-lg p-6">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold text-gray-800">Активность</h2>
            <span className="text-2xl">⚡</span>
          </div>
          <div className="mt-2 text-3xl font-bold text-purple-600">85%</div>
          <div className="mt-1 text-sm text-gray-500">эффективность</div>
          <div className="mt-4">
            <a href="/dashboard/statistics" className="text-blue-600 hover:text-blue-800 text-sm font-medium">
              Подробная статистика →
            </a>
          </div>
        </div>
      </div>
      
      <div className="bg-white rounded-xl shadow-lg p-6">
        <h2 className="text-xl font-semibold text-gray-800 mb-4">Последние события</h2>
        
        <div className="space-y-4">
          {[
            { time: '14:32', date: 'Сегодня', action: 'Завершена задача "Подготовка отчета"', icon: '✅' },
            { time: '12:15', date: 'Сегодня', action: 'Добавлен комментарий к задаче "Встреча с клиентом"', icon: '💬' },
            { time: '10:45', date: 'Сегодня', action: 'Создана новая задача "Обновление документации"', icon: '🆕' },
            { time: '09:30', date: 'Сегодня', action: 'Начато выполнение задачи "Анализ данных"', icon: '▶️' },
            { time: '17:15', date: 'Вчера', action: 'Утвержден отчет "Квартальный отчет Q1 2025"', icon: '📊' }
          ].map((item, index) => (
            <div key={index} className="flex items-start space-x-3 p-3 hover:bg-gray-50 rounded-lg transition-colors">
              <div className="text-xl">{item.icon}</div>
              <div className="flex-1">
                <div className="text-gray-800">{item.action}</div>
                <div className="text-gray-500 text-sm">{item.date}, {item.time}</div>
              </div>
            </div>
          ))}
        </div>
        
        <div className="mt-4 text-center">
          <button className="text-blue-600 hover:text-blue-800 text-sm font-medium">
            Показать больше событий
          </button>
        </div>
      </div>
    </div>
  );
}
