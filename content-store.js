const fs = require("fs/promises");
const path = require("path");

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
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
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
  return path.join(backupDir, `content-${stamp}.json`);
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

  return {
    async ensureCurrent() {
      await ensureLegacyContentFile(contentPath, defaultContentPath);
      const current = await readJson(contentPath);
      await bootstrapSectionFiles(sectionDir, current);
    },

    async readCurrent() {
      await this.ensureCurrent();
      const current = await readJson(contentPath);
      return readSectionContent(sectionDir, current);
    },

    async readDefault() {
      return readJson(defaultContentPath);
    },

    async writeCurrent(payload) {
      if (await fileExists(contentPath)) {
        const previous = await readJson(contentPath);
        await writeJson(buildBackupPath(backupDir), previous);
      }
      await bootstrapSectionFiles(sectionDir, payload);
      await Promise.all(
        CONTENT_SECTION_KEYS.map((key) => writeJson(buildSectionPath(sectionDir, key), payload?.[key]))
      );
      await writeJson(contentPath, payload);
    },

    backupDir,
    sectionDir,
    keys: CONTENT_SECTION_KEYS
  };
}

module.exports = {
  createContentStore,
  CONTENT_SECTION_KEYS
};
