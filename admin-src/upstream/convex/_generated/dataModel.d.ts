import type { Document, UserSettings } from "../../../platform/types";
export type { Id } from "../../../platform/types";
export type TableNames = "documents" | "userSettings";
export type Doc<Table extends TableNames> = Table extends "documents" ? Document : UserSettings;
export type DataModel = { documents: Document; userSettings: UserSettings };
