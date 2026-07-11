import { createContext, useContext } from 'react';

export type StatusPageSlug = string | undefined;

export const StatusPageSlugContext = createContext<StatusPageSlug>(undefined);

export function useStatusPageSlug(): StatusPageSlug {
  return useContext(StatusPageSlugContext);
}

export function statusPageSlugPrefix(slug: StatusPageSlug): string {
  return slug ? `status-pages/${slug}` : '';
}
