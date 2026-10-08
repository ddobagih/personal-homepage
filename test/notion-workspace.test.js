const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const { promisify } = require("util");
const execFile = promisify(require("child_process").execFile);

process.env.SKIP_DOTENV = "1";
const { createServer, publicContentPayload } = require("../server");
const { referencedFileTokens, renderAssetUrl } = require("../notion-content");
const { MAX_UPLOAD_BYTES, SUPPORTED_METHODS } = require("../notion-store");
const ORIGIN = "https://thecistus.com";
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/UfkAAAAASUVORK5CYII=", "base64");

function sampleContent() {
  return {
    site: { title: "Fixture" },
    portfolio: [{ id: "shared", title: "Published Project", category: "web", status: "published", date: "2026-01-02", icon: "🌱", cover: "/assets/cover.png", blocks: [
      { id: "intro", kind: "paragraph", body: 'Hello <strong>bold</strong> <a href="https://example.com">link</a> <u>under</u><s>strike</s>' },
      { id: "todo", kind: "todo", indent: 1, items: [{ text: "Done", checked: true }, { text: "Pending", checked: false }] },
      { id: "code", kind: "code", body: "const n = 1;\n  return n;" },
      { id: "photo", kind: "image", url: "/assets/photo.png", caption: "caption" }
    ] }],
    studyPosts: [{ id: "shared", title: "Private Study", category: "notes", status: "draft", body: "Private legacy text" }, { id: "trashed", title: "Recoverable", category: "notes", status: "trash", previousStatus: "published", body: "Recovered text" }],
    updates: [{ id: "moment", title: "Public Moment", category: "updates", status: "published", body: "Moment text" }],
    taxonomy: { types: [{ id: "portfolio", group: "portfolio", label: "Portfolio" }, { id: "study", group: "study", label: "Study" }, { id: "update", group: "update", label: "Moments" }], categories: [{ id: "web", group: "portfolio", label: "Web" }, { id: "notes", group: "study", label: "Notes" }, { id: "updates", group: "update", label: "Updates" }] },
    contact: { email: "" }, footer: "Footer"
  };
}

function nativeText(text) {
  return JSON.stringify([{ id: "paragraph", type: "paragraph", props: {}, content: [{ type: "text", text, styles: {} }], children: [] }]);
}

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "homepage-notion-"));
  const webRoot = path.join(root, "web");
  const dataDir = path.join(root, "private");
  await fs.mkdir(path.join(webRoot, "assets/notion-app"), { recursive: true });
  await fs.mkdir(path.join(webRoot, "admin-src/upstream"), { recursive: true });
  await fs.mkdir(path.join(dataDir, "content"), { recursive: true });
  await fs.writeFile(path.join(webRoot, "index.html"), "Public fixture");
  await fs.writeFile(path.join(webRoot, "assets/notion-app/index.html"), "<html>Native workspace fixture</html>");
  await fs.writeFile(path.join(webRoot, "admin-src/upstream/private.txt"), "Forbidden source sentinel");
  const sample = sampleContent();
  await fs.writeFile(path.join(dataDir, "default-content.json"), JSON.stringify(sample));
  await fs.writeFile(path.join(dataDir, "content.json"), JSON.stringify(sample));
  for (const [key, value] of Object.entries(sample)) await fs.writeFile(path.join(dataDir, "content", `${key}.json`), JSON.stringify(value));
  const config = { root: webRoot, appDataDir: dataDir, isProduction: true, defaultContentPath: path.join(dataDir, "default-content.json"), csrfAllowedOrigins: [ORIGIN], trustProxy: "none", allowConsoleOtp: false };
  const f = { root, dataDir, sample, server: null, baseUrl: "", cookie: "", csrfToken: "" };
  f.start = async () => {
    f.server = createServer(config);
    await new Promise((resolve) => f.server.listen(0, "127.0.0.1", resolve));
    f.baseUrl = `http://127.0.0.1:${f.server.address().port}`;
    const sessionToken = crypto.randomUUID();
    f.csrfToken = crypto.randomBytes(16).toString("hex");
    f.cookie = `thecistus_session=${sessionToken}`;
    f.server.runtime.sessions.set(sessionToken, { username: "admin", csrfToken: f.csrfToken, expiresAt: Date.now() + 60_000 });
  };
  f.stop = async () => {
    if (!f.server) return;
    f.server.closeAllConnections();
    await new Promise((resolve) => f.server.close(resolve));
    f.server = null;
  };
  f.request = (pathname, options = {}) => fetch(f.baseUrl + pathname, options);
  f.headers = () => ({ Cookie: f.cookie, Origin: ORIGIN, "X-CSRF-Token": f.csrfToken, "Content-Type": "application/json" });
  f.snapshot = async () => {
    const response = await f.request("/api/admin/notion", { headers: { Cookie: f.cookie } });
    assert.equal(response.status, 200);
    return response.json();
  };
  f.post = (method, args, extra = {}) => f.request(`/api/admin/notion/${method}`, { method: "POST", headers: f.headers(), body: JSON.stringify(args), ...extra });
  f.call = async (method, args = {}) => {
    const response = await f.post(method, args);
    const payload = await response.json();
    assert.equal(response.status, 200, JSON.stringify(payload));
    return payload;
  };
  f.change = async (method, id, fields = {}) => {
    const doc = (await f.snapshot()).documents.find((entry) => entry._id === id);
    assert.ok(doc);
    return f.call(method, { id, expectedVersion: doc.version, ...fields });
  };
  f.create = async (title, fields = {}) => (await f.call("create", { title, ...fields })).result;
  f.publicContent = async () => (await (await f.request("/api/content")).json()).content;
  f.published = async (id) => f.request(`/api/notion/documents/${id}`);
  f.disk = () => fs.readFile(path.join(dataDir, "notion-documents.json"), "utf8");
  f.sources = async () => {
    const sources = {};
    for (const name of ["content.json", "default-content.json", ...Object.keys(sample).map((key) => `content/${key}.json`)]) sources[name] = await fs.readFile(path.join(dataDir, name), "utf8");
    return sources;
  };
  f.upload = (name, type, buffer = PNG, extra = {}) => f.request("/api/admin/notion/files", { method: "PUT", headers: { ...f.headers(), "Content-Type": type, "X-File-Name": encodeURIComponent(name) }, body: buffer, ...extra });
  await f.start();
  t.after(async () => { await f.stop(); await fs.rm(root, { recursive: true, force: true }); });
  return f;
}

