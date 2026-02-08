import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidth?: string;
  headerVariant?: 'simple' | 'gradient-indigo';
  headerActions?: React.ReactNode;
  showCloseButton?: boolean;
}

/**
 * Улучшенный компонент модального окна с accessibility
 */
export function Modal({
  isOpen,
  onClose,
  title,
  children,
  maxWidth = 'max-w-2xl',
  headerVariant = 'simple',
  headerActions,
  showCloseButton = true,
}: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);
  const hasSetInitialFocus = useRef(false);
  const onCloseRef = useRef(onClose);

  // Keep onClose ref updated
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Reset initial focus flag when modal closes
  useEffect(() => {
    if (!isOpen) {
      hasSetInitialFocus.current = false;
    }
  }, [isOpen]);

  // Focus trap и keyboard handling
  useEffect(() => {
    if (!isOpen) return;

    // Сохраняем предыдущий активный элемент
    previousActiveElement.current = document.activeElement as HTMLElement;

    // Блокируем скролл body
    document.body.style.overflow = 'hidden';

    // Фокус на модальное окно
    const modalElement = modalRef.current;
    if (modalElement) {
      const focusableElements = modalElement.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      const firstElement = focusableElements[0];

      // Устанавливаем фокус на первый элемент только при первом открытии
      if (!hasSetInitialFocus.current) {
        const firstInput = modalElement.querySelector<HTMLElement>('input, select, textarea');
        (firstInput || firstElement)?.focus();
        hasSetInitialFocus.current = true;
      }

      // Обработчик Tab для focus trap
      const handleTab = (e: KeyboardEvent) => {
        if (e.key !== 'Tab') return;

        const currentFocusable = modalElement.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const first = currentFocusable[0];
        const last = currentFocusable[currentFocusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last?.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first?.focus();
          }
        }
      };

      // Обработчик ESC
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          onCloseRef.current();
        }
      };

      modalElement.addEventListener('keydown', handleTab);
      document.addEventListener('keydown', handleEscape);

      return () => {
        modalElement.removeEventListener('keydown', handleTab);
        document.removeEventListener('keydown', handleEscape);
        document.body.style.overflow = 'unset';

        // Возвращаем фокус на предыдущий элемент
        previousActiveElement.current?.focus();
      };
    }

    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const isGradient = headerVariant === 'gradient-indigo';

  const modalContent = (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-modal-backdrop animate-fade-in px-4 py-4"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div
        ref={modalRef}
        className={`bg-white rounded-3xl w-full ${maxWidth} shadow-xl border border-gray-100 flex flex-col`}
        role="document"
      >
        <div
          className={
            isGradient
              ? 'bg-gradient-to-r from-indigo-400/80 to-blue-400/80 px-6 py-4 flex justify-between items-center shrink-0 rounded-t-3xl'
              : 'px-6 py-5 flex justify-between items-center border-b border-gray-100 shrink-0'
          }
        >
          <h2
            id="modal-title"
            className={
              isGradient ? 'text-lg font-bold text-white tracking-tight' : 'text-lg font-bold text-gray-800'
            }
          >
            {title}
          </h2>

          <div className="flex items-center gap-1">
            {headerActions}
            {showCloseButton && (
              <button
                type="button"
                onClick={onClose}
                className={
                  isGradient
                    ? 'p-2 rounded-xl bg-white/20 hover:bg-white/30 text-white transition-all backdrop-blur-sm'
                    : 'p-2 rounded-xl bg-gray-50 hover:bg-gray-100 text-gray-500 transition-all'
                }
                aria-label="Закрыть модальное окно"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>

        <div className="p-6">{children}</div>
      </div>
    </div>
  );

  // Use portal to render modal at document body level to avoid z-index/overflow issues
  if (typeof document !== 'undefined') {
    return createPortal(modalContent, document.body);
  }

  return modalContent;
}

interface ErrorAlertProps {
  message: string | null;
}

/**
 * Компонент отображения ошибки
 */
export function ErrorAlert({ message }: ErrorAlertProps) {
  if (!message) return null;

  return (
    <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded-lg mb-6 shadow-sm">
      <div className="flex">
        <div className="flex-shrink-0">
          <svg className="h-5 w-5 text-red-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
        </div>
        <div className="ml-3">
          <p className="text-sm">{message}</p>
        </div>
      </div>
    </div>
  );
}

interface ModalFooterProps {
  onCancel: () => void;
  loading: boolean;
  isEditMode: boolean;
  submitLabel?: string;
  editLabel?: string;
}

/**
 * Футер модального окна с кнопками Отмена/Сохранить
 */
export function ModalFooter({
  onCancel,
  loading,
  isEditMode,
  submitLabel = 'Сохранить',
  editLabel = 'Сохранить изменения',
}: ModalFooterProps) {
  return (
    <div className="flex justify-end space-x-3 mt-6">
      <button
        type="button"
        onClick={onCancel}
        className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium py-2.5 px-4 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-opacity-50 transition-all"
        disabled={loading}
      >
        Отмена
      </button>
      <button
        type="submit"
        className="bg-blue-500 hover:bg-blue-600 text-white font-medium py-2.5 px-4 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 transition-all shadow-sm"
        disabled={loading}
      >
        {loading ? (
          <span className="flex items-center">
            <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Сохранение...
          </span>
        ) : (
          isEditMode ? editLabel : submitLabel
        )}
      </button>
    </div>
  );
}

export default Modal;
