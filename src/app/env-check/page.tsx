'use client';

import React from 'react';

export default function EnvCheckPage() {
  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Environment Variables Check</h1>
      <div className="space-y-2">
        <div>
          <span className="font-semibold">NEXT_PUBLIC_BASE_URL:</span>{' '}
          <span className="font-mono">{process.env.NEXT_PUBLIC_BASE_URL}</span>
        </div>
        <div>
          <span className="font-semibold">NEXT_PUBLIC_AZURE_AD_CLIENT_ID:</span>{' '}
          <span className="font-mono">{process.env.NEXT_PUBLIC_AZURE_AD_CLIENT_ID}</span>
        </div>
        <div>
          <span className="font-semibold">NEXT_PUBLIC_AZURE_AD_TENANT_ID:</span>{' '}
          <span className="font-mono">{process.env.NEXT_PUBLIC_AZURE_AD_TENANT_ID}</span>
        </div>
      </div>
    </div>
  );
} 