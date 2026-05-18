const path = require("path");
const fs = require("fs/promises");
const { createContentStore } = require("../content-store");

async function main() {
  const backupArg = process.argv[2];
  if (!backupArg) {
    console.error("Usage: node scripts/restore-content-backup.js <backup-json-path>");
    process.exit(1);
  }

  const cwd = process.cwd();
  const backupPath = path.resolve(cwd, backupArg);
  const raw = await fs.readFile(backupPath, "utf8");
  const payload = JSON.parse(raw);

  const store = createContentStore({
    appDataDir: path.join(cwd, "data"),
    contentPath: path.join(cwd, "data/content.json"),
    defaultContentPath: path.join(cwd, "data/default-content.json")
  });

  await store.writeCurrent(payload);
  console.log(`Restored content from ${backupPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
