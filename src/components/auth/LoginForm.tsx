/**
 * LoginForm компонент для авторизации через Microsoft.
 * 
 * @param {LoginFormProps} props - Свойства компонента.
 * @param {function} props.onLogin - Функция для входа в систему.
 * @param {string|null} props.error - Сообщение об ошибке.
 * @param {boolean} props.showLoginButton - Показывать кнопку входа.
 * @returns {JSX.Element} Компонент авторизации.
 */
import { useState } from 'react'; 
import { Button } from '../ui/Button';
import { getErrorMessage } from '@/lib/utils/error-message';
import logger from '@/lib/logger';

/**
 * Свойства компонента LoginForm.
 */
interface LoginFormProps {
  onLogin: () => Promise<boolean | void>;
  error: string | null;
  showLoginButton?: boolean;
}

/**
 * Компонент LoginForm отображает кнопку входа и сообщение об ошибке.
 */
export default function LoginForm({
  onLogin,
  error,
  showLoginButton = true,
}: LoginFormProps) {
  // Состояние для отслеживания загрузки именно при клике на кнопку
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const handleLoginClick = async () => {
    setIsLoggingIn(true);
    try {
      await onLogin(); // Вызываем переданную функцию
      // Не нужно вручную перенаправлять, это сделает родительский компонент
    } catch (loginError: unknown) {
      // Ошибку теперь обрабатывает useAuth, здесь просто сбрасываем флаг загрузки
      logger.error('Ошибка при попытке входа (LoginForm):', getErrorMessage(loginError));
    } finally {
      setIsLoggingIn(false);
    }
  };

  return (
    <div className="space-y-4">
      {error && (
        <div
          className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative"
          role="alert"
        >
          <strong className="font-bold">Ошибка!</strong>
          <span className="block sm:inline"> {error}</span>
        </div>
      )}
      {showLoginButton && ( // Условный рендеринг кнопки
        <Button
          variant="primary"
          onClick={handleLoginClick}
          disabled={isLoggingIn} // Блокируем кнопку во время попытки входа
          className="w-full"
        >
          {isLoggingIn ? 'Вход...' : 'Войти через Microsoft'}
        </Button>
      )}
    </div>
  );
}

