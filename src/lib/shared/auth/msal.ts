"use client";

import {
  PublicClientApplication,
  AuthenticationResult,
  InteractionRequiredAuthError,
} from "@azure/msal-browser";

import { getMsalConfig, silentLoginRequest } from './config';
import { logger } from '@/lib/shared/logger';
import { AzureUserInfo } from '@/types/azure';

// MSAL singleton
let msalInstance: PublicClientApplication | null = null;

export const initializeMsal = async (): Promise<PublicClientApplication> => {
  if (!msalInstance) {
    const config = getMsalConfig();
    msalInstance = new PublicClientApplication(config);
    await msalInstance.initialize();
  }
  return msalInstance;
};

export const handleRedirect = async (): Promise<AuthenticationResult | null> => {
  try {
    const msal = await initializeMsal();
    const response = await msal.handleRedirectPromise();
    return response;
  } catch (error: unknown) {
    logger.error('[Auth] Error handling redirect:', error);
    return null;
  }
};

export const hasMsalSession = async (): Promise<boolean> => {
  try {
    const msal = await initializeMsal();
    const activeAccount = msal.getActiveAccount();
    if (activeAccount) return true;
    const allAccounts = msal.getAllAccounts();
    if (allAccounts.length > 0) {
      msal.setActiveAccount(allAccounts[0]);
      return true;
    }
    return false;
  } catch (error: unknown) {
    logger.error('[Auth] Error checking MSAL session:', error);
    return false;
  }
};

export const getUserInfo = async (): Promise<AzureUserInfo | null> => {
  try {
    const msal = await initializeMsal();
    const activeAccount = msal.getActiveAccount();

    if (!activeAccount) {
      const allAccounts = msal.getAllAccounts();
      if (allAccounts.length === 0) return null;
      msal.setActiveAccount(allAccounts[0]);
    }

    try {
      const authResult = await msal.acquireTokenSilent(silentLoginRequest);
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
    const account = msal.getActiveAccount();
    if (!account) {
      const allAccounts = msal.getAllAccounts();
      if (allAccounts.length === 0) return false;
      msal.setActiveAccount(allAccounts[0]);
    }

    const response = await msal.acquireTokenSilent({
      ...silentLoginRequest,
      account: msal.getActiveAccount()!,
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
