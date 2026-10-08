import { ApiError, jsonOptions, request } from "./transport";
import type { AuthState, Document, PublicDocumentResponse, PublicNavigation, ServerState, SessionResponse, WorkspaceSnapshot } from "./types";

type Args = Record<string, unknown>;
type Waiter = { resolve: (value: unknown) => void; reject: (error: unknown) => void };
type Operation = { method: string; args: Args; waiters: Waiter[]; started: boolean; readyAt: number; baseDoc?: Document };
const EMPTY_STATE: ServerState = {
  documents: [], settings: null, revision: "", csrfToken: "", taxonomy: { categories: [], types: [] },
};

export function notifyPublishedContentChanged() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem("thecistus-published-revision", `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  } catch { /* A blocked storage permission must not turn a successful save into an error. */ }
}

function changesPublication(op: Operation) {
  return (op.method === "update" && typeof op.args.isPublished === "boolean") ||
    ["archive", "restore", "remove", "removeAll"].includes(op.method);
}

/** One serialized mutation queue owns server versions and the unsaved input overlay. */
export class WorkspaceStore {
  private state: ServerState = EMPTY_STATE;
  private auth: AuthState = { authenticated: false, email: "", loading: true, csrfToken: "" };
  private loading = true;
  private listeners = new Set<() => void>();
  private operations: Operation[] = [];
  private running = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private error: WorkspaceSnapshot["error"] = null;
  private saveState: WorkspaceSnapshot["saveState"] = "idle";
  private publicDocuments: WorkspaceSnapshot["publicDocuments"] = {};
  private publicNavigation: WorkspaceSnapshot["publicNavigation"] = {};
  private publicEpoch = 0;
  private publicRequests = new Map<string, Promise<void>>();
  private startup: Promise<void> | undefined;
  private observedDocuments = new Map<string, { version: number; count: number }>();
  private recovery: { doc: Document; captured: Set<Operation>; copyId?: string; copyVersion?: number } | null = null;
  private snapshot: WorkspaceSnapshot;

  constructor() { this.snapshot = this.makeSnapshot(); }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  getSnapshot = () => this.snapshot;

  private makeSnapshot(): WorkspaceSnapshot {
    const patches = new Map<string, Args>();
    const retainedDocuments = new Map(this.state.documents.map(doc => [doc._id, doc]));
    let settings = this.state.settings;
    for (const op of this.operations) {
      if (op.method === "update") {
        const { id, expectedVersion: _version, isPublished: _publication, ...patch } = op.args;
        patches.set(String(id), { ...patches.get(String(id)), ...patch });
        if (!retainedDocuments.has(String(id)) && op.baseDoc) retainedDocuments.set(String(id), op.baseDoc);
      }
      if (op.method === "updateUserSettings" && settings) settings = { ...settings, ...op.args };
    }
    const documents = [...retainedDocuments.values()].map(doc => {
      const patch = patches.get(doc._id);
      return patch ? { ...doc, ...patch, dirty: true } as Document : doc;
    });
    return {
      ...this.state, documents, settings, auth: this.auth, loading: this.loading,
      saveState: this.saveState, error: this.error, pendingCount: this.operations.length,
      canSaveCopy: this.operations.some(op => op.method === "update" && typeof op.args.id === "string"),
      publicDocuments: this.publicDocuments,
      publicNavigation: this.publicNavigation,
    };
  }

  private emit() {
    this.snapshot = this.makeSnapshot();
    for (const listener of this.listeners) listener();
  }

  observeDocument = (id: string) => {
    const observed = this.observedDocuments.get(id);
    const doc = this.state.documents.find(item => item._id === id) ?? this.snapshot.documents.find(item => item._id === id);
    if (!doc) return () => undefined;
    if (observed) observed.count += 1;
    else {
      const pending = this.operations.find(op => op.args.id === id && Number.isInteger(op.args.expectedVersion));
      this.observedDocuments.set(id, { version: pending ? Number(pending.args.expectedVersion) : doc.version, count: 1 });
    }
    return () => {
      const current = this.observedDocuments.get(id);
      if (current && --current.count === 0) this.observedDocuments.delete(id);
    };
  };

  private acceptState(state: ServerState) {
    this.state = state;
    this.auth = { ...this.auth, csrfToken: state.csrfToken };
    this.loading = false;
  }

  private acceptSession(session: SessionResponse) {
    this.auth = {
      authenticated: Boolean(session.authenticated), loading: false,
      email: session.maskedEmail || session.email || (session.authenticated ? "관리자 계정" : ""),
      csrfToken: session.csrfToken || "",
    };
  }

  start = () => {
    this.startup ??= this.loadSession();
    return this.startup;
  };

  private async loadSession() {
    try {
      this.acceptSession(await request<SessionResponse>("/api/auth/session"));
      if (this.auth.authenticated) await this.loadWorkspace();
    } catch (error) {
      this.auth = { ...this.auth, loading: false };
      this.setError(error);
    } finally {
      this.loading = false;
      this.emit();
    }
  }

  private async loadWorkspace() {
    this.acceptState(await request<ServerState>("/api/admin/notion"));
  }

  requestCode = () => request<Record<string, unknown>>("/api/auth/request-code", jsonOptions({}));

  verifyCode = async (code: string) => {
    const session = await request<SessionResponse>("/api/auth/verify-code", jsonOptions({ code }));
    this.acceptSession(session);
    // The pending overlay and its original versions survive an expired session.
    await this.loadWorkspace();
    if (!this.operations.length) this.error = null;
    this.emit();
    return session;
  };

  logout = async () => {
    if (this.operations.length) throw new ApiError("저장하지 못한 입력이 있습니다. 저장하거나 사본을 만든 뒤 로그아웃해 주세요.", 409);
    await request("/api/auth/logout", jsonOptions({}, this.auth.csrfToken));
    this.auth = { authenticated: false, email: "", loading: false, csrfToken: "" };
    this.state = EMPTY_STATE;
    this.error = null;
    this.saveState = "idle";
    this.emit();
  };

  refresh = async () => {
    if (this.operations.length || this.running) return false;
    this.running = true;
    try {
      await this.loadWorkspace();
      this.error = null;
      return true;
    } catch (error) {
      this.setError(error);
      return false;
    } finally {
      this.running = false;
      this.emit();
      this.schedule();
    }
  };

  mutate = <R>(method: string, supplied: Args): Promise<R> => {
    const args = { ...supplied };
    const baseDoc = typeof args.id === "string"
      ? this.state.documents.find(item => item._id === args.id) ?? this.snapshot.documents.find(item => item._id === args.id)
      : undefined;
    if (typeof args.id === "string" && !Number.isInteger(args.expectedVersion)) {
      if (!baseDoc) return Promise.reject(new ApiError("문서를 찾지 못했습니다. 입력을 유지한 채 다시 확인해 주세요.", 404));
      const pending = this.operations.find(op => op.args.id === args.id && Number.isInteger(op.args.expectedVersion));
      args.expectedVersion = pending?.args.expectedVersion ?? this.observedDocuments.get(args.id)?.version ?? baseDoc.version;
    }
    if (method === "removeAll" && typeof args.expectedRevision !== "string") args.expectedRevision = this.state.revision;
    const contentOnly = method === "update" && Object.keys(args).every(key => ["id", "title", "content", "expectedVersion"].includes(key));
    const last = this.operations.at(-1);
    const merge = contentOnly && last?.method === "update" && !last.started && last.args.id === args.id &&
      last.args.expectedVersion === args.expectedVersion &&
      Object.keys(last.args).every(key => ["id", "title", "content", "expectedVersion"].includes(key));
    const promise = new Promise<R>((resolve, reject) => {
      const waiter: Waiter = { resolve: value => resolve(value as R), reject };
      if (merge && last) {
        last.args = { ...last.args, ...args };
        last.readyAt = Date.now() + 400;
        last.waiters.push(waiter);
      } else {
        this.operations.push({ method, args, waiters: [waiter], started: false, readyAt: contentOnly ? Date.now() + 400 : 0, baseDoc });
      }
    });
    // Upstream content changes intentionally do not await a promise. Keep their errors in SaveStatus.
    void promise.catch(() => undefined);
    if (!this.error) this.saveState = "saving";
    this.emit();
    if (!contentOnly) for (const op of this.operations) op.readyAt = 0;
    this.schedule();
    return promise;
  };

  private schedule() {
    if (this.running || this.error || !this.operations.length) return;
    clearTimeout(this.timer);
    const delay = Math.max(0, this.operations[0].readyAt - Date.now());
    this.timer = setTimeout(() => { void this.runNext(); }, delay);
  }

  private async send(method: string, args: Args) {
    return request<ServerState & { result: unknown }>(`/api/admin/notion/${encodeURIComponent(method)}`,
      jsonOptions(args, this.auth.csrfToken));
  }

  private async runNext() {
    if (this.running || this.error || !this.operations.length) return;
    this.running = true;
    const op = this.operations[0];
    const affected = new Map<string, number>();
    if (typeof op.args.id === "string") {
      const target = this.state.documents.find(doc => doc._id === op.args.id);
      if (target) affected.set(target._id, Number(op.args.expectedVersion));
      if (op.method === "archive" || op.method === "restore") {
        const visit = [String(op.args.id)];
        for (let index = 0; index < visit.length; index++) for (const doc of this.state.documents) {
          if (doc.parentDocument === visit[index] && !affected.has(doc._id)) {
            affected.set(doc._id, doc.version);
            visit.push(doc._id);
          }
        }
      }
      if (op.method === "reorder") for (const doc of this.state.documents) {
        if (!doc.isArchived && (doc.parentDocument || null) === (op.args.parentDocument || null)) affected.set(doc._id, doc.version);
      }
    }
    op.started = true;
    try {
      const response = await this.send(op.method, op.args);
      this.operations.shift();
      // Advance only the exact increment caused by this operation's known affected documents.
      for (const [id, previousVersion] of affected) {
        const nextVersion = response.documents.find(doc => doc._id === id)?.version;
        if (nextVersion !== previousVersion + 1) continue;
        for (const queued of this.operations) {
          if (queued.args.id === id && queued.args.expectedVersion === previousVersion) queued.args.expectedVersion = nextVersion;
        }
        const observed = this.observedDocuments.get(id);
        if (observed?.version === previousVersion) observed.version = nextVersion;
      }
      this.acceptState(response);
      if (changesPublication(op)) {
        this.publicEpoch += 1;
        this.publicDocuments = {};
        this.publicNavigation = {};
        this.publicRequests.clear();
        notifyPublishedContentChanged();
      }
      for (const waiter of op.waiters) waiter.resolve(response.result);
      this.saveState = this.operations.length ? "saving" : "saved";
    } catch (error) {
      this.setError(error);
      for (const waiter of op.waiters) waiter.reject(error);
      op.waiters = [];
    } finally {
      this.running = false;
      this.emit();
      this.schedule();
    }
  }

  private setError(error: unknown) {
    const status = error instanceof ApiError ? error.status : 0;
    this.error = { status, message: error instanceof Error ? error.message : "저장하지 못했습니다. 입력은 유지됩니다." };
    this.saveState = "error";
    if (status === 401) this.auth = { ...this.auth, authenticated: false };
  }

  retry = async () => {
    if (this.running) return;
    if (this.error?.status === 409 || this.error?.status === 428) return;
    this.error = null;
    if (!this.operations.length) {
      this.startup = undefined;
      await this.start();
    } else {
      this.saveState = "saving";
      for (const op of this.operations) op.readyAt = 0;
      this.emit();
      this.schedule();
    }
  };

  reloadServer = async () => {
    if (this.running || this.operations.some(op => op.method === "update" || op.method === "updateUserSettings")) return;
    const cancelled = new Set(this.operations);
    this.running = true;
    // With no text/settings input pending, the user can abandon a stale structural action explicitly.
    try {
      await this.loadWorkspace();
      for (const op of cancelled) for (const waiter of op.waiters) {
        waiter.reject(new ApiError("서버 상태를 다시 확인하여 이전 요청을 취소했습니다.", 409));
      }
      this.operations = this.operations.filter(op => !cancelled.has(op));
      this.error = null;
      this.saveState = this.operations.length ? "saving" : "idle";
    } catch (error) { this.setError(error); }
    finally {
      this.running = false;
      this.emit();
      this.schedule();
    }
  };

  saveCopy = async (): Promise<string> => {
    if (this.running) throw new ApiError("저장 중입니다. 잠시 기다려 주세요.", 409);
    if (!this.recovery) {
      const original = this.operations.find(op => op.method === "update");
      const doc = this.snapshot.documents.find(item => item._id === original?.args.id);
      if (!doc) throw new ApiError("사본으로 저장할 입력을 찾지 못했습니다.", 404);
      const captured = new Set(this.operations.filter(op => op.args.id === doc._id));
      // Freeze these operations before awaiting; future input must get its own overlay.
      for (const op of captured) op.started = true;
      this.recovery = { doc, captured };
    }
    const recovery = this.recovery;
    const doc = recovery.doc;
    this.running = true;
    try {
      if (!recovery.copyId) {
        const created = await this.send("create", { title: `${doc.title || "제목 없음"} (복구 사본)` });
        recovery.copyId = String(created.result);
        recovery.copyVersion = created.documents.find(item => item._id === recovery.copyId)?.version;
      }
      const id = recovery.copyId;
      if (!Number.isInteger(recovery.copyVersion)) throw new ApiError("사본 문서 버전을 확인하지 못했습니다.", 0);
      const fields = ["content", "coverImage", "icon", "editorFont", "fullWidth", "smallText", "showToc", "group", "category", "date"] as const;
      const patch: Args = { id, expectedVersion: recovery.copyVersion, isPublished: false };
      for (const field of fields) if (doc[field] !== undefined) patch[field] = doc[field];
      const saved = await this.send("update", patch);
      this.acceptState(saved);
      // Keep other documents' operations; the conflicted original is never overwritten.
      this.operations = this.operations.filter(op => {
        if (!recovery.captured.has(op)) return true;
        for (const waiter of op.waiters) {
          if (op.method === "update" && op.args.isPublished === undefined && op.args.parentDocument === undefined) waiter.resolve(null);
          else waiter.reject(new ApiError("복구 사본을 저장하여 이전 문서 요청을 취소했습니다.", 409));
        }
        return false;
      });
      this.recovery = null;
      this.error = null;
      this.saveState = this.operations.length ? "saving" : "saved";
      return id;
    } catch (error) {
      this.setError(error);
      throw error;
    } finally {
      this.running = false;
      this.emit();
      this.schedule();
    }
  };

  loadPublicDocument = (id: string) => {
    const existing = this.publicRequests.get(id);
    if (existing) return existing;
    if (this.publicDocuments[id] !== undefined) return Promise.resolve();
    const epoch = this.publicEpoch;
    const pending = request<Document | PublicDocumentResponse>(`/api/notion/documents/${encodeURIComponent(id)}`)
      .then(response => {
        if (epoch !== this.publicEpoch) return;
        const doc = "document" in response ? response.document : response;
        this.publicDocuments = { ...this.publicDocuments, [id]: doc };
        const navigation: PublicNavigation = "document" in response && response.navigation
          ? response.navigation : { ancestors: [], children: [] };
        this.publicNavigation = { ...this.publicNavigation, [id]: navigation };
      })
      .catch(error => {
        if (epoch !== this.publicEpoch) return;
        this.publicDocuments = { ...this.publicDocuments, [id]: null };
        this.publicNavigation = { ...this.publicNavigation, [id]: null };
        if (!(error instanceof ApiError && error.status === 404)) this.setError(error);
      })
      .finally(() => {
        if (this.publicRequests.get(id) === pending) this.publicRequests.delete(id);
        this.emit();
      });
    this.publicRequests.set(id, pending);
    return pending;
  };

  upload = async (file: File, onProgress?: (progress: number) => void) => {
    onProgress?.(0);
    const result = await request<{ url: string }>("/api/admin/notion/files", {
      method: "PUT", body: file,
      headers: { "Content-Type": file.type || "application/octet-stream", "X-File-Name": encodeURIComponent(file.name), "X-CSRF-Token": this.auth.csrfToken },
    });
    const url = new URL(result.url, window.location.origin);
    if (url.origin !== window.location.origin || !/^\/api\/notion\/files\/[a-f0-9]{48}$/.test(url.pathname) || url.search || url.hash) {
      throw new ApiError("파일 주소를 확인하지 못했습니다.", 0);
    }
    onProgress?.(100);
    return { ...result, url: url.pathname };
  };
}