test("native workspace copies legacy rich content without changing original files or public output and persists across restart", async (t) => {
  const f = await fixture(t);
  const sources = await f.sources();
  const before = await f.publicContent();
  const { notionPages, ...legacyBefore } = before;
  const { notionPages: ignoredPages, ...legacyExpected } = publicContentPayload(f.sample);
  assert.deepEqual(legacyBefore, legacyExpected);
  assert.deepEqual(notionPages.map((node) => node.title).sort(), ["Public Moment", "Published Project"]);
  const snapshot = await f.snapshot();
  assert.match(snapshot.revision, /^[a-f0-9]{64}$/);
  assert.equal(snapshot.csrfToken, f.csrfToken);
  assert.equal(snapshot.settings, null);
  assert.deepEqual(snapshot.taxonomy, f.sample.taxonomy);
  assert.equal(snapshot.documents.length, 4);
  const doc = snapshot.documents.find((entry) => entry.group === "portfolio");
  assert.equal(doc.sourceId, "shared");
  assert.notEqual(doc._id, snapshot.documents.find((entry) => entry.group === "study")._id);
  const blocks = JSON.parse(doc.content);
  assert.equal(blocks[0].content.find((entry) => entry.text === "bold").styles.bold, true);
  assert.equal(blocks[0].content.find((entry) => entry.type === "link").href, "https://example.com");
  assert.equal(blocks[0].content.find((entry) => entry.text === "under").styles.underline, true);
  assert.equal(blocks[0].content.find((entry) => entry.text === "strike").styles.strike, true);
  assert.deepEqual(blocks[0].children.map((entry) => [entry.type, entry.props.checked]), [["checkListItem", true], ["checkListItem", false]]);
  assert.equal(blocks[1].type, "codeBlock");
  assert.equal(blocks[1].content[0].text, "const n = 1;\n  return n;");
  assert.equal(Object.hasOwn(blocks[2], "content"), false);
  const published = await (await f.published(doc._id)).json();
  assert.equal(published.document.title, doc.title);
  assert.equal(Object.hasOwn(published.document, "userId"), false);
  assert.equal(Object.hasOwn(published.document, "version"), false);
  const privateDoc = snapshot.documents.find((entry) => entry.title === "Private Study");
  assert.equal((await f.published(privateDoc._id)).status, 404);
  assert.equal((await fs.stat(path.join(f.dataDir, "notion-documents.json"))).mode & 0o777, 0o600);
  assert.deepEqual(await f.sources(), sources);
  await f.stop();
  await f.start();
  const restarted = await f.snapshot();
  assert.equal(restarted.revision, snapshot.revision);
  assert.deepEqual(restarted.documents, snapshot.documents);
  assert.deepEqual(await f.publicContent(), before);
});

test("native API preserves auth, origin, CSRF, body limits, rate limits and private static boundaries", async (t) => {
  const f = await fixture(t);
  assert.equal((await f.request("/api/admin/notion")).status, 401);
  assert.equal((await f.post("create", { title: "Denied" }, { headers: { "Content-Type": "application/json" } })).status, 401);
  await assert.rejects(fs.access(path.join(f.dataDir, "notion-documents.json")), { code: "ENOENT" });
  assert.equal((await f.post("create", { title: "Denied" }, { headers: { ...f.headers(), "X-CSRF-Token": "wrong" } })).status, 403);
  assert.equal((await f.post("create", { title: "Denied" }, { headers: { ...f.headers(), Origin: "https://evil.example" } })).status, 403);
  assert.equal((await f.post("create", { title: "Denied" }, { headers: { ...f.headers(), "Content-Type": "text/plain" } })).status, 415);
  assert.equal((await f.post("create", {}, { body: "{" })).status, 400);
  assert.equal((await f.post("create", {}, { body: "x".repeat(1024 * 1024 + 1) })).status, 413);
  assert.equal((await f.post("unknown", {})).status, 404);
  const bucket = [...f.server.runtime.rateLimitBuckets.values()][0];
  assert.ok(bucket);
  for (const entry of f.server.runtime.rateLimitBuckets.values()) entry.count = 300;
  assert.equal((await f.post("create", { title: "Rate limited" })).status, 429);
  for (const pathname of ["/admin-src/upstream/private.txt", "/notion-store.js", "/notion-content.js", "/data/notion-documents.json", "/notion-documents.json", "/notion-uploads/file"]) assert.equal((await f.request(pathname)).status, 404, pathname);
  for (const pathname of ["/admin", "/admin/", "/admin/documents/a", "/preview/a"]) {
    const response = await f.request(pathname);
    assert.equal(response.status, 200, pathname);
    assert.match(await response.text(), /Native workspace fixture/);
  }
});

