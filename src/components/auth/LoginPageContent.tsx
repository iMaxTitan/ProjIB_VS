'use client';

import LoginForm from './LoginForm';
import LoginHeader from './LoginHeader';
import LoginContainer from './LoginContainer';

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
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
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