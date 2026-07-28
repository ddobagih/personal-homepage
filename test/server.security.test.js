const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");

process.env.SKIP_DOTENV = "1";
delete process.env.SMTP_URL;
delete process.env.SMTP_HOST;
delete process.env.SMTP_USER;
delete process.env.SMTP_PASS;
delete process.env.SMTP_FROM;

const { createConfig, createServer, validateContentPayload, sessionCookie, clientIp } = require("../server");

let tempDir;
let baseUrl;
let appServer;

function sampleContent() {
  return {
    site: { title: "thecistus" },
    portfolio: [
      { id: "project-one", title: "Published Project", category: "web", status: "published", previousStatus: "draft" },
      { id: "draft-project", title: "Draft Project", category: "draft-only", status: "draft" },
      { id: "trash-project", title: "Trash Project", category: "trash-only", status: "trash", deletedAt: "2026-06-18T00:00:00.000Z" }
    ],
    studyPosts: [
      { id: "study-one", title: "Published Study", category: "notes", status: "published" },
      { id: "draft-study", title: "Draft Study", category: "draft-notes", status: "draft" }
    ],
    updates: [
      { id: "update-one", title: "Published Update", category: "updates", status: "published" },
      { id: "draft-update", title: "Draft Update", category: "draft-updates", status: "draft" }
    ],
    taxonomy: {
      types: [
        { id: "portfolio", label: "Portfolio", group: "portfolio" },
        { id: "study", label: "Study", group: "study" },
        { id: "update", label: "Moments", group: "update" }
      ],
      categories: [
        { id: "web", label: "Web", group: "portfolio" },
        { id: "draft-only", label: "Draft Only", group: "portfolio" },
        { id: "trash-only", label: "Trash Only", group: "portfolio" },
        { id: "notes", label: "Notes", group: "study" },
        { id: "draft-notes", label: "Draft Notes", group: "study" },
        { id: "updates", label: "Updates", group: "update" },
        { id: "draft-updates", label: "Draft Updates", group: "update" }
      ]
    },
    contact: { email: "" },
    footer: "Footer"
  };
}

function minimalContent() {
  return {
    site: { title: "thecistus" },
    portfolio: [{ id: "project-one", title: "Published Project", category: "web", status: "published" }],
    studyPosts: [],
    updates: [],
    taxonomy: {
      types: [
        { id: "portfolio", label: "Portfolio", group: "portfolio" },
        { id: "study", label: "Study", group: "study" },
        { id: "update", label: "Moments", group: "update" }
      ],
      categories: [{ id: "web", label: "Web", group: "portfolio" }]
    },
    contact: { email: "" },
    footer: "Footer"
  };
}

