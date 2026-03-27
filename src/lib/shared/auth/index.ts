"use client";

/**
 * Auth module — barrel re-export.
 * Split into focused modules:
 *   msal.ts    — MSAL singleton, token acquisition, getUserInfo, refreshAuthCookie
 *   session.ts — user cache, setAuthStatusCookie, getCurrentUser, syncServerAuthToken, logout
 *   use-auth.ts — useAuth hook
 */
export * from './msal';
export * from './session';
export * from './use-auth';
