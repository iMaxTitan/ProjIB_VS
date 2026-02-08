import { PlanStatus, getPlanStatusText } from '@/types/planning';
import { cn } from '@/lib/utils';

interface PlanStatusFilterProps {
    statusFilter: PlanStatus | null;
    setStatusFilter: (status: PlanStatus | null) => void;
    selectedMonth?: number | null;
    selectedQuarter?: number | null;
    selectedYear?: number | null;
}

export default function PlanStatusFilter({
    statusFilter,
    setStatusFilter,
    selectedMonth,
    selectedQuarter,
    selectedYear
}: PlanStatusFilterProps) {
    const statuses: PlanStatus[] = ['draft', 'submitted', 'approved', 'active', 'completed', 'failed', 'returned'];

    return (
        <div className={cn(
            "px-3 py-2 border-b",
            selectedMonth !== undefined && selectedMonth !== null ? "bg-indigo-100/80" :
                selectedQuarter ? "bg-purple-100/80" :
                    selectedYear ? "bg-amber-100/80" : "bg-gray-100/80"
        )}>
            <div className="flex flex-wrap gap-1">
                <button
                    onClick={() => setStatusFilter(null)}
                    className={cn(
                        "px-2 py-0.5 text-2xs rounded-full transition-colors",
                        !statusFilter
                            ? "bg-gray-700 text-white"
                            : "text-gray-500 hover:bg-gray-200"
                    )}
                >
                    Все
                </button>
                {statuses.slice(0, 5).map(status => (
                    <button
                        key={status}
                        onClick={() => setStatusFilter(status === statusFilter ? null : status)}
                        className={cn(
                            "px-2 py-0.5 text-2xs rounded-full transition-colors",
                            status === statusFilter
                                ? "bg-gray-700 text-white"
                                : "text-gray-500 hover:bg-gray-200"
                        )}
                    >
                        {getPlanStatusText(status)}
                    </button>
                ))}
            </div>
        </div>
    );
}
