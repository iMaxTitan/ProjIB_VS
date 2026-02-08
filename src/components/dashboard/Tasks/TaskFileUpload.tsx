import React, { useState, useRef, useCallback } from 'react';
import { Upload, FileText, X, Loader2, CheckCircle, AlertCircle, Sparkles } from 'lucide-react';
import { GraphSharePointService } from '@/services/graph';
import { getErrorMessage } from '@/lib/utils/error-message';
import logger from '@/lib/logger';

interface TaskFileUploadProps {
  documentNumber?: string;
  taskId?: string;
  completedAt?: string;
  onUploadComplete: (webUrl: string) => void;
  onTextExtracted?: (text: string) => void;
  onDocumentNumberExtracted?: (number: string) => void; // Автозаполнение номера СЗ
  currentUrl?: string;
  disabled?: boolean;
}

type UploadStatus = 'idle' | 'uploading' | 'extracting' | 'success' | 'error';

// Извлечь номер СЗ из текста документа
const extractDocumentNumberFromText = (text: string): string | null => {
  // Форматы номеров СЗ:
  // "Регистрационный № 123/2026", "Регистрационный №123"
  // "СЗ-123/2026", "СЗ №123", "№ СЗ-123"
  const patterns = [
    /Регистрацион(?:ный|ний)\s*№\s*:?\s*([^\n\r,;]+)/i,
    /СЗ[-\s]*№?\s*:?\s*([^\n\r,;]+)/i,
    /№\s*СЗ[-\s]*:?\s*([^\n\r,;]+)/i,
    /Служебн(?:ая|а)\s+записк(?:а|а)\s*№?\s*:?\s*([^\n\r,;]+)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      // Очищаем от лишних пробелов и двоеточий в начале
      let result = match[1].trim();
      result = result.replace(/^[:\s]+/, ''); // Убираем : и пробелы в начале
      return result.substring(0, 50); // Ограничиваем длину
    }
  }
  return null;
};

