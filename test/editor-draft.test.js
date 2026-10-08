const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");

process.env.SKIP_DOTENV = "1";
const { createServer } = require("../server");
const execFileAsync = promisify(execFile);
const ROOT = path.join(__dirname, "..");
const API = "/api/admin/editor-drafts";

function snapshot(key = "portfolio:page:project-one", changes = {}) {
  const separator = key.indexOf(":");
  const type = key.slice(0, separator);
  const suffix = key.slice(separator + 1);
  const id = suffix === "new" ? "" : suffix.slice("page:".length);
  return {
    key, type, editingId: id, editingType: id ? type : "",
    requestedId: id, status: "published", category: "notes", date: "2026-10-01",
    icon: "📄", cover: "", title: "Private recovery title", savedAt: new Date().toISOString(),
    blocks: [{ id: "paragraph-one", kind: "paragraph", collapsed: false, indent: 0, body: "Private recovery body" }],
    ...changes
  };
}

function putPayload(key = "portfolio:page:project-one", changes = {}) {
  return { key, snapshot: snapshot(key), baseSignature: JSON.stringify({ title: "Original" }), expectedVersion: null, ...changes };
}

async function fixture(t, overrides = {}) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "homepage-editor-drafts-"));
  const appDataDir = path.join(tempDir, "private");
  const root = path.join(tempDir, "web");
  await fs.mkdir(appDataDir);
  await fs.mkdir(path.join(root, "assets"), { recursive: true });
  await fs.writeFile(path.join(root, "index.html"), "<h1>Public</h1>");
  await fs.writeFile(path.join(root, "assets", "site.js"), "console.log('public');\n");
  const content = {
    site: { title: "Public site" },
    portfolio: [{ id: "project-one", status: "published", title: "Original", body: "Public body", blocks: [{ id: "old", kind: "paragraph", body: "Public block" }] }],
    studyPosts: [{ id: "study-one", status: "draft", title: "Saved unpublished study" }],
    updates: [{ id: "update-one", status: "published", title: "Published update" }],
    taxonomy: { types: [], categories: [] }, contact: {}, footer: ""
  };
  await fs.writeFile(path.join(appDataDir, "content.json"), JSON.stringify(content));
  const options = {
    root, appDataDir, isProduction: true, sessionCookieSecure: true, allowConsoleOtp: false,
    csrfAllowedOrigins: ["https://thecistus.com"], trustProxy: "none", ...overrides
  };
  let server;
  let baseUrl;
  async function start() {
    server = createServer(options);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  }
  async function close() {
    if (server?.listening) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
  t.after(async () => {
    await close();
    await fs.rm(tempDir, { recursive: true, force: true });
  });
  await start();
  function auth(expiresAt = Date.now() + 60000) {
    const token = crypto.randomUUID();
    const csrfToken = crypto.randomBytes(32).toString("hex");
    server.runtime.sessions.set(token, { username: "admin", csrfToken, expiresAt });
    return { Cookie: `thecistus_session=${token}`, "X-CSRF-Token": csrfToken };
  }
  async function request(method, body, headers = auth(), route = API) {
    return fetch(`${baseUrl}${route}`, {
      method, headers: { "Content-Type": "application/json", Origin: "https://thecistus.com", ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
  }
  async function get(key, headers = auth()) {
    const response = await request("GET", undefined, headers, `${API}?key=${encodeURIComponent(key)}`);
    return { response, data: await response.json() };
  }
  return {
    tempDir, appDataDir, root, request, get, auth,
    get server() { return server; },
    async restart() { await close(); await start(); }
  };
}

test("editor draft APIs require current admin authentication and mutation CSRF/origin", async (t) => {
  const app = await fixture(t);
  for (const method of ["GET", "PUT", "DELETE"]) {
    const response = await app.request(method, method === "GET" ? undefined : putPayload(), {}, `${API}?key=portfolio:page:project-one`);
    assert.equal(response.status, 401, method);
  }
  assert.equal((await app.get("portfolio:page:project-one", app.auth(Date.now() - 1000))).response.status, 401);
  const admin = app.auth();
  for (const method of ["PUT", "DELETE"]) {
    const body = method === "PUT" ? putPayload() : { key: "portfolio:page:project-one", version: "missing" };
    for (const headers of [
      { Cookie: admin.Cookie },
      { ...admin, "X-CSRF-Token": "wrong" },
      { ...admin, Origin: "https://attacker.example" },
      { ...admin, Origin: "" }
    ]) assert.equal((await app.request(method, body, headers)).status, 403);
    assert.equal((await app.request(method, body, { ...admin, "Content-Type": "text/plain" })).status, 415);
  }
  await assert.rejects(fs.access(path.join(app.appDataDir, "editor-drafts.json")));
});

test("editor drafts persist privately across restart without changing published or saved content", async (t) => {
  const app = await fixture(t);
  const publicBefore = await (await app.request("GET", undefined, {}, "/api/content")).json();
  const adminBefore = (await (await app.request("GET", undefined, app.auth(), "/api/admin/content")).json()).content;
  const contentBefore = await fs.readFile(path.join(app.appDataDir, "content.json"));
  const sectionBefore = await fs.readFile(path.join(app.appDataDir, "content", "portfolio.json"));
  assert.deepEqual((await app.get("portfolio:page:project-one")).data, { draft: null });
  const response = await app.request("PUT", putPayload());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const { draft } = await response.json();
  assert.equal(draft.key, "portfolio:page:project-one");
  assert.equal(draft.snapshot.status, "published");
  assert.equal(draft.snapshot.title, "Private recovery title");
  assert.match(draft.version, /^[a-f0-9]{64}$/);
  assert.ok(Number.isFinite(Date.parse(draft.updatedAt)));
  assert.equal((await fs.stat(path.join(app.appDataDir, "editor-drafts.json"))).mode & 0o777, 0o600);
  await app.restart();
  assert.deepEqual((await app.get(draft.key)).data, { draft });
  assert.deepEqual(await (await app.request("GET", undefined, {}, "/api/content")).json(), publicBefore);
  assert.deepEqual((await (await app.request("GET", undefined, app.auth(), "/api/admin/content")).json()).content, adminBefore);
  assert.deepEqual(await fs.readFile(path.join(app.appDataDir, "content.json")), contentBefore);
  assert.deepEqual(await fs.readFile(path.join(app.appDataDir, "content", "portfolio.json")), sectionBefore);
  await assert.rejects(fs.access(path.join(app.appDataDir, "backups")));
  const data = JSON.parse(await fs.readFile(path.join(app.appDataDir, "editor-drafts.json"), "utf8"));
  assert.deepEqual(data, { drafts: { [draft.key]: draft } });
});

test("concurrent draft creates and updates use compare-and-swap and preserve winning data", async (t) => {
  const app = await fixture(t);
  const responses = await Promise.all([app.request("PUT", putPayload()), app.request("PUT", putPayload())]);
  assert.deepEqual(responses.map((response) => response.status).sort(), [200, 409]);
  const winner = await responses.find((response) => response.status === 200).json();
  const winningVersion = winner.draft.version;
  assert.deepEqual((await app.get("portfolio:page:project-one")).data, winner);
  const update = putPayload("portfolio:page:project-one", { expectedVersion: winningVersion });
  update.snapshot.title = "Winning second version";
  const next = await app.request("PUT", update);
  assert.equal(next.status, 200);
  const nextDraft = (await next.json()).draft;
  assert.notEqual(nextDraft.version, winningVersion);
  const stale = await app.request("PUT", putPayload("portfolio:page:project-one", { expectedVersion: winningVersion }));
  assert.equal(stale.status, 409);
  assert.deepEqual(await stale.json(), { error: "Editor draft version conflict" });
  assert.equal((await app.request("PUT", putPayload())).status, 409);
  assert.deepEqual((await app.get("portfolio:page:project-one")).data, { draft: nextDraft });
  const missing = await app.request("PUT", putPayload("study:page:study-one", { expectedVersion: winningVersion }));
  assert.equal(missing.status, 409);
  assert.deepEqual((await app.get("study:page:study-one")).data, { draft: null });
});

test("writes for different sections preserve all drafts and new-page requested IDs", async (t) => {
  const app = await fixture(t);
  const keys = ["portfolio:new", "study:new", "update:new", `portfolio:page:${"a".repeat(128)}`, "portfolio:page:page:new"];
  const responses = await Promise.all(keys.map((key) => {
    const payload = putPayload(key);
    payload.snapshot.requestedId = "typed-new-id";
    return app.request("PUT", payload);
  }));
  assert.deepEqual(responses.map((response) => response.status), [200, 200, 200, 200, 200]);
  for (const key of keys) assert.equal((await app.get(key)).data.draft.snapshot.requestedId, "typed-new-id");
  assert.equal(Object.keys(JSON.parse(await fs.readFile(path.join(app.appDataDir, "editor-drafts.json"), "utf8")).drafts).length, 5);
  assert.deepEqual((await fs.readdir(app.appDataDir)).filter((name) => name.endsWith(".tmp")), []);
});

test("drafts preserve heading3 blocks and underline/strikethrough rich text", async (t) => {
  const app = await fixture(t);
  const payload = putPayload();
  payload.snapshot.blocks = [
    { id: "heading-three", kind: "heading3", indent: 0, collapsed: false, body: "Heading three" },
    { id: "rich-paragraph", kind: "paragraph", body: "<u>Underlined</u> and <s>struck text</s>" }
  ];
  const response = await app.request("PUT", payload);
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).draft.snapshot.blocks, payload.snapshot.blocks);
  assert.deepEqual((await app.get(payload.key)).data.draft.snapshot.blocks, payload.snapshot.blocks);
});

test("new-page slots and existing pages whose ID is new have independent drafts and deletes", async (t) => {
  const app = await fixture(t);
  for (const section of ["portfolio", "study", "update"]) {
    const slotKey = `${section}:new`;
    const pageKey = `${section}:page:new`;
    const slotPayload = putPayload(slotKey);
    slotPayload.snapshot.title = "Unsaved new page";
    const pagePayload = putPayload(pageKey);
    pagePayload.snapshot.title = "Existing page with ID new";
    const responses = await Promise.all([app.request("PUT", slotPayload), app.request("PUT", pagePayload)]);
    assert.deepEqual(responses.map((response) => response.status), [200, 200]);
    const [slot, page] = await Promise.all(responses.map((response) => response.json()));
    assert.notEqual(slot.draft.version, page.draft.version);
    assert.equal(slot.draft.snapshot.editingId, "");
    assert.equal(page.draft.snapshot.editingId, "new");
    assert.deepEqual((await app.get(slotKey)).data, slot);
    assert.deepEqual((await app.get(pageKey)).data, page);
    assert.equal((await app.request("DELETE", { key: pageKey, version: slot.draft.version })).status, 409);
    assert.equal((await app.request("DELETE", { key: slotKey, version: slot.draft.version })).status, 200);
    assert.deepEqual((await app.get(slotKey)).data, { draft: null });
    assert.deepEqual((await app.get(pageKey)).data, page);
    const recreated = await app.request("PUT", slotPayload);
    assert.equal(recreated.status, 200);
    const recreatedSlot = await recreated.json();
    assert.equal((await app.request("DELETE", { key: pageKey, version: page.draft.version })).status, 200);
    assert.deepEqual((await app.get(pageKey)).data, { draft: null });
    assert.deepEqual((await app.get(slotKey)).data, recreatedSlot);
  }
});

test("group-changing drafts retain source identity and are independent from same-ID destination pages", async (t) => {
  const app = await fixture(t);
  const contentPath = path.join(app.appDataDir, "content.json");
  const content = JSON.parse(await fs.readFile(contentPath, "utf8"));
  content.studyPosts.push({ id: "a", status: "published", title: "Original study page" });
  content.portfolio.push({ id: "a", status: "published", title: "Original portfolio page" });
  await fs.writeFile(contentPath, JSON.stringify(content));
  const publicBefore = await (await app.request("GET", undefined, {}, "/api/content")).json();
  const contentBefore = await fs.readFile(contentPath);
  const sourceKey = "study:page:a";
  const destinationKey = "portfolio:page:a";
  const moving = putPayload(sourceKey, { snapshot: snapshot(sourceKey, { type: "portfolio", title: "Study moving to portfolio" }) });
  const destination = putPayload(destinationKey);
  const responses = await Promise.all([app.request("PUT", moving), app.request("PUT", destination)]);
  assert.deepEqual(responses.map((response) => response.status), [200, 200]);
  const [sourceDraft, destinationDraft] = await Promise.all(responses.map((response) => response.json()));
  assert.equal(sourceDraft.draft.snapshot.type, "portfolio");
  assert.equal(sourceDraft.draft.snapshot.editingType, "study");
  assert.deepEqual((await app.get(sourceKey)).data, sourceDraft);
  assert.deepEqual((await app.get(destinationKey)).data, destinationDraft);
  await app.restart();
  assert.deepEqual((await app.get(sourceKey)).data, sourceDraft);
  for (const editingType of ["portfolio", "update", ""]) {
    const mismatched = { ...moving, expectedVersion: sourceDraft.draft.version, snapshot: { ...moving.snapshot, editingType } };
    assert.equal((await app.request("PUT", mismatched)).status, 400);
  }
  assert.deepEqual((await app.get(sourceKey)).data, sourceDraft);
  assert.equal((await app.request("DELETE", { key: sourceKey, version: destinationDraft.draft.version })).status, 409);
  assert.equal((await app.request("DELETE", { key: sourceKey, version: sourceDraft.draft.version })).status, 200);
  assert.deepEqual((await app.get(sourceKey)).data, { draft: null });
  assert.deepEqual((await app.get(destinationKey)).data, destinationDraft);
  assert.deepEqual(await (await app.request("GET", undefined, {}, "/api/content")).json(), publicBefore);
  assert.deepEqual(await fs.readFile(contentPath), contentBefore);
});

test("draft delete requires the current version and is idempotent once absent", async (t) => {
  const app = await fixture(t);
  const { draft } = await (await app.request("PUT", putPayload())).json();
  const mismatched = await app.request("DELETE", { key: draft.key, version: "stale" });
  assert.equal(mismatched.status, 409);
  assert.deepEqual((await app.get(draft.key)).data, { draft });
  const removed = await app.request("DELETE", { key: draft.key, version: draft.version });
  assert.equal(removed.status, 200);
  assert.deepEqual(await removed.json(), { ok: true });
  assert.deepEqual((await app.get(draft.key)).data, { draft: null });
  assert.equal((await app.request("DELETE", { key: draft.key, version: draft.version })).status, 200);
  assert.equal((await app.request("PUT", putPayload("portfolio:page:project-one", { expectedVersion: draft.version }))).status, 409);
  assert.equal((await app.request("PUT", putPayload())).status, 200);
});

test("draft input rejects unsafe keys, mismatched identities, extra fields and invalid shapes", async (t) => {
  const app = await fixture(t);
  for (const key of ["", "updates:new", "site:new", "portfolio:page:../secret", "portfolio:page:bad id", "portfolio:__new__", "portfolio:project-one", "portfolio:page:", "portfolio:page:" + "x".repeat(129)]) {
    assert.equal((await app.get(key)).response.status, 400, key);
  }
  const invalid = [
    null, [], { ...putPayload(), extra: true }, { ...putPayload(), expectedVersion: undefined },
    { ...putPayload(), expectedVersion: "" }, { ...putPayload(), baseSignature: null },
    putPayload("portfolio:new", { snapshot: snapshot("portfolio:new", { editingId: "new" }) }),
    putPayload("portfolio:page:new", { snapshot: snapshot("portfolio:page:new", { editingId: "" }) }),
    putPayload("portfolio:page:project-one", { snapshot: [] }),
    putPayload("portfolio:page:project-one", { snapshot: snapshot("portfolio:page:project-one", { key: "study:project-one" }) }),
    putPayload("portfolio:page:project-one", { snapshot: snapshot("portfolio:page:project-one", { type: "updates" }) }),
    putPayload("portfolio:page:project-one", { snapshot: snapshot("portfolio:page:project-one", { editingType: "study" }) }),
    putPayload("portfolio:page:project-one", { snapshot: snapshot("portfolio:page:project-one", { editingType: "" }) }),
    putPayload("portfolio:new", { snapshot: snapshot("portfolio:new", { type: "study" }) }),
    putPayload("portfolio:page:project-one", { snapshot: snapshot("portfolio:page:project-one", { editingId: "different" }) }),
    putPayload("portfolio:page:project-one", { snapshot: snapshot("portfolio:page:project-one", { requestedId: "../bad" }) }),
    putPayload("portfolio:page:project-one", { snapshot: snapshot("portfolio:page:project-one", { status: "auto-publish" }) }),
    putPayload("portfolio:page:project-one", { snapshot: snapshot("portfolio:page:project-one", { extra: "hidden" }) }),
    putPayload("portfolio:page:project-one", { snapshot: snapshot("portfolio:page:project-one", { blocks: {} }) }),
    putPayload("portfolio:page:project-one", { snapshot: snapshot("portfolio:page:project-one", { blocks: ["text"] }) }),
    putPayload("portfolio:page:project-one", { snapshot: snapshot("portfolio:page:project-one", { title: "x".repeat(16385) }) }),
    putPayload("portfolio:page:project-one", { snapshot: snapshot("portfolio:page:project-one", { blocks: [{ id: "a", kind: "paragraph", onclick: "secret" }] }) }),
    putPayload("portfolio:page:project-one", { snapshot: snapshot("portfolio:page:project-one", { blocks: [{ id: "a", kind: "todo", items: [{ text: "A", secret: "hidden" }] }] }) }),
    putPayload("portfolio:page:project-one", { snapshot: snapshot("portfolio:page:project-one", { blocks: [{ id: "a", kind: "paragraph", indent: 7 }] }) })
  ];
  for (const payload of invalid) assert.equal((await app.request("PUT", payload)).status, 400);
  for (const payload of [{ key: "portfolio:new", version: null }, { key: "portfolio:new", version: "abc", snapshot: {} }]) {
    assert.equal((await app.request("DELETE", payload)).status, 400);
  }
  assert.equal((await app.request("POST", {})).status, 405);
  await assert.rejects(fs.access(path.join(app.appDataDir, "editor-drafts.json")));
});

test("draft body size and existing rate-limit/error protections apply", async (t) => {
  const app = await fixture(t);
  assert.equal((await app.request("PUT", putPayload("portfolio:new", { baseSignature: "x".repeat(1024 * 1024) }))).status, 413);
  const admin = app.auth();
  app.server.runtime.rateLimitBuckets.set("admin:editor-drafts:127.0.0.1", { count: 120, resetAt: Date.now() + 60000 });
  const response = await app.request("PUT", putPayload(), admin);
  assert.equal(response.status, 429);
  assert.ok(Number(response.headers.get("retry-after")) > 0);
  assert.equal((await app.get("portfolio:page:project-one")).response.status, 200);
  app.server.runtime.rateLimitBuckets.clear();
  await fs.writeFile(path.join(app.appDataDir, "editor-drafts.json"), "broken private JSON");
  const corrupt = await app.request("PUT", putPayload());
  assert.equal(corrupt.status, 500);
  assert.deepEqual(await corrupt.json(), { error: "Internal Server Error" });
  assert.equal(await fs.readFile(path.join(app.appDataDir, "editor-drafts.json"), "utf8"), "broken private JSON");
});

test("private drafts and server module are excluded from public API and static routes", async (t) => {
  const app = await fixture(t);
  await app.request("PUT", putPayload());
  await fs.mkdir(path.join(app.root, "data"));
  await fs.copyFile(path.join(app.appDataDir, "editor-drafts.json"), path.join(app.root, "data", "editor-drafts.json"));
  await fs.copyFile(path.join(app.appDataDir, "editor-drafts.json"), path.join(app.root, "editor-drafts.json"));
  await fs.writeFile(path.join(app.root, "editor-draft-store.js"), "Private recovery server source\n");
  for (const route of ["/api/editor-drafts?key=portfolio:page:project-one", "/editor-drafts.json", "/data/editor-drafts.json", "/editor-draft-store.js", "/assets/../data/editor-drafts.json", "/assets/%2e%2e/data/editor-drafts.json"]) {
    const response = await app.request("GET", undefined, {}, route);
    assert.equal(response.status, 404, route);
    assert.doesNotMatch(await response.text(), /Private recovery|baseSignature/);
  }
  const publicResponse = await app.request("GET", undefined, {}, "/api/content");
  assert.doesNotMatch(await publicResponse.text(), /Private recovery|baseSignature|editor-drafts/);
});

test("publish artifact includes draft code and excludes private recovery data", async (t) => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "homepage-draft-publish-"));
  t.after(() => fs.rm(tmp, { recursive: true, force: true }));
  const source = path.join(tmp, "source");
  const destination = path.join(tmp, "release");
  await fs.mkdir(path.join(source, "deploy"), { recursive: true });
  await fs.mkdir(path.join(source, "data"));
  await fs.mkdir(path.join(source, "assets", "notion-app"), { recursive: true });
  await fs.writeFile(path.join(source, "assets", "notion-app", "index.html"), "<html>Admin build fixture</html>\n");
  await fs.mkdir(path.join(destination, "data"), { recursive: true });
  for (const filename of ["server.js", "content-store.js", "editor-draft-store.js", "notion-store.js", "notion-content.js", "package.json", "package-lock.json", "index.html", "site.html", "robots.txt", "sitemap.xml", "deploy/publish_node_app.sh"]) {
    await fs.copyFile(path.join(ROOT, filename), path.join(source, filename));
  }
  for (const filename of ["default-content.json", "admin-auth.json"]) await fs.writeFile(path.join(source, "data", filename), "{}\n");
  await fs.writeFile(path.join(source, "data", "editor-drafts.json"), "PRIVATE SOURCE RECOVERY\n");
  await fs.writeFile(path.join(destination, "data", "editor-drafts.json"), "PRIVATE STALE RECOVERY\n");
  await execFileAsync("bash", [path.join(source, "deploy", "publish_node_app.sh"), destination]);
  await fs.access(path.join(destination, "editor-draft-store.js"));
  await assert.rejects(fs.access(path.join(destination, "data", "editor-drafts.json")));
  await assert.rejects(fs.access(path.join(destination, "editor-drafts.json")));
});
