export type Id<Table extends string = string> = string;

export interface Document {
  _id: Id<"documents">;
  _creationTime: number;
  title: string;
  userId: string;
  isArchived: boolean;
  isPublished: boolean;
  version: number;
  parentDocument?: Id<"documents"> | null;
  content?: string;
  coverImage?: string;
  icon?: string;
  order?: number;
  updatedAt?: number;
  isFavorite?: boolean;
  editorFont?: string;
  fullWidth?: boolean;
  smallText?: boolean;
  showToc?: boolean;
  lastOpenedAt?: number;
  group?: string;
  category?: string;
  date?: string;
  sourceId?: string;
  dirty?: boolean;
  publishedVersion?: number;
  publishedRoute?: PublishedRoute;
}

export interface PublishedRoute { group: string; sourceId: string }
export interface PublicDocumentNode extends PublishedRoute {
  _id: string;
  title: string;
  icon?: string;
  parentDocument?: string | null;
  order: number | null;
}
export interface PublicNavigation {
  ancestors: PublicDocumentNode[];
  children: PublicDocumentNode[];
}
export interface PublicDocumentResponse {
  document: Document;
  navigation?: PublicNavigation;
}

export interface UserSettings {
  _id: Id<"userSettings">;
  _creationTime: number;
  userId: string;
  editorFont?: string;
  focusMode?: boolean;
}

export interface Taxonomy {
  categories: Array<{ id: string; label: string; group?: string }>;
  types: Array<{ id: string; label: string; group?: string }>;
}

export interface ServerState {
  documents: Document[];
  settings: UserSettings | null;
  revision: string;
  csrfToken: string;
  taxonomy: Taxonomy;
}

export interface AuthState {
  authenticated: boolean;
  email: string;
  loading: boolean;
  csrfToken: string;
}

export interface SessionResponse {
  authenticated: boolean;
  csrfToken?: string;
  email?: string;
  maskedEmail?: string;
  username?: string;
  [key: string]: unknown;
}

export type SaveState = "idle" | "saving" | "saved" | "error";
export interface WorkspaceSnapshot extends ServerState {
  auth: AuthState;
  loading: boolean;
  saveState: SaveState;
  error: { message: string; status: number } | null;
  pendingCount: number;
  canSaveCopy: boolean;
  publicDocuments: Readonly<Record<string, Document | null | undefined>>;
  publicNavigation: Readonly<Record<string, PublicNavigation | null | undefined>>;
}

export type UpdateArgs = { id: Id<"documents">; expectedVersion?: number } & Partial<
  Pick<Document, "title" | "content" | "coverImage" | "icon" | "isPublished" |
    "editorFont" | "fullWidth" | "smallText" | "showToc" | "group" | "category" |
    "date" | "parentDocument">
>;

export interface FunctionReference<Args, Result> {
  readonly kind: "query" | "mutation";
  readonly method: string;
  readonly __args?: Args;
  readonly __result?: Result;
}
