import { useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import { ApiError, fetchStatus } from '../api/client';
import { ADMIN_LOGIN_PATH } from './adminPaths';
import { useAuth } from './AuthContext';
import type { StatusPageSlug } from './StatusPageSlugContext';

type AccessState = 'checking' | 'allowed' | 'login';

export function StatusPageAccessGate({
  slug,
  children,
}: {
  slug: StatusPageSlug;
  children: ReactNode;
}) {
  const location = useLocation();
  const { ensureValidToken } = useAuth();
  const [state, setState] = useState<AccessState>('checking');

  useEffect(() => {
    let cancelled = false;
    setState('checking');

    fetchStatus(slug)
      .then(() => {
        if (!cancelled) setState('allowed');
      })
      .catch(async (error: unknown) => {
        if (!(error instanceof ApiError) || error.status !== 404) {
          if (!cancelled) setState('allowed');
          return;
        }

        const valid = await ensureValidToken();
        if (!cancelled) setState(valid ? 'allowed' : 'login');
      });

    return () => {
      cancelled = true;
    };
  }, [ensureValidToken, slug]);

  if (state === 'checking') {
    return (
      <div
        className="min-h-screen bg-slate-50 dark:bg-slate-900"
        role="status"
        aria-live="polite"
        aria-label="Checking status page access"
      />
    );
  }
  if (state === 'login') {
    return <Navigate to={ADMIN_LOGIN_PATH} state={{ from: location }} replace />;
  }
  return <>{children}</>;
}
