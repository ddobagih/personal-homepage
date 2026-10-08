const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const { GROUP_FIELDS, safeCover, projectDocumentAssets, validateNativeContent, publicDocument, hasUnpublishedChanges, publishedWorkspace, legacyDocuments, overlayPublicContent, referencedFileTokens } = require("./notion-content");

const METHOD_ARGS = {
  archive: ["id"], getSidebar: ["parentDocument"], create: ["title", "parentDocument", "group", "category", "date"], getTrash: [],
  restore: ["id"], remove: ["id"], getSearch: [], getById: ["documentId"],
  update: ["id", "title", "content", "coverImage", "icon", "isPublished", "editorFont", "fullWidth", "smallText", "showToc", "group", "category", "date", "parentDocument"],
  removeIcon: ["id"], removeCoverImage: ["id"], reorder: ["id", "parentDocument", "newOrder"], removeAll: [],
  toggleFavorite: ["id"], getFavorites: [], duplicate: ["id"], markOpened: ["id"], getRecentlyOpened: [],
  getUserSettings: [], updateUserSettings: ["editorFont", "focusMode"], getTaxonomy: []
};
const QUERIES = new Set(["getSidebar", "getTrash", "getSearch", "getById", "getFavorites", "getRecentlyOpened", "getUserSettings", "getTaxonomy"]);
const FONTS = new Set(["default", "Lora", "JetBrains Mono"]);
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

function error(message, statusCode = 400) {
  const failure = new Error(message);
  failure.statusCode = statusCode;
  throw failure;
}

function object(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function token() { return crypto.randomBytes(32).toString("hex"); }
function string(value, limit, name) { if (typeof value !== "string" || value.length > limit) error(`${name} must be a string of at most ${limit} characters`); }
function normalizeUploadReferences(args, origin) {
  if (!origin) return args;
  const relativeUrl = (value) => {
    if (typeof value !== "string") return value;
    try {
      const parsed = new URL(value);
      if (parsed.origin === origin && !parsed.username && !parsed.password && !parsed.search && !parsed.hash && /^\/api\/notion\/files\/[a-f0-9]{48}$/.test(parsed.pathname)) return parsed.pathname;
    } catch { /* Relative URLs and cover gradients remain unchanged. */ }
    return value;
  };
  if (typeof args.coverImage === "string") args.coverImage = relativeUrl(args.coverImage);
  if (typeof args.content === "string") {
    const blocks = JSON.parse(args.content);
    const visit = (value) => {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === "object") {
        for (const [key, entry] of Object.entries(value)) {
          if (["url", "href"].includes(key)) value[key] = relativeUrl(entry);
          else visit(entry);
        }
      }
    };
    visit(blocks);
    args.content = JSON.stringify(blocks);
  }
  return args;
}
function sidebarOrder(a, b) {
  if (a.order === undefined && b.order === undefined) return b._creationTime - a._creationTime;
  if (a.order === undefined) return -1;
  if (b.order === undefined) return 1;
  return a.order - b.order;
}

