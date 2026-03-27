'use client';

import LoginForm from './LoginForm';
import LoginHeader from './LoginHeader';
import LoginContainer from './LoginContainer';
import { Spinner } from '@/components/ui/Spinner';

interface LoginPageContentProps {
  isLoading: boolean;
  error: string | null;
  onLogin: () => Promise<boolean | void>;
  showLoginButton?: boolean;
}

export default function LoginPageContent({ isLoading, error, onLogin, showLoginButton }: LoginPageContentProps) {
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <LoginContainer>
      <LoginHeader />
      <LoginForm onLogin={onLogin} error={error} showLoginButton={showLoginButton} />
    </LoginContainer>
  );
}