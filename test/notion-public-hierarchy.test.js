const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const core = fs.readFileSync(path.join(__dirname, "../assets/js/core.js"), "utf8");
const site = fs.readFileSync(path.join(__dirname, "../assets/site.js"), "utf8");
const graphCode = core.slice(core.indexOf("function normalizePublicDocumentPages("), core.indexOf("function normalizePortfolioItems("));
const renderCode = site.slice(site.indexOf("function publicDocumentHref("), site.indexOf("function openPublicDocument("));
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (letter) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[letter]));

function graphHarness() {
  const context = vm.createContext({ escapeHtml, resolveCategoryLabel: (_group, value) => value || "", formatContentTimestamp: (value) => value || "", commentCountSuffix: () => "" });
  vm.runInContext(graphCode + renderCode, context);
  return context;
}
const page = (id, parentDocument, group = "study", extra = {}) => ({ _id: id, sourceId: id, group, title: `Page ${id}`, ...(parentDocument ? { parentDocument } : {}), ...extra });
function payload(nodes, extra = []) {
  const content = { notionPages: nodes, portfolio: [], studyPosts: [], updates: [] };
  const fields = { portfolio: "portfolio", study: "studyPosts", update: "updates" };
  for (const node of [...nodes, ...extra]) content[fields[node.group]].push({ id: node.sourceId, title: node.title, status: node.status || "published" });
  return content;
}

test("public lists nest existing parent, child and grandchild while preserving links", () => {
  const h = graphHarness();
  const content = payload([page("parent"), page("child", "parent"), page("grandchild", "child")]);
  const graph = h.createPublicDocumentGraph(content);
  assert.deepEqual(Array.from(graph.rootsFor("study", content.studyPosts), (item) => item.id), ["parent"]);
  assert.deepEqual(Array.from(graph.ancestors(graph.byId.get("grandchild")), (item) => item._id), ["parent", "child"]);
  const markup = h.publicDocumentBranch("study", content.studyPosts[0], "ROOT", graph);
  assert.match(markup, /<details[^>]*open>/);
  assert.match(markup, /하위 문서 1개/);
  assert.match(markup, /href="#study\/child"/);
  assert.match(markup, /href="#study\/grandchild"/);
  assert.doesNotMatch(markup, /↗/);
  const detail = h.publicDocumentNavigation("study", content.studyPosts[1], graph);
  assert.match(detail, /aria-label="문서 경로"/);
  assert.match(detail, /href="#study\/parent"/);
  assert.match(detail, /href="#study\/grandchild"/);
});

test("filtering out an intermediate parent never hides a matching descendant", () => {
  const h = graphHarness();
  const content = payload([page("parent"), page("child", "parent"), page("grandchild", "child")]);
  const graph = h.createPublicDocumentGraph(content);
  const filtered = content.studyPosts.filter((item) => item.id !== "child");
  assert.deepEqual(Array.from(graph.rootsFor("study", filtered), (item) => item.id), ["parent", "grandchild"]);
  const grandchild = graph.byId.get("grandchild");
  assert.match(h.publicDocumentBreadcrumbs(grandchild, graph), /href="#study\/child"/);
});

test("cross-section children navigate to their own published homepage section", () => {
  const h = graphHarness();
  const content = payload([page("project", null, "portfolio"), page("notes", "project"), page("moment", "notes", "update")]);
  const graph = h.createPublicDocumentGraph(content);
  assert.match(h.publicDocumentNavigation("portfolio", content.portfolio[0], graph), /href="#study\/notes"/);
  assert.match(h.publicDocumentNavigation("update", content.updates[0], graph), /href="#portfolio\/project"/);
  assert.equal(h.publicDocumentHref(graph.byId.get("moment")), "#updates/moment");
  assert.deepEqual(Array.from(graph.rootsFor("study", content.studyPosts), (item) => item.id), ["notes"]);
});