const TaskFileUpload: React.FC<TaskFileUploadProps> = ({
  documentNumber,
  taskId,
  completedAt,
  onUploadComplete,
  onTextExtracted,
  onDocumentNumberExtracted,
  currentUrl,
  disabled = false,
}) => {
  const [status, setStatus] = useState<UploadStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [extractedText, setExtractedText] = useState<string | null>(null);
  const [extractionFailed, setExtractionFailed] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setError(null);
    setExtractedText(null);
    setExtractionFailed(false);

    // Проверяем тип файла
    const isDocx = file.name.toLowerCase().endsWith('.docx');
    const isDoc = file.name.toLowerCase().endsWith('.doc');
    const isPdf = file.name.toLowerCase().endsWith('.pdf');

    if (!isDocx && !isDoc && !isPdf) {
      // Разрешаем любые файлы, но предупреждаем
      logger.warn('[FileUpload] Файл не Word/PDF, извлечение текста недоступно');
    }

    // Номер СЗ для папки: сначала из props, потом пробуем извлечь из текста
    let folderDocNumber = documentNumber;

    try {
      // Шаг 1: извлекаем текст из DOCX (если это Word)
      if (isDocx && onTextExtracted) {
        setStatus('extracting');
        logger.log('[FileUpload] Начинаем извлечение текста из:', file.name);
        try {
          const text = await GraphSharePointService.extractTextFromFile(file);
          logger.log('[FileUpload] Результат извлечения:', text ? `${text.length} символов` : 'пусто');
          if (text && text.length > 0) {
            setExtractedText(text);
            onTextExtracted(text);

            // Автоматически извлекаем номер СЗ из текста
            const docNum = extractDocumentNumberFromText(text);
            if (docNum) {
              logger.log('[FileUpload] Найден номер СЗ:', docNum);
              // Используем извлеченный номер для папки
              folderDocNumber = docNum;
              // Уведомляем родительский компонент
              if (onDocumentNumberExtracted) {
                onDocumentNumberExtracted(docNum);
              }
            }
          } else {
            logger.warn('[FileUpload] Текст не извлечен или пустой');
            setExtractionFailed(true);
          }
        } catch (extractError: unknown) {
          logger.error('[FileUpload] Ошибка извлечения текста:', extractError);
          setExtractionFailed(true);
          // Продолжаем загрузку, даже если извлечение не удалось
        }
      } else if (isDoc) {
        // Старый формат .doc не поддерживается
        setExtractionFailed(true);
        logger.warn('[FileUpload] Формат .doc не поддерживает извлечение текста');
      }

      // Шаг 2: загружаем файл в SharePoint (используем извлеченный номер СЗ)
      setStatus('uploading');

      const date = completedAt ? new Date(completedAt) : new Date();
      logger.log('[FileUpload] Загрузка в папку с номером:', folderDocNumber || 'без_номера');
      const result = await GraphSharePointService.uploadTaskAttachment(
        file,
        folderDocNumber,  // Используем извлеченный номер, а не props
        taskId,
        date
      );

      if (result.success && result.webUrl) {
        setStatus('success');
        onUploadComplete(result.webUrl);
      } else {
        setStatus('error');
        setError(result.error || 'Ошибка загрузки файла');
      }
    } catch (err: unknown) {
      setStatus('error');
      setError(getErrorMessage(err) || 'Ошибка при обработке файла');
    }

    // Очищаем input для повторной загрузки того же файла
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [documentNumber, taskId, completedAt, onUploadComplete, onTextExtracted]);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    const file = e.dataTransfer.files?.[0];
    if (file && fileInputRef.current) {
      const dt = new DataTransfer();
      dt.items.add(file);
      fileInputRef.current.files = dt.files;
      fileInputRef.current.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const clearFile = useCallback(() => {
    setStatus('idle');
    setFileName(null);
    setError(null);
    setExtractedText(null);
    setExtractionFailed(false);
    onUploadComplete('');
  }, [onUploadComplete]);

  const renderStatus = () => {
    switch (status) {
      case 'extracting':
        return (
          <div className="flex items-center gap-2 text-indigo-600">
            <Sparkles className="w-4 h-4 animate-pulse" />
            <span className="text-sm">Извлечение текста...</span>
          </div>
        );
      case 'uploading':
        return (
          <div className="flex items-center gap-2 text-indigo-600">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Загрузка в SharePoint...</span>
          </div>
        );
      case 'success':
        return (
          <div className="flex items-center gap-2 text-green-600">
            <CheckCircle className="w-4 h-4" />
            <span className="text-sm">Файл загружен</span>
          </div>
        );
      case 'error':
        return (
          <div className="flex items-center gap-2 text-red-600">
            <AlertCircle className="w-4 h-4" />
            <span className="text-sm">{error}</span>
          </div>
        );
      default:
        return null;
    }
  };

  // Извлечь имя файла из SharePoint URL
  const extractFileNameFromUrl = (url: string): string => {
    try {
      const urlObj = new URL(url);
      // SharePoint URL: ...Doc.aspx?sourcedoc=...&file=FileName.docx&...
      const fileParam = urlObj.searchParams.get('file');
      if (fileParam) {
        return decodeURIComponent(fileParam);
      }
      // Fallback: последний сегмент пути
      const pathName = urlObj.pathname.split('/').pop() || '';
      if (pathName && !pathName.includes('.aspx')) {
        return decodeURIComponent(pathName);
      }
    } catch {
      // Если не удалось распарсить URL
    }
    return 'Прикрепленный файл';
  };

  // Если уже есть URL файла
  if (currentUrl && status === 'idle') {
    // Используем сохраненное имя или извлекаем из URL
    const displayName = fileName || extractFileNameFromUrl(currentUrl);

    return (
      <div className="border border-gray-200 rounded-lg p-3 bg-gray-50">
        <div className="flex items-center justify-between">
          <a
            href={currentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-indigo-600 hover:text-indigo-800 text-sm"
          >
            <FileText className="w-4 h-4" />
            <span className="underline truncate max-w-[200px]">
              {displayName}
            </span>
          </a>
          {!disabled && (
            <button
              type="button"
              onClick={clearFile}
              className="text-gray-400 hover:text-red-500 p-1"
              title="Удалить вложение"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Зона загрузки */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        className={`
          border-2 border-dashed rounded-lg p-4 text-center transition-colors
          ${disabled ? 'border-gray-200 bg-gray-50 cursor-not-allowed' : 'border-gray-300 hover:border-indigo-400 cursor-pointer'}
          ${status === 'uploading' || status === 'extracting' ? 'border-indigo-400 bg-indigo-50' : ''}
        `}
        onClick={() => !disabled && fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".docx,.doc,.pdf,.xlsx,.xls,.txt"
          onChange={handleFileSelect}
          disabled={disabled || status === 'uploading' || status === 'extracting'}
          className="hidden"
        />

        {status === 'idle' ? (
          <div className="space-y-2">
            <Upload className={`w-8 h-8 mx-auto ${disabled ? 'text-gray-300' : 'text-gray-400'}`} />
            <div className={`text-sm ${disabled ? 'text-gray-400' : 'text-gray-600'}`}>
              <span className="font-medium">Нажмите</span> или перетащите файл
            </div>
            <div className="text-xs text-gray-400">
              Word, PDF, Excel (до 250MB)
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {fileName && (
              <div className="flex items-center justify-center gap-2 text-gray-700">
                <FileText className="w-5 h-5" />
                <span className="text-sm font-medium truncate max-w-[200px]">{fileName}</span>
              </div>
            )}
            {renderStatus()}
          </div>
        )}
      </div>

      {/* Превью извлеченного текста */}
      {extractedText && status === 'success' && (
        <div className="border border-indigo-200 rounded-lg p-3 bg-indigo-50">
          <div className="flex items-center gap-2 mb-2 text-indigo-700">
            <Sparkles className="w-4 h-4" />
            <span className="text-sm font-medium">Извлеченный текст:</span>
          </div>
          <div className="text-xs text-gray-600 max-h-24 overflow-y-auto whitespace-pre-wrap">
            {extractedText.substring(0, 500)}
            {extractedText.length > 500 && '...'}
          </div>
        </div>
      )}

      {/* Сообщение, если извлечение не удалось */}
      {extractionFailed && status === 'success' && !extractedText && (
        <div className="border border-amber-200 rounded-lg p-3 bg-amber-50">
          <div className="flex items-center gap-2 text-amber-700">
            <AlertCircle className="w-4 h-4" />
            <span className="text-xs">
              Не удалось извлечь текст. Возможно, файл в формате .doc (используйте .docx) или защищен.
            </span>
          </div>
        </div>
      )}

      {/* Кнопка очистки при ошибке */}
      {status === 'error' && (
        <button
          type="button"
          onClick={clearFile}
          className="text-sm text-gray-500 hover:text-gray-700 underline"
        >
          Попробовать снова
        </button>
      )}
    </div>
  );
};

export default TaskFileUpload;


