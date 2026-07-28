const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const { createContentStore, CONTENT_SECTION_KEYS } = require("../content-store");

function sampleContent(title = "Project") {
  return {
    site: { title: "thecistus" },
    portfolio: [{ id: "project-one", title, category: "web" }],
    studyPosts: [],
    updates: [],
    taxonomy: {
      types: [
        { id: "portfolio", label: "Portfolio", group: "portfolio" },
        { id: "study", label: "Study", group: "study" },
        { id: "update", label: "Moments", group: "update" }
      ],
      categories: [
        { id: "web", label: "Web", group: "portfolio" },
        { id: "notes", label: "Notes", group: "study" },
        { id: "updates", label: "Updates", group: "update" }
      ]
    },
    contact: { email: "" },
    footer: "Footer"
  };
}

test("content store bootstraps section files and writes backups atomically", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "homepage-store-"));
  const defaultContentPath = path.join(root, "default-content.json");
  const contentPath = path.join(root, "content.json");
  await fs.writeFile(defaultContentPath, `${JSON.stringify(sampleContent(), null, 2)}\n`, "utf8");

  const store = createContentStore({ appDataDir: root, contentPath, defaultContentPath });
  const current = await store.readCurrent();
  assert.equal(current.portfolio[0].id, "project-one");

  for (const key of CONTENT_SECTION_KEYS) {
    await fs.access(path.join(root, "content", `${key}.json`));
  }

  await store.writeCurrent(sampleContent("Updated"));
  const updated = await store.readCurrent();
  assert.equal(updated.portfolio[0].title, "Updated");

  const backups = await fs.readdir(path.join(root, "backups"));
  assert.ok(backups.some((name) => name.startsWith("content-") && name.endsWith(".json")));
});
