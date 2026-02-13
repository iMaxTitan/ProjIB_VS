'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BottomDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  /** Высота drawer: 'auto' - по контенту, 'half' - 50vh, 'full' - 90vh */
  height?: 'auto' | 'half' | 'full';
  /** Показывать кнопку закрытия */
  showCloseButton?: boolean;
  /** Показывать drag handle (полоску для свайпа). Если false - свайп за верхнюю часть контента */
  showDragHandle?: boolean;
}

const heightClasses = {
  auto: 'max-h-[85vh]',
  half: 'h-[50vh]',
  full: 'h-[92vh]',
};

/**
 * Мобильный Bottom Drawer компонент
 * - Выезжает снизу экрана с плавной анимацией
 * - Свайп вниз для закрытия (с momentum)
 * - Focus trap и ESC для закрытия
 * - Опциональный drag handle
 */
export function BottomDrawer({
  isOpen,
  onClose,
  title,
  children,
  height = 'auto',
  showCloseButton = true,
  showDragHandle = true,
}: BottomDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  // Состояния для анимации
  const [isVisible, setIsVisible] = useState(false);
  const [isAnimatingIn, setIsAnimatingIn] = useState(false);
  const [isAnimatingOut, setIsAnimatingOut] = useState(false);

  // Состояния для drag
  const [translateY, setTranslateY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartY = useRef(0);
  const dragStartScrollTop = useRef(0);
  const currentY = useRef(0);
  const velocityY = useRef(0);
  const lastY = useRef(0);
  const lastTime = useRef(0);
  const canDrag = useRef(false);

  // Зона для начала drag (верхняя часть drawer)
  const DRAG_ZONE_HEIGHT = 100;

  // Управление анимацией открытия/закрытия
  useEffect(() => {
    if (isOpen && !isVisible) {
      setIsVisible(true);
      setIsAnimatingOut(false);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setIsAnimatingIn(true);
        });
      });
    } else if (!isOpen && isVisible && !isAnimatingOut) {
      setIsAnimatingIn(false);
      setIsAnimatingOut(true);
    }
  }, [isOpen, isVisible, isAnimatingOut]);

  // Убираем из DOM после анимации закрытия
  useEffect(() => {
    if (isAnimatingOut) {
      const timer = setTimeout(() => {
        setIsVisible(false);
        setIsAnimatingOut(false);
        setTranslateY(0);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isAnimatingOut]);

  // Focus trap и keyboard handling
  useEffect(() => {
    if (!isVisible || isAnimatingOut) {
      return;
    }

    previousActiveElement.current = document.activeElement as HTMLElement;
    document.body.style.overflow = 'hidden';

    const drawerElement = drawerRef.current;
    if (drawerElement) {
      const focusableElements = drawerElement.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      setTimeout(() => firstElement?.focus(), 100);

      const handleTab = (e: KeyboardEvent) => {
        if (e.key !== 'Tab') return;

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement?.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement?.focus();
          }
        }
      };

      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          onClose();
        }
      };

      drawerElement.addEventListener('keydown', handleTab);
      document.addEventListener('keydown', handleEscape);

      return () => {
        drawerElement.removeEventListener('keydown', handleTab);
        document.removeEventListener('keydown', handleEscape);
        document.body.style.overflow = 'unset';
        previousActiveElement.current?.focus();
      };
    }

    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isVisible, isAnimatingOut, onClose]);

  // Плавное закрытие с анимацией
  const closeWithAnimation = useCallback(() => {
    setIsAnimatingIn(false);
    setIsAnimatingOut(true);
    setTimeout(() => {
      onClose();
    }, 250);
  }, [onClose]);

  // Определяем можно ли начать drag
  const checkCanDrag = useCallback((touchY: number) => {
    const drawer = drawerRef.current;
    const content = contentRef.current;
    if (!drawer) return false;

    const drawerRect = drawer.getBoundingClientRect();
    const touchRelativeY = touchY - drawerRect.top;

    // Если есть drag handle - drag только за него
    if (showDragHandle) {
      return touchRelativeY < 50; // Зона drag handle
    }

    // Без drag handle - drag за верхнюю часть ИЛИ когда контент прокручен наверх
    const isInDragZone = touchRelativeY < DRAG_ZONE_HEIGHT;
    const isScrolledToTop = !content || content.scrollTop <= 0;

    return isInDragZone || isScrolledToTop;
  }, [showDragHandle]);

  // Touch handlers для свайпа
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touchY = e.touches[0].clientY;
    canDrag.current = checkCanDrag(touchY);

    if (!canDrag.current) return;

    dragStartY.current = touchY;
    dragStartScrollTop.current = contentRef.current?.scrollTop || 0;
    lastY.current = touchY;
    lastTime.current = Date.now();
    currentY.current = 0;
    velocityY.current = 0;
    setIsDragging(true);
  }, [checkCanDrag]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging || !canDrag.current) return;

    const touchY = e.touches[0].clientY;
    const deltaY = touchY - dragStartY.current;
    const now = Date.now();
    const dt = now - lastTime.current;

    if (dt > 0) {
      velocityY.current = (touchY - lastY.current) / dt;
    }

    lastY.current = touchY;
    lastTime.current = now;

    // Только вниз с сопротивлением вверху
    if (deltaY > 0) {
      currentY.current = deltaY;
      setTranslateY(deltaY);
      // Предотвращаем скролл контента при drag
      e.preventDefault();
    } else {
      // Небольшое сопротивление вверх
      currentY.current = deltaY * 0.15;
      setTranslateY(deltaY * 0.15);
    }
  }, [isDragging]);

  const handleTouchEnd = useCallback(() => {
    if (!canDrag.current) {
      setIsDragging(false);
      return;
    }

    setIsDragging(false);

    const drawerHeight = drawerRef.current?.offsetHeight || 500;
    const threshold = drawerHeight * 0.2; // 20% высоты
    const velocityThreshold = 0.4; // px/ms

    if (currentY.current > threshold || velocityY.current > velocityThreshold) {
      setTranslateY(drawerHeight);
      closeWithAnimation();
    } else {
      setTranslateY(0);
    }
  }, [closeWithAnimation]);

  // Mouse handlers для десктопа
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!checkCanDrag(e.clientY)) return;

    dragStartY.current = e.clientY;
    lastY.current = e.clientY;
    lastTime.current = Date.now();
    currentY.current = 0;
    velocityY.current = 0;
    setIsDragging(true);

    const handleMouseMove = (e: MouseEvent) => {
      const deltaY = e.clientY - dragStartY.current;
      const now = Date.now();
      const dt = now - lastTime.current;

      if (dt > 0) {
        velocityY.current = (e.clientY - lastY.current) / dt;
      }

      lastY.current = e.clientY;
      lastTime.current = now;

      if (deltaY > 0) {
        currentY.current = deltaY;
        setTranslateY(deltaY);
      } else {
        currentY.current = deltaY * 0.15;
        setTranslateY(deltaY * 0.15);
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);

      const drawerHeight = drawerRef.current?.offsetHeight || 500;
      const threshold = drawerHeight * 0.2;
      const velocityThreshold = 0.4;

      if (currentY.current > threshold || velocityY.current > velocityThreshold) {
        setTranslateY(drawerHeight);
        closeWithAnimation();
      } else {
        setTranslateY(0);
      }

      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [checkCanDrag, closeWithAnimation]);

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      closeWithAnimation();
    }
  };

  if (!isVisible) return null;

  const drawerHeight = drawerRef.current?.offsetHeight || 500;
  const backdropOpacity = isDragging
    ? Math.max(0, 1 - (translateY / drawerHeight))
    : isAnimatingIn ? 1 : 0;

  // Режим без drag handle - прозрачный контейнер, контент занимает всё
  const isNakedMode = !showDragHandle && !title && !showCloseButton;

  return (
    <div
      className={cn(
        "fixed inset-0 z-modal-backdrop",
        "transition-[background-color,backdrop-filter] duration-300 ease-out"
      )}
      style={{
        backgroundColor: `rgba(0, 0, 0, ${backdropOpacity * 0.5})`,
        backdropFilter: `blur(${backdropOpacity * 4}px)`,
      }}
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? 'drawer-title' : undefined}
    >
      <div
        ref={drawerRef}
        className={cn(
          "fixed bottom-0 left-0 right-0",
          heightClasses[height],
          "overflow-hidden flex flex-col",
          isDragging
            ? "transition-none"
            : "transition-transform duration-300 ease-drawer",
          // Стили в зависимости от режима
          isNakedMode
            ? "bg-transparent"
            : "bg-white rounded-t-2xl shadow-2xl border-t border-gray-100"
        )}
        style={{
          transform: isAnimatingOut && !isDragging
            ? 'translateY(100%)'
            : isAnimatingIn || isDragging
              ? `translateY(${translateY}px)`
              : 'translateY(100%)',
        }}
        role="document"
        onTouchStart={!showDragHandle ? handleTouchStart : undefined}
        onTouchMove={!showDragHandle ? handleTouchMove : undefined}
        onTouchEnd={!showDragHandle ? handleTouchEnd : undefined}
        onMouseDown={!showDragHandle ? handleMouseDown : undefined}
      >
        {/* Drag Handle - только если включен */}
        {showDragHandle && (
          <div
            className="flex justify-center pt-3 pb-2 cursor-grab active:cursor-grabbing touch-none select-none"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onMouseDown={handleMouseDown}
            aria-label="Потяните вниз для закрытия"
          >
            <div className={cn(
              "w-10 h-1 rounded-full transition-[transform,opacity] duration-200",
              isDragging ? "w-14 bg-gray-400" : "bg-gray-300"
            )} />
          </div>
        )}

        {/* Header - только если есть title или closeButton */}
        {(title || showCloseButton) && showDragHandle && (
          <div className="flex justify-between items-center px-4 pb-3 border-b border-gray-100">
            {title && (
              <h2
                id="drawer-title"
                className="text-lg font-semibold text-gray-800"
              >
                {title}
              </h2>
            )}
            {showCloseButton && (
              <button
                type="button"
                onClick={closeWithAnimation}
                className="p-2 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors duration-base focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 active:scale-95 ml-auto"
                aria-label="Закрыть"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            )}
          </div>
        )}

        {/* Content */}
        <div
          ref={contentRef}
          className={cn(
            "flex-1 overflow-y-auto overscroll-contain",
            isNakedMode ? "" : "p-4"
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

export default BottomDrawer;
