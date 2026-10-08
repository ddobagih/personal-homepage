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

test("content store bootstraps section files and writes backups atomically", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "homepage-store-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const defaultContentPath = path.join(root, "default-content.json");
  const contentPath = path.join(root, "content.json");
  await fs.writeFile(defaultContentPath, `${JSON.stringify(sampleContent(), null, 2)}\n`, "utf8");

  const store = createContentStore({ appDataDir: root, contentPath, defaultContentPath });
  const current = await store.readCurrent();
  assert.equal(current.portfolio[0].id, "project-one");

  for (const key of CONTENT_SECTION_KEYS) {
    await fs.access(path.join(root, "content", `${key}.json`));
  }

  const { revision } = await store.readCurrentWithRevision();
  await store.writeCurrent(sampleContent("Updated"), revision);
  const updated = await store.readCurrent();
  assert.equal(updated.portfolio[0].title, "Updated");

  const backups = await fs.readdir(path.join(root, "backups"));
  assert.ok(backups.some((name) => name.startsWith("content-") && name.endsWith(".json")));
});

async function revisionStore(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "homepage-revision-store-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const options = { appDataDir: root, contentPath: path.join(root, "content.json"), defaultContentPath: path.join(root, "default-content.json") };
  await fs.writeFile(options.defaultContentPath, JSON.stringify(sampleContent()));
  return { root, options, store: createContentStore(options) };
}

test("content store serializes revision comparison and writes, preserving data after stale attempts", async (t) => {
  const { root, options, store } = await revisionStore(t);
  const before = await store.readCurrentWithRevision();
  assert.match(before.revision, /^[a-f0-9]{64}$/);
  await assert.rejects(store.writeCurrent(sampleContent("Missing revision")), { statusCode: 428 });
  await assert.rejects(fs.access(path.join(root, "backups")));
  const writes = await Promise.allSettled([
    store.writeCurrent(sampleContent("First contender"), before.revision),
    store.writeCurrent(sampleContent("Second contender"), before.revision)
  ]);
  assert.deepEqual(writes.map((write) => write.status), ["fulfilled", "rejected"]);
  assert.equal(writes[1].reason.statusCode, 409);
  const committed = writes[0].value;
  assert.deepEqual(committed.content, sampleContent("First contender"));
  assert.notEqual(committed.revision, before.revision);
  const aggregateBefore = await fs.readFile(options.contentPath, "utf8");
  const sectionsBefore = await Promise.all(CONTENT_SECTION_KEYS.map((key) => fs.readFile(path.join(root, "content", `${key}.json`), "utf8")));
  const backupNames = await fs.readdir(path.join(root, "backups"));
  assert.equal(backupNames.length, 1);
  const backupBefore = await fs.readFile(path.join(root, "backups", backupNames[0]), "utf8");
  await assert.rejects(store.writeCurrent(sampleContent("Stale payload"), before.revision), { statusCode: 409 });
  assert.equal(await fs.readFile(options.contentPath, "utf8"), aggregateBefore);
  assert.deepEqual(await Promise.all(CONTENT_SECTION_KEYS.map((key) => fs.readFile(path.join(root, "content", `${key}.json`), "utf8"))), sectionsBefore);
  assert.deepEqual(await fs.readdir(path.join(root, "backups")), backupNames);
  assert.equal(await fs.readFile(path.join(root, "backups", backupNames[0]), "utf8"), backupBefore);
  const unchanged = await store.writeCurrent(committed.content, committed.revision);
  assert.deepEqual(unchanged.content, committed.content);
  assert.notEqual(unchanged.revision, committed.revision);
  assert.deepEqual(await createContentStore(options).readCurrentWithRevision(), unchanged);
});

test("content reads wait for all split and aggregate writes before returning one coherent revision", async (t) => {
  const { options, store } = await revisionStore(t);
  const before = await store.readCurrentWithRevision();
  const next = sampleContent("Updated portfolio");
  next.site.title = "Updated site";
  next.footer = "Updated footer";
  let blockRename;
  const gate = new Promise((resolve) => { blockRename = resolve; });
  let reachedRename;
  const reached = new Promise((resolve) => { reachedRename = resolve; });
  const rename = fs.rename.bind(fs);
  t.mock.method(fs, "rename", async (source, destination) => {
    if (destination === path.join(options.appDataDir, "content", "site.json")) {
      reachedRename();
      await gate;
    }
    return rename(source, destination);
  });
  const writing = store.writeCurrent(next, before.revision);
  await reached;
  let readResolved = false;
  const reading = store.readCurrentWithRevision().then((value) => { readResolved = true; return value; });
  const plainReading = store.readCurrent();
  await new Promise((resolve) => setImmediate(resolve));
  try {
    assert.equal(readResolved, false);
  } finally {
    blockRename();
  }
  const committed = await writing;
  assert.deepEqual(await reading, committed);
  assert.deepEqual(await plainReading, next);
  assert.deepEqual(committed.content, next);
});

test("content revision ignores object key order and detects independent section edits", async (t) => {
  const { root, options, store } = await revisionStore(t);
  const before = await store.readCurrentWithRevision();
  const same = before.content.portfolio[0];
  const reversed = Object.fromEntries(Object.entries(same).reverse());
  await fs.writeFile(path.join(root, "content", "portfolio.json"), JSON.stringify([reversed]));
  const reordered = await store.readCurrentWithRevision();
  assert.equal(reordered.revision, before.revision);
  reversed.title = "An independent section edit";
  await fs.writeFile(path.join(root, "content", "portfolio.json"), JSON.stringify([reversed]));
  const edited = await createContentStore(options).readCurrentWithRevision();
  assert.notEqual(edited.revision, before.revision);
  await assert.rejects(store.writeCurrent(before.content, before.revision), { statusCode: 409 });
  assert.deepEqual(await store.readCurrentWithRevision(), edited);
  await assert.rejects(fs.access(path.join(root, "backups")));
});