async function atomicJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const temporaryPath = `${filePath}.${crypto.randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
    await fs.rename(temporaryPath, filePath);
  } finally { await fs.unlink(temporaryPath).catch((failure) => { if (failure.code !== "ENOENT") throw failure; }); }
}

function createNotionStore({ appDataDir, readLegacyContent, isSafeContentId }) {
  const filePath = path.join(appDataDir, "notion-documents.json");
  const uploadDir = path.join(appDataDir, "notion-uploads");
  const backupDir = path.join(appDataDir, "notion-backups");
  let operationQueue = Promise.resolve();

  function enqueue(task) {
    const next = operationQueue.then(task);
    operationQueue = next.catch(() => {});
    return next;
  }

  function requireId(value, name = "id") {
    if (typeof value !== "string" || !isSafeContentId(value)) error(`${name} must be a safe document ID`);
  }

  function getDocument(state, id) {
    requireId(id);
    const doc = state.documents.find((entry) => entry._id === id);
    if (!doc) error("Document not found", 404);
    return doc;
  }

  function validateHierarchy(state) {
    const documents = new Map(state.documents.map((doc) => [doc._id, doc]));
    if (documents.size !== state.documents.length) throw new Error("Invalid Notion document IDs");
    for (const doc of state.documents) {
      if (!Number.isInteger(doc.version) || doc.version < 1 || !Object.hasOwn(GROUP_FIELDS, doc.group)) throw new Error("Invalid Notion document");
      const visited = new Set([doc._id]);
      let parent = doc.parentDocument;
      while (parent) {
        if (visited.has(parent) || !documents.has(parent)) throw new Error("Invalid Notion document hierarchy");
        visited.add(parent);
        parent = documents.get(parent).parentDocument;
      }
    }
  }

  async function load() {
    let raw;
    try { raw = await fs.readFile(filePath, "utf8"); } catch (failure) {
      if (failure.code !== "ENOENT") throw failure;
      const legacy = await readLegacyContent();
      const state = { schemaVersion: 1, revision: token(), ...legacyDocuments(legacy), managed: {}, settings: null, uploads: {} };
      await atomicJson(filePath, state);
      return state;
    }
    let state;
    try { state = JSON.parse(raw); } catch { throw new Error("Invalid Notion workspace file"); }
    if (!object(state) || state.schemaVersion !== 1 || !Array.isArray(state.documents) || !object(state.published) || !object(state.origins) || !object(state.managed) || !object(state.uploads) || typeof state.revision !== "string") throw new Error("Invalid Notion workspace file");
    validateHierarchy(state);
    let migrated = false;
    for (const doc of state.documents) {
      const snapshot = state.published[doc._id];
      if (!snapshot) continue;
      if (!Object.hasOwn(snapshot, "parentDocument")) { snapshot.parentDocument = doc.parentDocument || null; migrated = true; }
      if (!Object.hasOwn(snapshot, "order")) { snapshot.order = Number.isFinite(doc.order) ? doc.order : null; migrated = true; }
    }
    if (migrated) {
      state.revision = token();
      await atomicJson(filePath, state);
    }
    return state;
  }

  async function snapshot(state) {
    const legacy = await readLegacyContent();
    const publicDocs = publishedWorkspace(legacy, state).documents;
    const documents = state.documents.map((doc) => {
      const published = publicDocs.get(doc._id);
      return { ...projectDocumentAssets(doc), dirty: hasUnpublishedChanges(doc, state.published[doc._id]), ...(published ? { publishedRoute: { group: published.group, sourceId: published.sourceId } } : {}) };
    });
    return { documents, settings: state.settings, revision: state.revision, taxonomy: legacy.taxonomy || { types: [], categories: [] } };
  }

  function validateArgs(method, args) {
    if (!Object.hasOwn(METHOD_ARGS, method)) error("Unknown Notion method", 404);
    if (!object(args)) error("Notion arguments must be an object");
    const allowed = new Set([...METHOD_ARGS[method], "expectedVersion", "expectedRevision"]);
    if (Object.keys(args).some((key) => !allowed.has(key))) error("Notion arguments contain an unsupported field");
    for (const key of ["id", "documentId"]) if (METHOD_ARGS[method].includes(key)) requireId(args[key], key);
    if (args.parentDocument !== undefined && args.parentDocument !== null) requireId(args.parentDocument, "parentDocument");
    if (method === "create") string(args.title, 16384, "title");
    for (const key of ["title", "icon", "coverImage", "editorFont", "category", "date"]) {
      if (args[key] !== undefined) string(args[key], key === "title" ? 16384 : key === "coverImage" ? 8192 : key === "icon" ? 2048 : 128, key);
    }
    if (args.category && !isSafeContentId(args.category)) error("category must be a safe identifier");
    if (args.group !== undefined && !Object.hasOwn(GROUP_FIELDS, args.group)) error("group is invalid");
    if (args.editorFont !== undefined && !FONTS.has(args.editorFont)) error("editorFont is invalid");
    if (args.coverImage && !safeCover(args.coverImage)) error("coverImage URL is invalid");
    for (const key of ["isPublished", "fullWidth", "smallText", "showToc", "focusMode"]) if (args[key] !== undefined && typeof args[key] !== "boolean") error(`${key} must be a boolean`);
    if (args.content !== undefined) {
      try { validateNativeContent(args.content); } catch (failure) { error(failure.message); }
    }
    if (method === "reorder" && (!Number.isInteger(args.newOrder) || args.newOrder < 0 || args.newOrder > 100000)) error("newOrder must be a non-negative integer");
  }

  function requireVersion(doc, args) {
    if (!Number.isInteger(args.expectedVersion) || args.expectedVersion < 1) error("Document version is required", 428);
    if (args.expectedVersion !== doc.version) error("Notion document version conflict", 409);
  }

  function validateParent(state, id, parentId) {
    if (!parentId) return;
    let parent = getDocument(state, parentId);
    if (parent.isArchived) error("Parent document is archived", 409);
    const visited = new Set([id]);
    while (parent) {
      if (visited.has(parent._id)) error("A document cannot contain itself", 409);
      visited.add(parent._id);
      parent = parent.parentDocument ? getDocument(state, parent.parentDocument) : null;
    }
  }

  function descendants(state, id) {
    const result = [];
    const pending = [id];
    const visited = new Set();
    while (pending.length) {
      const current = pending.pop();
      if (visited.has(current)) error("Invalid document hierarchy", 409);
      visited.add(current);
      result.push(getDocument(state, current));
      pending.push(...state.documents.filter((doc) => doc.parentDocument === current).map((doc) => doc._id));
    }
    return result;
  }

  function manage(state, doc) {
    const managed = state.managed[doc._id] ||= { sources: [] };
    for (const source of [state.origins[doc._id], state.published[doc._id], doc]) {
      if (source && !managed.sources.some((entry) => entry.group === source.group && entry.sourceId === source.sourceId)) managed.sources.push({ group: source.group, sourceId: source.sourceId });
    }
  }

  function query(method, args, state, taxonomy) {
    const newest = (docs) => [...docs].sort((a, b) => b._creationTime - a._creationTime);
    switch (method) {
      case "getSidebar": return state.documents.filter((doc) => !doc.isArchived && (doc.parentDocument || null) === (args.parentDocument || null)).sort(sidebarOrder);
      case "getTrash": return newest(state.documents.filter((doc) => doc.isArchived));
      case "getSearch": return newest(state.documents.filter((doc) => !doc.isArchived));
      case "getById": return getDocument(state, args.documentId);
      case "getFavorites": return newest(state.documents.filter((doc) => doc.isFavorite && !doc.isArchived));
      case "getRecentlyOpened": return state.documents.filter((doc) => doc.lastOpenedAt && !doc.isArchived && !doc.isPublished).sort((a, b) => b.lastOpenedAt - a.lastOpenedAt).slice(0, 4);
      case "getUserSettings": return state.settings;
      case "getTaxonomy": return taxonomy;
      default: error("Unknown Notion method", 404);
    }
  }

  async function mutate(method, args, state, taxonomy) {
    const changed = new Set();
    let result = null;
    let doc;
    if (METHOD_ARGS[method].includes("id")) {
      doc = getDocument(state, args.id);
      requireVersion(doc, args);
    }
    const defaultCategory = (group) => taxonomy.categories?.find((entry) => entry.group === group)?.id || "";
    const now = Date.now();
    const addDocument = (value) => {
      const id = crypto.randomUUID();
      const created = state.documents.reduce((latest, entry) => Math.max(latest, entry._creationTime + 1), now);
      const entry = { _id: id, _creationTime: created, userId: "admin", title: "Untitled", isArchived: false, isPublished: false, fullWidth: true, showToc: true, group: "study", category: defaultCategory("study"), date: new Date().toISOString().slice(0, 10), content: "[]", ...value, version: 1, sourceId: id, updatedAt: now };
      state.documents.push(entry);
      return id;
    };
    switch (method) {
      case "create": {
        validateParent(state, "new", args.parentDocument);
        const parent = args.parentDocument ? getDocument(state, args.parentDocument) : null;
        const group = args.group || parent?.group || "study";
        result = addDocument({ title: args.title, ...(args.parentDocument ? { parentDocument: args.parentDocument } : {}), group, category: args.category ?? parent?.category ?? defaultCategory(group), ...(args.date !== undefined ? { date: args.date } : {}) });
        break;
      }
      case "update": {
        if (args.isPublished === true && doc.isArchived) error("Archived documents cannot be published", 409);
        if (Object.hasOwn(args, "parentDocument")) validateParent(state, doc._id, args.parentDocument);
        const oldGroup = doc.group;
        if (Object.hasOwn(args, "isPublished")) manage(state, doc);
        for (const key of METHOD_ARGS.update.filter((key) => key !== "id")) {
          if (!Object.hasOwn(args, key)) continue;
          if (key === "parentDocument" && !args[key]) delete doc.parentDocument;
          else doc[key] = args[key];
        }
        if (doc.group !== oldGroup && args.category === undefined) doc.category = defaultCategory(doc.group);
        changed.add(doc._id);
        if (args.isPublished === true) {
          manage(state, doc);
          state.published[doc._id] = publicDocument(doc);
        } else if (args.isPublished === false) delete state.published[doc._id];
        break;
      }
      case "archive":
      case "restore": {
        if (method === "restore" && doc.parentDocument && getDocument(state, doc.parentDocument).isArchived) delete doc.parentDocument;
        for (const entry of descendants(state, doc._id)) {
          manage(state, entry);
          entry.isArchived = method === "archive";
          changed.add(entry._id);
        }
        break;
      }
      case "remove":
      case "removeAll": {
        let removing;
        if (method === "remove") {
          if (!doc.isArchived) error("Archive a document before permanently deleting it", 409);
          removing = descendants(state, doc._id);
        } else {
          if (typeof args.expectedRevision !== "string" || !args.expectedRevision) error("Workspace revision is required", 428);
          if (args.expectedRevision !== state.revision) error("Notion workspace revision conflict", 409);
          removing = state.documents.filter((entry) => entry.isArchived);
        }
        await atomicJson(path.join(backupDir, `notion-${now}-${crypto.randomUUID()}.json`), state);
        const ids = new Set(removing.map((entry) => entry._id));
        for (const entry of removing) { manage(state, entry); delete state.published[entry._id]; }
        state.documents = state.documents.filter((entry) => !ids.has(entry._id));
        for (const entry of state.documents) if (ids.has(entry.parentDocument)) { delete entry.parentDocument; changed.add(entry._id); }
        if (method === "removeAll") result = true;
        break;
      }
      case "removeIcon": delete doc.icon; changed.add(doc._id); break;
      case "removeCoverImage": delete doc.coverImage; changed.add(doc._id); break;
      case "toggleFavorite": doc.isFavorite = !doc.isFavorite; changed.add(doc._id); break;
      case "markOpened": doc.lastOpenedAt = now; changed.add(doc._id); break;
      case "duplicate": {
        const copy = {};
        for (const key of ["parentDocument", "content", "coverImage", "icon", "editorFont", "fullWidth", "smallText", "showToc", "group", "category", "date"]) if (Object.hasOwn(doc, key)) copy[key] = doc[key];
        validateParent(state, "new", copy.parentDocument);
        result = addDocument({ ...copy, title: `${doc.title} (Copy)`, isFavorite: false });
        break;
      }
      case "reorder": {
        validateParent(state, doc._id, args.parentDocument);
        const previousParent = doc.parentDocument;
        const nextParent = args.parentDocument || undefined;
        const siblings = state.documents.filter((entry) => !entry.isArchived && entry._id !== doc._id && entry.parentDocument === nextParent).sort(sidebarOrder);
        if (doc.isArchived) error("Archived documents cannot be reordered", 409);
        if (nextParent) doc.parentDocument = nextParent; else delete doc.parentDocument;
        siblings.splice(Math.min(args.newOrder, siblings.length), 0, doc);
        siblings.forEach((entry, index) => { entry.order = index; changed.add(entry._id); });
        if (previousParent !== nextParent) state.documents.filter((entry) => !entry.isArchived && entry.parentDocument === previousParent).sort(sidebarOrder).forEach((entry, index) => { entry.order = index; changed.add(entry._id); });
        result = true;
        break;
      }
      case "updateUserSettings": {
        state.settings ||= { _id: "admin-settings", _creationTime: now, userId: "admin" };
        for (const key of METHOD_ARGS.updateUserSettings) if (Object.hasOwn(args, key)) state.settings[key] = args[key];
        break;
      }
      default: error("Unknown Notion method", 404);
    }
    for (const id of changed) {
      const entry = getDocument(state, id);
      entry.version += 1;
      entry.updatedAt = now;
    }
    validateHierarchy(state);
    state.revision = token();
    await atomicJson(filePath, state);
    return result;
  }

  return {
    filePath, uploadDir, backupDir,
    getSnapshot() { return enqueue(async () => snapshot(await load())); },
    run(method, args, context = {}) {
      validateArgs(method, args);
      const copiedArgs = normalizeUploadReferences(clone(args), context.origin);
      return enqueue(async () => {
        const state = await load();
        const taxonomy = (await readLegacyContent()).taxonomy || { types: [], categories: [] };
        const rawResult = QUERIES.has(method) ? query(method, copiedArgs, state, taxonomy) : await mutate(method, copiedArgs, state, taxonomy);
        const renderResult = (value) => object(value) && Object.hasOwn(value, "title") && Object.hasOwn(value, "_id") ? projectDocumentAssets(value) : value;
        const result = Array.isArray(rawResult) ? rawResult.map(renderResult) : renderResult(rawResult);
        return { result, ...await snapshot(state) };
      });
    },
    publicContent() { return enqueue(async () => overlayPublicContent(await readLegacyContent(), await load())); },
    getPublishedPage(id) {
      requireId(id);
      return enqueue(async () => {
        const state = await load();
        const workspace = publishedWorkspace(await readLegacyContent(), state);
        const document = workspace.documents.get(id);
        if (!document) error("Document not found", 404);
        return { document, navigation: workspace.navigation(id) };
      });
    },
    upload(buffer, name, contentType) {
      string(name, 255, "File name");
      if (!name || [".", ".."].includes(name) || /[/\\\u0000-\u001f\u007f]/.test(name)) error("File name is invalid");
      const mime = String(contentType || "application/octet-stream").split(";", 1)[0].trim().toLowerCase();
      if (!/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(mime)) error("File content type is invalid");
      if (/\.(?:svg|html?|xhtml|m?js|xml)$/i.test(name) || /(?:html|svg|javascript|ecmascript|xml)/.test(mime) || /<(?:!doctype\s+html|html|svg|script)\b/i.test(buffer.subarray(0, 2048).toString("utf8"))) error("Executable file types are not allowed", 415);
      if (buffer.length > MAX_UPLOAD_BYTES) error("Request body too large", 413);
      return enqueue(async () => {
        const state = await load();
        const id = crypto.randomBytes(24).toString("hex");
        await fs.mkdir(uploadDir, { recursive: true, mode: 0o700 });
        const target = path.join(uploadDir, id);
        await fs.writeFile(target, buffer, { mode: 0o600, flag: "wx" });
        state.uploads[id] = { name, size: buffer.length, type: mime };
        state.revision = token();
        try { await atomicJson(filePath, state); } catch (failure) { await fs.unlink(target).catch(() => {}); throw failure; }
        return { url: `/api/notion/files/${id}`, size: buffer.length, name };
      });
    },
    getFile(id, authenticated) {
      if (!/^[a-f0-9]{48}$/.test(id)) error("File not found", 404);
      return enqueue(async () => {
        const state = await load();
        const metadata = state.uploads[id];
        if (!metadata) error("File not found", 404);
        const workspace = publishedWorkspace(await readLegacyContent(), state);
        const publishedReference = [...workspace.documents.values()].some((doc) => referencedFileTokens(doc).has(id));
        if (!authenticated && !publishedReference) error("File not found", 404);
        return { ...metadata, buffer: await fs.readFile(path.join(uploadDir, id)), inline: /^(?:image\/(?:png|jpeg|gif|webp)|audio\/(?:mpeg|ogg|wav)|video\/(?:mp4|webm|ogg))$/.test(metadata.type) };
      });
    }
  };
}

module.exports = { createNotionStore, MAX_UPLOAD_BYTES, SUPPORTED_METHODS: Object.keys(METHOD_ARGS) };