test("original document/settings queries and mutations retain result shapes and allow source fonts and native metadata", async (t) => {
  const f = await fixture(t);
  const methods = new Set(SUPPORTED_METHODS);
  assert.equal(methods.size, 21);
  const id = await f.create("My page");
  let doc = (await f.snapshot()).documents.find((entry) => entry._id === id);
  assert.equal(doc.group, "study");
  assert.equal(doc.category, "notes");
  assert.equal(doc.fullWidth, true);
  assert.equal(doc.showToc, true);
  assert.equal(doc.isPublished, false);
  assert.equal(doc.version, 1);
  assert.equal((await f.call("getById", { documentId: id })).result._id, id);
  assert.ok((await f.call("getSidebar")).result.some((entry) => entry._id === id));
  assert.ok((await f.call("getSearch")).result.some((entry) => entry._id === id));
  assert.deepEqual((await f.call("getTaxonomy")).result, f.sample.taxonomy);
  assert.equal((await f.call("getUserSettings")).result, null);
  assert.equal((await f.call("updateUserSettings", { editorFont: "Lora", focusMode: true })).result, null);
  assert.equal((await f.call("getUserSettings")).result.editorFont, "Lora");
  assert.equal((await f.call("updateUserSettings", { editorFont: "JetBrains Mono" })).settings.focusMode, true);
  const body = nativeText("Native body");
  assert.equal((await f.change("update", id, { content: body, icon: "📚", coverImage: "/assets/image.png", editorFont: "JetBrains Mono", smallText: true, fullWidth: false, showToc: false, group: "portfolio", category: "web", date: "2026-10-01" })).result, null);
  assert.equal((await f.change("toggleFavorite", id)).result, null);
  assert.ok((await f.call("getFavorites")).result.some((entry) => entry._id === id));
  await f.change("markOpened", id);
  assert.equal((await f.call("getRecentlyOpened")).result[0]._id, id);
  const duplicate = (await f.change("duplicate", id)).result;
  doc = (await f.snapshot()).documents.find((entry) => entry._id === duplicate);
  assert.equal(doc.title, "My page (Copy)");
  assert.equal(doc.content, body);
  assert.equal(doc.group, "portfolio");
  assert.equal(doc.isFavorite, false);
  assert.equal(doc.isPublished, false);
  await f.change("removeIcon", id);
  await f.change("removeCoverImage", id);
  doc = (await f.snapshot()).documents.find((entry) => entry._id === id);
  assert.equal(Object.hasOwn(doc, "icon"), false);
  assert.equal(Object.hasOwn(doc, "coverImage"), false);
  for (const gradient of ["linear-gradient(135deg, #f87171, #fb923c)", "linear-gradient(135deg, #fbbf24, #a3e635)", "linear-gradient(135deg, #34d399, #22d3ee)", "linear-gradient(135deg, #60a5fa, #a78bfa)", "linear-gradient(135deg, #f472b6, #fb923c)", "linear-gradient(135deg, #a78bfa, #60a5fa)", "linear-gradient(135deg, #1e293b, #475569)", "linear-gradient(135deg, #f87171, #a78bfa)", "#f87171"]) {
    await f.change("update", id, { coverImage: gradient });
    assert.equal((await f.call("getById", { documentId: id })).result.coverImage, gradient);
  }
  doc = (await f.snapshot()).documents.find((entry) => entry._id === id);
  const disk = await f.disk();
  for (const coverImage of ["linear-gradient(90deg, #fff, #000)", "url(https://example.com/a.png)", "linear-gradient(135deg, url(javascript:alert(1)), #f87171)"]) assert.equal((await f.post("update", { id, expectedVersion: doc.version, coverImage })).status, 400);
  assert.equal((await f.post("updateUserSettings", { editorFont: "Comic Sans" })).status, 400);
  assert.equal(await f.disk(), disk);
});

test("same-document concurrent writes have one winner, stale attempts preserve disk, and independent documents can save", async (t) => {
  const f = await fixture(t);
  const sources = await f.sources();
  const id = await f.create("Conflict page");
  const writes = await Promise.all([f.post("update", { id, expectedVersion: 1, title: "First contender" }), f.post("update", { id, expectedVersion: 1, title: "Second contender" })]);
  assert.deepEqual(writes.map((entry) => entry.status).sort(), [200, 409]);
  const snapshot = await f.snapshot();
  const doc = snapshot.documents.find((entry) => entry._id === id);
  assert.equal(doc.version, 2);
  assert.ok(["First contender", "Second contender"].includes(doc.title));
  const disk = await f.disk();
  assert.equal((await f.post("update", { id, expectedVersion: 1, title: "Stale" })).status, 409);
  assert.equal((await f.post("update", { id, title: "Missing version" })).status, 428);
  assert.equal((await f.post("update", { id, expectedVersion: "2", title: "String version" })).status, 428);
  assert.equal(await f.disk(), disk);
  assert.deepEqual(await f.sources(), sources);
  const second = await f.create("Independent");
  const simultaneous = await Promise.all([f.post("update", { id, expectedVersion: 2, title: "Saved independent A" }), f.post("update", { id: second, expectedVersion: 1, title: "Saved independent B" })]);
  assert.deepEqual(simultaneous.map((entry) => entry.status), [200, 200]);
  for (const response of simultaneous) {
    const saved = await response.json();
    assert.match(saved.revision, /^[a-f0-9]{64}$/);
    assert.equal(saved.documents.find((entry) => entry._id === id).version, 3);
  }
  const current = await f.snapshot();
  await f.stop(); await f.start();
  assert.deepEqual(await f.snapshot().then(({ csrfToken, ...value }) => value), { documents: current.documents, settings: current.settings, revision: current.revision, taxonomy: current.taxonomy });
});

test("explicit publication overlays legacy source IDs while autosave keeps published title/body/icon/cover snapshots", async (t) => {
  const f = await fixture(t);
  const sources = await f.sources();
  const initial = await f.snapshot();
  const id = initial.documents.find((entry) => entry.group === "portfolio")._id;
  const publicBefore = await f.publicContent();
  const documentBefore = (await (await f.published(id)).json()).document;
  await f.change("update", id, { title: "Private title", content: nativeText("Private native body"), icon: "🔒", coverImage: "/assets/private.png" });
  assert.deepEqual(await f.publicContent(), publicBefore);
  assert.deepEqual((await (await f.published(id)).json()).document, documentBefore);
  await f.change("update", id, { isPublished: true });
  let published = (await (await f.published(id)).json()).document;
  assert.equal(published.title, "Private title");
  assert.equal(published.icon, "🔒");
  assert.equal(published.coverImage, "/assets/private.png");
  assert.equal(published.content, nativeText("Private native body"));
  let content = await f.publicContent();
  assert.equal(content.portfolio.length, 1);
  assert.equal(content.portfolio[0].id, "shared");
  assert.equal(content.portfolio[0].notionDocumentId, id);
  await f.change("update", id, { title: "Unpublished edit", content: nativeText("Unpublished body"), icon: "✏️", coverImage: "/assets/edited.png", group: "study", category: "notes" });
  assert.deepEqual((await (await f.published(id)).json()).document, published);
  assert.deepEqual(await f.publicContent(), content);
  const doc = (await f.snapshot()).documents.find((entry) => entry._id === id);
  const disk = await f.disk();
  assert.equal((await f.post("update", { id, expectedVersion: doc.version - 1, isPublished: true })).status, 409);
  assert.equal(await f.disk(), disk);
  await f.change("update", id, { isPublished: true });
  published = (await (await f.published(id)).json()).document;
  assert.equal(published.group, "study");
  assert.equal(published.title, "Unpublished edit");
  content = await f.publicContent();
  assert.equal(content.portfolio.length, 0);
  assert.equal(content.studyPosts[0].notionDocumentId, id);
  assert.equal(content.studyPosts[0].id, "shared");
  await f.change("update", id, { isPublished: false });
  assert.equal((await f.published(id)).status, 404);
  assert.equal((await f.publicContent()).studyPosts.length, 0);
  assert.deepEqual(await f.sources(), sources);
});

