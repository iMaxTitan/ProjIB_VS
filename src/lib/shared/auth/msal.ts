"use client";

import {
  PublicClientApplication,
  InteractionRequiredAuthError,
} from "@azure/msal-browser";

import { getMsalConfig, silentLoginRequest } from './config';
import { logger } from '@/lib/shared/logger';
import { AzureUserInfo } from '@/types/azure';

// Lazy-initialized PCA singleton (SSR-safe: only created when window exists)
let _msalInstance: PublicClientApplication | null = null;
let _msalInitPromise: Promise<void> | null = null;

function ensureMsal(): { instance: PublicClientApplication; initPromise: Promise<void> } {
  if (!_msalInstance) {
    _msalInstance = new PublicClientApplication(getMsalConfig());
    _msalInitPromise = _msalInstance.initialize();
  }
  return { instance: _msalInstance, initPromise: _msalInitPromise! };
}

/** PCA singleton — lazy-created on first access (SSR-safe) */
export function getMsalInstance(): PublicClientApplication {
  return ensureMsal().instance;
}

/** Resolves when PCA is initialized */
export function getMsalInitPromise(): Promise<void> {
  return ensureMsal().initPromise;
}

// Convenience aliases for backward compat
export const initializeMsal = async (): Promise<PublicClientApplication> => {
  const { instance, initPromise } = ensureMsal();
  await initPromise;
  return instance;
};

export const hasMsalSession = async (): Promise<boolean> => {
  const msal = await initializeMsal();
  const activeAccount = msal.getActiveAccount();
  if (activeAccount) return true;
  const allAccounts = msal.getAllAccounts();
  if (allAccounts.length > 0) {
    msal.setActiveAccount(allAccounts[0]);
    return true;
  }
  return false;
};

export const getUserInfo = async (): Promise<AzureUserInfo | null> => {
  try {
    const msal = await initializeMsal();

    let activeAccount = msal.getActiveAccount();
    if (!activeAccount) {
      const allAccounts = msal.getAllAccounts();
      if (allAccounts.length === 0) return null;
      msal.setActiveAccount(allAccounts[0]);
      activeAccount = allAccounts[0];
    }

    try {
      const authResult = await msal.acquireTokenSilent({
        ...silentLoginRequest,
        account: activeAccount,
      });
      const account = authResult.account;
      if (!account || !account.username) return null;
      return {
        id: account.localAccountId || account.homeAccountId,
        email: account.username.toLowerCase(),
        name: account.name || '',
        displayName: account.name || '',
        accessToken: authResult.accessToken
      };
    } catch (error: unknown) {
      if (error instanceof InteractionRequiredAuthError) return null;
      throw error;
    }
  } catch (error: unknown) {
    logger.error('[Auth] Error getting Azure user info:', error);
    return null;
  }
};

export async function refreshAuthCookie(): Promise<boolean> {
  try {
    const msal = await initializeMsal();
    let account = msal.getActiveAccount();
    if (!account) {
      const allAccounts = msal.getAllAccounts();
      if (allAccounts.length === 0) return false;
      msal.setActiveAccount(allAccounts[0]);
      account = allAccounts[0];
    }

    const response = await msal.acquireTokenSilent({
      ...silentLoginRequest,
      account,
    });

    if (!response?.accessToken) return false;
    const { syncServerAuthToken } = await import('./session');
    const result = await syncServerAuthToken(response.accessToken, response.account?.username?.toLowerCase());
    return result.ok;
  } catch (error: unknown) {
    logger.error('[Auth] refreshAuthCookie failed:', error);
    return false;
  }
}
