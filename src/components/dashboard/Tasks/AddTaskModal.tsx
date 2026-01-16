import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

interface AddTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  weeklyPlanId: string;
  userId: string;
  task?: any; // Опциональный параметр для режима редактирования
}

const AddTaskModal: React.FC<AddTaskModalProps> = ({ isOpen, onClose, onSuccess, weeklyPlanId, userId, task }) => {
  const [description, setDescription] = useState('');
  const [spentHours, setSpentHours] = useState(0);
  const [completedAt, setCompletedAt] = useState<string | null>(null);
  const [attachmentUrl, setAttachmentUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Заполнение полей при редактировании задачи
  useEffect(() => {
    if (isOpen && task) {
      // Если открыто модальное окно и передана задача - режим редактирования
      setDescription(task.description || '');
      setSpentHours(Number(task.spent_hours) || 0);

      // Корректная обработка даты
      if (task.completed_at) {
        // Преобразуем дату в формат YYYY-MM-DD для поля ввода типа date
        const dateObj = new Date(task.completed_at);
        const year = dateObj.getFullYear();
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        const day = String(dateObj.getDate()).padStart(2, '0');
        setCompletedAt(`${year}-${month}-${day}`);
      } else {
        setCompletedAt(null);
      }

      setAttachmentUrl(task.attachment_url || '');
    } else if (isOpen && !task) {
      // Если открыто модальное окно без задачи - режим добавления
      setDescription('');
      setSpentHours(0);
      // Устанавливаем текущую дату в формате YYYY-MM-DD
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      setCompletedAt(`${year}-${month}-${day}`);
      setAttachmentUrl('');
    }
  }, [isOpen, task]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      // Вызов Supabase RPC manage_weekly_task с _weekly_tasks_id=null для создания
      const { data, error } = await supabase.rpc('manage_weekly_task', {
        _weekly_tasks_id: task?.weekly_tasks_id || null, // Если есть task.weekly_tasks_id - редактирование, иначе - создание
        _weekly_plan_id: weeklyPlanId,
        _user_id: userId,
        _description: description,
        _spent_hours: spentHours,
        _completed_at: completedAt,
        _attachment_url: attachmentUrl,
      });
      if (error) throw error;
      onSuccess();
    } catch (err: any) {
      setError(err.message || `Ошибка при ${task ? 'редактировании' : 'добавлении'} задачи`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
      <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md relative animate-fade-in">
        <button
          className="absolute top-3 right-3 text-gray-400 hover:text-indigo-600 text-xl font-bold"
          onClick={onClose}
          disabled={loading}
        >
          ×
        </button>
        <h2 className="text-lg font-bold mb-4 text-indigo-700">
          {task ? 'Редактировать задачу' : 'Добавить задачу'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Описание задачи<span className="text-red-500">*</span></label>
            <textarea
              className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 resize-none"
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              required
              disabled={loading}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Затраченное время (часы)</label>
            <input
              type="number"
              className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
              value={spentHours}
              onChange={e => setSpentHours(Number(e.target.value))}
              min={0}
              step={0.1}
              disabled={loading}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Дата выполнения</label>
            <input
              type="date"
              className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
              value={completedAt || ''}
              onChange={e => setCompletedAt(e.target.value || null)}
              disabled={loading}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Вложение (ссылка)</label>
            <input
              type="text"
              className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
              value={attachmentUrl}
              onChange={e => setAttachmentUrl(e.target.value)}
              placeholder="https://..."
              disabled={loading}
            />
          </div>
          {error && <div className="text-red-500 text-sm text-center">{error}</div>}
          <div className="flex justify-end gap-3 mt-2">
            <button
              type="button"
              onClick={onClose}
              className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium py-2 px-4 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-opacity-50 transition-all"
              disabled={loading}
            >
              Отмена
            </button>
            <button
              type="submit"
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-5 rounded-lg shadow focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-opacity-50 transition-all"
              disabled={loading}
            >
              {loading ? 'Сохранение...' : 'Сохранить'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddTaskModal;
