const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const CONTENT_SECTION_KEYS = ["site", "portfolio", "studyPosts", "updates", "taxonomy", "contact", "footer"];

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function writeJson(filePath, payload) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmpPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await fs.rename(tmpPath, filePath);
}

async function ensureLegacyContentFile(contentPath, defaultContentPath) {
  if (await fileExists(contentPath)) return;
  await fs.mkdir(path.dirname(contentPath), { recursive: true });
  const fallback = await fs.readFile(defaultContentPath, "utf8");
  await fs.writeFile(contentPath, fallback, "utf8");
}

function buildSectionPath(sectionDir, key) {
  return path.join(sectionDir, `${key}.json`);
}

function buildBackupPath(backupDir) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join(backupDir, `content-${stamp}-${crypto.randomUUID()}.json`);
}

function requireContentRevision(revision) {
  if (typeof revision === "string" && /^[a-f0-9]{64}$/.test(revision)) return;
  const error = new Error("Content revision is required");
  error.statusCode = 428;
  throw error;
}

function canonicalContent(value) {
  if (Array.isArray(value)) return value.map(canonicalContent);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalContent(value[key])]));
}

async function contentRevision(contentPath, content) {
  const stat = await fs.stat(contentPath, { bigint: true });
  // Atomic replacement changes the file identity even for an unchanged payload.
  // File metadata survives restart; canonical content also detects section edits.
  return crypto.createHash("sha256")
    .update(JSON.stringify(canonicalContent(content)))
    .update(`\n${stat.dev}:${stat.ino}:${stat.mtimeNs}:${stat.ctimeNs}`)
    .digest("hex");
}

async function bootstrapSectionFiles(sectionDir, sourceContent) {
  await fs.mkdir(sectionDir, { recursive: true });
  await Promise.all(
    CONTENT_SECTION_KEYS.map(async (key) => {
      const target = buildSectionPath(sectionDir, key);
      if (await fileExists(target)) return;
      await writeJson(target, sourceContent?.[key]);
    })
  );
}

async function readSectionContent(sectionDir, fallbackContent) {
  const content = {};
  await Promise.all(
    CONTENT_SECTION_KEYS.map(async (key) => {
      const target = buildSectionPath(sectionDir, key);
      if (await fileExists(target)) {
        content[key] = await readJson(target);
        return;
      }
      content[key] = fallbackContent?.[key];
    })
  );
  return content;
}

function createContentStore({ appDataDir, contentPath, defaultContentPath }) {
  const sectionDir = path.join(appDataDir, "content");
  const backupDir = path.join(appDataDir, "backups");
  let operationQueue = Promise.resolve();

  function enqueue(task) {
    const next = operationQueue.then(task);
    operationQueue = next.catch(() => {});
    return next;
  }

  async function ensureCurrent() {
    await ensureLegacyContentFile(contentPath, defaultContentPath);
    const current = await readJson(contentPath);
    await bootstrapSectionFiles(sectionDir, current);
  }

  async function readCurrent() {
    await ensureCurrent();
    const current = await readJson(contentPath);
    return readSectionContent(sectionDir, current);
  }

  async function readCurrentWithRevision() {
    const content = await readCurrent();
    return { content, revision: await contentRevision(contentPath, content) };
  }

  return {
    async ensureCurrent() {
      return enqueue(ensureCurrent);
    },

    async readCurrent() {
      return enqueue(readCurrent);
    },

    async readExisting() {
      return enqueue(async () => {
        const current = await readJson(await fileExists(contentPath) ? contentPath : defaultContentPath);
        return readSectionContent(sectionDir, current);
      });
    },

    async readCurrentWithRevision() {
      return enqueue(readCurrentWithRevision);
    },

    async readDefault() {
      return readJson(defaultContentPath);
    },

    async writeCurrent(payload, expectedRevision) {
      requireContentRevision(expectedRevision);
      const snapshot = JSON.parse(JSON.stringify(payload));
      return enqueue(async () => {
        const current = await readCurrentWithRevision();
        if (current.revision !== expectedRevision) {
          const error = new Error("Content revision conflict");
          error.statusCode = 409;
          throw error;
        }
        const previous = await readJson(contentPath);
        await writeJson(buildBackupPath(backupDir), previous);
        const results = await Promise.allSettled(
          CONTENT_SECTION_KEYS.map((key) => writeJson(buildSectionPath(sectionDir, key), snapshot?.[key]))
        );
        const failed = results.find((result) => result.status === "rejected");
        if (failed) throw failed.reason;
        await writeJson(contentPath, snapshot);
        return readCurrentWithRevision();
      });
    },

    backupDir,
    sectionDir,
    keys: CONTENT_SECTION_KEYS
  };
}

module.exports = {
  createContentStore,
  CONTENT_SECTION_KEYS,
  requireContentRevision
};
