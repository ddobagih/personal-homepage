const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const SECTIONS = new Set(["portfolio", "study", "update"]);
const SNAPSHOT_FIELDS = new Set(["key", "type", "editingId", "editingType", "requestedId", "status", "category", "date", "icon", "cover", "title", "blocks", "savedAt"]);
const BLOCK_FIELDS = new Set(["id", "kind", "collapsed", "indent", "kicker", "title", "href", "url", "caption", "description", "body", "tone", "items"]);
const BLOCK_KINDS = new Set(["paragraph", "heading1", "heading2", "heading3", "quote", "divider", "todo", "numbered", "bookmark", "image", "file", "embed", "text", "bullets", "facts", "links", "showcase", "callout", "code", "toggle"]);
const SNAPSHOT_STRING_LIMITS = { key: 160, type: 16, editingId: 128, editingType: 16, requestedId: 128, status: 16, category: 128, date: 64, icon: 256, cover: 8192, title: 16384, savedAt: 64 };
const MAX_TEXT_LENGTH = 262144;
const MAX_ARRAY_LENGTH = 2000;

function fail(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validateFields(value, allowed, label) {
  if (!isObject(value)) fail(`${label} must be an object`);
  if (Object.keys(value).some((field) => !allowed.has(field))) fail(`${label} contains an unsupported field`);
}

function validateString(value, limit, label) {
  if (typeof value !== "string" || value.length > limit) fail(`${label} must be a string of at most ${limit} characters`);
}

function validateVersion(value, label, allowNull = false) {
  if (allowNull && value === null) return;
  validateString(value, 128, label);
  if (!value) fail(`${label} must not be empty`);
}

function createEditorDraftStore({ filePath, isSafeContentId }) {
  let writeQueue = Promise.resolve();

  function validateKey(key) {
    validateString(key, 160, "key");
    const colon = key.indexOf(":");
    const section = key.slice(0, colon);
    const suffix = key.slice(colon + 1);
    if (colon < 0 || !SECTIONS.has(section)) fail("key must be <section>:new or <section>:page:<safe id>");
    if (suffix === "new") return { section, id: "" };
    const id = suffix.startsWith("page:") ? suffix.slice("page:".length) : "";
    if (!isSafeContentId(id)) fail("key must be <section>:new or <section>:page:<safe id>");
    return { section, id };
  }

  function validateBlocks(blocks) {
    if (!Array.isArray(blocks) || blocks.length > MAX_ARRAY_LENGTH) fail("snapshot.blocks must be an array of at most 2000 blocks");
    for (const block of blocks) {
      validateFields(block, BLOCK_FIELDS, "snapshot block");
      if (typeof block.id !== "string" || !isSafeContentId(block.id)) fail("snapshot block.id must be a safe identifier");
      if (!BLOCK_KINDS.has(block.kind)) fail("snapshot block.kind is invalid");
      for (const [field, value] of Object.entries(block)) {
        if (["items", "collapsed", "indent"].includes(field)) continue;
        validateString(value, MAX_TEXT_LENGTH, `snapshot block.${field}`);
      }
      if ("collapsed" in block && typeof block.collapsed !== "boolean") fail("snapshot block.collapsed must be a boolean");
      if ("indent" in block && (!Number.isInteger(block.indent) || block.indent < 0 || block.indent > 6)) fail("snapshot block.indent must be between 0 and 6");
      if ("tone" in block && !["default", "accent"].includes(block.tone)) fail("snapshot block.tone is invalid");
      if (!("items" in block)) continue;
      if (!Array.isArray(block.items) || block.items.length > MAX_ARRAY_LENGTH) fail("snapshot block.items must be an array of at most 2000 items");
      const itemFields = new Set(block.kind === "facts" ? ["label", "value"]
        : ["links", "showcase"].includes(block.kind) ? ["id", "label", "href"]
          : block.kind === "todo" ? ["text", "checked"] : ["text"]);
      for (const item of block.items) {
        if (typeof item === "string") {
          validateString(item, MAX_TEXT_LENGTH, "snapshot block item");
          continue;
        }
        validateFields(item, itemFields, "snapshot block item");
        for (const [field, value] of Object.entries(item)) {
          if (field === "checked") {
            if (typeof value !== "boolean") fail("snapshot block item.checked must be a boolean");
          } else {
            validateString(value, MAX_TEXT_LENGTH, `snapshot block item.${field}`);
          }
        }
      }
    }
  }

  function validatePut(payload) {
    validateFields(payload, new Set(["key", "snapshot", "baseSignature", "expectedVersion"]), "Draft payload");
    const { section, id } = validateKey(payload.key);
    validateString(payload.baseSignature, 1024 * 1024, "baseSignature");
    validateVersion(payload.expectedVersion, "expectedVersion", true);
    const snapshot = payload.snapshot;
    validateFields(snapshot, SNAPSHOT_FIELDS, "snapshot");
    for (const [field, limit] of Object.entries(SNAPSHOT_STRING_LIMITS)) validateString(snapshot[field], limit, `snapshot.${field}`);
    if (!SECTIONS.has(snapshot.type)) fail("snapshot.type is invalid");
    if (snapshot.editingType && !SECTIONS.has(snapshot.editingType)) fail("snapshot.editingType is invalid");
    const identitySection = snapshot.editingId ? snapshot.editingType : snapshot.type;
    if (snapshot.key !== payload.key || identitySection !== section || snapshot.editingId !== id) fail("snapshot identity must match key");
    for (const field of ["editingId", "requestedId", "category"]) {
      if (snapshot[field] && !isSafeContentId(snapshot[field])) fail(`snapshot.${field} must be a safe identifier`);
    }
    if (!["published", "draft", "trash"].includes(snapshot.status)) fail("snapshot.status is invalid");
    validateBlocks(snapshot.blocks);
  }

  async function readFile() {
    let raw;
    try {
      raw = await fs.readFile(filePath, "utf8");
    } catch (error) {
      if (error.code === "ENOENT") return { drafts: {} };
      throw error;
    }
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      // Parser errors can include private draft text in their message.
      throw new Error("Invalid editor draft file");
    }
    if (!isObject(data) || !isObject(data.drafts)) throw new Error("Invalid editor draft file");
    return data;
  }

  async function writeFile(data) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const temporaryPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
    try {
      await fs.writeFile(temporaryPath, `${JSON.stringify(data, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
      await fs.rename(temporaryPath, filePath);
    } finally {
      await fs.unlink(temporaryPath).catch((error) => {
        if (error.code !== "ENOENT") throw error;
      });
    }
  }

  function withWriteLock(task) {
    const next = writeQueue.then(task);
    writeQueue = next.catch(() => {});
    return next;
  }

  return {
    async get(key) {
      validateKey(key);
      await writeQueue;
      const data = await readFile();
      return data.drafts[key] || null;
    },

    async put(payload) {
      validatePut(payload);
      // Copy before queuing so callers cannot mutate a pending snapshot.
      const { key, snapshot, baseSignature, expectedVersion } = JSON.parse(JSON.stringify(payload));
      return withWriteLock(async () => {
        const data = await readFile();
        const current = data.drafts[key] || null;
        if ((current?.version || null) !== expectedVersion) fail("Editor draft version conflict", 409);
        const draft = { key, snapshot, baseSignature, version: crypto.randomBytes(32).toString("hex"), updatedAt: new Date().toISOString() };
        data.drafts[key] = draft;
        await writeFile(data);
        return draft;
      });
    },

    async delete(payload) {
      validateFields(payload, new Set(["key", "version"]), "Draft payload");
      validateKey(payload.key);
      validateVersion(payload.version, "version");
      const { key, version } = payload;
      return withWriteLock(async () => {
        const data = await readFile();
        const current = data.drafts[key] || null;
        if (!current) return;
        if (current.version !== version) fail("Editor draft version conflict", 409);
        delete data.drafts[key];
        await writeFile(data);
      });
    }
  };
}

module.exports = { createEditorDraftStore };
