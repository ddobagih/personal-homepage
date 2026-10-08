import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore, type PropsWithChildren } from "react";
import { registerRouteRefresh, useRouter } from "./navigation";
import { WorkspaceStore } from "./store";

const WorkspaceContext = createContext<WorkspaceStore | null>(null);

export function WorkspaceProvider({ children }: PropsWithChildren) {
  const [store] = useState(() => new WorkspaceStore());
  useEffect(() => {
    void store.start();
    const releaseRefresh = registerRouteRefresh(store.refresh);
    const preventInputLoss = (event: BeforeUnloadEvent) => {
      if (!store.getSnapshot().pendingCount) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", preventInputLoss);
    return () => {
      releaseRefresh();
      window.removeEventListener("beforeunload", preventInputLoss);
    };
  }, [store]);
  return <WorkspaceContext.Provider value={store}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspaceStore() {
  const store = useContext(WorkspaceContext);
  if (!store) throw new Error("WorkspaceProvider가 필요합니다.");
  return store;
}

export function useWorkspace() {
  const store = useWorkspaceStore();
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return useMemo(() => ({
    ...snapshot, refresh: store.refresh, retry: store.retry, saveCopy: store.saveCopy, reloadServer: store.reloadServer,
    requestCode: store.requestCode, verifyCode: store.verifyCode, logout: store.logout,
  }), [snapshot, store]);
}

export function useAuth() {
  const { auth, requestCode, verifyCode, logout } = useWorkspace();
  return useMemo(() => ({
    ...auth, isLoaded: !auth.loading, isSignedIn: auth.authenticated,
    isAuthenticated: auth.authenticated, isLoading: auth.loading,
    requestCode, verifyCode, logout,
  }), [auth, requestCode, verifyCode, logout]);
}

export function usePublicNavigation(id: string, enabled = true) {
  const store = useWorkspaceStore();
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  useEffect(() => { if (enabled) void store.loadPublicDocument(id); }, [store, id, enabled, snapshot.publicDocuments]);
  return enabled ? snapshot.publicNavigation[id] : undefined;
}

export function SaveStatus() {
  const workspace = useWorkspace();
  const router = useRouter();
  const [copying, setCopying] = useState(false);
  const [actionError, setActionError] = useState("");
  const conflict = workspace.error?.status === 409 || workspace.error?.status === 428;
  const text = workspace.error
    ? (conflict ? "다른 변경과 충돌했습니다. 현재 입력은 유지됩니다." : "저장하지 못했습니다. 현재 입력은 유지됩니다.")
    : workspace.saveState === "saving" ? "자동저장 중…"
    : workspace.saveState === "saved" ? "자동저장됨"
    : "자동저장 준비됨";
  return (
    <div className="workspace-save-status" data-save-state={workspace.saveState}>
      <div className="workspace-save-copy" role="status" aria-live="polite">
        <p>{text}</p>
        {workspace.error && <p className="workspace-save-detail">{workspace.error.message}</p>}
        {actionError && <p className="workspace-save-detail">{actionError}</p>}
      </div>
      {workspace.error && <div className="workspace-save-actions">
        {!conflict && <button type="button" onClick={() => { void workspace.retry(); }}>다시 저장</button>}
        {conflict && !workspace.canSaveCopy && <button type="button" onClick={() => { void workspace.reloadServer(); }}>서버 상태 다시 확인</button>}
        {workspace.canSaveCopy && <button type="button" disabled={copying} onClick={async () => {
          setCopying(true);
          setActionError("");
          try {
            const id = await workspace.saveCopy();
            router.push(`/documents/${encodeURIComponent(id)}`);
          } catch (error) { setActionError(error instanceof Error ? error.message : "사본을 저장하지 못했습니다."); }
          finally { setCopying(false); }
        }}>{copying ? "사본 저장 중…" : "새 비공개 사본으로 저장"}</button>}
      </div>}
    </div>
  );
}

export default SaveStatus;