test("hierarchy mutations reject cycles/orphans and recursively archive/restore with versions and recover initial trash", async (t) => {
  const f = await fixture(t);
  const parent = await f.create("Parent");
  const child = await f.create("Child", { parentDocument: parent });
  const grandchild = await f.create("Grandchild", { parentDocument: child });
  for (const id of [parent, child, grandchild]) await f.change("update", id, { isPublished: true });
  const original = await f.snapshot();
  const parentVersion = original.documents.find((entry) => entry._id === parent).version;
  const disk = await f.disk();
  assert.equal((await f.post("update", { id: parent, expectedVersion: parentVersion, parentDocument: grandchild })).status, 409);
  assert.equal((await f.post("update", { id: parent, expectedVersion: parentVersion, parentDocument: parent })).status, 409);
  assert.equal((await f.post("create", { title: "Orphan", parentDocument: "missing" })).status, 404);
  assert.equal(await f.disk(), disk);
  await f.change("archive", parent);
  const archived = await f.snapshot();
  for (const id of [parent, child, grandchild]) {
    const doc = archived.documents.find((entry) => entry._id === id);
    assert.equal(doc.isArchived, true);
    assert.equal(doc.version, original.documents.find((entry) => entry._id === id).version + 1);
    assert.equal((await f.published(id)).status, 404);
  }
  assert.equal((await f.post("create", { title: "Invalid child", parentDocument: parent })).status, 409);
  assert.ok((await f.call("getTrash")).result.some((entry) => entry._id === grandchild));
  await f.change("restore", parent);
  for (const id of [parent, child, grandchild]) assert.equal((await f.published(id)).status, 200);
  await f.change("archive", parent);
  await f.change("restore", child);
  const restored = await f.snapshot();
  assert.equal(Object.hasOwn(restored.documents.find((entry) => entry._id === child), "parentDocument"), false);
  assert.equal(restored.documents.find((entry) => entry._id === grandchild).isArchived, false);
  assert.equal(restored.documents.find((entry) => entry._id === parent).isArchived, true);
  const initialTrash = restored.documents.find((entry) => entry.sourceId === "trashed");
  await f.change("restore", initialTrash._id);
  assert.equal((await f.published(initialTrash._id)).status, 200);
});

test("reorder increments affected sibling versions and permanent trash deletion backs up complete private state", async (t) => {
  const f = await fixture(t);
  const parent = await f.create("Parent");
  const first = await f.create("First", { parentDocument: parent });
  const second = await f.create("Second", { parentDocument: parent });
  const before = await f.snapshot();
  assert.equal((await f.change("reorder", first, { parentDocument: parent, newOrder: 0 })).result, true);
  const siblings = (await f.call("getSidebar", { parentDocument: parent })).result;
  assert.deepEqual(siblings.map((entry) => entry._id), [first, second]);
  for (const doc of siblings) assert.equal(doc.version, before.documents.find((entry) => entry._id === doc._id).version + 1);
  assert.equal((await f.post("update", { id: second, expectedVersion: 1, title: "Stale sibling" })).status, 409);
  assert.equal((await f.post("remove", { id: parent, expectedVersion: 1 })).status, 409);
  await f.change("archive", parent);
  const archived = await f.disk();
  assert.equal((await f.change("remove", parent)).result, null);
  const remaining = await f.snapshot();
  assert.equal(remaining.documents.some((entry) => [parent, first, second].includes(entry._id)), false);
  const backups = await fs.readdir(path.join(f.dataDir, "notion-backups"));
  assert.equal(backups.length, 1);
  const backup = path.join(f.dataDir, "notion-backups", backups[0]);
  assert.deepEqual(JSON.parse(await fs.readFile(backup, "utf8")), JSON.parse(archived));
  assert.equal((await fs.stat(backup)).mode & 0o777, 0o600);
});

test("removeAll requires current global revision so new archived pages are retained after stale confirmation", async (t) => {
  const f = await fixture(t);
  const first = await f.create("First trash");
  const second = await f.create("Later trash");
  await f.change("archive", first);
  const stale = await f.snapshot();
  await f.change("archive", second);
  const disk = await f.disk();
  assert.equal((await f.post("removeAll", {})).status, 428);
  assert.equal((await f.post("removeAll", { expectedRevision: stale.revision })).status, 409);
  assert.equal(await f.disk(), disk);
  await assert.rejects(fs.access(path.join(f.dataDir, "notion-backups")), { code: "ENOENT" });
  const current = await f.snapshot();
  const result = await f.call("removeAll", { expectedRevision: current.revision });
  assert.equal(result.result, true);
  assert.equal(result.documents.some((entry) => entry.isArchived), false);
  assert.ok(result.documents.some((entry) => entry.isPublished));
  const backup = (await fs.readdir(path.join(f.dataDir, "notion-backups")))[0];
  const saved = JSON.parse(await fs.readFile(path.join(f.dataDir, "notion-backups", backup), "utf8"));
  assert.ok(saved.documents.some((entry) => entry._id === second));
});

