'use client';

import React, { useState } from 'react';
import TasksLayout from '@/components/dashboard/Tasks/new/TasksLayout';
import PlanListSidebar from '@/components/dashboard/Tasks/new/PlanListSidebar';
import WorkLogViewer, { type Task } from '@/components/dashboard/Tasks/new/WorkLogViewer';
import AddTaskModal from '@/components/dashboard/Tasks/AddTaskModal';
import { MonthlyPlan, PlanStatus } from '@/types/planning';
import { useAuth } from '@/lib/auth';
import { changeMonthlyPlanStatus } from '@/lib/plans/plan-service';
import { UserRole } from '@/types/supabase';
import { useIsMobile } from '@/hooks/useMediaQuery';

export default function TasksPageNew() {
    const { user } = useAuth();
    const [selectedPlan, setSelectedPlan] = useState<MonthlyPlan | null>(null);
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [taskToEdit, setTaskToEdit] = useState<any | null>(null);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);

    const isMobile = useIsMobile();

    const handleSelectPlan = (plan: MonthlyPlan) => {
        setSelectedPlan(plan);
        // На мобильных открываем drawer с журналом работ
        if (isMobile) {
            setIsDrawerOpen(true);
        }
    };

    const handleDrawerClose = () => {
        setIsDrawerOpen(false);
    };

    // Add task from sidebar
    const handleAddTaskFromSidebar = (plan: MonthlyPlan) => {
        setSelectedPlan(plan);
        setTaskToEdit(null);
        setIsModalOpen(true);
    };

    // Add new task
    const handleAddNewTask = () => {
        if (!selectedPlan) return;
        setTaskToEdit(null);
        setIsModalOpen(true);
    };

    // Edit existing task
    const handleEditTask = (task: Task) => {
        setTaskToEdit({
            daily_task_id: task.daily_task_id,
            description: task.description,
            spent_hours: task.spent_hours,
            task_date: task.task_date,
            attachment_url: task.attachment_url,
            document_number: task.document_number
        });
        setIsModalOpen(true);
    };

    const handleSuccess = () => {
        setIsModalOpen(false);
        setRefreshTrigger(prev => prev + 1);
    };

    // Change plan status with validation and logging
    const handleStatusChange = async (planId: string, newStatus: PlanStatus) => {
        if (!user?.user_id || !user?.role) {
            console.error('User not authenticated');
            return;
        }

        try {
            const result = await changeMonthlyPlanStatus(
                planId,
                newStatus,
                user.user_id,
                user.role as UserRole
            );

            if (!result.success) {
                // Показываем ошибку пользователю
                alert(result.error || 'Не удалось изменить статус');
                return;
            }

            // Update local state
            if (selectedPlan && selectedPlan.monthly_plan_id === planId) {
                setSelectedPlan({ ...selectedPlan, status: newStatus });
            }
            setRefreshTrigger(prev => prev + 1);
        } catch (err) {
            console.error('Error updating status:', err);
            alert('Произошла ошибка при изменении статуса');
        }
    };

    return (
        <>
            <TasksLayout
                leftPanel={
                    <PlanListSidebar
                        selectedPlanId={selectedPlan?.monthly_plan_id || null}
                        onSelectPlan={handleSelectPlan}
                        onAddTask={handleAddTaskFromSidebar}
                    />
                }
                centerPanel={
                    <WorkLogViewer
                        selectedPlan={selectedPlan}
                        refreshTrigger={refreshTrigger}
                        onAddTask={handleAddNewTask}
                        onEditTask={handleEditTask}
                        onStatusChange={handleStatusChange}
                        onClose={handleDrawerClose}
                        userId={user?.user_id || ''}
                    />
                }
                isDrawerOpen={isDrawerOpen}
                onDrawerClose={handleDrawerClose}
            />

            {/* Modal */}
            {selectedPlan && (
                <AddTaskModal
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    onSuccess={handleSuccess}
                    monthlyPlanId={selectedPlan.monthly_plan_id}
                    userId={user?.user_id || ''}
                    task={taskToEdit}
                    monthlyPlan={selectedPlan}
                />
            )}
        </>
    );
}
