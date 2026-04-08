'use client';

import React, { useEffect, useState, type ReactNode } from 'react';
import { MsalProvider } from '@azure/msal-react';
import { getMsalInstance, getMsalInitPromise } from '@/lib/shared/auth/msal';

/**
 * Single MsalProvider wrapper for the entire app.
 * PCA is lazy-created on first client-side access (SSR-safe).
 * Waits for MSAL initialization before rendering children.
 */
export default function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    getMsalInitPromise().then(() => setReady(true));
  }, []);

  if (!ready) return null;

  return (
    <MsalProvider instance={getMsalInstance()}>
      {children}
    </MsalProvider>
  );
}
