import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'include', ...init });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// --- Telegram link status ---

export interface TelegramLinkStatus {
  linked: boolean;
  isActive?: boolean;
  username?: string | null;
  notificationChannel?: 'telegram' | 'teams' | 'both';
  linkedAt?: string | null;
}

export const telegramStatusQueryOptions = () =>
  queryOptions({
    queryKey: ['telegram-status'] as const,
    queryFn: () => fetchJson<TelegramLinkStatus>('/api/telegram/verify-code'),
    staleTime: 30_000,
  });

// --- Generate verification code ---

export function useGenerateVerifyCode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => fetchJson<{ code: string; expiresIn: number }>('/api/telegram/verify-code', { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['telegram-status'] }),
  });
}

// --- Unlink Telegram ---

export function useUnlinkTelegram() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => fetchJson<{ ok: boolean }>('/api/telegram/verify-code', { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['telegram-status'] }),
  });
}

// --- Permissions (chief only) ---

export interface TelegramToolInfo {
  name: string;
  label: string;
  description: string;
  supportedScopes: string[];
}

export interface TelegramPermission {
  id: string;
  role: string;
  tool_name: string;
  is_enabled: boolean;
  scope: string;
  updated_at: string;
}

export const telegramPermissionsQueryOptions = () =>
  queryOptions({
    queryKey: ['telegram-permissions'] as const,
    queryFn: () => fetchJson<{ permissions: TelegramPermission[]; tools: TelegramToolInfo[] }>('/api/telegram/permissions'),
    staleTime: 60_000,
  });

export function useUpdatePermission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { role: string; toolName: string; isEnabled?: boolean; scope?: string }) =>
      fetchJson<{ ok: boolean }>('/api/telegram/permissions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['telegram-permissions'] }),
  });
}

// --- Notification settings (chief only) ---

export interface TelegramNotificationSetting {
  event_type: string;
  is_enabled: boolean;
  label: string;
  updated_at: string;
}

export const telegramNotificationSettingsQueryOptions = () =>
  queryOptions({
    queryKey: ['telegram-notification-settings'] as const,
    queryFn: () =>
      fetchJson<{ settings: TelegramNotificationSetting[] }>('/api/telegram/notification-settings'),
    staleTime: 60_000,
  });

export function useUpdateNotificationSetting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { eventType: string; isEnabled: boolean }) =>
      fetchJson<{ ok: boolean }>('/api/telegram/notification-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['telegram-notification-settings'] }),
  });
}

// ─── Notification channel ──────────────────────────────────────────────────────

export function useUpdateNotificationChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (channel: 'telegram' | 'teams' | 'both') =>
      fetchJson<{ ok: boolean }>('/api/bot/notification-channel', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['telegram-status'] }),
  });
}

// ─── Teams link ────────────────────────────────────────────────────────────────

export interface TeamsLinkStatus {
  linked: boolean;
  linkedAt?: string | null;
}

export const teamsLinkStatusQueryOptions = () =>
  queryOptions({
    queryKey: ['teams-status'] as const,
    queryFn: () => fetchJson<TeamsLinkStatus>('/api/teams/link'),
    staleTime: 30_000,
  });

export function useLinkTeams() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => fetchJson<{ ok: boolean }>('/api/teams/link', { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['teams-status'] }),
  });
}

export function useUnlinkTeams() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => fetchJson<{ ok: boolean }>('/api/teams/link', { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['teams-status'] }),
  });
}
