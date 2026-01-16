import React from 'react';
import { UserInfo } from '@/types/azure';

interface ActivityContentProps {
  user: UserInfo;
}

export default function ActivityContent({ user }: ActivityContentProps) {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">Активность</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Карточка активности за сегодня */}
        <div className="bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl shadow-lg p-6 text-white">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Сегодня</h2>
            <span className="text-3xl">⚡</span>
          </div>
          <div className="text-4xl font-bold mb-2">85%</div>
          <p className="text-blue-100">Продуктивность</p>
          <div className="mt-4 bg-white/20 rounded-full h-2">
            <div className="bg-white h-2 rounded-full" style={{ width: '85%' }}></div>
          </div>
        </div>

        {/* Карточка задач */}
        <div className="bg-white rounded-xl shadow-lg p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-gray-800">Задачи</h2>
            <span className="text-3xl">✅</span>
          </div>
          <div className="flex items-end space-x-2">
            <div className="text-4xl font-bold text-gray-800">7</div>
            <div className="text-green-500 text-sm font-medium">+2 сегодня</div>
          </div>
          <p className="text-gray-500 mt-1">Выполнено из 12</p>
          <div className="mt-4 flex space-x-2">
            <div className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full">В срок</div>
            <div className="bg-yellow-100 text-yellow-800 text-xs px-2 py-1 rounded-full">2 на сегодня</div>
          </div>
        </div>

        {/* Карточка проектов */}
        <div className="bg-white rounded-xl shadow-lg p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-gray-800">Проекты</h2>
            <span className="text-3xl">📋</span>
          </div>
          <div className="flex items-end space-x-2">
            <div className="text-4xl font-bold text-gray-800">4</div>
            <div className="text-blue-500 text-sm font-medium">активных</div>
          </div>
          <p className="text-gray-500 mt-1">Всего 6 проектов</p>
          <div className="mt-4 flex space-x-2">
            <div className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full">2 новых</div>
            <div className="bg-purple-100 text-purple-800 text-xs px-2 py-1 rounded-full">1 завершен</div>
          </div>
        </div>
      </div>

      {/* График активности */}
      <div className="bg-white rounded-xl shadow-lg p-6">
        <h2 className="text-xl font-semibold text-gray-800 mb-4">Активность за неделю</h2>
        <div className="h-64 flex items-end space-x-2">
          {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((day, index) => {
            const height = [60, 45, 80, 65, 90, 30, 40][index];
            return (
              <div key={day} className="flex-1 flex flex-col items-center">
                <div 
                  className="w-full bg-gradient-to-t from-blue-500 to-indigo-600 rounded-t-md"
                  style={{ height: `${height}%` }}
                ></div>
                <div className="text-gray-600 text-sm mt-2">{day}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Последние действия */}
      <div className="bg-white rounded-xl shadow-lg p-6">
        <h2 className="text-xl font-semibold text-gray-800 mb-4">Последние действия</h2>
        <div className="space-y-4">
          {[
            { time: '14:32', action: 'Завершена задача "Подготовка отчета"', icon: '✅' },
            { time: '12:15', action: 'Добавлен комментарий к задаче "Встреча с клиентом"', icon: '💬' },
            { time: '10:45', action: 'Создана новая задача "Обновление документации"', icon: '🆕' },
            { time: '09:30', action: 'Начато выполнение задачи "Анализ данных"', icon: '▶️' },
            { time: '08:15', action: 'Вход в систему', icon: '🔑' }
          ].map((item, index) => (
            <div key={index} className="flex items-start space-x-3 p-3 hover:bg-gray-50 rounded-lg transition-colors">
              <div className="text-xl">{item.icon}</div>
              <div className="flex-1">
                <div className="text-gray-800">{item.action}</div>
                <div className="text-gray-500 text-sm">{item.time}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
