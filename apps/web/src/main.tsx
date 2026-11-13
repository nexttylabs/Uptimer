import { QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';

import { AuthProvider } from './app/AuthContext';
import { I18nProvider } from './app/I18nContext';
import { queryClient } from './app/queryClient';
import { router } from './app/router';
import { homepageFromStatus } from './app/statusPageTheme';
import { ThemeProvider } from './app/ThemeContext';
import type { PublicHomepageResponse, StatusResponse } from './api/types';
import './styles.css';

declare global {
  var __UPTIMER_INITIAL_HOMEPAGE__: PublicHomepageResponse | undefined;
  var __UPTIMER_INITIAL_STATUS__: StatusResponse | undefined;
  var __UPTIMER_STATUS_PAGE_SLUG__: string | undefined;
}

const LS_PUBLIC_HOMEPAGE_KEY = 'uptimer_public_homepage_snapshot_v2';
const LS_PUBLIC_STATUS_KEY = 'uptimer_public_status_snapshot_v1';

type PersistedHomepageCache = {
  at: number;
  value: PublicHomepageResponse;
};

function readPersistedHomepageCache(): PublicHomepageResponse | null {
  try {
    const raw = localStorage.getItem(LS_PUBLIC_HOMEPAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;

    const value = (parsed as { value?: unknown }).value;
    if (!value || typeof value !== 'object') return null;
    if (typeof (value as { generated_at?: unknown }).generated_at !== 'number') return null;
    return value as PublicHomepageResponse;
  } catch {
    return null;
  }
}

function readPersistedStatusCache(): StatusResponse | null {
  try {
    const raw = localStorage.getItem(LS_PUBLIC_STATUS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;

    const value = (parsed as { value?: unknown }).value;
    if (!value || typeof value !== 'object') return null;

    // Minimal shape check.
    if (typeof (value as { generated_at?: unknown }).generated_at !== 'number') return null;

    return value as StatusResponse;
  } catch {
    return null;
  }
}

function writePersistedHomepageCache(value: PublicHomepageResponse): void {
  try {
    const payload: PersistedHomepageCache = { at: Date.now(), value };
    localStorage.setItem(LS_PUBLIC_HOMEPAGE_KEY, JSON.stringify(payload));
  } catch {
    // Best-effort only.
  }
}

const initialHomepage =
  globalThis.__UPTIMER_INITIAL_HOMEPAGE__ ??
  (globalThis.__UPTIMER_INITIAL_STATUS__
    ? homepageFromStatus(globalThis.__UPTIMER_INITIAL_STATUS__)
    : undefined);
const migratedPersistedStatus = initialHomepage ? null : readPersistedStatusCache();
const persistedHomepage = initialHomepage
  ? null
  : readPersistedHomepageCache() ??
    (migratedPersistedStatus ? homepageFromStatus(migratedPersistedStatus) : null);
const seedHomepage = initialHomepage ?? persistedHomepage;

if (seedHomepage) {
  const updatedAt =
    typeof seedHomepage.generated_at === 'number' ? seedHomepage.generated_at * 1000 : Date.now();

  // Custom-domain root: seed the slug-qualified query key so the SPA reuses
  // the same cache/API path as /status/:slug.
  const bootstrapSlug =
    typeof globalThis.__UPTIMER_STATUS_PAGE_SLUG__ === 'string'
      ? globalThis.__UPTIMER_STATUS_PAGE_SLUG__
      : undefined;
  const seedKey = bootstrapSlug ? ['homepage', bootstrapSlug] : ['homepage'];
  queryClient.setQueryData<PublicHomepageResponse>(seedKey, seedHomepage, { updatedAt });
  writePersistedHomepageCache(seedHomepage);
}

function PreloadCleanup() {
  // Remove the server-rendered preload right before the first paint with React,
  // avoiding a flash of duplicated content.
  React.useLayoutEffect(() => {
    document.getElementById('uptimer-preload')?.remove();
  }, []);

  return null;
}

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Missing #root element');

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <I18nProvider>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <PreloadCleanup />
            <RouterProvider
              router={router}
              fallbackElement={<div className="min-h-screen bg-slate-50 dark:bg-slate-900" />}
            />
          </AuthProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </I18nProvider>
  </React.StrictMode>,
);
