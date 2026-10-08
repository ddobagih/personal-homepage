import type { Document, FunctionReference, Id, Taxonomy, UpdateArgs, UserSettings } from "./types";

const query = <A, R>(method: string): FunctionReference<A, R> => ({ kind: "query", method });
const mutation = <A, R>(method: string): FunctionReference<A, R> => ({ kind: "mutation", method });
type Target = { id: Id<"documents">; expectedVersion?: number };
type Empty = Record<string, never>;

export const api = {
  documents: {
    getSidebar: query<{ parentDocument?: Id<"documents"> }, Document[]>("getSidebar"),
    getTrash: query<Empty, Document[]>("getTrash"),
    getSearch: query<Empty, Document[]>("getSearch"),
    getById: query<{ documentId: Id<"documents"> }, Document | null>("getById"),
    getFavorites: query<Empty, Document[]>("getFavorites"),
    getRecentlyOpened: query<Empty, Document[]>("getRecentlyOpened"),
    getTaxonomy: query<Empty, Taxonomy>("getTaxonomy"),
    searchDocuments: query<{ query: string; group?: string; category?: string }, Document[]>("searchDocuments"),
    archive: mutation<Target, null>("archive"),
    create: mutation<{ title: string; parentDocument?: Id<"documents">; group?: string; category?: string; date?: string }, Id<"documents">>("create"),
    restore: mutation<Target, null>("restore"),
    remove: mutation<Target, null>("remove"),
    update: mutation<UpdateArgs, null>("update"),
    removeIcon: mutation<Target, null>("removeIcon"),
    removeCoverImage: mutation<Target, null>("removeCoverImage"),
    reorder: mutation<Target & { parentDocument?: Id<"documents">; newOrder: number }, boolean>("reorder"),
    removeAll: mutation<{ expectedRevision?: string }, boolean>("removeAll"),
    toggleFavorite: mutation<Target, null>("toggleFavorite"),
    duplicate: mutation<Target, Id<"documents">>("duplicate"),
    markOpened: mutation<Target, null>("markOpened"),
  },
  userSettings: {
    getUserSettings: query<Empty, UserSettings | null>("getUserSettings"),
    updateUserSettings: mutation<{ editorFont?: string; focusMode?: boolean }, null>("updateUserSettings"),
  },
} as const;
export const internal = {};
export const components = {};
