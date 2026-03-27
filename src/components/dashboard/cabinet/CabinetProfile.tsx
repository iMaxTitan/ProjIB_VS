'use client';

import React from 'react';
import Image from 'next/image';
import { User, Briefcase, Clock4, Mail, Building2 } from 'lucide-react';
import { DetailSection } from '@/components/dashboard/shared';
import type { CabinetStats } from '@/lib/ops/cabinet/stats';

interface CabinetProfileProps {
  profile: CabinetStats['profile'];
}

const ROLE_LABELS: Record<string, string> = {
  chief: 'Керівник',
  head: 'Начальник відділу',
  employee: 'Співробітник',
};

function getInitials(name: string): string {
  if (!name) return '?';
  const parts = name.split(' ');
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return name.substring(0, 2).toUpperCase();
}

export default function CabinetProfile({ profile }: CabinetProfileProps) {
  return (
    <DetailSection title="Мій профіль" colorScheme="indigo" titleIcon={<User />}>
      <div className="p-3 bg-white/60 rounded-xl border border-slate-100">
        {/* Avatar + Name */}
        <div className="flex items-center gap-3 mb-4">
          {profile.photo_base64 ? (
            <Image
              src={profile.photo_base64}
              alt=""
              width={48}
              height={48}
              unoptimized
              className="h-12 w-12 rounded-full object-cover flex-shrink-0"
            />
          ) : (
            <div className="h-12 w-12 rounded-full bg-gradient-to-br from-blue-300 to-indigo-400 flex items-center justify-center text-white text-base font-bold flex-shrink-0">
              {getInitials(profile.full_name)}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-800 truncate">{profile.full_name}</p>
            <p className="text-xs text-slate-500">{ROLE_LABELS[profile.role] || profile.role}</p>
          </div>
        </div>

        {/* Details */}
        <div className="space-y-2.5">
          {profile.position && (
            <ProfileRow icon={Briefcase} label="Посада" value={profile.position} />
          )}
          {profile.department_name && (
            <ProfileRow icon={Building2} label="Відділ" value={profile.department_name} />
          )}
          {profile.work_rate != null && (
            <ProfileRow
              icon={Clock4}
              label="Ставка"
              value={profile.work_rate === 1 ? '1.0 (повна)' : `${profile.work_rate} (${Math.round(profile.work_rate * 100)}%)`}
            />
          )}
          {profile.email && (
            <ProfileRow icon={Mail} label="Email" value={profile.email} />
          )}
        </div>
      </div>
    </DetailSection>
  );
}

function ProfileRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <Icon className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" aria-hidden="true" />
      <span className="text-xs text-slate-500 w-14 flex-shrink-0">{label}</span>
      <span className="text-sm text-slate-700 truncate">{value}</span>
    </div>
  );
}
