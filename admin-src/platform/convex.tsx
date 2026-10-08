import { useCallback, useEffect, useMemo, useSyncExternalStore, type PropsWithChildren } from "react";
import { usePathname } from "./navigation";
import { useAuth, useWorkspaceStore } from "./workspace";
import type { Document, FunctionReference, WorkspaceSnapshot } from "./types";

function select(snapshot: WorkspaceSnapshot, method: string, args: Record<string, unknown>) {
  const docs = snapshot.documents;
  const newest = (a: Document, b: Document) => b._creationTime - a._creationTime;
  switch (method) {
    case "getSidebar": return docs.filter(doc => !doc.isArchived && (doc.parentDocument || null) === (args.parentDocument || null)).sort((a, b) => {
      if (a.order === undefined && b.order === undefined) return newest(a, b);
      if (a.order === undefined) return -1;
      if (b.order === undefined) return 1;
      return a.order - b.order;
    });
    case "getTrash": return docs.filter(doc => doc.isArchived).sort(newest);
    case "getSearch": return docs.filter(doc => !doc.isArchived).sort(newest);
    case "getById": return docs.find(doc => doc._id === args.documentId) ?? null;
    case "getFavorites": return docs.filter(doc => !doc.isArchived && doc.isFavorite).sort(newest);
    case "getRecentlyOpened": return docs.filter(doc => !doc.isArchived && !doc.isPublished && doc.lastOpenedAt)
      .sort((a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0)).slice(0, 4);
    case "getUserSettings": return snapshot.settings;
    case "getTaxonomy": return snapshot.taxonomy;
    case "searchDocuments": {
      const query = String(args.query ?? "").toLocaleLowerCase();
      return docs.filter(doc => !doc.isArchived && (!args.group || doc.group === args.group) &&
        (!args.category || doc.category === args.category) && `${doc.title} ${doc.content ?? ""}`.toLocaleLowerCase().includes(query)).sort(newest);
    }
    default: throw new Error(`지원하지 않는 query: ${method}`);
  }
}

export function useQuery<A, R>(reference: FunctionReference<A, R>, args?: A | "skip" | null): R | undefined {
  const store = useWorkspaceStore();
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const pathname = usePathname();
  const skip = args === "skip" || args === null;
  const serialized = JSON.stringify(skip ? {} : args ?? {});
  const stableArgs = useMemo(() => JSON.parse(serialized) as Record<string, unknown>, [serialized]);
  const preview = pathname.startsWith("/preview/") && reference.method === "getById";
  const publicId = typeof stableArgs.documentId === "string" ? stableArgs.documentId : "";
  useEffect(() => { if (!skip && preview && publicId) void store.loadPublicDocument(publicId); }, [store, skip, preview, publicId, snapshot.publicDocuments]);
  const observing = !skip && !preview && reference.method === "getById" && !snapshot.loading && snapshot.auth.authenticated;
  useEffect(() => observing && publicId ? store.observeDocument(publicId) : undefined, [store, observing, publicId]);
  return useMemo(() => {
    if (skip) return undefined;
    if (preview) return snapshot.publicDocuments[publicId] as R | undefined;
    if (snapshot.loading || snapshot.auth.loading || !snapshot.auth.authenticated) return undefined;
    return select(snapshot, reference.method, stableArgs) as R;
  }, [snapshot, skip, preview, publicId, reference.method, stableArgs]);
}

export function useMutation<A, R>(reference: FunctionReference<A, R>) {
  const store = useWorkspaceStore();
  return useCallback((...call: {} extends A ? [args?: A] : [args: A]) =>
    store.mutate<R>(reference.method, (call[0] ?? {}) as Record<string, unknown>), [store, reference.method]);
}

export function useConvexAuth() {
  const { authenticated, loading } = useAuth();
  return { isAuthenticated: authenticated, isLoading: loading };
}
export function ConvexProvider({ children }: PropsWithChildren<{ client?: unknown }>) { return children; }
