import { ReactNode } from 'react';

interface LoginContainerProps {
  children: ReactNode;
}

export default function LoginContainer({ children }: LoginContainerProps) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-lg shadow-lg">
        {children}
      </div>
    </div>
  );
} 