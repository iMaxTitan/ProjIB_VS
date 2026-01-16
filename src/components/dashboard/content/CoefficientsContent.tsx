"use client";

import React from 'react';
import { UserInfo } from '@/types/azure';

interface CoefficientsContentProps {
  user: UserInfo;
}

export default function CoefficientsContent({ user }: CoefficientsContentProps) {
  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Коэффициенты</h1>
      </div>
      
      <div className="bg-white rounded-xl shadow-md p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Карточка коэффициента */}
          <div className="bg-gradient-to-r from-indigo-50 to-blue-50 rounded-lg shadow p-4 border border-indigo-100">
            <div className="flex justify-between items-start mb-3">
              <h3 className="text-lg font-semibold text-indigo-700">Эффективность</h3>
              <span className="text-sm font-medium bg-indigo-100 text-indigo-800 py-1 px-2 rounded">Активный</span>
            </div>
            <p className="text-gray-600 mb-3 text-sm">Коэффициент эффективности выполнения планов и задач</p>
            <div className="flex justify-between items-center text-sm text-gray-500">
              <span>Значение: <strong className="text-indigo-600">1.25</strong></span>
              <span>Применяется к: <strong>Всем</strong></span>
            </div>
          </div>
          
          {/* Карточка коэффициента */}
          <div className="bg-gradient-to-r from-emerald-50 to-teal-50 rounded-lg shadow p-4 border border-emerald-100">
            <div className="flex justify-between items-start mb-3">
              <h3 className="text-lg font-semibold text-emerald-700">Премиальный</h3>
              <span className="text-sm font-medium bg-emerald-100 text-emerald-800 py-1 px-2 rounded">Активный</span>
            </div>
            <p className="text-gray-600 mb-3 text-sm">Квартальный премиальный коэффициент для руководителей</p>
            <div className="flex justify-between items-center text-sm text-gray-500">
              <span>Значение: <strong className="text-emerald-600">1.5</strong></span>
              <span>Применяется к: <strong>Руководителям</strong></span>
            </div>
          </div>
          
          {/* Карточка коэффициента */}
          <div className="bg-gradient-to-r from-amber-50 to-yellow-50 rounded-lg shadow p-4 border border-amber-100">
            <div className="flex justify-between items-start mb-3">
              <h3 className="text-lg font-semibold text-amber-700">Сложность</h3>
              <span className="text-sm font-medium bg-amber-100 text-amber-800 py-1 px-2 rounded">Активный</span>
            </div>
            <p className="text-gray-600 mb-3 text-sm">Коэффициент сложности выполняемых задач</p>
            <div className="flex justify-between items-center text-sm text-gray-500">
              <span>Значение: <strong className="text-amber-600">1.3</strong></span>
              <span>Применяется к: <strong>Задачам</strong></span>
            </div>
          </div>
        </div>
        
        <div className="mt-8 border-t border-gray-200 pt-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">История изменений</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Коэффициент</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Дата изменения</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Старое значение</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Новое значение</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Кем изменено</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                <tr>
                  <td className="px-4 py-3 text-sm text-gray-900">Эффективность</td>
                  <td className="px-4 py-3 text-sm text-gray-500">25.05.2025</td>
                  <td className="px-4 py-3 text-sm text-gray-500">1.2</td>
                  <td className="px-4 py-3 text-sm text-gray-900 font-medium">1.25</td>
                  <td className="px-4 py-3 text-sm text-gray-500">Администратор</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 text-sm text-gray-900">Премиальный</td>
                  <td className="px-4 py-3 text-sm text-gray-500">20.05.2025</td>
                  <td className="px-4 py-3 text-sm text-gray-500">1.3</td>
                  <td className="px-4 py-3 text-sm text-gray-900 font-medium">1.5</td>
                  <td className="px-4 py-3 text-sm text-gray-500">Администратор</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
