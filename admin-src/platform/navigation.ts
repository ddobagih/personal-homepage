import { useMemo, useSyncExternalStore } from "react";

const listeners = new Set<() => void>();
let refreshWorkspace: (() => Promise<boolean>) | undefined;
export function registerRouteRefresh(refresh: () => Promise<boolean>) {
  refreshWorkspace = refresh;
  return () => { if (refreshWorkspace === refresh) refreshWorkspace = undefined; };
}
const emit = () => { for (const listener of listeners) listener(); };
const subscribe = (listener: () => void) => {
  if (!listeners.size) {
    window.addEventListener("hashchange", emit);
    window.addEventListener("popstate", emit);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      window.removeEventListener("hashchange", emit);
      window.removeEventListener("popstate", emit);
    }
  };
};

export function currentPathname() {
  if (typeof window === "undefined") return "/documents";
  const route = window.location.hash.startsWith("#/") ? window.location.hash.slice(1) : window.location.pathname;
  return /^\/(preview|documents|settings)(\/|$|\?)/.test(route) ? route.split("?")[0] : "/documents";
}

export function routeHref(href: string) {
  return /^\/(documents|preview|settings)(\/|$|\?)/.test(href) ? `/admin/#${href}` : href;
}

function navigate(href: string, replace = false) {
  if (!/^\/(documents|preview|settings)(\/|$|\?)/.test(href)) {
    if (replace) window.location.replace(href);
    else window.location.assign(href);
    return;
  }
  const url = routeHref(href);
  if (replace) window.history.replaceState(null, "", url);
  else window.history.pushState(null, "", url);
  emit();
}

const router = {
  push: (href: string) => navigate(href),
  replace: (href: string) => navigate(href, true),
  back: () => window.history.back(),
  forward: () => window.history.forward(),
  refresh: () => { void refreshWorkspace?.(); },
  prefetch: (_href: string) => Promise.resolve(),
};

export const useRouter = () => router;
export function usePathname() {
  return useSyncExternalStore(subscribe, currentPathname, () => "/documents");
}
export function useParams<T extends Record<string, string | string[]> = { documentId: string }>() {
  const pathname = usePathname();
  return useMemo(() => {
    const segment = /^\/(?:documents|preview)\/([^/]+)/.exec(pathname)?.[1];
    if (!segment) return {} as T;
    let id = segment;
    try { id = decodeURIComponent(segment); } catch { /* A malformed path stays a missing ID. */ }
    return { documentId: id } as unknown as T;
  }, [pathname]);
}
export function redirect(href: string) { navigate(href, true); return null; }