test("uploads enforce auth/CSRF/origin/10MB/type/name rules and published relative references control anonymous access", async (t) => {
  const f = await fixture(t);
  assert.equal((await f.upload("a.png", "image/png", PNG, { headers: { "Content-Type": "image/png", "X-File-Name": "a.png" } })).status, 401);
  assert.equal((await f.upload("a.png", "image/png", PNG, { headers: { ...f.headers(), "Content-Type": "image/png", "X-File-Name": "a.png", "X-CSRF-Token": "wrong" } })).status, 403);
  assert.equal((await f.upload("a.png", "image/png", PNG, { headers: { ...f.headers(), "Content-Type": "image/png", "X-File-Name": "a.png", Origin: "https://evil.example" } })).status, 403);
  assert.equal((await f.upload("big.png", "image/png", Buffer.alloc(MAX_UPLOAD_BYTES + 1))).status, 413);
  for (const [name, type, bytes] of [["file.svg", "image/svg+xml", Buffer.from("<svg/>")], ["file.html", "text/plain", Buffer.from("<html/>")], ["file.js", "text/plain", Buffer.from("alert(1)")], ["payload.txt", "text/plain", Buffer.from("<script>alert(1)</script>")]]) assert.equal((await f.upload(name, type, bytes)).status, 415);
  assert.equal((await f.upload("../a.png", "image/png")).status, 400);
  assert.equal((await f.upload("a.png", "image/png", PNG, { headers: { ...f.headers(), "Content-Type": "image/png", "X-File-Name": "%ZZ" } })).status, 400);
  const uploadResponse = await f.upload("테스트.png", "image/png");
  assert.equal(uploadResponse.status, 200);
  const upload = await uploadResponse.json();
  assert.match(upload.url, /^\/api\/notion\/files\/[a-f0-9]{48}$/);
  assert.equal(upload.size, PNG.length);
  assert.equal(upload.name, "테스트.png");
  const token = upload.url.split("/").at(-1);
  const privateFile = path.join(f.dataDir, "notion-uploads", token);
  assert.equal((await fs.stat(privateFile)).mode & 0o777, 0o600);
  assert.equal((await f.request(upload.url)).status, 404);
  assert.equal((await f.request(upload.url, { headers: { Cookie: f.cookie } })).status, 200);
  const id = await f.create("Image page");
  const imageContent = (url) => JSON.stringify([{ id: "image", type: "image", props: { url, caption: "Image" }, children: [] }]);
  await f.change("update", id, { content: imageContent(`https://evil.example${upload.url}`), coverImage: `https://evil.example${upload.url}`, isPublished: true });
  assert.equal((await f.call("getById", { documentId: id })).result.coverImage, `https://evil.example${upload.url}`);
  assert.equal((await f.request(upload.url)).status, 404);
  assert.equal(referencedFileTokens({ content: imageContent(`https://evil.example${upload.url}`) }).has(token), false);
  await f.change("update", id, { content: imageContent(`${ORIGIN}${upload.url}`), coverImage: `${ORIGIN}${upload.url}` });
  const normalized = (await f.snapshot()).documents.find((entry) => entry._id === id);
  assert.equal(normalized.coverImage, upload.url);
  assert.equal(JSON.parse(normalized.content)[0].props.url, upload.url);
  assert.equal((await f.request(upload.url)).status, 404);
  const linked = [{ type: "paragraph", content: [{ type: "link", href: `${ORIGIN}${upload.url}`, content: [{ type: "text", text: "File", styles: {} }] }], children: [{ type: "image", props: { url: `${ORIGIN}${upload.url}` }, children: [] }] }];
  await f.change("update", id, { content: JSON.stringify(linked) });
  const normalizedLinks = JSON.parse((await f.call("getById", { documentId: id })).result.content);
  assert.equal(normalizedLinks[0].content[0].href, upload.url);
  assert.equal(normalizedLinks[0].children[0].props.url, upload.url);
  await f.change("update", id, { content: imageContent(upload.url) });
  assert.equal((await f.request(upload.url)).status, 404);
  await f.change("update", id, { isPublished: true });
  const anonymous = await f.request(upload.url);
  assert.equal(anonymous.status, 200);
  assert.equal(anonymous.headers.get("content-type"), "image/png");
  assert.match(anonymous.headers.get("content-disposition"), /^inline;/);
  assert.deepEqual(Buffer.from(await anonymous.arrayBuffer()), PNG);
  const head = await f.request(upload.url, { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");
  const duplicate = (await f.change("duplicate", id)).result;
  await f.change("update", duplicate, { isPublished: true });
  await f.change("update", id, { isPublished: false });
  assert.equal((await f.request(upload.url)).status, 200);
  await f.change("archive", duplicate);
  assert.equal((await f.request(upload.url)).status, 404);
  assert.equal((await f.request(upload.url, { method: "DELETE", headers: f.headers() })).status, 405);
  await fs.access(privateFile);
  const pdf = await (await f.upload("paper.pdf", "application/pdf", Buffer.from("%PDF-fixture"))).json();
  const pdfResponse = await f.request(pdf.url, { headers: { Cookie: f.cookie } });
  assert.equal(pdfResponse.status, 200);
  assert.equal(pdfResponse.headers.get("content-type"), "application/octet-stream");
  assert.match(pdfResponse.headers.get("content-disposition"), /^attachment;/);
});

test("unsafe native content/fields fail without writes while supported native table, styles and all heading levels remain valid", async (t) => {
  const f = await fixture(t);
  const id = await f.create("Validation page");
  const disk = await f.disk();
  const bad = ["{", "{}", JSON.stringify([{ type: "script" }]), JSON.stringify([{ type: "paragraph", content: [{ type: "link", href: "javascript:alert(1)", content: [] }] }]), JSON.stringify([{ type: "image", props: { url: "data:image/png;base64,AAAA" } }]), '[{"type":"paragraph","props":{"__proto__":{}}}]'];
  for (const content of bad) assert.equal((await f.post("update", { id, expectedVersion: 1, content })).status, 400);
  assert.equal((await f.post("update", { id, expectedVersion: 1, userId: "other" })).status, 400);
  assert.equal((await f.post("update", { id, expectedVersion: 1, origin: "https://evil.example" })).status, 400);
  assert.equal((await f.post("update", { id, expectedVersion: 1, group: "updates" })).status, 400);
  assert.equal(await f.disk(), disk);
  const content = JSON.stringify([{ type: "heading", props: { level: 6 }, content: [{ type: "text", text: "Heading", styles: { underline: true, strike: true } }], children: [] }, { type: "table", content: { type: "tableContent", rows: [{ cells: [{ type: "tableCell", content: [{ type: "text", text: "Cell", styles: {} }] }] }] }, children: [] }]);
  await f.change("update", id, { content });
  assert.equal((await f.call("getById", { documentId: id })).result.content, content);
});

test("backup restore CLI uses current revision and modifies only an isolated fixture", async (t) => {
  const f = await fixture(t);
  await f.snapshot();
  const nativeBefore = await f.disk();
  const cliRoot = path.join(f.root, "restore-fixture");
  await fs.mkdir(path.join(cliRoot, "data"), { recursive: true });
  const oldContent = sampleContent();
  const restored = sampleContent();
  restored.portfolio[0].title = "Restored title";
  await fs.writeFile(path.join(cliRoot, "data/default-content.json"), JSON.stringify(oldContent));
  await fs.writeFile(path.join(cliRoot, "data/content.json"), JSON.stringify(oldContent));
  const backup = path.join(cliRoot, "restore.json");
  await fs.writeFile(backup, JSON.stringify(restored));
  const result = await execFile(process.execPath, [path.join(__dirname, "../scripts/restore-content-backup.js"), backup], { cwd: cliRoot });
  assert.match(result.stdout, /Restored content/);
  assert.equal(JSON.parse(await fs.readFile(path.join(cliRoot, "data/content.json"), "utf8")).portfolio[0].title, "Restored title");
  assert.ok((await fs.readdir(path.join(cliRoot, "data/backups"))).length > 0);
  assert.equal(await f.disk(), nativeBefore);
});

test("published three-level navigation uses snapshot routes/titles, inherits parent metadata and supports cross-group children", async (t) => {
  const f = await fixture(t);
  const sources = await f.sources();
  const root = await f.create("Public parent", { group: "portfolio", category: "web" });
  const child = await f.create("Public child", { parentDocument: root });
  const grandchild = await f.create("Cross-group leaf", { parentDocument: child, group: "update", category: "updates" });
  const privateChild = await f.create("Never published child", { parentDocument: root });
  let snapshot = await f.snapshot();
  assert.equal(snapshot.documents.find((doc) => doc._id === child).group, "portfolio");
  assert.equal(snapshot.documents.find((doc) => doc._id === child).category, "web");
  assert.equal(snapshot.documents.find((doc) => doc._id === grandchild).group, "update");
  assert.equal(snapshot.documents.find((doc) => doc._id === grandchild).category, "updates");
  for (const id of [root, child, grandchild]) await f.change("update", id, { isPublished: true });
  const rootPage = await (await f.published(root)).json();
  assert.deepEqual(rootPage.navigation.ancestors, []);
  assert.deepEqual(rootPage.navigation.children.map((node) => node._id), [child]);
  const childPage = await (await f.published(child)).json();
  assert.deepEqual(childPage.navigation.ancestors.map((node) => node._id), [root]);
  assert.deepEqual(childPage.navigation.children.map((node) => node._id), [grandchild]);
  const leafPage = await (await f.published(grandchild)).json();
  assert.deepEqual(leafPage.navigation.ancestors.map((node) => node._id), [root, child]);
  assert.deepEqual(leafPage.navigation.children, []);
  const nodes = (await f.publicContent()).notionPages;
  assert.equal(nodes.find((node) => node._id === child).parentDocument, root);
  assert.equal(nodes.find((node) => node._id === grandchild).parentDocument, child);
  assert.equal(nodes.find((node) => node._id === grandchild).group, "update");
  assert.equal(nodes.some((node) => node._id === privateChild), false);
  assert.equal(nodes.find((node) => node._id === child).order, null);
  assert.deepEqual(Object.keys(nodes.find((node) => node._id === child)).sort(), ["_id", "group", "icon", "order", "parentDocument", "sourceId", "title"]);
  await f.change("update", root, { title: "Private renamed parent", content: nativeText("Private parent body"), icon: "🔒", group: "study", category: "notes" });
  snapshot = await f.snapshot();
  const rootDoc = snapshot.documents.find((doc) => doc._id === root);
  assert.equal(rootDoc.dirty, true);
  assert.deepEqual(rootDoc.publishedRoute, { group: "portfolio", sourceId: root });
  const publicLeaf = await (await f.published(grandchild)).json();
  assert.equal(publicLeaf.navigation.ancestors[0].title, "Public parent");
  assert.equal(publicLeaf.navigation.ancestors[0].group, "portfolio");
  assert.doesNotMatch(JSON.stringify(await f.publicContent()), /Private renamed parent|Private parent body|Never published child/);
  await f.change("update", root, { isPublished: true });
  const republished = (await f.snapshot()).documents.find((doc) => doc._id === root);
  assert.equal(republished.dirty, false);
  assert.deepEqual(republished.publishedRoute, { group: "study", sourceId: root });
  assert.deepEqual(await f.sources(), sources);
});

test("draft, archived and orphan ancestors expose no IDs/titles and visible children attach to their nearest public ancestor", async (t) => {
  const f = await fixture(t);
  const root = await f.create("Public root");
  const hidden = await f.create("Private ancestor secret", { parentDocument: root });
  const child = await f.create("Visible leaf", { parentDocument: hidden });
  await f.change("update", root, { isPublished: true });
  await f.change("update", child, { isPublished: true });
  let page = await (await f.published(child)).json();
  assert.deepEqual(page.navigation.ancestors.map((node) => node._id), [root]);
  assert.equal(page.document.parentDocument, root);
  assert.doesNotMatch(JSON.stringify(page), new RegExp(`${hidden}|Private ancestor secret`));
  assert.doesNotMatch(JSON.stringify(await f.publicContent()), new RegExp(`${hidden}|Private ancestor secret`));
  assert.equal((await f.published(hidden)).status, 404);
  await f.change("update", root, { isPublished: false });
  page = await (await f.published(child)).json();
  assert.deepEqual(page.navigation.ancestors, []);
  assert.equal(Object.hasOwn(page.document, "parentDocument"), false);
  assert.equal(Object.hasOwn((await f.publicContent()).notionPages.find((node) => node._id === child), "parentDocument"), false);
  assert.doesNotMatch(JSON.stringify(page), new RegExp(`${root}|${hidden}`));
  await f.change("update", root, { isPublished: true });
  await f.change("update", hidden, { isPublished: true });
  const filePath = path.join(f.dataDir, "notion-documents.json");
  const state = JSON.parse(await f.disk());
  state.documents.find((doc) => doc._id === hidden).isArchived = true;
  await fs.writeFile(filePath, JSON.stringify(state), { mode: 0o600 });
  page = await (await f.published(child)).json();
  assert.deepEqual(page.navigation.ancestors.map((node) => node._id), [root]);
  assert.doesNotMatch(JSON.stringify(page), new RegExp(`${hidden}|Private ancestor secret`));
  const orphaned = JSON.parse(await f.disk());
  orphaned.published[child].parentDocument = "missing-private-parent";
  await fs.writeFile(filePath, JSON.stringify(orphaned), { mode: 0o600 });
  page = await (await f.published(child)).json();
  assert.deepEqual(page.navigation.ancestors, []);
  assert.equal(Object.hasOwn(page.document, "parentDocument"), false);
  assert.doesNotMatch(JSON.stringify(page), /missing-private-parent/);
});

test("published parent/order remain fixed during private reparent/reorder and dirty ignores favorites/opened/version changes", async (t) => {
  const f = await fixture(t);
  const root = await f.create("Root");
  const otherRoot = await f.create("Other root");
  const first = await f.create("First", { parentDocument: root });
  const second = await f.create("Second", { parentDocument: root });
  for (const id of [root, otherRoot, first, second]) await f.change("update", id, { isPublished: true });
  assert.equal((await f.snapshot()).documents.find((doc) => doc._id === first).dirty, false);
  await f.change("toggleFavorite", first);
  await f.change("markOpened", first);
  assert.equal((await f.snapshot()).documents.find((doc) => doc._id === first).dirty, false);
  const before = (await (await f.published(root)).json()).navigation.children.map((node) => node._id);
  await f.change("reorder", first, { parentDocument: root, newOrder: 0 });
  assert.equal((await f.snapshot()).documents.find((doc) => doc._id === first).dirty, true);
  assert.deepEqual((await (await f.published(root)).json()).navigation.children.map((node) => node._id), before);
  for (const id of [first, second]) await f.change("update", id, { isPublished: true });
  const ordered = (await (await f.published(root)).json()).navigation.children;
  assert.deepEqual(ordered.map((node) => [node._id, node.order]), [[first, 0], [second, 1]]);
  await f.change("update", first, { parentDocument: otherRoot });
  assert.deepEqual((await (await f.published(first)).json()).navigation.ancestors.map((node) => node._id), [root]);
  assert.equal((await f.snapshot()).documents.find((doc) => doc._id === first).dirty, true);
  await f.change("update", first, { isPublished: true });
  assert.deepEqual((await (await f.published(first)).json()).navigation.ancestors.map((node) => node._id), [otherRoot]);
  await f.change("update", first, { parentDocument: null });
  assert.deepEqual((await (await f.published(first)).json()).navigation.ancestors.map((node) => node._id), [otherRoot]);
  await f.change("update", first, { isPublished: true });
  assert.deepEqual((await (await f.published(first)).json()).navigation.ancestors, []);
});

test("legacy snapshots migrate only structural fields once and keep private titles/content out of public navigation after restart", async (t) => {
  const f = await fixture(t);
  const sources = await f.sources();
  const parent = await f.create("Published parent", { group: "portfolio", category: "web" });
  const child = await f.create("Published child", { parentDocument: parent });
  for (const id of [parent, child]) await f.change("update", id, { isPublished: true });
  await f.change("update", child, { title: "Draft title secret", content: nativeText("Draft body secret") });
  const old = JSON.parse(await f.disk());
  const versions = old.documents.map((doc) => [doc._id, doc.version]);
  const oldSnapshots = JSON.parse(JSON.stringify(old.published));
  for (const snapshot of Object.values(old.published)) { delete snapshot.parentDocument; delete snapshot.order; }
  await fs.writeFile(path.join(f.dataDir, "notion-documents.json"), JSON.stringify(old), { mode: 0o600 });
  const page = await (await f.published(child)).json();
  assert.equal(page.document.title, "Published child");
  assert.equal(page.document.content, oldSnapshots[child].content);
  assert.deepEqual(page.navigation.ancestors.map((node) => node._id), [parent]);
  assert.doesNotMatch(JSON.stringify(page), /Draft title secret|Draft body secret/);
  const migrated = JSON.parse(await f.disk());
  assert.equal(migrated.published[child].parentDocument, parent);
  assert.equal(migrated.published[parent].parentDocument, null);
  assert.equal(migrated.published[child].order, null);
  assert.equal(migrated.published[child].title, oldSnapshots[child].title);
  assert.equal(migrated.published[child].content, oldSnapshots[child].content);
  assert.notEqual(migrated.revision, old.revision);
  assert.deepEqual(migrated.documents.map((doc) => [doc._id, doc.version]), versions);
  assert.equal((await fs.stat(path.join(f.dataDir, "notion-documents.json"))).mode & 0o777, 0o600);
  const migratedDisk = await f.disk();
  await f.snapshot();
  assert.equal(await f.disk(), migratedDisk);
  await f.change("update", child, { parentDocument: null });
  assert.deepEqual((await (await f.published(child)).json()).navigation.ancestors.map((node) => node._id), [parent]);
  await f.stop(); await f.start();
  assert.deepEqual((await (await f.published(child)).json()).navigation.ancestors.map((node) => node._id), [parent]);
  assert.deepEqual(await f.sources(), sources);
});

test("separate published hierarchy snapshots can form cycles and are safely projected without leaking draft nodes", async (t) => {
  const f = await fixture(t);
  const first = await f.create("First root");
  const second = await f.create("Second child", { parentDocument: first });
  for (const id of [first, second]) await f.change("update", id, { isPublished: true });
  await f.change("update", second, { parentDocument: null });
  await f.change("update", first, { parentDocument: second, isPublished: true });
  const nodes = (await f.publicContent()).notionPages.filter((node) => [first, second].includes(node._id));
  assert.equal(nodes.filter((node) => !node.parentDocument).length, 1);
  for (const id of [first, second]) {
    const response = await f.published(id);
    assert.equal(response.status, 200);
    const page = await response.json();
    assert.ok(page.navigation.ancestors.length <= 1);
    assert.equal(page.navigation.ancestors.some((node) => node._id === id), false);
    assert.equal(page.navigation.children.some((node) => node._id === id), false);
  }
});

test("unmanaged legacy notionPages include only still-public source items and preserve the raw legacy lists", async (t) => {
  const f = await fixture(t);
  const initial = await f.snapshot();
  const id = initial.documents.find((doc) => doc.group === "portfolio")._id;
  const legacy = JSON.parse(await fs.readFile(path.join(f.dataDir, "content/portfolio.json"), "utf8"));
  legacy[0].status = "draft";
  legacy[0].title = "Legacy private title";
  await fs.writeFile(path.join(f.dataDir, "content/portfolio.json"), JSON.stringify(legacy));
  const publicContent = await f.publicContent();
  assert.equal(publicContent.portfolio.length, 0);
  assert.equal(publicContent.notionPages.some((node) => node._id === id), false);
  assert.doesNotMatch(JSON.stringify(publicContent), /Legacy private title/);
  assert.equal((await f.published(id)).status, 404);
});

test("legacy asset links resolve to homepage PDF from admin/preview projections without changing stored content, publication or source data", async (t) => {
  const f = await fixture(t);
  const asset = "hanium-dreamup-overview.pdf";
  const assetUrl = `./assets/${asset}`;
  const rootedUrl = `/assets/${asset}`;
  const pdfBytes = Buffer.from("%PDF-1.4\nFixture PDF\n");
  await fs.writeFile(path.join(f.root, "web/assets", asset), pdfBytes);
  const legacy = JSON.parse(await fs.readFile(path.join(f.dataDir, "content/portfolio.json"), "utf8"));
  legacy[0].blocks = [{ id: "pdf-link", kind: "paragraph", body: `<a href="${assetUrl}">Read the overview</a>` }, { id: "pdf-file", kind: "file", url: assetUrl, title: "Overview" }];
  legacy[0].cover = "./assets/cover.png";
  await fs.writeFile(path.join(f.dataDir, "content/portfolio.json"), JSON.stringify(legacy));
  const sources = await f.sources();
  const initial = await f.snapshot();
  const id = initial.documents.find((doc) => doc.group === "portfolio")._id;
  const diskBefore = await f.disk();
  const stored = JSON.parse(diskBefore);
  const rawContent = stored.documents.find((doc) => doc._id === id).content;
  assert.match(rawContent, /\.\/assets\/hanium-dreamup-overview\.pdf/);
  assert.equal(stored.published[id].content, rawContent);
  const originalRouteError = await f.request(`/admin/assets/${asset}`);
  assert.equal(originalRouteError.status, 200);
  assert.match(originalRouteError.headers.get("content-type"), /text\/html/);
  const privateDoc = initial.documents.find((doc) => doc._id === id);
  const readLink = (doc) => JSON.parse(doc.content)[0].content.find((entry) => entry.type === "link").href;
  assert.equal(readLink(privateDoc), rootedUrl);
  assert.equal(JSON.parse(privateDoc.content)[1].props.url, rootedUrl);
  assert.equal(privateDoc.coverImage, "/assets/cover.png");
  assert.equal(privateDoc.dirty, false);
  const byId = await f.call("getById", { documentId: id });
  assert.equal(readLink(byId.result), rootedUrl);
  const sidebar = await f.call("getSidebar");
  assert.equal(readLink(sidebar.result.find((doc) => doc._id === id)), rootedUrl);
  const publicPage = await (await f.published(id)).json();
  assert.equal(readLink(publicPage.document), rootedUrl);
  for (const base of [`${f.baseUrl}/admin/`, `${f.baseUrl}/admin/documents/${id}`, `${f.baseUrl}/preview/${id}`]) {
    const resolved = new URL(readLink(publicPage.document), base);
    assert.equal(resolved.pathname, rootedUrl);
    const pdf = await fetch(resolved);
    assert.equal(pdf.status, 200);
    assert.equal(pdf.headers.get("content-type"), "application/pdf");
    assert.deepEqual(Buffer.from(await pdf.arrayBuffer()), pdfBytes);
  }
  assert.equal(await f.disk(), diskBefore);
  assert.deepEqual(await f.sources(), sources);
  await f.change("update", id, { title: "Private title stays private" });
  assert.equal((await (await f.published(id)).json()).document.title, "Published Project");
  await f.change("update", id, { isPublished: true });
  const republished = JSON.parse(await f.disk());
  assert.equal(republished.documents.find((doc) => doc._id === id).content, rawContent);
  assert.equal(republished.published[id].content, rawContent);
  assert.equal(republished.published[id].coverImage, "./assets/cover.png");
  assert.equal(readLink((await (await f.published(id)).json()).document), rootedUrl);
  const current = (await f.snapshot()).documents.find((doc) => doc._id === id);
  const beforeStale = await f.disk();
  assert.equal((await f.post("update", { id, expectedVersion: current.version - 1, content: nativeText("Stale body") })).status, 409);
  assert.equal(await f.disk(), beforeStale);
  await f.stop(); await f.start();
  assert.equal(readLink((await f.snapshot()).documents.find((doc) => doc._id === id)), rootedUrl);
  assert.equal(readLink((await (await f.published(id)).json()).document), rootedUrl);
  assert.equal(await f.disk(), beforeStale);
  assert.deepEqual(await f.sources(), sources);
});

test("asset render projection preserves external URLs, anchors, uploads and storage while bounding encoded asset traversal", async (t) => {
  const f = await fixture(t);
  const id = await f.create("URL boundary fixture");
  const token = "a".repeat(48);
  const links = ["./assets/file.pdf#page=2", "./assets/file%20name.pdf?download=1", "https://example.com/assets/file.pdf", "#document-anchor", `/api/notion/files/${token}`, `https://foreign.example/api/notion/files/${token}`, "./assets/../../data/notion-documents.json", "./assets/%2e%2e/%2e%2e/data/notion-documents.json", "./assets/folder/%2e%2e/%2e%2e/%2e%2e/data/notion-documents.json", "./assets/%2f..%2f..%2fdata/notion-documents.json", "./assets/%5c..%5cdata/notion-documents.json", "./assets/%00file.pdf"];
  const content = JSON.stringify([{ type: "paragraph", content: links.map((href) => ({ type: "link", href, content: [{ type: "text", text: href, styles: {} }] })), children: [{ type: "table", content: { type: "tableContent", rows: [{ cells: [{ type: "tableCell", content: [{ type: "link", href: "./assets/table.pdf", content: [{ type: "text", text: "Table PDF", styles: {} }] }] }] }] }, children: [] }] }]);
  await f.change("update", id, { content, coverImage: "./assets/image.png", isPublished: true });
  const diskBefore = await f.disk();
  const doc = (await f.snapshot()).documents.find((entry) => entry._id === id);
  const projected = JSON.parse(doc.content);
  assert.deepEqual(projected[0].content.map((entry) => entry.href), ["/assets/file.pdf#page=2", "/assets/file%20name.pdf?download=1", ...links.slice(2)]);
  assert.equal(projected[0].children[0].content.rows[0].cells[0].content[0].href, "/assets/table.pdf");
  assert.equal(doc.coverImage, "/assets/image.png");
  assert.equal(doc.dirty, false);
  assert.deepEqual(JSON.parse((await (await f.published(id)).json()).document.content), projected);
  assert.equal((await f.request(`/api/notion/files/${token}`)).status, 404);
  assert.equal((await f.request("/data/notion-documents.json")).status, 404);
  assert.equal((await f.request("/admin-src/upstream/private.txt")).status, 404);
  assert.equal(renderAssetUrl("javascript:alert(1)"), "javascript:alert(1)");
  for (const href of ["javascript:alert(1)", "data:text/html,payload", "//evil.example/file.pdf"]) {
    const unsafe = JSON.stringify([{ type: "paragraph", content: [{ type: "link", href, content: [] }] }]);
    assert.equal((await f.post("update", { id, expectedVersion: doc.version, content: unsafe })).status, 400);
  }
  assert.equal(await f.disk(), diskBefore);
  const stored = JSON.parse(diskBefore);
  assert.equal(stored.documents.find((entry) => entry._id === id).content, content);
  assert.equal(stored.published[id].content, content);
});
