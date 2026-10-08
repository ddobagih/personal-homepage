const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");

// A small DOM fixture runs the production editor without a server or browser.
const decode = (text) => text.replace(/&(?:amp|lt|gt|quot|#39);/g, (value) => ({
  "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'"
})[value]);

class Element {
  constructor(tagName = "div", attrs = {}) {
    this.nodeType = 1;
    this.tagName = tagName.toUpperCase();
    this.attrs = {};
    this.dataset = {};
    this.childNodes = [];
    this.inert = false;
    this.style = { removeProperty() {} };
    Object.entries(attrs).forEach(([key, value]) => this.setAttribute(key, value));
    this.classList = {
      add: (...names) => { this.attrs.class = [...new Set([...(this.attrs.class || "").split(/\s+/), ...names])].join(" "); },
      remove: (...names) => { this.attrs.class = (this.attrs.class || "").split(/\s+/).filter((name) => !names.includes(name)).join(" "); },
      toggle: (name, active) => active ? this.classList.add(name) : this.classList.remove(name)
    };
  }
  setAttribute(key, value) {
    this.attrs[key] = String(value);
    if (key.startsWith("data-")) this.dataset[key.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = String(value);
    if (key === "value") this.value = String(value);
    if (key === "id") this.id = String(value);
  }
  getAttribute(key) { return this.attrs[key] ?? null; }
  removeAttribute(key) { delete this.attrs[key]; }
  toggleAttribute(key, active) { active ? this.setAttribute(key, "") : this.removeAttribute(key); }
  focus() { if (this.ownerDocument) this.ownerDocument.activeElement = this; }
  get isContentEditable() { return this.editableOverride ?? (this.getAttribute("contenteditable") === "true" || this.parentElement?.isContentEditable === true); }
  set isContentEditable(value) { this.editableOverride = value; }
  get open() { return this.getAttribute("open") !== null; }
  set open(value) { this.toggleAttribute("open", value); }
  setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; }
  closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector) || null; }
  prepend(node) { node.parentElement = this; this.childNodes.unshift(node); }
  remove() { if (this.parentElement) this.parentElement.childNodes = this.parentElement.childNodes.filter((node) => node !== this); }
  contains(target) { return this === target || this.childNodes.some((node) => node === target || node.contains?.(target)); }
  addEventListener() {}
  matches(selector) {
    return selector.split(",").some((part) => {
      const attrs = [...part.matchAll(/\[([^=\]]+)(?:="([^"]*)")?\]/g)];
      if (attrs.some(([, key, value]) => value === undefined ? this.getAttribute(key) === null : this.getAttribute(key) !== value)) return false;
      const basic = part.replace(/\[[^\]]+\]/g, "").trim();
      if (basic.startsWith(".")) return (this.attrs.class || "").split(/\s+/).includes(basic.slice(1));
      if (basic.startsWith("#")) return this.id === basic.slice(1);
      return !basic || this.tagName.toLowerCase() === basic;
    });
  }
  querySelectorAll(selector) {
    return this.childNodes.flatMap((node) => node.nodeType === 1
      ? [...(node.matches(selector) ? [node] : []), ...node.querySelectorAll(selector)] : []);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  get innerText() { return this.childNodes.map((node) => node.tagName === "BR" ? "\n" : node.innerText ?? node.textContent).join(""); }
  get textContent() { return this.innerText; }
  set textContent(value) { this.childNodes = [{ nodeType: 3, textContent: String(value) }]; }
  set innerHTML(value) {
    this.html = String(value);
    this.childNodes = [];
    const stack = [this];
    for (const token of this.html.match(/<\/?[^>]+>|[^<]+/g) || []) {
      if (token.startsWith("</")) { if (stack.length > 1) stack.pop(); continue; }
      if (token.startsWith("<")) {
        const tag = token.match(/^<([\w-]+)/)?.[1];
        if (!tag) continue;
        const attrs = Object.fromEntries([...token.matchAll(/([\w-]+)(?:="([^"]*)")?/g)].slice(1).map(([, key, value]) => [key, decode(value || "")]));
        const element = new Element(tag, attrs);
        element.ownerDocument = stack.at(-1).ownerDocument;
        element.parentElement = stack.at(-1);
        stack.at(-1).childNodes.push(element);
        if (!["br", "input", "img", "hr", "meta", "link"].includes(tag) && !token.endsWith("/>")) stack.push(element);
      } else stack.at(-1).childNodes.push({ nodeType: 3, textContent: decode(token) });
    }
  }
  get innerHTML() {
    return this.childNodes.map((node) => {
      if (node.nodeType === 3) return node.textContent.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const tag = node.tagName.toLowerCase();
      const attrs = Object.entries(node.attrs).map(([key, value]) => ` ${key}="${value}"`).join("");
      return `<${tag}${attrs}>${node.innerHTML}${["br", "input", "img", "hr"].includes(tag) ? "" : `</${tag}>`}`;
    }).join("");
  }
}

function editorHarness() {
  const roots = new Map();
  const listeners = new Map();
  const mediaQueries = new Map();
  const storage = new Map();
  const timers = new Map();
  let timerId = 0;
  const document = {
    body: new Element("body"),
    documentElement: new Element("html"),
    addEventListener() {},
    createElement(tag) { const element = new Element(tag); element.ownerDocument = document; if (tag === "template") element.content = element; return element; },
    createRange() { return { selectNodeContents() {}, collapse() {} }; },
    getElementById(id) { return roots.get(`#${id}`) || null; },
    querySelector(selector) { return roots.get(selector) || this.querySelectorAll(selector)[0] || null; },
    querySelectorAll(selector) { return [...new Set([...roots.values()].flatMap((node) => [...(node.matches(selector) ? [node] : []), ...node.querySelectorAll(selector)]))]; }
  };
  const context = vm.createContext({
    document, Node: { TEXT_NODE: 3, ELEMENT_NODE: 1 }, URL,
    localStorage: { getItem: (key) => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
    window: {
      matchMedia: (query) => {
        const media = { matches: false, addEventListener: (_name, callback) => { media.change = callback; } };
        mediaQueries.set(query, media);
        return media;
      },
      addEventListener: (name, callback) => listeners.set(name, callback),
      confirm: () => { throw new Error("Editor navigation must not use a native dialog"); }, scrollTo() {}, getSelection: () => null,
      location: { pathname: "/", hash: "", search: "" }
    },
    location: { pathname: "/", hash: "", search: "" },
    history: { state: {}, replaceState() {}, pushState() {} },
    requestAnimationFrame: (callback) => callback(), setTimeout: (callback) => { timers.set(++timerId, callback); return timerId; }, clearTimeout: (id) => timers.delete(id), console
  });
  for (const file of ["assets/js/core.js", "assets/site.js"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), context, { filename: file });
  }
  const run = (code) => vm.runInContext(code, context);
  const add = (id, value = "", tag = "input") => {
    const node = new Element(tag, { id, value });
    node.ownerDocument = document;
    roots.set(`#${id}`, node);
    return node;
  };
  add("admin-content-form", "", "form");
  const modal = add("unsaved-changes-modal", "", "div");
  modal.hidden = true;
  modal.innerHTML = '<button data-action="keep-editing">계속 편집</button><button data-action="discard-changes">버리고 이동</button>';
  const unpublishModal = add("unpublish-page-modal", "", "div");
  unpublishModal.hidden = true;
  unpublishModal.innerHTML = '<button data-action="cancel-unpublish">취소</button><button data-action="confirm-unpublish">비공개로 전환</button>';
  document.activeElement = roots.get("#admin-content-form");
  const blockList = add("admin-block-list", "", "div");
  blockList.setAttribute("class", "admin-block-editor");
  blockList.parentElement = roots.get("#admin-content-form");
  blockList.parentElement.childNodes.push(blockList);
  add("admin-content-type", "study");
  add("admin-content-title", "기존 페이지");
  add("admin-content-edit-id", "existing");
  add("admin-content-edit-type", "study");
  add("admin-content-id", "existing");
  add("admin-content-status", "draft");
  add("admin-content-category", "notes");
  add("admin-content-date", "2026-10-01");
  add("admin-content-icon", "📚");
  add("admin-content-cover", "mint");
  add("admin-page-save-state", "", "span");
  ["admin-content-submit", "admin-content-draft", "admin-content-submit-top", "admin-content-draft-top"].forEach((id) => add(id, "", "button"));
  run('adminState.contentEditType = "study"; adminState.contentEditId = "existing"; authState.authenticated = true;');
  return { context, document, roots, listeners, mediaQueries, run, add, flushTimers: () => { const callbacks = [...timers.values()]; timers.clear(); return Promise.all(callbacks.map((callback) => callback())); }, json: (code) => JSON.parse(run(`JSON.stringify(${code})`)) };
}

test("collapse, save sync, and expansion retain hidden children and the following sibling", () => {
  const h = editorHarness();
  h.run(`adminState.editorBlocks = normalizeEditorBlocks([
    { id: "parent", kind: "toggle", title: "토글" },
    { id: "child", kind: "paragraph", indent: 1, body: "숨겨진 원본" },
    { id: "sibling", kind: "code", body: "  const value = 1;\\n" }
  ]); renderAdminBlockList();`);
  h.run("toggleAdminBlockCollapse(0)");
  assert.equal(h.document.querySelectorAll(".admin-block-card").length, 2);
  const siblingBody = h.document.querySelector('[data-block-id="sibling"]').querySelector('[data-editable="true"][data-field="body"]');
  siblingBody.textContent = "  const value = 2;\n";
  const saved = h.json("syncAdminBlocksFromDom()");
  assert.deepEqual(saved.map((block) => block.id), ["parent", "child", "sibling"]);
  assert.equal(saved[1].body, "숨겨진 원본");
  assert.equal(saved[2].body, "  const value = 2;\n");
  h.run("toggleAdminBlockCollapse(0)");
  assert.equal(h.document.querySelectorAll(".admin-block-card").length, 3);
  assert.equal(h.json("syncAdminBlocksFromDom()")[1].body, "숨겨진 원본");
});

test("block sync reads rich callout, section, bookmark, and code fields instead of type buttons", () => {
  const h = editorHarness();
  h.run(`adminState.editorBlocks = normalizeEditorBlocks([
    { id: "callout", kind: "callout", title: "강조", body: "<strong>실제 콜아웃</strong>" },
    { id: "section", kind: "text", body: "섹션 본문" },
    { id: "bookmark", kind: "bookmark", href: "https://example.com", body: "북마크 본문" },
    { id: "code", kind: "code", body: "  const real = 7;\\n" }
  ]); renderAdminBlockList();`);
  const blocks = h.json("syncAdminBlocksFromDom()");
  assert.deepEqual(blocks.map((block) => block.body), ["<strong>실제 콜아웃</strong>", "섹션 본문", "북마크 본문", "  const real = 7;\n"]);
});

test("empty DOM does not delete retained editor state", () => {
  const h = editorHarness();
  h.run('adminState.editorBlocks = normalizeEditorBlocks([{ id: "retained", kind: "code", body: "original" }]);');
  assert.equal(h.json("syncAdminBlocksFromDom()")[0].body, "original");
});

test("unchanged editor skips warnings; changed editor cancellation preserves state and unload warns", () => {
  const h = editorHarness();
  h.run('adminState.editorBlocks = normalizeEditorBlocks([{ id: "body", kind: "code", body: "original" }]); renderAdminBlockList(); adminState.editorBaselineSignature = adminSnapshotSignature(adminSnapshotFromDom());');
  assert.equal(h.run("confirmAdminEditorNavigation()"), true);
  assert.equal(h.roots.get("#unsaved-changes-modal").hidden, true);
  const unchangedEvent = { preventDefault() { throw new Error("An unchanged editor should not warn"); } };
  h.listeners.get("beforeunload")(unchangedEvent);
  h.document.querySelector('[data-editable="true"][data-field="body"]').textContent = "edited";
  assert.equal(h.run("confirmAdminEditorNavigation(() => {})"), false);
  assert.equal(h.roots.get("#unsaved-changes-modal").hidden, false);
  assert.equal(h.json("adminState.editorBlocks")[0].body, "edited");
  h.run('declarativeClickHandlers["keep-editing"]()');
  assert.equal(h.roots.get("#unsaved-changes-modal").hidden, true);
  let prevented = false;
  const event = { preventDefault() { prevented = true; } };
  h.listeners.get("beforeunload")(event);
  assert.equal(prevented, true);
  assert.equal(event.returnValue, "");
  h.run('currentPage = "admin";');
  assert.equal(h.run('showPage("home")'), false);
  assert.equal(h.run("currentPage"), "admin");
  h.run('declarativeClickHandlers["keep-editing"]()');
  assert.equal(h.run('adminEditorController.startDraft("study", "other")'), false);
  assert.equal(h.run("adminState.contentEditId"), "existing");
  h.run('declarativeClickHandlers["keep-editing"]()');
  assert.equal(h.run('adminEditorController.startDraft("study", "existing")'), true);
  h.run('confirmAdminEditorNavigation(() => {}); declarativeClickHandlers["discard-changes"]();');
  assert.equal(h.run("adminState.editorDirty"), false);
});

test("unsaved modal keeps focus inside, Escape restores focus, and discard performs navigation once", () => {
  const h = editorHarness();
  const main = new Element("main");
  h.roots.set("main", main);
  const trigger = h.add("move-page", "", "button");
  trigger.focus();
  h.add("home-grid", "", "div");
  h.run('currentPage = "admin"; adminState.editorBlocks = normalizeEditorBlocks([{ id: "body", kind: "code", body: "original" }]); renderAdminBlockList(); adminState.editorBaselineSignature = adminSnapshotSignature(adminSnapshotFromDom());');
  h.document.querySelector('[data-editable="true"][data-field="body"]').textContent = "edited";
  assert.equal(h.run('showPage("home", { track: false })'), false);
  const modal = h.roots.get("#unsaved-changes-modal");
  const keep = modal.querySelector('[data-action="keep-editing"]');
  const discard = modal.querySelector('[data-action="discard-changes"]');
  assert.equal(h.document.activeElement, keep);
  assert.equal(main.inert, true);
  h.run('handleUnsavedChangesKeydown({ key: "Tab", shiftKey: true, preventDefault() {} });');
  assert.equal(h.document.activeElement, discard);
  h.run('handleUnsavedChangesKeydown({ key: "Tab", shiftKey: false, preventDefault() {} });');
  assert.equal(h.document.activeElement, keep);
  h.run('handleUnsavedChangesKeydown({ key: "Escape", preventDefault() {}, stopPropagation() {} });');
  assert.equal(modal.hidden, true);
  assert.equal(main.inert, false);
  assert.equal(h.document.activeElement, trigger);
  assert.equal(h.run("currentPage"), "admin");
  assert.equal(h.run("hasUnsavedAdminContent()"), true);
  h.run('showPage("home", { track: false }); declarativeClickHandlers["discard-changes"]();');
  assert.equal(h.run("currentPage"), "home");
  assert.equal(modal.hidden, true);
  assert.equal(main.inert, false);
  assert.equal(h.run("adminState.pendingEditorNavigation"), null);
  h.run('let resumeCount = 0; adminState.editorBaselineSignature = "changed"; confirmAdminEditorNavigation(() => { resumeCount += 1; }); discardAdminEditorChanges(); discardAdminEditorChanges();');
  assert.equal(h.run("resumeCount"), 1);
});

test("cover choices roundtrip through normalization and saved status is readonly", () => {
  const h = editorHarness();
  const properties = h.add("admin-page-properties-inline", "", "div");
  h.run("renderAdminPagePropertiesInline()");
  assert.equal(properties.querySelector('[data-property-key="status"]'), null);
  const covers = properties.querySelector('[data-property-key="cover"]').querySelectorAll("option").map((node) => node.getAttribute("value"));
  assert.deepEqual(covers, ["sand", "sky", "mint", "peach", "stone"]);
  assert.deepEqual(h.json('PAGE_COVER_OPTIONS.map((cover) => normalizePageCover(cover, "study"))'), covers);
});

test("discard resumes the requested study detail from a hash navigation", () => {
  const h = editorHarness();
  h.add("study-list-wrap", "", "div");
  h.add("study-post-view", "", "div");
  h.run('currentPage = "admin"; adminState.editorBlocks = normalizeEditorBlocks([{ id: "body", kind: "code", body: "original" }]); renderAdminBlockList(); adminState.editorBaselineSignature = adminSnapshotSignature(adminSnapshotFromDom()); renderStudyPosts = () => {}; let openedStudyId = ""; openStudyPost = (id) => { openedStudyId = id; };');
  h.document.querySelector('[data-editable="true"][data-field="body"]').textContent = "edited";
  h.context.window.location.hash = "#study/requested-post";
  h.listeners.get("hashchange")();
  assert.equal(h.run("currentPage"), "admin");
  assert.equal(h.run("openedStudyId"), "");
  h.run('declarativeClickHandlers["discard-changes"]()');
  assert.equal(h.run("currentPage"), "study");
  assert.equal(h.run("openedStudyId"), "requested-post");
});

test("hash navigation after a failed save opens only the unsaved modal and keeps retry state", async () => {
  const h = editorHarness();
  const title = h.add("admin-page-title-editable", "", "div");
  title.textContent = "기존 페이지";
  const errorModal = h.add("save-error-modal", "", "div");
  errorModal.hidden = true;
  errorModal.innerHTML = '<button data-action="retry-save">재시도</button><button data-action="dismiss-save-error">닫기</button>';
  h.add("save-error-copy", "", "p");
  h.run(`content.studyPosts = normalizeStudyPosts([{ id: "existing", title: "기존 페이지", category: "notes", status: "draft", blocks: [{ id: "body", kind: "code", body: "original" }] }]);
    adminState.editorBlocks = contentBlocks("study", content.studyPosts[0]); renderAdminBlockList();
    adminState.editorBaselineSignature = adminSnapshotSignature(adminSnapshotFromDom());
    currentPage = "admin"; showToast = () => {}; renderAllContent = () => renderAdminContentForm();`);
  h.document.querySelector('[data-editable="true"][data-field="body"]').textContent = "edited after failure";
  h.context.fetch = async () => ({ ok: false, status: 503, text: async () => "Unavailable" });
  assert.equal(await h.run('adminEditorController.commit("published")'), false);
  assert.equal(errorModal.hidden, false);
  assert.equal(h.document.activeElement, errorModal.querySelector("button"));
  h.context.window.location.hash = "#home";
  h.listeners.get("hashchange")();
  const unsavedModal = h.roots.get("#unsaved-changes-modal");
  assert.equal(errorModal.hidden, true);
  assert.equal(unsavedModal.hidden, false);
  assert.equal(h.document.activeElement, unsavedModal.querySelector('[data-action="keep-editing"]'));
  assert.equal(h.run("adminState.pendingEditorSaveStatus"), "published");
  assert.equal(h.run("adminState.pendingSaveAction"), "게시");
  h.run('declarativeClickHandlers["keep-editing"]()');
  assert.equal(h.document.activeElement, title);
  assert.equal(h.run("hasUnsavedAdminContent()"), true);
  let sent;
  h.context.fetch = async (_url, options) => { sent = JSON.parse(options.body); return { ok: true, json: async () => ({ content: sent.content }) }; };
  await h.run("retrySave()");
  assert.equal(sent.content.studyPosts[0].blocks[0].body, "edited after failure");
  assert.equal(sent.content.studyPosts[0].status, "published");
});

test("trash, restore, and logout preserve a cancelled editor and cannot run during saving", async () => {
  const h = editorHarness();
  h.run(`content.studyPosts = normalizeStudyPosts([
    { id: "existing", title: "기존 페이지", status: "draft", blocks: [{ id: "body", kind: "code", body: "original" }] },
    { id: "other", title: "다른 페이지", status: "published" },
    { id: "trash", title: "삭제된 페이지", status: "trash" }
  ]); adminState.editorBlocks = contentBlocks("study", content.studyPosts[0]); renderAdminBlockList();
  adminState.editorBaselineSignature = adminSnapshotSignature(adminSnapshotFromDom());`);
  h.document.querySelector('[data-editable="true"][data-field="body"]').textContent = "edited";
  h.context.fetch = () => { throw new Error("Cancelled navigation must not persist or log out"); };
  await h.run('moveToTrash("study", "other")');
  assert.equal(h.roots.get("#unsaved-changes-modal").hidden, false);
  h.run('declarativeClickHandlers["keep-editing"]()');
  await h.run('restoreContentItem("study", "trash")');
  assert.equal(h.roots.get("#unsaved-changes-modal").hidden, false);
  h.run('declarativeClickHandlers["keep-editing"]()');
  await h.run("logoutAdmin()");
  assert.equal(h.roots.get("#unsaved-changes-modal").hidden, false);
  h.run('declarativeClickHandlers["keep-editing"]()');
  assert.equal(h.json("content.studyPosts")[1].status, "published");
  assert.equal(h.json("content.studyPosts")[2].status, "trash");
  assert.equal(h.run("authState.authenticated"), true);
  assert.equal(h.document.querySelector('[data-editable="true"][data-field="body"]').innerText, "edited");
  h.run("adminState.editorSaving = true;");
  await h.run('moveToTrash("study", "other")');
  await h.run('restoreContentItem("study", "trash")');
  await h.run("logoutAdmin()");
  assert.equal(h.roots.get("#unsaved-changes-modal").hidden, true);
  assert.equal(h.json("content.studyPosts")[1].status, "published");
  assert.equal(h.json("content.studyPosts")[2].status, "trash");
  assert.equal(h.run("authState.authenticated"), true);
});

test("discard before another item's restore or trash resets the current editor and retains a clean baseline", async () => {
  const h = editorHarness();
  h.run(`content.studyPosts = normalizeStudyPosts([
    { id: "existing", title: "기존 페이지", status: "draft", category: "notes", blocks: [{ id: "body", kind: "code", body: "original" }] },
    { id: "trash", title: "삭제된 페이지", status: "trash" }
  ]); renderAdminContentForm(); showToast = () => {}; renderAllContent = () => {};`);
  h.document.querySelector('[data-editable="true"][data-field="body"]').textContent = "unsaved addition";
  h.roots.get("#admin-content-title").value = "미저장 제목";
  h.context.fetch = async (_url, options) => ({ ok: true, json: async () => ({ content: JSON.parse(options.body).content }) });
  await h.run('restoreContentItem("study", "trash")');
  assert.equal(h.roots.get("#unsaved-changes-modal").hidden, false);
  await h.run('declarativeClickHandlers["discard-changes"]()');
  assert.equal(h.roots.get("#admin-content-title").value, "기존 페이지");
  assert.equal(h.document.querySelector('[data-editable="true"][data-field="body"]').innerText, "original");
  assert.equal(h.json("content.studyPosts")[1].status, "published");
  assert.notEqual(h.run("adminState.editorBaselineSignature"), "");
  assert.equal(h.run("hasUnsavedAdminContent()"), false);
  assert.equal(h.run("confirmAdminEditorNavigation(() => {})"), true);
  assert.equal(h.roots.get("#unsaved-changes-modal").hidden, true);
  h.document.querySelector('[data-editable="true"][data-field="body"]').textContent = "another unsaved addition";
  await h.run('moveToTrash("study", "trash")');
  await h.run('declarativeClickHandlers["discard-changes"]()');
  assert.equal(h.json("content.studyPosts")[1].status, "trash");
  assert.equal(h.document.querySelector('[data-editable="true"][data-field="body"]').innerText, "original");
  assert.equal(h.run("hasUnsavedAdminContent()"), false);
});

test("home shows saved intro and image projects first without changing the portfolio collection", () => {
  const h = editorHarness();
  const grid = h.add("home-grid", "", "div");
  const lead = h.add("hero-lead", "", "p");
  h.run(`content.portfolio = normalizePortfolioItems([
    { id: "text-a", title: "Text A", desc: "실제 요약 A", category: "web", status: "published", blocks: [] },
    { id: "image-a", title: "Image A", desc: "실제 요약 B", category: "web", status: "published", blocks: [], detail: { media: [{ label: "Image", href: "/project-a.webp" }] } },
    { id: "text-b", title: "Text B", category: "web", status: "published", blocks: [] },
    { id: "image-b", title: "Image B", category: "web", status: "published", blocks: [], detail: { media: [{ label: "Image", href: "/project-b.webp" }] } }
  ].map((project) => ({ ...project, tags: [] }))); content.site.lead = ""; renderHome();`);
  assert.equal(lead.hidden, true);
  assert.deepEqual(grid.querySelectorAll(".project-index-item").map((node) => node.dataset.projectId), ["image-a", "image-b", "text-a", "text-b"]);
  assert.deepEqual(h.json("content.portfolio.map((project) => project.id)"), ["text-a", "image-a", "text-b", "image-b"]);
  assert.match(grid.html, /project-index-description/);
  assert.match(grid.html, /실제 요약 B/);
  h.run('content.site.lead = "저장된 소개"; renderHome();');
  assert.equal(lead.hidden, false);
  assert.equal(lead.textContent, "저장된 소개");
});

test("home identifies its owner from an actual GitHub profile and retains saved introduction", () => {
  const h = editorHarness();
  const identity = h.add("home-profile-name", "", "p");
  const title = h.add("hero-title", "", "h1");
  const lead = h.add("hero-lead", "", "p");
  h.run('content.contact.github = "https://github.com/ddobagi"; content.site.title = "내가 쓴 소개"; content.site.lead = "그대로 유지할 내용"; updateHomeIntroCopy();');
  assert.equal(identity.textContent, "ddobagi · Personal archive");
  assert.equal(title.textContent, "내가 쓴 소개");
  assert.equal(lead.textContent, "그대로 유지할 내용");
  assert.equal(h.run('content.contact.github'), "https://github.com/ddobagi");
  for (const url of ["https://github.com.evil.invalid/name", "https://github.com@evil.invalid/name", "javascript:alert(1)", "https://github.com/<img>", "https://user@github.com/name"]) {
    assert.equal(h.run(`publicProfileName(${JSON.stringify(url)})`), "");
  }
  h.run('content.contact.github = ""; updateHomeIntroCopy();');
  assert.equal(identity.textContent, "Personal archive");
});

test("architecture cover becomes a clearly labeled concept without changing original project media", () => {
  const h = editorHarness();
  h.run(`content.portfolio = normalizePortfolioItems([{ id: "walk", title: "Walk", status: "published", category: "web", tags: ["AI", "<script>"], desc: "Original description", detail: { headline: "Saved project headline", media: [{ label: "Architecture", href: "./assets/hanium-architecture.webp" }, { label: "PDF", href: "./assets/hanium-dreamup-overview.pdf" }] } }]);`);
  const before = h.json("content.portfolio");
  const card = h.run('portfolioIndexMarkup(content.portfolio[0], 0, "home-grid")');
  assert.match(card, /Project concept/);
  assert.match(card, /project-cover-concept/);
  assert.doesNotMatch(card, /<script>/);
  assert.match(card, /wayfinding-concept\.webp/);
  assert.match(card, /alt="" width="1536" height="1024"/);
  assert.doesNotMatch(card, /<img[^>]+hanium-architecture/);
  assert.match(card, /&lt;script&gt;/);
  assert.match(card, /Saved project headline/);
  assert.deepEqual(h.json("content.portfolio"), before);
  assert.equal(h.run('portfolioCardVisual(content.portfolio[0]).src'), "./assets/hanium-architecture.webp");
  const collectionCard = h.run('portfolioIndexMarkup(content.portfolio[0], 0, "portfolio")');
  assert.doesNotMatch(collectionCard, /wayfinding-concept\.webp/);
});

test("desktop transition closes the public menu and releases inert content", () => {
  const h = editorHarness();
  const main = new Element("main");
  const footer = new Element("footer", { class: "footer" });
  h.roots.set("main", main);
  h.roots.set(".footer", footer);
  h.run("setPublicMenuOpen(true)");
  assert.equal(main.getAttribute("inert"), "");
  h.mediaQueries.get("(max-width: 780px)").change({ matches: false });
  assert.equal(main.getAttribute("inert"), null);
  assert.equal(footer.getAttribute("inert"), null);
});

test("board retains all status columns and list rendering never purges old trash", () => {
  const h = editorHarness();
  const list = h.add("admin-content-list", "", "div");
  h.run(`content.portfolio = []; content.updates = []; content.studyPosts = normalizeStudyPosts([
    { id: "published", title: "공개 글", category: "notes", status: "published" },
    { id: "draft", title: "초안 글", category: "notes", status: "draft" },
    { id: "trash", title: "휴지통 글", category: "notes", status: "trash", deletedAt: "2000-01-01" }
  ]); adminState.contentListView = "board"; renderAdminContentList();`);
  assert.match(list.html, /게시됨 · 1/);
  assert.match(list.html, /임시저장 · 1/);
  assert.match(list.html, /휴지통 · 1/);
  assert.equal(h.json("content.studyPosts").length, 3);
  h.run('adminState.contentSearchTerm = "초안"; renderAdminContentList();');
  assert.match(list.html, /게시됨 · 0/);
  assert.match(list.html, /임시저장 · 1/);
  assert.match(list.html, /휴지통 · 0/);
});

test("failed save rolls back published state, retains editor, locks both save actions, and retries edited content", async () => {
  const h = editorHarness();
  h.run(`content.studyPosts = normalizeStudyPosts([{ id: "existing", title: "기존 페이지", category: "notes", status: "draft", blocks: [{ id: "body", kind: "code", body: "original" }] }]);
    adminState.editorBlocks = contentBlocks("study", content.studyPosts[0]); renderAdminBlockList();
    adminState.editorBaselineSignature = adminSnapshotSignature(adminSnapshotFromDom());
    showSaveErrorModal = () => {}; showToast = () => {};`);
  h.document.querySelector('[data-editable="true"][data-field="body"]').textContent = "edited";
  let failSave;
  h.context.fetch = () => new Promise((resolve) => { failSave = () => resolve({ ok: false, status: 503, text: async () => "Unavailable" }); });
  const firstSave = h.run('adminEditorController.commit("published")');
  assert.equal(h.roots.get("#admin-content-draft").disabled, true);
  assert.equal(h.roots.get("#admin-content-submit").disabled, true);
  assert.equal(h.roots.get("#admin-content-form").getAttribute("aria-busy"), "true");
  assert.equal(await h.run('adminEditorController.commit("draft")'), false);
  failSave();
  assert.equal(await firstSave, false);
  assert.equal(h.json("content.studyPosts")[0].blocks[0].body, "original");
  assert.equal(h.json("content.studyPosts")[0].status, "draft");
  assert.equal(h.document.querySelector('[data-editable="true"][data-field="body"]').innerText, "edited");
  assert.equal(h.roots.get("#admin-page-save-state").dataset.saveState, "error");
  assert.equal(h.roots.get("#admin-content-form").inert, false);
  let sent;
  h.context.fetch = async (_url, options) => { sent = JSON.parse(options.body); return { ok: true, json: async () => ({ content: sent.content }) }; };
  h.run("renderAllContent = () => { adminState.editorBaselineSignature = adminSnapshotSignature(adminSnapshotFromDom()); adminState.editorDirty = false; };");
  await h.run("retrySave()");
  assert.equal(sent.content.studyPosts[0].blocks[0].body, "edited");
  assert.equal(sent.content.studyPosts[0].status, "published");
  assert.equal(h.run("adminState.pendingEditorSaveStatus"), null);
  assert.equal(h.roots.get("#admin-content-submit").disabled, false);
});

test("expired save restores the failed editor after OTP login until a successful retry", async () => {
  const h = editorHarness();
  h.add("admin-otp-code", "123456");
  h.run(`content.studyPosts = normalizeStudyPosts([{ id: "existing", title: "기존 페이지", category: "notes", status: "draft", blocks: [{ id: "body", kind: "code", body: "original" }] }]);
    adminState.editorBlocks = contentBlocks("study", content.studyPosts[0]); renderAdminBlockList();
    adminState.editorBaselineSignature = adminSnapshotSignature(adminSnapshotFromDom());
    showToast = () => {}; renderAllContent = () => renderAdminContentForm();`);
  h.document.querySelector('[data-editable="true"][data-field="body"]').textContent = "edited before expiry";
  h.roots.get("#admin-content-title").value = "수정한 제목";
  const serverContent = h.json("content");
  h.context.fetch = async () => ({ ok: false, status: 401, text: async () => "Expired session" });
  assert.equal(await h.run('adminEditorController.commit("published")'), false);
  assert.equal(h.run("authState.authenticated"), false);
  assert.equal(h.json("adminState.pendingEditorRecovery.snapshot").blocks[0].body, "edited before expiry");
  let sent;
  h.context.fetch = async (url, options) => {
    if (url === "/api/auth/verify-code") return { ok: true, json: async () => ({ authenticated: true, csrfToken: "test-token" }) };
    if (options.method === "GET") return { ok: true, json: async () => ({ content: serverContent }) };
    sent = JSON.parse(options.body);
    return { ok: true, json: async () => ({ content: sent.content }) };
  };
  await h.run("verifyAdminOtp({ preventDefault() {} })");
  assert.equal(h.run("authState.authenticated"), true);
  assert.equal(h.roots.get("#admin-content-title").value, "수정한 제목");
  assert.equal(h.document.querySelector('[data-editable="true"][data-field="body"]').innerText, "edited before expiry");
  assert.equal(h.run("hasUnsavedAdminContent()"), true);
  assert.equal(h.run("adminState.pendingEditorSaveStatus"), "published");
  assert.equal(h.roots.get("#admin-page-save-state").dataset.saveState, "dirty");
  assert.equal(sent, undefined);
  await h.run("retrySave()");
  assert.equal(sent.content.studyPosts[0].title, "수정한 제목");
  assert.equal(sent.content.studyPosts[0].blocks[0].body, "edited before expiry");
  assert.equal(sent.content.studyPosts[0].status, "published");
  assert.equal(h.run("hasUnsavedAdminContent()"), false);
  assert.equal(h.run("adminState.pendingEditorSaveStatus"), null);
});

function savedEditor(h, status = "published") {
  h.run(`content.studyPosts = normalizeStudyPosts([{ id: "existing", title: "기존 페이지", category: "notes", status: "${status}", blocks: [{ id: "body", kind: "code", body: "original" }] }]);
    renderAdminContentForm(); renderAllContent = () => renderAdminContentForm();`);
  return h.document.querySelector('[data-editable="true"][data-field="body"]');
}

test("Ctrl or Command S preserves a saved published state and saves a draft without publishing", async () => {
  for (const status of ["published", "draft"]) {
    const h = editorHarness();
    savedEditor(h, status).textContent = "keyboard edit";
    const sent = [];
    h.context.fetch = async (_url, options) => {
      const request = JSON.parse(options.body); sent.push(request);
      return { ok: true, json: async () => ({ content: request.content }) };
    };
    // History snapshots may hold an older status. The saved published item wins.
    h.roots.get("#admin-content-status").value = "draft";
    h.run('let shortcutSave; const originalSaveDraft = saveDraft; saveDraft = () => { shortcutSave = originalSaveDraft(); };');
    for (const key of ["ctrlKey", "metaKey"]) {
      h.context.shortcut = { key: "s", [key]: true, target: { id: "admin-page-title-editable" }, preventDefault() {} };
      h.run("adminInteractionController.handleAdminKeydown(shortcut)");
      await h.run("shortcutSave");
    }
    assert.equal(sent.length, 2);
    assert.equal(sent[0].content.studyPosts[0].status, status);
    assert.equal(sent[1].content.studyPosts[0].status, status);
    assert.equal(sent[0].content.studyPosts[0].blocks[0].body, "keyboard edit");
    assert.match(h.roots.get("#admin-content-submit-top").textContent, status === "published" ? /변경 저장/ : /게시/);
    assert.equal(h.roots.get("#admin-content-draft-top").dataset.action, status === "published" ? "request-unpublish" : "save-draft");
  }
});

test("unpublishing requires confirmation, cancellation retains edits, and confirmation saves them once", async () => {
  const h = editorHarness();
  const main = new Element("main"); h.roots.set("main", main);
  savedEditor(h).textContent = "edited before unpublish";
  const trigger = h.roots.get("#admin-content-draft-top"); trigger.focus();
  let requests = 0;
  h.context.fetch = async (_url, options) => {
    requests += 1; return { ok: true, json: async () => ({ content: JSON.parse(options.body).content }) };
  };
  assert.equal(await h.run('adminEditorController.commit("draft")'), false);
  const modal = h.roots.get("#unpublish-page-modal");
  assert.equal(modal.hidden, false);
  assert.equal(requests, 0);
  assert.equal(main.inert, true);
  assert.equal(h.document.activeElement, modal.querySelector('[data-action="cancel-unpublish"]'));
  h.run('handleUnsavedChangesKeydown({ key: "Tab", shiftKey: true, preventDefault() {} });');
  assert.equal(h.document.activeElement, modal.querySelector('[data-action="confirm-unpublish"]'));
  h.run('handleUnsavedChangesKeydown({ key: "Escape", preventDefault() {}, stopPropagation() {} });');
  assert.equal(modal.hidden, true);
  assert.equal(main.inert, false);
  assert.equal(h.document.activeElement, trigger);
  assert.equal(h.json("content.studyPosts")[0].status, "published");
  assert.equal(h.document.querySelector('[data-editable="true"][data-field="body"]').innerText, "edited before unpublish");
  h.run('declarativeClickHandlers["request-unpublish"]()');
  assert.equal(await h.run('declarativeClickHandlers["confirm-unpublish"]()'), true);
  assert.equal(await h.run('declarativeClickHandlers["confirm-unpublish"]()'), false);
  assert.equal(requests, 1);
  assert.equal(h.json("content.studyPosts")[0].status, "draft");
  assert.equal(h.json("content.studyPosts")[0].blocks[0].body, "edited before unpublish");
  assert.equal(h.run("hasUnsavedAdminContent()"), false);
  assert.equal(h.roots.get("#admin-content-draft-top").dataset.action, "save-draft");
});

test("failed confirmed unpublish keeps publication and edits until its explicit retry succeeds", async () => {
  const h = editorHarness();
  savedEditor(h).textContent = "retry unpublish edit";
  h.run("showSaveErrorModal = () => {};");
  h.context.fetch = async () => ({ ok: false, status: 503, text: async () => "Unavailable" });
  h.run("requestUnpublishCurrentPage()");
  assert.equal(await h.run("confirmUnpublishCurrentPage()"), false);
  assert.equal(h.json("content.studyPosts")[0].status, "published");
  assert.equal(h.run("adminState.pendingEditorSaveStatus"), "draft");
  assert.equal(h.document.querySelector('[data-editable="true"][data-field="body"]').innerText, "retry unpublish edit");
  h.context.fetch = async (_url, options) => ({ ok: true, json: async () => ({ content: JSON.parse(options.body).content }) });
  await h.run("retrySave()");
  assert.equal(h.json("content.studyPosts")[0].status, "draft");
  assert.equal(h.json("content.studyPosts")[0].blocks[0].body, "retry unpublish edit");
});

test("page properties keep values, expansion, focus, and selection after a property edit", () => {
  const h = editorHarness();
  const properties = h.add("admin-page-properties-inline", "", "div");
  savedEditor(h);
  const details = properties.querySelector("details");
  assert.equal(details.open, false);
  assert.equal(details.querySelector("summary").textContent, "페이지 속성");
  assert.equal(properties.querySelector(".admin-page-properties-primary").querySelector('[data-property-key="category"]') !== null, true);
  details.open = true;
  const icon = details.querySelector('[data-property-key="icon"]');
  icon.focus(); icon.setSelectionRange(1, 2);
  h.run('changeAdminProperty("icon", "🌿")');
  const changedIcon = properties.querySelector('[data-property-key="icon"]');
  assert.equal(properties.querySelector("details").open, true);
  assert.equal(changedIcon.value, "🌿");
  assert.equal(h.roots.get("#admin-content-icon").value, "🌿");
  assert.equal(h.document.activeElement, changedIcon);
  assert.equal(changedIcon.selectionStart, 1);
  assert.equal(changedIcon.selectionEnd, 2);
  assert.equal(properties.querySelectorAll('[data-property-key="icon"]').length, 1);
  assert.equal(properties.querySelector('[data-property-key="date"]').value, h.roots.get("#admin-content-date").value);
});

test("empty home Study and Moments sections hide while their dedicated empty guidance remains", () => {
  const h = editorHarness();
  h.add("home-grid", "", "div");
  for (const id of ["home-study", "home-feed"]) {
    const node = h.add(id, "", "div");
    const section = new Element("section", { class: "section" });
    section.childNodes.push(node); node.parentElement = section;
  }
  h.add("study-filters", "", "div");
  const study = h.add("study-list", "", "div");
  const moments = h.add("updates-list", "", "div");
  h.run("content.studyPosts = []; content.updates = []; renderHome(); renderStudyPosts(); renderUpdates();");
  assert.equal(h.roots.get("#home-study").parentElement.hidden, true);
  assert.equal(h.roots.get("#home-feed").parentElement.hidden, true);
  assert.match(study.textContent, /아직 공개된 공부글이 없습니다/);
  assert.match(moments.textContent, /아직 기록이 없습니다/);
  h.run('content.studyPosts = normalizeStudyPosts([{ id: "s", title: "공부", status: "published" }]); content.updates = normalizeUpdates([{ id: "u", title: "기록", status: "published" }]); renderHome();');
  assert.equal(h.roots.get("#home-study").parentElement.hidden, false);
  assert.equal(h.roots.get("#home-feed").parentElement.hidden, false);
});

test("trash toast undo restores original draft or published status and cannot restore twice", async () => {
  for (const status of ["draft", "published"]) {
    const h = editorHarness();
    savedEditor(h, status);
    const stack = h.add("toast-stack", "", "div");
    let requests = 0;
    h.context.fetch = async (_url, options) => { requests += 1; return { ok: true, json: async () => ({ content: JSON.parse(options.body).content }) }; };
    await h.run('moveToTrash("study", "existing")');
    const deleted = h.json("content.studyPosts")[0];
    assert.equal(deleted.status, "trash");
    assert.equal(deleted.previousStatus, status);
    const undo = stack.querySelector('[data-action="undo-trash"]');
    assert.equal(undo.textContent, "되돌리기");
    h.context.undoTarget = undo;
    await h.run('declarativeClickHandlers["undo-trash"](undoTarget)');
    assert.equal(h.json("content.studyPosts")[0].status, status);
    assert.equal(h.json("content.studyPosts")[0].deletedAt, null);
    await h.run('declarativeClickHandlers["undo-trash"](undoTarget)');
    assert.equal(requests, 2);
  }
});

test("failed trash rolls back before retry and preserves the current editor without rerendering it", async () => {
  const h = editorHarness();
  const body = savedEditor(h, "draft");
  h.run('content.studyPosts.push(normalizeStudyPosts([{ id: "other", title: "다른 글", status: "published" }])[0]); showSaveErrorModal = () => {};');
  h.context.fetch = async () => ({ ok: false, status: 503, text: async () => "Unavailable" });
  await h.run('moveToTrash("study", "other")');
  assert.equal(h.json("content.studyPosts")[1].status, "published");
  assert.equal(h.run("adminState.contentEditId"), "existing");
  assert.equal(h.document.querySelector('[data-editable="true"][data-field="body"]'), body);
  assert.equal(h.roots.get("#admin-content-form").inert, false);
  assert.deepEqual(h.json("adminState.pendingContentMutation"), { action: "trash", type: "study", id: "other" });
  h.context.fetch = async (_url, options) => ({ ok: true, json: async () => ({ content: JSON.parse(options.body).content }) });
  await h.run("retrySave()");
  assert.equal(h.json("content.studyPosts")[1].status, "trash");
  assert.equal(h.run("adminState.pendingContentMutation"), null);
});

test("expired trash preserves the editor across OTP login and retries only the requested mutation", async () => {
  const h = editorHarness();
  h.add("admin-otp-code", "123456");
  savedEditor(h, "draft");
  h.run('content.studyPosts.push(normalizeStudyPosts([{ id: "other", title: "다른 글", status: "published" }])[0]);');
  const serverContent = h.json("content");
  h.context.fetch = async () => ({ ok: false, status: 401, text: async () => "Expired" });
  await h.run('moveToTrash("study", "other")');
  assert.equal(h.run("authState.authenticated"), false);
  assert.equal(h.json("content.studyPosts")[1].status, "published");
  let sent;
  h.context.fetch = async (url, options) => {
    if (url === "/api/auth/verify-code") return { ok: true, json: async () => ({ authenticated: true, csrfToken: "test-token" }) };
    if (options.method === "GET") return { ok: true, json: async () => ({ content: serverContent }) };
    sent = JSON.parse(options.body); return { ok: true, json: async () => ({ content: sent.content }) };
  };
  await h.run("verifyAdminOtp({ preventDefault() {} })");
  assert.equal(h.roots.get("#admin-content-title").value, "기존 페이지");
  assert.equal(h.document.querySelector('[data-editable="true"][data-field="body"]').innerText, "original");
  assert.equal(h.run("hasUnsavedAdminContent()"), false);
  assert.equal(sent, undefined);
  assert.equal(h.run("adminState.pendingContentMutation.action"), "trash");
  await h.run("retrySave()");
  assert.equal(sent.content.studyPosts[1].status, "trash");
  assert.equal(sent.content.studyPosts[0].status, "draft");
  assert.equal(sent.content.studyPosts[0].blocks[0].body, "original");
});

test("block tools and metadata allow native Tab navigation while body Tab changes indentation", () => {
  const h = editorHarness();
  h.run('adminState.editorBlocks = normalizeEditorBlocks([{ id: "section", kind: "text", title: "제목", kicker: "작은 제목", body: "본문" }]); renderAdminBlockList(); adminState.editorBaselineSignature = adminSnapshotSignature(adminSnapshotFromDom());');
  const card = h.document.querySelector(".admin-block-card");
  const controls = [card.querySelector("button"), card.querySelector("select"), card.querySelector('[data-field="title"]'), card.querySelector('[data-field="kicker"]')];
  const input = new Element("input", { "data-field": "body", value: "URL" });
  input.parentElement = card; card.childNodes.push(input); controls.push(input);
  for (const target of controls) {
    target.isContentEditable = target.getAttribute("contenteditable") === "true";
    for (const shiftKey of [false, true]) {
      h.context.tabEvent = { key: "Tab", shiftKey, target, preventDefault() { throw new Error("Tools and metadata must keep native focus navigation"); } };
      h.run("adminInteractionController.handleAdminKeydown(tabEvent)");
      assert.equal(h.json("adminState.editorBlocks")[0].indent, 0);
    }
  }
  card.childNodes = card.childNodes.filter((node) => node !== input);
  assert.equal(h.run("hasUnsavedAdminContent()"), false);
  const body = card.querySelector('[data-editable="true"][data-field="body"]');
  body.isContentEditable = true;
  let prevented = false;
  h.context.tabEvent = { key: "Tab", shiftKey: false, target: body, preventDefault() { prevented = true; } };
  h.run("adminInteractionController.handleAdminKeydown(tabEvent)");
  assert.equal(prevented, true);
  assert.equal(h.json("adminState.editorBlocks")[0].indent, 1);
  assert.equal(h.run("hasUnsavedAdminContent()"), true);
});

test("failed undo remains in trash and retries restoration to the original draft status", async () => {
  const h = editorHarness();
  savedEditor(h, "draft");
  h.run('content.studyPosts.push(normalizeStudyPosts([{ id: "other", title: "삭제된 초안", status: "trash", previousStatus: "draft" }])[0]); showSaveErrorModal = () => {};');
  h.context.fetch = async () => ({ ok: false, status: 503, text: async () => "Unavailable" });
  await h.run('restoreContentItem("study", "other")');
  assert.equal(h.json("content.studyPosts")[1].status, "trash");
  assert.equal(h.json("content.studyPosts")[1].previousStatus, "draft");
  h.context.fetch = async (_url, options) => ({ ok: true, json: async () => ({ content: JSON.parse(options.body).content }) });
  await h.run("retrySave()");
  assert.equal(h.json("content.studyPosts")[1].status, "draft");
  assert.equal(h.run("adminState.pendingContentMutation"), null);
});

test("native property input then change retains the selected cover and persists it with the date", async () => {
  const h = editorHarness();
  const properties = h.add("admin-page-properties-inline", "", "div");
  const form = h.roots.get("#admin-content-form");
  properties.parentElement = form; form.childNodes.push(properties);
  savedEditor(h);
  h.run('setAdminPropertyValue("cover", "sky"); adminState.editorBaselineSignature = adminSnapshotSignature(adminSnapshotFromDom());');
  properties.querySelector("details").open = true;
  const date = properties.querySelector('[data-property-key="date"]');
  date.value = "2026-10-01T09:00"; date.focus();
  h.context.propertyEvent = { target: date };
  h.run("adminInteractionController.handleInput(propertyEvent); handleDeclarativeInput(propertyEvent);");
  assert.equal(h.roots.get("#admin-content-date").value, "2026-10-01T09:00");
  const cover = properties.querySelector('[data-property-key="cover"]');
  cover.value = "mint"; cover.focus();
  h.context.propertyEvent = { target: cover };
  // Native select emits input before change; the selected node must stay mounted.
  h.run("adminInteractionController.handleInput(propertyEvent); handleDeclarativeInput(propertyEvent);");
  assert.equal(properties.querySelector('[data-property-key="cover"]'), cover);
  assert.equal(cover.value, "mint");
  h.run("adminInteractionController.handleChange(propertyEvent); handleDeclarativeChange(propertyEvent);");
  assert.equal(h.roots.get("#admin-content-cover").value, "mint");
  assert.equal(properties.querySelector("details").open, true);
  properties.querySelector("details").open = false;
  let sent;
  h.context.fetch = async (_url, options) => { sent = JSON.parse(options.body); return { ok: true, json: async () => ({ content: sent.content }) }; };
  assert.equal(await h.run('adminEditorController.commit("published")'), true);
  assert.equal(sent.content.studyPosts[0].date, "2026-10-01T09:00");
  assert.equal(sent.content.studyPosts[0].cover, "mint");
  assert.equal(sent.content.studyPosts[0].status, "published");
});

function editorKey(h, target, key, modifiers = {}) {
  let prevented = false;
  h.context.keyEvent = { key, target, ...modifiers, preventDefault() { prevented = true; } };
  h.run("adminInteractionController.handleAdminKeydown(keyEvent)");
  return prevented;
}

test("keyboard Escape selects and focuses a block; Enter returns to its body without dirty history", () => {
  const h = editorHarness();
  savedEditor(h, "draft");
  const body = h.document.querySelector('[data-editable="true"][data-field="body"]'); body.focus();
  h.flushTimers();
  const before = h.json("adminState.undoStack");
  assert.equal(editorKey(h, body, "Escape"), true);
  const card = h.document.querySelector(".admin-block-card");
  assert.deepEqual(h.json("adminState.selectedBlockIndices"), [0]);
  assert.equal(h.document.activeElement, card);
  assert.equal(card.getAttribute("tabindex"), "-1");
  assert.match(card.getAttribute("aria-label"), /선택됨/);
  assert.equal(card.querySelector('[data-open-block-menu="true"]').getAttribute("aria-pressed"), "true");
  assert.equal(editorKey(h, card, "Enter"), true);
  assert.equal(h.document.activeElement, body);
  assert.deepEqual(h.json("adminState.selectedBlockIndices"), []);
  h.flushTimers();
  assert.equal(h.run("hasUnsavedAdminContent()"), false);
  assert.deepEqual(h.json("adminState.undoStack"), before);
});

test("IME Enter and Escape do not split text or change block selection", () => {
  const h = editorHarness();
  const body = savedEditor(h, "draft");
  const before = h.json("adminState.editorBlocks");
  assert.equal(editorKey(h, body, "Enter", { isComposing: true }), false);
  assert.equal(editorKey(h, body, "Enter", { keyCode: 229 }), false);
  assert.equal(editorKey(h, body, "Escape", { isComposing: true }), false);
  assert.deepEqual(h.json("adminState.editorBlocks"), before);
  assert.deepEqual(h.json("adminState.selectedBlockIndices"), []);
});

test("selected collapsed parent duplicates with children, keeps keyboard focus, and supports Undo", () => {
  const h = editorHarness();
  h.run('adminState.editorBlocks = normalizeEditorBlocks([{ id: "parent", kind: "toggle", title: "부모", collapsed: true }, { id: "child", kind: "code", body: "  원본 자식\\n", indent: 1 }, { id: "next", kind: "code", body: "다음" }]); renderAdminBlockList(); adminState.editorBaselineSignature = adminSnapshotSignature(adminSnapshotFromDom()); pushAdminUndoSnapshot(adminSnapshotFromDom(), { persist: false }); adminBlockEditorController.setSelection(0, { focus: true });');
  assert.equal(editorKey(h, h.document.activeElement, "d", { metaKey: true }), true);
  const copied = h.json("adminState.editorBlocks");
  assert.equal(copied.length, 5);
  assert.equal(copied[3].body, "  원본 자식\n");
  assert.equal(copied[3].indent, 1);
  assert.notEqual(copied[2].id, "parent");
  assert.notEqual(copied[3].id, "child");
  assert.equal(h.document.activeElement.dataset.blockIndex, "2");
  assert.equal(h.run("hasUnsavedAdminContent()"), true);
  h.run("adminUndo()");
  assert.deepEqual(h.json("adminState.editorBlocks.map((block) => block.id)"), ["parent", "child", "next"]);
  assert.equal(h.run("hasUnsavedAdminContent()"), false);
});

test("block move modifiers precede toggle child, list, and facts arrow focus behavior", () => {
  for (const kind of ["code", "bullets", "facts"]) {
    const h = editorHarness();
    h.run(`adminState.editorBlocks = normalizeEditorBlocks([{ id: "parent", kind: "toggle", title: "부모" }, { id: "child", kind: "${kind}", body: "본문", items: ${kind === "facts" ? '[{label:"항목",value:"값"}]' : '["항목"]'}, indent: 1 }, { id: "next", kind: "code", body: "다음" }]); renderAdminBlockList(); adminState.editorBaselineSignature = adminSnapshotSignature(adminSnapshotFromDom());`);
    const child = h.document.querySelector('[data-block-id="child"]');
    const target = child.querySelector('[data-list-row-content="true"]') || child.querySelector('[data-fact-field]') || child.querySelector('[data-editable="true"][data-field="body"]');
    assert.equal(editorKey(h, target, "ArrowUp", { ctrlKey: true, shiftKey: true }), true);
    assert.equal(h.json("adminState.editorBlocks")[0].id, "child");
    assert.equal(h.document.activeElement.dataset.blockId, "child");
    assert.equal(h.run("hasUnsavedAdminContent()"), true);
  }
});

test("body Ctrl D suppresses bookmarks while native form controls and metadata keep their shortcuts", () => {
  const h = editorHarness();
  const body = savedEditor(h, "draft");
  assert.equal(editorKey(h, body, "d", { ctrlKey: true }), true);
  assert.equal(h.json("adminState.editorBlocks").length, 2);
  const card = h.document.querySelector(".admin-block-card");
  for (const tag of ["input", "select", "button"]) {
    const target = new Element(tag, { "data-field": "body", value: "설정" }); target.parentElement = card;
    assert.equal(editorKey(h, target, "d", { ctrlKey: true }), false);
    assert.equal(editorKey(h, target, "ArrowDown", { ctrlKey: true, shiftKey: true }), false);
  }
  const before = h.json("adminState.editorBlocks");
  assert.equal(before.length, 2);
});

test("slash duplicate and delete preserve descendants and can Undo without leaving command text", () => {
  const h = editorHarness();
  h.run('adminState.editorBlocks = normalizeEditorBlocks([{ id: "parent", kind: "toggle", title: "부모", collapsed: true }, { id: "child", kind: "code", body: "원본 자식", indent: 1 }, { id: "next", kind: "code", body: "다음" }]); renderAdminBlockList(); pushAdminUndoSnapshot(adminSnapshotFromDom(), { persist: false }); adminState.editorBaselineSignature = adminSnapshotSignature(adminSnapshotFromDom()); adminState.slashMenu = { ...adminState.slashMenu, open: true, mode: "convert", activeIndex: 0, activeField: "title", captureInput: true, query: "duplicate" };');
  assert.deepEqual(h.json("adminInteractionController.filteredSlashKinds().map((item) => item.id)"), ["duplicate"]);
  h.run('selectAdminSlashKind("duplicate")');
  assert.equal(h.json("adminState.editorBlocks").length, 5);
  assert.equal(h.json("adminState.editorBlocks")[3].body, "원본 자식");
  h.run('adminUndo(); adminState.slashMenu = { ...adminState.slashMenu, open: true, mode: "convert", activeIndex: 0, activeField: "title", captureInput: true, query: "delete" };');
  assert.deepEqual(h.json("adminInteractionController.filteredSlashKinds().map((item) => item.id)"), ["delete"]);
  h.run('selectAdminSlashKind("delete")');
  assert.deepEqual(h.json("adminState.editorBlocks.map((block) => block.id)"), ["next"]);
  h.run("adminUndo()");
  assert.deepEqual(h.json("adminState.editorBlocks.map((block) => block.id)"), ["parent", "child", "next"]);
  const nextBody = h.document.querySelector('[data-block-id="next"]').querySelector('[data-editable="true"][data-field="body"]');
  nextBody.textContent = "/duplicate 다음";
  h.run('adminState.slashMenu = { ...adminState.slashMenu, open: true, mode: "convert", activeIndex: 2, activeField: "body", captureInput: false, pendingValue: "다음", query: "duplicate" }; selectAdminSlashKind("duplicate");');
  assert.deepEqual(h.json("adminState.editorBlocks.slice(2).map((block) => block.body)"), ["다음", "다음"]);
});

function privateDraftFixture(h, fetch) {
  h.add("editor-draft-notice", "", "div").hidden = true;
  h.add("editor-draft-copy", "", "p");
  const list = h.roots.get("#admin-block-list");
  const form = h.roots.get("#admin-content-form");
  list.parentElement = form; form.childNodes.push(list);
  h.context.fetch = fetch;
  h.run('currentPage = "admin"; authState.csrfToken = "test-csrf";');
  const body = savedEditor(h);
  return body;
}

const jsonResponse = (payload) => ({ ok: true, json: async () => payload });
const errorResponse = (status) => ({ ok: false, status, text: async () => `Failure ${status}` });

function editPrivateBody(h, body, text) {
  body.textContent = text;
  h.context.inputEvent = { target: body };
  h.run("adminInteractionController.handleInput(inputEvent)");
}

test("private draft debounce saves the latest edit with CSRF without changing publication or DOM focus", async () => {
  const h = editorHarness();
  const puts = [];
  const body = privateDraftFixture(h, async (_url, options) => {
    if (options.method === "GET") return jsonResponse({ draft: null });
    puts.push({ payload: JSON.parse(options.body), headers: options.headers });
    return jsonResponse({ draft: { ...puts.at(-1).payload, version: "v1" } });
  });
  await h.run("editorDraftService.current.loading");
  body.focus();
  editPrivateBody(h, body, "first"); editPrivateBody(h, body, "latest");
  assert.equal(puts.length, 0);
  await h.flushTimers();
  assert.equal(puts.length, 1);
  assert.equal(puts[0].payload.snapshot.blocks[0].body, "latest");
  assert.equal(puts[0].payload.key, "study:page:existing");
  assert.equal(puts[0].payload.expectedVersion, null);
  assert.equal(puts[0].headers["X-CSRF-Token"], "test-csrf");
  assert.equal(h.json("content.studyPosts")[0].blocks[0].body, "original");
  assert.equal(h.json("content.studyPosts")[0].status, "published");
  assert.equal(h.document.activeElement, body);
  assert.equal(h.document.querySelector('[data-editable="true"][data-field="body"]'), body);
  assert.equal(h.roots.get("#admin-content-form").inert, false);
  assert.match(h.roots.get("#admin-page-save-state").textContent, /복구 초안 저장됨/);
  assert.equal(h.run("hasUnsavedAdminContent()"), true);
});

test("an edit during private save queues the latest snapshot using the returned version", async () => {
  const h = editorHarness();
  const puts = [];
  let finishFirst;
  const body = privateDraftFixture(h, async (_url, options) => {
    if (options.method === "GET") return jsonResponse({ draft: null });
    const payload = JSON.parse(options.body); puts.push(payload);
    if (puts.length === 1) return new Promise((resolve) => { finishFirst = () => resolve(jsonResponse({ draft: { ...payload, version: "v1" } })); });
    return jsonResponse({ draft: { ...payload, version: "v2" } });
  });
  await h.run("editorDraftService.current.loading");
  editPrivateBody(h, body, "first request");
  const first = h.flushTimers(); await Promise.resolve();
  editPrivateBody(h, body, "second edit");
  const second = h.flushTimers(); await Promise.resolve();
  finishFirst(); await first; await second;
  assert.equal(puts.length, 2);
  assert.equal(puts[1].expectedVersion, "v1");
  assert.equal(puts[1].snapshot.blocks[0].body, "second edit");
  assert.equal(body.innerText, "second edit");
  assert.equal(h.run("editorDraftService.current.version"), "v2");
  assert.equal(h.json("content.studyPosts")[0].blocks[0].body, "original");
});

test("three overlapping private flushes serialize writes and do not create a false CAS conflict", async () => {
  const h = editorHarness(); const puts = []; const finishes = [];
  let active = 0; let maxActive = 0; let serverVersion = null; let revision = 0;
  const body = privateDraftFixture(h, async (_url, options) => {
    if (options.method === "GET") return jsonResponse({ draft: null });
    const payload = JSON.parse(options.body); puts.push(payload);
    maxActive = Math.max(maxActive, ++active);
    return new Promise((resolve) => {
      finishes.push(() => {
        active -= 1;
        if (payload.expectedVersion !== serverVersion) return resolve(errorResponse(409));
        serverVersion = `v${++revision}`;
        resolve(jsonResponse({ draft: { ...payload, version: serverVersion } }));
      });
    });
  });
  await h.run("editorDraftService.current.loading");
  editPrivateBody(h, body, "first request"); const first = h.flushTimers(); await Promise.resolve();
  editPrivateBody(h, body, "second edit"); const second = h.flushTimers(); await Promise.resolve();
  editPrivateBody(h, body, "latest edit"); const third = h.flushTimers(); await Promise.resolve();
  finishes[0]();
  for (let tick = 0; tick < 20; tick += 1) await Promise.resolve();
  finishes.slice(1).forEach((finish) => finish());
  await Promise.all([first, second, third]); await h.flushTimers();
  assert.equal(maxActive, 1);
  assert.equal(puts.length, 2);
  assert.equal(puts[1].expectedVersion, "v1");
  assert.equal(puts[1].snapshot.blocks[0].body, "latest edit");
  assert.equal(h.run("editorDraftService.current.version"), "v2");
  assert.equal(h.run("editorDraftService.current.blocked"), false);
  assert.equal(h.roots.get("#editor-draft-notice").hidden, true);
});

test("changing an existing page group saves recovery under its origin and restores the destination group", async () => {
  const h = editorHarness(); const drafts = new Map(); const puts = [];
  const body = privateDraftFixture(h, async (url, options) => {
    if (options.method === "GET") return jsonResponse({ draft: drafts.get(new URL(url, "https://fixture.test").searchParams.get("key")) || null });
    const payload = JSON.parse(options.body); puts.push(payload);
    const draft = { ...payload, version: "v1" }; drafts.set(payload.key, draft);
    return jsonResponse({ draft });
  });
  await h.run("editorDraftService.current.loading");
  h.run('content.portfolio = normalizePortfolioItems([{ id: "existing", title: "다른 원본", status: "published", blocks: [{ id: "other", kind: "code", body: "portfolio original" }] }]);');
  editPrivateBody(h, body, "moved and edited");
  h.run('changeAdminProperty("section", "portfolio")');
  await h.run("editorDraftService.current.loading"); await h.flushTimers();
  assert.equal(puts[0].key, "study:page:existing");
  assert.equal(puts[0].snapshot.key, "study:page:existing");
  assert.equal(puts[0].snapshot.type, "portfolio");
  assert.equal(puts[0].snapshot.editingType, "study");
  const draft = drafts.get("study:page:existing");
  draft.snapshot.status = "draft"; draft.snapshot.requestedId = "old-slug";
  h.run('adminState.contentEditType = "study"; adminState.contentEditId = "existing"; renderAdminContentForm();');
  await h.run("editorDraftService.current.loading");
  assert.equal(h.document.querySelector('[data-editable="true"][data-field="body"]').innerText, "original");
  assert.equal(h.roots.get("#editor-draft-notice").hidden, false);
  h.run('declarativeClickHandlers["restore-editor-draft"]()');
  const restored = h.json("adminSnapshotFromDom()");
  assert.equal(restored.type, "portfolio");
  assert.equal(restored.editingType, "study");
  assert.equal(restored.editingId, "existing");
  assert.equal(restored.requestedId, "existing");
  assert.equal(restored.status, "published");
  assert.equal(restored.blocks[0].body, "moved and edited");
  assert.equal(h.run("editorDraftService.current.key"), "study:page:existing");
  assert.equal(h.json("content.portfolio")[0].blocks[0].body, "portfolio original");
  h.run("adminUndo()");
  assert.equal(h.json("adminSnapshotFromDom()").type, "study");
  assert.equal(h.json("adminSnapshotFromDom()").blocks[0].body, "original");
});

test("late private save response cannot change another page's status or contents", async () => {
  const h = editorHarness(); let finish;
  const body = privateDraftFixture(h, async (_url, options) => {
    if (options.method === "GET") return jsonResponse({ draft: null });
    const payload = JSON.parse(options.body);
    return new Promise((resolve) => { finish = () => resolve(jsonResponse({ draft: { ...payload, version: "v1" } })); });
  });
  await h.run("editorDraftService.current.loading");
  editPrivateBody(h, body, "pending original page");
  const saving = h.flushTimers(); await Promise.resolve();
  h.run('content.studyPosts.push(normalizeStudyPosts([{ id: "other", title: "다른 페이지", status: "draft", blocks: [{ id: "other-body", kind: "code", body: "다른 본문" }] }])[0]); adminState.contentEditId = "other"; renderAdminContentForm(); setAdminStatus("다른 페이지 상태");');
  await h.run("editorDraftService.current.loading");
  finish(); await saving;
  assert.equal(h.roots.get("#admin-page-save-state").textContent, "다른 페이지 상태");
  assert.equal(h.document.querySelector('[data-editable="true"][data-field="body"]').innerText, "다른 본문");
  assert.equal(h.run("editorDraftService.current.version"), null);
});

test("GET recovery is explicit and restoring preserves the server page status and identity", async () => {
  const h = editorHarness(); let draft;
  const body = privateDraftFixture(h, async () => jsonResponse({ draft }));
  await h.run("editorDraftService.current.loading");
  draft = { key: "study:page:existing", snapshot: { ...h.json("adminSnapshotFromDom()"), key: "study:page:existing", requestedId: "old-slug", status: "draft", title: "복구 제목", blocks: [{ id: "recovered", kind: "code", body: "복구 본문" }] }, baseSignature: "old-base", version: "v1" };
  h.run("editorDraftService.open()"); await h.run("editorDraftService.current.loading");
  assert.equal(body.innerText, "original");
  assert.equal(h.roots.get("#editor-draft-notice").hidden, false);
  assert.equal(h.roots.get("#admin-content-title").value, "기존 페이지");
  h.run('declarativeClickHandlers["restore-editor-draft"]()');
  assert.equal(h.roots.get("#admin-content-title").value, "복구 제목");
  assert.equal(h.document.querySelector('[data-editable="true"][data-field="body"]').innerText, "복구 본문");
  assert.equal(h.roots.get("#admin-content-edit-id").value, "existing");
  assert.equal(h.roots.get("#admin-content-status").value, "published");
  assert.equal(h.roots.get("#admin-content-id").value, "existing");
  assert.equal(h.json("content.studyPosts")[0].status, "published");
  assert.equal(h.run("hasUnsavedAdminContent()"), true);
  h.run("adminUndo()");
  assert.equal(h.document.querySelector('[data-editable="true"][data-field="body"]').innerText, "original");
});

test("discarding a recovery candidate deletes only its version and keeps current input", async () => {
  const h = editorHarness(); let draft; let removed;
  const body = privateDraftFixture(h, async (_url, options) => {
    if (options.method === "GET") return jsonResponse({ draft });
    removed = JSON.parse(options.body); return jsonResponse({ ok: true });
  });
  await h.run("editorDraftService.current.loading");
  draft = { key: "study:page:existing", snapshot: { ...h.json("adminSnapshotFromDom()"), key: "study:page:existing", title: "서버 복구 제목" }, version: "v7" };
  h.run("editorDraftService.open()"); await h.run("editorDraftService.current.loading");
  await h.run('declarativeClickHandlers["discard-editor-draft"]()');
  assert.deepEqual(removed, { key: "study:page:existing", version: "v7" });
  assert.equal(h.roots.get("#editor-draft-notice").hidden, true);
  assert.equal(body.innerText, "original");
});

test("CAS conflict preserves input and requires choosing the latest recovery instead of overwriting it", async () => {
  const h = editorHarness(); let gets = 0; let puts = 0; let latest;
  const body = privateDraftFixture(h, async (_url, options) => {
    if (options.method === "GET") return jsonResponse({ draft: ++gets === 1 ? null : latest });
    puts += 1; return errorResponse(409);
  });
  await h.run("editorDraftService.current.loading");
  latest = { key: "study:page:existing", snapshot: { ...h.json("adminSnapshotFromDom()"), key: "study:page:existing", title: "다른 곳의 수정" }, version: "v2" };
  editPrivateBody(h, body, "my edit"); await h.flushTimers();
  assert.equal(body.innerText, "my edit");
  assert.equal(h.roots.get("#editor-draft-notice").hidden, false);
  assert.equal(h.run("editorDraftService.current.blocked"), true);
  editPrivateBody(h, body, "my next edit"); await h.flushTimers();
  assert.equal(puts, 1);
  assert.equal(body.innerText, "my next edit");
  assert.equal(h.json("content.studyPosts")[0].title, "기존 페이지");
});

test("autosave 401 leaves the editor visible and GET 404 or 503 never prevents manual saving", async () => {
  const h = editorHarness();
  const body = privateDraftFixture(h, async (_url, options) => options.method === "GET" ? jsonResponse({ draft: null }) : errorResponse(401));
  await h.run("editorDraftService.current.loading");
  editPrivateBody(h, body, "edit before expiry"); await h.flushTimers();
  assert.equal(body.innerText, "edit before expiry");
  assert.equal(h.run("authState.authenticated"), true);
  assert.equal(h.roots.get("#admin-content-form").inert, false);
  assert.match(h.roots.get("#admin-page-save-state").textContent, /로그인이 필요/);
  for (const status of [404, 503]) {
    const fixture = editorHarness();
    const input = privateDraftFixture(fixture, async (url, options) => url.startsWith("/api/admin/editor-drafts") ? errorResponse(status) : jsonResponse({ content: JSON.parse(options.body).content }));
    await fixture.run("editorDraftService.current.loading");
    assert.match(fixture.roots.get("#admin-page-save-state").textContent, /자동저장에 실패/);
    editPrivateBody(fixture, input, "manual edit");
    assert.equal(await fixture.run('adminEditorController.commit("published")'), true);
    assert.equal(fixture.json("content.studyPosts")[0].blocks[0].body, "manual edit");
    assert.equal(fixture.json("content.studyPosts")[0].status, "published");
  }
});

test("manual save settles pending private PUT then removes its exact version without another autosave", async () => {
  const h = editorHarness(); const methods = []; let finish;
  const body = privateDraftFixture(h, async (url, options) => {
    if (options.method === "GET") return jsonResponse({ draft: null });
    const payload = JSON.parse(options.body); methods.push({ url, method: options.method, payload });
    if (url === "/api/admin/editor-drafts" && options.method === "PUT") return new Promise((resolve) => { finish = () => resolve(jsonResponse({ draft: { ...payload, version: "v1" } })); });
    return url === "/api/admin/content" ? jsonResponse({ content: payload.content }) : jsonResponse({ ok: true });
  });
  await h.run("editorDraftService.current.loading");
  editPrivateBody(h, body, "private first"); const pending = h.flushTimers(); await Promise.resolve();
  editPrivateBody(h, body, "manual latest");
  const saving = h.run('adminEditorController.commit("published")');
  assert.equal(methods.length, 1);
  finish(); await pending; assert.equal(await saving, true);
  await h.flushTimers();
  assert.deepEqual(methods.map(({ url, method }) => [url, method]), [["/api/admin/editor-drafts", "PUT"], ["/api/admin/content", "PUT"], ["/api/admin/editor-drafts", "DELETE"]]);
  assert.equal(methods[1].payload.content.studyPosts[0].blocks[0].body, "manual latest");
  assert.deepEqual(methods[2].payload, { key: "study:page:existing", version: "v1" });
  assert.equal(h.run("hasUnsavedAdminContent()"), false);
});

test("failed private cleanup does not turn successful manual publication into a failed save", async () => {
  const h = editorHarness();
  const body = privateDraftFixture(h, async (url, options) => {
    if (options.method === "GET") return jsonResponse({ draft: null });
    if (options.method === "DELETE") return errorResponse(503);
    const payload = JSON.parse(options.body);
    return url === "/api/admin/editor-drafts" ? jsonResponse({ draft: { ...payload, version: "v1" } }) : jsonResponse({ content: payload.content });
  });
  await h.run("editorDraftService.current.loading");
  editPrivateBody(h, body, "saved edit"); await h.flushTimers();
  h.run('let manualErrorOpened = false; showSaveErrorModal = () => { manualErrorOpened = true; };');
  assert.equal(await h.run('adminEditorController.commit("published")'), true);
  assert.equal(h.run("manualErrorOpened"), false);
  assert.equal(h.json("content.studyPosts")[0].blocks[0].body, "saved edit");
  assert.equal(h.run("hasUnsavedAdminContent()"), false);
});

test("new private drafts use the editing identity new instead of a requested future slug", async () => {
  const h = editorHarness(); let sent;
  privateDraftFixture(h, async (_url, options) => {
    if (options.method === "GET") return jsonResponse({ draft: null });
    sent = JSON.parse(options.body); return jsonResponse({ draft: { ...sent, version: "v1" } });
  });
  await h.run("editorDraftService.current.loading");
  h.run('adminState.contentEditId = null; renderAdminContentForm(); fillAdminField("admin-content-id", "future-slug"); setAdminPageTitle("새 페이지");');
  await h.run("editorDraftService.current.loading");
  h.run("markAdminContentDirty()"); await h.flushTimers();
  assert.equal(sent.key, "study:new");
  assert.equal(sent.snapshot.key, "study:new");
  assert.equal(h.run("adminHistoryPageKey()"), "study:future-slug");
  assert.equal(sent.snapshot.editingId, "");
  assert.equal(sent.snapshot.requestedId, "future-slug");
  assert.equal(sent.snapshot.status, "draft");
});

test("reverting to the public baseline during private saving still persists the latest input", async () => {
  const h = editorHarness(); const puts = []; let finish;
  const body = privateDraftFixture(h, async (_url, options) => {
    if (options.method === "GET") return jsonResponse({ draft: null });
    const payload = JSON.parse(options.body); puts.push(payload);
    if (puts.length === 1) return new Promise((resolve) => { finish = () => resolve(jsonResponse({ draft: { ...payload, version: "v1" } })); });
    return jsonResponse({ draft: { ...payload, version: "v2" } });
  });
  await h.run("editorDraftService.current.loading");
  editPrivateBody(h, body, "temporary edit"); const pending = h.flushTimers(); await Promise.resolve();
  editPrivateBody(h, body, "original");
  finish(); await pending; await h.flushTimers();
  assert.equal(puts.length, 2);
  assert.equal(puts[1].snapshot.blocks[0].body, "original");
  assert.equal(puts[1].expectedVersion, "v1");
  assert.equal(h.run("hasUnsavedAdminContent()"), false);
});

test("navigation waits for a private write, then discard removes that version and cancels queued saving", async () => {
  const h = editorHarness(); const writes = []; let finish;
  const body = privateDraftFixture(h, async (_url, options) => {
    if (options.method === "GET") return jsonResponse({ draft: null });
    const payload = JSON.parse(options.body); writes.push({ method: options.method, payload });
    if (options.method === "DELETE") return jsonResponse({ ok: true });
    return new Promise((resolve) => { finish = () => resolve(jsonResponse({ draft: { ...payload, version: "v1" } })); });
  });
  h.add("home-grid", "", "div");
  await h.run("editorDraftService.current.loading");
  editPrivateBody(h, body, "pending edit"); const pending = h.flushTimers(); await Promise.resolve();
  editPrivateBody(h, body, "queued edit");
  assert.equal(h.run('showPage("home", { track: false })'), false);
  assert.equal(h.run("currentPage"), "admin");
  finish(); await pending; await Promise.resolve();
  assert.equal(h.roots.get("#unsaved-changes-modal").hidden, false);
  assert.equal(body.innerText, "queued edit");
  await h.run('declarativeClickHandlers["discard-changes"]()');
  await h.flushTimers();
  assert.equal(h.run("currentPage"), "home");
  assert.deepEqual(writes.map((entry) => entry.method), ["PUT", "DELETE"]);
  assert.deepEqual(writes[1].payload, { key: "study:page:existing", version: "v1" });
});

test("cancelling discard during DELETE keeps edits and serializes recovery before saving the latest input", async () => {
  const h = editorHarness(); const writes = []; let finishDelete; let deleting = false;
  const body = privateDraftFixture(h, async (_url, options) => {
    if (options.method === "GET") return jsonResponse({ draft: null });
    const payload = JSON.parse(options.body); writes.push({ method: options.method, payload, deleting });
    if (options.method === "DELETE") {
      deleting = true;
      return new Promise((resolve) => { finishDelete = () => { deleting = false; resolve(jsonResponse({ ok: true })); }; });
    }
    return jsonResponse({ draft: { ...payload, version: writes.length === 1 ? "v1" : "v2" } });
  });
  await h.run("editorDraftService.current.loading");
  editPrivateBody(h, body, "first private edit"); await h.flushTimers();
  h.run('let moved = 0; confirmAdminEditorNavigation(() => { moved += 1; });');
  const discarding = h.run('declarativeClickHandlers["discard-changes"]()');
  for (let tick = 0; tick < 20; tick += 1) await Promise.resolve();
  assert.equal(deleting, true);
  h.run('declarativeClickHandlers["keep-editing"]()');
  editPrivateBody(h, body, "latest kept edit");
  const queued = h.flushTimers();
  for (let tick = 0; tick < 10; tick += 1) await Promise.resolve();
  const writesBeforeDeleteSettled = writes.length;
  finishDelete(); await discarding; await queued; await h.flushTimers();
  assert.equal(writesBeforeDeleteSettled, 2);
  assert.deepEqual(writes.map((entry) => entry.method), ["PUT", "DELETE", "PUT"]);
  assert.equal(writes[2].deleting, false);
  assert.equal(writes[2].payload.expectedVersion, null);
  assert.equal(writes[2].payload.snapshot.blocks[0].body, "latest kept edit");
  assert.equal(body.innerText, "latest kept edit");
  assert.equal(h.run("moved"), 0);
  assert.equal(h.run("editorDraftService.current.blocked"), false);
  assert.equal(h.run("editorDraftService.current.version"), "v2");
  assert.equal(h.run("hasUnsavedAdminContent()"), true);
});

test("a cancelled discard's late DELETE cannot approve a newer navigation confirmation", async () => {
  const h = editorHarness(); let finishDelete;
  const body = privateDraftFixture(h, async (_url, options) => {
    if (options.method === "GET") return jsonResponse({ draft: null });
    const payload = JSON.parse(options.body);
    if (options.method === "DELETE") return new Promise((resolve) => { finishDelete = () => resolve(jsonResponse({ ok: true })); });
    return jsonResponse({ draft: { ...payload, version: "v1" } });
  });
  await h.run("editorDraftService.current.loading");
  editPrivateBody(h, body, "keep this edit"); await h.flushTimers();
  h.run('let firstMoved = 0; let secondMoved = 0; confirmAdminEditorNavigation(() => { firstMoved += 1; });');
  const discarding = h.run('declarativeClickHandlers["discard-changes"]()');
  for (let tick = 0; tick < 20; tick += 1) await Promise.resolve();
  h.context.escape = { key: "Escape", preventDefault() {}, stopPropagation() {} };
  h.run('handleUnsavedChangesKeydown(escape); confirmAdminEditorNavigation(() => { secondMoved += 1; });');
  const newerContinuation = h.run("adminState.pendingEditorNavigation");
  finishDelete(); await discarding;
  assert.equal(h.roots.get("#unsaved-changes-modal").hidden, false);
  assert.equal(h.run("adminState.pendingEditorNavigation"), newerContinuation);
  assert.equal(h.run("firstMoved"), 0);
  assert.equal(h.run("secondMoved"), 0);
  assert.equal(h.document.querySelector('[data-editable="true"][data-field="body"]').innerText, "keep this edit");
  assert.equal(h.run("hasUnsavedAdminContent()"), true);
  h.run('declarativeClickHandlers["keep-editing"]()'); await h.flushTimers();
  assert.equal(h.run("editorDraftService.current.version"), "v1");
  assert.equal(h.run("secondMoved"), 0);
});

test("a deleted remote draft conflict requires explicit discard before creating a new version", async () => {
  const h = editorHarness(); let puts = 0;
  const body = privateDraftFixture(h, async (_url, options) => {
    if (options.method === "GET") return jsonResponse({ draft: null });
    const payload = JSON.parse(options.body);
    if (++puts === 1) return errorResponse(409);
    return jsonResponse({ draft: { ...payload, version: "v2" } });
  });
  await h.run("editorDraftService.current.loading");
  editPrivateBody(h, body, "my edit"); await h.flushTimers();
  assert.equal(h.run("editorDraftService.current.blocked"), true);
  assert.equal(h.roots.get("#editor-draft-notice").hidden, false);
  await h.run('declarativeClickHandlers["discard-editor-draft"]()'); await h.flushTimers();
  assert.equal(puts, 2);
  assert.equal(body.innerText, "my edit");
  assert.equal(h.run("editorDraftService.current.version"), "v2");
});

test("Korean, long, and symbol-only new page titles save with unique server-safe IDs and unchanged text", async () => {
  const h = editorHarness(); const sent = [];
  h.context.fetch = async (_url, options) => {
    const payload = JSON.parse(options.body);
    if (payload.content.portfolio.some((item) => !/^[a-z0-9][a-z0-9._:-]{0,127}$/i.test(item.id))) return errorResponse(400);
    sent.push(payload); return jsonResponse({ content: payload.content });
  };
  h.run('showSaveErrorModal = () => {}; content.portfolio = []; adminState.contentEditType = "portfolio"; renderAllContent = () => renderAdminContentForm();');
  const titles = ["자동 복구 확인", "자동 복구 확인", "A".repeat(180), "A".repeat(180), "🔥 !@#$%^&*()", "___앞부분 한국어", "Mixed English 한국어"];
  const body = "수동 저장 전에 복구용 초안으로 보존됩니다.";
  for (const title of titles) {
    h.run('adminState.contentEditId = null; renderAdminContentForm();');
    h.roots.get("#admin-content-title").value = title;
    h.context.newBody = body;
    h.run('adminState.editorBlocks = normalizeEditorBlocks([{ id: "body", kind: "code", body: newBody }]); renderAdminBlockList();');
    assert.equal(await h.run('adminEditorController.commit("draft")'), true);
    const saved = sent.at(-1).content.portfolio[0];
    assert.equal(saved.title, title);
    assert.equal(saved.blocks[0].body, body);
    assert.match(saved.id, /^[a-z0-9][a-z0-9._:-]{0,127}$/i);
    assert.equal(saved.id.length <= 128, true);
  }
  const ids = h.json("content.portfolio.map((item) => item.id)");
  assert.equal(new Set(ids).size, titles.length);
});

test("editing an existing ASCII page keeps its identity when its Korean title changes", async () => {
  const h = editorHarness();
  savedEditor(h, "published");
  h.roots.get("#admin-content-title").value = "변경된 한국어 제목";
  h.context.fetch = async (_url, options) => jsonResponse({ content: JSON.parse(options.body).content });
  assert.equal(await h.run('adminEditorController.commit("published")'), true);
  assert.equal(h.json("content.studyPosts")[0].id, "existing");
  assert.equal(h.json("content.studyPosts")[0].title, "변경된 한국어 제목");
});

test("an existing page whose ID is new has a different private recovery key from an unsaved page", async () => {
  const h = editorHarness(); const queriedKeys = [];
  privateDraftFixture(h, async (url) => {
    queriedKeys.push(new URL(url, "https://fixture.test").searchParams.get("key"));
    return jsonResponse({ draft: null });
  });
  await h.run("editorDraftService.current.loading");
  h.run('content.studyPosts[0].id = "new"; adminState.contentEditId = "new"; renderAdminContentForm();');
  await h.run("editorDraftService.current.loading");
  assert.equal(h.run("editorDraftService.current.key"), "study:page:new");
  assert.equal(h.run("adminHistoryPageKey()"), "study:new");
  h.run('adminState.contentEditId = null; renderAdminContentForm();');
  await h.run("editorDraftService.current.loading");
  assert.equal(h.run("editorDraftService.current.key"), "study:new");
  assert.equal(h.run("adminHistoryPageKey()"), "study:__new__");
  assert.deepEqual(queriedKeys.slice(-2), ["study:page:new", "study:new"]);
});
