'use client';

import React from 'react';
import { UserInfo } from '@/types/azure';
import CompaniesInfrastructurePage from '@/components/infrastructure/CompaniesInfrastructurePage';

interface CompaniesContentProps {
  user: UserInfo;
}

export default function CompaniesContent({ user }: CompaniesContentProps) {
  return <CompaniesInfrastructurePage user={user} />;
}
