'use client';

import { cn } from '@/lib/shared/utils';
import Image from 'next/image';

const AVATAR_COLORS = [
  'bg-indigo-500', 'bg-purple-500', 'bg-cyan-500',
  'bg-emerald-500', 'bg-amber-500', 'bg-blue-500',
  'bg-rose-500', 'bg-teal-500',
];

export function avatarColor(idx: number): string {
  return AVATAR_COLORS[idx % AVATAR_COLORS.length];
}

export function getInitials(name: string): string {
  return name.split(' ').map(w => w[0] || '').slice(0, 2).join('').toUpperCase();
}

interface UserAvatarProps {
  name: string;
  photo?: string;
  initials?: string;
  idx: number;
  size?: 'sm' | 'md';
}

export function UserAvatar({ name, photo, initials, idx, size = 'md' }: UserAvatarProps) {
  const sizeClass = size === 'sm' ? 'w-6 h-6 text-[9px]' : 'w-7 h-7 text-[10px]';
  const imgSize = size === 'sm' ? 24 : 28;
  const displayInitials = initials || getInitials(name);

  if (photo) {
    return (
      <Image src={photo} alt={name} width={imgSize} height={imgSize}
        className="rounded-full flex-shrink-0 object-cover" unoptimized />
    );
  }
  return (
    <div className={cn('rounded-full flex items-center justify-center font-bold text-white flex-shrink-0', sizeClass, avatarColor(idx))}>
      {displayInitials}
    </div>
  );
}
