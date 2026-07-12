import { createContext, useContext } from 'react';

export type StatusPageSlug = string | undefined;

export const StatusPageSlugContext = createContext<StatusPageSlug>(undefined);

export function useStatusPageSlug(): StatusPageSlug {
  return useContext(StatusPageSlugContext);
}

export function statusPageSlugPrefix(slug: StatusPageSlug): string {
  return slug ? `status-pages/${slug}` : '';
}

// ponytail: custom-domain root reads the Pages-injected bootstrap slug so the SPA
// reuses the existing slug-qualified API/query/cache paths without a second identity system.
const BOOTSTRAP_SLUG =
  typeof globalThis.__UPTIMER_STATUS_PAGE_SLUG__ === 'string'
    ? globalThis.__UPTIMER_STATUS_PAGE_SLUG__
    : undefined;

export function bootstrapStatusPageSlug(): StatusPageSlug {
  return BOOTSTRAP_SLUG;
}
