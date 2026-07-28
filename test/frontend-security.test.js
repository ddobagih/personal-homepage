const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs/promises");
const path = require("path");

async function read(file) {
  return fs.readFile(path.join(__dirname, "..", file), "utf8");
}

test("frontend splits public/admin content APIs and sends CSRF on unsafe admin requests", async () => {
  const core = await read("assets/js/core.js");
  const site = await read("assets/site.js");

  assert.match(core, /const PUBLIC_CONTENT_API_URL = "\/api\/content";/);
  assert.match(core, /const ADMIN_CONTENT_API_URL = "\/api\/admin\/content";/);
  assert.match(core, /const ADMIN_CONTENT_RESET_API_URL = "\/api\/admin\/content\/reset";/);
  assert.doesNotMatch(core, /const CONTENT_RESET_API_URL/);
  assert.match(core, /csrfToken: ""/);

  assert.match(site, /authState\.authenticated \? ADMIN_CONTENT_API_URL : PUBLIC_CONTENT_API_URL/);
  assert.match(site, /requestJson\(ADMIN_CONTENT_API_URL/);
  assert.match(site, /requestJson\(ADMIN_CONTENT_RESET_API_URL/);
  assert.match(site, /headers\["X-CSRF-Token"\] = authState\.csrfToken/);
  assert.ok(
    site.indexOf("await hydrateAuthSession();") < site.indexOf("await Promise.all([hydrateContentFromServer(), hydrateCommentsFromServer()]);")
  );
});

test("admin login/logout refreshes content scope after session changes", async () => {
  const site = await read("assets/site.js");
  assert.match(site, /authState\.applySessionPayload\(payload\);\s*await contentService\.hydrate\(\);/s);
  assert.match(site, /authState\.clear\(\);\s*try \{\s*await contentService\.hydrate\(\);/s);
  assert.match(site, /payload\.deliveryMode === "console"/);
});



test("HTML and generated markup use delegated handlers instead of inline event attributes", async () => {
  const html = await read("index.html");
  const site = await read("assets/site.js");
  const inlineHandlerPattern = /\son(?:click|submit|change|input|keydown|keyup|mousedown|mouseup|dragstart|dragover|drop)=/i;

  assert.doesNotMatch(html, inlineHandlerPattern);
  assert.doesNotMatch(site, inlineHandlerPattern);
  assert.match(html, /data-action="request-admin-otp"/);
  assert.match(html, /data-submit-action="save-content-draft"/);
  assert.match(site, /data-action="toggle-comment-editor"/);
  assert.match(site, /data-action="select-admin-block-menu-kind"/);
  assert.match(site, /function handleDeclarativeClick/);
  assert.match(site, /document\.addEventListener\("click", handleDeclarativeClick, true\)/);
  assert.match(site, /document\.addEventListener\("submit", handleDeclarativeSubmit, true\)/);
  assert.match(site, /document\.addEventListener\("mousedown", handleDeclarativeMouseDown\)/);
});

test("legacy explicit window exports stay reduced after handler delegation", async () => {
  const site = await read("assets/site.js");
  const explicitExports = [...site.matchAll(/^window\.([A-Za-z_$][\w$]*)\s*=/gm)].map((match) => match[1]);
  const expectedBridgeExports = [
    "showPage",
    "setPortfolioCategory",
    "setStudyCategory"
  ];

  assert.deepEqual(explicitExports, expectedBridgeExports);
});

test("public content helpers live in core before the site script", async () => {
  const core = await read("assets/js/core.js");
  const site = await read("assets/site.js");

  assert.match(core, /function contentTypeMeta\(type\)/);
  assert.match(core, /function publishedPortfolio\(\)/);
  assert.match(core, /function publishedStudyPosts\(\)/);
  assert.match(core, /function publishedUpdates\(\)/);
  assert.doesNotMatch(site, /function contentTypeMeta\(type\)/);
  assert.doesNotMatch(site, /function publishedPortfolio\(\)/);
});

test("public dynamic controls escape ids and portfolio detail moves focus", async () => {
  const site = await read("assets/site.js");
  assert.match(site, /data-action="open-study-post" data-id="\$\{escapeHtml\(post\.id\)\}"/);
  assert.match(site, /data-action="set-portfolio-category" data-category="\$\{escapeHtml\(category\.id\)\}"/);
  assert.match(site, /data-action="set-study-category" data-category="\$\{escapeHtml\(category\.id\)\}"/);
  assert.match(site, /renderPortfolioProjectDetail\(projectId, \{ focus: true \}\)/);
  assert.match(site, /if \(e\.defaultPrevented\) return;/);
});

test("asset cache version was bumped for changed frontend bundles", async () => {
  const html = await read("index.html");
  assert.match(html, /site\.css\?v=20260622-03/);
  assert.match(html, /public\.css\?v=20260716-12/);
  assert.match(html, /admin\.css\?v=20260716-02/);
  assert.match(html, /core\.js\?v=20260716-01/);
  assert.match(html, /site\.js\?v=20260716-13/);
});

test("closed mobile admin drawer is removed from keyboard and accessibility navigation", async () => {
  const site = await read("assets/site.js");
  assert.match(site, /sidebar\.inert = isMobileAdmin && !adminState\.sidebarOpen/);
  assert.match(site, /sidebar\.setAttribute\("aria-hidden", "true"\)/);
  assert.match(site, /ADMIN_DRAWER_MEDIA\.addEventListener\("change", renderAdminShellState\)/);
});

test("public workspace shell is responsive and remains scoped away from admin", async () => {
  const html = await read("index.html");
  const publicCss = await read("assets/public.css");
  const site = await read("assets/site.js");

  assert.match(html, /<body data-current-page="home">/);
  assert.match(html, /data-action="toggle-public-menu"/);
  assert.doesNotMatch(html, /codex-panel|archive\.session|hero-status-line/);
  assert.doesNotMatch(html, /id="contact"/);
  assert.match(html, /data-page="updates"/);
  assert.match(html, /id="home-feed"/);
  assert.doesNotMatch(html, /cosmos-explorer|cosmos-canvas|shooting-star/);
  assert.doesNotMatch(html, /Current focus|Find me/);
  assert.doesNotMatch(html, /id="sidebar-status"|>personal page</i);
  assert.match(publicCss, /body:not\(\[data-current-page="admin"\]\)/);
  assert.match(publicCss, /@media \(max-width: 780px\)/);
  assert.match(site, /document\.body\.dataset\.currentPage = page/);
  assert.match(site, /setPublicMenuOpen\(false\)/);
  assert.match(site, /updates: true/);
  assert.doesNotMatch(site, /cosmos/i);
});
