import React from 'react';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { BottomDrawer } from '@/components/ui/BottomDrawer';
import { Brain, BarChart2 } from 'lucide-react';

interface ActivityLayoutProps {
    header: React.ReactNode;
    feed: React.ReactNode;
    sidebar: React.ReactNode;
    isDrawerOpen: boolean;
    onToggleDrawer: () => void;
}

export function ActivityLayout({
    header,
    feed,
    sidebar,
    isDrawerOpen,
    onToggleDrawer
}: ActivityLayoutProps) {
    const isMobile = useIsMobile();

    return (
        <div className="space-y-6 sm:space-y-8 pb-10">
            {header}

            <div className="flex flex-col lg:flex-row gap-6 relative">
                <div className="flex-1 min-w-0">
                    {feed}
                </div>

                {!isMobile && (
                    <div className="w-[380px] flex-shrink-0">
                        <div className="sticky top-6">
                            {sidebar}
                        </div>
                    </div>
                )}
            </div>

            {isMobile && (
                <button
                    onClick={onToggleDrawer}
                    className="fixed bottom-6 right-6 z-50 p-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-full shadow-lg shadow-blue-500/30 flex items-center justify-center transition-transform active:scale-95"
                    aria-label="Открыть статистику"
                >
                    <BarChart2 className="h-6 w-6" />
                </button>
            )}

            {isMobile && (
                <BottomDrawer
                    isOpen={isDrawerOpen}
                    onClose={onToggleDrawer}
                    height="auto"
                >
                    <div className="p-4 bg-white/50 backdrop-blur-md rounded-t-3xl min-h-[50vh]">
                        <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                            <Brain className="h-5 w-5 text-amber-500" />
                            Статистика и анализ
                        </h3>
                        {sidebar}
                    </div>
                </BottomDrawer>
            )}
        </div>
    );
}