test("private nodes, unsafe ids, duplicate ids and accidental private fields cannot enter public navigation", () => {
  const h = graphHarness();
  const content = payload([page("public", "secret", "study", { title: '<img src=x onerror="evil">', content: "private body", userId: "private" }), page("secret", null, "study", { status: "draft" })]);
  content.notionPages.push(page('bad"id'), page("public", null, "study", { title: "duplicate" }));
  const graph = h.createPublicDocumentGraph(content);
  assert.deepEqual(Array.from(graph.byId.keys()), ["public"]);
  assert.equal(graph.byId.get("public").parentDocument, undefined);
  assert.equal(graph.byId.get("public").content, undefined);
  assert.equal(graph.byId.get("public").userId, undefined);
  const markup = h.publicDocumentLink(graph.byId.get("public"), graph);
  assert.doesNotMatch(markup, /<img|private body|secret/);
  assert.match(markup, /&lt;img/);
});

test("corrupt published cycles stay finite and backend sibling order is respected", () => {
  const h = graphHarness();
  const content = payload([page("second", "first"), page("first", "second"), page("last")]);
  content.studyPosts.reverse();
  const graph = h.createPublicDocumentGraph(content);
  const roots = graph.rootsFor("study", content.studyPosts);
  assert.equal(roots[0].id, "second");
  assert.ok(graph.ancestors(graph.byId.get("first")).length < 3);
  assert.ok(h.publicDocumentChildList(graph.byId.get("second"), graph, { recursive: true }).length < 3000);
});

function refreshHarness() {
  let finishRequest;
  let rejectRequest;
  const requestDone = new Promise((resolve, reject) => { finishRequest = resolve; rejectRequest = reject; });
  const content = { title: "before" };
  const field = { id: "comment-body-study-parent", value: "before request", checked: false, selectionStart: 4, selectionEnd: 4 };
  const fieldMap = new Map([[field.id, field]]);
  const detail = { dataset: { documentKey: "parent" }, open: false };
  const frames = [];
  const listeners = new Map();
  const state = { renders: 0, scroll: null, focused: null, range: null, count: null };
  const context = vm.createContext({
    content, currentPage: "study",
    contentService: { async hydrate() { await requestDone; content.title = "published change"; } },
    document: {
      body: { dataset: { notionWorkspace: "/admin/" } }, activeElement: field,
      querySelectorAll(selector) { return selector.startsWith("iframe") ? frames : selector.includes("input") ? [...fieldMap.values()] : [detail]; },
      getElementById(id) { return fieldMap.get(id) || null; },
      addEventListener(name, fn) { listeners.set(name, fn); }
    },
    window: { scrollY: 321, scrollTo(_x, y) { state.scroll = y; }, addEventListener(name, fn) { listeners.set(name, fn); } },
    $: () => ({ dataset: {} }), publishedStudyPosts: () => [], closeStudyPost: () => {},
    updateCommentCount(key) { state.count = key; },
    publicPageController: { renderAll() {
      state.renders++;
      detail.open = true;
      fieldMap.set(field.id, { id: field.id, value: "", checked: false, focus() { state.focused = field.id; }, setSelectionRange(start, end) { state.range = [start, end]; } });
    } }
  });
  const code = site.slice(site.indexOf("let publicContentReady ="), site.indexOf("function adminEmptyMarkup("));
  vm.runInContext(code + "\npublicContentReady = true;", context);
  return { context, field, fieldMap, detail, frames, state, finishRequest, rejectRequest, listeners };
}

test("publication refresh preserves comment text typed during the request, caret, reading position and collapsed children", async () => {
  const h = refreshHarness();
  const saving = h.context.refreshPublishedContent();
  h.field.value = "late typed comment";
  h.field.selectionStart = 9; h.field.selectionEnd = 11;
  h.finishRequest();
  await saving;
  assert.equal(h.state.renders, 1);
  assert.equal(h.fieldMap.get(h.field.id).value, "late typed comment");
  assert.deepEqual(h.state.range, [9, 11]);
  assert.equal(h.state.focused, h.field.id);
  assert.equal(h.state.scroll, 321);
  assert.equal(h.detail.open, false);
  assert.equal(h.state.count, "study-parent");
  assert.ok(h.listeners.has("storage") && h.listeners.has("focus") && h.listeners.has("visibilitychange"));
});

