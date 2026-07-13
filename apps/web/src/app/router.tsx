import { Suspense, lazy } from 'react';
import { createBrowserRouter, useParams } from 'react-router-dom';

import { StatusPage } from '../pages/StatusPage';
import { ADMIN_ANALYTICS_PATH, ADMIN_LOGIN_PATH, ADMIN_PATH } from './adminPaths';
import { ProtectedRoute } from './ProtectedRoute';
import { StatusPageAccessGate } from './StatusPageAccessGate';
import { StatusPageSlugContext, type StatusPageSlug, bootstrapStatusPageSlug } from './StatusPageSlugContext';

const AdminDashboard = lazy(async () => {
  const mod = await import('../pages/AdminDashboard');
  return { default: mod.AdminDashboard };
});

const AdminAnalytics = lazy(async () => {
  const mod = await import('../pages/AdminAnalytics');
  return { default: mod.AdminAnalytics };
});

const IncidentHistoryPage = lazy(async () => {
  const mod = await import('../pages/IncidentHistoryPage');
  return { default: mod.IncidentHistoryPage };
});

const MaintenanceHistoryPage = lazy(async () => {
  const mod = await import('../pages/MaintenanceHistoryPage');
  return { default: mod.MaintenanceHistoryPage };
});

const AdminLogin = lazy(async () => {
  const mod = await import('../pages/AdminLogin');
  return { default: mod.AdminLogin };
});

function PageFallback() {
  return <div className="min-h-screen bg-slate-50 dark:bg-slate-900" />;
}

function StatusPageRoute() {
  const { slug } = useParams<{ slug: string }>();
  const normalizedSlug: StatusPageSlug = slug ?? bootstrapStatusPageSlug();
  return (
    <StatusPageSlugContext.Provider value={normalizedSlug}>
      {normalizedSlug ? (
        <StatusPageAccessGate slug={normalizedSlug}>
          <StatusPage />
        </StatusPageAccessGate>
      ) : (
        <StatusPage />
      )}
    </StatusPageSlugContext.Provider>
  );
}

function SlugScopedRoute({ children }: { children: React.ReactNode }) {
  const { slug } = useParams<{ slug: string }>();
  const normalizedSlug: StatusPageSlug = slug ?? undefined;
  return (
    <StatusPageSlugContext.Provider value={normalizedSlug}>
      {normalizedSlug ? (
        <StatusPageAccessGate slug={normalizedSlug}>{children}</StatusPageAccessGate>
      ) : (
        children
      )}
    </StatusPageSlugContext.Provider>
  );
}

export const router = createBrowserRouter([
  { path: '/', element: <StatusPageRoute /> },
  { path: '/status/:slug', element: <StatusPageRoute /> },
  {
    path: '/status/:slug/history/incidents',
    element: (
      <SlugScopedRoute>
        <Suspense fallback={<PageFallback />}>
          <IncidentHistoryPage />
        </Suspense>
      </SlugScopedRoute>
    ),
  },
  {
    path: '/status/:slug/history/maintenance',
    element: (
      <SlugScopedRoute>
        <Suspense fallback={<PageFallback />}>
          <MaintenanceHistoryPage />
        </Suspense>
      </SlugScopedRoute>
    ),
  },
  {
    path: '/history/incidents',
    element: (
      <Suspense fallback={<PageFallback />}>
        <IncidentHistoryPage />
      </Suspense>
    ),
  },
  {
    path: '/history/maintenance',
    element: (
      <Suspense fallback={<PageFallback />}>
        <MaintenanceHistoryPage />
      </Suspense>
    ),
  },
  {
    path: ADMIN_PATH,
    element: (
      <ProtectedRoute>
        <Suspense fallback={<PageFallback />}>
          <AdminDashboard />
        </Suspense>
      </ProtectedRoute>
    ),
  },
  {
    path: ADMIN_ANALYTICS_PATH,
    element: (
      <ProtectedRoute>
        <Suspense fallback={<PageFallback />}>
          <AdminAnalytics />
        </Suspense>
      </ProtectedRoute>
    ),
  },
  {
    path: ADMIN_LOGIN_PATH,
    element: (
      <Suspense fallback={<PageFallback />}>
        <AdminLogin />
      </Suspense>
    ),
  },
]);
