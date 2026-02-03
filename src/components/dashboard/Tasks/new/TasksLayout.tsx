'use client';

import { useState, useRef } from 'react';
import { GripVertical } from 'lucide-react';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { BottomDrawer } from '@/components/ui/BottomDrawer';

interface TasksLayoutProps {
    leftPanel: React.ReactNode;
    centerPanel: React.ReactNode;
    /** Открыт ли drawer с деталями (журнал работ) для мобильного */
    isDrawerOpen?: boolean;
    /** Callback для закрытия drawer */
    onDrawerClose?: () => void;
}

export default function TasksLayout({
    leftPanel,
    centerPanel,
    isDrawerOpen = false,
    onDrawerClose,
}: TasksLayoutProps) {
    const [leftWidth, setLeftWidth] = useState(480);
    const isResizingLeft = useRef(false);
    const leftPanelRef = useRef<HTMLDivElement>(null);
    const isMobile = useIsMobile();

    const handleLeftMouseDown = () => {
        isResizingLeft.current = true;
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    };

    const handleMouseMove = (e: MouseEvent) => {
        if (isResizingLeft.current && leftPanelRef.current) {
            const newWidth = e.clientX - (leftPanelRef.current.getBoundingClientRect().left || 0);
            if (newWidth >= 280 && newWidth <= 600) {
                setLeftWidth(newWidth);
            }
        }
    };

    const handleMouseUp = () => {
        isResizingLeft.current = false;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
    };

    // Мобильный layout: список планов на весь экран, журнал работ в drawer
    if (isMobile) {
        return (
            <div className="flex flex-col h-full bg-mesh-indigo">
                {/* Список планов на весь экран */}
                <div className="flex-1 overflow-y-auto glass-panel">
                    {leftPanel}
                </div>

                {/* Bottom Drawer с журналом работ - свайп за header */}
                <BottomDrawer
                    isOpen={isDrawerOpen}
                    onClose={onDrawerClose || (() => {})}
                    height="full"
                    showCloseButton={false}
                    showDragHandle={false}
                >
                    <div className="min-h-full bg-indigo-50/30">
                        {centerPanel}
                    </div>
                </BottomDrawer>
            </div>
        );
    }

    // Десктопный layout
    return (
        <div className="flex h-full bg-mesh-indigo">
            {/* Левая панель - Список планов */}
            <div
                ref={leftPanelRef}
                className="glass-panel flex flex-col relative shrink-0 z-10"
                style={{ width: leftWidth }}
            >
                {leftPanel}

                {/* Ручка для ресайза */}
                <div
                    className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-indigo-300/50 active:bg-indigo-400/50 transition-colors group"
                    onMouseDown={handleLeftMouseDown}
                    aria-label="Изменить ширину панели"
                    role="separator"
                    aria-orientation="vertical"
                >
                    <div className="absolute right-0 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <GripVertical className="h-6 w-6 text-gray-400/50" aria-hidden="true" />
                    </div>
                </div>
            </div>

            {/* Центральная панель - Журнал работ */}
            <div className="flex-1 overflow-y-auto relative z-0 min-w-0 bg-indigo-50/20">
                {centerPanel}
            </div>
        </div>
    );
}