async function jsonFetch(pathname, options = {}) {
  const { headers = {}, ...rest } = options;
  return fetch(`${baseUrl}${pathname}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...headers
    }
  });
}

async function startServer(overrides = {}) {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "homepage-server-"));
  const defaultContentPath = path.join(tempDir, "default-content.json");
  const authTemplatePath = path.join(tempDir, "admin-auth.template.json");
  await fs.writeFile(defaultContentPath, `${JSON.stringify(sampleContent(), null, 2)}\n`, "utf8");
  await fs.writeFile(
    authTemplatePath,
    `${JSON.stringify({ email: "admin@example.com", otpExpiresInMinutes: 10, otpRequestCooldownSeconds: 60 }, null, 2)}\n`,
    "utf8"
  );

  appServer = createServer({
    root: path.join(__dirname, ".."),
    isProduction: true,
    appDataDir: tempDir,
    contentPath: path.join(tempDir, "content.json"),
    defaultContentPath,
    commentsPath: path.join(tempDir, "comments.json"),
    authPath: path.join(tempDir, "admin-auth.json"),
    authTemplatePath,
    maxRequestBodyBytes: 512,
    sessionCookieSecure: true,
    allowConsoleOtp: false,
    trustProxy: "none",
    csrfAllowedOrigins: ["https://thecistus.com"],
    rateLimitMaxBuckets: 100,
    env: { ADMIN_EMAIL: "admin@example.com" },
    ...overrides
  });
  await new Promise((resolve) => appServer.listen(0, "127.0.0.1", resolve));
  const address = appServer.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
}

function createAdminSession() {
  const token = crypto.randomUUID();
  const session = {
    username: "admin",
    csrfToken: crypto.randomBytes(16).toString("hex"),
    expiresAt: Date.now() + 60_000
  };
  appServer.runtime.sessions.set(token, session);
  return {
    cookie: `thecistus_session=${encodeURIComponent(token)}`,
    csrfToken: session.csrfToken
  };
}

test.beforeEach(async () => {
  await startServer();
});

test.afterEach(async () => {
  if (appServer?.listening) {
    await new Promise((resolve) => appServer.close(resolve));
  }
});

test("health and static routes do not expose private files", async () => {
  const health = await fetch(`${baseUrl}/healthz`);
  assert.equal(health.status, 200);
  assert.equal(await health.text(), "ok\n");
  assert.equal(health.headers.get("x-content-type-options"), "nosniff");
  const cspReportOnly = health.headers.get("content-security-policy-report-only") || "";
  assert.match(cspReportOnly, /default-src 'self'/);
  assert.match(cspReportOnly, /script-src-attr 'none'/);
  assert.match(cspReportOnly, /fonts\.googleapis\.com/);
  assert.match(cspReportOnly, /frame-src 'self'.*youtube.*player\.vimeo\.com.*open\.spotify\.com.*docs\.google\.com/);
  assert.doesNotMatch(cspReportOnly, /\bdata:/);
  assert.doesNotMatch(cspReportOnly, /\bblob:/);

  for (const pathname of ["/.env", "/data/admin-auth.json", "/../server.js", "/%2e%2e/server.js"]) {
    const response = await fetch(`${baseUrl}${pathname}`);
    assert.notEqual(response.status, 200, pathname);
  }
});

test("production config requires runtime data outside app and web roots", async () => {
  const safeDataDir = path.join(os.tmpdir(), "thecistus-config-data");
  assert.throws(
    () => createConfig({ root: tempDir, isProduction: true, env: {} }),
    /APP_DATA_DIR is required in production/
  );
  assert.throws(
    () => createConfig({ root: tempDir, isProduction: true, env: { APP_DATA_DIR: "relative-data" } }),
    /APP_DATA_DIR must be an absolute path in production/
  );
  assert.throws(
    () => createConfig({ root: tempDir, isProduction: true, env: { APP_DATA_DIR: path.join(tempDir, "data") } }),
    /APP_DATA_DIR must be outside the app\/web root in production/
  );
  assert.throws(
    () => createConfig({ root: tempDir, isProduction: true, env: { APP_DATA_DIR: "/var/www/thecistus.com/current/data" } }),
    /APP_DATA_DIR must be outside the app\/web root in production/
  );
  assert.throws(
    () => createConfig({
      root: tempDir,
      isProduction: true,
      env: { APP_DATA_DIR: safeDataDir, CONTENT_PATH: path.join(tempDir, "content.json") }
    }),
    /CONTENT_PATH must be inside APP_DATA_DIR in production/
  );
  assert.throws(
    () => createConfig({
      root: tempDir,
      isProduction: true,
      env: { APP_DATA_DIR: safeDataDir, COMMENTS_PATH: path.join(os.tmpdir(), "comments.json") }
    }),
    /COMMENTS_PATH must be inside APP_DATA_DIR in production/
  );
  assert.throws(
    () => createConfig({
      root: tempDir,
      isProduction: true,
      env: { APP_DATA_DIR: safeDataDir, AUTH_PATH: path.join(tempDir, "admin-auth.json") }
    }),
    /AUTH_PATH must be inside APP_DATA_DIR in production/
  );
  assert.equal(
    createConfig({ root: tempDir, isProduction: true, env: { APP_DATA_DIR: safeDataDir } }).appDataDir,
    safeDataDir
  );
});

test("public content API returns only published content and strips admin metadata", async () => {
  const adminOnlyValue = "internal-review-note";
  const current = await appServer.runtime.contentStore.readCurrent();
  current.site.internalFlag = adminOnlyValue;
  current.contact.privateMemo = adminOnlyValue;
  current.portfolio[0].adminNotes = adminOnlyValue;
  current.portfolio[0].secretToken = adminOnlyValue;
  current.portfolio[0].points = ["public point", { secret: adminOnlyValue }];
  current.portfolio[0].tags = ["public-tag", { secret: adminOnlyValue }];
  current.portfolio[0].detail = {
    headline: "Public headline",
    stack: ["Node", { secret: adminOnlyValue }],
    privateMemo: adminOnlyValue,
    media: [{ id: "media-one", label: "Media", href: "/media.pdf", secret: adminOnlyValue }]
  };
  current.portfolio[0].blocks = [
    {
      id: "facts-one",
      kind: "facts",
      title: "Facts",
      adminOnly: adminOnlyValue,
      items: [{ label: "Role", value: "Engineer", secret: adminOnlyValue }]
    },
    {
      id: "links-one",
      kind: "links",
      title: "Links",
      items: [{ id: "link-one", label: "Link", href: "https://example.com", privateToken: adminOnlyValue }]
    }
  ];
  current.portfolio[0].links = [{ id: "link-one", label: "Link", href: "https://example.com", privateToken: adminOnlyValue }];
  current.taxonomy.types[0].adminOnly = adminOnlyValue;
  await appServer.runtime.contentStore.writeCurrent(current);

  const response = await jsonFetch("/api/content", { method: "GET" });
  assert.equal(response.status, 200);
  const payload = await response.json();
  const content = payload.content;

  assert.deepEqual(content.portfolio.map((item) => item.id), ["project-one"]);
  assert.deepEqual(content.studyPosts.map((item) => item.id), ["study-one"]);
  assert.deepEqual(content.updates.map((item) => item.id), ["update-one"]);
  assert.equal("status" in content.portfolio[0], false);
  assert.equal("previousStatus" in content.portfolio[0], false);
  assert.equal("deletedAt" in content.portfolio[0], false);
  assert.equal("adminNotes" in content.portfolio[0], false);
  assert.equal("secretToken" in content.portfolio[0], false);
  assert.equal("internalFlag" in content.site, false);
  assert.equal("privateMemo" in content.contact, false);
  assert.equal("adminOnly" in content.taxonomy.types[0], false);
  assert.deepEqual(content.portfolio[0].points, ["public point"]);
  assert.deepEqual(content.portfolio[0].tags, ["public-tag"]);
  assert.equal(content.portfolio[0].detail.headline, "Public headline");
  assert.deepEqual(content.portfolio[0].detail.stack, ["Node"]);
  assert.equal("privateMemo" in content.portfolio[0].detail, false);
  assert.deepEqual(content.portfolio[0].detail.media[0], { id: "media-one", label: "Media", href: "/media.pdf" });
  assert.equal("adminOnly" in content.portfolio[0].blocks[0], false);
  assert.deepEqual(content.portfolio[0].blocks[0].items[0], { label: "Role", value: "Engineer" });
  assert.deepEqual(content.portfolio[0].blocks[1].items[0], { id: "link-one", label: "Link", href: "https://example.com" });
  assert.deepEqual(content.portfolio[0].links[0], { id: "link-one", label: "Link", href: "https://example.com" });
  assert.equal(content.taxonomy.categories.some((item) => item.id === "draft-only"), false);
  assert.equal(content.taxonomy.categories.some((item) => item.id === "trash-only"), false);
});

test("admin content API requires authentication, trusted origin, and CSRF for writes", async () => {
  const unauthRead = await jsonFetch("/api/admin/content", { method: "GET" });
  assert.equal(unauthRead.status, 401);

  const legacy = await jsonFetch("/api/content/reset", {
    method: "POST",
    body: JSON.stringify({})
  });
  assert.equal(legacy.status, 410);

  const forbidden = await jsonFetch("/api/admin/content", {
    method: "PUT",
    body: JSON.stringify({ content: minimalContent() })
  });
  assert.equal(forbidden.status, 403);

  const unauthorized = await jsonFetch("/api/admin/content", {
    method: "PUT",
    headers: { Origin: "https://thecistus.com" },
    body: JSON.stringify({ content: minimalContent() })
  });
  assert.equal(unauthorized.status, 401);

  const admin = createAdminSession();
  const missingCsrf = await jsonFetch("/api/admin/content", {
    method: "PUT",
    headers: { Origin: "https://thecistus.com", Cookie: admin.cookie },
    body: JSON.stringify({ content: minimalContent() })
  });
  assert.equal(missingCsrf.status, 403);

  const ok = await jsonFetch("/api/admin/content", {
    method: "PUT",
    headers: { Origin: "https://thecistus.com", Cookie: admin.cookie, "X-CSRF-Token": admin.csrfToken },
    body: JSON.stringify({ content: minimalContent() })
  });
  assert.equal(ok.status, 200);
  const payload = await ok.json();
  assert.equal(payload.csrfToken, admin.csrfToken);
});

test("production OTP fails closed when SMTP is missing and verify attempts are rate-limited", async () => {
  const request = await jsonFetch("/api/auth/request-code", {
    method: "POST",
    body: JSON.stringify({})
  });
  assert.equal(request.status, 503);
  const payload = await request.json();
  assert.equal(payload.deliveryMode, "disabled");

  for (let i = 0; i < 10; i += 1) {
    const response = await jsonFetch("/api/auth/verify-code", {
      method: "POST",
      body: JSON.stringify({ code: "000000" })
    });
    assert.equal(response.status, 401);
  }
  const limited = await jsonFetch("/api/auth/verify-code", {
    method: "POST",
    body: JSON.stringify({ code: "000000" })
  });
  assert.equal(limited.status, 429);
});

test("comments allow published targets only and do not leak password hashes", async () => {
  const draftTarget = await jsonFetch("/api/comments", {
    method: "POST",
    body: JSON.stringify({
      targetType: "portfolio",
      targetId: "draft-project",
      nickname: "Tester",
      password: "secret-password",
      body: "초안에는 댓글 불가"
    })
  });
  assert.equal(draftTarget.status, 404);

  const created = await jsonFetch("/api/comments", {
    method: "POST",
    body: JSON.stringify({
      targetType: "portfolio",
      targetId: "project-one",
      nickname: "Tester",
      password: "secret-password",
      body: "좋아요"
    })
  });
  assert.equal(created.status, 201);
  const payload = await created.json();
  assert.equal(payload.comment.nickname, "Tester");
  assert.equal("passwordHash" in payload.comment, false);
  assert.equal("passwordSalt" in payload.comment, false);

  const wrongUpdate = await jsonFetch(`/api/comments/${encodeURIComponent(payload.comment.id)}/update`, {
    method: "POST",
    body: JSON.stringify({ nickname: "Tester", password: "wrong", body: "수정" })
  });
  assert.equal(wrongUpdate.status, 401);

  const updated = await jsonFetch(`/api/comments/${encodeURIComponent(payload.comment.id)}/update`, {
    method: "POST",
    body: JSON.stringify({ nickname: "Tester 2", password: "secret-password", body: "수정" })
  });
  assert.equal(updated.status, 200);

  const wrongDelete = await jsonFetch(`/api/comments/${encodeURIComponent(payload.comment.id)}/delete`, {
    method: "POST",
    body: JSON.stringify({ password: "wrong" })
  });
  assert.equal(wrongDelete.status, 401);

  const deleted = await jsonFetch(`/api/comments/${encodeURIComponent(payload.comment.id)}/delete`, {
    method: "POST",
    body: JSON.stringify({ password: "secret-password" })
  });
  assert.equal(deleted.status, 200);
});

test("comments reject oversized request bodies", async () => {
  const tooLarge = await jsonFetch("/api/comments", {
    method: "POST",
    body: JSON.stringify({ body: "x".repeat(1024) })
  });
  assert.equal(tooLarge.status, 413);
});

test("rate limit buckets are capped when many client keys appear", async () => {
  appServer.runtime.config.trustProxy = "true";
  appServer.runtime.config.rateLimitMaxBuckets = 2;

  for (let i = 0; i < 6; i += 1) {
    const response = await jsonFetch("/api/auth/verify-code", {
      method: "POST",
      headers: { "X-Forwarded-For": `198.51.100.${i}` },
      body: JSON.stringify({ code: "000000" })
    });
    assert.equal(response.status, 401);
  }

  assert.ok(appServer.runtime.rateLimitBuckets.size <= 2);
});

test("security helpers reject unsafe content ids and keep secure proxy/cookie defaults", () => {
  const invalid = sampleContent();
  invalid.portfolio[0].id = "bad'id";
  assert.match(validateContentPayload(invalid), /safe identifier/);
  assert.match(sessionCookie(appServer.runtime, "token", Date.now() + 60_000), /; Secure/);

  const req = {
    headers: { "x-forwarded-for": "1.2.3.4" },
    socket: { remoteAddress: "203.0.113.10" }
  };
  assert.equal(clientIp(appServer.runtime, req), "203.0.113.10");
});
