'use client';

import { useState, useRef } from 'react';
import { GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { BottomDrawer } from '@/components/ui/BottomDrawer';

interface EmployeesLayoutProps {
  leftPanel: React.ReactNode;
  rightPanel: React.ReactNode;
  /** Выбран ли сотрудник (для подсветки правой панели) */
  hasSelection?: boolean;
  /** Открыт ли drawer с деталями (для мобильного) */
  isDrawerOpen?: boolean;
  /** Callback для закрытия drawer */
  onDrawerClose?: () => void;
}

export default function EmployeesLayout({
  leftPanel,
  rightPanel,
  hasSelection = false,
  isDrawerOpen = false,
  onDrawerClose,
}: EmployeesLayoutProps) {
  const [panelWidth, setPanelWidth] = useState(380);
  const isResizing = useRef(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();

  const handleMouseDown = () => {
    isResizing.current = true;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isResizing.current) return;
    const newWidth = e.clientX - (panelRef.current?.getBoundingClientRect().left || 0);
    if (newWidth >= 280 && newWidth <= 500) {
      setPanelWidth(newWidth);
    }
  };

  const handleMouseUp = () => {
    isResizing.current = false;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  };

  // Мобильный layout: список на весь экран + drawer для деталей
  if (isMobile) {
    return (
      <div className="flex flex-col h-full bg-mesh-emerald">
        {/* Список сотрудников на весь экран */}
        <div className="flex-1 overflow-y-auto glass-panel">
          {leftPanel}
        </div>

        {/* Bottom Drawer для деталей сотрудника */}
        <BottomDrawer
          isOpen={isDrawerOpen}
          onClose={onDrawerClose || (() => {})}
          height="full"
          showCloseButton={false}
          showDragHandle={false}
        >
          <div className="min-h-full p-3 pb-6">
            {rightPanel}
          </div>
        </BottomDrawer>
      </div>
    );
  }

  // Десктопный layout: две панели с resizer
  return (
    <div className="flex h-full bg-mesh-emerald">
      {/* Левая панель - список сотрудников */}
      <div
        ref={panelRef}
        className="glass-panel flex flex-col relative z-10 overflow-hidden"
        style={{ width: panelWidth }}
      >
        {leftPanel}

        {/* Ручка для ресайза */}
        <div
          className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-emerald-300/50 active:bg-emerald-400/50 transition-colors group"
          onMouseDown={handleMouseDown}
          aria-label="Изменить ширину панели"
          role="separator"
          aria-orientation="vertical"
        >
          <div className="absolute right-0 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
            <GripVertical className="h-6 w-6 text-gray-400/50" aria-hidden="true" />
          </div>
        </div>
      </div>

      {/* Правая панель - детали сотрудника */}
      <div className={cn(
        "flex-1 overflow-y-auto overscroll-contain relative z-0",
        hasSelection ? "bg-emerald-50/30" : "bg-transparent"
      )}>
        {rightPanel}
      </div>
    </div>
  );
}
