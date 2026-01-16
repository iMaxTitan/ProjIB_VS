import React, { useState, useRef, useEffect } from 'react';
import { UserInfo } from '@/types/azure';
import { logout } from '@/lib/auth';

interface DashboardHeaderProps {
  user: UserInfo;
  onLogout?: () => void; // Опциональный параметр
}

export default function DashboardHeader({ user, onLogout }: DashboardHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const avatarRef = useRef<HTMLButtonElement>(null);
  
  // Функция для получения инициалов пользователя (если нет фото)
  const getInitials = (name: string) => {
    if (!name) return '?';
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  // Получение фотографии пользователя (из Azure AD или Supabase)
  const getUserPhoto = () => {
    return user.photo || user.photo_base64 || null;
  };

  // Обработчик выхода из системы
  const handleLogout = async () => {
    try {
      await logout();
      // Если передан обработчик onLogout, вызываем его
      if (onLogout) {
        onLogout();
      } else {
        // Иначе просто перенаправляем на страницу логина
        window.location.href = '/login';
      }
    } catch (error) {
      console.error('Logout error:', error);
      window.location.href = '/login';
    }
  };
  
  // Обработчик клика вне меню для его закрытия
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        menuRef.current && 
        !menuRef.current.contains(event.target as Node) &&
        avatarRef.current && 
        !avatarRef.current.contains(event.target as Node)
      ) {
        setMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);
  
  // Обработчик ухода мыши с меню
  const handleMouseLeave = () => {
    setMenuOpen(false);
  };

  return (
    <header className="bg-gradient-to-r from-indigo-600 to-blue-500 shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-14">
          {/* Левая часть хедера */}
          <div className="flex items-center">
            <div className="flex items-center space-x-2">
              <div className="px-3 py-1.5 bg-indigo-400/60 rounded-full text-white text-xs font-medium">
                {user.role_disp || 'Пользователь'}
              </div>
              {user.department_name && (
                <div className="px-3 py-1.5 bg-indigo-400/60 rounded-full text-white text-xs font-medium">
                  {user.department_name}
                </div>
              )}
            </div>
          </div>
          
          {/* Правая часть хедера */}
          <div className="flex items-center">
            <div className="relative">
              <div className="flex items-center space-x-3">
                {/* Информация о пользователе */}
                <div className="hidden sm:flex flex-col items-end">
                  <span className="text-white text-sm font-medium">{user.displayName}</span>
                  {user.jobTitle && (
                    <span className="text-xs text-blue-100">{user.jobTitle}</span>
                  )}
                </div>
                
                {/* Аватар и выпадающее меню */}
                <div className="relative">
                  <button 
                    ref={avatarRef}
                    onClick={() => setMenuOpen(!menuOpen)}
                    className="p-0.5 bg-white/20 backdrop-blur-sm rounded-full hover:bg-white/30 transition-colors focus:outline-none focus:ring-2 focus:ring-white/50"
                  >
                    {getUserPhoto() ? (
                      <img 
                        src={getUserPhoto() as string} 
                        alt={user.displayName} 
                        className="h-8 w-8 rounded-full object-cover"
                      />
                    ) : (
                      <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-300 to-indigo-400 flex items-center justify-center text-white text-sm font-bold">
                        {getInitials(user.displayName)}
                      </div>
                    )}
                  </button>
                  
                  {/* Выпадающее меню */}
                  <div 
                    ref={menuRef}
                    onMouseLeave={handleMouseLeave}
                    className={`absolute right-0 w-48 mt-2 py-2 bg-white rounded-lg shadow-xl z-10 transform transition-all duration-200 ease-in-out ${menuOpen ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'}`}
                  >
                      <div className="px-4 py-2 border-b border-gray-100">
                        <p className="text-sm font-medium text-gray-700">{user.displayName}</p>
                        <p className="text-xs text-gray-500">{user.email}</p>
                      </div>
                      <button
                        onClick={() => {
                          setMenuOpen(false);
                          handleLogout();
                        }}
                        className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                      >
                        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                        </svg>
                        Выйти из системы
                      </button>
                    </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}