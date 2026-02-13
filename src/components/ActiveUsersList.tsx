'use client';

import React from 'react';
import Image from 'next/image';
import { PresenceUser } from '@/hooks/usePresence';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

interface ActiveUsersListProps {
    users: PresenceUser[];
    currentUserId?: string;
    maxDisplay?: number;
}

/**
 * Компонент для отображения списка активных пользователей.
 * Показывает только аватарки других пользователей (с наложением).
 */
export default function ActiveUsersList({ users, currentUserId, maxDisplay = 8 }: ActiveUsersListProps) {
    // Фильтруем текущего пользователя, чтобы не дублировать его (его аватар уже справа в хедере)
    const otherUsers = users.filter(u => {
        const uid = String(u.user_id).trim();
        const cid = String(currentUserId).trim();
        return uid !== cid;
    });

    if (otherUsers.length === 0) return null;

    const displayUsers = otherUsers.slice(0, maxDisplay);
    const remainingCount = Math.max(0, otherUsers.length - maxDisplay);

    const getInitials = (name: string) => {
        if (!name) return '?';
        const parts = name.trim().split(' ');
        if (parts.length >= 2) {
            return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
        }
        return name.substring(0, 2).toUpperCase();
    };

    return (
        <div className="flex items-center space-x-1 group">
            {/* Группа аватарок */}
            <div className="flex -space-x-2 overflow-hidden p-0.5">
                <AnimatePresence mode="popLayout">
                    {displayUsers.map((user) => (
                        <motion.div
                            key={user.user_id}
                            layout
                            initial={{ opacity: 0, scale: 0.8, x: -10 }}
                            animate={{ opacity: 1, scale: 1, x: 0 }}
                            exit={{ opacity: 0, scale: 0.5, x: 10 }}
                            className="relative"
                            title={user.displayName}
                        >
                            <div className={cn(
                                "h-7 w-7 rounded-full border-2 border-indigo-400 bg-white overflow-hidden flex items-center justify-center transition-[transform,border-color] duration-300 hover:scale-125 hover:z-30 hover:border-white shadow-sm cursor-default"
                            )}>
                                {user.photo_base64 ? (
                                    <>
                                        <Image
                                            src={user.photo_base64}
                                            alt={user.displayName}
                                            width={28}
                                            height={28}
                                            unoptimized
                                            className="h-full w-full object-cover peer"
                                            onError={(e) => {
                                                const img = e.target as HTMLImageElement;
                                                img.style.display = 'none';
                                                const fallback = img.nextElementSibling as HTMLElement;
                                                if (fallback) fallback.style.display = 'flex';
                                            }}
                                        />
                                        <div className="hidden h-full w-full bg-gradient-to-br from-indigo-100 to-blue-200 items-center justify-center text-indigo-700 text-[10px] font-bold">
                                            {getInitials(user.displayName)}
                                        </div>
                                    </>
                                ) : (
                                    <div className="h-full w-full bg-gradient-to-br from-indigo-100 to-blue-200 flex items-center justify-center text-indigo-700 text-[10px] font-bold">
                                        {getInitials(user.displayName)}
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>

                {remainingCount > 0 && (
                    <div className="relative z-10">
                        <div className="h-7 w-7 rounded-full border-2 border-indigo-400 bg-indigo-500 flex items-center justify-center text-white text-[9px] font-bold shadow-sm">
                            +{remainingCount}
                        </div>
                    </div>
                )}
            </div>

            {/* Минималистичный индикатор (только пульс) */}
            <div className="flex items-center justify-center h-4 w-4 bg-white/10 rounded-full border border-white/20">
                <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500"></span>
                </span>
            </div>
        </div>
    );
}
