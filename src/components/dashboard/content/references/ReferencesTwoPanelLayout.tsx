'use client';

import React, { useRef, useState } from 'react';
import { GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { BottomDrawer } from '@/components/ui/BottomDrawer';

interface ReferencesTwoPanelLayoutProps {
  leftPanel: React.ReactNode;
  rightPanel: React.ReactNode;
  isDrawerOpen: boolean;
  onDrawerClose: () => void;
  initialPanelWidth?: number;
  minPanelWidth?: number;
  maxPanelWidth?: number;
  rightPanelClassName?: string;
  mobileDrawerContentClassName?: string;
  resizerClassName?: string;
}

export default function ReferencesTwoPanelLayout({
  leftPanel,
  rightPanel,
  isDrawerOpen,
  onDrawerClose,
  initialPanelWidth = 480,
  minPanelWidth = 280,
  maxPanelWidth = 600,
  rightPanelClassName,
  mobileDrawerContentClassName,
  resizerClassName = 'hover:bg-indigo-300/50 active:bg-indigo-400/50',
}: ReferencesTwoPanelLayoutProps) {
  const [panelWidth, setPanelWidth] = useState(initialPanelWidth);
  const isResizingRef = useRef(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();

  const handleMouseDown = () => {
    isResizingRef.current = true;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isResizingRef.current) return;
    const newWidth = e.clientX - (panelRef.current?.getBoundingClientRect().left || 0);
    if (newWidth >= minPanelWidth && newWidth <= maxPanelWidth) {
      setPanelWidth(newWidth);
    }
  };

  const handleMouseUp = () => {
    isResizingRef.current = false;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  };

  if (isMobile) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 overflow-y-auto glass-panel">
          {leftPanel}
        </div>

        <BottomDrawer
          isOpen={isDrawerOpen}
          onClose={onDrawerClose}
          height="full"
          showCloseButton={false}
          showDragHandle={false}
        >
          <div className={cn('min-h-full', mobileDrawerContentClassName)}>
            {rightPanel}
          </div>
        </BottomDrawer>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      <div
        ref={panelRef}
        className="glass-panel flex flex-col relative z-10 overflow-hidden bg-white/80"
        style={{ width: panelWidth }}
      >
        {leftPanel}

        <div
          className={cn(
            'absolute right-0 top-0 bottom-0 w-1 cursor-col-resize transition-colors group',
            resizerClassName
          )}
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

      <div className={cn('flex-1 overflow-y-auto relative z-0', rightPanelClassName)}>
        {rightPanel}
      </div>
    </div>
  );
}

