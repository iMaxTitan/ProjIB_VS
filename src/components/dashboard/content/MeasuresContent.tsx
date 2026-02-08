"use client";

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Spinner } from '@/components/ui/Spinner';
import { Measure, MeasureCategory } from './kpi/types';
import { Plus, Edit2, Trash2, Target, Filter } from 'lucide-react';
import { UserInfo } from '@/types/azure';

interface MeasuresContentProps {
    user: UserInfo;
}

interface Process {
    process_id: string;
    process_name: string;
}

const CATEGORY_LABELS: Record<MeasureCategory, string> = {
    strategic: 'Стратегический',
    process: 'Процессный',
    operational: 'Операционный'
};

const CATEGORY_COLORS: Record<MeasureCategory, string> = {
    strategic: 'bg-purple-100 text-purple-700',
    process: 'bg-blue-100 text-blue-700',
    operational: 'bg-green-100 text-green-700'
};

const PERIOD_LABELS: Record<string, string> = {
    year: 'на год',
    quarter: 'на квартал',
    month: 'на месяц'
};

export default function MeasuresContent({ user }: MeasuresContentProps) {
    const [measures, setMeasures] = useState<Measure[]>([]);
    const [processes, setProcesses] = useState<Process[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Filters
    const [filterCategory, setFilterCategory] = useState<MeasureCategory | 'all'>('all');
    const [filterProcess, setFilterProcess] = useState<string>('all');

    // Form state
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingMeasure, setEditingMeasure] = useState<Measure | null>(null);
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        process_id: '',
        category: 'operational' as MeasureCategory,
        target_value: 0,
        target_period: 'year' as 'year' | 'quarter' | 'month'
    });

    // Fetch data
    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            // Fetch measures with KPI data
            const { data: measuresData, error: measuresError } = await supabase
                .from('v_kpi_operational')
                .select('*');

            if (measuresError) throw measuresError;

            // Fetch processes
            const { data: processesData, error: processesError } = await supabase
                .from('processes')
                .select('process_id, process_name')
                .order('process_name');

            if (processesError) throw processesError;

            setMeasures(measuresData?.map(m => ({
                measure_id: m.entity_id,
                process_id: m.process_id,
                name: m.entity_name,
                category: m.category,
                target_value: m.target_value,
                target_period: m.target_period,
                is_active: true,
                process_name: m.process_name,
                actual_value: m.actual_value,
                plans_count: m.plans_count,
                total_hours: m.total_hours
            })) || []);
            setProcesses(processesData || []);
        } catch (err: unknown) {
            setError('Ошибка загрузки данных: ' + (err instanceof Error ? err.message : String(err)));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Filter measures
    const filteredMeasures = useMemo(() => {
        return measures.filter(m => {
            if (filterCategory !== 'all' && m.category !== filterCategory) return false;
            if (filterProcess !== 'all' && m.process_id !== filterProcess) return false;
            return true;
        });
    }, [measures, filterCategory, filterProcess]);

    // Form handlers
    const openNewForm = useCallback(() => {
        setEditingMeasure(null);
        setFormData({
            name: '',
            description: '',
            process_id: '',
            category: 'operational',
            target_value: 0,
            target_period: 'year'
        });
        setIsFormOpen(true);
    }, []);

    const openEditForm = useCallback((measure: Measure) => {
        setEditingMeasure(measure);
        setFormData({
            name: measure.name,
            description: measure.description || '',
            process_id: measure.process_id || '',
            category: measure.category,
            target_value: measure.target_value,
            target_period: measure.target_period
        });
        setIsFormOpen(true);
    }, []);

    const handleSubmit = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();

        try {
            const { data, error } = await supabase.rpc('manage_measure', {
                p_action: editingMeasure ? 'update' : 'create',
                p_measure_id: editingMeasure?.measure_id || null,
                p_name: formData.name,
                p_description: formData.description || null,
                p_process_id: formData.process_id || null,
                p_category: formData.category,
                p_target_value: formData.target_value,
                p_target_period: formData.target_period,
                p_user_id: user.user_id
            });

            if (error) throw error;
            if (data && !data.success) {
                throw new Error(data.error || 'Ошибка сохранения');
            }

            // Refresh data without page reload
            setIsFormOpen(false);
            setEditingMeasure(null);
            await fetchData();
        } catch (err: unknown) {
            setError('Ошибка сохранения: ' + (err instanceof Error ? err.message : String(err)));
        }
    }, [formData, editingMeasure, user.user_id, fetchData]);

    const handleDelete = useCallback(async (measureId: string) => {
        if (!confirm('Удалить это мероприятие?')) return;

        try {
            const { data, error } = await supabase.rpc('manage_measure', {
                p_action: 'delete',
                p_measure_id: measureId,
                p_user_id: user.user_id
            });

            if (error) throw error;
            if (data && !data.success) {
                throw new Error(data.error || 'Ошибка удаления');
            }

            setMeasures(prev => prev.filter(m => m.measure_id !== measureId));
        } catch (err: unknown) {
            setError('Ошибка удаления: ' + (err instanceof Error ? err.message : String(err)));
        }
    }, [user.user_id]);

    const canEdit = user.role === 'chief' || user.role === 'head';

    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <Spinner size="large" />
            </div>
        );
    }

    return (
        <div className="p-4 h-full overflow-auto">
            {/* Header */}
            <div className="mb-4 flex justify-between items-center">
                <div>
                    <h1 className="text-xl font-bold text-gray-800 mb-1">Мероприятия</h1>
                    <p className="text-gray-600 text-sm">Справочник мероприятий ИБ для KPI</p>
                </div>
                {canEdit && (
                    <button
                        onClick={openNewForm}
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                    >
                        <Plus className="h-4 w-4" />
                        Добавить мероприятие
                    </button>
                )}
            </div>

            {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
                    {error}
                </div>
            )}

            {/* Filters */}
            <div className="bg-white rounded-lg shadow p-4 mb-4 flex gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                    <Filter className="h-4 w-4 text-gray-500" />
                    <span className="text-sm text-gray-600">Фильтры:</span>
                </div>

                <select
                    value={filterCategory}
                    onChange={e => setFilterCategory(e.target.value as MeasureCategory | 'all')}
                    className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
                    aria-label="Фильтр по категории"
                >
                    <option value="all">Все категории</option>
                    <option value="strategic">Стратегические</option>
                    <option value="process">Процессные</option>
                    <option value="operational">Операционные</option>
                </select>

                <select
                    value={filterProcess}
                    onChange={e => setFilterProcess(e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
                    aria-label="Фильтр по процессу"
                >
                    <option value="all">Все процессы</option>
                    {processes.map(p => (
                        <option key={p.process_id} value={p.process_id}>{p.process_name}</option>
                    ))}
                </select>
            </div>

            {/* Table */}
            <div className="bg-white rounded-lg shadow overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Название</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Процесс</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Категория</th>
                            <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">План</th>
                            <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Факт</th>
                            <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">%</th>
                            {canEdit && <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Действия</th>}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                        {filteredMeasures.length === 0 ? (
                            <tr>
                                <td colSpan={canEdit ? 7 : 6} className="px-4 py-8 text-center text-gray-500">
                                    Мероприятий не найдено
                                </td>
                            </tr>
                        ) : (
                            filteredMeasures.map(measure => {
                                const percentage = measure.target_value > 0
                                    ? Math.round((measure.actual_value || 0) / measure.target_value * 100)
                                    : 0;

                                return (
                                    <tr key={measure.measure_id} className="hover:bg-gray-50">
                                        <td className="px-4 py-3">
                                            <div className="font-medium text-gray-900">{measure.name}</div>
                                            {measure.description && (
                                                <div className="text-xs text-gray-500">{measure.description}</div>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-600">
                                            {measure.process_name || '—'}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`px-2 py-1 text-xs rounded-full ${CATEGORY_COLORS[measure.category]}`}>
                                                {CATEGORY_LABELS[measure.category]}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-center text-sm">
                                            {measure.target_value} {PERIOD_LABELS[measure.target_period]}
                                        </td>
                                        <td className="px-4 py-3 text-center text-sm font-medium">
                                            {measure.actual_value || 0}
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <span className={`font-medium ${percentage >= 100 ? 'text-green-600' : percentage >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>
                                                {percentage}%
                                            </span>
                                        </td>
                                        {canEdit && (
                                            <td className="px-4 py-3 text-right">
                                                <button
                                                    onClick={() => openEditForm(measure)}
                                                    className="p-1 text-gray-400 hover:text-indigo-600 mr-2"
                                                    title="Редагувати"
                                                >
                                                    <Edit2 className="h-4 w-4" />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(measure.measure_id)}
                                                    className="p-1 text-gray-400 hover:text-red-600"
                                                    title="Удалить"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                            </td>
                                        )}
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {/* Form Modal */}
            {isFormOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg shadow-lg w-full max-w-md p-6">
                        <h2 className="text-lg font-semibold mb-4">
                            {editingMeasure ? 'Редактирование мероприятия' : 'Новое мероприятие'}
                        </h2>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label htmlFor="measure-name" className="block text-sm font-medium text-gray-700 mb-1">Название *</label>
                                <input
                                    id="measure-name"
                                    type="text"
                                    required
                                    value={formData.name}
                                    onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                                />
                            </div>

                            <div>
                                <label htmlFor="measure-desc" className="block text-sm font-medium text-gray-700 mb-1">Описание</label>
                                <textarea
                                    id="measure-desc"
                                    value={formData.description}
                                    onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                                    rows={2}
                                />
                            </div>

                            <div>
                                <label htmlFor="measure-process" className="block text-sm font-medium text-gray-700 mb-1">Процесс</label>
                                <select
                                    id="measure-process"
                                    value={formData.process_id}
                                    onChange={e => setFormData(prev => ({ ...prev, process_id: e.target.value }))}
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                                >
                                    <option value="">Не выбрано</option>
                                    {processes.map(p => (
                                        <option key={p.process_id} value={p.process_id}>{p.process_name}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label htmlFor="measure-category" className="block text-sm font-medium text-gray-700 mb-1">Категория</label>
                                <select
                                    id="measure-category"
                                    value={formData.category}
                                    onChange={e => setFormData(prev => ({ ...prev, category: e.target.value as MeasureCategory }))}
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                                >
                                    <option value="strategic">Стратегический</option>
                                    <option value="process">Процессный</option>
                                    <option value="operational">Операционный</option>
                                </select>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label htmlFor="measure-target" className="block text-sm font-medium text-gray-700 mb-1">План (ч.)</label>
                                    <input
                                        id="measure-target"
                                        type="number"
                                        min="0"
                                        value={formData.target_value}
                                        onChange={e => setFormData(prev => ({ ...prev, target_value: parseInt(e.target.value) || 0 }))}
                                        className="w-full border border-gray-300 rounded-lg px-3 py-2"
                                    />
                                </div>
                                <div>
                                    <label htmlFor="measure-period" className="block text-sm font-medium text-gray-700 mb-1">Период</label>
                                    <select
                                        id="measure-period"
                                        value={formData.target_period}
                                        onChange={e => setFormData(prev => ({ ...prev, target_period: e.target.value as 'year' | 'quarter' | 'month' }))}
                                        className="w-full border border-gray-300 rounded-lg px-3 py-2"
                                    >
                                        <option value="year">На год</option>
                                        <option value="quarter">На квартал</option>
                                        <option value="month">На месяц</option>
                                    </select>
                                </div>
                            </div>

                            <div className="flex justify-end gap-3 pt-4">
                                <button
                                    type="button"
                                    onClick={() => setIsFormOpen(false)}
                                    className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                                >
                                    Отмена
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                                >
                                    {editingMeasure ? 'Сохранить' : 'Создать'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