test("offline automatic publication refresh leaves the reading form intact", async () => {
  const h = refreshHarness();
  const refreshing = h.context.refreshPublishedContent();
  h.rejectRequest(new Error("offline"));
  await refreshing;
  assert.equal(h.state.renders, 0);
  assert.equal(h.fieldMap.get(h.field.id).value, "before request");
});

test("refreshing a long published document preserves its height before restoring the reading position", async () => {
  const h = refreshHarness();
  h.frames.push({ dataset: { notionDocument: "long-document" }, style: { height: "8000px" } });
  h.context.window.scrollY = 6500;
  h.context.window.scrollTo = (_x, y) => {
    h.state.scroll = Math.min(y, Math.max(0, parseInt(h.frames[0].style.height) - 844));
  };
  const render = h.context.publicPageController.renderAll;
  h.context.publicPageController.renderAll = () => {
    render();
    h.frames[0] = { dataset: { notionDocument: "long-document" }, style: { height: "480px" } };
  };
  const refreshing = h.context.refreshPublishedContent();
  h.finishRequest();
  await refreshing;
  assert.equal(h.frames[0].style.height, "8000px");
  assert.equal(h.state.scroll, 6500);
});

test("a publication refresh restores keyboard focus on a renamed child link without an HTML id", async () => {
  const h = refreshHarness();
  let link = {
    tagName: "A", textContent: "old title", dataset: { action: "open-public-document", type: "study", id: "child" },
    getAttribute: (name) => name === "href" ? "#study/child" : null,
    closest: () => null, isConnected: false
  };
  h.context.document.activeElement = link;
  const render = h.context.publicPageController.renderAll;
  h.context.publicPageController.renderAll = () => {
    render();
    link = { ...link, textContent: "updated title", focus() { h.state.focused = "child-link"; } };
  };
  const hiddenLink = { ...link, closest: (selector) => selector.includes("[hidden]") ? { hidden: true } : null, focus() { h.state.focused = "hidden-list-link"; } };
  h.context.document.querySelectorAll = (selector) => selector.startsWith("iframe") ? h.frames : selector.startsWith("details") ? [h.detail]
    : selector.startsWith("a[href]") ? [hiddenLink, link, ...h.fieldMap.values()] : [...h.fieldMap.values()];
  const refreshing = h.context.refreshPublishedContent();
  h.finishRequest();
  await refreshing;
  assert.equal(h.state.focused, "child-link");
  assert.equal(link.textContent, "updated title");
});

test("closing a list internally preserves a deep link while an explicit back action updates it", () => {
  const node = { hidden: false, dataset: {}, setAttribute() {}, classList: { remove() {} } };
  const state = { replaced: [] };
  const context = vm.createContext({ $: () => node, location: { hash: "#study/child" }, history: { replaceState(_state, _title, href) { state.replaced.push(href); } }, trackEvent() {}, activePortfolioProjectId: "project" });
  const studyClose = site.slice(site.indexOf("function closeStudyPost("), site.indexOf("function renderUpdates("));
  const portfolioClose = site.slice(site.indexOf("function closePortfolioProject("), site.indexOf("function renderPortfolioProjectDetail("));
  vm.runInContext(studyClose + portfolioClose, context);
  context.closeStudyPost(false, { updateHash: false });
  assert.deepEqual(state.replaced, []);
  context.closeStudyPost();
  assert.deepEqual(state.replaced, ["#study"]);
  context.location.hash = "#portfolio/project";
  context.closePortfolioProject(false, { updateHash: false });
  assert.equal(state.replaced.length, 1);
  context.closePortfolioProject();
  assert.equal(state.replaced[1], "#portfolio");
});
